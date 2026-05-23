import { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useProveedores } from '../../hooks/useProveedores'
import ProveedorPanel from './ProveedorPanel'
import './Proveedores.css'

export default function Proveedores() {
  const { perfil } = useAuth()
  const comercioId = perfil?.comercio?.id

  const { proveedores, loading, crear, actualizar, toggleActivo } = useProveedores(comercioId)

  const [busqueda,     setBusqueda]     = useState('')
  const [soloActivos,  setSoloActivos]  = useState(true)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [editando,     setEditando]     = useState(null)

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    return proveedores.filter(p => {
      if (soloActivos && !p.activo) return false
      if (!q) return true
      return (
        p.razon_social.toLowerCase().includes(q) ||
        (p.nombre_fantasia || '').toLowerCase().includes(q) ||
        (p.cuit || '').includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      )
    })
  }, [proveedores, busqueda, soloActivos])

  function abrirNuevo()  { setEditando(null); setPanelAbierto(true) }
  function abrirEditar(p) { setEditando(p);   setPanelAbierto(true) }
  function cerrar()      { setPanelAbierto(false); setEditando(null) }

  return (
    <div className="proveedores-page">
      <div className="page-header">
        <h1 className="page-title">Proveedores</h1>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <i className="ti ti-search" />
            <input
              placeholder="Buscar razón social, CUIT, email..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <div className="pills">
            <button
              className={`pill${soloActivos ? ' pill--active' : ''}`}
              onClick={() => setSoloActivos(true)}
            >
              Activos
            </button>
            <button
              className={`pill${!soloActivos ? ' pill--active' : ''}`}
              onClick={() => setSoloActivos(false)}
            >
              Todos
            </button>
          </div>
        </div>
        <button className="btn btn--primary" onClick={abrirNuevo}>
          <i className="ti ti-plus" />
          Nuevo proveedor
        </button>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="table-loading">
            <i className="ti ti-loader-2" style={{ fontSize: 28, opacity: 0.4 }} />
            Cargando proveedores...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="table-empty">
            <i className="ti ti-truck" />
            <span>
              {busqueda ? 'Sin resultados para la búsqueda' : 'No hay proveedores. Creá el primero.'}
            </span>
            {!busqueda && (
              <button className="btn btn--primary" onClick={abrirNuevo}>
                <i className="ti ti-plus" /> Nuevo proveedor
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Razón social</th>
                <th>Nombre fantasia</th>
                <th>CUIT</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Plazo pago</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => (
                <tr key={p.id} onClick={() => abrirEditar(p)}>
                  <td className="prov-razon">{p.razon_social}</td>
                  <td className="td-muted">{p.nombre_fantasia || '—'}</td>
                  <td className="td-mono td-muted">{p.cuit || '—'}</td>
                  <td className="td-muted">{p.telefono || '—'}</td>
                  <td className="td-muted">{p.email || '—'}</td>
                  <td className="td-muted">
                    {p.plazo_pago_dias ? `${p.plazo_pago_dias} días` : '—'}
                  </td>
                  <td>
                    <span className={`badge ${p.activo ? 'badge--success' : 'badge--neutral'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="td-actions" onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn-icon" onClick={() => abrirEditar(p)} title="Editar">
                        <i className="ti ti-pencil" />
                      </button>
                      <button
                        className={`btn-icon${p.activo ? ' btn-icon--danger' : ''}`}
                        onClick={() => toggleActivo(p.id, !p.activo)}
                        title={p.activo ? 'Desactivar' : 'Activar'}
                      >
                        <i className={`ti ${p.activo ? 'ti-eye-off' : 'ti-eye'}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtrados.length > 0 && (
        <p className="prov-count">
          {filtrados.length} proveedor{filtrados.length !== 1 ? 'es' : ''}
          {busqueda ? ' (filtrado)' : ''}
        </p>
      )}

      {panelAbierto && (
        <ProveedorPanel
          proveedor={editando}
          onCrear={crear}
          onActualizar={actualizar}
          onCerrar={cerrar}
        />
      )}
    </div>
  )
}
