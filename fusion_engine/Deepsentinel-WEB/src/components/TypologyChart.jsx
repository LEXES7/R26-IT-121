/**
 * How a file's flagged transactions split across the discovered typologies.
 *
 * Two views of the same counts, because they answer different questions. The
 * ring answers "how is this file made up" at a glance. The dots answer "how
 * many transactions is that, and were they actually fraud" — one mark per
 * transaction, filled when the file labels it fraud, so a group that is mostly
 * hollow is visibly a group of false alarms and no summary statistic has to be
 * trusted for it.
 *
 * The dots are grouped by typology and nothing more. Their positions inside a
 * group carry no meaning and are not a projection of the fingerprints — a
 * scatter that looked like a 2-D embedding without being one would be the kind
 * of picture that gets believed and is wrong.
 */

const PALETTE = [
  'var(--ds-accent)',
  'var(--ds-signal)',
  'var(--ds-warn)',
  'var(--ds-sev-high)',
  'var(--ds-accent-strong)',
]
const GREY = 'var(--ds-faint)'

const colourFor = (name, i) =>
  `rgb(${name === 'UNASSIGNED' ? GREY : PALETTE[i % PALETTE.length]})`

/** One arc of the ring, as an SVG path. */
function arc(cx, cy, r, w, from, to) {
  const p = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]
  const big = to - from > Math.PI ? 1 : 0
  const [x1, y1] = p(from, r)
  const [x2, y2] = p(to, r)
  const [x3, y3] = p(to, r - w)
  const [x4, y4] = p(from, r - w)
  return `M${x1} ${y1}A${r} ${r} 0 ${big} 1 ${x2} ${y2}`
       + `L${x3} ${y3}A${r - w} ${r - w} 0 ${big} 0 ${x4} ${y4}Z`
}

export default function TypologyChart({ groups, rows, labelled }) {
  const total = groups.reduce((n, g) => n + g.n, 0)
  if (!total) return null

  const R = 62
  const W = 20
  let angle = -Math.PI / 2          // start at twelve o'clock

  const arcs = groups.map((g, i) => {
    const from = angle
    // A hair short of a full turn when one group holds everything, or the arc
    // closes on itself and the browser draws nothing at all.
    const span = (g.n / total) * Math.PI * 2 * (groups.length === 1 ? 0.9999 : 1)
    angle += span
    return { ...g, d: arc(70, 70, R, W, from, from + span), fill: colourFor(g.name, i) }
  })

  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* the ring */}
      <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0"
           role="img" aria-label={`${total} flagged transactions across ${groups.length} typologies`}>
        {arcs.map((a) => (
          <path key={a.name} d={a.d} fill={a.fill} opacity="0.85">
            <title>{`${a.name} — ${a.n} of ${total}`}</title>
          </path>
        ))}
        <text x="70" y="66" textAnchor="middle" className="numeric"
              style={{ fontSize: 26, fill: 'rgb(var(--ds-ink))' }}>{total}</text>
        <text x="70" y="82" textAnchor="middle"
              style={{ fontSize: 9, fill: 'rgb(var(--ds-faint))', letterSpacing: '.08em' }}>
          FLAGGED
        </text>
      </svg>

      {/* legend and the per-transaction dots */}
      <div className="min-w-[240px] flex-1" style={{ display: 'grid', gap: 11 }}>
        {arcs.map((g) => {
          const members = rows.filter(
            (r) => (r.typology ?? 'UNASSIGNED') === g.name && r.flagged)
          return (
            <div key={g.name} style={{ display: 'grid', gap: 4 }}>
              <div className="flex items-baseline gap-2">
                <span className="mt-[1px] h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ background: g.fill }} />
                <span className="ds-mono text-[13px]"
                      style={{ color: 'rgb(var(--ds-ink))' }}>{g.name}</span>
                <span className="numeric ml-auto text-[12px]"
                      style={{ color: 'rgb(var(--ds-muted))' }}>
                  {g.n}
                  {labelled ? ` · ${g.fraud} fraud` : ''}
                  {g.purity != null ? ` · purity ${Math.round(g.purity * 100)}%` : ''}
                </span>
              </div>

              {/* One mark per flagged transaction in this group. */}
              <div className="flex flex-wrap gap-[3px] pl-[18px]">
                {members.map((m, i) => (
                  <span
                    key={`${m.ref}-${i}`}
                    title={`${m.ref}${m.label === 1 ? ' · labelled fraud'
                      : m.label === 0 ? ' · labelled clean' : ''}`}
                    className="h-[9px] w-[9px] rounded-full"
                    style={{
                      background: m.label === 1 ? g.fill : 'transparent',
                      border: `1.5px solid ${g.fill}`,
                      opacity: m.label === 1 ? 1 : 0.55,
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {labelled > 0 && (
          <p className="text-[11px]" style={{ color: 'rgb(var(--ds-faint))' }}>
            Filled marks are transactions the file labels as fraud; hollow ones it
            labels clean. Positions within a group mean nothing.
          </p>
        )}
      </div>
    </div>
  )
}
