/* Combos: un producto armado con otros (017_combos.sql). El combo no tiene stock propio;
   cuántos se pueden armar sale del stock de sus componentes. */

// Para agregar al select de productos: trae los componentes de cada combo
export const SELECT_COMPONENTES =
  'componentes:producto_componentes!producto_componentes_combo_id_fkey(cantidad, componente_id)'

/* Cuántos combos se pueden armar con el stock actual.
   stockDe(id) → { stock_actual, controla_stock } del componente (de la lista en pantalla).
   Componentes que no controlan stock no limitan. null = no hay límite / sin componentes. */
export function combosDisponibles(combo, stockDe) {
  let min = null
  for (const c of combo.componentes || []) {
    const p = stockDe(c.componente_id)
    if (!p || p.controla_stock === false) continue
    const n = Math.floor(Math.max(0, Number(p.stock_actual)) / Number(c.cantidad))
    min = min === null ? n : Math.min(min, n)
  }
  return min
}
