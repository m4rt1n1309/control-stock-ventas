import { useEffect, useState } from 'react'
import { errorText, getSales } from '../lib/api'
import { fmtMoney, fmtTime, METHOD_LABEL } from '../lib/format'


function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Ventas({ embedded = false }) {
  const [day, setDay] = useState(todayStr)
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    const [y, m, d] = day.split('-').map(Number)
    const from = new Date(y, m - 1, d)
    const to = new Date(y, m - 1, d + 1)
    setLoading(true)
    setError(null)
    getSales(from, to)
      .then(setSales)
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false))
  }, [day])

  const total = sales.reduce((s, v) => s + Number(v.total), 0)
  const byMethod = sales.reduce((acc, v) => {
    acc[v.payment_method] = (acc[v.payment_method] || 0) + Number(v.total)
    return acc
  }, {})

  return (
    <div className={embedded ? "stack" : "screen"}>
      <input type="date" value={day} onChange={(e) => setDay(e.target.value)} max={todayStr()} />

      <div className="card">
        <div className="total">
          <span>Total del día</span>
          <strong>{fmtMoney(total)}</strong>
        </div>
        <p className="muted">{sales.length} ventas</p>
        {Object.entries(byMethod).map(([m, v]) => (
          <div key={m} className="total small">
            <span>{METHOD_LABEL[m] || m}</span>
            <span>{fmtMoney(v)}</span>
          </div>
        ))}
      </div>

      {error && <p className="msg error">{error}</p>}
      {loading && <p className="empty">Cargando…</p>}

      <ul className="list">
        {sales.map((s) => (
          <li key={s.id} className="sale" onClick={() => setOpen(open === s.id ? null : s.id)}>
            <div className="sale-head">
              <span>
                #{s.id} · {fmtTime(s.created_at)} <small className="muted">{METHOD_LABEL[s.payment_method] || s.payment_method}</small>
              </span>
              <strong>{fmtMoney(s.total)}</strong>
            </div>
            {open === s.id && (
              <ul className="sale-items">
                {s.sale_items.map((it) => (
                  <li key={it.id}>
                    <span>
                      {it.quantity} × {it.name}
                    </span>
                    <span>{fmtMoney(it.subtotal)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
