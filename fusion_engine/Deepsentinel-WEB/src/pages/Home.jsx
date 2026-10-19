import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Display, Eyebrow } from '../components/Editorial'
import HomeHero from '../components/HomeHero'
import ModelChapters from '../components/ModelChapters'
import Reveal from '../components/Reveal'
import ScrollRevealText from '../components/ScrollRevealText'
import LedSign from '../components/LedSign'
import TransactionStory from '../components/TransactionStory'
import { IconBlackBox, IconHallucination, IconLink } from '../components/Icons'
import PipelineDiagram from '../components/PipelineDiagram'
import { useAuth } from '../context/AuthContext'
import { cx } from '../components/ui'

// The hero used to end in a row of research figures — F1, calibration error,
// seed counts, a p-value. They were all honest and all measured, and they were
// still wrong here: this is the front door of a product, and someone arriving
// at it wants to know what the thing does, not how its evaluation was
// designed. The numbers still exist where they belong, on the component pages
// and in the console.
const PROBLEM = [
  {
    Icon: IconBlackBox,
    title: 'The model says fraud. It cannot say why.',
    body: 'A neural network returns a probability. An investigator building a case needs reasoning, and a regulator needs an audit trail. A score alone satisfies neither.',
  },
  {
    Icon: IconHallucination,
    title: 'A language model will happily invent the why.',
    body: 'Ask an unconstrained LLM to explain a fraud score and it produces fluent, confident narrative — including details that were never in the data. In a compliance filing that is worse than no explanation.',
  },
  {
    Icon: IconLink,
    title: 'Neither problem is solved by the other alone.',
    body: 'DeepSentinel grounds every sentence of the narrative in a retrieved FATF typology and the actual model outputs, so each claim traces back to evidence.',
  },
]

