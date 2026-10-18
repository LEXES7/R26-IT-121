import { Link } from 'react-router-dom'
import Reveal from './Reveal'
import { Eyebrow } from './Editorial'
import { cx } from './ui'
import { COMPONENTS, COMPONENT_ORDER } from '../data/components'

/**
 * The four components as four chapters.
 *
 * Tall cards rather than an index of rows: each carries a small moving
 * picture of the signal its model reads, so the difference between them is
 * seen before it is read. The fusion card is set apart, ruled in teal on the
 * dark theme and solid ink on the light one, because it is not a fourth
 * opinion. It is where the other three are weighed.
 */

const CHAPTERS = COMPONENT_ORDER.map((slug) => COMPONENTS[slug])

const LABEL = {
  graph: 'text-modality-graph',
  behavioral: 'text-modality-behavioral',
  temporal: 'text-modality-temporal',
  fusion: 'text-accent-400',
}

const TINT = {
  graph: 'var(--modality-graph)',
  behavioral: 'var(--modality-behavioral)',
  temporal: 'var(--modality-temporal)',
  fusion: 'var(--accent-400)',
}

const art = 'relative h-auto w-full'

/** Senders converging on one account, and that account flagged. */
function NetworkArt() {
  const senders = [[30, 20], [20, 70], [60, 100]]
  const onward = [[200, 30], [210, 86]]
  return (
    <svg viewBox="0 0 240 110" aria-hidden className={art}>
      <g className="stroke-modality-graph" strokeOpacity="0.75" strokeWidth="1.6">
        {senders.map(([x, y]) => (
          <line key={`in-${x}`} className="art-flow" x1={x} y1={y} x2="120" y2="55" />
        ))}
        {onward.map(([x, y]) => (
          <line key={`out-${x}`} className="art-flow" x1="120" y1="55" x2={x} y2={y} />
        ))}
      </g>
      <g className="fill-modality-graph">
        {[...senders, ...onward].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />)}
      </g>
      <circle className="art-ping fill-risk-critical" cx="120" cy="55" r="9" />
      <circle className="fill-risk-critical" cx="120" cy="55" r="9" />
    </svg>
  )
}

// Feature reconstruction errors: most in range, two that the model could not
// account for.
const BEHAVIOUR = [40, 58, 100, 50, 80, 36, 54, 30, 44]
const UNEXPLAINED = new Set([2, 4])

function BehaviourArt() {
  return (
    <svg viewBox="0 0 240 110" aria-hidden className={art}>
      <g className="fill-modality-behavioral">
        {BEHAVIOUR.map((h, i) => (
          <rect key={i} x={6 + i * 26} y={110 - h} width="16" height={h} rx="3"
                fillOpacity={UNEXPLAINED.has(i) ? 1 : 0.35} />
        ))}
      </g>
    </svg>
  )
}

// Activity over time: an even rhythm, then a burst no person types at.
const TIMING = [40, 48, 34, 50, 38, 44, 32, 46, 36, 80, 102, 88, 66, 46, 38, 42, 34]
const inBurst = (i) => i >= 9 && i <= 12

function TimingArt() {
  return (
    <svg viewBox="0 0 240 110" aria-hidden className={art}>
      <g className="fill-modality-temporal">
        {TIMING.map((h, i) => (
          <rect key={i} x={2 + i * 14} y={110 - h} width="9" height={h} rx="2"
                fillOpacity={inBurst(i) ? 1 : 0.35} />
        ))}
      </g>
    </svg>
  )
}

/** Three readings flowing into one. */
function FusionArt() {
  return (
    <svg viewBox="0 0 240 110" aria-hidden className={art}>
      <g fill="none" strokeWidth="3" strokeLinecap="round">
        <path className="art-flow stroke-modality-graph" d="M6 18 C 80 18, 100 55, 150 55" />
        <path className="art-flow stroke-modality-behavioral" d="M6 55 L 150 55" />
        <path className="art-flow stroke-modality-temporal" d="M6 92 C 80 92, 100 55, 150 55" />
        <path className="stroke-accent-400" strokeWidth="5" d="M150 55 L 214 55" />
      </g>
      <circle className="art-ping fill-accent-400" cx="222" cy="55" r="9" />
      <circle className="fill-accent-400" cx="222" cy="55" r="9" />
    </svg>
  )
}

const ART = { graph: NetworkArt, behavioral: BehaviourArt, temporal: TimingArt, fusion: FusionArt }

export default function ModelChapters() {
  return (
    <section className="chapters-band">
      <div className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <Reveal>
            <Eyebrow>The architecture</Eyebrow>
            <h2 className="display mt-4 text-[2.75rem] leading-[0.96] text-slate-100 sm:text-[4rem]">
              Four models,
              <br />
              <span className="display-italic text-accent-400">one verdict.</span>
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="max-w-md text-base leading-relaxed text-slate-400">
              Three detectors each read a signal the others cannot see: the
              network, the behaviour, the timing. Fusion weighs them into one
              verdict. Each ships as its own evaluated, deployable API.
            </p>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CHAPTERS.map((c, i) => {
            const Art = ART[c.color]
            return (
              <Reveal key={c.slug} delay={i * 90}>
                <Link
                  to={`/components/${c.slug}`}
                  className={cx('glass chapter arrow-slide', c.color === 'fusion' && 'chapter--anchor')}
                  style={{ '--tint': TINT[c.color] }}
                >
                  <span aria-hidden className="chapter-glow" />
                  <span className="relative flex items-baseline justify-between">
                    <span className="display text-[4rem] leading-none text-slate-100/85">0{i + 1}</span>
                    <span className={cx('eyebrow font-semibold', LABEL[c.color])}>{c.modality}</span>
                  </span>
                  <Art />
                  <span className="display display-italic relative mt-auto text-[1.625rem] leading-[1.1] text-slate-100">
                    {c.tagline}.
                  </span>
                  <span className="relative text-sm leading-relaxed text-slate-400">
                    <span className="text-slate-300">{c.title}.</span> {c.question}
                  </span>
                  <span className="relative text-[13px] font-medium text-slate-300">
                    Explore <span className="arrow inline-block">&rarr;</span>
                  </span>
                </Link>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
