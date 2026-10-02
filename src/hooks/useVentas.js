import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// desde/hasta: 'YYYY-MM-DD' (hasta = desde para un solo día)
export function useVentas(comercioId, perfilId, desde, hasta = desde) {
  const [ventas, setVentas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!comercioId) return
    cargar()
  }, [comercioId, desde, hasta])

  async function cargar() {
    setLoading(true)
    setError(null)
    let q = supabase
      .from('ventas')
      .select('*, cliente:clientes(id, nombre, apellido), pagos:venta_pagos(medio_pago, monto)')
      .eq('comercio_id', comercioId)
      .eq('es_saldo_inicial', false)
      .order('fecha', { ascending: false })
      .limit(2000)

    if (desde) {
      const inicio = new Date(desde + 'T00:00:00').toISOString()
      const fin    = new Date((hasta || desde) + 'T23:59:59.999').toISOString()
      q = q.gte('fecha', inicio).lte('fecha', fin)
    }

    const { data, error } = await q
    if (error) setError(error.message)
    setVentas(data || [])
    setLoading(false)
  }

  // datosVenta, items:[{...}], pagos:[{...}], promos:[{promo_id, promo_nombre, tipo, descuento_monto}]
  async function crear(datosVenta, items, pagos, promos = []) {
    const numero = `V-${Date.now().toString().slice(-8)}`

    const { data: venta, error: errV } = await supabase
      .from('ventas')
      .insert({ ...datosVenta, numero, comercio_id: comercioId, usuario_id: perfilId })
      .select('*, cliente:clientes(id, nombre, apellido)')
      .single()

    if (errV) return { error: errV }

    // Items
    if (items.length > 0) {
      const itemsConId = items.map(it => ({
        venta_id:        venta.id,
        producto_id:     it.producto_id,
        descripcion:     it.descripcion,
        cantidad:        Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
        descuento_pct:   Number(it.descuento_pct) || 0,
        iva_porcentaje:  Number(it.iva_porcentaje) || 0,
        subtotal:        Number(it.subtotal),
      }))
      const { error: errI } = await supabase.from('venta_items').insert(itemsConId)
      if (errI) return { error: errI }
    }

    // Pagos
    if (pagos.length > 0) {
      const pagosConId = pagos.map(p => ({
        venta_id:   venta.id,
        medio_pago: p.medio_pago,
        monto:      Number(p.monto),
        referencia: p.referencia || null,
      }))
      const { error: errP } = await supabase.from('venta_pagos').insert(pagosConId)
      if (errP) return { error: errP }
    }

    // Movimientos de stock (salida por cada item con producto)
    await Promise.all(items.map(async it => {
      if (!it.producto_id) return

      const { data: prod } = await supabase
        .from('productos')
        .select('stock_actual, controla_stock')
        .eq('id', it.producto_id)
        .single()

      if (!prod || !prod.controla_stock) return

      const stockAnterior = Number(prod.stock_actual) || 0
      const stockNuevo    = stockAnterior - Number(it.cantidad)

      await supabase.from('productos').update({ stock_actual: stockNuevo }).eq('id', it.producto_id)

      await supabase.from('stock_movimientos').insert({
        comercio_id:     comercioId,
        producto_id:     it.producto_id,
        tipo:            'salida',
        cantidad:        Number(it.cantidad),
        stock_anterior:  stockAnterior,
        stock_posterior: stockNuevo,
        precio_unitario: Number(it.precio_unitario),
        motivo:          `Venta #${venta.numero}`,
        referencia_tipo: 'venta',
        referencia_id:   venta.id,
        usuario_id:      perfilId,
      })
    }))

    // Promociones aplicadas
    if (promos.length > 0) {
      await supabase.from('venta_promociones').insert(
        promos.map(p => ({ ...p, venta_id: venta.id }))
      )
    }

    const ventaConPagos = { ...venta, pagos: pagos.map(p => ({ medio_pago: p.medio_pago, monto: Number(p.monto) })) }
    setVentas(prev => [ventaConPagos, ...prev])
    return { data: venta }
  }

  // Anula la venta y devuelve al stock lo que había salido (con su movimiento de entrada).
  // Si la venta a Cta. Cte. ya tiene cobros aplicados no se puede anular: esa plata quedaría sin imputar.
  async function anular(id) {
    const { data: venta, error: errV } = await supabase
      .from('ventas')
      .select('id, numero, estado, cc_pagado, items:venta_items(producto_id, cantidad, precio_unitario)')
      .eq('id', id)
      .single()
    if (errV) return { error: errV }
    if (venta.estado !== 'completada') return { error: { message: 'La venta ya no está completada.' } }
    if (Number(venta.cc_pagado) > 0.009) {
      return { error: { message: 'La venta tiene cobros de Cta. Cte. aplicados; no se puede anular.' } }
    }

    // Condición sobre el estado: si dos usuarios anulan a la vez, sólo uno repone el stock
    const { data: anuladas, error } = await supabase
      .from('ventas')
      .update({ estado: 'anulada' })
      .eq('id', id)
      .eq('estado', 'completada')
      .select('id')
    if (error) return { error }
    if (!anuladas?.length) return { error: { message: 'La venta ya fue anulada.' } }

    // Cantidad a devolver por producto (un producto puede repetirse en varios ítems)
    const devolver = new Map()
    ;(venta.items || []).forEach(it => {
      if (!it.producto_id) return
      const prev = devolver.get(it.producto_id) || { cantidad: 0, precio: Number(it.precio_unitario) }
      devolver.set(it.producto_id, { ...prev, cantidad: prev.cantidad + Number(it.cantidad) })
    })

    const repuestos = []
    await Promise.all([...devolver].map(async ([productoId, { cantidad, precio }]) => {
      const { data: prod } = await supabase
        .from('productos')
        .select('stock_actual, controla_stock')
        .eq('id', productoId)
        .single()

      if (!prod || !prod.controla_stock) return

      const stockAnterior = Number(prod.stock_actual) || 0
      const stockNuevo    = stockAnterior + cantidad

      await supabase.from('productos').update({ stock_actual: stockNuevo }).eq('id', productoId)

      await supabase.from('stock_movimientos').insert({
        comercio_id:     comercioId,
        producto_id:     productoId,
        tipo:            'entrada',
        cantidad,
        stock_anterior:  stockAnterior,
        stock_posterior: stockNuevo,
        precio_unitario: precio,
        motivo:          `Anulación venta #${venta.numero}`,
        referencia_tipo: 'venta',
        referencia_id:   venta.id,
        usuario_id:      perfilId,
      })
      repuestos.push({ producto_id: productoId, cantidad })
    }))

    setVentas(prev => prev.map(v => v.id === id ? { ...v, estado: 'anulada' } : v))
    return { data: { repuestos } }
  }

  async function cargarDetalle(id) {
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        *,
        cliente:clientes(id, nombre, apellido, email, telefono),
        items:venta_items(*, producto:productos(nombre, codigo)),
        pagos:venta_pagos(medio_pago, monto, referencia),
        promociones_aplicadas:venta_promociones(promo_id, promo_nombre, tipo, descuento_monto),
        devoluciones(id, fecha, monto, items, imputaciones, reintegro, reintegro_medio, created_at)
      `)
      .eq('id', id)
      .single()
    return { data, error }
  }

  // Devolución parcial o total — todo en registrar_devolucion() (013_devoluciones.sql).
  // items: [{ venta_item_id, cantidad }]
  async function devolver(ventaId, items, { aplicarDeudas = true, medioReintegro = 'efectivo', notas = null } = {}) {
    const { data, error } = await supabase.rpc('registrar_devolucion', {
      p_venta_id:        ventaId,
      p_items:           items,
      p_aplicar_deudas:  aplicarDeudas,
      p_medio_reintegro: medioReintegro,
      p_notas:           notas,
    })
    if (error) return { error }
    setVentas(prev => prev.map(v => v.id === ventaId
      ? { ...v, total: Number(v.total) - data.monto, devuelto_monto: Number(v.devuelto_monto || 0) + data.monto }
      : v))
    return { data }
  }

  return { ventas, loading, error, cargar, crear, anular, devolver, cargarDetalle }
}
