import { useEffect, useRef } from 'react'

/**
 * A word crossing a dot-matrix board, the way a station or shopfront sign does.
 *
 * Drawn on a canvas rather than built from DOM nodes. The board is a few
 * thousand dots and it repaints every frame; that is a handful of arcs in one
 * canvas, and it would be a few thousand elements the compositor has to keep
 * alive if it were divs.
 *
 * The unlit dots are drawn too, faintly. A real board is a grid of lamps most
 * of which are off, and showing only the lit ones loses the thing that makes
 * it read as a sign rather than as text.
 *
 * Same three rules as the other ambient pieces here: it stops when scrolled
 * out of view, it never renders for anyone who asked for less motion, and it
 * cannot be clicked.
 */

// Standard 5x7 cell font. Full alphabet rather than only the letters in the
// default word — a partial font that silently renders blanks for anything else
// is a trap for whoever reuses this.
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}

const ROWS = 7
const GLYPH_W = 5
const SPACING = 1          // blank columns between letters
const GAP = 6              // blank columns between repeats of the word

/** The word as one column-major bitmap: bitmap[col][row] = lit. */
function toColumns(word) {
  const cols = []
  for (const ch of word.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' ']
    for (let x = 0; x < GLYPH_W; x += 1) {
      cols.push(Array.from({ length: ROWS }, (_, y) => g[y][x] === '1'))
    }
    for (let s = 0; s < SPACING; s += 1) cols.push(Array(ROWS).fill(false))
  }
  return cols
}

export default function LedSign({
  word = 'DEEPSENTINEL',
  dot = 5,               // diameter of one lamp, px
  pitch = 8,             // centre-to-centre spacing, px
  speed = 26,            // columns per second
  className,
  style,
}) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const glyph = toColumns(word)
    const period = glyph.length + GAP        // one full cycle, in columns
    let width = 0
    let visibleCols = 0
    let offset = 0                           // columns scrolled so far
    let raf = 0
    let last = 0
    let running = false

    const build = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(ROWS * pitch * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      visibleCols = Math.ceil(width / pitch) + 1
    }

    const draw = (now) => {
      const dt = last ? (now - last) / 1000 : 0
      last = now
      // Travelling right: the word enters at the left edge, so the sampled
      // column index decreases as time advances.
      offset = (offset - speed * dt) % period
      if (offset < 0) offset += period

      ctx.clearRect(0, 0, width, ROWS * pitch)
      const r = dot / 2
      for (let c = 0; c < visibleCols; c += 1) {
        const src = Math.floor(offset + c) % period
        const column = src < glyph.length ? glyph[src] : null
        for (let y = 0; y < ROWS; y += 1) {
          const lit = column ? column[y] : false
          ctx.fillStyle = lit ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.055)'
          ctx.beginPath()
          ctx.arc(c * pitch + r, y * pitch + r, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      raf = requestAnimationFrame(draw)
    }

    const start = () => {
      if (running) return
      running = true
      last = 0
      raf = requestAnimationFrame(draw)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    build()
    start()

    const seen = new IntersectionObserver(
      ([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0 })
    seen.observe(canvas)
    const resize = new ResizeObserver(build)
    resize.observe(canvas)
    const onVis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVis)

    return () => {
      stop()
      seen.disconnect()
      resize.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [word, dot, pitch, speed])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ display: 'block', width: '100%', height: ROWS * pitch,
               pointerEvents: 'none', ...style }}
    />
  )
}
