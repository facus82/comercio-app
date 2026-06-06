import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import './PromocionesModal.css'

const MEDIOS_PAGO_OPTS = [
  { value: '',                label: 'Todos los medios'  },
  { value: 'efectivo',        label: 'Efectivo'          },
  { value: 'tarjeta_debito',  label: 'Débito'            },
  { value: 'tarjeta_credito', label: 'Crédito'           },
  { value: 'transferencia',   label: 'Transferencia'     },
  { value: 'mercado_pago',    label: 'Mercado Pago'      },
  { value: 'cuenta_corriente',label: 'Cta. Cte.'         },
]

const APLICA_OPS = [
  { value: 'todo',         label: 'Todo el catálogo' },
  { value: 'categoria',    label: 'Categoría'        },
  { value: 'subcategoria', label: 'Subcategoría'     },
  { value: 'producto',     label: 'Producto'         },
]

function fmtFecha(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function formVacio() {
  return {
    nombre: '', tipo: 'descuento_pct', activo: true,
    fecha_desde: '', fecha_hasta: '', combina: true,
    descuento_pct: '', medio_pago: '',
    cantidad_lleva: '2', cantidad_paga: '1',
    aplica_a: 'todo',
    categoria_id: '', subcategoria_id: '',
    producto_id: '', producto_nombre: '',
  }
}

export default function PromocionesModal({ comercioId, categorias, subcategorias, onCerrar }) {
  const [promos,      setPromos]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [form,        setForm]        = useState(formVacio())
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [busqProd,    setBusqProd]    = useState('')
  const [resultsProd, setResultsProd] = useState([])
  const busqTimer = useRef(null)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  useEffect(() => { if (comercioId) cargar() }, [comercioId])

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('promociones')
      .select('*, categoria:categorias(nombre), subcategoria:subcategorias(nombre), producto:productos(nombre)')
      .eq('comercio_id', comercioId)
      .order('activo', { ascending: false })
      .order('created_at', { ascending: false })
    setPromos(data || [])
    setLoading(false)
  }

  function setF(k, v) {
    setForm(prev => {
      const next = { ...prev, [k]: v }
      if (k === 'aplica_a') {
        next.categoria_id = ''; next.subcategoria_id = ''
        next.producto_id = ''; next.producto_nombre = ''
        setBusqProd('')
      }
      if (k === 'categoria_id') next.subcategoria_id = ''
      return next
    })
  }

  function cancelarForm() {
    setForm(formVacio()); setEditId(null); setShowForm(false)
    setError(''); setBusqProd(''); setResultsProd([])
  }

  function iniciarEdicion(p) {
    setForm({
      nombre: p.nombre, tipo: p.tipo, activo: p.activo,
      fecha_desde: p.fecha_desde || '', fecha_hasta: p.fecha_hasta || '',
      combina: p.combina,
      descuento_pct: p.descuento_pct ?? '', medio_pago: p.medio_pago || '',
      cantidad_lleva: String(p.cantidad_lleva ?? 2), cantidad_paga: String(p.cantidad_paga ?? 1),
      aplica_a: p.aplica_a,
      categoria_id: p.categoria_id || '', subcategoria_id: p.subcategoria_id || '',
      producto_id: p.producto_id || '', producto_nombre: p.producto?.nombre || '',
    })
    setBusqProd(p.producto?.nombre || '')
    setEditId(p.id); setShowForm(true); setError('')
  }

  function buscarProd(q) {
    setBusqProd(q); setF('producto_nombre', q); setF('producto_id', '')
    clearTimeout(busqTimer.current)
    if (!q.trim()) { setResultsProd([]); return }
    busqTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('productos').select('id, nombre, codigo')
        .eq('comercio_id', comercioId).eq('activo', true)
        .ilike('nombre', `%${q}%`).order('nombre').limit(6)
      setResultsProd(data || [])
    }, 250)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim())                                           { setError('El nombre es obligatorio.'); return }
    if (form.tipo === 'descuento_pct' && !Number(form.descuento_pct)) { setError('Ingresá el % de descuento.'); return }
    if (form.tipo === 'nxm' && Number(form.cantidad_paga) >= Number(form.cantidad_lleva)) {
      setError('"Paga" debe ser menor que "Lleva".'); return
    }
    if (form.aplica_a === 'categoria'    && !form.categoria_id)    { setError('Seleccioná una categoría.'); return }
    if (form.aplica_a === 'subcategoria' && !form.subcategoria_id) { setError('Seleccioná una subcategoría.'); return }
    if (form.aplica_a === 'producto'     && !form.producto_id)     { setError('Seleccioná un producto.'); return }

    setSaving(true); setError('')
    const datos = {
      nombre: form.nombre.trim(), tipo: form.tipo, activo: form.activo,
      fecha_desde: form.fecha_desde || null, fecha_hasta: form.fecha_hasta || null,
      combina: form.combina,
      descuento_pct:   form.tipo === 'descuento_pct' ? Number(form.descuento_pct) : null,
      medio_pago:      form.tipo === 'descuento_pct' && form.medio_pago ? form.medio_pago : null,
      cantidad_lleva:  form.tipo === 'nxm' ? Number(form.cantidad_lleva) : null,
      cantidad_paga:   form.tipo === 'nxm' ? Number(form.cantidad_paga)  : null,
      aplica_a: form.aplica_a,
      categoria_id:    form.aplica_a === 'categoria'    ? form.categoria_id    : null,
      subcategoria_id: form.aplica_a === 'subcategoria' ? form.subcategoria_id : null,
      producto_id:     form.aplica_a === 'producto'     ? form.producto_id     : null,
    }

    const sel = '*, categoria:categorias(nombre), subcategoria:subcategorias(nombre), producto:productos(nombre)'
    if (editId) {
      const { data, error: err } = await supabase.from('promociones').update(datos)
        .eq('id', editId).select(sel).single()
      if (err) { setError(err.message); setSaving(false); return }
      setPromos(prev => prev.map(p => p.id === editId ? data : p))
    } else {
      const { data, error: err } = await supabase.from('promociones')
        .insert({ ...datos, comercio_id: comercioId }).select(sel).single()
      if (err) { setError(err.message); setSaving(false); return }
      setPromos(prev => [data, ...prev])
    }
    setSaving(false); cancelarForm()
  }

  async function toggleActivo(id, activo) {
    await supabase.from('promociones').update({ activo }).eq('id', id)
    setPromos(prev => prev.map(p => p.id === id ? { ...p, activo } : p))
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const vigente = p => p.activo && !(p.fecha_desde && p.fecha_desde > hoy) && !(p.fecha_hasta && p.fecha_hasta < hoy)
  const subcatFiltradas = subcategorias.filter(s => s.categoria_id === form.categoria_id)

  return (
    <>
      <div className="apm-backdrop" onClick={onCerrar} />
      <div className="apm-modal promo-modal">

        <div className="apm-header">
          <div className="apm-header-title">
            <i className="ti ti-tag-starred" /> Promociones
          </div>
          <button className="btn-icon" onClick={onCerrar}><i className="ti ti-x" /></button>
        </div>

        <div className="promo-body">
          {showForm ? (
            <div className="promo-form-wrap">
              <div className="promo-form-hdr">
                <p className="form-section-title" style={{ margin: 0 }}>
                  {editId ? 'Editar promoción' : 'Nueva promoción'}
                </p>
                <button type="button" className="btn" onClick={cancelarForm}>
                  <i className="ti ti-x" /> Cancelar
                </button>
              </div>

              {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}

              <form onSubmit={handleSubmit} className="promo-form">

                {/* Nombre + tipo */}
                <div className="form-grid">
                  <div className="field" style={{ flex: 2 }}>
                    <label className="field-label">Nombre *</label>
                    <input className="field-input" value={form.nombre} autoFocus
                      placeholder="2×1 Alfajores, -10% Librería efectivo..."
                      onChange={e => setF('nombre', e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="field-label">Tipo *</label>
                    <select className="field-select" value={form.tipo} onChange={e => setF('tipo', e.target.value)}>
                      <option value="descuento_pct">% Descuento</option>
                      <option value="nxm">N×M (ej: 2×1)</option>
                    </select>
                  </div>
                </div>

                {/* Parámetros según tipo */}
                {form.tipo === 'descuento_pct' ? (
                  <div className="form-grid">
                    <div className="field" style={{ maxWidth: 160 }}>
                      <label className="field-label">Descuento % *</label>
                      <input className="field-input" type="number" min="0.5" max="100" step="0.5"
                        placeholder="10" value={form.descuento_pct}
                        onChange={e => setF('descuento_pct', e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Medio de pago</label>
                      <select className="field-select" value={form.medio_pago} onChange={e => setF('medio_pago', e.target.value)}>
                        {MEDIOS_PAGO_OPTS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="promo-nxm-row">
                    <div className="field" style={{ maxWidth: 120 }}>
                      <label className="field-label">Lleva *</label>
                      <input className="field-input" type="number" min="2" step="1"
                        value={form.cantidad_lleva} onChange={e => setF('cantidad_lleva', e.target.value)} />
                    </div>
                    <div className="field" style={{ maxWidth: 120 }}>
                      <label className="field-label">Paga *</label>
                      <input className="field-input" type="number" min="1" step="1"
                        value={form.cantidad_paga} onChange={e => setF('cantidad_paga', e.target.value)} />
                    </div>
                    {Number(form.cantidad_lleva) >= 2 && Number(form.cantidad_paga) >= 1 && (
                      <span className="promo-nxm-badge">
                        {form.cantidad_lleva}×{form.cantidad_paga}
                      </span>
                    )}
                  </div>
                )}

                {/* Aplica a */}
                <div className="field">
                  <label className="field-label">Aplica a</label>
                  <div className="pills">
                    {APLICA_OPS.map(op => (
                      <button key={op.value} type="button"
                        className={`pill${form.aplica_a === op.value ? ' pill--active' : ''}`}
                        onClick={() => setF('aplica_a', op.value)}>
                        {op.label}
                      </button>
                    ))}
                  </div>
                </div>

                {form.aplica_a === 'categoria' && (
                  <div className="field" style={{ maxWidth: 280 }}>
                    <label className="field-label">Categoría *</label>
                    <select className="field-select" value={form.categoria_id} onChange={e => setF('categoria_id', e.target.value)}>
                      <option value="">Seleccioná...</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                )}

                {form.aplica_a === 'subcategoria' && (
                  <div className="form-grid">
                    <div className="field">
                      <label className="field-label">Categoría *</label>
                      <select className="field-select" value={form.categoria_id} onChange={e => setF('categoria_id', e.target.value)}>
                        <option value="">Seleccioná...</option>
                        {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="field-label">Subcategoría *</label>
                      <select className="field-select" value={form.subcategoria_id}
                        onChange={e => setF('subcategoria_id', e.target.value)} disabled={!form.categoria_id}>
                        <option value="">Seleccioná...</option>
                        {subcatFiltradas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {form.aplica_a === 'producto' && (
                  <div className="field" style={{ maxWidth: 320, position: 'relative' }}>
                    <label className="field-label">Producto *</label>
                    <input className="field-input" placeholder="Buscar producto..."
                      value={busqProd} onChange={e => buscarProd(e.target.value)} />
                    {resultsProd.length > 0 && (
                      <div className="prod-dropdown">
                        {resultsProd.map(p => (
                          <button key={p.id} type="button" className="prod-dropdown-item"
                            onMouseDown={() => {
                              setF('producto_id', p.id)
                              setF('producto_nombre', p.nombre)
                              setBusqProd(p.nombre)
                              setResultsProd([])
                            }}>
                            <span>{p.nombre}</span>
                            <span className="td-muted" style={{ fontSize: 11 }}>{p.codigo || ''}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {form.producto_id && (
                      <p className="field-hint" style={{ marginTop: 4 }}>
                        <i className="ti ti-check" style={{ color: 'var(--color-success)' }} /> {form.producto_nombre}
                      </p>
                    )}
                  </div>
                )}

                {/* Fechas */}
                <div className="form-grid">
                  <div className="field">
                    <label className="field-label">Válida desde</label>
                    <input className="field-input" type="date" value={form.fecha_desde}
                      onChange={e => setF('fecha_desde', e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="field-label">Válida hasta</label>
                    <input className="field-input" type="date" value={form.fecha_hasta}
                      onChange={e => setF('fecha_hasta', e.target.value)} />
                  </div>
                </div>

                {/* Opciones */}
                <div className="form-checks">
                  <label className="field-check">
                    <input type="checkbox" checked={form.activo} onChange={e => setF('activo', e.target.checked)} />
                    Activa
                  </label>
                  <label className="field-check">
                    <input type="checkbox" checked={form.combina} onChange={e => setF('combina', e.target.checked)} />
                    Combina con otras promos
                  </label>
                </div>

                <button type="submit" className="btn btn--primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
                  <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
                  {saving ? 'Guardando...' : editId ? 'Guardar cambios' : 'Crear promoción'}
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="promo-toolbar">
                <button className="btn btn--primary" onClick={() => { setForm(formVacio()); setEditId(null); setShowForm(true) }}>
                  <i className="ti ti-plus" /> Nueva promoción
                </button>
              </div>

              {loading ? (
                <div className="promo-loading"><i className="ti ti-loader-2" style={{ fontSize: 28, opacity: 0.4 }} /></div>
              ) : promos.length === 0 ? (
                <div className="promo-empty">
                  <i className="ti ti-tag-starred" style={{ fontSize: 32, opacity: 0.3 }} />
                  <span>No hay promociones. Creá la primera.</span>
                </div>
              ) : (
                <div className="apm-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Descuento</th>
                        <th>Aplica a</th>
                        <th>Condición</th>
                        <th>Vigencia</th>
                        <th>Estado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {promos.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                          <td>
                            <span className={`badge ${p.tipo === 'nxm' ? 'badge--info' : 'badge--success'}`} style={{ fontSize: 10 }}>
                              {p.tipo === 'nxm' ? `${p.cantidad_lleva}×${p.cantidad_paga}` : `-${p.descuento_pct}%`}
                            </span>
                          </td>
                          <td style={{ fontSize: 11 }}>
                            {p.aplica_a === 'todo'         && <span className="td-muted">Todo el catálogo</span>}
                            {p.aplica_a === 'categoria'    && p.categoria?.nombre}
                            {p.aplica_a === 'subcategoria' && p.subcategoria?.nombre}
                            {p.aplica_a === 'producto'     && p.producto?.nombre}
                          </td>
                          <td style={{ fontSize: 11 }}>
                            {p.tipo === 'descuento_pct' && p.medio_pago
                              ? <span className="badge badge--neutral" style={{ fontSize: 10 }}>{p.medio_pago.replace(/_/g,' ')}</span>
                              : <span className="td-muted">—</span>}
                          </td>
                          <td className="td-muted" style={{ fontSize: 11 }}>
                            {p.fecha_desde || p.fecha_hasta
                              ? `${p.fecha_desde ? fmtFecha(p.fecha_desde) : '∞'} → ${p.fecha_hasta ? fmtFecha(p.fecha_hasta) : '∞'}`
                              : 'Sin límite'}
                          </td>
                          <td>
                            <span className={`badge ${vigente(p) ? 'badge--success' : 'badge--neutral'}`} style={{ fontSize: 10 }}>
                              {vigente(p) ? 'Vigente' : p.activo ? 'Fuera de fecha' : 'Inactiva'}
                            </span>
                          </td>
                          <td className="td-actions">
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              <button className="btn-icon" onClick={() => iniciarEdicion(p)}>
                                <i className="ti ti-pencil" />
                              </button>
                              <button className={`btn-icon${p.activo ? ' btn-icon--danger' : ''}`}
                                onClick={() => toggleActivo(p.id, !p.activo)}>
                                <i className={`ti ${p.activo ? 'ti-eye-off' : 'ti-eye'}`} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="apm-footer">
          <div className="apm-footer-info" />
          <div className="apm-footer-btns">
            <button className="btn" onClick={onCerrar}><i className="ti ti-x" /> Cerrar</button>
          </div>
        </div>
      </div>
    </>
  )
}
