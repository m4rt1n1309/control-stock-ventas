import { useState } from 'react'
import { fmtMoney, fmtQty, parseNumber, roundKg } from '../lib/format'

const MODES = [
  ['g', 'Gramos'],
  ['kg', 'Kilos'],
  ['$', 'Por $'],
]
const QUICK = [0.1, 0.25, 0.5, 1] // kilos

/** Valor que se muestra en el campo para una cantidad en kilos, según el modo. */
function toInput(kg, mode, price) {
  if (!kg) return ''
  if (mode === 'g') return String(Math.round(kg * 1000))
  if (mode === 'kg') return String(kg).replace('.', ',')
  return String(Math.round(kg * price * 100) / 100).replace('.', ',')
}

/**
 * Pide el peso de un producto que se vende por kilo.
 * Se puede escribir en gramos, en kilos o por importe ("dame $2000 de jamón").
 * onConfirm(kilos)
 */
export default function PesoDialog({ product, initialKg = null, available, onConfirm, onCancel, onRemove }) {
  const price = Number(product.sale_price) || 0
  const [mode, setMode] = useState('g')
  const [value, setValue] = useState(toInput(initialKg, 'g', price))
  const [error, setError] = useState(null)

  const n = parseNumber(value)
  let kg = NaN
  if (Number.isFinite(n) && n > 0) {
    if (mode === 'g') kg = n / 1000
    else if (mode === 'kg') kg = n
    else if (price > 0) kg = n / price
  }
  kg = roundKg(kg)
  const valid = Number.isFinite(kg) && kg > 0

  function changeMode(m) {
    setValue(valid ? toInput(kg, m, price) : '')
    setMode(m)
    setError(null)
  }

  function submit(e) {
    e?.preventDefault()
    if (!valid) return setError(mode === '$' ? 'Escribí el importe' : 'Escribí el peso')
    if (kg > available) return setError(`Solo hay ${fmtQty(available, true)} en stock`)
    onConfirm(kg)
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <form className="card form peso" onSubmit={submit} onClick={(e) => e.stopPropagation()} data-block-scanner>
        <div className="detail-head">
          <div>
            <h2>{product.name}</h2>
            <p className="muted">
              {fmtMoney(price)} el kilo · stock {fmtQty(product.stock, true)}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="segmented three">
          {MODES.map(([m, label]) => (
            <button type="button" key={m} className={mode === m ? 'active' : ''} onClick={() => changeMode(m)}>
              {label}
            </button>
          ))}
        </div>

        <div className="peso-input">
          {mode === '$' && <span>$</span>}
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            inputMode={mode === 'g' ? 'numeric' : 'decimal'}
            placeholder={mode === 'g' ? 'Ej: 250' : mode === 'kg' ? 'Ej: 1,5' : 'Ej: 2000'}
            autoFocus
          />
          {mode !== '$' && <span>{mode}</span>}
        </div>

        <div className="chips">
          {QUICK.map((q) => (
            <button type="button" key={q} onClick={() => setValue(toInput(q, mode, price))}>
              {fmtQty(q, true)}
            </button>
          ))}
        </div>

        <div className="total">
          <span>{valid ? fmtQty(kg, true) : '—'}</span>
          <strong>{fmtMoney(valid ? Math.round(kg * price * 100) / 100 : 0)}</strong>
        </div>

        {error && <p className="msg error">{error}</p>}

        <div className="actions">
          {onRemove ? (
            <button type="button" className="btn danger-outline" onClick={onRemove}>
              🗑 Quitar
            </button>
          ) : (
            <button type="button" className="btn secondary" onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button className="btn primary">{initialKg ? 'Cambiar' : 'Agregar'}</button>
        </div>
      </form>
    </div>
  )
}
