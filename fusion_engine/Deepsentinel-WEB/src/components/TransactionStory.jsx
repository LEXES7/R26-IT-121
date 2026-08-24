/* Pinned scrollytelling: the section holds still for ~4 viewport heights while
   one transaction moves through the platform — raw record, three detectors
   scoring in parallel, fusion, typology retrieval, and the written report.
   The copy on the left advances in step with the panel on the right, so the
   reader watches a record become evidence rather than reading that it does. */

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, prefersReducedMotion } from '../lib/motion'
import { Eyebrow } from './Editorial'

const TXN = [
  ['transaction_id', 'TX_2026_08_24_0117'],
  ['type', 'CASH_OUT'],
  ['amount', '9,999,996.00'],
  ['nameOrig', 'C333462355'],
  ['nameDest', 'C1697378157'],
  ['step', '1'],
]

const MODELS = [
  { key: 'graph', label: 'Network', model: 'GraphSAGE', score: 0.50, colour: 'var(--tw-modality-graph, #0f9b8e)',
    finding: 'HUB_AND_SPOKE — 4 senders converging on one sink' },
  { key: 'behavioural', label: 'Behaviour', model: 'Stratified VAE', score: 0.88, colour: '#dc2649',
    finding: 'Reconstruction error 4.2σ above this account’s baseline' },
  { key: 'temporal', label: 'Timing', model: 'System-Context TCN', score: 0.92, colour: '#c2740a',
    finding: 'Burstiness 0.92 — machine-paced, not human' },
]

const STEPS = [
  {
    title: 'One record arrives.',
    body: 'Ten fields. Nothing here says fraud — the amount is large but legal, the accounts are unremarkable, and no single value crosses a rule threshold.',
  },
  {
    title: 'Three models read it differently.',
    body: 'They run in parallel, each looking at a signal the others cannot see: who pays whom, whether the account is acting like itself, and whether the rhythm is human.',
  },
  {
    title: 'The network sees a shape.',
    body: 'Four senders converge on one account, all brand-new. In isolation each transfer is ordinary; together they are a collection funnel.',
  },
  {
    title: 'Fusion weighs what it has.',
    body: 'A meta-classifier combines the available verdicts. A detector that is unreachable abstains rather than voting zero — absence is not innocence.',
  },
  {
    title: 'And it writes the case.',
    body: 'Retrieval pulls the matching FATF typology, and every sentence cites a model output or a retrieved document. What lands on the analyst’s desk is evidence, not a number.',
  },
]

const REPORT = [
  'CRITICAL — coordinated mule activity',
  'Sink account C1697378157 received 4 transfers',
  'from accounts with no prior history.',
  'Pattern matches FATF typology: hub-and-spoke',
  'placement via newly opened accounts.',
]

