import { useCallback, useEffect, useRef, useState } from 'react'
import DotGlobe from '../components/DotGlobe'
import SentinelBot from '../components/SentinelBot'
import { Eyebrow } from '../components/Editorial'
import { PHOTOS } from '../data/photos'

/**
 * Fraud, as it happens: the threat-map view.
 *
 * The events are simulated and the page says so, in the panel, in the sign
 * and under the map. A live map that quietly invents its own traffic is the
 * same dishonesty as a monitor replaying sample data while looking live, which
 * this project has already been bitten by once. What is real here is the
 * shape of the thing: rates drawn from published card-fraud figures, weighted
 * to places by population and card use.
 *
 * The bot is the argument. Fraud runs unchecked until you switch him on, and
 * then most of it stops, which is the product in one gesture.
 *
 * The map sits in a dark frame on both themes, over a photograph of the Earth
 * at night, so everything drawn inside it uses fixed dark-ground colours.
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

// Fixed colours: the frame is dark on both themes.
const LEVEL_STYLE = {
  critical: { color: '#FCA5A5', background: 'rgb(239 68 68 / 0.16)', borderColor: 'rgb(239 68 68 / 0.4)' },
  high: { color: '#FDBA74', background: 'rgb(249 115 22 / 0.14)', borderColor: 'rgb(249 115 22 / 0.38)' },
  medium: { color: '#C4B5FD', background: 'rgb(179 166 245 / 0.14)', borderColor: 'rgb(179 166 245 / 0.36)' },
}
const night = {
  background: 'rgb(13 12 11 / 0.6)',
  border: '1px solid rgb(255 255 255 / 0.12)',
  boxShadow: '0 20px 44px -26px rgb(0 0 0 / 0.8)',
  backdropFilter: 'blur(20px) saturate(160%)',
  WebkitBackdropFilter: 'blur(20px) saturate(160%)',
}
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function LiveMap() {
  const [events, setEvents] = useState([])
  const [blocked, setBlocked] = useState(0)
  const [seen, setSeen] = useState(0)
  const [guarding, setGuarding] = useState(false)
  const [speech, setSpeech] = useState(false)

  // With the guard on, the detectors stop most of it before it lands, so the
  // globe thins out rather than going quiet: nothing catches all of it, and a
  // map that emptied would be a lie.
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

  const sign = events.slice(0, 5)

  return (
    <div className="overflow-x-clip pb-8">
      <section className="px-3 pt-5 sm:px-6">
        <div className="relative mx-auto min-h-[46rem] max-w-[96rem] overflow-hidden rounded-[32px] border border-white/10 bg-[#050505]">
          <img src={PHOTOS.earthNight.src} alt="" aria-hidden
               className="absolute inset-0 h-full w-full object-cover"
               style={{ filter: 'saturate(0.85) brightness(0.55)' }} />
          <div aria-hidden className="absolute inset-0"
               style={{ background: 'linear-gradient(180deg, rgb(5 5 5 / 0.55) 0%, rgb(5 5 5 / 0.1) 40%, rgb(5 5 5 / 0.75) 100%)' }} />

          {/* The globe itself, drawn over the photograph. */}
          <DotGlobe className="absolute inset-x-0 top-10 mx-auto block h-[40rem] w-full max-w-[60rem]" markers={events} />

          <div className="relative flex min-h-[46rem] flex-col gap-4 p-4 sm:p-7 lg:flex-row lg:items-start lg:justify-between">
            <div className="w-full max-w-[27rem] rounded-[24px] p-7 text-[#F0EDE7]" style={night}>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs text-[#D6D1C9]">
                <span className="h-2 w-2 rounded-full" style={{ background: guarding ? '#2DD4BF' : '#FF6B5C' }} />
                Simulated feed · {guarding ? 'sentinel on' : 'unchecked'}
              </span>
              <h1 className="display mt-5 text-[3.25rem] leading-[0.95] text-[#FBFAF7] sm:text-[4rem]">
                Fraud does not wait <span className="display-italic text-[#2DD4BF]">for office hours.</span>
              </h1>
              <p className="mt-4 text-[15px] leading-relaxed text-[#A39C92]">
                Card fraud is tried every few seconds. Watch it land, then switch on
                the sentinel.
              </p>
              <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
                {[['Attempts seen', seen, '#FBFAF7'],
                  ['Getting through', events.length, guarding ? '#FDBA74' : '#FCA5A5'],
                  ['Stopped', blocked, '#2DD4BF']].map(([label, value, colour]) => (
                  <div key={label}>
                    <dd className="numeric text-[1.6rem] leading-none" style={{ color: colour }}>{value.toLocaleString()}</dd>
                    <dt className="mt-2 text-[11px] text-[#857E75]">{label}</dt>
                  </div>
                ))}
              </dl>
            </div>

            <aside aria-label="Latest events" className="hidden w-[22rem] rounded-[24px] p-5 text-[#F0EDE7] lg:block" style={night}>
              <div className="flex items-center justify-between pb-2">
                <p className="eyebrow text-[#A39C92]">Latest</p>
                <span className="numeric text-[11px] text-[#857E75]">newest first</span>
              </div>
              {events.length === 0 && (
                <p className="py-6 text-sm text-[#857E75]">Nothing getting through right now.</p>
              )}
              {events.slice(0, 7).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 border-t border-white/[0.08] py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-[#FBFAF7]">{e.name}</span>
                    <span className="numeric text-[11px] text-[#857E75]">{clock(e.at)}</span>
                  </span>
                  <span className="rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
                        style={LEVEL_STYLE[e.level]}>
                    {e.level}
                  </span>
                </div>
              ))}
            </aside>
          </div>

          {/* the bot */}
          <div className="absolute bottom-24 right-5 flex flex-col items-end gap-3 sm:right-8">
            {speech && !guarding && (
              <div className="max-w-[15rem] rounded-2xl rounded-br-sm px-4 py-3" style={night}>
                <p className="text-[15px] text-[#F0EDE7]">&ldquo;Want to get rid of fraud?&rdquo;</p>
                <button onClick={engage}
                        className="mt-3 w-full rounded-lg bg-[#0F9B8E] px-3 py-2 text-[14px] font-semibold text-white">
                  Yes, switch it on
                </button>
              </div>
            )}
            {guarding && (
              <div className="max-w-[15rem] rounded-2xl rounded-br-sm border border-[#2DD4BF]/40 bg-[#2DD4BF]/10 px-4 py-3">
                <p className="text-[15px] text-[#F0EDE7]">&ldquo;Watching. Most of it stops here now.&rdquo;</p>
              </div>
            )}
            <button onClick={wake} aria-expanded={speech}
                    aria-label={guarding ? 'Stand the sentinel down' : 'Wake the sentinel'}
                    className="transition-transform hover:-translate-y-1">
              <SentinelBot size={96} awake={speech || guarding} />
            </button>
          </div>

          {/* The sign along the bottom: the latest events, as a dot-matrix board. */}
          <div aria-hidden className="absolute inset-x-0 bottom-0 overflow-hidden border-t border-white/10 bg-[#080807]/80">
            <div className="absolute inset-0"
                 style={{ backgroundImage: 'radial-gradient(rgb(45 212 191 / 0.1) 1.1px, transparent 1.4px)', backgroundSize: '7px 7px' }} />
            <div className="ticker-window relative">
              <div className="ticker-track">
                {[0, 1].map((copy) => (
                  <span key={copy} className="ticker-run" style={{ fontSize: '1.75rem' }}>
                    <span>Simulated feed</span>
                    {sign.length === 0 && <span>Waiting for the next attempt</span>}
                    {sign.map((e) => (
                      <span key={e.id} className={e.level === 'critical' ? 'ticker-alert' : undefined}>
                        {e.level} {e.name}
                      </span>
                    ))}
                    <span>{guarding ? 'Sentinel on' : 'Unchecked'}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow>How to read it</Eyebrow>
            <h2 className="display mt-4 text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.5rem]">
              What the map <span className="display-italic text-accent-400">is showing you.</span>
            </h2>
          </div>
          <p className="max-w-md text-base leading-relaxed text-slate-400">
            The rate and the places are real in shape; the transactions are not.
            The screening itself happens in the console, on your own traffic.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ['A light is an attempt', 'A simulated fraud attempt in a city.'],
            ['Red is critical', 'The worst attempts glow red.'],
            ['The sentinel stops them', 'Switch it on and most attempts are blocked.'],
          ].map(([title, body]) => (
            <article key={title} className="glass solid-card rounded-[24px] p-6">
              <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
            </article>
          ))}
        </div>
        <p className="mt-8 text-[13px] leading-relaxed text-slate-500">
          This map is a simulation. The rates follow published figures, but the
          payments are not real.
        </p>
      </section>
    </div>
  )
}
