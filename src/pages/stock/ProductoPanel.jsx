import { useState, useEffect, useMemo } from 'react'

const UNIDADES = ['unidad', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'caja', 'pack', 'docena']
const IVA_OPTS = [0, 10.5, 21, 27]

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(v || 0)

const DEFAULTS = {
  nombre: '', codigo: '', codigo_barras: '', descripcion: '', notas: '',
  categoria_id: '', proveedor_id: '', centro_costo_id: '',
  unidad_medida: 'unidad',
  precio_costo: '', precio_venta: '', precio_mayorista: '',
  iva_porcentaje: 21,
  stock_actual: 0, stock_minimo: 0, stock_maximo: '',
  controla_stock: true, controla_lotes: false, es_servicio: false, activo: true,
}

function toForm(p) {
  if (!p) return DEFAULTS
  return {
    nombre:          p.nombre          ?? '',
    codigo:          p.codigo          ?? '',
    codigo_barras:   p.codigo_barras   ?? '',
    descripcion:     p.descripcion     ?? '',
    notas:           p.notas           ?? '',
    categoria_id:    p.categoria_id    ?? '',
    proveedor_id:    p.proveedor_id    ?? '',
    centro_costo_id: p.centro_costo_id ?? '',
    unidad_medida:   p.unidad_medida   ?? 'unidad',
    precio_costo:    p.precio_costo    ?? '',
    precio_venta:    p.precio_venta    ?? '',
    precio_mayorista: p.precio_mayorista ?? '',
    iva_porcentaje:  p.iva_porcentaje  ?? 21,
    stock_actual:    p.stock_actual    ?? 0,
    stock_minimo:    p.stock_minimo    ?? 0,
    stock_maximo:    p.stock_maximo    ?? '',
    controla_stock:  p.controla_stock  ?? true,
    controla_lotes:  p.controla_lotes  ?? false,
    es_servicio:     p.es_servicio     ?? false,
    activo:          p.activo          ?? true,
  }
}

function initCalc(producto) {
  if (!producto) return { compra: '', flete: '', margen: 30 }
  const costo = Number(producto.precio_costo) || 0
  const venta = Number(producto.precio_venta) || 0
  const margen = costo > 0 ? Math.round(((venta / costo) - 1) * 100) : 30
  return { compra: costo || '', flete: '', margen: Math.max(0, margen) }
}

