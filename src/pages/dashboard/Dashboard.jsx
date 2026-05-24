import { useState, useEffect, useRef, forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import PagoCompraModal from './PagoCompraModal'
import './Dashboard.css'

/* ── Medios de pago ──────────────────────── */
const MEDIOS_MAP = {
  efectivo:         { label: 'Efectivo',      icon: 'ti-cash'            },
  tarjeta_debito:   { label: 'Débito',        icon: 'ti-credit-card'     },
  tarjeta_credito:  { label: 'Crédito',       icon: 'ti-credit-card'     },
  transferencia:    { label: 'Transferencia', icon: 'ti-building-bank'   },
  mercado_pago:     { label: 'Mercado Pago',  icon: 'ti-brand-mastercard'},
  cuenta_corriente: { label: 'Cta. Cte.',     icon: 'ti-file-invoice'    },
}

/* ── Helpers ─────────────────────────────── */
const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

const fmtFecha = d =>
  d ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00')) : '—'

function fmtPeriodo({ year, month }) {
  const s = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month, 1))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function diasRestantes(fechaStr) {
  if (!fechaStr) return null
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const fecha = new Date(fechaStr + 'T00:00:00')
  return Math.ceil((fecha - hoy) / 86400000)
}

function dotColor(dias) {
  if (dias == null)  return 'var(--color-neutral-300)'
  if (dias < 0)      return 'var(--color-danger-500)'
  if (dias <= 7)     return 'var(--color-danger-400)'
  if (dias <= 30)    return 'var(--color-warning-500)'
  return 'var(--color-success-500)'
}

/* ── Hook: métricas generales (sin ventas) ── */
function useDashboard(comercioId) {
  const [datos, setDatos] = useState({
    pagarProveedores: 0,
    proveedoresPendientes: [],   // [{ nombre, total, cant, estado }]
    stockBajoCount: 0,
    vencimientosCount: 0,
    vencimientos: [],
    centrosCostos: [],
    obligaciones: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!comercioId) return
    cargar()
  }, [comercioId])

  async function cargar() {
    setLoading(true)
    const en30dias = new Date(); en30dias.setDate(en30dias.getDate() + 30)

    const [
      resCompras,
      resProductos,
      resLotes,
      resCCs,
      resObligaciones,
    ] = await Promise.all([
      // Trae proveedor y estado para el desglose (igual que useCompras.js)
      supabase.from('compras')
        .select('total, estado, proveedor:proveedores(id, razon_social, nombre_fantasia)')
        .in('estado', ['pendiente','parcial'])
        .eq('comercio_id', comercioId),
      supabase.from('productos').select('id, nombre, stock_actual, stock_minimo').eq('activo', true).eq('controla_stock', true).eq('comercio_id', comercioId),
      supabase.from('lotes').select('id, fecha_vencimiento, cantidad_actual, productos(nombre)').eq('estado', 'activo').not('fecha_vencimiento', 'is', null).lte('fecha_vencimiento', en30dias.toISOString().split('T')[0]).order('fecha_vencimiento').limit(8),
      supabase.from('centros_costos').select('id, nombre, color').eq('activo', true).eq('comercio_id', comercioId),
      supabase.from('obligaciones_imp').select('id, nombre, categoria, monto_estimado, proximo_vencimiento, periodicidad').eq('activo', true).eq('comercio_id', comercioId).order('proximo_vencimiento').limit(12),
    ])

    // Agrupar compras por proveedor
    const provMap = {}
    ;(resCompras.data || []).forEach(c => {
      const key    = c.proveedor?.id ?? 'sin_proveedor'
      const nombre = c.proveedor?.nombre_fantasia || c.proveedor?.razon_social || 'Sin proveedor'
      if (!provMap[key]) provMap[key] = { id: key, nombre, total: 0, cant: 0, parcial: false }
      provMap[key].total += Number(c.total)
      provMap[key].cant  += 1
      if (c.estado === 'parcial') provMap[key].parcial = true
    })
    const proveedoresPendientes = Object.values(provMap)
      .sort((a, b) => b.total - a.total)

    const pagarProveedores = proveedoresPendientes.reduce((s, p) => s + p.total, 0)
    const stockBajoItems   = (resProductos.data || []).filter(p => Number(p.stock_actual) <= Number(p.stock_minimo))
    const vencimientos     = resLotes.data || []

    setDatos({
      pagarProveedores,
      proveedoresPendientes,
      stockBajoCount: stockBajoItems.length,
      vencimientosCount: vencimientos.length,
      vencimientos,
      centrosCostos: resCCs.data || [],
      obligaciones:  resObligaciones.data || [],
    })
    setLoading(false)
  }

  return { datos, loading, recargar: cargar }
}

