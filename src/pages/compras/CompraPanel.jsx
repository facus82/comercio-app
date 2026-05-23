import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import './Compras.css'

const TIPOS_COMPROBANTE = [
  { value: 'factura',      label: 'Factura' },
  { value: 'factura_a',    label: 'Factura A' },
  { value: 'factura_b',    label: 'Factura B' },
  { value: 'factura_c',    label: 'Factura C' },
  { value: 'remito',       label: 'Remito' },
  { value: 'ticket',       label: 'Ticket' },
  { value: 'nota_credito', label: 'Nota de crédito' },
]

const ESTADOS = ['pendiente', 'pagada', 'parcial']

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(v || 0)

const hoy = () => new Date().toISOString().slice(0, 10)

function itemVacio() {
  return {
    _key:           Math.random().toString(36).slice(2),
    producto_id:    '',
    producto_nombre: '',
    cantidad:       1,
    precio_unitario: '',
    iva_porcentaje: 21,
    descuento_pct:  0,
    subtotal:       0,
  }
}

function calcSubtotal(it) {
  const base = Number(it.cantidad) * Number(it.precio_unitario || 0)
  const desc = base * (Number(it.descuento_pct) / 100)
  return +(base - desc).toFixed(2)
}

export default function CompraPanel({ proveedores, comercioId, onCrear, onCerrar }) {
  const [form, setForm] = useState({
    proveedor_id:       '',
    fecha:              hoy(),
    fecha_vencimiento:  '',
    tipo_comprobante:   'factura',
    numero_comprobante: '',
    estado:             'pendiente',
    notas:              '',
  })
  const [items,   setItems]   = useState([itemVacio()])
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  // Buscador de productos
  const [busqProd, setBusqProd]     = useState('')
  const [resultados, setResultados] = useState([])
  const [buscandoIdx, setBuscandoIdx] = useState(null) // índice del item que está buscando
  const busqTimer = useRef(null)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  function setF(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  // ── Items ──────────────────────────────────────────────────
  function setItem(idx, campo, valor) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [campo]: valor }
      updated.subtotal = calcSubtotal(updated)
      return updated
    }))
  }

  function agregarItem() {
    setItems(prev => [...prev, itemVacio()])
  }

  function quitarItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function seleccionarProducto(idx, prod) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = {
        ...it,
        producto_id:     prod.id,
        producto_nombre: prod.nombre,
        precio_unitario: prod.precio_costo || '',
        iva_porcentaje:  prod.iva_porcentaje || 21,
      }
      updated.subtotal = calcSubtotal(updated)
      return updated
    }))
    setBusqProd('')
    setResultados([])
    setBuscandoIdx(null)
  }

  function iniciarBusqueda(idx, q) {
    setBuscandoIdx(idx)
    setBusqProd(q)
    clearTimeout(busqTimer.current)
    if (!q.trim()) { setResultados([]); return }
    busqTimer.current = setTimeout(() => buscarProductos(q), 280)
  }

  async function buscarProductos(q) {
    const { data } = await supabase
      .from('productos')
      .select('id, nombre, codigo, codigo_barras, precio_costo, iva_porcentaje, unidad_medida')
      .eq('comercio_id', comercioId)
      .eq('activo', true)
      .or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%,codigo_barras.ilike.%${q}%`)
      .order('nombre')
      .limit(8)
    setResultados(data || [])
  }

  // ── Totales ────────────────────────────────────────────────
  const totales = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + Number(it.subtotal), 0)
    const ivaMonto = items.reduce((s, it) => {
      const base = Number(it.subtotal)
      return s + base * (Number(it.iva_porcentaje) / 100)
    }, 0)
    const total = subtotal + ivaMonto
    return {
      subtotal: +subtotal.toFixed(2),
      ivaMonto: +ivaMonto.toFixed(2),
      total:    +total.toFixed(2),
    }
  }, [items])

  // ── Submit ─────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.proveedor_id) { setError('Seleccioná un proveedor.'); return }

    const itemsValidos = items.filter(it => it.producto_id && Number(it.cantidad) > 0)
    if (itemsValidos.length === 0) {
      setError('Agregá al menos un producto con cantidad válida.')
      return
    }

    setSaving(true); setError('')

    const datosCompra = {
      proveedor_id:       form.proveedor_id,
      fecha:              form.fecha,
      fecha_vencimiento:  form.fecha_vencimiento || null,
      tipo_comprobante:   form.tipo_comprobante,
      numero_comprobante: form.numero_comprobante.trim() || null,
      estado:             form.estado,
      notas:              form.notas.trim() || null,
      subtotal:           totales.subtotal,
      iva_monto:          totales.ivaMonto,
      total:              totales.total,
      descuento_monto:    0,
    }

    const res = await onCrear(datosCompra, itemsValidos)
    setSaving(false)
    if (res.error) setError(res.error.message || 'Error al guardar.')
    else onCerrar()
  }

  return (
    <>
      <div className="panel-backdrop" onClick={onCerrar} />
      <aside className="panel panel--wide">
        <div className="panel-header">
          <h2 className="panel-title">
            <i className="ti ti-shopping-cart" style={{ marginRight: 6, fontSize: 15 }} />
            Nueva compra
          </h2>
          <button className="btn-icon" onClick={onCerrar} title="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>

        <form id="compra-form" className="panel-body" onSubmit={handleSubmit}>
          {error && (
            <div className="error-banner">
              <i className="ti ti-alert-circle" /> {error}
            </div>
          )}

          {/* Datos de la compra */}
          <div className="form-section">
            <p className="form-section-title">Datos de la compra</p>
            <div className="field">
              <label className="field-label">Proveedor *</label>
              <select className="field-select" value={form.proveedor_id}
                onChange={e => setF('proveedor_id', e.target.value)} required>
                <option value="">Seleccionar proveedor...</option>
                {proveedores.filter(p => p.activo).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre_fantasia || p.razon_social}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-grid form-grid--3">
              <div className="field">
                <label className="field-label">Fecha *</label>
                <input className="field-input" type="date"
                  value={form.fecha} onChange={e => setF('fecha', e.target.value)} required />
              </div>
              <div className="field">
                <label className="field-label">Vencimiento pago</label>
                <input className="field-input" type="date"
                  value={form.fecha_vencimiento} onChange={e => setF('fecha_vencimiento', e.target.value)} />
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
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Tipo comprobante</label>
                <select className="field-select" value={form.tipo_comprobante}
                  onChange={e => setF('tipo_comprobante', e.target.value)}>
                  {TIPOS_COMPROBANTE.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">N° comprobante</label>
                <input className="field-input" placeholder="0001-00012345"
                  value={form.numero_comprobante} onChange={e => setF('numero_comprobante', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="form-section">
            <p className="form-section-title">Productos</p>

            <div className="compra-items-table">
              <div className="compra-items-head">
                <span>Producto</span>
                <span className="ci-qty">Cant.</span>
                <span className="ci-price">Precio unit.</span>
                <span className="ci-iva">IVA %</span>
                <span className="ci-desc">Desc. %</span>
                <span className="ci-sub">Subtotal</span>
                <span />
              </div>

              {items.map((it, idx) => (
                <div key={it._key} className="compra-item-row">
                  {/* Producto */}
                  <div className="ci-prod" style={{ position: 'relative' }}>
                    {it.producto_id ? (
                      <div className="ci-prod-selected" onClick={() => {
                        setItem(idx, 'producto_id', '')
                        setItem(idx, 'producto_nombre', '')
                        setBuscandoIdx(idx)
                        setBusqProd('')
                      }}>
                        <span className="ci-prod-nombre">{it.producto_nombre}</span>
                        <i className="ti ti-x ci-prod-clear" />
                      </div>
                    ) : (
                      <>
                        <input
                          className="field-input"
                          placeholder="Buscar producto..."
                          value={buscandoIdx === idx ? busqProd : ''}
                          onFocus={() => setBuscandoIdx(idx)}
                          onChange={e => iniciarBusqueda(idx, e.target.value)}
                          autoFocus={idx === items.length - 1 && !it.producto_id}
                        />
                        {buscandoIdx === idx && resultados.length > 0 && (
                          <div className="prod-dropdown">
                            {resultados.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                className="prod-dropdown-item"
                                onMouseDown={() => seleccionarProducto(idx, p)}
                              >
                                <span className="prod-dd-nombre">{p.nombre}</span>
                                <span className="prod-dd-codigo td-muted">
                                  {p.codigo || p.codigo_barras || ''}
                                </span>
                                <span className="prod-dd-precio">{fmt$(p.precio_costo)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <input
                    className="field-input ci-qty"
                    type="number" min="0.001" step="0.001"
                    value={it.cantidad}
                    onChange={e => setItem(idx, 'cantidad', e.target.value)}
                  />
                  <input
                    className="field-input ci-price"
                    type="number" min="0" step="0.01" placeholder="0"
                    value={it.precio_unitario}
                    onChange={e => setItem(idx, 'precio_unitario', e.target.value)}
                  />
                  <input
                    className="field-input ci-iva"
                    type="number" min="0" step="0.5"
                    value={it.iva_porcentaje}
                    onChange={e => setItem(idx, 'iva_porcentaje', e.target.value)}
                  />
                  <input
                    className="field-input ci-desc"
                    type="number" min="0" max="100" step="0.1"
                    value={it.descuento_pct}
                    onChange={e => setItem(idx, 'descuento_pct', e.target.value)}
                  />
                  <span className="ci-sub ci-sub-val">{fmt$(it.subtotal)}</span>
                  <button
                    type="button"
                    className="btn-icon btn-icon--danger"
                    onClick={() => quitarItem(idx)}
                    disabled={items.length === 1}
                    title="Quitar"
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              ))}
            </div>

            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={agregarItem}>
              <i className="ti ti-plus" /> Agregar producto
            </button>
          </div>

          {/* Totales */}
          <div className="form-section compra-totales">
            <div className="compra-total-row">
              <span>Subtotal</span>
              <span>{fmt$(totales.subtotal)}</span>
            </div>
            <div className="compra-total-row">
              <span>IVA</span>
              <span>{fmt$(totales.ivaMonto)}</span>
            </div>
            <div className="compra-total-row compra-total-row--total">
              <span>Total</span>
              <span>{fmt$(totales.total)}</span>
            </div>
          </div>

          {/* Notas */}
          <div className="form-section">
            <p className="form-section-title">Notas</p>
            <textarea className="field-textarea" rows={2} placeholder="Notas opcionales..."
              value={form.notas} onChange={e => setF('notas', e.target.value)} />
          </div>
        </form>

        <div className="panel-footer">
          <button type="button" className="btn" onClick={onCerrar}>
            <i className="ti ti-x" /> Cancelar
          </button>
          <button type="submit" form="compra-form" className="btn btn--primary" disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
            {saving ? 'Guardando...' : 'Registrar compra'}
          </button>
        </div>
      </aside>
    </>
  )
}
