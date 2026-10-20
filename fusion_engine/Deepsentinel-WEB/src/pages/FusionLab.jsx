import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getThresholds, downloadAnalysisReport,
} from '../services/api'
import ConsoleShell from '../components/ConsoleShell'
import FusionModelPanel from '../components/FusionModelPanel'
import FusionStages from '../components/FusionStages'
import FusionLive from '../components/FusionLive'
import FusionBatch from '../components/FusionBatch'
import TypologyGrid from '../components/TypologyGrid'
import { Alert } from '../components/ui'

/**
 * All three detectors at once, and the arithmetic that turns them into one
 * number.
 *
 * The contributions are exact rather than estimated. The meta-classifier is a
 * StandardScaler followed by a logistic regression, so the decision function
 * decomposes term by term: z = intercept + Σ coef · (x − mean) / scale. Each
 * bar in the waterfall is one of those products. No SHAP, no sampling: for a
 * linear model the attribution is the model, read out.
 *
 * The waterfall's first bar is what the three terms start from. It is not
 * returned on its own, so it is recovered as the final log-odds minus the
 * three terms. With all three detectors answering that is exactly the
 * intercept; with one missing it also carries the shrink toward uncertain,
 * and the label says so.
 */

const BAND_COLOURS = {
  CRITICAL: 'rgb(var(--ds-sev-critical))',
  HIGH: 'rgb(var(--ds-sev-high))',
  MEDIUM: 'rgb(var(--ds-sev-medium))',
  LOW: 'rgb(var(--ds-sev-low))',
}

const DETECTORS = [
  ['Network', 'graph', 'graph', 'rgb(var(--modality-graph))', 'Edge-Enhanced GraphSAGE'],
  ['Behaviour', 'behavioural', 'behavioral', 'rgb(var(--modality-behavioral))', 'Stratified VAE'],
  ['Timing', 'temporal', 'temporal', 'rgb(var(--modality-temporal))', 'Sequence TCN'],
]

const TABS = [
  ['pipeline', 'Pipeline'],
  ['live', 'Live'],
  ['file', 'Score a file'],
  ['model', 'Model'],
]

const logit = (p) => {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p))
  return Math.log(q / (1 - q))
}

/**
 * A live monitor event, in the shape the panels below already read. The event
 * carries the fused score, each detector's score and its signed push, which is
 * everything the dial, the waterfall and the detector cards need. It does not
 * carry the detectors' written reasons or a report: the monitor keeps those for
 * the case it opens, so they are left empty here rather than borrowed from
 * whatever sample ran last.
 */
function fromLive(e) {
  const s = e?.scores ?? {}
  return {
    live: true,
    transaction_id: e?.transaction_id,
    fraud_confidence_score: e?.fused_score,
    classification: e?.severity,
    modalities_used: e?.modalities_used,
    contributions: e?.contributions ?? {},
    graph_score: s.graph, graph_available: s.graph != null,
    behavioral_score: s.behavioural, behavioral_available: s.behavioural != null,
    temporal_score: s.temporal, temporal_available: s.temporal != null,
  }
}

