function scoreColor(score) {
  if (score >= 0.8) return { stroke: '#ef4444', text: 'text-red-400', bg: 'bg-red-500' }
  if (score >= 0.65) return { stroke: '#f97316', text: 'text-orange-400', bg: 'bg-orange-500' }
  if (score >= 0.5) return { stroke: '#eab308', text: 'text-yellow-400', bg: 'bg-yellow-500' }
  return { stroke: '#22c55e', text: 'text-green-400', bg: 'bg-green-500' }
}

export default function ScoreGauge({ score, label, sublabel, size = 120 }) {
  const pct = Math.max(0, Math.min(1, score ?? 0))
  const r = 42
  const cx = 60
  const cy = 60
  const circ = 2 * Math.PI * r
  const dashOffset = circ * (1 - pct)
  const { stroke, text } = scoreColor(pct)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 120 120">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeDasharray={circ}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xl font-bold font-mono ${text}`}>
            {score != null ? (score * 100).toFixed(0) : '—'}
          </span>
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-300">{label}</p>
      {sublabel && <p className="text-xs text-slate-500">{sublabel}</p>}
    </div>
  )
}
