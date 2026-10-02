-- 017_combos.sql
-- Combos: un producto armado con otros (ej. "Combo 2" = mate + bombilla + set + canasta).
--   · productos.es_combo marca el combo; producto_componentes dice qué lleva y cuánto.
--   · El combo no tiene stock propio: al venderlo, anularlo o devolverlo se mueve el
--     stock de cada componente (cantidad del combo × cantidad del componente).
--   · Todo el movimiento de stock de ventas pasa por mover_stock_producto(), que hace
--     esa expansión; descontar_stock_venta, anular_venta y registrar_devolucion la usan.

-- ── Esquema ───────────────────────────────────────────────
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS es_combo BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS producto_componentes (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  combo_id      UUID          NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  componente_id UUID          NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad      NUMERIC(10,3) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (combo_id, componente_id),
  CHECK (combo_id <> componente_id)
);

CREATE INDEX IF NOT EXISTS idx_prod_comp_combo ON producto_componentes(combo_id);

-- Un componente no puede ser otro combo, y combo y componente son del mismo comercio
CREATE OR REPLACE FUNCTION validar_componente()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_combo RECORD;
  v_comp  RECORD;
BEGIN
  SELECT comercio_id, es_combo INTO v_combo FROM productos WHERE id = NEW.combo_id;
  SELECT comercio_id, es_combo, nombre INTO v_comp FROM productos WHERE id = NEW.componente_id;
  IF v_combo.comercio_id IS DISTINCT FROM v_comp.comercio_id THEN
    RAISE EXCEPTION 'El componente tiene que ser un producto del mismo comercio.';
  END IF;
  IF v_comp.es_combo THEN
    RAISE EXCEPTION '"%" es un combo: un combo no puede tener otro combo adentro.', v_comp.nombre;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_prod_comp_validar ON producto_componentes;
CREATE TRIGGER tg_prod_comp_validar
  BEFORE INSERT OR UPDATE ON producto_componentes
  FOR EACH ROW EXECUTE FUNCTION validar_componente();

ALTER TABLE producto_componentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pcomp_select" ON producto_componentes;
DROP POLICY IF EXISTS "pcomp_write"  ON producto_componentes;

CREATE POLICY "pcomp_select" ON producto_componentes
  FOR SELECT TO authenticated
  USING (combo_id IN (SELECT id FROM productos WHERE comercio_id = auth_comercio_id()));

-- Mismos roles que pueden editar productos
CREATE POLICY "pcomp_write" ON producto_componentes
  FOR ALL TO authenticated
  USING (
    auth_rol() IN ('propietario', 'data_entry')
    AND combo_id IN (SELECT id FROM productos WHERE comercio_id = auth_comercio_id())
  )
  WITH CHECK (
    auth_rol() IN ('propietario', 'data_entry')
    AND combo_id IN (SELECT id FROM productos WHERE comercio_id = auth_comercio_id())
  );

