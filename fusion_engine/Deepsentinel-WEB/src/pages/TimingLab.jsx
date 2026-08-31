import DetectorLab, { Bar, Stat } from '../components/DetectorLab'

/**
 * What the timing model saw in the thirty-two transactions before this one.
 *
 * The novelty is `fraud_attention`. Most attention mechanisms report which
 * position in the window mattered — an index, which somebody then has to go
 * and look up. This reads that timestep's whole feature vector back out of the
 * rolling buffer, so what arrives is a named prior transaction with its
 * numbers attached: the account, the step, the amount, how far back it sits.
 *
 * That is the difference between "position 17 was important" and "the transfer
 * from C677040494 thirty-one transactions ago is why this looks like a burst".
 */
export default function TimingLab() {
  return (
    <DetectorLab
      detector="temporal"
      eyebrow="Detector · Timing"
      title="Transaction-Sequence TCN"
      subtitle="Each transaction is read alongside the thirty-two before it."
    >
      {(r) => {
        const ev = r.evidence ?? {}
        const cur = ev.current_transaction ?? ev.evidence?.current_transaction ?? {}
        const pred = ev.triggering_predecessor ?? {}
        const pf = pred.features ?? {}
        const offset = Math.abs(pred.offset_from_current ?? 0)

        // The 32-slot window, with the attended slot marked.
        const slots = Array.from({ length: 32 }, (_, i) => 32 - i)
        const attendedSlot = offset > 0 && offset <= 32 ? offset : null

        return (
          <div style={{ display: 'grid', gap: 22 }}>
            <div className="grid gap-6 sm:grid-cols-4">
              <Stat label="Risk score" value={(r.score ?? 0).toFixed(4)}
                    note={ev.risk_level ?? ''} />
              <Stat label="Window" value="32" note="preceding transactions" />
              <Stat label="Attention weight"
                    value={(pred.attention_weight ?? ev.attention_weight ?? 0).toFixed(3)}
                    note="on the transaction below" />
              <Stat label="Decided in"
                    value={ev.inference_time_ms != null
                      ? `${Number(ev.inference_time_ms).toFixed(0)} ms` : '—'}
                    note={ev.model_version ?? ''} />
            </div>

            {/* The window itself. Position carries the meaning here. */}
            <section style={{ display: 'grid', gap: 8 }}>
              <h3 className="ds-mono text-[12px] uppercase tracking-wider"
                  style={{ color: 'rgb(var(--ds-faint))' }}>
                The rolling window · newest on the right
              </h3>
              <div className="flex items-end gap-[3px]">
                {slots.map((back) => {
                  const isAttended = back === attendedSlot
                  const isCurrent = back === 1
                  return (
                    <div key={back} title={`${back - 1} transactions before this one`}
                         style={{
                           flex: 1,
                           height: isAttended ? 44 : isCurrent ? 34 : 18,
                           borderRadius: 3,
                           background: isAttended ? 'rgb(var(--ds-sev-critical))'
                             : isCurrent ? 'rgb(var(--ds-accent))'
                               : 'rgb(var(--ds-line))',
                         }} />
                  )
                })}
              </div>
              <div className="flex justify-between text-[12px]"
                   style={{ color: 'rgb(var(--ds-faint))' }}>
                <span>32 back</span>
                {attendedSlot && <span>attended: {attendedSlot - 1} back</span>}
                <span>this transaction</span>
              </div>
            </section>

            <div className="grid gap-8 md:grid-cols-2">
              {/* The named predecessor — the novelty's actual output. */}
              <section style={{ display: 'grid', gap: 8 }}>
                <h3 className="ds-mono text-[12px] uppercase tracking-wider"
                    style={{ color: 'rgb(var(--ds-faint))' }}>
                  Why · the transaction it attended to
                </h3>
                {pred.nameOrig ? (
                  <div className="rounded-lg border p-3"
                       style={{ borderColor: 'rgb(var(--ds-line))' }}>
                    <p className="numeric text-[15px]" style={{ color: 'rgb(var(--ds-ink))' }}>
                      {pred.nameOrig}
                    </p>
                    <p className="text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                      step {pred.step} · {offset} transactions before this one
                    </p>
                    <dl className="mt-3 grid gap-1 text-[13px]">
                      {[['type', pf.type], ['amount', pf.amount?.toLocaleString?.()],
                        ['drain ratio', pf.drain_ratio?.toFixed?.(4)]]
                        .filter(([, v]) => v != null && v !== undefined)
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3">
                            <dt style={{ color: 'rgb(var(--ds-muted))' }}>{k}</dt>
                            <dd className="numeric" style={{ color: 'rgb(var(--ds-ink))' }}>{v}</dd>
                          </div>
                        ))}
                    </dl>
                    {pred.predecessor_signal && (
                      <p className="mt-2 text-[13px] leading-relaxed"
                         style={{ color: 'rgb(var(--ds-sev-high))' }}>
                        {pred.predecessor_signal}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                    No single predecessor stood out for this transaction.
                  </p>
                )}
              </section>

              {/* What this transaction itself looks like. */}
              <section style={{ display: 'grid', gap: 10 }}>
                <h3 className="ds-mono text-[12px] uppercase tracking-wider"
                    style={{ color: 'rgb(var(--ds-faint))' }}>
                  This transaction&rsquo;s own features
                </h3>
                {[['Drain ratio', cur.drain_ratio],
                  ['Destination was empty', cur.dest_was_empty],
                  ['Type risk', cur.type_risk],
                  ['Hour of day', cur.hour_of_day]]
                  .filter(([, v]) => v != null)
                  .map(([label, v]) => (
                    <Bar key={label} label={label} value={v} max={1}
                         tone={v > 0.9 ? 'risk' : 'accent'} right={Number(v).toFixed(3)} />
                  ))}
                {cur.fraud_signal_summary && (
                  <p className="text-[13px]" style={{ color: 'rgb(var(--ds-sev-high))' }}>
                    {cur.fraud_signal_summary}
                  </p>
                )}
              </section>
            </div>

          </div>
        )
      }}
    </DetectorLab>
  )
}
