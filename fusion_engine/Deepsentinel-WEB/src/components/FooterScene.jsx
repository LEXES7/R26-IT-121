/**
 * Low-poly horizon for the footer.
 *
 * The reference this borrows from uses a papercraft landscape. A mountain range
 * would be decoration on a fraud platform, so the same low-poly language is
 * pointed at the actual subject: layered facets whose ridge lines are the
 * transaction graph, with account nodes sitting on the crests and a handful
 * flagged. It reads as scenery at a glance and as a network on a second look.
 *
 * Pure SVG with a fixed viewBox and `preserveAspectRatio="none"`, so it spans
 * any width without a raster asset or a layout shift.
 */
export default function FooterScene({ className = '' }) {
  return (
    <svg
      viewBox="0 0 1440 260"
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      {/* Back range — palest, furthest */}
      <g className="text-accent-600" opacity="0.18">
        <path fill="currentColor" d="M0 176 130 118l118 44 132-66 126 58 140-74 138 70 122-48 128 60 130-52 176 74v98H0Z" />
      </g>

      {/* Mid range */}
      <g className="text-accent-500" opacity="0.26">
        <path fill="currentColor" d="M0 208 96 160l142 40 118-52 150 62 118-40 146 54 128-62 140 56 132-34 170 52v88H0Z" />
      </g>

      {/* Front range — densest, carries the network */}
      <g className="text-accent-500" opacity="0.4">
        <path fill="currentColor" d="M0 236 120 200l130 26 128-38 138 44 132-30 140 38 130-42 136 40 128-26 158 34v54H0Z" />
      </g>

      {/* Facet seams: the ridge lines double as graph edges */}
      <g
        className="text-accent-400"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        opacity="0.35"
      >
        <path d="M0 176 130 118l118 44 132-66 126 58 140-74 138 70 122-48 128 60 130-52 176 74" />
        <path d="M130 118v90M380 96v112M646 80v128M906 102v106M1164 110v98" />
        <path d="M0 236 120 200l130 26 128-38 138 44 132-30 140 38 130-42 136 40 128-26 158 34" />
      </g>

      {/* Accounts on the crests — three flagged */}
      <g>
        {[
          [130, 118], [380, 96], [646, 80], [906, 102], [1164, 110],
          [248, 162], [506, 154], [768, 150], [1028, 148], [1294, 128],
        ].map(([cx, cy], i) => {
          const flagged = i === 2 || i === 6
          return (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r={flagged ? 4 : 2.6}
              className={flagged ? 'fill-risk-critical' : 'fill-accent-400'}
              opacity={flagged ? 0.9 : 0.55}
            />
          )
        })}
      </g>
    </svg>
  )
}
