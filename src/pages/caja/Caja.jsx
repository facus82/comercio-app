import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCaja } from '../../hooks/useCaja'
import { useCajaMetricas } from '../../hooks/useCajaMetricas'
import CierreDetalleModal from './CierreDetalleModal'
import './Caja.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

function fmtFechaHora(str) {
  if (!str) return '—'
  const d = new Date(str)
  return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function fmtHora(str) {
  if (!str) return '—'
  return new Date(str).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const MEDIOS = [
  { key: 'efectivo',      label: 'Efectivo',       icon: 'ti-cash'           },
  { key: 'debito',        label: 'Débito',          icon: 'ti-credit-card'    },
  { key: 'credito',       label: 'Crédito',         icon: 'ti-credit-card'    },
  { key: 'transferencia', label: 'Transferencia',   icon: 'ti-building-bank'  },
  { key: 'mercado_pago',  label: 'Mercado Pago',    icon: 'ti-currency-dollar'},
  { key: 'cc',            label: 'Cta. corriente',  icon: 'ti-notebook'       },
]

const FORM_MOV_VACIO = { tipo: 'ingreso', monto: '', concepto: '' }

export default function Caja() {
  const { perfil } = useAuth()
  const comercioId  = perfil?.comercio?.id
  const esPropietario = perfil?.rol === 'propietario'

  const { cajaActual, historial, movimientos, loading, abrir, cerrar, registrarMovimiento } = useCaja(comercioId, perfil?.id)
  const { metricas, centrosCostos, loadingMetricas } = useCajaMetricas(
    comercioId,
    cajaActual?.fecha_apertura ?? null
  )

  const [saldoApertura,   setSaldoApertura]   = useState('')
  const [abriendo,        setAbriendo]        = useState(false)
  const [efectivoContado, setEfectivoContado] = useState('')
  const [notasCierre,     setNotasCierre]     = useState('')
  const [cerrando,        setCerrando]        = useState(false)
  const [activeTab,       setActiveTab]       = useState('general')
  const [error,           setError]           = useState('')

  // Formulario de movimientos
  const [showMovForm,   setShowMovForm]   = useState(false)
  const [formMov,       setFormMov]       = useState(FORM_MOV_VACIO)
  const [savingMov,     setSavingMov]     = useState(false)
  const [errorMov,      setErrorMov]      = useState('')

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
    else { setEfectivoContado(''); setNotasCierre('') }
  }

  async function handleMovimiento(e) {
    e.preventDefault()
    setSavingMov(true); setErrorMov('')
    const res = await registrarMovimiento(formMov)
    setSavingMov(false)
    if (res.error) { setErrorMov(res.error.message); return }
    setFormMov(FORM_MOV_VACIO)
    setShowMovForm(false)
  }

  // Cálculos arqueo
  const efectivoDelDia = metricas?.porMedioPago?.efectivo ?? 0
  const saldoApert     = Number(cajaActual?.saldo_apertura) || 0
  const totalIngresos  = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
  const totalRetiros   = movimientos.filter(m => m.tipo === 'retiro').reduce((s, m) => s + Number(m.monto), 0)
  const totalEsperado  = saldoApert + efectivoDelDia + totalIngresos - totalRetiros
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

                {/* Movimientos de caja */}
                <div className="form-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p className="form-section-title" style={{ margin: 0 }}>
                      Movimientos de caja
                    </p>
                    <button
                      className="btn btn--primary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => { setShowMovForm(p => !p); setErrorMov('') }}
                    >
                      <i className={`ti ${showMovForm ? 'ti-x' : 'ti-plus'}`} />
                      {showMovForm ? 'Cancelar' : 'Nuevo movimiento'}
                    </button>
                  </div>

                  {showMovForm && (
                    <form onSubmit={handleMovimiento} className="caja-mov-form">
                      {errorMov && (
                        <div className="error-banner" style={{ marginBottom: 8, fontSize: 12 }}>
                          <i className="ti ti-alert-circle" /> {errorMov}
                        </div>
                      )}
                      <div className="caja-mov-tipo-btns">
                        <button
                          type="button"
                          className={`caja-mov-tipo-btn ${formMov.tipo === 'ingreso' ? 'caja-mov-tipo-btn--ingreso' : ''}`}
                          onClick={() => setFormMov(p => ({ ...p, tipo: 'ingreso' }))}
                        >
                          <i className="ti ti-arrow-up-circle" /> Ingreso
                        </button>
                        <button
                          type="button"
                          className={`caja-mov-tipo-btn ${formMov.tipo === 'retiro' ? 'caja-mov-tipo-btn--retiro' : ''}`}
                          onClick={() => setFormMov(p => ({ ...p, tipo: 'retiro' }))}
                        >
                          <i className="ti ti-arrow-down-circle" /> Retiro
                        </button>
                      </div>
                      <div className="caja-mov-form-fields">
                        <div className="field">
                          <label className="field-label">Monto $</label>
                          <input
                            className="field-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="0"
                            value={formMov.monto}
                            onChange={e => setFormMov(p => ({ ...p, monto: e.target.value }))}
                            required
                            autoFocus
                          />
                        </div>
                        <div className="field">
                          <label className="field-label">Concepto</label>
                          <input
                            className="field-input"
                            placeholder={formMov.tipo === 'ingreso' ? 'Ej: cambio, vuelto...' : 'Ej: pago proveedor...'}
                            value={formMov.concepto}
                            onChange={e => setFormMov(p => ({ ...p, concepto: e.target.value }))}
                          />
                        </div>
                      </div>
                      <button type="submit" className="btn btn--filled" disabled={savingMov} style={{ fontSize: 12 }}>
                        <i className={`ti ${savingMov ? 'ti-loader-2' : 'ti-check'}`} />
                        {savingMov ? 'Guardando...' : `Registrar ${formMov.tipo}`}
                      </button>
                    </form>
                  )}

                  {movimientos.length === 0 ? (
                    <p className="caja-mov-empty">Sin movimientos registrados hoy.</p>
                  ) : (
                    <div className="caja-mov-list">
                      {movimientos.map(m => (
                        <div key={m.id} className={`caja-mov-item caja-mov-item--${m.tipo}`}>
                          <div className="caja-mov-icon">
                            <i className={`ti ${m.tipo === 'ingreso' ? 'ti-arrow-up-circle' : 'ti-arrow-down-circle'}`} />
                          </div>
                          <div className="caja-mov-info">
                            <span className="caja-mov-tipo-label">
                              {m.tipo === 'ingreso' ? 'Ingreso' : 'Retiro'}
                            </span>
                            {m.concepto && <span className="caja-mov-concepto">{m.concepto}</span>}
                            <span className="caja-mov-hora">{fmtHora(m.created_at)}</span>
                          </div>
                          <span className="caja-mov-monto">
                            {m.tipo === 'ingreso' ? '+' : '-'}{fmt$(m.monto)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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
                      const cc    = centrosCostos.find(c => c.id === activeTab)
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
                  <span style={{ color: 'var(--color-text-success)' }}>+ {fmt$(efectivoDelDia)}</span>
                </div>

                {totalIngresos > 0 && (
                  <div className="caja-arqueo-row caja-arqueo-row--ingreso">
                    <span>
                      <i className="ti ti-arrow-up-circle" style={{ fontSize: 11, marginRight: 4 }} />
                      Ingresos
                    </span>
                    <span>+ {fmt$(totalIngresos)}</span>
                  </div>
                )}

                {totalRetiros > 0 && (
                  <div className="caja-arqueo-row caja-arqueo-row--retiro">
                    <span>
                      <i className="ti ti-arrow-down-circle" style={{ fontSize: 11, marginRight: 4 }} />
                      Retiros
                    </span>
                    <span>- {fmt$(totalRetiros)}</span>
                  </div>
                )}

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

/* ── Ejemplos estáticos para cuando no hay cierres reales ── */
const EJEMPLOS_CIERRES = [
  {
    id:                    'ej-1',
    fecha_apertura:        '2026-05-21T08:00:00',
    fecha_cierre:          '2026-05-21T22:10:00',
    saldo_apertura:        5000,
    total_ventas_efectivo: 38200,
    total_ventas_debito:   12500,
    total_ventas_credito:  0,
    total_ventas_transfer: 0,
    total_ventas_mp:       0,
    total_ingresos:        2000,
    total_retiros:         15000,
    efectivo_contado:      43000,
    diferencia:            -200,
    porCC: [
      { id: 'cc-a', nombre: 'Graciela', color: '#6366f1', total: 28400 },
      { id: 'cc-b', nombre: 'Marcela',  color: '#f59e0b', total: 22300 },
    ],
  },
  {
    id:                    'ej-2',
    fecha_apertura:        '2026-05-21T08:00:00',
    fecha_cierre:          '2026-05-21T13:30:00',
    saldo_apertura:        4000,
    total_ventas_efectivo: 31500,
    total_ventas_debito:   0,
    total_ventas_credito:  0,
    total_ventas_transfer: 8900,
    total_ventas_mp:       0,
    total_ingresos:        0,
    total_retiros:         0,
    efectivo_contado:      35500,
    diferencia:            0,
    porCC: [
      { id: 'cc-a', nombre: 'Graciela', color: '#6366f1', total: 25100 },
      { id: 'cc-b', nombre: 'Marcela',  color: '#f59e0b', total: 15300 },
    ],
  },
  {
    id:                    'ej-3',
    fecha_apertura:        '2026-05-20T08:30:00',
    fecha_cierre:          '2026-05-20T22:30:00',
    saldo_apertura:        3000,
    total_ventas_efectivo: 29700,
    total_ventas_debito:   6400,
    total_ventas_credito:  15200,
    total_ventas_transfer: 0,
    total_ventas_mp:       0,
    total_ingresos:        5000,
    total_retiros:         10000,
    efectivo_contado:      33200,
    diferencia:            500,
    porCC: [
      { id: 'cc-a', nombre: 'Graciela', color: '#6366f1', total: 33100 },
      { id: 'cc-b', nombre: 'Marcela',  color: '#f59e0b', total: 18200 },
    ],
  },
]

const MIN_VISIBLES = 3

function HistorialCierres({ historial }) {
  const [cierreDetalle, setCierreDetalle] = useState(null)

  const faltanEjemplos = Math.max(0, MIN_VISIBLES - historial.length)
  const items          = [...historial, ...EJEMPLOS_CIERRES.slice(0, faltanEjemplos)]
  const hayEjemplos    = faltanEjemplos > 0

  const chipEjemplo = (
    <span style={{
      fontSize: 9, fontWeight: 500,
      background: 'var(--color-border-tertiary)',
      color: 'var(--color-text-tertiary)',
      borderRadius: 4, padding: '1px 5px',
      letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>
      ejemplo
    </span>
  )

  return (
    <>
      <div className="form-section">
        <p className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Últimos cierres
          {hayEjemplos && chipEjemplo}
        </p>
        <div className="caja-historial-list">
          {items.map((c, idx) => {
            const esEj      = idx >= historial.length
            const totalVend = ['total_ventas_efectivo','total_ventas_debito','total_ventas_credito',
                               'total_ventas_transfer','total_ventas_mp','total_ventas_cc']
                              .reduce((s, k) => s + Number(c[k] || 0), 0)
            return (
              <button
                key={c.id}
                type="button"
                className="caja-historial-item caja-historial-item--btn"
                style={esEj ? { opacity: 0.55 } : undefined}
                onClick={() => setCierreDetalle(c)}
                title="Ver detalle"
              >
                <div className="caja-hist-fecha" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {fmtFechaHora(c.fecha_cierre)}
                  {esEj && chipEjemplo}
                  <i className="ti ti-chevron-right caja-hist-arrow" />
                </div>

                <div className="caja-hist-row caja-hist-row--total">
                  <span>Total del día</span>
                  <span style={{ color: 'var(--color-text-success)', fontWeight: 600 }}>{fmt$(totalVend)}</span>
                </div>

                {(Number(c.total_ingresos) > 0 || Number(c.total_retiros) > 0) && (
                  <div className="caja-hist-movs">
                    {Number(c.total_ingresos) > 0 && (
                      <span className="caja-hist-mov caja-hist-mov--ingreso">
                        <i className="ti ti-arrow-up-circle" /> +{fmt$(c.total_ingresos)}
                      </span>
                    )}
                    {Number(c.total_retiros) > 0 && (
                      <span className="caja-hist-mov caja-hist-mov--retiro">
                        <i className="ti ti-arrow-down-circle" /> -{fmt$(c.total_retiros)}
                      </span>
                    )}
                  </div>
                )}

                {c.diferencia != null && (
                  <div className={`caja-hist-row caja-hist-diferencia ${Number(c.diferencia) < 0 ? 'neg' : 'pos'}`}>
                    <span>Diferencia</span>
                    <span>{Number(c.diferencia) >= 0 ? '+' : ''}{fmt$(c.diferencia)}</span>
                  </div>
                )}

                {c.porCC?.length > 0 && (
                  <div className="caja-hist-cc">
                    {c.porCC.map(cc => (
                      <div key={cc.id} className="caja-hist-cc-item">
                        <span className="caja-hist-cc-dot" style={{ background: cc.color || 'var(--color-accent)' }} />
                        <span className="caja-hist-cc-nombre">{cc.nombre}</span>
                        <span className="caja-hist-cc-total">{fmt$(cc.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {cierreDetalle && (
        <CierreDetalleModal
          cierre={cierreDetalle}
          onCerrar={() => setCierreDetalle(null)}
        />
      )}
    </>
  )
}
