import { useState, useEffect, useRef, forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { cargarDeudas, resumirPorCliente, linkWhatsApp } from '../../hooks/useCuentasCobrar'
import PagoCompraModal from './PagoCompraModal'
import CuentaClientePanel from '../clientes/CuentaClientePanel'
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
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: Number.isInteger(Number(v) || 0) ? 0 : 2, maximumFractionDigits: 2 }).format(v || 0)

const fmtFecha = d =>
  d ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00')) : '—'

function fmtPeriodo({ year, month }) {
  // 'Septiembre 2026' (sin 'de') para que entre en la tarjeta en celular
  const mes = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date(year, month, 1))
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${year}`
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
    cobrar: { total: 0, vencido: 0, venceSemana: 0, clientes: [] },
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
      resDeudas,
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
      cargarDeudas(comercioId),
    ])

    const clientesDeuda = resumirPorCliente(resDeudas.data || [])
    const cobrar = {
      total:       clientesDeuda.reduce((s, c) => s + c.saldo, 0),
      vencido:     clientesDeuda.reduce((s, c) => s + c.vencido, 0),
      venceSemana: clientesDeuda.reduce((s, c) => s + c.venceSemana, 0),
      clientes:    clientesDeuda,
    }

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
    const stockBajoItems   = (resProductos.data || []).filter(p => Number(p.stock_minimo) > 0 && Number(p.stock_actual) <= Number(p.stock_minimo))
    const vencimientos     = resLotes.data || []

    setDatos({
      pagarProveedores,
      proveedoresPendientes,
      stockBajoCount: stockBajoItems.length,
      vencimientosCount: vencimientos.length,
      vencimientos,
      centrosCostos: resCCs.data || [],
      obligaciones:  resObligaciones.data || [],
      cobrar,
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
        .eq('es_saldo_inicial', false)

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

/* ── Helpers localStorage obligaciones ── */
function obKey(comercioId) {
  const hoy  = new Date()
  const mes  = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  return `ob_pagadas_${comercioId}_${mes}`
}

function leerObPagadas(comercioId) {
  try {
    const raw = localStorage.getItem(obKey(comercioId))
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function guardarObPagadas(comercioId, set) {
  try {
    localStorage.setItem(obKey(comercioId), JSON.stringify([...set]))
  } catch {}
}

/* ── Componente principal ────────────────── */
const HOY = new Date()

export default function Dashboard() {
  const { perfil }  = useAuth()
  const comercioId  = perfil?.comercio?.id
  const { datos, loading, recargar } = useDashboard(comercioId)
  const [obPagadas,    setObPagadas]    = useState(new Set())
  const [selectedProv, setSelectedProv] = useState(null) // proveedor a pagar

  // Cargar estado de obligaciones del mes desde localStorage
  useEffect(() => {
    if (comercioId) setObPagadas(leerObPagadas(comercioId))
  }, [comercioId])

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

  /* Panel desglose cuentas por cobrar */
  const [verCobrar,     setVerCobrar]     = useState(false)
  const [cuentaCliente, setCuentaCliente] = useState(null)
  const panelCobrarRef  = useRef(null)
  const metricCobrarRef = useRef(null)

  useEffect(() => {
    if (!verCobrar) return
    function onClickOutside(e) {
      if (
        panelCobrarRef.current  && !panelCobrarRef.current.contains(e.target) &&
        metricCobrarRef.current && !metricCobrarRef.current.contains(e.target)
      ) {
        setVerCobrar(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [verCobrar])

  function mensajeRecordatorio(c) {
    const nombre = c.cliente?.nombre || ''
    return c.vencido > 0
      ? `Hola ${nombre}, te recordamos que tenés un saldo vencido de ${fmt$(c.vencido)} en tu cuenta corriente${c.vtoMasViejo ? ` (desde el ${fmtFecha(c.vtoMasViejo)})` : ''}. ¡Gracias!`
      : `Hola ${nombre}, te recordamos que tu saldo en cuenta corriente es de ${fmt$(c.saldo)}${c.proxVto ? ` y vence el ${fmtFecha(c.proxVto)}` : ''}. ¡Gracias!`
  }

  function scrollAVencimientos() {
    document.getElementById('dash-vencimientos')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function toggleOb(id) {
    setObPagadas(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      guardarObPagadas(comercioId, next)
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
          icon="ti-calendar-exclamation"
          value={datos.vencimientosCount}
          sub="lotes en los próximos 30 días"
          colorClass="danger"
          loading={loading}
          onClick={scrollAVencimientos}
          hint="Ver detalle ↓"
        />
        <MetricCard
          label="Stock bajo mínimo"
          icon="ti-package"
          value={datos.stockBajoCount}
          sub="productos por reponer"
          colorClass="danger"
          loading={loading}
          to="/stock?stockBajo=1"
          hint="Ver en Stock →"
        />
        <MetricCard
          label="Ventas del período"
          icon="ti-trending-up"
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
          icon="ti-truck"
          value={fmt$(datos.pagarProveedores)}
          sub={`${datos.proveedoresPendientes.length} proveedor${datos.proveedoresPendientes.length !== 1 ? 'es' : ''}`}
          colorClass="warning"
          loading={loading}
          onClick={() => { if (!loading && datos.proveedoresPendientes.length > 0) setVerProveedores(v => !v) }}
          hint={datos.proveedoresPendientes.length > 0 ? 'Ver desglose ↓' : undefined}
          active={verProveedores}
          ref={metricProvRef}
        />
        <MetricCard
          label="A cobrar Cta. Cte."
          icon="ti-notebook"
          value={fmt$(datos.cobrar.total)}
          sub={
            datos.cobrar.vencido > 0
              ? `${fmt$(datos.cobrar.vencido)} vencido`
              : datos.cobrar.venceSemana > 0
                ? `${fmt$(datos.cobrar.venceSemana)} vence esta semana`
                : `${datos.cobrar.clientes.length} cliente${datos.cobrar.clientes.length !== 1 ? 's' : ''} · al día`
          }
          colorClass={datos.cobrar.vencido > 0 ? 'danger' : datos.cobrar.venceSemana > 0 ? 'warning' : 'info'}
          loading={loading}
          onClick={() => { if (!loading && datos.cobrar.clientes.length > 0) setVerCobrar(v => !v) }}
          hint={datos.cobrar.clientes.length > 0 ? 'Ver clientes ↓' : undefined}
          active={verCobrar}
          ref={metricCobrarRef}
        />
      </div>

      {/* Panel desglose cuentas por cobrar */}
      {verCobrar && (
        <div className="dash-prov-panel dash-cobrar-panel" ref={panelCobrarRef}>
          <div className="dash-prov-panel-header">
            <i className="ti ti-notebook" style={{ color: 'var(--color-info)', fontSize: 14 }} />
            <span>Cuentas corrientes de clientes</span>
            {datos.cobrar.vencido > 0 && (
              <span className="badge badge--danger">{fmt$(datos.cobrar.vencido)} vencido</span>
            )}
            {datos.cobrar.venceSemana > 0 && (
              <span className="badge badge--warning">{fmt$(datos.cobrar.venceSemana)} vence en 7 días</span>
            )}
            <button type="button" className="dash-prov-close" onClick={() => setVerCobrar(false)} title="Cerrar">
              <i className="ti ti-x" />
            </button>
          </div>
          <div className="dash-prov-list">
            {datos.cobrar.clientes.map(c => {
              const wa = linkWhatsApp(c.telefono, mensajeRecordatorio(c))
              return (
                <div key={c.id} className="dash-cobrar-row">
                  <button
                    type="button"
                    className="dash-prov-row dash-prov-row--btn"
                    onClick={() => { if (c.cliente) { setCuentaCliente(c.cliente); setVerCobrar(false) } }}
                    title={`Ver cuenta de ${c.nombre}`}
                  >
                    <div className="dash-prov-info">
                      <span className="dash-prov-nombre">{c.nombre}</span>
                      <span className="dash-prov-cant">
                        {c.diasAtraso > 0 ? (
                          <span className="badge badge--danger" style={{ fontSize: 9 }}>
                            {fmt$(c.vencido)} vencido · {c.diasAtraso} d
                          </span>
                        ) : c.venceSemana > 0 ? (
                          <span className="badge badge--warning" style={{ fontSize: 9 }}>vence {fmtFecha(c.proxVto)}</span>
                        ) : (
                          <>próx. vto. {fmtFecha(c.proxVto)}</>
                        )}
                      </span>
                    </div>
                    <span className={`dash-prov-total${c.vencido > 0 ? ' dash-cobrar-total--vencido' : ''}`}>{fmt$(c.saldo)}</span>
                    <i className="ti ti-chevron-right dash-prov-arrow" />
                  </button>
                  {wa ? (
                    <a className="btn-icon dash-cobrar-wa" href={wa} target="_blank" rel="noreferrer" title="Recordar por WhatsApp">
                      <i className="ti ti-brand-whatsapp" />
                    </a>
                  ) : (
                    <span className="btn-icon dash-cobrar-wa dash-cobrar-wa--off" title="Sin teléfono cargado">
                      <i className="ti ti-brand-whatsapp" />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <Link to="/clientes" className="dash-card-footer-link" onClick={() => setVerCobrar(false)}>
            <i className="ti ti-users" />
            <span>Ver en Clientes</span>
            <i className="ti ti-chevron-right" />
          </Link>
        </div>
      )}

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
              {porCC.some(cc => cc.total > 0) && (
                <p className="cc-total-periodo">
                  Total del período:
                  <strong>{fmt$(porCC.reduce((s, cc) => s + cc.total, 0))}</strong>
                </p>
              )}
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

      {cuentaCliente && (
        <CuentaClientePanel
          cliente={cuentaCliente}
          comercioId={comercioId}
          onCerrar={() => setCuentaCliente(null)}
          onCambio={recargar}
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
  { label, icon, value, sub, colorClass, loading, to, onClick, hint, nav, active },
  ref
) {
  const isInteractive = !!(to || onClick)
  const cls = [
    'metric-card',
    colorClass ? `metric-card--${colorClass}` : '',
    isInteractive || nav ? 'metric-card--link' : '',
    active ? 'metric-card--active' : '',
  ].filter(Boolean).join(' ')

  const body = (
    <>
      <span className="metric-label">
        {icon && <span className={`metric-ico metric-ico--${colorClass}`}><i className={`ti ${icon}`} /></span>}
        {label}
      </span>
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
