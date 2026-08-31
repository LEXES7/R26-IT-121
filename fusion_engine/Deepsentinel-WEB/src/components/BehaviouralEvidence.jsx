import { useState } from 'react'
import { Badge, Card, CardHeader, SectionLabel, cx } from './ui'

/**
 * Renders the attribution the behavioural model returns with every score.
 *
 * The graph model's evidence is a *structure* — accounts, edges, a sink. This
 * model's evidence is a *decomposition*, so it is shown as one: which stratum
 * answered, how the three terms of the score combined, which input features and
 * which latent dimensions carried the deviation, and which discovered typology
 * the resulting fingerprint fell into.
 *
 * Nothing here is generated text. Every number is read out of the VAE objective
 * at inference time, which is the point of the component: an anomaly score says
 * "unusual", and attribution says which part of the behaviour was unusual.
 */

const STRATUM_COPY = {
  TRANSFER: 'A dedicated model trained only on non-fraud TRANSFER traffic.',
  CASH_OUT: 'A dedicated model trained only on non-fraud CASH_OUT traffic.',
  PAYMENT:
    'The false-positive control stratum — PaySim contains no fraud here, so a '
    + 'flag is by definition a false alarm and is used to measure them.',
  GLOBAL:
    'The pooled model, used for transaction types with no stratum of their own.',
}

const pct = (n) => (typeof n === 'number' ? `${(n * 100).toFixed(0)}%` : '—')
const num = (n, d = 2) => (typeof n === 'number' ? n.toFixed(d) : '—')

