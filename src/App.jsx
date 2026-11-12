import { useCallback, useEffect, useState } from 'react'
import { configured, supabase } from './lib/supabase'
import { getLicense, getLowStock, getOpenSession } from './lib/api'
import StockAlert from './components/StockAlert'
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

  // Botón "atrás" del celular o del navegador: no sale de la app (para irse está "Salir").
  // Se agrega una entrada al historial que "ataja" el atrás. Chrome se saltea las entradas
  // creadas sin que el usuario haya tocado la página, así que se vuelve a poner con cada toque/tecla.
  useEffect(() => {
    if (!session) return
    let armed = false
    const push = () => history.pushState({ kiosco: true }, '', location.href)
    const arm = () => {
      if (armed) return
      armed = true
      push()
    }
    const onBack = () => {
      push() // quedarse en la app
      armed = false // y dejarla lista de nuevo con el próximo toque
    }
    push()
    window.addEventListener('popstate', onBack)
    window.addEventListener('pointerdown', arm, true)
    window.addEventListener('keydown', arm, true)
    return () => {
      window.removeEventListener('popstate', onBack)
      window.removeEventListener('pointerdown', arm, true)
      window.removeEventListener('keydown', arm, true)
    }
  }, [session?.user?.id])

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

  // Si no se pudo consultar (sin internet, sesión vencida) NO se marca como cerrada:
  // se deja como estaba y se reintenta, para no pedir abrir una caja que ya está abierta.
  const refreshCaja = useCallback(() => {
    const ask = (retries) =>
      getOpenSession()
        .then((c) => setCaja(c ?? null))
        .catch(() => {
          if (retries > 0) setTimeout(() => ask(retries - 1), 3000)
        })
    ask(3)
  }, [])

  // Recargar el estado de la caja al iniciar sesión y al cambiar de pestaña
  // (otro celular pudo haberla abierto o cerrado)
  useEffect(() => {
    if (session) refreshCaja()
  }, [session?.user?.id, tab, refreshCaja])

  const onCajaChange = (row) => (row ? setCaja(row) : refreshCaja())

  // Avisos de stock bajo: al iniciar, al cambiar de pestaña, después de cada venta y cada 5 minutos
  const [lowStock, setLowStock] = useState(null)
  const refreshLowStock = useCallback(() => {
    getLowStock().then(setLowStock).catch(() => {})
  }, [])
  useEffect(() => {
    if (session) refreshLowStock()
  }, [session?.user?.id, tab, refreshLowStock])
  useEffect(() => {
    if (!session) return
    const t = setInterval(refreshLowStock, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [session?.user?.id, refreshLowStock])

  // Abrir Productos mostrando solo los de stock bajo (la key nueva lo reinicia aunque ya esté abierto)
  const [productosView, setProductosView] = useState({ key: 0, lowOnly: false })
  function goTo(id) {
    if (id === 'productos') setProductosView((v) => ({ key: v.key + 1, lowOnly: false }))
    setTab(id)
  }
  function showLowStock() {
    setProductosView((v) => ({ key: v.key + 1, lowOnly: true }))
    setTab('productos')
  }

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
        <StockAlert items={lowStock} onSeeAll={showLowStock} />
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
            onSale={refreshLowStock}
            onLoadNewCode={(code) => {
              setPendingCode(code)
              setTab('cargar')
            }}
          />
        </div>
        {tab === 'cargar' && !blocked && (
          <Cargar initialCode={pendingCode} onCodeConsumed={() => setPendingCode(null)} />
        )}
        {tab === 'productos' && (
          <Productos
            key={productosView.key}
            initialLowOnly={productosView.lowOnly}
            readOnly={blocked}
            onStockChange={refreshLowStock}
          />
        )}
        {tab === 'caja' && <CajaDiaria caja={caja} onCajaChange={onCajaChange} />}
      </main>

      <nav className="tabbar">
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => goTo(id)}>
            <span className="tab-icon">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
