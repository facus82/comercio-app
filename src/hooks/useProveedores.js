import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useProveedores(comercioId) {
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  useEffect(() => {
    if (!comercioId) return
    cargar()
  }, [comercioId])

  async function cargar() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .eq('comercio_id', comercioId)
      .order('razon_social')
    if (error) setError(error.message)
    setProveedores(data || [])
    setLoading(false)
  }

  async function crear(datos) {
    const { data, error } = await supabase
      .from('proveedores')
      .insert({ ...datos, comercio_id: comercioId })
      .select()
      .single()
    if (error) return { error }
    setProveedores(prev =>
      [...prev, data].sort((a, b) => a.razon_social.localeCompare(b.razon_social, 'es'))
    )
    return { data }
  }

  async function actualizar(id, datos) {
    const { data, error } = await supabase
      .from('proveedores')
      .update(datos)
      .eq('id', id)
      .select()
      .single()
    if (error) return { error }
    setProveedores(prev => prev.map(p => p.id === id ? data : p))
    return { data }
  }

  async function toggleActivo(id, nuevoEstado) {
    const { error } = await supabase
      .from('proveedores')
      .update({ activo: nuevoEstado })
      .eq('id', id)
    if (!error) {
      setProveedores(prev => prev.map(p => p.id === id ? { ...p, activo: nuevoEstado } : p))
    }
    return { error }
  }

  return { proveedores, loading, error, crear, actualizar, toggleActivo, recargar: cargar }
}
