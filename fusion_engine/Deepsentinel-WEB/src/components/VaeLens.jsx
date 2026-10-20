import { useId, useState } from 'react'
import { num, pct, strip } from './Fingerprint'

/**
 * The VAE drawn as the network it is, lit by the evidence it sent back.
 *
 * A reconstruction model squeezes a payment through a few latent numbers and
 * rebuilds it on the far side. The two signals of the attribution come from
 * the two halves of that trip: KL divergence from the latent summary in the
 * middle (Signal 2), and reconstruction error from the rebuilt features on the
 * right (Signal 1). Drawing the trip puts each signal where it arises, which a
 * bar chart of the same numbers cannot do. The ring round each latent node is
 * Signal 3, that dimension's share of the latent density term.
 *
 * Brightness is the share each node carries, and nothing else. The learned
 * weights are not drawn, so every line into one node is lit the same: the
 * picture says where the anomaly sits, not which input drove which dimension.
 */

const W = 1000
const X_IN = 250
const X_Z = 500
const X_OUT = 750
const TOP = 72

// Entries arrive ranked by share. They are drawn in their own order instead,
// so a node keeps its place while the sliders above rescore the payment.
const indexOf = (name) => Number(String(name).match(/\d+/)?.[0] ?? 0)
const inOrder = (key) => (a, b) => indexOf(a[key]) - indexOf(b[key])

const curve = (x1, y1, x2, y2) => {
  const mx = (x1 + x2) / 2
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
}

const CSS = `
  .vae-flow { animation: vae-flow 1.4s linear infinite; }
  @keyframes vae-flow { to { stroke-dashoffset: -28; } }
  @media (prefers-reduced-motion: reduce) { .vae-flow { animation: none; } }
`

