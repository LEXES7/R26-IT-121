/**
 * Enough CSV for the files this platform produces.
 *
 * Header row, commas, optional double quotes. Not a general parser: no escaped
 * quotes, no embedded newlines, no separator detection. The files it reads are
 * written by the runner and by the dataset scripts in this repository, and a
 * general parser would be more code defending against inputs that do not
 * arrive here.
 */

/** Columns the detectors expect as numbers rather than strings. */
const NUMERIC = new Set([
  'step', 'amount', 'oldbalanceOrg', 'newbalanceOrig',
  'oldbalanceDest', 'newbalanceDest', 'isFraud', 'isFlaggedFraud',
])

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const head = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cells = []
    let cur = ''
    let quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    const row = {}
    head.forEach((h, i) => {
      const v = (cells[i] ?? '').trim()
      row[h] = NUMERIC.has(h) ? Number(v) : v
    })
    return row
  })
}

/** The reference a row calls itself by, or its position if it has none. */
export const refOf = (row, i) =>
  row.txn_ref ?? row.transaction_id ?? `row ${i + 1}`

/** 1, 0 or null — the file's own label, absent when it carries none. */
export const labelOf = (row) =>
  row.isFraud === 1 ? 1 : row.isFraud === 0 ? 0 : null
