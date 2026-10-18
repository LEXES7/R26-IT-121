import { Link } from 'react-router-dom'
import { Eyebrow } from '../components/Editorial'
import Reveal from '../components/Reveal'
import ModelChapters from '../components/ModelChapters'
import { cx } from '../components/ui'
import { LENS_ORDER, MODEL_LENS } from '../data/modelLens'
import { PHOTOS } from '../data/photos'
import { txnField } from '../data/workedExample'

/**
 * The architecture, for someone deciding whether to believe it.
 *
 * Two rules govern this page. Every model name is read from the component
 * reference data rather than restated here — a second copy drifted, and this
 * page was still calling the temporal detector a "TSCFD Temporal CNN" after it
 * had become something else. And no figure appears unless it was measured:
 * stage 03 previously advertised "F1 0.988", which is the meta-classifier's
 * cross-validation score on synthetic data it generated itself. That is a fit
 * diagnostic, not a detection result.
 */

const PIPELINE = [
  ['01', 'Transaction arrives',
   'Amount, counterparties and timing enter the pipeline. Nothing about the outcome is known.'],
  ['02', 'All three detectors read it at once',
   'The payment graph around the transaction, the account’s own behaviour, and the run '
   + 'of transactions it arrived in — scored in parallel, so the verdict costs whichever '
   + 'detector is slowest rather than all three added together.'],
  ['03', 'Three detectors, scored independently',
   'Network, behaviour and timing each return a probability and the reasoning behind it, and none of them sees another’s answer first. An earlier design ran the relational model as a gate on the other two; measured against a 400-transaction replay it cost half the frauds, because a gate in front of an independent detector cannot do better than the detector. A detector that cannot be reached abstains — it does not vote zero.'],
  ['04', 'Fusion, with an uncertainty penalty',
   'A meta-classifier combines what answered. When fewer than three contributed, the fused confidence is deliberately pulled toward the middle rather than reported as though nothing were missing.'],
  ['05', 'Retrieval anchors the narrative',
   'The fused profile queries a vector store of FATF typologies. The best match, not the model’s imagination, is what the report is allowed to cite.'],
  ['06', 'A forensic report an investigator can act on',
   'Chain-of-Evidence prompting constrains the language model to the retrieved typology and the actual scores, so every claim traces back to something recorded.'],
]

/* What each detector can and cannot see. A comparison grid makes the case for
   fusion far faster than three paragraphs: no single column has every tick. */
const CAPABILITY = {
  columns: ['Network', 'Behaviour', 'Timing'],
  rows: [
    ['Mule rings and collection funnels', true, false, false],
    ['Money split across many accounts', true, false, true],
    ['Account acting unlike itself', false, true, false],
    ['Sudden escalation in value', false, true, false],
    ['One transaction following another', false, false, true],
    ['A destination emptied before it receives', false, false, true],
    ['Works on a first-seen account', false, true, true],
    ['Explains itself with evidence', true, true, true],
  ],
}

const STACK = [
  ['Services', ['FastAPI', 'uvicorn', 'httpx', 'Pydantic']],
  ['Models', ['PyTorch Geometric', 'TensorFlow / Keras', 'scikit-learn', 'NumPy']],
  ['Retrieval', ['ChromaDB', 'sentence-transformers', 'all-MiniLM-L6-v2']],
  ['Generation', ['Gemini', 'Chain-of-Evidence prompting']],
  ['Interface', ['React 19', 'Vite 5', 'Tailwind CSS 3']],
  ['Delivery', ['Docker', 'docker compose', 'Postgres or SQLite']],
]

/* The services a deployment runs. Only the fusion API and the console face
   the outside; the detectors answer on an internal network. */
const SERVICES = [
  ['web', 'public', 'This site and the analyst console.'],
  ['fusion-api', 'public', 'The verdict, the report and the case record.'],
  ['graphsage', 'internal', 'The network detector.'],
  ['vae', 'internal', 'The behaviour detector.'],
  ['tstcn', 'internal', 'The timing detector.'],
]

