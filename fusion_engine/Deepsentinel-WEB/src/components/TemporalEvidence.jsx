import { useState } from 'react'
import { Badge, Card, CardHeader, SectionLabel } from './ui'
import ScoreGauge from './ScoreGauge'

/**
 * Renders the peak-attention evidence the temporal model returns with every
 * flag: which of the 32 preceding transactions it weighted most, how
 * strongly, and why. The fused response carries only that one peak
 * predecessor — not the full 32-position attention vector — so this shows
 * it as a single highlighted weight rather than pretending to a full
 * distribution chart.
 */

// Mirrors TS-TCN/api/constants.py's tuned decision threshold. Not carried
// in the fused response today (the adapter doesn't read risk_level), so
// it's re-derived client-side from temporal_score.
const THRESHOLD_SUSPICIOUS = 0.4431
const THRESHOLD_CRITICAL = 0.9

function riskLevel(score) {
  if (typeof score !== 'number') return null
  if (score >= THRESHOLD_CRITICAL) return 'CRITICAL'
  if (score >= THRESHOLD_SUSPICIOUS) return 'SUSPICIOUS'
  return 'NORMAL'
}

const RISK_TONE = { NORMAL: 'low', SUSPICIOUS: 'medium', CRITICAL: 'critical' }

export default function TemporalEvidence({ evidence, score, signal }) {
  const [showFeatures, setShowFeatures] = useState(false)

  if (!evidence) return null

  const {
    composite_id: peakId,
    attention_weight: attentionWeight,
    predecessor_signal: predecessorSignal,
    offset_from_current: offset,
    peak_features: peakFeatures = {},
    step_burstiness: stepBurstiness,
  } = evidence

  const level = riskLevel(score)
  const features = Object.entries(peakFeatures)

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        title="Temporal evidence"
        description="The predecessor the model weighted most, from the 32-transaction window before this one — not generated text."
        action={level && <Badge tone={RISK_TONE[level]}>{level}</Badge>}
      />

      {(score != null || signal) && (
        <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          {score != null && <ScoreGauge score={score} label="Temporal risk" size={96} />}
          <div className="min-w-0 space-y-2">
            {signal && <p className="text-sm leading-relaxed text-slate-300">{signal}</p>}
            {typeof stepBurstiness === 'number' && (
              <p className="font-mono text-[11px] text-slate-500">
                step burstiness {stepBurstiness.toFixed(4)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── The peak predecessor ── */}
      <div className="mt-5 rounded-xl border border-modality-temporal/25 bg-modality-temporal/[0.06] p-4">
        <SectionLabel>Triggering predecessor</SectionLabel>
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <p className="break-all font-mono text-sm font-semibold text-modality-temporal">
            {peakId ?? '—'}
          </p>
          {offset != null && (
            <p className="shrink-0 text-xs text-slate-500">
              {offset} transaction{offset === 1 ? '' : 's'} earlier
            </p>
          )}
        </div>
        {predecessorSignal && (
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{predecessorSignal}</p>
        )}

        {/* One highlighted bar for the peak weight — the fused response
            doesn't carry the other 31 positions to chart against it. */}
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-sentinel-800">
            <div
              className="h-full rounded-full bg-modality-temporal transition-all duration-700"
              style={{ width: `${Math.max(2, Math.min((attentionWeight ?? 0) * 100, 100))}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] text-slate-500">
            {typeof attentionWeight === 'number' ? attentionWeight.toFixed(3) : '—'} weight
          </span>
        </div>
      </div>

      {/* ── Peak predecessor's own features, on demand ── */}
      {features.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setShowFeatures((v) => !v)}
            className="text-xs font-medium text-accent-400 hover:text-accent-300"
          >
            {showFeatures ? 'Hide predecessor features' : 'Show predecessor features'}
          </button>
          {showFeatures && (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
              {features.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">
                    {k.replace(/_/g, ' ')}
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm text-slate-200">
                    {typeof v === 'number' ? v.toFixed(3) : v}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </Card>
  )
}
