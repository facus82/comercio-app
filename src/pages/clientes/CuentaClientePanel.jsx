import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../../hooks/useToast'
import {
  cargarDeudas, cargarCobros, registrarCobro,
  diasHasta, hoyISO, nombreCliente, linkWhatsApp,
} from '../../hooks/useCuentasCobrar'
import './CuentaCliente.css'

const MEDIOS = [
  { value: 'efectivo',        label: 'Efectivo'      },
  { value: 'transferencia',   label: 'Transferencia' },
  { value: 'mercado_pago',    label: 'Mercado Pago'  },
  { value: 'tarjeta_debito',  label: 'Débito'        },
  { value: 'tarjeta_credito', label: 'Crédito'       },
  { value: 'otro',            label: 'Otro'          },
]
const MEDIO_LABEL = Object.fromEntries(MEDIOS.map(m => [m.value, m.label]))

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

const fmtFecha = d =>
  d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-AR') : '—'

export function VtoBadge({ fecha }) {
  const dias = diasHasta(fecha)
  if (dias == null)  return <span className="badge badge--neutral">Sin vto.</span>
  if (dias < 0)      return <span className="badge badge--danger">Vencida hace {-dias} d</span>
  if (dias === 0)    return <span className="badge badge--warning">Vence hoy</span>
  if (dias <= 7)     return <span className="badge badge--warning">Vence en {dias} d</span>
  return <span className="badge badge--neutral">Vence {fmtFecha(fecha)}</span>
}

