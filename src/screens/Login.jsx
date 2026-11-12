import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { APP_NAME } from '../lib/license'

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'olvide'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  // Link del mail vencido o ya usado: el servidor vuelve con #error_code=otp_expired
  const [error, setError] = useState(() =>
    /error_code=otp_expired/.test(window.location.hash)
      ? 'El link para recuperar la contraseña venció o ya se usó. Pedí uno nuevo.'
      : null,
  )
  const [sent, setSent] = useState(false)

  function switchMode(m) {
    setMode(m)
    setError(null)
    setSent(false)
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message)
      setBusy(false)
    }
  }

  async function sendReset(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    setBusy(false)
    if (error) {
      setError(
        /rate limit|seconds/i.test(error.message)
          ? 'Ya se mandaron varios mails. Esperá un rato y probá de nuevo.'
          : error.message,
      )
      return
    }
    setSent(true)
  }

  if (mode === 'olvide') {
    return (
      <div className="login">
        <form className="card form" onSubmit={sendReset}>
          <h1>🏪 {APP_NAME}</h1>
          <h2>Recuperar contraseña</h2>
          {sent ? (
            <p className="msg ok">
              Listo. Si <b>{email.trim()}</b> tiene usuario, le llega un mail con un link para poner una contraseña nueva.
              Revisá también la carpeta de spam.
            </p>
          ) : (
            <>
              <p className="muted">Escribí tu email y te mandamos un link para poner una contraseña nueva.</p>
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              {error && <p className="msg error">{error}</p>}
              <button className="btn primary block" disabled={busy}>
                {busy ? 'Enviando…' : 'Enviarme el link'}
              </button>
            </>
          )}
          <button type="button" className="btn link" onClick={() => switchMode('login')}>
            ← Volver a ingresar
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="login">
      <form className="card form" onSubmit={submit}>
        <h1>🏪 {APP_NAME}</h1>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="msg error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
        <button type="button" className="btn link" onClick={() => switchMode('olvide')}>
          ¿Olvidaste tu contraseña?
        </button>
      </form>
    </div>
  )
}
