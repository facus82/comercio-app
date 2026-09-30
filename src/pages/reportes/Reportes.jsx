import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useReportes, diasDelRango } from '../../hooks/useReportes'
import './Reportes.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: Number.isInteger(Number(v) || 0) ? 0 : 2, maximumFractionDigits: 2 }).format(v || 0)

// Montos grandes en el eje del gráfico: $ 12,5 mil / $ 1,2 M
const fmtCorto = v => {
  if (v >= 1e6) return `$ ${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  if (v >= 1e3) return `$ ${(v / 1e3).toLocaleString('es-AR', { maximumFractionDigits: 1 })} mil`
  return `$ ${Math.round(v)}`
}

const fmtFecha = str => {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

const MEDIOS_LABEL = {
  efectivo:         'Efectivo',
  tarjeta_debito:   'Débito',
  tarjeta_credito:  'Crédito',
  transferencia:    'Transferencia',
  mercado_pago:     'Mercado Pago',
  cuenta_corriente: 'Cuenta corriente',
  otro:             'Otro',
}

const ESTADO_BADGE = {
  pendiente: 'badge--warning',
  parcial:   'badge--info',
  pagada:    'badge--success',
  anulada:   'badge--neutral',
}

const TRAMO_TONO = { al_dia: 'ok', d1_30: 'warn', d31_60: 'bad', d60: 'bad' }

const pad = n => String(n).padStart(2, '0')
const aISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const nombreMes = d => {
  const s = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/* Rango del período elegido + el período anterior equivalente (para comparar) */
function calcRangos(periodo, custom) {
  const hoy = new Date()

  if (periodo === 'mes_actual') {
    const ini  = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    // Mismos días del mes anterior (1 al día de hoy), no el mes entero: comparación justa
    const iniA = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    const finA = new Date(hoy.getFullYear(), hoy.getMonth() - 1, Math.min(hoy.getDate(), new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate()))
    return {
      desde: aISO(ini), hasta: aISO(hoy),
      anterior: { desde: aISO(iniA), hasta: aISO(finA), label: `vs. mismos días de ${nombreMes(iniA).toLowerCase()}` },
    }
  }
  if (periodo === 'mes_anterior') {
    const ini  = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    const fin  = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
    const iniA = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)
    const finA = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 0)
    return {
      desde: aISO(ini), hasta: aISO(fin),
      anterior: { desde: aISO(iniA), hasta: aISO(finA), label: `vs. ${nombreMes(iniA).toLowerCase()}` },
    }
  }
  if (periodo === '7_dias') {
    const ini  = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6)
    const finA = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 7)
    const iniA = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 13)
    return {
      desde: aISO(ini), hasta: aISO(hoy),
      anterior: { desde: aISO(iniA), hasta: aISO(finA), label: 'vs. 7 días anteriores' },
    }
  }
  // Personalizado: el período anterior tiene la misma cantidad de días
  if (!custom.desde || !custom.hasta) return { desde: custom.desde, hasta: custom.hasta, anterior: null }
  const [y, m, d] = custom.desde.split('-').map(Number)
  const dias = diasDelRango(custom.desde, custom.hasta).length
  const finA = new Date(y, m - 1, d - 1)
  const iniA = new Date(y, m - 1, d - dias)
  return {
    desde: custom.desde, hasta: custom.hasta,
    anterior: { desde: aISO(iniA), hasta: aISO(finA), label: 'vs. período anterior' },
  }
}

/* ── Indicador con ícono, franja de estado y variación ── */
function Kpi({ icon, label, value, sub, tono = 'neutral', delta, deltaLabel, invertir = false }) {
  let deltaEl = null
  if (delta != null && Number.isFinite(delta)) {
    const sube = delta > 0.005, baja = delta < -0.005
    const bueno = invertir ? baja : sube
    const cls = sube || baja ? (bueno ? 'kpi-delta--ok' : 'kpi-delta--bad') : ''
    deltaEl = (
      <span className={`kpi-delta ${cls}`}>
        <i className={`ti ${sube ? 'ti-arrow-up-right' : baja ? 'ti-arrow-down-right' : 'ti-minus'}`} />
        {`${delta > 0 ? '+' : ''}${(delta * 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })} %`}
        <span className="kpi-delta-label">{deltaLabel}</span>
      </span>
    )
  }
  return (
    <div className={`kpi kpi--${tono}`}>
      <span className="kpi-label"><span className="kpi-ico"><i className={`ti ${icon}`} /></span>{label}</span>
      <span className="kpi-valor">{value}</span>
      {deltaEl || (sub && <span className="kpi-sub">{sub}</span>)}
    </div>
  )
}

function variacion(actual, anterior) {
  if (anterior == null) return null
  if (!anterior) return null   // sin base (período anterior en 0) no hay % comparable
  return (actual - anterior) / anterior
}

/* ── Gráfico de barras por día (SVG, colores desde los tokens) ── */
function GraficoDias({ dias }) {
  // Se dibuja al ancho real del contenedor: así el texto del eje mantiene su tamaño
  const ref = useRef(null)
  const [W, setW] = useState(760)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 200, IZQ = 84, ABA = 24, ARR = 10   // IZQ: lugar para "$ 200 mil" en el eje
  const max = Math.max(...dias.map(d => d.total), 0)
  // Tope del eje redondeado a un valor "lindo"
  const paso = max > 0 ? Math.pow(10, Math.floor(Math.log10(max))) : 1
  const tope = max > 0 ? Math.ceil(max / paso) * paso : 1
  const n = dias.length
  const ancho = (W - IZQ) / n
  const barra = Math.max(2, Math.min(28, ancho * 0.68))
  const y = v => ARR + (H - ARR - ABA) * (1 - v / tope)
  const cadaCuanto = Math.ceil(n / 10)
  const mejor = dias.reduce((a, d) => (d.total > (a?.total ?? 0) ? d : a), null)

  return (
    <div className="graf-wrap" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="graf" role="img"
        aria-label={`Ventas por día. Mejor día ${mejor ? fmtFecha(mejor.fecha) + ': ' + fmt$(mejor.total) : 'sin ventas'}`}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={IZQ} x2={W} y1={y(tope * f)} y2={y(tope * f)} className="graf-grid" />
            <text x={IZQ - 8} y={y(tope * f) + 4} textAnchor="end" className="graf-eje">{fmtCorto(tope * f)}</text>
          </g>
        ))}
        {dias.map((d, i) => {
          const x = IZQ + i * ancho + (ancho - barra) / 2
          const h = d.total > 0 ? Math.max(2, y(0) - y(d.total)) : 0
          return (
            <g key={d.fecha}>
              {h > 0 && (
                <rect x={x} y={y(0) - h} width={barra} height={h} rx="2"
                  className={`graf-barra${mejor && d.fecha === mejor.fecha ? ' graf-barra--max' : ''}`}>
                  <title>{`${fmtFecha(d.fecha)}: ${fmt$(d.total)} · ${d.cant} ticket${d.cant !== 1 ? 's' : ''}`}</title>
                </rect>
              )}
              {i % cadaCuanto === 0 && (
                <text x={IZQ + i * ancho + ancho / 2} y={H - 8} textAnchor="middle" className="graf-eje">
                  {d.fecha.slice(8, 10)}/{d.fecha.slice(5, 7)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* Lista con barra proporcional (medios de pago, proveedores, secciones) */
function ListaBarras({ filas, max }) {
  return (
    <div className="barras-list">
      {filas.map(f => (
        <div key={f.label} className="barras-row">
          <span className="barras-label">{f.label}</span>
          <div className="mini-bar-wrap"><div className="mini-bar" style={{ width: `${max ? (f.valor / max) * 100 : 0}%`, background: f.color || undefined }} /></div>
          <span className="barras-monto">{fmt$(f.valor)}</span>
          {f.pct != null && <span className="barras-pct">{f.pct} %</span>}
        </div>
      ))}
    </div>
  )
}

const TABS = [
  { id: 'ventas',  label: 'Ventas',             icon: 'ti-receipt' },
  { id: 'cuentas', label: 'Cuentas corrientes', icon: 'ti-notebook' },
  { id: 'stock',   label: 'Inventario',         icon: 'ti-package' },
  { id: 'compras', label: 'Compras',            icon: 'ti-shopping-cart' },
]

export default function Reportes() {
  const { perfil }    = useAuth()
  const comercioId    = perfil?.comercio?.id
  const { cargarVentas, cargarTotalesVentas, cargarStock, cargarCompras, cargarCuentas } = useReportes(comercioId)

  const [tab,     setTab]     = useState('ventas')
  const [periodo, setPeriodo] = useState('mes_actual')
  const [custom,  setCustom]  = useState({ desde: '', hasta: '' })

  const rango = useMemo(() => calcRangos(periodo, custom), [periodo, custom])

  const [datos,    setDatos]    = useState({})     // { ventas, previo, stock, compras, cuentas }
  const [loading,  setLoading]  = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const cargar = useCallback(async () => {
    if (!comercioId) return
    if (tab !== 'stock' && (!rango.desde || !rango.hasta)) return
    setLoading(true); setErrorMsg('')
    try {
      if (tab === 'ventas') {
        const [ventas, previo] = await Promise.all([
          cargarVentas(rango.desde, rango.hasta),
          rango.anterior ? cargarTotalesVentas(rango.anterior.desde, rango.anterior.hasta) : null,
        ])
        setDatos(d => ({ ...d, ventas, previo }))
      } else if (tab === 'stock') {
        const stock = await cargarStock()
        setDatos(d => ({ ...d, stock }))
      } else if (tab === 'compras') {
        const compras = await cargarCompras(rango.desde, rango.hasta)
        setDatos(d => ({ ...d, compras }))
      } else {
        const cuentas = await cargarCuentas(rango.desde, rango.hasta)
        setDatos(d => ({ ...d, cuentas }))
      }
    } catch (e) {
      setErrorMsg(e.message || 'No se pudo cargar el reporte.')
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comercioId, tab, rango.desde, rango.hasta])

  useEffect(() => { cargar() }, [cargar])

  const { ventas, previo, stock, compras, cuentas } = datos

  // Serie diaria completa (incluye días sin ventas)
  const serieDias = useMemo(() => {
    if (!ventas || !rango.desde || !rango.hasta) return []
    const porDia = Object.fromEntries((ventas.ventasPorDia || []).map(d => [d.fecha, d]))
    return diasDelRango(rango.desde, rango.hasta).map(f => porDia[f] || { fecha: f, cant: 0, total: 0 })
  }, [ventas, rango.desde, rango.hasta])

  const diasConVenta = serieDias.filter(d => d.total > 0)
  const mejorDia     = diasConVenta.reduce((a, d) => (d.total > (a?.total ?? 0) ? d : a), null)
  const margenPct    = ventas?.totalVentas ? ventas.margenBruto / ventas.totalVentas : null
  const deltaLabel   = rango.anterior?.label

  const totalMedios = ventas ? Object.values(ventas.porMedioPago).reduce((s, v) => s + v, 0) : 0

  return (
    <div className="reportes-page">

      {/* Encabezado + período */}
      <div className="reportes-top">
        <h1 className="page-title reportes-title"><i className="ti ti-chart-bar" /> Reportes</h1>

        {tab !== 'stock' && (
          <div className="periodo-bar">
            <div className="pills">
              {[
                { id: 'mes_actual',   label: 'Este mes'       },
                { id: 'mes_anterior', label: 'Mes anterior'   },
                { id: '7_dias',       label: 'Últimos 7 días' },
                { id: 'custom',       label: 'Personalizado'  },
              ].map(p => (
                <button key={p.id} type="button"
                  className={`pill${periodo === p.id ? ' pill--active' : ''}`}
                  onClick={() => setPeriodo(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            {periodo === 'custom' && (
              <div className="periodo-custom">
                <input type="date" className="field-input" aria-label="Desde"
                  value={custom.desde} max={custom.hasta || undefined}
                  onChange={e => setCustom(p => ({ ...p, desde: e.target.value }))} />
                <span className="td-muted">→</span>
                <input type="date" className="field-input" aria-label="Hasta"
                  value={custom.hasta} min={custom.desde || undefined}
                  onChange={e => setCustom(p => ({ ...p, hasta: e.target.value }))} />
              </div>
            )}
            {rango.desde && rango.hasta && (
              <span className="periodo-rango">{fmtFecha(rango.desde)} al {fmtFecha(rango.hasta)}</span>
            )}
          </div>
        )}
      </div>

      {/* Pestañas */}
      <div className="reportes-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`reportes-tab${tab === t.id ? ' reportes-tab--active' : ''}`}
            onClick={() => setTab(t.id)}>
            <i className={`ti ${t.icon}`} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="reportes-body">
        {errorMsg && <div className="error-banner"><i className="ti ti-alert-circle" /> {errorMsg}</div>}

        {periodo === 'custom' && tab !== 'stock' && (!custom.desde || !custom.hasta) && (
          <p className="reportes-vacio"><i className="ti ti-calendar" /> Elegí las fechas desde y hasta para ver el reporte.</p>
        )}

        {loading && (
          <div className="reportes-loading"><i className="ti ti-loader-2 reportes-spin" /> Cargando…</div>
        )}

        {/* ── VENTAS ── */}
        {!loading && tab === 'ventas' && ventas && (
          <div className="reportes-content">
            <div className="reportes-kpis">
              <Kpi icon="ti-cash" label="Total vendido" tono="ok" value={fmt$(ventas.totalVentas)}
                delta={variacion(ventas.totalVentas, previo?.totalVentas)} deltaLabel={deltaLabel}
                sub={`${diasConVenta.length} día${diasConVenta.length !== 1 ? 's' : ''} con ventas`} />
              <Kpi icon="ti-receipt" label="Tickets" value={ventas.cantTickets}
                delta={variacion(ventas.cantTickets, previo?.cantTickets)} deltaLabel={deltaLabel} />
              <Kpi icon="ti-shopping-bag" label="Ticket promedio" value={fmt$(ventas.ticketPromedio)}
                delta={variacion(ventas.ticketPromedio, previo?.ticketPromedio)} deltaLabel={deltaLabel} />
              <Kpi icon="ti-trending-up" label="Margen bruto est." tono={ventas.margenBruto >= 0 ? 'ok' : 'bad'}
                value={fmt$(ventas.margenBruto)}
                sub={ventas.sinCosto > 0
                  ? `${ventas.sinCosto} producto${ventas.sinCosto !== 1 ? 's' : ''} vendido${ventas.sinCosto !== 1 ? 's' : ''} sin costo cargado: el margen real es menor`
                  : margenPct != null ? `${Math.round(margenPct * 100)} % sobre lo vendido · costo actual` : 'con el costo actual de cada producto'} />
            </div>

            <section className="reporte-card reporte-card--full">
              <div className="reporte-card__head">
                <p className="reporte-card__title"><i className="ti ti-calendar-stats" /> Ventas por día</p>
                {mejorDia && <span className="reporte-card__nota">Mejor día: <strong>{fmtFecha(mejorDia.fecha)}</strong> · {fmt$(mejorDia.total)}</span>}
              </div>
              {diasConVenta.length === 0
                ? <p className="reportes-vacio">Sin ventas en el período.</p>
                : <GraficoDias dias={serieDias} />}
            </section>

            <div className="reportes-grid">
              <section className="reporte-card">
                <p className="reporte-card__title"><i className="ti ti-star" /> Productos más vendidos</p>
                {ventas.topProductos.length === 0 ? <p className="reportes-vacio">Sin datos.</p> : (
                  <div className="tabla-scroll">
                    <table className="data-table">
                      <thead><tr><th>Producto</th><th className="td-right">Cant.</th><th className="td-right">Total</th></tr></thead>
                      <tbody>
                        {ventas.topProductos.map((p, i) => (
                          <tr key={i}>
                            <td className="rep-prod"><span className="rep-rank">{i + 1}</span>{p.nombre}</td>
                            <td className="td-right td-muted">{Number(p.cant).toLocaleString('es-AR')}</td>
                            <td className="td-right">{fmt$(p.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="reporte-card">
                <p className="reporte-card__title"><i className="ti ti-credit-card" /> Por medio de pago</p>
                {totalMedios === 0 ? <p className="reportes-vacio">Sin datos.</p> : (
                  <ListaBarras
                    max={Math.max(...Object.values(ventas.porMedioPago))}
                    filas={Object.entries(ventas.porMedioPago).sort((a, b) => b[1] - a[1]).map(([m, v]) => ({
                      label: MEDIOS_LABEL[m] || m, valor: v, pct: Math.round((v / totalMedios) * 100),
                    }))}
                  />
                )}
              </section>
            </div>
          </div>
        )}

        {/* ── CUENTAS CORRIENTES ── */}
        {!loading && tab === 'cuentas' && cuentas && (
          <div className="reportes-content">
            <div className="reportes-kpis">
              <Kpi icon="ti-notebook" label="Te deben hoy" value={fmt$(cuentas.totalDeuda)}
                tono={cuentas.totalVencido > 0 ? 'bad' : 'ok'}
                sub={`${cuentas.clientes.length} cliente${cuentas.clientes.length !== 1 ? 's' : ''} con saldo`} />
              <Kpi icon="ti-alert-triangle" label="Vencido" value={fmt$(cuentas.totalVencido)}
                tono={cuentas.totalVencido > 0 ? 'bad' : 'ok'}
                sub={cuentas.totalDeuda ? `${Math.round((cuentas.totalVencido / cuentas.totalDeuda) * 100)} % de la deuda` : 'sin deuda'} />
              <Kpi icon="ti-file-invoice" label="Vendido a Cta. Cte." value={fmt$(cuentas.vendidoCC)} sub="en el período" tono="warn" />
              <Kpi icon="ti-arrow-down-left" label="Cobrado" value={fmt$(cuentas.totalCobrado)} tono="ok"
                sub={`${cuentas.cobros.length} cobro${cuentas.cobros.length !== 1 ? 's' : ''} en el período`} />
            </div>

            <div className="reportes-grid">
              <section className="reporte-card">
                <p className="reporte-card__title"><i className="ti ti-hourglass" /> Deuda por antigüedad</p>
                {cuentas.totalDeuda === 0 ? <p className="reportes-vacio">Nadie te debe: todas las cuentas están saldadas.</p> : (
                  <div className="tramos">
                    {cuentas.tramos.map(t => (
                      <div key={t.id} className={`tramo tramo--${TRAMO_TONO[t.id]}`}>
                        <div className="tramo-top">
                          <span className="tramo-label">{t.label}</span>
                          <span className="tramo-monto">{fmt$(t.total)}</span>
                        </div>
                        <div className="mini-bar-wrap"><div className="mini-bar" style={{ width: `${cuentas.totalDeuda ? (t.total / cuentas.totalDeuda) * 100 : 0}%` }} /></div>
                        <span className="tramo-sub">{t.cant} venta{t.cant !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="reporte-card">
                <p className="reporte-card__title"><i className="ti ti-users" /> Clientes con saldo</p>
                {cuentas.clientes.length === 0 ? <p className="reportes-vacio">Sin saldos pendientes.</p> : (
                  <div className="tabla-scroll">
                    <table className="data-table">
                      <thead><tr><th>Cliente</th><th>Atraso</th><th className="td-right">Saldo</th></tr></thead>
                      <tbody>
                        {cuentas.clientes.map(c => (
                          <tr key={c.id}>
                            <td>{c.nombre}</td>
                            <td>{c.diasAtraso > 0
                              ? <span className="badge badge--danger">{c.diasAtraso} días</span>
                              : <span className="badge badge--success">Al día</span>}</td>
                            <td className="td-right">{fmt$(c.saldo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="reporte-card reporte-card--full">
                <p className="reporte-card__title"><i className="ti ti-arrow-down-left" /> Cobros del período</p>
                {cuentas.cobros.length === 0 ? <p className="reportes-vacio">Sin cobros en el período.</p> : (
                  <div className="tabla-scroll">
                    <table className="data-table">
                      <thead><tr><th>Fecha</th><th>Cliente</th><th>Medio</th><th className="td-right">Monto</th></tr></thead>
                      <tbody>
                        {cuentas.cobros.map((c, i) => (
                          <tr key={i}>
                            <td className="td-muted">{fmtFecha(c.fecha)}</td>
                            <td>{c.cliente?.razon_social || `${c.cliente?.nombre || ''} ${c.cliente?.apellido || ''}`.trim() || '—'}</td>
                            <td className="td-muted">{MEDIOS_LABEL[c.medio_pago] || c.medio_pago}</td>
                            <td className="td-right">{fmt$(c.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ── INVENTARIO ── */}
        {!loading && tab === 'stock' && stock && (
          <div className="reportes-content">
            <div className="reportes-kpis">
              <Kpi icon="ti-building-warehouse" label="Valor del inventario" value={fmt$(stock.totalValor)} sub="a precio de costo" tono="ok" />
              <Kpi icon="ti-category" label="Categorías con stock" value={stock.porCategoria.length} />
              <Kpi icon="ti-package-off" label="Productos sin stock" value={stock.sinStock.length}
                tono={stock.sinStock.length > 0 ? 'bad' : 'ok'} sub={stock.sinStock.length > 0 ? 'para reponer' : 'todo con stock'} />
            </div>

            <div className="reportes-grid">
              <section className="reporte-card">
                <p className="reporte-card__title"><i className="ti ti-tag" /> Valorización por categoría</p>
                {stock.porCategoria.length === 0 ? <p className="reportes-vacio">Sin productos con stock.</p> : (
                  <ListaBarras
                    max={Math.max(...stock.porCategoria.map(c => c.valor))}
                    filas={stock.porCategoria.map(c => ({
                      label: `${c.nombre} (${c.cant})`, valor: c.valor, color: c.color,
                      pct: stock.totalValor ? Math.round((c.valor / stock.totalValor) * 100) : 0,
                    }))}
                  />
                )}
              </section>

              {stock.sinStock.length > 0 && (
                <section className="reporte-card">
                  <p className="reporte-card__title"><i className="ti ti-alert-triangle" /> Sin stock ({stock.sinStock.length})</p>
                  <div className="tabla-scroll">
                    <table className="data-table">
                      <thead><tr><th>Producto</th><th>Categoría</th></tr></thead>
                      <tbody>
                        {stock.sinStock.slice(0, 30).map((p, i) => (
                          <tr key={i}><td>{p.nombre}</td><td className="td-muted">{p.categoria?.nombre || '—'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {stock.sinStock.length > 30 && <p className="reportes-vacio">…y {stock.sinStock.length - 30} más</p>}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {/* ── COMPRAS ── */}
        {!loading && tab === 'compras' && compras && (
          <div className="reportes-content">
            <div className="reportes-kpis">
              <Kpi icon="ti-shopping-cart" label="Total comprado" value={fmt$(compras.totalComprado)} tono="warn" />
              <Kpi icon="ti-file-invoice" label="Compras" value={compras.cantCompras} sub="en el período" />
              <Kpi icon="ti-truck" label="Proveedores" value={compras.porProveedor.length} sub="con compras en el período" />
            </div>

            <div className="reportes-grid">
              {compras.porProveedor.length > 0 && (
                <section className="reporte-card">
                  <p className="reporte-card__title"><i className="ti ti-truck-delivery" /> Por proveedor</p>
                  <ListaBarras
                    max={Math.max(...compras.porProveedor.map(p => p.total))}
                    filas={compras.porProveedor.map(p => ({
                      label: p.nombre, valor: p.total,
                      pct: compras.totalComprado ? Math.round((p.total / compras.totalComprado) * 100) : 0,
                    }))}
                  />
                </section>
              )}

              <section className="reporte-card">
                <p className="reporte-card__title"><i className="ti ti-list" /> Compras del período</p>
                {compras.compras.length === 0 ? <p className="reportes-vacio">Sin compras en el período.</p> : (
                  <div className="tabla-scroll">
                    <table className="data-table">
                      <thead><tr><th>Fecha</th><th>Proveedor</th><th>Estado</th><th className="td-right">Total</th></tr></thead>
                      <tbody>
                        {compras.compras.map(c => (
                          <tr key={c.id}>
                            <td className="td-muted">{fmtFecha(c.fecha)}</td>
                            <td>{c.proveedor?.nombre_fantasia || c.proveedor?.razon_social || '—'}</td>
                            <td><span className={`badge ${ESTADO_BADGE[c.estado] || 'badge--neutral'}`}>{c.estado}</span></td>
                            <td className="td-right">{fmt$(c.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