export default function BehaviouralEvidence({ evidence }) {
  const [showAllFeatures, setShowAllFeatures] = useState(false)

  if (!evidence) return null

  const {
    risk_level: riskLevel,
    transaction_type: txType,
    feature_set: featureSet,
    vae_diagnostics: diag = {},
    fingerprint = {},
    fraud_typology: typology = {},
    metadata = {},
  } = evidence

  const {
    stratum,
    raw_score: raw,
    threshold,
    calibrated_threshold: calThreshold,
    flagged,
    recon_z: reconZ,
    kl_z: klZ,
    density_z: densityZ,
    weights = {},
    calibration_method: calMethod,
    is_control_stratum: isControl,
    out_of_training_distribution: extrapolated,
  } = diag

  const s1 = fingerprint?.signal_1_reconstruction_error?.shares ?? []
  const s2 = fingerprint?.signal_2_kl_divergence?.shares ?? []
  const s3 = fingerprint?.signal_3_latent_density?.shares ?? []

  // The three standardised terms behind the composite score, each with the
  // weight it carries. Showing the products makes it visible which term
  // actually drove the number rather than which one has the largest z.
  const terms = [
    ['Reconstruction', reconZ, weights.alpha, 'how poorly the model rebuilt this transaction'],
    ['Latent KL', klZ, weights.beta, 'how far the encoding sits from the learned prior'],
    ['Latent density', densityZ, weights.gamma, 'how isolated the encoding is among normal traffic'],
  ].filter(([, z]) => typeof z === 'number')

  const maxContribution = Math.max(
    ...terms.map(([, z, w]) => Math.abs((z ?? 0) * (w ?? 0))),
    1e-9,
  )

  const shownFeatures = showAllFeatures ? s1 : s1.slice(0, 5)

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        title="Behavioural attribution"
        description="Read directly out of the VAE objective at inference time — not generated text."
        action={stratum ? <Badge tone="low">{stratum} model</Badge> : null}
      />

      {/* ── Extrapolation caveat, when the type was never in training ── */}
      {extrapolated && (
        <div className="mt-5 rounded-xl border border-risk-medium/30 bg-risk-medium/[0.07] p-4">
          <p className="text-xs font-semibold text-risk-medium">
            Outside the training distribution
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {txType} traffic is not represented in any stratum&rsquo;s training
            data, which covers TRANSFER, CASH_OUT and PAYMENT. The score below is
            extrapolation and should carry little weight — PaySim labels no
            fraud in this transaction type.
          </p>
        </div>
      )}

      {/* ── Which model answered ── */}
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="text-sm font-semibold text-slate-200">
            Scored by the {stratum ?? 'stratum'} model
            {isControl && (
              <span className="ml-2 rounded bg-risk-medium/15 px-1.5 py-px text-[13px] font-semibold uppercase tracking-wide text-risk-medium">
                control
              </span>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {STRATUM_COPY[stratum]
              ?? 'One variational autoencoder per transaction type, each trained only on that type&rsquo;s normal behaviour.'}
          </p>
          {featureSet && (
            <p className="mt-1.5 font-mono text-[15px] text-slate-500">
              feature set {featureSet}
              {calMethod ? ` · ${calMethod} calibration` : ''}
              {typeof metadata.inference_latency_ms === 'number'
                ? ` · ${metadata.inference_latency_ms} ms`
                : ''}
            </p>
          )}
        </div>
        <div className="flex gap-5 sm:justify-end">
          <Stat value={num(raw)} label="anomaly score" />
          <Stat value={num(threshold)} label="threshold" />
        </div>
      </div>

      {/* ── Decision ── */}
      <div
        className={cx(
          'mt-5 rounded-xl border p-4',
          flagged
            ? 'border-modality-behavioral/30 bg-modality-behavioral/[0.07]'
            : 'border-subtle bg-surface',
        )}
      >
        <SectionLabel>Decision</SectionLabel>
        <p className="mt-1.5 text-sm text-slate-200">
          <span
            className={cx(
              'font-semibold',
              flagged ? 'text-modality-behavioral' : 'text-slate-300',
            )}
          >
            {flagged ? 'Flagged' : 'Below threshold'}
          </span>
          {' — '}
          anomaly score <span className="font-mono">{num(raw)}</span> against the{' '}
          {stratum} threshold <span className="font-mono">{num(threshold)}</span>
          {typeof calThreshold === 'number' && (
            <>
              , calibrated to{' '}
              <span className="font-mono">{num(calThreshold, 3)}</span> on the
              probability scale
            </>
          )}
          {riskLevel ? ` · ${riskLevel}` : ''}.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          The threshold was selected on a held-out validation window, never on
          the data the score is reported against.
        </p>
      </div>

      {/* ── Score decomposition ── */}
      {terms.length > 0 && (
        <div className="mt-6">
          <SectionLabel>What drove the score</SectionLabel>
          <p className="mt-1 text-xs text-slate-400">
            The composite is three standardised terms, each with a fixed weight.
            Bars show weighted contribution, so a large term with a small weight
            does not look like the cause when it was not.
          </p>
          <div className="mt-3 space-y-2.5">
            {terms.map(([label, z, w, blurb]) => {
              const contribution = (z ?? 0) * (w ?? 0)
              return (
                <div key={label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs font-medium text-slate-300">
                      {label}
                      <span className="ml-1.5 font-mono text-[14px] text-slate-500">
                        weight {num(w, 1)}
                      </span>
                    </p>
                    <p className="shrink-0 font-mono text-[15px] text-slate-400">
                      z {num(z)} → {num(contribution)}
                    </p>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-overlay">
                    <div
                      className="h-full rounded-full bg-modality-behavioral"
                      style={{
                        width: `${Math.max(
                          2,
                          Math.min((Math.abs(contribution) / maxContribution) * 100, 100),
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-[14px] text-slate-500">{blurb}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Signal 1: which input features ── */}
      {s1.length > 0 && (
        <div className="mt-6">
          <SectionLabel>Signal 1 — which behaviour was unusual</SectionLabel>
          <p className="mt-1 text-xs text-slate-400">
            Reconstruction error split across the input features. Shares sum to
            one, so this is the model&rsquo;s own statement of what it could not
            rebuild.
          </p>
          {shownFeatures.some(hasGap) ? (
            <>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-modality-behavioral" />
                  what arrived
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full border border-slate-500" />
                  what the model rebuilt
                </span>
                <span className="text-slate-600">
                  each feature on its own range — the bar is comparable, the pair is not
                </span>
              </p>
              <div className="mt-4 space-y-4">
                {shownFeatures.map((x) => (
                  <ReconstructionRow key={x.feature} item={x} />
                ))}
              </div>
            </>
          ) : (
            <ShareBars
              items={shownFeatures.map((x) => [x.feature, x.share])}
              tone="bg-modality-behavioral"
            />
          )}
          {s1.length > 5 && (
            <button
              onClick={() => setShowAllFeatures((v) => !v)}
              className="mt-3 text-xs font-medium text-accent-400 hover:text-accent-300"
            >
              {showAllFeatures ? 'Show top 5 only' : `Show all ${s1.length} features`}
            </button>
          )}
        </div>
      )}

      {/* ── Signal 2 + 3: latent space ── */}
      {(s2.length > 0 || s3.length > 0) && (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {s2.length > 0 && (
            <div>
              <SectionLabel>Signal 2 — latent divergence</SectionLabel>
              <p className="mt-1 text-xs text-slate-400">
                KL divergence per latent dimension.
              </p>
              <ShareBars
                items={s2.slice(0, 4).map((x) => [x.dimension, x.share])}
                tone="bg-modality-behavioral/70"
              />
            </div>
          )}
          {s3.length > 0 && (
            <div>
              <SectionLabel>Signal 3 — latent density</SectionLabel>
              <p className="mt-1 text-xs text-slate-400">
                Displacement from the nearest cluster of normal behaviour.
              </p>
              <ShareBars
                items={s3.slice(0, 4).map((x) => [x.dimension, x.share])}
                tone="bg-modality-behavioral/45"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Typology ── */}
      {typology?.typology_label && (
        <div className="mt-6 rounded-xl border border-subtle bg-surface p-4">
          <SectionLabel>Nearest discovered typology</SectionLabel>
          {typology.typology_label === 'UNASSIGNED' ? (
            <>
              <p className="mt-1.5 text-sm text-slate-300">
                No typology asserted
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                The fingerprint fell outside every discovered cluster. That is a
                normal outcome, and is reported rather than forcing the nearest
                label onto a transaction that does not resemble it.
              </p>
            </>
          ) : (
            <>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-mono text-sm font-semibold text-modality-behavioral">
                  {typology.typology_label}
                </p>
                {typology.fatf_hint && (
                  <Badge tone="neutral">{typology.fatf_hint}</Badge>
                )}
              </div>
              {typology.rationale && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  {typology.rationale}
                </p>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                {typeof typology.confidence === 'number' && (
                  <Fact label="fit confidence" value={num(typology.confidence)} />
                )}
                {typeof typology.cluster_fraud_purity === 'number' && (
                  <Fact
                    label="cluster fraud rate"
                    value={pct(typology.cluster_fraud_purity)}
                  />
                )}
                {typeof typology.cluster_size === 'number' && (
                  <Fact label="cluster size" value={typology.cluster_size} />
                )}
              </dl>
            </>
          )}
          <p className="mt-3 border-t border-subtle pt-2.5 text-[14px] leading-relaxed text-slate-500">
            Typologies are discovered by clustering attribution fingerprints with
            no label used at any point. The name is a post-hoc reading of what
            distinguishes the cluster, and the FATF tag is an advisory retrieval
            key — neither makes the discovery supervised.
          </p>
        </div>
      )}
    </Card>
  )
}

function ShareBars({ items, tone }) {
  const max = Math.max(...items.map(([, v]) => v ?? 0), 1e-9)
  return (
    <div className="mt-3 space-y-2">
      {items.map(([name, share]) => (
        <div key={name} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate font-mono text-[15px] text-slate-400">
            {name}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-overlay">
            <div
              className={cx('h-full rounded-full', tone)}
              style={{ width: `${Math.max(2, ((share ?? 0) / max) * 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-[14px] text-slate-500">
            {pct(share)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A share carries a readable pair only where the model could invert its scaler. */
function hasGap(x) {
  return typeof x?.observed === 'number' && typeof x?.reconstructed === 'number'
}

const sig = (v) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(4))

/**
 * One feature, as it arrived and as the model rebuilt it.
 *
 * The share alone asserts that a feature carried the error. This shows it: the
 * value that came in, the value the decoder produced instead, and the distance
 * between them — which is the whole of what a variational autoencoder does,
 * and the only part of it a reader can check.
 *
 * The bar is the share and is comparable across rows. The pair is not: each
 * feature is drawn against its own local range, because a log amount and an
 * hour-of-day share no scale. So the pair is placed to be read, and every
 * number is printed next to its mark rather than inferred from position.
 */
function ReconstructionRow({ item }) {
  const { feature, share, observed, reconstructed } = item

  if (!hasGap(item)) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-xs text-slate-300">{feature}</span>
          <span className="font-mono text-xs text-slate-500">
            {(share * 100).toFixed(0)}%
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-overlay">
          <div
            className="h-full rounded-full bg-modality-behavioral"
            style={{ width: `${Math.max(2, share * 100)}%` }}
          />
        </div>
      </div>
    )
  }

  const lo = Math.min(observed, reconstructed)
  const hi = Math.max(observed, reconstructed)
  const span = hi - lo || Math.abs(hi) || 1
  const pad = span * 0.35
  const pct = (v) => ((v - (lo - pad)) / (span + pad * 2)) * 100
  const expectedLower = reconstructed < observed

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs text-slate-300">{feature}</span>
        <span className="font-mono text-xs text-slate-500">
          {(share * 100).toFixed(0)}%
        </span>
      </div>

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-overlay">
        <div
          className="h-full rounded-full bg-modality-behavioral"
          style={{ width: `${Math.max(2, share * 100)}%` }}
        />
      </div>

      {/* the pair, on this feature's own range */}
      <div className="relative mt-3.5 h-3">
        <div
          className="absolute inset-x-0 top-1.5 h-px"
          style={{ background: 'var(--hair-strong)' }}
        />
        <div
          className="absolute top-1.5 h-px bg-modality-behavioral/60"
          style={{
            left: `${Math.min(pct(observed), pct(reconstructed))}%`,
            width: `${Math.abs(pct(observed) - pct(reconstructed))}%`,
          }}
        />
        {/* hollow: what the model expected. solid: what actually arrived. */}
        <span
          className="absolute top-0.5 -ml-[3px] h-1.5 w-1.5 rounded-full border border-slate-500 bg-transparent"
          style={{ left: `${pct(reconstructed)}%` }}
          title={`rebuilt as ${sig(reconstructed)}`}
        />
        <span
          className="absolute top-0 -ml-1 h-2.5 w-2.5 rounded-full bg-modality-behavioral"
          style={{ left: `${pct(observed)}%` }}
          title={`observed ${sig(observed)}`}
        />
      </div>

      <p className="mt-2 font-mono text-[14px] text-slate-500">
        {sig(observed)}
        <span className="mx-1.5 text-slate-600">→</span>
        {sig(reconstructed)}
        <span className="ml-2 font-sans text-slate-600">
          rebuilt {expectedLower ? 'lower' : 'higher'} than it arrived
        </span>
      </p>
    </div>
  )
}

function Fact({ label, value }) {
  return (
    <div>
      <dt className="text-[14px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-slate-200">{value}</dd>
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div className="text-right">
      <p className="font-mono text-xl font-semibold text-slate-200">{value ?? '—'}</p>
      <p className="text-[14px] uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  )
}
