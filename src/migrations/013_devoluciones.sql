-- 013_devoluciones.sql
-- Devolución de productos de una venta (parcial o total).
--   · Lo devuelto vuelve al stock (movimiento tipo 'devolucion').
--   · La venta queda con lo que el cliente se llevó: baja cantidad/subtotal de cada ítem
--     y el total de la venta (descuento/recargo/IVA se prorratean).
--   · El importe devuelto es un crédito para el cliente, que se aplica en este orden:
--       1. a la deuda pendiente de esta misma venta (Cta. Cte.)
--       2. a otras deudas pendientes del cliente, la que vence antes primero (opcional)
--       3. lo que sobra se le reintegra; si es en efectivo con caja abierta,
--          queda como retiro de caja
--   · venta_pagos no se toca: registra lo que entró en su momento. El reintegro
--     es la salida.

-- ── Columnas nuevas ───────────────────────────────────────
ALTER TABLE venta_items
  ADD COLUMN IF NOT EXISTS cantidad_devuelta NUMERIC(10,3) NOT NULL DEFAULT 0;

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS devuelto_monto NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ── Devoluciones ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devoluciones (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  comercio_id        UUID          NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  venta_id           UUID          NOT NULL REFERENCES ventas(id)    ON DELETE CASCADE,
  cliente_id         UUID          REFERENCES clientes(id) ON DELETE SET NULL,
  fecha              DATE          NOT NULL DEFAULT CURRENT_DATE,
  monto              NUMERIC(12,2) NOT NULL CHECK (monto > 0),     -- valor de lo devuelto
  items              JSONB         NOT NULL DEFAULT '[]',          -- [{ venta_item_id, producto_id, descripcion, cantidad, subtotal }]
  imputaciones       JSONB         NOT NULL DEFAULT '[]',          -- [{ venta_id, numero, monto }] crédito aplicado a deudas
  reintegro          NUMERIC(12,2) NOT NULL DEFAULT 0,             -- lo que se le devolvió en plata
  reintegro_medio    TEXT,
  caja_movimiento_id UUID          REFERENCES caja_movimientos(id) ON DELETE SET NULL,
  notas              TEXT,
  usuario_id         UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_venta   ON devoluciones(venta_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_cliente ON devoluciones(cliente_id, created_at DESC);

ALTER TABLE devoluciones ENABLE ROW LEVEL SECURITY;

-- Sólo lectura: se insertan únicamente a través de registrar_devolucion()
CREATE POLICY "dev_select" ON devoluciones
  FOR SELECT TO authenticated
  USING (comercio_id IN (SELECT comercio_id FROM usuarios WHERE id = auth.uid()));

-- ── Registrar devolución (atómico) ────────────────────────
-- SECURITY DEFINER porque el cajero no tiene permiso de escritura sobre productos;
-- los controles de comercio y rol se hacen acá adentro.
-- p_items: [{ "venta_item_id": uuid, "cantidad": numeric }]
CREATE OR REPLACE FUNCTION registrar_devolucion(
  p_venta_id        UUID,
  p_items           JSONB,
  p_aplicar_deudas  BOOLEAN DEFAULT true,
  p_medio_reintegro TEXT    DEFAULT 'efectivo',
  p_notas           TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_comercio_id  UUID;
  v_rol          TEXT;
  v_venta        RECORD;
  v_item         RECORD;
  v_prod         RECORD;
  r              RECORD;
  v_req          JSONB;
  v_cant         NUMERIC;
  v_sub_item     NUMERIC;
  v_sub_total    NUMERIC := 0;      -- suma de subtotales de ítems devueltos
  v_items_antes  NUMERIC;           -- suma de subtotales de ítems antes de devolver
  v_ratio        NUMERIC;
  v_monto        NUMERIC;           -- valor de lo devuelto (con descuento/recargo prorrateado)
  v_quedan       NUMERIC;
  v_items_json   JSONB := '[]'::jsonb;
  v_imputs       JSONB := '[]'::jsonb;
  v_credito      NUMERIC;
  v_aplicar      NUMERIC;
  v_aplicado     NUMERIC := 0;
  v_caja_id      UUID;
  v_mov_id       UUID;
  v_dev_id       UUID;
BEGIN
  SELECT comercio_id, rol INTO v_comercio_id, v_rol FROM usuarios WHERE id = v_uid;
  IF v_comercio_id IS NULL OR v_rol NOT IN ('propietario', 'cajero') THEN
    RAISE EXCEPTION 'No tenés permiso para registrar devoluciones.';
  END IF;

  IF p_medio_reintegro NOT IN ('efectivo','tarjeta_debito','tarjeta_credito','transferencia','mercado_pago','otro') THEN
    RAISE EXCEPTION 'Medio de reintegro inválido.';
  END IF;

  SELECT * INTO v_venta FROM ventas
  WHERE id = p_venta_id AND comercio_id = v_comercio_id
  FOR UPDATE;

  IF v_venta.id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada.';
  END IF;
  IF v_venta.estado <> 'completada' OR v_venta.es_saldo_inicial THEN
    RAISE EXCEPTION 'Sólo se pueden devolver productos de una venta completada.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Indicá qué productos devuelve.';
  END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_items_antes FROM venta_items WHERE venta_id = p_venta_id;

  -- ── Ítems: bajar cantidades y reponer stock ──
  FOR v_req IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_cant := (v_req->>'cantidad')::numeric;
    CONTINUE WHEN v_cant IS NULL OR v_cant <= 0;

    SELECT * INTO v_item FROM venta_items
    WHERE id = (v_req->>'venta_item_id')::uuid AND venta_id = p_venta_id
    FOR UPDATE;

    IF v_item.id IS NULL THEN
      RAISE EXCEPTION 'Ítem no encontrado en la venta.';
    END IF;
    IF v_cant > v_item.cantidad + 0.0005 THEN
      RAISE EXCEPTION 'No se pueden devolver % de "%": quedan %.', v_cant, v_item.descripcion, v_item.cantidad;
    END IF;

    -- Si devuelve todo el ítem, se lleva el subtotal entero (sin restos de redondeo)
    v_sub_item := CASE WHEN v_cant >= v_item.cantidad - 0.0005 THEN v_item.subtotal
                       ELSE ROUND(v_item.subtotal / v_item.cantidad * v_cant, 2) END;

    UPDATE venta_items
    SET cantidad          = cantidad - v_cant,
        cantidad_devuelta = cantidad_devuelta + v_cant,
        subtotal          = subtotal - v_sub_item
    WHERE id = v_item.id;

    v_sub_total  := v_sub_total + v_sub_item;
    v_items_json := v_items_json || jsonb_build_object(
      'venta_item_id', v_item.id, 'producto_id', v_item.producto_id,
      'descripcion', v_item.descripcion, 'cantidad', v_cant, 'subtotal', v_sub_item);

    SELECT stock_actual, controla_stock INTO v_prod FROM productos
    WHERE id = v_item.producto_id AND comercio_id = v_comercio_id
    FOR UPDATE;

    IF FOUND AND v_prod.controla_stock THEN
      UPDATE productos SET stock_actual = stock_actual + v_cant WHERE id = v_item.producto_id;
      INSERT INTO stock_movimientos (comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_posterior,
                                     precio_unitario, motivo, referencia_tipo, referencia_id, usuario_id)
      VALUES (v_comercio_id, v_item.producto_id, 'devolucion', v_cant, v_prod.stock_actual, v_prod.stock_actual + v_cant,
              v_item.precio_unitario, 'Devolución venta #' || v_venta.numero, 'venta', v_venta.id, v_uid);
    END IF;
  END LOOP;

  IF v_sub_total <= 0 THEN
    RAISE EXCEPTION 'Indicá qué productos devuelve.';
  END IF;

  -- ── Venta: queda con lo que se llevó ──
  SELECT COALESCE(SUM(cantidad), 0) INTO v_quedan FROM venta_items WHERE venta_id = p_venta_id;
  v_ratio := CASE WHEN v_items_antes > 0 THEN v_sub_total / v_items_antes ELSE 1 END;
  v_monto := CASE WHEN v_quedan <= 0.0005 THEN v_venta.total
                  ELSE LEAST(v_venta.total, ROUND(v_venta.total * v_ratio, 2)) END;

  UPDATE ventas
  SET subtotal        = GREATEST(0, subtotal - v_sub_total),
      descuento_monto = ROUND(descuento_monto * (1 - v_ratio), 2),
      recargo_monto   = ROUND(recargo_monto   * (1 - v_ratio), 2),
      iva_monto       = ROUND(iva_monto       * (1 - v_ratio), 2),
      total           = total - v_monto,
      devuelto_monto  = devuelto_monto + v_monto
  WHERE id = p_venta_id;

  -- ── Crédito: 1) deuda de esta venta ──
  v_credito := v_monto;
  IF v_venta.cc_monto - v_venta.cc_pagado > 0.009 THEN
    v_aplicar := LEAST(v_venta.cc_monto - v_venta.cc_pagado, v_credito);
    UPDATE ventas SET cc_pagado = cc_pagado + v_aplicar WHERE id = p_venta_id;
    v_imputs   := v_imputs || jsonb_build_object('venta_id', v_venta.id, 'numero', v_venta.numero, 'monto', v_aplicar);
    v_credito  := v_credito - v_aplicar;
    v_aplicado := v_aplicado + v_aplicar;
  END IF;

  -- ── 2) otras deudas del cliente (FIFO por vencimiento) ──
  IF p_aplicar_deudas AND v_venta.cliente_id IS NOT NULL AND v_credito > 0.009 THEN
    FOR r IN
      SELECT id, numero, cc_monto - cc_pagado AS pendiente
      FROM ventas
      WHERE cliente_id = v_venta.cliente_id AND comercio_id = v_comercio_id
        AND estado = 'completada' AND cc_monto > cc_pagado AND id <> p_venta_id
      ORDER BY fecha_vencimiento NULLS LAST, fecha
      FOR UPDATE
    LOOP
      EXIT WHEN v_credito <= 0.009;
      v_aplicar := LEAST(r.pendiente, v_credito);
      UPDATE ventas SET cc_pagado = cc_pagado + v_aplicar WHERE id = r.id;
      v_imputs   := v_imputs || jsonb_build_object('venta_id', r.id, 'numero', r.numero, 'monto', v_aplicar);
      v_credito  := v_credito - v_aplicar;
      v_aplicado := v_aplicado + v_aplicar;
    END LOOP;
  END IF;

  -- ── 3) reintegro; en efectivo con caja abierta → retiro de caja ──
  v_credito := GREATEST(0, ROUND(v_credito, 2));
  IF v_credito > 0.009 AND p_medio_reintegro = 'efectivo' THEN
    SELECT id INTO v_caja_id
    FROM cierres_caja
    WHERE comercio_id = v_comercio_id AND estado = 'abierta'
    ORDER BY fecha_apertura DESC
    LIMIT 1;

    IF v_caja_id IS NOT NULL THEN
      INSERT INTO caja_movimientos (caja_id, comercio_id, usuario_id, tipo, monto, concepto)
      VALUES (v_caja_id, v_comercio_id, v_uid, 'retiro', v_credito, 'Devolución venta #' || v_venta.numero)
      RETURNING id INTO v_mov_id;
    END IF;
  END IF;

  INSERT INTO devoluciones (comercio_id, venta_id, cliente_id, monto, items, imputaciones,
                            reintegro, reintegro_medio, caja_movimiento_id, notas, usuario_id)
  VALUES (v_comercio_id, p_venta_id, v_venta.cliente_id, v_monto, v_items_json, v_imputs,
          v_credito, CASE WHEN v_credito > 0.009 THEN p_medio_reintegro END, v_mov_id,
          NULLIF(TRIM(p_notas), ''), v_uid)
  RETURNING id INTO v_dev_id;

  RETURN jsonb_build_object(
    'devolucion_id', v_dev_id,
    'monto',         v_monto,
    'aplicado',      v_aplicado,
    'reintegro',     v_credito,
    'en_caja',       v_mov_id IS NOT NULL,
    'items',         v_items_json
  );
END;
$$;

REVOKE ALL ON FUNCTION registrar_devolucion(UUID, JSONB, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_devolucion(UUID, JSONB, BOOLEAN, TEXT, TEXT) TO authenticated;
