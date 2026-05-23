import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import './Config.css'

const TABS = [
  { key: 'comercio',  label: 'Comercio',        icon: 'ti-building-store' },
  { key: 'categorias',label: 'Categorías',       icon: 'ti-tag'            },
  { key: 'centros',   label: 'Centros de costo', icon: 'ti-chart-pie'      },
]

const CONDICIONES_IVA = ['Responsable Inscripto','Monotributista','Exento','Consumidor Final']

// ── Comercio ──────────────────────────────────────────────────
function TabComercio({ comercioId }) {
  const [form,        setForm]        = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [ok,          setOk]          = useState(false)
  const [error,       setError]       = useState('')
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (!comercioId) return
    supabase.from('comercios').select('*').eq('id', comercioId).single()
      .then(({ data }) => { if (data) setForm(data) })
  }, [comercioId])

  function setF(c, v) { setForm(prev => ({ ...prev, [c]: v })) }

  async function handleLogoUpload(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['jpg','jpeg','png','webp','svg'].includes(ext)) {
      setUploadError('Solo JPG, PNG, WEBP o SVG.'); return
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('El archivo no puede superar 2 MB.'); return
    }
    setUploading(true); setUploadError('')
    const path = `${comercioId}/logo.${ext}`
    const { error: errUp } = await supabase.storage
      .from('logos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (errUp) { setUploadError(errUp.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    setF('logo_url', publicUrl + '?t=' + Date.now())
    setUploading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError(''); setOk(false)
    const { error } = await supabase.from('comercios').update({
      nombre:           form.nombre,
      nombre_fantasia:  form.nombre_fantasia  || null,
      cuit:             form.cuit             || null,
      condicion_iva:    form.condicion_iva,
      ingresos_brutos:  form.ingresos_brutos  || null,
      direccion:        form.direccion        || null,
      localidad:        form.localidad        || null,
      provincia:        form.provincia        || null,
      telefono:         form.telefono         || null,
      email:            form.email            || null,
      ticket_pie:       form.ticket_pie       || null,
      logo_url:         form.logo_url         || null,
      iva_defecto:      Number(form.iva_defecto) || 21,
      presupuesto_validez_dias: Number(form.presupuesto_validez_dias) || 15,
    }).eq('id', comercioId)
    setSaving(false)
    if (error) setError(error.message)
    else setOk(true)
  }

  if (!form) return <div className="table-loading"><i className="ti ti-loader-2" style={{ fontSize: 24, opacity: 0.4 }} /></div>

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}
      {ok && <div className="ok-banner"><i className="ti ti-check" /> Cambios guardados.</div>}

      <div className="form-section">
        <p className="form-section-title">Datos del comercio</p>
        <div className="form-grid">
          <div className="field">
            <label className="field-label">Nombre legal *</label>
            <input className="field-input" value={form.nombre || ''} onChange={e => setF('nombre', e.target.value)} required />
          </div>
          <div className="field">
            <label className="field-label">Nombre fantasía</label>
            <input className="field-input" value={form.nombre_fantasia || ''} onChange={e => setF('nombre_fantasia', e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">CUIT</label>
            <input className="field-input" placeholder="20-12345678-9" value={form.cuit || ''} onChange={e => setF('cuit', e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Condición IVA</label>
            <select className="field-select" value={form.condicion_iva || ''} onChange={e => setF('condicion_iva', e.target.value)}>
              {CONDICIONES_IVA.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Ingresos brutos</label>
            <input className="field-input" value={form.ingresos_brutos || ''} onChange={e => setF('ingresos_brutos', e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Teléfono</label>
            <input className="field-input" value={form.telefono || ''} onChange={e => setF('telefono', e.target.value)} />
          </div>
          <div className="field col-span-2">
            <label className="field-label">Email</label>
            <input className="field-input" type="email" value={form.email || ''} onChange={e => setF('email', e.target.value)} />
          </div>
          <div className="field col-span-2">
            <label className="field-label">Dirección</label>
            <input className="field-input" value={form.direccion || ''} onChange={e => setF('direccion', e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Localidad</label>
            <input className="field-input" value={form.localidad || ''} onChange={e => setF('localidad', e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Provincia</label>
            <input className="field-input" value={form.provincia || ''} onChange={e => setF('provincia', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title">Configuración</p>
        <div className="form-grid">
          <div className="field">
            <label className="field-label">IVA por defecto %</label>
            <input className="field-input" type="number" min="0" step="0.5" value={form.iva_defecto || 21} onChange={e => setF('iva_defecto', e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Validez presupuesto (días)</label>
            <input className="field-input" type="number" min="1" value={form.presupuesto_validez_dias || 15} onChange={e => setF('presupuesto_validez_dias', e.target.value)} />
          </div>
          <div className="field col-span-2">
            <label className="field-label">Pie de ticket</label>
            <input className="field-input" placeholder="¡Gracias por su compra!" value={form.ticket_pie || ''} onChange={e => setF('ticket_pie', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title">Logo del comercio</p>
        <p className="field-hint" style={{ marginBottom: 8 }}>
          Se muestra en el sidebar y en presupuestos. JPG, PNG o WEBP — máx. 2 MB.
        </p>
        <div className="logo-upload-row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="btn" style={{ cursor: 'pointer' }}>
              <i className={`ti ${uploading ? 'ti-loader-2' : 'ti-upload'}`} />
              {uploading ? 'Subiendo...' : 'Subir imagen'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                disabled={uploading}
                onChange={e => handleLogoUpload(e.target.files[0])}
              />
            </label>
            {form.logo_url && (
              <button type="button" className="btn btn--danger" onClick={() => setF('logo_url', null)}>
                <i className="ti ti-trash" /> Quitar logo
              </button>
            )}
            {uploadError && <p className="field-error"><i className="ti ti-alert-circle" /> {uploadError}</p>}
          </div>

          <div className="logo-sidebar-preview">
            <p className="field-hint" style={{ marginBottom: 6 }}>Preview en sidebar:</p>
            <div className="sidebar-preview-mock">
              <div className="sidebar-preview-logo">
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo" />
                  : <span>{(form.nombre_fantasia || form.nombre || 'MC').slice(0, 2).toUpperCase()}</span>
                }
              </div>
              <div>
                <div className="sidebar-preview-name">
                  {form.nombre_fantasia || form.nombre || 'Mi Comercio'}
                </div>
                <div className="sidebar-preview-sub">
                  {form.localidad || 'Tu ciudad'} · Pro
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="field-hint" style={{ marginTop: 4 }}>
          <i className="ti ti-info-circle" /> Necesitás un bucket público llamado <strong>logos</strong> en Supabase Storage.
        </p>
      </div>

      <div>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

// ── Categorías ────────────────────────────────────────────────
function TabCategorias({ comercioId }) {
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading]       = useState(true)
  const [form, setForm]             = useState({ nombre: '', color: '#3b82f6' })
  const [editId, setEditId]         = useState(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (!comercioId) return
    supabase.from('categorias').select('*').eq('comercio_id', comercioId).order('nombre')
      .then(({ data }) => { setCategorias(data || []); setLoading(false) })
  }, [comercioId])

  function resetForm() { setForm({ nombre: '', color: '#3b82f6' }); setEditId(null); setError('') }

  function startEdit(cat) { setForm({ nombre: cat.nombre, color: cat.color || '#3b82f6' }); setEditId(cat.id) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true); setError('')
    if (editId) {
      const { data, error } = await supabase.from('categorias').update({ nombre: form.nombre.trim(), color: form.color }).eq('id', editId).select().single()
      if (error) { setError(error.message); setSaving(false); return }
      setCategorias(prev => prev.map(c => c.id === editId ? data : c))
    } else {
      const { data, error } = await supabase.from('categorias').insert({ nombre: form.nombre.trim(), color: form.color, comercio_id: comercioId }).select().single()
      if (error) { setError(error.message); setSaving(false); return }
      setCategorias(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    }
    setSaving(false); resetForm()
  }

  async function toggleActivo(id, estado) {
    await supabase.from('categorias').update({ activo: estado }).eq('id', id)
    setCategorias(prev => prev.map(c => c.id === id ? { ...c, activo: estado } : c))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="form-section">
        <p className="form-section-title">{editId ? 'Editar categoría' : 'Nueva categoría'}</p>
        {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label">Nombre</label>
            <input className="field-input" placeholder="Librería, Kiosco..." value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} autoFocus />
          </div>
          <div className="field">
            <label className="field-label">Color</label>
            <input type="color" className="config-color-input" value={form.color}
              onChange={e => setForm(p => ({ ...p, color: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : editId ? 'ti-check' : 'ti-plus'}`} />
            {editId ? 'Guardar' : 'Agregar'}
          </button>
          {editId && <button type="button" className="btn" onClick={resetForm}><i className="ti ti-x" /></button>}
        </form>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="table-loading"><i className="ti ti-loader-2" style={{ fontSize: 24, opacity: 0.4 }} /></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Nombre</th><th>Color</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {categorias.map(cat => (
                <tr key={cat.id}>
                  <td style={{ fontWeight: 500 }}>{cat.nombre}</td>
                  <td>
                    <span className="badge-cat" style={{ '--cat-color': cat.color }}>{cat.color}</span>
                  </td>
                  <td><span className={`badge ${cat.activo ? 'badge--success' : 'badge--neutral'}`}>{cat.activo ? 'Activa' : 'Inactiva'}</span></td>
                  <td className="td-actions">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn-icon" onClick={() => startEdit(cat)}><i className="ti ti-pencil" /></button>
                      <button className={`btn-icon${cat.activo ? ' btn-icon--danger' : ''}`} onClick={() => toggleActivo(cat.id, !cat.activo)}>
                        <i className={`ti ${cat.activo ? 'ti-eye-off' : 'ti-eye'}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Centros de costo ──────────────────────────────────────────
function TabCentros({ comercioId }) {
  const [centros,  setCentros]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [form,     setForm]     = useState({ nombre: '', descripcion: '', color: '#3b82f6' })
  const [editId,   setEditId]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!comercioId) return
    supabase.from('centros_costos').select('*').eq('comercio_id', comercioId).order('nombre')
      .then(({ data }) => { setCentros(data || []); setLoading(false) })
  }, [comercioId])

  function resetForm() { setForm({ nombre: '', descripcion: '', color: '#3b82f6' }); setEditId(null); setError('') }
  function startEdit(cc) { setForm({ nombre: cc.nombre, descripcion: cc.descripcion || '', color: cc.color || '#3b82f6' }); setEditId(cc.id) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true); setError('')
    const datos = { nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, color: form.color }
    if (editId) {
      const { data, error } = await supabase.from('centros_costos').update(datos).eq('id', editId).select().single()
      if (error) { setError(error.message); setSaving(false); return }
      setCentros(prev => prev.map(c => c.id === editId ? data : c))
    } else {
      const { data, error } = await supabase.from('centros_costos').insert({ ...datos, comercio_id: comercioId }).select().single()
      if (error) { setError(error.message); setSaving(false); return }
      setCentros(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    }
    setSaving(false); resetForm()
  }

  async function toggleActivo(id, estado) {
    await supabase.from('centros_costos').update({ activo: estado }).eq('id', id)
    setCentros(prev => prev.map(c => c.id === id ? { ...c, activo: estado } : c))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="form-section">
        <p className="form-section-title">{editId ? 'Editar centro de costo' : 'Nuevo centro de costo'}</p>
        {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label className="field-label">Nombre</label>
            <input className="field-input" placeholder="Librería, Kiosco..." value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} autoFocus />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label className="field-label">Descripción</label>
            <input className="field-input" placeholder="Opcional" value={form.descripcion}
              onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} />
          </div>
          <div className="field">
            <label className="field-label">Color</label>
            <input type="color" className="config-color-input" value={form.color}
              onChange={e => setForm(p => ({ ...p, color: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : editId ? 'ti-check' : 'ti-plus'}`} />
            {editId ? 'Guardar' : 'Agregar'}
          </button>
          {editId && <button type="button" className="btn" onClick={resetForm}><i className="ti ti-x" /></button>}
        </form>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="table-loading"><i className="ti ti-loader-2" style={{ fontSize: 24, opacity: 0.4 }} /></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Nombre</th><th>Descripción</th><th>Color</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {centros.map(cc => (
                <tr key={cc.id}>
                  <td style={{ fontWeight: 500 }}>{cc.nombre}</td>
                  <td className="td-muted">{cc.descripcion || '—'}</td>
                  <td><span className="badge-cat" style={{ '--cat-color': cc.color }}>{cc.color}</span></td>
                  <td><span className={`badge ${cc.activo ? 'badge--success' : 'badge--neutral'}`}>{cc.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="td-actions">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn-icon" onClick={() => startEdit(cc)}><i className="ti ti-pencil" /></button>
                      <button className={`btn-icon${cc.activo ? ' btn-icon--danger' : ''}`} onClick={() => toggleActivo(cc.id, !cc.activo)}>
                        <i className={`ti ${cc.activo ? 'ti-eye-off' : 'ti-eye'}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Config principal ──────────────────────────────────────────
export default function Config() {
  const { perfil } = useAuth()
  const comercioId = perfil?.comercio?.id
  const [tabActiva, setTabActiva] = useState('comercio')

  return (
    <div className="config-page">
      <div className="page-header">
        <h1 className="page-title">Configuración</h1>
      </div>

      <div className="config-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`config-tab${tabActiva === t.key ? ' config-tab--active' : ''}`}
            onClick={() => setTabActiva(t.key)}
          >
            <i className={`ti ${t.icon}`} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="config-body">
        {tabActiva === 'comercio'  && <TabComercio  comercioId={comercioId} />}
        {tabActiva === 'categorias'&& <TabCategorias comercioId={comercioId} />}
        {tabActiva === 'centros'   && <TabCentros   comercioId={comercioId} />}
      </div>
    </div>
  )
}
