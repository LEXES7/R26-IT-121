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

/* Write rows out as a CSV and hand it to the browser as a download.
 *
 * `columns` is a list of [header, (row) => value]. Values are quoted when they
 * hold a comma, quote or line break, so an account note or a reason with a
 * comma in it does not shift every column after it. Nothing is sent anywhere:
 * the file is built from what the page already has. */
export function downloadCsv(fileName, rows, columns) {
  const cell = (v) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'number' ? String(v) : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [columns.map(([h]) => cell(h)).join(',')]
  for (const r of rows) lines.push(columns.map(([, get]) => cell(get(r))).join(','))
  const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "graphsage_100.csv" → "graphsage_100-network-results.csv". */
export const resultsName = (source, part) =>
  `${String(source || 'results').replace(/\.csv$/i, '')}-${part}-results.csv`
