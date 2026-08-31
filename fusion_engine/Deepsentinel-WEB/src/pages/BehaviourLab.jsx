import DetectorLab, { Bar, Stat } from '../components/DetectorLab'

/**
 * What the behavioural model saw, and which part of it was wrong.
 *
 * The novelty is that it does not stop at a score. A variational autoencoder
 * computes per-feature reconstruction error and per-dimension KL divergence on
 * its way to one number, and then throws both away. This reads them back out:
 * which input it could not rebuild, and which part of its internal summary had
 * to stretch. Two independent views of the same anomaly, for free — no
 * auxiliary explainer, no second model.
 */
export default function BehaviourLab() {
  return (
    <DetectorLab
      detector="behavioural"
      eyebrow="Detector · Behaviour"
      title="Stratified VAE with dual-signal attribution"
      model="Stratified VAE + DSAA"
      subtitle="What normal looks like for each transaction type, and how far this sits from it."
    >
      {(r) => {
        const ev = r.evidence ?? {}
        const d = ev.vae_diagnostics ?? {}
        const fp = ev.fingerprint ?? {}
        const zs = [
          ['Reconstruction', d.recon_z, d.weights?.alpha],
          ['KL divergence', d.kl_z, d.weights?.beta],
          ['Density', d.density_z, d.weights?.gamma],
        ].filter(([, v]) => v !== undefined)
        const maxZ = Math.max(...zs.map(([, v]) => Math.abs(v ?? 0)), 1)

        return (
          <div style={{ display: 'grid', gap: 22 }}>
            <div className="grid gap-6 sm:grid-cols-4">
              <Stat label="Risk score" value={(r.score ?? 0).toFixed(4)}
                    note={ev.risk_level ?? (d.flagged ? 'flagged' : 'not flagged')} />
              <Stat label="Stratum" value={d.stratum ?? ev.transaction_type ?? '—'}
                    note="its own model, not a shared one" />
              <Stat label="Raw anomaly" value={(d.raw_score ?? 0).toFixed(3)}
                    note={`threshold ${d.threshold ?? '—'}`} />
              <Stat label="Calibration" value={d.calibration_method ?? '—'}
                    note={d.operating_point ?? ''} />
            </div>

            {/* The three z-scores and how they are weighted into one number. */}
            <section style={{ display: 'grid', gap: 10 }}>
              <h3 className="ds-mono text-[14px] uppercase tracking-wider"
                  style={{ color: 'rgb(var(--ds-faint))' }}>
                How the score was composed
              </h3>
              {zs.map(([label, v, w]) => (
                <Bar key={label} label={`${label}${w != null ? `  ·  weight ${w}` : ''}`}
                     value={Math.abs(v ?? 0)} max={maxZ}
                     tone={Math.abs(v ?? 0) > 3 ? 'risk' : 'accent'}
                     right={`z = ${(v ?? 0).toFixed(3)}`} />
              ))}
            </section>

            <div className="grid gap-8 md:grid-cols-2">
              {/* Signal 1 — which input it could not rebuild. */}
              <section style={{ display: 'grid', gap: 8 }}>
                <h3 className="ds-mono text-[14px] uppercase tracking-wider"
                    style={{ color: 'rgb(var(--ds-faint))' }}>
                  Signal 1 · reconstruction error
                </h3>
                <div className="rounded-lg border p-3"
                     style={{ borderColor: 'rgb(var(--ds-line))' }}>
                  <p className="text-[16px] leading-relaxed"
                     style={{ color: 'rgb(var(--ds-ink))' }}>
                    {fp.dominant_reconstruction_signal
                      ?? 'No single input dominated the reconstruction error.'}
                  </p>
                </div>
              </section>

              {/* Signal 2 — which latent dimension had to stretch. */}
              <section style={{ display: 'grid', gap: 8 }}>
                <h3 className="ds-mono text-[14px] uppercase tracking-wider"
                    style={{ color: 'rgb(var(--ds-faint))' }}>
                  Signal 2 · KL divergence
                </h3>
                <div className="rounded-lg border p-3"
                     style={{ borderColor: 'rgb(var(--ds-line))' }}>
                  <p className="text-[16px] leading-relaxed"
                     style={{ color: 'rgb(var(--ds-ink))' }}>
                    {fp.dominant_kl_signal
                      ?? 'No single latent dimension dominated the divergence.'}
                  </p>
                </div>
              </section>
            </div>

            {ev.fraud_typology?.typology_label && (
              <p className="text-[15px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                Closest discovered behavioural typology:{' '}
                <span style={{ color: 'rgb(var(--ds-ink))' }}>
                  {ev.fraud_typology.typology_label}
                </span>
              </p>
            )}

            {d.out_of_training_distribution && (
              <p className="text-[15px]" style={{ color: 'rgb(var(--ds-sev-high))' }}>
                Outside the training distribution — read this score as less reliable.
              </p>
            )}
          </div>
        )
      }}
    </DetectorLab>
  )
}
