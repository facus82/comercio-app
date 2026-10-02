-- 016_usuarios_inactivos.sql
-- Desactivar un usuario o un comercio desde el superadmin sólo guardaba activo = false:
-- nada lo controlaba y el usuario seguía operando. Ahora:
--   · auth_rol() y auth_comercio_id() devuelven NULL si el usuario o su comercio están
--     inactivos → fallan todas las policies de escritura y las funciones de ventas.
--   · (admin-ops, aparte) además bloquea el login en Supabase Auth.
-- Y un propietario ya no puede cambiar plan / activo / modulos_custom de su comercio:
-- sólo el superadmin (admin-ops, con service_role).

-- ── Rol y comercio del usuario logueado, sólo si está activo ──
CREATE OR REPLACE FUNCTION auth_rol()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.rol
  FROM public.usuarios u
  LEFT JOIN public.comercios c ON c.id = u.comercio_id
  WHERE u.id = auth.uid()
    AND COALESCE(u.activo, true)
    AND COALESCE(c.activo, true)
$$;

CREATE OR REPLACE FUNCTION auth_comercio_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.comercio_id
  FROM public.usuarios u
  LEFT JOIN public.comercios c ON c.id = u.comercio_id
  WHERE u.id = auth.uid()
    AND COALESCE(u.activo, true)
    AND COALESCE(c.activo, true)
$$;

-- ── Campos del comercio que sólo maneja el superadmin ──
CREATE OR REPLACE FUNCTION proteger_campos_comercio()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- service_role = admin-ops; postgres = SQL Editor
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin')
     AND (NEW.plan           IS DISTINCT FROM OLD.plan
       OR NEW.activo         IS DISTINCT FROM OLD.activo
       OR NEW.modulos_custom IS DISTINCT FROM OLD.modulos_custom) THEN
    RAISE EXCEPTION 'El plan, el estado y los módulos del comercio sólo los cambia el administrador.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_comercios_proteger ON comercios;
CREATE TRIGGER tg_comercios_proteger
  BEFORE UPDATE ON comercios
  FOR EACH ROW EXECUTE FUNCTION proteger_campos_comercio();

-- ── Funciones de ventas: usan auth_rol()/auth_comercio_id() (copiadas de 013 y 014) ──
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

-- Verificación: tiene que devolver las 5 funciones con usa_auth = true en las de ventas
SELECT proname, prosrc LIKE '%auth_comercio_id()%' AS usa_auth
FROM pg_proc WHERE proname IN ('auth_rol','auth_comercio_id','registrar_devolucion','descontar_stock_venta','anular_venta');
