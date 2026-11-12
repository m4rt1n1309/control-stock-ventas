import { useEffect, useRef, useState } from 'react'
import { fmtQty } from '../lib/format'

const SHOW_MAX = 8

/**
 * Botón de la barra de arriba con la cantidad de productos por terminarse.
 * Al tocarlo muestra cuáles son y lleva a Productos filtrado por stock bajo.
 */
export default function StockAlert({ items, onSeeAll }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  // Cerrar al tocar afuera
  useEffect(() => {
    if (!open) return
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  if (!items) return null
  const count = items.length

  function seeAll() {
    setOpen(false)
    onSeeAll()
  }

  return (
    <div className="stock-alert" ref={box}>
      <button
        className={`pill ${count ? 'low' : 'ok'}`}
        onClick={() => setOpen(!open)}
        aria-label={`${count} productos con stock bajo`}
      >
        {count ? `⚠ ${count}` : '✔'}
        <span className="pill-text"> {count ? 'stock bajo' : 'stock ok'}</span>
      </button>

      {open && (
        <div className="stock-pop card">
          {count === 0 ? (
            <p className="muted">No hay productos por terminarse ✔</p>
          ) : (
            <>
              <h3>
                {count === 1 ? '1 producto se está terminando' : `${count} productos se están terminando`}
              </h3>
              <ul>
                {items.slice(0, SHOW_MAX).map((p) => (
                  <li key={p.id} onClick={seeAll}>
                    <span>{p.name}</span>
                    <strong className={p.stock <= 0 ? 'neg' : 'warn'}>
                      {p.stock <= 0 ? 'sin stock' : `quedan ${fmtQty(p.stock, p.sold_by_weight)}`}
                    </strong>
                  </li>
                ))}
              </ul>
              {count > SHOW_MAX && <p className="muted small">y {count - SHOW_MAX} más…</p>}
              <button className="btn primary block" onClick={seeAll}>
                Ver {count > 1 ? 'todos' : ''} en Productos →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
