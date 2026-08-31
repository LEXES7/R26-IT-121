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

export default function DetectorRuntime({ detector, model }) {
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
  const rows = [
    ['Model', d?.model_version ?? d?.model?.stage ?? '—'],
    ['Service up', secs(d?.service_uptime_seconds ?? d?.startup_seconds) ?? '—'],
    ['Scored', d?.transactions_scored ?? d?.model?.inferences ?? '—'],
    ['Mean latency', (d?.mean_latency_ms ?? d?.model?.mean_latency_ms) != null
      ? `${Number(d.mean_latency_ms ?? d.model.mean_latency_ms).toFixed(1)} ms` : '—'],
  ]

  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-3 rounded-xl border px-4 py-3"
         style={{ borderColor: 'rgb(var(--ds-line))',
                  background: 'rgb(var(--ds-surface-2))' }}>
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full"
              style={{ background: d == null ? 'rgb(var(--ds-faint))'
                : ready ? 'rgb(var(--ds-accent))' : 'rgb(var(--ds-sev-high))' }} />
        <span className="text-[14px] font-semibold">
          {d == null ? 'Checking…' : ready ? 'Serving' : 'Not serving'}
        </span>
      </span>

      {rows.map(([k, v]) => (
        <span key={k} className="min-w-0">
          <span className="ds-mono block text-[11px] uppercase tracking-[.12em]"
                style={{ color: 'rgb(var(--ds-faint))' }}>{k}</span>
          <span className="numeric block truncate text-[15px]"
                style={{ color: 'rgb(var(--ds-ink))' }}>{v}</span>
        </span>
      ))}

      {model && (
        <span className="ds-mono ml-auto text-[13px]"
              style={{ color: 'rgb(var(--ds-faint))' }}>{model}</span>
      )}
    </div>
  )
}
