import DetectorLab, { Bar, Stat } from '../components/DetectorLab'
import { ExpectationGap, FingerprintStrip } from '../components/Fingerprint'
import TypologyPanel from '../components/TypologyPanel'

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
      editable
      eyebrow="Detector · Behaviour"
      title="Stratified VAE with dual-signal attribution"
      model="Stratified VAE + DSAA"
      subtitle="What normal looks like for each transaction type, and how far this sits from it."
    >
      {(r) => {
        const ev = r.evidence ?? {}
        const d = ev.vae_diagnostics ?? {}
        // `fingerprint` is the raw block from the detector, carrying the
        // per-entry shares. Older responses put only the two headline strings
        // here, so both shapes are read.
        const fp = ev.fingerprint ?? {}
        const hasShares = Boolean(fp.signal_1_reconstruction_error?.shares?.length)
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

            {!hasShares && (
              <p className="text-[14px] leading-relaxed"
                 style={{ color: 'rgb(var(--ds-muted))' }}>
                {fp.dominant_reconstruction_signal
                  ?? 'This response carries the headline signals only; the '
                     + 'per-feature decomposition is not in it.'}
              </p>
            )}

            {hasShares && (
              <>
              {/* What it expected against what arrived. The one view that
                  belongs to a reconstruction model and to nothing else here. */}
              <section style={{ display: 'grid', gap: 10 }}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="ds-mono text-[14px] uppercase tracking-wider"
                      style={{ color: 'rgb(var(--ds-faint))' }}>
                    What it expected, and what arrived
                  </h3>
                  <span className="text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                    {fp.signal_1_reconstruction_error?.dominant_feature_signal ?? ''}
                  </span>
                </div>
                <div className="rounded-lg border p-4"
                     style={{ borderColor: 'rgb(var(--ds-line))' }}>
                  <ExpectationGap
                    shares={fp.signal_1_reconstruction_error?.shares ?? []} />
                </div>
              </section>

              {/* The fingerprint as a vector, which is what gets clustered. */}
              <section style={{ display: 'grid', gap: 10 }}>
                <h3 className="ds-mono text-[14px] uppercase tracking-wider"
                    style={{ color: 'rgb(var(--ds-faint))' }}>
                  The anomaly fingerprint
                </h3>
                <div className="rounded-lg border p-4"
                     style={{ borderColor: 'rgb(var(--ds-line))' }}>
                  <FingerprintStrip fingerprint={fp} />
                </div>
                <p className="text-[13px] leading-relaxed"
                   style={{ color: 'rgb(var(--ds-muted))' }}>
                  Three decompositions of the same alert, read straight off the
                  model rather than from a separate explainer. Clustering these
                  vectors, not the scores, is what produces the typology below.
                </p>
              </section>
              </>
            )}

            <TypologyPanel typology={ev.fraud_typology} />

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
