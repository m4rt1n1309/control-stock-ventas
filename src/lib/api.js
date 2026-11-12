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

// Supabase devuelve hasta 1000 filas por consulta: para traer todo hay que pedir de a tandas
const PAGE = 1000
async function fetchAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const page = check(await buildQuery().range(from, from + PAGE - 1))
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

/** Todas las filas de una tabla (para la copia en Excel). */
export async function fetchTable(table, order) {
  return fetchAll(() => supabase.from(table).select('*').order(order).order('id'))
}

function productsQuery(q) {
  let query = supabase.from('products').select('*').order('name').order('id')
  const clean = q.trim().replace(/[,()%*]/g, ' ').trim()
  if (clean) query = query.or(`name.ilike.%${clean}%,barcode.eq.${clean}`)
  return query
}

export async function searchProducts(q, { limit = 50 } = {}) {
  return check(await productsQuery(q).limit(limit))
}

export function searchAllProducts(q) {
  return fetchAll(() => productsQuery(q))
}

/** Productos con stock igual o menor al mínimo avisado, los más urgentes primero. */
export async function getLowStock() {
  const rows = await fetchAll(() =>
    supabase.from('products').select('id, name, stock, min_stock, sold_by_weight').order('id'),
  )
  return rows
    .filter((p) => Number(p.stock) <= Number(p.min_stock))
    .sort((a, b) => a.stock - a.min_stock - (b.stock - b.min_stock) || a.name.localeCompare(b.name))
}

export async function getCategories() {
  const rows = await fetchAll(() =>
    supabase.from('products').select('category').not('category', 'is', null).order('id'),
  )
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

/** Todas las ventas del período, de la más vieja a la más nueva (sin tope de 1000). */
export function getAllSales(from, to) {
  return fetchAll(() =>
    supabase
      .from('sales')
      .select('id, created_at, total, payment_method, sale_items(name, quantity, subtotal, sold_by_weight)')
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at')
      .order('id'),
  )
}

/** Fecha de la venta más vieja anterior a `before`, o null si no hay. */
export async function getOldestSaleBefore(before) {
  const rows = check(
    await supabase.from('sales').select('created_at').lt('created_at', before.toISOString()).order('created_at').limit(1),
  )
  return rows[0]?.created_at ?? null
}

export async function deleteSalesRange(from, to) {
  return check(await supabase.rpc('delete_sales_range', { p_from: from.toISOString(), p_to: to.toISOString() }))
}

// ---------- Licencia / prueba ----------

// Devuelve null si no hay licencia (uso sin límite)
export async function getLicense() {
  const { data, error } = await supabase.from('app_license').select('*').maybeSingle()
  if (error) return null // tabla inexistente u otro error: no bloquear
  return data
}

// ---------- Caja (apertura / cierre) ----------

export async function getOpenSession() {
  return check(await supabase.from('cash_sessions').select('*').is('closed_at', null).maybeSingle())
}

export async function openSession(openingAmount) {
  return check(await supabase.rpc('open_cash_session', { p_opening_amount: openingAmount }))
}

export async function getSessionSummary(sessionId) {
  return check(await supabase.rpc('cash_session_summary', { p_session_id: sessionId }))
}

export async function addCashMovement(type, amount, reason) {
  return check(await supabase.rpc('add_cash_movement', { p_type: type, p_amount: amount, p_reason: reason }))
}

export async function getCashMovements(sessionId) {
  return check(
    await supabase.from('cash_movements').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }),
  )
}

export async function closeSession(sessionId, counted, notes) {
  return check(
    await supabase.rpc('close_cash_session', { p_session_id: sessionId, p_counted: counted, p_notes: notes || null }),
  )
}

export async function getClosedSessions(limit = 30) {
  return check(
    await supabase
      .from('cash_sessions')
      .select('*')
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(limit),
  )
}

export async function getSessionSales(sessionId) {
  return check(
    await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('session_id', sessionId)
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
