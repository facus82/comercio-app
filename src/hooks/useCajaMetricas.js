import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function buildMediosPorCC(ccs, items, pagos) {
  const ventaMap = {}
  for (const item of items) {
    const vid = item.venta?.id
    if (!vid) continue
    if (!ventaMap[vid]) ventaMap[vid] = { subtotalTotal: 0, itemsByCC: {}, pagos: [] }
    ventaMap[vid].subtotalTotal += Number(item.subtotal)
    const ccId = item.producto?.centro_costo_id
    if (ccId) ventaMap[vid].itemsByCC[ccId] = (ventaMap[vid].itemsByCC[ccId] || 0) + Number(item.subtotal)
  }
  for (const pago of pagos) {
    const vid = pago.venta?.id
    if (vid && ventaMap[vid]) ventaMap[vid].pagos.push({ mp: pago.medio_pago, monto: Number(pago.monto) })
  }
  const result = {}
  for (const cc of ccs) result[cc.id] = {}
  for (const venta of Object.values(ventaMap)) {
    if (!venta.subtotalTotal || !venta.pagos.length) continue
    for (const [ccId, ccSub] of Object.entries(venta.itemsByCC)) {
      if (!result[ccId]) continue
      const frac = ccSub / venta.subtotalTotal
      for (const { mp, monto } of venta.pagos) {
        result[ccId][mp] = (result[ccId][mp] || 0) + monto * frac
      }
    }
  }
  return result
}

export function useCajaMetricas(comercioId, fechaApertura) {
  const [metricas,        setMetricas]        = useState(null)
  const [centrosCostos,   setCentrosCostos]   = useState([])
  const [pagosEfectivo,   setPagosEfectivo]   = useState([])
  const [loadingMetricas, setLoadingMetricas] = useState(false)

  useEffect(() => {
    if (!comercioId || !fechaApertura) {
      setMetricas(null)
      setPagosEfectivo([])
      return
    }
    cargar()
  }, [comercioId, fechaApertura])

  async function cargar() {
    setLoadingMetricas(true)

    const [resVentas, resPagos, resComprobantes, resItems, resCCs, resPagosEf] = await Promise.all([
      supabase
        .from('ventas')
        .select('id, total')
        .eq('comercio_id', comercioId)
        .eq('estado', 'completada')
        .gte('fecha', fechaApertura),

      supabase
        .from('venta_pagos')
        .select('medio_pago, monto, venta:ventas!inner(id, comercio_id, estado, fecha)')
        .eq('venta.comercio_id', comercioId)
        .eq('venta.estado', 'completada')
        .gte('venta.fecha', fechaApertura),

      supabase
        .from('venta_comprobantes')
        .select('id, venta:ventas!inner(comercio_id, estado, fecha)')
        .eq('venta.comercio_id', comercioId)
        .eq('venta.estado', 'completada')
        .gte('venta.fecha', fechaApertura),

      supabase
        .from('venta_items')
        .select('subtotal, producto:productos(centro_costo_id), venta:ventas!inner(id, comercio_id, estado, fecha)')
        .eq('venta.comercio_id', comercioId)
        .eq('venta.estado', 'completada')
        .gte('venta.fecha', fechaApertura),

      supabase
        .from('centros_costos')
        .select('id, nombre, color')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),

      // Pagos en efectivo individuales para el ledger de composición del saldo
      supabase
        .from('venta_pagos')
        .select('id, monto, created_at, venta:ventas!inner(id, numero, comercio_id, estado, fecha)')
        .eq('medio_pago', 'efectivo')
        .eq('venta.comercio_id', comercioId)
        .eq('venta.estado', 'completada')
        .gte('venta.fecha', fechaApertura)
        .order('created_at', { ascending: true }),
    ])

    const ventas       = resVentas.data       || []
    const pagos        = resPagos.data        || []
    const comprobantes = resComprobantes.data || []
    const items        = resItems.data        || []
    const ccs          = resCCs.data          || []
    const pagosEf      = resPagosEf.data      || []

    const totalVendido    = ventas.reduce((s, v) => s + Number(v.total), 0)
    const cantOps         = ventas.length
    const cantComprobantes = comprobantes.length

    const sumaMP = (mp) =>
      pagos.filter(p => p.medio_pago === mp).reduce((s, p) => s + Number(p.monto), 0)

    const porMedioPago = {
      efectivo:      sumaMP('efectivo'),
      debito:        sumaMP('tarjeta_debito'),
      credito:       sumaMP('tarjeta_credito'),
      transferencia: sumaMP('transferencia'),
      mercado_pago:  sumaMP('mercado_pago'),
      cc:            sumaMP('cuenta_corriente'),
    }

    const mediosPorCC = buildMediosPorCC(ccs, items, pagos)

    const porCC = ccs.map(cc => {
      const itemsCC = items.filter(i => i.producto?.centro_costo_id === cc.id)
      const total   = itemsCC.reduce((s, i) => s + Number(i.subtotal), 0)
      return { ...cc, total, cantItems: itemsCC.length, mediosPago: mediosPorCC[cc.id] || {} }
    })

    setMetricas({ totalVendido, cantOps, cantComprobantes, porMedioPago, porCC })
    setCentrosCostos(ccs)
    setPagosEfectivo(pagosEf)
    setLoadingMetricas(false)
  }

  return { metricas, centrosCostos, pagosEfectivo, loadingMetricas, recargarMetricas: cargar }
}
