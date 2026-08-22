import { Link } from 'react-router-dom'
import NetworkBackground from '../components/NetworkBackground'

const FEATURES = [
  {
    icon: '🕸️',
    title: 'Graph Neural Network',
    desc: 'Edge-Enhanced GraphSAGE maps transaction topology to detect mule rings, hub-and-spoke networks, and coordinated laundering chains.',
    tag: 'Network Topology',
    color: 'blue',
  },
  {
    icon: '📊',
    title: 'Behavioral VAE',
    desc: 'Stratified Variational Autoencoder flags transactions that deviate from an account\'s established behavioral baseline in real time.',
    tag: 'Anomaly Detection',
    color: 'purple',
  },
  {
    icon: '⏱️',
    title: 'Temporal CNN',
    desc: 'System-Context Temporal CNN detects mechanically regular, high-frequency transfer patterns that reveal automated fraud scripts.',
    tag: 'Timing Analysis',
    color: 'cyan',
  },
  {
    icon: '⚖️',
    title: 'Ensemble Fusion',
    desc: 'Logistic Regression meta-classifier fuses the three scores into a unified Fraud Confidence Score with graceful degradation for missing models.',
    tag: 'Meta-Classifier · F1 0.988',
    color: 'green',
  },
  {
    icon: '🔍',
    title: 'FATF RAG Retrieval',
    desc: 'The fused risk profile semantically queries a ChromaDB vector store of 10 FATF typologies. The best match becomes the LLM\'s factual anchor.',
    tag: 'ChromaDB · Cosine Similarity',
    color: 'amber',
  },
  {
    icon: '📋',
    title: 'Forensic Report',
    desc: 'Chain-of-Evidence prompting constrains Gemini to cite only retrieved FATF definitions and actual model scores — zero hallucination.',
    tag: 'Gemini 2.0 Flash',
    color: 'red',
  },
]

const COLOR = {
  blue:   { border: 'border-blue-500/20',   bg: 'bg-blue-500/8',   text: 'text-blue-400' },
  purple: { border: 'border-purple-500/20', bg: 'bg-purple-500/8', text: 'text-purple-400' },
  cyan:   { border: 'border-cyan-500/20',   bg: 'bg-cyan-500/8',   text: 'text-cyan-400' },
  green:  { border: 'border-green-500/20',  bg: 'bg-green-500/8',  text: 'text-green-400' },
  amber:  { border: 'border-amber-500/20',  bg: 'bg-amber-500/8',  text: 'text-amber-400' },
  red:    { border: 'border-red-500/20',    bg: 'bg-red-500/8',    text: 'text-red-400' },
}

const STATS = [
  { n: '3',    label: 'AI Detection Models' },
  { n: '10',   label: 'FATF Typologies' },
  { n: '0.988',label: 'Classifier F1 Score' },
  { n: '427',  label: 'Papers — Gap Confirmed' },
]

export default function Home() {
  return (
    <div className="overflow-x-hidden">

      {/* ── HERO ── */}
      <section className="relative min-h-[92vh] flex items-center justify-center px-6 py-28">
        <NetworkBackground opacity={0.38} />

        {/* Gradient overlays for depth */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-[#06091a] via-transparent to-[#06091a]" />
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#06091a] to-transparent" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">

          <div className="inline-flex items-center gap-2.5 bg-white/[0.05] border border-white/10 text-slate-300 text-xs px-5 py-2 rounded-full font-medium tracking-wide backdrop-blur-sm">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-sm shadow-green-400/50" />
            Live · AI-Powered Financial Crime Detection
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.1]">
            <span className="text-white">Detect Fraud.</span>
            <br />
            <span style={{ background: 'linear-gradient(135deg, #60a5fa, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Prove It in Court.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-light">
            DeepSentinel combines three deep learning models with a RAG-grounded LLM to generate{' '}
            <span className="text-white font-normal">legally admissible forensic reports</span>{' '}
            — solving the AI black-box problem in AML compliance.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/analyzer"
              className="group flex items-center gap-2 text-white font-semibold px-8 py-3.5 rounded-xl text-sm transition-all"
              style={{ background: 'linear-gradient(135deg, #2563eb, #0891b2)', boxShadow: '0 4px 24px rgba(37,99,235,0.35)' }}
            >
              Open Analyzer
              <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
            </Link>
            <Link
              to="/faq"
              className="border border-white/10 hover:border-white/20 text-slate-400 hover:text-white font-medium px-7 py-3.5 rounded-xl transition-all text-sm backdrop-blur-sm"
            >
              How it works
            </Link>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-10 pt-6">
            {STATS.map(s => (
              <div key={s.label} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold font-mono" style={{ background: 'linear-gradient(135deg, #60a5fa, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {s.n}
                </p>
                <p className="text-xs text-slate-500 mt-1.5 max-w-[110px] leading-tight mx-auto">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#06091a] to-transparent pointer-events-none" />
      </section>

      {/* ── PIPELINE BADGE ── */}
      <section className="max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center justify-center gap-3 text-xs text-slate-600 flex-wrap">
          {['Transaction Input', '→', 'GNN · VAE · TCN', '→', 'Ensemble Fusion', '→', 'FATF RAG', '→', 'LLM Report', '→', 'Investigator Dashboard'].map((s, i) => (
            <span key={i} className={s === '→' ? 'text-slate-800' : 'font-mono text-slate-500'}>{s}</span>
          ))}
        </div>
      </section>

      {/* ── 6 CAPABILITIES ── */}
      <section className="max-w-5xl mx-auto px-6 py-20 space-y-10">
        <div className="text-center space-y-3">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-[0.2em]">Platform Capabilities</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Six layers. One report.</h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm leading-relaxed">
            Each component solves a distinct problem. Together they bridge the gap between
            black-box AI detection and legally traceable forensic evidence.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => {
            const c = COLOR[f.color]
            return (
              <div
                key={f.title}
                className={`group relative rounded-2xl border ${c.border} p-5 space-y-3 transition-all duration-300 hover:scale-[1.02]`}
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <div className={`inline-flex items-center gap-1.5 text-[10px] font-mono border ${c.border} ${c.bg} ${c.text} px-2.5 py-1 rounded-lg`}>
                  {f.tag}
                </div>
                <div className="text-2xl">{f.icon}</div>
                <h3 className="font-semibold text-white text-sm">{f.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── NOVELTY STATEMENT ── */}
      <section className="max-w-5xl mx-auto px-6 py-8">
        <div
          className="relative rounded-3xl border border-white/[0.07] p-10 overflow-hidden text-center space-y-6"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.08) 0%, transparent 70%)' }} />
          <div className="relative space-y-3 max-w-2xl mx-auto">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-[0.2em]">Research Contribution</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white leading-snug">
              "Forensic-ready LLM architectures with traceable outputs" — identified as a critical open research gap by three independent 2025–2026 surveys.
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              No existing system combines a multi-modal deep learning fraud ensemble with a RAG layer that grounds LLM forensic narratives in a structured typology knowledge base. DeepSentinel is the first.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/analyzer"
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-7 py-3 rounded-xl text-sm transition-all shadow-lg shadow-blue-600/20"
            >
              Try the Live Demo →
            </Link>
            <Link to="/faq" className="border border-white/10 hover:border-white/20 text-slate-400 hover:text-white px-6 py-3 rounded-xl text-sm transition-all">
              Read the FAQ
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
