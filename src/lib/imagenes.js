import { supabase } from './supabase'

const BUCKET = 'productos'

/* Achica la imagen en el navegador antes de subirla.
   Una foto de celular (3-5 MB) queda en ~20-40 KB: 480 px de lado mayor, WebP calidad 0.72.
   Si el navegador no genera WebP (Safari viejo) cae a JPEG. */
export async function comprimirImagen(file, { maxLado = 480, calidad = 0.72 } = {}) {
  const bitmap = await cargarBitmap(file)
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * escala)
  const h = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'                // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  let blob = await new Promise(r => canvas.toBlob(r, 'image/webp', calidad))
  if (!blob || blob.type !== 'image/webp') {
    blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', calidad))
  }
  return blob
}

// createImageBitmap respeta la orientación EXIF de las fotos del celular
async function cargarBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fallback abajo */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/* Comprime y sube. Devuelve { url, kb } o { error } */
export async function subirImagenProducto(comercioId, file) {
  if (!file.type.startsWith('image/')) return { error: { message: 'El archivo no es una imagen.' } }
  let blob
  try { blob = await comprimirImagen(file) } catch { return { error: { message: 'No se pudo leer la imagen.' } } }

  const ext  = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${comercioId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',   // nombre único por foto → se puede cachear un año
  })
  if (error && /bucket not found/i.test(error.message)) {
    return { error: { message: 'Falta crear el espacio de imágenes en Supabase (migración 011_productos_imagenes.sql).' } }
  }
  if (error) return { error }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, kb: Math.round(blob.size / 1024) }
}

/* Borra la imagen anterior al reemplazarla o quitarla (no falla si no existe) */
export async function borrarImagenProducto(url) {
  const marca = `/object/public/${BUCKET}/`
  const i = url?.indexOf(marca) ?? -1
  if (i < 0) return
  await supabase.storage.from(BUCKET).remove([url.slice(i + marca.length)])
}