/** The fused score on a half dial, with the alert bands as coloured zones. */
export function Gauge({ value, bands }) {
  const cx = 200, cy = 190, r = 150
  const pt = (v, rr = r) => {
    const a = Math.PI * (1 - v)
    return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]
  }
  const b = bands ?? {}
  const med = Number(b.medium ?? 0.5), high = Number(b.high ?? 0.65), crit = Number(b.critical ?? 0.8)
  const zones = [[0, med, 'rgb(var(--ds-sev-low))'], [med, high, 'rgb(var(--ds-sev-medium))'],
                 [high, crit, 'rgb(var(--ds-sev-high))'], [crit, 1, 'rgb(var(--ds-sev-critical))']]
  const [nx, ny] = pt(Math.min(1, Math.max(0, value)), r - 34)
  return (
    <svg viewBox="0 0 400 210" width="100%" role="img"
         aria-label={`Fused score ${value.toFixed(2)} on a dial from 0 to 1`}>
      {zones.map(([a, z, c]) => {
        const [x1, y1] = pt(a)
        const [x2, y2] = pt(z)
        return <path key={a} d={`M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`}
                     stroke={c} strokeWidth="22" fill="none" strokeOpacity=".9" />
      })}
      {bands && [med, high, crit].map((v) => {
        const [x, y] = pt(v, r + 30)
        return <text key={v} x={x} y={y} textAnchor="middle" fontSize="11"
                     fontFamily="JetBrains Mono, monospace" fill="rgb(var(--ds-faint))">{v.toFixed(2)}</text>
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="rgb(var(--ds-ink))" strokeWidth="4" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="9" fill="rgb(var(--ds-ink))" />
    </svg>
  )
}

/** Start, each detector's push, and where the log-odds ended up. */
function Waterfall({ steps, fused, critical }) {
  const W = 720, H = 300, top = 34, bot = 250
  const ends = steps.flatMap((s) => [s.from, s.to])
  const lo = Math.min(-1, ...ends) - 0.4
  const hi = Math.max(1, ...ends, critical ?? -Infinity) + 0.4
  const Y = (v) => top + ((hi - v) / (hi - lo)) * (bot - top)
  const bw = 86
  const gap = (W - 80 - steps.length * bw) / Math.max(1, steps.length - 1)
  const ticks = []
  for (let v = Math.ceil(lo); v <= Math.floor(hi); v += 1) ticks.push(v)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
         aria-label={steps.map((s) => `${s.label} ${s.text}`).join(', ')}>
      <line x1="60" y1={Y(0)} x2={W - 10} y2={Y(0)} stroke="rgb(var(--ds-line))" />
      {ticks.map((v) => (
        <text key={v} x="44" y={Y(v) + 4} textAnchor="end" fontSize="11"
              fontFamily="JetBrains Mono, monospace" fill="rgb(var(--ds-faint))">{v > 0 ? `+${v}` : v}</text>
      ))}
      {critical != null && (
        <>
          <line x1="60" y1={Y(critical)} x2={W - 10} y2={Y(critical)}
                stroke="rgb(var(--ds-sev-critical))" strokeDasharray="5 5" strokeOpacity=".7" />
          <text x="66" y={Y(critical) - 7} fontSize="11" fill="rgb(var(--ds-sev-critical))">critical line</text>
        </>
      )}
      {steps.map((s, i) => {
        const x = 72 + i * (bw + gap)
        const y1 = Math.min(Y(s.from), Y(s.to))
        const y2 = Math.max(Y(s.from), Y(s.to))
        const next = steps[i + 1]
        return (
          <g key={s.label}>
            <rect x={x} y={y1} width={bw} height={Math.max(4, y2 - y1)} rx="12"
                  fill={s.colour} fillOpacity={s.final ? 1 : 0.85} />
            <text x={x + bw / 2} y={y1 - 8} textAnchor="middle" fontSize="13" fontWeight="700"
                  fill="rgb(var(--ds-ink))">{s.text}</text>
            <text x={x + bw / 2} y={bot + 30} textAnchor="middle" fontSize="13"
                  fill="rgb(var(--ds-muted))">{s.label}</text>
            {next && !next.final && (
              <line x1={x + bw} y1={Y(s.to)} x2={x + bw + gap} y2={Y(s.to)}
                    stroke="rgb(var(--ds-line))" strokeDasharray="3 4" />
            )}
          </g>
        )
      })}
      <title>Fused {fused.toFixed(2)}</title>
    </svg>
  )
}

export default function FusionLab() {
  const [error, setError] = useState(null)
  const [bands, setBands] = useState(null)
  const [saving, setSaving] = useState(false)
  // Opens on Live: the panels above show real verdicts from the monitor, not a
  // built-in example.
  const [tab, setTab] = useState('live')
  const [showReport, setShowReport] = useState(false)
  const tabsRef = useRef(null)
  // The panels above show a live verdict: the newest, or the one picked from
  // the Live list until "Follow latest" is pressed. On another tab they keep
  // the last one shown.
  const [liveRow, setLiveRow] = useState(null)
  const [pinned, setPinned] = useState(false)
  const pinnedRef = useRef(false)
  const onLiveRow = useCallback((row, how) => {
    if (how === 'pin') {
      pinnedRef.current = true
      setPinned(true)
      setLiveRow(row)
    } else if (!pinnedRef.current) {
      setLiveRow(row)
    }
  }, [])
  const followLatest = () => { pinnedRef.current = false; setPinned(false) }
  const inLive = tab === 'live'
  const r = liveRow ? fromLive(liveRow) : null

  useEffect(() => {
    getThresholds().then((t) => setBands(t?.bands ?? null)).catch(() => setBands(null))
  }, [])

  const download = async () => {
    if (r?.analysis_id == null) return
    setSaving(true)
    setError(null)
    try {
      await downloadAnalysisReport(r.analysis_id)
    } catch (err) {
      setError(err?.userMessage ?? 'That report could not be rendered as a PDF.')
    } finally {
      setSaving(false)
    }
  }

  const openTab = (t) => {
    setTab(t)
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const contrib = r?.contributions ?? {}
  const hasContrib = DETECTORS.some(([, k]) => typeof contrib[k] === 'number')
  const rows = DETECTORS.map(([label, key, field, colour, model]) => ({
    label, key, colour, model,
    score: r?.[`${field}_score`],
    available: r?.[`${field}_available`],
    signal: r?.[`${field}_signal`],
    push: contrib[key],
  }))
  const driver = rows
    .filter((x) => (x.push ?? 0) > 0)
    .sort((a, b) => (b.push ?? 0) - (a.push ?? 0))[0]

  const fused = Number(r?.fraud_confidence_score ?? 0)
  const zFinal = logit(fused)
  const sumPush = rows.reduce((s, x) => s + (x.push ?? 0), 0)
  const start = zFinal - sumPush
  const steps = []
  if (hasContrib) {
    steps.push({ label: r?.modalities_used === 3 ? 'Start' : 'Start, adjusted', from: 0, to: start,
                 colour: 'rgb(var(--ds-faint))', text: start.toFixed(1) })
    let at = start
    rows.forEach((x) => {
      if (typeof x.push !== 'number') return
      steps.push({ label: x.label, from: at, to: at + x.push, colour: x.colour,
                   text: `${x.push > 0 ? '+' : ''}${x.push.toFixed(1)}` })
      at += x.push
    })
    steps.push({ label: 'Fused', from: 0, to: zFinal, colour: 'rgb(var(--dash-line))',
                 text: `= ${fused.toFixed(2)}`, final: true })
  }
  const criticalLine = bands?.critical != null ? logit(Number(bands.critical)) : null
  const sevColour = BAND_COLOURS[r?.classification] ?? 'rgb(var(--ds-ink))'

  return (
    <ConsoleShell
      eyebrow="Detector · Fusion"
      title={<>One verdict. <em>Three reasons.</em></>}
      subtitle="How the three detectors are combined, and what the report cites."
      actions={
        <>
          <button className="ds-btn" onClick={() => openTab('file')}>Score a file</button>
          <button className="ds-btn" onClick={() => openTab('live')}>Live</button>
          {r?.analysis_id != null && (
            <button className="ds-btn ds-btn-primary" onClick={download} disabled={saving}>
              {saving ? 'Preparing…' : 'Download PDF'}
            </button>
          )}
        </>
      }
    >
      <div className="dash" style={{ gap: 18 }}>
        {error && <Alert tone="error">{error}</Alert>}

        <div className="dash-card" role="status" style={{ padding: '12px 18px', display: 'flex', gap: 12,
                                                            alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: 'rgb(var(--ds-accent))' }} />
            <span style={{ fontSize: 14 }}>
              {liveRow
                ? <>Showing the live verdict for <b className="ds-mono">{liveRow.transaction_id}</b>
                    {!inLive ? ' · the last one shown; open Live to follow the monitor'
                      : pinned ? ' · pinned' : ' · following the monitor'}</>
                : 'Waiting for the first live verdict. Start the live monitor and upload a file with the Query Runner.'}
            </span>
            {pinned && inLive && (
              <button className="ds-btn" style={{ marginLeft: 'auto' }} onClick={followLatest}>Follow latest</button>
            )}
          </div>

        {r ? (
          <>
            <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(300px, 420px) minmax(0, 1fr)' }}
                 className="ds-split">
              <section className="dash-card" style={{ padding: 24, textAlign: 'center' }}>
                <div className="ds-section-label" style={{ textAlign: 'left' }}>Fused verdict</div>
                <Gauge value={fused} bands={bands} />
                <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: '-.05em', lineHeight: 1, marginTop: -6 }}>
                  {fused.toFixed(2)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <span className="ds-badge" style={{ color: sevColour, borderColor: 'transparent',
                                                      background: `color-mix(in srgb, ${sevColour} 16%, transparent)` }}>
                    {r.classification ?? '-'}
                  </span>
                  <span className="ds-badge">
                    {r.modalities_used ?? 0} of 3 answered
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'rgb(var(--ds-faint))', margin: '12px 0 0' }}>
                  {bands ? `critical ${bands.critical} · high ${bands.high} · medium ${bands.medium}`
                    : 'live operating point'}
                </p>
              </section>

              <section className="dash-card" style={{ padding: 24 }}>
                <div className="dash-head" style={{ marginBottom: 6 }}>
                  <h2 className="dash-h dash-h-sm">How each detector moved it</h2>
                  <span style={{ fontSize: 13, color: 'rgb(var(--ds-muted))' }}>in log-odds; up means fraud</span>
                </div>
                {hasContrib ? (
                  <>
                    <Waterfall steps={steps} fused={fused} critical={criticalLine} />
                    {r.modalities_used !== 3 && (
                      <p style={{ fontSize: 12, color: 'rgb(var(--ds-muted))', margin: '4px 0 0' }}>
                        A detector was missing, so the start includes the pull toward uncertain.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="ds-empty">
                    This fusion model does not report per-detector contributions.
                  </div>
                )}
              </section>
            </div>

            <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {rows.map((x) => {
                const lead = driver && driver.key === x.key
                const pct = x.available ? Math.round(Math.max(0, Math.min(1, Number(x.score ?? 0))) * 100) : 0
                return (
                  <section key={x.key} className="dash-card" style={{
                    padding: 22,
                    borderColor: lead ? 'rgb(var(--dash-line) / .55)' : undefined,
                    opacity: x.available === false ? 0.6 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 72, height: 72, borderRadius: 99, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                                    background: `conic-gradient(${x.colour} 0 ${pct}%, rgb(var(--ds-surface-3)) ${pct}% 100%)` }}>
                        <div style={{ width: 58, height: 58, borderRadius: 99, display: 'grid', placeItems: 'center',
                                      background: 'rgb(var(--dash-card-top))', fontWeight: 700, fontSize: 16 }}>
                          {x.available ? Number(x.score ?? 0).toFixed(2) : 'off'}
                        </div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 18, fontWeight: 600 }}>{x.label}</span>
                          {lead && (
                            <span className="ds-badge" style={{ background: 'rgb(var(--ds-accent))', color: 'rgb(var(--ds-on-accent))',
                                                                borderColor: 'transparent' }}>Decided it</span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: 'rgb(var(--ds-muted))' }}>
                          {x.available === false ? 'did not answer'
                            : typeof x.push === 'number'
                              ? <>pushed the verdict <b className="ds-mono" style={{ color: 'rgb(var(--ds-ink))' }}>
                                  {x.push > 0 ? '+' : ''}{x.push.toFixed(2)}</b></>
                              : x.model}
                        </div>
                      </div>
                    </div>
                    {x.signal && (
                      <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 14, color: 'rgb(var(--ds-ink))' }}>
                        {x.signal}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>

            <section className="dash-card" style={{ padding: 24 }}>
              <div className="dash-head" style={{ marginBottom: 10 }}>
                <h2 className="dash-h dash-h-sm">The report, and what it matched</h2>
                {r.retrieval?.typology_name && (
                  <span className="ds-badge">
                    {r.retrieval.typology_name}
                    {r.retrieval.similarity_score != null
                      && ` · ${Math.round(Number(r.retrieval.similarity_score) * 100)}% match`}
                  </span>
                )}
              </div>
              {r.forensic_report ? (
                <>
                  <pre className="ds-mono" style={{
                    margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6,
                    color: 'rgb(var(--ds-muted))', maxHeight: showReport ? 520 : 150, overflow: 'auto',
                    padding: 14, borderRadius: 16, background: 'rgb(var(--ds-workspace))',
                  }}>
                    {r.forensic_report}
                  </pre>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    {r.analysis_id != null && (
                      <button className="ds-btn ds-btn-primary" onClick={download} disabled={saving}>
                        {saving ? 'Preparing…' : 'Download PDF'}
                      </button>
                    )}
                    <button className="ds-btn" onClick={() => setShowReport((v) => !v)}>
                      {showReport ? 'Show less' : 'Read the full report'}
                    </button>
                  </div>
                </>
              ) : r.live ? (
                <div className="ds-empty">
                  The live monitor does not write a report for every payment. When a verdict is above LOW it
                  opens a case with the detectors' full reasoning and the report; open it under Cases.
                </div>
              ) : (
                <div className="ds-empty">No report was written for this run.</div>
              )}
            </section>
          </>
        ) : null}

        <TypologyGrid matchedId={r?.retrieval?.typology_id}
                      matchedName={r?.retrieval?.typology_name}
                      similarity={r?.retrieval?.similarity_score} />

        <div ref={tabsRef} style={{ display: 'grid', gap: 14, scrollMarginTop: 20 }}>
          <div className="dash-chips" role="tablist" aria-label="More about fusion">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                      className="dash-chip"
                      style={{ cursor: 'pointer', height: 40,
                               background: tab === key ? 'rgb(var(--dash-mint))' : 'transparent',
                               borderColor: tab === key ? 'transparent' : undefined,
                               color: tab === key ? 'rgb(var(--dash-on-mint))' : undefined,
                               fontWeight: tab === key ? 600 : 400 }}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'pipeline' && <FusionStages />}
          {tab === 'live' && (
            <FusionLive onRow={onLiveRow}
                        selected={pinned && liveRow ? `${liveRow.transaction_id}-${liveRow.at}` : null} />
          )}
          {tab === 'file' && <FusionBatch />}
          {tab === 'model' && <FusionModelPanel />}
        </div>
      </div>
    </ConsoleShell>
  )
}
