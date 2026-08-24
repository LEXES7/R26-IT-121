import { useEffect, useRef } from 'react'

/**
 * Rotating wireframe globe with live transfer arcs.
 *
 * Decorative, but not arbitrary: the points are accounts, the arcs are
 * transfers between them, and a small share are flagged in the alert colour —
 * so the hero shows what the platform actually watches rather than generic
 * motion. Canvas rather than SVG because ~600 projected points redrawn every
 * frame would thrash the DOM.
 *
 * Three behaviours that matter more than the visuals:
 *   - honours prefers-reduced-motion by rendering one static frame
 *   - pauses entirely when scrolled out of view, so it costs nothing on the
 *     rest of the page
 *   - redraws on resize at device pixel ratio, so it stays crisp on retina
 */

const LAT_LINES = 13
const LON_LINES = 24
const POINTS = 420
const ARCS = 9
const FLAGGED = 3          // arcs drawn in the alert colour
const TILT = -0.38         // radians; matches the template's axial lean

/* The wireframe is drawn in ink, which must invert with the theme — white
   lines on a pale canvas are invisible. Read at draw time rather than module
   load so a theme switch takes effect on the next frame. */
const inkRGB = () =>
  document.documentElement.dataset.theme === 'light' ? '15,23,42,' : '255,255,255,'
const ACCENT = '53,88,246,'     // accent-500
const ALERT = '239,68,68,'      // risk-critical

/** Deterministic PRNG so the layout is identical on every mount. */
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function buildScene() {
  const rand = rng(20260824)
  const points = Array.from({ length: POINTS }, () => {
    // Uniform on the sphere: acos keeps points from bunching at the poles.
    const theta = rand() * Math.PI * 2
    const phi = Math.acos(2 * rand() - 1)
    return { theta, phi, r: 0.6 + rand() * 1.1 }
  })

  const arcs = Array.from({ length: ARCS }, (_, i) => ({
    a: Math.floor(rand() * POINTS),
    b: Math.floor(rand() * POINTS),
    flagged: i < FLAGGED,
    phase: rand(),
    speed: 0.18 + rand() * 0.22,
  }))

  return { points, arcs }
}

/** Rotate around Y (spin) then X (tilt), and project to 2D. */
function project(theta, phi, spin, radius) {
  const t = theta + spin
  const x = Math.sin(phi) * Math.cos(t)
  const y = Math.cos(phi)
  const z = Math.sin(phi) * Math.sin(t)

  const yt = y * Math.cos(TILT) - z * Math.sin(TILT)
  const zt = y * Math.sin(TILT) + z * Math.cos(TILT)

  return { x: x * radius, y: yt * radius, z: zt, depth: (zt + 1) / 2 }
}

export default function Globe({ className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const scene = buildScene()

    let width = 0
    let height = 0
    let radius = 0
    let raf = 0
    let spin = reduced ? 0.6 : 0
    let visible = true
    let last = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      radius = Math.min(width, height) * 0.44
    }

    const draw = () => {
      const INK = `rgba(${inkRGB()}`
      ctx.clearRect(0, 0, width, height)
      ctx.save()
      ctx.translate(width / 2, height / 2)

      // ── Wireframe: latitude rings ──────────────────────────────────────
      for (let i = 1; i < LAT_LINES; i++) {
        const phi = (i / LAT_LINES) * Math.PI
        ctx.beginPath()
        for (let s = 0; s <= 64; s++) {
          const p = project((s / 64) * Math.PI * 2, phi, spin, radius)
          if (s === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }
        ctx.strokeStyle = `${INK}0.16)`
        ctx.lineWidth = 1
        ctx.setLineDash([3, 5])
        ctx.stroke()
      }

      // ── Wireframe: longitude arcs, front half only ─────────────────────
      ctx.setLineDash([])
      for (let i = 0; i < LON_LINES; i++) {
        const theta = (i / LON_LINES) * Math.PI * 2
        ctx.beginPath()
        let started = false
        for (let s = 0; s <= 48; s++) {
          const p = project(theta, (s / 48) * Math.PI, spin, radius)
          if (p.z < -0.05) { started = false; continue }
          if (!started) { ctx.moveTo(p.x, p.y); started = true } else ctx.lineTo(p.x, p.y)
        }
        ctx.strokeStyle = `${INK}0.13)`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // ── Rim ────────────────────────────────────────────────────────────
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0, Math.PI * 2)
      ctx.strokeStyle = `${INK}0.34)`
      ctx.lineWidth = 1.2
      ctx.stroke()

      // ── Account points ─────────────────────────────────────────────────
      for (const pt of scene.points) {
        const p = project(pt.theta, pt.phi, spin, radius)
        if (p.z < 0) continue                     // hidden behind the sphere
        const alpha = 0.18 + p.depth * 0.62
        ctx.beginPath()
        ctx.arc(p.x, p.y, pt.r * (0.5 + p.depth * 0.7), 0, Math.PI * 2)
        ctx.fillStyle = `${INK}${alpha.toFixed(3)})`
        ctx.fill()
      }

      // ── Transfer arcs ──────────────────────────────────────────────────
      for (const arc of scene.arcs) {
        const a = scene.points[arc.a]
        const b = scene.points[arc.b]
        const pa = project(a.theta, a.phi, spin, radius)
        const pb = project(b.theta, b.phi, spin, radius)
        if (pa.z < 0 && pb.z < 0) continue

        // Lift the control point off the surface so the arc reads as flight.
        const mx = (pa.x + pb.x) / 2
        const my = (pa.y + pb.y) / 2
        const lift = 1 + Math.hypot(pb.x - pa.x, pb.y - pa.y) / (radius * 2.4)
        const cx = mx * lift
        const cy = my * lift

        const rgb = arc.flagged ? ALERT : ACCENT
        const vis = Math.max(0, Math.min(pa.depth, pb.depth))

        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.quadraticCurveTo(cx, cy, pb.x, pb.y)
        ctx.strokeStyle = `rgba(${rgb}${(0.1 + vis * 0.35).toFixed(3)})`
        ctx.lineWidth = arc.flagged ? 1.4 : 1
        ctx.stroke()

        // Travelling pulse along the curve.
        const t = (arc.phase + spin * arc.speed) % 1
        const u = 1 - t
        const px = u * u * pa.x + 2 * u * t * cx + t * t * pb.x
        const py = u * u * pa.y + 2 * u * t * cy + t * t * pb.y
        ctx.beginPath()
        ctx.arc(px, py, arc.flagged ? 3 : 2.2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb}${(0.35 + vis * 0.55).toFixed(3)})`
        ctx.fill()
      }

      ctx.restore()
    }

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (visible) {
        spin += dt * 0.12
        draw()
      }
      raf = requestAnimationFrame(frame)
    }

    resize()
    draw()

    let observer
    if (!reduced) {
      raf = requestAnimationFrame(frame)
      observer = new IntersectionObserver(
        ([entry]) => { visible = entry.isIntersecting },
        { threshold: 0 },
      )
      observer.observe(canvas)
    }

    const onResize = () => { resize(); draw() }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`h-full w-full ${className}`}
    />
  )
}
