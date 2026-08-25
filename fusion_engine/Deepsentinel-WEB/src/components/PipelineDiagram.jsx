import { useEffect, useMemo, useState } from 'react'
import { cx } from './ui'

/**
 * The detection pipeline.
 *
 * Driven by live stage events from POST /analyze/stream when `stages` is
 * supplied — durations shown are measured on the server, not simulated. With no
 * stages it falls back to an annotated walkthrough so the page still explains
 * the system to a visitor who has not run anything.
 *
 * Review feedback on the previous version was that the architecture was hard to
 * follow, because it existed only as prose. Showing one transaction move
 * through five stages, with each model attributed to the person who built it,
 * is the fix.
 */

const STAGE_META = {
  input: {
    step: '01',
    title: 'Transaction',
    subtitle: 'record in',
    icon: '📥',
    accent: 'slate',
    explain:
      'A single transfer arrives with its amount, both account identifiers, and the balances before and after.',
  },
  models: {
    step: '02',
    title: 'Three models',
    subtitle: 'in parallel',
    icon: '🧠',
    accent: 'blue',
    explain:
      'Each model examines a different dimension of the same transaction. They run concurrently and none of them sees the others’ output.',
  },
  fusion: {
    step: '03',
    title: 'Fusion',
    subtitle: 'meta-classifier',
    icon: '⚖️',
    accent: 'green',
    explain:
      'A logistic regression trained on the three scores produces one calibrated confidence. The weighting is learned, not hand-tuned.',
  },
  retrieval: {
    step: '04',
    title: 'Typology',
    subtitle: 'FATF retrieval',
    icon: '🔍',
    accent: 'amber',
    explain:
      'The risk profile queries a vector store of FATF typologies. The closest match becomes the factual anchor for the report.',
  },
  report: {
    step: '05',
    title: 'Forensic report',
    subtitle: 'chain of evidence',
    icon: '📋',
    accent: 'red',
    explain:
      'The language model may cite only the retrieved typology and the actual scores. It cannot introduce a fact that did not come from an earlier stage.',
  },
}

const ORDER = ['input', 'models', 'fusion', 'retrieval', 'report']

const ACCENTS = {
  slate: { text: 'text-slate-300', dot: 'bg-slate-500', border: 'border-slate-500/30', ring: 'ring-slate-500/30' },
  blue: { text: 'text-accent-400', dot: 'bg-blue-500', border: 'border-accent-500/30', ring: 'ring-blue-500/30' },
  green: { text: 'text-green-300', dot: 'bg-green-500', border: 'border-green-500/30', ring: 'ring-green-500/30' },
  amber: { text: 'text-amber-300', dot: 'bg-amber-500', border: 'border-amber-500/30', ring: 'ring-amber-500/30' },
  red: { text: 'text-red-300', dot: 'bg-red-500', border: 'border-red-500/30', ring: 'ring-red-500/30' },
}

const MODALITY_STYLE = {
  graph: 'text-modality-graph border-modality-graph/30 bg-modality-graph/10',
  behavioral: 'text-modality-behavioral border-modality-behavioral/30 bg-modality-behavioral/10',
  temporal: 'text-modality-temporal border-modality-temporal/30 bg-modality-temporal/10',
}

// Shown when nothing has been run yet, so the page still teaches.
const WALKTHROUGH = {
  input: {
    rows: [
      ['type', 'TRANSFER'],
      ['amount', '50,000.00'],
      ['nameOrig', 'C1305486145'],
      ['nameDest', 'C553264065'],
      ['oldbalanceOrg', '50,000.00'],
      ['newbalanceOrig', '0.00'],
    ],
    note: 'Balance drained to exactly zero — suggestive on its own, but not proof.',
  },
  models: {
    note: 'If a model is unreachable its score is imputed and the confidence penalised, rather than failing the request.',
  },
  fusion: {
    rows: [
      ['graph', '0.85'],
      ['behavioral', '0.88'],
      ['temporal', '0.92'],
      ['fused', '0.87 → HIGH'],
    ],
    note: 'Agreement across independent modalities is what makes the score trustworthy — any single model is far easier to fool.',
  },
  retrieval: {
    rows: [
      ['typology', 'Mule Network — Hub and Spoke'],
      ['similarity', '0.91'],
      ['stage', 'Placement'],
    ],
    note: 'This step is what separates a grounded report from a plausible-sounding invention.',
  },
  report: {
    note: 'Every claim traces back to a stage above it, which is what makes the output defensible in an investigation.',
  },
}

const DEMO_MODELS = [
  {
    key: 'graph',
    model: 'Edge-Enhanced GraphSAGE',
    modality: 'Network',
    detects: 'Who pays whom. Finds mule rings, hub-and-spoke funnels and layering chains.',
    signal: 'HUB_AND_SPOKE — 3 senders converging on one sink account',
    score: 0.85,
  },
  {
    key: 'behavioral',
    model: 'Stratified VAE + DSAA',
    modality: 'Behaviour',
    detects: 'Whether this account is acting like itself, against a learned per-account baseline.',
    signal: 'Reconstruction error 4.2σ above baseline',
    score: 0.88,
  },
  {
    key: 'temporal',
    model: 'System-Context TCN',
    modality: 'Timing',
    detects: 'Rhythm. Mechanically regular transfers betray a script rather than a person.',
    detectsShort: 'Rhythm',
    signal: 'Burstiness 0.92 — machine-paced, not human',
    score: 0.92,
  },
]

