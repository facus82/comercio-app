// Utilidades compartidas por los importadores de Excel/CSV (productos, clientes)

// "Stock _Inicial" → "stock_inicial", "Categoría" → "categoria"
export const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().replace(/[\s_-]+/g, '_')

// Para comparar nombres: "Librería " = "libreria", "Art.  Limpieza" = "art. limpieza"
export const claveNombre = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim()
export const mismoNombre = (a, b) => claveNombre(a) === claveNombre(b)

export function coincide(header, sinonimo) {
  if (header === sinonimo) return true
  if (header.split('_').includes(sinonimo)) return true
  return sinonimo.length >= 4 && header.includes(sinonimo)
}

/* Detecta el mapeo según los encabezados. Primero los que coinciden exacto con el campo
   (así "stock_minimo" no termina como stock actual ni "Id_productos" como nombre),
   después por sinónimo, sin repetir columna. */
export function autoDetectar(headers, campos, sinonimos) {
  const hs = headers.map(normalizar)
  const mapeo = {}
  const usadas = new Set()
  for (const campo of campos.map(c => c.id)) {
    const i = hs.indexOf(campo)
    if (i >= 0) { mapeo[campo] = i; usadas.add(i) }
  }
  for (const campo of campos.map(c => c.id)) {
    if (mapeo[campo] !== undefined) continue
    for (const s of sinonimos[campo] || []) {
      const i = hs.findIndex((h, j) => !usadas.has(j) && coincide(h, s))
      if (i >= 0) { mapeo[campo] = i; usadas.add(i); break }
    }
  }
  return mapeo
}

/* Acepta "1500", "1500.50", "1.500", "$ 1.234,50", "1,234.50", "30%".
   El último separador con 1-2 decimales es el decimal; un punto o coma con 3 dígitos detrás es de miles. */
export function parseNumero(v) {
  if (typeof v === 'number') return v
  let s = String(v ?? '').replace(/[^\d.,-]/g, '')
  if (!s) return 0
  const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (ultimo >= 0) {
    const decimales = s.length - ultimo - 1
    const sep = s[ultimo]
    const otroSepPresente = s.includes(sep === '.' ? ',' : '.')
    const repetido = s.indexOf(sep) !== ultimo
    if (!otroSepPresente && (repetido || decimales === 3)) {
      s = s.split(sep).join('')                     // sólo separadores de miles
    } else {
      s = s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1)
    }
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/* Fecha de Excel → "AAAA-MM-DD". Acepta número de serie de Excel, "15/03/2026",
   "15-03-26", "2026-03-15". Devuelve null si no se entiende. */
export function parseFecha(v) {
  if (v === null || v === undefined || v === '') return null
  const iso = (y, m, d) => {
    const f = new Date(Date.UTC(y, m - 1, d))
    if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  if (typeof v === 'number') {
    if (v < 1 || v > 100000) return null
    const f = new Date(Math.round((v - 25569) * 86400000))  // 25569 = 1/1/1970 en Excel
    return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate())
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/)
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  return null
}

// 0 → A, 25 → Z, 26 → AA (los CSV de AppSheet traen muchas columnas)
export function colLetra(i) {
  let s = ''
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s
  return s
}

export async function leerArchivo(file) {
  const XLSX = await import('xlsx')  // se descarga sólo al usarse
  const buf = await file.arrayBuffer()
  let wb
  if (/\.csv$/i.test(file.name)) {
    // CSV como texto: UTF-8 (AppSheet, Google Sheets) y si no, Latin-1 (Excel viejo)
    let texto = new TextDecoder('utf-8').decode(buf)
    if (texto.includes('\uFFFD')) texto = new TextDecoder('windows-1252').decode(buf)
    wb = XLSX.read(texto.replace(/^\uFEFF/, ''), { type: 'string', raw: true })
  } else {
    wb = XLSX.read(buf, { type: 'array' })
  }
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const headers = (data[0] || []).map(String)
  const filas   = data.slice(1).filter(row => row.some(c => String(c).trim() !== ''))
  return { headers, filas }
}

export async function descargarPlantilla(filas, hoja, archivo) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, hoja)
  XLSX.writeFile(wb, archivo)
}
