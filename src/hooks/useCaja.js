import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Distribuye pagos por CC cruzando items × pagos proporcionalmente por venta
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

export function useCaja(comercioId, perfilId) {
  const [cajaActual,   setCajaActual]   = useState(null)
  const [historial,    setHistorial]    = useState([])
  const [movimientos,  setMovimientos]  = useState([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    if (!comercioId) return
    cargar()
  }, [comercioId])

  async function cargar() {
    setLoading(true)

    const [resActual, resHistorial, resCCs] = await Promise.all([
      supabase
        .from('cierres_caja')
        .select('*')
        .eq('comercio_id', comercioId)
        .eq('estado', 'abierta')
        .order('fecha_apertura', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('cierres_caja')
        .select('*')
        .eq('comercio_id', comercioId)
        .eq('estado', 'cerrada')
        .order('fecha_cierre', { ascending: false })
        .limit(4),
      supabase
        .from('centros_costos')
        .select('id, nombre, color')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),
    ])

    const cajaAbierta = resActual.data || null
    setCajaActual(cajaAbierta)

    // Cargar movimientos de la caja abierta
    if (cajaAbierta) {
      const { data: movs } = await supabase
        .from('caja_movimientos')
        .select('*, usuario:usuarios(nombre), centro_costo:centros_costos(id, nombre, color)')
        .eq('caja_id', cajaAbierta.id)
        .order('created_at', { ascending: true })
      setMovimientos(movs || [])
    } else {
      setMovimientos([])
    }

    const cierres = resHistorial.data || []
    const ccs     = resCCs.data || []

    // Para cada cierre traer el desglose por CC
    let cierresConCC = cierres
    if (cierres.length > 0 && ccs.length > 0) {
      const oldest = cierres[cierres.length - 1]
      const [{ data: rawItems }, { data: rawPagos }] = await Promise.all([
        supabase
          .from('venta_items')
          .select('subtotal, producto:productos(centro_costo_id), venta:ventas!inner(id, comercio_id, estado, fecha)')
          .eq('venta.comercio_id', comercioId)
          .eq('venta.estado', 'completada')
          .gte('venta.fecha', oldest.fecha_apertura),
        supabase
          .from('venta_pagos')
          .select('medio_pago, monto, venta:ventas!inner(id, comercio_id, estado, fecha)')
          .eq('venta.comercio_id', comercioId)
          .eq('venta.estado', 'completada')
          .gte('venta.fecha', oldest.fecha_apertura),
      ])

      const allItems = rawItems || []
      const allPagos = rawPagos || []

      cierresConCC = cierres.map(c => {
        const inRange = (fecha) => {
          const f = new Date(fecha)
          return f >= new Date(c.fecha_apertura) && f <= new Date(c.fecha_cierre)
        }
        const itemsDeCierre = allItems.filter(i => inRange(i.venta.fecha))
        const pagosDeCierre = allPagos.filter(p => inRange(p.venta.fecha))
        const mediosPorCC   = buildMediosPorCC(ccs, itemsDeCierre, pagosDeCierre)

        const porCC = ccs
          .map(cc => {
            const ccItems = itemsDeCierre.filter(i => i.producto?.centro_costo_id === cc.id)
            return {
              ...cc,
              total:      ccItems.reduce((s, i) => s + Number(i.subtotal), 0),
              mediosPago: mediosPorCC[cc.id] || {},
            }
          })
          .filter(cc => cc.total > 0)
        return { ...c, porCC }
      })
    }

    setHistorial(cierresConCC)
    setLoading(false)
  }

  async function abrir(saldoApertura) {
    const { data, error } = await supabase
      .from('cierres_caja')
      .insert({
        comercio_id:    comercioId,
        usuario_id:     perfilId,
        saldo_apertura: Number(saldoApertura) || 0,
        estado:         'abierta',
      })
      .select()
      .single()
    if (error) return { error }
    setCajaActual(data)
    setMovimientos([])
    return { data }
  }

  async function registrarMovimiento({ tipo, monto, concepto, centro_costo_id, nro_comprobante }) {
    if (!cajaActual) return { error: { message: 'No hay caja abierta.' } }
    const montoNum = Number(monto)
    if (!montoNum || montoNum <= 0) return { error: { message: 'El monto debe ser mayor a 0.' } }

    const { data, error } = await supabase
      .from('caja_movimientos')
      .insert({
        caja_id:         cajaActual.id,
        comercio_id:     comercioId,
        usuario_id:      perfilId,
        tipo,
        monto:           montoNum,
        concepto:        concepto?.trim()        || null,
        centro_costo_id: tipo === 'retiro' ? (centro_costo_id || null) : null,
        nro_comprobante: nro_comprobante?.trim() || null,
      })
      .select('*, usuario:usuarios(nombre), centro_costo:centros_costos(id, nombre, color)')
      .single()

    if (error) return { error }
    setMovimientos(prev => [...prev, data])
    return { data }
  }

  async function cerrar({ efectivoContado, notas }) {
    if (!cajaActual) return { error: { message: 'No hay caja abierta.' } }

    const [{ data: pagosData }, { data: movsData }] = await Promise.all([
      supabase
        .from('venta_pagos')
        .select('medio_pago, monto, venta:ventas!inner(comercio_id, estado, fecha)')
        .eq('venta.comercio_id', comercioId)
        .eq('venta.estado', 'completada')
        .gte('venta.fecha', cajaActual.fecha_apertura),
      supabase
        .from('caja_movimientos')
        .select('tipo, monto')
        .eq('caja_id', cajaActual.id),
    ])

    const pagos = pagosData || []
    const movs  = movsData  || []

    const suma = (mp) => pagos.filter(p => p.medio_pago === mp).reduce((s, p) => s + Number(p.monto), 0)

    const totalEfectivo  = suma('efectivo')
    const totalDebito    = suma('tarjeta_debito')
    const totalCredito   = suma('tarjeta_credito')
    const totalTransfer  = suma('transferencia')
    const totalMp        = suma('mercado_pago')
    const totalCc        = suma('cuenta_corriente')

    const totalIngresos  = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
    const totalRetiros   = movs.filter(m => m.tipo === 'retiro').reduce((s, m) => s + Number(m.monto), 0)

    const saldoSistema   = Number(cajaActual.saldo_apertura) + totalEfectivo + totalIngresos - totalRetiros
    const efectivoNum    = Number(efectivoContado) || 0
    const diferencia     = efectivoNum - saldoSistema

    const { data, error } = await supabase
      .from('cierres_caja')
      .update({
        fecha_cierre:          new Date().toISOString(),
        efectivo_contado:      efectivoNum,
        total_ventas_efectivo: totalEfectivo,
        total_ventas_debito:   totalDebito,
        total_ventas_credito:  totalCredito,
        total_ventas_transfer: totalTransfer,
        total_ventas_mp:       totalMp,
        total_ventas_cc:       totalCc,
        total_ingresos_extra:  totalIngresos,
        total_egresos:         totalRetiros,
        saldo_sistema:         saldoSistema,
        diferencia:            diferencia,
        estado:                'cerrada',
        notas_cierre:          notas || null,
      })
      .eq('id', cajaActual.id)
      .select()
      .single()

    if (error) return { error }
    setHistorial(prev => [data, ...prev])
    setCajaActual(null)
    setMovimientos([])
    return { data }
  }

  return { cajaActual, historial, movimientos, loading, abrir, cerrar, registrarMovimiento, recargar: cargar }
}
