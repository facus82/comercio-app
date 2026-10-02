import { supabase } from '../lib/supabase'
import { cargarDeudas, resumirPorCliente } from './useCuentasCobrar'
import { cargarDevolucionesRango, totalOriginal } from '../lib/devoluciones'

/* 'YYYY-MM-DD' (día local) → límites ISO del día en hora de Argentina.
   ventas.fecha es timestamptz: comparar contra '2026-09-29' a secas corta en la
   medianoche UTC y deja afuera las ventas del día. */
const inicioDia = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, 0, 0, 0, 0).toISOString() }
const finDia    = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, 23, 59, 59, 999).toISOString() }
const diaLocal  = iso => { const f = new Date(iso); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}` }

// Todos los días del rango (para que el gráfico muestre también los días sin ventas)
export function diasDelRango(desde, hasta) {
  const out = []
  const [y, m, d] = desde.split('-').map(Number)
  const cur = new Date(y, m - 1, d)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  const fin = new Date(y2, m2 - 1, d2)
  while (cur <= fin && out.length < 400) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export function useReportes(comercioId) {

  async function cargarVentas(desde, hasta) {
    if (!comercioId) return null

    const [{ data: ventas, error }, devs] = await Promise.all([
      supabase
        .from('ventas')
        .select('id, fecha, total, devuelto_monto')
        .eq('comercio_id', comercioId)
        .eq('es_saldo_inicial', false)
        .eq('estado', 'completada')
        .gte('fecha', inicioDia(desde))
        .lte('fecha', finDia(hasta))
        .order('fecha', { ascending: false }),
      cargarDevolucionesRango(comercioId, inicioDia(desde), finDia(hasta)),
    ])

    if (error) throw new Error(error.message)
    if (devs.error) throw new Error(devs.error.message)
    if (!ventas?.length && !devs.data.length) {
      return { ventasPorDia: [], topProductos: [], porMedioPago: {}, totalVentas: 0, totalDevuelto: 0, cantTickets: 0, ticketPromedio: 0, margenBruto: 0, sinCosto: 0 }
    }

    const ids = ventas.map(v => v.id)

    const [{ data: pagos }, { data: items }] = ids.length ? await Promise.all([
      supabase.from('venta_pagos').select('medio_pago, monto').in('venta_id', ids),
      supabase.from('venta_items')
        .select('producto_id, cantidad, subtotal, producto:productos(nombre, precio_costo)')
        .in('venta_id', ids),
    ]) : [{ data: [] }, { data: [] }]

    // Ventas a su valor original − devoluciones hechas en el período (cuentan el día que se hacen)
    const totalDevuelto  = devs.total
    const totalVentas    = ventas.reduce((s, v) => s + totalOriginal(v), 0) - totalDevuelto
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

    // Ventas por día (día local, no la marca de tiempo completa)
    const porDia = {}
    ventas.forEach(v => {
      const dia = diaLocal(v.fecha)
      if (!porDia[dia]) porDia[dia] = { fecha: dia, cant: 0, total: 0 }
      porDia[dia].cant++
      porDia[dia].total += totalOriginal(v)
    })
    devs.data.forEach(d => {
      const dia = diaLocal(d.created_at)
      if (!porDia[dia]) porDia[dia] = { fecha: dia, cant: 0, total: 0 }
      porDia[dia].total -= Number(d.monto)
    })
    const ventasPorDia = Object.values(porDia).sort((a, b) => b.fecha.localeCompare(a.fecha))

    // Margen bruto estimado (precio_costo actual × cantidad vendida)
    const costoEstimado = items?.reduce((s, it) => s + Number(it.cantidad) * Number(it.producto?.precio_costo || 0), 0) || 0
    const margenBruto   = totalVentas - costoEstimado

    // Productos vendidos sin costo cargado: inflan el margen, hay que avisarlo
    const sinCosto = new Set((items || []).filter(it => it.producto_id && !Number(it.producto?.precio_costo)).map(it => it.producto_id)).size

    return { ventasPorDia, topProductos, porMedioPago, totalVentas, totalDevuelto, cantTickets, ticketPromedio, margenBruto, sinCosto }
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

  /* Sólo totales, para comparar con el período anterior */
  async function cargarTotalesVentas(desde, hasta) {
    if (!comercioId) return null
    const [{ data, error }, devs] = await Promise.all([
      supabase
        .from('ventas')
        .select('total, devuelto_monto')
        .eq('comercio_id', comercioId)
        .eq('es_saldo_inicial', false)
        .eq('estado', 'completada')
        .gte('fecha', inicioDia(desde))
        .lte('fecha', finDia(hasta)),
      cargarDevolucionesRango(comercioId, inicioDia(desde), finDia(hasta)),
    ])
    if (error) throw new Error(error.message)
    const total = (data || []).reduce((s, v) => s + totalOriginal(v), 0) - devs.total
    const cant  = (data || []).length
    return { totalVentas: total, cantTickets: cant, ticketPromedio: cant ? total / cant : 0 }
  }

  /* Cuentas corrientes: deuda actual por antigüedad + movimiento del período */
  async function cargarCuentas(desde, hasta) {
    if (!comercioId) return null
    const [resDeudas, resCobros, resVentasCC] = await Promise.all([
      cargarDeudas(comercioId),
      supabase.from('clientes_cobros')
        .select('monto, medio_pago, fecha, cliente:clientes(nombre, apellido, razon_social)')
        .eq('comercio_id', comercioId)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false }),
      supabase.from('ventas')
        .select('cc_monto')
        .eq('comercio_id', comercioId)
        .eq('es_saldo_inicial', false)
        .eq('estado', 'completada')
        .gt('cc_monto', 0)
        .gte('fecha', inicioDia(desde))
        .lte('fecha', finDia(hasta)),
    ])
    if (resDeudas.error) throw new Error(resDeudas.error.message)
    if (resCobros.error) throw new Error(resCobros.error.message)

    // Antigüedad según días de atraso de cada venta pendiente
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const tramos = [
      { id: 'al_dia', label: 'Al día',          total: 0, cant: 0 },
      { id: 'd1_30',  label: '1 a 30 días',     total: 0, cant: 0 },
      { id: 'd31_60', label: '31 a 60 días',    total: 0, cant: 0 },
      { id: 'd60',    label: 'Más de 60 días',  total: 0, cant: 0 },
    ]
    resDeudas.data.forEach(v => {
      const atraso = v.fecha_vencimiento
        ? Math.round((hoy - new Date(v.fecha_vencimiento + 'T00:00:00')) / 86400000)
        : 0
      const t = atraso <= 0 ? tramos[0] : atraso <= 30 ? tramos[1] : atraso <= 60 ? tramos[2] : tramos[3]
      t.total += v.pendiente
      t.cant  += 1
    })

    const cobros       = resCobros.data || []
    const totalCobrado = cobros.reduce((s, c) => s + Number(c.monto), 0)
    const vendidoCC    = (resVentasCC.data || []).reduce((s, v) => s + Number(v.cc_monto), 0)
    const clientes     = resumirPorCliente(resDeudas.data)

    return {
      tramos,
      totalDeuda:   tramos.reduce((s, t) => s + t.total, 0),
      totalVencido: tramos.slice(1).reduce((s, t) => s + t.total, 0),
      clientes,
      cobros,
      totalCobrado,
      vendidoCC,
    }
  }

  return { cargarVentas, cargarTotalesVentas, cargarStock, cargarCompras, cargarCuentas }
}