export default function Home() {
  const { isAuthenticated } = useAuth()
  const { hash } = useLocation()

  // Other pages link to a section here ("/#pipeline"). A client-side route
  // change does not scroll to a fragment the way a page load does, so it is
  // done once the page has rendered.
  useEffect(() => {
    const el = hash && document.getElementById(hash.slice(1))
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [hash])

  return (
    // `clip`, not `hidden`. Hidden on one axis turns the other into a scroll
    // box, and that would cut off the top of the hero where it slides up
    // under the navigation.
    <div className="overflow-x-clip">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <HomeHero />

      {/* ── The four components ──────────────────────────────────────────── */}
      {/* Straight after the claim: what is inside, before why it is needed. */}
      <ModelChapters />

      {/* ── The problem ──────────────────────────────────────────────────── */}
      {/* Three claims that build on each other, so they are numbered and ruled
          rather than boxed. Equal-weight cards read as a feature grid; this is
          an argument. */}
      <section className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
        {/* The heading holds the left column; the board runs across the right,
            level with it. Below `lg` there is no room for both, and a sign
            squeezed into a phone width reads as a glitch, so it is dropped. */}
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,42rem)_1fr]">
          <Reveal>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="display mt-4 text-[2.5rem] text-slate-100 sm:text-[3.25rem]">
              <ScrollRevealText as="span">Fraud detection has</ScrollRevealText>{' '}
              <span className="display-italic text-accent-400">an explanation problem.</span>
            </h2>
          </Reveal>

          <div className="hidden overflow-hidden lg:block"
               style={{ maskImage:
                          'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
                        WebkitMaskImage:
                          'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)' }}>
            <LedSign word="DEEPSENTINEL" />
          </div>
        </div>

        <div className="hair-t mt-14 grid gap-x-10 gap-y-12 pt-12 md:grid-cols-3">
          {PROBLEM.map((p, i) => (
            <Reveal key={p.title} delay={i * 110}>
              <article className={cx('glass card-hover h-full rounded-2xl p-6', i > 0 && 'md:pl-6')}>
                <div className="flex items-baseline gap-4">
                  <span className="display text-[2.5rem] leading-none text-slate-700">
                    0{i + 1}
                  </span>
                  <span className="text-slate-600"><p.Icon /></span>
                </div>
                <h3 className="mt-5 text-lg font-semibold leading-snug text-slate-100">
                  {p.title}
                </h3>
                <ScrollRevealText className="mt-3 text-sm leading-relaxed text-slate-400">
                  {p.body}
                </ScrollRevealText>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How it works: pinned scrollytelling ─────────────────────────── */}
      <div id="pipeline">
        <TransactionStory />
      </div>

      {/* ── Interactive pipeline explorer ────────────────────────────────── */}
      <section className="mx-auto max-w-6xl space-y-8 px-4 py-24 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>Explore it yourself</Eyebrow>
          <Display lead="Every stage," accent="on demand" className="mt-4" />
          <p className="mt-5 text-sm leading-relaxed text-slate-500">
            Select any stage to see what happens there. The same worked example
            carries through all five.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <PipelineDiagram />
        </Reveal>
      </section>

      {/* ── Research contribution ────────────────────────────────────────── */}
      {/* Set as a pull-quote. The previous version was a rounded box with a blue
          radial gradient behind centred text — the single most generic shape on
          the page. */}
      <section className="hair-t mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Reveal>
            <Eyebrow>Research contribution</Eyebrow>
            <blockquote className="display mt-5 text-[2rem] leading-[1.15] text-slate-100 sm:text-[2.75rem]">
              Forensic-ready LLM architectures with traceable outputs were named
              an{' '}
              <span className="display-italic text-accent-400">
                open research gap
              </span>{' '}
              by three independent 2025&ndash;2026 surveys.
            </blockquote>
          </Reveal>

          <Reveal delay={120} className="lg:hair-l lg:pl-16">
            <p className="text-sm leading-relaxed text-slate-400">
              No prior system pairs a multi-modal fraud ensemble with a retrieval
              layer that anchors the generated narrative in a structured typology
              knowledge base. That pairing is what makes the output traceable,
              and it is what this project contributes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <Link
                to={isAuthenticated ? '/' : '/login'}
                className="liquid-solid inline-flex items-center rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                {isAuthenticated ? 'Run the analyzer' : 'Sign in to run it'}
              </Link>
              <Link
                to="/about"
                className="arrow-slide hair border-b pb-1 text-sm text-slate-300 transition-colors hover:text-slate-100"
              >
                Read the architecture <span className="arrow inline-block">&rarr;</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── pricing ─────────────────────────────────────────────────── */}
      <section className="border-t border-slate-800/60 py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <Reveal>
            <p className="ds-mono text-[13px] uppercase tracking-[.18em] text-accent-400">
              Pricing
            </p>
            <h2 className="mt-3 max-w-[20ch] text-[34px] leading-[1.08] tracking-tight text-slate-100">
              Detection is never the thing you pay for
            </h2>
            <p className="mt-4 max-w-[58ch] text-[16px] text-slate-400">
              Every plan screens every transaction through all three detectors,
              fuses them, and alerts your team. What the plans differ on is how
              much the product helps you understand a result and answer for it.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                ['Essential', '$40', 'Detection and alerting'],
                ['Professional', '$120', 'Investigation and evidence'],
                ['Enterprise', 'From $25,000', 'Your data, your governance'],
              ].map(([name, price, line]) => (
                <div key={name} className="rounded-xl border border-slate-800 p-5">
                  <p className="text-[17px] font-semibold text-slate-100">{name}</p>
                  <p className="mt-2 text-[26px] font-bold tracking-tight text-slate-100">
                    {price}
                  </p>
                  <p className="mt-2 text-[15px] text-slate-400">{line}</p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <Link
                to="/pricing"
                className="arrow-slide hair border-b pb-1 text-sm text-slate-300 transition-colors hover:text-slate-100"
              >
                See what each plan includes <span className="arrow inline-block">&rarr;</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
