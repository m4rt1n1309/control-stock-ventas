import { APP_NAME } from './license'
import { fmtMoney, fmtQty, METHOD_LABEL } from './format'

export const monthName = (date) => date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

const dayKey = (iso) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Totales del mes: general, por medio de pago, por día y por producto. */
export function summarize(sales) {
  const total = sales.reduce((s, v) => s + Number(v.total), 0)
  const byMethod = {}
  const byDay = new Map()
  const byProduct = new Map()

  for (const s of sales) {
    byMethod[s.payment_method] = (byMethod[s.payment_method] || 0) + Number(s.total)
    const k = dayKey(s.created_at)
    const day = byDay.get(k) || { count: 0, total: 0 }
    day.count += 1
    day.total += Number(s.total)
    byDay.set(k, day)
    for (const it of s.sale_items || []) {
      const key = `${it.name}|${it.sold_by_weight ? 1 : 0}`
      const p = byProduct.get(key) || { name: it.name, byWeight: it.sold_by_weight, qty: 0, total: 0 }
      p.qty += Number(it.quantity)
      p.total += Number(it.subtotal)
      byProduct.set(key, p)
    }
  }

  return {
    count: sales.length,
    total,
    byMethod,
    byDay: [...byDay.entries()],
    byProduct: [...byProduct.values()].sort((a, b) => b.total - a.total),
  }
}

/** Arma y descarga el PDF con el resumen del mes. */
export async function downloadMonthPdf(month, sales) {
  const [{ jsPDF }, tableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  // Según cómo se empaquete, la función viene como default o anidada
  const autoTable = [tableMod.default, tableMod.default?.default, tableMod.autoTable].find((f) => typeof f === 'function')
  const r = summarize(sales)
  const title = monthName(month)
  const doc = new jsPDF()
  const head = { fillColor: [37, 99, 235] }
  const right = { halign: 'right' }
  const R = (content) => ({ content, styles: right }) // encabezado alineado como su columna

  doc.setFontSize(16)
  doc.text(`${APP_NAME} - Ventas de ${title}`, 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(`Generado el ${new Date().toLocaleString('es-AR')}`, 14, 25)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 31,
    head: [['Resumen', '']],
    body: [
      ['Cantidad de ventas', String(r.count)],
      ['Total vendido', fmtMoney(r.total)],
      ...Object.entries(r.byMethod).map(([m, v]) => [`  ${METHOD_LABEL[m] || m}`, fmtMoney(v)]),
    ],
    headStyles: head,
    columnStyles: { 1: right },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Día', R('Ventas'), R('Total')]],
    body: r.byDay.map(([d, v]) => [d, String(v.count), fmtMoney(v.total)]),
    headStyles: head,
    columnStyles: { 1: right, 2: right },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Producto', R('Cantidad'), R('Total')]],
    body: r.byProduct.map((p) => [p.name, fmtQty(p.qty, p.byWeight), fmtMoney(p.total)]),
    headStyles: head,
    columnStyles: { 1: right, 2: right },
  })

  const file = `ventas-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}.pdf`
  doc.save(file)
  return file
}
