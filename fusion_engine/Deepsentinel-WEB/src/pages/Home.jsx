import { Link } from 'react-router-dom'
import { ArrowLink, Display, Eyebrow } from '../components/Editorial'
import Globe from '../components/Globe'
import Reveal from '../components/Reveal'
import ScrollRevealText from '../components/ScrollRevealText'
import TransactionStory from '../components/TransactionStory'
import { IconBlackBox, IconHallucination, IconLink } from '../components/Icons'
import PipelineDiagram from '../components/PipelineDiagram'
import { useAuth } from '../context/AuthContext'
import { Badge, cx } from '../components/ui'
import { COMPONENTS as COMPONENT_DATA, COMPONENT_ORDER } from '../data/components'

// The hero used to end in a row of research figures — F1, calibration error,
// seed counts, a p-value. They were all honest and all measured, and they were
// still wrong here: this is the front door of a product, and someone arriving
// at it wants to know what the thing does, not how its evaluation was
// designed. The numbers still exist where they belong, on the component pages
// and in the console.
const PROBLEM = [
  {
    Icon: IconBlackBox,
    title: 'The model says fraud. It cannot say why.',
    body: 'A neural network returns a probability. An investigator building a case needs reasoning, and a regulator needs an audit trail. A score alone satisfies neither.',
  },
  {
    Icon: IconHallucination,
    title: 'A language model will happily invent the why.',
    body: 'Ask an unconstrained LLM to explain a fraud score and it produces fluent, confident narrative — including details that were never in the data. In a compliance filing that is worse than no explanation.',
  },
  {
    Icon: IconLink,
    title: 'Neither problem is solved by the other alone.',
    body: 'DeepSentinel grounds every sentence of the narrative in a retrieved FATF typology and the actual model outputs, so each claim traces back to evidence.',
  },
]

// Read from the component reference data rather than restated here. This list
// was a second copy, and it drifted: it still described the temporal detector
// as a "System-Context Temporal CNN" looking for off-hours bursts weeks after
// that component became a transaction-sequence TCN with a different claim.
const COMPONENTS = COMPONENT_ORDER.map((slug) => COMPONENT_DATA[slug])

const MODALITY_STYLE_TEXT = {
  graph: 'text-modality-graph',
  behavioral: 'text-modality-behavioral',
  temporal: 'text-modality-temporal',
  fusion: 'text-accent-400',
}

const MODALITY_STYLE = {
  graph: 'text-modality-graph border-modality-graph/30 bg-modality-graph/10',
  behavioral: 'text-modality-behavioral border-modality-behavioral/30 bg-modality-behavioral/10',
  temporal: 'text-modality-temporal border-modality-temporal/30 bg-modality-temporal/10',
  fusion: 'text-green-400 border-green-500/30 bg-green-500/10',
}

