import { Badge, Card, CardHeader, SectionLabel, cx } from './ui'

/**
 * Renders the sequential evidence the TS-TCN returns with every score.
 *
 * The graph model's evidence is a *structure*, the behavioural model's is a
 * *decomposition*. This one is a *predecessor*: fraud_attention scans the
 * 32-transaction window ending at the current transaction and names the one
 * prior transaction it weighted most heavily — with that transaction's own
 * feature values, not just its position. An analyst reads "this transaction,
 * because of that one, three steps earlier."
 */

const FEATURE_LABEL = {
  drain_ratio: 'Drain ratio',
  post_transfer_ratio: 'Post-transfer ratio',
  dest_was_empty: 'Destination was empty',
  dest_enrichment: 'Destination enrichment',
  type_risk: 'Type risk weight',
  hour_of_day: 'Hour of day',
  amount: 'Amount',
  type: 'Type',
}

const fmtAmount = (n) =>
  typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'

const fmtVal = (key, v) => {
  if (v === undefined || v === null) return '—'
  if (key === 'amount') return fmtAmount(v)
  if (key === 'dest_was_empty') return v ? 'yes' : 'no'
  if (typeof v === 'number') return v.toFixed(3)
  return String(v)
}

const RISK_TONE = { CRITICAL: 'critical', SUSPICIOUS: 'medium', NORMAL: 'low' }

export default function TemporalEvidence({ evidence }) {
  if (!evidence) return null

  const {
    risk_level: riskLevel,
    model_version: modelVersion,
    inference_time_ms: inferenceMs,
    current_transaction: current = {},
    triggering_predecessor: predecessor,
  } = evidence

  const currentFacts = [
    'drain_ratio',
    'post_transfer_ratio',
    'dest_was_empty',
    'dest_enrichment',
    'type_risk',
    'hour_of_day',
  ]
    .filter((k) => current[k] !== undefined && current[k] !== null)
    .map((k) => [FEATURE_LABEL[k] ?? k, fmtVal(k, current[k])])

  const predecessorFeatures = predecessor?.features
    ? Object.entries(predecessor.features).filter(([k]) => k !== 'type')
    : []

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        title="Sequential evidence"
        description="The 32-transaction window fraud_attention scored — not generated text."
        action={
          <div className="flex items-center gap-2">
            {modelVersion && <Badge tone="neutral">{modelVersion}</Badge>}
            {riskLevel && <Badge tone={RISK_TONE[riskLevel] ?? 'neutral'}>{riskLevel}</Badge>}
          </div>
        }
      />

      {/* ── Current transaction signal ── */}
      {current.fraud_signal_summary && (
        <div className="mt-5 rounded-xl border border-modality-temporal/25 bg-modality-temporal/[0.06] p-4">
          <SectionLabel>Current transaction</SectionLabel>
          <p className="mt-1.5 text-sm text-slate-200">{current.fraud_signal_summary}</p>
        </div>
      )}

      {currentFacts.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {currentFacts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12px] uppercase tracking-wider text-slate-500">{k}</dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* ── Triggering predecessor ── */}
      {predecessor ? (
        <div className="mt-6">
          <SectionLabel>Triggering predecessor</SectionLabel>
          <p className="mt-1 text-xs text-slate-400">
            The prior transaction fraud_attention weighted most heavily when scoring the
            current one — excluded from being its own predecessor by construction.
          </p>

          <div className="mt-3 rounded-xl border border-subtle bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="break-all font-mono text-sm font-semibold text-modality-temporal">
                {predecessor.composite_id ?? predecessor.nameOrig}
              </p>
              <p className="shrink-0 text-xs text-slate-400">
                {typeof predecessor.offset_from_current === 'number'
                  ? `${Math.abs(predecessor.offset_from_current)} transaction${
                      Math.abs(predecessor.offset_from_current) === 1 ? '' : 's'
                    } earlier`
                  : null}
              </p>
            </div>

            {typeof predecessor.attention_weight === 'number' && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[12px] uppercase tracking-wider text-slate-500">
                  <span>Attention weight</span>
                  <span className="font-mono text-slate-400">
                    {predecessor.attention_weight.toFixed(3)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-overlay">
                  <div
                    className="h-full rounded-full bg-modality-temporal"
                    style={{
                      width: `${Math.max(2, Math.min(predecessor.attention_weight * 100, 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {predecessor.predecessor_signal && (
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                {predecessor.predecessor_signal}
              </p>
            )}

            {predecessorFeatures.length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-subtle pt-3 sm:grid-cols-3">
                {predecessorFeatures.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[12px] uppercase tracking-wider text-slate-500">
                      {FEATURE_LABEL[k] ?? k}
                    </dt>
                    <dd className="mt-0.5 font-mono text-sm text-slate-200">{fmtVal(k, v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-xs text-slate-500">
          No predecessor attribution returned with this score.
        </p>
      )}

      {typeof inferenceMs === 'number' && (
        <p className="mt-4 text-[12px] text-slate-600">
          Served in {inferenceMs.toFixed(1)} ms
        </p>
      )}
    </Card>
  )
}
