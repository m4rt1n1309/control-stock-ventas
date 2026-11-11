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
    sold_by_weight: initial.sold_by_weight ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const cost = parseNumber(f.cost_price)
  const sale = parseNumber(f.sale_price)
  const byWeight = f.sold_by_weight
  // Por peso: kilos con decimales ("2,5"). Por unidad: enteros.
  const toQty = (v) => {
    const n = parseNumber(v)
    if (!Number.isFinite(n) || n < 0) return 0
    return byWeight ? Math.round(n * 1000) / 1000 : Math.floor(n)
  }
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
      min_stock: toQty(f.min_stock),
      sold_by_weight: f.sold_by_weight,
    }
    if (isNew) values.stock = toQty(f.stock)
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
    <form className="card form product-form" onSubmit={submit} data-block-scanner>
      <h2>{isNew ? 'Nuevo producto' : 'Editar producto'}</h2>
      {notice && <p className="msg info">{notice}</p>}

      <label>
        Código de barras
        <input
          value={f.barcode}
          onChange={set('barcode')}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} // el Enter del lector no debe guardar el formulario
          inputMode="numeric"
          placeholder="(sin código)"
        />
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
      <label className="check">
        <input
          type="checkbox"
          checked={byWeight}
          onChange={(e) => setF({ ...f, sold_by_weight: e.target.checked })}
        />
        ⚖ Se vende por peso (fiambres, quesos, sueltos)
      </label>
      {byWeight && <p className="hint">Los precios son por kilo y el stock se cuenta en kilos (ej: 2,5).</p>}
      <div className="row2">
        <label>
          Precio costo{byWeight ? ' (kg)' : ''}
          <input value={f.cost_price} onChange={set('cost_price')} inputMode="decimal" placeholder="0" />
        </label>
        <label>
          Precio venta{byWeight ? ' x kg' : ''} *
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
            Stock inicial{byWeight ? ' (kg)' : ''}
            <input value={f.stock} onChange={set('stock')} inputMode={byWeight ? 'decimal' : 'numeric'} placeholder="0" />
          </label>
        )}
        <label>
          Stock mínimo{byWeight ? ' (kg)' : ''}
          <input value={f.min_stock} onChange={set('min_stock')} inputMode={byWeight ? 'decimal' : 'numeric'} placeholder="0" />
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
