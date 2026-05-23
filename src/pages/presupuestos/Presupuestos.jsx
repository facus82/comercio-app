import { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { usePresupuestos } from '../../hooks/usePresupuestos'
import { useClientes } from '../../hooks/useClientes'
import PresupuestoPanel from './PresupuestoPanel'
import PresupuestoPrint from './PresupuestoPrint'
import { supabase } from '../../lib/supabase'
import './Presupuestos.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

function fmtFecha(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

const ESTADO_BADGE = {
  pendiente:   'badge--warning',
  aprobado:    'badge--success',
  rechazado:   'badge--danger',
  vencido:     'badge--neutral',
  convertido:  'badge--info',
}

const ESTADOS = ['pendiente','aprobado','rechazado','vencido','convertido']

export default function Presupuestos() {
  const { perfil } = useAuth()
  const comercioId = perfil?.comercio?.id

  const { presupuestos, loading, crear, actualizarEstado } = usePresupuestos(comercioId, perfil?.id)
  const { clientes } = useClientes(comercioId)

  const [busqueda,     setBusqueda]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState(null)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [presImpresion, setPresImpresion] = useState(null) // { pres, items }

  async function verImprimir(pres) {
    const { data: items } = await supabase
      .from('presupuesto_items')
      .select('*')
      .eq('presupuesto_id', pres.id)
      .order('created_at')
    setPresImpresion({ pres, items: items || [] })
  }

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    return presupuestos.filter(p => {
      if (filtroEstado && p.estado !== filtroEstado) return false
      if (!q) return true
      const cliente = p.cliente_nombre || `${p.cliente?.nombre || ''} ${p.cliente?.apellido || ''}`
      return cliente.toLowerCase().includes(q) || (p.numero || '').toLowerCase().includes(q)
    })
  }, [presupuestos, busqueda, filtroEstado])

  return (
    <div className="presupuestos-page">
      <div className="page-header">
        <h1 className="page-title">Presupuestos</h1>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <i className="ti ti-search" />
            <input
              placeholder="Buscar cliente, número..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <div className="pills">
            <button className={`pill${!filtroEstado ? ' pill--active' : ''}`} onClick={() => setFiltroEstado(null)}>Todos</button>
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
          <i className="ti ti-plus" /> Nuevo presupuesto
        </button>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="table-loading">
            <i className="ti ti-loader-2" style={{ fontSize: 28, opacity: 0.4 }} />
            Cargando presupuestos...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="table-empty">
            <i className="ti ti-file-description" />
            <span>{busqueda || filtroEstado ? 'Sin resultados' : 'No hay presupuestos.'}</span>
            {!busqueda && !filtroEstado && (
              <button className="btn btn--primary" onClick={() => setPanelAbierto(true)}><i className="ti ti-plus" /> Nuevo presupuesto</button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Vencimiento</th>
                <th className="td-right">Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => {
                const nombreCliente = p.cliente_nombre ||
                  (p.cliente ? `${p.cliente.nombre} ${p.cliente.apellido || ''}`.trim() : '—')
                return (
                  <tr key={p.id}>
                    <td className="td-mono td-muted">{p.numero || '—'}</td>
                    <td className="td-muted">{fmtFecha(p.fecha)}</td>
                    <td className="pres-cliente">{nombreCliente}</td>
                    <td className="td-muted">{fmtFecha(p.fecha_vencimiento)}</td>
                    <td className="td-right" style={{ fontWeight: 500 }}>{fmt$(p.total)}</td>
                    <td>
                      <span className={`badge ${ESTADO_BADGE[p.estado] || 'badge--neutral'}`}>
                        {p.estado.charAt(0).toUpperCase() + p.estado.slice(1)}
                      </span>
                    </td>
                    <td className="td-actions" onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn-icon" title="Ver / Imprimir" onClick={() => verImprimir(p)}>
                          <i className="ti ti-printer" />
                        </button>
                        {p.estado === 'pendiente' && (
                          <>
                            <button className="btn-icon" title="Aprobar" onClick={() => actualizarEstado(p.id, 'aprobado')}>
                              <i className="ti ti-check" />
                            </button>
                            <button className="btn-icon btn-icon--danger" title="Rechazar" onClick={() => actualizarEstado(p.id, 'rechazado')}>
                              <i className="ti ti-x" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtrados.length > 0 && (
        <p className="pres-count">
          {filtrados.length} presupuesto{filtrados.length !== 1 ? 's' : ''}
          {busqueda || filtroEstado ? ' (filtrado)' : ''}
        </p>
      )}

      {panelAbierto && (
        <PresupuestoPanel
          clientes={clientes}
          comercioId={comercioId}
          onCrear={crear}
          onCerrar={() => setPanelAbierto(false)}
        />
      )}

      {presImpresion && (
        <div className="print-overlay">
          <PresupuestoPrint
            presupuesto={presImpresion}
            comercio={perfil?.comercio}
            onCerrar={() => setPresImpresion(null)}
          />
        </div>
      )}
    </div>
  )
}
