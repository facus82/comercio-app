import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useObligaciones(comercioId, perfilId) {
  const [obligaciones, setObligaciones] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  useEffect(() => {
    if (!comercioId) return
    cargar()
  }, [comercioId])

  async function cargar() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('obligaciones_imp')
      .select('*, proveedor:proveedores(id, razon_social, nombre_fantasia)')
      .eq('comercio_id', comercioId)
      .order('proximo_vencimiento', { ascending: true, nullsFirst: false })
    if (error) setError(error.message)
    setObligaciones(data || [])
    setLoading(false)
  }

  async function crear(datos) {
    const { data, error } = await supabase
      .from('obligaciones_imp')
      .insert({ ...datos, comercio_id: comercioId })
      .select('*, proveedor:proveedores(id, razon_social, nombre_fantasia)')
      .single()
    if (error) return { error }
    setObligaciones(prev => [...prev, data].sort((a, b) => {
      if (!a.proximo_vencimiento) return 1
      if (!b.proximo_vencimiento) return -1
      return a.proximo_vencimiento.localeCompare(b.proximo_vencimiento)
    }))
    return { data }
  }

  async function actualizar(id, datos) {
    const { data, error } = await supabase
      .from('obligaciones_imp')
      .update(datos)
      .eq('id', id)
      .select('*, proveedor:proveedores(id, razon_social, nombre_fantasia)')
      .single()
    if (error) return { error }
    setObligaciones(prev => prev.map(o => o.id === id ? data : o))
    return { data }
  }

  async function toggleActivo(id, nuevoEstado) {
    const { error } = await supabase
      .from('obligaciones_imp')
      .update({ activo: nuevoEstado })
      .eq('id', id)
    if (!error) setObligaciones(prev => prev.map(o => o.id === id ? { ...o, activo: nuevoEstado } : o))
    return { error }
  }

  async function registrarPago(obligacionId, pagoData, proximoVencimiento) {
    const { data, error } = await supabase
      .from('obligaciones_pagos')
      .insert({ ...pagoData, obligacion_id: obligacionId, usuario_id: perfilId })
      .select()
      .single()
    if (error) return { error }

    // Actualizar próximo vencimiento si se provee
    if (proximoVencimiento) {
      await supabase
        .from('obligaciones_imp')
        .update({ proximo_vencimiento: proximoVencimiento })
        .eq('id', obligacionId)
      setObligaciones(prev =>
        prev.map(o => o.id === obligacionId ? { ...o, proximo_vencimiento: proximoVencimiento } : o)
      )
    }

    return { data }
  }

  async function cargarPagos(obligacionId) {
    const { data, error } = await supabase
      .from('obligaciones_pagos')
      .select('*')
      .eq('obligacion_id', obligacionId)
      .order('fecha_pago', { ascending: false })
    return { data: data || [], error }
  }

  return { obligaciones, loading, error, crear, actualizar, toggleActivo, registrarPago, cargarPagos, recargar: cargar }
}
