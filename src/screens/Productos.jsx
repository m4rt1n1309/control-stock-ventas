import { useEffect, useRef, useState } from 'react'
import ProductDetail from '../components/ProductDetail'
import { errorText, getCategories, searchAllProducts, updatePricesByPercent } from '../lib/api'
import { fmtMoney, fmtQty, parseNumber } from '../lib/format'

const SHOW_STEP = 200

export default function Productos({ readOnly = false, initialLowOnly = false, onStockChange }) {
  const [q, setQ] = useState('')
  const [lowOnly, setLowOnly] = useState(initialLowOnly)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [categories, setCategories] = useState([])
  const [showBulk, setShowBulk] = useState(false)

  const [visible, setVisible] = useState(SHOW_STEP)
  const lastRequest = useRef(0)

  async function load() {
    const request = ++lastRequest.current // si se sigue escribiendo, solo vale la última búsqueda
    setLoading(true)
    setError(null)
    try {
      const rows = await searchAllProducts(q)
      if (request === lastRequest.current) setItems(rows)
    } catch (err) {
      if (request === lastRequest.current) setError(errorText(err))
    } finally {
      if (request === lastRequest.current) setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    setVisible(SHOW_STEP)
  }, [q, lowOnly])

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  if (selected) {
    return (
      <div className="screen">
        <ProductDetail
          readOnly={readOnly}
          product={selected}
          categories={categories}
          onChange={(p) => {
            setSelected(p)
            setItems((list) => list.map((i) => (i.id === p.id ? p : i)))
            onStockChange?.()
          }}
          onDeleted={() => {
            setItems((list) => list.filter((i) => i.id !== selected.id))
            setSelected(null)
            onStockChange?.()
          }}
          onClose={() => setSelected(null)}
        />
      </div>
    )
  }

  const shown = lowOnly ? items.filter((p) => p.stock <= p.min_stock) : items
  const lowCount = items.filter((p) => p.stock <= p.min_stock).length

  return (
    <div className="screen">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código…" type="search" />

      <div className="toolbar">
        <label className="check">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Stock bajo {lowCount > 0 && <span className="badge">{lowCount}</span>}
        </label>
        {!readOnly && (
          <button className="btn small secondary" onClick={() => setShowBulk(!showBulk)}>
            % Aumentar precios
          </button>
        )}
      </div>

      {showBulk && !readOnly && (
        <BulkPrices
          categories={categories}
          onDone={() => {
            setShowBulk(false)
            load()
          }}
        />
      )}

      {error && <p className="msg error">{error}</p>}
      {loading && !items.length && <p className="empty">Cargando…</p>}
      {!loading && !shown.length && <p className="empty">No hay productos</p>}

      <ul className="list products">
        {shown.slice(0, visible).map((p) => (
          <li key={p.id} onClick={() => setSelected(p)}>
            <div>
              <span>{p.name}</span>
              <small className="muted">
                {p.category || 'Sin categoría'} · {fmtMoney(p.sale_price)}
                {p.sold_by_weight ? ' /kg' : ''}
              </small>
            </div>
            <strong className={p.stock <= p.min_stock ? 'neg' : ''}>{fmtQty(p.stock, p.sold_by_weight)}</strong>
          </li>
        ))}
      </ul>
      {shown.length > visible && (
        <button className="btn secondary block" onClick={() => setVisible(visible + SHOW_STEP)}>
          Ver más ({shown.length - visible} restantes)
        </button>
      )}
      <p className="muted center">{shown.length} productos</p>
    </div>
  )
}

function BulkPrices({ categories, onDone }) {
  const [percent, setPercent] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function apply() {
    const p = parseNumber(percent)
    if (!Number.isFinite(p) || p === 0) return setMsg({ type: 'error', text: 'Ingresá un porcentaje (ej: 10 o -5)' })
    const target = category || 'TODOS los productos'
    if (!confirm(`¿Cambiar ${p > 0 ? '+' : ''}${p}% el precio de venta de ${target}?`)) return
    setBusy(true)
    try {
      const n = await updatePricesByPercent(p, category)
      alert(`Se actualizaron ${n} productos`)
      onDone()
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) })
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>Cambiar precios por porcentaje</h3>
      <div className="row2">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" placeholder="% (ej: 10)" />
      </div>
      {msg && <p className={`msg ${msg.type}`}>{msg.text}</p>}
      <button className="btn primary block" onClick={apply} disabled={busy}>
        Aplicar
      </button>
    </div>
  )
}
