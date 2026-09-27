/**
 * The two pictures only a reconstruction model can draw.
 *
 * `ExpectationGap` is the one worth the space. A VAE rebuilds its input from a
 * compressed summary, so for every feature there are two numbers: what arrived,
 * and what the model would have produced from its own idea of normal. The
 * distance between them is the anomaly. No other detector on this platform can
 * show that — the graph shows structure, the sequence model shows a
 * predecessor, and neither has an opinion about what the transaction *should*
 * have looked like.
 *
 * `FingerprintStrip` draws the vector itself. The share of each feature and
 * each latent dimension, in one row per signal, is the object that gets
 * clustered into typologies — so the shape of the row is the thing, not the
 * name of whichever entry happens to be largest.
 */

/** Share formatted the way it is read: a percentage, or "<0.1%" rather than 0.0%. */
function pct(share) {
  const v = (share ?? 0) * 100
  if (v === 0) return '0%'
  if (v < 0.1) return '<0.1%'
  return `${v.toFixed(1)}%`
}

/** Feature values span log-amounts, ratios and 0/1 flags, so no shared format works. */
function num(v) {
  if (v == null) return '—'
  const a = Math.abs(v)
  if (a === 0) return '0'
  if (a >= 100000 || a < 0.001) return v.toExponential(1)
  if (a >= 100) return v.toFixed(0)
  if (a >= 1) return v.toFixed(2)
  return v.toFixed(4)
}

const strip = (s) => s.replace(/^F\d+_/, '').replace(/_/g, ' ')

export function ExpectationGap({ shares = [] }) {
  if (!shares.length) return null

  // Ordered by share, because the question the panel answers is "what drove
  // this", and that is the order the answer comes in.
  const rows = [...shares].sort((a, b) => (b.share ?? 0) - (a.share ?? 0))
  const top = rows[0]?.share || 1

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {rows.map((r) => {
        const share = r.share ?? 0
        const faint = share < 0.005
        return (
          <div key={r.feature} style={{ display: 'grid', gap: 3 }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="ds-mono text-[13px]"
                    style={{ color: faint ? 'rgb(var(--ds-faint))' : 'rgb(var(--ds-ink))' }}>
                {strip(r.feature)}
              </span>
              <span className="ds-mono text-[13px] tabular-nums"
                    style={{ color: 'rgb(var(--ds-muted))' }}>
                expected <span style={{ color: 'rgb(var(--ds-faint))' }}>{num(r.reconstructed)}</span>
                {'  ·  saw '}
                <span style={{ color: faint ? 'rgb(var(--ds-muted))' : 'rgb(var(--ds-ink))' }}>
                  {num(r.observed)}
                </span>
              </span>
            </div>

            {/* Width is the share of reconstruction error, not the distance
                between the two numbers. They are not the same thing: error is
                measured in the scaled space the model works in, so a feature
                whose raw reconstruction is wild can still carry almost none of
                it. Drawing the raw distance would make that feature the
                loudest thing on the panel while contributing nothing. */}
            <div className="relative h-[7px] overflow-hidden rounded-full"
                 style={{ background: 'rgb(var(--ds-surface-3))' }}>
              <div className="absolute inset-y-0 left-0 rounded-full"
                   style={{
                     width: `${Math.max(share / top * 100, share > 0 ? 1.5 : 0)}%`,
                     background: faint ? 'rgb(var(--ds-faint))' : 'rgb(var(--ds-accent))',
                   }} />
            </div>

            <div className="ds-mono text-[11px]" style={{ color: 'rgb(var(--ds-faint))' }}>
              {pct(share)} of reconstruction error
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** One signal as a row of cells, each cell's fill proportional to its share. */
function Row({ label, shares, keyName, tone }) {
  if (!shares?.length) return null
  const max = Math.max(...shares.map((s) => s.share ?? 0), 1e-9)

  // How many entries it takes to reach 90% of the signal. One number for
  // "concentrated on a couple of things" against "spread across everything",
  // which is the property that separates one typology from another.
  const sorted = [...shares].sort((a, b) => (b.share ?? 0) - (a.share ?? 0))
  let acc = 0
  let carry = 0
  for (const s of sorted) { acc += s.share ?? 0; carry += 1; if (acc >= 0.9) break }

  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="ds-mono text-[12px] uppercase tracking-wider"
              style={{ color: 'rgb(var(--ds-faint))' }}>{label}</span>
        <span className="ds-mono text-[11px]" style={{ color: 'rgb(var(--ds-faint))' }}>
          {carry} of {shares.length} carry 90%
        </span>
      </div>

      <div className="flex gap-[3px]">
        {shares.map((s) => {
          const v = (s.share ?? 0) / max
          return (
            <div
              key={s[keyName]}
              title={`${s[keyName]} · ${pct(s.share)}`}
              className="h-7 flex-1 rounded-[3px]"
              style={{
                background: `rgb(var(${tone}) / ${(0.10 + v * 0.90).toFixed(3)})`,
                outline: '1px solid rgb(var(--ds-line))',
                outlineOffset: '-1px',
              }}
            />
          )
        })}
      </div>

      <div className="flex gap-[3px]">
        {shares.map((s) => (
          <span key={s[keyName]}
                className="ds-mono flex-1 truncate text-center text-[9.5px]"
                style={{ color: 'rgb(var(--ds-faint))' }}>
            {String(s[keyName]).replace(/^F\d+_/, '').replace(/^dim_/, '')}
          </span>
        ))}
      </div>
    </div>
  )
}

export function FingerprintStrip({ fingerprint = {} }) {
  const s1 = fingerprint.signal_1_reconstruction_error?.shares
  const s2 = fingerprint.signal_2_kl_divergence?.shares
  const s3 = fingerprint.signal_3_latent_density?.shares
  if (!s1 && !s2 && !s3) return null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Row label="Signal 1 · per input feature" shares={s1}
           keyName="feature" tone="--ds-accent" />
      <Row label="Signal 2 · per latent dimension (KL)" shares={s2}
           keyName="dimension" tone="--ds-signal" />
      <Row label="Signal 3 · per latent dimension (density)" shares={s3}
           keyName="dimension" tone="--ds-warn" />
    </div>
  )
}
