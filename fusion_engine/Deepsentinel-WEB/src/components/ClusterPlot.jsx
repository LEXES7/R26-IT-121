/**
 * The fingerprints, plotted where they actually fall.
 *
 * This is a real projection, not an arrangement. Every point is one scored
 * transaction placed by its own Signal-1 vector — the share of reconstruction
 * error carried by each of the seven input features — reduced to two
 * dimensions by principal component analysis. Points near each other are near
 * each other in the fingerprint space; that is the whole claim of the typology
 * work and it is the one thing a grouped dot diagram cannot show.
 *
 * Signal 1 rather than the whole fingerprint, because its seven components mean
 * the same thing in every stratum. Signal 2 and 3 are per latent dimension, and
 * `dim_3` of the transfer model is not `dim_3` of the cash-out model — pooling
 * those into one plot would be putting two different spaces on one pair of axes.
 *
 * PCA by power iteration, deflating after the first component. Deterministic
 * from a fixed start vector, so the same file always draws the same picture: an
 * investigator comparing two runs should not have to re-read a new arrangement
 * each time. Roughly thirty lines, against a dependency that would bring a
 * matrix library for one 7×7 covariance.
 */

const FEATURES = 7

/** Top-two principal components of `rows` (n × d), returned as (x, y) pairs. */
function pca2(vectors) {
  const n = vectors.length
  const d = vectors[0].length
  const mean = new Array(d).fill(0)
  for (const v of vectors) for (let j = 0; j < d; j += 1) mean[j] += v[j] / n
  const X = vectors.map((v) => v.map((x, j) => x - mean[j]))

  // Covariance. d is seven here, so the full matrix is cheap and clearer than
  // an implicit formulation.
  const C = Array.from({ length: d }, () => new Array(d).fill(0))
  for (const v of X) {
    for (let a = 0; a < d; a += 1) {
      for (let b = 0; b < d; b += 1) C[a][b] += (v[a] * v[b]) / Math.max(1, n - 1)
    }
  }

  const mul = (M, v) => M.map((row) => row.reduce((s, m, j) => s + m * v[j], 0))
  const norm = (v) => {
    const l = Math.hypot(...v) || 1
    return v.map((x) => x / l)
  }

  const power = (M) => {
    // Fixed, non-degenerate start: a random one would redraw the plot on every
    // render, and a uniform one is orthogonal to some real components.
    let v = norm(Array.from({ length: d }, (_, i) => 1 / (i + 2)))
    for (let k = 0; k < 120; k += 1) v = norm(mul(M, v))
    return v
  }

  const p1 = power(C)
  // Deflate: remove the first component so the second is the next largest.
  const lam = p1.reduce((s, x, i) => s + x * mul(C, p1)[i], 0)
  const C2 = C.map((row, a) => row.map((x, b) => x - lam * p1[a] * p1[b]))
  const p2 = power(C2)

  return X.map((v) => [
    v.reduce((s, x, j) => s + x * p1[j], 0),
    v.reduce((s, x, j) => s + x * p2[j], 0),
  ])
}

const PALETTE = [
  'var(--ds-accent)', 'var(--ds-signal)', 'var(--ds-warn)',
  'var(--ds-sev-high)', 'var(--ds-accent-strong)',
]

export default function ClusterPlot({ rows, groups }) {
  const pts = rows.filter((r) => Array.isArray(r.fp) && r.fp.length === FEATURES)
  if (pts.length < 3) return null

  const colour = new Map(
    groups.map((g, i) => [
      g.name,
      g.name === 'UNASSIGNED' ? 'rgb(var(--ds-faint))'
        : `rgb(${PALETTE[i % PALETTE.length]})`,
    ]),
  )

  const xy = pca2(pts.map((p) => p.fp))
  const xs = xy.map((p) => p[0])
  const ys = xy.map((p) => p[1])
  const pad = 14
  const W = 420
  const H = 260
  const sx = (v) => {
    const lo = Math.min(...xs); const hi = Math.max(...xs)
    return pad + ((v - lo) / (hi - lo || 1)) * (W - pad * 2)
  }
  const sy = (v) => {
    const lo = Math.min(...ys); const hi = Math.max(...ys)
    return H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2)
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full"
           style={{ maxHeight: 300 }}
           role="img"
           aria-label={`${pts.length} fingerprints projected to two dimensions`}>
        <rect x="0" y="0" width={W} height={H} rx="6"
              fill="rgb(var(--ds-surface-2))" />
        {xy.map(([x, y], i) => {
          const p = pts[i]
          const c = p.flagged
            ? (colour.get(p.typology ?? 'UNASSIGNED') ?? 'rgb(var(--ds-accent))')
            : 'rgb(var(--ds-faint))'
          return (
            <circle key={`${p.ref}-${i}`} cx={sx(x)} cy={sy(y)}
                    r={p.flagged ? 4.5 : 3}
                    fill={p.label === 1 ? c : 'transparent'}
                    stroke={c}
                    strokeWidth="1.4"
                    opacity={p.flagged ? 0.95 : 0.4}>
              <title>
                {`${p.ref}${p.flagged ? ` · ${p.typology ?? 'UNASSIGNED'}` : ' · cleared'}`
                  + `${p.label === 1 ? ' · labelled fraud' : p.label === 0 ? ' · labelled clean' : ''}`}
              </title>
            </circle>
          )
        })}
      </svg>
      <p className="mt-1.5 text-[12px] leading-relaxed"
         style={{ color: 'rgb(var(--ds-faint))' }}>
        Every scored transaction, placed by its own reconstruction fingerprint and
        reduced to two dimensions by PCA. Larger marks were flagged and are coloured
        by the typology they fell into; small grey ones were cleared. Filled means the
        file labels it fraud. The axes have no units — distance is what carries meaning.
      </p>
    </div>
  )
}
