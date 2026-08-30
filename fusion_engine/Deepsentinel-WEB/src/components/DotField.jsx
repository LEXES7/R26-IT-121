import { useEffect, useRef } from 'react'

/**
 * A field of drifting points that link up when they come close, and lean
 * toward the cursor.
 *
 * Written here rather than pulled from a component marketplace. Two reasons:
 * the marketplace one is paid and we have not licensed it, and a hosted
 * component fetched at runtime is a network dependency this product cannot
 * take — the whole system has to run from a clone on a machine that may be
 * offline. A proximity-linked particle field is a generic technique; this is
 * a first-principles version of it in about a hundred lines with no imports.
 *
 * It is a background. Three consequences follow, and each is enforced below:
 * it must never read text, never take a click, and never cost more than the
 * page it sits behind. It stops entirely when scrolled out of view, it halves
 * its own density on small screens, and it does not run at all for anyone who
 * asked for less motion.
 */

const LINK_DISTANCE = 132     // px within which two points draw a line
const POINTER_PULL = 0.55     // how strongly a nearby point leans toward the cursor
const POINTER_RANGE = 170

export default function DotField({ className, density = 0.00009 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    let points = []
    let frame = 0
    let running = false
    const pointer = { x: -9999, y: -9999 }

    // Read the palette from the page rather than hard-coding it, so the field
    // follows the theme toggle without a second definition to keep in sync.
    const styles = getComputedStyle(document.documentElement)
    const accent = (styles.getPropertyValue('--accent-400') || '45 212 191').trim()

    const build = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Density scales with area, then halves on a phone. A count tuned for a
      // desktop becomes a soup on a small screen and burns battery doing it.
      const small = width < 720
      const target = Math.round(width * height * density * (small ? 0.5 : 1))
      points = Array.from({ length: Math.max(14, Math.min(target, 90)) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
      }))
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      for (const p of points) {
        p.x += p.vx
        p.y += p.vy
        // Wrap rather than bounce: a point that turns around at an invisible
        // wall reveals where the edges are.
        if (p.x < -20) p.x = width + 20
        if (p.x > width + 20) p.x = -20
        if (p.y < -20) p.y = height + 20
        if (p.y > height + 20) p.y = -20

        const dx = pointer.x - p.x
        const dy = pointer.y - p.y
        const d = Math.hypot(dx, dy)
        if (d < POINTER_RANGE && d > 0.5) {
          const lean = (1 - d / POINTER_RANGE) * POINTER_PULL
          p.x += (dx / d) * lean
          p.y += (dy / d) * lean
        }
      }

      // Lines first, dots over them, so a dot is never bisected by its own link.
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const dx = points[i].x - points[j].x
          const dy = points[i].y - points[j].y
          const d = Math.hypot(dx, dy)
          if (d > LINK_DISTANCE) continue
          ctx.strokeStyle = `rgb(${accent} / ${(1 - d / LINK_DISTANCE) * 0.22})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(points[i].x, points[i].y)
          ctx.lineTo(points[j].x, points[j].y)
          ctx.stroke()
        }
      }

      for (const p of points) {
        const near = Math.hypot(pointer.x - p.x, pointer.y - p.y) < POINTER_RANGE
        ctx.fillStyle = `rgb(${accent} / ${near ? 0.75 : 0.4})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, near ? 1.9 : 1.3, 0, Math.PI * 2)
        ctx.fill()
      }

      frame = requestAnimationFrame(draw)
    }

    const start = () => {
      if (running) return
      running = true
      frame = requestAnimationFrame(draw)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }

    const onPointer = (e) => {
      const r = canvas.getBoundingClientRect()
      pointer.x = e.clientX - r.left
      pointer.y = e.clientY - r.top
    }
    const onLeave = () => { pointer.x = pointer.y = -9999 }

    build()
    start()

    // Off-screen, it stops. A background animating below the fold is pure cost.
    const seen = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0 },
    )
    seen.observe(canvas)

    const resize = new ResizeObserver(build)
    resize.observe(canvas)

    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', () =>
      (document.hidden ? stop() : start()))

    return () => {
      stop()
      seen.disconnect()
      resize.disconnect()
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [density])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
               pointerEvents: 'none' }}
    />
  )
}
