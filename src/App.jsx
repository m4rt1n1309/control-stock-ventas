import { useCallback, useEffect, useState } from 'react'
import { configured, supabase } from './lib/supabase'
import { getLicense, getOpenSession } from './lib/api'
import { APP_NAME, licenseStatus } from './lib/license'
import { LicenseBanner, LicenseBlocked } from './components/Licencia'
import Login from './screens/Login'
import Caja from './screens/Caja'
import Cargar from './screens/Cargar'
import Productos from './screens/Productos'
import CajaDiaria from './screens/CajaDiaria'

const TABS = [
  ['vender', '🛒', 'Vender'],
  ['cargar', '📷', 'Cargar'],
  ['productos', '📦', 'Productos'],
  ['caja', '💰', 'Caja'],
]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('vender')
  const [pendingCode, setPendingCode] = useState(null)
  // Caja abierta: undefined = cargando, null = cerrada, objeto = abierta
  const [caja, setCaja] = useState(undefined)

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Licencia: undefined = cargando, null = sin licencia (sin límite)
  const [license, setLicense] = useState(undefined)
  const status = licenseStatus(license ?? null)
  const blocked = status.kind === 'expired'

  // Se revisa al iniciar sesión, al cambiar de pestaña y cada 5 minutos (por si vence con la app abierta)
  useEffect(() => {
    if (!session) return
    getLicense().then(setLicense)
  }, [session?.user?.id, tab])
  useEffect(() => {
    if (!session) return
    const t = setInterval(() => getLicense().then(setLicense), 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [session?.user?.id])

  const refreshCaja = useCallback(() => {
    getOpenSession()
      .then((c) => setCaja(c ?? null))
      .catch(() => setCaja(null))
  }, [])

  // Recargar el estado de la caja al iniciar sesión y al cambiar de pestaña
  // (otro celular pudo haberla abierto o cerrado)
  useEffect(() => {
    if (session) refreshCaja()
  }, [session?.user?.id, tab, refreshCaja])

  const onCajaChange = (row) => (row ? setCaja(row) : refreshCaja())

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
        <strong className="app-name">🏪 {APP_NAME}</strong>
        {caja !== undefined && (
          <button className={`pill ${caja ? 'open' : 'closed'}`} onClick={() => setTab('caja')}>
            {caja ? '● Caja abierta' : '● Caja cerrada'}
          </button>
        )}
        <span className="muted user">{session.user.email}</span>
        <button className="btn small secondary" onClick={() => supabase.auth.signOut()}>
          Salir
        </button>
      </header>
      <LicenseBanner status={status} />

      <main>
        {blocked && (tab === 'vender' || tab === 'cargar') && <LicenseBlocked status={status} />}
        {/* La pantalla de venta queda siempre montada para no perder el carrito al cambiar de pestaña */}
        <div hidden={tab !== 'vender' || blocked}>
          <Caja
            active={tab === 'vender' && !blocked}
            caja={caja}
            onCajaChange={onCajaChange}
            onLoadNewCode={(code) => {
              setPendingCode(code)
              setTab('cargar')
            }}
          />
        </div>
        {tab === 'cargar' && !blocked && (
          <Cargar initialCode={pendingCode} onCodeConsumed={() => setPendingCode(null)} />
        )}
        {tab === 'productos' && <Productos readOnly={blocked} />}
        {tab === 'caja' && <CajaDiaria caja={caja} onCajaChange={onCajaChange} />}
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
