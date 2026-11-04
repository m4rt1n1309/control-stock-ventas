import { useEffect, useState } from 'react'
import Scanner from '../components/Scanner'
import ProductForm from '../components/ProductForm'
import ProductDetail from '../components/ProductDetail'
import { createProduct, errorText, findByBarcode, getCategories, lookupOpenFoodFacts } from '../lib/api'

/**
 * Escanear un código: si el producto existe muestra la ficha (sumar stock, editar),
 * si no existe abre el formulario de alta con el código ya cargado.
 */
export default function Cargar({ initialCode, onCodeConsumed }) {
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState('')
  const [loading, setLoading] = useState(false)
  const [product, setProduct] = useState(null)
  const [draft, setDraft] = useState(null) // { initial, notice }
  const [categories, setCategories] = useState([])
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  useEffect(() => {
    if (initialCode) {
      lookup(initialCode)
      onCodeConsumed()
    }
  }, [initialCode])

  function reset() {
    setProduct(null)
    setDraft(null)
    setMsg(null)
  }

  async function lookup(raw) {
    const code = String(raw).trim()
    if (!code) return
    setScanning(false)
    reset()
    setManual('')
    setLoading(true)
    try {
      const existing = await findByBarcode(code)
      if (existing) {
        setProduct(existing)
      } else {
        const off = await lookupOpenFoodFacts(code)
        setDraft({
          initial: { barcode: code, name: off?.name ?? '' },
          notice: off ? 'Producto nuevo. Nombre sugerido por Open Food Facts, revisalo.' : 'Producto nuevo, completá los datos.',
        })
      }
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) })
    } finally {
      setLoading(false)
    }
  }

  async function saveNew(values) {
    const created = await createProduct(values)
    setDraft(null)
    setProduct(created)
    setMsg({ type: 'ok', text: 'Producto creado ✔' })
    if (created.category && !categories.includes(created.category)) {
      setCategories([...categories, created.category].sort())
    }
  }

  const idle = !scanning && !loading && !product && !draft

  return (
    <div className="screen">
      {scanning ? (
        <Scanner onScan={lookup} onClose={() => setScanning(false)} />
      ) : (
        <button className="btn primary block big" onClick={() => { reset(); setScanning(true) }}>
          📷 {product || draft ? 'Escanear otro' : 'Escanear código'}
        </button>
      )}

      {idle && (
        <div className="card">
          <form
            className="row2"
            onSubmit={(e) => {
              e.preventDefault()
              lookup(manual)
            }}
          >
            <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" placeholder="O escribí el código" />
            <button className="btn secondary">Buscar</button>
          </form>
          <button
            className="btn link"
            onClick={() => setDraft({ initial: {}, notice: 'Producto sin código de barras (ej: suelto, fiambre).' })}
          >
            + Crear producto sin código
          </button>
        </div>
      )}

      {loading && <p className="empty">Buscando…</p>}
      {msg && <p className={`msg ${msg.type}`}>{msg.text}</p>}

      {draft && (
        <ProductForm
          isNew
          initial={draft.initial}
          notice={draft.notice}
          categories={categories}
          onSave={saveNew}
          onCancel={reset}
        />
      )}

      {product && (
        <ProductDetail
          product={product}
          categories={categories}
          onChange={setProduct}
          onDeleted={() => {
            reset()
            setMsg({ type: 'ok', text: 'Producto eliminado' })
          }}
          onClose={reset}
        />
      )}
    </div>
  )
}
