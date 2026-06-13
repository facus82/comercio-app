import { useState, useMemo, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import './ComparadorProveedorModal.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'

/* Normaliza texto para matching: minúsculas, sin acentos, sin doble espacio */
function norm(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

/* Intenta parear una fila del Excel con un producto del catálogo */
function matchProducto(fila, colCodigo, colNombre, productos) {
  const codigoProveedor = colCodigo ? String(fila[colCodigo] ?? '').trim() : ''
  const nombreProveedor = colNombre ? norm(String(fila[colNombre] ?? '')) : ''

  if (codigoProveedor) {
    const exacto = productos.find(p =>
      (p.codigo_barras || '').trim() === codigoProveedor ||
      (p.codigo        || '').trim() === codigoProveedor
    )
    if (exacto) return exacto
  }

  if (nombreProveedor) {
    const exactoNombre = productos.find(p => norm(p.nombre) === nombreProveedor)
    if (exactoNombre) return exactoNombre
    // parcial: el nombre del catálogo está contenido en el del proveedor o viceversa
    const parcial = productos.find(p =>
      norm(p.nombre).includes(nombreProveedor) ||
      nombreProveedor.includes(norm(p.nombre))
    )
    if (parcial) return parcial
  }

  return null
}

const CFG_KEY = (comercioId, proveedorId) => `excel_cfg_${comercioId}_${proveedorId}`

function cargarCfg(comercioId, proveedorId) {
  try { return JSON.parse(localStorage.getItem(CFG_KEY(comercioId, proveedorId)) || 'null') } catch { return null }
}

function guardarCfg(comercioId, proveedorId, cfg) {
  try { localStorage.setItem(CFG_KEY(comercioId, proveedorId), JSON.stringify(cfg)) } catch {}
}

export default function ComparadorProveedorModal({ productos, proveedores = [], comercioId, onActualizarMasivo, onCerrar }) {
  const [paso,          setPaso]          = useState('upload')   // upload | mapeo | informe
  const [filas,         setFilas]         = useState([])
  const [columnas,      setColumnas]      = useState([])
  const [colCodigo,     setColCodigo]     = useState('')
  const [colNombre,     setColNombre]     = useState('')
  const [colPrecio,     setColPrecio]     = useState('')
  const [proveedorId,   setProveedorId]   = useState('')
  const [cfgGuardada,   setCfgGuardada]   = useState(false)
  const [errUpload,     setErrUpload]     = useState('')
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState('')
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [filtro,        setFiltro]        = useState('todos')   // todos | emparejados | sin_match
  const inputRef = useRef(null)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  /* Cuando cambia el proveedor, intentar cargar su config guardada */
  function onProveedorChange(id) {
    setProveedorId(id)
    setCfgGuardada(false)
    if (!id || !columnas.length) return
    const cfg = cargarCfg(comercioId, id)
    if (!cfg) return
    // Solo aplicar si las columnas del archivo coinciden
    if (cfg.colCodigo && columnas.includes(cfg.colCodigo)) setColCodigo(cfg.colCodigo)
    if (cfg.colNombre && columnas.includes(cfg.colNombre)) setColNombre(cfg.colNombre)
    if (cfg.colPrecio && columnas.includes(cfg.colPrecio)) setColPrecio(cfg.colPrecio)
    setCfgGuardada(true)
  }

  /* ── Paso 1: cargar Excel ── */
  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setErrUpload('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!data.length) { setErrUpload('El archivo está vacío o no tiene filas de datos.'); return }
        const cols = Object.keys(data[0])
        setFilas(data)
        setColumnas(cols)

        // Si hay proveedor seleccionado con config guardada, aplicarla
        let cfg = proveedorId ? cargarCfg(comercioId, proveedorId) : null
        if (cfg && cols.includes(cfg.colPrecio)) {
          setColCodigo(cfg.colCodigo && cols.includes(cfg.colCodigo) ? cfg.colCodigo : '')
          setColNombre(cfg.colNombre && cols.includes(cfg.colNombre) ? cfg.colNombre : '')
          setColPrecio(cfg.colPrecio)
          setCfgGuardada(true)
          setSeleccionados(new Set())
          setPaso('informe')
        } else {
          // Auto-detectar columnas por nombre común
          const detectar = (keywords) => cols.find(c => keywords.some(k => norm(c).includes(k))) || ''
          setColCodigo(detectar(['codigo', 'sku', 'cod', 'barras', 'art', 'articulo']))
          setColNombre(detectar(['nombre', 'descripcion', 'producto', 'detalle', 'desc']))
          setColPrecio(detectar(['precio', 'costo', 'price', 'importe', 'valor', 'unitario']))
          setCfgGuardada(false)
          setPaso('mapeo')
        }
      } catch {
        setErrUpload('No se pudo leer el archivo. Asegurate de que sea .xlsx o .xls.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  /* ── Informe: cruzar filas con catálogo ── */
  const informe = useMemo(() => {
    if (paso !== 'informe' || !colPrecio) return []
    return filas.map((fila, idx) => {
      const producto    = matchProducto(fila, colCodigo, colNombre, productos)
      const precioProveedor = Number(String(fila[colPrecio] ?? '').replace(',', '.')) || 0
      if (!precioProveedor) return null

      const costoActual = producto ? Number(producto.precio_costo) || 0 : 0
      const variacion   = costoActual > 0
        ? ((precioProveedor - costoActual) / costoActual) * 100
        : null

      return { _idx: idx, fila, producto, precioProveedor, costoActual, variacion }
    }).filter(Boolean)
  }, [paso, filas, colCodigo, colNombre, colPrecio, productos])

  const informeFiltrado = useMemo(() => {
    if (filtro === 'emparejados') return informe.filter(r => r.producto)
    if (filtro === 'sin_match')   return informe.filter(r => !r.producto)
    return informe
  }, [informe, filtro])

  const stats = useMemo(() => ({
    total:       informe.length,
    emparejados: informe.filter(r => r.producto).length,
    sinMatch:    informe.filter(r => !r.producto).length,
    subieron:    informe.filter(r => r.variacion !== null && r.variacion > 0.5).length,
    bajaron:     informe.filter(r => r.variacion !== null && r.variacion < -0.5).length,
  }), [informe])

  /* ── Selección ── */
  const emparejadosFiltrados = informeFiltrado.filter(r => r.producto)
  const todosSeleccionados   = emparejadosFiltrados.length > 0 &&
    emparejadosFiltrados.every(r => seleccionados.has(r._idx))
  const algunoSeleccionado   = emparejadosFiltrados.some(r => seleccionados.has(r._idx))

  function toggleTodos() {
    if (todosSeleccionados) {
      setSeleccionados(prev => {
        const next = new Set(prev)
        emparejadosFiltrados.forEach(r => next.delete(r._idx))
        return next
      })
    } else {
      setSeleccionados(prev => {
        const next = new Set(prev)
        emparejadosFiltrados.forEach(r => next.add(r._idx))
        return next
      })
    }
  }

  function toggleFila(idx) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  /* ── Aplicar nuevos costos ── */
  async function handleAplicar() {
    setSaveError('')
    const filasSel = informe.filter(r => seleccionados.has(r._idx) && r.producto)
    if (!filasSel.length) return

    const actualizaciones = filasSel.map(r => {
      const costoOrig = Number(r.producto.precio_costo) || 0
      const ventaOrig = Number(r.producto.precio_venta) || 0
      const factor    = costoOrig > 0 ? ventaOrig / costoOrig : 1
      return {
        id:               r.producto.id,
        precio_costo:     r.precioProveedor,
        precio_venta:     +(r.precioProveedor * factor).toFixed(2),
        precio_mayorista: r.producto.precio_mayorista ?? null,
      }
    })

    setSaving(true)
    const res = await onActualizarMasivo(actualizaciones)
    setSaving(false)
    if (res?.error) setSaveError(res.error)
    else onCerrar()
  }

  /* ── Exportar informe ── */
  function exportar() {
    const filas = informe.map(r => ({
      'Producto catálogo': r.producto?.nombre || '— sin coincidencia —',
      'Descripción proveedor': colNombre ? String(r.fila[colNombre] ?? '') : '',
      'Código proveedor':      colCodigo ? String(r.fila[colCodigo] ?? '') : '',
      'Costo actual':          r.costoActual || '',
      'Precio proveedor':      r.precioProveedor,
      'Variación $':           r.costoActual > 0 ? +(r.precioProveedor - r.costoActual).toFixed(2) : '',
      'Variación %':           r.variacion !== null ? +r.variacion.toFixed(2) : '',
    }))
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Comparador')
    XLSX.writeFile(wb, `comparador_precios_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  /* ════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════ */
  return (
    <>
      <div className="apm-backdrop" onClick={onCerrar} />
      <div className="apm-modal comp-modal">

        {/* Header */}
        <div className="apm-header">
          <div className="apm-header-title">
            <i className="ti ti-file-diff" />
            Comparar lista de precios proveedor
            {paso !== 'upload' && (
              <div className="comp-steps">
                <span className={paso === 'mapeo' ? 'comp-step--active' : 'comp-step--done'}>
                  1. Archivo
                </span>
                <i className="ti ti-chevron-right" />
                <span className={paso === 'informe' ? 'comp-step--active' : paso === 'mapeo' ? '' : 'comp-step--done'}>
                  2. Columnas
                </span>
                {paso === 'informe' && (
                  <>
                    <i className="ti ti-chevron-right" />
                    <span className="comp-step--active">3. Informe</span>
                  </>
                )}
              </div>
            )}
          </div>
          <button className="btn-icon" onClick={onCerrar}><i className="ti ti-x" /></button>
        </div>

        {/* ── PASO 1: UPLOAD ── */}
        {paso === 'upload' && (
          <div className="comp-upload-body">

            {/* Selector de proveedor (opcional pero recomendado) */}
            {proveedores.length > 0 && (
              <div className="comp-prov-sel">
                <label className="field-label">
                  <i className="ti ti-building-store" /> Proveedor <span className="td-muted">(opcional — recuerda el formato)</span>
                </label>
                <select
                  className="field-select"
                  value={proveedorId}
                  onChange={e => setProveedorId(e.target.value)}
                  style={{ maxWidth: 340 }}
                >
                  <option value="">— Sin especificar —</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.razon_social || p.nombre}
                      {cargarCfg(comercioId, p.id) ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
                {proveedorId && cargarCfg(comercioId, proveedorId) && (
                  <span className="comp-cfg-saved">
                    <i className="ti ti-bookmark-filled" /> Formato guardado — al subir el Excel va directo al informe
                  </span>
                )}
              </div>
            )}

            <div
              className="comp-dropzone"
              onClick={() => inputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) { inputRef.current.files = e.dataTransfer.files; onFileChange({ target: { files: [file] } }) }
              }}
            >
              <i className="ti ti-file-spreadsheet" />
              <p>Arrastrá el Excel del proveedor o hacé clic para seleccionarlo</p>
              <span className="td-muted" style={{ fontSize: 11 }}>Formatos soportados: .xlsx, .xls</span>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onFileChange} />
            </div>
            {errUpload && (
              <div className="error-banner"><i className="ti ti-alert-circle" /> {errUpload}</div>
            )}
            <div className="comp-upload-hint">
              <i className="ti ti-info-circle" />
              El archivo puede tener cualquier formato — en el siguiente paso vas a indicar qué columna es el código, el nombre y el precio.
            </div>
          </div>
        )}

        {/* ── PASO 2: MAPEO DE COLUMNAS ── */}
        {paso === 'mapeo' && (
          <>
            <div className="comp-mapeo-body">
              <div className="comp-mapeo-header">
                <p className="comp-mapeo-desc">
                  Encontramos <strong>{filas.length} filas</strong> y <strong>{columnas.length} columnas</strong>. Indicá cuál corresponde a cada campo:
                </p>
                {proveedores.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select
                      className="field-select"
                      value={proveedorId}
                      onChange={e => onProveedorChange(e.target.value)}
                      style={{ maxWidth: 240 }}
                    >
                      <option value="">— Sin proveedor —</option>
                      {proveedores.map(p => (
                        <option key={p.id} value={p.id}>{p.razon_social || p.nombre}</option>
                      ))}
                    </select>
                    {proveedorId && (
                      <span className="comp-cfg-badge">
                        <i className="ti ti-device-floppy" />
                        {cfgGuardada ? 'Formato cargado' : 'Se guardará al confirmar'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="comp-mapeo-grid">
                <div className="field">
                  <label className="field-label">Columna de código / SKU <span className="td-muted">(opcional)</span></label>
                  <select className="field-select" value={colCodigo} onChange={e => setColCodigo(e.target.value)}>
                    <option value="">— No usar —</option>
                    {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Columna de nombre / descripción <span className="td-muted">(opcional)</span></label>
                  <select className="field-select" value={colNombre} onChange={e => setColNombre(e.target.value)}>
                    <option value="">— No usar —</option>
                    {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Columna de precio / costo <span className="field-required">*</span></label>
                  <select className="field-select" value={colPrecio} onChange={e => setColPrecio(e.target.value)}>
                    <option value="">— Seleccioná —</option>
                    {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview primeras 3 filas */}
              {filas.length > 0 && (
                <div className="comp-preview">
                  <p className="comp-preview-title">Vista previa (primeras 3 filas)</p>
                  <div className="comp-preview-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {columnas.map(c => (
                            <th key={c} className={
                              c === colCodigo ? 'comp-col--codigo' :
                              c === colNombre ? 'comp-col--nombre' :
                              c === colPrecio ? 'comp-col--precio' : ''
                            }>
                              {c}
                              {c === colCodigo && <span className="comp-col-tag">código</span>}
                              {c === colNombre && <span className="comp-col-tag">nombre</span>}
                              {c === colPrecio && <span className="comp-col-tag comp-col-tag--precio">precio</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filas.slice(0, 3).map((fila, i) => (
                          <tr key={i}>
                            {columnas.map(c => (
                              <td key={c} style={{ fontSize: 11 }}>{String(fila[c] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="apm-footer">
              <div className="apm-footer-info">
                <button className="btn" onClick={() => { setPaso('upload'); setFilas([]); setColumnas([]) }}>
                  <i className="ti ti-arrow-left" /> Volver
                </button>
              </div>
              <div className="apm-footer-btns">
                <button className="btn" onClick={onCerrar}><i className="ti ti-x" /> Cancelar</button>
                <button
                  className="btn btn--primary"
                  disabled={!colPrecio || (!colCodigo && !colNombre)}
                  onClick={() => {
                    if (proveedorId) guardarCfg(comercioId, proveedorId, { colCodigo, colNombre, colPrecio })
                    setSeleccionados(new Set())
                    setPaso('informe')
                  }}
                >
                  <i className="ti ti-chart-bar" /> Ver informe
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── PASO 3: INFORME ── */}
        {paso === 'informe' && (
          <>
            {/* Proveedor activo */}
            {proveedorId && (() => {
              const prov = proveedores.find(p => p.id === proveedorId)
              return prov ? (
                <div className="comp-prov-banner">
                  <i className="ti ti-building-store" />
                  {prov.razon_social || prov.nombre}
                </div>
              ) : null
            })()}

            {/* Stats */}
            <div className="comp-stats">
              <div className="comp-stat">
                <span className="comp-stat-val">{stats.total}</span>
                <span className="comp-stat-label">filas</span>
              </div>
              <div className="comp-stat comp-stat--ok">
                <span className="comp-stat-val">{stats.emparejados}</span>
                <span className="comp-stat-label">emparejados</span>
              </div>
              <div className="comp-stat comp-stat--warn">
                <span className="comp-stat-val">{stats.sinMatch}</span>
                <span className="comp-stat-label">sin coincidencia</span>
              </div>
              <div className="comp-stat comp-stat--danger">
                <span className="comp-stat-val">{stats.subieron}</span>
                <span className="comp-stat-label">subieron precio</span>
              </div>
              <div className="comp-stat comp-stat--success">
                <span className="comp-stat-val">{stats.bajaron}</span>
                <span className="comp-stat-label">bajaron precio</span>
              </div>
            </div>

            {/* Filtros */}
            <div className="comp-filtros">
              {[
                { val: 'todos',       label: 'Todos' },
                { val: 'emparejados', label: 'Emparejados' },
                { val: 'sin_match',   label: 'Sin coincidencia' },
              ].map(f => (
                <button
                  key={f.val}
                  className={`pill${filtro === f.val ? ' pill--active' : ''}`}
                  onClick={() => setFiltro(f.val)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Tabla informe */}
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
                        title="Seleccionar todos los emparejados visibles"
                        disabled={emparejadosFiltrados.length === 0}
                      />
                    </th>
                    <th>Producto catálogo</th>
                    <th>Descripción proveedor</th>
                    <th className="td-right">Costo actual</th>
                    <th className="td-right">Precio proveedor</th>
                    <th className="td-right">Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {informeFiltrado.map(r => {
                    const sel      = seleccionados.has(r._idx)
                    const vPct     = r.variacion
                    const subio    = vPct !== null && vPct > 0.5
                    const bajo     = vPct !== null && vPct < -0.5
                    const igual    = vPct !== null && !subio && !bajo

                    return (
                      <tr
                        key={r._idx}
                        className={`${r.producto ? (sel ? 'apm-row--selected' : '') : 'comp-row--no-match'}`}
                        onClick={() => r.producto && toggleFila(r._idx)}
                        style={{ cursor: r.producto ? 'pointer' : 'default' }}
                      >
                        <td onClick={e => e.stopPropagation()}>
                          {r.producto && (
                            <input type="checkbox" checked={sel} onChange={() => toggleFila(r._idx)} />
                          )}
                        </td>
                        <td className="apm-nombre">
                          {r.producto
                            ? r.producto.nombre
                            : <span className="td-muted" style={{ fontSize: 11 }}>Sin coincidencia</span>}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                          {colNombre ? String(r.fila[colNombre] ?? '') : '—'}
                          {colCodigo && r.fila[colCodigo] && (
                            <span className="td-muted" style={{ marginLeft: 6 }}>
                              [{r.fila[colCodigo]}]
                            </span>
                          )}
                        </td>
                        <td className="td-right td-muted">
                          {r.costoActual > 0 ? fmt$(r.costoActual) : <span className="td-muted">—</span>}
                        </td>
                        <td className="td-right" style={{ fontWeight: 500 }}>
                          {fmt$(r.precioProveedor)}
                        </td>
                        <td className="td-right">
                          {vPct !== null ? (
                            <span className={`badge ${subio ? 'badge--danger' : bajo ? 'badge--success' : 'badge--neutral'}`} style={{ fontSize: 10 }}>
                              {subio && <i className="ti ti-arrow-up" style={{ fontSize: 9 }} />}
                              {bajo  && <i className="ti ti-arrow-down" style={{ fontSize: 9 }} />}
                              {igual && <i className="ti ti-minus" style={{ fontSize: 9 }} />}
                              {fmtPct(vPct)}
                            </span>
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

            {saveError && (
              <div className="error-banner" style={{ margin: '0 16px' }}>
                <i className="ti ti-alert-circle" /> {saveError}
              </div>
            )}

            {/* Footer */}
            <div className="apm-footer">
              <div className="apm-footer-info">
                <button className="btn" onClick={() => setPaso('mapeo')}>
                  <i className="ti ti-arrow-left" /> Volver
                </button>
                {seleccionados.size > 0 && (
                  <span className="apm-sel-count">
                    <i className="ti ti-check" />
                    {seleccionados.size} producto{seleccionados.size !== 1 ? 's' : ''} seleccionado{seleccionados.size !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="apm-footer-btns">
                <button className="btn" onClick={exportar}>
                  <i className="ti ti-download" /> Exportar informe
                </button>
                <button className="btn" onClick={onCerrar}>
                  <i className="ti ti-x" /> Cerrar
                </button>
                <button
                  className="btn btn--primary"
                  disabled={saving || seleccionados.size === 0}
                  onClick={handleAplicar}
                >
                  <i className={`ti ${saving ? 'ti-loader-2' : 'ti-coins'}`} />
                  {saving
                    ? 'Aplicando...'
                    : `Aplicar ${seleccionados.size || ''} costo${seleccionados.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
