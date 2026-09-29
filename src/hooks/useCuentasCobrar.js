import { supabase } from '../lib/supabase'

/* ── Helpers de fechas ───────────────────── */
export function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function sumarDias(dias, desde = new Date()) {
  const d = new Date(desde); d.setDate(d.getDate() + Number(dias))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Días hasta el vencimiento (negativo = vencida hace N días)
export function diasHasta(fechaStr) {
  if (!fechaStr) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.round((new Date(fechaStr + 'T00:00:00') - hoy) / 86400000)
}

export function nombreCliente(c) {
  if (!c) return '—'
  return c.razon_social || `${c.nombre}${c.apellido ? ` ${c.apellido}` : ''}`
}

// wa.me necesita el número con código de país (Argentina: 549 + área + número)
export function linkWhatsApp(telefono, mensaje) {
  let num = String(telefono || '').replace(/\D/g, '')
  if (!num) return null
  if (!num.startsWith('54')) num = '549' + num.replace(/^0/, '')
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
}

/* ── Ventas a Cta. Cte. con saldo pendiente ── */
export async function cargarDeudas(comercioId, clienteId = null) {
  let q = supabase
    .from('ventas')
    .select('id, numero, fecha, total, cc_monto, cc_pagado, fecha_vencimiento, cliente_id, cliente:clientes(id, nombre, apellido, razon_social, telefono)')
    .eq('comercio_id', comercioId)
    .eq('estado', 'completada')
    .gt('cc_monto', 0)
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
  if (clienteId) q = q.eq('cliente_id', clienteId)

  const { data, error } = await q
  // PostgREST no compara columnas entre sí → filtrar las saldadas acá
  const pendientes = (data || [])
    .map(v => ({ ...v, pendiente: +(Number(v.cc_monto) - Number(v.cc_pagado)).toFixed(2) }))
    .filter(v => v.pendiente > 0.009)
  return { data: pendientes, error }
}

/* Agrupa deudas por cliente: { saldo, vencido, venceSemana, diasAtraso, proxVto } */
export function resumirPorCliente(deudas) {
  const map = {}
  deudas.forEach(v => {
    const key = v.cliente_id ?? 'sin_cliente'
    if (!map[key]) map[key] = {
      id: key, cliente: v.cliente, nombre: v.cliente ? nombreCliente(v.cliente) : 'Sin cliente',
      telefono: v.cliente?.telefono || null,
      saldo: 0, vencido: 0, venceSemana: 0, cant: 0, diasAtraso: 0, proxVto: null, vtoMasViejo: null,
    }
    const c = map[key]
    const dias = diasHasta(v.fecha_vencimiento)
    c.saldo += v.pendiente
    c.cant  += 1
    if (dias != null && dias < 0) {
      c.vencido += v.pendiente
      c.diasAtraso = Math.max(c.diasAtraso, -dias)
      if (!c.vtoMasViejo || v.fecha_vencimiento < c.vtoMasViejo) c.vtoMasViejo = v.fecha_vencimiento
    } else if (dias != null && dias <= 7) {
      c.venceSemana += v.pendiente
    }
    if (dias != null && dias >= 0 && (!c.proxVto || v.fecha_vencimiento < c.proxVto)) c.proxVto = v.fecha_vencimiento
  })
  return Object.values(map).sort((a, b) => b.diasAtraso - a.diasAtraso || b.saldo - a.saldo)
}

export async function cargarCobros(clienteId) {
  const { data, error } = await supabase
    .from('clientes_cobros')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(500)
  return { data: data || [], error }
}

/* Todas las ventas a Cta. Cte. del cliente (pendientes, canceladas y anuladas) con sus ítems */
export async function cargarVentasCC(comercioId, clienteId) {
  const { data, error } = await supabase
    .from('ventas')
    .select('id, numero, fecha, estado, total, recargo_monto, notas, cc_monto, cc_pagado, fecha_vencimiento, items:venta_items(descripcion, cantidad, subtotal)')
    .eq('comercio_id', comercioId)
    .eq('cliente_id', clienteId)
    .gt('cc_monto', 0)
    .order('fecha', { ascending: false })
    .limit(200)
  return { data: data || [], error }
}

/* Historia de cada deuda: nace en la venta y se le aplican los cobros hasta cancelarla.
   Devuelve [{ venta, movimientos: [{ fecha, medio, monto, referencia, saldo }], canceladaEl }] */
export function armarHistorial(ventasCC, cobros) {
  const porVenta = {}
  ;[...cobros]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach(c => (c.imputaciones || []).forEach(imp => {
      (porVenta[imp.venta_id] ||= []).push({
        cobroId: c.id, fecha: c.fecha, medio: c.medio_pago,
        referencia: c.referencia, monto: Number(imp.monto),
      })
    }))

  return ventasCC.map(v => {
    let saldo = Number(v.cc_monto)
    const movimientos = (porVenta[v.id] || []).map(m => {
      saldo = +(saldo - m.monto).toFixed(2)
      return { ...m, saldo }
    })
    const pendiente   = +(Number(v.cc_monto) - Number(v.cc_pagado)).toFixed(2)
    const canceladaEl = v.estado === 'completada' && pendiente <= 0.009 && movimientos.length
      ? movimientos[movimientos.length - 1].fecha
      : null
    return { venta: v, pendiente, movimientos, canceladaEl }
  })
}

export async function registrarCobro({ clienteId, monto, medioPago, fecha, referencia, notas }) {
  const { data, error } = await supabase.rpc('registrar_cobro_cliente', {
    p_cliente_id: clienteId,
    p_monto:      Number(monto),
    p_medio_pago: medioPago,
    p_fecha:      fecha || hoyISO(),
    p_referencia: referencia || null,
    p_notas:      notas || null,
  })
  return { data, error }
}
