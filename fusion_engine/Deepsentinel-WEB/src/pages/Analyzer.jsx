import { useState } from 'react'
import { analyzeScenario } from '../services/api'
import ScoreGauge from '../components/ScoreGauge'
import ModalityBar from '../components/ModalityBar'
import RiskBadge from '../components/RiskBadge'
import ForensicReport from '../components/ForensicReport'
import AblationComparison from '../components/AblationComparison'

const SCENARIOS = [
  { value: 'mule_network',    label: 'Mule Network',     icon: '🕸️', color: 'purple', short: 'Hub-and-spoke fund routing' },
  { value: 'layering',        label: 'Layering',          icon: '🔀', color: 'blue',   short: 'Multi-hop transfer chain' },
  { value: 'smurfing',        label: 'Smurfing',          icon: '🐡', color: 'cyan',   short: 'Below-threshold structuring' },
  { value: 'account_takeover',label: 'Account Takeover',  icon: '🔓', color: 'orange', short: 'Unauthorized account drain' },
  { value: 'velocity_fraud',  label: 'Velocity Fraud',    icon: '⚡', color: 'yellow', short: 'Automated rapid transfers' },
  { value: 'legitimate',      label: 'Legitimate',        icon: '✅', color: 'green',  short: 'Normal customer transaction' },
]

