import { useEffect, useState } from 'react'
import ProductForm from './ProductForm'
import { addStock, deleteProduct, errorText, getMovements, updateProduct } from '../lib/api'
import { fmtDateTime, fmtMoney } from '../lib/format'

const TYPE_LABEL = { entrada: 'Entrada', venta: 'Venta', ajuste: 'Ajuste' }

/** Ficha de producto: ver datos, sumar/restar stock, editar y eliminar. */
export default function ProductDetail({ product, categories, onChange, onDeleted, onClose }) {
  const [editing, setEditing] = useState(false)
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [movements, setMovements] = useState([])

  useEffect(() => {
    getMovements(product.id).then(setMovements).catch(() => {})
  }, [product.id, product.stock])

  async function changeStock(sign) {
    const n = parseInt(qty, 10)
    if (!n || n <= 0) return setMsg({ type: 'error', text: 'Ingresá una cantidad' })
    setBusy(true)
    setMsg(null)
    try {
      const stock = await addStock(product.id, sign * n, note.trim() || null)
      onChange({ ...product, stock })
      setMsg({ type: 'ok', text: `${sign > 0 ? 'Se sumaron' : 'Se restaron'} ${n} unidades. Stock: ${stock}` })
      setQty('')
      setNote('')
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
          <span className="muted">Venta</span>
          <strong>{fmtMoney(product.sale_price)}</strong>
        </div>
        <div>
          <span className="muted">Costo</span>
          <strong>{fmtMoney(product.cost_price)}</strong>
        </div>
        <div className={low ? 'danger' : ''}>
          <span className="muted">Stock</span>
          <strong>{product.stock}</strong>
        </div>
      </div>
      {low && <p className="msg error">Stock bajo (mínimo {product.min_stock})</p>}

      <h3>Mover stock</h3>
      <div className="row2">
        <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" placeholder="Cantidad" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" />
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={() => changeStock(-1)} disabled={busy}>
          − Restar
        </button>
        <button className="btn primary" onClick={() => changeStock(1)} disabled={busy}>
          + Sumar
        </button>
      </div>

      {msg && <p className={`msg ${msg.type}`}>{msg.text}</p>}

      <div className="actions">
        <button className="btn danger-outline" onClick={remove} disabled={busy}>
          Eliminar
        </button>
        <button className="btn secondary" onClick={() => setEditing(true)} disabled={busy}>
          Editar datos / precio
        </button>
      </div>

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
                  {m.quantity}
                </strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
