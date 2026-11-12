import { useEffect, useRef, useState } from 'react'
import Scanner from '../components/Scanner'
import AbrirCaja from '../components/AbrirCaja'
import PesoDialog from '../components/PesoDialog'
import { errorText, findByBarcode, registerSale, searchProducts } from '../lib/api'
import { fmtMoney, fmtQty, parseNumber, roundKg } from '../lib/format'
import { useHardwareScanner, useUsbScanner } from '../lib/useHardwareScanner'

const METHODS = [
  ['efectivo', '💵', 'Efectivo'],
  ['debito', '💳', 'Débito'],
  ['credito', '💳', 'Crédito'],
  ['transferencia', '📱', 'Transf. / QR'],
]
const BILLS = [1000, 2000, 5000, 10000, 20000]

const remaining = ({ product, qty }) => roundKg(product.stock - qty)
const isLow = (item) => remaining(item) <= item.product.min_stock
const lowText = (item) =>
  remaining(item) <= 0 ? 'se termina el stock' : `quedan ${fmtQty(remaining(item), item.product.sold_by_weight)}`
const subtotalOf = ({ product, qty }) => Math.round(Number(product.sale_price) * qty * 100) / 100
// Un fiambre cuenta como 1 producto, no como "0,25"
const countOf = ({ product, qty }) => (product.sold_by_weight ? 1 : qty)

/**
 * Con lector USB: en el lugar de la cámara se ve en grande el último producto que se pasó.
 */
function LastScanned({ item, onCamera }) {
  const cameraLink = (
    <button className="btn link" onClick={onCamera}>
      📷 Usar la cámara
    </button>
  )
  if (!item) {
    return (
      <div className="card last-scan waiting">
        <div className="last-scan-icon">▮▯▮▮▯▮</div>
        <strong>Listo para escanear</strong>
        <p className="muted">Pasá el producto por el lector y aparece acá.</p>
        {cameraLink}
      </div>
    )
  }
  const { product, qty } = item
  const byWeight = product.sold_by_weight
  return (
    <div className="card last-scan" key={`${product.id}-${qty}`}>
      <small className="muted">Último producto</small>
      <h2>{product.name}</h2>
      <div className="last-scan-grid">
        <div>
          <span>Precio</span>
          <strong>
            {fmtMoney(product.sale_price)}
            {byWeight ? <small> /kg</small> : null}
          </strong>
        </div>
        <div>
          <span>{byWeight ? 'Peso' : 'Cantidad'}</span>
          <strong>{byWeight ? fmtQty(qty, true) : qty}</strong>
        </div>
        <div>
          <span>Subtotal</span>
          <strong>{fmtMoney(subtotalOf(item))}</strong>
        </div>
        <div>
          <span>Stock después</span>
          <strong className={isLow(item) ? 'warn' : ''}>{fmtQty(remaining(item), byWeight)}</strong>
        </div>
      </div>
      {isLow(item) && <p className="msg error">⚠ Stock bajo: {lowText(item)}</p>}
      {cameraLink}
    </div>
  )
}

/**
 * Flujo de venta en 3 pasos:
 *  1. armar: escanear / buscar productos (se suman a la lista)
 *  2. cobrar: elegir medio de pago, con cuánto paga, vuelto
 *  3. hecha: confirmación y "Nueva venta"
 */
