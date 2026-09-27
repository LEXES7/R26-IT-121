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

export default function DotField({
  className,
  density = 0.00009,
  leader = false,
  style,
  dots = '255 255 255',
  accent: accentProp,
  drift = true,
  spacing = 46,
}) {
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

    // The travelling point. It wanders toward a target it re-picks whenever it
    // arrives, which reads as intent rather than as a bouncing ball, and it is
    // drawn toward the cursor when one is near. Its recent positions are kept
    // so it leaves a trail.
    const spider = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, trail: [] }
    const LEADER_LINK = 210

    // The leader's colour: given by the caller, otherwise the page's accent so
    // the field follows the theme toggle with no second definition to keep in
    // sync. The dots carry their own colour, since they are the network and
    // the leader is the thing moving through it.
    const styles = getComputedStyle(document.documentElement)
    const accent = (accentProp
      || styles.getPropertyValue('--accent-400')
      || '45 212 191').trim()

    const build = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const small = width < 720
      spider.x = width * 0.5
      spider.y = height * 0.5
      spider.trail.length = 0

      if (drift) {
        // Density scales with area, then halves on a phone. A count tuned for
        // a desktop becomes a soup on a small screen and burns battery.
        const target = Math.round(width * height * density * (small ? 0.5 : 1))
        points = Array.from({ length: Math.max(14, Math.min(target, 90)) }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
        }))
      } else {
        // A still field is laid out on a lattice, not scattered. Random
        // placement always leaves clumps and bald patches, and once the dots
        // stop moving the eye has time to find every one of them. The spacing
        // is derived from `spacing` and then divided evenly into the box, so
        // the margins on both sides match at any width.
        const step = small ? spacing * 1.35 : spacing
        const cols = Math.max(3, Math.round(width / step))
        const rows = Math.max(2, Math.round(height / step))
        const gapX = width / (cols + 1)
        const gapY = height / (rows + 1)
        points = []
        for (let r = 1; r <= rows; r += 1) {
          for (let col = 1; col <= cols; col += 1) {
            points.push({ x: gapX * col, y: gapY * r, vx: 0, vy: 0 })
          }
        }
      }

      const first = points[Math.floor(Math.random() * points.length)] ?? { x: 0, y: 0 }
      spider.tx = first.x
      spider.ty = first.y
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      if (drift) {
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

        // Dot-to-dot webbing belongs to the drifting field. A still field wants
        // only the leader's threads, or the whole thing reads as a static mesh
        // with something stuck in it.
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
      }

      for (const p of points) {
        const lit = leader && Math.hypot(spider.x - p.x, spider.y - p.y) < LEADER_LINK
        ctx.fillStyle = `rgb(${dots} / ${lit ? 0.85 : 0.42})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, lit ? 1.9 : 1.35, 0, Math.PI * 2)
        ctx.fill()
      }

      if (leader) drawLeader()

      frame = requestAnimationFrame(draw)
    }

    /** The spider: steer, trail, link to whatever it is passing. */
    const drawLeader = () => {
      // Steer toward the target, or toward the cursor when one is close by.
      let tx = spider.tx
      let ty = spider.ty
      const pd = Math.hypot(pointer.x - spider.x, pointer.y - spider.y)
      if (pd < 260) { tx = pointer.x; ty = pointer.y }

      const dx = tx - spider.x
      const dy = ty - spider.y
      const d = Math.hypot(dx, dy) || 1
      // Accelerate toward the target and bleed speed, so it eases in and out
      // instead of snapping between waypoints.
      spider.vx = (spider.vx + (dx / d) * 0.14) * 0.96
      spider.vy = (spider.vy + (dy / d) * 0.14) * 0.96
      spider.x += spider.vx
      spider.y += spider.vy

      // Arrived: pick another dot to head for. Targeting the dots themselves
      // rather than empty coordinates is what makes it read as travelling
      // through the network instead of drifting across it.
      if (d < 26 && pd >= 260 && points.length) {
        const next = points[Math.floor(Math.random() * points.length)]
        spider.tx = next.x
        spider.ty = next.y
      }

      spider.trail.push({ x: spider.x, y: spider.y })
      if (spider.trail.length > 26) spider.trail.shift()

      // Trail, oldest and faintest first.
      for (let i = 1; i < spider.trail.length; i += 1) {
        const t = i / spider.trail.length
        ctx.strokeStyle = `rgb(${accent} / ${t * 0.3})`
        ctx.lineWidth = t * 1.8
        ctx.beginPath()
        ctx.moveTo(spider.trail[i - 1].x, spider.trail[i - 1].y)
        ctx.lineTo(spider.trail[i].x, spider.trail[i].y)
        ctx.stroke()
      }

      // Threads to whatever it is passing. Reaches further than the dots do
      // among themselves, so the leader reads as the thing making connections.
      for (const p of points) {
        const dd = Math.hypot(p.x - spider.x, p.y - spider.y)
        if (dd > LEADER_LINK) continue
        ctx.strokeStyle = `rgb(${accent} / ${(1 - dd / LEADER_LINK) * 0.42})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(spider.x, spider.y)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }

      const glow = ctx.createRadialGradient(spider.x, spider.y, 0, spider.x, spider.y, 16)
      glow.addColorStop(0, `rgb(${accent} / 0.5)`)
      glow.addColorStop(1, `rgb(${accent} / 0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(spider.x, spider.y, 16, 0, Math.PI * 2)
      ctx.fill()

      const half = 4
      ctx.fillStyle = `rgb(${accent} / 0.95)`
      ctx.fillRect(spider.x - half, spider.y - half, half * 2, half * 2)
      ctx.strokeStyle = `rgb(${accent} / 0.55)`
      ctx.lineWidth = 1
      ctx.strokeRect(spider.x - half - 3, spider.y - half - 3, (half + 3) * 2, (half + 3) * 2)
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
  }, [density, leader, dots, accentProp, drift, spacing])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      // Caller styles come last: a mask or opacity passed in has to win over
      // these defaults, not be silently dropped by them.
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
               pointerEvents: 'none', ...style }}
    />
  )
}
