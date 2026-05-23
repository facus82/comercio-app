import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCaja } from '../../hooks/useCaja'
import { useCajaMetricas } from '../../hooks/useCajaMetricas'
import './Caja.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

function fmtFechaHora(str) {
  if (!str) return '—'
  const d = new Date(str)
  return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const MEDIOS = [
  { key: 'efectivo',     label: 'Efectivo',       icon: 'ti-cash'           },
  { key: 'debito',       label: 'Débito',          icon: 'ti-credit-card'    },
  { key: 'credito',      label: 'Crédito',         icon: 'ti-credit-card'    },
  { key: 'transferencia',label: 'Transferencia',   icon: 'ti-building-bank'  },
  { key: 'mercado_pago', label: 'Mercado Pago',    icon: 'ti-currency-dollar'},
  { key: 'cc',           label: 'Cta. corriente',  icon: 'ti-notebook'       },
]

export default function Caja() {
  const { perfil } = useAuth()
  const comercioId  = perfil?.comercio?.id
  const esPropietario = perfil?.rol === 'propietario'

  const { cajaActual, historial, loading, abrir, cerrar } = useCaja(comercioId, perfil?.id)
  const { metricas, centrosCostos, loadingMetricas } = useCajaMetricas(
    comercioId,
    cajaActual?.fecha_apertura ?? null
  )

  const [saldoApertura,   setSaldoApertura]   = useState('')
  const [abriendo,        setAbriendo]        = useState(false)
  const [egresosManual,   setEgresosManual]   = useState('')
  const [efectivoContado, setEfectivoContado] = useState('')
  const [notasCierre,     setNotasCierre]     = useState('')
  const [cerrando,        setCerrando]        = useState(false)
  const [activeTab,       setActiveTab]       = useState('general')
  const [error,           setError]           = useState('')

  async function handleAbrir(e) {
    e.preventDefault()
    setAbriendo(true); setError('')
    const res = await abrir(saldoApertura)
    setAbriendo(false)
    if (res.error) setError(res.error.message || 'Error al abrir caja.')
    else setSaldoApertura('')
  }

  async function handleCerrar() {
    setCerrando(true); setError('')
    const res = await cerrar({ efectivoContado, notas: notasCierre })
    setCerrando(false)
    if (res.error) setError(res.error.message || 'Error al cerrar caja.')
    else { setEfectivoContado(''); setEgresosManual(''); setNotasCierre('') }
  }

  // Cálculos arqueo
  const efectivoDelDia = metricas?.porMedioPago?.efectivo ?? 0
  const egresosNum     = Number(egresosManual) || 0
  const saldoApert     = Number(cajaActual?.saldo_apertura) || 0
  const totalEsperado  = saldoApert + efectivoDelDia - egresosNum
  const contadoNum     = Number(efectivoContado) || 0
  const diferencia     = efectivoContado !== '' ? contadoNum - totalEsperado : null

  if (loading) {
    return (
      <div className="caja-page">
        <div className="page-header"><h1 className="page-title">Caja</h1></div>
        <div className="table-loading">
          <i className="ti ti-loader-2" style={{ fontSize: 28, opacity: 0.4 }} /> Cargando...
        </div>
      </div>
    )
  }

  return (
    <div className="caja-page">
      <div className="page-header">
        <h1 className="page-title">Caja</h1>
        {cajaActual && (
          <span className="caja-estado-badge badge badge--success">
            <i className="ti ti-lock-open" /> Abierta desde {fmtFechaHora(cajaActual.fecha_apertura)}
          </span>
        )}
      </div>

      {!cajaActual ? (
        /* ── CAJA CERRADA ─────────────────────────────── */
        <div className="caja-cols">
          <div className="caja-col-main">
            {error && (
              <div className="error-banner" style={{ marginBottom: 16 }}>
                <i className="ti ti-alert-circle" /> {error}
              </div>
            )}
            <div className="form-section">
              <p className="form-section-title">Abrir caja</p>
              <form onSubmit={handleAbrir} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="field">
                  <label className="field-label">Saldo de apertura $</label>
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={saldoApertura}
                    onChange={e => setSaldoApertura(e.target.value)}
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn btn--primary" disabled={abriendo} style={{ alignSelf: 'flex-start' }}>
                  <i className={`ti ${abriendo ? 'ti-loader-2' : 'ti-lock-open'}`} />
                  {abriendo ? 'Abriendo...' : 'Abrir caja'}
                </button>
              </form>
            </div>
          </div>
          <div className="caja-col-historial">
            <HistorialCierres historial={historial} />
          </div>
        </div>
      ) : (
        /* ── CAJA ABIERTA ─────────────────────────────── */
        <div className="caja-abierta-layout">

          {/* Panel principal izquierda */}
          <div className="caja-panel-main">
            {loadingMetricas ? (
              <div className="table-loading">
                <i className="ti ti-loader-2" style={{ fontSize: 20, opacity: 0.4 }} /> Cargando métricas...
              </div>
            ) : (
              <>
                {/* Métricas del día */}
                <div className="caja-metricas">
                  <div className="caja-stat">
                    <span className="caja-stat-label">Total vendido</span>
                    <span className="caja-stat-val">{fmt$(metricas?.totalVendido)}</span>
                  </div>
                  <div className="caja-stat">
                    <span className="caja-stat-label">Operaciones</span>
                    <span className="caja-stat-val">{metricas?.cantOps ?? 0}</span>
                  </div>
                  <div className="caja-stat">
                    <span className="caja-stat-label">Comprobantes</span>
                    <span className="caja-stat-val">{metricas?.cantComprobantes ?? 0}</span>
                  </div>
                </div>

                {/* Desglose por medio de pago */}
                <div className="form-section">
                  <p className="form-section-title">Medios de pago</p>
                  <div className="caja-medios-list">
                    {MEDIOS.map(({ key, label, icon }) => {
                      const monto = metricas?.porMedioPago?.[key] ?? 0
                      if (monto === 0 && key !== 'efectivo') return null
                      const total = metricas?.totalVendido || 0
                      const pct   = total > 0 ? Math.round((monto / total) * 100) : 0
                      return (
                        <div key={key} className="caja-medio-item">
                          <div className="caja-medio-header">
                            <span className="caja-medio-label">
                              <i className={`ti ${icon}`} /> {label}
                            </span>
                            <span className="caja-medio-monto">{fmt$(monto)}</span>
                          </div>
                          <div className="caja-medio-bar-track">
                            <div className="caja-medio-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Tabs por centro de costo */}
                {centrosCostos.length > 0 && (
                  <div className="form-section">
                    <p className="form-section-title">Por centro de costos</p>
                    <div className="caja-tabs">
                      <button
                        className={`caja-tab${activeTab === 'general' ? ' caja-tab--active' : ''}`}
                        onClick={() => setActiveTab('general')}
                      >
                        Vista general
                      </button>
                      {centrosCostos.map(cc => (
                        <button
                          key={cc.id}
                          className={`caja-tab${activeTab === cc.id ? ' caja-tab--active' : ''}`}
                          onClick={() => setActiveTab(cc.id)}
                        >
                          {cc.nombre}
                        </button>
                      ))}
                    </div>

                    {activeTab === 'general' ? (
                      <div className="caja-cc-grid">
                        {metricas?.porCC?.map(cc => (
                          <div key={cc.id} className="caja-cc-card">
                            <div
                              className="caja-cc-nombre"
                              style={{ borderLeftColor: cc.color || 'var(--color-border-primary)' }}
                            >
                              {cc.nombre}
                            </div>
                            <div className="caja-cc-total">{fmt$(cc.total)}</div>
                            <div className="caja-cc-sub">{cc.cantItems} items</div>
                          </div>
                        ))}
                        {(!metricas?.porCC?.length) && (
                          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                            Sin ventas por centro de costos aún.
                          </p>
                        )}
                      </div>
                    ) : (() => {
                      const cc   = centrosCostos.find(c => c.id === activeTab)
                      const datos = metricas?.porCC?.find(c => c.id === activeTab)
                      return (
                        <div className="caja-cc-detail">
                          <div
                            className="caja-cc-header"
                            style={{ borderLeftColor: cc?.color || 'var(--color-border-primary)' }}
                          >
                            <span className="caja-cc-nombre-big">{cc?.nombre}</span>
                          </div>
                          <div className="caja-cc-stats">
                            <div className="caja-stat">
                              <span className="caja-stat-label">Total vendido</span>
                              <span className="caja-stat-val">{fmt$(datos?.total ?? 0)}</span>
                            </div>
                            <div className="caja-stat">
                              <span className="caja-stat-label">Items</span>
                              <span className="caja-stat-val">{datos?.cantItems ?? 0}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Panel arqueo derecha */}
          <div className="caja-panel-arqueo">
            {error && (
              <div className="error-banner" style={{ marginBottom: 12 }}>
                <i className="ti ti-alert-circle" /> {error}
              </div>
            )}
            <div className="form-section">
              <p className="form-section-title">Arqueo de caja</p>
              <div className="caja-arqueo-rows">
                <div className="caja-arqueo-row">
                  <span>Saldo inicial</span>
                  <span>{fmt$(cajaActual.saldo_apertura)}</span>
                </div>
                <div className="caja-arqueo-row">
                  <span>Ventas en efectivo</span>
                  <span style={{ color: 'var(--color-text-success)' }}>{fmt$(efectivoDelDia)}</span>
                </div>

                <div className="field" style={{ margin: '4px 0' }}>
                  <label className="field-label">Egresos manuales $</label>
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={egresosManual}
                    onChange={e => setEgresosManual(e.target.value)}
                  />
                </div>

                <div className="caja-arqueo-row caja-arqueo-row--total">
                  <span>Total esperado</span>
                  <span>{fmt$(totalEsperado)}</span>
                </div>

                <div className="field" style={{ margin: '4px 0' }}>
                  <label className="field-label">Efectivo contado $</label>
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={efectivoContado}
                    onChange={e => setEfectivoContado(e.target.value)}
                  />
                </div>

                {diferencia !== null && (
                  <div className={`caja-arqueo-diferencia ${diferencia >= 0 ? 'pos' : 'neg'}`}>
                    <span>Diferencia</span>
                    <span>{diferencia >= 0 ? '+' : ''}{fmt$(diferencia)}</span>
                  </div>
                )}
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <label className="field-label">Notas de cierre</label>
                <textarea
                  className="field-textarea"
                  rows={2}
                  placeholder="Observaciones opcionales..."
                  value={notasCierre}
                  onChange={e => setNotasCierre(e.target.value)}
                />
              </div>

              <div className="caja-arqueo-actions">
                <button className="btn" type="button" onClick={() => window.print()}>
                  <i className="ti ti-printer" /> Imprimir
                </button>
                {esPropietario ? (
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={cerrando}
                    onClick={handleCerrar}
                  >
                    <i className={`ti ${cerrando ? 'ti-loader-2' : 'ti-lock'}`} />
                    {cerrando ? 'Cerrando...' : 'Cerrar caja'}
                  </button>
                ) : (
                  <span className="caja-rol-hint">
                    <i className="ti ti-info-circle" /> Solo el propietario puede cerrar la caja.
                  </span>
                )}
              </div>
            </div>

            {historial.length > 0 && <HistorialCierres historial={historial} />}
          </div>
        </div>
      )}
    </div>
  )
}

function HistorialCierres({ historial }) {
  return (
    <div className="form-section">
      <p className="form-section-title">Últimos cierres</p>
      {historial.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Sin cierres anteriores.</p>
      ) : (
        <div className="caja-historial-list">
          {historial.map(c => (
            <div key={c.id} className="caja-historial-item">
              <div className="caja-hist-fecha">{fmtFechaHora(c.fecha_cierre)}</div>
              <div className="caja-hist-row"><span>Apertura</span><span>{fmt$(c.saldo_apertura)}</span></div>
              {c.total_ventas_efectivo > 0 && (
                <div className="caja-hist-row"><span>Efectivo</span><span>{fmt$(c.total_ventas_efectivo)}</span></div>
              )}
              {c.total_ventas_debito > 0 && (
                <div className="caja-hist-row"><span>Débito</span><span>{fmt$(c.total_ventas_debito)}</span></div>
              )}
              {c.total_ventas_credito > 0 && (
                <div className="caja-hist-row"><span>Crédito</span><span>{fmt$(c.total_ventas_credito)}</span></div>
              )}
              {c.total_ventas_transfer > 0 && (
                <div className="caja-hist-row"><span>Transferencia</span><span>{fmt$(c.total_ventas_transfer)}</span></div>
              )}
              {c.efectivo_contado != null && (
                <div className="caja-hist-row caja-hist-row--sep">
                  <span>Contado</span><span>{fmt$(c.efectivo_contado)}</span>
                </div>
              )}
              {c.diferencia != null && (
                <div className={`caja-hist-row caja-hist-diferencia ${Number(c.diferencia) < 0 ? 'neg' : 'pos'}`}>
                  <span>Diferencia</span>
                  <span>{Number(c.diferencia) >= 0 ? '+' : ''}{fmt$(c.diferencia)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
