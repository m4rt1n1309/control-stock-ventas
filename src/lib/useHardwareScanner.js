import { useEffect, useRef } from 'react'

const MAX_GAP_MS = 80 // un lector "tipea" mucho más rápido que una persona
const IDLE_MS = 150 // por si el lector está configurado para no mandar Enter al final
const MIN_LENGTH = 4

const isEditable = (el) => el?.matches?.('input, textarea, select, [contenteditable="true"]')

/**
 * Detecta lectores de código de barras USB, que funcionan como un teclado muy rápido.
 * Si el cursor está en un campo de texto no interviene: el código se escribe ahí.
 * Devuelve una función para dejar de escuchar.
 */
export function listenForScans(target, onScan) {
  let buffer = ''
  let lastTime = 0
  let idleTimer = null

  function flush() {
    clearTimeout(idleTimer)
    const code = buffer
    buffer = ''
    if (code.length >= MIN_LENGTH) onScan(code)
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || isEditable(e.target)) {
      clearTimeout(idleTimer)
      buffer = ''
      return
    }

    const fast = e.timeStamp - lastTime <= MAX_GAP_MS

    if (e.key === 'Enter' || e.key === 'Tab') {
      if (fast && buffer.length >= MIN_LENGTH) {
        // Que el Enter del lector no apriete el botón que haya quedado seleccionado
        e.preventDefault()
        e.stopPropagation()
        flush()
      } else {
        clearTimeout(idleTimer)
        buffer = ''
      }
      return
    }

    if (e.key.length !== 1) return // Shift y otras teclas especiales

    buffer = fast ? buffer + e.key : e.key
    lastTime = e.timeStamp
    clearTimeout(idleTimer)
    idleTimer = setTimeout(flush, IDLE_MS)
  }

  target.addEventListener('keydown', onKeyDown, true)
  return () => {
    clearTimeout(idleTimer)
    target.removeEventListener('keydown', onKeyDown, true)
  }
}

/** Llama a onScan(code) con cada lectura, salvo que haya un formulario de producto abierto. */
export function useHardwareScanner(onScan, enabled = true) {
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) return
    return listenForScans(window, (code) => {
      if (!document.querySelector('[data-block-scanner]')) onScanRef.current(code)
    })
  }, [enabled])
}