export default function Home() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {/* Two columns: the argument on the left, the globe as a subject on the
          right. Centring the copy over a faint backdrop made both compete and
          neither land. */}
      <section className="relative overflow-hidden border-b border-subtle">
        <div aria-hidden className="ambient" />

        <div className="relative mx-auto grid max-w-[88rem] items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_minmax(0,36rem)] lg:gap-10 lg:py-28">
          {/* Left — the argument */}
          {/* The hero arrives in reading order: what this is, the claim, the
              qualification, then what you can do about it. Each step is a
              beat behind the last, so the eye is led rather than presented
              with everything at once. */}
          <div>
            <div className="enter enter--soft" style={{ '--d': '0.06s' }}>
              <Eyebrow>Multi-modal fraud detection</Eyebrow>
            </div>

            {/* Serif, not the bold sans every product page uses. The italic
                clause is the promise; the roman half is the commodity. Each
                line rises out of its own edge — the clip is what makes the
                words appear from nothing instead of merely fading. */}
            <h1 className="display mt-5 text-[3.5rem] text-slate-100 sm:text-[4.75rem]">
              <span className="line-mask">
                <span className="enter enter--mask block" style={{ '--d': '0.2s' }}>
                  Detect the fraud.
                </span>
              </span>
              <span className="line-mask">
                <span className="enter enter--mask block" style={{ '--d': '0.38s' }}>
                  <span className="display-italic enter-focus text-accent-400">
                    Then prove it.
                  </span>
                </span>
              </span>
            </h1>

            <p className="enter enter--soft mt-6 max-w-xl text-base leading-relaxed text-slate-400"
               style={{ '--d': '0.62s' }}>
              Three deep learning models examine a transaction from different
              angles. A retrieval layer grounds the explanation in FATF typology.
              What comes out is not a score — it is a{' '}
              <span className="text-slate-200">forensic report an investigator can act on</span>.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Link
                to={isAuthenticated ? '/' : '/login'}
                className="liquid-solid enter enter--rise inline-flex items-center rounded-xl px-7 py-3.5 text-sm font-semibold"
                style={{ '--d': '0.78s' }}
              >
                {isAuthenticated ? 'Open the analyzer' : 'Sign in to run it'}
              </Link>
              <a href="#pipeline"
                 className="liquid arrow-slide enter enter--side inline-flex items-center rounded-xl px-6 py-3.5 text-sm text-slate-200"
                 style={{ '--d': '0.9s' }}>
                <ArrowLink>See how it works</ArrowLink>
              </a>
            </div>

          </div>

          {/* Right — the globe, as an object rather than a backdrop */}
          <div className="relative hidden lg:block">
            <div className="aspect-square w-full">
              <Globe />
            </div>
          </div>
        </div>

        {/* Small screens: a shorter globe below the copy rather than none. */}
        <div className="relative -mt-6 h-64 px-4 pb-10 lg:hidden">
          <div className="mx-auto h-full w-full max-w-sm opacity-70">
            <Globe />
          </div>
        </div>
      </section>

      {/* ── The problem ──────────────────────────────────────────────────── */}
      {/* Three claims that build on each other, so they are numbered and ruled
          rather than boxed. Equal-weight cards read as a feature grid; this is
          an argument. */}
      <section className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>The problem</Eyebrow>
          <h2 className="display mt-4 text-[2.5rem] text-slate-100 sm:text-[3.25rem]">
            <ScrollRevealText as="span">Fraud detection has</ScrollRevealText>{' '}
            <span className="display-italic text-accent-400">an explanation problem.</span>
          </h2>
        </Reveal>

        <div className="hair-t mt-14 grid gap-x-10 gap-y-12 pt-12 md:grid-cols-3">
          {PROBLEM.map((p, i) => (
            <Reveal key={p.title} delay={i * 110}>
              <article className={cx('glass card-hover h-full rounded-2xl p-6', i > 0 && 'md:pl-6')}>
                <div className="flex items-baseline gap-4">
                  <span className="display text-[2.5rem] leading-none text-slate-700">
                    0{i + 1}
                  </span>
                  <span className="text-slate-600"><p.Icon /></span>
                </div>
                <h3 className="mt-5 text-lg font-semibold leading-snug text-slate-100">
                  {p.title}
                </h3>
                <ScrollRevealText className="mt-3 text-sm leading-relaxed text-slate-400">
                  {p.body}
                </ScrollRevealText>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How it works: pinned scrollytelling ─────────────────────────── */}
      <div id="pipeline">
        <TransactionStory />
      </div>

      {/* ── Interactive pipeline explorer ────────────────────────────────── */}
      <section className="mx-auto max-w-6xl space-y-8 px-4 py-24 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>Explore it yourself</Eyebrow>
          <Display lead="Every stage," accent="on demand" className="mt-4" />
          <p className="mt-5 text-sm leading-relaxed text-slate-500">
            Select any stage to see what happens there. The same worked example
            carries through all five.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <PipelineDiagram />
        </Reveal>
      </section>

      {/* ── The four components ──────────────────────────────────────────── */}
      {/* An index, not a card grid: each row is a claim you can open. Numbered
          and ruled so the four read as one system rather than four products. */}
      <section className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>The architecture</Eyebrow>
          <h2 className="display mt-4 text-[2.5rem] text-slate-100 sm:text-[3.25rem]">
            Four models,{' '}
            <span className="display-italic text-accent-400">one verdict.</span>
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-400">
            Each detector reads a different signal — network structure, behaviour
            and timing — and each ships as its own evaluated, deployable API. The
            fusion engine consumes all three through a common adapter layer.
          </p>
        </Reveal>

        <div className="rows mt-12">
          {COMPONENTS.map((c, i) => (
            <Reveal key={c.slug} delay={i * 80}>
              <Link
                to={`/components/${c.slug}`}
                className="group arrow-slide grid items-baseline gap-x-8 gap-y-2 rounded-xl border border-transparent px-4 py-7 -mx-4 transition-[background-color,transform,border-color,box-shadow] duration-300 hover:translate-x-1 hover:border-white/10 hover:bg-white/[0.04] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.09)] md:grid-cols-[3rem_9rem_minmax(0,22rem)_minmax(0,1fr)_5rem]"
                style={{ transitionTimingFunction: 'var(--ease-hover)' }}
              >
                <span className="display text-[2rem] leading-none text-slate-700 transition-colors group-hover:text-slate-500">
                  0{i + 1}
                </span>
                <span className={cx('eyebrow', MODALITY_STYLE_TEXT[c.color])}>
                  {c.modality}
                </span>
                <span className="text-base font-semibold leading-snug text-slate-100">
                  {c.title}
                </span>
                <span className="text-sm leading-relaxed text-slate-400">
                  <span className="display-italic font-serif text-slate-300">
                    {c.tagline}.
                  </span>{' '}
                  {c.question}
                </span>
                <span className="text-xs text-slate-600 transition-colors group-hover:text-accent-400 md:text-right">
                  Explore <span className="arrow inline-block">&rarr;</span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Research contribution ────────────────────────────────────────── */}
      {/* Set as a pull-quote. The previous version was a rounded box with a blue
          radial gradient behind centred text — the single most generic shape on
          the page. */}
      <section className="hair-t mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Reveal>
            <Eyebrow>Research contribution</Eyebrow>
            <blockquote className="display mt-5 text-[2rem] leading-[1.15] text-slate-100 sm:text-[2.75rem]">
              Forensic-ready LLM architectures with traceable outputs were named
              an{' '}
              <span className="display-italic text-accent-400">
                open research gap
              </span>{' '}
              by three independent 2025&ndash;2026 surveys.
            </blockquote>
          </Reveal>

          <Reveal delay={120} className="lg:hair-l lg:pl-16">
            <p className="text-sm leading-relaxed text-slate-400">
              No prior system pairs a multi-modal fraud ensemble with a retrieval
              layer that anchors the generated narrative in a structured typology
              knowledge base. That pairing is what makes the output traceable,
              and it is what this project contributes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <Link
                to={isAuthenticated ? '/' : '/login'}
                className="liquid-solid inline-flex items-center rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                {isAuthenticated ? 'Run the analyzer' : 'Sign in to run it'}
              </Link>
              <Link
                to="/about"
                className="arrow-slide hair border-b pb-1 text-sm text-slate-300 transition-colors hover:text-slate-100"
              >
                Read the architecture <span className="arrow inline-block">&rarr;</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
