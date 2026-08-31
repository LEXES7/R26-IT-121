import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCatalogue } from '../services/api'

/**
 * The public price list.
 *
 * Every plan and every feature line comes from the backend, which builds them
 * out of the same tables the licence gate enforces. A pricing page maintained
 * by hand drifts from what the software actually does, and then the site is
 * selling something the product will not unlock.
 *
 * The page leads with what is never charged for rather than with the cheapest
 * plan, because that is the honest shape of this product: detection runs the
 * same on every tier, and what is sold is the investigation around it.
 */
export default function Pricing() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getCatalogue().then(setData)
      .catch(() => setError('The price list could not be loaded.'))
  }, [])

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-20">
      <p className="ds-mono text-[13px] uppercase tracking-[.18em]"
         style={{ color: 'rgb(var(--ds-accent-strong))' }}>
        Pricing
      </p>
      <h1 className="mt-3 text-[42px] leading-[1.05] tracking-tight"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
        Detection is never the thing you pay for
      </h1>
      <p className="mt-5 max-w-[62ch] text-[17px]" style={{ color: 'rgb(var(--ds-muted))' }}>
        Every plan screens every transaction through all three detectors. What
        the plans differ on is how much the product helps you understand a
        result, act on it, and answer for it afterwards.
      </p>

      {error && (
        <p className="mt-10 text-[15px]" style={{ color: 'rgb(var(--ds-sev-critical))' }}>
          {error}
        </p>
      )}

      {data && (
        <>
          {/* The guarantee, before the prices. */}
          <section className="mt-10 rounded-xl border p-5"
                   style={{ borderColor: 'rgba(45,212,191,.35)',
                            background: 'rgba(45,212,191,.05)' }}>
            <p className="text-[15px] font-semibold" style={{ color: 'rgb(var(--ds-ink))' }}>
              Included on every plan, always
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.never_gated.map((f) => (
                <li key={f} className="flex gap-2 text-[15px]"
                    style={{ color: 'rgb(var(--ds-muted))' }}>
                  <span style={{ color: 'rgb(var(--ds-accent))' }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[14px]" style={{ color: 'rgb(var(--ds-faint))' }}>
              A fraud detector that stops detecting when a licence lapses is not
              a fraud detector. These are refused by the code even if something
              asks for them to be gated.
            </p>
          </section>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {data.plans.map((p) => {
              const paid = p.features.filter((f) => !f.always_included)
              const mid = p.id === 'professional'
              return (
                <section key={p.id}
                         className="flex flex-col rounded-xl border p-6"
                         style={{
                           borderColor: mid ? 'rgb(var(--ds-accent))'
                             : 'rgb(var(--ds-line))',
                           background: 'rgb(var(--ds-surface))',
                         }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-[21px] font-bold tracking-tight">{p.name}</h2>
                    {mid && (
                      <span className="ds-mono rounded-full px-2 py-1 text-[12px]"
                            style={{ background: 'rgb(var(--ds-accent-soft))',
                                     color: 'rgb(var(--ds-accent-strong))' }}>
                        most chosen
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[15px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                    {p.tagline}
                  </p>

                  <p className="mt-5">
                    <span className="text-[34px] font-bold tracking-tight">{p.price}</span>
                    <span className="ml-2 text-[14px]" style={{ color: 'rgb(var(--ds-faint))' }}>
                      {p.unit}
                    </span>
                  </p>
                  <p className="mt-1 text-[14px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                    {p.volume} · {p.term} term
                  </p>

                  <p className="mt-5 text-[15px]" style={{ color: 'rgb(var(--ds-ink))' }}>
                    {p.who}
                  </p>

                  <ul className="mt-5 grid flex-1 gap-2">
                    {paid.length === 0 ? (
                      <li className="text-[15px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                        Detection, fusion, monitoring and alerting — the whole
                        screening pipeline, with nothing removed.
                      </li>
                    ) : paid.map((f) => (
                      <li key={f.key} className="flex gap-2 text-[15px]"
                          style={{ color: 'rgb(var(--ds-muted))' }}>
                        <span style={{ color: 'rgb(var(--ds-accent))' }}>✓</span>
                        {f.label}
                      </li>
                    ))}
                  </ul>

                  <Link to="/request-access"
                        className="mt-6 rounded-lg px-4 py-2.5 text-center text-[15px] font-semibold"
                        style={{
                          background: mid ? 'rgb(var(--ds-accent))' : 'transparent',
                          color: mid ? 'rgb(8 44 39)' : 'rgb(var(--ds-ink))',
                          border: `1px solid rgb(var(--ds-${mid ? 'accent' : 'line'}))`,
                        }}>
                    {p.id === 'enterprise' ? 'Talk to us' : 'Request access'}
                  </Link>
                  <p className="mt-2 text-center text-[13px]"
                     style={{ color: 'rgb(var(--ds-faint))' }}>
                    {p.overage}
                  </p>
                </section>
              )
            })}
          </div>

          <p className="mt-8 text-[14px]" style={{ color: 'rgb(var(--ds-faint))' }}>
            {data.note} Plans are activated by an administrator; there is no
            card payment in this deployment.
          </p>
        </>
      )}
    </main>
  )
}