const PRINCIPLES = [
  'Absence is not innocence. A detector that cannot be reached abstains; it never votes zero.',
  'Every sentence of the report cites a model output or a retrieved typology.',
  'Every analysis is kept in the history and the audit log, with who ran it and when.',
  'Thresholds are set on calibrated probabilities, so a cut-off means what it says.',
]

const LENS_TONE = {
  graph: { dot: 'bg-modality-graph', text: 'text-modality-graph', line: 'border-modality-graph' },
  behavioural: { dot: 'bg-modality-behavioral', text: 'text-modality-behavioral', line: 'border-modality-behavioral' },
  temporal: { dot: 'bg-modality-temporal', text: 'text-modality-temporal', line: 'border-modality-temporal' },
}
const LENS_NAME = { graph: 'Network', behavioural: 'Behaviour', temporal: 'Timing' }
const SERVICE_FOR = { graph: 'graphsage', behavioural: 'vae', temporal: 'tstcn' }

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent-400" fill="none"
         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/** A connector between two columns of the diagram, ending in an arrowhead. */
function Arrow() {
  return (
    <div aria-hidden className="relative">
      <span className="absolute left-0 right-2 top-1/2 border-t-[1.5px] border-dashed border-strong" />
      <span className="absolute right-0 top-1/2 -mt-[4.5px] h-0 w-0 border-y-[4.5px] border-l-8 border-y-transparent border-l-[rgb(var(--border-strong))]" />
    </div>
  )
}

