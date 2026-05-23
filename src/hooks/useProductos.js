import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useProductos(comercioId, perfilId) {
  const [productos, setProductos]       = useState([])
  const [categorias, setCategorias]     = useState([])
  const [proveedores, setProveedores]   = useState([])
  const [centrosCostos, setCentrosCostos] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  useEffect(() => {
    if (!comercioId) return
    cargarTodo()
  }, [comercioId])

  async function cargarTodo() {
    setLoading(true)
    setError(null)

    const [resP, resC, resProv, resCCs] = await Promise.all([
      supabase
        .from('productos')
        .select('*, categoria:categorias(nombre, color)')
        .eq('comercio_id', comercioId)
        .order('nombre'),
      supabase
        .from('categorias')
        .select('id, nombre, color')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('proveedores')
        .select('id, razon_social, nombre_fantasia')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('razon_social'),
      supabase
        .from('centros_costos')
        .select('id, nombre, color')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),
    ])

    if (resP.error) setError(resP.error.message)
    setProductos(resP.data || [])
    setCategorias(resC.data || [])
    setProveedores(resProv.data || [])
    setCentrosCostos(resCCs.data || [])
    setLoading(false)
  }

  async function crear(datos) {
    const { data, error } = await supabase
      .from('productos')
      .insert({ ...datos, comercio_id: comercioId })
      .select('*, categoria:categorias(nombre, color)')
      .single()

    if (error) return { error }

    // Registrar precio inicial en historial
    await supabase.from('precio_historial').insert({
      producto_id: data.id,
      precio_costo:    datos.precio_costo,
      precio_venta:    datos.precio_venta,
      precio_mayorista: datos.precio_mayorista || null,
      motivo:   'Precio inicial',
      usuario_id: perfilId,
    })

    setProductos(prev =>
      [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    )
    return { data }
  }

  async function actualizar(id, datos, original) {
    const { data, error } = await supabase
      .from('productos')
      .update(datos)
      .eq('id', id)
      .select('*, categoria:categorias(nombre, color)')
      .single()

    if (error) return { error }

    // Registrar historial de precios si cambió alguno
    const precioCambio =
      Number(datos.precio_costo)    !== Number(original.precio_costo) ||
      Number(datos.precio_venta)    !== Number(original.precio_venta) ||
      Number(datos.precio_mayorista || 0) !== Number(original.precio_mayorista || 0)

    if (precioCambio) {
      await supabase.from('precio_historial').insert({
        producto_id:     id,
        precio_costo:    datos.precio_costo,
        precio_venta:    datos.precio_venta,
        precio_mayorista: datos.precio_mayorista || null,
        motivo:   'Actualización manual',
        usuario_id: perfilId,
      })
    }

    // Registrar movimiento de stock si cambió
    const stockDif = Number(datos.stock_actual) - Number(original.stock_actual)
    if (stockDif !== 0) {
      await supabase.from('stock_movimientos').insert({
        comercio_id:     comercioId,
        producto_id:     id,
        tipo:            stockDif > 0 ? 'entrada' : 'salida',
        cantidad:        Math.abs(stockDif),
        stock_anterior:  Number(original.stock_actual),
        stock_posterior: Number(datos.stock_actual),
        motivo:          'Ajuste manual desde Stock',
        referencia_tipo: 'ajuste_manual',
        usuario_id:      perfilId,
      })
    }

    setProductos(prev => prev.map(p => p.id === id ? data : p))
    return { data }
  }

  async function toggleActivo(id, nuevoEstado) {
    const { error } = await supabase
      .from('productos')
      .update({ activo: nuevoEstado })
      .eq('id', id)
    if (!error) {
      setProductos(prev => prev.map(p => p.id === id ? { ...p, activo: nuevoEstado } : p))
    }
    return { error }
  }

  return {
    productos,
    categorias,
    proveedores,
    centrosCostos,
    loading,
    error,
    crear,
    actualizar,
    toggleActivo,
    recargar: cargarTodo,
  }
}
