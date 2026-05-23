import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function usePresupuestos(comercioId, perfilId) {
  const [presupuestos, setPresupuestos] = useState([])
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
      .from('presupuestos')
      .select('*, cliente:clientes(id, nombre, apellido)')
      .eq('comercio_id', comercioId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    setPresupuestos(data || [])
    setLoading(false)
  }

  async function cargarItems(presupuestoId) {
    const { data, error } = await supabase
      .from('presupuesto_items')
      .select('*, producto:productos(id, nombre)')
      .eq('presupuesto_id', presupuestoId)
      .order('created_at')
    return { data: data || [], error }
  }

  async function crear(datosPresupuesto, items) {
    // Generar número
    const numero = `P-${Date.now().toString().slice(-8)}`

    const { data: pres, error: errP } = await supabase
      .from('presupuestos')
      .insert({ ...datosPresupuesto, numero, comercio_id: comercioId, usuario_id: perfilId })
      .select('*, cliente:clientes(id, nombre, apellido)')
      .single()

    if (errP) return { error: errP }

    if (items.length > 0) {
      const itemsConId = items.map(it => ({
        presupuesto_id:  pres.id,
        producto_id:     it.producto_id || null,
        descripcion:     it.descripcion,
        cantidad:        Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
        descuento_pct:   Number(it.descuento_pct) || 0,
        subtotal:        Number(it.subtotal),
      }))
      const { error: errI } = await supabase.from('presupuesto_items').insert(itemsConId)
      if (errI) return { error: errI }
    }

    setPresupuestos(prev => [pres, ...prev])
    return { data: pres }
  }

  async function actualizarEstado(id, estado) {
    const { error } = await supabase
      .from('presupuestos')
      .update({ estado })
      .eq('id', id)
    if (!error) setPresupuestos(prev => prev.map(p => p.id === id ? { ...p, estado } : p))
    return { error }
  }

  return { presupuestos, loading, error, cargar, cargarItems, crear, actualizarEstado }
}
