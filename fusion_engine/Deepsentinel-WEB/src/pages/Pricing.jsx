import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eyebrow } from '../components/Editorial'
import Reveal from '../components/Reveal'
import { cx } from '../components/ui'
import { PHOTOS } from '../data/photos'
import { getCatalogue } from '../services/api'

/**
 * The public price list.
 *
 * Every plan, price and feature line comes from the backend, which builds them
 * out of the same tables the licence gate enforces. A pricing page maintained
 * by hand drifts from what the software actually unlocks, and then the site is
 * selling something the product will refuse to do. The comparison table at the
 * foot is built from that same list, so it cannot disagree with the cards.
 *
 * Each card shows only what its tier *adds*. Listing Professional's features
 * again under Enterprise made the third card a wall of ticks that nobody reads
 * and buried the three things Enterprise is actually for.
 */

function Check({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('h-[18px] w-[18px] shrink-0 text-accent-400', className)}
         fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
         strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/** "From $25,000" → a small "From" before the figure. */
function Price({ value }) {
  const from = value.startsWith('From ')
  return (
    <span className="display text-[4.25rem] leading-none text-slate-100">
      {from && <span className="mr-2 text-[1.75rem] text-slate-500">From</span>}
      {from ? value.slice(5) : value}
    </span>
  )
}

export default function Pricing() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getCatalogue().then(setData)
      .catch(() => setError('The price list could not be loaded.'))
  }, [])

  const plans = useMemo(() => data?.plans ?? [], [data])

  // Every feature any plan carries, in the order the plans list them: the
  // comparison's rows.
  const rows = useMemo(() => {
    const seen = new Map()
    plans.forEach((p) => p.features.forEach((f) => { if (!seen.has(f.key)) seen.set(f.key, f) }))
    return [...seen.values()]
  }, [plans])

  return (
    <div className="overflow-x-clip pb-8">

      {/* ── the claim ──────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[88rem] px-5 pb-14 pt-16 text-center sm:px-8 lg:pt-24">
        <div aria-hidden className="pointer-events-none absolute -top-96 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full blur-[120px]"
             style={{ background: 'rgb(var(--accent-500) / 0.14)' }} />
        <Reveal className="relative flex flex-col items-center gap-6">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="display text-[3.25rem] leading-[0.92] text-slate-100 sm:text-[5rem] xl:text-[6.5rem]">
            Detection is never
            <br />
            <span className="display-italic text-accent-400">the thing you pay for.</span>
          </h1>
          <p className="max-w-[40rem] text-lg leading-relaxed text-slate-400">
            Every plan screens every transaction through all three detectors,
            fuses them, and alerts your team. What the plans differ on is how much
            the product helps you understand a result and answer for it.
          </p>
        </Reveal>
      </section>

      {error && (
        <p className="mx-auto max-w-[88rem] px-5 pb-10 text-center text-[15px] text-risk-critical sm:px-8">{error}</p>
      )}
      {!data && !error && (
        <p className="mx-auto max-w-[88rem] px-5 pb-10 text-center text-[15px] text-slate-500 sm:px-8">
          Loading the price list…
        </p>
      )}

      {data && (
        <>
          {/* ── never gated ────────────────────────────────────────────── */}
          <section className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-center gap-2.5 px-5 pb-14 sm:px-8">
            <span className="eyebrow mr-1.5 text-slate-500">In every plan</span>
            {data.never_gated.map((f) => (
              <span key={f} className="rounded-full border border-subtle bg-surface-overlay px-3.5 py-1.5 text-[13px] text-slate-300">
                {f}
              </span>
            ))}
          </section>

          {/* ── the plans ──────────────────────────────────────────────── */}
          <section className="mx-auto grid max-w-[88rem] gap-4 px-5 pb-24 sm:px-8 lg:grid-cols-3">
            {plans.map((p, i) => {
              const prev = new Set((plans[i - 1]?.features ?? []).map((f) => f.key))
              const own = p.features.filter((f) => !f.always_included && !prev.has(f.key))
              const featured = p.id === 'professional'
              return (
                <Reveal key={p.id} delay={i * 90}>
                  {/* The featured edge is inline: on the light theme the solid
                      card sets its own border colour, which would beat a class. */}
                  <article className="glass solid-card relative flex h-full flex-col gap-6 overflow-hidden rounded-[28px] p-8"
                           style={featured ? { borderColor: 'rgb(var(--accent-500) / 0.7)' } : undefined}>
                    {featured && (
                      <span aria-hidden className="pointer-events-none absolute -top-44 left-[-20%] right-[-20%] h-72 rounded-full blur-[70px]"
                            style={{ background: 'rgb(var(--accent-500) / 0.18)' }} />
                    )}
                    <div className="relative">
                      <h2 className="text-[22px] font-semibold text-slate-100">{p.name}</h2>
                      <p className="mt-1.5 text-[15px] text-slate-400">{p.tagline}</p>
                    </div>
                    <div className="relative flex flex-col gap-2">
                      <Price value={p.price} />
                      <span className="text-sm text-slate-500">{p.unit}</span>
                    </div>
                    <p className="relative text-sm leading-relaxed text-slate-300">{p.who}</p>
                    <dl className="relative text-[13px]">
                      {[['Included', p.volume], ['After that', p.overage], ['Term', p.term]].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4 border-t border-subtle py-2.5 last:border-b">
                          <dt className="text-slate-500">{k}</dt>
                          <dd className="text-right text-slate-300">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="relative grid gap-3">
                      <p className="eyebrow text-slate-500">
                        {i === 0 ? 'Includes' : `Everything in ${plans[i - 1].name}, plus`}
                      </p>
                      {i === 0 ? (
                        <span className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
                          <Check />The {data.never_gated.length} capabilities in every plan
                        </span>
                      ) : own.map((f) => (
                        <span key={f.key} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
                          <Check />{f.label}
                        </span>
                      ))}
                    </div>
                    <Link to="/signup"
                          className={cx('relative mt-auto inline-flex min-h-[3rem] items-center justify-center rounded-[14px] px-5 text-[15px] font-semibold',
                                        featured ? 'bg-accent-500 text-white'
                                          : p.id === 'enterprise' ? 'liquid-solid cta-ink' : 'liquid text-slate-200')}>
                      {p.id === 'enterprise' ? 'Talk to us' : 'Request access'}
                    </Link>
                  </article>
                </Reveal>
              )
            })}
          </section>

          {/* ── enterprise, in its own light ───────────────────────────── */}
          <section className="mx-auto max-w-[88rem] px-5 pb-24 sm:px-8">
            <div className="fusion-anchor grid overflow-hidden rounded-[34px] lg:grid-cols-2">
              <div className="flex flex-col justify-center gap-6 p-10 sm:p-14">
                <p className="eyebrow text-accent-400">Enterprise</p>
                <h2 className="display text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.75rem]">
                  Trained on your data.{' '}
                  <span className="display-italic text-accent-400">Governed by your regulator.</span>
                </h2>
                <p className="max-w-[30rem] text-base leading-relaxed text-slate-400">
                  The detectors learn your own transactions, the governance pack
                  carries the model cards and validation evidence a review asks
                  for, and drift monitoring tells you when the world has moved
                  under the model.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link to="/signup" className="inline-flex items-center rounded-[14px] bg-[#F0EDE7] px-6 py-3.5 text-[15px] font-semibold text-[#0D0C0B]">
                    Talk to us
                  </Link>
                  <Link to="/about" className="inline-flex items-center rounded-[14px] border border-white/20 bg-white/[0.08] px-6 py-3.5 text-[15px] font-semibold text-[#F0EDE7]">
                    Read the architecture
                  </Link>
                </div>
              </div>
              <div className="relative min-h-[22rem]">
                <img src={PHOTOS.towers.src} alt={PHOTOS.towers.alt} loading="lazy"
                     className="absolute inset-0 h-full w-full object-cover"
                     style={{ filter: 'saturate(0.8) brightness(0.72)' }} />
                <div aria-hidden className="absolute inset-0 hidden lg:block"
                     style={{ background: 'linear-gradient(90deg, #14110f 0%, rgb(20 17 15 / 0) 45%)' }} />
              </div>
            </div>
          </section>

          {/* ── every feature, side by side ────────────────────────────── */}
          <section className="mx-auto max-w-[88rem] px-5 pb-8 sm:px-8">
            <h2 className="display text-[2.75rem] leading-none text-slate-100 sm:text-[3.5rem]">
              Compare <span className="display-italic text-accent-400">every feature.</span>
            </h2>
            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="eyebrow border-b border-strong px-3 py-3.5 text-left text-slate-500">Feature</th>
                    {plans.map((p) => (
                      <th key={p.id} scope="col"
                          className={cx('w-40 border-b border-strong px-3 py-3.5 text-[15px] font-semibold',
                                        p.id === 'professional' ? 'text-accent-400' : 'text-slate-100')}>
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.key}>
                      <th scope="row" className="border-b border-subtle px-3 py-3.5 text-left font-normal text-slate-300">
                        {f.label}
                      </th>
                      {plans.map((p) => (
                        <td key={p.id} className="border-b border-subtle px-3 py-3.5 text-center">
                          {p.features.some((x) => x.key === f.key)
                            ? <Check className="mx-auto" />
                            : <span className="mx-auto block h-[1.5px] w-3 rounded bg-slate-600/50" aria-label="Not included" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 text-[13px] leading-relaxed text-slate-500">
              {data.note} Plans are activated by an administrator; there is no
              card payment in this deployment.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