export default function CuentaClientePanel({ cliente, comercioId, onCerrar, onCambio }) {
  const toast = useToast()
  const [deudas,  setDeudas]  = useState([])
  const [cobros,  setCobros]  = useState([])
  const [loading, setLoading] = useState(true)

  const [form,   setForm]   = useState({ monto: '', medio: 'efectivo', fecha: hoyISO(), referencia: '' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    const [resD, resC] = await Promise.all([
      cargarDeudas(comercioId, cliente.id),
      cargarCobros(cliente.id),
    ])
    setDeudas(resD.data)
    setCobros(resC.data)
    setLoading(false)
  }, [comercioId, cliente.id])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  const saldo   = deudas.reduce((s, v) => s + v.pendiente, 0)
  const vencido = deudas.filter(v => (diasHasta(v.fecha_vencimiento) ?? 0) < 0).reduce((s, v) => s + v.pendiente, 0)
  const nombre  = nombreCliente(cliente)
  const montoNum = Number(form.monto) || 0

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleCobrar(e) {
    e.preventDefault()
    if (montoNum <= 0)            { setError('Ingresá un monto mayor a 0.'); return }
    if (montoNum > saldo + 0.009) { setError(`El cobro supera la deuda (${fmt$(saldo)}).`); return }
    setSaving(true); setError('')
    const { error } = await registrarCobro({
      clienteId: cliente.id, monto: montoNum, medioPago: form.medio,
      fecha: form.fecha, referencia: form.referencia,
    })
    setSaving(false)
    if (error) { setError(error.message || 'Error al registrar el cobro.'); return }
    toast?.success(`Cobro de ${fmt$(montoNum)} registrado`)
    setForm(p => ({ ...p, monto: '', referencia: '' }))
    await cargar()
    onCambio?.()
  }

  const mensajeWA = vencido > 0
    ? `Hola ${cliente.nombre}, te recordamos que tenés un saldo vencido de ${fmt$(vencido)} en tu cuenta corriente (saldo total ${fmt$(saldo)}). ¡Gracias!`
    : `Hola ${cliente.nombre}, te recordamos que tu saldo en cuenta corriente es de ${fmt$(saldo)}. ¡Gracias!`
  const waLink = saldo > 0 ? linkWhatsApp(cliente.telefono, mensajeWA) : null

  return (
    <>
      <div className="panel-backdrop" onClick={onCerrar} />
      <aside className="panel">
        <div className="panel-header">
          <div className="ccli-title-wrap">
            <div className="ccli-icon"><i className="ti ti-notebook" /></div>
            <div>
              <h2 className="panel-title">{nombre}</h2>
              <p className="ccli-sub">Cuenta corriente{cliente.telefono ? ` · ${cliente.telefono}` : ''}</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onCerrar}><i className="ti ti-x" /></button>
        </div>

        <div className="panel-body">
          {/* Resumen */}
          <div className="ccli-resumen">
            <div className="ccli-stat">
              <span className="ccli-stat-label">Saldo</span>
              <span className="ccli-stat-value">{loading ? '…' : fmt$(saldo)}</span>
            </div>
            <div className="ccli-stat">
              <span className="ccli-stat-label">Vencido</span>
              <span className={`ccli-stat-value${vencido > 0 ? ' ccli-stat-value--danger' : ''}`}>
                {loading ? '…' : fmt$(vencido)}
              </span>
            </div>
            {waLink && (
              <a className="btn ccli-wa" href={waLink} target="_blank" rel="noreferrer" title="Enviar recordatorio por WhatsApp">
                <i className="ti ti-brand-whatsapp" /> Recordar
              </a>
            )}
          </div>

          {/* Deudas pendientes */}
          <div className="form-section">
            <p className="form-section-title">Ventas pendientes</p>
            {loading ? (
              <p className="ccli-empty">Cargando...</p>
            ) : deudas.length === 0 ? (
              <p className="ccli-empty"><i className="ti ti-circle-check" /> Sin deuda pendiente</p>
            ) : (
              <table className="data-table ccli-table">
                <thead>
                  <tr>
                    <th>Venta</th>
                    <th>Vencimiento</th>
                    <th className="td-right">Monto</th>
                    <th className="td-right">Resta</th>
                  </tr>
                </thead>
                <tbody>
                  {deudas.map(v => (
                    <tr key={v.id}>
                      <td>
                        <span className="td-mono">{v.numero}</span>
                        <span className="ccli-fecha">{fmtFecha(v.fecha)}</span>
                      </td>
                      <td><VtoBadge fecha={v.fecha_vencimiento} /></td>
                      <td className="td-right td-muted">{fmt$(v.cc_monto)}</td>
                      <td className="td-right ccli-resta">{fmt$(v.pendiente)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Registrar cobro */}
          {saldo > 0 && (
            <form id="ccli-cobro-form" className="form-section" onSubmit={handleCobrar}>
              <p className="form-section-title">Registrar cobro</p>
              {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Monto $</label>
                  <input className="field-input" type="number" min="0" step="0.01" placeholder="0"
                    value={form.monto} onChange={e => setF('monto', e.target.value)} />
                  <div className="ccli-atajos">
                    {vencido > 0 && vencido < saldo && (
                      <button type="button" className="pill" onClick={() => setF('monto', String(+vencido.toFixed(2)))}>
                        Vencido {fmt$(vencido)}
                      </button>
                    )}
                    <button type="button" className="pill" onClick={() => setF('monto', String(+saldo.toFixed(2)))}>
                      Total {fmt$(saldo)}
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Medio</label>
                  <select className="field-select" value={form.medio} onChange={e => setF('medio', e.target.value)}>
                    {MEDIOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Fecha</label>
                  <input className="field-input" type="date" value={form.fecha} onChange={e => setF('fecha', e.target.value)} />
                </div>
                {form.medio !== 'efectivo' && (
                  <div className="field">
                    <label className="field-label">Referencia</label>
                    <input className="field-input" placeholder="N° operación" value={form.referencia}
                      onChange={e => setF('referencia', e.target.value)} />
                  </div>
                )}
              </div>
              {montoNum > 0 && montoNum <= saldo + 0.009 && (
                <p className="field-hint">
                  {montoNum >= saldo - 0.009 ? 'Cancela toda la deuda.' : `Pago parcial — queda ${fmt$(saldo - montoNum)}.`}
                  {' '}Se aplica primero a lo que vence antes.
                  {form.medio === 'efectivo' && ' Si hay caja abierta, entra como ingreso.'}
                </p>
              )}
            </form>
          )}

          {/* Historial de cobros */}
          {cobros.length > 0 && (
            <div className="form-section">
              <p className="form-section-title">Cobros registrados</p>
              <div className="ccli-cobros">
                {cobros.map(c => (
                  <div key={c.id} className="ccli-cobro">
                    <i className="ti ti-arrow-down-left ccli-cobro-icon" />
                    <div className="ccli-cobro-info">
                      <span>{fmtFecha(c.fecha)} · {MEDIO_LABEL[c.medio_pago] || c.medio_pago}</span>
                      {c.referencia && <span className="td-muted">Ref. {c.referencia}</span>}
                    </div>
                    <span className="ccli-cobro-monto">{fmt$(c.monto)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="panel-footer">
          <button type="button" className="btn" onClick={onCerrar}><i className="ti ti-x" /> Cerrar</button>
          {saldo > 0 && (
            <button type="submit" form="ccli-cobro-form" className="btn btn--primary" disabled={saving || montoNum <= 0}>
              <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
              {saving ? 'Registrando...' : montoNum > 0 ? `Cobrar ${fmt$(montoNum)}` : 'Cobrar'}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
