import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useReportes } from '../../hooks/useReportes'
import './Reportes.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

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
}

const ESTADO_BADGE = {
  pendiente: 'badge--warning',
  parcial:   'badge--info',
  pagada:    'badge--success',
  anulada:   'badge--neutral',
}

function calcRango(periodo, custom) {
  const hoy = new Date()
  const pad  = n => String(n).padStart(2, '0')
  const fmt  = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (periodo === 'mes_actual') {
    return {
      desde: `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-01`,
      hasta: fmt(hoy),
    }
  }
  if (periodo === 'mes_anterior') {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    const ultimo  = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
    return { desde: fmt(primero), hasta: fmt(ultimo) }
  }
  if (periodo === '7_dias') {
    const hace7 = new Date(hoy.getTime() - 7 * 86400000)
    return { desde: fmt(hace7), hasta: fmt(hoy) }
  }
  return { desde: custom.desde, hasta: custom.hasta }
}

export default function Reportes() {
  const { perfil }    = useAuth()
  const comercioId    = perfil?.comercio?.id
  const { cargarVentas, cargarStock, cargarCompras } = useReportes(comercioId)

  const [tab,     setTab]     = useState('ventas')
  const [periodo, setPeriodo] = useState('mes_actual')
  const [custom,  setCustom]  = useState({ desde: '', hasta: '' })

  const rango = calcRango(periodo, custom)

  // Datos por tab
  const [datosVentas,  setDatosVentas]  = useState(null)
  const [datosStock,   setDatosStock]   = useState(null)
  const [datosCompras, setDatosCompras] = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [errorMsg,     setErrorMsg]     = useState('')

  const cargar = useCallback(async (t) => {
    if (!comercioId) return
    if (periodo === 'custom' && (!custom.desde || !custom.hasta)) return
    setLoading(true)
    setErrorMsg('')
    try {
      if (t === 'ventas') {
        const data = await cargarVentas(rango.desde, rango.hasta)
        setDatosVentas(data)
      } else if (t === 'stock') {
        const data = await cargarStock()
        setDatosStock(data)
      } else {
        const data = await cargarCompras(rango.desde, rango.hasta)
        setDatosCompras(data)
      }
    } catch (e) {
      setErrorMsg(e.message)
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comercioId, tab, rango.desde, rango.hasta])

  // Carga al cambiar tab o período
  useEffect(() => { cargar(tab) }, [tab, rango.desde, rango.hasta, comercioId])

  function handlePeriodo(p) {
    setPeriodo(p)
    if (p !== 'custom') {
      setDatosVentas(null)
      setDatosCompras(null)
    }
  }

  const maxVenta = datosVentas?.ventasPorDia?.length
    ? Math.max(...datosVentas.ventasPorDia.map(d => d.total))
    : 1

  const maxMedio = datosVentas?.porMedioPago
    ? Math.max(...Object.values(datosVentas.porMedioPago))
    : 1

  const maxProv = datosCompras?.porProveedor?.length
    ? Math.max(...datosCompras.porProveedor.map(p => p.total))
    : 1

  const maxCat = datosStock?.porCategoria?.length
    ? Math.max(...datosStock.porCategoria.map(c => c.valor))
    : 1

  return (
    <div className="reportes-page">

      {/* Header */}
      <div className="reportes-top">
        <h1 className="reportes-title">
          <i className="ti ti-chart-bar" style={{ marginRight: 8 }} />
          Reportes
        </h1>

        {/* Selector período (solo para tabs con rango) */}
        {tab !== 'stock' && (
          <div className="periodo-bar">
            {[
              { id: 'mes_actual',   label: 'Este mes'      },
              { id: 'mes_anterior', label: 'Mes anterior'  },
              { id: '7_dias',       label: 'Últimos 7 días'},
              { id: 'custom',       label: 'Personalizado' },
            ].map(p => (
              <button key={p.id}
                className={`btn ${periodo === p.id ? 'btn--primary' : ''}`}
                onClick={() => handlePeriodo(p.id)}>
                {p.label}
              </button>
            ))}
            {periodo === 'custom' && (
              <div className="periodo-custom">
                <input type="date" className="field-input" style={{ width: 140 }}
                  value={custom.desde}
                  onChange={e => setCustom(p => ({ ...p, desde: e.target.value }))} />
                <span className="td-muted">→</span>
                <input type="date" className="field-input" style={{ width: 140 }}
                  value={custom.hasta}
                  onChange={e => setCustom(p => ({ ...p, hasta: e.target.value }))} />
                <button className="btn btn--primary" onClick={() => cargar(tab)}>
                  <i className="ti ti-search" /> Buscar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="reportes-tabs">
        {[
          { id: 'ventas',  label: 'Ventas',     icon: 'ti-receipt'   },
          { id: 'stock',   label: 'Inventario', icon: 'ti-package'   },
          { id: 'compras', label: 'Compras',    icon: 'ti-shopping-cart' },
        ].map(t => (
          <button key={t.id}
            className={`reportes-tab ${tab === t.id ? 'reportes-tab--active' : ''}`}
            onClick={() => setTab(t.id)}>
            <i className={`ti ${t.icon}`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="reportes-body">

        {errorMsg && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            <i className="ti ti-alert-circle" /> {errorMsg}
          </div>
        )}

        {loading && (
          <div className="reportes-loading">
            <i className="ti ti-loader-2" style={{ fontSize: 28, opacity: 0.5 }} />
          </div>
        )}

        {/* ── TAB VENTAS ── */}
        {!loading && tab === 'ventas' && datosVentas && (
          <div className="reportes-content">

            {/* KPIs */}
            <div className="reportes-kpis">
              <div className="metric-card">
                <p className="metric-card__label">Total vendido</p>
                <p className="metric-card__value">{fmt$(datosVentas.totalVentas)}</p>
              </div>
              <div className="metric-card">
                <p className="metric-card__label">Tickets</p>
                <p className="metric-card__value">{datosVentas.cantTickets}</p>
              </div>
              <div className="metric-card">
                <p className="metric-card__label">Ticket promedio</p>
                <p className="metric-card__value">{fmt$(datosVentas.ticketPromedio)}</p>
              </div>
              <div className="metric-card">
                <p className="metric-card__label">Margen bruto est.</p>
                <p className="metric-card__value" style={{ color: datosVentas.margenBruto >= 0 ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}>
                  {fmt$(datosVentas.margenBruto)}
                </p>
              </div>
            </div>

            <div className="reportes-grid">

              {/* Ventas por día */}
              <div className="reporte-card">
                <p className="reporte-card__title">
                  <i className="ti ti-calendar-stats" /> Ventas por día
                </p>
                {datosVentas.ventasPorDia.length === 0 ? (
                  <p className="td-muted" style={{ fontSize: 13 }}>Sin ventas en el período.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th className="td-right">Tickets</th>
                        <th className="td-right">Total</th>
                        <th style={{ width: 120 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {datosVentas.ventasPorDia.map(d => (
                        <tr key={d.fecha}>
                          <td className="td-muted">{fmtFecha(d.fecha)}</td>
                          <td className="td-right td-mono">{d.cant}</td>
                          <td className="td-right td-mono">{fmt$(d.total)}</td>
                          <td>
                            <div className="mini-bar-wrap">
                              <div className="mini-bar" style={{ width: `${(d.total / maxVenta) * 100}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Top productos */}
              <div className="reporte-card">
                <p className="reporte-card__title">
                  <i className="ti ti-star" /> Top 10 productos
                </p>
                {datosVentas.topProductos.length === 0 ? (
                  <p className="td-muted" style={{ fontSize: 13 }}>Sin datos.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th className="td-right">Cant.</th>
                        <th className="td-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datosVentas.topProductos.map((p, i) => (
                        <tr key={i}>
                          <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span className="td-muted" style={{ fontSize: 10, marginRight: 4 }}>#{i + 1}</span>
                            {p.nombre}
                          </td>
                          <td className="td-right td-mono td-muted">{p.cant}</td>
                          <td className="td-right td-mono">{fmt$(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Por medio de pago */}
              <div className="reporte-card">
                <p className="reporte-card__title">
                  <i className="ti ti-credit-card" /> Por medio de pago
                </p>
                {Object.keys(datosVentas.porMedioPago).length === 0 ? (
                  <p className="td-muted" style={{ fontSize: 13 }}>Sin datos.</p>
                ) : (
                  <div className="medio-pago-list">
                    {Object.entries(datosVentas.porMedioPago)
                      .sort((a, b) => b[1] - a[1])
                      .map(([medio, monto]) => (
                        <div key={medio} className="medio-pago-row">
                          <span className="medio-pago-label">{MEDIOS_LABEL[medio] || medio}</span>
                          <div className="mini-bar-wrap" style={{ flex: 1, margin: '0 10px' }}>
                            <div className="mini-bar mini-bar--accent" style={{ width: `${(monto / maxMedio) * 100}%` }} />
                          </div>
                          <span className="medio-pago-monto td-mono">{fmt$(monto)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ── TAB STOCK ── */}
        {!loading && tab === 'stock' && datosStock && (
          <div className="reportes-content">

            <div className="reportes-kpis">
              <div className="metric-card" style={{ gridColumn: 'span 2' }}>
                <p className="metric-card__label">Valor total del inventario</p>
                <p className="metric-card__value">{fmt$(datosStock.totalValor)}</p>
              </div>
              <div className="metric-card">
                <p className="metric-card__label">Categorías con stock</p>
                <p className="metric-card__value">{datosStock.porCategoria.length}</p>
              </div>
              <div className="metric-card">
                <p className="metric-card__label">Productos sin stock</p>
                <p className="metric-card__value" style={{ color: datosStock.sinStock.length > 0 ? 'var(--color-text-danger)' : undefined }}>
                  {datosStock.sinStock.length}
                </p>
              </div>
            </div>

            <div className="reportes-grid">

              {/* Por categoría */}
              <div className="reporte-card reporte-card--wide">
                <p className="reporte-card__title">
                  <i className="ti ti-tag" /> Valorización por categoría
                </p>
                {datosStock.porCategoria.length === 0 ? (
                  <p className="td-muted" style={{ fontSize: 13 }}>Sin productos con stock.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Categoría</th>
                        <th className="td-right">Productos</th>
                        <th className="td-right">Valor</th>
                        <th style={{ width: 140 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {datosStock.porCategoria.map(c => (
                        <tr key={c.nombre}>
                          <td>
                            {c.color && <span className="cat-dot" style={{ background: c.color }} />}
                            {c.nombre}
                          </td>
                          <td className="td-right td-mono td-muted">{c.cant}</td>
                          <td className="td-right td-mono">{fmt$(c.valor)}</td>
                          <td>
                            <div className="mini-bar-wrap">
                              <div className="mini-bar mini-bar--cat"
                                style={{ width: `${(c.valor / maxCat) * 100}%`, background: c.color || undefined }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Productos sin stock */}
              {datosStock.sinStock.length > 0 && (
                <div className="reporte-card">
                  <p className="reporte-card__title">
                    <i className="ti ti-alert-triangle" style={{ color: 'var(--color-text-danger)' }} />
                    {' '}Productos sin stock ({datosStock.sinStock.length})
                  </p>
                  <table className="data-table">
                    <thead>
                      <tr><th>Producto</th><th className="td-right">Stock</th></tr>
                    </thead>
                    <tbody>
                      {datosStock.sinStock.slice(0, 20).map((p, i) => (
                        <tr key={i}>
                          <td>{p.nombre}</td>
                          <td className="td-right">
                            <span className="badge badge--danger">{p.stock_actual}</span>
                          </td>
                        </tr>
                      ))}
                      {datosStock.sinStock.length > 20 && (
                        <tr>
                          <td colSpan={2} className="td-muted" style={{ fontSize: 11 }}>
                            ...y {datosStock.sinStock.length - 20} más
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── TAB COMPRAS ── */}
        {!loading && tab === 'compras' && datosCompras && (
          <div className="reportes-content">

            <div className="reportes-kpis">
              <div className="metric-card">
                <p className="metric-card__label">Total comprado</p>
                <p className="metric-card__value">{fmt$(datosCompras.totalComprado)}</p>
              </div>
              <div className="metric-card">
                <p className="metric-card__label">Compras en el período</p>
                <p className="metric-card__value">{datosCompras.cantCompras}</p>
              </div>
            </div>

            <div className="reportes-grid">

              {/* Por proveedor */}
              {datosCompras.porProveedor.length > 0 && (
                <div className="reporte-card">
                  <p className="reporte-card__title">
                    <i className="ti ti-truck-delivery" /> Por proveedor
                  </p>
                  <div className="medio-pago-list">
                    {datosCompras.porProveedor.map(p => (
                      <div key={p.nombre} className="medio-pago-row">
                        <span className="medio-pago-label">{p.nombre}</span>
                        <div className="mini-bar-wrap" style={{ flex: 1, margin: '0 10px' }}>
                          <div className="mini-bar mini-bar--accent" style={{ width: `${(p.total / maxProv) * 100}%` }} />
                        </div>
                        <span className="medio-pago-monto td-mono">{fmt$(p.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de compras */}
              <div className="reporte-card reporte-card--wide">
                <p className="reporte-card__title">
                  <i className="ti ti-list" /> Compras del período
                </p>
                {datosCompras.compras.length === 0 ? (
                  <p className="td-muted" style={{ fontSize: 13 }}>Sin compras en el período.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Proveedor</th>
                        <th>Estado</th>
                        <th className="td-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datosCompras.compras.map(c => (
                        <tr key={c.id}>
                          <td className="td-muted" style={{ fontSize: 12 }}>{fmtFecha(c.fecha)}</td>
                          <td>{c.proveedor?.nombre_fantasia || c.proveedor?.razon_social || '—'}</td>
                          <td>
                            <span className={`badge ${ESTADO_BADGE[c.estado] || 'badge--neutral'}`}>
                              {c.estado}
                            </span>
                          </td>
                          <td className="td-right td-mono">{fmt$(c.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

            </div>
          </div>
        )}

        {!loading && !datosVentas && !datosStock && !datosCompras && (
          <div className="reportes-loading">
            <i className="ti ti-chart-bar" style={{ fontSize: 28, opacity: 0.3 }} />
          </div>
        )}
      </div>
    </div>
  )
}
