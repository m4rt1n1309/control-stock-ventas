import { useState } from 'react'
import { errorText } from '../lib/api'
import { downloadBackup } from '../lib/copiaExcel'

/** Botón para bajar un Excel con todos los datos del negocio. */
export default function CopiaDatos() {
  const [step, setStep] = useState(null) // hoja que se está armando
  const [msg, setMsg] = useState(null)

  async function download() {
    setMsg(null)
    setStep('…')
    try {
      const { name, counts } = await downloadBackup(setStep)
      const detail = `${counts.Productos} productos, ${counts.Ventas} ventas`
      setMsg({ type: 'ok', text: `Se descargó "${name}" (${detail}). Guardalo en un lugar seguro.` })
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err) })
    } finally {
      setStep(null)
    }
  }

  return (
    <div className="card">
      <h3>💾 Copia de los datos</h3>
      <p className="muted">
        Bajá un Excel con todos tus productos, ventas, cajas y movimientos, para tenerlo guardado por las dudas.
      </p>
      <button className="btn secondary block" onClick={download} disabled={Boolean(step)}>
        {step ? `Armando la copia… (${step})` : '⬇ Descargar copia en Excel'}
      </button>
      {msg && <p className={`msg ${msg.type}`}>{msg.text}</p>}
    </div>
  )
}
