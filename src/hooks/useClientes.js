import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useClientes(comercioId) {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!comercioId) return
    cargar()
  }, [comercioId])

  async function cargar() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('comercio_id', comercioId)
      .order('nombre')
    if (error) setError(error.message)
    setClientes(data || [])
    setLoading(false)
  }

  async function crear(datos) {
    const { data, error } = await supabase
      .from('clientes')
      .insert({ ...datos, comercio_id: comercioId })
      .select()
      .single()
    if (error) return { error }
    setClientes(prev =>
      [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    )
    return { data }
  }

  async function actualizar(id, datos) {
    const { data, error } = await supabase
      .from('clientes')
      .update(datos)
      .eq('id', id)
      .select()
      .single()
    if (error) return { error }
    setClientes(prev => prev.map(c => c.id === id ? data : c))
    return { data }
  }

  async function toggleActivo(id, nuevoEstado) {
    const { error } = await supabase
      .from('clientes')
      .update({ activo: nuevoEstado })
      .eq('id', id)
    if (!error) setClientes(prev => prev.map(c => c.id === id ? { ...c, activo: nuevoEstado } : c))
    return { error }
  }

  return { clientes, loading, error, crear, actualizar, toggleActivo, recargar: cargar }
}
