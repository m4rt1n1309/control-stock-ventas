import { useEffect, useRef, useState } from 'react'
import Scanner from '../components/Scanner'
import { errorText, findByBarcode, registerSale, searchProducts } from '../lib/api'
import { fmtMoney, parseNumber } from '../lib/format'

const METHODS = [
  ['efectivo', 'Efectivo'],
  ['debito', 'Débito'],
  ['credito', 'Crédito'],
  ['transferencia', 'Transf. / QR'],
]

export default function Caja({ active, onLoadNewCode }) {
  const [cart, setCart] = useState([]) // [{ product, qty }]
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState(null)
  const [notFound, setNotFound] = useState(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [method, setMethod] = useState('efectivo')
  const [paid, setPaid] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const toastTimer = useRef(null)

  const total = cart.reduce((s, i) => s + Number(i.product.sale_price) * i.qty, 0)
  const paidNum = parseNumber(paid)
  const change = method === 'efectivo' && Number.isFinite(paidNum) ? paidNum - total : null

  function showToast(text, type = 'ok') {
    setToast({ text, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }

  function addProduct(product) {
    setMsg(null)
    setCart((c) => {
      const idx = c.findIndex((i) => i.product.id === product.id)
      if (idx === -1) return [{ product, qty: 1 }, ...c]
      const copy = [...c]
      copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 }
      return copy
    })
    showToast(`+1 ${product.name}`)
  }

  async function onScan(code) {
    setNotFound(null)
    try {
      const p = await findByBarcode(code)
      if (p) addProduct(p)
      else {
        setNotFound(code)
        showToast('Código no encontrado', 'error')
      }
    } catch (err) {
      showToast(errorText(err), 'error')
    }
  }

  // Apagar la cámara al salir de la pestaña
  useEffect(() => {
    if (!active) setScanning(false)
  }, [active])

  // Búsqueda manual por nombre (productos sin código o que no se leen)
  useEffect(() => {
    if (q.trim().length < 2) return setResults([])
    const t = setTimeout(() => {
      searchProducts(q, { limit: 8 }).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  function setQty(id, qty) {
    setCart((c) => (qty <= 0 ? c.filter((i) => i.product.id !== id) : c.map((i) => (i.product.id === id ? { ...i, qty } : i))))
  }

  async function confirmSale() {
    if (!cart.length) return
    if (method === 'efectivo' && Number.isFinite(paidNum) && paidNum < total) {
      return setMsg({ type: 'error', text: 'El pago es menor al total' })
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await registerSale(cart, method === 'efectivo' && Number.isFinite(paidNum) ? paidNum : null, method)
      const vuelto = change !== null && change > 0 ? ` · Vuelto ${fmtMoney(change)}` : ''
      setMsg({ type: 'ok', text: `Venta #${res.sale_id} registrada: ${fmtMoney(res.total)}${vuelto}` })
      setCart([])
      setPaid('')
      setMethod('efectivo')
      setNotFound(null)
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      {scanning ? (
        <Scanner onScan={onScan} onClose={() => setScanning(false)} />
      ) : (
        <button className="btn primary block big" onClick={() => setScanning(true)}>
          📷 Escanear productos
        </button>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}

      {notFound && (
        <div className="msg error with-action">
          <span>
            El código <b>{notFound}</b> no está cargado.
          </span>
          <button className="btn small" onClick={() => onLoadNewCode(notFound)}>
            Cargarlo
          </button>
        </div>
      )}

      <div className="search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" type="search" />
        {results.length > 0 && (
          <ul className="list dropdown">
            {results.map((p) => (
              <li
                key={p.id}
                onClick={() => {
                  addProduct(p)
                  setQ('')
                  setResults([])
                }}
              >
                <span>{p.name}</span>
                <strong>{fmtMoney(p.sale_price)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cart.length === 0 ? (
        <p className="empty">El carrito está vacío</p>
      ) : (
        <ul className="list cart">
          {cart.map(({ product, qty }) => (
            <li key={product.id}>
              <div className="cart-info">
                <span>{product.name}</span>
                <small className="muted">
                  {fmtMoney(product.sale_price)} c/u
                  {product.stock - qty < 0 && <span className="neg"> · sin stock registrado</span>}
                </small>
              </div>
              <div className="qty">
                <button onClick={() => setQty(product.id, qty - 1)} aria-label="Restar">
                  −
                </button>
                <span>{qty}</span>
                <button onClick={() => setQty(product.id, qty + 1)} aria-label="Sumar">
                  +
                </button>
              </div>
              <strong className="subtotal">{fmtMoney(product.sale_price * qty)}</strong>
            </li>
          ))}
        </ul>
      )}

      <div className="card checkout">
        <div className="total">
          <span>Total</span>
          <strong>{fmtMoney(total)}</strong>
        </div>

        <div className="segmented">
          {METHODS.map(([v, label]) => (
            <button key={v} className={method === v ? 'active' : ''} onClick={() => setMethod(v)}>
              {label}
            </button>
          ))}
        </div>

        {method === 'efectivo' && (
          <>
            <div className="row2">
              <input value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" placeholder="Paga con…" />
              <button className="btn secondary" onClick={() => setPaid(String(total))} disabled={!total}>
                Justo
              </button>
            </div>
            {change !== null && (
              <div className={`total small ${change < 0 ? 'neg' : ''}`}>
                <span>{change < 0 ? 'Falta' : 'Vuelto'}</span>
                <strong>{fmtMoney(Math.abs(change))}</strong>
              </div>
            )}
          </>
        )}

        {msg && <p className={`msg ${msg.type}`}>{msg.text}</p>}

        <div className="actions">
          <button className="btn secondary" onClick={() => setCart([])} disabled={!cart.length || busy}>
            Vaciar
          </button>
          <button className="btn primary" onClick={confirmSale} disabled={!cart.length || busy}>
            {busy ? 'Registrando…' : 'Cobrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
