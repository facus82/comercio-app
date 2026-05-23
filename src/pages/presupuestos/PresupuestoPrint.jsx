import { useEffect, useRef } from 'react'
import './PresupuestoPrint.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(v || 0)

function fmtFecha(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

export default function PresupuestoPrint({ presupuesto, comercio, onCerrar }) {
  const { pres, items } = presupuesto
  const nombreComercio = comercio?.nombre_fantasia || comercio?.nombre || ''
  const nombreCliente  = pres.cliente_nombre ||
    (pres.cliente ? `${pres.cliente.nombre} ${pres.cliente.apellido || ''}`.trim() : '')

  // Cerrar con Escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  function imprimir() { window.print() }

  return (
    <>
      {/* Botones de control — se ocultan al imprimir */}
      <div className="print-toolbar no-print">
        <button className="btn btn--primary" onClick={imprimir}>
          <i className="ti ti-printer" /> Imprimir / Guardar PDF
        </button>
        <button className="btn" onClick={onCerrar}>
          <i className="ti ti-x" /> Cerrar
        </button>
      </div>

      {/* Documento */}
      <div className="print-doc">

        {/* Encabezado */}
        <div className="print-header">
          <div className="print-header-left">
            {comercio?.logo_url && (
              <img src={comercio.logo_url} alt="Logo" className="print-logo" />
            )}
            <div className="print-comercio-info">
              <p className="print-comercio-nombre">{nombreComercio}</p>
              {comercio?.cuit       && <p>CUIT: {comercio.cuit}</p>}
              {comercio?.condicion_iva && <p>Cond. IVA: {comercio.condicion_iva}</p>}
              {comercio?.direccion  && <p>{comercio.direccion}</p>}
              {comercio?.localidad  && <p>{comercio.localidad}{comercio.provincia ? `, ${comercio.provincia}` : ''}</p>}
              {comercio?.telefono   && <p>Tel.: {comercio.telefono}</p>}
            </div>
          </div>
          <div className="print-header-right">
            <p className="print-doc-tipo">PRESUPUESTO</p>
            <p className="print-doc-numero">{pres.numero || '—'}</p>
            <table className="print-meta">
              <tbody>
                <tr><td>Fecha</td><td>{fmtFecha(pres.fecha)}</td></tr>
                <tr><td>Válido hasta</td><td>{fmtFecha(pres.fecha_vencimiento)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Cliente */}
        {nombreCliente && (
          <div className="print-cliente">
            <p className="print-section-label">Cliente</p>
            <p className="print-cliente-nombre">{nombreCliente}</p>
          </div>
        )}

        {/* Tabla de ítems */}
        <table className="print-items">
          <thead>
            <tr>
              <th className="print-th-desc">Descripción</th>
              <th className="print-th-num">Cant.</th>
              <th className="print-th-num">Precio unit.</th>
              <th className="print-th-num">Desc. %</th>
              <th className="print-th-num">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id || i}>
                <td>{it.descripcion}</td>
                <td className="print-td-num">{it.cantidad}</td>
                <td className="print-td-num">{fmt$(it.precio_unitario)}</td>
                <td className="print-td-num">{it.descuento_pct > 0 ? `${it.descuento_pct}%` : '—'}</td>
                <td className="print-td-num">{fmt$(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div className="print-totales">
          <div className="print-total-row">
            <span>Subtotal</span>
            <span>{fmt$(pres.subtotal)}</span>
          </div>
          {pres.descuento_monto > 0 && (
            <div className="print-total-row">
              <span>Descuento</span>
              <span>−{fmt$(pres.descuento_monto)}</span>
            </div>
          )}
          <div className="print-total-row print-total-row--final">
            <span>TOTAL</span>
            <span>{fmt$(pres.total)}</span>
          </div>
        </div>

        {/* Notas */}
        {pres.notas && (
          <div className="print-notas">
            <p className="print-section-label">Observaciones</p>
            <p>{pres.notas}</p>
          </div>
        )}

        {/* Pie */}
        <div className="print-pie">
          {comercio?.ticket_pie || ''}
        </div>
      </div>
    </>
  )
}
