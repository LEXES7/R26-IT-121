/**
 * Scored rows against their labels.
 *
 * A demonstration that only shows what a model said proves nothing — the
 * panel has no way to tell a good answer from a confident wrong one. If the
 * uploaded file carries a truth column, the same rows can be marked right or
 * wrong and counted, which turns "watch it score" into "watch it be checked".
 *
 * It appears only when a label column is present. Inventing one, or assuming
 * every unlabelled row is legitimate, would manufacture an accuracy figure out
 * of nothing — which is worse than showing none.
 */
export function readLabel(row) {
  for (const k of ['isFraud', 'is_fraud', 'label', 'label_is_fraud', 'fraud']) {
    const v = row?.[k]
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'boolean') return v
    const s = String(v).trim().toLowerCase()
    if (['1', 'true', 'yes', 'fraud', 'y'].includes(s)) return true
    if (['0', 'false', 'no', 'clean', 'legitimate', 'n'].includes(s)) return false
  }
  return null
}

export default function Validation({ rows, threshold = 0.39, scoreOf, labelOf }) {
  const judged = rows
    .map((r) => ({ label: labelOf ? labelOf(r) : readLabel(r), score: scoreOf(r) }))
    .filter((x) => x.label !== null && x.score != null)

  if (judged.length === 0) return null

  const tp = judged.filter((x) => x.label && x.score >= threshold).length
  const fp = judged.filter((x) => !x.label && x.score >= threshold).length
  const fn = judged.filter((x) => x.label && x.score < threshold).length
  const tn = judged.filter((x) => !x.label && x.score < threshold).length
  const precision = tp + fp ? tp / (tp + fp) : null
  const recall = tp + fn ? tp / (tp + fn) : null
  const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : null
  const right = tp + tn

  const cell = (label, value, note, tone) => (
    <div key={label} className="min-w-0">
      <p className="ds-mono text-[11px] uppercase tracking-[.13em]"
         style={{ color: 'rgb(var(--ds-faint))' }}>{label}</p>
      <p className="numeric mt-1 text-[24px] leading-none"
         style={{ color: tone ?? 'rgb(var(--ds-ink))' }}>{value}</p>
      <p className="mt-1 text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>{note}</p>
    </div>
  )

  return (
    <div className="mt-4 rounded-xl border p-4"
         style={{ borderColor: 'rgba(45,212,191,.35)',
                  background: 'rgba(45,212,191,.05)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[16px] font-semibold">Checked against the file’s own labels</p>
        <span className="ds-mono text-[13px]" style={{ color: 'rgb(var(--ds-faint))' }}>
          {judged.length} of {rows.length} rows labelled · flagging at {threshold}
        </span>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cell('Correct', `${right} / ${judged.length}`,
          `${((right / judged.length) * 100).toFixed(1)}% of labelled rows`)}
        {cell('Precision', precision != null ? precision.toFixed(3) : '—',
          'of what it flagged, this share were fraud',
          precision === 1 ? 'rgb(var(--ds-accent-strong))' : undefined)}
        {cell('Recall', recall != null ? recall.toFixed(3) : '—',
          'of the fraud present, this share were caught')}
        {cell('F1', f1 != null ? f1.toFixed(3) : '—', 'the balance of the two')}
      </div>

      <p className="ds-mono mt-4 text-[13px]" style={{ color: 'rgb(var(--ds-faint))' }}>
        caught {tp} · missed {fn} · false alarms {fp} · correctly cleared {tn}
      </p>

      {fn > 0 && (
        <p className="mt-2 text-[13px]" style={{ color: 'rgb(var(--ds-sev-high))' }}>
          {fn} fraudulent {fn === 1 ? 'row' : 'rows'} scored below the line and would
          not have raised an alert.
        </p>
      )}
    </div>
  )
}
