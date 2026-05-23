import { useState, useEffect } from 'react'

const TIPOS = [
  { value: 'consumidor_final', label: 'Consumidor final' },
  { value: 'cuenta_corriente', label: 'Cuenta corriente' },
  { value: 'mayorista',        label: 'Mayorista' },
]

const DEFAULTS = {
  nombre: '', apellido: '', razon_social: '', dni: '', cuit: '',
  telefono: '', email: '', direccion: '', localidad: '', provincia: 'La Rioja',
  tipo: 'consumidor_final', limite_credito: 0, notas: '', activo: true,
}

function toForm(c) {
  if (!c) return DEFAULTS
  return {
    nombre:         c.nombre         ?? '',
    apellido:       c.apellido       ?? '',
    razon_social:   c.razon_social   ?? '',
    dni:            c.dni            ?? '',
    cuit:           c.cuit           ?? '',
    telefono:       c.telefono       ?? '',
    email:          c.email          ?? '',
    direccion:      c.direccion      ?? '',
    localidad:      c.localidad      ?? '',
    provincia:      c.provincia      ?? 'La Rioja',
    tipo:           c.tipo           ?? 'consumidor_final',
    limite_credito: c.limite_credito ?? 0,
    notas:          c.notas          ?? '',
    activo:         c.activo         ?? true,
  }
}

export default function ClientePanel({ cliente, onCrear, onActualizar, onCerrar }) {
  const [form,   setForm]   = useState(() => toForm(cliente))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => { setForm(toForm(cliente)); setError('') }, [cliente])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  function setF(campo, valor) { setForm(prev => ({ ...prev, [campo]: valor })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true); setError('')
    const datos = {
      nombre:         form.nombre.trim(),
      apellido:       form.apellido.trim()     || null,
      razon_social:   form.razon_social.trim() || null,
      dni:            form.dni.trim()          || null,
      cuit:           form.cuit.trim()         || null,
      telefono:       form.telefono.trim()     || null,
      email:          form.email.trim()        || null,
      direccion:      form.direccion.trim()    || null,
      localidad:      form.localidad.trim()    || null,
      provincia:      form.provincia.trim()    || null,
      tipo:           form.tipo,
      limite_credito: Number(form.limite_credito) || 0,
      notas:          form.notas.trim()        || null,
      activo:         form.activo,
    }
    const res = cliente ? await onActualizar(cliente.id, datos) : await onCrear(datos)
    setSaving(false)
    if (res.error) setError(res.error.message || 'Error al guardar.')
    else onCerrar()
  }

  const esNuevo = !cliente

  return (
    <>
      <div className="panel-backdrop" onClick={onCerrar} />
      <aside className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <i className={`ti ${esNuevo ? 'ti-user-plus' : 'ti-pencil'}`} style={{ marginRight: 6, fontSize: 15 }} />
            {esNuevo ? 'Nuevo cliente' : 'Editar cliente'}
          </h2>
          <button className="btn-icon" onClick={onCerrar}><i className="ti ti-x" /></button>
        </div>

        <form id="cli-form" className="panel-body" onSubmit={handleSubmit}>
          {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}

          <div className="form-section">
            <p className="form-section-title">Identificación</p>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Nombre *</label>
                <input className="field-input" placeholder="Juan" value={form.nombre}
                  onChange={e => setF('nombre', e.target.value)} required autoFocus />
              </div>
              <div className="field">
                <label className="field-label">Apellido</label>
                <input className="field-input" placeholder="Pérez" value={form.apellido}
                  onChange={e => setF('apellido', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Razón social (empresa)</label>
              <input className="field-input" placeholder="Empresa S.A." value={form.razon_social}
                onChange={e => setF('razon_social', e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">DNI</label>
                <input className="field-input" placeholder="30123456" value={form.dni}
                  onChange={e => setF('dni', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">CUIT</label>
                <input className="field-input" placeholder="20-30123456-7" value={form.cuit}
                  onChange={e => setF('cuit', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <p className="form-section-title">Contacto</p>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Teléfono</label>
                <input className="field-input" placeholder="380 4000000" value={form.telefono}
                  onChange={e => setF('telefono', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Email</label>
                <input className="field-input" type="email" placeholder="juan@mail.com" value={form.email}
                  onChange={e => setF('email', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Dirección</label>
              <input className="field-input" placeholder="Av. Siempre Viva 123" value={form.direccion}
                onChange={e => setF('direccion', e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Localidad</label>
                <input className="field-input" placeholder="La Rioja" value={form.localidad}
                  onChange={e => setF('localidad', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Provincia</label>
                <input className="field-input" placeholder="La Rioja" value={form.provincia}
                  onChange={e => setF('provincia', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <p className="form-section-title">Condiciones</p>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Tipo</label>
                <select className="field-select" value={form.tipo} onChange={e => setF('tipo', e.target.value)}>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {form.tipo === 'cuenta_corriente' && (
                <div className="field">
                  <label className="field-label">Límite crédito $</label>
                  <input className="field-input" type="number" min="0" step="100" placeholder="0"
                    value={form.limite_credito} onChange={e => setF('limite_credito', e.target.value)} />
                </div>
              )}
            </div>
          </div>

          <div className="form-section">
            <p className="form-section-title">Opciones</p>
            <label className="field-check">
              <input type="checkbox" checked={form.activo} onChange={e => setF('activo', e.target.checked)} />
              Activo
            </label>
            <div className="field">
              <label className="field-label">Notas</label>
              <textarea className="field-textarea" rows={2} placeholder="Notas opcionales..."
                value={form.notas} onChange={e => setF('notas', e.target.value)} />
            </div>
          </div>
        </form>

        <div className="panel-footer">
          <button type="button" className="btn" onClick={onCerrar}><i className="ti ti-x" /> Cancelar</button>
          <button type="submit" form="cli-form" className="btn btn--primary" disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
            {saving ? 'Guardando...' : esNuevo ? 'Crear cliente' : 'Guardar cambios'}
          </button>
        </div>
      </aside>
    </>
  )
}
