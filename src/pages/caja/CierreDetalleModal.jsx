import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import './CierreDetalleModal.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

function fmtFechaLarga(str) {
  if (!str) return '—'
  const d = new Date(str)
  const fecha = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const hora  = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${fecha.charAt(0).toUpperCase() + fecha.slice(1)} · ${hora}`
}

function fmtHora(str) {
  if (!str) return '—'
  return new Date(str).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const MEDIO_LABEL = {
  efectivo:         'Efectivo',
  tarjeta_debito:   'Débito',
  tarjeta_credito:  'Crédito',
  transferencia:    'Transferencia',
  mercado_pago:     'Mercado Pago',
  cuenta_corriente: 'Cta. corriente',
}
const MEDIO_ORDER = Object.keys(MEDIO_LABEL)

const MEDIOS_MAP = [
  { key: 'total_ventas_efectivo', label: 'Efectivo',        icon: 'ti-cash',            color: '#22c55e' },
  { key: 'total_ventas_debito',   label: 'Débito',          icon: 'ti-credit-card',     color: '#6366f1' },
  { key: 'total_ventas_credito',  label: 'Crédito',         icon: 'ti-credit-card',     color: '#8b5cf6' },
  { key: 'total_ventas_transfer', label: 'Transferencia',   icon: 'ti-building-bank',   color: '#3b82f6' },
  { key: 'total_ventas_mp',       label: 'Mercado Pago',    icon: 'ti-currency-dollar', color: '#06b6d4' },
  { key: 'total_ventas_cc',       label: 'Cta. corriente',  icon: 'ti-notebook',        color: '#f59e0b' },
]

export default function CierreDetalleModal({ cierre, onCerrar, onDistribucionConfirmada }) {
  const medios = MEDIOS_MAP
    .map(m => ({ ...m, monto: Number(cierre[m.key] || 0) }))
    .filter(m => m.monto > 0)

  const totalVendido  = medios.reduce((s, m) => s + m.monto, 0)
  const efectivo      = Number(cierre.total_ventas_efectivo || 0)
  const saldoAp       = Number(cierre.saldo_apertura || 0)
  const totalIngresos = Number(cierre.total_ingresos_extra || 0)
  const totalRetiros  = Number(cierre.total_egresos  || 0)
  const totalEsperado = saldoAp + efectivo + totalIngresos - totalRetiros
  const contado       = cierre.efectivo_contado != null ? Number(cierre.efectivo_contado) : null
  const diferencia    = cierre.diferencia != null ? Number(cierre.diferencia) : null
  const totalCC       = (cierre.porCC || []).reduce((s, cc) => s + cc.total, 0)
  const esEjemplo     = String(cierre.id).startsWith('ej-')

  // Distribución por CC — usa el efectivo real cobrado por cada sección
  const calcPorCC = () =>
    Object.fromEntries(
      (cierre.porCC || []).map(cc => [cc.id, String(Math.round(cc.mediosPago?.efectivo || 0))])
    )

  const [montosPorCC, setMontosPorCC] = useState(calcPorCC)
  const [confirmando, setConfirmando] = useState(false)
  const [distribuido, setDistribuido] = useState(cierre.monto_distribuido != null)
  const [errorDist,   setErrorDist]   = useState('')

  const totalRetirado  = Object.values(montosPorCC).reduce((s, v) => s + (Number(v) || 0), 0)
  const saldoProxApert = contado != null ? contado - totalRetirado : null

  async function confirmarDistribucion() {
    if (esEjemplo) return
    setConfirmando(true); setErrorDist('')
    const { error } = await supabase
      .from('cierres_caja')
      .update({ monto_distribuido: totalRetirado })
      .eq('id', cierre.id)
    setConfirmando(false)
    if (error) { setErrorDist(error.message); return }
    setDistribuido(true)
    onDistribucionConfirmada?.({ id: cierre.id, monto_distribuido: totalRetirado })
  }

  function imprimir() {
    document.body.classList.add('cierre-imprimiendo')
    window.print()
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('cierre-imprimiendo')
    }, { once: true })
  }

  return (
    <>
      <div className="panel-backdrop cierre-det-backdrop" onClick={onCerrar} />
      <div className="panel cierre-det-panel">

        {/* ── Header ── */}
        <div className="panel-header cierre-det-header">
          <div className="cierre-det-header-info">
            <div className="cierre-det-icon">
              <i className="ti ti-lock" />
            </div>
            <div>
              <h2 className="panel-title">
                Cierre de caja
                {esEjemplo && (
                  <span className="cierre-det-chip-ej">ejemplo</span>
                )}
              </h2>
              <p className="cierre-det-subtitle">{fmtFechaLarga(cierre.fecha_cierre)}</p>
            </div>
          </div>
          <div className="cierre-det-header-actions">
            <button type="button" className="btn" onClick={imprimir}>
              <i className="ti ti-printer" /> Imprimir
            </button>
            <button type="button" className="btn-icon" onClick={onCerrar} title="Cerrar">
              <i className="ti ti-x" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="panel-body cierre-det-body">

          {/* Resumen del día */}
          <div className="cierre-det-resumen">
            <div className="cierre-det-stat">
              <span className="cierre-det-stat-label">Apertura</span>
              <span className="cierre-det-stat-val">{fmtHora(cierre.fecha_apertura)}</span>
            </div>
            <div className="cierre-det-stat">
              <span className="cierre-det-stat-label">Cierre</span>
              <span className="cierre-det-stat-val">{fmtHora(cierre.fecha_cierre)}</span>
            </div>
            <div className="cierre-det-stat cierre-det-stat--right">
              <span className="cierre-det-stat-label">Total del día</span>
              <span className="cierre-det-stat-val cierre-det-total-big">{fmt$(totalVendido)}</span>
            </div>
          </div>

          {/* Medios de pago */}
          {medios.length > 0 && (
            <div className="form-section">
              <p className="form-section-title">
                <i className="ti ti-wallet" /> Medios de pago
              </p>
              <div className="cierre-det-medios">
                {medios.map(m => {
                  const pct = totalVendido > 0 ? Math.round((m.monto / totalVendido) * 100) : 0
                  return (
                    <div key={m.key} className="cierre-det-medio">
                      <span className="cierre-det-medio-label">
                        <span className="cierre-det-medio-dot" style={{ background: m.color }} />
                        {m.label}
                      </span>
                      <div className="cierre-det-medio-bar">
                        <div style={{ width: `${pct}%`, background: m.color }} />
                      </div>
                      <span className="cierre-det-medio-pct">{pct}%</span>
                      <span className="cierre-det-medio-monto">{fmt$(m.monto)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Arqueo de efectivo */}
          <div className="form-section">
            <p className="form-section-title">
              <i className="ti ti-cash" /> Arqueo de efectivo
            </p>
            <div className="cierre-det-arqueo">
              <div className="cierre-det-arq-row">
                <span>Saldo inicial</span>
                <span>{fmt$(saldoAp)}</span>
              </div>
              <div className="cierre-det-arq-row cierre-det-arq-row--pos">
                <span>Ventas en efectivo</span>
                <span>+ {fmt$(efectivo)}</span>
              </div>
              {totalIngresos > 0 && (
                <div className="cierre-det-arq-row cierre-det-arq-row--ingreso">
                  <span><i className="ti ti-arrow-up-circle" style={{ fontSize: 11, marginRight: 4 }} />Ingresos</span>
                  <span>+ {fmt$(totalIngresos)}</span>
                </div>
              )}
              {totalRetiros > 0 && (
                <div className="cierre-det-arq-row cierre-det-arq-row--retiro">
                  <span><i className="ti ti-arrow-down-circle" style={{ fontSize: 11, marginRight: 4 }} />Retiros</span>
                  <span>- {fmt$(totalRetiros)}</span>
                </div>
              )}
              <div className="cierre-det-arq-row cierre-det-arq-row--sep cierre-det-arq-row--bold">
                <span>Total esperado</span>
                <span>{fmt$(totalEsperado)}</span>
              </div>
              {contado !== null && (
                <div className="cierre-det-arq-row">
                  <span>Efectivo contado</span>
                  <span>{fmt$(contado)}</span>
                </div>
              )}
              {diferencia !== null && (
                <div className={`cierre-det-arq-row cierre-det-arq-row--dif ${diferencia < 0 ? 'neg' : diferencia > 0 ? 'pos' : 'zero'}`}>
                  <span>Diferencia</span>
                  <span>{diferencia >= 0 ? '+' : ''}{fmt$(diferencia)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Distribución por sección / CC */}
          {cierre.porCC?.length > 0 && (
            <div className="form-section">
              <p className="form-section-title">
                <i className="ti ti-chart-pie" /> Distribución por sección
              </p>
              <div className="cierre-det-cc-grid">
                {cierre.porCC.map(cc => {
                  const pct = totalCC > 0 ? Math.round((cc.total / totalCC) * 100) : 0
                  return (
                    <div
                      key={cc.id}
                      className="cierre-det-cc-card"
                      style={{ borderLeftColor: cc.color || 'var(--color-accent)' }}
                    >
                      {/* Nombre + % */}
                      <div className="cierre-det-cc-header">
                        <span className="cierre-det-cc-dot" style={{ background: cc.color || 'var(--color-accent)' }} />
                        <span className="cierre-det-cc-nombre">{cc.nombre}</span>
                        <span className="cierre-det-cc-pct-badge">{pct}%</span>
                      </div>

                      {/* Barra proporcional */}
                      <div className="cierre-det-cc-bar-track">
                        <div
                          className="cierre-det-cc-bar-fill"
                          style={{ width: `${pct}%`, background: cc.color || 'var(--color-accent)' }}
                        />
                      </div>

                      {/* Desglose por medio de pago */}
                      <div className="cierre-det-cc-mp-list">
                        {MEDIO_ORDER
                          .filter(mp => (cc.mediosPago?.[mp] || 0) > 0)
                          .map(mp => (
                            <div key={mp} className="cierre-det-cc-mp-row">
                              <span className="cierre-det-cc-mp-label">{MEDIO_LABEL[mp]}</span>
                              <span className="cierre-det-cc-mp-monto">{fmt$(Math.round(cc.mediosPago[mp]))}</span>
                            </div>
                          ))
                        }
                        <div className="cierre-det-cc-mp-row cierre-det-cc-mp-row--total">
                          <span className="cierre-det-cc-mp-label">Total ventas</span>
                          <span className="cierre-det-cc-mp-monto">{fmt$(cc.total)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Distribución efectuada */}
          {contado != null && (cierre.porCC?.length > 0 || distribuido) && (
            <div className="form-section">
              <p className="form-section-title">
                <i className="ti ti-arrows-split" /> Distribución efectuada
              </p>

              {distribuido ? (
                /* ── Confirmado ── */
                <div className="cierre-dist-confirmado">
                  {(cierre.porCC || []).map(cc => (
                    <div key={cc.id} className="cierre-dist-cc-row cierre-dist-cc-row--done">
                      <span className="cierre-dist-cc-dot" style={{ background: cc.color || 'var(--color-accent)' }} />
                      <span className="cierre-dist-cc-nombre">{cc.nombre}</span>
                      <span className="cierre-dist-cc-entregado">− {fmt$(Math.round(cc.mediosPago?.efectivo || 0))}</span>
                    </div>
                  ))}
                  <div className="cierre-dist-row cierre-dist-row--result" style={{ marginTop: 6 }}>
                    <span>Total retirado</span>
                    <span className="cierre-dist-val--neg">− {fmt$(Number(cierre.monto_distribuido || totalRetirado))}</span>
                  </div>
                  <div className="cierre-dist-row cierre-dist-row--result">
                    <span>Saldo para próxima apertura</span>
                    <span className="cierre-dist-saldo">{fmt$(contado - Number(cierre.monto_distribuido || totalRetirado))}</span>
                  </div>
                  {!esEjemplo && (
                    <button type="button" className="cierre-dist-rehacer" onClick={() => setDistribuido(false)}>
                      <i className="ti ti-edit" /> Corregir
                    </button>
                  )}
                </div>
              ) : (
                /* ── Formulario por CC ── */
                <div className="cierre-dist-form">
                  <div className="cierre-dist-cc-list">
                    {(cierre.porCC || []).map(cc => {
                      const pct  = totalCC > 0 ? cc.total / totalCC : 0
                      const calc = Math.round(pct * efectivo)
                      return (
                        <div key={cc.id} className="cierre-dist-cc-row">
                          <span className="cierre-dist-cc-dot" style={{ background: cc.color || 'var(--color-accent)' }} />
                          <span className="cierre-dist-cc-nombre">{cc.nombre}</span>
                          <span className="cierre-dist-cc-calc">{fmt$(calc)}</span>
                          <input
                            className="cierre-dist-cc-input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={montosPorCC[cc.id] ?? ''}
                            onChange={e => setMontosPorCC(p => ({ ...p, [cc.id]: e.target.value }))}
                            disabled={esEjemplo}
                          />
                        </div>
                      )
                    })}
                  </div>

                  <div className="cierre-dist-preview">
                    <div className="cierre-dist-preview-row">
                      <span>Total retirado</span>
                      <span className="cierre-dist-val--neg">− {fmt$(totalRetirado)}</span>
                    </div>
                    <div className="cierre-dist-preview-row cierre-dist-preview-row--main">
                      <span>Saldo para próxima apertura</span>
                      <span className="cierre-dist-saldo">{fmt$(saldoProxApert ?? 0)}</span>
                    </div>
                  </div>

                  {errorDist && (
                    <p className="error-banner" style={{ fontSize: 11, marginTop: 6 }}>
                      <i className="ti ti-alert-circle" /> {errorDist}
                    </p>
                  )}

                  <button
                    type="button"
                    className="btn btn--filled"
                    style={{ marginTop: 10, alignSelf: 'flex-start' }}
                    onClick={confirmarDistribucion}
                    disabled={confirmando || esEjemplo}
                  >
                    <i className={`ti ${confirmando ? 'ti-loader-2' : 'ti-check'}`} />
                    {confirmando ? 'Guardando...' : 'Confirmar distribución'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Notas de cierre */}
          {cierre.notas_cierre && (
            <div className="form-section">
              <p className="form-section-title">
                <i className="ti ti-notes" /> Notas
              </p>
              <p className="cierre-det-notas">{cierre.notas_cierre}</p>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="panel-footer">
          <button type="button" className="btn" onClick={onCerrar}>Cerrar</button>
          <button type="button" className="btn btn--filled" onClick={imprimir}>
            <i className="ti ti-printer" /> Imprimir
          </button>
        </div>

      </div>
    </>
  )
}
