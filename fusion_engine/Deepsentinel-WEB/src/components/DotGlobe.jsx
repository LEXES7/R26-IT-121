import { useEffect, useRef } from 'react'
import { isLand } from '../data/landmask'

/**
 * A rotating dotted Earth, drawn on a canvas.
 *
 * Points are placed by the Fibonacci spiral rather than on a latitude grid.
 * A lat/lon grid is the obvious construction and it looks wrong: the meridians
 * converge, so the poles turn into dense caps while the equator goes sparse.
 * The spiral gives every dot roughly equal area, which is what makes the
 * sphere read as a sphere instead of as a wireframe.
 *
 * Land is looked up from a bit-packed mask that ships with the page — the
 * globe has to draw with no network.
 *
 * Everything is one canvas and one animation frame. A DOM node per dot would
 * be several thousand elements re-laid-out sixty times a second.
 */

const DOTS = 7200          // before the land filter; ~2.4k survive
const TILT = -0.41         // ~23.5°, so it sits like a globe rather than a ball

export default function DotGlobe({
  className = '',
  markers = [],            // [{ lon, lat, level }] — where fraud is happening
  spin = true,
}) {
  const canvasRef = useRef(null)
  const markersRef = useRef(markers)
  markersRef.current = markers

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')

    // Land points, computed once — the mask never changes, and re-deriving
    // 7,200 points per frame would be the whole frame budget.
    const pts = []
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < DOTS; i += 1) {
      const y = 1 - (i / (DOTS - 1)) * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = golden * i
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r
      const lat = Math.asin(y) * 180 / Math.PI
      const lon = Math.atan2(z, x) * 180 / Math.PI
      if (isLand(lon, lat)) pts.push([x, y, z])
    }

    let raf = 0
    let angle = 0
    let last = performance.now()
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const box = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(box.width * dpr))
      canvas.height = Math.max(1, Math.floor(box.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const project = (p, cos, sin, cx, cy, radius) => {
      // spin about Y, then tilt about X
      const x = p[0] * cos + p[2] * sin
      const z = -p[0] * sin + p[2] * cos
      const y = p[1] * Math.cos(TILT) - z * Math.sin(TILT)
      const zz = p[1] * Math.sin(TILT) + z * Math.cos(TILT)
      return [cx + x * radius, cy - y * radius, zz]
    }

    const draw = (now) => {
      const dt = Math.min(64, now - last)
      last = now
      if (spin && !reduced) angle += dt * 0.00016

      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const cx = w / 2
      const cy = h / 2
      const radius = Math.min(w, h) * 0.42
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)

      ctx.clearRect(0, 0, w, h)

      for (let i = 0; i < pts.length; i += 1) {
        const [sx, sy, z] = project(pts[i], cos, sin, cx, cy, radius)
        if (z < -0.02) continue                 // the far side
        // Depth does the work: near dots are larger and brighter, which is
        // the only cue a flat orthographic projection gives for curvature.
        const d = (z + 1) / 2
        ctx.globalAlpha = 0.18 + d * 0.82
        const r = 0.7 + d * 1.25
        ctx.fillStyle = '#3ce07a'
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
      }

      // Fraud, on top of the land it happens on.
      const t = now / 1000
      for (const m of markersRef.current) {
        const lat = (m.lat * Math.PI) / 180
        const lon = (m.lon * Math.PI) / 180
        const p = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]
        const [sx, sy, z] = project(p, cos, sin, cx, cy, radius)
        if (z < 0) continue
        const hue = m.level === 'critical' ? '255,86,72'
          : m.level === 'high' ? '255,168,64' : '255,214,102'
        // A ring that expands and fades, restarting every 1.6s — the shape a
        // threat map uses because it reads as "here, just now" at a glance.
        const phase = ((t + (m.seed ?? 0)) % 1.6) / 1.6
        ctx.globalAlpha = (1 - phase) * 0.75
        ctx.strokeStyle = `rgb(${hue})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(sx, sy, 3 + phase * 17, 0, Math.PI * 2)
        ctx.stroke()

        ctx.globalAlpha = 0.95
        ctx.fillStyle = `rgb(${hue})`
        ctx.beginPath()
        ctx.arc(sx, sy, 2.4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [spin])

  return <canvas ref={canvasRef} className={className} aria-hidden />
}
