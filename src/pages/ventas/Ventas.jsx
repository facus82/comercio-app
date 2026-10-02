import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { useVentas } from '../../hooks/useVentas'
import { supabase } from '../../lib/supabase'
import { SkeletonTableBody } from '../../components/shared/Skeleton'
import { cargarDeudas, resumirPorCliente, sumarDias, hoyISO } from '../../hooks/useCuentasCobrar'
import ClientePanel from '../clientes/ClientePanel'
import { ProductoThumb } from '../../components/shared/ImagenProducto'
import { SELECT_COMPONENTES, combosDisponibles } from '../../lib/combos'
import EscanerCodigo from '../../components/shared/EscanerCodigo'
import './Ventas.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: Number.isInteger(Number(v) || 0) ? 0 : 2, maximumFractionDigits: 2 }).format(v || 0)

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

const RECARGO_INICIAL = { activo: false, tipo: 'monto', valor: '', concepto: '' }  // tipo: monto | pct

const ESTADO_BADGE = { completada: 'badge--success', anulada: 'badge--danger', pendiente: 'badge--warning' }

// Chequea si una promo aplica a un ítem del carrito
function promoMatchItem(promo, it) {
  if (it.esLibre) return false
  if (promo.aplica_a === 'todo') return true
  if (promo.aplica_a === 'categoria'    && promo.categoria_id    === it.producto.categoria_id)    return true
  if (promo.aplica_a === 'subcategoria' && promo.subcategoria_id === it.producto.subcategoria_id) return true
  if (promo.aplica_a === 'producto'     && promo.producto_id     === it.producto.id)              return true
  return false
}

// Calcula qué promociones se aplicaron y cuánto ahorró cada una
function calcularPromosAplicadas(carrito, pagos, promociones) {
  const hoy = new Date().toISOString().slice(0, 10)
  const vigentes = promociones.filter(p =>
    !(p.fecha_desde && p.fecha_desde > hoy) &&
    !(p.fecha_hasta && p.fecha_hasta < hoy)
  )
  const map = new Map() // promo.id -> { promo, descuento }

  carrito.forEach(it => {
    if (it.esLibre) return
    const bruto = it.precioFinal * it.cantidad
    const aplicables = vigentes.filter(p => promoMatchItem(p, it))

    let ahorroNxm = 0, ahorroQty = 0
    aplicables.forEach(p => {
      if (p.tipo === 'nxm') {
        let ahorro
        if (p.precio_final != null && it.cantidad >= p.cantidad_lleva) {
          ahorro = it.cantidad * Math.max(0, it.precioFinal - Number(p.precio_final))
        } else {
          ahorro = Math.floor(it.cantidad / p.cantidad_lleva) * it.precioFinal
        }
        if (ahorro <= 0) return
        ahorroNxm += ahorro
        const prev = map.get(p.id) || { promo: p, descuento: 0 }
        map.set(p.id, { ...prev, descuento: prev.descuento + ahorro })
      } else if (p.tipo === 'precio_qty' && p.cantidad_min >= 2) {
        const grupos = Math.floor(it.cantidad / p.cantidad_min)
        if (grupos < 1) return
        const ahorro = grupos * (p.cantidad_min * it.precioFinal - Number(p.precio_bundle))
        if (ahorro <= 0) return
        ahorroQty += ahorro
        const prev = map.get(p.id) || { promo: p, descuento: 0 }
        map.set(p.id, { ...prev, descuento: prev.descuento + ahorro })
      }
    })

    const pctPromos = aplicables.filter(p =>
      p.tipo === 'descuento_pct' &&
      (!p.medio_pago || pagos.some(pg => pg.medio_pago === p.medio_pago))
    )
    const base = bruto - ahorroNxm - ahorroQty
    pctPromos.forEach(p => {
      let ahorro
      if (p.precio_final != null) {
        ahorro = it.cantidad * Math.max(0, it.precioFinal - Number(p.precio_final))
      } else {
        ahorro = base * Number(p.descuento_pct) / 100
      }
      if (ahorro <= 0) return
      const prev = map.get(p.id) || { promo: p, descuento: 0 }
      map.set(p.id, { ...prev, descuento: prev.descuento + ahorro })
    })
  })

  return [...map.values()]
    .filter(({ descuento }) => descuento > 0.001)
    .map(({ promo, descuento }) => ({
      promo_id:       promo.id,
      promo_nombre:   promo.nombre,
      tipo:           promo.tipo,
      descuento_monto: +descuento.toFixed(2),
    }))
}

