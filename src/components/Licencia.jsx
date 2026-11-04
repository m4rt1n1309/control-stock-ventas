import { whatsappLink } from '../lib/license'

/** Aviso fino arriba: días de prueba restantes, o prueba terminada. */
export function LicenseBanner({ status }) {
  if (status.kind === 'trial') {
    return (
      <div className="license-banner trial">
        🎁 Prueba gratis: {status.days === 1 ? 'último día' : `te quedan ${status.days} días`}
      </div>
    )
  }
  if (status.kind === 'active' && status.days !== null && status.days <= 3) {
    return <div className="license-banner trial">⏳ Tu abono vence en {status.days === 1 ? '1 día' : `${status.days} días`}</div>
  }
  if (status.kind === 'expired') {
    const wa = whatsappLink(status.lic)
    return (
      <div className="license-banner expired">
        <span>{status.lic.plan === 'suspendida' ? '⛔ Cuenta suspendida' : '⏰ Terminó el período de prueba'}</span>
        {wa && (
          <a className="btn small" href={wa} target="_blank" rel="noreferrer">
            Escribinos
          </a>
        )}
      </div>
    )
  }
  return null
}

/** Pantalla que reemplaza Vender / Cargar cuando la licencia está vencida. */
export function LicenseBlocked({ status }) {
  const wa = whatsappLink(status.lic)
  const suspended = status.lic.plan === 'suspendida'
  return (
    <div className="screen">
      <div className="card done">
        <div className="done-icon expired">⏰</div>
        <h2>{suspended ? 'Cuenta suspendida' : 'Terminó el período de prueba'}</h2>
        <p className="muted">
          Para seguir vendiendo y cargando productos, contactanos. Tus productos, ventas y cierres de caja quedan
          guardados: podés seguir consultándolos en <b>Productos</b> y <b>Caja</b>.
        </p>
        {wa && (
          <a className="btn success block big" href={wa} target="_blank" rel="noreferrer">
            💬 Escribir por WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
