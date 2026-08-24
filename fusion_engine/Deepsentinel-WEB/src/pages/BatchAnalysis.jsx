import { useCallback, useMemo, useRef, useState } from 'react'
import { analyzeBatch } from '../services/api'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SectionLabel,
  cx,
} from '../components/ui'

/**
 * Batch analysis of an uploaded transaction file.
 *
 * This is the demonstration the review panel asked for: feed the system a file
 * of transactions and watch it separate fraud from legitimate activity. When
 * the file carries an isFraud column, detection is scored against it and the
 * confusion matrix is shown — including what was missed, which matters more to
 * an evaluator than a headline accuracy figure.
 */

const CLASSIFICATION_TONE = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
}

const CLASSIFICATION_BAR = {
  CRITICAL: 'bg-risk-critical',
  HIGH: 'bg-risk-high',
  MEDIUM: 'bg-risk-medium',
  LOW: 'bg-risk-low',
}

export default function BatchAnalysis() {
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [meta, setMeta] = useState(null)
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [narratives, setNarratives] = useState([])
  const [upstreamNotices, setUpstreamNotices] = useState([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const abortRef = useRef(null)
  const inputRef = useRef(null)

  const reset = () => {
    setMeta(null)
    setRows([])
    setSummary(null)
    setNarratives([])
    setUpstreamNotices([])
    setError(null)
    setFilter('all')
  }

  const pick = (f) => {
    if (!f) return
    setFile(f)
    reset()
  }

  const start = useCallback(() => {
    if (!file) return
    reset()
    setRunning(true)

    abortRef.current = analyzeBatch(file, {
      onEvent: (name, data) => {
        if (name === 'meta') setMeta(data)
        else if (name === 'progress') setRows((prev) => [...prev, data])
        else if (name === 'narrative') setNarratives((prev) => [...prev, data])
        else if (name === 'summary') setSummary(data)
        else if (name === 'upstream')
          setUpstreamNotices((prev) =>
            prev.some((n) => n.modality === data.modality) ? prev : [...prev, data],
          )
        else if (name === 'error') setError(data.message)
      },
      onDone: () => setRunning(false),
      onError: (message) => {
        setError(message)
        setRunning(false)
      },
    })
  }, [file])

  const cancel = () => {
    abortRef.current?.()
    setRunning(false)
  }

  const progressPct = meta?.rows ? Math.round((rows.length / meta.rows) * 100) : 0

  const visible = useMemo(() => {
    const sorted = [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    if (filter === 'alerted') return sorted.filter((r) => r.alerted)
    if (filter === 'missed') return sorted.filter((r) => r.label === 1 && !r.alerted)
    if (filter === 'false-positive') return sorted.filter((r) => r.label === 0 && r.alerted)
    return sorted
  }, [rows, filter])

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Batch analysis"
        description="Upload a day's transactions as CSV or Excel. Every row is scored, and detection is measured against the file's own labels when it has them."
      />

      {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}

      {/* ── Upload ── */}
      <Card className="p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            pick(e.dataTransfer.files?.[0])
          }}
          onClick={() => inputRef.current?.click()}
          className={cx(
            'cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors',
            dragging
              ? 'border-blue-500/60 bg-blue-500/5'
              : 'border-subtle hover:border-strong',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xlsm,.txt,.tsv"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <div className="text-3xl">{file ? '📄' : '📂'}</div>
          {file ? (
            <>
              <p className="mt-3 font-medium text-slate-200">{file.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {(file.size / 1024).toFixed(0)} KB · click to choose a different file
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-medium text-slate-300">
                Drop a transaction file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-slate-600">
                CSV or Excel, PaySim schema, up to 5,000 rows
              </p>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={start} disabled={!file || running} loading={running}>
            {running ? 'Analyzing…' : 'Analyze file'}
          </Button>
          {running && (
            <Button variant="ghost" onClick={cancel} size="sm">
              Cancel
            </Button>
          )}
          {file && !running && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(null)
                reset()
              }}
            >
              Clear
            </Button>
          )}
        </div>

        <details className="mt-5">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
            Required columns
          </summary>
          <div className="mt-2.5 rounded-lg border border-subtle bg-surface p-3">
            <p className="text-xs leading-relaxed text-slate-500">
              <span className="text-slate-400">Required:</span>{' '}
              <code className="font-mono text-[11px]">
                step, type, amount, nameOrig, nameDest
              </code>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              <span className="text-slate-400">Recommended:</span>{' '}
              <code className="font-mono text-[11px]">
                oldbalanceOrg, newbalanceOrig, oldbalanceDest, newbalanceDest
              </code>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              <span className="text-slate-400">Optional:</span>{' '}
              <code className="font-mono text-[11px]">isFraud</code> — read as
              ground truth to score detection. It is never given to the models.
            </p>
            <p className="mt-2 text-[11px] text-slate-600">
              Header names are matched case-insensitively, so name_orig and
              nameOrig both work.
            </p>
          </div>
        </details>
      </Card>

      {/* ── Progress ── */}
      {meta && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-200">{meta.filename}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {meta.rows.toLocaleString()} transactions
                {meta.has_labels
                  ? ` · ${meta.labelled.toLocaleString()} labelled for scoring`
                  : ' · no labels, detection cannot be scored'}
              </p>
            </div>
            <Badge tone={running ? 'medium' : 'low'}>
              {running ? `${progressPct}%` : 'Complete'}
            </Badge>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-500 transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-slate-600">
            {rows.length.toLocaleString()} of {meta.rows.toLocaleString()} scored
            {summary?.elapsed_ms != null &&
              ` · ${(summary.elapsed_ms / 1000).toFixed(1)}s`}
          </p>
        </Card>
      )}

      {/* Model availability — shown prominently, because results computed with
          models missing must not be mistaken for a clean run. */}
      {upstreamNotices.length > 0 && (
        <Alert
          tone={upstreamNotices.length === 3 ? 'error' : 'warning'}
          title={
            upstreamNotices.length === 3
              ? 'No detection model responded'
              : `${upstreamNotices.length} of 3 models unavailable`
          }
        >
          {upstreamNotices.length === 3 ? (
            <p className="leading-relaxed">
              None of the three model APIs could be reached, so no transaction in
              this file could be scored. Start the model services and run the
              file again. Nothing below is a detection result.
            </p>
          ) : (
            <ul className="mt-1 space-y-1">
              {upstreamNotices.map((n) => (
                <li key={n.modality} className="leading-relaxed">
                  {n.message}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {summary?.unscored > 0 && summary.unscored === summary.analysed && (
        <Card className="p-6">
          <CardHeader
            title="No results"
            description={`All ${summary.analysed.toLocaleString()} rows were read and validated successfully, but none could be scored because no model was reachable.`}
          />
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            The file parsed correctly, so nothing needs changing about it. Bring
            the model APIs up and upload it again.
          </p>
        </Card>
      )}

      {/* ── Detection scorecard ── */}
      {summary?.has_labels && summary.metrics && summary.unscored !== summary.analysed && (
        <Scorecard metrics={summary.metrics} summary={summary} />
      )}

      {summary && !summary.has_labels && summary.unscored !== summary.analysed && (
        <Card className="p-5">
          <CardHeader
            title="Results"
            description="This file carried no isFraud column, so detection cannot be scored against ground truth."
          />
          <div className="mt-4 flex flex-wrap gap-6">
            <Stat label="Transactions" value={summary.analysed.toLocaleString()} />
            <Stat label="Alerts raised" value={summary.alerts.toLocaleString()} tone="high" />
            {Object.entries(summary.by_classification).map(([k, v]) => (
              <Stat key={k} label={k.toLowerCase()} value={v} />
            ))}
          </div>
        </Card>
      )}

      {/* ── Narratives ── */}
      {narratives.length > 0 && (
        <Card className="p-6">
          <CardHeader
            title="Forensic narratives"
            description="Generated for the highest-scoring transactions only. Producing one per row would take seconds each."
          />
          <div className="mt-4 space-y-3">
            {narratives.map((n) => (
              <div key={n.index} className="rounded-xl border border-subtle bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">row {n.index}</span>
                  <Badge tone="critical">{(n.score * 100).toFixed(0)}%</Badge>
                  <span className="text-xs text-slate-500">{n.typology}</span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{n.report}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Transactions ── */}
      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle p-5">
            <SectionLabel>Transactions</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {[
                ['all', `All ${rows.length}`],
                ['alerted', `Alerted ${rows.filter((r) => r.alerted).length}`],
                summary?.has_labels && [
                  'missed',
                  `Missed ${rows.filter((r) => r.label === 1 && !r.alerted).length}`,
                ],
                summary?.has_labels && [
                  'false-positive',
                  `False alarms ${rows.filter((r) => r.label === 0 && r.alerted).length}`,
                ],
              ]
                .filter(Boolean)
                .map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    className={cx(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                      filter === value
                        ? 'bg-surface-overlay text-slate-200'
                        : 'text-slate-500 hover:bg-surface-raised hover:text-slate-300',
                    )}
                  >
                    {label}
                  </button>
                ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon="✓" title="Nothing in this category" />
          ) : (
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 bg-sentinel-900">
                  <tr className="border-b border-subtle text-left">
                    {['Row', 'From → To', 'Type', 'Amount', 'Score', 'Verdict'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {visible.map((r) => (
                    <TransactionRow key={r.index} row={r} hasLabels={summary?.has_labels} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {!meta && !running && (
        <EmptyState
          icon="📊"
          title="No file analysed yet"
          description="Upload a transaction file above to score it."
        />
      )}
    </div>
  )
}

function TransactionRow({ row, hasLabels }) {
  const verdict = !hasLabels
    ? null
    : row.label === 1 && row.alerted
      ? { label: 'caught', tone: 'low' }
      : row.label === 1 && !row.alerted
        ? { label: 'missed', tone: 'critical' }
        : row.label === 0 && row.alerted
          ? { label: 'false alarm', tone: 'high' }
          : { label: 'clear', tone: 'neutral' }

  return (
    <tr
      className={cx(
        'transition-colors hover:bg-surface',
        row.label === 1 && !row.alerted && 'bg-risk-critical/5',
      )}
    >
      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{row.index}</td>
      <td className="px-4 py-2.5">
        <span className="font-mono text-xs text-slate-400">{row.nameOrig}</span>
        <span className="mx-1.5 text-slate-700">→</span>
        <span className="font-mono text-xs text-slate-400">{row.nameDest}</span>
        {row.typology_label && (
          <span className="ml-2 text-[10px] text-slate-600">{row.typology_label}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{row.type}</td>
      <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-400">
        {row.amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-raised">
            <div
              className={cx('h-full rounded-full', CLASSIFICATION_BAR[row.classification])}
              style={{ width: `${Math.round((row.score ?? 0) * 100)}%` }}
            />
          </div>
          <span className="font-mono text-xs text-slate-400">
            {row.score != null ? row.score.toFixed(2) : '—'}
          </span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        {verdict ? (
          <Badge tone={verdict.tone}>{verdict.label}</Badge>
        ) : (
          <Badge tone={CLASSIFICATION_TONE[row.classification]}>
            {row.classification?.toLowerCase()}
          </Badge>
        )}
      </td>
    </tr>
  )
}

function Scorecard({ metrics, summary }) {
  const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

  return (
    <Card className="p-6">
      <CardHeader
        title="Detection scorecard"
        description="Measured against the isFraud labels in the uploaded file."
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Recall" value={pct(metrics.recall)} hint="of actual frauds, caught" emphasis />
        <Metric label="Precision" value={pct(metrics.precision)} hint="of alerts, genuine" emphasis />
        <Metric label="F1" value={pct(metrics.f1)} hint="harmonic mean" />
        <Metric label="Accuracy" value={pct(metrics.accuracy)} hint="all rows" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Confusion label="Caught" value={metrics.true_positive} tone="low"
          hint="fraud, alerted" />
        <Confusion label="Missed" value={metrics.false_negative} tone="critical"
          hint="fraud, no alert" />
        <Confusion label="False alarms" value={metrics.false_positive} tone="high"
          hint="legitimate, alerted" />
        <Confusion label="Correctly clear" value={metrics.true_negative} tone="neutral"
          hint="legitimate, no alert" />
      </div>

      {metrics.false_negative > 0 && (
        <Alert tone="warning" className="mt-5">
          {metrics.false_negative} fraudulent transaction
          {metrics.false_negative === 1 ? ' was' : 's were'} not flagged. Filter to
          <span className="font-medium"> Missed</span> below to see which.
        </Alert>
      )}

      {metrics.false_positive === 0 && metrics.true_negative > 0 && (
        <Alert tone="success" className="mt-5">
          No legitimate transaction was flagged — {metrics.true_negative} clean
          rows passed without a false alarm.
        </Alert>
      )}

      <p className="mt-5 text-xs leading-relaxed text-slate-600">
        These figures describe this file only. They are not a general accuracy
        claim, which belongs to each model's held-out evaluation.
      </p>
    </Card>
  )
}

function Metric({ label, value, hint, emphasis }) {
  return (
    <div className={cx('rounded-xl border p-4', emphasis ? 'border-strong bg-surface-raised' : 'border-subtle bg-surface')}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-bold text-slate-200">{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-600">{hint}</p>
    </div>
  )
}

function Confusion({ label, value, tone, hint }) {
  const colour = {
    low: 'text-risk-low',
    critical: 'text-risk-critical',
    high: 'text-risk-high',
    neutral: 'text-slate-400',
  }[tone]

  return (
    <div className="rounded-xl border border-subtle bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cx('mt-1.5 font-mono text-2xl font-bold', colour)}>{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-600">{hint}</p>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <p className={cx('font-mono text-2xl font-bold', tone === 'high' ? 'text-risk-high' : 'text-slate-200')}>
        {value}
      </p>
      <p className="mt-0.5 text-xs capitalize text-slate-500">{label}</p>
    </div>
  )
}