// modoCaja: POS a pantalla completa (ruta /pos) — queda abierto y encadena ventas
export default function Ventas({ modoCaja = false, onVentaRegistrada }) {
  const toast = useToast()
  const { perfil } = useAuth()
  const comercioId            = perfil?.comercio?.id
  const descuentoEfectivoPct  = Number(perfil?.comercio?.descuento_efectivo_pct || 0)
  const comprobantesDisponibles = comprobantesSegunFiscal(perfil?.comercio?.condicion_iva)

  // periodo: 'dia' usa fechaFiltro; '7' / '15' = últimos N días; 'mes' = mes en curso
  const [periodo,     setPeriodo]     = useState('dia')
  const [fechaFiltro, setFechaFiltro] = useState(hoyISO)
  const hoy = hoyISO()
  const [desde, hasta] =
    periodo === '7'   ? [sumarDias(-6), hoy] :
    periodo === '15'  ? [sumarDias(-14), hoy] :
    periodo === 'mes' ? [hoy.slice(0, 8) + '01', hoy] :
                        [fechaFiltro, fechaFiltro]
  const { ventas, loading: loadingVentas, crear, anular, devolver, cargarDetalle } = useVentas(comercioId, perfil?.id, desde, hasta)

  const [vista, setVista] = useState(modoCaja ? 'pos' : 'lista')

  /* ── Catálogo ── */
  const [productos,     setProductos]     = useState([])
  const productoPorId = useMemo(() => Object.fromEntries(productos.map(p => [p.id, p])), [productos])
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
  const [vtoCC,  setVtoCC]  = useState({ modo: 'defecto', fecha: '' })   // modo: defecto | 7 | 14 | 30 | fecha
  const [deudaCliente, setDeudaCliente] = useState(null)                    // { saldo, vencido, diasAtraso }
  const [recargo, setRecargo] = useState(RECARGO_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  /* ── Promociones ── */
  const [promociones, setPromociones] = useState([])

  /* ── Filtros lista ── */
  const [busqueda,     setBusqueda]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState(null)

  /* ── Modal detalle ── */
  const [ventaDetalle,    setVentaDetalle]    = useState(null)
  const [loadingDetalle,  setLoadingDetalle]  = useState(false)

  async function abrirDetalle(v) {
    setLoadingDetalle(true)
    setVentaDetalle({ ...v, items: null, _loading: true })
    const { data, error } = await cargarDetalle(v.id)
    if (!error && data) setVentaDetalle(data)
    else setVentaDetalle(prev => ({ ...prev, _loading: false, _error: true }))
    setLoadingDetalle(false)
  }

  async function handleAnular(v) {
    if (Number(v.cc_pagado) > 0.009) {
      toast?.error(`No se puede anular: el cliente ya pagó ${fmt$(v.cc_pagado)} de esta venta a Cta. Cte. Si devuelve los productos, usá "Devolución" en el detalle de la venta.`, 8000)
      return false
    }
    if (Number(v.devuelto_monto) > 0.009) {
      toast?.error(`No se puede anular: la venta ya tiene una devolución de ${fmt$(v.devuelto_monto)}. Para el resto usá "Devolución" en el detalle de la venta.`, 8000)
      return false
    }
    if (!confirm(`¿Anular la venta ${v.numero} por ${fmt$(v.total)}? Los productos vuelven al stock.`)) return false
    const res = await anular(v.id)
    if (res.error) { toast?.error(res.error.message || 'No se pudo anular la venta.'); return false }
    aplicarMovidos(res.data.repuestos)
    toast?.success(`Venta ${v.numero} anulada`)
    return true
  }

  // Refleja en pantalla el stock que la base movió de verdad: [{ producto_id, cantidad con signo }]
  // (en un combo vienen sus componentes, no el combo)
  function aplicarMovidos(movidos = []) {
    const delta = new Map()
    movidos.forEach(m => delta.set(m.producto_id, (delta.get(m.producto_id) || 0) + Number(m.cantidad)))
    if (!delta.size) return
    setProductos(prev => prev.map(p => delta.has(p.id)
      ? { ...p, stock_actual: Number(p.stock_actual) + delta.get(p.id) } : p))
  }

  async function handleDevolver(v, items, opciones) {
    const res = await devolver(v.id, items, opciones)
    if (res.error) return res
    const d = res.data
    aplicarMovidos(d.movidos)
    const partes = []
    if (d.aplicado > 0.009)  partes.push(`${fmt$(d.aplicado)} descontado de la deuda`)
    if (d.reintegro > 0.009) partes.push(`${fmt$(d.reintegro)} a devolver al cliente${d.en_caja ? ' (retiro de caja)' : ''}`)
    toast?.success(`Devolución de ${fmt$(d.monto)} registrada${partes.length ? ' · ' + partes.join(' · ') : ''}`, 8000)
    await abrirDetalle(v)
    return res
  }

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
    const [resProds, resClis, resPromos] = await Promise.all([
      supabase
        .from('productos')
        .select(`id, nombre, codigo, codigo_barras, imagen_url, precio_venta, precio_mayorista, iva_porcentaje, stock_actual, stock_minimo, unidad_medida, controla_stock, es_combo, categoria_id, subcategoria_id, categoria:categorias(id, nombre), centro_costo:centros_costos(id, nombre, color), ${SELECT_COMPONENTES}`)
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('clientes')
        .select('id, nombre, apellido, razon_social, cuit, dni, telefono, plazo_dias, limite_credito')
        .eq('comercio_id', comercioId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('promociones')
        .select('*')
        .eq('comercio_id', comercioId)
        .eq('activo', true),
    ])
    if (resClis.error) console.error('Error cargando clientes:', resClis.error)
    setProductos(resProds.data || [])
    setClientes(resClis.data || [])
    setPromociones(resPromos.data || [])
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

  /* ── Escáner con cámara (celular sin lector) ── */
  const [showEscaner, setShowEscaner] = useState(false)

  // Devuelve { ok, texto } para que el escáner muestre el resultado de cada lectura
  function leerCodigoCamara(codigo) {
    const prod = productos.find(p => p.codigo_barras === codigo) || productos.find(p => p.codigo === codigo)
    if (!prod) return { ok: false, texto: `Código ${codigo} no encontrado` }
    agregarAlCarrito(prod, { enfocar: false })
    return { ok: true, texto: `Agregado: ${prod.nombre}` }
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
  // enfocar=false desde el escáner de cámara (no abrir el teclado del celular)
  const agregarAlCarrito = useCallback((prod, { enfocar = true } = {}) => {
    const esPromo     = Number(prod.precio_mayorista) > 0 && Number(prod.precio_mayorista) < Number(prod.precio_venta)
    const precioFinal = esPromo ? Number(prod.precio_mayorista) : Number(prod.precio_venta)

    setCarrito(prev => {
      const idx = prev.findIndex(it => it.producto?.id === prod.id)
      if (idx >= 0) return prev.map((it, i) => i === idx ? { ...it, cantidad: it.cantidad + 1 } : it)
      return [...prev, { _key: Math.random().toString(36).slice(2), producto: prod, cantidad: 1, precioFinal, esPromo }]
    })
    setBusqProd('')
    setShowDrop(false)
    setNoEncontrado(false)
    if (enfocar) setTimeout(() => busqRef.current?.focus(), 0)
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
      const ccId = it.producto?.centro_costo?.id ?? '__sin_cc__'
      if (!map.has(ccId)) map.set(ccId, { cc: it.producto?.centro_costo || null, items: [] })
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
        `${c.nombre} ${c.apellido || ''} ${c.razon_social || ''}`.toLowerCase().includes(q) ||
        (c.cuit || '').includes(q) ||
        (c.dni || '').includes(q)
      )
      .slice(0, 8)
  }, [clientes, busqCliente])

  /* ── Alta rápida de cliente desde el POS ── */
  const [nuevoCliente, setNuevoCliente] = useState(null)   // datos iniciales de la ficha, o null

  function abrirNuevoCliente() {
    // Precarga lo tipeado: números → DNI/CUIT, texto → nombre y apellido
    const q = busqCliente.trim()
    const digitos = q.replace(/\D/g, '')
    let inicial = {}
    if (q && digitos.length >= 7 && digitos.length === q.replace(/[\s.-]/g, '').length) {
      inicial = digitos.length === 11 ? { cuit: q } : { dni: digitos }
    } else if (q) {
      const [nombre, ...resto] = q.split(/\s+/)
      inicial = { nombre, apellido: resto.join(' ') }
    }
    if (hayCC) inicial.tipo = 'cuenta_corriente'
    setDropClienteAbierto(false)
    setNuevoCliente(inicial)
  }

  async function crearClienteDesdePos(datos) {
    const { data, error } = await supabase
      .from('clientes')
      .insert({ ...datos, comercio_id: comercioId })
      .select('id, nombre, apellido, razon_social, cuit, dni, telefono, plazo_dias, limite_credito')
      .single()
    if (error?.code === '23505') return { error: { message: 'Ya existe un cliente con ese DNI o CUIT. Buscalo en el listado.' } }
    if (error) return { error }
    setClientes(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    seleccionarCliente(data)
    toast?.success(`Cliente ${data.nombre}${data.apellido ? ` ${data.apellido}` : ''} creado`)
    return { data }
  }

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

  /* Deuda de Cta. Cte. del cliente seleccionado (para avisos) */
  useEffect(() => {
    if (!clienteSeleccionado || !comercioId) { setDeudaCliente(null); return }
    let cancelado = false
    cargarDeudas(comercioId, clienteSeleccionado.id).then(({ data }) => {
      if (cancelado) return
      const [r] = resumirPorCliente(data)
      setDeudaCliente(r || { saldo: 0, vencido: 0, diasAtraso: 0 })
    })
    return () => { cancelado = true }
  }, [clienteSeleccionado, comercioId])

  /* Cta. Cte.: monto y vencimiento de esta venta */
  const montoCC = pagos
    .filter(p => p.medio_pago === 'cuenta_corriente')
    .reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const hayCC        = pagos.some(p => p.medio_pago === 'cuenta_corriente')
  const plazoDefecto = Number(clienteSeleccionado?.plazo_dias) || 30
  const fechaVtoCC   = vtoCC.modo === 'fecha'
    ? vtoCC.fecha
    : sumarDias(vtoCC.modo === 'defecto' ? plazoDefecto : vtoCC.modo)
  const limiteCC     = Number(clienteSeleccionado?.limite_credito) || 0
  const superaLimite = limiteCC > 0 && deudaCliente && (deudaCliente.saldo + montoCC) > limiteCC + 0.009
  // Cta. Cte. requiere cliente y fecha de vencimiento válida (la deuda vencida sólo avisa, no bloquea)
  const bloqueoCC = hayCC && montoCC > 0 && (!clienteSeleccionado || !fechaVtoCC)

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

  /* ── Efectos de promociones por ítem (para display en carrito) ── */
  const efectosPromo = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10)
    const vigentes = promociones.filter(p =>
      !(p.fecha_desde && p.fecha_desde > hoy) &&
      !(p.fecha_hasta && p.fecha_hasta < hoy)
    )
    const map = new Map()
    carrito.forEach(it => {
      if (it.esLibre) return
      const aplicables = vigentes.filter(p => promoMatchItem(p, it))
      if (!aplicables.length) return
      const efectos = []
      aplicables.forEach(p => {
        if (p.tipo === 'nxm') {
          const activo = it.cantidad >= p.cantidad_lleva
          if (p.precio_final != null) {
            const falta = p.cantidad_lleva - (it.cantidad % p.cantidad_lleva || p.cantidad_lleva)
            efectos.push(activo
              ? { label: `${p.cantidad_lleva}×${p.cantidad_paga} → ${fmt$(p.precio_final)} c/u`, activo: true }
              : { label: `${p.cantidad_lleva}×${p.cantidad_paga} → ${fmt$(p.precio_final)} — llevá ${falta} más`, activo: false }
            )
          } else {
            const gratis = Math.floor(it.cantidad / p.cantidad_lleva)
            const falta  = p.cantidad_lleva - (it.cantidad % p.cantidad_lleva || p.cantidad_lleva)
            efectos.push(gratis > 0
              ? { label: `${p.cantidad_lleva}×${p.cantidad_paga} — ${gratis} gratis`, activo: true }
              : { label: `${p.cantidad_lleva}×${p.cantidad_paga} — llevá ${falta} más`, activo: false }
            )
          }
        } else if (p.tipo === 'precio_qty' && p.cantidad_min >= 2) {
          const grupos = Math.floor(it.cantidad / p.cantidad_min)
          const falta  = p.cantidad_min - (it.cantidad % p.cantidad_min || p.cantidad_min)
          efectos.push(grupos > 0
            ? { label: `${p.cantidad_min} u. → ${fmt$(p.precio_bundle)} — ${grupos === 1 ? '1 conjunto' : `${grupos} conjuntos`}`, activo: true }
            : { label: `${p.cantidad_min} u. → ${fmt$(p.precio_bundle)} — llevá ${falta} más`, activo: false }
          )
        } else {
          if (p.precio_final != null) {
            efectos.push({
              label: `→ ${fmt$(p.precio_final)} c/u${p.medio_pago ? ` en ${p.medio_pago.replace(/_/g,' ')}` : ''}`,
              activo: true, condicional: !!p.medio_pago, medio: p.medio_pago,
            })
          } else {
            efectos.push({
              label: `-${p.descuento_pct}%${p.medio_pago ? ` en ${p.medio_pago.replace(/_/g,' ')}` : ''}`,
              activo: true, condicional: !!p.medio_pago, medio: p.medio_pago,
            })
          }
        }
      })
      if (efectos.length) map.set(it._key, efectos)
    })
    return map
  }, [carrito, promociones])

  /* ── Totales ──
     precio_venta ya viene CON IVA incluido → extraemos el IVA del precio
     en lugar de sumarlo encima                                            */
  const totales = useMemo(() => {
    const hayEfectivo = pagos.some(p => p.medio_pago === 'efectivo')
    const descPct     = hayEfectivo && descuentoEfectivoPct > 0 ? descuentoEfectivoPct : 0
    const hoy         = new Date().toISOString().slice(0, 10)
    const vigentes    = promociones.filter(p =>
      !(p.fecha_desde && p.fecha_desde > hoy) &&
      !(p.fecha_hasta && p.fecha_hasta < hoy)
    )

    let totalBruto = 0, iva21 = 0, iva105 = 0, ahorroPromos = 0
    carrito.forEach(it => {
      const bruto = it.precioFinal * it.cantidad
      const pct   = it.esLibre ? 0 : Number(it.producto.iva_porcentaje)
      totalBruto += bruto
      if (pct === 21)   iva21  += bruto - bruto / 1.21
      if (pct === 10.5) iva105 += bruto - bruto / 1.105

      if (!it.esLibre) {
        const aplicables = vigentes.filter(p => promoMatchItem(p, it))
        let ahorroNxm = 0, ahorroQty = 0, pctTotal = 0
        aplicables.forEach(p => {
          if (p.tipo === 'nxm') {
            if (p.precio_final != null && it.cantidad >= p.cantidad_lleva) {
              const ahorro = it.cantidad * Math.max(0, it.precioFinal - Number(p.precio_final))
              if (ahorro > 0) ahorroNxm += ahorro
            } else {
              ahorroNxm += Math.floor(it.cantidad / p.cantidad_lleva) * it.precioFinal
            }
          } else if (p.tipo === 'precio_qty' && p.cantidad_min >= 2) {
            const grupos = Math.floor(it.cantidad / p.cantidad_min)
            if (grupos > 0) {
              const ahorro = grupos * (p.cantidad_min * it.precioFinal - Number(p.precio_bundle))
              if (ahorro > 0) ahorroQty += ahorro
            }
          } else if (p.tipo === 'descuento_pct') {
            const mediaMatch = !p.medio_pago || pagos.some(pg => pg.medio_pago === p.medio_pago)
            if (mediaMatch) {
              if (p.precio_final != null) {
                const ahorro = it.cantidad * Math.max(0, it.precioFinal - Number(p.precio_final))
                if (ahorro > 0) ahorroQty += ahorro
              } else {
                pctTotal += Number(p.descuento_pct)
              }
            }
          }
        })
        pctTotal = Math.min(pctTotal, 100)
        ahorroPromos += ahorroNxm + ahorroQty + (bruto - ahorroNxm - ahorroQty) * pctTotal / 100
      }
    })

    const subtotalNeto     = +(totalBruto - iva21 - iva105).toFixed(2)
    const descMonto        = +(totalBruto * descPct / 100).toFixed(2)
    const ahorroPromosMonto = +ahorroPromos.toFixed(2)
    const totalSinRecargo  = +(totalBruto - descMonto - ahorroPromosMonto).toFixed(2)
    // Recargo: se suma al total de la venta sin tocar el precio de los productos
    const recargoValor     = recargo.activo ? Number(recargo.valor) || 0 : 0
    const recargoMonto     = +Math.max(0, recargo.tipo === 'pct' ? totalSinRecargo * recargoValor / 100 : recargoValor).toFixed(2)
    const total            = +(totalSinRecargo + recargoMonto).toFixed(2)
    const totalPagos         = +pagos.reduce((s, p) => s + Number(p.monto || 0), 0).toFixed(2)
    const diferencia          = +(totalPagos - total).toFixed(2)
    const hayEfectivoCargado  = pagos.some(p => p.medio_pago === 'efectivo' && Number(p.monto) > 0)
    const sobrepagoEnEfectivo = diferencia > 0.009 && hayEfectivoCargado
    const pagoCompleto        = carrito.length > 0 && total > 0 && (Math.abs(diferencia) < 0.01 || sobrepagoEnEfectivo)
    const vuelto              = sobrepagoEnEfectivo ? diferencia : 0

    return { subtotalNeto, iva21: +iva21.toFixed(2), iva105: +iva105.toFixed(2), descPct, descMonto, ahorroPromosMonto, recargoMonto, total, totalPagos, diferencia, pagoCompleto, sobrepagoEnEfectivo, vuelto }
  }, [carrito, pagos, descuentoEfectivoPct, promociones, recargo])

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
    setVtoCC({ modo: 'defecto', fecha: '' })
    setRecargo(RECARGO_INICIAL)
    setError(''); setBusqProd('')
    setNoEncontrado(false); setShowDrop(false)
    setShowItemLibre(false); setLibreDesc(''); setLibrePrice('')
  }

  /* ── Cobrar ── */
  async function handleCobrar() {
    if (!totales.pagoCompleto || bloqueoCC) return
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

    const promosAplicadas = calcularPromosAplicadas(carrito, pagos, promociones)

    // Si hay vuelto, ajustar el efectivo para que los pagos sumen exactamente el total
    let pagosFinales = pagos
      .filter(p => Number(p.monto) > 0)
      .map(p => ({ medio_pago: p.medio_pago, monto: Number(p.monto) }))
    if (totales.vuelto > 0.009) {
      let restante = totales.vuelto
      for (let i = pagosFinales.length - 1; i >= 0 && restante > 0.009; i--) {
        if (pagosFinales[i].medio_pago === 'efectivo') {
          const reduccion = Math.min(pagosFinales[i].monto, restante)
          pagosFinales[i] = { ...pagosFinales[i], monto: +(pagosFinales[i].monto - reduccion).toFixed(2) }
          restante -= reduccion
        }
      }
      pagosFinales = pagosFinales.filter(p => p.monto > 0.009)
    }

    const ccFinal = +pagosFinales
      .filter(p => p.medio_pago === 'cuenta_corriente')
      .reduce((s, p) => s + p.monto, 0).toFixed(2)

    const res = await crear(
      {
        cliente_id:       clienteSeleccionado?.id || null,
        tipo_comprobante: comprobante,
        canal: 'mostrador', estado: 'completada',
        subtotal: totales.subtotalNeto, descuento_monto: +(totales.descMonto + totales.ahorroPromosMonto).toFixed(2),
        recargo_monto: totales.recargoMonto, iva_monto: totales.iva21 + totales.iva105, total: totales.total,
        ...(totales.recargoMonto > 0 && {
          notas: `Recargo ${recargo.tipo === 'pct' ? `${Number(recargo.valor)}% ` : ''}${fmt$(totales.recargoMonto)}${recargo.concepto.trim() ? ` — ${recargo.concepto.trim()}` : ''}`,
        }),
        ...(ccFinal > 0 && { cc_monto: ccFinal, fecha_vencimiento: fechaVtoCC }),
      },
      itemsVenta,
      pagosFinales,
      promosAplicadas,
    )
    setSaving(false)
    if (res.error) { setError(res.error.message || 'Error al guardar.'); return }
    if (res.aviso) toast?.warning(res.aviso, 8000)

    if (!modoCaja) { resetPos(); setVista('lista'); return }

    // Modo caja: queda listo para la próxima venta
    aplicarMovidos(res.movidos)
    toast?.success(
      `Venta ${res.data.numero} · ${fmt$(totales.total)}${totales.vuelto > 0.009 ? ` · vuelto ${fmt$(totales.vuelto)}` : ''}`,
      totales.vuelto > 0.009 ? 8000 : 4000,
    )
    resetPos()
    onVentaRegistrada?.()
    setTimeout(() => busqRef.current?.focus(), 50)
  }

  /* ── Atajos de teclado del POS ── */
  // La ref guarda los handlers del último render, así el listener no queda con estado viejo
  const atajosRef = useRef({})
  useEffect(() => {
    atajosRef.current = {
      cobrar:  () => { if (!saving && totales.pagoCompleto && !bloqueoCC) handleCobrar() },
      buscar:  () => busqRef.current?.focus(),
      cliente: () => { if (clienteSeleccionado) seleccionarCliente(null); setTimeout(() => clienteInputRef.current?.focus(), 0) },
      recargo: () => { if (carrito.length) setRecargo(r => r.activo ? RECARGO_INICIAL : { ...r, activo: true, concepto: hayCC ? 'Financiación Cta. Cte.' : '' }) },
      vaciar:  () => { if (carrito.length && window.confirm('¿Vaciar la venta en curso?')) resetPos() },
    }
  })
  useEffect(() => {
    if (vista !== 'pos') return
    const MAPA = { F2: 'cobrar', F3: 'buscar', F4: 'cliente', F6: 'recargo', F9: 'vaciar' }
    function onKey(e) {
      const accion = MAPA[e.key]
      if (!accion) return
      e.preventDefault()
      atajosRef.current[accion]()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [vista])

  /* ── Exportar Excel ── */
  async function exportarExcel() {
    const XLSX = await import('xlsx')  // se descarga sólo al usarse
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
      <div className={`pos-root${modoCaja ? ' pos-root--caja' : ''}`}>

        {/* ════ COLUMNA IZQUIERDA 65% ════ */}
        <div className="pos-left">

          {!modoCaja && (
            <div className="pos-left-header">
              <button className="btn" onClick={() => { resetPos(); setVista('lista') }}>
                <i className="ti ti-arrow-left" /> Volver
              </button>
              <h1 className="page-title">Nueva venta</h1>
              <Link to="/pos" className="btn pos-btn-modo-caja" title="POS a pantalla completa para dejar abierto todo el día">
                <i className="ti ti-device-desktop" /> Modo caja
              </Link>
            </div>
          )}

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
              <button type="button" className="pos-btn-camara" onClick={() => setShowEscaner(true)}
                title="Escanear con la cámara" aria-label="Escanear con la cámara">
                <i className="ti ti-camera" />
              </button>
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
                  // Combo: cuántos se pueden armar con el stock de sus componentes
                  const armables = prod.es_combo ? combosDisponibles(prod, id => productoPorId[id]) : null
                  const sinStock = prod.es_combo
                    ? armables !== null && armables <= 0
                    : prod.controla_stock && Number(prod.stock_actual) <= 0
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      className={`pos-dd-item${sinStock ? ' pos-dd-item--agotado' : ''}`}
                      onMouseDown={() => agregarAlCarrito(prod)}
                    >
                      <ProductoThumb url={prod.imagen_url} size={96} alt={prod.nombre} />
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
                        {prod.es_combo && armables !== null && (
                          <span className={`pos-dd-stock${armables <= 1 ? ' pos-dd-stock--bajo' : ''}`}>
                            combo · arma {armables}
                          </span>
                        )}
                        {prod.controla_stock && !prod.es_combo && (
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
                  {!recargo.activo && (
                    <button type="button" className="btn-item-libre-inline btn-recargo-inline" title="Sumar un recargo al total sin cambiar el precio de los productos"
                      onClick={() => setRecargo(r => ({ ...r, activo: true, concepto: hayCC ? 'Financiación Cta. Cte.' : '' }))}>
                      <i className="ti ti-circle-plus" /> recargo
                    </button>
                  )}
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
                              {it.producto.imagen_url && <ProductoThumb url={it.producto.imagen_url} size={30} alt={it.producto.nombre} />}
                              <div className="carrito-item-info">
                                <span className="carrito-item-nombre">{it.producto.nombre}</span>
                                {it.esPromo && <span className="badge-promo">PROMO</span>}
                                {efectosPromo.has(it._key) && efectosPromo.get(it._key).map((ef, i) => (
                                  <span key={i} className={`badge-promo-desc${ef.activo ? '' : ' badge-promo-desc--pending'}`}>
                                    <i className="ti ti-tag-starred" /> {ef.label}
                                  </span>
                                ))}
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

                  {/* Recargo: línea aparte, no es un producto (no toca precios ni stock) */}
                  {recargo.activo && (
                    <div className="carrito-item carrito-item--recargo">
                      <span className="carrito-item-recargo-badge"><i className="ti ti-circle-plus" /> recargo</span>
                      <div className="carrito-item-info">
                        <input className="field-input carrito-recargo-concepto" placeholder="Concepto (ej. financiación Cta. Cte.)"
                          value={recargo.concepto} onChange={e => setRecargo(r => ({ ...r, concepto: e.target.value }))} />
                      </div>
                      <div className="carrito-item-controles">
                        <div className="carrito-recargo-tipo">
                          {[['monto', '$'], ['pct', '%']].map(([t, l]) => (
                            <button key={t} type="button" className={`qty-btn${recargo.tipo === t ? ' qty-btn--on' : ''}`}
                              onClick={() => setRecargo(r => ({ ...r, tipo: t }))}>{l}</button>
                          ))}
                        </div>
                        <input className="field-input carrito-recargo-valor" type="number" min="0"
                          step={recargo.tipo === 'pct' ? '0.5' : '1'} placeholder={recargo.tipo === 'pct' ? '%' : '$'} autoFocus
                          value={recargo.valor} onChange={e => setRecargo(r => ({ ...r, valor: e.target.value }))} />
                        <span className="carrito-item-sub">+{fmt$(totales.recargoMonto)}</span>
                        <button type="button" className="btn-icon btn-icon--danger" title="Quitar recargo" onClick={() => setRecargo(RECARGO_INICIAL)}>
                          <i className="ti ti-x" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        </div>

        {/* ════ COLUMNA DERECHA 35% — Panel de cobro ════ */}
        <div className="pos-right" id="pos-cobro">
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
                    {dropClienteAbierto && (
                      <div className="prod-dropdown">
                        {clientesFiltrados.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            className="prod-dropdown-item"
                            onMouseDown={() => seleccionarCliente(c)}
                          >
                            <span className="prod-dd-nombre">
                              {c.razon_social || `${c.nombre} ${c.apellido || ''}`}
                            </span>
                            <span className="prod-dd-precio">{c.cuit || c.dni || ''}</span>
                          </button>
                        ))}
                        {busqCliente.trim() && clientesFiltrados.length === 0 && (
                          <p className="cliente-dd-vacio">No hay clientes con “{busqCliente.trim()}”</p>
                        )}
                        {/* Alta rápida: siempre disponible al final */}
                        <button type="button" className="prod-dropdown-item cliente-dd-nuevo" onMouseDown={abrirNuevoCliente}>
                          <span className="prod-dd-nombre">
                            <i className="ti ti-user-plus" />
                            {busqCliente.trim() ? `Crear cliente “${busqCliente.trim()}”` : 'Nuevo cliente'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Aviso deuda Cta. Cte. del cliente */}
            {clienteSeleccionado && deudaCliente?.saldo > 0 && (
              <div className={`pos-cc-aviso${deudaCliente.vencido > 0 ? ' pos-cc-aviso--danger' : ''}`}>
                <i className={`ti ${deudaCliente.vencido > 0 ? 'ti-alert-triangle' : 'ti-notebook'}`} />
                <div>
                  {deudaCliente.vencido > 0 ? (
                    <p><strong>Tiene {fmt$(deudaCliente.vencido)} vencido</strong> ({deudaCliente.diasAtraso} días de atraso)</p>
                  ) : (
                    <p>Saldo en Cta. Cte.: <strong>{fmt$(deudaCliente.saldo)}</strong> (al día)</p>
                  )}
                  {deudaCliente.vencido > 0 && deudaCliente.saldo > deudaCliente.vencido && (
                    <p className="pos-cc-aviso-sub">Saldo total {fmt$(deudaCliente.saldo)}</p>
                  )}
                </div>
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

            {/* Vuelto a dar */}
            {totales.sobrepagoEnEfectivo && (
              <div className="pos-vuelto">
                <i className="ti ti-coins" />
                <span>Vuelto a dar</span>
                <strong>{fmt$(totales.vuelto)}</strong>
              </div>
            )}

            {/* Diferencia si falta plata */}
            {carrito.length > 0 && totales.totalPagos > 0 && !totales.pagoCompleto && totales.diferencia < 0 && (
              <div className="pos-diferencia pos-diferencia--faltan">
                <i className="ti ti-arrow-down" />
                {`Faltan ${fmt$(Math.abs(totales.diferencia))}`}
              </div>
            )}

            {/* Cta. Cte. — vencimiento y validaciones */}
            {hayCC && (
              <div className="pos-cc-vto">
                <p className="pos-cc-vto-title"><i className="ti ti-calendar-due" /> Vencimiento Cta. Cte.</p>
                <div className="pos-cc-vto-opts">
                  {[7, 14, 30].map(d => {
                    const activo = vtoCC.modo === d || (vtoCC.modo === 'defecto' && plazoDefecto === d)
                    return (
                      <button key={d} type="button" className={`pill${activo ? ' pill--active' : ''}`}
                        onClick={() => setVtoCC(v => ({ ...v, modo: d }))}>
                        {d} días
                      </button>
                    )
                  })}
                  {vtoCC.modo === 'defecto' && ![7, 14, 30].includes(plazoDefecto) && (
                    <button type="button" className="pill pill--active">{plazoDefecto} días</button>
                  )}
                  <button type="button" className={`pill${vtoCC.modo === 'fecha' ? ' pill--active' : ''}`}
                    onClick={() => setVtoCC(v => ({ modo: 'fecha', fecha: v.fecha || fechaVtoCC }))}>
                    <i className="ti ti-calendar" /> Fecha
                  </button>
                </div>
                {vtoCC.modo === 'fecha' ? (
                  <input className="field-input" type="date" value={vtoCC.fecha}
                    min={sumarDias(0)} onChange={e => setVtoCC({ modo: 'fecha', fecha: e.target.value })} />
                ) : (
                  <p className="pos-cc-vto-fecha">
                    Vence el {new Date(fechaVtoCC + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
                {!clienteSeleccionado && (
                  <div className="pos-diferencia pos-diferencia--faltan">
                    <i className="ti ti-user-exclamation" /> Elegí un cliente para vender a Cta. Cte.
                  </div>
                )}
                {superaLimite && (
                  <div className="pos-cc-aviso pos-cc-aviso--warning">
                    <i className="ti ti-alert-circle" />
                    <p>Supera el límite de crédito ({fmt$(limiteCC)}): quedaría en {fmt$(deudaCliente.saldo + montoCC)}</p>
                  </div>
                )}
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
            {totales.ahorroPromosMonto > 0 && (
              <div className="total-row total-row--desc">
                <span><i className="ti ti-tag-starred" /> Promos</span>
                <span>−{fmt$(totales.ahorroPromosMonto)}</span>
              </div>
            )}
            {totales.descMonto > 0 && (
              <div className="total-row total-row--desc">
                <span><i className="ti ti-tag" /> Desc. efectivo {totales.descPct}%</span>
                <span>−{fmt$(totales.descMonto)}</span>
              </div>
            )}
            {totales.recargoMonto > 0 && (
              <div className="total-row total-row--recargo">
                <span><i className="ti ti-circle-plus" /> Recargo{recargo.tipo === 'pct' ? ` ${Number(recargo.valor)}%` : ''}</span>
                <span>+{fmt$(totales.recargoMonto)}</span>
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
            disabled={saving || !totales.pagoCompleto || bloqueoCC}
          >
            <i className={`ti ${saving ? 'ti-loader-2' : 'ti-cash'}`} />
            {saving ? 'Procesando...' : carrito.length === 0 ? 'Cobrar' : `Cobrar ${fmt$(totales.total)}`}
            <kbd className="pos-kbd">F2</kbd>
          </button>

        </div>

        {/* Escáner con cámara: queda abierto para leer varios productos seguidos */}
        {showEscaner && (
          <EscanerCodigo
            continuo
            titulo="Escanear productos"
            onLeer={leerCodigoCamara}
            onCerrar={() => setShowEscaner(false)}
          />
        )}

        {/* Alta rápida de cliente (misma ficha que el módulo Clientes) */}
        {nuevoCliente && (
          <ClientePanel
            cliente={null}
            inicial={nuevoCliente}
            onCrear={crearClienteDesdePos}
            onCerrar={() => setNuevoCliente(null)}
          />
        )}

        {/* Barra inferior en celular: total + ir al cobro */}
        {carrito.length > 0 && (
          <div className={`pos-mobile-bar${modoCaja ? ' pos-mobile-bar--caja' : ''}`}>
            <div className="pos-mobile-bar-info">
              <span>{carrito.reduce((s, it) => s + it.cantidad, 0)} u. · Total</span>
              <strong>{fmt$(totales.total)}</strong>
            </div>
            <button type="button" className="btn btn--filled"
              onClick={() => document.getElementById('pos-cobro')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <i className="ti ti-cash" /> Cobrar
            </button>
          </div>
        )}
      </div>
    )
  }

  /* ════════════════════════════════════════════════════════
     VISTA LISTA
  ════════════════════════════════════════════════════════ */
  return (
    <>
    <div className="ventas-page">
      <div className="page-header">
        <h1 className="page-title">Ventas</h1>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="ventas-periodo">
            <div className="pills">
              <button className={`pill${periodo === 'dia' && fechaFiltro === hoy ? ' pill--active' : ''}`}
                onClick={() => { setPeriodo('dia'); setFechaFiltro(hoy) }}>Hoy</button>
              <button className={`pill${periodo === '7' ? ' pill--active' : ''}`} onClick={() => setPeriodo('7')}>7 días</button>
              <button className={`pill${periodo === '15' ? ' pill--active' : ''}`} onClick={() => setPeriodo('15')}>15 días</button>
              <button className={`pill${periodo === 'mes' ? ' pill--active' : ''}`} onClick={() => setPeriodo('mes')}>Mes</button>
            </div>
            <input
              type="date"
              className={`input-date-filter${periodo === 'dia' && fechaFiltro !== hoy ? ' input-date-filter--active' : ''}`}
              title="Ver un día puntual"
              value={periodo === 'dia' ? fechaFiltro : ''}
              max={hoy}
              onChange={e => { if (e.target.value) { setFechaFiltro(e.target.value); setPeriodo('dia') } }}
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
          <Link to="/pos" className="btn" title="POS a pantalla completa para dejar abierto todo el día">
            <i className="ti ti-device-desktop" /> Modo caja
          </Link>
          <button className="btn btn--primary" onClick={() => setVista('pos')}>
            <i className="ti ti-plus" /> Nueva venta
          </button>
        </div>
      </div>

      <div className="ventas-busqueda">
        <div className="search-box">
          <i className="ti ti-search" />
          <input
            placeholder="Buscar cliente, número..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        {!loadingVentas && ventasFiltradas.length > 0 && (
          <span className="ventas-resumen">
            {ventasFiltradas.length} {ventasFiltradas.length === 1 ? 'venta' : 'ventas'}
            {' · '}
            <strong>{fmt$(ventasFiltradas.filter(v => v.estado !== 'anulada').reduce((s, v) => s + Number(v.total || 0), 0))}</strong>
          </span>
        )}
      </div>

      <div className="table-wrap">
        {loadingVentas ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha / hora</th><th>N°</th><th>Tipo</th><th>Cliente</th>
                <th>Medios de pago</th><th className="td-right">Total</th><th>Estado</th><th />
              </tr>
            </thead>
            <SkeletonTableBody rows={7} cols={8} />
          </table>
        ) : ventasFiltradas.length === 0 ? (
          <div className="table-empty">
            <i className="ti ti-shopping-bag" />
            <span>{busqueda || filtroEstado ? 'Sin resultados' : periodo === 'dia' ? 'No hay ventas para esta fecha.' : 'No hay ventas en este período.'}</span>
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
                <tr key={v.id} className="tr-clickable" onClick={() => abrirDetalle(v)}>
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
                  <td>
                    <span className={`badge ${ESTADO_BADGE[v.estado] || 'badge--neutral'}`}>{v.estado}</span>
                    {Number(v.devuelto_monto) > 0 && (
                      <span className="badge badge--warning badge-devuelto" title={`Devuelto ${fmt$(v.devuelto_monto)}`}>devolución</span>
                    )}
                  </td>
                  <td className="td-actions" onClick={e => e.stopPropagation()}>
                    {v.estado === 'completada' && (
                      <button className="btn-icon btn-icon--danger" title="Anular" onClick={() => handleAnular(v)}>
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

    {ventaDetalle && (
      <ModalDetalleVenta
        venta={ventaDetalle}
        onClose={() => setVentaDetalle(null)}
        onAnular={async () => { if (await handleAnular(ventaDetalle)) setVentaDetalle(prev => ({ ...prev, estado: 'anulada' })) }}
        onDevolver={(items, opciones) => handleDevolver(ventaDetalle, items, opciones)}
      />
    )}
    </>
  )
}

const REINTEGRO_MEDIOS = [
  { value: 'efectivo',      label: 'Efectivo'      },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'mercado_pago',  label: 'Mercado Pago'  },
  { value: 'otro',          label: 'Otro'          },
]

function ModalDetalleVenta({ venta, onClose, onAnular, onDevolver }) {
  const loading  = venta._loading
  const items    = venta.items || []
  const pagos    = venta.pagos || []
  const promos   = venta.promociones_aplicadas || []
  const devols   = venta.devoluciones || []

  const clienteNombre = venta.cliente
    ? `${venta.cliente.nombre} ${venta.cliente.apellido || ''}`.trim()
    : 'Consumidor final'

  /* ── Devolución ── */
  const [devolviendo, setDevolviendo] = useState(false)
  const [cantDev,     setCantDev]     = useState({})          // { [venta_item_id]: cantidad }
  const [aplicarDeud, setAplicarDeud] = useState(true)
  const [medioReint,  setMedioReint]  = useState('efectivo')
  const [savingDev,   setSavingDev]   = useState(false)
  const [errorDev,    setErrorDev]    = useState('')

  const puedeDevolver = venta.estado === 'completada' && !loading && items.some(it => Number(it.cantidad) > 0)

  // Misma cuenta que registrar_devolucion(): proporcional al total (descuentos/recargos incluidos)
  const subItems   = items.reduce((s, it) => s + Number(it.subtotal), 0)
  const subDev     = items.reduce((s, it) => {
    const c = Math.min(Number(cantDev[it.id]) || 0, Number(it.cantidad))
    if (c <= 0) return s
    return s + (c >= Number(it.cantidad) ? Number(it.subtotal) : Number(it.subtotal) / Number(it.cantidad) * c)
  }, 0)
  const devuelveTodo = items.every(it => (Number(cantDev[it.id]) || 0) >= Number(it.cantidad))
  const montoDev   = subDev <= 0 ? 0
    : devuelveTodo ? Number(venta.total)
    : Math.min(Number(venta.total), +(Number(venta.total) * subDev / (subItems || 1)).toFixed(2))
  const pendEsta   = Math.max(0, Number(venta.cc_monto || 0) - Number(venta.cc_pagado || 0))
  const aEsta      = Math.min(pendEsta, montoDev)
  const resto      = +(montoDev - aEsta).toFixed(2)

  function setCant(it, valor) {
    const n = Math.max(0, Math.min(Number(it.cantidad), Number(valor) || 0))
    setCantDev(prev => ({ ...prev, [it.id]: valor === '' ? '' : n }))
  }

  function cancelarDevolucion() {
    setDevolviendo(false); setCantDev({}); setErrorDev('')
  }

  async function confirmarDevolucion() {
    const lista = items
      .filter(it => Number(cantDev[it.id]) > 0)
      .map(it => ({ venta_item_id: it.id, cantidad: Number(cantDev[it.id]) }))
    if (!lista.length) { setErrorDev('Indicá cuánto devuelve de cada producto.'); return }
    setSavingDev(true); setErrorDev('')
    const res = await onDevolver(lista, { aplicarDeudas: aplicarDeud, medioReintegro: medioReint })
    setSavingDev(false)
    if (res?.error) { setErrorDev(res.error.message || 'No se pudo registrar la devolución.'); return }
    cancelarDevolucion()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-detalle">
        <div className="modal-detalle__header">
          <div className="modal-detalle__title">
            <i className="ti ti-receipt" />
            <span>{venta.numero || 'Venta'}</span>
            <span className={`badge ${ESTADO_BADGE[venta.estado] || 'badge--neutral'}`}>{venta.estado}</span>
          </div>
          <button className="btn-icon" onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        <div className="modal-detalle__meta">
          <div className="modal-detalle__meta-item">
            <i className="ti ti-calendar" />
            <span>{fmtFechaHora(venta.fecha)}</span>
          </div>
          <div className="modal-detalle__meta-item">
            <i className="ti ti-file-invoice" />
            <span>{COMP_LABEL[venta.tipo_comprobante] || `Fact. ${venta.tipo_comprobante || 'B'}`}</span>
          </div>
          <div className="modal-detalle__meta-item">
            <i className="ti ti-user" />
            <span>{clienteNombre}</span>
          </div>
        </div>

        {loading ? (
          <div className="modal-detalle__loading">
            <i className="ti ti-loader-2" /> Cargando detalle...
          </div>
        ) : (
          <>
            <div className="modal-detalle__section">
              <div className="modal-detalle__section-title">Productos</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th className="td-right">Cant.</th>
                    <th className="td-right">Precio unit.</th>
                    <th className="td-right">Desc. %</th>
                    <th className="td-right">Subtotal</th>
                    {devolviendo && <th className="td-right">Devuelve</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={devolviendo ? 6 : 5} className="td-muted" style={{ textAlign: 'center' }}>Sin ítems</td></tr>
                  ) : items.map((it, i) => (
                    <tr key={i}>
                      <td>
                        {it.descripcion}
                        {Number(it.cantidad_devuelta) > 0 && (
                          <span className="detalle-devuelto">devolvió {Number(it.cantidad_devuelta)}</span>
                        )}
                      </td>
                      <td className="td-right td-mono">{Number(it.cantidad)}</td>
                      <td className="td-right td-mono">{fmt$(it.precio_unitario)}</td>
                      <td className="td-right td-mono">{it.descuento_pct ? `${it.descuento_pct}%` : '—'}</td>
                      <td className="td-right td-mono" style={{ fontWeight: 500 }}>{fmt$(it.subtotal)}</td>
                      {devolviendo && (
                        <td className="td-right">
                          {Number(it.cantidad) > 0 ? (
                            <div className="devol-cant">
                              <input type="number" className="field-input" min="0" max={Number(it.cantidad)} step="1"
                                placeholder="0" value={cantDev[it.id] ?? ''}
                                onChange={e => setCant(it, e.target.value)} />
                              <button type="button" className="btn btn--sm" onClick={() => setCant(it, it.cantidad)}>Todo</button>
                            </div>
                          ) : <span className="td-muted">—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {devolviendo && (
              <div className="modal-detalle__section devol-panel">
                <div className="modal-detalle__section-title">
                  <i className="ti ti-arrow-back-up" /> Devolución
                  {items.some(it => Number(it.cantidad) > 0) && (
                    <button type="button" className="btn btn--sm" style={{ marginLeft: 'auto' }}
                      onClick={() => setCantDev(Object.fromEntries(items.map(it => [it.id, Number(it.cantidad)])))}>
                      Devuelve todo
                    </button>
                  )}
                </div>
                {montoDev > 0 ? (
                  <div className="devol-resumen">
                    <div className="devol-resumen__row devol-resumen__row--total">
                      <span>Valor de lo devuelto</span><span className="td-mono">{fmt$(montoDev)}</span>
                    </div>
                    <p className="devol-resumen__nota"><i className="ti ti-package" /> Los productos vuelven al stock.</p>
                    {aEsta > 0 && (
                      <div className="devol-resumen__row">
                        <span>Se descuenta de la deuda de esta venta</span><span className="td-mono">{fmt$(aEsta)}</span>
                      </div>
                    )}
                    {resto > 0 && (
                      <>
                        <div className="devol-resumen__row">
                          <span>
                            {venta.cliente && aplicarDeud
                              ? 'A otras deudas del cliente; si no tiene, se le devuelve'
                              : 'Se le devuelve al cliente'}
                          </span>
                          <span className="td-mono">{fmt$(resto)}</span>
                        </div>
                        <div className="devol-opciones">
                          {venta.cliente && (
                            <label className="devol-check">
                              <input type="checkbox" checked={aplicarDeud} onChange={e => setAplicarDeud(e.target.checked)} />
                              Aplicar a otras deudas del cliente
                            </label>
                          )}
                          <label className="devol-medio">
                            <span className="field-label">Se devuelve en</span>
                            <select className="field-input" value={medioReint} onChange={e => setMedioReint(e.target.value)}>
                              {REINTEGRO_MEDIOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          </label>
                        </div>
                        {medioReint === 'efectivo' && (
                          <p className="devol-resumen__nota"><i className="ti ti-cash" /> Si hay caja abierta, sale como retiro de caja.</p>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="devol-resumen__nota">Indicá cuántas unidades devuelve de cada producto.</p>
                )}
                {errorDev && <div className="error-banner"><i className="ti ti-alert-circle" /> {errorDev}</div>}
              </div>
            )}

            {devols.length > 0 && !devolviendo && (
              <div className="modal-detalle__section">
                <div className="modal-detalle__section-title">Devoluciones</div>
                {devols.map(d => (
                  <div key={d.id} className="modal-detalle__pago-row">
                    <span>
                      {fmtFechaHora(d.created_at)} · {(d.items || []).map(it => `${Number(it.cantidad)} × ${it.descripcion}`).join(', ')}
                      {Number(d.reintegro) > 0 && ` · devuelto ${fmt$(d.reintegro)} en ${(d.reintegro_medio || '').replace(/_/g, ' ')}`}
                    </span>
                    <span className="td-mono">−{fmt$(d.monto)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-detalle__bottom">
              <div className="modal-detalle__pagos">
                <div className="modal-detalle__section-title">Medios de pago</div>
                {pagos.map((p, i) => (
                  <div key={i} className="modal-detalle__pago-row">
                    <span>{p.medio_pago.replace(/_/g, ' ')}</span>
                    <span className="td-mono">{fmt$(p.monto)}</span>
                  </div>
                ))}
                {promos.length > 0 && (
                  <>
                    <div className="modal-detalle__section-title" style={{ marginTop: 12 }}>Promociones aplicadas</div>
                    {promos.map((p, i) => (
                      <div key={i} className="modal-detalle__pago-row">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <i className="ti ti-tag" style={{ fontSize: 13, color: 'var(--color-accent)' }} />
                          {p.promo_nombre}
                        </span>
                        <span className="td-mono" style={{ color: 'var(--color-success)' }}>-{fmt$(p.descuento_monto)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="modal-detalle__totales">
                {Number(venta.descuento_monto) > 0 && (
                  <div className="detalle-total-row">
                    <span>Subtotal</span><span>{fmt$(venta.subtotal)}</span>
                  </div>
                )}
                {Number(venta.descuento_monto) > 0 && (
                  <div className="detalle-total-row detalle-total-row--discount">
                    <span>Descuento</span><span>-{fmt$(venta.descuento_monto)}</span>
                  </div>
                )}
                {Number(venta.recargo_monto) > 0 && (
                  <div className="detalle-total-row">
                    <span>Recargo</span><span>+{fmt$(venta.recargo_monto)}</span>
                  </div>
                )}
                {Number(venta.iva_monto) > 0 && (
                  <div className="detalle-total-row td-muted">
                    <span>IVA</span><span>{fmt$(venta.iva_monto)}</span>
                  </div>
                )}
                <div className="detalle-total-row detalle-total-row--total">
                  <span>Total</span><span>{fmt$(venta.total)}</span>
                </div>
              </div>
            </div>

            {venta.notas && (
              <div className="modal-detalle__notas">
                <i className="ti ti-notes" /> {venta.notas}
              </div>
            )}
          </>
        )}

        <div className="modal-detalle__footer">
          {devolviendo ? (
            <>
              <button className="btn" onClick={cancelarDevolucion} disabled={savingDev}>Cancelar</button>
              <button className="btn btn--primary" onClick={confirmarDevolucion} disabled={savingDev || montoDev <= 0}>
                <i className={`ti ${savingDev ? 'ti-loader-2' : 'ti-check'}`} />
                {savingDev ? 'Registrando...' : `Confirmar devolución${montoDev > 0 ? ` · ${fmt$(montoDev)}` : ''}`}
              </button>
            </>
          ) : (
            <>
              {venta.estado === 'completada' && (
                <button className="btn btn--danger" onClick={onAnular}>
                  <i className="ti ti-ban" /> Anular venta
                </button>
              )}
              {puedeDevolver && (
                <button className="btn" onClick={() => setDevolviendo(true)}>
                  <i className="ti ti-arrow-back-up" /> Devolución
                </button>
              )}
              <button className="btn" onClick={onClose}>Cerrar</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
