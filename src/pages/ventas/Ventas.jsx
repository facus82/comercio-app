import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useVentas } from '../../hooks/useVentas'
import { supabase } from '../../lib/supabase'
import './Ventas.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

const fmtFechaHora = str => {
  if (!str) return '—'
  const d = new Date(str)
  return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function comprobantesSegunFiscal(condicion) {
  if (condicion === 'Monotributista' || condicion === 'Exento') return ['C']
  if (condicion === 'Responsable Inscripto') return ['A', 'B']
  return ['B'] // Consumidor Final u otros
}

const MEDIOS_PAGO = [
  { value: 'efectivo',         label: 'Efectivo'      },
  { value: 'tarjeta_debito',   label: 'Débito'        },
  { value: 'tarjeta_credito',  label: 'Crédito'       },
  { value: 'transferencia',    label: 'Transferencia' },
  { value: 'mercado_pago',     label: 'Mercado Pago'  },
  { value: 'cuenta_corriente', label: 'Cta. Cte.'     },
]

const ESTADO_BADGE = { completada: 'badge--success', anulada: 'badge--danger', pendiente: 'badge--warning' }

export default function Ventas() {
  const { perfil } = useAuth()
  const comercioId = perfil?.comercio?.id
  const descuentoEfectivoPct = Number(perfil?.comercio?.descuento_efectivo_pct || 0)
  const comprobantesDisponibles = comprobantesSegunFiscal(perfil?.comercio?.condicion_iva)

  const { ventas, loading: loadingVentas, crear, anular } = useVentas(comercioId, perfil?.id)

  const [vista, setVista] = useState('lista') // 'lista' | 'pos'

  // ── Catálogo ──
  const [productos,     setProductos]     = useState([])
  const [centrosCostos, setCentrosCostos] = useState([])
  const [cargandoProds, setCargandoProds] = useState(false)

  // ── Filtros de grilla ──
  const [busqProd,   setBusqProd]   = useState('')
  const [filtroCCId, setFiltroCCId] = useState(null)
  const busqRef = useRef(null)

  // ── Carrito ──
  const [carrito, setCarrito] = useState([])

  // ── Panel de cobro ──
  const [comprobante,         setComprobante]         = useState('B')
  const [busqCliente,         setBusqCliente]         = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [clienteResultados,   setClienteResultados]   = useState([])
  const [dropClienteAbierto,  setDropClienteAbierto]  = useState(false)
  const busqClienteTimer = useRef(null)
  const [pagos,  setPagos]  = useState([{ _key: '1', medio_pago: 'efectivo', monto: '' }])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // ── Filtros lista ──
  const [busqueda,     setBusqueda]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState(null)

  // ── Sincronizar comprobante cuando llega condicion_iva del servidor ──
  useEffect(() => {
    const opciones = comprobantesSegunFiscal(perfil?.comercio?.condicion_iva)
    setComprobante(prev => opciones.includes(prev) ? prev : opciones[0])
  }, [perfil?.comercio?.condicion_iva])

  // ── Cargar catálogo al abrir el POS ──
  useEffect(() => {
    if (!comercioId || vista !== 'pos') return
    cargarCatalogo()
  }, [comercioId, vista])

  async function cargarCatalogo() {
    setCargandoProds(true)
    const [{ data: prods }, { data: ccs }] = await Promise.all([
      supabase
        .from('productos')
        .select('id, nombre, codigo_barras, precio_venta, precio_mayorista, iva_porcentaje, stock_actual, stock_minimo, unidad_medida, controla_stock, categoria:categorias(id, nombre), centro_costo:centros_costos(id, nombre, color)')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('centros_costos')
        .select('id, nombre, color')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),
    ])
    setProductos(prods || [])
    setCentrosCostos(ccs || [])
    setCargandoProds(false)
    setTimeout(() => busqRef.current?.focus(), 100)
  }

  // ── Productos filtrados ──
  const productosFiltrados = useMemo(() => {
    let list = productos
    if (filtroCCId) list = list.filter(p => p.centro_costo?.id === filtroCCId)
    if (busqProd.trim()) {
      const q = busqProd.toLowerCase()
      list = list.filter(p =>
        p.nombre.toLowerCase().includes(q) ||
        (p.codigo_barras || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [productos, filtroCCId, busqProd])

  // ── Carrito ──
  function agregarAlCarrito(prod) {
    setCarrito(prev => {
      const idx = prev.findIndex(it => it.producto.id === prod.id)
      if (idx >= 0) return prev.map((it, i) => i === idx ? { ...it, cantidad: it.cantidad + 1 } : it)
      return [...prev, { _key: Math.random().toString(36).slice(2), producto: prod, cantidad: 1 }]
    })
    setBusqProd('')
    busqRef.current?.focus()
  }

  function quitarDelCarrito(key) {
    setCarrito(prev => prev.filter(it => it._key !== key))
  }

  function cambiarCantidad(key, delta) {
    setCarrito(prev => prev.map(it =>
      it._key !== key ? it : { ...it, cantidad: Math.max(1, it.cantidad + delta) }
    ))
  }

  // ── Cliente ──
  function onBusqClienteChange(q) {
    setBusqCliente(q)
    setClienteSeleccionado(null)
    clearTimeout(busqClienteTimer.current)
    if (!q.trim()) { setClienteResultados([]); return }
    busqClienteTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, apellido, cuit')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,cuit.ilike.%${q}%`)
        .limit(5)
      setClienteResultados(data || [])
      setDropClienteAbierto(true)
    }, 280)
  }

  function seleccionarCliente(c) {
    setClienteSeleccionado(c)
    setBusqCliente(`${c.nombre} ${c.apellido || ''}`.trim())
    setClienteResultados([])
    setDropClienteAbierto(false)
  }

  // ── Pagos ──
  function actualizarPago(idx, campo, valor) {
    setPagos(prev => prev.map((p, i) => i !== idx ? p : { ...p, [campo]: valor }))
  }

  function agregarSegundoPago() {
    if (pagos.length >= 2) return
    const total = totales.total
    const m1 = Math.round(total / 2)
    const m2 = total - m1
    setPagos(prev => [
      { ...prev[0], monto: String(m1) },
      { _key: Math.random().toString(36).slice(2), medio_pago: 'tarjeta_debito', monto: String(m2) },
    ])
  }

  function quitarPago(idx) {
    setPagos(prev => {
      const nuevo = prev.filter((_, i) => i !== idx)
      return nuevo.length === 0 ? [{ _key: '1', medio_pago: 'efectivo', monto: '' }] : nuevo
    })
  }

  // ── Totales ──
  const totales = useMemo(() => {
    const hayEfectivo = pagos.some(p => p.medio_pago === 'efectivo')
    const descPct     = hayEfectivo && descuentoEfectivoPct > 0 ? descuentoEfectivoPct : 0

    let subtotalNeto = 0, iva21 = 0, iva105 = 0
    carrito.forEach(it => {
      const base = Number(it.producto.precio_venta) * it.cantidad
      const pct  = Number(it.producto.iva_porcentaje)
      subtotalNeto += base
      if (pct === 21)   iva21  += base * 0.21
      if (pct === 10.5) iva105 += base * 0.105
    })

    const descMonto    = +(subtotalNeto * descPct / 100).toFixed(2)
    const total        = +(subtotalNeto + iva21 + iva105 - descMonto).toFixed(2)
    const totalPagos   = +pagos.reduce((s, p) => s + Number(p.monto || 0), 0).toFixed(2)
    const pagoCompleto = carrito.length > 0 && Math.abs(totalPagos - total) < 0.01

    return {
      subtotalNeto: +subtotalNeto.toFixed(2),
      iva21:        +iva21.toFixed(2),
      iva105:       +iva105.toFixed(2),
      descPct, descMonto, total, totalPagos, pagoCompleto,
    }
  }, [carrito, pagos, descuentoEfectivoPct])

  // ── CCs en carrito (para aviso 2 comprobantes) ──
  const ccDelCarrito = useMemo(() => {
    const map = new Map()
    carrito.forEach(it => {
      const cc = it.producto.centro_costo
      if (!cc) return
      if (!map.has(cc.id)) map.set(cc.id, { cc, monto: 0 })
      const base = Number(it.producto.precio_venta) * it.cantidad
      const iva  = base * (Number(it.producto.iva_porcentaje) / 100)
      map.get(cc.id).monto += base + iva
    })
    return [...map.values()]
  }, [carrito])

  // ── Reset POS ──
  function resetPos() {
    setCarrito([])
    setComprobante(comprobantesDisponibles[0])
    setBusqCliente('')
    setClienteSeleccionado(null)
    setClienteResultados([])
    setPagos([{ _key: '1', medio_pago: 'efectivo', monto: '' }])
    setError('')
    setBusqProd('')
    setFiltroCCId(null)
  }

  // ── Cobrar ──
  async function handleCobrar() {
    if (!totales.pagoCompleto) return
    setSaving(true); setError('')

    const itemsVenta = carrito.map(it => ({
      producto_id:     it.producto.id,
      descripcion:     it.producto.nombre,
      cantidad:        it.cantidad,
      precio_unitario: Number(it.producto.precio_venta),
      descuento_pct:   0,
      iva_porcentaje:  Number(it.producto.iva_porcentaje) || 0,
      subtotal:        Number(it.producto.precio_venta) * it.cantidad,
    }))

    const datosVenta = {
      cliente_id:      clienteSeleccionado?.id || null,
      canal:           'mostrador',
      estado:          'completada',
      subtotal:        totales.subtotalNeto,
      descuento_monto: totales.descMonto,
      recargo_monto:   0,
      iva_monto:       totales.iva21 + totales.iva105,
      total:           totales.total,
    }

    const pagosVenta = pagos
      .filter(p => Number(p.monto) > 0)
      .map(p => ({ medio_pago: p.medio_pago, monto: Number(p.monto) }))

    const res = await crear(datosVenta, itemsVenta, pagosVenta)
    setSaving(false)
    if (res.error) setError(res.error.message || 'Error al guardar.')
    else { resetPos(); setVista('lista') }
  }

  // ── Lista filtrada ──
  const ventasFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase()
    return ventas.filter(v => {
      if (filtroEstado && v.estado !== filtroEstado) return false
      if (!q) return true
      const cli = v.cliente ? `${v.cliente.nombre} ${v.cliente.apellido || ''}` : ''
      return cli.toLowerCase().includes(q) || (v.numero || '').toLowerCase().includes(q)
    })
  }, [ventas, busqueda, filtroEstado])

  // ════════════════════════════════════════════════════════
  // VISTA POS
  // ════════════════════════════════════════════════════════
  if (vista === 'pos') {
    return (
      <div className="pos-root">

        {/* ── Columna izquierda 70% ── */}
        <div className="pos-left">

          <div className="pos-left-header">
            <button className="btn" onClick={() => { resetPos(); setVista('lista') }}>
              <i className="ti ti-arrow-left" /> Volver
            </button>
            <h1 className="page-title">Nueva venta</h1>
          </div>

          {/* Buscador + pills CC */}
          <div className="pos-catalog-bar">
            <div className="search-box pos-busq">
              <i className="ti ti-search" />
              <input
                ref={busqRef}
                autoFocus
                placeholder="Buscar o escanear código..."
                value={busqProd}
                onChange={e => setBusqProd(e.target.value)}
              />
              {busqProd && (
                <button type="button" className="search-clear" onClick={() => { setBusqProd(''); busqRef.current?.focus() }}>
                  <i className="ti ti-x" />
                </button>
              )}
            </div>
            <div className="pills">
              <button
                type="button"
                className={`pill${filtroCCId === null ? ' pill--active' : ''}`}
                onClick={() => setFiltroCCId(null)}
              >
                Todos
              </button>
              {centrosCostos.map(cc => (
                <button
                  key={cc.id}
                  type="button"
                  className={`pill${filtroCCId === cc.id ? ' pill--active' : ''}`}
                  onClick={() => setFiltroCCId(filtroCCId === cc.id ? null : cc.id)}
                  style={filtroCCId === cc.id ? { borderColor: cc.color, color: cc.color } : {}}
                >
                  {cc.nombre}
                </button>
              ))}
            </div>
          </div>

          {/* Grilla de productos */}
          <div className="pos-grid">
            {cargandoProds ? (
              <div className="pos-grid-placeholder">
                <i className="ti ti-loader-2" /> Cargando productos...
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="pos-grid-placeholder">
                <i className="ti ti-package-off" /> Sin resultados
              </div>
            ) : (
              productosFiltrados.map(prod => {
                const stockBajo = prod.controla_stock && Number(prod.stock_actual) < Number(prod.stock_minimo)
                const esPromo   = Number(prod.precio_mayorista) > 0 && Number(prod.precio_mayorista) < Number(prod.precio_venta)
                return (
                  <button
                    key={prod.id}
                    type="button"
                    className={`prod-card${stockBajo ? ' prod-card--stock-bajo' : ''}`}
                    onClick={() => agregarAlCarrito(prod)}
                  >
                    <div className="prod-card-badges">
                      {prod.centro_costo && (
                        <span
                          className="badge-cc"
                          style={{ background: prod.centro_costo.color + '22', color: prod.centro_costo.color, borderColor: prod.centro_costo.color + '55' }}
                        >
                          {prod.centro_costo.nombre}
                        </span>
                      )}
                      {esPromo && <span className="badge-promo">PROMO</span>}
                    </div>
                    <div className="prod-card-nombre">{prod.nombre}</div>
                    {prod.categoria && <div className="prod-card-cat">{prod.categoria.nombre}</div>}
                    <div className="prod-card-footer">
                      <div className="prod-card-precios">
                        {esPromo && <span className="prod-card-precio-old">{fmt$(prod.precio_venta)}</span>}
                        <span className="prod-card-precio">{fmt$(esPromo ? prod.precio_mayorista : prod.precio_venta)}</span>
                      </div>
                      {prod.controla_stock && (
                        <span className={`prod-card-stock${stockBajo ? ' prod-card-stock--bajo' : ''}`}>
                          {prod.stock_actual} {prod.unidad_medida || 'u.'}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Carrito */}
          {carrito.length > 0 && (
            <div className="pos-carrito">
              <p className="pos-carrito-title">
                <i className="ti ti-shopping-cart" /> Carrito &mdash; {carrito.length} {carrito.length === 1 ? 'ítem' : 'ítems'}
              </p>
              <div className="pos-carrito-list">
                {carrito.map(it => (
                  <div key={it._key} className="carrito-item">
                    <div className="carrito-item-info">
                      {it.producto.centro_costo && (
                        <span
                          className="badge-cc badge-cc--sm"
                          style={{ background: it.producto.centro_costo.color + '22', color: it.producto.centro_costo.color, borderColor: it.producto.centro_costo.color + '55' }}
                        >
                          {it.producto.centro_costo.nombre}
                        </span>
                      )}
                      <span className="carrito-item-nombre">{it.producto.nombre}</span>
                    </div>
                    <div className="carrito-item-controles">
                      <div className="qty-control">
                        <button type="button" className="qty-btn" onClick={() => cambiarCantidad(it._key, -1)}>
                          <i className="ti ti-minus" />
                        </button>
                        <span className="qty-val">{it.cantidad}</span>
                        <button type="button" className="qty-btn" onClick={() => cambiarCantidad(it._key, 1)}>
                          <i className="ti ti-plus" />
                        </button>
                      </div>
                      <span className="carrito-item-unitario">{fmt$(it.producto.precio_venta)}</span>
                      <span className="carrito-item-sub">{fmt$(Number(it.producto.precio_venta) * it.cantidad)}</span>
                      <button type="button" className="btn-icon btn-icon--danger" onClick={() => quitarDelCarrito(it._key)}>
                        <i className="ti ti-x" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Columna derecha 30% — Panel de cobro ── */}
        <div className="pos-right">
          {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}

          {/* Comprobante */}
          <div className="panel-section">
            <p className="panel-section-title">Comprobante</p>
            {comprobantesDisponibles.length === 1 ? (
              <span className="badge badge--neutral" style={{ alignSelf: 'flex-start' }}>
                <i className="ti ti-file-invoice" /> Factura {comprobantesDisponibles[0]}
              </span>
            ) : (
              <div className="pills">
                {comprobantesDisponibles.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`pill${comprobante === c ? ' pill--active' : ''}`}
                    onClick={() => setComprobante(c)}
                  >
                    Factura {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cliente */}
          <div className="panel-section">
            <p className="panel-section-title">Cliente</p>
            {clienteSeleccionado ? (
              <div className="cliente-selected">
                <i className="ti ti-user" />
                <span>{`${clienteSeleccionado.nombre} ${clienteSeleccionado.apellido || ''}`.trim()}</span>
                <button type="button" className="btn-icon" onClick={() => { setClienteSeleccionado(null); setBusqCliente('') }}>
                  <i className="ti ti-x" />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input
                  className="field-input"
                  placeholder="Nombre o CUIT..."
                  value={busqCliente}
                  onChange={e => onBusqClienteChange(e.target.value)}
                  onFocus={() => clienteResultados.length > 0 && setDropClienteAbierto(true)}
                  onBlur={() => setTimeout(() => setDropClienteAbierto(false), 150)}
                />
                {dropClienteAbierto && clienteResultados.length > 0 && (
                  <div className="prod-dropdown">
                    {clienteResultados.map(c => (
                      <button key={c.id} type="button" className="prod-dropdown-item" onMouseDown={() => seleccionarCliente(c)}>
                        <span className="prod-dd-nombre">{c.nombre} {c.apellido || ''}</span>
                        {c.cuit && <span className="prod-dd-precio">{c.cuit}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Medios de pago */}
          <div className="panel-section">
            <p className="panel-section-title">Medios de pago</p>
            {pagos.map((p, idx) => (
              <div key={p._key} className={`pago-row${pagos.length === 1 ? ' pago-row--single' : ''}`}>
                <select
                  className="field-select"
                  value={p.medio_pago}
                  onChange={e => actualizarPago(idx, 'medio_pago', e.target.value)}
                >
                  {MEDIOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input
                  className="field-input"
                  type="number" min="0" step="0.01"
                  placeholder="Monto"
                  value={p.monto}
                  onChange={e => actualizarPago(idx, 'monto', e.target.value)}
                />
                {pagos.length > 1 && (
                  <button type="button" className="btn-icon btn-icon--danger" onClick={() => quitarPago(idx)}>
                    <i className="ti ti-x" />
                  </button>
                )}
              </div>
            ))}
            {pagos.length < 2 && carrito.length > 0 && (
              <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={agregarSegundoPago}>
                <i className="ti ti-plus" /> Segundo medio
              </button>
            )}
            {descuentoEfectivoPct > 0 && pagos.some(p => p.medio_pago === 'efectivo') && (
              <span className="badge badge--warning" style={{ alignSelf: 'flex-start' }}>
                <i className="ti ti-tag" /> Descuento efectivo {descuentoEfectivoPct}%
              </span>
            )}
          </div>

          {/* Totales */}
          <div className="pos-totales-panel">
            <div className="total-row"><span>Subtotal neto</span><span>{fmt$(totales.subtotalNeto)}</span></div>
            {totales.iva21 > 0 && (
              <div className="total-row"><span>IVA 21%</span><span>{fmt$(totales.iva21)}</span></div>
            )}
            {totales.iva105 > 0 && (
              <div className="total-row"><span>IVA 10.5%</span><span>{fmt$(totales.iva105)}</span></div>
            )}
            {totales.descMonto > 0 && (
              <div className="total-row total-row--desc">
                <span>Descuento {totales.descPct}%</span>
                <span>−{fmt$(totales.descMonto)}</span>
              </div>
            )}
            <div className="total-row total-row--total">
              <span>Total</span>
              <span>{fmt$(totales.total)}</span>
            </div>
          </div>

          {/* Aviso 2 comprobantes ARCA */}
          {ccDelCarrito.length >= 2 && (
            <div className="aviso-2cc">
              <i className="ti ti-alert-triangle" />
              <div>
                <p>Se emitirán 2 comprobantes ARCA</p>
                {ccDelCarrito.map(({ cc, monto }) => (
                  <p key={cc.id} className="aviso-2cc-detalle">
                    <span
                      className="badge-cc badge-cc--sm"
                      style={{ background: cc.color + '22', color: cc.color, borderColor: cc.color + '55' }}
                    >
                      {cc.nombre}
                    </span>
                    {fmt$(monto)}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Botón Cobrar */}
          <button
            type="button"
            className="btn btn--primary pos-btn-cobrar"
            onClick={handleCobrar}
            disabled={saving || !totales.pagoCompleto}
          >
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-cash'}`} />
            {saving ? 'Procesando...' : carrito.length === 0 ? 'Cobrar' : `Cobrar ${fmt$(totales.total)}`}
          </button>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  // VISTA LISTA
  // ════════════════════════════════════════════════════════
  return (
    <div className="ventas-page">
      <div className="page-header">
        <h1 className="page-title">Ventas</h1>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <i className="ti ti-search" />
            <input
              placeholder="Buscar cliente, número..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <div className="pills">
            <button className={`pill${!filtroEstado ? ' pill--active' : ''}`} onClick={() => setFiltroEstado(null)}>Todas</button>
            <button className={`pill${filtroEstado === 'completada' ? ' pill--active' : ''}`} onClick={() => setFiltroEstado('completada')}>Completadas</button>
            <button className={`pill${filtroEstado === 'anulada' ? ' pill--active' : ''}`} onClick={() => setFiltroEstado('anulada')}>Anuladas</button>
          </div>
        </div>
        <button className="btn btn--primary" onClick={() => setVista('pos')}>
          <i className="ti ti-plus" /> Nueva venta
        </button>
      </div>

      <div className="table-wrap">
        {loadingVentas ? (
          <div className="table-loading">
            <i className="ti ti-loader-2" style={{ fontSize: 28, opacity: 0.4 }} /> Cargando ventas...
          </div>
        ) : ventasFiltradas.length === 0 ? (
          <div className="table-empty">
            <i className="ti ti-shopping-bag" />
            <span>{busqueda || filtroEstado ? 'Sin resultados' : 'No hay ventas registradas.'}</span>
            {!busqueda && !filtroEstado && (
              <button className="btn btn--primary" onClick={() => setVista('pos')}>
                <i className="ti ti-plus" /> Nueva venta
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha / hora</th>
                <th>N°</th>
                <th>Cliente</th>
                <th>Medios de pago</th>
                <th className="td-right">Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.map(v => (
                <tr key={v.id}>
                  <td className="td-muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtFechaHora(v.fecha)}</td>
                  <td className="td-mono td-muted">{v.numero || '—'}</td>
                  <td className="venta-cliente">
                    {v.cliente ? `${v.cliente.nombre} ${v.cliente.apellido || ''}`.trim() : 'Cons. final'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {(v.pagos || []).map((p, i) => (
                        <span key={i} className="badge badge--neutral" style={{ fontSize: 10 }}>
                          {p.medio_pago.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="td-right" style={{ fontWeight: 500 }}>{fmt$(v.total)}</td>
                  <td><span className={`badge ${ESTADO_BADGE[v.estado] || 'badge--neutral'}`}>{v.estado}</span></td>
                  <td className="td-actions" onClick={e => e.stopPropagation()}>
                    {v.estado === 'completada' && (
                      <button className="btn-icon btn-icon--danger" title="Anular" onClick={() => anular(v.id)}>
                        <i className="ti ti-ban" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
