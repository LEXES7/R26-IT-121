import { Link } from 'react-router-dom'
import { ArrowLink, Display, Eyebrow } from '../components/Editorial'
import Globe from '../components/Globe'
import Reveal from '../components/Reveal'
import TransactionStory from '../components/TransactionStory'
import { IconBlackBox, IconHallucination, IconLink } from '../components/Icons'
import PipelineDiagram from '../components/PipelineDiagram'
import { useAuth } from '../context/AuthContext'
import { Badge, cx } from '../components/ui'

const STATS = [
  { value: '3', label: 'detection models', detail: 'network, behaviour, timing' },
  { value: '10', label: 'FATF typologies', detail: 'vector-indexed knowledge base' },
  { value: '0.988', label: 'fusion F1 score', detail: 'meta-classifier, held-out set' },
  { value: '6.3M', label: 'transactions', detail: 'PaySim training corpus' },
]

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

const COMPONENTS = [
  {
    slug: 'behavioural',
    component: 'Stratified VAE with Dual-Signal Anomaly Attribution',
    modality: 'Behaviour',
    color: 'behavioral',
    summary: 'Learns each account\'s normal spending shape and flags departures from it.',
  },
  {
    slug: 'network',
    component: 'Edge-Enhanced GraphSAGE',
    modality: 'Network',
    color: 'graph',
    summary: 'Reads the transaction graph to expose mule rings that per-transaction models cannot see.',
  },
  {
    slug: 'temporal',
    component: 'System-Context Temporal CNN',
    modality: 'Timing',
    color: 'temporal',
    summary: 'Finds suspicious rhythm — bursts, off-hours activity and sequence patterns.',
  },
  {
    slug: 'fusion',
    component: 'Fusion engine, RAG retrieval and forensic reporting',
    modality: 'Fusion',
    color: 'fusion',
    summary: 'Combines the three verdicts and writes a cited, human-readable case narrative.',
  },
]

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
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg" />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 top-0 h-[32rem] w-[32rem] rounded-full bg-accent-500/10 blur-[120px]"
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_minmax(0,34rem)] lg:gap-6 lg:py-28">
          {/* Left — the argument */}
          <div>
            <Eyebrow>Multi-modal fraud detection</Eyebrow>

            <h1 className="mt-5 text-5xl font-bold leading-[1.02] tracking-tight text-slate-200 sm:text-6xl">
              Detect the fraud.
              <br />
              <span className="text-accent-500">Then prove it.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400">
              Three deep learning models examine a transaction from different
              angles. A retrieval layer grounds the explanation in FATF typology.
              What comes out is not a score — it is a{' '}
              <span className="text-slate-200">forensic report an investigator can act on</span>.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Link
                to={isAuthenticated ? '/analyzer' : '/login'}
                className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-sentinel-950 transition hover:bg-slate-200"
              >
                {isAuthenticated ? 'Open the analyzer' : 'Sign in to run it'}
              </Link>
              <a href="#pipeline">
                <ArrowLink>See how it works</ArrowLink>
              </a>
            </div>

            {/* Stats: white numerals, accent suffix — the template's device. */}
            <dl className="mt-14 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label}>
                  <dd className="text-4xl font-bold tracking-tight text-slate-200 tabular-nums">
                    {s.value}
                  </dd>
                  <dt className="mt-1.5 text-xs font-semibold text-accent-500">{s.label}</dt>
                  <p className="mt-0.5 text-[10px] leading-tight text-slate-600">{s.detail}</p>
                </div>
              ))}
            </dl>
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
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>The problem</Eyebrow>
          <Display
            lead="Fraud detection has"
            accent="an explanation problem"
            className="mt-4"
          />
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {PROBLEM.map((p, i) => (
            <Reveal key={p.title} delay={i * 110}>
              <article className="group h-full rounded-2xl border border-subtle bg-surface p-6 transition-colors duration-300 hover:border-accent-500/40 hover:bg-surface-raised">
                <span className="inline-flex rounded-xl border border-subtle bg-sentinel-950 p-3 text-slate-500 transition-colors duration-300 group-hover:border-accent-500/40 group-hover:text-accent-500">
                  <p.Icon />
                </span>
                <h3 className="mt-5 text-base font-semibold leading-snug text-slate-200">
                  {p.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-500">{p.body}</p>
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

      {/* ── Team ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl space-y-8 px-4 py-16 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>The architecture</Eyebrow>
          <Display lead="Four models," accent="one verdict" className="mt-4" />
          <p className="mt-5 text-sm leading-relaxed text-slate-500">
            Each detector reads a different signal — behaviour, network structure
            and timing — and each ships as its own evaluated, deployable API. The
            fusion engine consumes all three through a common adapter layer.
          </p>
        </Reveal>

        <div className="grid gap-3 sm:grid-cols-2">
          {COMPONENTS.map((c, i) => (
            <Reveal key={c.slug} delay={i * 90}>
            <Link
              to={`/components/${c.slug}`}
              className="group flex h-full items-start gap-4 rounded-2xl border border-subtle bg-surface p-5 transition-colors duration-300 hover:border-accent-500/40 hover:bg-surface-raised"
            >
              <div className="min-w-0 flex-1">
                <span
                  className={cx(
                    'rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    MODALITY_STYLE[c.color],
                  )}
                >
                  {c.modality}
                </span>
                <p className="mt-2 font-semibold text-slate-200">{c.component}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{c.summary}</p>
                <ArrowLink className="mt-4 text-xs">Explore</ArrowLink>
              </div>
            </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Research contribution ────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-subtle bg-surface p-8 text-center sm:p-12">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.08) 0%, transparent 70%)',
            }}
          />
          <div className="relative mx-auto max-w-2xl space-y-4">
            <p className="text-xs font-medium tracking-wide text-accent-500">
              Research contribution
            </p>
            <h2 className="text-xl font-bold leading-snug text-slate-200 sm:text-2xl">
              Forensic-ready LLM architectures with traceable outputs were named
              an open research gap by three independent 2025–2026 surveys.
            </h2>
            <p className="text-sm leading-relaxed text-slate-400">
              No prior system pairs a multi-modal fraud ensemble with a retrieval
              layer that anchors the generated narrative in a structured typology
              knowledge base. That pairing is what makes the output traceable, and
              it is what this project contributes.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link
                to={isAuthenticated ? '/analyzer' : '/login'}
                className="rounded-xl bg-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition-colors hover:bg-accent-400"
              >
                {isAuthenticated ? 'Run the analyzer' : 'Sign in to run it'}
              </Link>
              <Link
                to="/about"
                className="rounded-xl border border-subtle px-6 py-3 text-sm text-slate-400 transition-all hover:border-strong hover:text-slate-200"
              >
                Read the architecture
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
