import { useState } from 'react'
import './ArqueoModal.css'

const BILLETES = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20]
const MONEDAS  = [10, 5, 2, 1]

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

function calcTotal(cantidades) {
  return [...BILLETES, ...MONEDAS]
    .reduce((sum, d) => sum + d * (Number(cantidades[d]) || 0), 0)
}

export default function ArqueoModal({ titulo = 'Arqueo de efectivo', onConfirmar, onCerrar }) {
  const [cantidades, setCantidades] = useState({})

  const total = calcTotal(cantidades)

  function setCant(den, val) {
    const n = val === '' ? '' : Math.max(0, Math.floor(Number(val)))
    setCantidades(prev => ({ ...prev, [den]: n }))
  }

  return (
    <>
      <div className="arqueo-backdrop" onClick={onCerrar} />
      <div className="arqueo-modal" role="dialog" aria-modal="true">

        <div className="arqueo-header">
          <div className="arqueo-header-info">
            <span className="arqueo-icon"><i className="ti ti-cash" /></span>
            <div>
              <h2 className="arqueo-title">{titulo}</h2>
              <p className="arqueo-subtitle">Ingresá la cantidad de cada billete y moneda</p>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onCerrar} title="Cerrar">
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="arqueo-body">
          <div className="arqueo-section-label">Billetes</div>
          {BILLETES.map(den => {
            const qty = cantidades[den] ?? ''
            const sub = den * (Number(qty) || 0)
            return (
              <div key={den} className="arqueo-row">
                <span className="arqueo-den">{fmt$(den)}</span>
                <span className="arqueo-mult">×</span>
                <input
                  className="arqueo-qty"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={qty}
                  onChange={e => setCant(den, e.target.value)}
                />
                <span className="arqueo-eq">=</span>
                <span className={`arqueo-sub${sub > 0 ? ' arqueo-sub--pos' : ''}`}>
                  {sub > 0 ? fmt$(sub) : '—'}
                </span>
              </div>
            )
          })}

          <div className="arqueo-section-label" style={{ marginTop: 14 }}>Monedas</div>
          {MONEDAS.map(den => {
            const qty = cantidades[den] ?? ''
            const sub = den * (Number(qty) || 0)
            return (
              <div key={den} className="arqueo-row">
                <span className="arqueo-den">{fmt$(den)}</span>
                <span className="arqueo-mult">×</span>
                <input
                  className="arqueo-qty"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={qty}
                  onChange={e => setCant(den, e.target.value)}
                />
                <span className="arqueo-eq">=</span>
                <span className={`arqueo-sub${sub > 0 ? ' arqueo-sub--pos' : ''}`}>
                  {sub > 0 ? fmt$(sub) : '—'}
                </span>
              </div>
            )
          })}
        </div>

        <div className="arqueo-total-bar">
          <span className="arqueo-total-label">Total contado</span>
          <span className="arqueo-total-val">{fmt$(total)}</span>
        </div>

        <div className="arqueo-footer">
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--filled"
            onClick={() => onConfirmar(total)}
          >
            <i className="ti ti-check" /> Confirmar {fmt$(total)}
          </button>
        </div>

      </div>
    </>
  )
}
