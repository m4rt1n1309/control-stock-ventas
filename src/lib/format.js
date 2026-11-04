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
