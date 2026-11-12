import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { APP_NAME } from '../lib/license'

/** Se muestra al entrar desde el link del mail de "recuperar contraseña". */
export default function NuevaClave({ onDone }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (password.length < 6) return setError('La contraseña tiene que tener al menos 6 caracteres')
    if (password !== repeat) return setError('Las dos contraseñas no son iguales')
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(
        /different from the old/i.test(error.message)
          ? 'La contraseña nueva tiene que ser distinta de la anterior'
          : /expired|invalid/i.test(error.message)
            ? 'El link venció. Pedí otro mail de recuperación.'
            : error.message,
      )
      setBusy(false)
      return
    }
    onDone()
  }

  return (
    <div className="login">
      <form className="card form" onSubmit={submit}>
        <h1>🏪 {APP_NAME}</h1>
        <h2>Nueva contraseña</h2>
        <p className="muted">Escribí la contraseña nueva dos veces.</p>
        <label>
          Contraseña nueva
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Repetila
          <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
        </label>
        {error && <p className="msg error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  )
}
