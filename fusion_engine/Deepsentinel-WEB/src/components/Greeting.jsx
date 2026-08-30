import { useEffect, useRef, useState } from 'react'

/**
 * The opening curtain: hello, in a few languages, then it lifts.
 *
 * Two things this deliberately is not.
 *
 * It is not a fake progress bar. The curtain lifts when the page is genuinely
 * ready — fonts resolved and the window loaded — not on a timer pretending to
 * measure something. A loader that outlasts the load is theatre, and on a
 * research project it is the wrong kind of theatre.
 *
 * It is not unconditional either. Two guards: a floor, so a warm cache does
 * not flash the panel for eighty milliseconds and read as a glitch; and a
 * ceiling, so a stalled font request cannot hold the site hostage. If
 * anything goes wrong the curtain lifts anyway — the failure mode of a
 * loading screen must never be a blank page.
 *
 * Sinhala and Tamil lead the list after English because that is where this
 * was built.
 */

// Apple's boot sequence, near enough. Lowercase throughout — that is most of
// the look; capitalising them turns a greeting into a label.
//
// Sinhala and Tamil are not in Apple's set. They are here because that is
// where this was built, and they lead after English for the same reason.
const GREETINGS = [
  'hello',        // English
  'ආයුබෝවන්',      // Sinhala
  'வணக்கம்',       // Tamil
  'olá',          // Portuguese
  '你好',           // Chinese
  'bonjour',      // French
  'こんにちは',      // Japanese
  '안녕하세요',      // Korean
  'hallo',        // German
  'ciao',         // Italian
  'שלום',          // Hebrew
  'привет',       // Russian
  'hola',         // Spanish
  'مرحبا',         // Arabic
  'नमस्ते',          // Hindi
  'merhaba',      // Turkish
  'γεια σας',     // Greek
  'สวัสดี',          // Thai
  'cześć',        // Polish
  'xin chào',     // Vietnamese
]

// The whole curtain lasts about 1.3 seconds, which is not long enough to show
// twenty greetings at a pace anyone can read. So it shows eight of them,
// drawn at random, after the fixed opening 'hello'.
//
// Cutting the list instead would have been the obvious fix and the worse one:
// a different handful every visit is more variety than a fixed ten, not less,
// and it costs nothing.
const SHOWN = 9
const STEP_MS = 112
const FLOOR_MS = SHOWN * STEP_MS + 190
// The ceiling has to clear the floor comfortably, or a slow font request
// would race the guard that exists to protect against it.
const CEILING_MS = 6000

export default function Greeting() {
  // loading → lifting → gone. The middle state exists so the panel can finish
  // its exit before it unmounts; unmounting straight from `loading` would cut
  // the animation off at the first frame.
  const [phase, setPhase] = useState('loading')
  const [index, setIndex] = useState(0)
  const started = useRef(Date.now())

  // Chosen once, on mount. Recomputing during render would reshuffle the
  // words on every state change and turn the sequence into noise.
  const words = useRef(null)
  if (words.current === null) {
    const [first, ...rest] = GREETINGS
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rest[i], rest[j]] = [rest[j], rest[i]]
    }
    words.current = [first, ...rest.slice(0, SHOWN - 1)]
  }

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPhase('gone')
      return
    }

    document.body.style.overflow = 'hidden'
    const tick = setInterval(
      () => setIndex((i) => (i + 1) % words.current.length),
      STEP_MS,
    )

    let lifted = false
    const lift = () => {
      if (lifted) return
      lifted = true
      setPhase('lifting')
    }

    // Ready means fonts resolved and the window loaded. Both are wrapped
    // because a rejected fonts promise must not strand the curtain.
    const ready = Promise.all([
      document.fonts?.ready?.catch?.(() => {}) ?? Promise.resolve(),
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise((r) => window.addEventListener('load', r, { once: true })),
    ])

    ready.then(() => {
      const elapsed = Date.now() - started.current
      setTimeout(lift, Math.max(0, FLOOR_MS - elapsed))
    }).catch(lift)

    const ceiling = setTimeout(lift, CEILING_MS)

    return () => {
      clearInterval(tick)
      clearTimeout(ceiling)
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    if (phase === 'gone') document.body.style.overflow = ''
  }, [phase])

  if (phase === 'gone') return null

  return (
    <div
      className={`greeting ${phase === 'lifting' ? 'greeting--lifting' : ''}`}
      // The curtain unmounts only once it has finished travelling, so the
      // transition is never cut short.
      onTransitionEnd={(e) => {
        if (e.propertyName === 'transform') setPhase('gone')
      }}
      role="status"
      aria-label="Loading DeepSentinel"
    >
      <div className="greeting-inner">
        <span className="greeting-dot" aria-hidden="true" />
        <span key={index} className="greeting-word" aria-hidden="true">
          {words.current[index]}
        </span>
      </div>
    </div>
  )
}
