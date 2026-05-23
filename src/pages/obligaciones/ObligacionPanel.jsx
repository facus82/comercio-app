import { useState, useEffect } from 'react'

const CATEGORIAS = [
  { value: 'impuesto_nacional',    label: 'Impuesto nacional' },
  { value: 'impuesto_provincial',  label: 'Impuesto provincial' },
  { value: 'impuesto_municipal',   label: 'Impuesto municipal' },
  { value: 'servicio',             label: 'Servicio' },
  { value: 'alquiler',             label: 'Alquiler' },
  { value: 'empleado',             label: 'Empleado' },
  { value: 'proveedor',            label: 'Proveedor' },
  { value: 'seguro',               label: 'Seguro' },
  { value: 'otro',                 label: 'Otro' },
]

const PERIODICIDADES = [
  { value: 'mensual',    label: 'Mensual' },
  { value: 'bimestral',  label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral',  label: 'Semestral' },
  { value: 'anual',      label: 'Anual' },
  { value: 'semanal',    label: 'Semanal' },
  { value: 'diario',     label: 'Diario' },
  { value: 'unico',      label: 'Único' },
]

const DEFAULTS = {
  nombre: '', categoria: 'impuesto_nacional', organismo: '',
  monto_estimado: '', dia_vencimiento: '', periodicidad: 'mensual',
  proximo_vencimiento: '', proveedor_id: '', alerta_dias_antes: 5,
  notas: '', activo: true,
}

function toForm(o) {
  if (!o) return DEFAULTS
  return {
    nombre:              o.nombre              ?? '',
    categoria:           o.categoria           ?? 'impuesto_nacional',
    organismo:           o.organismo           ?? '',
    monto_estimado:      o.monto_estimado      ?? '',
    dia_vencimiento:     o.dia_vencimiento     ?? '',
    periodicidad:        o.periodicidad        ?? 'mensual',
    proximo_vencimiento: o.proximo_vencimiento ?? '',
    proveedor_id:        o.proveedor_id        ?? '',
    alerta_dias_antes:   o.alerta_dias_antes   ?? 5,
    notas:               o.notas               ?? '',
    activo:              o.activo              ?? true,
  }
}

export default function ObligacionPanel({ obligacion, proveedores, onCrear, onActualizar, onCerrar }) {
  const [form,   setForm]   = useState(() => toForm(obligacion))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => { setForm(toForm(obligacion)); setError('') }, [obligacion])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  function setF(c, v) { setForm(prev => ({ ...prev, [c]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim())    { setError('El nombre es obligatorio.'); return }
    if (!form.monto_estimado)   { setError('El monto es obligatorio.'); return }
    setSaving(true); setError('')
    const datos = {
      nombre:              form.nombre.trim(),
      categoria:           form.categoria,
      organismo:           form.organismo.trim()       || null,
      monto_estimado:      Number(form.monto_estimado),
      dia_vencimiento:     form.dia_vencimiento ? Number(form.dia_vencimiento) : null,
      periodicidad:        form.periodicidad,
      proximo_vencimiento: form.proximo_vencimiento    || null,
      proveedor_id:        form.proveedor_id           || null,
      alerta_dias_antes:   Number(form.alerta_dias_antes) || 5,
      notas:               form.notas.trim()           || null,
      activo:              form.activo,
    }
    const res = obligacion ? await onActualizar(obligacion.id, datos) : await onCrear(datos)
    setSaving(false)
    if (res.error) setError(res.error.message || 'Error al guardar.')
    else onCerrar()
  }

  const esNuevo = !obligacion

  return (
    <>
      <div className="panel-backdrop" onClick={onCerrar} />
      <aside className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <i className={`ti ${esNuevo ? 'ti-receipt-tax' : 'ti-pencil'}`} style={{ marginRight: 6, fontSize: 15 }} />
            {esNuevo ? 'Nueva obligación' : 'Editar obligación'}
          </h2>
          <button className="btn-icon" onClick={onCerrar}><i className="ti ti-x" /></button>
        </div>

        <form id="ob-form" className="panel-body" onSubmit={handleSubmit}>
          {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}

          <div className="form-section">
            <p className="form-section-title">Identificación</p>
            <div className="field">
              <label className="field-label">Nombre *</label>
              <input className="field-input" placeholder="IVA mensual, IIBB, etc." value={form.nombre}
                onChange={e => setF('nombre', e.target.value)} required autoFocus />
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Categoría</label>
                <select className="field-select" value={form.categoria} onChange={e => setF('categoria', e.target.value)}>
                  {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Organismo</label>
                <input className="field-input" placeholder="AFIP, DGR..." value={form.organismo}
                  onChange={e => setF('organismo', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Proveedor / Acreedor</label>
              <select className="field-select" value={form.proveedor_id} onChange={e => setF('proveedor_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {proveedores.filter(p => p.activo).map(p => (
                  <option key={p.id} value={p.id}>{p.nombre_fantasia || p.razon_social}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-section">
            <p className="form-section-title">Monto y vencimiento</p>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Monto estimado $*</label>
                <input className="field-input" type="number" min="0" step="0.01" placeholder="0"
                  value={form.monto_estimado} onChange={e => setF('monto_estimado', e.target.value)} required />
              </div>
              <div className="field">
                <label className="field-label">Periodicidad</label>
                <select className="field-select" value={form.periodicidad} onChange={e => setF('periodicidad', e.target.value)}>
                  {PERIODICIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Día de vencimiento</label>
                <input className="field-input" type="number" min="1" max="31" placeholder="20"
                  value={form.dia_vencimiento} onChange={e => setF('dia_vencimiento', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Próximo vencimiento</label>
                <input className="field-input" type="date"
                  value={form.proximo_vencimiento} onChange={e => setF('proximo_vencimiento', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Alerta (días antes)</label>
                <input className="field-input" type="number" min="0" step="1" placeholder="5"
                  value={form.alerta_dias_antes} onChange={e => setF('alerta_dias_antes', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <p className="form-section-title">Opciones</p>
            <label className="field-check">
              <input type="checkbox" checked={form.activo} onChange={e => setF('activo', e.target.checked)} />
              Activa
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
          <button type="submit" form="ob-form" className="btn btn--primary" disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
            {saving ? 'Guardando...' : esNuevo ? 'Crear obligación' : 'Guardar cambios'}
          </button>
        </div>
      </aside>
    </>
  )
}
