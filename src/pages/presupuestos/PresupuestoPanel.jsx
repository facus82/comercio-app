import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(v || 0)

const hoy = () => new Date().toISOString().slice(0, 10)

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function itemVacio() {
  return {
    _key:           Math.random().toString(36).slice(2),
    producto_id:    '',
    descripcion:    '',
    cantidad:       1,
    precio_unitario: '',
    descuento_pct:  0,
    subtotal:       0,
  }
}

function calcSub(it) {
  const base = Number(it.cantidad) * Number(it.precio_unitario || 0)
  return +(base - base * (Number(it.descuento_pct) / 100)).toFixed(2)
}

export default function PresupuestoPanel({ clientes, comercioId, onCrear, onCerrar }) {
  const [form, setForm] = useState({
    cliente_id:       '',
    cliente_nombre:   '',
    fecha:            hoy(),
    fecha_vencimiento: addDays(hoy(), 15),
    notas:            '',
  })
  const [items,  setItems]  = useState([itemVacio()])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [busqProd,    setBusqProd]    = useState('')
  const [resultados,  setResultados]  = useState([])
  const [buscandoIdx, setBuscandoIdx] = useState(null)
  const busqTimer = useRef(null)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  function setF(c, v) { setForm(prev => ({ ...prev, [c]: v })) }

  function setItem(idx, campo, valor) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const up = { ...it, [campo]: valor }
      up.subtotal = calcSub(up)
      return up
    }))
  }

  function seleccionarProducto(idx, prod) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const up = { ...it, producto_id: prod.id, descripcion: prod.nombre, precio_unitario: prod.precio_venta || '' }
      up.subtotal = calcSub(up)
      return up
    }))
    setBusqProd(''); setResultados([]); setBuscandoIdx(null)
  }

  function iniciarBusqueda(idx, q) {
    setBuscandoIdx(idx); setBusqProd(q)
    clearTimeout(busqTimer.current)
    if (!q.trim()) { setResultados([]); return }
    busqTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('productos')
        .select('id, nombre, precio_venta, unidad_medida')
        .eq('comercio_id', comercioId).eq('activo', true)
        .or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`)
        .order('nombre').limit(8)
      setResultados(data || [])
    }, 280)
  }

  const totales = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + Number(it.subtotal), 0)
    const descuento = 0
    return { subtotal: +subtotal.toFixed(2), descuento, total: +(subtotal - descuento).toFixed(2) }
  }, [items])

  async function handleSubmit(e) {
    e.preventDefault()
    const itemsValidos = items.filter(it => it.descripcion.trim() && Number(it.cantidad) > 0)
    if (itemsValidos.length === 0) { setError('Agregá al menos un ítem.'); return }
    setSaving(true); setError('')

    const datos = {
      cliente_id:       form.cliente_id      || null,
      cliente_nombre:   form.cliente_nombre.trim() || null,
      fecha:            form.fecha,
      fecha_vencimiento: form.fecha_vencimiento || null,
      subtotal:         totales.subtotal,
      descuento_monto:  totales.descuento,
      total:            totales.total,
      estado:           'pendiente',
      notas:            form.notas.trim()    || null,
    }

    const res = await onCrear(datos, itemsValidos)
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
            <i className="ti ti-file-description" style={{ marginRight: 6, fontSize: 15 }} />
            Nuevo presupuesto
          </h2>
          <button className="btn-icon" onClick={onCerrar}><i className="ti ti-x" /></button>
        </div>

        <form id="pres-form" className="panel-body" onSubmit={handleSubmit}>
          {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}

          <div className="form-section">
            <p className="form-section-title">Datos</p>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Cliente</label>
                <select className="field-select" value={form.cliente_id}
                  onChange={e => {
                    const c = clientes.find(c => c.id === e.target.value)
                    setF('cliente_id', e.target.value)
                    setF('cliente_nombre', c ? `${c.nombre} ${c.apellido || ''}`.trim() : '')
                  }}>
                  <option value="">Sin cliente</option>
                  {clientes.filter(c => c.activo).map(c => (
                    <option key={c.id} value={c.id}>{c.nombre} {c.apellido || ''}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Nombre (manual)</label>
                <input className="field-input" placeholder="Si no está en la lista..."
                  value={form.cliente_nombre}
                  onChange={e => { setF('cliente_nombre', e.target.value); setF('cliente_id', '') }} />
              </div>
              <div className="field">
                <label className="field-label">Fecha</label>
                <input className="field-input" type="date" value={form.fecha}
                  onChange={e => setF('fecha', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Válido hasta</label>
                <input className="field-input" type="date" value={form.fecha_vencimiento}
                  onChange={e => setF('fecha_vencimiento', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Items — reutilizando los estilos de compras */}
          <div className="form-section">
            <p className="form-section-title">Ítems</p>
            <div className="compra-items-table">
              <div className="pres-items-head">
                <span>Descripción</span>
                <span className="ci-qty">Cant.</span>
                <span className="ci-price">Precio unit.</span>
                <span className="ci-desc">Desc. %</span>
                <span className="ci-sub">Subtotal</span>
                <span />
              </div>
              {items.map((it, idx) => (
                <div key={it._key} className="pres-item-row">
                  <div style={{ position: 'relative' }}>
                    {it.descripcion && it.producto_id ? (
                      <div className="ci-prod-selected" onClick={() => {
                        setItem(idx, 'producto_id', ''); setItem(idx, 'descripcion', ''); setBuscandoIdx(idx); setBusqProd('')
                      }}>
                        <span className="ci-prod-nombre">{it.descripcion}</span>
                        <i className="ti ti-x ci-prod-clear" />
                      </div>
                    ) : (
                      <>
                        <input
                          className="field-input"
                          placeholder="Buscar o escribir descripción..."
                          value={buscandoIdx === idx ? busqProd : it.descripcion}
                          onFocus={() => setBuscandoIdx(idx)}
                          onChange={e => {
                            iniciarBusqueda(idx, e.target.value)
                            setItem(idx, 'descripcion', e.target.value)
                          }}
                        />
                        {buscandoIdx === idx && resultados.length > 0 && (
                          <div className="prod-dropdown">
                            {resultados.map(p => (
                              <button key={p.id} type="button" className="prod-dropdown-item"
                                onMouseDown={() => seleccionarProducto(idx, p)}>
                                <span className="prod-dd-nombre">{p.nombre}</span>
                                <span className="prod-dd-precio">{fmt$(p.precio_venta)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <input className="field-input ci-qty" type="number" min="0.001" step="0.001"
                    value={it.cantidad} onChange={e => setItem(idx, 'cantidad', e.target.value)} />
                  <input className="field-input ci-price" type="number" min="0" step="0.01" placeholder="0"
                    value={it.precio_unitario} onChange={e => setItem(idx, 'precio_unitario', e.target.value)} />
                  <input className="field-input ci-desc" type="number" min="0" max="100" step="0.1"
                    value={it.descuento_pct} onChange={e => setItem(idx, 'descuento_pct', e.target.value)} />
                  <span className="ci-sub ci-sub-val">{fmt$(it.subtotal)}</span>
                  <button type="button" className="btn-icon btn-icon--danger"
                    onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                    disabled={items.length === 1}>
                    <i className="ti ti-trash" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }}
              onClick={() => setItems(prev => [...prev, itemVacio()])}>
              <i className="ti ti-plus" /> Agregar ítem
            </button>
          </div>

          <div className="form-section compra-totales">
            <div className="compra-total-row"><span>Subtotal</span><span>{fmt$(totales.subtotal)}</span></div>
            <div className="compra-total-row compra-total-row--total"><span>Total</span><span>{fmt$(totales.total)}</span></div>
          </div>

          <div className="form-section">
            <p className="form-section-title">Notas</p>
            <textarea className="field-textarea" rows={2} placeholder="Condiciones, observaciones..."
              value={form.notas} onChange={e => setF('notas', e.target.value)} />
          </div>
        </form>

        <div className="panel-footer">
          <button type="button" className="btn" onClick={onCerrar}><i className="ti ti-x" /> Cancelar</button>
          <button type="submit" form="pres-form" className="btn btn--primary" disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
            {saving ? 'Guardando...' : 'Crear presupuesto'}
          </button>
        </div>
      </aside>
    </>
  )
}
