import { Link } from 'react-router-dom'

const COMPONENTS = [
  {
    icon: '🕸️',
    component: 'Graph Neural Network',
    model: 'Edge-Enhanced GraphSAGE',
    tagline: 'Detects mule rings and hub-and-spoke laundering networks by mapping transaction topology as a graph.',
    tech: ['PyTorch Geometric', 'NetworkX', 'Python'],
    color: 'purple',
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
    tech: ['scikit-learn', 'ChromaDB', 'Gemini 2.0 Flash', 'FastAPI', 'React'],
    color: 'green',
  },
]

const ACCENT = {
  purple: { border: 'border-purple-500/20', bg: 'bg-purple-500/8', text: 'text-purple-400' },
  orange: { border: 'border-orange-500/20', bg: 'bg-orange-500/8', text: 'text-orange-400' },
  blue:   { border: 'border-blue-500/20',   bg: 'bg-blue-500/8',   text: 'text-blue-400' },
  green:  { border: 'border-green-500/20',  bg: 'bg-green-500/8',  text: 'text-green-400' },
}

const TECH_STACK = [
  { layer: 'API Layer',      items: ['FastAPI', 'uvicorn', 'httpx', 'Pydantic'] },
  { layer: 'ML / Fusion',   items: ['scikit-learn', 'NumPy', 'joblib'] },
  { layer: 'RAG / Vector',  items: ['ChromaDB', 'sentence-transformers', 'all-MiniLM-L6-v2'] },
  { layer: 'LLM',           items: ['Gemini 2.0 Flash', 'Chain-of-Evidence Prompting'] },
  { layer: 'Frontend',      items: ['React 19', 'Vite 5', 'Tailwind CSS 3', 'Axios'] },
  { layer: 'Infrastructure',items: ['Railway (backend)', 'Vercel (frontend)', 'GitHub'] },
]

const PIPELINE = [
  { step: '01', label: 'Transaction Input',   desc: 'Raw transaction data — amount, counterparties, timing — enters the pipeline.' },
  { step: '02', label: 'Three-Model Scoring', desc: 'GNN, VAE, and TCN each produce an independent fraud probability in parallel.' },
  { step: '03', label: 'Ensemble Fusion',     desc: 'Logistic Regression meta-classifier fuses the three scores into a single Fraud Confidence Score (F1 0.988).' },
  { step: '04', label: 'FATF RAG Retrieval',  desc: 'The fused risk profile semantically queries a ChromaDB store of 10 FATF typologies. Best match anchors the LLM.' },
  { step: '05', label: 'Forensic Report',     desc: 'Chain-of-Evidence prompting constrains Gemini to cite only retrieved FATF definitions and actual model scores.' },
]

export default function About() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16 space-y-20">

      {/* ── HERO ── */}
      <section className="space-y-5 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-4 py-1.5 rounded-full font-medium tracking-wide">
          Research Architecture · 2026
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
          How DeepSentinel Works
        </h1>
        <p className="text-slate-400 text-lg leading-relaxed">
          Four specialized components — graph topology, behavioral modeling, temporal analysis,
          and RAG-grounded forensics — operating as a single unified pipeline.
        </p>
      </section>

      {/* ── PIPELINE STEPS ── */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-[0.2em]">Detection Pipeline</p>
          <h2 className="text-2xl font-bold text-white">Five stages from input to report</h2>
        </div>
        <div className="space-y-3">
          {PIPELINE.map((s) => (
            <div
              key={s.step}
              className="flex items-start gap-5 rounded-2xl border border-white/[0.06] p-5 transition-colors hover:bg-white/[0.02]"
              style={{ background: 'rgba(255,255,255,0.015)' }}
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-mono text-xs text-blue-400 font-semibold">
                {s.step}
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-white">{s.label}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4 COMPONENT CARDS ── */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-[0.2em]">System Components</p>
          <h2 className="text-2xl font-bold text-white">Four specialized models</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {COMPONENTS.map((c) => {
            const a = ACCENT[c.color]
            return (
              <div
                key={c.component}
                className={`rounded-2xl border ${a.border} p-6 space-y-4 transition-all duration-300 hover:scale-[1.01]`}
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-xl ${a.bg} border ${a.border} flex items-center justify-center text-xl flex-shrink-0`}>
                    {c.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{c.component}</p>
                    <p className={`text-xs font-mono mt-0.5 ${a.text}`}>{c.model}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{c.tagline}</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.tech.map(t => (
                    <span key={t} className="text-xs bg-white/[0.04] border border-white/[0.08] text-slate-400 px-2 py-0.5 rounded-md">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-[0.2em]">Technology Stack</p>
          <h2 className="text-2xl font-bold text-white">Built on production-grade tooling</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TECH_STACK.map((layer) => (
            <div
              key={layer.layer}
              className="rounded-xl border border-white/[0.06] p-4 space-y-3"
              style={{ background: 'rgba(255,255,255,0.015)' }}
            >
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{layer.layer}</p>
              <div className="flex flex-wrap gap-1.5">
                {layer.items.map(item => (
                  <span key={item} className="text-xs bg-white/[0.04] border border-white/[0.07] text-slate-400 px-2 py-0.5 rounded-md">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── NOVELTY STATEMENT ── */}
      <section
        className="relative rounded-3xl border border-white/[0.07] p-10 overflow-hidden space-y-6"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.07) 0%, transparent 70%)' }} />
        <div className="relative space-y-4 max-w-2xl">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-[0.2em]">Research Contribution</p>
          <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">
            The first system to combine multi-modal deep learning fraud detection with FATF-grounded LLM forensic narratives.
          </h2>
          <div className="grid sm:grid-cols-2 gap-5 text-sm text-slate-400 leading-relaxed">
            <p>
              A <span className="text-slate-200">427-paper ScienceDirect 2025 survey</span> confirmed no existing system pairs a multi-modal fraud ensemble with a RAG layer that grounds LLM outputs in a structured typology knowledge base.
            </p>
            <p>
              This gap has been independently confirmed in three peer-reviewed surveys (ScienceDirect 2025, arXiv April 2025, ScienceDirect January 2026), establishing defensible academic novelty.
            </p>
          </div>
        </div>
        <div className="relative flex flex-wrap gap-3">
          <Link
            to="/analyzer"
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm shadow-lg shadow-blue-600/20"
          >
            Try the Live Demo →
          </Link>
          <a
            href="https://deepsent-api-production.up.railway.app/docs"
            target="_blank"
            rel="noreferrer"
            className="border border-white/10 hover:border-white/20 text-slate-400 hover:text-white px-6 py-2.5 rounded-xl transition-all text-sm"
          >
            API Documentation ↗
          </a>
        </div>
      </section>

    </div>
  )
}
