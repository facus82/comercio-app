import { useState, useMemo, useEffect } from 'react'
import './ActualizarPreciosModal.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 0,
  }).format(v || 0)

export default function ActualizarPreciosModal({
  productos, categorias, onActualizarMasivo, onCerrar,
}) {
  const [busqueda,        setBusqueda]        = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [seleccionados,   setSeleccionados]   = useState(new Set())
  const [modo,            setModo]            = useState('venta') // 'venta' | 'costo'
  const [variacion,       setVariacion]       = useState('')
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')

  /* ── Cerrar con Escape ── */
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  /* ── Filtrado ── */
  const productosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    return productos.filter(p => {
      if (q && !p.nombre.toLowerCase().includes(q) &&
               !(p.codigo || '').toLowerCase().includes(q) &&
               !(p.codigo_barras || '').toLowerCase().includes(q)) return false
      if (filtroCategoria && p.categoria_id !== filtroCategoria) return false
      return true
    })
  }, [productos, busqueda, filtroCategoria])

  /* ── Selección ── */
  const todosSeleccionados =
    productosFiltrados.length > 0 &&
    productosFiltrados.every(p => seleccionados.has(p.id))

  const algunoSeleccionado = productosFiltrados.some(p => seleccionados.has(p.id))

  function toggleTodos() {
    if (todosSeleccionados) {
      // Deseleccionar los que están visibles
      setSeleccionados(prev => {
        const next = new Set(prev)
        productosFiltrados.forEach(p => next.delete(p.id))
        return next
      })
    } else {
      setSeleccionados(prev => {
        const next = new Set(prev)
        productosFiltrados.forEach(p => next.add(p.id))
        return next
      })
    }
  }

  function toggleProducto(id) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /* ── Cálculo de nuevos precios ── */
  function calcularNuevos(p) {
    const pct = Number(variacion)
    if (!pct) return null

    if (modo === 'venta') {
      const nuevaVenta = +(Number(p.precio_venta) * (1 + pct / 100)).toFixed(2)
      return { costo: Number(p.precio_costo), venta: nuevaVenta }
    } else {
      // Modo costo: aumentar costo y mantener el factor costo→venta
      const costo = Number(p.precio_costo) || 0
      const venta = Number(p.precio_venta) || 0
      if (costo <= 0) return null
      const factor    = venta / costo                       // ratio original
      const nuevoCosto = +(costo * (1 + pct / 100)).toFixed(2)
      const nuevaVenta = +(nuevoCosto * factor).toFixed(2)
      return { costo: nuevoCosto, venta: nuevaVenta }
    }
  }

  /* ── Guardar ── */
  async function handleGuardar() {
    setError('')
    if (seleccionados.size === 0) { setError('Seleccioná al menos un producto.'); return }
    const pct = Number(variacion)
    if (!pct) { setError('Ingresá un porcentaje distinto de cero.'); return }

    const actualizaciones = []
    for (const id of seleccionados) {
      const p = productos.find(x => x.id === id)
      if (!p) continue
      const nuevos = calcularNuevos(p)
      if (!nuevos) continue
      actualizaciones.push({
        id,
        precio_costo:    nuevos.costo,
        precio_venta:    nuevos.venta,
        precio_mayorista: p.precio_mayorista ?? null,
      })
    }

    if (actualizaciones.length === 0) { setError('No hay precios para actualizar.'); return }

    setSaving(true)
    const res = await onActualizarMasivo(actualizaciones)
    setSaving(false)
    if (res?.error) setError(res.error)
    else onCerrar()
  }

  /* ── Resumen seleccionados fuera del filtro ── */
  const totalSeleccionados = seleccionados.size

  return (
    <>
      <div className="apm-backdrop" onClick={onCerrar} />

      <div className="apm-modal">

        {/* ── Header ── */}
        <div className="apm-header">
          <div className="apm-header-title">
            <i className="ti ti-trending-up" />
            Actualización masiva de precios
          </div>
          <button className="btn-icon" onClick={onCerrar} title="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>

        {/* ── Controles ── */}
        <div className="apm-controls">

          {/* Filtros */}
          <div className="apm-filters">
            <div className="search-box">
              <i className="ti ti-search" />
              <input
                placeholder="Buscar por nombre, código..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
            </div>
            <select
              className="field-select apm-select-cat"
              value={filtroCategoria}
              onChange={e => setFiltroCategoria(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {/* Ajuste */}
          <div className="apm-ajuste-wrap">
            <div className="apm-modos">
              <label className={`apm-modo${modo === 'venta' ? ' apm-modo--active' : ''}`}>
                <input type="radio" name="modo" value="venta"
                  checked={modo === 'venta'} onChange={() => setModo('venta')} />
                <i className="ti ti-tag" />
                % sobre precio de venta
              </label>
              <label className={`apm-modo${modo === 'costo' ? ' apm-modo--active' : ''}`}>
                <input type="radio" name="modo" value="costo"
                  checked={modo === 'costo'} onChange={() => setModo('costo')} />
                <i className="ti ti-building-store" />
                Costo subió → mantener margen
              </label>
            </div>

            <div className="apm-pct-row">
              <span className="apm-pct-label">
                {modo === 'venta'
                  ? 'Variación en precio de venta'
                  : 'Variación en costo (margen se mantiene)'}
              </span>
              <div className="apm-pct-input-wrap">
                <input
                  className="field-input apm-pct-input"
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={variacion}
                  onChange={e => setVariacion(e.target.value)}
                  autoFocus
                />
                <span className="apm-pct-sym">%</span>
              </div>
              {Number(variacion) !== 0 && (
                <span className={`apm-pct-hint ${Number(variacion) > 0 ? 'apm-pct-hint--up' : 'apm-pct-hint--down'}`}>
                  <i className={`ti ${Number(variacion) > 0 ? 'ti-arrow-up' : 'ti-arrow-down'}`} />
                  {Math.abs(Number(variacion))}% de {Number(variacion) > 0 ? 'aumento' : 'baja'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Tabla ── */}
        <div className="apm-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={todosSeleccionados}
                    ref={el => { if (el) el.indeterminate = !todosSeleccionados && algunoSeleccionado }}
                    onChange={toggleTodos}
                    title="Seleccionar todos los visibles"
                  />
                </th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th className="td-right">Costo actual</th>
                <th className="td-right">Venta actual</th>
                <th className="td-right apm-col-nuevo">Venta nueva</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-tertiary)' }}>
                    <i className="ti ti-package" style={{ fontSize: 20, display: 'block', marginBottom: 6 }} />
                    Sin resultados
                  </td>
                </tr>
              ) : productosFiltrados.map(p => {
                const sel    = seleccionados.has(p.id)
                const nuevos = sel ? calcularNuevos(p) : null
                return (
                  <tr
                    key={p.id}
                    className={sel ? 'apm-row--selected' : ''}
                    onClick={() => toggleProducto(p.id)}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={sel}
                        onChange={() => toggleProducto(p.id)} />
                    </td>

                    <td className="apm-nombre">{p.nombre}</td>

                    <td>
                      {p.categoria ? (
                        <span className="badge-cat" style={{ '--cat-color': p.categoria.color }}>
                          {p.categoria.nombre}
                        </span>
                      ) : <span className="td-muted">—</span>}
                    </td>

                    {/* Costo */}
                    <td className="td-right td-muted">
                      {nuevos && modo === 'costo' ? (
                        <span className="apm-cambio">
                          <span className="apm-old">{fmt$(p.precio_costo)}</span>
                          <i className="ti ti-arrow-narrow-right" />
                          <span className="apm-new-costo">{fmt$(nuevos.costo)}</span>
                        </span>
                      ) : fmt$(p.precio_costo)}
                    </td>

                    {/* Venta actual */}
                    <td className="td-right">{fmt$(p.precio_venta)}</td>

                    {/* Venta nueva */}
                    <td className="td-right apm-col-nuevo">
                      {nuevos ? (
                        <span className="apm-precio-nuevo">{fmt$(nuevos.venta)}</span>
                      ) : (
                        <span className="td-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer ── */}
        <div className="apm-footer">
          <div className="apm-footer-info">
            {totalSeleccionados > 0 ? (
              <span className="apm-sel-count">
                <i className="ti ti-check" />
                {totalSeleccionados} producto{totalSeleccionados !== 1 ? 's' : ''} seleccionado{totalSeleccionados !== 1 ? 's' : ''}
              </span>
            ) : (
              <span className="td-muted" style={{ fontSize: 11 }}>
                Seleccioná los productos a actualizar
              </span>
            )}
            {error && (
              <span className="apm-error">
                <i className="ti ti-alert-circle" /> {error}
              </span>
            )}
          </div>
          <div className="apm-footer-btns">
            <button className="btn" onClick={onCerrar}>
              <i className="ti ti-x" /> Cancelar
            </button>
            <button
              className="btn btn--primary"
              onClick={handleGuardar}
              disabled={saving || totalSeleccionados === 0 || !Number(variacion)}
            >
              <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
              {saving
                ? 'Actualizando...'
                : `Actualizar ${totalSeleccionados || ''} producto${totalSeleccionados !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
