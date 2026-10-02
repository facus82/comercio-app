-- 014_stock_ventas.sql
-- El cajero vende, pero la policy de productos sólo deja escribir a propietario/data_entry:
-- al vender o anular desde un usuario cajero el stock no se movía (y el historial
-- registraba un movimiento que no había pasado).
-- Estas dos funciones hacen el movimiento de stock del lado de la base, con los
-- controles de comercio y rol adentro (igual que registrar_devolucion).

-- ── Descontar stock de una venta recién creada ────────────
-- Idempotente: si la venta ya tiene su salida de stock, no hace nada.
-- Devuelve [{ producto_id, cantidad }] de lo descontado.
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
  v_prod        RECORD;
  r             RECORD;
  v_out         JSONB := '[]'::jsonb;
BEGIN
  -- auth_*() devuelven NULL si el usuario o su comercio están desactivados (016)
  v_comercio_id := auth_comercio_id();
  v_rol         := auth_rol();
  IF v_comercio_id IS NULL OR v_rol NOT IN ('propietario', 'cajero') THEN
    RAISE EXCEPTION 'No tenés permiso para registrar ventas.';
  END IF;

  SELECT id, numero, estado INTO v_venta FROM ventas
  WHERE id = p_venta_id AND comercio_id = v_comercio_id
  FOR UPDATE;
  IF v_venta.id IS NULL THEN
    RAISE EXCEPTION 'Venta no encontrada.';
  END IF;

  IF EXISTS (SELECT 1 FROM stock_movimientos
             WHERE referencia_tipo = 'venta' AND referencia_id = p_venta_id AND tipo = 'salida') THEN
    RETURN v_out;
  END IF;

  -- Un producto puede repetirse en varios ítems: se descuenta una sola vez por producto
  FOR r IN
    SELECT producto_id, SUM(cantidad) AS cantidad, MAX(precio_unitario) AS precio
    FROM venta_items
    WHERE venta_id = p_venta_id AND producto_id IS NOT NULL
    GROUP BY producto_id
  LOOP
    SELECT stock_actual, controla_stock INTO v_prod FROM productos
    WHERE id = r.producto_id AND comercio_id = v_comercio_id
    FOR UPDATE;
    CONTINUE WHEN NOT FOUND OR NOT v_prod.controla_stock;

    UPDATE productos SET stock_actual = stock_actual - r.cantidad WHERE id = r.producto_id;
    INSERT INTO stock_movimientos (comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_posterior,
                                   precio_unitario, motivo, referencia_tipo, referencia_id, usuario_id)
    VALUES (v_comercio_id, r.producto_id, 'salida', r.cantidad, v_prod.stock_actual, v_prod.stock_actual - r.cantidad,
            r.precio, 'Venta #' || v_venta.numero, 'venta', p_venta_id, v_uid);

    v_out := v_out || jsonb_build_object('producto_id', r.producto_id, 'cantidad', r.cantidad);
  END LOOP;

  RETURN v_out;
END;
$$;

-- ── Anular una venta y reponer su stock ───────────────────
-- No se puede si la venta a Cta. Cte. ya tiene cobros aplicados, ni si ya tuvo una devolución
-- (en los dos casos se usa la devolución).
-- Devuelve [{ producto_id, cantidad }] de lo repuesto.
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
  v_prod        RECORD;
  r             RECORD;
  v_out         JSONB := '[]'::jsonb;
BEGIN
  -- auth_*() devuelven NULL si el usuario o su comercio están desactivados (016)
  v_comercio_id := auth_comercio_id();
  v_rol         := auth_rol();
  IF v_comercio_id IS NULL OR v_rol NOT IN ('propietario', 'cajero') THEN
    RAISE EXCEPTION 'No tenés permiso para anular ventas.';
  END IF;

  SELECT id, numero, estado, cc_pagado, devuelto_monto, es_saldo_inicial INTO v_venta FROM ventas
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
  -- Con una devolución ya hecha, anular sacaría de la caja el pago entero de la venta
  -- además del reintegro: lo que queda se devuelve con otra devolución.
  IF v_venta.devuelto_monto > 0.009 THEN
    RAISE EXCEPTION 'La venta ya tiene una devolución; para el resto usá Devolución.';
  END IF;

  UPDATE ventas SET estado = 'anulada' WHERE id = p_venta_id;

  -- venta_items.cantidad ya está neta de devoluciones: se repone sólo lo que quedó vendido
  FOR r IN
    SELECT producto_id, SUM(cantidad) AS cantidad, MAX(precio_unitario) AS precio
    FROM venta_items
    WHERE venta_id = p_venta_id AND producto_id IS NOT NULL
    GROUP BY producto_id
    HAVING SUM(cantidad) > 0
  LOOP
    SELECT stock_actual, controla_stock INTO v_prod FROM productos
    WHERE id = r.producto_id AND comercio_id = v_comercio_id
    FOR UPDATE;
    CONTINUE WHEN NOT FOUND OR NOT v_prod.controla_stock;

    UPDATE productos SET stock_actual = stock_actual + r.cantidad WHERE id = r.producto_id;
    INSERT INTO stock_movimientos (comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_posterior,
                                   precio_unitario, motivo, referencia_tipo, referencia_id, usuario_id)
    VALUES (v_comercio_id, r.producto_id, 'entrada', r.cantidad, v_prod.stock_actual, v_prod.stock_actual + r.cantidad,
            r.precio, 'Anulación venta #' || v_venta.numero, 'venta', p_venta_id, v_uid);

    v_out := v_out || jsonb_build_object('producto_id', r.producto_id, 'cantidad', r.cantidad);
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION descontar_stock_venta(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION anular_venta(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION descontar_stock_venta(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION anular_venta(UUID) TO authenticated;
