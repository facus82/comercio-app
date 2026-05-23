import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import './ImportarExcel.css'

const CAMPOS = [
  { id: 'nombre',        label: 'Nombre',          required: true  },
  { id: 'codigo',        label: 'Código interno',   required: false },
  { id: 'codigo_barras', label: 'Código de barras', required: false },
  { id: 'categoria',     label: 'Categoría',        required: false },
  { id: 'precio_costo',  label: 'Precio costo',     required: false },
  { id: 'precio_venta',  label: 'Precio venta',     required: false },
  { id: 'stock_actual',  label: 'Stock actual',     required: false },
  { id: 'stock_minimo',  label: 'Stock mínimo',     required: false },
]

// Intenta detectar automáticamente el mapeo según los encabezados
function autoDetectar(headers) {
  const mapeo = {}
  const SINONIMOS = {
    nombre:        ['nombre', 'name', 'producto', 'descripcion', 'articulo'],
    codigo:        ['codigo', 'code', 'cod', 'sku', 'ref'],
    codigo_barras: ['barras', 'ean', 'barcode', 'gtin', 'codigo_barras'],
    categoria:     ['categoria', 'category', 'rubro', 'tipo'],
    precio_costo:  ['costo', 'precio_costo', 'cost', 'compra', 'precio compra'],
    precio_venta:  ['venta', 'precio_venta', 'precio', 'price', 'precio venta'],
    stock_actual:  ['stock', 'cantidad', 'stock_actual', 'qty', 'existencia'],
    stock_minimo:  ['minimo', 'stock_minimo', 'min', 'minimo'],
  }
  headers.forEach((h, i) => {
    const hn = (h || '').toLowerCase().trim()
    for (const [campo, sinonimos] of Object.entries(SINONIMOS)) {
      if (sinonimos.some(s => hn.includes(s)) && mapeo[campo] === undefined) {
        mapeo[campo] = i
      }
    }
  })
  return mapeo
}

function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        const headers = (data[0] || []).map(String)
        const filas   = data.slice(1).filter(row => row.some(c => String(c).trim() !== ''))
        resolve({ headers, filas })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function descargarPlantilla() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['nombre', 'codigo', 'codigo_barras', 'categoria', 'precio_costo', 'precio_venta', 'stock_actual', 'stock_minimo'],
    ['Cuaderno A4 rayado', 'CUA-001', '7790001234560', 'Librería', 500, 850, 50, 10],
    ['Birome azul Bic', 'BIO-001', '7790001234561', 'Papelería', 120, 220, 200, 30],
    ['Gaseosa Coca 500ml', 'COC-001', '7790001234562', 'Kiosco', 450, 700, 48, 12],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Productos')
  XLSX.writeFile(wb, 'plantilla_productos.xlsx')
}

