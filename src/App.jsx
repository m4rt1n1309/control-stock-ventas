import { useEffect, useState } from 'react'
import { configured, supabase } from './lib/supabase'
import Login from './screens/Login'
import Caja from './screens/Caja'
import Cargar from './screens/Cargar'
import Productos from './screens/Productos'
import Ventas from './screens/Ventas'

const TABS = [
  ['caja', '🛒', 'Caja'],
  ['cargar', '📷', 'Cargar'],
  ['productos', '📦', 'Productos'],
  ['ventas', '📊', 'Ventas'],
]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('caja')
  const [pendingCode, setPendingCode] = useState(null)

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!configured) {
    return (
      <div className="login">
        <div className="card">
          <h1>Falta configurar</h1>
          <p>
            Creá el archivo <code>.env</code> con <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (ver
            README).
          </p>
        </div>
      </div>
    )
  }

  if (session === undefined) return <p className="empty">Cargando…</p>
  if (!session) return <Login />

  return (
    <div className="app">
      <header className="topbar">
        <strong>🏪 Kiosco</strong>
        <span className="muted user">{session.user.email}</span>
        <button className="btn small secondary" onClick={() => supabase.auth.signOut()}>
          Salir
        </button>
      </header>

      <main>
        {/* La caja queda siempre montada para no perder el carrito al cambiar de pestaña */}
        <div hidden={tab !== 'caja'}>
          <Caja
            active={tab === 'caja'}
            onLoadNewCode={(code) => {
              setPendingCode(code)
              setTab('cargar')
            }}
          />
        </div>
        {tab === 'cargar' && <Cargar initialCode={pendingCode} onCodeConsumed={() => setPendingCode(null)} />}
        {tab === 'productos' && <Productos />}
        {tab === 'ventas' && <Ventas />}
      </main>

      <nav className="tabbar">
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <span className="tab-icon">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
