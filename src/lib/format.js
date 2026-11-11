const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export const fmtMoney = (n) => money.format(Number(n) || 0)

// Acepta "1.234,50", "1234,5" o "1234.5"
export function parseNumber(value) {
  if (value === null || value === undefined) return NaN
  let s = String(value).trim().replace(/\s|\$/g, '')
  if (s === '') return NaN
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  return Number(s)
}

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

export const METHOD_LABEL = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transf. / QR',
}

// ---------- Cantidades: unidades o kilos (productos por peso) ----------

const kg = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 })

/** Cantidad legible: "3" (unidades), "250 g" o "1,5 kg" si el producto se vende por peso. */
export function fmtQty(qty, byWeight) {
  const n = Number(qty) || 0
  if (!byWeight) return String(Math.round(n * 1000) / 1000)
  if (Math.abs(n) < 1) return `${Math.round(n * 1000)} g`
  return `${kg.format(n)} kg`
}

/** Redondea a gramos para evitar errores de coma flotante (0,1 + 0,2). */
export const roundKg = (n) => Math.round(n * 1000) / 1000
