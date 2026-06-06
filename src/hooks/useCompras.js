import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useCompras(comercioId, perfilId) {
  const [compras, setCompras]   = useState([])
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
      .from('compras')
      .select('*, proveedor:proveedores(id, razon_social, nombre_fantasia)')
      .eq('comercio_id', comercioId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    setCompras(data || [])
    setLoading(false)
  }

  async function cargarItems(compraId) {
    const { data, error } = await supabase
      .from('compra_items')
      .select('*, producto:productos(id, nombre, codigo, codigo_barras, precio_costo, iva_porcentaje, unidad_medida)')
      .eq('compra_id', compraId)
      .order('created_at')
    return { data: data || [], error }
  }

  // Crea compra + items + distribuye flete + actualiza stock, precios y lotes
  async function crear(datosCompra, items) {
    // Calcular flete por unidad (distribuido por cantidad total de unidades)
    const flete          = Number(datosCompra.flete) || 0
    const totalUnidades  = items.reduce((s, it) => s + Number(it.cantidad), 0)
    const fletePorUnidad = totalUnidades > 0 ? flete / totalUnidades : 0

    // 1. Insertar compra
    const { data: compra, error: errCompra } = await supabase
      .from('compras')
      .insert({ ...datosCompra, comercio_id: comercioId, usuario_id: perfilId })
      .select('*, proveedor:proveedores(id, razon_social, nombre_fantasia)')
      .single()

    if (errCompra) return { error: errCompra }

    // 2. Insertar items
    const itemsConId = items.map(it => ({
      compra_id:       compra.id,
      producto_id:     it.producto_id,
      cantidad:        Number(it.cantidad),
      precio_unitario: Number(it.precio_unitario),
      iva_porcentaje:  Number(it.iva_porcentaje),
      descuento_pct:   Number(it.descuento_pct) || 0,
      subtotal:        Number(it.subtotal),
    }))

    const { error: errItems } = await supabase.from('compra_items').insert(itemsConId)
    if (errItems) return { error: errItems }

    // 3. Por cada item: actualizar precio_costo (con flete), stock y lotes
    await Promise.all(items.map(async it => {
      // Costo real = precio unitario + parte proporcional del flete por unidad
      const costoEfectivo = +(Number(it.precio_unitario) + fletePorUnidad).toFixed(2)

      const { data: prod } = await supabase
        .from('productos')
        .select('precio_costo, precio_venta, precio_mayorista, stock_actual, controla_stock, controla_lotes')
        .eq('id', it.producto_id)
        .single()

      if (!prod) return

      const stockAnterior = Number(prod.stock_actual) || 0
      const stockNuevo    = stockAnterior + Number(it.cantidad)
      const costoActual   = Number(prod.precio_costo) || 0

      // Precio_costo solo sube — nunca baja automáticamente
      const updateProd = {}
      if (prod.controla_stock !== false) updateProd.stock_actual = stockNuevo
      if (costoEfectivo > costoActual)   updateProd.precio_costo = costoEfectivo

      if (Object.keys(updateProd).length > 0) {
        await supabase.from('productos').update(updateProd).eq('id', it.producto_id)
      }

      // Historial de precio si el costo efectivo es distinto al actual
      if (costoEfectivo !== costoActual) {
        await supabase.from('precio_historial').insert({
          producto_id:      it.producto_id,
          precio_costo:     costoEfectivo,
          precio_venta:     prod.precio_venta,
          precio_mayorista: prod.precio_mayorista || null,
          motivo:           `Compra #${compra.numero || compra.id.slice(0, 8)}${flete > 0 ? ` (inc. flete $${fletePorUnidad.toFixed(2)}/u)` : ''}`,
          usuario_id:       perfilId,
        })
      }

      // Movimiento de stock
      await supabase.from('stock_movimientos').insert({
        comercio_id:     comercioId,
        producto_id:     it.producto_id,
        tipo:            'entrada',
        cantidad:        Number(it.cantidad),
        stock_anterior:  stockAnterior,
        stock_posterior: stockNuevo,
        precio_unitario: costoEfectivo,
        motivo:          `Compra #${compra.numero || compra.id.slice(0, 8)}`,
        referencia_tipo: 'compra',
        referencia_id:   compra.id,
        usuario_id:      perfilId,
      })

      // Crear lote si el producto controla lotes o se cargó fecha de vencimiento
      if (prod.controla_lotes || it.fecha_vencimiento) {
        await supabase.from('lotes').insert({
          producto_id:       it.producto_id,
          fecha_vencimiento: it.fecha_vencimiento || null,
          cantidad_inicial:  Number(it.cantidad),
          cantidad_actual:   Number(it.cantidad),
          precio_costo:      costoEfectivo,
          estado:            'activo',
        })
      }
    }))

    setCompras(prev => [compra, ...prev])
    return { data: compra }
  }

  async function actualizarEstado(id, estado) {
    const { error } = await supabase
      .from('compras')
      .update({ estado })
      .eq('id', id)
    if (!error) {
      setCompras(prev => prev.map(c => c.id === id ? { ...c, estado } : c))
    }
    return { error }
  }

  return { compras, loading, error, cargar, cargarItems, crear, actualizarEstado }
}
