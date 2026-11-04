import { useState } from 'react'
import { errorText, openSession } from '../lib/api'
import { parseNumber } from '../lib/format'

/** Tarjeta para abrir la caja con el efectivo inicial (cambio). */
export default function AbrirCaja({ onOpened }) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function open(e) {
    e.preventDefault()
    const n = amount.trim() === '' ? 0 : parseNumber(amount)
    if (!Number.isFinite(n) || n < 0) return setError('Monto inválido')
    setBusy(true)
    setError(null)
    try {
      onOpened(await openSession(n))
    } catch (err) {
      setError(errorText(err))
      if (/ya hay una caja abierta/i.test(err?.message || '')) onOpened(null) // otro celular la abrió: refrescar
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={open}>
      <h2>🔒 La caja está cerrada</h2>
      <p className="muted">Para empezar a vender, abrí la caja con el efectivo que hay para dar cambio.</p>
      <label>
        Efectivo inicial en la caja
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$ 0" />
      </label>
      {error && <p className="msg error">{error}</p>}
      <button className="btn success block big" disabled={busy}>
        {busy ? 'Abriendo…' : '🔓 Abrir caja'}
      </button>
    </form>
  )
}
