import { Link, Navigate, useParams } from 'react-router-dom'
import { COMPONENTS, COMPONENT_ORDER } from '../data/components'
import { Badge, cx } from '../components/ui'
import { ArrowLink, Display, Eyebrow, Tag } from '../components/Editorial'
import Reveal from '../components/Reveal'

/**
 * One page per detection component.
 *
 * Structured as an argument rather than a spec sheet: what question the model
 * answers, what it catches, what was learned building it, and what it hands
 * downstream. Metrics render only where they exist — a component still in
 * progress shows its design and says so, instead of displaying placeholder
 * numbers that a reader would reasonably mistake for results.
 */

const ACCENT = {
  graph: {
    text: 'text-modality-graph',
    border: 'border-modality-graph/30',
    bg: 'bg-modality-graph/10',
    glow: 'from-modality-graph/20',
    dot: 'bg-modality-graph',
  },
  behavioral: {
    text: 'text-modality-behavioral',
    border: 'border-modality-behavioral/30',
    bg: 'bg-modality-behavioral/10',
    glow: 'from-modality-behavioral/20',
    dot: 'bg-modality-behavioral',
  },
  temporal: {
    text: 'text-modality-temporal',
    border: 'border-modality-temporal/30',
    bg: 'bg-modality-temporal/10',
    glow: 'from-modality-temporal/20',
    dot: 'bg-modality-temporal',
  },
  fusion: {
    text: 'text-slate-200',
    border: 'border-strong',
    bg: 'bg-surface-raised',
    glow: 'from-white/10',
    dot: 'bg-slate-300',
  },
}

export default function ComponentDetail() {
  const { slug } = useParams()
  const c = COMPONENTS[slug]
  if (!c) return <Navigate to="/" replace />

  const a = ACCENT[c.color] ?? ACCENT.fusion
  const idx = COMPONENT_ORDER.indexOf(slug)
  const next = COMPONENTS[COMPONENT_ORDER[(idx + 1) % COMPONENT_ORDER.length]]

  return (
    <div className="pb-20">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-subtle bg-sentinel-950">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg" />
        <div
          aria-hidden
          className={cx(
            'pointer-events-none absolute inset-x-0 -top-40 h-96 bg-gradient-to-b to-transparent blur-3xl',
            a.glow,
          )}
        />
        <div className="relative mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-24">
          <Link
            to="/"
            className="group inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-300"
          >
            <span aria-hidden className="transition-transform group-hover:-translate-x-1">←</span>
            All components
          </Link>

          <div className="mt-8">
            <Eyebrow>{c.modality}</Eyebrow>
          </div>

          <Display as="h1" lead={c.title} accent={c.tagline} className="mt-4" />

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400">{c.intro}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Tag>{c.question}</Tag>
            {c.status === 'delivered' ? (
              <Badge tone="low">Delivered</Badge>
            ) : (
              <Badge tone="neutral">In development</Badge>
            )}
          </div>
        </div>
      </section>

      {/* ── Metrics ──────────────────────────────────────────────────────── */}
      {c.metrics.length > 0 && (
        <section className="border-b border-subtle bg-sentinel-950">
          <div className="mx-auto grid max-w-5xl gap-px bg-white/[0.06] px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {c.metrics.map((m, i) => (
              <Reveal key={m.label} delay={i * 90} className="bg-sentinel-950"><div className="bg-sentinel-950 px-2 py-8">
                <p className="text-4xl font-bold tracking-tight text-slate-200 tabular-nums">
                  {m.value}
                </p>
                <p className="mt-2 text-sm font-semibold text-accent-500">{m.label}</p>
                <p className="mt-0.5 text-[11px] text-slate-600">{m.note}</p>
              </div></Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ── Pipeline ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pt-12 sm:px-6">
        <Eyebrow>How it runs</Eyebrow>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {c.pipeline.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={cx(
                  'rounded-xl border bg-surface px-3 py-2 text-xs font-medium text-slate-300',
                  i === c.pipeline.length - 1 ? a.border : 'border-subtle',
                )}
              >
                {step}
              </div>
              {i < c.pipeline.length - 1 && (
                <span aria-hidden className="text-slate-700">→</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── What it catches ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pt-12 sm:px-6">
        <Eyebrow>What it catches</Eyebrow>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {c.detects.map(([name, desc], i) => (
            <Reveal key={name} delay={i * 80}>
            <div
              className="group flex h-full gap-3 rounded-2xl border border-subtle bg-surface p-4 transition-colors duration-300 hover:border-accent-500/40 hover:bg-surface-raised"
            >
              <span aria-hidden className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', a.dot)} />
              <div>
                <p className="text-sm font-semibold text-slate-200">{name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{desc}</p>
              </div>
            </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Findings ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pt-12 sm:px-6">
        <Eyebrow>{c.status === 'delivered' ? 'What we learned' : 'Design decisions'}</Eyebrow>
        <div className="mt-4 space-y-3">
          {c.findings.map((f, i) => (
            <Reveal key={f.title} delay={i * 100}><div className="rounded-2xl border border-subtle bg-surface p-5">
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-bold tabular-nums text-accent-500">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="font-semibold text-slate-200">{f.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.body}</p>
                </div>
              </div>
            </div></Reveal>
          ))}
        </div>
      </section>

      {/* ── Output + next ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pt-12 sm:px-6">
        <div className={cx('rounded-2xl border p-6', a.border, a.bg)}>
          <Eyebrow>What it hands downstream</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{c.output}</p>
        </div>

        <Link
          to={`/components/${next.slug}`}
          className="group mt-6 flex items-center justify-between rounded-2xl border border-subtle bg-surface p-5 transition hover:border-strong hover:bg-surface-raised"
        >
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-600">Next component</p>
            <p className="mt-1 font-semibold text-slate-200">{next.title}</p>
          </div>
          <ArrowLink className="pointer-events-none">Read</ArrowLink>
        </Link>
      </section>
    </div>
  )
}
