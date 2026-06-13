import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useProductos } from '../../hooks/useProductos'
import ProductoPanel from './ProductoPanel'
import ImportarExcel from './ImportarExcel'
import ActualizarPreciosModal from './ActualizarPreciosModal'
import PromocionesModal from './PromocionesModal'
import ComparadorProveedorModal from './ComparadorProveedorModal'
import { SkeletonTableBody } from '../../components/shared/Skeleton'
import './Stock.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

function stockBadge(p) {
  const actual = Number(p.stock_actual)
  const minimo = Number(p.stock_minimo)
  if (!p.controla_stock || p.es_servicio) return null
  if (actual <= 0)      return { label: 'Sin stock',  cls: 'badge--danger'  }
  if (actual <= minimo) return { label: 'Stock bajo', cls: 'badge--warning' }
  return { label: `${actual}`, cls: 'badge--success' }
}

export default function Stock() {
  const { perfil } = useAuth()
  const comercioId = perfil?.comercio?.id
  const [searchParams, setSearchParams] = useSearchParams()

  const {
    productos, categorias, subcategorias, proveedores, centrosCostos,
    loading, crear, actualizar, actualizarMasivo, toggleActivo,
  } = useProductos(comercioId, perfil?.id)

  const [busqueda,          setBusqueda]          = useState('')
  const [filtroCategoria,   setFiltroCategoria]   = useState(null)
  const [filtroSubcategoria,setFiltroSubcategoria] = useState(null)
  const [soloStockBajo,     setSoloStockBajo]     = useState(false)
  const [panelAbierto,    setPanelAbierto]    = useState(false)
  const [productoEditar,  setProductoEditar]  = useState(null)
  const [importando,      setImportando]      = useState(false)
  const [actualizandoPrecios,  setActualizandoPrecios]  = useState(false)
  const [gestionandoPromos,   setGestionandoPromos]    = useState(false)
  const [comparandoProveedor, setComparandoProveedor]  = useState(false)

  // Aplicar filtros desde URL (ej: /stock?stockBajo=1 o /stock?q=cafe)
  useEffect(() => {
    const qParam        = searchParams.get('q')
    const stockBajoParam = searchParams.get('stockBajo')
    if (qParam)              setBusqueda(qParam)
    if (stockBajoParam === '1') setSoloStockBajo(true)
    // Limpiar params de la URL sin recargar
    if (qParam || stockBajoParam) setSearchParams({}, { replace: true })
  }, []) // solo al montar

  const productosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    return productos.filter(p => {
      if (q && !p.nombre.toLowerCase().includes(q) &&
               !(p.codigo || '').toLowerCase().includes(q) &&
               !(p.codigo_barras || '').toLowerCase().includes(q)) return false
      if (filtroCategoria   && p.categoria_id    !== filtroCategoria)   return false
      if (filtroSubcategoria && p.subcategoria_id !== filtroSubcategoria) return false
      if (soloStockBajo && p.controla_stock && !p.es_servicio) {
        if (Number(p.stock_actual) > Number(p.stock_minimo)) return false
      } else if (soloStockBajo) {
        return false
      }
      return true
    })
  }, [productos, busqueda, filtroCategoria, filtroSubcategoria, soloStockBajo])

  const stockBajoTotal = useMemo(
    () => productos.filter(p => p.controla_stock && !p.es_servicio &&
          Number(p.stock_actual) <= Number(p.stock_minimo)).length,
    [productos]
  )

  function abrirNuevo() { setProductoEditar(null); setPanelAbierto(true) }
  function abrirEditar(p) { setProductoEditar(p); setPanelAbierto(true) }
  function cerrar() { setPanelAbierto(false); setProductoEditar(null) }

  return (
    <div className="stock-page">
      {/* Encabezado */}
      <div className="page-header">
        <h1 className="page-title">Stock</h1>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <i className="ti ti-search" />
            <input
              placeholder="Buscar nombre, código, barras..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>

          <div className="pills">
            <button
              className={`pill${!filtroCategoria && !soloStockBajo ? ' pill--active' : ''}`}
              onClick={() => { setFiltroCategoria(null); setFiltroSubcategoria(null); setSoloStockBajo(false) }}
            >
              Todos
            </button>
            {categorias.map(cat => (
              <button
                key={cat.id}
                className={`pill${filtroCategoria === cat.id ? ' pill--active' : ''}`}
                style={{ '--pill-color': cat.color }}
                onClick={() => { setFiltroCategoria(cat.id); setFiltroSubcategoria(null); setSoloStockBajo(false) }}
              >
                {cat.nombre}
              </button>
            ))}
            {stockBajoTotal > 0 && (
              <button
                className={`pill pill--warning${soloStockBajo ? ' pill--active' : ''}`}
                onClick={() => { setSoloStockBajo(b => !b); setFiltroCategoria(null) }}
              >
                <i className="ti ti-alert-triangle" />
                Stock bajo ({stockBajoTotal})
              </button>
            )}
          </div>

          {/* Subcategorías — solo cuando hay categoría seleccionada */}
          {filtroCategoria && subcategorias.filter(s => s.categoria_id === filtroCategoria).length > 0 && (
            <div className="pills" style={{ paddingTop: 4, borderTop: '0.5px solid var(--color-border)', marginTop: 4 }}>
              <button
                className={`pill${!filtroSubcategoria ? ' pill--active' : ''}`}
                onClick={() => setFiltroSubcategoria(null)}
              >
                Todas
              </button>
              {subcategorias.filter(s => s.categoria_id === filtroCategoria).map(s => (
                <button
                  key={s.id}
                  className={`pill${filtroSubcategoria === s.id ? ' pill--active' : ''}`}
                  onClick={() => setFiltroSubcategoria(s.id)}
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" onClick={() => setImportando(true)}>
            <i className="ti ti-file-import" />
            Importar Excel
          </button>
          <button className="btn" onClick={() => setActualizandoPrecios(true)}>
            <i className="ti ti-trending-up" />
            Actualizar precios
          </button>
          <button className="btn" onClick={() => setComparandoProveedor(true)}>
            <i className="ti ti-file-diff" />
            Comparar proveedor
          </button>
          <button className="btn" onClick={() => setGestionandoPromos(true)}>
            <i className="ti ti-tag-starred" />
            Promociones
          </button>
          <button className="btn btn--primary" onClick={abrirNuevo}>
            <i className="ti ti-plus" />
            Nuevo producto
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-wrap">
        {loading ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th><th>Nombre</th><th>Categoría</th>
                <th className="td-right">Costo</th><th className="td-right">Venta c/IVA</th>
                <th>Stock</th><th>Estado</th><th />
              </tr>
            </thead>
            <SkeletonTableBody rows={8} cols={8} />
          </table>
        ) : productosFiltrados.length === 0 ? (
          <div className="table-empty">
            <i className="ti ti-package" />
            <span>
              {busqueda || filtroCategoria || soloStockBajo
                ? 'Sin resultados para el filtro aplicado'
                : 'No hay productos. Creá el primero.'}
            </span>
            {!busqueda && !filtroCategoria && !soloStockBajo && (
              <button className="btn btn--primary" onClick={abrirNuevo}>
                <i className="ti ti-plus" /> Nuevo producto
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th className="td-right">Costo</th>
                <th className="td-right">Venta c/IVA</th>
                <th>Stock</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map(p => {
                const sb = stockBadge(p)
                return (
                  <tr key={p.id} onClick={() => abrirEditar(p)}>
                    <td className="td-mono td-muted">
                      {p.codigo_barras || p.codigo || '—'}
                    </td>
                    <td className="stock-nombre">
                      {p.nombre}
                      {p.es_servicio && (
                        <span className="badge badge--info" style={{ marginLeft: 6 }}>Servicio</span>
                      )}
                    </td>
                    <td>
                      {p.categoria ? (
                        <span className="badge-cat" style={{ '--cat-color': p.categoria.color }}>
                          {p.categoria.nombre}
                        </span>
                      ) : <span className="td-muted">—</span>}
                    </td>
                    <td className="td-right td-muted">{fmt$(p.precio_costo)}</td>
                    <td className="td-right stock-precio-venta">{fmt$(p.precio_venta)}</td>
                    <td>
                      {sb ? (
                        <span className={`badge ${sb.cls}`}>
                          {sb.label === 'Sin stock' || sb.label === 'Stock bajo'
                            ? sb.label
                            : `${sb.label} / ${Number(p.stock_minimo)} ${p.unidad_medida}`
                          }
                        </span>
                      ) : (
                        <span className="td-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${p.activo ? 'badge--success' : 'badge--neutral'}`}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="td-actions" onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          className="btn-icon"
                          onClick={() => abrirEditar(p)}
                          title="Editar"
                        >
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
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Contador */}
      {!loading && productosFiltrados.length > 0 && (
        <p className="stock-count">
          {productosFiltrados.length} producto{productosFiltrados.length !== 1 ? 's' : ''}
          {busqueda || filtroCategoria || soloStockBajo ? ' (filtrado)' : ''}
        </p>
      )}

      {/* Modal importar Excel */}
      {importando && (
        <ImportarExcel
          productos={productos}
          categorias={categorias}
          comercioId={comercioId}
          onCrear={crear}
          onActualizar={actualizar}
          onCerrar={() => setImportando(false)}
        />
      )}

      {/* Modal actualización masiva de precios */}
      {gestionandoPromos && (
        <PromocionesModal
          comercioId={comercioId}
          categorias={categorias}
          subcategorias={subcategorias}
          onCerrar={() => setGestionandoPromos(false)}
        />
      )}

      {actualizandoPrecios && (
        <ActualizarPreciosModal
          productos={productos}
          categorias={categorias}
          subcategorias={subcategorias}
          onActualizarMasivo={actualizarMasivo}
          onCerrar={() => setActualizandoPrecios(false)}
        />
      )}

      {/* Modal comparador lista proveedor */}
      {comparandoProveedor && (
        <ComparadorProveedorModal
          productos={productos}
          proveedores={proveedores}
          categorias={categorias}
          subcategorias={subcategorias}
          comercioId={comercioId}
          onActualizarMasivo={actualizarMasivo}
          onCerrar={() => setComparandoProveedor(false)}
        />
      )}

      {/* Panel lateral */}
      {panelAbierto && (
        <ProductoPanel
          producto={productoEditar}
          categorias={categorias}
          subcategorias={subcategorias}
          proveedores={proveedores}
          centrosCostos={centrosCostos}
          onCrear={crear}
          onActualizar={actualizar}
          onCerrar={cerrar}
        />
      )}
    </div>
  )
}
