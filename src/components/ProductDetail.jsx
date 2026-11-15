import { useEffect, useState } from 'react'
import ProductForm from './ProductForm'
import { addStock, deleteProduct, errorText, getMovements, updateProduct } from '../lib/api'
import { expiryInfo, fmtDateTime, fmtMoney, fmtQty, parseNumber } from '../lib/format'

const TYPE_LABEL = { entrada: 'Entrada', venta: 'Venta', ajuste: 'Ajuste' }

/** Ficha de producto: ver datos, sumar/restar stock, editar y eliminar. */
export default function ProductDetail({ product, categories, onChange, onDeleted, onClose, readOnly = false }) {
  const [editing, setEditing] = useState(false)
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [expires, setExpires] = useState('') // vencimiento del lote que entra
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [movements, setMovements] = useState([])
  const byWeight = product.sold_by_weight

  useEffect(() => {
    getMovements(product.id).then(setMovements).catch(() => {})
  }, [product.id, product.stock])

  async function changeStock(sign) {
    const raw = parseNumber(qty)
    const n = byWeight ? Math.round(raw * 1000) / 1000 : raw
    if (!Number.isFinite(n) || n <= 0) return setMsg({ type: 'error', text: 'Ingresá una cantidad' })
    if (!byWeight && !Number.isInteger(n)) return setMsg({ type: 'error', text: 'Este producto va por unidad: usá números enteros' })
    setBusy(true)
    setMsg(null)
    try {
      const stock = await addStock(product.id, sign * n, note.trim() || null)
      let updated = { ...product, stock }
      if (sign > 0 && expires) {
        // Se guarda el vencimiento más próximo: si todavía queda mercadería vieja, manda la fecha más cercana
        const keepOld = Number(product.stock) > 0 && product.expires_on && product.expires_on < expires
        if (!keepOld && product.expires_on !== expires) {
          updated = { ...(await updateProduct(product.id, { expires_on: expires })), stock }
        }
      }
      onChange(updated)
      setMsg({
        type: 'ok',
        text: `${sign > 0 ? 'Se sumaron' : 'Se restaron'} ${byWeight ? fmtQty(n, true) : `${n} unidades`}. Stock: ${fmtQty(stock, byWeight)}`,
      })
      setQty('')
      setNote('')
      setExpires('')
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar "${product.name}"? Las ventas pasadas se conservan.`)) return
    setBusy(true)
    try {
      await deleteProduct(product.id)
      onDeleted?.()
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) })
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <ProductForm
        initial={product}
        categories={categories}
        onCancel={() => setEditing(false)}
        onSave={async (values) => {
          const updated = await updateProduct(product.id, values)
          onChange(updated)
          setEditing(false)
          setMsg({ type: 'ok', text: 'Producto actualizado' })
        }}
      />
    )
  }

  const low = product.stock <= product.min_stock
  const exp = expiryInfo(product.expires_on)

  return (
    <div className="card">
      <div className="detail-head">
        <div>
          <h2>{product.name}</h2>
          <p className="muted">
            {product.barcode || 'Sin código'}
            {product.category ? ` · ${product.category}` : ''}
          </p>
        </div>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        )}
      </div>

      <div className="stats">
        <div>
          <span className="muted">Venta{byWeight ? ' x kg' : ''}</span>
          <strong>{fmtMoney(product.sale_price)}</strong>
        </div>
        <div>
          <span className="muted">Costo</span>
          <strong>{fmtMoney(product.cost_price)}</strong>
        </div>
        <div className={low ? 'danger' : ''}>
          <span className="muted">Stock</span>
          <strong>{fmtQty(product.stock, byWeight)}</strong>
        </div>
      </div>
      {low && <p className="msg error">Stock bajo (mínimo {fmtQty(product.min_stock, byWeight)})</p>}
      {exp && <p className={`msg ${exp.level === 'neg' ? 'error' : 'info'}`}>📅 {exp.text}</p>}

      {!readOnly && (
        <>
          <h3>Mover stock</h3>
          <div className="row2">
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode={byWeight ? 'decimal' : 'numeric'}
              placeholder={byWeight ? 'Kilos (ej: 2,5)' : 'Cantidad'}
            />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" />
          </div>
          <label>
            Vence lo que entra (opcional, solo al sumar)
            <input type="date" className="date-input" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <div className="actions">
            <button className="btn secondary" onClick={() => changeStock(-1)} disabled={busy}>
              − Restar
            </button>
            <button className="btn primary" onClick={() => changeStock(1)} disabled={busy}>
              + Sumar
            </button>
          </div>
        </>
      )}

      {msg && <p className={`msg ${msg.type}`}>{msg.text}</p>}

      {!readOnly && (
        <div className="actions">
          <button className="btn danger-outline" onClick={remove} disabled={busy}>
            Eliminar
          </button>
          <button className="btn secondary" onClick={() => setEditing(true)} disabled={busy}>
            Editar datos / precio
          </button>
        </div>
      )}

      {movements.length > 0 && (
        <>
          <h3>Últimos movimientos</h3>
          <ul className="list compact">
            {movements.map((m) => (
              <li key={m.id}>
                <span>
                  {TYPE_LABEL[m.type]} {m.note ? <span className="muted">· {m.note}</span> : null}
                  <br />
                  <small className="muted">{fmtDateTime(m.created_at)}</small>
                </span>
                <strong className={m.quantity < 0 ? 'neg' : 'pos'}>
                  {m.quantity > 0 ? '+' : ''}
                  {fmtQty(m.quantity, byWeight)}
                </strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
