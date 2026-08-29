import { useCallback, useEffect, useState } from 'react'
import AblationComparison from '../components/AblationComparison'
import TransactionForm from '../components/TransactionForm'
import GraphEvidence from '../components/GraphEvidence'
import NetworkGraph from '../components/NetworkGraph'
import BehaviouralEvidence from '../components/BehaviouralEvidence'
import TemporalEvidence from '../components/TemporalEvidence'
import ForensicReport from '../components/ForensicReport'
import SarDraft from '../components/SarDraft'
import Locked from '../components/Locked'
import PipelineDiagram from '../components/PipelineDiagram'
import { Badge, Footer, Panel, Progress, SectionHeading } from '../components/ConsoleShell'
import { usePackage } from '../hooks/usePackage'
import { useAnalysisStream } from '../hooks/useAnalysisStream'
import { getSampleTransaction, getStoredTransaction, searchTransactions } from '../services/api'

/**
 * One transaction, through every stage.
 *
 * Laid out as record → evidence → verdict, which is the order an investigator
 * reads in: what arrived, what each detector made of it, and what the platform
 * concluded. Nothing here is illustrative — a figure appears only once a run
 * has produced it, and a detector that did not answer says so rather than
 * showing a neutral score that looks like a measurement.
 */

const SCENARIOS = [
  { value: 'mule_network', label: 'Mule network', short: 'Hub-and-spoke fund routing' },
  { value: 'layering', label: 'Layering', short: 'Multi-hop transfer chain' },
  { value: 'smurfing', label: 'Smurfing', short: 'Below-threshold structuring' },
  { value: 'account_takeover', label: 'Account takeover', short: 'Unauthorised drain' },
  { value: 'velocity_fraud', label: 'Velocity fraud', short: 'Automated rapid transfers' },
  { value: 'legitimate', label: 'Legitimate', short: 'Normal customer activity' },
]

const SEV = {
  CRITICAL: { tone: 'alert', hex: 'rgb(var(--ds-signal))', label: 'Critical activity' },
  HIGH:     { tone: 'warn',  hex: 'rgb(var(--ds-warn))',   label: 'High risk' },
  MEDIUM:   { tone: 'warn',  hex: 'rgb(var(--ds-warn))',   label: 'Medium risk' },
  LOW:      { tone: 'good',  hex: 'rgb(var(--ds-accent-strong))', label: 'Low risk' },
}

const money = (n) =>
  typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'

