import { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useClientes } from '../../hooks/useClientes'
import ClientePanel from './ClientePanel'
import './Clientes.css'

const TIPO_BADGE = {
  consumidor_final:  { label: 'Consumidor',   cls: 'badge--neutral' },
  cuenta_corriente:  { label: 'Cta. Cte.',    cls: 'badge--info'    },
  mayorista:         { label: 'Mayorista',     cls: 'badge--warning' },
}

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

export default function Clientes() {
  const { perfil } = useAuth()
  const comercioId = perfil?.comercio?.id

  const { clientes, loading, crear, actualizar, toggleActivo } = useClientes(comercioId)

  const [busqueda,     setBusqueda]     = useState('')
  const [filtroTipo,   setFiltroTipo]   = useState(null)
  const [soloActivos,  setSoloActivos]  = useState(true)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [editando,     setEditando]     = useState(null)

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    return clientes.filter(c => {
      if (soloActivos && !c.activo) return false
      if (filtroTipo && c.tipo !== filtroTipo) return false
      if (!q) return true
      const nombre = `${c.nombre} ${c.apellido || ''} ${c.razon_social || ''}`.toLowerCase()
      return (
        nombre.includes(q) ||
        (c.dni || '').includes(q) ||
        (c.cuit || '').includes(q) ||
        (c.telefono || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
    })
  }, [clientes, busqueda, filtroTipo, soloActivos])

  function abrirNuevo()   { setEditando(null); setPanelAbierto(true) }
  function abrirEditar(c) { setEditando(c);    setPanelAbierto(true) }
  function cerrar()       { setPanelAbierto(false); setEditando(null) }

  return (
    <div className="clientes-page">
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <i className="ti ti-search" />
            <input
              placeholder="Buscar nombre, DNI, CUIT, email..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <div className="pills">
            <button className={`pill${!filtroTipo ? ' pill--active' : ''}`} onClick={() => setFiltroTipo(null)}>Todos</button>
            <button className={`pill${filtroTipo === 'cuenta_corriente' ? ' pill--active' : ''}`} onClick={() => setFiltroTipo('cuenta_corriente')}>Cta. Cte.</button>
            <button className={`pill${filtroTipo === 'mayorista' ? ' pill--active' : ''}`} onClick={() => setFiltroTipo('mayorista')}>Mayoristas</button>
            <button className={`pill${!soloActivos ? ' pill--active' : ''}`} onClick={() => setSoloActivos(v => !v)}>
              {soloActivos ? 'Solo activos' : 'Incluir inactivos'}
            </button>
          </div>
        </div>
        <button className="btn btn--primary" onClick={abrirNuevo}>
          <i className="ti ti-plus" /> Nuevo cliente
        </button>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="table-loading">
            <i className="ti ti-loader-2" style={{ fontSize: 28, opacity: 0.4 }} />
            Cargando clientes...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="table-empty">
            <i className="ti ti-users" />
            <span>{busqueda || filtroTipo ? 'Sin resultados' : 'No hay clientes. Creá el primero.'}</span>
            {!busqueda && !filtroTipo && (
              <button className="btn btn--primary" onClick={abrirNuevo}><i className="ti ti-plus" /> Nuevo cliente</button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>DNI / CUIT</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Tipo</th>
                <th className="td-right">Saldo</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(c => {
                const tipo = TIPO_BADGE[c.tipo] || { label: c.tipo, cls: 'badge--neutral' }
                return (
                  <tr key={c.id} onClick={() => abrirEditar(c)}>
                    <td className="cli-nombre">
                      {c.razon_social || `${c.nombre}${c.apellido ? ` ${c.apellido}` : ''}`}
                    </td>
                    <td className="td-mono td-muted">{c.cuit || c.dni || '—'}</td>
                    <td className="td-muted">{c.telefono || '—'}</td>
                    <td className="td-muted">{c.email || '—'}</td>
                    <td><span className={`badge ${tipo.cls}`}>{tipo.label}</span></td>
                    <td className="td-right">
                      {Number(c.saldo_cuenta) !== 0
                        ? <span className={Number(c.saldo_cuenta) < 0 ? 'cli-saldo--neg' : 'cli-saldo--pos'}>{fmt$(c.saldo_cuenta)}</span>
                        : <span className="td-muted">—</span>
                      }
                    </td>
                    <td>
                      <span className={`badge ${c.activo ? 'badge--success' : 'badge--neutral'}`}>
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="td-actions" onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn-icon" onClick={() => abrirEditar(c)} title="Editar"><i className="ti ti-pencil" /></button>
                        <button
                          className={`btn-icon${c.activo ? ' btn-icon--danger' : ''}`}
                          onClick={() => toggleActivo(c.id, !c.activo)}
                          title={c.activo ? 'Desactivar' : 'Activar'}
                        >
                          <i className={`ti ${c.activo ? 'ti-eye-off' : 'ti-eye'}`} />
                        </button>
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
        <p className="cli-count">
          {filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''}
          {busqueda || filtroTipo ? ' (filtrado)' : ''}
        </p>
      )}

      {panelAbierto && (
        <ClientePanel
          cliente={editando}
          onCrear={crear}
          onActualizar={actualizar}
          onCerrar={cerrar}
        />
      )}
    </div>
  )
}
