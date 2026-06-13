import { useState, useMemo, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import './ComparadorProveedorModal.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'

/* ── Parser robusto de precios ──────────────────────────────────
   Maneja todos los formatos que puede traer un Excel de proveedor:
   150 | $150 | $150,00 | $ 150,00 | 1.200,00 | 1,200.00 | 1200.50
───────────────────────────────────────────────────────────────── */
function parsePrice(val) {
  if (typeof val === 'number') return val          // XLSX ya lo parseó
  const s = String(val ?? '')
    .replace(/[$\s ]/g, '')                  // quitar $, espacios, nbsp
    .trim()
  if (!s) return 0

  const hasComma = s.includes(',')
  const hasDot   = s.includes('.')

  if (hasComma && hasDot) {
    // decidir cuál es separador decimal según el último que aparece
    return s.lastIndexOf(',') > s.lastIndexOf('.')
      ? Number(s.replace(/\./g, '').replace(',', '.'))   // AR: 1.200,50
      : Number(s.replace(/,/g, ''))                      // US: 1,200.50
  }
  if (hasComma) {
    // solo coma → podría ser AR decimal (150,50) o miles (1,200) → AR
    return Number(s.replace(',', '.'))
  }
  if (hasDot) {
    // solo punto → miles AR (1.200) o decimal (1.5)
    const afterDot = s.split('.')[1]
    return afterDot?.length === 3 ? Number(s.replace('.', '')) : Number(s)
  }
  return Number(s) || 0
}

function norm(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

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
    const parcial = productos.find(p =>
      norm(p.nombre).includes(nombreProveedor) ||
      nombreProveedor.includes(norm(p.nombre))
    )
    if (parcial) return parcial
  }

  return null
}

const CFG_KEY = (cid, pid) => `excel_cfg_${cid}_${pid}`

function cargarCfg(comercioId, proveedorId) {
  try { return JSON.parse(localStorage.getItem(CFG_KEY(comercioId, proveedorId)) || 'null') } catch { return null }
}

function guardarCfg(comercioId, proveedorId, cfg) {
  try { localStorage.setItem(CFG_KEY(comercioId, proveedorId), JSON.stringify(cfg)) } catch {}
}

const PASOS = [
  { id: 'upload',  label: 'Archivo'  },
  { id: 'mapeo',   label: 'Columnas' },
  { id: 'informe', label: 'Informe'  },
]

