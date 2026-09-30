import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { subirImagenProducto } from '../../lib/imagenes'
import {
  autoDetectar, claveNombre, mismoNombre, parseNumero, colLetra, leerArchivo, descargarPlantilla,
} from '../../lib/excel'
import './ImportarExcel.css'

const CAMPOS = [
  { id: 'nombre',        label: 'Nombre',          required: true  },
  { id: 'codigo',        label: 'Código interno',   required: false },
  { id: 'codigo_barras', label: 'Código de barras', required: false },
  { id: 'categoria',     label: 'Categoría',        required: false },
  { id: 'subcategoria',  label: 'Subcategoría',     required: false },
  { id: 'proveedor',     label: 'Proveedor',        required: false },
  { id: 'precio_costo',  label: 'Precio costo',     required: false },
  { id: 'precio_venta',  label: 'Precio venta',     required: false },
  { id: 'stock_actual',  label: 'Stock actual',     required: false },
  { id: 'stock_minimo',  label: 'Stock mínimo',     required: false },
  { id: 'imagen',        label: 'Imagen',           required: false },
]

const SINONIMOS = {
  nombre:        ['nombre', 'name', 'producto', 'descripcion', 'articulo'],
  codigo:        ['codigo', 'code', 'cod', 'sku', 'ref', 'id'],
  codigo_barras: ['barras', 'ean', 'barcode', 'gtin', 'codigo_barras'],
  categoria:     ['categoria', 'category', 'rubro', 'tipo'],
  subcategoria:  ['subcategoria', 'subcategory', 'subrubro'],
  proveedor:     ['proveedor', 'supplier', 'distribuidor', 'marca'],
  precio_costo:  ['costo', 'precio_costo', 'cost', 'compra', 'precio_compra'],
  precio_venta:  ['precio_venta', 'venta', 'precio', 'price'],
  stock_actual:  ['stock_actual', 'stock', 'cantidad', 'qty', 'existencia', 'inicial'],
  stock_minimo:  ['stock_minimo', 'minimo', 'min'],
  imagen:        ['imagen', 'image', 'foto', 'photo', 'img'],
}

// "Productos_Images/abc.Imagen.0123.jpg" → "abc.imagen.0123.jpg"
const nombreArchivo = s => String(s || '').split(/[\\/]/).pop().trim().toLowerCase()
const esUrl = s => /^https?:\/\//i.test(String(s || '').trim())

function plantillaProductos() {
  return descargarPlantilla([
    ['nombre', 'codigo', 'codigo_barras', 'categoria', 'subcategoria', 'proveedor', 'precio_costo', 'precio_venta', 'stock_actual', 'stock_minimo'],
    ['Cuaderno A4 rayado', 'CUA-001', '7790001234560', 'Librería', 'Cuadernos', 'Distribuidora Norte', 500, 850, 50, 10],
    ['Birome azul Bic', 'BIO-001', '7790001234561', 'Papelería', 'Bolígrafos', 'BIC Argentina', 120, 220, 200, 30],
    ['Gaseosa Coca 500ml', 'COC-001', '7790001234562', 'Kiosco', 'Bebidas', 'Coca-Cola FEMSA', 450, 700, 48, 12],
  ], 'Productos', 'plantilla_productos.xlsx')
}

