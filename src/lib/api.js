import { supabase } from './supabase'

export function errorText(err) {
  if (!err) return 'Error desconocido'
  if (err.code === '23505') return 'Ya existe un producto con ese código de barras'
  if (err.message?.includes('Failed to fetch')) return 'Sin conexión a internet'
  return err.message || String(err)
}

function check({ data, error }) {
  if (error) throw error
  return data
}

export async function findByBarcode(code) {
  return check(await supabase.from('products').select('*').eq('barcode', code).maybeSingle())
}

export async function searchProducts(q, { limit = 50 } = {}) {
  let query = supabase.from('products').select('*').order('name').limit(limit)
  const clean = q.trim().replace(/[,()%*]/g, ' ').trim()
  if (clean) query = query.or(`name.ilike.%${clean}%,barcode.eq.${clean}`)
  return check(await query)
}

export async function getCategories() {
  const rows = check(await supabase.from('products').select('category').not('category', 'is', null))
  return [...new Set(rows.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export async function createProduct(values) {
  const { stock = 0, ...rest } = values
  const product = check(await supabase.from('products').insert(rest).select().single())
  if (stock > 0) {
    product.stock = await addStock(product.id, stock, 'Stock inicial')
  }
  return product
}

export async function updateProduct(id, values) {
  const { stock, ...rest } = values // el stock solo se cambia con movimientos
  return check(
    await supabase
      .from('products')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single(),
  )
}

export async function deleteProduct(id) {
  check(await supabase.from('products').delete().eq('id', id))
}

export async function addStock(productId, quantity, note = null) {
  return check(await supabase.rpc('add_stock', { p_product_id: productId, p_quantity: quantity, p_note: note }))
}

export async function registerSale(items, paid, paymentMethod) {
  return check(
    await supabase.rpc('register_sale', {
      p_items: items.map((i) => ({ product_id: i.product.id, quantity: i.qty })),
      p_paid: paid,
      p_payment_method: paymentMethod,
    }),
  )
}

export async function updatePricesByPercent(percent, category) {
  return check(await supabase.rpc('update_prices_by_percent', { p_percent: percent, p_category: category || null }))
}

export async function getMovements(productId, limit = 15) {
  return check(
    await supabase
      .from('stock_movements')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}

export async function getSales(from, to) {
  return check(
    await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at', { ascending: false }),
  )
}

// Busca el nombre del producto en Open Food Facts (base pública y gratuita).
export async function lookupOpenFoodFacts(code) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity`,
      { signal: ctrl.signal },
    )
    if (!res.ok) return null
    const json = await res.json()
    const p = json?.product
    if (!p?.product_name) return null
    const brand = p.brands?.split(',')[0]?.trim()
    const name = [p.product_name, brand, p.quantity].filter(Boolean).join(' ')
    return { name }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