export default function Analyzer() {
  const [mode, setMode] = useState('pick')
  const [scenario, setScenario] = useState('mule_network')
  const [includeBaseline, setIncludeBaseline] = useState(false)
  const [txn, setTxn] = useState(null)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [open, setOpen] = useState('')

  const { stages, result, running, run } = useAnalysisStream()
  const { has, upsells } = usePackage()

  useEffect(() => {
    if (mode !== 'pick') return undefined
    let dead = false
    const t = setTimeout(() => {
      searchTransactions(query)
        .then((d) => !dead && (setHits(d.transactions ?? []), setError(null)))
        .catch((e) => !dead && setError(e?.response?.data?.detail ?? 'Could not read stored transactions.'))
    }, 250)
    return () => { dead = true; clearTimeout(t) }
  }, [query, mode])

  const choose = useCallback(async (id) => {
    setError(null)
    try {
      const { transaction } = await getStoredTransaction(id)
      setTxn(transaction)
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not load that transaction.')
    }
  }, [])

  const pull = useCallback(async () => {
    setPulling(true); setError(null)
    try {
      const { transaction } = await getSampleTransaction()
      setTxn(transaction)
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not reach the graph service.')
    } finally { setPulling(false) }
  }, [])

  const go = () => txn && run({ transaction: txn, include_baseline: includeBaseline })
  const hasRun = Boolean(result) || running || Object.values(stages).some((s) => s.status !== 'idle')
  const sev = result ? (SEV[result.classification] ?? SEV.LOW) : null

  /* Each detector, with the score it actually returned. A detector that did
     not answer is stated as such — never imputed to a neutral 0.5, which
     would sit in the same column as a real measurement. */
  const detectors = result ? [
    ['Network', result.graph_score, result.graph_available,
     'Edge-Enhanced GraphSAGE', 'Who pays whom — mule rings, funnels, layering chains.'],
    ['Behaviour', result.behavioral_score, result.behavioral_available,
     'Stratified VAE with Dual-Signal Attribution',
     'Whether this fits normal behaviour for its transaction type.'],
    ['Timing', result.temporal_score, result.temporal_available,
     'Transaction-Sequence TCN',
     'Reads the transactions immediately before this one.'],
  ] : []

  return (
    <div className="ds-fade-up" style={{ display: 'grid', gap: 16 }}>

      {/* ── choose what to analyse ── */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['pick', 'Choose'], ['live', 'Random'], ['manual', 'Manual'], ['scenario', 'Scenario']]
          .map(([v, label]) => (
          <button key={v} onClick={() => setMode(v)}
                  className={`ds-btn ${mode === v ? 'ds-btn-primary' : 'ds-btn-quiet'}`}>
            {label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 10, color: 'rgb(var(--ds-muted))',
                          display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={includeBaseline}
                   onChange={(e) => setIncludeBaseline(e.target.checked)} />
            Also run without retrieval
          </label>
          <button className="ds-btn ds-btn-primary" onClick={go} disabled={!txn || running}>
            {running ? 'Running…' : 'Analyse transaction'}
          </button>
        </span>
      </div>

      {error && (
        <div style={{ background: 'rgb(var(--ds-signal-soft))', color: 'rgb(var(--ds-signal))',
                      borderRadius: 6, padding: 11, fontSize: 11 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 12,
                    gridTemplateColumns: 'minmax(0, 1.24fr) minmax(330px, .9fr)' }}>
        <div style={{ display: 'grid', gap: 12 }}>

          {/* ── the record ── */}
          <Panel className="ds-panel-pad">
            <SectionHeading
              label="Incoming record"
              title={txn?.transaction_id ?? 'No transaction loaded'}
              action={result && <Badge tone={sev.tone}>
                {result.classification?.toLowerCase()} · {result.fraud_confidence_score?.toFixed(3)}
              </Badge>}
            />

            {mode === 'pick' && (
              <>
                <input className="ds-field" value={query} placeholder="Transaction id or account…"
                       onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 10 }} />
                <div className="ds-scroll" style={{ maxHeight: 168, overflowY: 'auto', marginBottom: 4 }}>
                  {hits.length === 0 ? (
                    <div style={{ fontSize: 10, color: 'rgb(var(--ds-faint))', padding: '8px 0' }}>
                      {query ? 'Nothing matches that.'
                        : 'No ingested transactions yet — upload a file with the Query Runner.'}
                    </div>
                  ) : hits.map((t) => (
                    <button key={t.transaction_id} onClick={() => choose(t.transaction_id)}
                            style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%',
                                     gap: 10, alignItems: 'center', padding: '7px 6px', borderRadius: 5,
                                     background: txn?.transaction_id === t.transaction_id
                                       ? 'rgb(var(--ds-surface-2))' : undefined }}>
                      <span className="ds-mono" style={{ fontSize: 10, flex: 1, minWidth: 0,
                                                         overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.transaction_id}
                      </span>
                      <span style={{ fontSize: 9, color: 'rgb(var(--ds-muted))' }}>
                        {t.type} · {money(t.amount)}
                      </span>
                      <span className="ds-mono" style={{ fontSize: 9, flex: '0 0 auto',
                              minWidth: 62, textAlign: 'right', whiteSpace: 'nowrap',
                              color: t.case_ref ? 'rgb(var(--ds-signal))' : 'rgb(var(--ds-faint))' }}>
                        {typeof t.fused_score === 'number' ? t.fused_score.toFixed(3) : 'not scored'}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {mode === 'live' && (
              <button className="ds-btn" onClick={pull} disabled={pulling}
                      style={{ marginBottom: 12 }}>
                {pulling ? 'Pulling…' : txn ? 'Pull another' : 'Pull a transaction'}
              </button>
            )}

            {mode === 'manual' && (
              <div style={{ marginBottom: 10 }}>
                <TransactionForm onSubmit={(t) => run({ transaction: t, include_baseline: includeBaseline })}
                                 loading={running} />
              </div>
            )}

            {mode === 'scenario' && (
              <>
                <div style={{ background: 'rgb(var(--ds-warn-soft))', color: 'rgb(var(--ds-warn))',
                              borderRadius: 6, padding: 10, fontSize: 10, marginBottom: 11 }}>
                  Scenario mode <strong>simulates</strong> the three detector scores. It exercises
                  fusion, retrieval and reporting — the scores are not measurements.
                </div>
                <div style={{ display: 'grid', gap: 5,
                              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  {SCENARIOS.map((s) => (
                    <button key={s.value} onClick={() => setScenario(s.value)}
                            className={`ds-btn ${scenario === s.value ? 'ds-btn-primary' : ''}`}
                            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                      <span>{s.label}</span>
                      <span style={{ fontSize: 9, opacity: .8, fontWeight: 400 }}>{s.short}</span>
                    </button>
                  ))}
                </div>
                <button className="ds-btn ds-btn-primary" style={{ marginTop: 10 }}
                        disabled={running}
                        onClick={() => run({ use_mock: true, mock_scenario: scenario,
                                             include_baseline: includeBaseline })}>
                  {running ? 'Running…' : 'Run scenario'}
                </button>
              </>
            )}

            {txn && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                            gap: '15px 24px', padding: '13px 0 2px',
                            borderTop: '1px solid rgb(var(--ds-line))', marginTop: 4 }}>
                {[['amount', money(txn.amount)], ['type', txn.type],
                  ['sender', txn.nameOrig], ['beneficiary', txn.nameDest],
                  ['step', txn.step], ['balance after', money(txn.newbalanceOrig)]].map(([k, v]) => (
                  <div key={k}>
                    <div className="ds-section-label">{k}</div>
                    <div className="ds-mono" style={{ fontSize: 11, marginTop: 5 }}>{v ?? '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ── evidence stack ── */}
          <Panel style={{ overflow: 'hidden' }}>
            <div style={{ padding: '17px 19px 3px' }}>
              <SectionHeading
                label="Evidence stack"
                title={result ? 'What each detector found' : 'Nothing has run yet'}
                action={result && <span className="ds-mono" style={{ fontSize: 10 }}>
                  {result.modalities_used} / 3 contributed
                </span>}
              />
            </div>
            {!result ? (
              <div style={{ padding: '0 19px 19px' }}>
                <div className="ds-empty">
                  Choose a transaction and analyse it. Each detector's score and reasoning
                  appears here once it has actually run.
                </div>
              </div>
            ) : detectors.map(([name, score, available, model, blurb]) => {
              const tone = !available ? 'faint'
                : score >= 0.7 ? 'signal' : score >= 0.4 ? 'warn' : 'accent'
              const colour = { faint: 'rgb(var(--ds-faint))', signal: 'rgb(var(--ds-signal))',
                               warn: 'rgb(var(--ds-warn))', accent: 'rgb(var(--ds-accent-strong))' }[tone]
              return (
                <div key={name} onClick={() => setOpen(open === name ? '' : name)}
                     style={{ padding: '15px 19px', borderTop: '1px solid rgb(var(--ds-line))',
                              cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{name}</div>
                    <span className="ds-mono" style={{ color: colour }}>
                      {available && typeof score === 'number' ? score.toFixed(3) : 'not deployed'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                gap: 15, margin: '8px 0', alignItems: 'center' }}>
                    <div className="ds-progress" style={{ flex: 1 }}>
                      <span style={{ width: available && typeof score === 'number'
                                       ? `${score * 100}%` : '0%', background: colour }} />
                    </div>
                    <span style={{ fontSize: 9, color: 'rgb(var(--ds-muted))' }}>{model}</span>
                  </div>
                  {open === name && (
                    <div className="ds-fade-up" style={{ fontSize: 10, lineHeight: 1.55,
                                                         color: 'rgb(var(--ds-muted))', paddingTop: 3 }}>
                      {available ? blurb
                        : 'This detector did not answer, so it abstained. Fusion applied an '
                          + 'uncertainty penalty rather than treating silence as innocence.'}
                    </div>
                  )}
                </div>
              )
            })}
          </Panel>

          {/* ── attribution, gated ── */}
          {(result?.graph_evidence || result?.behavioral_evidence || result?.temporal_evidence) && (
            <Locked feature="attribution_panels" has={has} upsells={upsells}
                    title="Detailed attribution is not included in your package">
              <div style={{ display: 'grid', gap: 12 }}>
                {result?.graph_evidence && <NetworkGraph evidence={result.graph_evidence} />}
                {result?.graph_evidence && <GraphEvidence evidence={result.graph_evidence} />}
                {result?.behavioral_evidence && <BehaviouralEvidence evidence={result.behavioral_evidence} />}
                {result?.temporal_evidence && <TemporalEvidence evidence={result.temporal_evidence} />}
              </div>
            </Locked>
          )}
        </div>

        {/* ── verdict rail ── */}
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <Panel className="ds-panel-pad"
                 style={{ borderTop: `3px solid ${result ? sev.hex : 'rgb(var(--ds-line))'}` }}>
            <div className="ds-section-label">Fused verdict</div>
            {result ? (
              <>
                <div style={{ display: 'flex', alignItems: 'end',
                              justifyContent: 'space-between', marginTop: 9, gap: 10 }}>
                  <div style={{ fontSize: 22, letterSpacing: '-.06em', fontWeight: 600 }}>
                    {sev.label}
                  </div>
                  <div className="ds-mono" style={{ fontSize: 24, color: sev.hex }}>
                    {result.fraud_confidence_score?.toFixed(3)}
                  </div>
                </div>
                <p style={{ fontSize: 11, lineHeight: 1.6, color: 'rgb(var(--ds-muted))',
                            margin: '13px 0 0' }}>
                  {result.modalities_used < 3
                    ? `Only ${result.modalities_used} of 3 detectors contributed, so an
                       uncertainty penalty was applied.`
                    : 'All three detectors contributed.'}
                </p>
                {result.retrieval?.typology_name && (
                  <div style={{ marginTop: 14, paddingTop: 13,
                                borderTop: '1px solid rgb(var(--ds-line))' }}>
                    <div className="ds-section-label">Matched typology</div>
                    <div style={{ fontSize: 11, marginTop: 5 }}>
                      {result.retrieval.typology_name}
                      <span className="ds-mono" style={{ color: 'rgb(var(--ds-muted))', marginLeft: 7 }}>
                        {result.retrieval.typology_id}
                      </span>
                    </div>
                    <div className="ds-mono" style={{ fontSize: 9, color: 'rgb(var(--ds-faint))',
                                                      marginTop: 5 }}>
                      {(result.retrieval.similarity_score * 100).toFixed(1)}% similarity ·
                      retrieved, not generated
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'rgb(var(--ds-muted))', marginTop: 10,
                            lineHeight: 1.6 }}>
                No verdict yet. Figures appear here only once a run produces them.
              </div>
            )}
          </Panel>

          {(result || running) && (
            <Locked feature="forensic_report" has={has} upsells={upsells}
                    title="Forensic reporting is not included in your package">
              <ForensicReport
                report={result?.forensic_report}
                loading={running && !result?.forensic_report}
                durationMs={stages?.report?.durationMs}
                transactionId={result?.transaction_id}
                analysisId={result?.analysis_id}
              />
            </Locked>
          )}

          {result?.baseline_report && (
            <AblationComparison grounded={result.forensic_report}
                                baseline={result.baseline_report} />
          )}

          {result?.analysis_id && (
            <Locked feature="sar_draft" has={has} upsells={upsells}
                    title="SAR drafting is not included in your package">
              <SarDraft analysisId={result.analysis_id} />
            </Locked>
          )}
        </div>
      </div>

      {/* Full width: the pipeline reads left to right, and squeezing it into a
          330px rail made it overflow its own panel. */}
      <Panel className="ds-panel-pad">
        <SectionHeading label="Pipeline"
                        title={hasRun ? 'Stages, as they ran' : 'Five stages, input to report'} />
        <div style={{ overflowX: 'auto' }}>
          <PipelineDiagram stages={hasRun ? stages : null} running={running} live={hasRun} />
        </div>
      </Panel>

      <Footer left="Model versions and citations travel with every verdict." />
    </div>
  )
}
