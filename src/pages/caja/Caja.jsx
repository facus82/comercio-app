import { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCaja } from '../../hooks/useCaja'
import { useCajaMetricas } from '../../hooks/useCajaMetricas'
import CierreDetalleModal from './CierreDetalleModal'
import ArqueoModal from './ArqueoModal'
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
  return new Date(str).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const MEDIOS = [
  { key: 'efectivo',      label: 'Efectivo',       icon: 'ti-cash'           },
  { key: 'debito',        label: 'Débito',          icon: 'ti-credit-card'    },
  { key: 'credito',       label: 'Crédito',         icon: 'ti-credit-card'    },
  { key: 'transferencia', label: 'Transferencia',   icon: 'ti-building-bank'  },
  { key: 'mercado_pago',  label: 'Mercado Pago',    icon: 'ti-currency-dollar'},
  { key: 'cc',            label: 'Cta. corriente',  icon: 'ti-notebook'       },
]

const FORM_MOV_VACIO = { tipo: 'ingreso', monto: '', concepto: '', centro_costo_id: '', nro_comprobante: '' }

export default function Caja() {
  const { perfil } = useAuth()
  const comercioId  = perfil?.comercio?.id
  const esPropietario = perfil?.rol === 'propietario'

  const { cajaActual, historial, movimientos, loading, abrir, cerrar, registrarMovimiento, recargar } = useCaja(comercioId, perfil?.id)
  const { metricas, centrosCostos, pagosEfectivo, loadingMetricas } = useCajaMetricas(
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
  const [showMovForm,      setShowMovForm]      = useState(false)
  const [formMov,          setFormMov]          = useState(FORM_MOV_VACIO)
  const [savingMov,        setSavingMov]        = useState(false)
  const [errorMov,         setErrorMov]         = useState('')
  const [showArqueoApert,  setShowArqueoApert]  = useState(false)
  const [showArqueoCierre, setShowArqueoCierre] = useState(false)

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
    if (res.error) {
      setError(res.error.message || 'Error al cerrar caja.')
    } else {
      setEfectivoContado(''); setNotasCierre('')
      // Recarga el historial para que se calcule porCC (distribución por sección)
      recargar()
    }
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

  // Ledger ordenado cronológicamente con saldo acumulado
  const ledger = useMemo(() => {
    if (!cajaActual) return []
    const entries = [
      ...pagosEfectivo.map(p => ({
        tipo: 'venta',
        hora: p.created_at,
        desc: p.venta?.numero ? `Venta #${p.venta.numero} — efectivo` : 'Venta efectivo',
        monto: Number(p.monto),
      })),
      ...movimientos.map(m => {
        let desc = m.tipo === 'ingreso' ? 'Ingreso' : 'Retiro'
        if (m.tipo === 'retiro' && m.centro_costo?.nombre) desc = `Retiro — ${m.centro_costo.nombre}`
        if (m.concepto) desc += m.tipo === 'retiro' && m.centro_costo?.nombre ? ` (${m.concepto})` : `: ${m.concepto}`
        if (m.nro_comprobante) desc += ` · ${m.nro_comprobante}`
        return {
          tipo: m.tipo,
          hora: m.created_at,
          desc,
          monto: m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto),
        }
      }),
    ].sort((a, b) => new Date(a.hora) - new Date(b.hora))

    let balance = Number(cajaActual.saldo_apertura) || 0
    return entries.map(e => {
      balance += e.monto
      return { ...e, balance }
    })
  }, [cajaActual, pagosEfectivo, movimientos])

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
            {historial.length > 0 && historial[0].efectivo_contado != null && (() => {
              const ult = historial[0]
              const tieneDist = ult.monto_distribuido != null
              const saldoRef  = tieneDist
                ? Number(ult.efectivo_contado) - Number(ult.monto_distribuido)
                : Number(ult.efectivo_contado)
              return (
                <div className="caja-ref-cierre">
                  <i className="ti ti-history" />
                  <span>Último cierre</span>
                  <strong>{fmt$(saldoRef)}</strong>
                  <span className="caja-ref-cierre-meta">
                    {tieneDist ? 'saldo tras distribución' : 'efectivo contado'} · {fmtFechaHora(ult.fecha_cierre)}
                  </span>
                  {ult.diferencia != null && (
                    <span className={`caja-ref-cierre-dif ${Number(ult.diferencia) < 0 ? 'neg' : 'pos'}`}>
                      {Number(ult.diferencia) >= 0 ? '+' : ''}{fmt$(ult.diferencia)}
                    </span>
                  )}
                </div>
              )
            })()}

            <div className="form-section">
              <p className="form-section-title">Abrir caja</p>
              <form onSubmit={handleAbrir} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="field">
                  <label className="field-label">Saldo de apertura $</label>
                  <div className="caja-money-input-row">
                    <div
                      className={`caja-arqueo-display${saldoApertura ? ' caja-arqueo-display--filled' : ''}`}
                      onClick={() => setShowArqueoApert(true)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setShowArqueoApert(true)}
                    >
                      {saldoApertura
                        ? fmt$(Number(saldoApertura))
                        : <span className="caja-arqueo-display-placeholder">Sin contar</span>
                      }
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => setShowArqueoApert(true)}
                    >
                      <i className="ti ti-calculator" /> Contar
                    </button>
                  </div>
                </div>
                {saldoApertura === '' && (
                  <p className="caja-arqueo-hint">
                    <i className="ti ti-info-circle" /> Hacé el arqueo de apertura para continuar.
                  </p>
                )}
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={abriendo || saldoApertura === ''}
                  style={{ alignSelf: 'flex-start' }}
                >
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
                          onClick={() => setFormMov(p => ({ ...p, tipo: 'ingreso', centro_costo_id: '' }))}
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
                      {formMov.tipo === 'retiro' && centrosCostos.length > 0 && (
                        <div className="field">
                          <label className="field-label">Centro de costos *</label>
                          <select
                            className="field-input"
                            value={formMov.centro_costo_id}
                            onChange={e => setFormMov(p => ({ ...p, centro_costo_id: e.target.value }))}
                            required
                          >
                            <option value="">— Seleccioná un centro —</option>
                            {centrosCostos.map(cc => (
                              <option key={cc.id} value={cc.id}>{cc.nombre}</option>
                            ))}
                          </select>
                        </div>
                      )}

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
                      <div className="field">
                        <label className="field-label">N° Comprobante</label>
                        <input
                          className="field-input"
                          placeholder="Ej: Fact A-00001, Remito 123..."
                          value={formMov.nro_comprobante}
                          onChange={e => setFormMov(p => ({ ...p, nro_comprobante: e.target.value }))}
                        />
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
                              {m.tipo === 'retiro' && m.centro_costo && (
                                <span
                                  className="caja-mov-cc-chip"
                                  style={{ borderLeftColor: m.centro_costo.color || 'var(--color-accent)' }}
                                >
                                  {m.centro_costo.nombre}
                                </span>
                              )}
                            </span>
                            {m.concepto && <span className="caja-mov-concepto">{m.concepto}</span>}
                            {m.nro_comprobante && (
                              <span className="caja-mov-comprobante">
                                <i className="ti ti-file-invoice" /> {m.nro_comprobante}
                              </span>
                            )}
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

                {/* Composición del saldo — ledger cronológico */}
                <div className="form-section">
                  <p className="form-section-title">Composición del saldo</p>
                  <div className="caja-ledger">
                    <div className="caja-ledger-header">
                      <span>Hora</span>
                      <span>Descripción</span>
                      <span>Monto</span>
                      <span>Saldo</span>
                    </div>

                    {/* Apertura */}
                    <div className="caja-ledger-row caja-ledger-row--apertura">
                      <span className="caja-ledger-hora">{fmtHora(cajaActual.fecha_apertura)}</span>
                      <span className="caja-ledger-desc">Apertura de caja</span>
                      <span className="caja-ledger-monto caja-ledger-monto--pos">+{fmt$(cajaActual.saldo_apertura)}</span>
                      <span className="caja-ledger-balance">{fmt$(cajaActual.saldo_apertura)}</span>
                    </div>

                    {/* Ventas y movimientos ordenados por hora */}
                    {loadingMetricas ? (
                      <div className="caja-ledger-row">
                        <span></span>
                        <span className="caja-ledger-desc" style={{ color: 'var(--color-text-tertiary)' }}>
                          <i className="ti ti-loader-2" style={{ marginRight: 4 }} />Cargando...
                        </span>
                        <span></span><span></span>
                      </div>
                    ) : ledger.length === 0 ? (
                      <div className="caja-ledger-row">
                        <span></span>
                        <span className="caja-ledger-desc" style={{ color: 'var(--color-text-tertiary)' }}>
                          Sin movimientos aún.
                        </span>
                        <span></span><span></span>
                      </div>
                    ) : (
                      ledger.map((e, i) => (
                        <div key={i} className={`caja-ledger-row caja-ledger-row--${e.tipo}`}>
                          <span className="caja-ledger-hora">{fmtHora(e.hora)}</span>
                          <span className="caja-ledger-desc">{e.desc}</span>
                          <span className={`caja-ledger-monto ${e.monto >= 0 ? 'caja-ledger-monto--pos' : 'caja-ledger-monto--neg'}`}>
                            {e.monto >= 0 ? '+' : ''}{fmt$(e.monto)}
                          </span>
                          <span className="caja-ledger-balance">{fmt$(e.balance)}</span>
                        </div>
                      ))
                    )}

                    {/* Total esperado */}
                    <div className="caja-ledger-row caja-ledger-row--total">
                      <span></span>
                      <span className="caja-ledger-desc caja-ledger-desc--bold">Total esperado</span>
                      <span></span>
                      <span className="caja-ledger-balance caja-ledger-balance--total">{fmt$(totalEsperado)}</span>
                    </div>
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
                  <div className="caja-money-input-row">
                    <div
                      className={`caja-arqueo-display${efectivoContado ? ' caja-arqueo-display--filled' : ''}`}
                      onClick={() => setShowArqueoCierre(true)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setShowArqueoCierre(true)}
                    >
                      {efectivoContado
                        ? fmt$(Number(efectivoContado))
                        : <span className="caja-arqueo-display-placeholder">Sin contar</span>
                      }
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => setShowArqueoCierre(true)}
                    >
                      <i className="ti ti-calculator" /> Contar
                    </button>
                  </div>
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

              {efectivoContado === '' && (
                <p className="caja-arqueo-hint">
                  <i className="ti ti-info-circle" /> Hacé el arqueo de cierre para cerrar la caja.
                </p>
              )}

              <div className="caja-arqueo-actions">
                <button className="btn" type="button" onClick={() => window.print()}>
                  <i className="ti ti-printer" /> Imprimir
                </button>
                {esPropietario ? (
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={cerrando || efectivoContado === ''}
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
      {showArqueoApert && (
        <ArqueoModal
          titulo="Saldo de apertura"
          onConfirmar={total => { setSaldoApertura(String(total)); setShowArqueoApert(false) }}
          onCerrar={() => setShowArqueoApert(false)}
        />
      )}
      {showArqueoCierre && (
        <ArqueoModal
          titulo="Efectivo contado"
          onConfirmar={total => { setEfectivoContado(String(total)); setShowArqueoCierre(false) }}
          onCerrar={() => setShowArqueoCierre(false)}
        />
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
      { id: 'cc-a', nombre: 'Graciela', color: '#6366f1', total: 28400, mediosPago: { efectivo: 16200, tarjeta_debito: 7800, tarjeta_credito: 4400 } },
      { id: 'cc-b', nombre: 'Marcela',  color: '#f59e0b', total: 22300, mediosPago: { efectivo: 12400, tarjeta_debito: 6900, tarjeta_credito: 3000 } },
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
      { id: 'cc-a', nombre: 'Graciela', color: '#6366f1', total: 25100, mediosPago: { efectivo: 18600, transferencia: 6500 } },
      { id: 'cc-b', nombre: 'Marcela',  color: '#f59e0b', total: 15300, mediosPago: { efectivo: 12900, transferencia: 2400 } },
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
      { id: 'cc-a', nombre: 'Graciela', color: '#6366f1', total: 33100, mediosPago: { efectivo: 16100, tarjeta_debito: 3800, tarjeta_credito: 9200, transferencia: 4000 } },
      { id: 'cc-b', nombre: 'Marcela',  color: '#f59e0b', total: 18200, mediosPago: { efectivo: 13600, tarjeta_debito: 2600, tarjeta_credito: 2000 } },
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

                {(Number(c.total_ingresos_extra) > 0 || Number(c.total_egresos) > 0) && (
                  <div className="caja-hist-movs">
                    {Number(c.total_ingresos_extra) > 0 && (
                      <span className="caja-hist-mov caja-hist-mov--ingreso">
                        <i className="ti ti-arrow-up-circle" /> +{fmt$(c.total_ingresos_extra)}
                      </span>
                    )}
                    {Number(c.total_egresos) > 0 && (
                      <span className="caja-hist-mov caja-hist-mov--retiro">
                        <i className="ti ti-arrow-down-circle" /> -{fmt$(c.total_egresos)}
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
          onDistribucionConfirmada={({ id, monto_distribuido }) => {
            setCierreDetalle(prev => ({ ...prev, monto_distribuido }))
            recargar()
          }}
        />
      )}
    </>
  )
}