export default function ProductoPanel({
  producto, categorias, proveedores, centrosCostos,
  onCrear, onActualizar, onCerrar,
}) {
  const [form, setForm]   = useState(() => toForm(producto))
  const [calc, setCalc]   = useState(() => initCalc(producto))
  const [precioManual, setPrecioManual] = useState(!!producto) // al editar, precio es manual
  const [enPromo, setEnPromo] = useState(!!(producto?.precio_mayorista))
  const [saving, setSaving] = useState(false)
  const [error, setError]  = useState('')

  useEffect(() => {
    setForm(toForm(producto))
    setCalc(initCalc(producto))
    setPrecioManual(!!producto)
    setEnPromo(!!(producto?.precio_mayorista))
    setError('')
  }, [producto])

  // Cerrar con Escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  function setF(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }
  function setC(campo, valor) {
    setCalc(prev => ({ ...prev, [campo]: valor }))
  }

  // ── Calculadora ───────────────────────────────────────
  const costoBase = useMemo(() =>
    (Number(calc.compra) || 0) + (Number(calc.flete) || 0),
    [calc.compra, calc.flete]
  )

  const sugerido = useMemo(() =>
    costoBase > 0 ? +(costoBase * (1 + (Number(calc.margen) || 0) / 100)).toFixed(2) : 0,
    [costoBase, calc.margen]
  )

  // Sincronizar precio_costo con costoBase cuando cambia la calculadora
  useEffect(() => {
    if (costoBase > 0) setF('precio_costo', costoBase.toFixed(2))
  }, [costoBase])

  // Auto-llenar precio_venta con sugerido si el usuario no lo editó manualmente
  useEffect(() => {
    if (!precioManual && sugerido > 0) setF('precio_venta', sugerido.toFixed(2))
  }, [sugerido, precioManual])

  function aplicarSugerido() {
    setF('precio_venta', sugerido.toFixed(2))
    setPrecioManual(false)
  }

  // ── Submit ────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim())     { setError('El nombre es obligatorio.');        return }
    if (!form.precio_venta)      { setError('El precio de venta es obligatorio.'); return }

    setSaving(true); setError('')

    const datos = {
      nombre:          form.nombre.trim(),
      codigo:          form.codigo.trim()        || null,
      codigo_barras:   form.codigo_barras.trim() || null,
      descripcion:     form.descripcion.trim()   || null,
      notas:           form.notas.trim()         || null,
      categoria_id:    form.categoria_id         || null,
      proveedor_id:    form.proveedor_id         || null,
      centro_costo_id: form.centro_costo_id      || null,
      unidad_medida:   form.unidad_medida,
      precio_costo:    Number(form.precio_costo)    || 0,
      precio_venta:    Number(form.precio_venta)    || 0,
      precio_mayorista: enPromo && form.precio_mayorista ? Number(form.precio_mayorista) : null,
      iva_porcentaje:  Number(form.iva_porcentaje) || 21,
      stock_actual:    Number(form.stock_actual)   || 0,
      stock_minimo:    Number(form.stock_minimo)   || 0,
      stock_maximo:    form.stock_maximo ? Number(form.stock_maximo) : null,
      controla_stock:  form.controla_stock,
      controla_lotes:  form.controla_lotes,
      es_servicio:     form.es_servicio,
      activo:          form.activo,
    }

    const res = producto
      ? await onActualizar(producto.id, datos, producto)
      : await onCrear(datos)

    setSaving(false)
    if (res.error) setError(res.error.message || 'Error al guardar.')
    else onCerrar()
  }

  const esNuevo = !producto

  return (
    <>
      <div className="panel-backdrop" onClick={onCerrar} />
      <aside className="panel">

        {/* Header */}
        <div className="panel-header">
          <h2 className="panel-title">
            <i className={`ti ${esNuevo ? 'ti-package' : 'ti-pencil'}`} style={{ marginRight: 6, fontSize: 15 }} />
            {esNuevo ? 'Nuevo producto' : 'Editar producto'}
          </h2>
          <button className="btn-icon" onClick={onCerrar} title="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Body */}
        <form id="producto-form" className="panel-body" onSubmit={handleSubmit}>
          {error && (
            <div className="error-banner">
              <i className="ti ti-alert-circle" /> {error}
            </div>
          )}

          {/* ── Identificación ── */}
          <div className="form-section">
            <p className="form-section-title">Identificación</p>
            <div className="field">
              <label className="field-label">Nombre *</label>
              <input className="field-input" placeholder="Nombre del producto"
                value={form.nombre} onChange={e => setF('nombre', e.target.value)}
                required autoFocus />
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Código interno</label>
                <input className="field-input" placeholder="LIB-001"
                  value={form.codigo} onChange={e => setF('codigo', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Código de barras</label>
                <input className="field-input" placeholder="7790001..."
                  value={form.codigo_barras} onChange={e => setF('codigo_barras', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Descripción</label>
              <textarea className="field-textarea" rows={2} placeholder="Opcional..."
                value={form.descripcion} onChange={e => setF('descripcion', e.target.value)} />
            </div>
          </div>

          {/* ── Clasificación ── */}
          <div className="form-section">
            <p className="form-section-title">Clasificación</p>
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Categoría</label>
                <select className="field-select" value={form.categoria_id}
                  onChange={e => setF('categoria_id', e.target.value)}>
                  <option value="">Sin categoría</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Unidad de medida</label>
                <select className="field-select" value={form.unidad_medida}
                  onChange={e => setF('unidad_medida', e.target.value)}>
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Proveedor</label>
                <select className="field-select" value={form.proveedor_id}
                  onChange={e => setF('proveedor_id', e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre_fantasia || p.razon_social}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Centro de costo</label>
                <select className="field-select" value={form.centro_costo_id}
                  onChange={e => setF('centro_costo_id', e.target.value)}>
                  <option value="">Sin asignar</option>
                  {centrosCostos.map(cc => <option key={cc.id} value={cc.id}>{cc.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── Precios (calculadora) ── */}
          <div className="form-section">
            <p className="form-section-title">Precios</p>

            {/* Inputs de calculadora */}
            <div className="form-grid">
              <div className="field">
                <label className="field-label">Precio de compra $</label>
                <input className="field-input" type="number" min="0" step="0.01" placeholder="0"
                  value={calc.compra}
                  onChange={e => setC('compra', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Costo flete distribuido $</label>
                <input className="field-input" type="number" min="0" step="0.01" placeholder="0"
                  value={calc.flete}
                  onChange={e => setC('flete', e.target.value)} />
              </div>
            </div>

            {/* Costo base calculado */}
            <div className="calc-row calc-row--base">
              <span className="calc-label">Costo base (precio + flete)</span>
              <span className="calc-value">{fmt$(costoBase)}</span>
            </div>

            {/* Margen */}
            <div className="field" style={{ maxWidth: 160 }}>
              <label className="field-label">Margen de ganancia %</label>
              <input className="field-input" type="number" min="0" step="1" placeholder="30"
                value={calc.margen}
                onChange={e => setC('margen', e.target.value)} />
            </div>

            {/* Precio sugerido */}
            <div className="calc-row calc-row--sugerido">
              <div>
                <span className="calc-label">Precio sugerido</span>
                <span className="calc-value calc-value--sugerido">{fmt$(sugerido)}</span>
              </div>
              {precioManual && sugerido > 0 && (
                <button type="button" className="btn" onClick={aplicarSugerido}
                  style={{ fontSize: 11 }}>
                  <i className="ti ti-arrow-down" /> Aplicar
                </button>
              )}
            </div>

            {/* Precio de venta editable */}
            <div className="field">
              <label className="field-label">
                Precio de venta $ *
                {!precioManual && sugerido > 0 && (
                  <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 6, textTransform: 'none' }}>
                    (sincronizado con sugerido)
                  </span>
                )}
              </label>
              <input className="field-input field-input--venta" type="number" min="0" step="0.01"
                placeholder="0"
                value={form.precio_venta}
                onChange={e => { setF('precio_venta', e.target.value); setPrecioManual(true) }} />
            </div>

            {/* IVA */}
            <div className="field" style={{ maxWidth: 140 }}>
              <label className="field-label">IVA %</label>
              <select className="field-select" value={form.iva_porcentaje}
                onChange={e => setF('iva_porcentaje', e.target.value)}>
                {IVA_OPTS.map(v => <option key={v} value={v}>{v}%</option>)}
              </select>
            </div>

            {/* Toggle promoción */}
            <div className="promo-toggle">
              <label className="field-check">
                <input type="checkbox" checked={enPromo}
                  onChange={e => { setEnPromo(e.target.checked); if (!e.target.checked) setF('precio_mayorista', '') }} />
                Activar precio promocional / mayorista
              </label>
              {enPromo && (
                <div className="field" style={{ marginTop: 8 }}>
                  <label className="field-label">Precio promocional $</label>
                  <input className="field-input field-input--promo" type="number" min="0" step="0.01"
                    placeholder="0" value={form.precio_mayorista}
                    onChange={e => setF('precio_mayorista', e.target.value)} />
                </div>
              )}
            </div>
          </div>

          {/* ── Stock ── */}
          {!form.es_servicio && (
            <div className="form-section">
              <p className="form-section-title">Stock</p>
              <div className="form-grid form-grid--3">
                <div className="field">
                  <label className="field-label">Stock actual</label>
                  <input className="field-input" type="number" step="0.001" placeholder="0"
                    value={form.stock_actual} onChange={e => setF('stock_actual', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Stock mínimo</label>
                  <input className="field-input" type="number" step="0.001" placeholder="0"
                    value={form.stock_minimo} onChange={e => setF('stock_minimo', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Stock máximo</label>
                  <input className="field-input" type="number" step="0.001" placeholder="—"
                    value={form.stock_maximo} onChange={e => setF('stock_maximo', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Opciones ── */}
          <div className="form-section">
            <p className="form-section-title">Opciones</p>
            <div className="form-checks">
              <label className="field-check">
                <input type="checkbox" checked={form.activo}
                  onChange={e => setF('activo', e.target.checked)} />
                Activo
              </label>
              <label className="field-check">
                <input type="checkbox" checked={form.es_servicio}
                  onChange={e => setF('es_servicio', e.target.checked)} />
                Es servicio
              </label>
              <label className="field-check">
                <input type="checkbox" checked={form.controla_stock}
                  onChange={e => setF('controla_stock', e.target.checked)}
                  disabled={form.es_servicio} />
                Controla stock
              </label>
              <label className="field-check">
                <input type="checkbox" checked={form.controla_lotes}
                  onChange={e => setF('controla_lotes', e.target.checked)}
                  disabled={form.es_servicio} />
                Lotes / vencimientos
              </label>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label className="field-label">Notas internas</label>
              <textarea className="field-textarea" rows={2} placeholder="Notas opcionales..."
                value={form.notas} onChange={e => setF('notas', e.target.value)} />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="panel-footer">
          <button type="button" className="btn" onClick={onCerrar}>
            <i className="ti ti-x" /> Cancelar
          </button>
          <button type="submit" form="producto-form" className="btn btn--primary" disabled={saving}>
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
            {saving ? 'Guardando...' : esNuevo ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </div>
      </aside>
    </>
  )
}
