import { Link, Navigate, useParams } from 'react-router-dom'
import { COMPONENTS, COMPONENT_ORDER } from '../data/components'
import { PHOTOS } from '../data/photos'
import { cx } from '../components/ui'
import { Eyebrow } from '../components/Editorial'
import Reveal from '../components/Reveal'
import SystemLens from '../components/SystemLens'
import ModelArt from '../components/ModelArt'
import PatternArt from '../components/PatternArt'
import { useAuth } from '../context/AuthContext'
import useCapabilities, { compact } from '../hooks/useCapabilities'

/** Component slugs to the lens they own. Fusion owns none — it owns all three. */
const LENS_FOR = {
  network: 'graph',
  behavioural: 'behavioural',
  temporal: 'temporal',
}

/**
 * One page per detection component.
 *
 * Structured as an argument rather than a spec sheet: what question the model
 * answers, what it catches, how it runs, what it can and cannot see, what was
 * learned building it, and what it hands downstream. Every word comes from
 * data/components.js, and every figure that can be read live is read live.
 *
 * The page leads with a photograph in an arch and closes with a second one,
 * each chosen for what this detector reads, so the four pages look like one
 * set without looking like one page four times.
 */

const TONE = {
  graph: { text: 'text-modality-graph', line: 'rgb(var(--modality-graph))' },
  behavioral: { text: 'text-modality-behavioral', line: 'rgb(var(--modality-behavioral))' },
  temporal: { text: 'text-modality-temporal', line: 'rgb(var(--modality-temporal))' },
  fusion: { text: 'text-accent-400', line: 'rgb(var(--accent-400))' },
}

/* The photograph each page leads with, the one it closes on, and the line set
   over the second. The network drawing is ink on paper, so it is inverted on
   the dark theme rather than dimmed. */
const MEDIA = {
  network: {
    lead: PHOTOS.networkLines, ink: true, close: PHOTOS.payCounter,
    line: ['Every payment joins two accounts.', 'The network sees the rest.'],
  },
  behavioural: {
    lead: PHOTOS.atmKeypad, close: PHOTOS.cardTerminal,
    line: ['A cash withdrawal is not a bill payment.', 'Each type has its own normal.'],
  },
  temporal: {
    lead: PHOTOS.circuitScreen, close: PHOTOS.cardLaptop,
    line: ['A transfer on its own can be unremarkable.', 'The run before it is not.'],
  },
  fusion: {
    lead: PHOTOS.analystWall, close: PHOTOS.operationsFloor,
    line: ['Three readings, one verdict.', 'Written up with its evidence.'],
  },
}

/**
 * Where a metric's value comes from live, keyed by component and label.
 *
 * The figures in components.js stay as the fallback. A marketing page that
 * blanks because a detector is restarting is worse than one showing a number
 * that is a minute stale, so live values overwrite and never remove.
 */
const LIVE = {
  network: {
    'Accounts mapped': (d) => compact(d.accounts),
    'Transfers mapped': (d) => compact(d.transfers),
    Neighbourhood: (d) => (d.hops ? `${d.hops} hops` : null),
  },
  behavioural: {
    Models: (d) => (d.strata ? String(d.strata) : null),
    Response: (d) => (d.latency_ms ? `~${Number(d.latency_ms).toFixed(1)} ms` : null),
  },
  temporal: {
    Context: (d) => (d.window ? String(d.window) : null),
  },
  fusion: {
    'Signals combined': (d) => (d.signals ? String(d.signals) : null),
    'Typologies indexed': (d) => (d.typologies ? String(d.typologies) : null),
  },
}

/* The network detector's response as the fusion engine receives it: the shape
   every other component was built against. */
const NETWORK_RESPONSE = `{
  "transaction_id": "TX_2026_08_24_0117",
  "relational_risk_score": 0.52,
  "risk_level": "HIGH",
  "suspicious_subgraph": {
    "nodes": ["C1360689528", "C2098525306", "C1674473954"],
    "edges": [
      { "src": "C1360689528", "dst": "C1674473954", "weight": 0.61 },
      { "src": "C2098525306", "dst": "C1674473954", "weight": 0.57 }
    ],
    "sink_account": "C1674473954",
    "pattern": "Account takeover"
  }
}`