export default function ImportarExcel({
  productos, categorias, comercioId,
  onCrear, onActualizar, onCerrar,
}) {
  const fileRef = useRef(null)
  const [paso, setPaso]         = useState(1) // 1 upload · 2 mapeo · 3 resultado
  const [arrastrando, setArr]   = useState(false)
  const [headers, setHeaders]   = useState([])
  const [filas, setFilas]       = useState([])
  const [mapeo, setMapeo]       = useState({})
  const [importando, setImp]    = useState(false)
  const [resultado, setResult]  = useState(null)

  async function procesarArchivo(file) {
    if (!file) return
    try {
      const { headers: h, filas: f } = await leerArchivo(file)
      setHeaders(h)
      setFilas(f)
      setMapeo(autoDetectar(h))
      setPaso(2)
    } catch {
      alert('No se pudo leer el archivo. Verificá que sea .xlsx, .xls o .csv válido.')
    }
  }

  function handleDrop(e) {
    e.preventDefault(); setArr(false)
    procesarArchivo(e.dataTransfer.files[0])
  }

  async function confirmar() {
    if (mapeo.nombre === undefined) { alert('Asigná al menos la columna "Nombre".'); return }
    setImp(true)
    let creados = 0, actualizados = 0, errores = []

    for (const row of filas) {
      try {
        const val = i => (i !== undefined && i !== '' ? String(row[i] ?? '').trim() : '')
        const nombre = val(mapeo.nombre)
        if (!nombre) continue

        const catNombre = val(mapeo.categoria)
        const cat = catNombre
          ? categorias.find(c => c.nombre.toLowerCase() === catNombre.toLowerCase())
          : null

        const datos = {
          nombre,
          codigo:        val(mapeo.codigo)        || null,
          codigo_barras: val(mapeo.codigo_barras) || null,
          categoria_id:  cat?.id                  || null,
          precio_costo:  parseFloat(val(mapeo.precio_costo))  || 0,
          precio_venta:  parseFloat(val(mapeo.precio_venta))  || 0,
          stock_actual:  parseFloat(val(mapeo.stock_actual))  || 0,
          stock_minimo:  parseFloat(val(mapeo.stock_minimo))  || 0,
          controla_stock: true,
          activo: true,
        }

        // Buscar producto existente por código de barras o código
        const existente = productos.find(p =>
          (datos.codigo_barras && p.codigo_barras === datos.codigo_barras) ||
          (datos.codigo && p.codigo === datos.codigo)
        )

        if (existente) {
          const res = await onActualizar(existente.id, { ...existente, ...datos }, existente)
          if (res.error) throw new Error(res.error.message)
          actualizados++
        } else {
          const res = await onCrear(datos)
          if (res.error) throw new Error(res.error.message)
          creados++
        }
      } catch (err) {
        errores.push(String(err.message || err))
      }
    }

    setResult({ creados, actualizados, errores })
    setPaso(3)
    setImp(false)
  }

  // Columnas del select (vacío + cada encabezado)
  const opcionesCol = [
    <option key="" value="">— No importar —</option>,
    ...headers.map((h, i) => (
      <option key={i} value={i}>{String.fromCharCode(65 + i)} — {h || `Columna ${i + 1}`}</option>
    )),
  ]

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-xl">

        {/* Header */}
        <div className="panel-header">
          <h2 className="panel-title">
            <i className="ti ti-file-spreadsheet" style={{ marginRight: 6, fontSize: 15 }} />
            Importar productos desde Excel
          </h2>
          <button className="btn-icon" onClick={onCerrar}><i className="ti ti-x" /></button>
        </div>

        {/* Paso 1: Upload */}
        {paso === 1 && (
          <div className="modal-body">
            <div
              className={`drop-zone${arrastrando ? ' drop-zone--over' : ''}`}
              onDragOver={e => { e.preventDefault(); setArr(true) }}
              onDragLeave={() => setArr(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <i className="ti ti-cloud-upload drop-zone-icon" />
              <p className="drop-zone-title">Arrastrá tu archivo aquí</p>
              <p className="drop-zone-sub">o hacé click para seleccionar · .xlsx · .xls · .csv</p>
            </div>
            <input
              ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => procesarArchivo(e.target.files[0])}
            />
            <div className="import-hints">
              <div className="import-hint">
                <i className="ti ti-info-circle" />
                <span>La primera fila debe contener los encabezados de columna.</span>
              </div>
              <div className="import-hint import-hint--cols">
                <i className="ti ti-columns" />
                <span>
                  Columnas reconocidas automáticamente:&nbsp;
                  <strong>nombre</strong>, <strong>codigo</strong>, <strong>codigo_barras</strong>,&nbsp;
                  <strong>categoria</strong>, <strong>precio_costo</strong>, <strong>precio_venta</strong>,&nbsp;
                  <strong>stock_actual</strong>, <strong>stock_minimo</strong>
                </span>
              </div>
              <button type="button" className="btn btn--primary" onClick={descargarPlantilla}
                style={{ alignSelf: 'flex-start' }}>
                <i className="ti ti-download" />
                Descargar plantilla de ejemplo
              </button>
            </div>
          </div>
        )}

        {/* Paso 2: Mapeo */}
        {paso === 2 && (
          <div className="modal-body modal-body--scroll">
            {/* Preview */}
            <div className="preview-section">
              <p className="import-section-title">
                <i className="ti ti-table" /> Vista previa ({filas.length} filas)
              </p>
              <div className="preview-wrap">
                <table className="data-table preview-table">
                  <thead>
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i}>{String.fromCharCode(65 + i)} — {h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>
                        {headers.map((_, ci) => (
                          <td key={ci} className="td-muted">{String(row[ci] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mapeo de columnas */}
            <div className="mapeo-section">
              <p className="import-section-title">
                <i className="ti ti-arrows-transfer-down" /> Asignar columnas
              </p>
              <div className="mapeo-grid">
                {CAMPOS.map(campo => (
                  <div key={campo.id} className="field">
                    <label className="field-label">
                      {campo.label}
                      {campo.required && <span style={{ color: 'var(--color-text-danger)' }}> *</span>}
                    </label>
                    <select
                      className="field-select"
                      value={mapeo[campo.id] ?? ''}
                      onChange={e => {
                        const v = e.target.value
                        setMapeo(prev => ({ ...prev, [campo.id]: v === '' ? undefined : Number(v) }))
                      }}
                    >
                      {opcionesCol}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Paso 3: Resultado */}
        {paso === 3 && resultado && (
          <div className="modal-body resultado-body">
            <div className="resultado-icon">
              <i className="ti ti-circle-check" style={{ color: 'var(--color-text-success)', fontSize: 40 }} />
            </div>
            <h3 className="resultado-titulo">Importación completada</h3>
            <div className="resultado-stats">
              <div className="resultado-stat resultado-stat--success">
                <i className="ti ti-plus" />
                <span><strong>{resultado.creados}</strong> productos creados</span>
              </div>
              <div className="resultado-stat resultado-stat--info">
                <i className="ti ti-refresh" />
                <span><strong>{resultado.actualizados}</strong> productos actualizados</span>
              </div>
              {resultado.errores.length > 0 && (
                <div className="resultado-stat resultado-stat--danger">
                  <i className="ti ti-alert-circle" />
                  <span><strong>{resultado.errores.length}</strong> errores</span>
                </div>
              )}
            </div>
            {resultado.errores.length > 0 && (
              <div className="errores-list">
                <p className="field-label" style={{ marginBottom: 6 }}>Detalle de errores:</p>
                {resultado.errores.slice(0, 5).map((e, i) => (
                  <p key={i} className="error-row">{e}</p>
                ))}
                {resultado.errores.length > 5 && (
                  <p className="td-muted" style={{ fontSize: 11 }}>
                    ...y {resultado.errores.length - 5} más
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="panel-footer">
          {paso === 1 && (
            <button className="btn" onClick={onCerrar}><i className="ti ti-x" /> Cancelar</button>
          )}
          {paso === 2 && (
            <>
              <button className="btn" onClick={() => setPaso(1)}>
                <i className="ti ti-arrow-left" /> Volver
              </button>
              <button className="btn btn--primary" onClick={confirmar} disabled={importando}>
                <i className={`ti ${importando ? 'ti-loader-2' : 'ti-file-import'}`} />
                {importando ? 'Importando...' : `Importar ${filas.length} filas`}
              </button>
            </>
          )}
          {paso === 3 && (
            <button className="btn btn--primary" onClick={onCerrar}>
              <i className="ti ti-check" /> Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
