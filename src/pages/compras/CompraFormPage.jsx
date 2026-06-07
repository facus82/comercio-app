import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCompras } from '../../hooks/useCompras'
import { useProveedores } from '../../hooks/useProveedores'
import './CompraFormPage.css'

const TIPOS = [
  { value: 'factura',      label: 'Factura' },
  { value: 'factura_a',    label: 'Factura A' },
  { value: 'factura_b',    label: 'Factura B' },
  { value: 'factura_c',    label: 'Factura C' },
  { value: 'remito',       label: 'Remito' },
  { value: 'ticket',       label: 'Ticket' },
  { value: 'nota_credito', label: 'Nota de crédito' },
]

const ESTADOS = ['pendiente', 'pagada', 'parcial']
const UNIDADES = ['unidad', 'kg', 'lt', 'docena', 'caja', 'pack', 'metro', 'rollo']

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(v || 0)

const hoy = () => new Date().toISOString().slice(0, 10)

function itemVacio() {
  return {
    _key:            Math.random().toString(36).slice(2),
    producto_id:     '',
    producto_nombre: '',
    controla_lotes:  false,
    cantidad:        1,
    precio_unitario: '',
    iva_porcentaje:  21,
    descuento_pct:   0,
    subtotal:        0,
    fecha_vencimiento: '',
  }
}

function calcSubtotal(it) {
  const base = Number(it.cantidad) * Number(it.precio_unitario || 0)
  return +(base - base * (Number(it.descuento_pct) / 100)).toFixed(2)
}

