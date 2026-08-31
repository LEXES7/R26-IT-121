/**
 * The DeepSentinel bot.
 *
 * Drawn as SVG rather than shipped as an image: it has to hold up at any size,
 * inherit the theme, and blink — none of which a PNG does. The whole character
 * is a rounded head, a visor, two eyes and an antenna, because a face made of
 * few parts reads as friendly where a detailed one reads as uncanny.
 */
export default function SentinelBot({ size = 92, awake = false, className = '' }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}
         role="img" aria-label="DeepSentinel assistant">
      <defs>
        <linearGradient id="bot-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eafaf7" />
          <stop offset="1" stopColor="#a9d9d1" />
        </linearGradient>
        <linearGradient id="bot-visor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b3b35" />
          <stop offset="1" stopColor="#12655a" />
        </linearGradient>
        <radialGradient id="bot-glow">
          <stop offset="0" stopColor="rgb(45 212 191)" stopOpacity=".55" />
          <stop offset="1" stopColor="rgb(45 212 191)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="54" r="46" fill="url(#bot-glow)">
        <animate attributeName="r" values="42;48;42" dur="3.2s" repeatCount="indefinite" />
      </circle>

      {/* antenna — the only part that moves at rest, so he reads as awake */}
      <line x1="50" y1="20" x2="50" y2="10" stroke="#7fd8cb" strokeWidth="2.4"
            strokeLinecap="round" />
      <circle cx="50" cy="8" r="4" fill="rgb(45 212 191)">
        <animate attributeName="opacity" values="1;.35;1" dur="1.8s" repeatCount="indefinite" />
      </circle>

      <rect x="18" y="20" width="64" height="56" rx="20" fill="url(#bot-shell)" />
      <rect x="26" y="32" width="48" height="30" rx="14" fill="url(#bot-visor)" />

      {/* eyes. They blink; when he is talking they open wider. */}
      <g fill="rgb(94 231 213)">
        <ellipse cx="40" cy="47" rx={awake ? 5.4 : 4.6} ry={awake ? 6 : 5}>
          <animate attributeName="ry" values="5;5;0.6;5;5" dur="4.4s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx="60" cy="47" rx={awake ? 5.4 : 4.6} ry={awake ? 6 : 5}>
          <animate attributeName="ry" values="5;5;0.6;5;5" dur="4.4s" repeatCount="indefinite" />
        </ellipse>
      </g>

      {/* ears / sensors */}
      <rect x="12" y="40" width="6" height="16" rx="3" fill="#8fd0c6" />
      <rect x="82" y="40" width="6" height="16" rx="3" fill="#8fd0c6" />

      {/* shoulders, so he is not a floating head */}
      <path d="M24 78h52a14 14 0 0 1 14 14H10a14 14 0 0 1 14-14Z" fill="url(#bot-shell)"
            opacity=".95" />
    </svg>
  )
}
