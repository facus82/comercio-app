import { useState } from 'react'

const MEDIOS = ['transferencia','efectivo','tarjeta_debito','tarjeta_credito','mercado_pago','cheque','otro']

const hoy = () => new Date().toISOString().slice(0, 10)

function proximoVencimiento(ob) {
  if (!ob.proximo_vencimiento || !ob.periodicidad || ob.periodicidad === 'unico') return ''
  const d = new Date(ob.proximo_vencimiento + 'T00:00:00')
  const map = { diario: 1, semanal: 7, mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 }
  if (ob.periodicidad === 'diario' || ob.periodicidad === 'semanal') {
    d.setDate(d.getDate() + map[ob.periodicidad])
  } else {
    d.setMonth(d.getMonth() + map[ob.periodicidad])
  }
  return d.toISOString().slice(0, 10)
}

export default function PagoModal({ obligacion, onRegistrar, onCerrar }) {
  const [form, setForm] = useState({
    fecha_pago:  hoy(),
    monto:       obligacion.monto_estimado || '',
    medio_pago:  'transferencia',
    comprobante: '',
    periodo:     '',
    notas:       '',
  })
  const [nuevoVenc, setNuevoVenc] = useState(proximoVencimiento(obligacion))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function setF(c, v) { setForm(prev => ({ ...prev, [c]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.monto) { setError('El monto es obligatorio.'); return }
    setSaving(true); setError('')
    const pagoData = {
      fecha_pago:  form.fecha_pago,
      monto:       Number(form.monto),
      medio_pago:  form.medio_pago,
      comprobante: form.comprobante.trim() || null,
      periodo:     form.periodo.trim()     || null,
      notas:       form.notas.trim()       || null,
    }
    const res = await onRegistrar(obligacion.id, pagoData, nuevoVenc || null)
    setSaving(false)
    if (res.error) setError(res.error.message || 'Error al registrar.')
    else onCerrar()
  }

  return (
    <>
      <div className="panel-backdrop" onClick={onCerrar} style={{ zIndex: 'calc(var(--z-modal) + 2)' }} />
      <div className="pago-modal" style={{ zIndex: 'calc(var(--z-modal) + 3)' }}>
        <div className="panel-header">
          <h2 className="panel-title">
            <i className="ti ti-cash" style={{ marginRight: 6, fontSize: 15 }} />
            Registrar pago — {obligacion.nombre}
          </h2>
          <button className="btn-icon" onClick={onCerrar}><i className="ti ti-x" /></button>
        </div>

        <form id="pago-form" className="panel-body" onSubmit={handleSubmit}>
          {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}

          <div className="form-section">
            <p className="form-section-title">Pago</p>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Fecha</label>
                <input className="field-input" type="date" value={form.fecha_pago}
                  onChange={e => setF('fecha_pago', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Monto $*</label>
                <input className="field-input" type="number" min="0" step="0.01"
                  value={form.monto} onChange={e => setF('monto', e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label className="field-label">Medio de pago</label>
                <select className="field-select" value={form.medio_pago} onChange={e => setF('medio_pago', e.target.value)}>
                  {MEDIOS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Comprobante</label>
                <input className="field-input" placeholder="N° comprobante" value={form.comprobante}
                  onChange={e => setF('comprobante', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Período</label>
                <input className="field-input" placeholder="Ej: Mayo 2025" value={form.periodo}
                  onChange={e => setF('periodo', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Próximo vencimiento</label>
              <input className="field-input" type="date" value={nuevoVenc}
                onChange={e => setNuevoVenc(e.target.value)} />
            </div>
          </div>
        </form>

        <div className="panel-footer">
          <button type="button" className="btn" onClick={onCerrar}><i className="ti ti-x" /> Cancelar</button>
          <button type="submit" form="pago-form" className="btn btn--primary" disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
            {saving ? 'Registrando...' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </>
  )
}
