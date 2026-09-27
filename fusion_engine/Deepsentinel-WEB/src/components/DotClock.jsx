import { useEffect, useState } from 'react'

/**
 * A dot-matrix clock, for screens that are watched rather than read.
 *
 * The System and Live monitor pages are left open on a wall or a second
 * display, and the one thing missing from a screenshot of an alert is when it
 * happened. A clock in the chrome answers that without anyone reasoning about
 * their machine's clock being the same as the server's.
 *
 * Drawn from a 5x7 column-bitmap font rather than set in a typeface: a real
 * seven-segment or dot-matrix face would be a webfont to load for eleven
 * glyphs, and this way the dots are actual dots that inherit the theme.
 *
 * It ticks on the minute, not the second — a per-second re-render in the shell
 * of every console page is a lot of work to show a digit nobody is reading.
 */

const GLYPHS = {
  ' ': [0, 0, 0, 0, 0],
  '0': [62, 81, 73, 69, 62],
  '1': [0, 66, 127, 64, 0],
  '2': [66, 97, 81, 73, 70],
  '3': [33, 65, 69, 75, 49],
  '4': [24, 20, 18, 127, 16],
  '5': [39, 69, 69, 69, 57],
  '6': [60, 74, 73, 73, 48],
  '7': [1, 113, 9, 5, 3],
  '8': [54, 73, 73, 73, 54],
  '9': [6, 73, 73, 41, 30],
  ':': [0, 0, 54, 0, 0],
  'A': [126, 17, 17, 17, 126],
  'B': [127, 73, 73, 73, 54],
  'C': [62, 65, 65, 65, 34],
  'D': [127, 65, 65, 34, 28],
  'E': [127, 73, 73, 73, 65],
  'F': [127, 9, 9, 9, 1],
  'G': [62, 65, 73, 73, 122],
  'H': [127, 8, 8, 8, 127],
  'I': [0, 65, 127, 65, 0],
  'J': [32, 64, 65, 63, 1],
  'K': [127, 8, 20, 34, 65],
  'L': [127, 64, 64, 64, 64],
  'M': [127, 2, 12, 2, 127],
  'N': [127, 4, 8, 16, 127],
  'O': [62, 65, 65, 65, 62],
  'P': [127, 9, 9, 9, 6],
  'Q': [62, 65, 81, 33, 94],
  'R': [127, 9, 25, 41, 70],
  'S': [70, 73, 73, 73, 49],
  'T': [1, 1, 127, 1, 1],
  'U': [63, 64, 64, 64, 63],
  'V': [31, 32, 64, 32, 31],
  'W': [63, 64, 56, 64, 63],
  'X': [99, 20, 8, 20, 99],
  'Y': [7, 8, 112, 8, 7],
  'Z': [97, 81, 73, 69, 67],
  '|': [0, 0, 127, 0, 0],
}

function Row({ text, pitch, radius, colour, accentUpTo = 0, accent }) {
  const cells = []
  text.split('').forEach((ch, i) => {
    const cols = GLYPHS[ch] ?? GLYPHS[' ']
    cols.forEach((bits, cx) => {
      for (let cy = 0; cy < 7; cy += 1) {
        if (!((bits >> cy) & 1)) continue
        cells.push(
          <circle key={`${i}-${cx}-${cy}`}
                  cx={(i * 6 + cx) * pitch + radius}
                  cy={cy * pitch + radius}
                  r={radius}
                  fill={i < accentUpTo ? accent : colour} />,
        )
      }
    })
  })
  const w = (text.length * 6 - 1) * pitch + radius * 2
  const h = 6 * pitch + radius * 2
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>{cells}</svg>
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export default function DotClock({ className = '' }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Line the first tick up with the top of the minute, then tick every 60s —
    // otherwise the display can sit up to a minute behind the real time.
    let interval
    const start = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 60_000)
    }, (60 - new Date().getSeconds()) * 1000)
    return () => { clearTimeout(start); clearInterval(interval) }
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const date = `${String(now.getDate()).padStart(2, '0')} ${MONTHS[now.getMonth()]} `
    + `${now.getFullYear()} | ${DAYS[now.getDay()]}`

  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}
         title={now.toLocaleString()}>
      {/* Hours carry the accent, minutes stay neutral — the same split the
          reference uses, and it makes the hour readable at a glance. */}
      <Row text={`${hh}:${mm}`} pitch={2.4} radius={1.05}
           colour="rgb(var(--ds-ink))"
           accent="rgb(var(--ds-accent))" accentUpTo={2} />
      <Row text={date} pitch={1.35} radius={0.58}
           colour="rgb(var(--ds-faint))" />
    </div>
  )
}
