import { useState } from 'react'
import { Badge, Card, CardHeader, SectionLabel, cx } from './ui'

/**
 * Renders the forensic subgraph the graph model returns with every flag.
 *
 * This is the part that separates a score from evidence: which accounts are
 * implicated, which transfer triggered the analysis, which account the money
 * converges on, and how strongly each edge weighed in the decision. An analyst
 * cannot act on "0.87" — they can act on "these 12 accounts fund this sink".
 */

const PATTERN_COPY = {
  HUB_AND_SPOKE: {
    label: 'Hub and spoke',
    blurb: 'Many senders converging on a single receiving account.',
  },
  SMURFING: {
    label: 'Smurfing',
    blurb: 'Value split into many below-threshold transfers.',
  },
  LAYERING: {
    label: 'Layering',
    blurb: 'Funds moved through a chain of intermediaries to break the trail.',
  },
  ACCOUNT_TAKEOVER: {
    label: 'Account takeover',
    blurb: 'An established account drained shortly after a behaviour change.',
  },
  UNKNOWN: { label: 'No typology matched', blurb: 'No known structure was identified.' },
}

const ROLE_TONE = {
  SINK: 'text-risk-critical',
  MULE: 'text-risk-high',
  FRESH_SENDER: 'text-risk-medium',
  SENDER: 'text-slate-400',
  INTERMEDIARY: 'text-slate-400',
}

const fmtAmount = (n) =>
  typeof n === 'number'
    ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : '—'

const fmtPct = (n) => (typeof n === 'number' ? `${(n * 100).toFixed(0)}%` : '—')

export default function GraphEvidence({ evidence }) {
  const [showAll, setShowAll] = useState(false)

  if (!evidence) return null

  const {
    pattern = 'UNKNOWN',
    pattern_confidence: patternConfidence,
    sink_account: sink,
    node_count: nodeCount,
    edge_count: edgeCount,
    k_hop: kHop,
    nodes = [],
    edges = [],
    structural_evidence: structural = {},
  } = evidence

  const copy = PATTERN_COPY[pattern] ?? PATTERN_COPY.UNKNOWN

  // Strongest edges first — attention weight is the model's own statement of
  // which transfers drove the score, so it is the right sort order for an
  // investigator skimming the evidence.
  const ranked = [...edges].sort(
    (a, b) => (b.edge_attention_weight ?? 0) - (a.edge_attention_weight ?? 0),
  )
  const shown = showAll ? ranked : ranked.slice(0, 6)

  const facts = [
    ['Converging senders', structural.convergence_count],
    ['Fresh senders', fmtPct(structural.fresh_sender_ratio)],
    ['Mean drain ratio', fmtPct(structural.mean_drain_ratio)],
    ['Known mules', structural.mules_in_subgraph],
  ].filter(([, v]) => v !== undefined && v !== null)

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        title="Structural evidence"
        description="Extracted from the graph around the flagged account — not generated text."
        action={<Badge tone="low">{kHop ? `k=${kHop} hops` : 'subgraph'}</Badge>}
      />

      {/* ── Typology + headline counts ── */}
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-sm font-semibold text-slate-200">{copy.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{copy.blurb}</p>
          {typeof patternConfidence === 'number' && (
            <p className="mt-1.5 font-mono text-[11px] text-slate-500">
              pattern confidence {patternConfidence.toFixed(2)}
            </p>
          )}
        </div>
        <div className="flex gap-5 sm:justify-end">
          <Stat value={nodeCount} label="accounts" />
          <Stat value={edgeCount} label="transfers" />
        </div>
      </div>

      {/* ── The sink ── */}
      {sink && (
        <div className="mt-5 rounded-xl border border-risk-critical/25 bg-risk-critical/[0.06] p-4">
          <SectionLabel>Funds converge on</SectionLabel>
          <p className="mt-1.5 break-all font-mono text-sm font-semibold text-risk-critical">
            {sink}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            The persistent account in this structure. Senders are typically
            single-use; the sink is what an investigation follows.
          </p>
        </div>
      )}

      {/* ── Structural facts ── */}
      {facts.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] uppercase tracking-wider text-slate-500">{k}</dt>
              <dd className="mt-0.5 font-mono text-sm text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* ── Ranked transfers ── */}
      {shown.length > 0 && (
        <div className="mt-6">
          <SectionLabel>
            Transfers by attention weight
          </SectionLabel>
          <p className="mt-1 text-xs text-slate-400">
            How strongly each transfer weighed in the model&rsquo;s decision.
          </p>

          <div className="mt-3 -mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="pb-2 font-medium">From</th>
                  <th className="pb-2 font-medium">To</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 pl-3 font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => {
                  const w = e.edge_attention_weight ?? 0
                  return (
                    <tr
                      key={`${e.src}-${e.dst}-${i}`}
                      className={cx(
                        'border-t border-subtle',
                        e.is_trigger_edge && 'bg-accent-500/[0.07]',
                      )}
                    >
                      <td className="py-2 pr-3 font-mono text-[11px] text-slate-400">
                        {e.src}
                        {e.is_trigger_edge && (
                          <span className="ml-1.5 rounded bg-accent-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent-400">
                            trigger
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-slate-400">
                        {e.dst}
                      </td>
                      <td className="py-2 text-right font-mono text-[11px] text-slate-200">
                        {fmtAmount(e.amount)}
                      </td>
                      <td className="py-2 pl-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-1.5 min-w-[2px] rounded-full bg-accent-500"
                            style={{ width: `${Math.max(2, Math.min(w * 100, 100))}%` }}
                          />
                          <span className="shrink-0 font-mono text-[10px] text-slate-500">
                            {w.toFixed(3)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {ranked.length > 6 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs font-medium text-accent-400 hover:text-accent-300"
            >
              {showAll
                ? 'Show top 6 only'
                : `Show all ${ranked.length} transfers`}
            </button>
          )}
        </div>
      )}

      {/* ── Implicated accounts ── */}
      {nodes.length > 0 && (
        <div className="mt-6">
          <SectionLabel>Implicated accounts</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {nodes.slice(0, showAll ? nodes.length : 14).map((n) => (
              <span
                key={n.account_id}
                title={`${n.role} · risk ${(n.node_risk_score ?? 0).toFixed(4)}`}
                className={cx(
                  'rounded-md border border-subtle bg-surface px-2 py-1 font-mono text-[10px]',
                  ROLE_TONE[n.role] ?? 'text-slate-400',
                  n.account_id === sink && 'border-risk-critical/40 font-semibold',
                )}
              >
                {n.account_id}
              </span>
            ))}
            {!showAll && nodes.length > 14 && (
              <span className="px-2 py-1 text-[10px] text-slate-500">
                +{nodes.length - 14} more
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function Stat({ value, label }) {
  return (
    <div className="text-right">
      <p className="font-mono text-xl font-semibold text-slate-200">{value ?? '—'}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  )
}
