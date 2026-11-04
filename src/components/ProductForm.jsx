import { useState } from 'react'
import { errorText } from '../lib/api'
import { parseNumber, fmtMoney } from '../lib/format'

/**
 * Formulario de alta / edición de producto.
 * onSave(values) debe devolver una promesa; si falla, se muestra el error.
 */
export default function ProductForm({ initial = {}, isNew = false, categories = [], onSave, onCancel, notice }) {
  const [f, setF] = useState({
    barcode: initial.barcode ?? '',
    name: initial.name ?? '',
    category: initial.category ?? '',
    cost_price: initial.cost_price ?? '',
    sale_price: initial.sale_price ?? '',
    min_stock: initial.min_stock ?? '',
    stock: initial.stock ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const cost = parseNumber(f.cost_price)
  const sale = parseNumber(f.sale_price)
  const margin = cost > 0 && sale > 0 ? ((sale - cost) / cost) * 100 : null

  async function submit(e) {
    e.preventDefault()
    setError(null)
    const values = {
      barcode: f.barcode.trim() || null,
      name: f.name.trim(),
      category: f.category.trim() || null,
      cost_price: Number.isFinite(cost) ? cost : 0,
      sale_price: sale,
      min_stock: parseInt(f.min_stock, 10) || 0,
    }
    if (isNew) values.stock = parseInt(f.stock, 10) || 0
    if (!values.name) return setError('Falta el nombre')
    if (!Number.isFinite(sale) || sale < 0) return setError('Precio de venta inválido')

    setSaving(true)
    try {
      await onSave(values)
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{isNew ? 'Nuevo producto' : 'Editar producto'}</h2>
      {notice && <p className="msg info">{notice}</p>}

      <label>
        Código de barras
        <input value={f.barcode} onChange={set('barcode')} inputMode="numeric" placeholder="(sin código)" />
      </label>
      <label>
        Nombre *
        <input value={f.name} onChange={set('name')} required autoFocus={isNew && !f.name} />
      </label>
      <label>
        Categoría
        <input value={f.category} onChange={set('category')} list="categories" placeholder="Ej: Bebidas, Golosinas" />
        <datalist id="categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <div className="row2">
        <label>
          Precio costo
          <input value={f.cost_price} onChange={set('cost_price')} inputMode="decimal" placeholder="0" />
        </label>
        <label>
          Precio venta *
          <input value={f.sale_price} onChange={set('sale_price')} inputMode="decimal" placeholder="0" required />
        </label>
      </div>
      {margin !== null && (
        <p className="hint">
          Ganancia: {fmtMoney(sale - cost)} ({margin.toFixed(0)}%)
        </p>
      )}
      <div className="row2">
        {isNew && (
          <label>
            Stock inicial
            <input value={f.stock} onChange={set('stock')} inputMode="numeric" placeholder="0" />
          </label>
        )}
        <label>
          Stock mínimo
          <input value={f.min_stock} onChange={set('min_stock')} inputMode="numeric" placeholder="0" />
        </label>
      </div>

      {error && <p className="msg error">{error}</p>}

      <div className="actions">
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        )}
        <button className="btn primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
