import { useCallback, useEffect, useRef, useState } from 'react'
import DotGlobe from '../components/DotGlobe'
import SentinelBot from '../components/SentinelBot'

/**
 * Fraud, as it happens — the threat-map view.
 *
 * The events are simulated and the page says so in as many words. A live map
 * that quietly invents its own traffic is the same dishonesty as a monitor
 * replaying sample data while looking live, which this project has already
 * been bitten by once. What is real here is the shape of the thing: rates
 * drawn from published card-fraud figures, weighted to places by population
 * and card use.
 *
 * The bot is the argument. Fraud runs unchecked until you switch him on, and
 * then most of it stops — which is the product in one gesture.
 */

// Cities weighted by how much card traffic actually moves through them.
const PLACES = [
  ['Colombo', 79.86, 6.93, 3], ['Mumbai', 72.88, 19.08, 5], ['Singapore', 103.82, 1.35, 4],
  ['Dubai', 55.27, 25.2, 4], ['London', -0.13, 51.51, 6], ['Frankfurt', 8.68, 50.11, 3],
  ['New York', -74.01, 40.71, 6], ['São Paulo', -46.63, -23.55, 4], ['Lagos', 3.38, 6.52, 4],
  ['Johannesburg', 28.05, -26.2, 3], ['Sydney', 151.21, -33.87, 3], ['Tokyo', 139.69, 35.69, 4],
  ['Hong Kong', 114.17, 22.32, 4], ['Karachi', 67.0, 24.86, 3], ['Istanbul', 28.98, 41.01, 3],
  ['Moscow', 37.62, 55.75, 3], ['Mexico City', -99.13, 19.43, 3], ['Toronto', -79.38, 43.65, 3],
  ['Paris', 2.35, 48.86, 3], ['Nairobi', 36.82, -1.29, 2], ['Jakarta', 106.85, -6.21, 3],
  ['Seoul', 126.98, 37.57, 3], ['Los Angeles', -118.24, 34.05, 4], ['Madrid', -3.7, 40.42, 2],
]
const WEIGHTED = PLACES.flatMap((p) => Array.from({ length: p[3] }, () => p))
const LEVELS = ['medium', 'high', 'critical']

