import { fetchTable } from './api'
import { APP_NAME } from './license'
import { METHOD_LABEL } from './format'

const pad = (n) => String(n).padStart(2, '0')

// Fecha y hora local como texto (Excel no maneja zonas horarias)
function fecha(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const MONEY = '#,##0.00'

const col = (header, value, { width = 14, money = false, number = false } = {}) => ({
  header: { value: header, fontWeight: 'bold' },
  width,
  cell: (row) => {
    const v = value(row)
    if (money || number) return { value: num(v), type: Number, ...(money ? { format: MONEY } : {}) }
    return { value: v === null || v === undefined ? null : String(v), type: String }
  },
})

const HOJAS = [
  {
    sheet: 'Productos',
    table: 'products',
    order: 'name',
    columns: [
      col('Código de barras', (r) => r.barcode, { width: 18 }),
      col('Nombre', (r) => r.name, { width: 32 }),
      col('Categoría', (r) => r.category, { width: 16 }),
      col('Precio de costo', (r) => r.cost_price, { money: true }),
      col('Precio de venta', (r) => r.sale_price, { money: true }),
      col('Stock', (r) => r.stock, { number: true, width: 10 }),
      col('Stock mínimo', (r) => r.min_stock, { number: true, width: 12 }),
      col('Por peso', (r) => (r.sold_by_weight ? 'Sí (kg)' : 'No'), { width: 10 }),
      col('Nº interno', (r) => r.id, { number: true, width: 10 }),
    ],
  },
  {
    sheet: 'Ventas',
    table: 'sales',
    order: 'created_at',
    columns: [
      col('Nº venta', (r) => r.id, { number: true, width: 10 }),
      col('Fecha', (r) => fecha(r.created_at), { width: 17 }),
      col('Total', (r) => r.total, { money: true }),
      col('Pagó con', (r) => r.paid, { money: true }),
      col('Vuelto', (r) => r.change_given, { money: true }),
      col('Medio de pago', (r) => METHOD_LABEL[r.payment_method] || r.payment_method, { width: 15 }),
      col('Usuario', (r) => r.user_email, { width: 26 }),
      col('Nº caja', (r) => r.session_id, { number: true, width: 9 }),
    ],
  },
  {
    sheet: 'Detalle de ventas',
    table: 'sale_items',
    order: 'id',
    columns: [
      col('Nº venta', (r) => r.sale_id, { number: true, width: 10 }),
      col('Producto', (r) => r.name, { width: 32 }),
      col('Cantidad', (r) => r.quantity, { number: true, width: 10 }),
      col('Unidad', (r) => (r.sold_by_weight ? 'kg' : 'unidad'), { width: 9 }),
      col('Precio unitario', (r) => r.unit_price, { money: true }),
      col('Subtotal', (r) => r.subtotal, { money: true }),
      col('Nº producto', (r) => r.product_id, { number: true, width: 11 }),
    ],
  },
  {
    sheet: 'Movimientos de stock',
    table: 'stock_movements',
    order: 'created_at',
    columns: [
      col('Fecha', (r) => fecha(r.created_at), { width: 17 }),
      col('Nº producto', (r) => r.product_id, { number: true, width: 11 }),
      col('Tipo', (r) => r.type, { width: 10 }),
      col('Cantidad', (r) => r.quantity, { number: true, width: 10 }),
      col('Nota', (r) => r.note, { width: 30 }),
    ],
  },
  {
    sheet: 'Cajas',
    table: 'cash_sessions',
    order: 'opened_at',
    columns: [
      col('Nº caja', (r) => r.id, { number: true, width: 9 }),
      col('Abierta', (r) => fecha(r.opened_at), { width: 17 }),
      col('Abrió', (r) => r.opened_by_email, { width: 26 }),
      col('Monto inicial', (r) => r.opening_amount, { money: true }),
      col('Cerrada', (r) => fecha(r.closed_at), { width: 17 }),
      col('Cerró', (r) => r.closed_by_email, { width: 26 }),
      col('Efectivo esperado', (r) => r.expected_cash, { money: true, width: 16 }),
      col('Efectivo contado', (r) => r.counted_cash, { money: true, width: 16 }),
      col('Diferencia', (r) => r.difference, { money: true }),
      col('Notas', (r) => r.notes, { width: 30 }),
    ],
  },
  {
    sheet: 'Movimientos de caja',
    table: 'cash_movements',
    order: 'created_at',
    columns: [
      col('Fecha', (r) => fecha(r.created_at), { width: 17 }),
      col('Nº caja', (r) => r.session_id, { number: true, width: 9 }),
      col('Tipo', (r) => r.type, { width: 10 }),
      col('Monto', (r) => r.amount, { money: true }),
      col('Motivo', (r) => r.reason, { width: 30 }),
      col('Usuario', (r) => r.user_email, { width: 26 }),
    ],
  },
]

/** Arma un Excel con todos los datos del negocio (una hoja por tabla) y lo descarga. */
export async function downloadBackup(onProgress = () => {}) {
  const { default: writeExcelFile, getSheetData } = await import('write-excel-file/universal')

  const sheets = []
  const counts = {}
  for (const h of HOJAS) {
    onProgress(h.sheet)
    const rows = await fetchTable(h.table, h.order)
    counts[h.sheet] = rows.length
    sheets.push({ data: getSheetData(rows, h.columns), sheet: h.sheet, columns: h.columns, stickyRowsCount: 1 })
  }

  const blob = await writeExcelFile(sheets).toBlob()
  const d = new Date()
  const name = `Copia ${APP_NAME} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return { name, counts }
}
