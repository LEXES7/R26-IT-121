import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCatalogue } from '../services/api'

/**
 * The public price list.
 *
 * Every plan and feature line comes from the backend, which builds them out of
 * the same tables the licence gate enforces — a pricing page maintained by hand
 * drifts from what the software actually unlocks, and then the site is selling
 * something the product will refuse to do.
 *
 * Each tier shows only what it *adds*. Listing Professional's seven features
 * again under Enterprise made the third card a wall of ticks that nobody reads
 * and buried the three things Enterprise is actually for.
 *
 * The track is a scroll-snap carousel rather than a JS slider: on a wide screen
 * all three cards fit and there is nothing to slide, and on a narrow one the
 * browser's own touch scrolling is better than anything reimplemented here.
 * The arrows and dots drive scrollTo, so keyboard, trackpad and touch all work
 * without three separate code paths.
 */
export default function Pricing() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [active, setActive] = useState(0)
  const trackRef = useRef(null)

  useEffect(() => {
    getCatalogue().then(setData)
      .catch(() => setError('The price list could not be loaded.'))
  }, [])

  // Which card is centred, read from scroll position rather than tracked
  // separately — a swipe and an arrow press then agree by construction.
  const onScroll = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const cards = [...el.children]
    const mid = el.scrollLeft + el.clientWidth / 2
    let best = 0
    let dist = Infinity
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid)
      if (d < dist) { dist = d; best = i }
    })
    setActive(best)
  }, [])

  const go = useCallback((i) => {
    const el = trackRef.current
    const card = el?.children?.[i]
    if (!el || !card) return
    el.scrollTo({
      left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto' : 'smooth',
    })
  }, [])

  const plans = data?.plans ?? []

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-20">
      <style>{`
        @keyframes ds-rise { from { opacity: 0; translate: 0 18px }
                             to   { opacity: 1; translate: 0 0 } }
        .ds-rise { animation: ds-rise .6s cubic-bezier(.22,.7,.3,1) both }
        .ds-card { transition: transform .35s cubic-bezier(.22,.7,.3,1),
                               border-color .35s ease, box-shadow .35s ease }
        .ds-card:hover { transform: translateY(-6px) }
        .ds-track { scrollbar-width: none; -ms-overflow-style: none }
        .ds-track::-webkit-scrollbar { display: none }
        @media (prefers-reduced-motion: reduce) {
          .ds-rise { animation: none; opacity: 1; translate: none }
          .ds-card, .ds-card:hover { transition: none; transform: none }
        }
      `}</style>

      <div className="ds-rise text-center">
        <p className="ds-mono mx-auto inline-block rounded-full border px-3 py-1 text-[12px] uppercase tracking-[.16em]"
           style={{ borderColor: 'rgb(var(--ds-line))', color: 'rgb(var(--ds-muted))' }}>
          Pricing
        </p>
        <h1 className="mx-auto mt-5 max-w-[16ch] text-[52px] leading-[1.02] tracking-tight"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", textWrap: 'balance' }}>
          Detection is never the thing you pay for
        </h1>
        <p className="mx-auto mt-5 max-w-[54ch] text-[17px]"
           style={{ color: 'rgb(var(--ds-muted))' }}>
          Every plan screens every transaction through all three detectors. The
          plans differ on how much the product helps you understand a result and
          answer for it afterwards.
        </p>
      </div>

      {error && (
        <p className="mt-10 text-[15px]" style={{ color: 'rgb(var(--ds-sev-critical))' }}>
          {error}
        </p>
      )}

      {data && (
        <>
          <section className="ds-rise mt-10 rounded-xl border p-5"
                   style={{ borderColor: 'rgba(45,212,191,.35)',
                            background: 'rgba(45,212,191,.05)',
                            animationDelay: '.08s' }}>
            <p className="text-[15px] font-semibold">Included on every plan, always</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.never_gated.map((f) => (
                <li key={f} className="flex gap-2 text-[15px]"
                    style={{ color: 'rgb(var(--ds-muted))' }}>
                  <span style={{ color: 'rgb(var(--ds-accent))' }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </section>

          <div
            ref={trackRef}
            onScroll={onScroll}
            className="ds-track mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2"
          >
            {plans.map((p, i) => {
              // Only what this tier adds over the one before it.
              const prev = new Set((plans[i - 1]?.features ?? []).map((f) => f.key))
              const own = p.features.filter((f) => !f.always_included && !prev.has(f.key))
              const rows = i === 0
                ? p.features.filter((f) => f.always_included).map((f) => f.label)
                : [`Everything in ${plans[i - 1].name}`, ...own.map((f) => f.label)]
              const mid = p.id === 'professional'

              // The featured card is filled rather than outlined, so every
              // colour on it has to come from the fill, not the page.
              const ink = mid ? 'rgb(232 240 242)' : 'rgb(var(--ds-ink))'
              const soft = mid ? 'rgb(232 240 242 / .74)' : 'rgb(var(--ds-muted))'
              const line = mid ? 'rgb(255 255 255 / .12)' : 'rgb(var(--ds-line))'

              return (
                <section
                  key={p.id}
                  className="ds-card ds-rise flex w-[86%] shrink-0 snap-center flex-col
                             rounded-2xl border p-7 sm:w-[58%] lg:w-[calc((100%-2.5rem)/3)]"
                  style={{
                    borderColor: mid ? 'rgb(45 212 191 / .45)' : 'rgb(var(--ds-line))',
                    background: mid
                      ? 'linear-gradient(180deg, rgb(16 96 86), rgb(10 62 56))'
                      : 'rgb(var(--ds-surface))',
                    color: ink,
                    boxShadow: mid ? '0 26px 64px -28px rgb(45 212 191 / .40)' : 'none',
                    animationDelay: `${0.14 + i * 0.09}s`,
                  }}
                >
                  {mid && (
                    <p className="ds-mono mx-auto rounded-full px-3 py-1 text-[11px] uppercase tracking-[.14em]"
                       style={{ background: 'rgb(45 212 191 / .16)',
                                color: 'rgb(var(--ds-accent-strong))' }}>
                      Most chosen
                    </p>
                  )}

                  {/* The number, at the size the decision deserves. */}
                  <p className="mt-7 text-center">
                    <span className="text-[52px] font-bold leading-none tracking-tight"
                          style={mid ? { color: 'rgb(var(--ds-accent-strong))' } : undefined}>
                      {p.price}
                    </span>
                  </p>
                  <p className="mt-2 text-center text-[13px]" style={{ color: soft }}>
                    {p.unit}
                  </p>

                  <div className="mx-auto mt-4 h-px w-10" style={{ background: line }} />
                  <p className="ds-mono mt-3 text-center text-[12px] uppercase tracking-[.18em]"
                     style={{ color: soft }}>
                    {p.name}
                  </p>

                  <p className="mt-7 text-[15px] font-semibold">Includes</p>
                  {/* Divided rows rather than a tick per line: at seven items a
                      column of ticks is texture, and the rule already says
                      "these are separate things". */}
                  <ul className="mt-2 flex-1">
                    {rows.map((label, r) => (
                      <li key={label}
                          className="py-3 text-[15px]"
                          style={{
                            color: r === 0 && i > 0 ? ink : soft,
                            fontWeight: r === 0 && i > 0 ? 600 : 400,
                            borderTop: r === 0 ? 'none' : `1px solid ${line}`,
                          }}>
                        {label}
                      </li>
                    ))}
                  </ul>

                  <p className="mt-6 text-center text-[13px] leading-relaxed"
                     style={{ color: soft }}>
                    {p.who}
                  </p>

                  <Link to="/request-access"
                        className="btn-shader mt-5 block w-full rounded-lg px-4 py-3 text-center text-[15px]">
                    {p.id === 'enterprise' ? 'Talk to us' : 'Request access'}
                  </Link>
                  <p className="mt-3 text-center text-[12px]" style={{ color: soft }}>
                    {p.overage}
                  </p>
                </section>
              )
            })}
          </div>

          {/* Controls. Hidden where all three already fit. */}
          <div className="mt-5 flex items-center justify-center gap-4 lg:hidden">
            <button onClick={() => go(Math.max(0, active - 1))} aria-label="Previous plan"
                    disabled={active === 0}
                    className="rounded-full border px-3 py-1 text-[16px] disabled:opacity-35"
                    style={{ borderColor: 'rgb(var(--ds-line))' }}>‹</button>
            <div className="flex gap-2">
              {plans.map((p, i) => (
                <button key={p.id} onClick={() => go(i)}
                        aria-label={`Show ${p.name}`}
                        aria-current={i === active}
                        style={{
                          width: i === active ? 22 : 8, height: 8, borderRadius: 99,
                          background: i === active ? 'rgb(var(--ds-accent))'
                            : 'rgb(var(--ds-line))',
                          transition: 'width .3s ease, background .3s ease',
                        }} />
              ))}
            </div>
            <button onClick={() => go(Math.min(plans.length - 1, active + 1))}
                    aria-label="Next plan" disabled={active === plans.length - 1}
                    className="rounded-full border px-3 py-1 text-[16px] disabled:opacity-35"
                    style={{ borderColor: 'rgb(var(--ds-line))' }}>›</button>
          </div>

          <p className="mt-8 text-[14px]" style={{ color: 'rgb(var(--ds-faint))' }}>
            {data.note} Plans are activated by an administrator; there is no card
            payment in this deployment.
          </p>
        </>
      )}
    </main>
  )
}
