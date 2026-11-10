import { useEffect, useRef, useState } from 'react'
import Scanner from '../components/Scanner'
import AbrirCaja from '../components/AbrirCaja'
import { errorText, findByBarcode, registerSale, searchProducts } from '../lib/api'
import { fmtMoney, parseNumber } from '../lib/format'
import { useHardwareScanner } from '../lib/useHardwareScanner'

const METHODS = [
  ['efectivo', '💵', 'Efectivo'],
  ['debito', '💳', 'Débito'],
  ['credito', '💳', 'Crédito'],
  ['transferencia', '📱', 'Transf. / QR'],
]
const BILLS = [1000, 2000, 5000, 10000, 20000]

/**
 * Flujo de venta en 3 pasos:
 *  1. armar: escanear / buscar productos (se suman a la lista)
 *  2. cobrar: elegir medio de pago, con cuánto paga, vuelto
 *  3. hecha: confirmación y "Nueva venta"
 */
export default function Caja({ active, caja, onCajaChange, onLoadNewCode }) {
  const [step, setStep] = useState('armar')
  const [cart, setCart] = useState([]) // [{ product, qty }]
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState(null)
  const [lastId, setLastId] = useState(null)
  const [notFound, setNotFound] = useState(null)
  const [noStock, setNoStock] = useState(null) // { product, inCart }
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [method, setMethod] = useState('efectivo')
  const [paid, setPaid] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null) // { id, total, change }
  const toastTimer = useRef(null)
  // Siempre la lista más nueva: con el lector USB pueden entrar dos lecturas seguidas
  const cartRef = useRef(cart)
  cartRef.current = cart

  const units = cart.reduce((s, i) => s + i.qty, 0)
  const total = cart.reduce((s, i) => s + Number(i.product.sale_price) * i.qty, 0)
  const paidNum = parseNumber(paid)
  const hasPaid = method === 'efectivo' && Number.isFinite(paidNum)
  const change = hasPaid ? paidNum - total : null

  // Apagar la cámara al salir de la pestaña o si se cierra la caja
  useEffect(() => {
    if (!active || caja === null) setScanning(false)
  }, [active, caja])

  // Si cerraron la caja (desde otro celular) mientras se cobraba, volver al paso 1
  useEffect(() => {
    if (caja === null && step === 'cobrar') setStep('armar')
  }, [caja, step])

  function showToast(text, type = 'ok') {
    setToast({ text, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }

  function addProduct(product) {
    setNotFound(null)
    setNoStock(null)
    const current = cartRef.current
    const idx = current.findIndex((i) => i.product.id === product.id)
    const qty = (idx === -1 ? 0 : current[idx].qty) + 1
    if (qty > product.stock) {
      setNoStock({ product, inCart: qty - 1 })
      showToast(product.stock <= 0 ? 'Sin stock' : `Solo hay ${product.stock}`, 'error')
      return
    }
    setLastId(product.id)
    // El último escaneado queda arriba
    const next = [{ product, qty }, ...current.filter((_, i) => i !== idx)]
    cartRef.current = next
    setCart(next)
    showToast(`✔ ${product.name}${qty > 1 ? ` (x${qty})` : ''}`)
  }

  async function addByCode(code) {
    try {
      const p = await findByBarcode(code)
      if (p) addProduct(p)
      else {
        setNotFound(code)
        showToast('Código no cargado', 'error')
      }
    } catch (err) {
      showToast(errorText(err), 'error')
    }
  }

  useHardwareScanner(addByCode, active && step === 'armar' && Boolean(caja))

  // Búsqueda manual por nombre
  useEffect(() => {
    if (q.trim().length < 2 || /^\d+$/.test(q.trim())) return setResults([])
    const t = setTimeout(() => {
      searchProducts(q, { limit: 8 }).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  function onSearchSubmit(e) {
    e.preventDefault()
    const v = q.trim()
    if (/^\d{4,}$/.test(v)) {
      addByCode(v) // escribió el número del código
      setQ('')
    } else if (results.length === 1) {
      addProduct(results[0])
      setQ('')
      setResults([])
    }
  }

  function setQty(id, qty) {
    const item = cart.find((i) => i.product.id === id)
    if (item && qty > item.product.stock) {
      setNoStock({ product: item.product, inCart: item.qty })
      showToast(`Solo hay ${item.product.stock}`, 'error')
      return
    }
    setNoStock(null)
    setCart((c) => (qty <= 0 ? c.filter((i) => i.product.id !== id) : c.map((i) => (i.product.id === id ? { ...i, qty } : i))))
  }

  function goToPay() {
    setScanning(false)
    setError(null)
    setStep('cobrar')
  }

  async function confirmSale() {
    if (hasPaid && paidNum < total) return setError('Con eso no alcanza para el total')
    setBusy(true)
    setError(null)
    try {
      const res = await registerSale(cart, hasPaid ? paidNum : null, method)
      setDone({ id: res.sale_id, total: res.total, change: hasPaid ? paidNum - Number(res.total) : null })
      setStep('hecha')
    } catch (err) {
      setError(errorText(err))
      if (/caja está cerrada/i.test(err?.message || '')) onCajaChange(null)
    } finally {
      setBusy(false)
    }
  }

  function newSale() {
    setCart([])
    setPaid('')
    setMethod('efectivo')
    setNotFound(null)
    setNoStock(null)
    setDone(null)
    setLastId(null)
    setStep('armar')
  }

  // ---------- Paso 3: venta registrada ----------
  if (step === 'hecha' && done) {
    return (
      <div className="screen">
        <div className="card done">
          <div className="done-icon">✔</div>
          <h2>Venta registrada</h2>
          <p className="muted">Venta #{done.id}</p>
          <div className="big-amount">{fmtMoney(done.total)}</div>
          {done.change > 0 && (
            <div className="change-box">
              Vuelto: <strong>{fmtMoney(done.change)}</strong>
            </div>
          )}
          <button className="btn primary block big" onClick={newSale}>
            🛒 Nueva venta
          </button>
        </div>
      </div>
    )
  }

  // ---------- Paso 2: cobrar ----------
  if (step === 'cobrar') {
    return (
      <div className="screen">
        <div className="card pay">
          <p className="muted center">
            {units} {units === 1 ? 'producto' : 'productos'}
          </p>
          <div className="big-amount">{fmtMoney(total)}</div>

          <h3>¿Cómo paga?</h3>
          <div className="method-grid">
            {METHODS.map(([v, icon, label]) => (
              <button key={v} className={method === v ? 'active' : ''} onClick={() => setMethod(v)}>
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </div>

          {method === 'efectivo' && (
            <>
              <h3>¿Con cuánto paga?</h3>
              <input
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                inputMode="decimal"
                placeholder="Monto (opcional)"
              />
              <div className="chips">
                <button onClick={() => setPaid(String(total))}>Justo</button>
                {BILLS.filter((b) => b >= total / 4).map((b) => (
                  <button key={b} onClick={() => setPaid(String(b))}>
                    {fmtMoney(b).replace(/,00$/, '')}
                  </button>
                ))}
              </div>
              {change !== null && (
                <div className={`change-box ${change < 0 ? 'neg' : ''}`}>
                  {change < 0 ? 'Falta' : 'Vuelto'}: <strong>{fmtMoney(Math.abs(change))}</strong>
                </div>
              )}
            </>
          )}

          {error && <p className="msg error">{error}</p>}

          <button className="btn success block big" onClick={confirmSale} disabled={busy}>
            {busy ? 'Registrando…' : '✔ Confirmar venta'}
          </button>
          <button className="btn secondary block" onClick={() => setStep('armar')} disabled={busy}>
            ← Volver y agregar más productos
          </button>
        </div>
      </div>
    )
  }

  // ---------- Caja cerrada: hay que abrirla para vender ----------
  if (caja === null) {
    return (
      <div className="screen">
        <AbrirCaja onOpened={onCajaChange} />
        {cart.length > 0 && (
          <p className="msg info">Tenés {units} productos en la venta: se mantienen cuando abras la caja.</p>
        )}
      </div>
    )
  }

  // ---------- Paso 1: armar la venta ----------
  return (
    <div className={`screen ${cart.length ? 'with-paybar' : ''}`}>
      {scanning ? (
        <Scanner
          onScan={addByCode}
          onClose={() => setScanning(false)}
          hint="Escaneá los productos uno por uno: cada uno se suma a la lista"
        />
      ) : (
        <button className="btn primary block big" onClick={() => setScanning(true)}>
          📷 {cart.length ? 'Escanear más productos' : 'Escanear productos'}
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

      {noStock && (
        <div className="msg error with-action">
          <span>
            {noStock.product.stock <= 0 ? (
              <>
                <b>{noStock.product.name}</b> no tiene stock.
              </>
            ) : (
              <>
                De <b>{noStock.product.name}</b> solo hay {noStock.product.stock}
                {noStock.inCart > 0 ? ' y ya están en la venta' : ''}.
              </>
            )}
          </span>
          {noStock.product.barcode && (
            <button className="btn small" onClick={() => onLoadNewCode(noStock.product.barcode)}>
              Cargar stock
            </button>
          )}
        </div>
      )}

      <form className="search" onSubmit={onSearchSubmit}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔎 Buscar por nombre o escribir el código"
          type="search"
          enterKeyHint="search"
        />
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
      </form>

      {cart.length === 0 ? (
        <div className="card how-to">
          <h3>Cómo hacer una venta</h3>
          <ol>
            <li>
              Tocá <b>Escanear productos</b> y pasá <b>todos</b> los productos, uno por uno. Con lector USB no hace falta
              tocar nada: pasalos directamente.
            </li>
            <li>Se van sumando a la lista. Si pasás dos veces el mismo, suma cantidad.</li>
            <li>
              Cuando terminás, tocá <b>Cobrar</b>.
            </li>
          </ol>
        </div>
      ) : (
        <>
          <div className="list-head">
            <h3>Productos en esta venta</h3>
            <button className="btn link" onClick={() => confirm('¿Vaciar la venta?') && newSale()}>
              Vaciar
            </button>
          </div>
          <ul className="list cart">
            {cart.map(({ product, qty }) => (
              <li key={product.id} className={product.id === lastId ? 'just-added' : ''}>
                <div className="cart-info">
                  <span>{product.name}</span>
                  <small className="muted">
                    {fmtMoney(product.sale_price)} c/u · stock {product.stock}
                  </small>
                </div>
                <div className="qty">
                  <button onClick={() => setQty(product.id, qty - 1)} aria-label="Restar">
                    {qty === 1 ? '🗑' : '−'}
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
        </>
      )}

      {cart.length > 0 && (
        <div className="paybar">
          <div>
            <small>
              {units} {units === 1 ? 'producto' : 'productos'}
            </small>
            <strong>{fmtMoney(total)}</strong>
          </div>
          <button className="btn success big" onClick={goToPay}>
            Cobrar →
          </button>
        </div>
      )}
    </div>
  )
}