export default function PipelineDiagram({ stages, running, live = false }) {
  const [selected, setSelected] = useState('models')
  const [userPinned, setUserPinned] = useState(false)

  // While a run is in flight, follow it. Once the user clicks a stage they take
  // over, otherwise the panel would yank away as they read it.
  const activeStage = useMemo(() => {
    if (!stages) return null
    const runningStage = ORDER.find((id) => stages[id]?.status === 'running')
    if (runningStage) return runningStage
    const lastDone = [...ORDER].reverse().find((id) =>
      ['done', 'error', 'skipped'].includes(stages[id]?.status),
    )
    return lastDone ?? null
  }, [stages])

  useEffect(() => {
    if (running) setUserPinned(false)
  }, [running])

  useEffect(() => {
    if (!userPinned && activeStage) setSelected(activeStage)
  }, [activeStage, userPinned])

  const current = STAGE_META[selected]
  const accent = ACCENTS[current.accent]
  const state = stages?.[selected]
  const hasLiveData = Boolean(state?.data)

  return (
    <div className="space-y-5">
      {/* The flow */}
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-2 sm:gap-2">
        {ORDER.map((id, i) => {
          const meta = STAGE_META[id]
          const a = ACCENTS[meta.accent]
          const s = stages?.[id]
          const isSelected = id === selected
          const isRunning = s?.status === 'running'
          const isDone = s?.status === 'done'
          const isError = s?.status === 'error'
          const isSkipped = s?.status === 'skipped'

          return (
            <div key={id} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => {
                  setSelected(id)
                  setUserPinned(true)
                }}
                aria-pressed={isSelected}
                className={cx(
                  'group relative min-w-[7.5rem] flex-1 rounded-xl border p-3 text-left transition-all',
                  isSelected
                    ? cx('bg-surface-overlay ring-1', a.border, a.ring)
                    : 'border-subtle bg-surface hover:border-strong',
                  isRunning && 'animate-pulse-ring',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg leading-none">{meta.icon}</span>
                  <StageMark
                    running={isRunning}
                    done={isDone}
                    error={isError}
                    skipped={isSkipped}
                    step={meta.step}
                    accentText={isSelected ? a.text : 'text-slate-600'}
                  />
                </div>

                <p
                  className={cx(
                    'mt-2 text-xs font-semibold leading-tight',
                    isSelected ? 'text-slate-200' : 'text-slate-400',
                  )}
                >
                  {meta.title}
                </p>

                {/* Real measured duration, once the server reports it */}
                <p className="mt-0.5 truncate text-[10px] leading-tight text-slate-600">
                  {s?.durationMs != null ? formatDuration(s.durationMs) : meta.subtitle}
                </p>
              </button>

              {i < ORDER.length - 1 && (
                <span
                  className={cx(
                    'hidden shrink-0 text-sm transition-colors sm:block',
                    isDone ? 'text-slate-500' : 'text-slate-300',
                  )}
                  aria-hidden="true"
                >
                  →
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Detail */}
      <div className="animate-fade-in rounded-2xl border border-subtle bg-surface p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', accent.dot)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-slate-200">{current.title}</h3>
              {state?.durationMs != null && (
                <span className="rounded border border-subtle bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                  {formatDuration(state.durationMs)}
                </span>
              )}
              {!live && !hasLiveData && (
                <span className="rounded border border-subtle bg-surface-raised px-1.5 py-0.5 text-[10px] text-slate-600">
                  illustrative
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{current.explain}</p>
            {state?.message && (
              <p
                className={cx(
                  'mt-2 text-xs',
                  state.status === 'error' ? 'text-red-400' : 'text-slate-500',
                )}
              >
                {state.message}
              </p>
            )}
          </div>
        </div>

        {selected === 'models' ? (
          <ModelsPanel data={state?.data} />
        ) : (
          <StagePanel stageId={selected} data={state?.data} accent={accent} />
        )}

        {!hasLiveData && WALKTHROUGH[selected]?.note && (
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <span className="mt-px shrink-0 text-slate-700">▸</span>
            {WALKTHROUGH[selected].note}
          </p>
        )}
      </div>
    </div>
  )
}

function StageMark({ running, done, error, skipped, step, accentText }) {
  if (running) {
    return (
      <svg className="h-3.5 w-3.5 animate-spin text-accent-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
    )
  }
  if (done) return <span className="text-xs text-green-400">✓</span>
  if (error) return <span className="text-xs text-red-400">✕</span>
  if (skipped) return <span className="text-xs text-slate-600">—</span>
  return <span className={cx('font-mono text-[10px]', accentText)}>{step}</span>
}

function ModelsPanel({ data }) {
  // Live data when a run has happened; the annotated example otherwise.
  const models = data
    ? DEMO_MODELS.map((d) => {
        const live = data[d.key] ?? {}
        return {
          ...d,
          score: live.score,
          available: live.available,
          signal: live.signal ?? null,
          model: live.model ?? d.model,
          modality: live.modality ?? d.modality,
          isLive: true,
        }
      })
    : DEMO_MODELS.map((d) => ({ ...d, available: true, isLive: false }))

  return (
    <div className="mt-5 space-y-3">
      <div className="grid gap-3 lg:grid-cols-3">
        {models.map((m) => (
          <div
            key={m.key}
            className={cx(
              'rounded-xl border bg-surface-raised p-4',
              m.available === false ? 'border-subtle opacity-60' : MODALITY_STYLE[m.key],
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cx(
                  'text-[10px] font-semibold uppercase tracking-wider',
                  m.available === false ? 'text-slate-500' : MODALITY_STYLE[m.key].split(' ')[0],
                )}
              >
                {m.modality}
              </span>
              <span className="text-[10px] text-slate-600"></span>
            </div>

            <p className="mt-2 text-sm font-semibold text-slate-200">{m.model}</p>

            {m.available === false ? (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Not reachable. Its score was imputed and the fused confidence
                penalised.
              </p>
            ) : (
              <>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold text-slate-200">
                    {m.score != null ? m.score.toFixed(3) : '—'}
                  </span>
                  <span className="text-[10px] text-slate-600">risk score</span>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div
                    className={cx(
                      'h-full rounded-full transition-all duration-700',
                      m.key === 'graph' && 'bg-modality-graph',
                      m.key === 'behavioral' && 'bg-modality-behavioral',
                      m.key === 'temporal' && 'bg-modality-temporal',
                    )}
                    style={{ width: `${Math.round((m.score ?? 0) * 100)}%` }}
                  />
                </div>

                {m.signal && (
                  <p className="mt-3 text-xs leading-snug text-slate-400">{m.signal}</p>
                )}
                {!m.signal && !m.isLive && (
                  <p className="mt-3 text-xs leading-snug text-slate-500">{m.detects}</p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {data?.fell_back ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-300">
            These scores did not come from the models
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-400/70">
            None of the three model APIs responded, so the pipeline substituted
            simulated scores to keep the downstream stages demonstrable. Fusion,
            retrieval and the report below are real; the three scores above are
            not.
          </p>
        </div>
      ) : data?.mock_scenario ? (
        <p className="text-xs text-amber-400/80">
          Simulated scenario ({data.mock_scenario}) — the model APIs were not
          called. Fusion, retrieval and reporting are live.
        </p>
      ) : null}
    </div>
  )
}

function StagePanel({ stageId, data, accent }) {
  if (stageId === 'report') {
    const report = data?.forensic_report
    if (!report) {
      return (
        <div className="mt-5 rounded-xl border border-dashed border-subtle p-5 text-center text-xs text-slate-600">
          The generated report appears here once a run completes.
        </div>
      )
    }
    return (
      <blockquote
        className={cx(
          // whitespace-pre-line: the report is plain text whose paragraph and
          // section breaks are newlines. Without this, HTML collapses them all
          // and a structured case file renders as one run-on line.
          'mt-5 max-h-96 overflow-y-auto whitespace-pre-line rounded-xl border-l-2 bg-surface-raised p-4 text-sm leading-relaxed text-slate-300',
          accent.border,
        )}
      >
        {report}
      </blockquote>
    )
  }

  const rows = data ? liveRows(stageId, data) : WALKTHROUGH[stageId]?.rows
  if (!rows?.length) return null

  return (
    <div className="mt-5 rounded-xl border border-subtle bg-surface-raised p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {data ? 'This run' : 'Worked example'}
      </p>
      <dl className="mt-2.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1.5"
          >
            <dt className="font-mono text-[11px] text-slate-600">{k}</dt>
            <dd className="truncate font-mono text-xs text-slate-300" title={String(v)}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function liveRows(stageId, d) {
  if (stageId === 'input') {
    return Object.entries(d)
      .filter(([k]) => k !== 'source')
      .map(([k, v]) => [k, typeof v === 'number' ? v.toLocaleString() : String(v)])
  }
  if (stageId === 'fusion') {
    return [
      ['graph', fmt(d.graph_score)],
      ['behavioral', fmt(d.behavioral_score)],
      ['temporal', fmt(d.temporal_score)],
      ['modalities used', `${d.modalities_used} of 3`],
      ['fused score', fmt(d.fraud_confidence_score)],
      ['classification', d.classification],
    ]
  }
  if (stageId === 'retrieval') {
    return [
      ['typology', d.typology_name],
      ['id', d.typology_id],
      ['similarity', d.similarity_score != null ? `${(d.similarity_score * 100).toFixed(1)}%` : '—'],
      ['stage', d.stage],
      ['risk level', d.risk_level],
    ]
  }
  return null
}

const fmt = (n) => (n == null ? '—' : Number(n).toFixed(4))

function formatDuration(ms) {
  if (ms < 1) return '<1 ms'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}
