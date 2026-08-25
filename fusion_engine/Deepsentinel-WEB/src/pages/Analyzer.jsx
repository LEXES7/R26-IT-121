import { useCallback, useState } from 'react'
import PipelineDiagram from '../components/PipelineDiagram'
import ScoreGauge from '../components/ScoreGauge'
import RiskBadge from '../components/RiskBadge'
import AblationComparison from '../components/AblationComparison'
import TransactionForm from '../components/TransactionForm'
import GraphEvidence from '../components/GraphEvidence'
import ForensicReport from '../components/ForensicReport'
import { useAnalysisStream } from '../hooks/useAnalysisStream'
import { getSampleTransaction } from '../services/api'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  PageHeader,
  SectionLabel,
  cx,
} from '../components/ui'

const SCENARIOS = [
  { value: 'mule_network', label: 'Mule network', icon: '🕸️', short: 'Hub-and-spoke fund routing' },
  { value: 'layering', label: 'Layering', icon: '🔀', short: 'Multi-hop transfer chain' },
  { value: 'smurfing', label: 'Smurfing', icon: '🐡', short: 'Below-threshold structuring' },
  { value: 'account_takeover', label: 'Account takeover', icon: '🔓', short: 'Unauthorised drain' },
  { value: 'velocity_fraud', label: 'Velocity fraud', icon: '⚡', short: 'Automated rapid transfers' },
  { value: 'legitimate', label: 'Legitimate', icon: '✅', short: 'Normal customer activity' },
]

const CLASSIFICATION_STYLE = {
  CRITICAL: { bg: 'bg-risk-critical/8', border: 'border-risk-critical/30', text: 'text-risk-critical' },
  HIGH: { bg: 'bg-risk-high/8', border: 'border-risk-high/30', text: 'text-risk-high' },
  MEDIUM: { bg: 'bg-risk-medium/8', border: 'border-risk-medium/30', text: 'text-risk-medium' },
  LOW: { bg: 'bg-risk-low/8', border: 'border-risk-low/30', text: 'text-risk-low' },
}

// Full class strings, never interpolated: Tailwind extracts class names by
// scanning source text, so a template-literal class would never be generated.
const MODALITIES = [
  ['graph', 'Graph network', 'bg-modality-graph'],
  ['behavioral', 'Behavioural', 'bg-modality-behavioral'],
  ['temporal', 'Temporal', 'bg-modality-temporal'],
]

const money = (n) =>
  typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'

