import { supabase } from './supabase'

/* Las devoluciones bajan ventas.total en el lugar (la venta queda con lo que se llevó el
   cliente), pero en los totales del período cuentan el día en que se hacen:
   ventas del período a su valor original − devoluciones hechas en el período. */

export const totalOriginal = v => Number(v.total) + Number(v.devuelto_monto || 0)

// desde/hasta: ISO timestamps (hasta opcional)
export async function cargarDevolucionesRango(comercioId, desde, hasta = null) {
  let q = supabase
    .from('devoluciones')
    .select('monto, created_at')
    .eq('comercio_id', comercioId)
    .gte('created_at', desde)
  if (hasta) q = q.lte('created_at', hasta)
  const { data, error } = await q
  return { data: data || [], total: (data || []).reduce((s, d) => s + Number(d.monto), 0), error }
}
