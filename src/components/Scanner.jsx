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
 * onScan(code) se llama cada vez que lee un código (ignora el mismo código repetido en 1,5 s).
 * Si la cámara lo permite, muestra zoom y linterna.
 */
export default function Scanner({ onScan, onClose, hint = 'Apuntá al código de barras' }) {
  const [elId] = useState(() => `scanner-${++counter}`)
  const [error, setError] = useState(null)
  const [zoom, setZoom] = useState(null) // { min, max, step, value }
  const [torch, setTorch] = useState(null) // null = no soportada, true/false = estado
  const [flash, setFlash] = useState(false)
  const qrRef = useRef(null)
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
    qrRef.current = qr
    let started = false
    let cancelled = false

    const stop = () => qr.stop().then(() => qr.clear()).catch(() => {})

    qr.start(
      { facingMode: 'environment' },
      {
        fps: 15,
        disableFlip: true,
        // Más resolución + enfoque continuo = mejor lectura en cámaras flojas
        videoConstraints: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: 'continuous' }],
        },
        qrbox: (w, h) => ({
          width: Math.max(50, Math.floor(w * 0.92)),
          height: Math.max(50, Math.floor(Math.min(h * 0.5, 200))),
        }),
      },
      (text) => {
        const now = Date.now()
        if (text === last.current.code && now - last.current.t < 1500) return
        last.current = { code: text, t: now }
        beep()
        setFlash(true)
        setTimeout(() => setFlash(false), 250)
        onScanRef.current(text)
      },
      () => {},
    )
      .then(() => {
        started = true
        if (cancelled) return stop()
        try {
          const caps = qr.getRunningTrackCapabilities?.() || {}
          if (caps.zoom && caps.zoom.max > caps.zoom.min) {
            // Arranca con un poco de zoom: así se puede alejar el celular y enfoca mejor
            const initial = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 1.5))
            qr.applyVideoConstraints({ advanced: [{ zoom: initial }] }).catch(() => {})
            setZoom({ min: caps.zoom.min, max: Math.min(caps.zoom.max, 5), step: caps.zoom.step || 0.1, value: initial })
          }
          if (caps.torch) setTorch(false)
        } catch {
          /* la cámara no informa capacidades */
        }
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
      qrRef.current = null
      if (started) stop()
    }
  }, [elId])

  function changeZoom(value) {
    const v = Number(value)
    setZoom((z) => ({ ...z, value: v }))
    qrRef.current?.applyVideoConstraints({ advanced: [{ zoom: v }] }).catch(() => {})
  }

  function toggleTorch() {
    const next = !torch
    setTorch(next)
    qrRef.current?.applyVideoConstraints({ advanced: [{ torch: next }] }).catch(() => setTorch(null))
  }

  return (
    <div className="scanner">
      <div className={`scanner-frame ${flash ? 'flash' : ''}`}>
        <div id={elId} className="scanner-view" />
      </div>

      {error ? (
        <p className="msg error">{error}</p>
      ) : (
        <>
          <p className="hint">{hint}</p>
          {(zoom || torch !== null) && (
            <div className="scanner-controls">
              {zoom && (
                <label className="zoom">
                  <span>🔍 Zoom</span>
                  <input
                    type="range"
                    min={zoom.min}
                    max={zoom.max}
                    step={zoom.step}
                    value={zoom.value}
                    onChange={(e) => changeZoom(e.target.value)}
                  />
                </label>
              )}
              {torch !== null && (
                <button type="button" className={`btn small ${torch ? 'primary' : 'secondary'}`} onClick={toggleTorch}>
                  🔦 {torch ? 'Apagar' : 'Linterna'}
                </button>
              )}
            </div>
          )}
          <p className="hint small">Si sale borroso: alejá el celular (15–20 cm) y usá el zoom.</p>
        </>
      )}

      {onClose && (
        <button type="button" className="btn secondary block" onClick={onClose}>
          Cerrar cámara
        </button>
      )}
    </div>
  )
}
