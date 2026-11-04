import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode'

const FORMATS = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF]

let counter = 0
let audioCtx = null

function beep() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = 1400
    gain.gain.value = 0.15
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.08)
  } catch {
    /* sin sonido */
  }
  navigator.vibrate?.(60)
}

/**
 * Lector de códigos de barra con la cámara trasera.
 * onScan(code) se llama cada vez que lee un código (ignora el mismo código repetido en 2 s).
 */
export default function Scanner({ onScan, onClose }) {
  const [elId] = useState(() => `scanner-${++counter}`)
  const [error, setError] = useState(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const last = useRef({ code: null, t: 0 })

  useEffect(() => {
    if (!window.isSecureContext) {
      setError('La cámara solo funciona con HTTPS. Abrí la app desde la dirección https://')
      return
    }

    const qr = new Html5Qrcode(elId, {
      formatsToSupport: FORMATS,
      verbose: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    })
    let started = false
    let cancelled = false

    const stop = () => qr.stop().then(() => qr.clear()).catch(() => {})

    qr.start(
      { facingMode: 'environment' },
      {
        fps: 12,
        qrbox: (w, h) => ({
          width: Math.max(50, Math.floor(Math.min(w * 0.9, 420))),
          height: Math.max(50, Math.floor(Math.min(h * 0.45, 170))),
        }),
      },
      (text) => {
        const now = Date.now()
        if (text === last.current.code && now - last.current.t < 2000) return
        last.current = { code: text, t: now }
        beep()
        onScanRef.current(text)
      },
      () => {},
    )
      .then(() => {
        started = true
        if (cancelled) stop()
      })
      .catch((err) => {
        const msg = String(err?.message || err)
        if (/Permission|NotAllowed/i.test(msg)) {
          setError('No se dio permiso para usar la cámara. Habilitalo en la configuración del navegador.')
        } else if (/NotFound|Requested device not found/i.test(msg)) {
          setError('No se encontró una cámara en este dispositivo.')
        } else {
          setError('No se pudo iniciar la cámara: ' + msg)
        }
      })

    return () => {
      cancelled = true
      if (started) stop()
    }
  }, [elId])

  return (
    <div className="scanner">
      <div id={elId} className="scanner-view" />
      {error && <p className="msg error">{error}</p>}
      {!error && <p className="hint">Apuntá al código de barras</p>}
      {onClose && (
        <button type="button" className="btn secondary block" onClick={onClose}>
          Cerrar cámara
        </button>
      )}
    </div>
  )
}