export default function CompraFormPage() {
  const navigate    = useNavigate()
  const { perfil }  = useAuth()
  const comercioId  = perfil?.comercio?.id
  const { crear }   = useCompras(comercioId, perfil?.id)
  const { proveedores } = useProveedores(comercioId)

  // Quitar padding/overflow del app-content para tomar toda la altura
  useLayoutEffect(() => {
    const el = document.querySelector('.app-content')
    if (!el) return
    const prevPad = el.style.padding
    const prevOvf = el.style.overflow
    el.style.padding  = '0'
    el.style.overflow = 'hidden'
    return () => {
      el.style.padding  = prevPad
      el.style.overflow = prevOvf
    }
  }, [])

  // ── Form ──────────────────────────────────────────────────
  const [form, setForm] = useState({
    proveedor_id:       '',
    fecha:              hoy(),
    fecha_vencimiento:  '',
    tipo_comprobante:   'factura',
    numero_comprobante: '',
    estado:             'pendiente',
    notas:              '',
    flete:              '',
  })
  const [items,  setItems]  = useState([itemVacio()])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function setF(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  // ── Vencimiento expandible por fila ──────────────────────
  const [vtoExpandido, setVtoExpandido] = useState(new Set())

  function toggleVto(key) {
    setVtoExpandido(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        setItem(key, 'fecha_vencimiento', '')
      } else {
        next.add(key)
      }
      return next
    })
  }

  // ── Búsqueda de productos ─────────────────────────────────
  const [busqProd,    setBusqProd]    = useState('')
  const [resultados,  setResultados]  = useState([])
  const [buscandoKey, setBuscandoKey] = useState(null)
  const busqTimer = useRef(null)

  // ── Refs de inputs para navegación por teclado ────────────
  const searchRefs = useRef({})
  const qtyRefs    = useRef({})
  const priceRefs  = useRef({})

  // Auto-focus buscador de nueva fila
  useEffect(() => {
    const last = items[items.length - 1]
    if (last && !last.producto_id) {
      searchRefs.current[last._key]?.focus()
    }
  }, [items.length])

  // ── Items ─────────────────────────────────────────────────
  function setItem(key, campo, valor) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      const updated = { ...it, [campo]: valor }
      updated.subtotal = calcSubtotal(updated)
      return updated
    }))
  }

  function agregarItem() {
    setItems(prev => [...prev, itemVacio()])
  }

  function quitarItem(key) {
    setItems(prev => prev.filter(it => it._key !== key))
    setVtoExpandido(prev => { const s = new Set(prev); s.delete(key); return s })
  }

  // ── Búsqueda ──────────────────────────────────────────────
  function iniciarBusqueda(key, q) {
    setBuscandoKey(key)
    setBusqProd(q)
    clearTimeout(busqTimer.current)
    if (!q.trim()) { setResultados([]); return }
    busqTimer.current = setTimeout(() => buscarProductos(q), 280)
  }

  async function buscarProductos(q) {
    const { data } = await supabase
      .from('productos')
      .select('id, nombre, codigo, codigo_barras, precio_costo, iva_porcentaje, unidad_medida, controla_lotes')
      .eq('comercio_id', comercioId)
      .eq('activo', true)
      .or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%,codigo_barras.ilike.%${q}%`)
      .order('nombre')
      .limit(10)
    setResultados(data || [])
  }

  async function handleSearchKeyDown(e, key) {
    if (e.key === 'Escape') {
      setBuscandoKey(null)
      setResultados([])
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    clearTimeout(busqTimer.current)

    // Un solo resultado → seleccionar directo
    if (resultados.length === 1) {
      seleccionarProducto(key, resultados[0]); return
    }
    // Coincidencia exacta de código (scanner)
    const exact = resultados.find(p =>
      p.codigo_barras === busqProd || p.codigo === busqProd
    )
    if (exact) { seleccionarProducto(key, exact); return }

    // Lookup inmediato por código exacto (para scanner rápido)
    if (busqProd.trim()) {
      const { data } = await supabase
        .from('productos')
        .select('id, nombre, codigo, codigo_barras, precio_costo, iva_porcentaje, unidad_medida, controla_lotes')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .or(`codigo_barras.eq.${busqProd},codigo.eq.${busqProd}`)
        .limit(1)
      if (data?.length === 1) { seleccionarProducto(key, data[0]); return }
      await buscarProductos(busqProd)
    }
  }

  function seleccionarProducto(key, prod) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      const updated = {
        ...it,
        producto_id:     prod.id,
        producto_nombre: prod.nombre,
        controla_lotes:  prod.controla_lotes || false,
        precio_unitario: prod.precio_costo || '',
        iva_porcentaje:  prod.iva_porcentaje || 21,
      }
      updated.subtotal = calcSubtotal(updated)
      return updated
    }))
    setBusqProd('')
    setResultados([])
    setBuscandoKey(null)
    // Auto-expandir vto si el producto controla lotes
    if (prod.controla_lotes) {
      setVtoExpandido(prev => new Set(prev).add(key))
    }
    setTimeout(() => {
      qtyRefs.current[key]?.focus()
      qtyRefs.current[key]?.select()
    }, 30)
  }

  function limpiarProducto(key) {
    setItems(prev => prev.map(it =>
      it._key !== key ? it : { ...it, producto_id: '', producto_nombre: '', fecha_vencimiento: '' }
    ))
    setVtoExpandido(prev => { const s = new Set(prev); s.delete(key); return s })
    setBuscandoKey(key)
    setBusqProd('')
    setTimeout(() => searchRefs.current[key]?.focus(), 30)
  }

  // ── Modal nuevo producto ──────────────────────────────────
  const [modalProd,     setModalProd]     = useState(null)
  const [formNuevoProd, setFormNuevoProd] = useState({
    nombre: '', codigo_barras: '', unidad_medida: 'unidad',
    iva_porcentaje: 21, controla_stock: true, controla_lotes: false,
  })
  const [savingProd, setSavingProd] = useState(false)

  function abrirModalNuevo(key, nombre) {
    setFormNuevoProd({
      nombre, codigo_barras: '', unidad_medida: 'unidad',
      iva_porcentaje: 21, controla_stock: true, controla_lotes: false,
    })
    setModalProd({ key })
    setBuscandoKey(null)
    setResultados([])
  }

  async function crearProductoInline(e) {
    e.preventDefault()
    if (!formNuevoProd.nombre.trim()) return
    setSavingProd(true)
    const { data, error: err } = await supabase
      .from('productos')
      .insert({
        comercio_id:    comercioId,
        nombre:         formNuevoProd.nombre.trim(),
        codigo_barras:  formNuevoProd.codigo_barras.trim() || null,
        unidad_medida:  formNuevoProd.unidad_medida,
        iva_porcentaje: Number(formNuevoProd.iva_porcentaje),
        controla_stock: formNuevoProd.controla_stock,
        controla_lotes: formNuevoProd.controla_lotes,
        activo:         true,
        precio_costo:   0,
        precio_venta:   0,
      })
      .select('id, nombre, codigo, codigo_barras, precio_costo, iva_porcentaje, unidad_medida, controla_lotes')
      .single()
    if (!err && data) {
      seleccionarProducto(modalProd.key, data)
      setModalProd(null)
    }
    setSavingProd(false)
  }

  // ── Totales ───────────────────────────────────────────────
  const totales = useMemo(() => {
    const subtotal      = items.reduce((s, it) => s + Number(it.subtotal), 0)
    const ivaMonto      = items.reduce((s, it) =>
      s + Number(it.subtotal) * (Number(it.iva_porcentaje) / 100), 0)
    const fleteNum      = Number(form.flete) || 0
    const total         = subtotal + ivaMonto + fleteNum
    const totalUnidades = items.reduce((s, it) => s + Number(it.cantidad || 0), 0)
    const fletePorUnidad = totalUnidades > 0 && fleteNum > 0
      ? +(fleteNum / totalUnidades).toFixed(2) : 0
    return {
      subtotal:    +subtotal.toFixed(2),
      ivaMonto:    +ivaMonto.toFixed(2),
      fleteNum:    +fleteNum.toFixed(2),
      total:       +total.toFixed(2),
      totalUnidades,
      fletePorUnidad,
    }
  }, [items, form.flete])

  const itemsConProducto = useMemo(
    () => items.filter(it => it.producto_id),
    [items]
  )

  // ── Submit ────────────────────────────────────────────────
  async function handleSubmit() {
    if (!form.proveedor_id) { setError('Seleccioná un proveedor.'); return }
    const itemsValidos = items.filter(it => it.producto_id && Number(it.cantidad) > 0)
    if (itemsValidos.length === 0) {
      setError('Agregá al menos un producto con cantidad válida.')
      return
    }
    setSaving(true)
    setError('')
    const res = await crear({
      proveedor_id:       form.proveedor_id,
      fecha:              form.fecha,
      fecha_vencimiento:  form.fecha_vencimiento || null,
      tipo_comprobante:   form.tipo_comprobante,
      numero_comprobante: form.numero_comprobante.trim() || null,
      estado:             form.estado,
      notas:              form.notas.trim() || null,
      subtotal:           totales.subtotal,
      iva_monto:          totales.ivaMonto,
      flete:              totales.fleteNum,
      total:              totales.total,
      descuento_monto:    0,
    }, itemsValidos)
    setSaving(false)
    if (res.error) setError(res.error.message || 'Error al guardar.')
    else navigate('/compras')
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="cfp">

      {/* ── Barra superior ─────────────────────────────────── */}
      <div className="cfp-topbar">
        <button className="btn" onClick={() => navigate('/compras')}>
          <i className="ti ti-arrow-left" /> Volver
        </button>
        <h1 className="cfp-title">
          <i className="ti ti-shopping-cart" />
          Nueva compra
        </h1>
        <div className="cfp-topbar-right">
          {error && (
            <span className="cfp-error-msg">
              <i className="ti ti-alert-circle" /> {error}
            </span>
          )}
          <button className="btn btn--primary" onClick={handleSubmit} disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
            {saving ? 'Guardando...' : 'Registrar compra'}
          </button>
        </div>
      </div>

      {/* ── Cabecera de la compra ───────────────────────────── */}
      <div className="cfp-header">
        <div className="cfp-header-grid">
          <div className="field cfp-prov-field">
            <label className="field-label">Proveedor *</label>
            <select className="field-select" value={form.proveedor_id}
              onChange={e => setF('proveedor_id', e.target.value)}>
              <option value="">Seleccionar proveedor...</option>
              {proveedores.filter(p => p.activo).map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre_fantasia || p.razon_social}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label">Tipo</label>
            <select className="field-select" value={form.tipo_comprobante}
              onChange={e => setF('tipo_comprobante', e.target.value)}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="field-label">N° comprobante</label>
            <input className="field-input" placeholder="0001-00012345"
              value={form.numero_comprobante}
              onChange={e => setF('numero_comprobante', e.target.value)} />
          </div>

          <div className="field">
            <label className="field-label">Fecha *</label>
            <input className="field-input" type="date"
              value={form.fecha} onChange={e => setF('fecha', e.target.value)} />
          </div>

          <div className="field">
            <label className="field-label">Vto. pago</label>
            <input className="field-input" type="date"
              value={form.fecha_vencimiento}
              onChange={e => setF('fecha_vencimiento', e.target.value)} />
          </div>

          <div className="field">
            <label className="field-label">Estado</label>
            <select className="field-select" value={form.estado}
              onChange={e => setF('estado', e.target.value)}>
              {ESTADOS.map(est => (
                <option key={est} value={est}>
                  {est.charAt(0).toUpperCase() + est.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="field cfp-flete-field">
            <label className="field-label">
              Flete $
              {totales.fletePorUnidad > 0 && (
                <span className="cfp-flete-hint">
                  = {fmt$(totales.fletePorUnidad)}/u
                </span>
              )}
            </label>
            <input className="field-input" type="number" min="0" step="0.01" placeholder="0"
              value={form.flete} onChange={e => setF('flete', e.target.value)} />
          </div>

          <div className="field cfp-notas-field">
            <label className="field-label">Notas</label>
            <input className="field-input" placeholder="Notas opcionales..."
              value={form.notas} onChange={e => setF('notas', e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Tabla de productos ──────────────────────────────── */}
      <div className="cfp-items-wrap">
        <div className="cfp-items-inner">

          {/* Encabezado de columnas */}
          <div className="cfp-row cfp-row-head">
            <span className="cfp-col-prod">Producto</span>
            <span className="cfp-col-qty">Cant.</span>
            <span className="cfp-col-price">Precio unit.</span>
            <span className="cfp-col-iva">IVA %</span>
            <span className="cfp-col-desc">Desc. %</span>
            <span className="cfp-col-sub">Subtotal</span>
            <span className="cfp-col-vto-btn" title="Fecha vencimiento">Vto.</span>
            <span className="cfp-col-del" />
          </div>

          {/* Filas */}
          {items.map((it, idx) => {
            const isLast    = idx === items.length - 1
            const showDrop  = buscandoKey === it._key && (resultados.length > 0 || busqProd.trim().length > 0)
            const vtoVisible = vtoExpandido.has(it._key)

            return (
              <div key={it._key} className="cfp-item-wrap">
              <div className="cfp-row cfp-row-item">

                {/* Producto */}
                <div className="cfp-col-prod cfp-prod-cell">
                  {it.producto_id ? (
                    <button
                      type="button"
                      className="cfp-prod-selected"
                      onClick={() => limpiarProducto(it._key)}
                      title="Cambiar producto"
                    >
                      <span className="cfp-prod-nombre">{it.producto_nombre}</span>
                      <i className="ti ti-x cfp-prod-clear" />
                    </button>
                  ) : (
                    <>
                      <input
                        ref={el => { searchRefs.current[it._key] = el }}
                        className="field-input"
                        placeholder="Buscar o escanear..."
                        value={buscandoKey === it._key ? busqProd : ''}
                        onFocus={() => setBuscandoKey(it._key)}
                        onChange={e => iniciarBusqueda(it._key, e.target.value)}
                        onKeyDown={e => handleSearchKeyDown(e, it._key)}
                      />
                      {showDrop && (
                        <div className="prod-dropdown">
                          {resultados.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="prod-dropdown-item"
                              onMouseDown={() => seleccionarProducto(it._key, p)}
                            >
                              <span className="prod-dd-nombre">{p.nombre}</span>
                              <span className="prod-dd-codigo td-muted">
                                {p.codigo_barras || p.codigo || ''}
                              </span>
                              <span className="prod-dd-precio">{fmt$(p.precio_costo)}</span>
                            </button>
                          ))}
                          {busqProd.trim() && (
                            <button
                              type="button"
                              className="prod-dropdown-item cfp-dd-crear"
                              onMouseDown={() => abrirModalNuevo(it._key, busqProd)}
                            >
                              <i className="ti ti-plus" />
                              <span>Crear &ldquo;{busqProd}&rdquo; como nuevo producto</span>
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Cantidad */}
                <input
                  ref={el => { qtyRefs.current[it._key] = el }}
                  className="field-input cfp-col-qty cfp-num"
                  type="number" min="0.001" step="0.001"
                  value={it.cantidad}
                  onChange={e => setItem(it._key, 'cantidad', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      priceRefs.current[it._key]?.focus()
                      priceRefs.current[it._key]?.select()
                    }
                  }}
                />

                {/* Precio */}
                <input
                  ref={el => { priceRefs.current[it._key] = el }}
                  className="field-input cfp-col-price cfp-num"
                  type="number" min="0" step="0.01" placeholder="0"
                  value={it.precio_unitario}
                  onChange={e => setItem(it._key, 'precio_unitario', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && isLast) {
                      e.preventDefault()
                      agregarItem()
                    }
                  }}
                />

                {/* IVA */}
                <input
                  className="field-input cfp-col-iva cfp-num"
                  type="number" min="0" step="0.5"
                  value={it.iva_porcentaje}
                  onChange={e => setItem(it._key, 'iva_porcentaje', e.target.value)}
                />

                {/* Descuento */}
                <input
                  className="field-input cfp-col-desc cfp-num"
                  type="number" min="0" max="100" step="0.1"
                  value={it.descuento_pct}
                  onChange={e => setItem(it._key, 'descuento_pct', e.target.value)}
                />

                {/* Subtotal */}
                <span className="cfp-col-sub cfp-subtotal">
                  {fmt$(it.subtotal)}
                </span>

                {/* Botón fecha vencimiento */}
                <button
                  type="button"
                  className={`btn-icon cfp-col-vto-btn${vtoVisible ? ' cfp-vto-btn--active' : ''}`}
                  title={vtoVisible ? 'Ocultar fecha vencimiento' : 'Agregar fecha vencimiento'}
                  onClick={() => toggleVto(it._key)}
                >
                  <i className="ti ti-calendar-event" />
                </button>

                {/* Eliminar */}
                <button
                  type="button"
                  className="btn-icon btn-icon--danger cfp-col-del"
                  onClick={() => items.length > 1 && quitarItem(it._key)}
                  disabled={items.length === 1}
                  title="Quitar fila"
                >
                  <i className="ti ti-trash" />
                </button>
              </div>

              {/* Sub-fila de fecha vencimiento */}
              {vtoVisible && (
                <div className="cfp-vto-subrow">
                  <i className="ti ti-calendar-check cfp-vto-icon" />
                  <span className="cfp-vto-label">Fecha vencimiento</span>
                  <input
                    className="field-input cfp-vto-input"
                    type="date"
                    autoFocus
                    value={it.fecha_vencimiento}
                    onChange={e => setItem(it._key, 'fecha_vencimiento', e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Tab' && !e.shiftKey && isLast) {
                        e.preventDefault()
                        agregarItem()
                      }
                    }}
                  />
                </div>
              )}
            </div>
            )
          })}

          {/* Botón agregar */}
          <div className="cfp-add-row">
            <button type="button" className="btn" onClick={agregarItem}>
              <i className="ti ti-plus" /> Agregar fila
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer con totales ──────────────────────────────── */}
      <div className="cfp-footer">
        <span className="cfp-count">
          {itemsConProducto.length} producto{itemsConProducto.length !== 1 ? 's' : ''}
        </span>
        <div className="cfp-totales">
          <div className="cfp-total-item">
            <span>Subtotal</span>
            <strong>{fmt$(totales.subtotal)}</strong>
          </div>
          <div className="cfp-total-item">
            <span>IVA</span>
            <strong>{fmt$(totales.ivaMonto)}</strong>
          </div>
          {totales.fleteNum > 0 && (
            <div className="cfp-total-item">
              <span>Flete</span>
              <strong>{fmt$(totales.fleteNum)}</strong>
            </div>
          )}
          <div className="cfp-total-item cfp-total-final">
            <span>TOTAL</span>
            <strong>{fmt$(totales.total)}</strong>
          </div>
        </div>
      </div>

      {/* ── Modal: nuevo producto ───────────────────────────── */}
      {modalProd && (
        <>
          <div className="cfp-modal-backdrop" onClick={() => setModalProd(null)} />
          <div className="cfp-modal">
            <div className="cfp-modal-header">
              <h3 className="cfp-modal-title">
                <i className="ti ti-package" /> Nuevo producto
              </h3>
              <button className="btn-icon" onClick={() => setModalProd(null)}>
                <i className="ti ti-x" />
              </button>
            </div>
            <form className="cfp-modal-body" onSubmit={crearProductoInline}>
              <div className="field">
                <label className="field-label">Nombre *</label>
                <input
                  className="field-input"
                  autoFocus
                  required
                  value={formNuevoProd.nombre}
                  onChange={e => setFormNuevoProd(p => ({ ...p, nombre: e.target.value }))}
                />
              </div>
              <div className="cfp-modal-grid">
                <div className="field">
                  <label className="field-label">Código / barras</label>
                  <input
                    className="field-input"
                    placeholder="opcional"
                    value={formNuevoProd.codigo_barras}
                    onChange={e => setFormNuevoProd(p => ({ ...p, codigo_barras: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label className="field-label">Unidad</label>
                  <select className="field-select" value={formNuevoProd.unidad_medida}
                    onChange={e => setFormNuevoProd(p => ({ ...p, unidad_medida: e.target.value }))}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">IVA %</label>
                  <input
                    className="field-input"
                    type="number" min="0" step="0.5"
                    value={formNuevoProd.iva_porcentaje}
                    onChange={e => setFormNuevoProd(p => ({ ...p, iva_porcentaje: e.target.value }))}
                  />
                </div>
              </div>
              <div className="cfp-modal-checks">
                <label className="cfp-check-label">
                  <input type="checkbox" checked={formNuevoProd.controla_stock}
                    onChange={e => setFormNuevoProd(p => ({ ...p, controla_stock: e.target.checked }))} />
                  Controla stock
                </label>
                <label className="cfp-check-label">
                  <input type="checkbox" checked={formNuevoProd.controla_lotes}
                    onChange={e => setFormNuevoProd(p => ({ ...p, controla_lotes: e.target.checked }))} />
                  Controla lotes / vencimiento
                </label>
              </div>
              <p className="cfp-modal-hint">
                <i className="ti ti-info-circle" />
                El precio de costo se completará desde esta compra.
              </p>
              <div className="cfp-modal-footer">
                <button type="button" className="btn" onClick={() => setModalProd(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary" disabled={savingProd}>
                  <i className={`ti ${savingProd ? 'ti-loader-2' : 'ti-check'}`} />
                  {savingProd ? 'Creando...' : 'Crear y agregar'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
