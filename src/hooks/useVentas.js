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

    // Salida de stock: en la base (014_stock_ventas.sql), porque el cajero no puede escribir productos
    // Si falla, la venta igual quedó guardada: se avisa en vez de devolver error (evita cobrarla dos veces)
    const { error: errS } = await supabase.rpc('descontar_stock_venta', { p_venta_id: venta.id })
    const aviso = errS ? `La venta se guardó, pero no se pudo descontar el stock: ${errS.message}` : null

    // Promociones aplicadas
    if (promos.length > 0) {
      await supabase.from('venta_promociones').insert(
        promos.map(p => ({ ...p, venta_id: venta.id }))
      )
    }

    const ventaConPagos = { ...venta, pagos: pagos.map(p => ({ medio_pago: p.medio_pago, monto: Number(p.monto) })) }
    setVentas(prev => [ventaConPagos, ...prev])
    return { data: venta, aviso }
  }

  // Anula la venta y devuelve al stock lo que había salido, todo en la base (014_stock_ventas.sql).
  // Si la venta a Cta. Cte. ya tiene cobros aplicados no se puede anular: esa plata quedaría sin imputar.
  async function anular(id) {
    const { data: repuestos, error } = await supabase.rpc('anular_venta', { p_venta_id: id })
    if (error) return { error }

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