export default function About() {
  return (
    <div className="overflow-x-clip pb-8">

      {/* ── the statement ──────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[88rem] px-5 pb-24 pt-14 sm:px-8 lg:pt-20">
        <div aria-hidden className="pointer-events-none absolute -right-56 -top-80 h-[38rem] w-[60rem] rounded-full blur-[120px]"
             style={{ background: 'rgb(var(--accent-500) / 0.14)' }} />
        <div className="relative grid items-center gap-14 lg:grid-cols-2">
          <Reveal className="flex flex-col items-start gap-6">
            <Eyebrow>Architecture</Eyebrow>
            <h1 className="display text-[3.25rem] leading-[0.92] text-slate-100 sm:text-[4.75rem] xl:text-[6rem]">
              One transaction,
              <br />
              <span className="display-italic text-accent-400">four readings.</span>
            </h1>
            <p className="max-w-[34rem] text-lg leading-relaxed text-slate-400">
              No single model sees fraud whole. The network layer reads
              structure, the behavioural layer reads deviation, the temporal
              layer reads what came immediately before, and a meta-classifier
              decides what to believe when they disagree. Retrieval then
              grounds the explanation in FATF typology, so every sentence of the
              report can point at its evidence.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/#pipeline"
                    className="liquid-solid cta-ink inline-flex items-center rounded-[14px] px-6 py-3.5 text-[15px] font-semibold">
                See the walkthrough
              </Link>
              <Link to="/components/network"
                    className="liquid arrow-slide inline-flex items-center gap-2 rounded-[14px] px-6 py-3.5 text-[15px] font-semibold text-slate-200">
                Read the components <span aria-hidden className="arrow inline-block">&rarr;</span>
              </Link>
            </div>
          </Reveal>

          <div className="relative min-h-[30rem] lg:min-h-[40rem]">
            <div className="photo-frame photo-arch absolute inset-0 lg:left-16">
              <img src={PHOTOS.serverCorridor.src} alt={PHOTOS.serverCorridor.alt}
                   className="photo-dim" style={{ objectPosition: '55% center' }} />
            </div>
            {/* Placed by wrappers: .glass sets its own position. */}
            <div className="absolute left-0 top-36 w-[18rem] max-w-full">
              <div className="glass solid-card orbit-bob rounded-[20px] p-[18px]" style={{ '--bob': '6.5s' }}>
                <p className="eyebrow text-slate-500">Read in parallel</p>
                <ul className="mt-3 grid gap-2.5">
                  {LENS_ORDER.map((k) => (
                    <li key={k} className="flex items-center gap-2.5 text-[13px]">
                      <span className={cx('h-2 w-2 shrink-0 rounded-full', LENS_TONE[k].dot)} />
                      <span className="font-semibold text-slate-100">{LENS_NAME[k]}</span>
                      <span className="truncate text-slate-400">{MODEL_LENS[k].question}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="absolute bottom-10 right-5 hidden sm:block">
              <span className="glass solid-card inline-flex rounded-full px-4 py-2.5 text-[13px] text-slate-300">
                Every sentence cites its evidence
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── the path of one transfer ───────────────────────────────────── */}
      <section className="border-y border-subtle bg-sentinel-900">
        <div className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="display text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.75rem]">
              The path of <span className="display-italic text-accent-400">one transfer.</span>
            </h2>
            <p className="max-w-md text-base leading-relaxed text-slate-400">
              From the record arriving to the report an investigator files. The
              three detectors run in parallel; nothing waits on the slowest
              unless it has to.
            </p>
          </div>
          <div className="mt-12 overflow-x-auto pb-2">
            <div className="grid min-w-[68rem] items-stretch"
                 style={{ gridTemplateColumns: 'minmax(0,1fr) 3.5rem minmax(0,1.25fr) 3.5rem minmax(0,1fr) 3.5rem minmax(0,1fr) 3.5rem minmax(0,1fr)' }}>
              <div className="flex items-center">
                <div className="glass solid-card w-full rounded-[20px] p-5">
                  <p className="eyebrow text-slate-500">In</p>
                  <p className="mt-2.5 text-lg font-semibold text-slate-100">Transaction</p>
                  <p className="numeric mt-2 text-xs leading-relaxed text-slate-400">
                    {txnField('type')} · {txnField('amount')}<br />
                    {txnField('nameOrig')} → {txnField('nameDest')}
                  </p>
                </div>
              </div>
              <div aria-hidden className="relative">
                <span className="absolute left-0 top-1/2 w-1/2 border-t-[1.5px] border-strong" />
                <span className="absolute left-1/2 top-[16.5%] bottom-[16.5%] border-l-[1.5px] border-strong" />
                {['top-[16.5%]', 'top-1/2', 'bottom-[16.5%]'].map((pos, i) => (
                  <span key={pos} className={cx('absolute left-1/2 right-0 border-t-[1.5px]', pos,
                                                LENS_TONE[LENS_ORDER[i]].line)} />
                ))}
              </div>
              <div className="grid grid-rows-3 gap-3.5">
                {LENS_ORDER.map((k) => (
                  <div key={k} className="glass solid-card flex flex-col justify-center gap-1.5 rounded-[20px] px-[18px] py-4">
                    <span className="flex items-center gap-2">
                      <span className={cx('h-2.5 w-2.5 rounded-full', LENS_TONE[k].dot)} />
                      <span className="text-base font-semibold text-slate-100">{LENS_NAME[k]}</span>
                      <span className={cx('numeric ml-auto text-[11px]', LENS_TONE[k].text)}>{SERVICE_FOR[k]}</span>
                    </span>
                    <span className="text-[13px] text-slate-400">{MODEL_LENS[k].question}</span>
                  </div>
                ))}
              </div>
              <div aria-hidden className="relative">
                {['top-[16.5%]', 'top-1/2', 'bottom-[16.5%]'].map((pos, i) => (
                  <span key={pos} className={cx('absolute left-0 w-1/2 border-t-[1.5px]', pos,
                                                LENS_TONE[LENS_ORDER[i]].line)} />
                ))}
                <span className="absolute left-1/2 top-[16.5%] bottom-[16.5%] border-l-[1.5px] border-strong" />
                <span className="absolute left-1/2 right-2 top-1/2 border-t-[1.5px] border-dashed border-strong" />
                <span className="absolute right-0 top-1/2 -mt-[4.5px] h-0 w-0 border-y-[4.5px] border-l-8 border-y-transparent border-l-[rgb(var(--border-strong))]" />
              </div>
              <div className="flex items-center">
                <div className="fusion-anchor w-full rounded-[20px] p-5">
                  <p className="eyebrow text-accent-400">Fusion</p>
                  <p className="mt-2.5 text-lg font-semibold text-slate-100">One verdict</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
                    Weighs whichever detectors answered. A missing one abstains.
                  </p>
                </div>
              </div>
              <Arrow />
              <div className="flex items-center">
                <div className="glass solid-card w-full rounded-[20px] p-5">
                  <p className="eyebrow text-slate-500">Retrieval</p>
                  <p className="mt-2.5 text-lg font-semibold text-slate-100">FATF typology</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
                    Matched on the detectors&rsquo; evidence and the transaction&rsquo;s facts.
                  </p>
                </div>
              </div>
              <Arrow />
              <div className="flex items-center">
                <div className="glass solid-card w-full rounded-[20px] p-5"
                     style={{ borderColor: 'rgb(var(--accent-500) / 0.6)' }}>
                  <p className="eyebrow text-accent-400">Out</p>
                  <p className="mt-2.5 text-lg font-semibold text-slate-100">Forensic report</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
                    Every sentence cites a model output or a retrieved document.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── the pipeline ───────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-[88rem] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>The pipeline</Eyebrow>
          <h2 className="display mt-4 text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.5rem]">
            Six stages,{' '}
            <span className="display-italic text-accent-400">arrival to report.</span>
          </h2>
        </Reveal>
        <div className="rows">
          {PIPELINE.map(([step, label, desc], i) => (
            <Reveal key={step} delay={i * 70}>
              <div className="grid gap-x-8 gap-y-2 py-7 md:grid-cols-[3.5rem_minmax(0,1fr)]">
                <span className="display text-[2.25rem] leading-none text-accent-400">{step}</span>
                <div>
                  <p className="text-lg font-semibold leading-snug text-slate-100">{label}</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── what each can see ──────────────────────────────────────────── */}
      <section className="border-y border-subtle bg-sentinel-900">
        <div className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
          <Reveal className="max-w-3xl">
            <Eyebrow>Why three</Eyebrow>
            <h2 className="display mt-4 text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.75rem]">
              What each one can see,{' '}
              <span className="display-italic text-accent-400">and what it cannot.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-400">
              They do not disagree because one is better. They disagree because
              each reads a different slice of the same event, which is the whole
              argument for fusion, and why a missing detector abstains rather
              than voting zero.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {LENS_ORDER.map((k, i) => {
              const l = MODEL_LENS[k]
              return (
                <Reveal key={k} delay={i * 90}>
                  <article className="glass solid-card flex h-full flex-col gap-4 rounded-[24px] p-6">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="display text-[2.25rem] leading-none text-slate-100">{LENS_NAME[k]}</span>
                      <span className={cx('eyebrow', LENS_TONE[k].text)}>{l.axis}</span>
                    </div>
                    <p className="text-[15px] leading-relaxed text-slate-300">{l.mechanism}</p>
                    <div className="mt-auto grid gap-3 border-t border-subtle pt-4 text-sm leading-relaxed text-slate-400">
                      <p><span className="font-semibold text-slate-100">Reads</span> · {l.reads}</p>
                      <p><span className="font-semibold text-slate-100">Blind to</span> · {l.blind}</p>
                    </div>
                  </article>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={120} className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="hair-b eyebrow py-3 pr-4 text-left text-slate-500">Signal</th>
                  {CAPABILITY.columns.map((c) => (
                    <th key={c} className="hair-b eyebrow px-3 py-3 text-center text-slate-400">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="rows">
                {CAPABILITY.rows.map(([label, ...cells]) => (
                  <tr key={label}>
                    <td className="py-3.5 pr-4 text-slate-300">{label}</td>
                    {cells.map((on, i) => (
                      <td key={i} className="px-3 py-3.5 text-center">
                        {on ? (
                          <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4 text-accent-400"
                               fill="none" stroke="currentColor" strokeWidth="2.5"
                               strokeLinecap="round" strokeLinejoin="round" aria-label="yes">
                            <path d="m5 13 4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="mx-auto block h-[1.5px] w-3 rounded bg-slate-600/50" aria-label="no" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      {/* ── built to be audited ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
        <div className="grid items-center lg:grid-cols-2">
          <div className="photo-frame relative min-h-[26rem] rounded-[2rem] lg:min-h-[36rem]">
            <img src={PHOTOS.operationsFloor.src} alt={PHOTOS.operationsFloor.alt}
                 loading="lazy" className="photo-dim absolute inset-0" />
          </div>
          <div className="relative -mt-16 px-4 lg:-ml-16 lg:mt-0 lg:px-0">
            <div className="glass solid-card rounded-[28px] p-8 sm:p-10">
              <Eyebrow>Built to be audited</Eyebrow>
              <h2 className="display mt-4 text-[2.5rem] leading-none text-slate-100 sm:text-[3.25rem]">
                For the team that has to <span className="display-italic text-accent-400">answer for it.</span>
              </h2>
              <ul className="mt-6">
                {PRINCIPLES.map((p) => (
                  <li key={p} className="flex gap-3 border-t border-subtle py-4 text-[15px] leading-relaxed text-slate-300 last:border-b">
                    <Check />{p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── what a deployment runs ─────────────────────────────────────── */}
      <section className="border-y border-subtle bg-sentinel-900">
        <div className="mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="display text-[2.75rem] leading-[0.98] text-slate-100 sm:text-[3.5rem]">
              Five services, <span className="display-italic text-accent-400">one front door.</span>
            </h2>
            <p className="max-w-md text-base leading-relaxed text-slate-400">
              Each detector ships as its own evaluated API on an internal network,
              so one can be replaced without touching the others. Only the
              fusion API and the console face the outside.
            </p>
          </div>
          <div className="mt-10 grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))' }}>
            {SERVICES.map(([name, reach, what]) => (
              // The edge is inline: on the light theme the solid card sets its
              // own border colour, which would beat a utility class.
              <div key={name}
                   className="glass solid-card flex flex-col gap-2.5 rounded-[20px] p-5"
                   style={name === 'fusion-api' ? { borderColor: 'rgb(var(--accent-500) / 0.6)' } : undefined}>
                <span className={cx('self-start rounded-full border border-subtle px-2.5 py-0.5 text-[11px]',
                                    reach === 'public' ? 'text-accent-400' : 'text-slate-400')}>
                  {reach}
                </span>
                <span className="numeric text-[15px] text-slate-100">{name}</span>
                <span className="text-[13px] leading-relaxed text-slate-400">{what}</span>
              </div>
            ))}
          </div>

          <div className="mt-14 grid gap-x-10 gap-y-8 border-t border-subtle pt-10 sm:grid-cols-2 lg:grid-cols-3">
            {STACK.map(([layer, items]) => (
              <div key={layer}>
                <p className="eyebrow text-slate-500">{layer}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {items.map((item) => (
                    <span key={item} className="numeric rounded-full border border-subtle bg-surface px-2.5 py-1 text-xs text-slate-300">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── the four components ────────────────────────────────────────── */}
      <ModelChapters />

      {/* ── closing ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[88rem] px-5 pt-16 sm:px-8">
        <div className="fusion-anchor relative flex flex-wrap items-center justify-between gap-8 overflow-hidden rounded-[32px] px-8 py-14 sm:px-14">
          <span aria-hidden className="pointer-events-none absolute -right-40 -top-48 h-[26rem] w-[40rem] rounded-full blur-[90px]"
                style={{ background: 'rgb(45 212 191 / 0.22)' }} />
          <h2 className="display relative text-[2.5rem] leading-none text-slate-100 sm:text-[3.5rem]">
            See it read <span className="display-italic text-accent-400">your own transactions.</span>
          </h2>
          <div className="relative flex flex-wrap gap-3">
            <Link to="/signup" className="inline-flex items-center rounded-[14px] bg-[#F0EDE7] px-6 py-3.5 text-[15px] font-semibold text-[#0D0C0B]">
              Request access
            </Link>
            <Link to="/components/network"
                  className="inline-flex items-center rounded-[14px] border border-white/20 bg-white/[0.08] px-6 py-3.5 text-[15px] font-semibold text-[#F0EDE7]">
              Read the components
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