export default function TransactionStory() {
  const root = useRef(null)

  useGSAP(
    () => {
      const stepEls = gsap.utils.toArray('.story-step')

      // Reduced motion: present everything at once, statically stacked.
      if (prefersReducedMotion()) {
        gsap.set(stepEls, { position: 'static', opacity: 1, y: 0 })
        gsap.set('.story-row, .story-fuse, .story-report-line, .story-field', { opacity: 1, y: 0 })
        gsap.set('.story-bar-fill', { scaleX: 1 })
        return
      }

      gsap.set(stepEls, { opacity: 0, y: 24 })
      gsap.set(stepEls[0], { opacity: 1, y: 0 })

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: '+=400%',
          pin: true,
          scrub: 0.6,
        },
      })

      // 1 — the record assembles field by field
      tl.to('.story-field', { opacity: 1, y: 0, stagger: 0.12, duration: 1 })

      // 2 — hand off to the detectors
      tl.to(stepEls[0], { opacity: 0, y: -24, duration: 0.5 }, '+=0.6')
        .to(stepEls[1], { opacity: 1, y: 0, duration: 0.5 }, '<')
        .to('.story-row', { opacity: 1, y: 0, stagger: 0.18, duration: 0.6 }, '<0.2')
        .to('.story-bar-fill', { scaleX: (i) => MODELS[i].score, stagger: 0.18, duration: 1 }, '<0.1')

      // 3 — the network finding is the one that needs explaining
      tl.to(stepEls[1], { opacity: 0, y: -24, duration: 0.5 }, '+=0.8')
        .to(stepEls[2], { opacity: 1, y: 0, duration: 0.5 }, '<')
        .to('.story-row-graph', { borderColor: 'rgba(168,85,247,0.5)', duration: 0.4 }, '<')
        .to('.story-finding-graph', { opacity: 1, height: 'auto', duration: 0.5 }, '<0.1')

      // 4 — fusion
      tl.to(stepEls[2], { opacity: 0, y: -24, duration: 0.5 }, '+=0.8')
        .to(stepEls[3], { opacity: 1, y: 0, duration: 0.5 }, '<')
        .to('.story-fuse', { opacity: 1, y: 0, duration: 0.6 }, '<0.1')
        .to('.story-fuse-fill', { scaleX: 0.91, duration: 0.9 }, '<0.2')

      // 5 — the written report
      tl.to(stepEls[3], { opacity: 0, y: -24, duration: 0.5 }, '+=0.8')
        .to(stepEls[4], { opacity: 1, y: 0, duration: 0.5 }, '<')
        .to('.story-report', { opacity: 1, duration: 0.4 }, '<')
        .to('.story-report-line', { opacity: 1, y: 0, stagger: 0.2, duration: 0.5 }, '<0.1')
        .to({}, { duration: 1.2 })          // hold before releasing the pin
    },
    { scope: root },
  )

  return (
    <section ref={root} className="relative overflow-hidden border-y border-subtle bg-sentinel-950">
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16">
        {/* ── Left: the story, one step at a time ─────────────────────── */}
        <div className="relative">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight text-slate-200 sm:text-5xl">
            Follow one transaction
            <br />
            <span className="text-accent-500">through the system</span>
          </h2>

          <div className="relative mt-10 min-h-[11rem]">
            {STEPS.map((s) => (
              <div key={s.title} className="story-step absolute inset-x-0 top-0">
                <p className="text-xl font-semibold text-slate-200">{s.title}</p>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400">{s.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: the panel that animates ──────────────────────────── */}
        <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-2xl sm:p-6">
          {/* Record */}
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Incoming record
          </p>
          <dl className="mt-3 space-y-1.5 font-mono text-xs">
            {TXN.map(([k, v]) => (
              <div
                key={k}
                className="story-field flex justify-between gap-4 opacity-0"
                style={{ transform: 'translateY(8px)' }}
              >
                <dt className="text-slate-600">{k}</dt>
                <dd className="truncate text-slate-300">{v}</dd>
              </div>
            ))}
          </dl>

          {/* Detectors */}
          <div className="mt-6 space-y-2.5">
            {MODELS.map((m) => (
              <div
                key={m.key}
                className={`story-row story-row-${m.key} rounded-xl border border-subtle bg-sentinel-950 p-3 opacity-0`}
                style={{ transform: 'translateY(10px)' }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-200">{m.label}</span>
                  <span className="font-mono text-[10px] text-slate-600">{m.model}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="story-bar-fill h-full origin-left rounded-full"
                    style={{ background: m.colour, transform: 'scaleX(0)' }}
                  />
                </div>
                <div
                  className={`story-finding-${m.key} overflow-hidden opacity-0`}
                  style={{ height: 0 }}
                >
                  <p className="pt-2 text-[11px] leading-snug text-slate-400">{m.finding}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Fusion */}
          <div
            className="story-fuse mt-5 rounded-xl border border-accent-500/30 bg-accent-500/[0.06] p-3 opacity-0"
            style={{ transform: 'translateY(10px)' }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-200">Fused verdict</span>
              <span className="font-mono text-xs font-bold text-accent-400">0.91</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="story-fuse-fill h-full origin-left rounded-full bg-accent-500"
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
          </div>

          {/* Report */}
          <div className="story-report mt-5 rounded-xl border border-subtle bg-sentinel-950 p-3 opacity-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Forensic report
            </p>
            <div className="mt-2 space-y-1">
              {REPORT.map((line, i) => (
                <p
                  key={line}
                  className={`story-report-line font-mono text-[11px] leading-relaxed opacity-0 ${
                    i === 0 ? 'font-semibold text-risk-critical' : 'text-slate-400'
                  }`}
                  style={{ transform: 'translateY(6px)' }}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
