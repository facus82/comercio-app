import { useState, useEffect, useCallback, useMemo } from 'react'
import { useToast } from '../../hooks/useToast'
import {
  cargarVentasCC, cargarCobros, registrarCobro, armarHistorial,
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
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: Number.isInteger(Number(v) || 0) ? 0 : 2, maximumFractionDigits: 2 }).format(v || 0)

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
  const [ventasCC, setVentasCC] = useState([])
  const [cobros,   setCobros]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('pendientes')   // pendientes | historial
  const [abierta,  setAbierta]  = useState(null)           // venta expandida en historial

  const [form,   setForm]   = useState({ monto: '', medio: 'efectivo', fecha: hoyISO(), referencia: '' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    const [resV, resC] = await Promise.all([
      cargarVentasCC(comercioId, cliente.id),
      cargarCobros(cliente.id),
    ])
    setVentasCC(resV.data)
    setCobros(resC.data)
    setLoading(false)
  }, [comercioId, cliente.id])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  const historial = useMemo(() => armarHistorial(ventasCC, cobros), [ventasCC, cobros])
  const deudas    = useMemo(() => historial
    .filter(h => h.venta.estado === 'completada' && h.pendiente > 0.009)
    .map(h => ({ ...h.venta, pendiente: h.pendiente }))
    .sort((a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999')),
  [historial])

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

          {/* Pestañas */}
          <div className="pills ccli-tabs">
            <button type="button" className={`pill${tab === 'pendientes' ? ' pill--active' : ''}`} onClick={() => setTab('pendientes')}>
              <i className="ti ti-clock-dollar" /> Pendientes{deudas.length > 0 ? ` (${deudas.length})` : ''}
            </button>
            <button type="button" className={`pill${tab === 'historial' ? ' pill--active' : ''}`} onClick={() => setTab('historial')}>
              <i className="ti ti-history" /> Historial{historial.length > 0 ? ` (${historial.length})` : ''}
            </button>
          </div>

          {tab === 'historial' && (
            <div className="ccli-hist">
              {loading ? (
                <p className="ccli-empty">Cargando...</p>
              ) : historial.length === 0 ? (
                <p className="ccli-empty"><i className="ti ti-notebook-off" /> Todavía no tiene ventas a Cta. Cte.</p>
              ) : historial.map(({ venta: v, pendiente, movimientos, canceladaEl }) => {
                const open = abierta === v.id
                const estado = v.estado === 'anulada'
                  ? <span className="badge badge--neutral">Anulada</span>
                  : canceladaEl
                    ? <span className="badge badge--success"><i className="ti ti-check" /> Cancelada {fmtFecha(canceladaEl)}</span>
                    : <VtoBadge fecha={v.fecha_vencimiento} />
                return (
                  <div key={v.id} className={`ccli-hist-card${open ? ' ccli-hist-card--open' : ''}${v.estado === 'anulada' ? ' ccli-hist-card--anulada' : ''}`}>
                    <button type="button" className="ccli-hist-head" onClick={() => setAbierta(open ? null : v.id)}>
                      <div className="ccli-hist-info">
                        <span className="ccli-hist-titulo"><span className="td-mono">{v.numero}</span> · {fmtFecha(v.fecha)}</span>
                        {estado}
                      </div>
                      <div className="ccli-hist-montos">
                        <span className="ccli-hist-monto">{fmt$(v.cc_monto)}</span>
                        {pendiente > 0.009 && v.estado === 'completada' && (
                          <span className="ccli-hist-resta">resta {fmt$(pendiente)}</span>
                        )}
                      </div>
                      <i className={`ti ti-chevron-${open ? 'up' : 'down'} ccli-hist-chev`} />
                    </button>

                    {open && (
                      <ol className="ccli-timeline">
                        {/* Origen de la deuda */}
                        <li className="ccli-tl ccli-tl--origen">
                          <span className="ccli-tl-dot"><i className="ti ti-shopping-cart" /></span>
                          <div className="ccli-tl-body">
                            <div className="ccli-tl-row">
                              <span><strong>Venta {v.numero}</strong> · {fmtFecha(v.fecha)}</span>
                              <span className="ccli-tl-monto ccli-tl-monto--cargo">+{fmt$(v.cc_monto)}</span>
                            </div>
                            {(v.items || []).length > 0 && (
                              <ul className="ccli-tl-items">
                                {v.items.map((it, i) => (
                                  <li key={i}>
                                    <span>{Number(it.cantidad)} × {it.descripcion}</span>
                                    <span>{fmt$(it.subtotal)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {Number(v.recargo_monto) > 0 && (
                              <p className="ccli-tl-nota"><i className="ti ti-circle-plus" /> {v.notas || `Recargo ${fmt$(v.recargo_monto)}`}</p>
                            )}
                            {Number(v.cc_monto) < Number(v.total) - 0.009 && (
                              <p className="ccli-tl-nota">Total venta {fmt$(v.total)} · {fmt$(Number(v.total) - Number(v.cc_monto))} pagado en el momento</p>
                            )}
                            {v.fecha_vencimiento && <p className="ccli-tl-nota">Vencimiento pactado: {fmtFecha(v.fecha_vencimiento)}</p>}
                          </div>
                        </li>

                        {/* Pagos aplicados */}
                        {movimientos.map((m, i) => (
                          <li key={m.cobroId + i} className="ccli-tl ccli-tl--pago">
                            <span className="ccli-tl-dot"><i className="ti ti-arrow-down-left" /></span>
                            <div className="ccli-tl-body">
                              <div className="ccli-tl-row">
                                <span>Pago · {fmtFecha(m.fecha)} · {MEDIO_LABEL[m.medio] || m.medio}</span>
                                <span className="ccli-tl-monto ccli-tl-monto--pago">−{fmt$(m.monto)}</span>
                              </div>
                              <p className="ccli-tl-nota">
                                {m.referencia ? `Ref. ${m.referencia} · ` : ''}Saldo {fmt$(Math.max(0, m.saldo))}
                              </p>
                            </div>
                          </li>
                        ))}

                        {/* Cierre */}
                        {v.estado === 'anulada' ? (
                          <li className="ccli-tl ccli-tl--fin">
                            <span className="ccli-tl-dot"><i className="ti ti-ban" /></span>
                            <div className="ccli-tl-body"><span>Venta anulada</span></div>
                          </li>
                        ) : canceladaEl ? (
                          <li className="ccli-tl ccli-tl--ok">
                            <span className="ccli-tl-dot"><i className="ti ti-check" /></span>
                            <div className="ccli-tl-body"><span><strong>Cancelada</strong> el {fmtFecha(canceladaEl)}</span></div>
                          </li>
                        ) : (
                          <li className="ccli-tl ccli-tl--pend">
                            <span className="ccli-tl-dot"><i className="ti ti-hourglass" /></span>
                            <div className="ccli-tl-body">
                              <div className="ccli-tl-row">
                                <span>Saldo pendiente</span>
                                <span className="ccli-tl-monto">{fmt$(pendiente)}</span>
                              </div>
                            </div>
                          </li>
                        )}
                      </ol>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Deudas pendientes */}
          {tab === 'pendientes' && (<>
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

          {/* Últimos cobros (el detalle completo está en Historial) */}
          {cobros.length > 0 && (
            <div className="form-section">
              <p className="form-section-title">Últimos cobros</p>
              <div className="ccli-cobros">
                {cobros.slice(0, 5).map(c => (
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
          </>)}
        </div>

        <div className="panel-footer">
          <button type="button" className="btn" onClick={onCerrar}><i className="ti ti-x" /> Cerrar</button>
          {saldo > 0 && tab === 'pendientes' && (
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
