import { useState } from 'react'
import PipelineDiagram from '../components/PipelineDiagram'
import ScoreGauge from '../components/ScoreGauge'
import RiskBadge from '../components/RiskBadge'
import AblationComparison from '../components/AblationComparison'
import TransactionForm from '../components/TransactionForm'
import { useAnalysisStream } from '../hooks/useAnalysisStream'
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

export default function Analyzer() {
  const [mode, setMode] = useState('scenario') // 'scenario' | 'transaction'
  const [scenario, setScenario] = useState('mule_network')
  const [includeBaseline, setIncludeBaseline] = useState(false)

  const { stages, result, running, error, run, cancel } = useAnalysisStream()

  const runScenario = () =>
    run({ use_mock: true, mock_scenario: scenario, include_baseline: includeBaseline })

  const runTransaction = (transaction) =>
    run({ transaction, include_baseline: includeBaseline })

  const hasRun = Boolean(result) || running || Object.values(stages).some((s) => s.status !== 'idle')

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Transaction analyzer"
        description="Runs the full pipeline and streams each stage as it completes. Durations shown are measured, not simulated."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
        {/* ── Controls ── */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex gap-1 rounded-lg border border-subtle bg-surface p-1">
              {[
                ['scenario', 'Scenario'],
                ['transaction', 'Real transaction'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={cx(
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    mode === value
                      ? 'bg-surface-overlay text-white'
                      : 'text-slate-500 hover:text-slate-300',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'scenario' ? (
              <div className="mt-5 space-y-4">
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
                            ? 'border-blue-500/40 bg-blue-500/10 ring-1 ring-blue-500/30'
                            : 'border-subtle bg-surface hover:border-strong',
                        )}
                      >
                        <div className="mb-1.5 text-lg">{s.icon}</div>
                        <p
                          className={cx(
                            'text-xs font-semibold',
                            scenario === s.value ? 'text-blue-300' : 'text-slate-300',
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

                <p className="text-xs leading-relaxed text-slate-600">
                  Scenarios simulate the three model scores. Fusion, retrieval and
                  report generation are live.
                </p>

                <Button onClick={runScenario} loading={running} className="w-full" size="lg">
                  {running ? 'Running…' : '▶  Run pipeline'}
                </Button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <p className="text-xs leading-relaxed text-slate-500">
                  Sends a real transaction to all three model APIs. Any that are
                  unreachable are imputed and the confidence penalised.
                </p>
                <TransactionForm onSubmit={runTransaction} loading={running} />
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
                <span className="block text-sm font-medium text-white">
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

        {/* ── Live pipeline ── */}
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
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

          {result?.baseline_report && (
            <Card className="border-purple-500/20 p-5" >
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
            {result.mock_scenario && <Badge tone="medium">simulated</Badge>}
            <RiskBadge classification={result.retrieval.risk_level} />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-slate-500">FATF match</p>
            <p className="mt-0.5 max-w-[14rem] truncate text-sm font-medium text-white">
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
