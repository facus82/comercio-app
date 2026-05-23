import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useCajaMetricas(comercioId, fechaApertura) {
  const [metricas, setMetricas] = useState(null)
  const [centrosCostos, setCentrosCostos] = useState([])
  const [loadingMetricas, setLoadingMetricas] = useState(false)

  useEffect(() => {
    if (!comercioId || !fechaApertura) {
      setMetricas(null)
      return
    }
    cargar()
  }, [comercioId, fechaApertura])

  async function cargar() {
    setLoadingMetricas(true)

    const [resVentas, resPagos, resComprobantes, resItems, resCCs] = await Promise.all([
      supabase
        .from('ventas')
        .select('id, total')
        .eq('comercio_id', comercioId)
        .eq('estado', 'completada')
        .gte('fecha', fechaApertura),

      supabase
        .from('venta_pagos')
        .select('medio_pago, monto, venta:ventas!inner(comercio_id, estado, fecha)')
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
        .select('subtotal, producto:productos(centro_costo_id), venta:ventas!inner(comercio_id, estado, fecha)')
        .eq('venta.comercio_id', comercioId)
        .eq('venta.estado', 'completada')
        .gte('venta.fecha', fechaApertura),

      supabase
        .from('centros_costos')
        .select('id, nombre, color')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),
    ])

    const ventas = resVentas.data || []
    const pagos = resPagos.data || []
    const comprobantes = resComprobantes.data || []
    const items = resItems.data || []
    const ccs = resCCs.data || []

    const totalVendido = ventas.reduce((s, v) => s + Number(v.total), 0)
    const cantOps = ventas.length
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

    const porCC = ccs.map(cc => {
      const itemsCC = items.filter(i => i.producto?.centro_costo_id === cc.id)
      const total = itemsCC.reduce((s, i) => s + Number(i.subtotal), 0)
      return { ...cc, total, cantItems: itemsCC.length }
    })

    setMetricas({ totalVendido, cantOps, cantComprobantes, porMedioPago, porCC })
    setCentrosCostos(ccs)
    setLoadingMetricas(false)
  }

  return { metricas, centrosCostos, loadingMetricas, recargarMetricas: cargar }
}
