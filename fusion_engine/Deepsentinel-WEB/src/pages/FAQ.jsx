import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLink, Display, Eyebrow } from '../components/Editorial'
import Reveal from '../components/Reveal'
import { cx } from '../components/ui'

const FAQS = [
  {
    category: 'About DeepSentinel',
    items: [
      {
        q: 'What is DeepSentinel?',
        a: 'A fraud detection platform. Three AI models check every payment, and a report explains each alert with cited evidence.',
      },
      {
        q: 'What problem does it solve?',
        a: 'Most fraud tools give a score with no reason. Investigators need reasons to file a report, so DeepSentinel writes one, and every claim in it points to a model output or a known laundering method.',
      },
      {
        q: 'How is this different from SHAP or LIME?',
        a: 'Those give feature numbers for data scientists. DeepSentinel gives a plain-language report an investigator can file.',
      },
      {
        q: 'Is this a production system?',
        a: 'It is a research platform. The three detectors, fusion, retrieval and reports all run live. Only the sample scenarios in the analyzer use simulated scores.',
      },
    ],
  },
  {
    category: 'How it works',
    items: [
      {
        q: 'What are the three detection models?',
        a: 'Network (GraphSAGE) finds rings by who pays whom. Behaviour (VAE) spots payments that do not fit their type. Timing (TCN) reads each payment with the 32 before it.',
      },
      {
        q: 'What is the fraud confidence score?',
        a: 'One number from 0 to 1 that combines the three models. An administrator sets where it becomes Critical, High or Medium. If a model is down, the score is pulled toward uncertain and the verdict says so.',
      },
      {
        q: 'What is RAG and why does it matter?',
        a: 'The system looks up the matching laundering method before writing the report, and the report may only use what it found. That keeps it from inventing patterns.',
      },
      {
        q: 'What are FATF typologies?',
        a: 'Known money-laundering methods published by the global standards body, such as smurfing, layering and mule networks. DeepSentinel uses 10 of them.',
      },
      {
        q: 'What is Chain-of-Evidence prompting?',
        a: 'Strict rules for the report writer: use only the given scores and the matched method, cite the method in each claim, and follow a fixed 5-section format.',
      },
    ],
  },
  {
    category: 'Using the analyzer',
    items: [
      {
        q: 'What do the fraud scenarios mean?',
        a: 'Sample cases to try: mule network, layering, smurfing, account takeover, fast automated transfers, and a normal payment. They use simulated scores.',
      },
      {
        q: 'What is the ablation toggle?',
        a: 'It shows the same case reported twice: once by a plain language model and once by DeepSentinel. You can see the plain one invent details the grounded one does not.',
      },
      {
        q: 'What does the match percentage mean?',
        a: 'How closely the case matches the stored laundering method, from 0% to 100%. The closest of the 10 methods is always used.',
      },
    ],
  },
]

// The open state used bg-blue-500/5 and border-blue-500/50 — a blue that
// appears nowhere else in this product. Accent teal now, like everything else
// that means "selected".
function AccordionItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cx('glass card-hover overflow-hidden rounded-xl',
                       open && 'border-accent-500/35')}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className={cx('text-sm font-medium transition-colors',
                            open ? 'text-slate-100' : 'text-slate-300')}>{q}</span>
        <span className={cx(
          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-xs',
          'transition-transform duration-300',
          open ? 'rotate-45 border-accent-400/60 text-accent-400' : 'border-white/15 text-slate-500',
        )}
              style={{ transitionTimingFunction: 'var(--ease-hover)' }}>
          +
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5">
          <p className="text-sm text-slate-400 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

export default function FAQ() {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState('All')

  const categories = ['All', ...FAQS.map((s) => s.category)]

  // Filter across both question and answer: people search for a word they
  // half-remember from the answer at least as often as from the title.
  const needle = query.trim().toLowerCase()
  const sections = FAQS.map((section) => ({
    ...section,
    items: section.items.filter(
      (i) =>
        (active === 'All' || active === section.category) &&
        (!needle ||
          i.q.toLowerCase().includes(needle) ||
          i.a.toLowerCase().includes(needle)),
    ),
  })).filter((s) => s.items.length > 0)

  const total = sections.reduce((n, s) => n + s.items.length, 0)

  return (
    <div className="pb-24">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-subtle">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent-500/10 blur-[120px]"
        />
        <div className="relative mx-auto max-w-4xl px-4 py-20 sm:px-6">
          <Reveal>
            <Eyebrow>Frequently asked</Eyebrow>
            <Display lead="Everything you need" accent="to know" className="mt-4" />
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Quick answers about the platform and the analyzer.
            </p>
          </Reveal>

          {/* Search */}
          <Reveal delay={120} className="mt-8">
            <div className="relative max-w-md">
              <svg
                viewBox="0 0 24 24" aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
                fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the answers…"
                aria-label="Search questions"
                className="glass w-full rounded-xl py-3 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-strong focus:outline-none"
              />
            </div>
          </Reveal>

          {/* Category filter */}
          <Reveal delay={180} className="mt-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActive(c)}
                className={cx(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  active === c
                    ? 'border-accent-500/50 bg-accent-500/10 text-accent-500'
                    : 'border-subtle text-slate-500 hover:border-strong hover:text-slate-300',
                )}
              >
                {c}
              </button>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── Answers ────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {total === 0 ? (
          <p className="py-20 text-center text-sm text-slate-500">
            Nothing matches “{query}”. Try another word, or ask the assistant.
          </p>
        ) : (
          sections.map((section, si) => (
            <section key={section.category} className="pt-14">
              <Reveal>
                <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {section.category}
                </h2>
              </Reveal>
              <div className="mt-4 space-y-2">
                {section.items.map((item, i) => (
                  <Reveal key={item.q} delay={Math.min(i, 4) * 70}>
                    <AccordionItem q={item.q} a={item.a} />
                  </Reveal>
                ))}
              </div>
            </section>
          ))
        )}

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <Reveal className="mt-20">
          <div className="glass card-hover relative overflow-hidden rounded-2xl p-8 text-center sm:p-10">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-accent-500/10 blur-3xl"
            />
            <div className="relative">
              <p className="text-xl font-semibold text-slate-200">Still have a question?</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                Ask the assistant, or try a real transaction in the analyzer.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/analyzer"
                  className="shine lift rounded-xl bg-white px-6 py-3 text-sm font-semibold text-sentinel-950"
                >
                  Open the analyzer
                </Link>
                <Link to="/components/network">
                  <ArrowLink>Read the components</ArrowLink>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