-- ── Mover stock de un producto (o de los componentes si es combo) ──
-- Uso interno de las funciones de ventas: no se habilita para la app.
-- p_cantidad con signo: negativo = sale stock, positivo = entra.
-- Devuelve [{ producto_id, cantidad }] con lo que se movió de verdad (con signo).
CREATE OR REPLACE FUNCTION mover_stock_producto(
  p_comercio_id UUID,
  p_producto_id UUID,
  p_cantidad    NUMERIC,
  p_tipo        TEXT,
  p_motivo      TEXT,
  p_venta_id    UUID,
  p_usuario_id  UUID,
  p_precio      NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod RECORD;
  v_comp RECORD;
  v_out  JSONB := '[]'::jsonb;
BEGIN
  SELECT nombre, stock_actual, controla_stock, es_combo INTO v_prod FROM productos
  WHERE id = p_producto_id AND comercio_id = p_comercio_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN v_out;
  END IF;

  IF v_prod.es_combo THEN
    FOR v_comp IN
      SELECT pc.componente_id, pc.cantidad
      FROM producto_componentes pc
      WHERE pc.combo_id = p_producto_id
    LOOP
      v_out := v_out || mover_stock_producto(
        p_comercio_id, v_comp.componente_id, p_cantidad * v_comp.cantidad, p_tipo,
        p_motivo || ' (combo ' || v_prod.nombre || ')', p_venta_id, p_usuario_id, NULL);
    END LOOP;
    RETURN v_out;
  END IF;

  IF NOT v_prod.controla_stock THEN
    RETURN v_out;
  END IF;

  UPDATE productos SET stock_actual = stock_actual + p_cantidad WHERE id = p_producto_id;
  INSERT INTO stock_movimientos (comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_posterior,
                                 precio_unitario, motivo, referencia_tipo, referencia_id, usuario_id)
  VALUES (p_comercio_id, p_producto_id, p_tipo, ABS(p_cantidad), v_prod.stock_actual, v_prod.stock_actual + p_cantidad,
          p_precio, p_motivo, 'venta', p_venta_id, p_usuario_id);

  RETURN jsonb_build_array(jsonb_build_object('producto_id', p_producto_id, 'cantidad', p_cantidad));
END;
$$;

REVOKE ALL ON FUNCTION mover_stock_producto(UUID, UUID, NUMERIC, TEXT, TEXT, UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION mover_stock_producto(UUID, UUID, NUMERIC, TEXT, TEXT, UUID, UUID, NUMERIC) FROM authenticated, anon;

-- ── Vender: descuenta stock (combos → componentes) ────────
CREATE OR REPLACE FUNCTION descontar_stock_venta(p_venta_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_comercio_id UUID;
  v_rol         TEXT;
  v_venta       RECORD;
  r             RECORD;
  v_out         JSONB := '[]'::jsonb;
BEGIN
  v_comercio_id := auth_comercio_id();
  v_rol         := auth_rol();
  IF v_comercio_id IS NULL OR v_rol NOT IN ('propietario', 'cajero') THEN
    RAISE EXCEPTION 'No tenés permiso para registrar ventas.';
  END IF;

  SELECT id, numero INTO v_venta FROM ventas
  WHERE id = p_venta_id AND comercio_id = v_comercio_id
  FOR UPDATE;
  IF v_venta.id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada.';
  END IF;

  IF EXISTS (SELECT 1 FROM stock_movimientos
             WHERE referencia_tipo = 'venta' AND referencia_id = p_venta_id AND tipo = 'salida') THEN
    RETURN v_out;
  END IF;

  FOR r IN
    SELECT producto_id, SUM(cantidad) AS cantidad, MAX(precio_unitario) AS precio
    FROM venta_items
    WHERE venta_id = p_venta_id AND producto_id IS NOT NULL
    GROUP BY producto_id
  LOOP
    v_out := v_out || mover_stock_producto(v_comercio_id, r.producto_id, -r.cantidad, 'salida',
                                           'Venta #' || v_venta.numero, p_venta_id, v_uid, r.precio);
  END LOOP;

  RETURN v_out;
END;
$$;

-- ── Anular: repone stock (combos → componentes) ───────────
CREATE OR REPLACE FUNCTION anular_venta(p_venta_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_comercio_id UUID;
  v_rol         TEXT;
  v_venta       RECORD;
  r             RECORD;
  v_out         JSONB := '[]'::jsonb;
BEGIN
  v_comercio_id := auth_comercio_id();
  v_rol         := auth_rol();
  IF v_comercio_id IS NULL OR v_rol NOT IN ('propietario', 'cajero') THEN
    RAISE EXCEPTION 'No tenés permiso para anular ventas.';
  END IF;

  SELECT id, numero, estado, cc_pagado, devuelto_monto INTO v_venta FROM ventas
  WHERE id = p_venta_id AND comercio_id = v_comercio_id
  FOR UPDATE;
  IF v_venta.id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada.';
  END IF;
  IF v_venta.estado <> 'completada' THEN
    RAISE EXCEPTION 'La venta ya fue anulada.';
  END IF;
  IF v_venta.cc_pagado > 0.009 THEN
    RAISE EXCEPTION 'La venta tiene cobros de Cta. Cte. aplicados; no se puede anular.';
  END IF;
  IF v_venta.devuelto_monto > 0.009 THEN
    RAISE EXCEPTION 'La venta ya tiene una devolución; para el resto usá Devolución.';
  END IF;

  UPDATE ventas SET estado = 'anulada' WHERE id = p_venta_id;

  FOR r IN
    SELECT producto_id, SUM(cantidad) AS cantidad, MAX(precio_unitario) AS precio
    FROM venta_items
    WHERE venta_id = p_venta_id AND producto_id IS NOT NULL
    GROUP BY producto_id
    HAVING SUM(cantidad) > 0
  LOOP
    v_out := v_out || mover_stock_producto(v_comercio_id, r.producto_id, r.cantidad, 'entrada',
                                           'Anulación venta #' || v_venta.numero, p_venta_id, v_uid, r.precio);
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION descontar_stock_venta(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION anular_venta(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION descontar_stock_venta(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION anular_venta(UUID) TO authenticated;

-- ── Devolución: misma función de 016, con el stock vía mover_stock_producto ──
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
  v_movs         JSONB := '[]'::jsonb;  -- stock movido de verdad (combos → componentes)
BEGIN
  -- auth_*() devuelven NULL si el usuario o su comercio están desactivados (016)
  v_comercio_id := auth_comercio_id();
  v_rol         := auth_rol();
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

    v_movs := v_movs || mover_stock_producto(v_comercio_id, v_item.producto_id, v_cant, 'devolucion',
                                             'Devolución venta #' || v_venta.numero, v_venta.id, v_uid,
                                             v_item.precio_unitario);
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
    'items',         v_items_json,
    'movidos',       v_movs
  );
END;
$$;

REVOKE ALL ON FUNCTION registrar_devolucion(UUID, JSONB, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_devolucion(UUID, JSONB, BOOLEAN, TEXT, TEXT) TO authenticated;

-- Verificación: las 3 funciones de ventas tienen que usar mover_stock_producto (true)
SELECT proname, prosrc LIKE '%mover_stock_producto(%' AS usa_combos
FROM pg_proc WHERE proname IN ('descontar_stock_venta', 'anular_venta', 'registrar_devolucion');
