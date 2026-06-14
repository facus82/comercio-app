import { supabase } from '../lib/supabase'

export function useReportes(comercioId) {

  async function cargarVentas(desde, hasta) {
    if (!comercioId) return null

    const { data: ventas, error } = await supabase
      .from('ventas')
      .select('id, fecha, total')
      .eq('comercio_id', comercioId)
      .eq('estado', 'completada')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })

    if (error) throw new Error(error.message)
    if (!ventas?.length) {
      return { ventasPorDia: [], topProductos: [], porMedioPago: {}, totalVentas: 0, cantTickets: 0, ticketPromedio: 0, margenBruto: 0 }
    }

    const ids = ventas.map(v => v.id)

    const [{ data: pagos }, { data: items }] = await Promise.all([
      supabase.from('venta_pagos').select('medio_pago, monto').in('venta_id', ids),
      supabase.from('venta_items')
        .select('producto_id, cantidad, subtotal, producto:productos(nombre, precio_costo)')
        .in('venta_id', ids),
    ])

    const totalVentas    = ventas.reduce((s, v) => s + Number(v.total), 0)
    const cantTickets    = ventas.length
    const ticketPromedio = cantTickets ? totalVentas / cantTickets : 0

    // Por medio de pago
    const porMedioPago = {}
    pagos?.forEach(p => {
      porMedioPago[p.medio_pago] = (porMedioPago[p.medio_pago] || 0) + Number(p.monto)
    })

    // Top productos
    const prodMap = {}
    items?.forEach(it => {
      const id = it.producto_id
      if (!prodMap[id]) prodMap[id] = { nombre: it.producto?.nombre || '—', cant: 0, total: 0, costo: Number(it.producto?.precio_costo || 0) }
      prodMap[id].cant  += Number(it.cantidad)
      prodMap[id].total += Number(it.subtotal)
    })
    const topProductos = Object.values(prodMap).sort((a, b) => b.total - a.total).slice(0, 10)

    // Ventas por día
    const porDia = {}
    ventas.forEach(v => {
      if (!porDia[v.fecha]) porDia[v.fecha] = { fecha: v.fecha, cant: 0, total: 0 }
      porDia[v.fecha].cant++
      porDia[v.fecha].total += Number(v.total)
    })
    const ventasPorDia = Object.values(porDia).sort((a, b) => b.fecha.localeCompare(a.fecha))

    // Margen bruto estimado (precio_costo actual × cantidad vendida)
    const costoEstimado = items?.reduce((s, it) => s + Number(it.cantidad) * Number(it.producto?.precio_costo || 0), 0) || 0
    const margenBruto   = totalVentas - costoEstimado

    return { ventasPorDia, topProductos, porMedioPago, totalVentas, cantTickets, ticketPromedio, margenBruto }
  }

  async function cargarStock() {
    if (!comercioId) return null

    const { data: prods, error } = await supabase
      .from('productos')
      .select('nombre, precio_costo, stock_actual, controla_stock, activo, categoria:categorias(nombre, color)')
      .eq('comercio_id', comercioId)
      .eq('activo', true)
      .eq('controla_stock', true)

    if (error) throw new Error(error.message)
    if (!prods?.length) return { porCategoria: [], totalValor: 0, sinStock: [] }

    const catMap = {}
    let totalValor = 0

    prods.forEach(p => {
      const catNombre = p.categoria?.nombre || 'Sin categoría'
      const catColor  = p.categoria?.color  || null
      const valor     = Number(p.stock_actual || 0) * Number(p.precio_costo || 0)
      totalValor += valor
      if (!catMap[catNombre]) catMap[catNombre] = { nombre: catNombre, color: catColor, cant: 0, valor: 0 }
      catMap[catNombre].cant++
      catMap[catNombre].valor += valor
    })

    const porCategoria = Object.values(catMap).sort((a, b) => b.valor - a.valor)
    const sinStock     = prods.filter(p => Number(p.stock_actual) <= 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

    return { porCategoria, totalValor, sinStock }
  }

  async function cargarCompras(desde, hasta) {
    if (!comercioId) return null

    const { data: compras, error } = await supabase
      .from('compras')
      .select('id, fecha, total, estado, proveedor:proveedores(razon_social, nombre_fantasia)')
      .eq('comercio_id', comercioId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })

    if (error) throw new Error(error.message)
    if (!compras?.length) return { compras: [], porProveedor: [], totalComprado: 0, cantCompras: 0 }

    const totalComprado = compras.reduce((s, c) => s + Number(c.total), 0)

    const provMap = {}
    compras.forEach(c => {
      const nombre = c.proveedor?.nombre_fantasia || c.proveedor?.razon_social || 'Sin proveedor'
      if (!provMap[nombre]) provMap[nombre] = { nombre, cant: 0, total: 0 }
      provMap[nombre].cant++
      provMap[nombre].total += Number(c.total)
    })
    const porProveedor = Object.values(provMap).sort((a, b) => b.total - a.total)

    return { compras, porProveedor, totalComprado, cantCompras: compras.length }
  }

  return { cargarVentas, cargarStock, cargarCompras }
}
