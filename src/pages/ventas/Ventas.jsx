import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useVentas } from '../../hooks/useVentas'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import './Ventas.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

const fmtFechaHora = str => {
  if (!str) return '—'
  const d = new Date(str)
  return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function comprobantesSegunFiscal(condicion) {
  if (condicion === 'Monotributista' || condicion === 'Exento') return ['C', 'R']
  if (condicion === 'Responsable Inscripto') return ['A', 'B', 'R']
  return ['B', 'R']
}

const COMP_LABEL = { A: 'Factura A', B: 'Factura B', C: 'Factura C', R: 'Remito' }
const COMP_ICON  = { A: 'ti-file-invoice', B: 'ti-file-invoice', C: 'ti-file-invoice', R: 'ti-truck-delivery' }

const MEDIOS_PAGO = [
  { value: 'efectivo',         label: 'Efectivo',       icon: 'ti-cash'            },
  { value: 'tarjeta_debito',   label: 'Débito',         icon: 'ti-credit-card'     },
  { value: 'tarjeta_credito',  label: 'Crédito',        icon: 'ti-credit-card'     },
  { value: 'transferencia',    label: 'Transferencia',  icon: 'ti-building-bank'   },
  { value: 'mercado_pago',     label: 'Mercado Pago',   icon: 'ti-currency-dollar' },
  { value: 'cuenta_corriente', label: 'Cta. Cte.',      icon: 'ti-notebook'        },
]

const ESTADO_BADGE = { completada: 'badge--success', anulada: 'badge--danger', pendiente: 'badge--warning' }

export default function Ventas() {
  const { perfil } = useAuth()
  const comercioId            = perfil?.comercio?.id
  const descuentoEfectivoPct  = Number(perfil?.comercio?.descuento_efectivo_pct || 0)
  const comprobantesDisponibles = comprobantesSegunFiscal(perfil?.comercio?.condicion_iva)

  const { ventas, loading: loadingVentas, crear, anular } = useVentas(comercioId, perfil?.id)

  const [vista, setVista] = useState('lista')

  /* ── Catálogo ── */
  const [productos,     setProductos]     = useState([])
  const [clientes,      setClientes]      = useState([])
  const [cargandoProds, setCargandoProds] = useState(false)

  /* ── Buscador POS ── */
  const [busqProd,     setBusqProd]     = useState('')
  const [showDrop,     setShowDrop]     = useState(false)
  const [noEncontrado, setNoEncontrado] = useState(false)
  const busqRef = useRef(null)
  const dropRef = useRef(null)

  /* ── Ítem libre ── */
  const [showItemLibre, setShowItemLibre] = useState(false)
  const [libreDesc,     setLibreDesc]     = useState('')
  const [librePrice,    setLibrePrice]    = useState('')
  const libreDescRef = useRef(null)

  /* ── Carrito ── */
  const [carrito, setCarrito] = useState([])

  /* ── Panel de cobro ── */
  const [comprobante,         setComprobante]         = useState('B')
  const [busqCliente,         setBusqCliente]         = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [dropClienteAbierto,  setDropClienteAbierto]  = useState(false)
  const clienteInputRef = useRef(null)
  const [pagos,  setPagos]  = useState([{ _key: '1', medio_pago: 'efectivo', monto: '' }])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  /* ── Filtros lista ── */
  const [busqueda,     setBusqueda]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState(null)

  /* Sincronizar comprobante con condicion_iva */
  useEffect(() => {
    const opts = comprobantesSegunFiscal(perfil?.comercio?.condicion_iva)
    setComprobante(prev => opts.includes(prev) ? prev : opts[0])
  }, [perfil?.comercio?.condicion_iva])

  /* Cargar catálogo al abrir POS */
  useEffect(() => {
    if (!comercioId || vista !== 'pos') return
    cargarCatalogo()
  }, [comercioId, vista])

  async function cargarCatalogo() {
    setCargandoProds(true)
    const [resProds, resClis] = await Promise.all([
      supabase
        .from('productos')
        .select('id, nombre, codigo_barras, precio_venta, precio_mayorista, iva_porcentaje, stock_actual, stock_minimo, unidad_medida, controla_stock, categoria:categorias(id, nombre), centro_costo:centros_costos(id, nombre, color)')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('clientes')
        .select('id, nombre, apellido, cuit')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),
    ])
    if (resClis.error) console.error('Error cargando clientes:', resClis.error)
    setProductos(resProds.data || [])
    setClientes(resClis.data || [])
    setCargandoProds(false)
    setTimeout(() => busqRef.current?.focus(), 100)
  }

  /* ── Dropdown de búsqueda (máx 6) ── */
  const dropdownResultados = useMemo(() => {
    const q = busqProd.trim().toLowerCase()
    if (!q) return []
    return productos
      .filter(p =>
        p.nombre.toLowerCase().includes(q) ||
        (p.codigo_barras || '').toLowerCase().includes(q)
      )
      .slice(0, 6)
  }, [productos, busqProd])

  /* Cerrar dropdown al hacer clic afuera */
  useEffect(() => {
    function onClickOut(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [])

  /* ── Handlers del buscador ── */
  function onBusqChange(e) {
    const v = e.target.value
    setBusqProd(v)
    setNoEncontrado(false)
    setShowDrop(v.trim().length > 0)
  }

  function handleBusqKeyDown(e) {
    if (e.key === 'Escape') {
      setBusqProd(''); setShowDrop(false); setNoEncontrado(false)
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = busqProd.trim()
    if (!q) return

    // Prioridad 1: código de barras exacto
    const exacto = productos.find(p => p.codigo_barras === q)
    if (exacto) { agregarAlCarrito(exacto); return }

    // Prioridad 2: primer resultado del dropdown
    if (dropdownResultados.length > 0) {
      agregarAlCarrito(dropdownResultados[0])
    } else {
      setNoEncontrado(true)
      setShowDrop(false)
    }
  }

  /* ── Ítem libre ── */
  function abrirItemLibre() {
    setShowItemLibre(true)
    setTimeout(() => libreDescRef.current?.focus(), 60)
  }

  function agregarItemLibre(e) {
    e?.preventDefault()
    const desc  = libreDesc.trim()
    const price = parseFloat(librePrice.replace(',', '.'))
    if (!desc || isNaN(price) || price <= 0) return
    setCarrito(prev => [
      ...prev,
      { _key: Math.random().toString(36).slice(2), esLibre: true, descripcion: desc, precioFinal: price, cantidad: 1 },
    ])
    setLibreDesc(''); setLibrePrice(''); setShowItemLibre(false)
    setTimeout(() => busqRef.current?.focus(), 0)
  }

  function cancelarItemLibre() {
    setLibreDesc(''); setLibrePrice(''); setShowItemLibre(false)
    setTimeout(() => busqRef.current?.focus(), 0)
  }

  /* ── Carrito ── */
  const agregarAlCarrito = useCallback((prod) => {
    const esPromo     = Number(prod.precio_mayorista) > 0 && Number(prod.precio_mayorista) < Number(prod.precio_venta)
    const precioFinal = esPromo ? Number(prod.precio_mayorista) : Number(prod.precio_venta)

    setCarrito(prev => {
      const idx = prev.findIndex(it => it.producto.id === prod.id)
      if (idx >= 0) return prev.map((it, i) => i === idx ? { ...it, cantidad: it.cantidad + 1 } : it)
      return [...prev, { _key: Math.random().toString(36).slice(2), producto: prod, cantidad: 1, precioFinal, esPromo }]
    })
    setBusqProd('')
    setShowDrop(false)
    setNoEncontrado(false)
    setTimeout(() => busqRef.current?.focus(), 0)
  }, [])

  function quitarDelCarrito(key) {
    setCarrito(prev => prev.filter(it => it._key !== key))
  }

  function cambiarCantidad(key, delta) {
    setCarrito(prev => prev.map(it =>
      it._key !== key ? it : { ...it, cantidad: Math.max(1, it.cantidad + delta) }
    ))
  }

  /* ── Carrito agrupado por CC ── */
  const carritoAgrupado = useMemo(() => {
    const map = new Map()
    carrito.forEach(it => {
      const ccId = it.producto.centro_costo?.id ?? '__sin_cc__'
      if (!map.has(ccId)) map.set(ccId, { cc: it.producto.centro_costo || null, items: [] })
      map.get(ccId).items.push(it)
    })
    return [...map.values()]
  }, [carrito])

  /* ── Cliente — filtrado client-side ── */
  const clientesFiltrados = useMemo(() => {
    const q = busqCliente.trim().toLowerCase()
    if (!q) return clientes.slice(0, 8)   // muestra los primeros 8 al abrir
    return clientes
      .filter(c =>
        `${c.nombre} ${c.apellido || ''}`.toLowerCase().includes(q) ||
        (c.cuit || '').includes(q)
      )
      .slice(0, 8)
  }, [clientes, busqCliente])

  function onBusqClienteChange(q) {
    setBusqCliente(q)
    setClienteSeleccionado(null)
    setDropClienteAbierto(true)
  }

  function seleccionarCliente(c) {
    if (!c) {
      // Consumidor Final
      setClienteSeleccionado(null)
      setBusqCliente('')
      setDropClienteAbierto(false)
      return
    }
    setClienteSeleccionado(c)
    setBusqCliente(`${c.nombre} ${c.apellido || ''}`.trim())
    setDropClienteAbierto(false)
  }

  /* ── Pagos ── */
  function actualizarPago(idx, campo, valor) {
    setPagos(prev => prev.map((p, i) => i !== idx ? p : { ...p, [campo]: valor }))
  }

  function agregarSegundoPago() {
    if (pagos.length >= 2) return
    const ya    = Number(pagos[0].monto || 0)
    const resto = Math.max(0, +(totales.total - ya).toFixed(2))
    setPagos(prev => [
      prev[0],
      { _key: Math.random().toString(36).slice(2), medio_pago: 'tarjeta_debito', monto: resto > 0 ? String(resto) : '' },
    ])
  }

  function quitarPago(idx) {
    setPagos(prev => {
      const nuevo = prev.filter((_, i) => i !== idx)
      return nuevo.length === 0 ? [{ _key: '1', medio_pago: 'efectivo', monto: '' }] : nuevo
    })
  }

  /* ── Totales ──
     precio_venta ya viene CON IVA incluido → extraemos el IVA del precio
     en lugar de sumarlo encima                                            */
  const totales = useMemo(() => {
    const hayEfectivo = pagos.some(p => p.medio_pago === 'efectivo')
    const descPct     = hayEfectivo && descuentoEfectivoPct > 0 ? descuentoEfectivoPct : 0

    let totalBruto = 0, iva21 = 0, iva105 = 0
    carrito.forEach(it => {
      const bruto = it.precioFinal * it.cantidad           // precio con IVA × cantidad
      const pct   = it.esLibre ? 0 : Number(it.producto.iva_porcentaje)
      totalBruto += bruto
      // Extraer IVA contenido en el precio: IVA = bruto - bruto / (1 + pct/100)
      if (pct === 21)   iva21  += bruto - bruto / 1.21
      if (pct === 10.5) iva105 += bruto - bruto / 1.105
    })

    const subtotalNeto = +(totalBruto - iva21 - iva105).toFixed(2)
    const descMonto    = +(totalBruto * descPct / 100).toFixed(2)
    const total        = +(totalBruto - descMonto).toFixed(2)
    const totalPagos   = +pagos.reduce((s, p) => s + Number(p.monto || 0), 0).toFixed(2)
    const diferencia   = +(totalPagos - total).toFixed(2)
    const pagoCompleto = carrito.length > 0 && Math.abs(diferencia) < 0.01

    return { subtotalNeto, iva21: +iva21.toFixed(2), iva105: +iva105.toFixed(2), descPct, descMonto, total, totalPagos, diferencia, pagoCompleto }
  }, [carrito, pagos, descuentoEfectivoPct])

  /* ── CCs en carrito (aviso 2 comprobantes) ── */
  const ccDelCarrito = useMemo(() => {
    const map = new Map()
    carrito.forEach(it => {
      if (it.esLibre) return
      const cc = it.producto.centro_costo
      if (!cc) return
      if (!map.has(cc.id)) map.set(cc.id, { cc, monto: 0 })
      // precioFinal ya incluye IVA → sumar directo sin recalcular
      map.get(cc.id).monto += it.precioFinal * it.cantidad
    })
    return [...map.values()]
  }, [carrito])

  /* ── Reset POS ── */
  function resetPos() {
    setCarrito([])
    setComprobante(comprobantesDisponibles[0])
    setBusqCliente(''); setClienteSeleccionado(null); setDropClienteAbierto(false)
    setPagos([{ _key: '1', medio_pago: 'efectivo', monto: '' }])
    setError(''); setBusqProd('')
    setNoEncontrado(false); setShowDrop(false)
    setShowItemLibre(false); setLibreDesc(''); setLibrePrice('')
  }

  /* ── Cobrar ── */
  async function handleCobrar() {
    if (!totales.pagoCompleto) return
    setSaving(true); setError('')

    const itemsVenta = carrito.map(it => it.esLibre
      ? {
          producto_id: null, descripcion: it.descripcion,
          cantidad: it.cantidad, precio_unitario: it.precioFinal,
          descuento_pct: 0, iva_porcentaje: 0,
          subtotal: it.precioFinal * it.cantidad,
        }
      : {
          producto_id: it.producto.id, descripcion: it.producto.nombre,
          cantidad: it.cantidad, precio_unitario: it.precioFinal,
          descuento_pct: 0, iva_porcentaje: Number(it.producto.iva_porcentaje) || 0,
          subtotal: it.precioFinal * it.cantidad,
        }
    )

    const res = await crear(
      {
        cliente_id:       clienteSeleccionado?.id || null,
        tipo_comprobante: comprobante,
        canal: 'mostrador', estado: 'completada',
        subtotal: totales.subtotalNeto, descuento_monto: totales.descMonto,
        recargo_monto: 0, iva_monto: totales.iva21 + totales.iva105, total: totales.total,
      },
      itemsVenta,
      pagos.filter(p => Number(p.monto) > 0).map(p => ({ medio_pago: p.medio_pago, monto: Number(p.monto) }))
    )
    setSaving(false)
    if (res.error) setError(res.error.message || 'Error al guardar.')
    else { resetPos(); setVista('lista') }
  }

  /* ── Exportar Excel ── */
  function exportarExcel() {
    const COMP = { A: 'Factura A', B: 'Factura B', C: 'Factura C', R: 'Remito' }

    const filas = ventasFiltradas.map(v => ({
      'Fecha':        fmtFechaHora(v.fecha),
      'Número':       v.numero || '',
      'Comprobante':  COMP[v.tipo_comprobante] || 'Factura B',
      'Cliente':      v.cliente
                        ? `${v.cliente.nombre} ${v.cliente.apellido || ''}`.trim()
                        : 'Consumidor final',
      'Medios de pago': (v.pagos || []).map(p => p.medio_pago.replace(/_/g, ' ')).join(' + '),
      'Total':        Number(v.total),
      'Estado':       v.estado,
    }))

    const ws = XLSX.utils.json_to_sheet(filas)

    // Ancho de columnas
    ws['!cols'] = [
      { wch: 18 }, // Fecha
      { wch: 14 }, // Número
      { wch: 12 }, // Comprobante
      { wch: 26 }, // Cliente
      { wch: 24 }, // Medios de pago
      { wch: 12 }, // Total
      { wch: 12 }, // Estado
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas')

    const fecha = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `ventas_${fecha}.xlsx`)
  }

  /* ── Lista filtrada ── */
  const ventasFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase()
    return ventas.filter(v => {
      if (filtroEstado && v.estado !== filtroEstado) return false
      if (!q) return true
      const cli = v.cliente ? `${v.cliente.nombre} ${v.cliente.apellido || ''}` : ''
      return cli.toLowerCase().includes(q) || (v.numero || '').toLowerCase().includes(q)
    })
  }, [ventas, busqueda, filtroEstado])

  /* ════════════════════════════════════════════════════════
     VISTA POS
  ════════════════════════════════════════════════════════ */
  if (vista === 'pos') {
    const hayEfectivo = pagos.some(p => p.medio_pago === 'efectivo')

    return (
      <div className="pos-root">

        {/* ════ COLUMNA IZQUIERDA 65% ════ */}
        <div className="pos-left">

          <div className="pos-left-header">
            <button className="btn" onClick={() => { resetPos(); setVista('lista') }}>
              <i className="ti ti-arrow-left" /> Volver
            </button>
            <h1 className="page-title">Nueva venta</h1>
          </div>

          {/* ── Buscador POS ── */}
          <div className="pos-search-wrap" ref={dropRef}>
            <div className={`pos-search-box${noEncontrado ? ' pos-search-box--error' : ''}`}>
              <i className={`ti ${cargandoProds ? 'ti-loader-2 pos-search-spin' : noEncontrado ? 'ti-alert-circle' : 'ti-barcode'}`} />
              <input
                ref={busqRef}
                autoFocus
                className="pos-search-input"
                placeholder="Buscar producto o escanear código de barras..."
                value={busqProd}
                onChange={onBusqChange}
                onKeyDown={handleBusqKeyDown}
                onFocus={() => busqProd.trim() && setShowDrop(true)}
                autoComplete="off"
              />
              {busqProd && (
                <button
                  type="button"
                  className="search-clear"
                  onClick={() => { setBusqProd(''); setShowDrop(false); setNoEncontrado(false); busqRef.current?.focus() }}
                >
                  <i className="ti ti-x" />
                </button>
              )}
            </div>

            {/* Mensaje "no encontrado" */}
            {noEncontrado && (
              <div className="pos-no-encontrado">
                <i className="ti ti-package-off" />
                Producto no encontrado — revisá el código o el nombre
              </div>
            )}

            {/* Dropdown de resultados */}
            {showDrop && dropdownResultados.length > 0 && (
              <div className="pos-dropdown">
                {dropdownResultados.map(prod => {
                  const esPromo = Number(prod.precio_mayorista) > 0 && Number(prod.precio_mayorista) < Number(prod.precio_venta)
                  const sinStock = prod.controla_stock && Number(prod.stock_actual) <= 0
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      className={`pos-dd-item${sinStock ? ' pos-dd-item--agotado' : ''}`}
                      onMouseDown={() => agregarAlCarrito(prod)}
                    >
                      <div className="pos-dd-main">
                        <span className="pos-dd-nombre">{prod.nombre}</span>
                        <div className="pos-dd-meta">
                          {prod.categoria && <span className="pos-dd-cat">{prod.categoria.nombre}</span>}
                          {prod.centro_costo && (
                            <span
                              className="badge-cc badge-cc--sm"
                              style={{ background: prod.centro_costo.color + '22', color: prod.centro_costo.color, borderColor: prod.centro_costo.color + '55' }}
                            >
                              {prod.centro_costo.nombre}
                            </span>
                          )}
                          {sinStock && <span className="pos-dd-agotado">Sin stock</span>}
                        </div>
                      </div>
                      <div className="pos-dd-right">
                        {esPromo && <span className="pos-dd-precio-old">{fmt$(prod.precio_venta)}</span>}
                        <span className={`pos-dd-precio${esPromo ? ' pos-dd-precio--promo' : ''}`}>
                          {fmt$(esPromo ? prod.precio_mayorista : prod.precio_venta)}
                        </span>
                        {prod.controla_stock && (
                          <span className={`pos-dd-stock${Number(prod.stock_actual) <= Number(prod.stock_minimo) ? ' pos-dd-stock--bajo' : ''}`}>
                            {prod.stock_actual} {prod.unidad_medida || 'u.'}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Form ítem libre */}
            {showItemLibre && (
              <form className="item-libre-form" onSubmit={agregarItemLibre}>
                <input
                  ref={libreDescRef}
                  className="field-input item-libre-desc"
                  placeholder="Descripción (ej: Servicio de entrega...)"
                  value={libreDesc}
                  onChange={e => setLibreDesc(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && cancelarItemLibre()}
                />
                <input
                  className="field-input item-libre-price"
                  type="number" min="0.01" step="0.01"
                  placeholder="Precio"
                  value={librePrice}
                  onChange={e => setLibrePrice(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && cancelarItemLibre()}
                />
                <button type="submit" className="btn btn--primary" disabled={!libreDesc.trim() || !librePrice}>
                  <i className="ti ti-plus" />
                </button>
                <button type="button" className="btn-icon" onClick={cancelarItemLibre}>
                  <i className="ti ti-x" />
                </button>
              </form>
            )}
          </div>

          {/* ── Carrito ── */}
          <div className="pos-carrito">
            {carrito.length === 0 ? (
              <div className="carrito-vacio">
                <i className="ti ti-scan" />
                <span>Escaneá o buscá un producto para empezar</span>
                <button type="button" className="btn carrito-vacio-btn" onClick={abrirItemLibre}>
                  <i className="ti ti-pencil-plus" /> Agregar ítem libre
                </button>
              </div>
            ) : (
              <>
                <div className="pos-carrito-title">
                  <i className="ti ti-shopping-cart" />
                  Carrito &mdash; {carrito.length} {carrito.length === 1 ? 'ítem' : 'ítems'}
                  <button type="button" className="btn-item-libre-inline" onClick={abrirItemLibre} title="Agregar ítem libre">
                    <i className="ti ti-pencil-plus" /> ítem libre
                  </button>
                </div>
                <div className="pos-carrito-list">
                  {carritoAgrupado.map((grupo, gIdx) => (
                    <div key={grupo.cc?.id ?? '__sin_cc__'}>
                      {/* Separador entre grupos CC */}
                      {carritoAgrupado.length > 1 && (
                        <div className="carrito-cc-sep">
                          {grupo.cc ? (
                            <>
                              <span
                                className="badge-cc"
                                style={{ background: grupo.cc.color + '22', color: grupo.cc.color, borderColor: grupo.cc.color + '55' }}
                              >
                                {grupo.cc.nombre}
                              </span>
                              <div className="carrito-cc-sep-line" />
                            </>
                          ) : (
                            <>
                              <span className="badge badge--neutral">Sin sección</span>
                              <div className="carrito-cc-sep-line" />
                            </>
                          )}
                        </div>
                      )}
                      {grupo.items.map(it => (
                        <div key={it._key} className={`carrito-item${it.esLibre ? ' carrito-item--libre' : ''}`}>
                          {it.esLibre ? (
                            /* ── Ítem libre ── */
                            <>
                              <span className="carrito-item-libre-badge">
                                <i className="ti ti-pencil" /> libre
                              </span>
                              <div className="carrito-item-info">
                                <span className="carrito-item-nombre">{it.descripcion}</span>
                              </div>
                            </>
                          ) : (
                            /* ── Producto normal ── */
                            <>
                              {carritoAgrupado.length === 1 && it.producto.centro_costo && (
                                <span
                                  className="badge-cc badge-cc--sm carrito-item-cc"
                                  style={{ background: it.producto.centro_costo.color + '22', color: it.producto.centro_costo.color, borderColor: it.producto.centro_costo.color + '55' }}
                                >
                                  {it.producto.centro_costo.nombre}
                                </span>
                              )}
                              <div className="carrito-item-info">
                                <span className="carrito-item-nombre">{it.producto.nombre}</span>
                                {it.esPromo && <span className="badge-promo">PROMO</span>}
                              </div>
                            </>
                          )}
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
                            <div className="carrito-item-precios">
                              {!it.esLibre && it.esPromo && (
                                <span className="carrito-item-precio-old">{fmt$(it.producto.precio_venta)}</span>
                              )}
                              <span className="carrito-item-unitario">{fmt$(it.precioFinal)}</span>
                            </div>
                            <span className="carrito-item-sub">{fmt$(it.precioFinal * it.cantidad)}</span>
                            <button type="button" className="btn-icon btn-icon--danger" onClick={() => quitarDelCarrito(it._key)}>
                              <i className="ti ti-x" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>

        {/* ════ COLUMNA DERECHA 35% — Panel de cobro ════ */}
        <div className="pos-right">
          {error && <div className="error-banner"><i className="ti ti-alert-circle" /> {error}</div>}

          {/* Comprobante */}
          <div className="panel-section">
            <p className="panel-section-title">Comprobante</p>
            <div className="comp-selector">
              {comprobantesDisponibles.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`comp-btn${comprobante === c ? ' comp-btn--active' : ''}${c === 'R' ? ' comp-btn--remito' : ''}`}
                  onClick={() => setComprobante(c)}
                >
                  <i className={`ti ${COMP_ICON[c]}`} />
                  <span>{COMP_LABEL[c]}</span>
                  {comprobante === c && <i className="ti ti-check comp-btn-check" />}
                </button>
              ))}
            </div>
          </div>

          {/* Cliente */}
          <div className="panel-section">
            <p className="panel-section-title">Cliente</p>
            <div className="cliente-wrap">
              {/* Chip "Consumidor Final" siempre visible como opción activa/inactiva */}
              <button
                type="button"
                className={`cliente-cf-chip${!clienteSeleccionado ? ' cliente-cf-chip--activo' : ''}`}
                onClick={() => seleccionarCliente(null)}
              >
                <i className="ti ti-user" /> Consumidor Final
              </button>

              {/* Buscador de cliente */}
              <div className="cliente-busq-wrap">
                {clienteSeleccionado ? (
                  <div className="cliente-selected">
                    <i className="ti ti-user-check" />
                    <span>{`${clienteSeleccionado.nombre} ${clienteSeleccionado.apellido || ''}`.trim()}</span>
                    {clienteSeleccionado.cuit && (
                      <span className="cliente-selected-cuit">{clienteSeleccionado.cuit}</span>
                    )}
                    <button type="button" className="btn-icon" onClick={() => seleccionarCliente(null)}>
                      <i className="ti ti-x" />
                    </button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={clienteInputRef}
                      className="field-input"
                      placeholder="Buscar cliente por nombre o CUIT..."
                      value={busqCliente}
                      onChange={e => onBusqClienteChange(e.target.value)}
                      onFocus={() => setDropClienteAbierto(true)}
                      onBlur={() => setTimeout(() => setDropClienteAbierto(false), 150)}
                      autoComplete="off"
                    />
                    {dropClienteAbierto && clientesFiltrados.length > 0 && (
                      <div className="prod-dropdown">
                        {clientesFiltrados.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            className="prod-dropdown-item"
                            onMouseDown={() => seleccionarCliente(c)}
                          >
                            <span className="prod-dd-nombre">
                              {c.nombre} {c.apellido || ''}
                            </span>
                            <span className="prod-dd-precio">{c.cuit || ''}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
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

            {/* Botón segundo medio — solo si hay total > 0 */}
            {pagos.length < 2 && totales.total > 0 && (
              <button type="button" className="btn pos-btn-add-pago" onClick={agregarSegundoPago}>
                <i className="ti ti-plus" /> Agregar segundo medio
              </button>
            )}

            {/* Badge descuento efectivo */}
            {descuentoEfectivoPct > 0 && hayEfectivo && (
              <div className="pos-badge-efectivo">
                <i className="ti ti-tag" />
                Descuento {descuentoEfectivoPct}% por efectivo
              </div>
            )}

            {/* Diferencia si no cuadra */}
            {carrito.length > 0 && totales.totalPagos > 0 && !totales.pagoCompleto && (
              <div className={`pos-diferencia${totales.diferencia > 0 ? ' pos-diferencia--sobre' : ' pos-diferencia--faltan'}`}>
                <i className={`ti ${totales.diferencia > 0 ? 'ti-arrow-up' : 'ti-arrow-down'}`} />
                {totales.diferencia > 0
                  ? `Sobran ${fmt$(Math.abs(totales.diferencia))}`
                  : `Faltan ${fmt$(Math.abs(totales.diferencia))}`
                }
              </div>
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
                <span><i className="ti ti-tag" /> Desc. efectivo {totales.descPct}%</span>
                <span>−{fmt$(totales.descMonto)}</span>
              </div>
            )}
            <div className="total-row total-row--total">
              <span>Total</span>
              <span>{fmt$(totales.total)}</span>
            </div>
          </div>

          {/* Aviso 2 comprobantes */}
          {ccDelCarrito.length >= 2 && (
            <div className="aviso-2cc">
              <i className="ti ti-files" />
              <div>
                <p>Se emitirán 2 comprobantes</p>
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

  /* ════════════════════════════════════════════════════════
     VISTA LISTA
  ════════════════════════════════════════════════════════ */
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            onClick={exportarExcel}
            disabled={ventasFiltradas.length === 0}
            title="Exportar a Excel"
          >
            <i className="ti ti-file-spreadsheet" /> Excel
          </button>
          <button className="btn btn--primary" onClick={() => setVista('pos')}>
            <i className="ti ti-plus" /> Nueva venta
          </button>
        </div>
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
                <th>Tipo</th>
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
                  <td>
                    {v.tipo_comprobante === 'R' ? (
                      <span className="badge-remito">
                        <i className="ti ti-truck-delivery" /> Remito
                      </span>
                    ) : (
                      <span className="badge badge--neutral" style={{ fontSize: 10 }}>
                        Fact. {v.tipo_comprobante || 'B'}
                      </span>
                    )}
                  </td>
                  <td className="venta-cliente">
                    {v.cliente ? `${v.cliente.nombre} ${v.cliente.apellido || ''}`.trim() : 'Consumidor final'}
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
