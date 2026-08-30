import { useEffect } from 'react'

/**
 * Point the specular highlight at the cursor.
 *
 * Liquid glass reads as glass because the light on it moves when you do. A
 * highlight fixed at the top is a painted-on shine, which is the older glossy
 * language this replaced.
 *
 * One delegated listener rather than per-element handlers: these surfaces are
 * on every public page and several render in loops, so binding individually
 * would mean dozens of listeners for an effect that only ever applies to
 * whichever one is under the pointer.
 *
 * It writes CSS custom properties rather than React state. This is a paint
 * concern; routing it through state would re-render the page on every move.
 */
export default function useLiquidPointer() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // Coarse pointers have no hover, so the highlight would only ever be a
    // stale smudge left behind at the last tap.
    if (!window.matchMedia?.('(hover: hover)').matches) return

    let frame = 0
    const onMove = (e) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const el = e.target?.closest?.('.liquid, .liquid-solid')
        if (!el) return
        const r = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
        el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
      })
    }

    document.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
}
