import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import './ProductoPanel.css'

const UNIDADES = ['unidad', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'caja', 'pack', 'docena']
const IVA_OPTS = [0, 10.5, 21, 27]

const LOTE_ESTADO_BADGE = {
  activo:   'badge--success',
  agotado:  'badge--neutral',
  vencido:  'badge--danger',
  retirado: 'badge--neutral',
}

const fmtFecha = str => {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function VencimientoBadge({ fecha }) {
  const hoy      = new Date(); hoy.setHours(0,0,0,0)
  const vto      = new Date(fecha + 'T00:00:00')
  const diasDiff = Math.ceil((vto - hoy) / 86400000)
  const cls      = diasDiff < 0 ? 'badge--danger' : diasDiff <= 30 ? 'badge--warning' : 'badge--success'
  const label    = diasDiff < 0 ? `Vencido (${fmtFecha(fecha)})` : fmtFecha(fecha)
  return <span className={`badge ${cls}`} style={{ fontSize: 10 }}>{label}</span>
}

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(v || 0)

const DEFAULTS = {
  nombre: '', codigo: '', codigo_barras: '', descripcion: '', notas: '',
  categoria_id: '', subcategoria_id: '', centro_costo_id: '',
  unidad_medida: 'unidad',
  precio_costo: '', precio_venta: '', precio_mayorista: '',
  iva_porcentaje: 21,
  stock_actual: 0, stock_minimo: 0, stock_maximo: '',
  controla_stock: true, controla_lotes: false, es_servicio: false, activo: true,
}

function toForm(p) {
  if (!p) return DEFAULTS
  return {
    nombre:          p.nombre          ?? '',
    codigo:          p.codigo          ?? '',
    codigo_barras:   p.codigo_barras   ?? '',
    descripcion:     p.descripcion     ?? '',
    notas:           p.notas           ?? '',
    categoria_id:    p.categoria_id    ?? '',
    subcategoria_id: p.subcategoria_id ?? '',
    centro_costo_id: p.centro_costo_id ?? '',
    unidad_medida:   p.unidad_medida   ?? 'unidad',
    precio_costo:    p.precio_costo    ?? '',
    precio_venta:    p.precio_venta    ?? '',
    precio_mayorista: p.precio_mayorista ?? '',
    iva_porcentaje:  p.iva_porcentaje  ?? 21,
    stock_actual:    p.stock_actual    ?? 0,
    stock_minimo:    p.stock_minimo    ?? 0,
    stock_maximo:    p.stock_maximo    ?? '',
    controla_stock:  p.controla_stock  ?? true,
    controla_lotes:  p.controla_lotes  ?? false,
    es_servicio:     p.es_servicio     ?? false,
    activo:          p.activo          ?? true,
  }
}

function initCalc(producto) {
  if (!producto) return { compra: '', flete: '', margen: 30 }
  const costo = Number(producto.precio_costo) || 0
  const venta = Number(producto.precio_venta) || 0          // ya incluye IVA
  const iva   = Number(producto.iva_porcentaje) || 0
  const neto  = iva > 0 ? venta / (1 + iva / 100) : venta  // extraer neto para calcular margen real
  const margen = costo > 0 ? Math.round(((neto / costo) - 1) * 100) : 30
  return { compra: costo || '', flete: '', margen: Math.max(0, margen) }
}

function ProveedoresSection({ productoId, proveedores, cargar, onAgregar, onEliminar, onPrincipal }) {
  const [lista,      setLista]     = useState([])
  const [cargando,   setCargando]  = useState(true)
  const [nuevoProv,  setNuevoProv] = useState('')
  const [nuevoPrecio,setNuevoPrecio] = useState('')
  const [guardando,  setGuardando] = useState(false)
  const [errorProv,  setErrorProv] = useState('')

  const cargarRef = useRef(cargar)
  cargarRef.current = cargar

  const recargar = useCallback(async () => {
    const data = await cargarRef.current(productoId)
    setLista(data)
    setCargando(false)
  }, [productoId])

  useEffect(() => { recargar() }, [recargar])

  async function handleAgregar() {
    if (!nuevoProv) return
    setGuardando(true)
    setErrorProv('')
    const res = await onAgregar(productoId, nuevoProv, nuevoPrecio ? Number(nuevoPrecio) : null)
    if (!res.error) {
      await recargar()
      setNuevoProv('')
      setNuevoPrecio('')
    } else {
      setErrorProv(res.error.message || 'Error al agregar proveedor.')
    }
    setGuardando(false)
  }

  async function handleEliminar(pp) {
    await onEliminar(pp.id, productoId, pp.es_principal)
    setLista(prev => prev.filter(x => x.id !== pp.id))
  }

  async function handlePrincipal(pp) {
    if (pp.es_principal) return
    await onPrincipal(pp.id, productoId, pp.proveedor_id)
    await recargar()
  }

  const disponibles = proveedores.filter(p => !lista.some(pp => pp.proveedor_id === p.id))

  if (cargando) return <p className="td-muted" style={{ fontSize: 12 }}>Cargando...</p>

  return (
    <div>
      {lista.length > 0 && (
        <table className="data-table" style={{ marginBottom: 10 }}>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th className="td-right">Precio costo</th>
              <th className="td-center">Principal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map(pp => (
              <tr key={pp.id}>
                <td>{pp.proveedor?.nombre_fantasia || pp.proveedor?.razon_social}</td>
                <td className="td-right td-mono td-muted">
                  {pp.precio_costo ? fmt$(pp.precio_costo) : '—'}
                </td>
                <td className="td-center">
                  <input type="radio" name={`principal-${productoId}`}
                    checked={pp.es_principal}
                    onChange={() => handlePrincipal(pp)} />
                </td>
                <td className="td-center">
                  {!pp.es_principal && (
                    <button type="button" className="btn-icon"
                      onClick={() => handleEliminar(pp)} title="Quitar proveedor">
                      <i className="ti ti-x" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {lista.length === 0 && (
        <p className="field-hint" style={{ marginBottom: 8 }}>
          <i className="ti ti-info-circle" /> Sin proveedores asociados.
        </p>
      )}
      {errorProv && (
        <div className="error-banner" style={{ marginBottom: 8 }}>
          <i className="ti ti-alert-circle" /> {errorProv}
        </div>
      )}
      {disponibles.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="field-select" style={{ flex: 1, minWidth: 140 }}
            value={nuevoProv} onChange={e => setNuevoProv(e.target.value)}>
            <option value="">Seleccionar proveedor...</option>
            {disponibles.map(p => (
              <option key={p.id} value={p.id}>{p.nombre_fantasia || p.razon_social}</option>
            ))}
          </select>
          <input className="field-input" type="number" min="0" step="0.01" placeholder="$ Precio costo"
            style={{ width: 130 }}
            value={nuevoPrecio} onChange={e => setNuevoPrecio(e.target.value)} />
          <button type="button" className="btn btn--primary"
            onClick={handleAgregar} disabled={!nuevoProv || guardando}>
            <i className={`ti ${guardando ? 'ti-loader-2' : 'ti-plus'}`} />
            {guardando ? '' : 'Agregar'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function ProductoPanel({
  producto, categorias, subcategorias = [], proveedores, centrosCostos,
  onCrear, onActualizar, onCerrar, onCreado,
  cargarProveedoresProducto, agregarProveedorProducto,
  eliminarProveedorProducto, marcarPrincipalProducto,
}) {
  const [form, setForm]   = useState(() => toForm(producto))
  const [calc, setCalc]   = useState(() => initCalc(producto))
  const [precioManual, setPrecioManual] = useState(!!producto) // al editar, precio es manual
  const [enPromo, setEnPromo] = useState(!!(producto?.precio_mayorista))
  const [saving, setSaving] = useState(false)
  const [error, setError]  = useState('')

  /* ── Lotes ── */
  const [lotes,         setLotes]         = useState([])
  const [loadingLotes,  setLoadingLotes]  = useState(false)
  const [showFormLote,  setShowFormLote]  = useState(false)
  const [formLote,      setFormLote]      = useState({ numero_lote: '', fecha_fabricacion: '', fecha_vencimiento: '', cantidad: '', precio_costo: '' })
  const [savingLote,    setSavingLote]    = useState(false)
  const [errorLote,     setErrorLote]     = useState('')

  useEffect(() => {
    if (!producto?.id || !form.controla_lotes) { setLotes([]); return }
    setLoadingLotes(true)
    supabase.from('lotes').select('*').eq('producto_id', producto.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setLotes(data || []); setLoadingLotes(false) })
  }, [producto?.id, form.controla_lotes])

  function resetFormLote() {
    setFormLote({ numero_lote: '', fecha_fabricacion: '', fecha_vencimiento: '', cantidad: '', precio_costo: '' })
    setErrorLote('')
    setShowFormLote(false)
  }

  async function handleAgregarLote(e) {
    e.preventDefault()
    if (!formLote.fecha_vencimiento && !formLote.fecha_fabricacion && !formLote.numero_lote.trim() && !formLote.cantidad) {
      setErrorLote('Completá al menos un campo.')
      return
    }
    setSavingLote(true); setErrorLote('')

    const cant = Number(formLote.cantidad) || 0

    const { data, error: errL } = await supabase.from('lotes').insert({
      producto_id:       producto.id,
      numero_lote:       formLote.numero_lote.trim() || null,
      fecha_fabricacion: formLote.fecha_fabricacion  || null,
      fecha_vencimiento: formLote.fecha_vencimiento  || null,
      cantidad_inicial:  cant,
      cantidad_actual:   cant,
      precio_costo:      formLote.precio_costo ? Number(formLote.precio_costo) : null,
      estado:            'activo',
    }).select().single()

    if (errL) { setErrorLote(errL.message); setSavingLote(false); return }

    const nuevoCosto = formLote.precio_costo ? Number(formLote.precio_costo) : null
    const costoActual = Number(form.precio_costo || 0)

    const updates = {}

    // Solo actualiza stock si se cargó una cantidad
    if (cant > 0 && form.controla_stock) {
      updates.stock_actual = Number(form.stock_actual || 0) + cant
    }

    // Sube el precio_costo si el nuevo lote es más caro — nunca baja automáticamente
    if (nuevoCosto && nuevoCosto > costoActual) {
      updates.precio_costo = nuevoCosto
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('productos').update(updates).eq('id', producto.id)
      setForm(prev => ({ ...prev, ...updates }))
      if (updates.precio_costo) {
        setCalc(prev => ({ ...prev, compra: updates.precio_costo.toFixed(2) }))
      }
    }

    setLotes(prev => [data, ...prev])
    resetFormLote()
    setSavingLote(false)
  }

  /* ── Registrar ingreso (compra individual) ── */
  const hoyStr = () => new Date().toISOString().slice(0, 10)

  const [showIngreso,    setShowIngreso]    = useState(false)
  const [formIngreso,    setFormIngreso]    = useState({
    proveedor_id: '', tipo_comprobante: 'factura', numero_comprobante: '',
    fecha: hoyStr(), cantidad: '1', precio_costo: '', flete: '', fecha_vencimiento: '',
  })
  const [savingIngreso,  setSavingIngreso]  = useState(false)
  const [errorIngreso,   setErrorIngreso]   = useState('')

  function resetIngreso() {
    setFormIngreso({
      proveedor_id: '', tipo_comprobante: 'factura', numero_comprobante: '',
      fecha: hoyStr(), cantidad: '1',
      precio_costo: String(producto?.precio_costo || ''),
      flete: '', fecha_vencimiento: '',
    })
    setErrorIngreso('')
    setShowIngreso(false)
  }

  async function handleGuardarIngreso(e) {
    e.preventDefault()
    const cant  = Number(formIngreso.cantidad)
    const costo = Number(formIngreso.precio_costo)
    if (!cant || cant <= 0)  { setErrorIngreso('La cantidad es obligatoria.'); return }
    if (!costo || costo < 0) { setErrorIngreso('El precio de costo es obligatorio.'); return }

    setSavingIngreso(true); setErrorIngreso('')

    const flete          = Number(formIngreso.flete) || 0
    const costoEfectivo  = +(costo + flete / cant).toFixed(2)
    const subtotal       = +(costo * cant).toFixed(2)

    // 1. Crear compra
    const { data: compra, error: errC } = await supabase
      .from('compras')
      .insert({
        comercio_id:        producto.comercio_id,
        proveedor_id:       formIngreso.proveedor_id || null,
        fecha:              formIngreso.fecha,
        tipo_comprobante:   formIngreso.tipo_comprobante,
        numero_comprobante: formIngreso.numero_comprobante.trim() || null,
        estado:             'pendiente',
        subtotal,
        iva_monto:          0,
        flete,
        total:              +(subtotal + flete).toFixed(2),
        descuento_monto:    0,
      })
      .select('id, numero')
      .single()

    if (errC) { setErrorIngreso(errC.message); setSavingIngreso(false); return }

    // 2. Crear compra_item
    await supabase.from('compra_items').insert({
      compra_id:       compra.id,
      producto_id:     producto.id,
      cantidad:        cant,
      precio_unitario: costo,
      iva_porcentaje:  Number(producto.iva_porcentaje) || 21,
      descuento_pct:   0,
      subtotal,
    })

    // 3. Actualizar producto
    const costoActual  = Number(form.precio_costo || 0)
    const nuevoStock   = Number(form.stock_actual || 0) + cant
    const updates      = {}
    if (form.controla_stock !== false) updates.stock_actual = nuevoStock
    if (costoEfectivo > costoActual)   updates.precio_costo = costoEfectivo

    if (Object.keys(updates).length > 0) {
      await supabase.from('productos').update(updates).eq('id', producto.id)
      setForm(prev => ({ ...prev, ...updates }))
      if (updates.precio_costo) setCalc(prev => ({ ...prev, compra: updates.precio_costo.toFixed(2) }))
    }

    // 4. Crear lote si corresponde
    if (form.controla_lotes || formIngreso.fecha_vencimiento) {
      const { data: loteNuevo } = await supabase.from('lotes').insert({
        producto_id:       producto.id,
        fecha_vencimiento: formIngreso.fecha_vencimiento || null,
        cantidad_inicial:  cant,
        cantidad_actual:   cant,
        precio_costo:      costoEfectivo,
        estado:            'activo',
      }).select().single()
      if (loteNuevo) setLotes(prev => [loteNuevo, ...prev])
    }

    // 5. Movimiento de stock
    const stockAnterior = Number(form.stock_actual || 0)
    await supabase.from('stock_movimientos').insert({
      comercio_id:     producto.comercio_id,
      producto_id:     producto.id,
      tipo:            'entrada',
      cantidad:        cant,
      stock_anterior:  stockAnterior,
      stock_posterior: stockAnterior + cant,
      precio_unitario: costoEfectivo,
      motivo:          `Compra #${compra.numero || compra.id.slice(0, 8)}${formIngreso.numero_comprobante ? ` — ${formIngreso.numero_comprobante}` : ''}`,
      referencia_tipo: 'compra',
      referencia_id:   compra.id,
    })

    resetIngreso()
    setSavingIngreso(false)
  }

  useEffect(() => {
    setForm(toForm(producto))
    setCalc(initCalc(producto))
    setPrecioManual(!!producto)
    setEnPromo(!!(producto?.precio_mayorista))
    setError('')
  }, [producto])

  // Cerrar con Escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  function setF(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }
  function setC(campo, valor) {
    setCalc(prev => ({ ...prev, [campo]: valor }))
  }

  // ── Calculadora ───────────────────────────────────────
  const costoBase = useMemo(() =>
    (Number(calc.compra) || 0) + (Number(calc.flete) || 0),
    [calc.compra, calc.flete]
  )

  // Precio sugerido = costo × (1 + margen%) × (1 + IVA%)  → precio FINAL con IVA
  const sugerido = useMemo(() => {
    if (costoBase <= 0) return 0
    const neto = costoBase * (1 + (Number(calc.margen) || 0) / 100)
    const iva  = Number(form.iva_porcentaje) || 0
    return +(neto * (1 + iva / 100)).toFixed(2)
  }, [costoBase, calc.margen, form.iva_porcentaje])

  // Desglose del precio de venta cargado manualmente
  const ventaConIva = Number(form.precio_venta) || 0
  const ivaPorc     = Number(form.iva_porcentaje) || 0
  const ventaNeto   = ivaPorc > 0 ? +(ventaConIva / (1 + ivaPorc / 100)).toFixed(2) : ventaConIva
  const ventaIvaAmt = +(ventaConIva - ventaNeto).toFixed(2)

  // Sincronizar precio_costo con costoBase cuando cambia la calculadora
  useEffect(() => {
    if (costoBase > 0) setF('precio_costo', costoBase.toFixed(2))
  }, [costoBase])

  // Auto-llenar precio_venta con sugerido si el usuario no lo editó manualmente
  useEffect(() => {
    if (!precioManual && sugerido > 0) setF('precio_venta', sugerido.toFixed(2))
  }, [sugerido, precioManual])

  function aplicarSugerido() {
    setF('precio_venta', sugerido.toFixed(2))
    setPrecioManual(false)
  }

  // ── Submit ────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim())     { setError('El nombre es obligatorio.');        return }
    if (!form.precio_venta)      { setError('El precio de venta es obligatorio.'); return }

    setSaving(true); setError('')

    const datos = {
      nombre:          form.nombre.trim(),
      codigo:          form.codigo.trim()        || null,
      codigo_barras:   form.codigo_barras.trim() || null,
      descripcion:     form.descripcion.trim()   || null,
      notas:           form.notas.trim()         || null,
      categoria_id:    form.categoria_id         || null,
      subcategoria_id: form.subcategoria_id      || null,
      centro_costo_id: form.centro_costo_id      || null,
      unidad_medida:   form.unidad_medida,
      precio_costo:    Number(form.precio_costo)    || 0,
      precio_venta:    Number(form.precio_venta)    || 0,
      precio_mayorista: enPromo && form.precio_mayorista ? Number(form.precio_mayorista) : null,
      iva_porcentaje:  Number(form.iva_porcentaje) || 21,
      stock_actual:    Number(form.stock_actual)   || 0,
      stock_minimo:    Number(form.stock_minimo)   || 0,
      stock_maximo:    form.stock_maximo ? Number(form.stock_maximo) : null,
      controla_stock:  form.controla_stock,
      controla_lotes:  form.controla_lotes,
      es_servicio:     form.es_servicio,
      activo:          form.activo,
    }

    const res = producto
      ? await onActualizar(producto.id, datos, producto)
      : await onCrear(datos)

    setSaving(false)
    if (res.error) {
      setError(res.error.message || 'Error al guardar.')
    } else if (!producto && res.data) {
      // Producto nuevo creado: quedarse en modo edición para poder agregar proveedores
      onCreado?.(res.data)
    } else {
      onCerrar()
    }
  }

  const esNuevo = !producto

  return (
    <div className="producto-modal">

        {/* Header */}
        <div className="panel-header">
          <h2 className="panel-title">
            <i className={`ti ${esNuevo ? 'ti-package' : 'ti-pencil'}`} style={{ marginRight: 6, fontSize: 15 }} />
            {esNuevo ? 'Nuevo producto' : form.nombre || 'Editar producto'}
          </h2>
          <button className="btn-icon" onClick={onCerrar} title="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Body: 2 columnas */}
        <div className="producto-modal__body">

          {/* ── Columna izquierda: formulario principal ── */}
          <div className="producto-modal__col">
            <form id="producto-form" onSubmit={handleSubmit}>
              {error && (
                <div className="error-banner">
                  <i className="ti ti-alert-circle" /> {error}
                </div>
              )}

              {/* Identificación */}
              <div className="form-section">
                <p className="form-section-title">Identificación</p>
                <div className="field">
                  <label className="field-label">Nombre *</label>
                  <input className="field-input" placeholder="Nombre del producto"
                    value={form.nombre} onChange={e => setF('nombre', e.target.value)}
                    required autoFocus />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label className="field-label">Código interno</label>
                    <input className="field-input" placeholder="LIB-001"
                      value={form.codigo} onChange={e => setF('codigo', e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="field-label">Código de barras</label>
                    <input className="field-input" placeholder="7790001..."
                      value={form.codigo_barras} onChange={e => setF('codigo_barras', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Descripción</label>
                  <textarea className="field-textarea" rows={2} placeholder="Opcional..."
                    value={form.descripcion} onChange={e => setF('descripcion', e.target.value)} />
                </div>
              </div>

              {/* Clasificación */}
              <div className="form-section">
                <p className="form-section-title">Clasificación</p>
                <div className="form-grid">
                  <div className="field">
                    <label className="field-label">Categoría</label>
                    <select className="field-select" value={form.categoria_id}
                      onChange={e => { setF('categoria_id', e.target.value); setF('subcategoria_id', '') }}>
                      <option value="">Sin categoría</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  {form.categoria_id && (
                    <div className="field">
                      <label className="field-label">Subcategoría</label>
                      <select className="field-select" value={form.subcategoria_id}
                        onChange={e => setF('subcategoria_id', e.target.value)}>
                        <option value="">Sin subcategoría</option>
                        {subcategorias
                          .filter(s => s.categoria_id === form.categoria_id)
                          .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)
                        }
                      </select>
                    </div>
                  )}
                  <div className="field">
                    <label className="field-label">Unidad de medida</label>
                    <select className="field-select" value={form.unidad_medida}
                      onChange={e => setF('unidad_medida', e.target.value)}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">Centro de costo</label>
                    <select className="field-select" value={form.centro_costo_id}
                      onChange={e => setF('centro_costo_id', e.target.value)}>
                      <option value="">Sin asignar</option>
                      {centrosCostos.map(cc => <option key={cc.id} value={cc.id}>{cc.nombre}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Precios */}
              <div className="form-section">
                <p className="form-section-title">Precios</p>
                <div className="form-grid">
                  <div className="field">
                    <label className="field-label">Precio de compra $</label>
                    <input className="field-input" type="number" min="0" step="0.01" placeholder="0"
                      value={calc.compra} onChange={e => setC('compra', e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="field-label">Costo flete distribuido $</label>
                    <input className="field-input" type="number" min="0" step="0.01" placeholder="0"
                      value={calc.flete} onChange={e => setC('flete', e.target.value)} />
                  </div>
                </div>
                <div className="calc-row calc-row--base">
                  <span className="calc-label">Costo base (precio + flete)</span>
                  <span className="calc-value">{fmt$(costoBase)}</span>
                </div>
                <div className="form-grid" style={{ alignItems: 'flex-end' }}>
                  <div className="field" style={{ maxWidth: 160 }}>
                    <label className="field-label">Margen de ganancia %</label>
                    <input className="field-input" type="number" min="0" step="1" placeholder="30"
                      value={calc.margen} onChange={e => setC('margen', e.target.value)} />
                  </div>
                  <div className="field" style={{ maxWidth: 140 }}>
                    <label className="field-label">IVA %</label>
                    <select className="field-select" value={form.iva_porcentaje}
                      onChange={e => setF('iva_porcentaje', e.target.value)}>
                      {IVA_OPTS.map(v => <option key={v} value={v}>{v}%</option>)}
                    </select>
                  </div>
                </div>
                <div className="calc-row calc-row--sugerido">
                  <div>
                    <span className="calc-label">
                      Precio sugerido
                      <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>(c/IVA)</span>
                    </span>
                    <span className="calc-value calc-value--sugerido">{fmt$(sugerido)}</span>
                  </div>
                  {precioManual && sugerido > 0 && (
                    <button type="button" className="btn" onClick={aplicarSugerido} style={{ fontSize: 11 }}>
                      <i className="ti ti-arrow-down" /> Aplicar
                    </button>
                  )}
                </div>
                <div className="field">
                  <label className="field-label">
                    Precio de venta (c/IVA) $ *
                    {!precioManual && sugerido > 0 && (
                      <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 6, textTransform: 'none' }}>
                        (sincronizado con sugerido)
                      </span>
                    )}
                  </label>
                  <input className="field-input field-input--venta" type="number" min="0" step="0.01"
                    placeholder="0" value={form.precio_venta}
                    onChange={e => { setF('precio_venta', e.target.value); setPrecioManual(true) }} />
                  {ventaConIva > 0 && ivaPorc > 0 && (
                    <div className="precio-desglose">
                      <span>Neto: {fmt$(ventaNeto)}</span>
                      <span className="precio-desglose-sep">+</span>
                      <span>IVA {ivaPorc}%: {fmt$(ventaIvaAmt)}</span>
                      <span className="precio-desglose-sep">=</span>
                      <span className="precio-desglose-total">Final: {fmt$(ventaConIva)}</span>
                    </div>
                  )}
                </div>
                <div className="promo-toggle">
                  <label className="field-check">
                    <input type="checkbox" checked={enPromo}
                      onChange={e => { setEnPromo(e.target.checked); if (!e.target.checked) setF('precio_mayorista', '') }} />
                    Activar precio promocional / mayorista
                  </label>
                  {enPromo && (
                    <div className="field" style={{ marginTop: 8 }}>
                      <label className="field-label">Precio promocional (c/IVA) $</label>
                      <input className="field-input field-input--promo" type="number" min="0" step="0.01"
                        placeholder="0" value={form.precio_mayorista}
                        onChange={e => setF('precio_mayorista', e.target.value)} />
                    </div>
                  )}
                </div>
              </div>

              {/* Stock */}
              {!form.es_servicio && (
                <div className="form-section">
                  <p className="form-section-title">Stock</p>
                  <div className="form-grid form-grid--3">
                    <div className="field">
                      <label className="field-label">Stock actual</label>
                      <input className="field-input" type="number" step="0.001" placeholder="0"
                        value={form.stock_actual} onChange={e => setF('stock_actual', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Stock mínimo</label>
                      <input className="field-input" type="number" step="0.001" placeholder="0"
                        value={form.stock_minimo} onChange={e => setF('stock_minimo', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Stock máximo</label>
                      <input className="field-input" type="number" step="0.001" placeholder="—"
                        value={form.stock_maximo} onChange={e => setF('stock_maximo', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Opciones */}
              <div className="form-section">
                <p className="form-section-title">Opciones</p>
                <div className="form-checks">
                  <label className="field-check">
                    <input type="checkbox" checked={form.activo}
                      onChange={e => setF('activo', e.target.checked)} />
                    Activo
                  </label>
                  <label className="field-check">
                    <input type="checkbox" checked={form.es_servicio}
                      onChange={e => setF('es_servicio', e.target.checked)} />
                    Es servicio
                  </label>
                  <label className="field-check">
                    <input type="checkbox" checked={form.controla_stock}
                      onChange={e => setF('controla_stock', e.target.checked)}
                      disabled={form.es_servicio} />
                    Controla stock
                  </label>
                  <label className="field-check">
                    <input type="checkbox" checked={form.controla_lotes}
                      onChange={e => setF('controla_lotes', e.target.checked)}
                      disabled={form.es_servicio} />
                    Lotes / vencimientos
                  </label>
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label className="field-label">Notas internas</label>
                  <textarea className="field-textarea" rows={2} placeholder="Notas opcionales..."
                    value={form.notas} onChange={e => setF('notas', e.target.value)} />
                </div>
              </div>
            </form>
          </div>

          {/* ── Columna derecha: secciones operativas ── */}
          <div className="producto-modal__col producto-modal__col--right">

            {/* Proveedores */}
            <div className="form-section lotes-section">
              <p className="form-section-title" style={{ margin: 0, marginBottom: 10 }}>
                <i className="ti ti-truck-delivery" /> Proveedores
              </p>
              {esNuevo ? (
                <p className="field-hint">
                  <i className="ti ti-info-circle" /> Guardá el producto primero para asociar proveedores.
                </p>
              ) : (
                <ProveedoresSection
                  productoId={producto.id}
                  proveedores={proveedores}
                  cargar={cargarProveedoresProducto}
                  onAgregar={agregarProveedorProducto}
                  onEliminar={eliminarProveedorProducto}
                  onPrincipal={marcarPrincipalProducto}
                />
              )}
            </div>

            {/* Lotes / vencimientos */}
            {form.controla_lotes && (
              <div className="form-section lotes-section">
                <div className="lotes-section__header">
                  <p className="form-section-title" style={{ margin: 0 }}>
                    <i className="ti ti-package" /> Lotes / vencimientos
                  </p>
                  {!esNuevo && (
                    <button type="button" className="btn btn--primary"
                      onClick={() => { setShowFormLote(v => !v); setErrorLote('') }}>
                      <i className={`ti ${showFormLote ? 'ti-x' : 'ti-plus'}`} />
                      {showFormLote ? 'Cancelar' : 'Agregar lote'}
                    </button>
                  )}
                </div>
                {esNuevo && (
                  <p className="field-hint" style={{ marginTop: 4 }}>
                    <i className="ti ti-info-circle" /> Guardá el producto primero para registrar lotes.
                  </p>
                )}
                {!esNuevo && showFormLote && (
                  <form onSubmit={handleAgregarLote} className="lote-form">
                    {errorLote && (
                      <div className="error-banner"><i className="ti ti-alert-circle" /> {errorLote}</div>
                    )}
                    <div className="form-grid form-grid--3">
                      <div className="field">
                        <label className="field-label">N° Lote</label>
                        <input className="field-input" placeholder="Opcional"
                          value={formLote.numero_lote}
                          onChange={e => setFormLote(p => ({ ...p, numero_lote: e.target.value }))}
                          autoFocus />
                      </div>
                      <div className="field">
                        <label className="field-label">Cantidad</label>
                        <input className="field-input" type="number" min="0.001" step="0.001" placeholder="0"
                          value={formLote.cantidad}
                          onChange={e => setFormLote(p => ({ ...p, cantidad: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label className="field-label">Precio costo $</label>
                        <input className="field-input" type="number" min="0" step="0.01" placeholder="0"
                          value={formLote.precio_costo}
                          onChange={e => setFormLote(p => ({ ...p, precio_costo: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label className="field-label">Fecha fabricación</label>
                        <input className="field-input" type="date"
                          value={formLote.fecha_fabricacion}
                          onChange={e => setFormLote(p => ({ ...p, fecha_fabricacion: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label className="field-label">Fecha vencimiento</label>
                        <input className="field-input" type="date"
                          value={formLote.fecha_vencimiento}
                          onChange={e => setFormLote(p => ({ ...p, fecha_vencimiento: e.target.value }))} />
                      </div>
                    </div>
                    <button type="submit" className="btn btn--primary" disabled={savingLote} style={{ marginTop: 8 }}>
                      <i className={`ti ${savingLote ? 'ti-loader-2' : 'ti-check'}`} />
                      {savingLote ? 'Guardando...' : 'Guardar lote'}
                    </button>
                  </form>
                )}
                {!esNuevo && (
                  loadingLotes ? (
                    <p className="lotes-section__empty"><i className="ti ti-loader-2" /> Cargando...</p>
                  ) : lotes.length === 0 ? (
                    <p className="lotes-section__empty">Sin lotes registrados.</p>
                  ) : (
                    <table className="data-table" style={{ marginTop: 8 }}>
                      <thead>
                        <tr>
                          <th>N° Lote</th>
                          <th>Fabricación</th>
                          <th>Vencimiento</th>
                          <th className="td-right">Cant.</th>
                          <th className="td-right">Costo</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lotes.map(l => (
                          <tr key={l.id}>
                            <td className="td-mono td-muted">{l.numero_lote || '—'}</td>
                            <td className="td-muted" style={{ fontSize: 11 }}>{fmtFecha(l.fecha_fabricacion)}</td>
                            <td>
                              {l.fecha_vencimiento
                                ? <VencimientoBadge fecha={l.fecha_vencimiento} />
                                : <span className="td-muted">—</span>}
                            </td>
                            <td className="td-right td-mono">{l.cantidad_actual}</td>
                            <td className="td-right td-mono td-muted">
                              {l.precio_costo ? `$${Number(l.precio_costo).toLocaleString('es-AR')}` : '—'}
                            </td>
                            <td>
                              <span className={`badge ${LOTE_ESTADO_BADGE[l.estado] || 'badge--neutral'}`}>
                                {l.estado}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            )}

            {/* Registrar ingreso */}
            {!esNuevo && (
              <div className="form-section lotes-section">
                <div className="lotes-section__header">
                  <p className="form-section-title" style={{ margin: 0 }}>
                    <i className="ti ti-shopping-cart-plus" /> Registrar ingreso
                  </p>
                  {!showIngreso && (
                    <button type="button" className="btn btn--primary"
                      onClick={() => { setShowIngreso(true); setFormIngreso(p => ({ ...p, precio_costo: String(producto?.precio_costo || ''), fecha: hoyStr() })) }}>
                      <i className="ti ti-plus" /> Nueva compra
                    </button>
                  )}
                </div>
                {showIngreso && (
                  <form onSubmit={handleGuardarIngreso} className="lote-form">
                    {errorIngreso && (
                      <div className="error-banner"><i className="ti ti-alert-circle" /> {errorIngreso}</div>
                    )}
                    <div className="form-grid">
                      <div className="field">
                        <label className="field-label">Proveedor</label>
                        <select className="field-select" value={formIngreso.proveedor_id}
                          onChange={e => setFormIngreso(p => ({ ...p, proveedor_id: e.target.value }))}>
                          <option value="">Sin proveedor</option>
                          {proveedores.map(p => (
                            <option key={p.id} value={p.id}>{p.nombre_fantasia || p.razon_social}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label className="field-label">Fecha</label>
                        <input className="field-input" type="date" value={formIngreso.fecha}
                          onChange={e => setFormIngreso(p => ({ ...p, fecha: e.target.value }))} />
                      </div>
                    </div>
                    <div className="form-grid">
                      <div className="field">
                        <label className="field-label">Tipo comprobante</label>
                        <select className="field-select" value={formIngreso.tipo_comprobante}
                          onChange={e => setFormIngreso(p => ({ ...p, tipo_comprobante: e.target.value }))}>
                          {['factura','factura_a','factura_b','factura_c','remito','ticket','nota_credito'].map(t => (
                            <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label className="field-label">N° comprobante</label>
                        <input className="field-input" placeholder="0001-00012345"
                          value={formIngreso.numero_comprobante}
                          onChange={e => setFormIngreso(p => ({ ...p, numero_comprobante: e.target.value }))} />
                      </div>
                    </div>
                    <div className="form-grid form-grid--3">
                      <div className="field">
                        <label className="field-label">Cantidad *</label>
                        <input className="field-input" type="number" min="0.001" step="0.001" autoFocus
                          value={formIngreso.cantidad}
                          onChange={e => setFormIngreso(p => ({ ...p, cantidad: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label className="field-label">Precio costo $ *</label>
                        <input className="field-input" type="number" min="0" step="0.01"
                          value={formIngreso.precio_costo}
                          onChange={e => setFormIngreso(p => ({ ...p, precio_costo: e.target.value }))} />
                      </div>
                      <div className="field">
                        <label className="field-label">Flete $</label>
                        <input className="field-input" type="number" min="0" step="0.01" placeholder="0"
                          value={formIngreso.flete}
                          onChange={e => setFormIngreso(p => ({ ...p, flete: e.target.value }))} />
                      </div>
                    </div>
                    {form.controla_lotes && (
                      <div className="field" style={{ maxWidth: 200 }}>
                        <label className="field-label">Fecha vencimiento</label>
                        <input className="field-input" type="date"
                          value={formIngreso.fecha_vencimiento}
                          onChange={e => setFormIngreso(p => ({ ...p, fecha_vencimiento: e.target.value }))} />
                      </div>
                    )}
                    {Number(formIngreso.flete) > 0 && Number(formIngreso.cantidad) > 0 && (
                      <p className="field-hint" style={{ color: 'var(--color-accent)' }}>
                        <i className="ti ti-truck-delivery" />
                        Costo efectivo por unidad:{' '}
                        <strong>
                          ${(Number(formIngreso.precio_costo || 0) + Number(formIngreso.flete) / Number(formIngreso.cantidad)).toFixed(2)}
                        </strong>
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button type="submit" className="btn btn--primary" disabled={savingIngreso}>
                        <i className={`ti ${savingIngreso ? 'ti-loader-2' : 'ti-check'}`} />
                        {savingIngreso ? 'Guardando...' : 'Registrar ingreso'}
                      </button>
                      <button type="button" className="btn" onClick={resetIngreso}>
                        <i className="ti ti-x" /> Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="panel-footer">
          <button type="button" className="btn" onClick={onCerrar}>
            <i className="ti ti-x" /> Cancelar
          </button>
          <button type="submit" form="producto-form" className="btn btn--primary" disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
            {saving ? 'Guardando...' : esNuevo ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </div>

    </div>
  )
}
