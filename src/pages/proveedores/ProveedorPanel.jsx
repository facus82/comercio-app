import { useState, useEffect } from 'react'

const CONDICIONES_IVA = [
  'Responsable Inscripto', 'Monotributista', 'Exento', 'Consumidor Final',
]

const DEFAULTS = {
  razon_social: '', nombre_fantasia: '', cuit: '',
  condicion_iva: 'Responsable Inscripto',
  telefono: '', email: '', direccion: '', localidad: '', provincia: 'La Rioja',
  plazo_pago_dias: 30, notas: '', activo: true,
}

function toForm(p) {
  if (!p) return DEFAULTS
  return {
    razon_social:    p.razon_social    ?? '',
    nombre_fantasia: p.nombre_fantasia ?? '',
    cuit:            p.cuit            ?? '',
    condicion_iva:   p.condicion_iva   ?? 'Responsable Inscripto',
    telefono:        p.telefono        ?? '',
    email:           p.email           ?? '',
    direccion:       p.direccion       ?? '',
    localidad:       p.localidad       ?? '',
    provincia:       p.provincia       ?? 'La Rioja',
    plazo_pago_dias: p.plazo_pago_dias ?? 30,
    notas:           p.notas           ?? '',
    activo:          p.activo          ?? true,
  }
}

export default function ProveedorPanel({ proveedor, onCrear, onActualizar, onCerrar }) {
  const [form,   setForm]   = useState(() => toForm(proveedor))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    setForm(toForm(proveedor))
    setError('')
  }, [proveedor])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  function setF(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.razon_social.trim()) { setError('La razón social es obligatoria.'); return }

    setSaving(true); setError('')

    const datos = {
      razon_social:    form.razon_social.trim(),
      nombre_fantasia: form.nombre_fantasia.trim() || null,
      cuit:            form.cuit.trim()            || null,
      condicion_iva:   form.condicion_iva,
      telefono:        form.telefono.trim()        || null,
      email:           form.email.trim()           || null,
      direccion:       form.direccion.trim()       || null,
      localidad:       form.localidad.trim()       || null,
      provincia:       form.provincia.trim()       || null,
      plazo_pago_dias: Number(form.plazo_pago_dias) || 30,
      notas:           form.notas.trim()           || null,
      activo:          form.activo,
    }

    const res = proveedor
      ? await onActualizar(proveedor.id, datos)
      : await onCrear(datos)

    setSaving(false)
    if (res.error) setError(res.error.message || 'Error al guardar.')
    else onCerrar()
  }

  const esNuevo = !proveedor

  return (
    <>
      <div className="panel-backdrop" onClick={onCerrar} />
      <aside className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <i className={`ti ${esNuevo ? 'ti-truck' : 'ti-pencil'}`} style={{ marginRight: 6, fontSize: 15 }} />
            {esNuevo ? 'Nuevo proveedor' : 'Editar proveedor'}
          </h2>
          <button className="btn-icon" onClick={onCerrar} title="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>

        <form id="prov-form" className="panel-body" onSubmit={handleSubmit}>
          {error && (
            <div className="error-banner">
              <i className="ti ti-alert-circle" /> {error}
            </div>
          )}

          {/* Identificación */}
          <div className="form-section">
            <p className="form-section-title">Identificación</p>
            <div className="field">
              <label className="field-label">Razón social *</label>
              <input className="field-input" placeholder="Empresa S.A."
                value={form.razon_social} onChange={e => setF('razon_social', e.target.value)}
                required autoFocus />
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Nombre fantasía</label>
                <input className="field-input" placeholder="Nombre comercial"
                  value={form.nombre_fantasia} onChange={e => setF('nombre_fantasia', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">CUIT</label>
                <input className="field-input" placeholder="20-12345678-9"
                  value={form.cuit} onChange={e => setF('cuit', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Condición IVA</label>
              <select className="field-select" value={form.condicion_iva}
                onChange={e => setF('condicion_iva', e.target.value)}>
                {CONDICIONES_IVA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Contacto */}
          <div className="form-section">
            <p className="form-section-title">Contacto</p>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Teléfono</label>
                <input className="field-input" placeholder="380 4000000"
                  value={form.telefono} onChange={e => setF('telefono', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Email</label>
                <input className="field-input" type="email" placeholder="ventas@empresa.com"
                  value={form.email} onChange={e => setF('email', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Dirección</label>
              <input className="field-input" placeholder="Av. Siempre Viva 123"
                value={form.direccion} onChange={e => setF('direccion', e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Localidad</label>
                <input className="field-input" placeholder="La Rioja"
                  value={form.localidad} onChange={e => setF('localidad', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Provincia</label>
                <input className="field-input" placeholder="La Rioja"
                  value={form.provincia} onChange={e => setF('provincia', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Condiciones comerciales */}
          <div className="form-section">
            <p className="form-section-title">Condiciones</p>
            <div className="field" style={{ maxWidth: 160 }}>
              <label className="field-label">Plazo de pago (días)</label>
              <input className="field-input" type="number" min="0" step="1" placeholder="30"
                value={form.plazo_pago_dias} onChange={e => setF('plazo_pago_dias', e.target.value)} />
            </div>
          </div>

          {/* Opciones */}
          <div className="form-section">
            <p className="form-section-title">Opciones</p>
            <label className="field-check">
              <input type="checkbox" checked={form.activo}
                onChange={e => setF('activo', e.target.checked)} />
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
          <button type="button" className="btn" onClick={onCerrar}>
            <i className="ti ti-x" /> Cancelar
          </button>
          <button type="submit" form="prov-form" className="btn btn--primary" disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
            {saving ? 'Guardando...' : esNuevo ? 'Crear proveedor' : 'Guardar cambios'}
          </button>
        </div>
      </aside>
    </>
  )
}
