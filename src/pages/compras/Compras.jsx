import { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCompras } from '../../hooks/useCompras'
import { useProveedores } from '../../hooks/useProveedores'
import CompraPanel from './CompraPanel'
import './Compras.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

const ESTADOS = ['pendiente', 'pagada', 'parcial', 'anulada']

const ESTADO_BADGE = {
  pendiente: 'badge--warning',
  pagada:    'badge--success',
  parcial:   'badge--info',
  anulada:   'badge--neutral',
}

const TIPO_LABEL = {
  factura:      'Factura',
  factura_a:    'Fac. A',
  factura_b:    'Fac. B',
  factura_c:    'Fac. C',
  remito:       'Remito',
  ticket:       'Ticket',
  nota_credito: 'Nota Cred.',
}

function fmtFecha(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

export default function Compras() {
  const { perfil } = useAuth()
  const comercioId = perfil?.comercio?.id

  const { compras, loading, cargarItems, crear, actualizarEstado } = useCompras(comercioId, perfil?.id)
  const { proveedores } = useProveedores(comercioId)

  const [busqueda,      setBusqueda]      = useState('')
  const [filtroEstado,  setFiltroEstado]  = useState(null)
  const [panelAbierto,  setPanelAbierto]  = useState(false)

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase()
    return compras.filter(c => {
      if (filtroEstado && c.estado !== filtroEstado) return false
      if (!q) return true
      const prov = c.proveedor?.razon_social || ''
      const num  = c.numero || ''
      return prov.toLowerCase().includes(q) || num.toLowerCase().includes(q)
    })
  }, [compras, busqueda, filtroEstado])

  const totalPendiente = useMemo(
    () => compras.filter(c => c.estado === 'pendiente' || c.estado === 'parcial')
                 .reduce((s, c) => s + Number(c.total), 0),
    [compras]
  )

  return (
    <div className="compras-page">
      <div className="page-header">
        <h1 className="page-title">Compras</h1>
        {totalPendiente > 0 && (
          <span className="compras-deuda">
            <i className="ti ti-clock-dollar" />
            Deuda pendiente: {fmt$(totalPendiente)}
          </span>
        )}
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <i className="ti ti-search" />
            <input
              placeholder="Buscar proveedor, número..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <div className="pills">
            <button
              className={`pill${!filtroEstado ? ' pill--active' : ''}`}
              onClick={() => setFiltroEstado(null)}
            >
              Todas
            </button>
            {ESTADOS.map(est => (
              <button
                key={est}
                className={`pill${filtroEstado === est ? ' pill--active' : ''}`}
                onClick={() => setFiltroEstado(filtroEstado === est ? null : est)}
              >
                {est.charAt(0).toUpperCase() + est.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn--primary" onClick={() => setPanelAbierto(true)}>
          <i className="ti ti-plus" />
          Nueva compra
        </button>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="table-loading">
            <i className="ti ti-loader-2" style={{ fontSize: 28, opacity: 0.4 }} />
            Cargando compras...
          </div>
        ) : filtradas.length === 0 ? (
          <div className="table-empty">
            <i className="ti ti-shopping-cart" />
            <span>
              {busqueda || filtroEstado
                ? 'Sin resultados para el filtro aplicado'
                : 'No hay compras registradas. Cargá la primera.'}
            </span>
            {!busqueda && !filtroEstado && (
              <button className="btn btn--primary" onClick={() => setPanelAbierto(true)}>
                <i className="ti ti-plus" /> Nueva compra
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Comprobante</th>
                <th>N° comprobante</th>
                <th className="td-right">Subtotal</th>
                <th className="td-right">IVA</th>
                <th className="td-right">Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtradas.map(c => (
                <tr key={c.id}>
                  <td className="td-mono td-muted">{fmtFecha(c.fecha)}</td>
                  <td className="compra-prov">
                    {c.proveedor?.nombre_fantasia || c.proveedor?.razon_social || '—'}
                  </td>
                  <td className="td-muted">{TIPO_LABEL[c.tipo_comprobante] || c.tipo_comprobante}</td>
                  <td className="td-mono td-muted">{c.numero_comprobante || '—'}</td>
                  <td className="td-right td-muted">{fmt$(c.subtotal)}</td>
                  <td className="td-right td-muted">{fmt$(c.iva_monto)}</td>
                  <td className="td-right compra-total">{fmt$(c.total)}</td>
                  <td>
                    <span className={`badge ${ESTADO_BADGE[c.estado] || 'badge--neutral'}`}>
                      {c.estado.charAt(0).toUpperCase() + c.estado.slice(1)}
                    </span>
                  </td>
                  <td className="td-actions" onClick={e => e.stopPropagation()}>
                    {c.estado === 'pendiente' && (
                      <button
                        className="btn-icon"
                        title="Marcar pagada"
                        onClick={() => actualizarEstado(c.id, 'pagada')}
                      >
                        <i className="ti ti-check" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtradas.length > 0 && (
        <p className="compras-count">
          {filtradas.length} compra{filtradas.length !== 1 ? 's' : ''}
          {busqueda || filtroEstado ? ' (filtrado)' : ''}
        </p>
      )}

      {panelAbierto && (
        <CompraPanel
          proveedores={proveedores}
          comercioId={comercioId}
          onCrear={crear}
          onCerrar={() => setPanelAbierto(false)}
        />
      )}
    </div>
  )
}