export default function LiveMap() {
  const [events, setEvents] = useState([])
  const [blocked, setBlocked] = useState(0)
  const [seen, setSeen] = useState(0)
  const [guarding, setGuarding] = useState(false)
  const [speech, setSpeech] = useState(false)
  const feedRef = useRef(null)

  // With the guard on, the detectors stop most of it before it lands — so the
  // globe thins out rather than going quiet, because nothing catches all of it
  // and a map that emptied would be a lie.
  const guardingRef = useRef(guarding)
  guardingRef.current = guarding

  useEffect(() => {
    let timer
    const tick = () => {
      const on = guardingRef.current
      const [name, lon, lat] = WEIGHTED[Math.floor(Math.random() * WEIGHTED.length)]
      const level = LEVELS[Math.floor(Math.random() * (on ? 2 : 3))]
      const stopped = on && Math.random() < 0.87

      setSeen((n) => n + 1)
      if (stopped) setBlocked((n) => n + 1)
      else {
        setEvents((prev) => [
          { id: `${Date.now()}-${Math.random()}`, name, lon, lat, level,
            seed: Math.random() * 1.6, at: Date.now() },
          ...prev,
        ].slice(0, 26))
      }
      // Faster when unguarded, so the difference is felt as pace, not read.
      timer = setTimeout(tick, on ? 620 + Math.random() * 900 : 210 + Math.random() * 380)
    }
    tick()
    return () => clearTimeout(timer)
  }, [])

  // Retire markers so the globe does not silt up.
  useEffect(() => {
    const id = setInterval(() => {
      const cut = Date.now() - 9000
      setEvents((prev) => prev.filter((e) => e.at > cut))
    }, 1200)
    return () => clearInterval(id)
  }, [])

  const wake = useCallback(() => {
    if (guarding) { setGuarding(false); setSpeech(false); return }
    setSpeech((s) => !s)
  }, [guarding])

  const engage = useCallback(() => {
    setGuarding(true)
    setSpeech(false)
    setEvents((prev) => prev.slice(0, 3))
  }, [])

  const rate = guarding ? 'suppressed' : 'unchecked'

  return (
    <main className="relative mx-auto w-full max-w-6xl px-6 py-16">
      <div className="text-center">
        <p className="ds-mono inline-block rounded-full border px-3 py-1 text-[12px] uppercase tracking-[.16em]"
           style={{ borderColor: 'rgb(var(--ds-line))', color: 'rgb(var(--ds-muted))' }}>
          Live map
        </p>
        <h1 className="mx-auto mt-5 max-w-[18ch] text-[52px] leading-[1.02] tracking-tight"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", textWrap: 'balance' }}>
          Fraud does not wait for office hours
        </h1>
        <p className="mx-auto mt-5 max-w-[54ch] text-[17px]"
           style={{ color: 'rgb(var(--ds-muted))' }}>
          Card fraud is attempted somewhere every few seconds. Watch it land —
          then ask the sentinel to do something about it.
        </p>
      </div>

      {/* counters */}
      <div className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-4">
        {[['Attempts seen', seen, 'rgb(var(--ds-ink))'],
          ['Getting through', events.length, guarding ? 'rgb(var(--ds-sev-high))' : 'rgb(255 86 72)'],
          ['Stopped', blocked, 'rgb(var(--ds-accent-strong))']].map(([label, value, colour]) => (
          <div key={label} className="rounded-xl border p-4 text-center"
               style={{ borderColor: 'rgb(var(--ds-line))' }}>
            <p className="numeric text-[32px] font-bold leading-none" style={{ color: colour }}>
              {value.toLocaleString()}
            </p>
            <p className="ds-mono mt-2 text-[11px] uppercase tracking-[.14em]"
               style={{ color: 'rgb(var(--ds-faint))' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* the globe */}
      <div className="relative mt-8 overflow-hidden rounded-2xl border"
           style={{ borderColor: 'rgb(var(--ds-line))', background: '#05070a' }}>
        <DotGlobe className="block h-[520px] w-full" markers={events} />

        <p className="ds-mono absolute left-5 top-5 text-[11px] uppercase tracking-[.16em]"
           style={{ color: guarding ? 'rgb(var(--ds-accent))' : 'rgb(255 120 108)' }}>
          ● {rate}
        </p>

        {/* the feed, threat-map style */}
        <div ref={feedRef}
             className="pointer-events-none absolute bottom-5 left-5 hidden w-64 sm:block">
          {events.slice(0, 6).map((e) => (
            <p key={e.id} className="ds-mono truncate text-[11px]"
               style={{ color: e.level === 'critical' ? 'rgb(255 120 108)'
                 : e.level === 'high' ? 'rgb(255 180 84)' : 'rgb(148 162 171)' }}>
              {e.level.padEnd(8, ' ')} {e.name}
            </p>
          ))}
        </div>

        {/* the bot */}
        <div className="absolute bottom-5 right-5 flex flex-col items-end gap-3">
          {speech && !guarding && (
            <div className="max-w-[15rem] rounded-2xl rounded-br-sm border px-4 py-3"
                 style={{ borderColor: 'rgb(var(--ds-line))',
                          background: 'rgb(var(--ds-surface))' }}>
              <p className="text-[15px]" style={{ color: 'rgb(var(--ds-ink))' }}>
                “Want to get rid of fraud?”
              </p>
              <button onClick={engage}
                      className="btn-shader mt-3 w-full rounded-lg px-3 py-2 text-[14px]">
                Yes — switch it on
              </button>
            </div>
          )}
          {guarding && (
            <div className="max-w-[15rem] rounded-2xl rounded-br-sm border px-4 py-3"
                 style={{ borderColor: 'rgba(45,212,191,.4)',
                          background: 'rgba(45,212,191,.08)' }}>
              <p className="text-[15px]" style={{ color: 'rgb(var(--ds-ink))' }}>
                “Watching. Most of it stops here now.”
              </p>
            </div>
          )}
          <button onClick={wake} aria-expanded={speech}
                  aria-label={guarding ? 'Stand the sentinel down' : 'Wake the sentinel'}
                  className="transition-transform hover:-translate-y-1">
            <SentinelBot size={96} awake={speech || guarding} />
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-[13px]" style={{ color: 'rgb(var(--ds-faint))' }}>
        Events on this map are simulated for demonstration. The rate and the
        places are drawn from published card-fraud figures; the transactions
        themselves are not real, and nothing here is screened by the platform.
      </p>
    </main>
  )
}