/** Keys, strings and numbers coloured; everything else as written. */
function Json({ text }) {
  const out = []
  let last = 0
  for (const m of text.matchAll(/("[^"]*")(\s*:)?|(\d+(?:\.\d+)?)/g)) {
    out.push(text.slice(last, m.index))
    if (m[1]) {
      out.push(<span key={m.index} className={m[2] ? 'text-slate-500' : 'text-modality-graph'}>{m[1]}</span>)
      if (m[2]) out.push(m[2])
    } else {
      out.push(<span key={m.index} className="text-modality-temporal">{m[3]}</span>)
    }
    last = m.index + m[0].length
  }
  out.push(text.slice(last))
  return out
}

/** "Fraud is a shape, not a number" → the roman half and the italic half. */
function splitTagline(t) {
  const i = t.indexOf(', ')
  if (i > 0) return [t.slice(0, i + 1), `${t.slice(i + 2)}.`]
  const w = t.split(' ')
  return [w.slice(0, -2).join(' '), `${w.slice(-2).join(' ')}.`]
}

function Photo({ photo, ink, className, alt }) {
  return (
    <img src={photo.src} alt={alt ?? photo.alt} loading="lazy"
         className={cx(ink ? 'photo-ink' : 'photo-dim', className)} />
  )
}

export default function ComponentDetail() {
  const { slug } = useParams()
  // Called before the early return below — a hook after a conditional return
  // is a hook that sometimes does not run, which React will not forgive.
  const caps = useCapabilities() ?? {}
  const { isAuthenticated } = useAuth()

  const c = COMPONENTS[slug]
  if (!c) return <Navigate to="/" replace />

  const live = LIVE[slug]
  const tone = TONE[c.color] ?? TONE.fusion
  const media = MEDIA[slug]
  const [lead, accent] = splitTagline(c.tagline)
  const idx = COMPONENT_ORDER.indexOf(slug)
  const following = [1, 2].map((k) => COMPONENT_ORDER[(idx + k) % COMPONENT_ORDER.length])
  const figure = (m) => live?.[m.label]?.(caps[c.slug] ?? {}) ?? m.value

  return (
    <div className="overflow-x-clip">

      {/* ── the claim, and the picture of what it reads ─────────────────── */}
      <section className="relative mx-auto max-w-[88rem] px-5 pb-24 pt-14 sm:px-8 lg:pt-20">
        <div aria-hidden className="pointer-events-none absolute -left-48 -top-72 h-[36rem] w-[56rem] rounded-full blur-[120px]"
             style={{ background: 'rgb(var(--accent-500) / 0.14)' }} />
        <div className="relative grid items-center gap-14 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-6">
            <nav aria-label="Breadcrumb" className="flex gap-2 text-[13px] text-slate-500">
              <Link to="/" className="transition-colors hover:text-slate-300">Components</Link>
              <span aria-hidden>/</span>
              <span className="text-slate-300">0{idx + 1} {c.modality}</span>
            </nav>
            <span className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-overlay px-3 py-1.5 text-xs text-slate-300">
              <span className="hero-pulse" />
              {c.title}
            </span>
            <h1 className="display text-[3.25rem] leading-[0.92] text-slate-100 sm:text-[4.5rem] xl:text-[5.75rem]">
              {lead}
              <br />
              <span className="display-italic text-accent-400">{accent}</span>
            </h1>
            <p className="max-w-[34rem] text-lg leading-relaxed text-slate-400">{c.intro}</p>
            <div className="flex flex-wrap gap-3">
              <Link to={isAuthenticated ? '/analyzer' : '/login'}
                    className="liquid-solid cta-ink inline-flex items-center rounded-[14px] px-6 py-3.5 text-[15px] font-semibold">
                Run it on a transaction
              </Link>
              <Link to="/about" className="liquid arrow-slide inline-flex items-center gap-2 rounded-[14px] px-6 py-3.5 text-[15px] font-semibold text-slate-200">
                Read the architecture <span aria-hidden className="arrow inline-block">&rarr;</span>
              </Link>
            </div>
          </div>

          <div className="relative min-h-[30rem] lg:min-h-[38rem]">
            <div className={cx('photo-frame photo-arch absolute inset-0 lg:left-14', media.ink && 'photo-tint')}>
              <Photo photo={media.lead} ink={media.ink} />
            </div>
            {/* Placed by wrappers: .glass sets its own position, which would
                otherwise win over a positioning utility on the same element. */}
            <div className="absolute right-4 top-24 hidden max-w-[17rem] sm:block">
              <span className="glass solid-card inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs text-slate-300">
                <span className="h-2 w-2 shrink-0 rounded-full bg-risk-critical" />
                {c.detects[0][1]}
              </span>
            </div>
            <div className="absolute bottom-10 left-0 w-[19.5rem] max-w-full">
              <div className="glass solid-card orbit-bob rounded-[22px] p-[18px]">
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow text-slate-500">{c.modality}</p>
                  <span className={cx('text-xs font-medium', tone.text)}>{c.question}</span>
                </div>
                <div className="mt-3"><ModelArt kind={c.color} /></div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.metrics.slice(0, 2).map((m) => (
                    <span key={m.label}
                          className="rounded-full border border-subtle bg-surface-overlay px-2.5 py-1 text-[11px] text-slate-300">
                      <span className="numeric text-slate-100">{figure(m)}</span> {m.label.toLowerCase()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── the figures, read live where they can be ───────────────────── */}
      {c.metrics.length > 0 && (
        <section className="border-y border-subtle">
          <div className="mx-auto grid max-w-[88rem] gap-10 px-5 py-16 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
            {c.metrics.map((m, i) => (
              <Reveal key={m.label} delay={i * 80}>
                <p className="display text-[3.5rem] leading-none text-slate-100 sm:text-[4.5rem]">{figure(m)}</p>
                <p className="mt-3 text-sm font-semibold text-accent-400">{m.label}</p>
                <p className="mt-1 text-[15px] leading-snug text-slate-500">{m.note}</p>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ── what it catches ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
        <Reveal>
          <h2 className="display text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.75rem]">
            What it <span className="display-italic text-accent-400">catches.</span>
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))' }}>
          {c.detects.map(([name, desc], i) => (
            <Reveal key={name} delay={i * 80}>
              <article className="glass solid-card card-hover flex h-full flex-col gap-3.5 rounded-[22px] p-[22px]">
                <PatternArt name={name} tone={c.color} label={desc} />
                <h3 className="text-lg font-semibold text-slate-100">{name}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── how it runs ─────────────────────────────────────────────────── */}
      <section className="border-y border-subtle bg-sentinel-900">
        <div className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
          <Eyebrow>How it runs</Eyebrow>
          <h2 className="display mt-4 text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.75rem]">
            From one transaction <span className="display-italic text-accent-400">to what it hands on.</span>
          </h2>
          <ol className="relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
            <span aria-hidden className="absolute left-6 right-6 top-6 hidden h-px lg:block"
                  style={{ background: `linear-gradient(90deg, ${tone.line}, rgb(var(--accent-400)))` }} />
            {c.pipeline.map((step, i) => (
              <li key={step} className="relative flex flex-col gap-3">
                <span className={cx(
                  'numeric grid h-12 w-12 place-items-center rounded-full text-sm',
                  i === c.pipeline.length - 1 ? 'bg-accent-500 text-white' : 'glass solid-card text-slate-100',
                )}>
                  0{i + 1}
                </span>
                <span className="text-base font-semibold text-slate-100">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── where it sits ───────────────────────────────────────────────── */}
      {/* The same drawing on every component page, with this one's field of
          view lit and the others dimmed, so a reader arriving at any single
          component still learns what it cannot see, and why the other two
          exist. The fusion page lights all three, which is what it is for. */}
      <section className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <Reveal>
            <Eyebrow>{LENS_FOR[c.slug] ? 'What it can see' : 'What the detectors see'}</Eyebrow>
            <h2 className="display mt-4 text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.5rem]">
              Its field <span className="display-italic text-accent-400">of view.</span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-400">
              Each detector reads one slice of the same event. The lit part is
              what this one sees; the rest is why the others exist.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <div className="glass solid-card rounded-[24px] p-5 sm:p-7">
              <SystemLens highlight={LENS_FOR[c.slug] ?? null} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── how it behaves, beside the second photograph ────────────────── */}
      <section className="mx-auto grid max-w-[88rem] items-center gap-14 px-5 pb-24 sm:px-8 lg:grid-cols-2">
        <div className="photo-frame relative min-h-[26rem] rounded-[2rem] lg:min-h-[34rem]">
          <Photo photo={media.close} className="absolute inset-0" />
          <div className="absolute inset-x-5 bottom-5">
            <div className="glass solid-card rounded-[20px] px-5 py-4">
              <p className="eyebrow text-slate-500">{media.line[0]}</p>
              <p className="display mt-2 text-[1.75rem] leading-tight text-slate-100">{media.line[1]}</p>
            </div>
          </div>
        </div>
        <div>
          <h2 className="display text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.5rem]">
            How it <span className="display-italic text-accent-400">behaves.</span>
          </h2>
          <div className="mt-8">
            {c.findings.map((f, i) => (
              <Reveal key={f.title} delay={i * 90}>
                <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 border-t border-subtle py-6">
                  <span className={cx('numeric pt-1 text-sm', tone.text)}>0{i + 1}</span>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">{f.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{f.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── what it hands downstream ────────────────────────────────────── */}
      <section className="border-y border-subtle bg-sentinel-900">
        <div className="mx-auto grid max-w-[88rem] items-start gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2">
          <div>
            <Eyebrow>What it hands on</Eyebrow>
            <h2 className="display mt-4 text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.5rem]">
              {slug === 'fusion'
                ? <>A verdict, <span className="display-italic text-accent-400">and the case for it.</span></>
                : <>A score, <span className="display-italic text-accent-400">and the reason for it.</span></>}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400">{c.output}</p>
          </div>
          {slug === 'network' ? (
            <figure className="glass solid-card m-0 overflow-hidden rounded-[22px]">
              <figcaption className="flex items-center justify-between gap-3 border-b border-subtle px-5 py-3.5">
                <span className="numeric text-[13px] text-slate-300">
                  <span className="text-modality-graph">POST</span> /api/graph/analyze
                </span>
                <span className="rounded-full border border-subtle px-2.5 py-0.5 text-[11px] text-modality-graph">response</span>
              </figcaption>
              <pre className="numeric m-0 overflow-x-auto p-5 text-[13px] leading-[1.75] text-slate-300"><Json text={NETWORK_RESPONSE} /></pre>
            </figure>
          ) : (
            <div className="glass solid-card rounded-[22px] p-7">
              <p className={cx('eyebrow', tone.text)}>{c.question}</p>
              <div className="mt-5"><ModelArt kind={c.color} /></div>
            </div>
          )}
        </div>
      </section>

      {/* ── keep reading ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
        <Eyebrow>Keep reading</Eyebrow>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {following.map((s) => {
            const n = COMPONENTS[s]
            const m = MEDIA[s]
            return (
              <Link key={s} to={`/components/${s}`}
                    className="glass solid-card arrow-slide grid min-h-[12.5rem] grid-cols-[9rem_minmax(0,1fr)] overflow-hidden rounded-[26px] sm:grid-cols-[11rem_minmax(0,1fr)]">
                <span className={cx('photo-frame relative !rounded-none !border-0', m.ink && 'photo-tint')}>
                  <Photo photo={m.lead} ink={m.ink} alt="" />
                </span>
                <span className="flex flex-col justify-center gap-2.5 p-6">
                  <span className={cx('eyebrow', (TONE[n.color] ?? TONE.fusion).text)}>
                    0{COMPONENT_ORDER.indexOf(s) + 1} · {n.modality}
                  </span>
                  <span className="display display-italic text-[1.9rem] leading-tight text-slate-100">{n.tagline}.</span>
                  <span className="text-sm text-slate-400">
                    {n.title} · Explore <span aria-hidden className="arrow inline-block">&rarr;</span>
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
