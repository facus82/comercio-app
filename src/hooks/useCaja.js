import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useCaja(comercioId, perfilId) {
  const [cajaActual, setCajaActual] = useState(null)
  const [historial,  setHistorial]  = useState([])
  const [loading,    setLoading]    = useState(true)

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

    setCajaActual(resActual.data || null)

    const cierres = resHistorial.data || []
    const ccs     = resCCs.data || []

    // Para cada cierre traer el desglose por CC (una sola query cubre todos)
    let cierresConCC = cierres
    if (cierres.length > 0 && ccs.length > 0) {
      const oldest = cierres[cierres.length - 1]
      const { data: items } = await supabase
        .from('venta_items')
        .select('subtotal, producto:productos(centro_costo_id), venta:ventas!inner(comercio_id, estado, fecha)')
        .eq('venta.comercio_id', comercioId)
        .eq('venta.estado', 'completada')
        .gte('venta.fecha', oldest.fecha_apertura)

      const allItems = items || []

      cierresConCC = cierres.map(c => {
        const itemsDeCierre = allItems.filter(i => {
          const f = new Date(i.venta.fecha)
          return f >= new Date(c.fecha_apertura) && f <= new Date(c.fecha_cierre)
        })
        const porCC = ccs
          .map(cc => {
            const ccItems = itemsDeCierre.filter(i => i.producto?.centro_costo_id === cc.id)
            return { ...cc, total: ccItems.reduce((s, i) => s + Number(i.subtotal), 0) }
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
        comercio_id:   comercioId,
        usuario_id:    perfilId,
        saldo_apertura: Number(saldoApertura) || 0,
        estado:        'abierta',
      })
      .select()
      .single()
    if (error) return { error }
    setCajaActual(data)
    return { data }
  }

  async function cerrar({ efectivoContado, notas }) {
    if (!cajaActual) return { error: { message: 'No hay caja abierta.' } }

    // Calcular totales de ventas desde apertura
    const { data: pagosData } = await supabase
      .from('venta_pagos')
      .select('medio_pago, monto, venta:ventas!inner(comercio_id, estado, fecha)')
      .eq('venta.comercio_id', comercioId)
      .eq('venta.estado', 'completada')
      .gte('venta.fecha', cajaActual.fecha_apertura)

    const pagos = pagosData || []
    const suma = (mp) => pagos.filter(p => p.medio_pago === mp).reduce((s, p) => s + Number(p.monto), 0)

    const totalEfectivo  = suma('efectivo')
    const totalDebito    = suma('tarjeta_debito')
    const totalCredito   = suma('tarjeta_credito')
    const totalTransfer  = suma('transferencia')
    const totalMp        = suma('mercado_pago')
    const totalCc        = suma('cuenta_corriente')
    const saldoSistema   = Number(cajaActual.saldo_apertura) + totalEfectivo
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
    return { data }
  }

  return { cajaActual, historial, loading, abrir, cerrar, recargar: cargar }
}
