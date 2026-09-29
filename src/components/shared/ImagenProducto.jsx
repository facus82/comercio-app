import { useState, useRef } from 'react'
import { subirImagenProducto } from '../../lib/imagenes'
import './ImagenProducto.css'

/* Miniatura del producto (o ícono gris si no tiene foto) */
export function ProductoThumb({ url, size = 32, alt = '' }) {
  const [rota, setRota] = useState(false)
  if (!url || rota) {
    return (
      <span className="prod-thumb prod-thumb--vacia" style={{ width: size, height: size }}>
        <i className="ti ti-photo" style={{ fontSize: Math.round(size * 0.45) }} />
      </span>
    )
  }
  return (
    <img className="prod-thumb" src={url} alt={alt} width={size} height={size}
      loading="lazy" decoding="async" onError={() => setRota(true)} />
  )
}

/* Campo de la ficha: sacar foto (celular) / elegir archivo, reemplazar o quitar.
   Sube al elegir; la imagen vieja se borra recién al guardar el producto. */
export function ImagenProductoField({ comercioId, value, onChange }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error,    setError]    = useState('')
  const [kb,       setKb]       = useState(null)
  const camaraRef  = useRef(null)
  const archivoRef = useRef(null)

  async function onArchivo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''            // permite volver a elegir el mismo archivo
    if (!file) return
    setSubiendo(true); setError('')
    const res = await subirImagenProducto(comercioId, file)
    setSubiendo(false)
    if (res.error) { setError(res.error.message || 'No se pudo subir la imagen.'); return }
    setKb(res.kb)
    onChange(res.url)
  }

  return (
    <div className="img-field">
      <div className={`img-field-preview${value ? '' : ' img-field-preview--vacia'}`}>
        {subiendo
          ? <i className="ti ti-loader-2 img-field-spin" />
          : value
            ? <img src={value} alt="Imagen del producto" />
            : <i className="ti ti-photo-plus" />}
      </div>

      <div className="img-field-acciones">
        <div className="img-field-botones">
          {/* capture abre directo la cámara trasera en el celular */}
          <button type="button" className="btn img-field-solo-movil" disabled={subiendo} onClick={() => camaraRef.current?.click()}>
            <i className="ti ti-camera" /> Sacar foto
          </button>
          <button type="button" className="btn" disabled={subiendo} onClick={() => archivoRef.current?.click()}>
            <i className="ti ti-upload" /> {value ? 'Cambiar' : 'Elegir imagen'}
          </button>
          {value && (
            <button type="button" className="btn-icon btn-icon--danger" disabled={subiendo} title="Quitar imagen" onClick={() => { onChange(''); setKb(null) }}>
              <i className="ti ti-trash" />
            </button>
          )}
        </div>
        <span className="field-hint">
          {subiendo ? 'Achicando y subiendo…'
            : kb != null ? `Lista · ${kb} KB (optimizada)`
            : 'Se achica automáticamente (~30 KB) para no ocupar espacio.'}
        </span>
        {error && <span className="field-error">{error}</span>}
      </div>

      <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={onArchivo} />
      <input ref={archivoRef} type="file" accept="image/*" hidden onChange={onArchivo} />
    </div>
  )
}
