import { fetchTable } from './api'
import { APP_NAME } from './license'
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, METHOD_LABEL } from './format'

const pad = (n) => String(n).padStart(2, '0')
const fecha = (iso) => (iso ? fmtDateTime(iso) : '')
const plata = (v) => (v === null || v === undefined || v === '' ? '' : fmtMoney(v))
const TIPO_STOCK = { entrada: 'Entrada', venta: 'Venta', ajuste: 'Ajuste' }
const TIPO_CAJA = { ingreso: 'Ingreso', egreso: 'Retiro' }

/** Arma un PDF con todos los datos del negocio (se abre en cualquier navegador) y lo descarga. */
export async function downloadBackup(onProgress = () => {}) {
  const [{ jsPDF }, tableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = [tableMod.default, tableMod.default?.default, tableMod.autoTable].find((f) => typeof f === 'function')

  const leer = async (label, table, order) => {
    onProgress(label)
    return fetchTable(table, order)
  }
  const products = await leer('Productos', 'products', 'name')
  const sales = await leer('Ventas', 'sales', 'created_at')
  const items = await leer('Detalle de ventas', 'sale_items', 'id')
  const movs = await leer('Movimientos de stock', 'stock_movements', 'created_at')
  const cajas = await leer('Cajas', 'cash_sessions', 'opened_at')
  const movsCaja = await leer('Movimientos de caja', 'cash_movements', 'created_at')

  onProgress('PDF')
  const prodById = new Map(products.map((p) => [p.id, p]))
  const itemsBySale = new Map()
  for (const it of items) {
    if (!itemsBySale.has(it.sale_id)) itemsBySale.set(it.sale_id, [])
    itemsBySale.get(it.sale_id).push(it)
  }

  const doc = new jsPDF({ orientation: 'landscape' })
  const head = { fillColor: [37, 99, 235] }
  const right = { halign: 'right' }
  const R = (content) => ({ content, styles: right })
  let y = 0

  const seccion = (titulo, cantidad) => {
    y = y ? doc.lastAutoTable.finalY + 12 : 34
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      y = 18
    }
    doc.setFontSize(13)
    doc.text(`${titulo} (${cantidad})`, 14, y)
    y += 3
  }
  const tabla = (headRow, body, columnStyles = {}) =>
    autoTable(doc, {
      startY: y,
      head: [headRow],
      body: body.length ? body : [[{ content: 'No hay datos', colSpan: headRow.length }]],
      headStyles: head,
      styles: { fontSize: 8, cellPadding: 1.5 },
      columnStyles,
    })

  doc.setFontSize(16)
  doc.text(`${APP_NAME} - Copia de los datos`, 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(`Generada el ${new Date().toLocaleString('es-AR')}`, 14, 25)
  doc.setTextColor(0)

  seccion('Productos', products.length)
  tabla(
    ['Nombre', 'Código', 'Categoría', R('Costo'), R('Venta'), R('Stock'), R('Mínimo'), 'Vence'],
    products.map((p) => [
      p.name,
      p.barcode || '',
      p.category || '',
      plata(p.cost_price),
      plata(p.sale_price),
      fmtQty(p.stock, p.sold_by_weight),
      fmtQty(p.min_stock, p.sold_by_weight),
      fmtDate(p.expires_on),
    ]),
    { 3: right, 4: right, 5: right, 6: right },
  )

  seccion('Ventas', sales.length)
  tabla(
    ['Nº', 'Fecha', 'Productos', R('Total'), 'Pago', R('Pagó con'), R('Vuelto'), 'Usuario'],
    sales.map((s) => [
      String(s.id),
      fecha(s.created_at),
      (itemsBySale.get(s.id) || [])
        .map((it) => `${fmtQty(it.quantity, it.sold_by_weight)} x ${it.name} = ${fmtMoney(it.subtotal)}`)
        .join('\n'),
      plata(s.total),
      METHOD_LABEL[s.payment_method] || s.payment_method,
      plata(s.paid),
      plata(s.change_given),
      s.user_email || '',
    ]),
    { 2: { cellWidth: 90 }, 3: right, 5: right, 6: right },
  )

  seccion('Cajas', cajas.length)
  tabla(
    ['Nº', 'Abierta', 'Abrió', R('Inicial'), 'Cerrada', 'Cerró', R('Esperado'), R('Contado'), R('Diferencia'), 'Notas'],
    cajas.map((c) => [
      String(c.id),
      fecha(c.opened_at),
      c.opened_by_email || '',
      plata(c.opening_amount),
      c.closed_at ? fecha(c.closed_at) : 'Abierta',
      c.closed_by_email || '',
      plata(c.expected_cash),
      plata(c.counted_cash),
      plata(c.difference),
      c.notes || '',
    ]),
    { 3: right, 6: right, 7: right, 8: right },
  )

  seccion('Ingresos y retiros de caja', movsCaja.length)
  tabla(
    ['Fecha', 'Nº caja', 'Tipo', R('Monto'), 'Motivo', 'Usuario'],
    movsCaja.map((m) => [
      fecha(m.created_at),
      String(m.session_id),
      TIPO_CAJA[m.type] || m.type,
      plata(m.amount),
      m.reason || '',
      m.user_email || '',
    ]),
    { 3: right },
  )

  seccion('Movimientos de stock', movs.length)
  tabla(
    ['Fecha', 'Producto', 'Tipo', R('Cantidad'), 'Nota'],
    movs.map((m) => {
      const p = prodById.get(m.product_id)
      return [
        fecha(m.created_at),
        p ? p.name : '(producto borrado)',
        TIPO_STOCK[m.type] || m.type,
        fmtQty(m.quantity, p?.sold_by_weight),
        m.note || '',
      ]
    }),
    { 3: right },
  )

  const d = new Date()
  const name = `Copia ${APP_NAME} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.pdf`
  doc.save(name)
  return { name, counts: { Productos: products.length, Ventas: sales.length } }
}
