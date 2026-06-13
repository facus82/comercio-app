import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './Compras.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(v || 0)

const TIPO_LABEL = {
  factura:      'Factura',
  factura_a:    'Factura A',
  factura_b:    'Factura B',
  factura_c:    'Factura C',
  remito:       'Remito',
  ticket:       'Ticket',
  nota_credito: 'Nota de crédito',
}

const ESTADO_BADGE = {
  pendiente: 'badge--warning',
  pagada:    'badge--success',
  parcial:   'badge--info',
  anulada:   'badge--neutral',
}

const MEDIOS = [
  { value: 'efectivo',      label: 'Efectivo',     icon: 'ti-cash'          },
  { value: 'transferencia', label: 'Transferencia', icon: 'ti-building-bank' },
  { value: 'cheque',        label: 'Cheque',        icon: 'ti-writing'       },
  { value: 'debito',        label: 'Débito',        icon: 'ti-credit-card'   },
  { value: 'credito',       label: 'Crédito',       icon: 'ti-credit-card'   },
]

function fmtFecha(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

const hoy = () => new Date().toISOString().slice(0, 10)

export default function CompraDetallePanel({
  compra: compraInicial,
  cargarItems,
  registrarPago,
  revertirEstado,
  onCerrar,
  onActualizado,
}) {
  const [compra,    setCompra]    = useState(compraInicial)
  const [items,     setItems]     = useState([])
  const [pagos,     setPagos]     = useState([])
  const [loading,   setLoading]   = useState(true)

  // Form de pago
  const [medioPago,  setMedioPago]  = useState('transferencia')
  const [monto,      setMonto]      = useState('')
  const [fechaPago,  setFechaPago]  = useState(hoy())
  const [referencia, setReferencia] = useState('')
  const [guardando,  setGuardando]  = useState(false)
  const [reverting,  setReverting]  = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  useEffect(() => { cargar() }, [compraInicial.id])

  async function cargar() {
    setLoading(true)
    const [itemsRes, pagosRes] = await Promise.all([
      cargarItems(compraInicial.id),
      supabase
        .from('proveedores_cc')
        .select('id, tipo, monto, concepto, created_at')
        .eq('referencia_tipo', 'compra')
        .eq('referencia_id', compraInicial.id)
        .eq('tipo', 'pago')
        .order('created_at', { ascending: true }),
    ])
    const pagosData = pagosRes.data || []
    setItems(itemsRes.data || [])
    setPagos(pagosData)

    // Pre-fill monto con el saldo pendiente
    const abonado = pagosData.reduce((s, p) => s + Number(p.monto), 0)
    const saldo   = Math.max(0, Number(compraInicial.total) - abonado)
    setMonto(saldo > 0 ? String(+saldo.toFixed(2)) : '')
    setLoading(false)
  }

  const totalPagado    = pagos.reduce((s, p) => s + Number(p.monto), 0)
  const saldoPendiente = Math.max(0, Number(compra.total) - totalPagado)
  const montoNum       = parseFloat(String(monto).replace(',', '.')) || 0
  const esParcial      = montoNum > 0 && montoNum < saldoPendiente - 0.01
  const esCompleto     = montoNum >= saldoPendiente - 0.01 && montoNum > 0
  const puedeRegistrar = compra.estado !== 'pagada' && compra.estado !== 'anulada'

  async function handlePago(e) {
    e.preventDefault()
    if (montoNum <= 0) { setError('Ingresá un monto.'); return }
    if (montoNum > saldoPendiente + 0.01) {
      setError(`El monto supera el saldo pendiente (${fmt$(saldoPendiente)}).`); return
    }
    setGuardando(true)
    setError('')
    const medioLabel = MEDIOS.find(m => m.value === medioPago)?.label ?? medioPago
    const res = await registrarPago(
      compra.id,
      compra.proveedor?.id || compra.proveedor_id,
      { monto: montoNum, medioLabel, fecha: fechaPago, referencia: referencia.trim() },
    )
    if (res.error) {
      setError(res.error.message || 'Error al registrar pago.')
    } else {
      const nuevoEstado = res.data.estado
      setCompra(prev => ({ ...prev, estado: nuevoEstado }))
      onActualizado?.(nuevoEstado)
      await cargar()
      setReferencia('')
    }
    setGuardando(false)
  }

  async function handleRevertir() {
    if (!confirm('¿Revertir el estado a Pendiente?')) return
    setReverting(true)
    const res = await revertirEstado(compra.id, 'pendiente')
    if (!res.error) {
      setCompra(prev => ({ ...prev, estado: 'pendiente' }))
      onActualizado?.('pendiente')
    }
    setReverting(false)
  }

  return (
    <>
      <div className="panel-backdrop" onClick={onCerrar} />
      <aside className="panel cdp">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="panel-header">
          <div className="cdp-header-info">
            <span className={`badge ${ESTADO_BADGE[compra.estado] || 'badge--neutral'}`}>
              {compra.estado.charAt(0).toUpperCase() + compra.estado.slice(1)}
            </span>
            <h2 className="panel-title cdp-title">
              {compra.proveedor?.nombre_fantasia || compra.proveedor?.razon_social || '—'}
            </h2>
          </div>
          <button className="btn-icon" onClick={onCerrar} title="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="panel-body">

          {/* ── Datos cabecera ──────────────────────────── */}
          <div className="cdp-meta">
            <div className="cdp-meta-item">
              <span className="cdp-meta-label">Fecha</span>
              <span className="cdp-meta-val">{fmtFecha(compra.fecha)}</span>
            </div>
            <div className="cdp-meta-item">
              <span className="cdp-meta-label">Comprobante</span>
              <span className="cdp-meta-val">{TIPO_LABEL[compra.tipo_comprobante] || compra.tipo_comprobante}</span>
            </div>
            {compra.numero_comprobante && (
              <div className="cdp-meta-item">
                <span className="cdp-meta-label">N°</span>
                <span className="cdp-meta-val td-mono">{compra.numero_comprobante}</span>
              </div>
            )}
            {compra.fecha_vencimiento && (
              <div className="cdp-meta-item">
                <span className="cdp-meta-label">Vto. pago</span>
                <span className="cdp-meta-val">{fmtFecha(compra.fecha_vencimiento)}</span>
              </div>
            )}
            {compra.notas && (
              <div className="cdp-meta-item cdp-meta-full">
                <span className="cdp-meta-label">Notas</span>
                <span className="cdp-meta-val">{compra.notas}</span>
              </div>
            )}
          </div>

          {/* ── Productos ──────────────────────────────── */}
          <div className="form-section">
            <p className="form-section-title">
              <i className="ti ti-package" /> Productos
            </p>
            {loading ? (
              <div className="cdp-loading">
                <i className="ti ti-loader-2" style={{ animation: 'spin .8s linear infinite' }} />
                Cargando...
              </div>
            ) : items.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Sin ítems registrados.</p>
            ) : (
              <div className="cdp-items">
                <div className="cdp-items-head">
                  <span>Producto</span>
                  <span className="td-right">Cant.</span>
                  <span className="td-right">Precio</span>
                  <span className="td-right">Subtotal</span>
                </div>
                {items.map(it => (
                  <div key={it.id} className="cdp-item-row">
                    <span className="cdp-item-nombre">{it.producto?.nombre || '—'}</span>
                    <span className="td-right td-muted">{it.cantidad}</span>
                    <span className="td-right td-muted">{fmt$(it.precio_unitario)}</span>
                    <span className="td-right">{fmt$(it.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Totales */}
            <div className="cdp-totales">
              <div className="cdp-total-row">
                <span>Subtotal</span><span>{fmt$(compra.subtotal)}</span>
              </div>
              <div className="cdp-total-row">
                <span>IVA</span><span>{fmt$(compra.iva_monto)}</span>
              </div>
              {Number(compra.flete) > 0 && (
                <div className="cdp-total-row">
                  <span>Flete</span><span>{fmt$(compra.flete)}</span>
                </div>
              )}
              <div className="cdp-total-row cdp-total-row--final">
                <span>TOTAL</span><strong>{fmt$(compra.total)}</strong>
              </div>
              {totalPagado > 0 && (
                <div className="cdp-total-row cdp-total-row--pagado">
                  <span>Pagado</span><span>− {fmt$(totalPagado)}</span>
                </div>
              )}
              {saldoPendiente > 0.01 && (
                <div className="cdp-total-row cdp-total-row--saldo">
                  <span>Saldo pendiente</span><strong>{fmt$(saldoPendiente)}</strong>
                </div>
              )}
            </div>
          </div>

          {/* ── Historial de pagos ──────────────────────── */}
          {pagos.length > 0 && (
            <div className="form-section">
              <p className="form-section-title">
                <i className="ti ti-receipt" /> Pagos registrados
              </p>
              <div className="cdp-pagos-list">
                {pagos.map((p, i) => (
                  <div key={p.id} className="cdp-pago-row">
                    <span className="cdp-pago-num">{i + 1}</span>
                    <span className="cdp-pago-concepto">{p.concepto}</span>
                    <span className="cdp-pago-monto">{fmt$(p.monto)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Formulario de pago ──────────────────────── */}
          {puedeRegistrar && (
            <div className="form-section">
              <p className="form-section-title">
                <i className="ti ti-wallet" /> Registrar pago
              </p>
              <form id="cdp-pago-form" onSubmit={handlePago}>

                <div className="cdp-medios">
                  {MEDIOS.map(m => (
                    <button
                      key={m.value}
                      type="button"
                      className={`cdp-medio-btn${medioPago === m.value ? ' cdp-medio-btn--sel' : ''}`}
                      onClick={() => setMedioPago(m.value)}
                    >
                      <i className={`ti ${m.icon}`} />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label className="field-label">Monto $</label>
                    <input
                      className="field-input"
                      type="number" min="0.01" step="0.01"
                      value={monto}
                      onChange={e => { setMonto(e.target.value); setError('') }}
                      required
                    />
                    {esParcial && (
                      <span className="field-hint cdp-hint--warn">
                        <i className="ti ti-alert-triangle" />
                        Pago parcial — resta {fmt$(saldoPendiente - montoNum)}
                      </span>
                    )}
                    {esCompleto && (
                      <span className="field-hint cdp-hint--ok">
                        <i className="ti ti-check" /> Cancela la deuda completa
                      </span>
                    )}
                  </div>

                  <div className="field">
                    <label className="field-label">Fecha</label>
                    <input
                      className="field-input"
                      type="date"
                      value={fechaPago}
                      onChange={e => setFechaPago(e.target.value)}
                      required
                    />
                  </div>

                  {medioPago !== 'efectivo' && (
                    <div className="field cdp-ref-field">
                      <label className="field-label">
                        N° referencia
                        <span className="field-opt"> (opcional)</span>
                      </label>
                      <input
                        className="field-input"
                        placeholder="N° transferencia, cheque, etc."
                        value={referencia}
                        onChange={e => setReferencia(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {error && (
                  <div className="error-banner" style={{ marginTop: 8 }}>
                    <i className="ti ti-alert-circle" /> {error}
                  </div>
                )}
              </form>
            </div>
          )}

        </div>

        {/* ── Footer ─────────────────────────────────────── */}
        <div className="panel-footer">
          {compra.estado !== 'pendiente' && compra.estado !== 'anulada' && (
            <button
              type="button"
              className="btn cdp-revertir-btn"
              onClick={handleRevertir}
              disabled={reverting}
              title="Revertir a pendiente"
            >
              <i className={`ti ${reverting ? 'ti-loader-2' : 'ti-rotate-counterclockwise'}`} />
              Revertir a pendiente
            </button>
          )}
          <div style={{ flex: 1 }} />
          {puedeRegistrar ? (
            <button
              type="submit"
              form="cdp-pago-form"
              className="btn btn--primary"
              disabled={guardando || montoNum <= 0}
            >
              <i className={`ti ${guardando ? 'ti-loader-2' : 'ti-check'}`} />
              {guardando ? 'Guardando...' : 'Registrar pago'}
            </button>
          ) : (
            <button type="button" className="btn" onClick={onCerrar}>
              Cerrar
            </button>
          )}
        </div>

      </aside>
    </>
  )
}
