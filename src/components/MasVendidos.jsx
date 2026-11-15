import { useEffect, useState } from 'react'
import { errorText, getAllSales } from '../lib/api'
import { fmtMoney, fmtQty } from '../lib/format'
import { summarize } from '../lib/reporteMensual'

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const PERIODS = [
  ['hoy', 'Hoy', () => startOfDay(new Date())],
  ['7', '7 días', () => new Date(startOfDay(new Date()).getTime() - 6 * 86400000)],
  ['30', '30 días', () => new Date(startOfDay(new Date()).getTime() - 29 * 86400000)],
  ['mes', 'Este mes', () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)],
]

const SHOW = 30

/** Ranking de productos vendidos en un período, por cantidad o por plata. */
export default function MasVendidos() {
  const [period, setPeriod] = useState('7')
  const [by, setBy] = useState('cantidad')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setRows(null)
    setError(null)
    const from = PERIODS.find((p) => p[0] === period)[2]()
    const to = new Date(Date.now() + 60000)
    getAllSales(from, to)
      .then((sales) => alive && setRows(summarize(sales).byProduct))
      .catch((err) => alive && setError(errorText(err)))
    return () => {
      alive = false
    }
  }, [period])

  // Por cantidad: primero los de unidad (no se mezclan unidades con kilos), después los de peso
  const sorted = rows
    ? [...rows].sort((a, b) =>
        by === 'plata' ? b.total - a.total : Number(!!a.byWeight) - Number(!!b.byWeight) || b.qty - a.qty,
      )
    : []

  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>🏆 Lo más vendido</h3>
      <div className="segmented">
        {PERIODS.map(([v, label]) => (
          <button key={v} className={period === v ? 'active' : ''} onClick={() => setPeriod(v)}>
            {label}
          </button>
        ))}
      </div>
      <div className="segmented two">
        <button className={by === 'cantidad' ? 'active' : ''} onClick={() => setBy('cantidad')}>
          Por cantidad
        </button>
        <button className={by === 'plata' ? 'active' : ''} onClick={() => setBy('plata')}>
          Por plata
        </button>
      </div>

      {error && <p className="msg error">{error}</p>}
      {!rows && !error && <p className="empty">Cargando…</p>}
      {rows && !rows.length && <p className="empty">No hubo ventas en este período</p>}

      <ol className="list ranking">
        {sorted.slice(0, SHOW).map((p, i) => (
          <li key={`${p.name}|${p.byWeight}`}>
            <span className="rank">{i + 1}</span>
            <span className="grow">{p.name}</span>
            <span className="muted">{fmtQty(p.qty, p.byWeight)}</span>
            <strong>{fmtMoney(p.total)}</strong>
          </li>
        ))}
      </ol>
      {sorted.length > SHOW && <p className="muted center">Se muestran los primeros {SHOW} de {sorted.length}</p>}
    </div>
  )
}