const S_COLOR = {
  purple: { border: 'border-purple-500/40', bg: 'bg-purple-500/10', text: 'text-purple-300', sel: 'ring-purple-500/30' },
  blue:   { border: 'border-blue-500/40',   bg: 'bg-blue-500/10',   text: 'text-blue-300',   sel: 'ring-blue-500/30' },
  cyan:   { border: 'border-cyan-500/40',   bg: 'bg-cyan-500/10',   text: 'text-cyan-300',   sel: 'ring-cyan-500/30' },
  orange: { border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-300', sel: 'ring-orange-500/30' },
  yellow: { border: 'border-yellow-500/40', bg: 'bg-yellow-500/10', text: 'text-yellow-300', sel: 'ring-yellow-500/30' },
  green:  { border: 'border-green-500/40',  bg: 'bg-green-500/10',  text: 'text-green-300',  sel: 'ring-green-500/30' },
}

const MODALITY_META = {
  graph:      { label: 'Graph Neural Network',  detail: 'Edge-Enhanced GraphSAGE',     icon: '🕸️' },
  behavioral: { label: 'Behavioral VAE',         detail: 'Stratified VAE + DSAA',       icon: '📊' },
  temporal:   { label: 'Temporal CNN',           detail: 'TSCFD System-Context CNN',    icon: '⏱️' },
}

const STEPS = ['Submit', 'Score', 'Fuse', 'Retrieve', 'Report']

export default function Analyzer() {
  const [scenario, setScenario] = useState('mule_network')
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [step, setStep]         = useState(0)
  const [showAblation, setShowAblation] = useState(false)

  const run = async () => {
    setLoading(true); setError(null); setResult(null); setStep(1)
    try {
      await delay(320); setStep(2)
      await delay(420); setStep(3)
      const data = await analyzeScenario(scenario, showAblation)
      setStep(4); await delay(180); setStep(5)
      setResult(data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Could not reach the backend.')
      setStep(0)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Transaction Analyzer</h1>
        <p className="text-slate-500 text-sm">Select a fraud scenario and run it through the full AI pipeline.</p>
      </div>

      {/* Demo notice — compact */}
      <div className="flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
        <span className="text-amber-400 flex-shrink-0">⚡</span>
        <p className="text-xs text-amber-400/80">
          <span className="text-amber-300 font-medium">Simulated upstream scores</span> — Fusion Engine, RAG retrieval, and LLM report are live.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6 items-start">

        {/* ── LEFT: Scenario selector ── */}
        <div className="lg:col-span-2 space-y-5">

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Choose a scenario
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SCENARIOS.map(s => {
                const c = S_COLOR[s.color]
                const active = scenario === s.value
                return (
                  <button
                    key={s.value}
                    onClick={() => setScenario(s.value)}
                    className={`text-left p-3 rounded-xl border transition-all duration-150 ${
                      active
                        ? `${c.border} ${c.bg} ring-1 ${c.sel}`
                        : 'border-white/[0.07] hover:border-white/[0.14]'
                    }`}
                    style={{ background: active ? undefined : 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="text-xl mb-1.5">{s.icon}</div>
                    <p className={`text-xs font-semibold ${active ? c.text : 'text-slate-300'}`}>{s.label}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">{s.short}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Ablation toggle */}
          <button
            onClick={() => setShowAblation(v => !v)}
            className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-medium transition-all ${
              showAblation
                ? 'border-purple-500/40 bg-purple-500/10 text-purple-300'
                : 'border-white/[0.07] text-slate-500 hover:text-slate-300 hover:border-white/[0.14]'
            }`}
            style={{ background: showAblation ? undefined : 'rgba(255,255,255,0.02)' }}
          >
            <span>🔬</span>
            <span>{showAblation ? 'Ablation mode on — RAG vs No-RAG' : 'Enable RAG vs No-RAG comparison'}</span>
          </button>

          {/* Run button */}
          <button
            onClick={run}
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #2563eb, #0891b2)', boxShadow: '0 4px 20px rgba(37,99,235,0.3)' }}
          >
            {loading
              ? <><Spinner /> Analysing…</>
              : '▶  Run Pipeline'
            }
          </button>

          {error && (
            <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4 space-y-1">
              <p className="text-sm font-semibold text-red-400">Pipeline error</p>
              <p className="text-xs text-red-400/70">{error}</p>
            </div>
          )}
        </div>

        {/* ── RIGHT: Results ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Pipeline progress */}
          {(loading || result) && (
            <div className="flex items-center gap-2 px-1">
              {STEPS.map((s, i) => {
                const done = step > i + 1 || (result && step >= i + 1)
                const active = step === i + 1
                return (
                  <div key={s} className="flex items-center gap-2 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all ${
                        done ? 'bg-green-500 text-white' : active ? 'bg-blue-500 text-white ring-2 ring-blue-500/30' : 'bg-white/5 text-slate-600 border border-white/10'
                      }`}>
                        {done ? '✓' : i + 1}
                      </div>
                      <span className={`text-[10px] font-medium truncate hidden sm:block ${done ? 'text-green-400' : active ? 'text-blue-400' : 'text-slate-700'}`}>{s}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`h-px flex-1 ${done ? 'bg-green-600/40' : 'bg-white/5'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-24 rounded-2xl border border-dashed border-white/[0.06]">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center text-3xl">🔍</div>
              <div className="text-center">
                <p className="font-medium text-slate-500">No results yet</p>
                <p className="text-xs text-slate-700 mt-1">Select a scenario and click Run Pipeline</p>
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && !result && (
            <div className="space-y-3">
              {[80, 60, 40].map(w => (
                <div key={w} className="h-12 rounded-xl bg-white/[0.03] animate-pulse border border-white/[0.04]" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {result && (
            <div className="space-y-4">

              {/* ── Classification banner ── */}
              <ClassificationBanner result={result} />

              {/* ── Model scores ── */}
              <div className="rounded-2xl border border-white/[0.07] p-5 space-y-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">AI Detection Scores</p>
                  <span className="text-xs text-slate-600">{result.modalities_used} / 3 models active</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <div className="flex-shrink-0 text-center">
                    <ScoreGauge score={result.fraud_confidence_score} label="Fraud Confidence" size={120} />
                    <p className="text-[10px] text-slate-600 mt-1">Ensemble fusion output</p>
                  </div>
                  <div className="flex-1 space-y-4 w-full">
                    {['graph', 'behavioral', 'temporal'].map(key => {
                      const m = MODALITY_META[key]
                      return (
                        <div key={key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-slate-400">
                              <span>{m.icon}</span>{m.label}
                            </span>
                            <span className="text-slate-500 text-[10px] font-mono">{m.detail}</span>
                          </div>
                          <ModalityBar
                            label=""
                            score={result[`${key}_score`]}
                            available={result[`${key}_available`]}
                            icon=""
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* ── FATF match ── */}
              <div className="rounded-2xl border border-white/[0.07] p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">FATF Typology Match</p>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-2">
                    <p className="font-semibold text-white">{result.retrieval.typology_name}</p>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-mono bg-white/[0.05] border border-white/10 text-slate-400 px-2 py-0.5 rounded">{result.retrieval.typology_id}</span>
                      <span className="text-slate-600">Stage: {result.retrieval.stage}</span>
                      <RiskBadge classification={result.retrieval.risk_level} />
                    </div>
                    <p className="text-xs text-slate-600 max-w-sm">Retrieved via cosine similarity from 10 FATF typologies in ChromaDB.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold font-mono text-blue-400">{(result.retrieval.similarity_score * 100).toFixed(1)}%</p>
                    <p className="text-xs text-slate-600 mt-0.5">match confidence</p>
                  </div>
                </div>
              </div>

              {/* ── Forensic report ── */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">LLM Forensic Report</p>
                <ForensicReport report={result.forensic_report} loading={loading} />
              </div>

              {/* ── Ablation ── */}
              {result.baseline_report && (
                <div className="rounded-2xl border border-purple-500/20 p-5" style={{ background: 'rgba(168,85,247,0.04)' }}>
                  <AblationComparison baselineReport={result.baseline_report} groundedReport={result.forensic_report} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ClassificationBanner({ result }) {
  const map = {
    CRITICAL: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', text: '#ef4444', label: 'CRITICAL RISK' },
    HIGH:     { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)', text: '#f97316', label: 'HIGH RISK' },
    MEDIUM:   { bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.3)',  text: '#eab308', label: 'MEDIUM RISK' },
    LOW:      { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.3)',  text: '#22c55e', label: 'LOW RISK' },
  }
  const c = map[result.classification] || map.LOW
  return (
    <div className="rounded-2xl p-5 flex items-center justify-between flex-wrap gap-3" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div>
        <p className="text-xs text-slate-500 font-mono">{result.transaction_id}</p>
        <p className="text-xl font-bold mt-1" style={{ color: c.text }}>{c.label}</p>
        {result.mock_scenario && (
          <p className="text-xs text-slate-600 mt-0.5">Scenario: <span className="text-slate-500">{result.mock_scenario}</span></p>
        )}
      </div>
      <div className="text-right">
        <p className="text-4xl font-bold font-mono" style={{ color: c.text }}>
          {Math.round(result.fraud_confidence_score * 100)}
          <span className="text-2xl">%</span>
        </p>
        <p className="text-xs text-slate-600 mt-0.5">fraud confidence</p>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
