import { Link } from 'react-router-dom'
import { ArrowLink, Display, Eyebrow } from '../components/Editorial'
import Reveal from '../components/Reveal'

const COMPONENTS = [
  {
    icon: '🕸️',
    component: 'Graph Neural Network',
    model: 'Edge-Enhanced GraphSAGE',
    tagline: 'Detects mule rings and hub-and-spoke laundering networks by mapping transaction topology as a graph.',
    tech: ['PyTorch Geometric', 'NetworkX', 'Python'],
    color: 'graphTint',
  },
  {
    icon: '📊',
    component: 'Behavioral Anomaly Engine',
    model: 'Stratified VAE + DSAA',
    tagline: 'Flags per-account behavioral deviations using variational autoencoders trained per transaction stratum.',
    tech: ['TensorFlow', 'Keras', 'Python'],
    color: 'orange',
  },
  {
    icon: '⏱️',
    component: 'Temporal Pattern Detector',
    model: 'TSCFD Temporal CNN',
    tagline: 'Identifies mechanically regular, high-frequency transfer bursts that reveal automated fraud scripts.',
    tech: ['TensorFlow', 'Keras', 'Python'],
    color: 'blue',
  },
  {
    icon: '⚖️',
    component: 'Ensemble Fusion + RAG Forensics',
    model: 'LR Meta-Classifier · ChromaDB · Gemini',
    tagline: 'Fuses all signals into a unified Fraud Confidence Score, then retrieves FATF typologies to anchor a Chain-of-Evidence LLM report.',
    tech: ['scikit-learn', 'ChromaDB', 'Gemini (flash-latest)', 'FastAPI', 'React'],
    color: 'green',
  },
]

const ACCENT = {
  graphTint: { border: 'border-modality-graph/25', bg: 'bg-modality-graph/10', text: 'text-modality-graph' },
  orange: { border: 'border-orange-500/20', bg: 'bg-orange-500/8', text: 'text-orange-400' },
  blue:   { border: 'border-accent-500/25',   bg: 'bg-blue-500/8',   text: 'text-accent-500' },
  green:  { border: 'border-green-500/20',  bg: 'bg-green-500/8',  text: 'text-green-400' },
}

const TECH_STACK = [
  { layer: 'API Layer',      items: ['FastAPI', 'uvicorn', 'httpx', 'Pydantic'] },
  { layer: 'ML / Fusion',   items: ['scikit-learn', 'NumPy', 'joblib'] },
  { layer: 'RAG / Vector',  items: ['ChromaDB', 'sentence-transformers', 'all-MiniLM-L6-v2'] },
  { layer: 'LLM',           items: ['Gemini (flash-latest)', 'Chain-of-Evidence Prompting'] },
  { layer: 'Frontend',      items: ['React 19', 'Vite 5', 'Tailwind CSS 3', 'Axios'] },
  { layer: 'Infrastructure',items: ['Railway (backend)', 'Vercel (frontend)', 'GitHub'] },
]

/* What each detector can and cannot see. A comparison grid makes the case for
   fusion far faster than three paragraphs: no single row has every tick. */
const CAPABILITY = {
  columns: ['Network', 'Behaviour', 'Timing'],
  rows: [
    ['Mule rings and collection funnels', true, false, false],
    ['Money split across many accounts', true, false, true],
    ['Account acting unlike itself', false, true, false],
    ['Sudden escalation in value', false, true, false],
    ['Machine-paced transfer rhythm', false, false, true],
    ['Off-hours or burst activity', false, false, true],
    ['Works on a first-seen account', false, true, true],
    ['Explains itself with evidence', true, true, true],
  ],
}

const PIPELINE = [
  { step: '01', label: 'Transaction Input',   desc: 'Raw transaction data — amount, counterparties, timing — enters the pipeline.' },
  { step: '02', label: 'Three-Model Scoring', desc: 'GNN, VAE, and TCN each produce an independent fraud probability in parallel.' },
  { step: '03', label: 'Ensemble Fusion',     desc: 'Logistic Regression meta-classifier fuses the three scores into a single Fraud Confidence Score (F1 0.988).' },
  { step: '04', label: 'FATF RAG Retrieval',  desc: 'The fused risk profile semantically queries a ChromaDB store of 10 FATF typologies. Best match anchors the LLM.' },
  { step: '05', label: 'Forensic Report',     desc: 'Chain-of-Evidence prompting constrains Gemini to cite only retrieved FATF definitions and actual model scores.' },
]

export default function About() {
  return (
    <div className="pb-24">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-subtle">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg" />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-accent-500/10 blur-[130px]"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Reveal className="max-w-2xl">
            <Eyebrow>Architecture</Eyebrow>
            <Display lead="Three detectors," accent="one defensible verdict" className="mt-4" />
            <p className="mt-6 text-base leading-relaxed text-slate-400">
              No single model sees fraud whole. The network layer reads structure,
              the behavioural layer reads deviation, the temporal layer reads
              rhythm — and a meta-classifier decides what to believe when they
              disagree.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Pipeline ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>The pipeline</Eyebrow>
          <Display lead="Five stages," accent="input to report" className="mt-4" />
        </Reveal>

        <div className="mt-12 space-y-px overflow-hidden rounded-2xl border border-subtle bg-white/[0.06]">
          {PIPELINE.map((p, i) => (
            <Reveal key={p.step} delay={i * 80}>
              <div className="group flex gap-5 bg-sentinel-950 p-6 transition-colors hover:bg-surface">
                <span className="shrink-0 font-mono text-sm font-bold text-accent-500">
                  {p.step}
                </span>
                <div>
                  <p className="font-semibold text-slate-200">{p.label}</p>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
                    {p.desc}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Capability matrix ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>Why three</Eyebrow>
          <Display lead="No single model" accent="sees all of it" className="mt-4" />
          <p className="mt-5 text-sm leading-relaxed text-slate-500">
            Each column has blind spots the others cover. That is the entire
            argument for fusion, and it is why a missing detector abstains
            rather than voting zero.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-subtle">
                <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Signal
                </th>
                {CAPABILITY.columns.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-400"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITY.rows.map(([label, ...cells]) => (
                <tr key={label} className="border-b border-subtle/60 last:border-0">
                  <td className="py-3 pr-4 text-slate-300">{label}</td>
                  {cells.map((on, i) => (
                    <td key={i} className="px-3 py-3 text-center">
                      {on ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-500/15 text-accent-500">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="m5 13 4 4L19 7" />
                          </svg>
                        </span>
                      ) : (
                        <span className="text-slate-700" aria-label="no">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </section>

      {/* ── Stack ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>Built with</Eyebrow>
          <Display lead="The stack" accent="end to end" className="mt-4" />
        </Reveal>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TECH_STACK.map((t, i) => (
            <Reveal key={t.layer} delay={i * 70}>
              <div className="h-full rounded-2xl border border-subtle bg-surface p-5 transition-colors hover:border-accent-500/40">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent-500">
                  {t.layer}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {t.items.map((item) => (
                    <li key={item} className="font-mono text-xs text-slate-400">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Components CTA ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-subtle bg-surface p-8 sm:p-10">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-accent-500/10 blur-3xl" />
            <div className="relative sm:flex sm:items-center sm:justify-between sm:gap-8">
              <div className="max-w-lg">
                <p className="text-xl font-semibold text-slate-200">
                  Each component, in depth
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  What it detects, how it was evaluated, and what it hands to the
                  fusion engine.
                </p>
              </div>
              <Link to="/components/network" className="mt-5 inline-block sm:mt-0">
                <ArrowLink>Explore components</ArrowLink>
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
