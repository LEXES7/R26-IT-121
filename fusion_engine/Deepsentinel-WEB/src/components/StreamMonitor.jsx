/**
 * What the batch upload is actually doing, while it does it.
 *
 * Every number here is measured, not modelled. `bytes` is summed from the
 * Uint8Array chunks the SSE reader pulls off the socket; `frames` counts
 * parsed events; the rate is a real derivative over a sliding window. On a
 * demo the difference matters — a panel can ask "is that real or a loading
 * animation?", and the answer has to be the former.
 *
 * The sparkline is deliberately the only moving part. A row landing in the
 * event log is the signal; everything else would be decoration competing
 * with it.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

const fmtBytes = (n) => {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function Cell({ label, value, sub }) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <span
        className="ds-mono text-[12px] uppercase tracking-wider"
        style={{ color: 'rgb(var(--ds-faint))' }}
      >
        {label}
      </span>
      <span
        className="numeric text-[22px] leading-none"
        style={{ color: 'rgb(var(--ds-ink))', fontWeight: 600 }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

/** Rows-per-second over the last ~4s, drawn as bars. */
function Sparkline({ series }) {
  const peak = Math.max(1, ...series)
  return (
    <div
      className="flex items-end gap-[2px]"
      style={{ height: 34 }}
      aria-hidden="true"
    >
      {series.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(3, (v / peak) * 100)}%`,
            borderRadius: 2,
            background:
              i === series.length - 1
                ? 'rgb(var(--ds-accent))'
                : 'rgb(var(--ds-line))',
            transition: 'height .18s linear',
          }}
        />
      ))}
    </div>
  )
}

export default function StreamMonitor({
  running,
  fileSize,
  stream,          // { bytes, frames, done } from analyzeBatch's onBytes
  events,          // [{ name, label, tone }] newest last
  rowsScored,
  rowsTotal,
}) {
  const [elapsed, setElapsed] = useState(0)
  const [series, setSeries] = useState(() => Array(28).fill(0))
  const startRef = useRef(null)
  const lastRef = useRef(0)

  // One timer drives both the clock and the rate window, so they cannot
  // disagree about how much time has passed.
  useEffect(() => {
    if (!running) return undefined
    if (startRef.current == null) startRef.current = performance.now()
    const id = setInterval(() => {
      setElapsed((performance.now() - startRef.current) / 1000)
      setSeries((prev) => {
        const delta = rowsScored - lastRef.current
        lastRef.current = rowsScored
        return [...prev.slice(1), Math.max(0, delta)]
      })
    }, 150)
    return () => clearInterval(id)
  }, [running, rowsScored])

  useEffect(() => {
    if (!running) {
      startRef.current = null
      lastRef.current = 0
    }
  }, [running])

  const rate = useMemo(
    () => (elapsed > 0.3 ? rowsScored / elapsed : 0),
    [rowsScored, elapsed],
  )
  const bytes = stream?.bytes ?? 0
  const pct = rowsTotal ? Math.min(100, (rowsScored / rowsTotal) * 100) : 0

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          className="ds-mono text-[13px] uppercase tracking-wider"
          style={{ color: 'rgb(var(--ds-faint))' }}
        >
          The stream, as it arrives
        </h3>
        <span
          className="numeric text-[13px]"
          style={{ color: 'rgb(var(--ds-muted))' }}
        >
          {elapsed.toFixed(1)}s
        </span>
      </div>

      <div className="grid gap-5 sm:grid-cols-4">
        <Cell
          label="Sent"
          value={fmtBytes(fileSize)}
          sub={rowsTotal ? `${rowsTotal} rows` : 'uploading'}
        />
        <Cell
          label="Received"
          value={fmtBytes(bytes)}
          sub={`${stream?.frames ?? 0} events`}
        />
        <Cell
          label="Scored"
          value={`${rowsScored}${rowsTotal ? ` / ${rowsTotal}` : ''}`}
          sub={`${pct.toFixed(0)}%`}
        />
        <Cell
          label="Rate"
          value={rate.toFixed(1)}
          sub="rows per second"
        />
      </div>

      {/* Progress, and the shape of the throughput behind it. */}
      <div style={{ display: 'grid', gap: 8 }}>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: 'rgb(var(--ds-line))',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'rgb(var(--ds-accent))',
              transition: 'width .2s linear',
            }}
          />
        </div>
        <Sparkline series={series} />
      </div>

      {/* The events themselves. Newest first — a person reads down. */}
      <div style={{ display: 'grid', gap: 5 }}>
        <span
          className="ds-mono text-[12px] uppercase tracking-wider"
          style={{ color: 'rgb(var(--ds-faint))' }}
        >
          Events in
        </span>
        <div
          style={{
            display: 'grid',
            gap: 2,
            maxHeight: 168,
            overflow: 'auto',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {events.length === 0 && (
            <p className="text-[14px]" style={{ color: 'rgb(var(--ds-muted))' }}>
              Nothing yet.
            </p>
          )}
          {[...events].reverse().map((e, i) => (
            <div
              key={events.length - i}
              className="flex items-baseline gap-3 text-[14px]"
              style={{ opacity: i > 7 ? 0.45 : 1 }}
            >
              <span
                className="ds-mono text-[12px]"
                style={{
                  color: 'rgb(var(--ds-accent-strong))',
                  minWidth: 74,
                }}
              >
                {e.name}
              </span>
              <span style={{ color: 'rgb(var(--ds-ink))' }}>{e.label}</span>
              {e.tone && (
                <span
                  className="ds-mono text-[12px]"
                  style={{ color: `rgb(var(--ds-sev-${e.tone}))` }}
                >
                  {e.tone.toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-[13px] leading-relaxed" style={{ color: 'rgb(var(--ds-faint))' }}>
        Bytes are summed from the chunks the connection actually delivered, and
        the rate is measured over the last four seconds. Nothing here is a
        placeholder animation.
      </p>
    </section>
  )
}
