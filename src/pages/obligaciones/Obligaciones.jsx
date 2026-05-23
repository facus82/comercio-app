import { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useObligaciones } from '../../hooks/useObligaciones'
import { useProveedores } from '../../hooks/useProveedores'
import ObligacionPanel from './ObligacionPanel'
import PagoModal from './PagoModal'
import './Obligaciones.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

function fmtFecha(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function vencBadge(fecha) {
  if (!fecha) return null
  const hoy   = new Date(); hoy.setHours(0,0,0,0)
  const venc  = new Date(fecha + 'T00:00:00')
  const diff  = Math.ceil((venc - hoy) / 86400000)
  if (diff < 0)   return { cls: 'badge--danger',  label: `Vencida hace ${-diff}d` }
  if (diff === 0) return { cls: 'badge--danger',  label: 'Vence hoy' }
  if (diff <= 5)  return { cls: 'badge--warning', label: `Vence en ${diff}d` }
  return { cls: 'badge--success', label: fmtFecha(fecha) }
}

const CATEGORIAS = [
  'impuesto_nacional','impuesto_provincial','impuesto_municipal',
  'servicio','alquiler','empleado','proveedor','seguro','otro',
]

export default function Obligaciones() {
  const { perfil } = useAuth()
  const comercioId = perfil?.comercio?.id

  const { obligaciones, loading, crear, actualizar, toggleActivo, registrarPago } = useObligaciones(comercioId, perfil?.id)
  const { proveedores } = useProveedores(comercioId)

  const [busqueda,     setBusqueda]     = useState('')
  const [filtroCateg,  setFiltroCateg]  = useState(null)
  const [soloActivas,  setSoloActivas]  = useState(true)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [editando,     setEditando]     = useState(null)
  const [pagoOb,       setPagoOb]       = useState(null)

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase()
    return obligaciones.filter(o => {
      if (soloActivas && !o.activo) return false
      if (filtroCateg && o.categoria !== filtroCateg) return false
      if (!q) return true
      return o.nombre.toLowerCase().includes(q) || (o.organismo || '').toLowerCase().includes(q)
    })
  }, [obligaciones, busqueda, filtroCateg, soloActivas])

  const totalMensual = useMemo(
    () => obligaciones.filter(o => o.activo && o.periodicidad === 'mensual')
                      .reduce((s, o) => s + Number(o.monto_estimado), 0),
    [obligaciones]
  )

  function abrirNuevo()   { setEditando(null); setPanelAbierto(true) }
  function abrirEditar(o) { setEditando(o);    setPanelAbierto(true) }
  function cerrar()       { setPanelAbierto(false); setEditando(null) }

  return (
    <div className="obligaciones-page">
      <div className="page-header">
        <h1 className="page-title">Obligaciones impositivas</h1>
        {totalMensual > 0 && (
          <span className="ob-resumen">
            <i className="ti ti-calendar-due" />
            {fmt$(totalMensual)} / mes
          </span>
        )}
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <i className="ti ti-search" />
            <input
              placeholder="Buscar nombre, organismo..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <div className="pills">
            <button className={`pill${!filtroCateg ? ' pill--active' : ''}`} onClick={() => setFiltroCateg(null)}>Todas</button>
            <button className={`pill${filtroCateg === 'impuesto_nacional' ? ' pill--active' : ''}`} onClick={() => setFiltroCateg('impuesto_nacional')}>Nacional</button>
            <button className={`pill${filtroCateg === 'impuesto_provincial' ? ' pill--active' : ''}`} onClick={() => setFiltroCateg('impuesto_provincial')}>Provincial</button>
            <button className={`pill${filtroCateg === 'servicio' ? ' pill--active' : ''}`} onClick={() => setFiltroCateg('servicio')}>Servicios</button>
            <button className={`pill${!soloActivas ? ' pill--active' : ''}`} onClick={() => setSoloActivas(v => !v)}>
              {soloActivas ? 'Solo activas' : 'Todas'}
            </button>
          </div>
        </div>
        <button className="btn btn--primary" onClick={abrirNuevo}>
          <i className="ti ti-plus" /> Nueva obligación
        </button>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="table-loading">
            <i className="ti ti-loader-2" style={{ fontSize: 28, opacity: 0.4 }} />
            Cargando obligaciones...
          </div>
        ) : filtradas.length === 0 ? (
          <div className="table-empty">
            <i className="ti ti-receipt-tax" />
            <span>{busqueda || filtroCateg ? 'Sin resultados' : 'No hay obligaciones registradas.'}</span>
            {!busqueda && !filtroCateg && (
              <button className="btn btn--primary" onClick={abrirNuevo}><i className="ti ti-plus" /> Nueva obligación</button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Periodicidad</th>
                <th className="td-right">Monto estimado</th>
                <th>Próximo vencimiento</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtradas.map(o => {
                const vb = vencBadge(o.proximo_vencimiento)
                return (
                  <tr key={o.id} onClick={() => abrirEditar(o)}>
                    <td className="ob-nombre">{o.nombre}</td>
                    <td className="td-muted" style={{ textTransform: 'capitalize' }}>
                      {o.categoria.replace(/_/g, ' ')}
                    </td>
                    <td className="td-muted" style={{ textTransform: 'capitalize' }}>
                      {o.periodicidad}
                    </td>
                    <td className="td-right" style={{ fontWeight: 500 }}>{fmt$(o.monto_estimado)}</td>
                    <td>
                      {vb
                        ? <span className={`badge ${vb.cls}`}>{vb.label}</span>
                        : <span className="td-muted">—</span>
                      }
                    </td>
                    <td>
                      <span className={`badge ${o.activo ? 'badge--success' : 'badge--neutral'}`}>
                        {o.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="td-actions" onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn-icon" title="Registrar pago" onClick={() => setPagoOb(o)}>
                          <i className="ti ti-cash" />
                        </button>
                        <button className="btn-icon" title="Editar" onClick={() => abrirEditar(o)}>
                          <i className="ti ti-pencil" />
                        </button>
                        <button
                          className={`btn-icon${o.activo ? ' btn-icon--danger' : ''}`}
                          onClick={() => toggleActivo(o.id, !o.activo)}
                          title={o.activo ? 'Desactivar' : 'Activar'}
                        >
                          <i className={`ti ${o.activo ? 'ti-eye-off' : 'ti-eye'}`} />
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

      {panelAbierto && (
        <ObligacionPanel
          obligacion={editando}
          proveedores={proveedores}
          onCrear={crear}
          onActualizar={actualizar}
          onCerrar={cerrar}
        />
      )}

      {pagoOb && (
        <PagoModal
          obligacion={pagoOb}
          onRegistrar={registrarPago}
          onCerrar={() => setPagoOb(null)}
        />
      )}
    </div>
  )
}
