import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useVentas(comercioId, perfilId) {
  const [ventas, setVentas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!comercioId) return
    cargar()
  }, [comercioId])

  async function cargar() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('ventas')
      .select('*, cliente:clientes(id, nombre, apellido), pagos:venta_pagos(medio_pago, monto)')
      .eq('comercio_id', comercioId)
      .order('fecha', { ascending: false })
      .limit(200)
    if (error) setError(error.message)
    setVentas(data || [])
    setLoading(false)
  }

  // datosVenta, items:[{producto_id, descripcion, cantidad, precio_unitario, descuento_pct, iva_porcentaje, subtotal}]
  // pagos:[{medio_pago, monto, referencia}]
  async function crear(datosVenta, items, pagos) {
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

    const ventaConPagos = { ...venta, pagos: pagos.map(p => ({ medio_pago: p.medio_pago, monto: Number(p.monto) })) }
    setVentas(prev => [ventaConPagos, ...prev])
    return { data: venta }
  }

  async function anular(id) {
    const { error } = await supabase.from('ventas').update({ estado: 'anulada' }).eq('id', id)
    if (!error) setVentas(prev => prev.map(v => v.id === id ? { ...v, estado: 'anulada' } : v))
    return { error }
  }

  return { ventas, loading, error, cargar, crear, anular }
}
