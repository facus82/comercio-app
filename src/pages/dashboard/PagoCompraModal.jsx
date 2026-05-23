import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './PagoCompraModal.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

const MEDIOS = [
  { value: 'efectivo',      label: 'Efectivo',      icon: 'ti-cash'           },
  { value: 'transferencia', label: 'Transferencia',  icon: 'ti-building-bank'  },
  { value: 'cheque',        label: 'Cheque',         icon: 'ti-writing'        },
  { value: 'debito',        label: 'Débito',         icon: 'ti-credit-card'    },
  { value: 'credito',       label: 'Crédito',        icon: 'ti-credit-card'    },
]

export default function PagoCompraModal({ proveedor, comercioId, perfilId, onCerrar, onPagado }) {
  const [compras,      setCompras]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [compraSelId,  setCompraSelId]  = useState(null)
  const [monto,        setMonto]        = useState('')
  const [fecha,        setFecha]        = useState(new Date().toISOString().split('T')[0])
  const [medioPago,    setMedioPago]    = useState('transferencia')
  const [notas,        setNotas]        = useState('')
  const [guardando,    setGuardando]    = useState(false)
  const [error,        setError]        = useState(null)

  useEffect(() => { cargarCompras() }, [])

  async function cargarCompras() {
    const { data } = await supabase
      .from('compras')
      .select('id, numero, fecha, total, estado, tipo_comprobante, numero_comprobante')
      .eq('comercio_id', comercioId)
      .eq('proveedor_id', proveedor.id)
      .in('estado', ['pendiente', 'parcial'])
      .order('fecha', { ascending: true })

    setCompras(data || [])
    if (data?.length === 1) {
      setCompraSelId(data[0].id)
      setMonto(String(data[0].total))
    }
    setLoading(false)
  }

  const compraSel     = compras.find(c => c.id === compraSelId)
  const montoNum      = parseFloat(String(monto).replace(',', '.')) || 0
  const esParcial     = compraSel && montoNum > 0 && montoNum < Number(compraSel.total)
  const saldoRestante = compraSel ? Math.max(0, Number(compraSel.total) - montoNum) : 0

  function selectCompra(c) {
    setCompraSelId(c.id)
    setMonto(String(c.total))
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!compraSel || montoNum <= 0) return

    if (montoNum > Number(compraSel.total)) {
      setError('El monto no puede superar el total de la compra')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      /* 1 — Actualizar estado de la compra */
      const nuevoEstado = montoNum >= Number(compraSel.total) ? 'pagada' : 'parcial'
      const { error: errC } = await supabase
        .from('compras')
        .update({ estado: nuevoEstado })
        .eq('id', compraSel.id)
      if (errC) throw errC

      /* 2 — Obtener último saldo del proveedor */
      const { data: ultimo } = await supabase
        .from('proveedores_cc')
        .select('saldo_posterior')
        .eq('proveedor_id', proveedor.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const saldoAnt = Number(ultimo?.saldo_posterior ?? 0)
      const medioLabel = MEDIOS.find(m => m.value === medioPago)?.label ?? medioPago
      const refCompra  = compraSel.numero_comprobante
        ? ` ${compraSel.numero_comprobante}`
        : compraSel.numero
        ? ` ${compraSel.numero}`
        : ''

      /* 3 — Insertar movimiento en cuenta corriente del proveedor */
      const { error: errCC } = await supabase.from('proveedores_cc').insert({
        proveedor_id:    proveedor.id,
        tipo:            'pago',
        monto:           montoNum,
        saldo_anterior:  saldoAnt,
        saldo_posterior: saldoAnt - montoNum,
        concepto:        `Pago${refCompra} · ${medioLabel} · ${fecha}${notas ? ` · ${notas}` : ''}`,
        referencia_tipo: 'compra',
        referencia_id:   compraSel.id,
        usuario_id:      perfilId ?? null,
      })
      if (errCC) throw errCC

      onPagado()
      onCerrar()
    } catch (err) {
      setError(err.message || 'Error al registrar el pago')
      setGuardando(false)
    }
  }

  return (
    <>
      <div className="panel-backdrop" onClick={onCerrar} />
      <div className="panel">

        {/* ── Header ── */}
        <div className="panel-header">
          <div className="pago-panel-title-wrap">
            <span className="pago-panel-icon">
              <i className="ti ti-building-store" />
            </span>
            <div>
              <h2 className="panel-title">{proveedor.nombre}</h2>
              <p className="pago-panel-sub">
                {fmt$(proveedor.total)} pendiente
                {proveedor.cant > 1 && ` · ${proveedor.cant} compras`}
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onCerrar} title="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>

        {/* ── Body ── */}
        {loading ? (
          <div className="panel-body pago-loading">
            <i className="ti ti-loader-2 spin" />
            Cargando compras...
          </div>
        ) : compras.length === 0 ? (
          <div className="panel-body pago-loading">
            <i className="ti ti-check" style={{ color: 'var(--color-success)' }} />
            No hay compras pendientes para este proveedor.
          </div>
        ) : (
          <form id="pago-compra-form" className="panel-body" onSubmit={handleSubmit}>

            {/* ── Compra a pagar ── */}
            <div className="form-section">
              <p className="form-section-title">
                <i className="ti ti-receipt" /> Compra a pagar
              </p>
              <div className="pago-compras-list">
                {compras.map(c => (
                  <label
                    key={c.id}
                    className={`pago-compra-row${compraSelId === c.id ? ' pago-compra-row--sel' : ''}`}
                  >
                    <input
                      type="radio"
                      name="compra_sel"
                      checked={compraSelId === c.id}
                      onChange={() => selectCompra(c)}
                    />
                    <div className="pago-compra-data">
                      <span className="pago-compra-num">
                        {c.numero_comprobante || c.numero
                          ? (c.numero_comprobante || c.numero)
                          : c.tipo_comprobante}
                      </span>
                      <span className="pago-compra-fecha">
                        {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="pago-compra-right">
                      <span className="pago-compra-total">{fmt$(c.total)}</span>
                      <span className={`badge badge--${c.estado === 'parcial' ? 'warning' : 'neutral'}`}>
                        {c.estado}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* ── Medio de pago ── */}
            <div className="form-section">
              <p className="form-section-title">
                <i className="ti ti-wallet" /> Medio de pago
              </p>
              <div className="medio-pago-grid">
                {MEDIOS.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    className={`medio-btn${medioPago === m.value ? ' medio-btn--sel' : ''}`}
                    onClick={() => setMedioPago(m.value)}
                  >
                    <i className={`ti ${m.icon}`} />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Monto y fecha ── */}
            <div className="form-section">
              <p className="form-section-title">
                <i className="ti ti-coins" /> Detalle del pago
              </p>
              <div className="form-grid">

                <div className="field">
                  <label className="field-label">Monto pagado</label>
                  <input
                    type="number"
                    className="field-input"
                    value={monto}
                    onChange={e => { setMonto(e.target.value); setError(null) }}
                    min="0.01"
                    step="0.01"
                    placeholder="0"
                    required
                  />
                  {esParcial && (
                    <span className="field-hint pago-parcial-hint">
                      <i className="ti ti-alert-triangle" />
                      Pago parcial — resta {fmt$(saldoRestante)}
                    </span>
                  )}
                  {compraSel && montoNum >= Number(compraSel.total) && montoNum > 0 && (
                    <span className="field-hint pago-total-hint">
                      <i className="ti ti-check" />
                      Cancela la deuda completa
                    </span>
                  )}
                </div>

                <div className="field">
                  <label className="field-label">Fecha de pago</label>
                  <input
                    type="date"
                    className="field-input"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    required
                  />
                </div>

                <div className="field col-span-2">
                  <label className="field-label">
                    Referencia
                    <span className="field-opt"> — N° transferencia, cheque, etc. (opcional)</span>
                  </label>
                  <input
                    type="text"
                    className="field-input"
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    placeholder="Ej: TRF-00123456, Cheque #4521..."
                  />
                </div>

              </div>
            </div>

            {error && (
              <div className="error-banner">
                <i className="ti ti-alert-circle" /> {error}
              </div>
            )}

          </form>
        )}

        {/* ── Footer ── */}
        <div className="panel-footer">
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="submit"
            form="pago-compra-form"
            className="btn btn--filled"
            disabled={guardando || !compraSel || montoNum <= 0}
          >
            {guardando
              ? <><i className="ti ti-loader-2 spin" /> Guardando...</>
              : <><i className="ti ti-check" /> Registrar pago</>
            }
          </button>
        </div>

      </div>
    </>
  )
}
