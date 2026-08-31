import { useCallback, useEffect, useState } from 'react'
import { getFusionStages } from '../services/api'

/**
 * The fusion engine, drawn as the five things it actually is.
 *
 * The tab treats it as one component and it is a chain: weigh the detectors,
 * match a typology, write the narrative, render the document, deliver it. Four
 * of those five can fail without changing a single number on a verdict — a
 * report generator out of quota and an expired SMTP password both leave the
 * scores looking perfect — which is exactly why they need somewhere to be seen.
 *
 * Laid out left to right with the connectors drawn, because the order is the
 * explanation: nothing reaches the report writer that did not come out of the
 * two stages before it, and that constraint is the grounding claim.
 *
 * The PDF stage is exercised rather than inspected — the server renders a real
 * document and counts the bytes. A renderer that imports cleanly and produces
 * nothing would pass any lighter check.
 */
export default function FusionStages() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const check = useCallback(async () => {
    setBusy(true)
    try {
      setData(await getFusionStages())
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { check() }, [check])

  if (failed) return null
  const stages = data?.stages ?? []

  return (
    <section className="rounded-xl border p-5" style={{ borderColor: 'rgb(var(--ds-line))' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[19px] font-semibold">What runs between a score and a filed report</h2>
        <button onClick={check} disabled={busy}
                className="ds-mono rounded-full border px-3 py-1.5 text-[13px] transition-colors disabled:opacity-50"
                style={{ borderColor: 'rgb(var(--ds-line))',
                         color: 'rgb(var(--ds-muted))' }}>
          {busy ? 'Checking…' : 'Check again'}
        </button>
      </div>

      <div className="mt-5 grid gap-3"
           style={{ gridTemplateColumns: `repeat(${Math.max(1, stages.length)}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => (
          <div key={s.key} className="relative flex flex-col rounded-xl border p-4"
               style={{
                 borderColor: s.ok ? 'rgba(45,212,191,.35)' : 'rgb(var(--ds-sev-high))',
                 background: 'rgb(var(--ds-surface-2))',
               }}>
            {/* The connector. The chain is the argument, so it is drawn. */}
            {i < stages.length - 1 && (
              <span className="absolute right-[-13px] top-1/2 hidden h-px w-3 lg:block"
                    style={{ background: 'rgb(var(--ds-line))' }} />
            )}

            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: s.ok ? 'rgb(var(--ds-accent))'
                      : 'rgb(var(--ds-sev-high))' }} />
              <span className="ds-mono text-[11px]"
                    style={{ color: 'rgb(var(--ds-faint))' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>

            <p className="mt-2 text-[16px] font-semibold leading-tight">{s.name}</p>
            <p className="mt-1 flex-1 text-[13px] leading-snug"
               style={{ color: 'rgb(var(--ds-muted))' }}>{s.does}</p>

            <p className="mt-3 text-[13px]"
               style={{ color: s.ok ? 'rgb(var(--ds-accent-strong))'
                 : 'rgb(var(--ds-sev-high))' }}>
              {s.detail}
            </p>

            <dl className="mt-3 grid gap-1"
                style={{ borderTop: '1px solid rgb(var(--ds-line))', paddingTop: 10 }}>
              {(s.figures ?? []).map((f) => (
                <div key={f.label} className="flex justify-between gap-2 text-[12px]">
                  <dt className="truncate" style={{ color: 'rgb(var(--ds-faint))' }}>
                    {f.label}
                  </dt>
                  <dd className="numeric truncate" style={{ color: 'rgb(var(--ds-ink))' }}>
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[13px] leading-relaxed" style={{ color: 'rgb(var(--ds-faint))' }}>
        Read left to right. Nothing reaches the report writer that did not come
        out of the two stages before it — that constraint is what makes the
        narrative checkable against the record. Only the first stage changes a
        verdict; the other four fail quietly, which is why they are checked here.
      </p>
    </section>
  )
}
