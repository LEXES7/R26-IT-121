const STYLES = {
  CRITICAL: 'bg-red-900/60 border-red-500 text-red-300 glow-red',
  HIGH:     'bg-orange-900/60 border-orange-500 text-orange-300',
  MEDIUM:   'bg-yellow-900/60 border-yellow-500 text-yellow-300 glow-yellow',
  LOW:      'bg-green-900/60 border-green-500 text-green-300 glow-green',
}

const ICONS = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' }

export default function RiskBadge({ classification, large = false }) {
  const style = STYLES[classification] || STYLES.LOW
  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-full font-bold tracking-widest uppercase ${style} ${
        large ? 'px-5 py-2 text-base' : 'px-3 py-1 text-xs'
      }`}
    >
      <span>{ICONS[classification]}</span>
      {classification}
    </span>
  )
}
