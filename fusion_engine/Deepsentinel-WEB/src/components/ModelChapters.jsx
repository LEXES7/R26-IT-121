import { Link } from 'react-router-dom'
import Reveal from './Reveal'
import ModelArt from './ModelArt'
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
          {CHAPTERS.map((c, i) => (
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
                <ModelArt kind={c.color} />
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
          ))}
        </div>
      </div>
    </section>
  )
}
