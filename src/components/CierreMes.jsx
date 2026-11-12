import { useEffect, useState } from 'react'
import { deleteSalesRange, errorText, getAllSales, getOldestSaleBefore } from '../lib/api'
import { fmtMoney } from '../lib/format'
import { downloadMonthPdf, monthName } from '../lib/reporteMensual'

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
const nextMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)

/**
 * Cierre de mes: si quedan ventas de meses anteriores, ofrece bajar el PDF del mes más viejo
 * y después borrar esas ventas para que la base no se llene.
 */
export default function CierreMes() {
  const [month, setMonth] = useState(null) // primer día del mes a cerrar
  const [sales, setSales] = useState(null)
  const [downloaded, setDownloaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function load() {
    setDownloaded(false)
    setSales(null)
    try {
      const oldest = await getOldestSaleBefore(startOfMonth(new Date()))
      setMonth(oldest ? startOfMonth(new Date(oldest)) : null)
    } catch {
      setMonth(null)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (!month) return msg ? <p className={`msg ${msg.type}`}>{msg.text}</p> : null

  const name = monthName(month)

  async function getSales() {
    if (sales) return sales
    const rows = await getAllSales(month, nextMonth(month))
    setSales(rows)
    return rows
  }

  async function download() {
    setBusy(true)
    setMsg(null)
    try {
      const file = await downloadMonthPdf(month, await getSales())
      setDownloaded(true)
      setMsg({ type: 'ok', text: `Se descargó ${file}. Fijate que esté en Descargas antes de borrar.` })
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const rows = await getSales().catch(() => null)
    const total = rows ? rows.reduce((s, v) => s + Number(v.total), 0) : null
    const detail = rows ? ` (${rows.length} ventas, ${fmtMoney(total)})` : ''
    if (!confirm(`¿Borrar todas las ventas de ${name}${detail}?\n\nNo se puede deshacer. El stock y los cierres de caja no cambian.`)) return
    setBusy(true)
    setMsg(null)
    try {
      const n = await deleteSalesRange(month, nextMonth(month))
      setMsg({ type: 'ok', text: `Se borraron ${n} ventas de ${name} ✔` })
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card cierre-mes">
      <h3>📅 Cierre de {name}</h3>
      <p className="muted">
        Bajá el resumen en PDF de lo que se vendió en {name}. Después podés borrar esas ventas para que no se acumulen.
      </p>
      <button className="btn primary block" onClick={download} disabled={busy}>
        {busy && !downloaded ? 'Armando el PDF…' : `⬇ Descargar PDF de ${name}`}
      </button>
      <button className="btn danger block" onClick={remove} disabled={busy || !downloaded}>
        🗑 Borrar ventas de {name}
      </button>
      {!downloaded && <p className="hint small">Para borrar, primero descargá el PDF.</p>}
      {msg && <p className={`msg ${msg.type}`}>{msg.text}</p>}
    </div>
  )
}
