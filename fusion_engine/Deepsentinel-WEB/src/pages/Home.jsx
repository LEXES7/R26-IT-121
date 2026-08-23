import { Link } from 'react-router-dom'
import NetworkBackground from '../components/NetworkBackground'
import PipelineDiagram from '../components/PipelineDiagram'
import { useAuth } from '../context/AuthContext'
import { Badge, cx } from '../components/ui'

// Only figures that can be substantiated. An earlier version showed a 0.988
// fusion F1, which came from the meta-classifier cross-validating on
// calibration data it generated itself — it measures curve fitting, not fraud
// detection, and would not survive the first question about it.
const STATS = [
  { value: '3', label: 'detection models', detail: 'network, behaviour, timing' },
  { value: '10', label: 'FATF typologies', detail: 'vector-indexed knowledge base' },
  { value: '5', label: 'pipeline stages', detail: 'input to forensic report' },
  { value: '6.3M', label: 'transactions', detail: 'PaySim corpus the models train on' },
]

const PROBLEM = [
  {
    icon: '⚫',
    title: 'The model says fraud. It cannot say why.',
    body: 'A neural network returns a probability. An investigator building a case needs reasoning, and a regulator needs an audit trail. A score alone satisfies neither.',
  },
  {
    icon: '✍️',
    title: 'A language model will happily invent the why.',
    body: 'Ask an unconstrained LLM to explain a fraud score and it produces fluent, confident narrative — including details that were never in the data. In a compliance filing that is worse than no explanation.',
  },
  {
    icon: '🔗',
    title: 'Neither problem is solved by the other alone.',
    body: 'DeepSentinel grounds every sentence of the narrative in a retrieved FATF typology and the actual model outputs, so each claim traces back to evidence.',
  },
]

const TEAM = [
  {
    member: 'Member 1',
    name: 'Wijesinghe',
    component: 'Stratified VAE with Dual-Signal Anomaly Attribution',
    modality: 'Behaviour',
    color: 'behavioral',
    status: 'Delivered',
  },
  {
    member: 'Member 2',
    name: 'Ewaduge',
    component: 'Edge-Enhanced GraphSAGE',
    modality: 'Network',
    color: 'graph',
    status: 'Delivered',
  },
  {
    member: 'Member 3',
    name: 'Pathirana',
    component: 'System-Context Temporal CNN',
    modality: 'Timing',
    color: 'temporal',
    status: 'Delivered',
  },
  {
    member: 'Member 4',
    name: 'Vidanaarachchi',
    component: 'Fusion engine, RAG retrieval and forensic reporting',
    modality: 'Fusion',
    color: 'fusion',
    status: 'Delivered',
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
      <section className="relative flex min-h-[80vh] items-center justify-center px-4 py-24 sm:px-6">
        <NetworkBackground opacity={0.32} />

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-sentinel-950 via-transparent to-sentinel-950" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl space-y-7 text-center">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-subtle bg-surface-raised px-4 py-1.5 text-xs font-medium tracking-wide text-slate-300 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400 shadow-sm shadow-green-400/50" />
            SLIIT Research Project · R26-IT-121
          </div>

          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            <span className="text-white">Detect the fraud.</span>
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Then prove it.
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-base font-light leading-relaxed text-slate-400 sm:text-lg">
            Three deep learning models examine a transaction from different angles.
            A retrieval layer grounds the explanation in FATF typology. What comes
            out is not a score — it is a{' '}
            <span className="font-normal text-white">forensic report an investigator can act on</span>.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to={isAuthenticated ? '/analyzer' : '/login'}
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-500 hover:to-cyan-500"
            >
              {isAuthenticated ? 'Open the analyzer' : 'Sign in to run it'}
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
            <a
              href="#pipeline"
              className="rounded-xl border border-subtle px-6 py-3.5 text-sm font-medium text-slate-400 backdrop-blur-sm transition-all hover:border-strong hover:text-white"
            >
              See how it works
            </a>
          </div>

          <dl className="flex flex-wrap justify-center gap-x-10 gap-y-6 pt-6">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <dd className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text font-mono text-3xl font-bold text-transparent sm:text-4xl">
                  {s.value}
                </dd>
                <dt className="mt-1 text-xs font-medium text-slate-400">{s.label}</dt>
                <p className="mx-auto mt-0.5 max-w-[9rem] text-[10px] leading-tight text-slate-600">
                  {s.detail}
                </p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── The problem ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl space-y-8 px-4 py-20 sm:px-6">
        <div className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
            The problem
          </p>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Fraud detection has an explanation problem
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PROBLEM.map((p) => (
            <div key={p.title} className="rounded-2xl border border-subtle bg-surface p-5">
              <div className="text-xl">{p.icon}</div>
              <h3 className="mt-3 text-sm font-semibold leading-snug text-white">{p.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pipeline ─────────────────────────────────────────────────────── */}
      <section id="pipeline" className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6">
        <div className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
            How it works
          </p>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Follow one transaction through the system
          </h2>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-500">
            Select any stage to see what happens there. The same worked example
            carries through all five, so you can watch a raw record become
            evidence.
          </p>
        </div>

        <PipelineDiagram />
      </section>

      {/* ── Team ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl space-y-8 px-4 py-16 sm:px-6">
        <div className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
            The team
          </p>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Four components, four researchers
          </h2>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-500">
            Each member owns one component end to end — model, evaluation and a
            deployable API. The fusion engine consumes all three through a common
            adapter layer.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {TEAM.map((t) => (
            <div
              key={t.member}
              className="flex items-start gap-4 rounded-2xl border border-subtle bg-surface p-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cx(
                      'rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                      MODALITY_STYLE[t.color],
                    )}
                  >
                    {t.modality}
                  </span>
                  <span className="text-[10px] text-slate-600">{t.member}</span>
                </div>
                <p className="mt-2 font-semibold text-white">{t.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.component}</p>
              </div>
              <Badge tone="low" className="shrink-0">
                {t.status}
              </Badge>
            </div>
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
              Research contribution
            </p>
            <h2 className="text-xl font-bold leading-snug text-white sm:text-2xl">
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
                className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500"
              >
                {isAuthenticated ? 'Run the analyzer' : 'Sign in to run it'}
              </Link>
              <Link
                to="/about"
                className="rounded-xl border border-subtle px-6 py-3 text-sm text-slate-400 transition-all hover:border-strong hover:text-white"
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
