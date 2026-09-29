-- 010_clientes_cc.sql
-- Cuenta corriente de clientes con vencimientos por venta.
--   · ventas.cc_monto          → parte de la venta cobrada a Cta. Cte.
--   · ventas.cc_pagado         → cuánto de esa deuda ya se cobró
--   · ventas.fecha_vencimiento → cuándo vence la deuda de esa venta
--   · clientes.plazo_dias      → plazo por defecto (30)
--   · clientes_cobros          → cada cobro, con su imputación a ventas (FIFO)
--   · registrar_cobro_cliente  → imputa el cobro y, si es efectivo con caja abierta,
--                                lo registra como ingreso en caja_movimientos

-- ── Columnas nuevas ───────────────────────────────────────
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS cc_monto          NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cc_pagado         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS plazo_dias INTEGER NOT NULL DEFAULT 30;

CREATE INDEX IF NOT EXISTS idx_ventas_cc_pendiente
  ON ventas(comercio_id, cliente_id, fecha_vencimiento)
  WHERE cc_monto > 0;

-- Ventas a Cta. Cte. anteriores a esta migración: completar cc_monto desde venta_pagos
UPDATE ventas v
SET cc_monto = s.monto,
    fecha_vencimiento = COALESCE(v.fecha_vencimiento, (v.fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 30)
FROM (
  SELECT venta_id, SUM(monto) AS monto
  FROM venta_pagos
  WHERE medio_pago = 'cuenta_corriente'
  GROUP BY venta_id
) s
WHERE s.venta_id = v.id AND v.cc_monto = 0;

-- ── Cobros ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes_cobros (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id        UUID          NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  cliente_id         UUID          NOT NULL REFERENCES clientes(id)  ON DELETE CASCADE,
  fecha              DATE          NOT NULL DEFAULT CURRENT_DATE,
  monto              NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  medio_pago         TEXT          NOT NULL
                       CHECK (medio_pago IN ('efectivo','tarjeta_debito','tarjeta_credito',
                                             'transferencia','mercado_pago','otro')),
  referencia         TEXT,
  notas              TEXT,
  imputaciones       JSONB         NOT NULL DEFAULT '[]',   -- [{ venta_id, numero, monto }]
  caja_movimiento_id UUID          REFERENCES caja_movimientos(id) ON DELETE SET NULL,
  usuario_id         UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_cobros_cliente ON clientes_cobros(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clientes_cobros_comercio ON clientes_cobros(comercio_id);

ALTER TABLE clientes_cobros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clicob_select" ON clientes_cobros
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "clicob_insert" ON clientes_cobros
  FOR INSERT TO authenticated
  WITH CHECK (
    comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid())
    AND auth_rol() IN ('propietario','cajero')
  );

-- ── Registrar cobro (atómico) ─────────────────────────────
-- Corre con los permisos del usuario (RLS aplica): sólo propietario/cajero
-- pueden actualizar ventas e insertar el cobro.
CREATE OR REPLACE FUNCTION registrar_cobro_cliente(
  p_cliente_id  UUID,
  p_monto       NUMERIC,
  p_medio_pago  TEXT,
  p_fecha       DATE DEFAULT CURRENT_DATE,
  p_referencia  TEXT DEFAULT NULL,
  p_notas       TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_comercio_id  UUID;
  v_cliente_nom  TEXT;
  v_deuda        NUMERIC;
  v_restante     NUMERIC := p_monto;
  v_aplicar      NUMERIC;
  v_imputs       JSONB := '[]'::jsonb;
  v_caja_id      UUID;
  v_mov_id       UUID;
  v_cobro_id     UUID;
  r              RECORD;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0.';
  END IF;

  SELECT comercio_id, TRIM(nombre || ' ' || COALESCE(apellido, ''))
    INTO v_comercio_id, v_cliente_nom
  FROM clientes WHERE id = p_cliente_id;

  IF v_comercio_id IS NULL THEN
    RAISE EXCEPTION 'Cliente no encontrado.';
  END IF;

  SELECT COALESCE(SUM(cc_monto - cc_pagado), 0) INTO v_deuda
  FROM ventas
  WHERE cliente_id = p_cliente_id AND estado = 'completada' AND cc_monto > cc_pagado;

  IF p_monto > v_deuda + 0.009 THEN
    RAISE EXCEPTION 'El cobro (%) supera la deuda del cliente (%).', p_monto, v_deuda;
  END IF;

  -- Imputar primero a lo que vence antes (FIFO)
  FOR r IN
    SELECT id, numero, cc_monto - cc_pagado AS pendiente
    FROM ventas
    WHERE cliente_id = p_cliente_id AND estado = 'completada' AND cc_monto > cc_pagado
    ORDER BY fecha_vencimiento NULLS LAST, fecha
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0.009;
    v_aplicar := LEAST(r.pendiente, v_restante);
    UPDATE ventas SET cc_pagado = cc_pagado + v_aplicar WHERE id = r.id;
    v_imputs := v_imputs || jsonb_build_object('venta_id', r.id, 'numero', r.numero, 'monto', v_aplicar);
    v_restante := v_restante - v_aplicar;
  END LOOP;

  -- Efectivo con caja abierta → ingreso en caja
  IF p_medio_pago = 'efectivo' THEN
    SELECT id INTO v_caja_id
    FROM cierres_caja
    WHERE comercio_id = v_comercio_id AND estado = 'abierta'
    ORDER BY fecha_apertura DESC
    LIMIT 1;

    IF v_caja_id IS NOT NULL THEN
      INSERT INTO caja_movimientos (caja_id, comercio_id, usuario_id, tipo, monto, concepto)
      VALUES (v_caja_id, v_comercio_id, auth.uid(), 'ingreso', p_monto, 'Cobro Cta. Cte. — ' || v_cliente_nom)
      RETURNING id INTO v_mov_id;
    END IF;
  END IF;

  INSERT INTO clientes_cobros (comercio_id, cliente_id, fecha, monto, medio_pago, referencia, notas,
                               imputaciones, caja_movimiento_id, usuario_id)
  VALUES (v_comercio_id, p_cliente_id, COALESCE(p_fecha, CURRENT_DATE), p_monto, p_medio_pago,
          NULLIF(TRIM(p_referencia), ''), NULLIF(TRIM(p_notas), ''), v_imputs, v_mov_id, auth.uid())
  RETURNING id INTO v_cobro_id;

  RETURN v_cobro_id;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_cobro_cliente(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT) TO authenticated;
