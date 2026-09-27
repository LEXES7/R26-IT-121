import { useEffect, useRef, useState } from 'react'

import { useTheme } from '../context/ThemeContext'
import markLight from '../assets/deepsentinel-mark.png'
import markDark from '../assets/deepsentinel-mark-dark.png'

/**
 * The opening curtain: hello in a few languages, then the mark, then it lifts.
 *
 * The mark is the payoff. The greetings are motion without meaning — pleasant,
 * but they could belong to any site — so the sequence resolves onto the one
 * image that could only be this one. It settles rather than arrives: it enters
 * slightly too large and eases down to its own size, which reads as coming to
 * rest instead of being pasted on.
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
// The first three always show, in this order. Sinhala and Tamil are not in
// Apple's set; they are here because that is where this was built, and being
// pinned rather than shuffled is the point — leaving them to the draw meant
// the project's own languages appeared on roughly half of visits.
const ALWAYS = 3
const GREETINGS = [
  'hello',        // English
  'ආයුබෝවන්',      // Sinhala  — ayubowan
  'வணக்கம்',       // Tamil    — vanakkam
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

// How long the mark holds before the curtain lifts. Long enough to land and be
// read as a mark rather than a flash; short enough that a returning visitor is
// not made to sit through a title card. The CSS settle runs 620ms, so this
// leaves roughly a third of a second of stillness at the end.
const MARK_MS = 980

// The ceiling has to clear the floor and the mark together, or a slow font
// request would race the guard that exists to protect against it.
const CEILING_MS = 6000

export default function Greeting() {
  // loading → mark → lifting → gone. `lifting` exists so the panel can finish
  // its exit before it unmounts; unmounting straight from `mark` would cut the
  // animation off at the first frame.
  const [phase, setPhase] = useState('loading')
  const [index, setIndex] = useState(0)
  const started = useRef(Date.now())

  // Two assets rather than one asset and a CSS filter. The source mark is not
  // a single-colour glyph — the shield and its lines are navy, and the area
  // they enclose is opaque near-white — so no filter can lighten one without
  // lightening the other: `brightness(0) invert(1)` flattened both to white
  // and the globe and eye disappeared into the shield. The dark asset is the
  // same artwork with that enclosed area made genuinely transparent.
  const { theme } = useTheme()
  const mark = theme === 'light' ? markLight : markDark

  // Chosen once, on mount. Recomputing during render would reshuffle the
  // words on every state change and turn the sequence into noise.
  const words = useRef(null)
  if (words.current === null) {
    const pinned = GREETINGS.slice(0, ALWAYS)
    const rest = GREETINGS.slice(ALWAYS)
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rest[i], rest[j]] = [rest[j], rest[i]]
    }
    words.current = [...pinned, ...rest.slice(0, Math.max(0, SHOWN - ALWAYS))]
  }

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPhase('gone')
      return
    }

    document.body.style.overflow = 'hidden'

    // Fetch the mark while the greetings are still running. It is not in the
    // DOM until the handover, so without this the browser would only start
    // loading it at the moment it is meant to appear — and the settle would
    // play against an empty box on a cold cache.
    new Image().src = mark

    const tick = setInterval(
      () => setIndex((i) => (i + 1) % words.current.length),
      STEP_MS,
    )

    // `reveal` runs once, whatever gets there first — the ready promise or the
    // ceiling. It stops the greetings, shows the mark, and starts the single
    // timer that lifts the curtain, so the mark is never skipped by a fast
    // load and never doubled by a slow one.
    let revealed = false
    let markTimer
    const reveal = () => {
      if (revealed) return
      revealed = true
      clearInterval(tick)
      setPhase('mark')
      markTimer = setTimeout(() => setPhase('lifting'), MARK_MS)
    }

    // Ready means fonts resolved and the window loaded. Both are wrapped
    // because a rejected fonts promise must not strand the curtain.
    const ready = Promise.all([
      document.fonts?.ready?.catch?.(() => {}) ?? Promise.resolve(),
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise((r) => window.addEventListener('load', r, { once: true })),
    ])

    let floorTimer
    ready.then(() => {
      const elapsed = Date.now() - started.current
      floorTimer = setTimeout(reveal, Math.max(0, FLOOR_MS - elapsed))
    }).catch(reveal)

    const ceiling = setTimeout(reveal, CEILING_MS)

    return () => {
      clearInterval(tick)
      clearTimeout(ceiling)
      clearTimeout(floorTimer)
      clearTimeout(markTimer)
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
      {phase === 'loading' ? (
        <div className="greeting-inner">
          <span className="greeting-dot" aria-hidden="true" />
          <span key={index} className="greeting-word" aria-hidden="true">
            {words.current[index]}
          </span>
        </div>
      ) : (
        <div className="greeting-mark" aria-hidden="true">
          {/* The glow sits behind the mark rather than on it: a filter on the
              image itself would bloom the shield's own edges and soften the
              one thing that has to stay sharp. */}
          <span className="greeting-mark-glow" />
          <img src={mark} alt="" className="greeting-mark-img" />
          <span className="greeting-mark-word">
            Deep<span className="greeting-mark-word-accent">Sentinel</span>
          </span>
        </div>
      )}
    </div>
  )
}