// `halo` is the colour drawn behind the latent labels so they read over the
// lines; it should match whatever the lens sits on.
export default function VaeLens({ fingerprint = {}, halo = 'rgb(var(--ds-surface))' }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [hover, setHover] = useState(null)

  const feats = [...(fingerprint.signal_1_reconstruction_error?.shares ?? [])]
    .sort(inOrder('feature'))
  const dims = [...(fingerprint.signal_2_kl_divergence?.shares ?? [])]
    .sort(inOrder('dimension'))
  if (!feats.length || !dims.length) return null

  const density = new Map((fingerprint.signal_3_latent_density?.shares ?? [])
    .map((s) => [s.dimension, s.share ?? 0]))
  const max1 = Math.max(...feats.map((f) => f.share ?? 0), 1e-9)
  const max2 = Math.max(...dims.map((d) => d.share ?? 0), 1e-9)
  const max3 = Math.max(...density.values(), 1e-9)
  const v1 = (f) => (f.share ?? 0) / max1
  const v2 = (d) => (d.share ?? 0) / max2
  const v3 = (d) => (density.get(d.dimension) ?? 0) / max3

  const rows = Math.max(feats.length, dims.length)
  const rowH = rows > 10 ? 30 : 46
  const H = TOP + rows * rowH + 16
  const yAt = (i, n) => TOP + ((i + 0.5) * rows * rowH) / n
  const featH = (rows * rowH) / feats.length

  const topFeat = feats.reduce((a, b) => ((b.share ?? 0) > (a.share ?? 0) ? b : a))
  const topDim = dims.reduce((a, b) => ((b.share ?? 0) > (a.share ?? 0) ? b : a))
  const glow = `url(#vae-glow-${uid})`

  // Hovering a feature lights its row on both sides; hovering a dimension
  // lights the lines through it. Everything else steps back, it does not go.
  const onEnc = (i, k) => !hover || hover.f === i || hover.z === k
  const onDec = (k, j) => !hover || hover.f === j || hover.z === k

  const edge = (key, d, v, tone, on) => (
    <g key={key}>
      <path d={d} fill="none" strokeWidth={0.8 + 1.8 * v}
            stroke={`rgb(var(${tone}) / ${((0.05 + 0.55 * v) * (on ? 1 : 0.18)).toFixed(3)})`} />
      {on && v >= 0.35 && (
        <path d={d} fill="none" className="vae-flow" strokeWidth={1.4 + 1.6 * v}
              strokeDasharray="3 11" strokeLinecap="round"
              stroke={`rgb(var(${tone}) / ${(0.35 + 0.5 * v).toFixed(3)})`} />
      )}
    </g>
  )

  const head = (x, anchor, title, sub) => (
    <g>
      <text x={x} y={24} textAnchor={anchor} className="ds-mono" fontSize="11.5"
            letterSpacing="1.2" fill="rgb(var(--ds-faint))">{title}</text>
      <text x={x} y={41} textAnchor={anchor} fontSize="12"
            fill="rgb(var(--ds-muted))">{sub}</text>
    </g>
  )

  const hovered = hover?.f != null ? feats[hover.f] : hover?.z != null ? dims[hover.z] : null
  const caption = !hovered
    ? <>Strained most where it rebuilt <b>{strip(topFeat.feature)}</b> ({pct(topFeat.share)} of
        reconstruction error), and in latent <b>{topDim.dimension}</b> ({pct(topDim.share)} of KL).</>
    : hover.f != null
      ? <><b>{strip(hovered.feature)}</b>: saw {num(hovered.observed)}, expected{' '}
          {num(hovered.reconstructed)}. {pct(hovered.share)} of reconstruction error.</>
      : <><b>{hovered.dimension}</b>: {pct(hovered.share)} of KL divergence,{' '}
          {pct(density.get(hovered.dimension))} of latent density.</>

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
           style={{ display: 'block', maxWidth: 1080, margin: '0 auto' }}
           aria-label={`The payment through the VAE: ${feats.length} features in, `
             + `${dims.length} latent dimensions, ${feats.length} rebuilt. Most strain at `
             + `${strip(topFeat.feature)} and ${topDim.dimension}.`}>
        <style>{CSS}</style>
        <defs>
          <filter id={`vae-glow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {head(X_IN + 6, 'end', 'WHAT ARRIVED', `${feats.length} features`)}
        {head(X_Z, 'middle', 'LATENT SUMMARY', `${dims.length} dimensions`)}
        {head(X_OUT - 6, 'start', 'WHAT IT REBUILT', 'share of reconstruction error')}
        <text x={(X_IN + X_Z) / 2} y={60} textAnchor="middle" fontSize="11.5"
              fontStyle="italic" fill="rgb(var(--ds-faint))">encode</text>
        <text x={(X_Z + X_OUT) / 2} y={60} textAnchor="middle" fontSize="11.5"
              fontStyle="italic" fill="rgb(var(--ds-faint))">decode</text>

        {feats.flatMap((f, i) => dims.map((d, k) => edge(`e${i}-${k}`,
          curve(X_IN + 7, yAt(i, feats.length), X_Z - 14, yAt(k, dims.length)),
          v2(d), '--ds-signal', onEnc(i, k))))}
        {dims.flatMap((d, k) => feats.map((f, j) => edge(`d${k}-${j}`,
          curve(X_Z + 14, yAt(k, dims.length), X_OUT - 7, yAt(j, feats.length)),
          v1(f), '--ds-accent', onDec(k, j))))}

        {feats.map((f, i) => {
          const y = yAt(i, feats.length)
          return (
            <g key={`in-${f.feature}`} opacity={!hover || hover.f === i ? 1 : 0.35}
               style={{ transition: 'opacity .2s' }}
               onMouseEnter={() => setHover({ f: i })} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={y - featH / 2} width={X_IN + 12} height={featH} fill="transparent" />
              <text x={X_IN - 16} y={y - 2} textAnchor="end" fontSize="13"
                    fill="rgb(var(--ds-ink))">{strip(f.feature)}</text>
              <text x={X_IN - 16} y={y + 13} textAnchor="end" fontSize="11" className="ds-mono"
                    fill="rgb(var(--ds-faint))">saw {num(f.observed)}</text>
              <circle cx={X_IN} cy={y} r={6} fill="rgb(var(--ds-surface))"
                      stroke="rgb(var(--ds-muted))" strokeWidth="1.5" />
            </g>
          )
        })}

        {dims.map((d, k) => {
          const y = yAt(k, dims.length)
          const a = v2(d)
          const b = v3(d)
          const core = 6 + 10 * a
          return (
            <g key={d.dimension} opacity={!hover || hover.z === k ? 1 : 0.35}
               style={{ transition: 'opacity .2s' }}
               onMouseEnter={() => setHover({ z: k })} onMouseLeave={() => setHover(null)}>
              <circle cx={X_Z} cy={y} r={core + 5} fill="none" strokeWidth={1 + 2.5 * b}
                      stroke={`rgb(var(--ds-warn) / ${(0.12 + 0.88 * b).toFixed(3)})`} />
              <circle cx={X_Z} cy={y} r={core} filter={a >= 0.5 ? glow : undefined}
                      fill={`rgb(var(--ds-signal) / ${(0.14 + 0.86 * a).toFixed(3)})`} />
              {/* The halo masks the lines behind the label, so it reads over them. */}
              <text x={X_Z + 26} y={y + 4} fontSize="11.5" className="ds-mono"
                    stroke={halo} strokeWidth="6" strokeLinejoin="round"
                    style={{ paintOrder: 'stroke' }}
                    fill={a >= 0.15 ? 'rgb(var(--ds-ink))' : 'rgb(var(--ds-faint))'}>
                {d.dimension}{a >= 0.08 ? `  ${pct(d.share)}` : ''}
              </text>
            </g>
          )
        })}

        {feats.map((f, j) => {
          const y = yAt(j, feats.length)
          const a = v1(f)
          return (
            <g key={`out-${f.feature}`} opacity={!hover || hover.f === j ? 1 : 0.35}
               style={{ transition: 'opacity .2s' }}
               onMouseEnter={() => setHover({ f: j })} onMouseLeave={() => setHover(null)}>
              <rect x={X_OUT - 20} y={y - featH / 2} width={W - X_OUT + 20} height={featH}
                    fill="transparent" />
              <circle cx={X_OUT} cy={y} r={6 + 9 * a} filter={a >= 0.5 ? glow : undefined}
                      fill={`rgb(var(--ds-accent) / ${(0.14 + 0.86 * a).toFixed(3)})`} />
              <text x={X_OUT + 24} y={y - 2} fontSize="13" fill="rgb(var(--ds-ink))">
                {strip(f.feature)}
                <tspan dx="8" className="ds-mono" fontWeight={f === topFeat ? 700 : 400}
                       fill={a >= 0.5 ? 'rgb(var(--ds-accent-strong))' : 'rgb(var(--ds-muted))'}>
                  {pct(f.share)}
                </tspan>
              </text>
              <text x={X_OUT + 24} y={y + 13} fontSize="11" className="ds-mono"
                    fill="rgb(var(--ds-faint))">expected {num(f.reconstructed)}</text>
            </g>
          )
        })}
      </svg>

      <p className="text-[14px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))', minHeight: '3em' }}>
        {caption}
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]"
           style={{ color: 'rgb(var(--ds-faint))' }}>
        <span className="flex items-center gap-2">
          <span style={{ width: 10, height: 10, borderRadius: 99, background: 'rgb(var(--ds-accent))' }} />
          Rebuilt feature: share of reconstruction error (Signal 1)
        </span>
        <span className="flex items-center gap-2">
          <span style={{ width: 10, height: 10, borderRadius: 99, background: 'rgb(var(--ds-signal))' }} />
          Latent dimension: share of KL divergence (Signal 2)
        </span>
        <span className="flex items-center gap-2">
          <span style={{ width: 10, height: 10, borderRadius: 99, border: '2px solid rgb(var(--ds-warn))' }} />
          Ring: share of latent density (Signal 3)
        </span>
        <span>Brightness is each node's share. Learned weights are not drawn.</span>
      </div>
    </div>
  )
}