/* ── Hook: ventas por período (independiente) ── */
function useVentasPeriodo(comercioId, periodo) {
  const [total,          setTotal]          = useState(0)
  const [loadingVentas,  setLoadingVentas]  = useState(true)

  useEffect(() => {
    if (!comercioId) return
    let cancelado = false

    async function cargar() {
      setLoadingVentas(true)
      const inicio = new Date(periodo.year, periodo.month, 1)
      const fin    = new Date(periodo.year, periodo.month + 1, 0, 23, 59, 59)

      const { data } = await supabase
        .from('ventas')
        .select('total')
        .gte('fecha', inicio.toISOString())
        .lte('fecha', fin.toISOString())
        .eq('estado', 'completada')
        .eq('comercio_id', comercioId)

      if (!cancelado) {
        setTotal((data || []).reduce((s, v) => s + Number(v.total), 0))
        setLoadingVentas(false)
      }
    }

    cargar()
    return () => { cancelado = true }
  }, [comercioId, periodo.year, periodo.month])

  return { total, loadingVentas }
}

/* ── Hook: ventas por centro de costo (mismo período) ── */
function useVentasPorCC(comercioId, periodo, centrosCostos) {
  const [porCC,     setPorCC]     = useState([])
  const [allItems,  setAllItems]  = useState([])   // raw con venta_id — para detalle sin re-fetch
  const [loadingCC, setLoadingCC] = useState(true)

  // Clave estable basada en los ids para no disparar loops
  const ccKey = centrosCostos.map(c => c.id).join(',')

  useEffect(() => {
    if (!comercioId || centrosCostos.length === 0) {
      setPorCC([])
      setAllItems([])
      setLoadingCC(false)
      return
    }
    let cancelado = false

    async function cargar() {
      setLoadingCC(true)
      const inicio = new Date(periodo.year, periodo.month, 1)
      const fin    = new Date(periodo.year, periodo.month + 1, 0, 23, 59, 59)

      const { data } = await supabase
        .from('venta_items')
        .select('venta_id, subtotal, producto:productos(centro_costo_id), venta:ventas!inner(comercio_id, estado, fecha)')
        .eq('venta.comercio_id', comercioId)
        .eq('venta.estado', 'completada')
        .gte('venta.fecha', inicio.toISOString())
        .lte('venta.fecha', fin.toISOString())

      if (!cancelado) {
        const items = data || []
        const resultado = centrosCostos.map(cc => {
          const itemsCC = items.filter(i => i.producto?.centro_costo_id === cc.id)
          const total   = itemsCC.reduce((s, i) => s + Number(i.subtotal), 0)
          return { ...cc, total }
        })
        setPorCC(resultado)
        setAllItems(items)
        setLoadingCC(false)
      }
    }

    cargar()
    return () => { cancelado = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comercioId, periodo.year, periodo.month, ccKey])

  return { porCC, allItems, loadingCC }
}

/* ── Componente principal ────────────────── */
const HOY = new Date()

export default function Dashboard() {
  const { perfil }  = useAuth()
  const comercioId  = perfil?.comercio?.id
  const { datos, loading, recargar } = useDashboard(comercioId)
  const [obPagadas,    setObPagadas]    = useState(new Set())
  const [selectedProv, setSelectedProv] = useState(null) // proveedor a pagar

  /* Período de ventas */
  const [periodo, setPeriodo] = useState({ year: HOY.getFullYear(), month: HOY.getMonth() })
  const { total: ventasPeriodo, loadingVentas } = useVentasPeriodo(comercioId, periodo)
  const { porCC, allItems, loadingCC } = useVentasPorCC(comercioId, periodo, datos.centrosCostos)

  /* Detalle por CC (medios de pago) */
  const [ccSel,     setCCSel]     = useState(null)   // { id, nombre, color, total }
  const [ccDetalle, setCCDetalle] = useState(null)   // { loading, porMedio, cantVentas }

  // Limpiar selección al cambiar período
  useEffect(() => { setCCSel(null) }, [periodo.year, periodo.month])

  // Cargar medios de pago del CC seleccionado
  useEffect(() => {
    if (!ccSel) { setCCDetalle(null); return }
    let cancelado = false
    setCCDetalle({ loading: true, porMedio: [], cantVentas: 0 })

    async function cargarDetalle() {
      // Usar los items ya cacheados — solo buscar venta_pagos
      const ventaIds = [...new Set(
        allItems
          .filter(i => i.producto?.centro_costo_id === ccSel.id)
          .map(i => i.venta_id)
      )]

      if (ventaIds.length === 0) {
        if (!cancelado) setCCDetalle({ loading: false, porMedio: [], cantVentas: 0 })
        return
      }

      const { data: pagos } = await supabase
        .from('venta_pagos')
        .select('medio_pago, monto')
        .in('venta_id', ventaIds)

      if (!cancelado) {
        const mpMap = {}
        ;(pagos || []).forEach(p => {
          mpMap[p.medio_pago] = (mpMap[p.medio_pago] || 0) + Number(p.monto)
        })
        const totalPagado = Object.values(mpMap).reduce((s, v) => s + v, 0)
        const porMedio = Object.entries(mpMap)
          .map(([medio, monto]) => ({
            medio,
            monto,
            pct: totalPagado > 0 ? Math.round((monto / totalPagado) * 100) : 0,
          }))
          .sort((a, b) => b.monto - a.monto)
        setCCDetalle({ loading: false, porMedio, cantVentas: ventaIds.length })
      }
    }

    cargarDetalle()
    return () => { cancelado = true }
  // allItems tiene ref estable mientras no cambie el período
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ccSel?.id, allItems])

  const esMesActual = periodo.year === HOY.getFullYear() && periodo.month === HOY.getMonth()

  function irMesAnterior() {
    setPeriodo(p => p.month === 0
      ? { year: p.year - 1, month: 11 }
      : { year: p.year, month: p.month - 1 })
  }

  function irMesSiguiente() {
    if (esMesActual) return
    setPeriodo(p => p.month === 11
      ? { year: p.year + 1, month: 0 }
      : { year: p.year, month: p.month + 1 })
  }

  /* Panel de desglose proveedores */
  const [verProveedores, setVerProveedores] = useState(false)
  const panelProvRef = useRef(null)
  const metricProvRef = useRef(null)

  useEffect(() => {
    if (!verProveedores) return
    function onClickOutside(e) {
      if (
        panelProvRef.current   && !panelProvRef.current.contains(e.target) &&
        metricProvRef.current  && !metricProvRef.current.contains(e.target)
      ) {
        setVerProveedores(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [verProveedores])

  function scrollAVencimientos() {
    document.getElementById('dash-vencimientos')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function toggleOb(id) {
    setObPagadas(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="dashboard">
      {/* Saludo */}
      <div className="dash-header">
        <h1 className="dash-title">
          {saludo()}{perfil ? `, ${perfil.nombre}` : ''}
        </h1>
        <p className="dash-sub">
          {new Intl.DateTimeFormat('es-AR', { weekday:'long', day:'numeric', month:'long' }).format(new Date())}
        </p>
      </div>

      {/* Fila 1 — 4 métricas */}
      <div className="dash-metrics">
        <MetricCard
          label="Vencimientos de stock"
          value={datos.vencimientosCount}
          sub="lotes en los próximos 30 días"
          colorClass="danger"
          loading={loading}
          onClick={scrollAVencimientos}
          hint="Ver detalle ↓"
        />
        <MetricCard
          label="Stock bajo mínimo"
          value={datos.stockBajoCount}
          sub="productos por reponer"
          colorClass="danger"
          loading={loading}
          to="/stock?stockBajo=1"
          hint="Ver en Stock →"
        />
        <MetricCard
          label="Ventas del período"
          value={fmt$(ventasPeriodo)}
          colorClass="success"
          loading={loadingVentas}
          nav={{
            label:       fmtPeriodo(periodo),
            onPrev:      irMesAnterior,
            onNext:      irMesSiguiente,
            disableNext: esMesActual,
          }}
        />
        <MetricCard
          label="A pagar proveedores"
          value={fmt$(datos.pagarProveedores)}
          sub={`${datos.proveedoresPendientes.length} proveedor${datos.proveedoresPendientes.length !== 1 ? 'es' : ''}`}
          colorClass="warning"
          loading={loading}
          onClick={() => { if (!loading && datos.proveedoresPendientes.length > 0) setVerProveedores(v => !v) }}
          hint={datos.proveedoresPendientes.length > 0 ? 'Ver desglose ↓' : undefined}
          active={verProveedores}
          ref={metricProvRef}
        />
      </div>

      {/* Panel desglose proveedores */}
      {verProveedores && (
        <div className="dash-prov-panel" ref={panelProvRef}>
          <div className="dash-prov-panel-header">
            <i className="ti ti-building-store" style={{ color: 'var(--color-warning)', fontSize: 14 }} />
            <span>Compras pendientes por proveedor</span>
            <button
              type="button"
              className="dash-prov-close"
              onClick={() => setVerProveedores(false)}
              title="Cerrar"
            >
              <i className="ti ti-x" />
            </button>
          </div>
          <div className="dash-prov-list">
            {datos.proveedoresPendientes.map((p, i) => (
              <button
                key={i}
                type="button"
                className="dash-prov-row dash-prov-row--btn"
                onClick={() => { setSelectedProv(p); setVerProveedores(false) }}
                title={`Registrar pago a ${p.nombre}`}
              >
                <div className="dash-prov-info">
                  <span className="dash-prov-nombre">{p.nombre}</span>
                  <span className="dash-prov-cant">
                    {p.cant} compra{p.cant !== 1 ? 's' : ''}
                    {p.parcial && <span className="badge badge--warning" style={{ marginLeft: 6, fontSize: 9 }}>parcial</span>}
                  </span>
                </div>
                <span className="dash-prov-total">{fmt$(p.total)}</span>
                <i className="ti ti-chevron-right dash-prov-arrow" />
              </button>
            ))}
          </div>
          <Link to="/compras" className="dash-card-footer-link" onClick={() => setVerProveedores(false)}>
            <i className="ti ti-shopping-cart" />
            <span>Ver en Compras</span>
            <i className="ti ti-chevron-right" />
          </Link>
        </div>
      )}

      {/* Fila 2 — 2 cards */}
      <div className="dash-row2">
        {/* Vencimientos de stock */}
        <div className="dash-card" id="dash-vencimientos">
          <div className="dash-card-header">
            <i className="ti ti-calendar-exclamation dash-card-icon" />
            <span>Vencimientos de stock</span>
          </div>
          {loading ? (
            <p className="dash-empty">Cargando...</p>
          ) : datos.vencimientos.length === 0 ? (
            <p className="dash-empty">Sin vencimientos próximos</p>
          ) : (
            <>
              <ul className="venc-list">
                {datos.vencimientos.map(lote => {
                  const dias   = diasRestantes(lote.fecha_vencimiento)
                  const nombre = lote.productos?.nombre ?? ''
                  return (
                    <li key={lote.id} className="venc-item">
                      <Link
                        to={`/stock?q=${encodeURIComponent(nombre)}`}
                        className="venc-item-link"
                        title={`Ver "${nombre}" en Stock`}
                      >
                        <span className="venc-dot" style={{ background: dotColor(dias) }} />
                        <span className="venc-nombre">{nombre || '—'}</span>
                        <span className="venc-fecha">
                          {dias < 0 ? 'Vencido' : dias === 0 ? 'Hoy' : `${dias}d`}
                        </span>
                        <i className="ti ti-arrow-right venc-arrow" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
              <Link to="/stock" className="dash-card-footer-link">
                <i className="ti ti-package" />
                <span>Ir a Stock</span>
                <i className="ti ti-chevron-right" />
              </Link>
            </>
          )}
        </div>

        {/* Ventas por centro de costos */}
        <div className="dash-card">
          <div className="dash-card-header">
            <i className="ti ti-chart-bar dash-card-icon" />
            <span>Ventas del mes por sección</span>
          </div>
          {loading || loadingCC ? (
            <p className="dash-empty">Cargando...</p>
          ) : datos.centrosCostos.length === 0 ? (
            <p className="dash-empty">Sin centros de costo configurados</p>
          ) : (
            <div className="cc-bars">
              {(() => {
                const maxVal   = Math.max(...porCC.map(cc => cc.total), 1)
                const sinDatos = porCC.every(cc => cc.total === 0)
                return (
                  <>
                    {porCC.map(cc => {
                      const isOpen = ccSel?.id === cc.id
                      return (
                        <div key={cc.id} className="cc-item">
                          {/* ── Fila principal (clickeable) ── */}
                          <button
                            type="button"
                            className={`cc-row-btn${isOpen ? ' cc-row-btn--open' : ''}`}
                            onClick={() => setCCSel(prev => prev?.id === cc.id ? null : cc)}
                            title={`Ver detalle de ${cc.nombre}`}
                          >
                            <div className="cc-row-header">
                              <span className="cc-nombre">{cc.nombre}</span>
                              <span className="cc-row-right">
                                <span className="cc-valor">{fmt$(cc.total)}</span>
                                <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'} cc-chevron`} />
                              </span>
                            </div>
                            <div className="cc-track">
                              <div
                                className="cc-fill"
                                style={{
                                  width:      `${(cc.total / maxVal) * 100}%`,
                                  background: cc.color || 'var(--color-accent)',
                                }}
                              />
                            </div>
                          </button>

                          {/* ── Detalle expandible ── */}
                          {isOpen && (
                            <div className="cc-detalle">
                              {ccDetalle?.loading ? (
                                <p className="cc-detalle-loading">
                                  <i className="ti ti-loader-2 spin" /> Cargando...
                                </p>
                              ) : !ccDetalle || ccDetalle.cantVentas === 0 ? (
                                <p className="cc-detalle-loading">Sin ventas en este período</p>
                              ) : (
                                <>
                                  <p className="cc-detalle-cant">
                                    <i className="ti ti-receipt" />
                                    {ccDetalle.cantVentas} venta{ccDetalle.cantVentas !== 1 ? 's' : ''} en el período
                                  </p>
                                  <div className="cc-mp-list">
                                    {ccDetalle.porMedio.map(mp => {
                                      const info = MEDIOS_MAP[mp.medio] || { label: mp.medio, icon: 'ti-wallet' }
                                      return (
                                        <div key={mp.medio} className="cc-mp-row">
                                          <i className={`ti ${info.icon} cc-mp-icon`}
                                             style={{ color: cc.color || 'var(--color-accent)' }} />
                                          <span className="cc-mp-label">{info.label}</span>
                                          <div className="cc-mp-track">
                                            <div
                                              className="cc-mp-fill"
                                              style={{
                                                width:      `${mp.pct}%`,
                                                background: cc.color || 'var(--color-accent)',
                                              }}
                                            />
                                          </div>
                                          <span className="cc-mp-monto">{fmt$(mp.monto)}</span>
                                          <span className="cc-mp-pct">{mp.pct}%</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {sinDatos && (
                      <p className="dash-empty" style={{ marginTop: 'var(--space-3)' }}>
                        Sin ventas en este período
                      </p>
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Fila 3 — Obligaciones full width */}
      <div className="dash-card dash-card--full">
        <div className="dash-card-header">
          <i className="ti ti-receipt-tax dash-card-icon" />
          <span>Obligaciones impositivas</span>
        </div>
        {loading ? (
          <p className="dash-empty">Cargando...</p>
        ) : datos.obligaciones.length === 0 ? (
          <p className="dash-empty">Sin obligaciones cargadas — <a href="/obligaciones">ir a Obligaciones</a></p>
        ) : (
          <div className="ob-grid">
            {datos.obligaciones.map(ob => (
              <label key={ob.id} className={`ob-item${obPagadas.has(ob.id) ? ' ob-item--pagada' : ''}`}>
                <input
                  type="checkbox"
                  className="ob-check"
                  checked={obPagadas.has(ob.id)}
                  onChange={() => toggleOb(ob.id)}
                />
                <div className="ob-info">
                  <span className="ob-nombre">{ob.nombre}</span>
                  <span className="ob-detalle">
                    {fmt$(ob.monto_estimado)}
                    {ob.proximo_vencimiento ? ` · vence ${fmtFecha(ob.proximo_vencimiento)}` : ''}
                    {' · '}
                    <span className="ob-cat">{ob.categoria.replace('_', ' ')}</span>
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Modal de pago a proveedor */}
      {selectedProv && (
        <PagoCompraModal
          proveedor={selectedProv}
          comercioId={comercioId}
          perfilId={perfil?.id}
          onCerrar={() => setSelectedProv(null)}
          onPagado={() => { recargar(); setSelectedProv(null) }}
        />
      )}
    </div>
  )
}

/* ── MetricCard ──────────────────────────────
   Props:
     nav    = { label, onPrev, onNext, disableNext }
     to     = ruta React Router
     onClick = handler
     hint   = texto que aparece al hover
     active = boolean — borde accent cuando el panel está abierto
     ref    = forwarded ref (para click-outside)
──────────────────────────────────────────── */
const MetricCard = forwardRef(function MetricCard(
  { label, value, sub, colorClass, loading, to, onClick, hint, nav, active },
  ref
) {
  const isInteractive = !!(to || onClick)
  const cls = [
    'metric-card',
    isInteractive || nav ? 'metric-card--link' : '',
    active ? 'metric-card--active' : '',
  ].filter(Boolean).join(' ')

  const body = (
    <>
      <span className="metric-label">{label}</span>
      <span className={`metric-value metric-value--${colorClass}${loading ? ' metric-value--loading' : ''}`}>
        {value}
      </span>

      {nav ? (
        /* Navegación de período */
        <div className="metric-nav">
          <button
            type="button"
            className="metric-nav-btn"
            onClick={e => { e.stopPropagation(); nav.onPrev() }}
            title="Mes anterior"
          >
            <i className="ti ti-chevron-left" />
          </button>
          <span className="metric-nav-label">{nav.label}</span>
          <button
            type="button"
            className="metric-nav-btn"
            onClick={e => { e.stopPropagation(); nav.onNext() }}
            disabled={nav.disableNext}
            title={nav.disableNext ? 'Mes actual' : 'Mes siguiente'}
          >
            <i className="ti ti-chevron-right" />
          </button>
        </div>
      ) : (
        <>
          {sub && <span className="metric-sub">{sub}</span>}
          {isInteractive && hint && <span className="metric-hint">{hint}</span>}
        </>
      )}
    </>
  )

  if (to) {
    return <Link to={to} className={cls} ref={ref}>{body}</Link>
  }
  if (onClick) {
    return <button type="button" className={cls} onClick={onClick} ref={ref}>{body}</button>
  }
  return <div className={cls} ref={ref}>{body}</div>
})

function saludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}
