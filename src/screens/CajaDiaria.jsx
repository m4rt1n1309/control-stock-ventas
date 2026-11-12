import { useEffect, useState } from 'react'
import AbrirCaja from '../components/AbrirCaja'
import CierreMes from '../components/CierreMes'
import ResumenCaja, { DiffRow } from '../components/ResumenCaja'
import Ventas from './Ventas'
import {
  addCashMovement,
  closeSession,
  errorText,
  getCashMovements,
  getClosedSessions,
  getSessionSales,
  getSessionSummary,
} from '../lib/api'
import { fmtDateTime, fmtMoney, fmtTime, METHOD_LABEL, parseNumber } from '../lib/format'

const VIEWS = [
  ['actual', 'Caja actual'],
  ['cierres', 'Cierres'],
  ['dias', 'Ventas por día'],
]

export default function CajaDiaria({ caja, onCajaChange }) {
  const [view, setView] = useState('actual')

  return (
    <div className="screen">
      <CierreMes />
      <div className="segmented three">
        {VIEWS.map(([v, label]) => (
          <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'actual' && <CajaActual caja={caja} onCajaChange={onCajaChange} />}
      {view === 'cierres' && <Cierres />}
      {view === 'dias' && <Ventas embedded />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function CajaActual({ caja, onCajaChange }) {
  const [summary, setSummary] = useState(null)
  const [movements, setMovements] = useState([])
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(null) // null | 'ingreso' | 'egreso' | 'cerrar'
  const [closed, setClosed] = useState(null) // resultado del cierre recién hecho
  const [showSales, setShowSales] = useState(false)

  async function load() {
    if (!caja) return
    setError(null)
    try {
      const [s, m] = await Promise.all([getSessionSummary(caja.id), getCashMovements(caja.id)])
      setSummary(s)
      setMovements(m)
    } catch (err) {
      setError(errorText(err))
    }
  }

  useEffect(() => {
    setSummary(null)
    setMode(null)
    load()
  }, [caja?.id])

  if (closed) {
    return (
      <div className="card done">
        <div className="done-icon">✔</div>
        <h2>Caja cerrada</h2>
        <p className="muted">{fmtDateTime(new Date().toISOString())}</p>
        <ResumenCaja summary={closed} />
        <button className="btn primary block big" onClick={() => setClosed(null)}>
          Listo
        </button>
      </div>
    )
  }

  if (caja === undefined) return <p className="empty">Cargando…</p>
  if (caja === null) return <AbrirCaja onOpened={onCajaChange} />

  return (
    <>
      <div className="card">
        <div className="detail-head">
          <div>
            <h2>🔓 Caja abierta</h2>
            <p className="muted">
              Desde {fmtDateTime(caja.opened_at)}
              {caja.opened_by_email ? ` · ${caja.opened_by_email}` : ''}
            </p>
          </div>
          <button className="icon-btn" onClick={load} aria-label="Actualizar">
            ⟳
          </button>
        </div>

        {error && <p className="msg error">{error}</p>}
        {!summary && !error && <p className="empty">Cargando…</p>}
        {summary && (
          <>
            <div className="expected">
              <span>Efectivo que debería haber</span>
              <strong>{fmtMoney(summary.expected_cash)}</strong>
            </div>
            <ResumenCaja summary={summary} />
          </>
        )}
      </div>

      {mode === 'ingreso' || mode === 'egreso' ? (
        <MovementForm
          type={mode}
          onCancel={() => setMode(null)}
          onDone={() => {
            setMode(null)
            load()
          }}
        />
      ) : mode === 'cerrar' && summary ? (
        <CloseForm
          caja={caja}
          summary={summary}
          onCancel={() => setMode(null)}
          onClosed={(result) => {
            setClosed(result)
            onCajaChange(null)
          }}
          onRefresh={load}
        />
      ) : (
        <>
          <div className="actions">
            <button className="btn secondary" onClick={() => setMode('ingreso')}>
              ＋ Ingreso
            </button>
            <button className="btn secondary" onClick={() => setMode('egreso')}>
              − Retiro / gasto
            </button>
          </div>
          <button className="btn danger block big" onClick={() => setMode('cerrar')} disabled={!summary}>
            🔒 Cerrar caja
          </button>
        </>
      )}

      {movements.length > 0 && (
        <>
          <h3>Ingresos y retiros</h3>
          <ul className="list">
            {movements.map((m) => (
              <li key={m.id}>
                <span>
                  {m.reason}
                  <br />
                  <small className="muted">
                    {fmtTime(m.created_at)}
                    {m.user_email ? ` · ${m.user_email}` : ''}
                  </small>
                </span>
                <strong className={m.type === 'egreso' ? 'neg' : 'pos'}>
                  {m.type === 'egreso' ? '−' : '+'} {fmtMoney(m.amount)}
                </strong>
              </li>
            ))}
          </ul>
        </>
      )}

      <button className="btn link" onClick={() => setShowSales(!showSales)}>
        {showSales ? '▾ Ocultar ventas de esta caja' : '▸ Ver ventas de esta caja'}
      </button>
      {showSales && <SessionSales sessionId={caja.id} />}
    </>
  )
}

function MovementForm({ type, onCancel, onDone }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const isOut = type === 'egreso'

  async function submit(e) {
    e.preventDefault()
    const n = parseNumber(amount)
    if (!Number.isFinite(n) || n <= 0) return setError('Ingresá un monto')
    if (!reason.trim()) return setError('Escribí el motivo')
    setBusy(true)
    setError(null)
    try {
      await addCashMovement(type, n, reason)
      onDone()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h3>{isOut ? '− Retiro / gasto de efectivo' : '＋ Ingreso de efectivo'}</h3>
      <label>
        Monto
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$ 0" autoFocus />
      </label>
      <label>
        Motivo
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={isOut ? 'Ej: pago a proveedor, retiro del dueño' : 'Ej: agregué cambio'}
        />
      </label>
      {error && <p className="msg error">{error}</p>}
      <div className="actions">
        <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

function CloseForm({ caja, summary, onCancel, onClosed, onRefresh }) {
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Actualizar el resumen al entrar, por si se vendió algo desde otro celular
  useEffect(() => {
    onRefresh()
  }, [])

  const n = parseNumber(counted)
  const diff = Number.isFinite(n) ? n - Number(summary.expected_cash) : null

  async function submit(e) {
    e.preventDefault()
    if (!Number.isFinite(n) || n < 0) return setError('Ingresá cuánto efectivo contaste')
    setBusy(true)
    setError(null)
    try {
      onClosed(await closeSession(caja.id, n, notes))
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h3>🔒 Cerrar caja</h3>
      <p className="muted">Contá los billetes y monedas que hay en la caja y escribí el total.</p>
      <label>
        Efectivo contado
        <input value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" placeholder="$ 0" autoFocus />
      </label>

      {diff !== null && (
        <dl className="rows">
          <div>
            <dt>Debería haber</dt>
            <dd>{fmtMoney(summary.expected_cash)}</dd>
          </div>
          <DiffRow diff={Math.round(diff * 100) / 100} />
        </dl>
      )}

      <label>
        Notas (opcional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: faltan $200 de un vuelto" />
      </label>

      {error && <p className="msg error">{error}</p>}

      <div className="actions">
        <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn danger" disabled={busy || diff === null}>
          {busy ? 'Cerrando…' : 'Confirmar cierre'}
        </button>
      </div>
    </form>
  )
}

function SessionSales({ sessionId }) {
  const [sales, setSales] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    getSessionSales(sessionId).then(setSales).catch(() => setSales([]))
  }, [sessionId])

  if (!sales) return <p className="empty">Cargando…</p>
  if (!sales.length) return <p className="empty">Todavía no hay ventas en esta caja</p>

  return (
    <ul className="list">
      {sales.map((s) => (
        <li key={s.id} className="sale" onClick={() => setOpen(open === s.id ? null : s.id)}>
          <div className="sale-head">
            <span>
              #{s.id} · {fmtTime(s.created_at)}{' '}
              <small className="muted">{METHOD_LABEL[s.payment_method] || s.payment_method}</small>
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
  )
}

// ---------------------------------------------------------------------------

function Cierres() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    getClosedSessions()
      .then(setItems)
      .catch((err) => setError(errorText(err)))
  }, [])

  if (error) return <p className="msg error">{error}</p>
  if (!items) return <p className="empty">Cargando…</p>
  if (!items.length) return <p className="empty">Todavía no hay cierres de caja</p>

  return (
    <ul className="list">
      {items.map((c) => {
        const diff = Number(c.difference)
        return (
          <li key={c.id} className="sale" onClick={() => setOpen(open === c.id ? null : c.id)}>
            <div className="sale-head">
              <span>
                {new Date(c.closed_at).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
                <br />
                <small className="muted">
                  {fmtTime(c.opened_at)} a {fmtTime(c.closed_at)}
                  {c.closed_by_email ? ` · ${c.closed_by_email}` : ''}
                </small>
              </span>
              <span className="right">
                <strong>{fmtMoney(c.summary?.total_sales)}</strong>
                <br />
                <small className={diff === 0 ? 'pos' : diff < 0 ? 'neg' : 'warn'}>
                  {diff === 0 ? '✔ justo' : `${diff < 0 ? 'faltan' : 'sobran'} ${fmtMoney(Math.abs(diff))}`}
                </small>
              </span>
            </div>
            {open === c.id && c.summary && (
              <div className="sale-items" onClick={(e) => e.stopPropagation()}>
                <ResumenCaja summary={{ ...c.summary, counted_cash: c.counted_cash, difference: c.difference }} />
                {c.notes && <p className="muted">📝 {c.notes}</p>}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