export default function ImportarExcel({
  productos, categorias, subcategorias = [], proveedores = [], comercioId,
  onCrear, onActualizar, onImportado, onCerrar,
}) {
  const fileRef = useRef(null)
  const imgRef  = useRef(null)
  const [paso, setPaso]         = useState(1) // 1 upload · 2 mapeo · 3 resultado
  const [arrastrando, setArr]   = useState(false)
  const [headers, setHeaders]   = useState([])
  const [filas, setFilas]       = useState([])
  const [mapeo, setMapeo]       = useState({})
  const [imagenes, setImagenes] = useState(new Map()) // nombre de archivo en minúscula → File
  const [importando, setImp]    = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [soloActualizar, setSoloActualizar] = useState(false) // p. ej. para agregar sólo las fotos
  const [resultado, setResult]  = useState(null)

  // Valores de la columna imagen que no son URL: hay que elegir la carpeta con las fotos
  const imgValores = mapeo.imagen === undefined ? []
    : filas.map(r => String(r[mapeo.imagen] ?? '').trim()).filter(Boolean)
  const imgArchivos    = imgValores.filter(v => !esUrl(v))
  const imgEncontradas = imgArchivos.filter(v => imagenes.has(nombreArchivo(v))).length

  // Categorías del archivo, separadas en las que ya existen y las que se van a crear
  const catsArchivo = new Map()
  if (mapeo.categoria !== undefined) {
    for (const r of filas) {
      const v = String(r[mapeo.categoria] ?? '').trim()
      if (v && !catsArchivo.has(claveNombre(v))) catsArchivo.set(claveNombre(v), v)
    }
  }
  const catsNuevas     = [...catsArchivo.values()].filter(v => !categorias.some(c => mismoNombre(c.nombre, v)))
  const catsExistentes = catsArchivo.size - catsNuevas.length

  function elegirImagenes(fileList) {
    const m = new Map()
    for (const f of fileList) if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)) m.set(f.name.toLowerCase(), f)
    setImagenes(m)
  }

  async function resolverImagen(valor) {
    if (!valor) return null
    if (esUrl(valor)) {
      // Se intenta copiar a nuestro almacenamiento; si el origen no deja (CORS), se guarda el link tal cual
      try {
        const resp = await fetch(valor)
        if (!resp.ok) throw new Error()
        const blob = await resp.blob()
        const res = await subirImagenProducto(comercioId, new File([blob], 'img', { type: blob.type || 'image/jpeg' }))
        return res.url || valor
      } catch { return valor }
    }
    const file = imagenes.get(nombreArchivo(valor))
    if (!file) return null
    const res = await subirImagenProducto(comercioId, file.type ? file : new File([file], file.name, { type: 'image/jpeg' }))
    if (res.error) throw new Error(`Imagen "${valor}": ${res.error.message}`)
    return res.url
  }

  async function procesarArchivo(file) {
    if (!file) return
    try {
      const { headers: h, filas: f } = await leerArchivo(file)
      setHeaders(h)
      setFilas(f)
      setMapeo(autoDetectar(h, CAMPOS, SINONIMOS))
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
    setProgreso(0)
    let creados = 0, actualizados = 0, categoriasNuevas = 0, imagenesSubidas = 0, errores = []
    const noEncontrados = []
    const cats = [...categorias]
    const mapeado = campo => mapeo[campo] !== undefined

    // Las categorías que no existen se crean una sola vez
    async function categoriaId(nombreCat) {
      if (!nombreCat) return null
      const hallada = cats.find(c => mismoNombre(c.nombre, nombreCat))
      if (hallada) return hallada.id
      const { data, error } = await supabase.from('categorias')
        .insert({ nombre: nombreCat, color: '#3b82f6', comercio_id: comercioId })
        .select('id, nombre, color').single()
      if (error) throw new Error(`Categoría "${nombreCat}": ${error.message}`)
      cats.push(data)
      categoriasNuevas++
      return data.id
    }

    for (let n = 0; n < filas.length; n++) {
      const row = filas[n]
      setProgreso(n + 1)
      const val = i => (i !== undefined && i !== '' ? String(row[i] ?? '').trim() : '')
      const nombre = val(mapeo.nombre)
      try {
        if (!nombre) continue

        const subNombre  = val(mapeo.subcategoria)
        const provNombre = val(mapeo.proveedor)

        const sub  = subNombre
          ? subcategorias.find(s => mismoNombre(s.nombre, subNombre))
          : null
        const prov = provNombre
          ? proveedores.find(p => mismoNombre(p.razon_social, provNombre))
          : null

        const precioCosto = parseNumero(val(mapeo.precio_costo))

        // Sólo las columnas asignadas: al actualizar, lo no asignado (ej. stock) queda como está
        const datos = { nombre }
        if (mapeado('codigo'))        datos.codigo          = val(mapeo.codigo)        || null
        if (mapeado('codigo_barras')) datos.codigo_barras   = val(mapeo.codigo_barras) || null

        // Buscar producto existente por código de barras, código o nombre
        const existente = productos.find(p =>
          (datos.codigo_barras && p.codigo_barras === datos.codigo_barras) ||
          (datos.codigo && p.codigo === datos.codigo)
        ) || productos.find(p => mismoNombre(p.nombre, nombre))
        if (!existente && soloActualizar) { noEncontrados.push(nombre); continue }

        if (mapeado('categoria'))     datos.categoria_id    = await categoriaId(val(mapeo.categoria))
        if (mapeado('subcategoria'))  datos.subcategoria_id = sub?.id || null
        if (mapeado('precio_costo'))  datos.precio_costo    = precioCosto
        if (mapeado('precio_venta'))  datos.precio_venta    = parseNumero(val(mapeo.precio_venta))
        if (mapeado('stock_actual'))  datos.stock_actual    = parseNumero(val(mapeo.stock_actual))
        if (mapeado('stock_minimo'))  datos.stock_minimo    = parseNumero(val(mapeo.stock_minimo))

        // La foto se sube sólo si el producto todavía no tiene una
        if (mapeado('imagen') && !existente?.imagen_url) {
          const url = await resolverImagen(val(mapeo.imagen))
          if (url) { datos.imagen_url = url; imagenesSubidas++ }
        }

        let productoId
        if (existente) {
          // Sin las columnas de joins (categoria/subcategoria) que vienen en `existente`
          const { precio_costo, precio_venta, precio_mayorista, stock_actual } = existente
          const res = await onActualizar(existente.id,
            { precio_costo, precio_venta, precio_mayorista, stock_actual, ...datos }, existente)
          if (res.error) throw new Error(res.error.message)
          productoId = existente.id
          actualizados++
        } else {
          const res = await onCrear({
            precio_costo: 0, precio_venta: 0, stock_actual: 0, stock_minimo: 0,
            ...datos, controla_stock: true, activo: true,
          })
          if (res.error) throw new Error(res.error.message)
          productoId = res.data.id
          creados++
        }

        // Asociar proveedor en tabla intermedia
        if (prov && productoId) {
          const { data: yaExiste } = await supabase
            .from('producto_proveedores')
            .select('id, es_principal')
            .eq('producto_id', productoId)
            .eq('es_principal', true)
            .maybeSingle()

          const esPrincipal = !yaExiste

          await supabase.from('producto_proveedores').upsert({
            comercio_id:  comercioId,
            producto_id:  productoId,
            proveedor_id: prov.id,
            precio_costo: precioCosto || null,
            es_principal: esPrincipal,
            activo:       true,
          }, { onConflict: 'producto_id,proveedor_id' })

          if (esPrincipal) {
            await supabase.from('productos').update({ proveedor_id: prov.id }).eq('id', productoId)
          }
        }
      } catch (err) {
        errores.push(`${nombre || `Fila ${n + 2}`}: ${err.message || err}`)
      }
    }

    setResult({ creados, actualizados, categoriasNuevas, imagenesSubidas, noEncontrados, errores })
    setPaso(3)
    setImp(false)
    onImportado?.()
  }

  // Columnas del select (vacío + cada encabezado)
  const opcionesCol = [
    <option key="" value="">— No importar —</option>,
    ...headers.map((h, i) => (
      <option key={i} value={i}>{colLetra(i)} — {h || `Columna ${i + 1}`}</option>
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
                  <strong>categoria</strong>, <strong>subcategoria</strong>, <strong>proveedor</strong>,&nbsp;
                  <strong>precio_costo</strong>, <strong>precio_venta</strong>,&nbsp;
                  <strong>stock_actual</strong>, <strong>stock_minimo</strong>
                </span>
              </div>
              <button type="button" className="btn btn--primary" onClick={plantillaProductos}
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
                        <th key={i}>{colLetra(i)} — {h}</th>
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
              <div className="import-hint" style={{ marginTop: 10 }}>
                <i className="ti ti-info-circle" />
                <span>
                  Las categorías que no existan se crean solas. Si un producto ya existe (mismo código o
                  mismo nombre) se actualiza sólo con las columnas asignadas: lo que dejes en
                  «No importar» (por ejemplo el stock) no se toca.
                </span>
              </div>
              <label className="import-hint" style={{ marginTop: 8, cursor: 'pointer', color: 'var(--color-text-primary)' }}>
                <input type="checkbox" checked={soloActualizar} onChange={e => setSoloActualizar(e.target.checked)} />
                <span>
                  <strong>Sólo actualizar productos que ya existen</strong> (no crear nuevos). Útil para
                  agregar fotos o precios a lo que ya importaste.
                </span>
              </label>
            </div>

            {catsArchivo.size > 0 && (
              <div className="import-hint import-hint--cols">
                <i className="ti ti-tag" />
                <span>
                  Categorías: <strong>{catsExistentes}</strong> coinciden con las que ya tenés
                  {catsNuevas.length > 0 ? (
                    <>
                      {' '}y se van a <strong>crear {catsNuevas.length} nuevas</strong>: {catsNuevas.join(', ')}.
                      {' '}Si alguna es la misma que ya existe pero escrita distinto (ej. plural), corregila en el
                      archivo o renombrá la de la app antes de importar.
                    </>
                  ) : '.'}
                </span>
              </div>
            )}

            {/* Imágenes que vienen como nombre de archivo (AppSheet): se buscan en una carpeta */}
            {imgArchivos.length > 0 && (
              <div className="import-hint import-hint--cols">
                <i className="ti ti-photo" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span>
                    La columna de imagen trae nombres de archivo, no las fotos. Elegí la carpeta donde están
                    (en AppSheet es la carpeta <strong>…_Images</strong> de la app en Google Drive, descargada).
                    {imagenes.size > 0 && <> <strong>{imgEncontradas} de {imgArchivos.length}</strong> fotos encontradas.</>}
                  </span>
                  <button type="button" className="btn" style={{ alignSelf: 'flex-start' }}
                    onClick={() => imgRef.current?.click()}>
                    <i className="ti ti-folder" />
                    {imagenes.size > 0 ? 'Cambiar carpeta' : 'Elegir carpeta de imágenes'}
                  </button>
                  <input ref={imgRef} type="file" multiple webkitdirectory="" style={{ display: 'none' }}
                    onChange={e => elegirImagenes(e.target.files)} />
                </div>
              </div>
            )}
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
              {resultado.categoriasNuevas > 0 && (
                <div className="resultado-stat resultado-stat--info">
                  <i className="ti ti-tag" />
                  <span><strong>{resultado.categoriasNuevas}</strong> categorías nuevas</span>
                </div>
              )}
              {resultado.imagenesSubidas > 0 && (
                <div className="resultado-stat resultado-stat--info">
                  <i className="ti ti-photo" />
                  <span><strong>{resultado.imagenesSubidas}</strong> fotos cargadas</span>
                </div>
              )}
              {resultado.noEncontrados.length > 0 && (
                <div className="resultado-stat resultado-stat--danger" title={resultado.noEncontrados.join('\n')}>
                  <i className="ti ti-search-off" />
                  <span>
                    <strong>{resultado.noEncontrados.length}</strong> no encontrados en la app:{' '}
                    {resultado.noEncontrados.slice(0, 5).join(', ')}{resultado.noEncontrados.length > 5 ? '…' : ''}
                  </span>
                </div>
              )}
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
                {importando ? `Importando ${progreso} de ${filas.length}...` : `Importar ${filas.length} filas`}
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