export default function Analyzer() {
  const [mode, setMode] = useState('live') // 'live' | 'manual' | 'scenario'
  const [scenario, setScenario] = useState('mule_network')
  const [includeBaseline, setIncludeBaseline] = useState(false)

  const [liveTxn, setLiveTxn] = useState(null)
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState(null)

  const { stages, result, running, error, run, cancel } = useAnalysisStream()

  const pull = useCallback(async () => {
    setPulling(true)
    setPullError(null)
    try {
      const { transaction } = await getSampleTransaction()
      setLiveTxn(transaction)
    } catch (e) {
      setPullError(
        e?.response?.data?.detail ??
          'Could not reach the graph service. Is it running on its configured port?',
      )
    } finally {
      setPulling(false)
    }
  }, [])

  const runLive = () => liveTxn && run({ transaction: liveTxn, include_baseline: includeBaseline })
  const runScenario = () =>
    run({ use_mock: true, mock_scenario: scenario, include_baseline: includeBaseline })
  const runManual = (transaction) => run({ transaction, include_baseline: includeBaseline })

  const hasRun =
    Boolean(result) || running || Object.values(stages).some((s) => s.status !== 'idle')

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Transaction analyzer"
        description="Runs one transaction through the full pipeline and streams each stage as it completes. Durations are measured, not simulated."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
        {/* ── Controls ── */}
        <div className="space-y-4 print:hidden">
          <Card className="p-5">
            <div className="flex gap-1 rounded-lg border border-subtle bg-surface p-1">
              {[
                ['live', 'Live'],
                ['manual', 'Manual'],
                ['scenario', 'Scenario'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={cx(
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    mode === value
                      ? 'bg-surface-overlay text-slate-200'
                      : 'text-slate-500 hover:text-slate-300',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'live' && (
              <div className="mt-5 space-y-4">
                <p className="text-xs leading-relaxed text-slate-500">
                  Pulls a genuine transaction from the graph service — the same
                  source the live monitor screens — and sends it to every
                  deployed model.
                </p>

                {pullError && <Alert tone="error">{pullError}</Alert>}

                {liveTxn ? (
                  <div className="rounded-xl border border-subtle bg-surface-raised p-4">
                    <div className="flex items-start justify-between gap-2">
                      <SectionLabel>Loaded transaction</SectionLabel>
                      <Badge tone="low">{liveTxn.type}</Badge>
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-slate-500">
                      {liveTxn.transaction_id}
                    </p>
                    <p className="mt-2 font-mono text-lg font-semibold text-slate-200">
                      {money(liveTxn.amount)}
                    </p>
                    <dl className="mt-3 space-y-1 text-[11px]">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">From</dt>
                        <dd className="truncate font-mono text-slate-400">{liveTxn.nameOrig}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">To</dt>
                        <dd className="truncate font-mono text-slate-400">{liveTxn.nameDest}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Step</dt>
                        <dd className="font-mono text-slate-400">{liveTxn.step}</dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-subtle p-5 text-center text-xs text-slate-600">
                    No transaction loaded yet.
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={pull}
                    loading={pulling}
                    className="flex-1"
                  >
                    {liveTxn ? 'Pull another' : 'Pull transaction'}
                  </Button>
                  <Button
                    onClick={runLive}
                    loading={running}
                    disabled={!liveTxn}
                    className="flex-1"
                  >
                    {running ? 'Running…' : 'Analyse'}
                  </Button>
                </div>
              </div>
            )}

            {mode === 'manual' && (
              <div className="mt-5 space-y-4">
                <p className="text-xs leading-relaxed text-slate-500">
                  Enter a transaction by hand. It is sent to all three model
                  APIs; any that are unreachable are imputed and the confidence
                  penalised.
                </p>
                <TransactionForm onSubmit={runManual} loading={running} />
              </div>
            )}

            {mode === 'scenario' && (
              <div className="mt-5 space-y-4">
                <Alert tone="warning">
                  Scenario mode <strong>simulates</strong> the three model
                  scores. Use it to exercise fusion, retrieval and report
                  generation when the models are not reachable — not to
                  demonstrate detection.
                </Alert>
                <div>
                  <SectionLabel>Choose a scenario</SectionLabel>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {SCENARIOS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setScenario(s.value)}
                        className={cx(
                          'rounded-xl border p-3 text-left transition-all',
                          scenario === s.value
                            ? 'border-accent-500/40 bg-accent-500/10 ring-1 ring-accent-500/30'
                            : 'border-subtle bg-surface hover:border-strong',
                        )}
                      >
                        <div className="mb-1.5 text-lg">{s.icon}</div>
                        <p
                          className={cx(
                            'text-xs font-semibold',
                            scenario === s.value ? 'text-accent-400' : 'text-slate-300',
                          )}
                        >
                          {s.label}
                        </p>
                        <p className="mt-0.5 text-[10px] leading-tight text-slate-600">
                          {s.short}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
                <Button onClick={runScenario} loading={running} className="w-full" size="lg">
                  {running ? 'Running…' : '▶  Run simulation'}
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={includeBaseline}
                onChange={(e) => setIncludeBaseline(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                <span className="block text-sm font-medium text-slate-200">
                  Ablation comparison
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                  Also generate a report without retrieved context, to show what
                  grounding actually changes. Roughly doubles the run time.
                </span>
              </span>
            </label>
          </Card>

          {running && (
            <Button variant="ghost" onClick={cancel} className="w-full" size="sm">
              Cancel run
            </Button>
          )}
        </div>

        {/* ── Results ── */}
        <div className="space-y-5">
          <Card className="p-5 sm:p-6 print:hidden">
            <CardHeader
              title="Pipeline"
              description={
                hasRun
                  ? 'Live — each stage reports its own measured duration.'
                  : 'Select a stage to read what happens there, or run the pipeline to watch it live.'
              }
              action={
                running ? (
                  <Badge tone="medium">Running</Badge>
                ) : result ? (
                  <Badge tone="low">Complete</Badge>
                ) : null
              }
            />
            <div className="mt-5">
              <PipelineDiagram stages={hasRun ? stages : null} running={running} live={hasRun} />
            </div>
          </Card>

          {result && <ResultSummary result={result} />}
          {result && <ModalityPanel result={result} />}
          {result?.graph_evidence && <GraphEvidence evidence={result.graph_evidence} />}

          {(result || running) && (
            <ForensicReport
              report={result?.forensic_report}
              loading={running && !result?.forensic_report}
              durationMs={stages?.report?.durationMs}
              transactionId={result?.transaction_id}
            />
          )}

          {result?.baseline_report && (
            <Card className="border-modality-graph/25 p-5 print:hidden">
              <AblationComparison
                baselineReport={result.baseline_report}
                groundedReport={result.forensic_report}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultSummary({ result }) {
  const style = CLASSIFICATION_STYLE[result.classification] ?? CLASSIFICATION_STYLE.LOW

  return (
    <Card className={cx('animate-slide-up p-5 sm:p-6', style.bg, style.border)}>
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-slate-500">{result.transaction_id}</p>
          <p className={cx('mt-1 text-xl font-bold', style.text)}>
            {result.classification} RISK
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge>{result.modalities_used} of 3 models</Badge>
            {result.mock_scenario && <Badge tone="medium">simulated scores</Badge>}
            <RiskBadge classification={result.retrieval.risk_level} />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-slate-500">FATF match</p>
            <p className="mt-0.5 max-w-[14rem] truncate text-sm font-medium text-slate-200">
              {result.retrieval.typology_name}
            </p>
            <p className="mt-0.5 font-mono text-xs text-slate-500">
              {(result.retrieval.similarity_score * 100).toFixed(1)}% similarity
            </p>
          </div>
          <ScoreGauge score={result.fraud_confidence_score} label="Confidence" size={104} />
        </div>
      </div>
    </Card>
  )
}

/**
 * Says plainly which models answered and which did not.
 *
 * An unreachable model is imputed at 0.5 and the fused confidence penalised —
 * showing that number without saying where it came from would misrepresent a
 * placeholder as a measurement.
 */
function ModalityPanel({ result }) {
  const missing = MODALITIES.filter(([k]) => !result[`${k}_available`])

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        title="Model contributions"
        description="Which detectors answered for this transaction."
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {MODALITIES.map(([key, label, tone]) => {
          const available = result[`${key}_available`]
          const score = result[`${key}_score`]
          const signal = result[`${key}_signal`]
          return (
            <div
              key={key}
              className={cx(
                'rounded-xl border p-4',
                available ? 'border-subtle bg-surface-raised' : 'border-dashed border-subtle',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-300">{label}</p>
                <span className={cx('h-1.5 w-1.5 rounded-full', available ? tone : 'bg-slate-600')} />
              </div>
              {available ? (
                <>
                  <p className="mt-2 font-mono text-2xl font-semibold text-slate-200">
                    {(score ?? 0).toFixed(3)}
                  </p>
                  {signal && (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{signal}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm font-medium text-slate-500">Not deployed</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                    Imputed at 0.5 and excluded from the fused score.
                  </p>
                </>
              )}
            </div>
          )
        })}
      </div>

      {missing.length > 0 && (
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          {missing.length} of 3 detectors {missing.length === 1 ? 'is' : 'are'} not
          currently deployed, so an uncertainty penalty has been applied to the
          fused confidence. The figure above is deliberately conservative.
        </p>
      )}
    </Card>
  )
}