export default function Caja({ active, caja, onCajaChange, onSale, onLoadNewCode }) {
  const [step, setStep] = useState('armar')
  const [cart, setCart] = useState([]) // [{ product, qty }]
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState(null)
  const [lastId, setLastId] = useState(null)
  const [notFound, setNotFound] = useState(null)
  const [noStock, setNoStock] = useState(null) // { product, inCart }
  const [weighing, setWeighing] = useState(null) // { product, initialKg } producto por peso esperando los gramos
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

  const units = cart.reduce((s, i) => s + countOf(i), 0)
  const total = Math.round(cart.reduce((s, i) => s + subtotalOf(i), 0) * 100) / 100
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
    if (product.sold_by_weight) {
      if (product.stock <= 0) {
        setNoStock({ product, inCart: 0 })
        return showToast('Sin stock', 'error')
      }
      // Si ya está en la venta, se abre con el peso cargado para cambiarlo
      return setWeighing({ product, initialKg: idx === -1 ? null : current[idx].qty })
    }
    const qty = (idx === -1 ? 0 : current[idx].qty) + 1
    if (qty > product.stock) {
      setNoStock({ product, inCart: qty - 1 })
      showToast(product.stock <= 0 ? 'Sin stock' : `Solo hay ${fmtQty(product.stock)}`, 'error')
      return
    }
    setLastId(product.id)
    // El último escaneado queda arriba
    const next = [{ product, qty }, ...current.filter((_, i) => i !== idx)]
    cartRef.current = next
    setCart(next)
    showToast(`✔ ${product.name}${qty > 1 ? ` (x${qty})` : ''}`)
  }

  function confirmWeight(kg) {
    const { product } = weighing
    setWeighing(null)
    setLastId(product.id)
    const next = [{ product, qty: kg }, ...cartRef.current.filter((i) => i.product.id !== product.id)]
    cartRef.current = next
    setCart(next)
    showToast(`✔ ${product.name} (${fmtQty(kg, true)})`)
  }

  function removeItem(id) {
    setWeighing(null)
    setCart((c) => c.filter((i) => i.product.id !== id))
  }

  async function addByCode(code) {
    if (document.querySelector('.peso')) return // con la ventana del peso abierta no se suman productos
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
  const usb = useUsbScanner()

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
      onSale?.()
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
    setWeighing(null)
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
          {cart.some(isLow) && (
            <div className="msg error">
              <b>⚠ Hay que reponer:</b>
              {cart.filter(isLow).map((item) => (
                <div key={item.product.id}>
                  {item.product.name}: {lowText(item)}
                </div>
              ))}
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
      ) : usb ? (
        <LastScanned item={cart.find((i) => i.product.id === lastId)} onCamera={() => setScanning(true)} />
      ) : (
        <button className="btn primary block big" onClick={() => setScanning(true)}>
          📷 {cart.length ? 'Escanear más productos' : 'Escanear productos'}
        </button>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}

      {weighing && (
        <PesoDialog
          key={weighing.product.id}
          product={weighing.product}
          initialKg={weighing.initialKg}
          available={Number(weighing.product.stock)}
          onConfirm={confirmWeight}
          onCancel={() => setWeighing(null)}
          onRemove={weighing.initialKg ? () => removeItem(weighing.product.id) : null}
        />
      )}

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
                De <b>{noStock.product.name}</b> solo hay {fmtQty(noStock.product.stock, noStock.product.sold_by_weight)}
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
                <strong>
                  {fmtMoney(p.sale_price)}
                  {p.sold_by_weight ? <small className="muted"> /kg</small> : null}
                </strong>
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
              Los fiambres y productos por peso te piden los <b>gramos</b>, los <b>kilos</b> o el <b>importe</b> en $.
            </li>
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
                    {fmtMoney(product.sale_price)} {product.sold_by_weight ? 'el kg' : 'c/u'} · stock{' '}
                    {fmtQty(product.stock, product.sold_by_weight)}
                  </small>
                  {isLow({ product, qty }) && <small className="warn">⚠ Stock bajo: {lowText({ product, qty })}</small>}
                </div>
                {product.sold_by_weight ? (
                  <div className="qty">
                    <button
                      className="peso-btn"
                      onClick={() => setWeighing({ product, initialKg: qty })}
                      aria-label="Cambiar peso"
                    >
                      ⚖ {fmtQty(qty, true)}
                    </button>
                  </div>
                ) : (
                <div className="qty">
                  <button onClick={() => setQty(product.id, qty - 1)} aria-label="Restar">
                    {qty === 1 ? '🗑' : '−'}
                  </button>
                  <span>{qty}</span>
                  <button onClick={() => setQty(product.id, qty + 1)} aria-label="Sumar">
                    +
                  </button>
                </div>
                )}
                <strong className="subtotal">{fmtMoney(subtotalOf({ product, qty }))}</strong>
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
