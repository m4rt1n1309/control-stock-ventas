export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Kiosco'

const DAY = 24 * 60 * 60 * 1000

/**
 * Estado de la licencia:
 *  none    → sin licencia (copia propia, sin límite)
 *  trial   → en prueba, { days } restantes
 *  active  → activa; si vence pronto, { days }
 *  expired → vencida o suspendida: no se puede vender ni cargar
 */
export function licenseStatus(lic, now = new Date()) {
  if (!lic) return { kind: 'none' }
  const exp = lic.expires_at ? new Date(lic.expires_at) : null
  if (lic.plan === 'suspendida' || (exp && exp <= now)) return { kind: 'expired', lic }
  const days = exp ? Math.max(1, Math.ceil((exp - now) / DAY)) : null
  if (lic.plan === 'prueba') return { kind: 'trial', days, lic }
  return { kind: 'active', days, lic }
}

export function whatsappLink(lic) {
  const n = lic?.contact_whatsapp?.replace(/\D/g, '')
  if (!n) return null
  const text = `Hola! Quiero seguir usando la app en ${APP_NAME}`
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}
