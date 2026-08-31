import { useEffect, useState } from 'react'
import { getMonitorRuntime } from '../services/api'

/**
 * One detector's own runtime, on that detector's page.
 *
 * These four figures used to sit together on the System page, three abreast.
 * That is the right place to answer "is anything down", and the wrong place to
 * answer "is the thing I am looking at working" — which is the question you
 * have while reading a score. So each page carries its own, and System keeps
 * the reachability summary rather than the detail.
 *
 * It reads the same endpoint the shell already polls, so this costs one more
 * request on load and nothing after.
 */

const secs = (s) => {
  if (s == null) return null
  const n = Number(s)
  if (n < 60) return `${Math.round(n)}s`
  if (n < 3600) return `${Math.round(n / 60)}m`
  return `${(n / 3600).toFixed(1)}h`
}

export default function DetectorRuntime({ detector, model, children }) {
  const [d, setD] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    getMonitorRuntime()
      .then((r) => { if (alive) setD(r?.detectors?.[detector] ?? null) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [detector])

  if (failed) return null

  const ready = d?.ready
  const lat = d?.mean_latency_ms ?? d?.model?.mean_latency_ms
  const rows = [
    ['Build', d?.model_version ?? d?.model?.stage ?? '—', d?.model_meta?.features
      ? `feature set ${d.model_meta.features}` : d?.detection_method ?? ''],
    ['Serving for', secs(d?.service_uptime_seconds ?? d?.startup_seconds) ?? '—',
      'since the process started'],
    ['Scored', (d?.transactions_scored ?? d?.model?.inferences ?? 0).toLocaleString(),
      'transactions this run'],
    ['Mean latency', lat != null ? `${Number(lat).toFixed(1)} ms` : '—',
      lat != null ? 'per verdict' : 'nothing scored yet'],
  ]

  return (
    <section className="rounded-xl border p-5"
             style={{ borderColor: 'rgb(var(--ds-line))',
                      background: 'rgb(var(--ds-surface-2))' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full"
                style={{ background: d == null ? 'rgb(var(--ds-faint))'
                  : ready ? 'rgb(var(--ds-accent))' : 'rgb(var(--ds-sev-high))' }} />
          <span className="text-[19px] font-semibold">
            {d == null ? 'Checking…' : ready ? 'Serving' : 'Not serving'}
          </span>
        </span>
        {model && (
          <span className="ds-mono text-[14px]"
                style={{ color: 'rgb(var(--ds-faint))' }}>{model}</span>
        )}
      </div>

      <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([k, v, note]) => (
          <div key={k} className="min-w-0">
            <dt className="ds-mono text-[11px] uppercase tracking-[.13em]"
                style={{ color: 'rgb(var(--ds-faint))' }}>{k}</dt>
            <dd className="numeric mt-1 truncate text-[24px] leading-none"
                style={{ color: 'rgb(var(--ds-ink))' }}>{v}</dd>
            {note && (
              <p className="mt-1 truncate text-[13px]"
                 style={{ color: 'rgb(var(--ds-muted))' }}>{note}</p>
            )}
          </div>
        ))}
      </dl>

      {children}
    </section>
  )
}