export default function ComparadorProveedorModal({ productos, proveedores = [], categorias = [], subcategorias = [], comercioId, onActualizarMasivo, onCerrar }) {
  const [paso,           setPaso]           = useState('upload')
  const [filas,          setFilas]          = useState([])
  const [columnas,       setColumnas]       = useState([])
  const [colCodigo,      setColCodigo]      = useState('')
  const [colNombre,      setColNombre]      = useState('')
  const [colPrecio,      setColPrecio]      = useState('')   // precio lista
  const [colPrecio2,     setColPrecio2]     = useState('')   // precio contado (opcional)
  const [precioAplicar,  setPrecioAplicar]  = useState('lista')  // 'lista' | 'contado'
  const [proveedorId,    setProveedorId]    = useState('')
  const [cfgGuardada,    setCfgGuardada]    = useState(false)
  const [errUpload,      setErrUpload]      = useState('')
  const [saving,         setSaving]         = useState(false)
  const [saveError,      setSaveError]      = useState('')
  const [seleccionados,     setSeleccionados]     = useState(new Set())
  const [filtro,            setFiltro]            = useState('emparejados')
  const [filtroCategoria,   setFiltroCategoria]   = useState('')
  const [filtroSubcategoria,setFiltroSubcategoria]= useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  function onProveedorChange(id) {
    setProveedorId(id)
    setCfgGuardada(false)
    if (!id || !columnas.length) return
    const cfg = cargarCfg(comercioId, id)
    if (!cfg) return
    if (cfg.colCodigo  && columnas.includes(cfg.colCodigo))  setColCodigo(cfg.colCodigo)
    if (cfg.colNombre  && columnas.includes(cfg.colNombre))  setColNombre(cfg.colNombre)
    if (cfg.colPrecio  && columnas.includes(cfg.colPrecio))  setColPrecio(cfg.colPrecio)
    if (cfg.colPrecio2 && columnas.includes(cfg.colPrecio2)) setColPrecio2(cfg.colPrecio2)
    setCfgGuardada(true)
  }

  function aplicarCfg(cfg, cols) {
    setColCodigo(cfg.colCodigo  && cols.includes(cfg.colCodigo)  ? cfg.colCodigo  : '')
    setColNombre(cfg.colNombre  && cols.includes(cfg.colNombre)  ? cfg.colNombre  : '')
    setColPrecio(cfg.colPrecio  && cols.includes(cfg.colPrecio)  ? cfg.colPrecio  : '')
    setColPrecio2(cfg.colPrecio2 && cols.includes(cfg.colPrecio2) ? cfg.colPrecio2 : '')
  }

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

        const cfg = proveedorId ? cargarCfg(comercioId, proveedorId) : null
        if (cfg && cfg.colPrecio && cols.includes(cfg.colPrecio)) {
          aplicarCfg(cfg, cols)
          setCfgGuardada(true)
          setSeleccionados(new Set())
          setPaso('informe')
        } else {
          const detectar = (kws) => cols.find(c => kws.some(k => norm(c).includes(k))) || ''
          setColCodigo(detectar(['codigo', 'sku', 'cod', 'barras', 'art', 'articulo']))
          setColNombre(detectar(['nombre', 'descripcion', 'producto', 'detalle', 'desc']))
          // auto-detectar precio lista y precio contado
          const pLista   = detectar(['lista'])
          const pContado = detectar(['contado', 'efectivo', 'conta'])
          const pGeneral = detectar(['precio', 'costo', 'price', 'importe', 'valor', 'unitario'])
          setColPrecio(pLista || pGeneral)
          setColPrecio2(pContado !== (pLista || pGeneral) ? pContado : '')
          setCfgGuardada(false)
          setPaso('mapeo')
        }
      } catch {
        setErrUpload('No se pudo leer el archivo. Asegurate de que sea .xlsx o .xls.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  /* ── Informe: cruza filas con catálogo ── */
  const informe = useMemo(() => {
    if (paso !== 'informe' || !colPrecio) return []
    return filas.map((fila, idx) => {
      const producto   = matchProducto(fila, colCodigo, colNombre, productos)
      const pLista     = parsePrice(fila[colPrecio])
      const pContado   = colPrecio2 ? parsePrice(fila[colPrecio2]) : null
      if (!pLista) return null

      const costoActual = producto ? Number(producto.precio_costo) || 0 : 0
      const precioRef   = precioAplicar === 'contado' && pContado ? pContado : pLista
      const variacion   = costoActual > 0 ? ((precioRef - costoActual) / costoActual) * 100 : null

      return { _idx: idx, fila, producto, pLista, pContado, precioRef, costoActual, variacion }
    }).filter(Boolean)
  }, [paso, filas, colCodigo, colNombre, colPrecio, colPrecio2, precioAplicar, productos])

  const informeFiltrado = useMemo(() => {
    let result = informe

    // Filtro principal (stat cards)
    if      (filtro === 'emparejados') result = result.filter(r => r.producto)
    else if (filtro === 'sin_match')   result = result.filter(r => !r.producto)
    else if (filtro === 'subieron')    result = result.filter(r => r.producto && r.variacion !== null && r.variacion > 0.5)
    else if (filtro === 'bajaron')     result = result.filter(r => r.producto && r.variacion !== null && r.variacion < -0.5)
    else if (filtro === 'sin_cambio')  result = result.filter(r => r.producto && r.variacion !== null && Math.abs(r.variacion) <= 0.5)

    // Filtros de categoría (solo aplican a emparejados)
    if (filtroCategoria)    result = result.filter(r => r.producto?.categoria_id    === filtroCategoria)
    if (filtroSubcategoria) result = result.filter(r => r.producto?.subcategoria_id === filtroSubcategoria)

    return result
  }, [informe, filtro, filtroCategoria, filtroSubcategoria])

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
      setSeleccionados(prev => { const n = new Set(prev); emparejadosFiltrados.forEach(r => n.delete(r._idx)); return n })
    } else {
      setSeleccionados(prev => { const n = new Set(prev); emparejadosFiltrados.forEach(r => n.add(r._idx)); return n })
    }
  }

  function toggleFila(idx) {
    setSeleccionados(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }

  /* ── Aplicar costos ── */
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
        precio_costo:     r.precioRef,
        precio_venta:     +(r.precioRef * factor).toFixed(2),
        precio_mayorista: r.producto.precio_mayorista ?? null,
      }
    })
    setSaving(true)
    const res = await onActualizarMasivo(actualizaciones)
    setSaving(false)
    if (res?.error) setSaveError(res.error)
    else onCerrar()
  }

  /* ── Exportar ── */
  function exportar() {
    const rows = informe.map(r => {
      const row = {
        'Producto catálogo':     r.producto?.nombre || '— sin coincidencia —',
        'Descripción proveedor': colNombre ? String(r.fila[colNombre] ?? '') : '',
        'Código proveedor':      colCodigo ? String(r.fila[colCodigo] ?? '') : '',
        'Costo actual':          r.costoActual || '',
        'Precio lista':          r.pLista,
      }
      if (colPrecio2) row['Precio contado'] = r.pContado ?? ''
      row['Precio a aplicar'] = r.precioRef
      row['Variación $']  = r.costoActual > 0 ? +(r.precioRef - r.costoActual).toFixed(2) : ''
      row['Variación %']  = r.variacion !== null ? +r.variacion.toFixed(2) : ''
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [28, 28, 14, 13, 13, 13, 13, 11, 11].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Comparador')
    XLSX.writeFile(wb, `comparador_precios_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function confirmarMapeo() {
    if (proveedorId) guardarCfg(comercioId, proveedorId, { colCodigo, colNombre, colPrecio, colPrecio2 })
    setSeleccionados(new Set())
    setPaso('informe')
  }

  const pasoIdx   = PASOS.findIndex(p => p.id === paso)
  const hayDoble  = !!colPrecio2
  const labelLista   = 'Precio lista'
  const labelContado = 'Precio contado'

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
            <div className="comp-stepper">
              {PASOS.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <div className={`comp-step-item${i === pasoIdx ? ' comp-step-item--active' : i < pasoIdx ? ' comp-step-item--done' : ''}`}>
                    <div className="comp-step-num">
                      {i < pasoIdx ? <i className="ti ti-check" style={{ fontSize: 10 }} /> : i + 1}
                    </div>
                    <span className="comp-step-label">{p.label}</span>
                  </div>
                  {i < PASOS.length - 1 && <div className="comp-step-connector" />}
                </div>
              ))}
            </div>
          </div>
          <button className="btn-icon" onClick={onCerrar}><i className="ti ti-x" /></button>
        </div>

        {/* ══ PASO 1: UPLOAD ══ */}
        {paso === 'upload' && (
          <div className="comp-upload-body">
            <div className="comp-upload-intro">
              <div className="comp-upload-intro-icon">
                <i className="ti ti-file-diff" />
              </div>
              <div className="comp-upload-intro-text">
                <h3>Subí la lista de precios de tu proveedor</h3>
                <p>El sistema la cruza contra tu catálogo y te muestra qué productos subieron o bajaron. Podés aplicar los nuevos costos directamente.</p>
              </div>
            </div>

            <div className="comp-upload-main">
              {proveedores.length > 0 && (
                <div className="comp-prov-sel">
                  <div className="comp-prov-sel-header">
                    <i className="ti ti-building-store" />
                    <strong>Proveedor</strong>
                    <span>— recuerda el formato del Excel</span>
                  </div>
                  <select className="field-select" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
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
                      <i className="ti ti-bolt" /> Formato guardado — al subir el Excel va directo al informe
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
                  if (file) onFileChange({ target: { files: [file] } })
                }}
              >
                <div className="comp-dropzone-icon">
                  <i className="ti ti-file-spreadsheet" />
                </div>
                <p>Arrastrá el Excel aquí o hacé clic para seleccionarlo</p>
                <small>Formatos soportados: .xlsx y .xls</small>
                <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onFileChange} />
              </div>

              {errUpload && (
                <div className="error-banner" style={{ maxWidth: 520, width: '100%' }}>
                  <i className="ti ti-alert-circle" /> {errUpload}
                </div>
              )}

              <div className="comp-upload-hint">
                <i className="ti ti-info-circle" />
                Acepta cualquier formato numérico: $150, $1.200,00, $ 1.200,00, 1200.50, etc.
              </div>
            </div>
          </div>
        )}

        {/* ══ PASO 2: MAPEO ══ */}
        {paso === 'mapeo' && (
          <>
            <div className="comp-mapeo-body">
              <div className="comp-mapeo-top">
                <p className="comp-mapeo-desc">
                  <strong>{filas.length} filas</strong> · <strong>{columnas.length} columnas</strong> — indicá cuál corresponde a cada campo:
                </p>
                {proveedores.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select className="field-select" value={proveedorId}
                      onChange={e => onProveedorChange(e.target.value)} style={{ maxWidth: 220 }}>
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

              {/* Cards de columnas — 2 filas: identificación + precios */}
              <div className="comp-mapeo-cols comp-mapeo-cols--2rows">
                {/* Fila 1: código + nombre */}
                <div className={`comp-col-card${colCodigo ? ' comp-col-card--active' : ''}`}>
                  <div className="comp-col-card-header">
                    <div className="comp-col-card-icon comp-col-card-icon--cod">
                      <i className="ti ti-barcode" />
                    </div>
                    <div>
                      <div className="comp-col-card-title">Código / SKU</div>
                      <div className="comp-col-card-sub">Opcional — mejora el emparejamiento</div>
                    </div>
                  </div>
                  <select className="field-select" value={colCodigo} onChange={e => setColCodigo(e.target.value)}>
                    <option value="">— No usar —</option>
                    {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className={`comp-col-card${colNombre ? ' comp-col-card--active' : ''}`}>
                  <div className="comp-col-card-header">
                    <div className="comp-col-card-icon comp-col-card-icon--nom">
                      <i className="ti ti-tag" />
                    </div>
                    <div>
                      <div className="comp-col-card-title">Nombre / Descripción</div>
                      <div className="comp-col-card-sub">Opcional — para cruzar por texto</div>
                    </div>
                  </div>
                  <select className="field-select" value={colNombre} onChange={e => setColNombre(e.target.value)}>
                    <option value="">— No usar —</option>
                    {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Fila 2 / columna vacía para alinear con precio contado */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* Precio lista */}
                  <div className={`comp-col-card${colPrecio ? ' comp-col-card--active' : ''}`}>
                    <div className="comp-col-card-header">
                      <div className="comp-col-card-icon comp-col-card-icon--prec">
                        <i className="ti ti-tag-starred" />
                      </div>
                      <div>
                        <div className="comp-col-card-title">Precio lista <span className="field-required">*</span></div>
                        <div className="comp-col-card-sub">Precio de referencia del proveedor</div>
                      </div>
                    </div>
                    <select className="field-select" value={colPrecio} onChange={e => setColPrecio(e.target.value)}>
                      <option value="">— Seleccioná —</option>
                      {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Precio contado (opcional) */}
                  <div className={`comp-col-card comp-col-card--contado${colPrecio2 ? ' comp-col-card--active' : ''}`}>
                    <div className="comp-col-card-header">
                      <div className="comp-col-card-icon comp-col-card-icon--prec2">
                        <i className="ti ti-currency-dollar" />
                      </div>
                      <div>
                        <div className="comp-col-card-title">Precio contado <span className="comp-col-card-opt">opcional</span></div>
                        <div className="comp-col-card-sub">Para mayoristas con doble precio</div>
                      </div>
                    </div>
                    <select className="field-select" value={colPrecio2} onChange={e => setColPrecio2(e.target.value)}>
                      <option value="">— No usar —</option>
                      {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                </div>
              </div>

              {/* Preview */}
              {filas.length > 0 && (
                <div className="comp-preview">
                  <p className="comp-preview-title">Vista previa — primeras 3 filas</p>
                  <div className="comp-preview-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {columnas.map(c => (
                            <th key={c} className={
                              c === colCodigo  ? 'comp-col--codigo' :
                              c === colNombre  ? 'comp-col--nombre' :
                              c === colPrecio  ? 'comp-col--precio' :
                              c === colPrecio2 ? 'comp-col--precio2' : ''
                            }>
                              {c}
                              {c === colCodigo  && <span className="comp-col-tag comp-col-tag--cod">código</span>}
                              {c === colNombre  && <span className="comp-col-tag">nombre</span>}
                              {c === colPrecio  && <span className="comp-col-tag comp-col-tag--precio">lista</span>}
                              {c === colPrecio2 && <span className="comp-col-tag comp-col-tag--precio2">contado</span>}
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
                  onClick={confirmarMapeo}
                >
                  <i className="ti ti-chart-bar" /> Ver informe
                </button>
              </div>
            </div>
          </>
        )}

        {/* ══ PASO 3: INFORME ══ */}
        {paso === 'informe' && (
          <>
            {proveedorId && (() => {
              const prov = proveedores.find(p => p.id === proveedorId)
              return prov ? (
                <div className="comp-prov-banner">
                  <i className="ti ti-building-store" />
                  {prov.razon_social || prov.nombre}
                </div>
              ) : null
            })()}

            {/* Stats — cada card es un filtro clickeable */}
            <div className="comp-stats">
              {[
                { key: 'todos',      val: stats.total,       label: 'Total lista',     icon: 'ti-list',         cls: ''            },
                { key: 'emparejados',val: stats.emparejados, label: 'En catálogo',     icon: 'ti-link',         cls: 'comp-stat--ok'      },
                { key: 'subieron',   val: stats.subieron,    label: 'Subieron',        icon: 'ti-trending-up',  cls: 'comp-stat--danger'  },
                { key: 'bajaron',    val: stats.bajaron,     label: 'Bajaron',         icon: 'ti-trending-down',cls: 'comp-stat--success' },
                { key: 'sin_match',  val: stats.sinMatch,    label: 'Sin coincidencia',icon: 'ti-unlink',       cls: 'comp-stat--warn'    },
              ].map(s => (
                <button
                  key={s.key}
                  className={`comp-stat ${s.cls}${filtro === s.key ? ' comp-stat--active' : ''}`}
                  onClick={() => { setFiltro(s.key); setFiltroCategoria(''); setFiltroSubcategoria('') }}
                >
                  <i className={`ti ${s.icon} comp-stat-icon`} />
                  <span className="comp-stat-val">{s.val}</span>
                  <span className="comp-stat-label">{s.label}</span>
                </button>
              ))}

              {/* Selector lista/contado — solo con doble precio */}
              {hayDoble && (
                <div className="comp-stat comp-precio-selector">
                  <span className="comp-stat-label" style={{ marginBottom: 6 }}>Aplicar precio</span>
                  <div className="comp-precio-pills">
                    <button className={`pill${precioAplicar === 'lista' ? ' pill--active' : ''}`} onClick={() => setPrecioAplicar('lista')}>
                      <i className="ti ti-tag-starred" /> Lista
                    </button>
                    <button className={`pill${precioAplicar === 'contado' ? ' pill--active' : ''}`} onClick={() => setPrecioAplicar('contado')}>
                      <i className="ti ti-currency-dollar" /> Contado
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Filtros de categoría */}
            <div className="comp-filtros">
              {categorias.length > 0 && (
                <select
                  className="field-select comp-filtro-cat"
                  value={filtroCategoria}
                  onChange={e => { setFiltroCategoria(e.target.value); setFiltroSubcategoria('') }}
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              )}
              {filtroCategoria && subcategorias.filter(s => s.categoria_id === filtroCategoria).length > 0 && (
                <select
                  className="field-select comp-filtro-cat"
                  value={filtroSubcategoria}
                  onChange={e => setFiltroSubcategoria(e.target.value)}
                >
                  <option value="">Todas las subcategorías</option>
                  {subcategorias.filter(s => s.categoria_id === filtroCategoria).map(s => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              )}
              {(filtroCategoria || filtroSubcategoria) && (
                <button className="btn-icon" title="Limpiar filtro de categoría"
                  onClick={() => { setFiltroCategoria(''); setFiltroSubcategoria('') }}>
                  <i className="ti ti-x" />
                </button>
              )}
              {informeFiltrado.length > 0 && (
                <span className="td-muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
                  {informeFiltrado.filter(r => r.producto).length} producto{informeFiltrado.filter(r => r.producto).length !== 1 ? 's' : ''}
                  {filtroCategoria ? ` en ${categorias.find(c => c.id === filtroCategoria)?.nombre || ''}` : ''}
                </span>
              )}
            </div>

            {/* Tabla */}
            <div className="apm-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={todosSeleccionados}
                        ref={el => { if (el) el.indeterminate = !todosSeleccionados && algunoSeleccionado }}
                        onChange={toggleTodos} disabled={emparejadosFiltrados.length === 0} />
                    </th>
                    <th>Producto catálogo</th>
                    <th>Descripción proveedor</th>
                    <th className="td-right">Costo actual</th>
                    <th className="td-right">{labelLista}</th>
                    {hayDoble && <th className="td-right">{labelContado}</th>}
                    <th className="td-right">Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {informeFiltrado.map(r => {
                    const sel   = seleccionados.has(r._idx)
                    const vPct  = r.variacion
                    const subio = vPct !== null && vPct > 0.5
                    const bajo  = vPct !== null && vPct < -0.5
                    const igual = vPct !== null && !subio && !bajo

                    return (
                      <tr key={r._idx}
                        className={r.producto ? (sel ? 'apm-row--selected' : '') : 'comp-row--no-match'}
                        onClick={() => r.producto && toggleFila(r._idx)}
                        style={{ cursor: r.producto ? 'pointer' : 'default' }}>
                        <td onClick={e => e.stopPropagation()}>
                          {r.producto && <input type="checkbox" checked={sel} onChange={() => toggleFila(r._idx)} />}
                        </td>
                        <td className="apm-nombre">
                          {r.producto
                            ? r.producto.nombre
                            : <span className="td-muted" style={{ fontSize: 11 }}>Sin coincidencia</span>}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                          {colNombre ? String(r.fila[colNombre] ?? '') : '—'}
                          {colCodigo && r.fila[colCodigo] && (
                            <span className="td-muted" style={{ marginLeft: 6 }}>[{r.fila[colCodigo]}]</span>
                          )}
                        </td>
                        <td className="td-right td-muted">
                          {r.costoActual > 0 ? fmt$(r.costoActual) : <span className="td-muted">—</span>}
                        </td>
                        <td className={`td-right${precioAplicar === 'lista' && hayDoble ? ' comp-col-ref' : ''}`}
                          style={{ fontWeight: hayDoble && precioAplicar !== 'lista' ? 400 : 500 }}>
                          {fmt$(r.pLista)}
                        </td>
                        {hayDoble && (
                          <td className={`td-right${precioAplicar === 'contado' ? ' comp-col-ref' : ''}`}
                            style={{ fontWeight: precioAplicar === 'contado' ? 500 : 400 }}>
                            {r.pContado != null ? fmt$(r.pContado) : <span className="td-muted">—</span>}
                          </td>
                        )}
                        <td className="td-right">
                          {vPct !== null ? (
                            <span className={`badge ${subio ? 'badge--danger' : bajo ? 'badge--success' : 'badge--neutral'}`} style={{ fontSize: 10 }}>
                              {subio && <i className="ti ti-arrow-up" style={{ fontSize: 9 }} />}
                              {bajo  && <i className="ti ti-arrow-down" style={{ fontSize: 9 }} />}
                              {igual && <i className="ti ti-minus" style={{ fontSize: 9 }} />}
                              {' '}{fmtPct(vPct)}
                            </span>
                          ) : <span className="td-muted">—</span>}
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

            <div className="apm-footer">
              <div className="apm-footer-info">
                <button className="btn" onClick={() => setPaso('mapeo')}>
                  <i className="ti ti-arrow-left" /> Volver
                </button>
                {seleccionados.size > 0 && (
                  <span className="apm-sel-count">
                    <i className="ti ti-check" />
                    {seleccionados.size} producto{seleccionados.size !== 1 ? 's' : ''} seleccionado{seleccionados.size !== 1 ? 's' : ''}
                    {hayDoble && (
                      <span className="td-muted" style={{ fontWeight: 400 }}>
                        {' '}— se aplica precio {precioAplicar === 'contado' ? 'contado' : 'lista'}
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="apm-footer-btns">
                <button className="btn" onClick={exportar}>
                  <i className="ti ti-download" /> Exportar
                </button>
                <button className="btn" onClick={onCerrar}>
                  <i className="ti ti-x" /> Cerrar
                </button>
                <button className="btn btn--primary" disabled={saving || seleccionados.size === 0} onClick={handleAplicar}>
                  <i className={`ti ${saving ? 'ti-loader-2' : 'ti-coins'}`} />
                  {saving ? 'Aplicando...' : `Aplicar ${seleccionados.size || ''} costo${seleccionados.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </>
  )
}
