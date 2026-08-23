function barColor(score) {
  if (score >= 0.8) return 'bg-red-500'
  if (score >= 0.65) return 'bg-orange-500'
  if (score >= 0.5) return 'bg-yellow-500'
  return 'bg-green-500'
}

export default function ModalityBar({ label, score, available, icon }) {
  const pct = Math.max(0, Math.min(1, score ?? 0)) * 100
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-slate-300 font-medium">
          <span className="text-base">{icon}</span>
          {label}
          {!available && (
            <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">unavailable</span>
          )}
        </span>
        <span className="font-mono text-slate-200 font-semibold">
          {score != null ? (score * 100).toFixed(1) + '%' : '—'}
        </span>
      </div>
      <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor(pct / 100)}`}
          style={{ width: available ? `${pct}%` : '0%' }}
        />
      </div>
    </div>
  )
}
