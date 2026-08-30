import { Link } from 'react-router-dom'
import { Eyebrow } from '../components/Editorial'
import Reveal from '../components/Reveal'
import { COMPONENTS as COMPONENT_DATA, COMPONENT_ORDER } from '../data/components'

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

const MODALITY_TEXT = {
  graph: 'text-modality-graph',
  behavioral: 'text-modality-behavioral',
  temporal: 'text-modality-temporal',
  fusion: 'text-accent-400',
}

const PIPELINE = [
  ['01', 'Transaction arrives',
   'Amount, counterparties and timing enter the pipeline. Nothing about the outcome is known.'],
  ['02', 'All three detectors read it at once',
   'The payment graph around the transaction, the account\u2019s own behaviour, and the run '
   + 'of transactions it arrived in \u2014 scored in parallel, so the verdict costs whichever '
   + 'detector is slowest rather than all three added together.'],
  ['03', 'Three detectors, scored independently',
   'Network, behaviour and timing each return a probability and the reasoning behind it, and none of them sees another\u2019s answer first. An earlier design ran the relational model as a gate on the other two; measured against a 400-transaction replay it cost half the frauds, because a gate in front of an independent detector cannot do better than the detector. A detector that cannot be reached abstains \u2014 it does not vote zero.'],
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

export default function About() {
  const components = COMPONENT_ORDER.map((slug) => COMPONENT_DATA[slug])

  return (
    <div className="pb-24">

      {/* ── the statement ──────────────────────────────────────────────── */}
      <section className="hair-b relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg" />
        <div className="relative mx-auto max-w-[88rem] px-5 py-24 sm:px-8">
          <Reveal className="max-w-3xl">
            <Eyebrow>Architecture</Eyebrow>
            <h1 className="display mt-5 text-[3rem] text-slate-100 sm:text-[4rem]">
              Three detectors,{' '}
              <span className="display-italic text-accent-400">
                one defensible verdict.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400">
              No single model sees fraud whole. The network layer reads structure,
              the behavioural layer reads deviation, the temporal layer reads what
              came immediately before — and a meta-classifier decides what to
              believe when they disagree.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── the four components ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>The components</Eyebrow>
          <h2 className="display mt-4 text-[2.5rem] text-slate-100 sm:text-[3.25rem]">
            Four models,{' '}
            <span className="display-italic text-accent-400">shipped separately.</span>
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-slate-400">
            Each is its own evaluated, deployable API. The fusion engine consumes
            all three through a common adapter, so a detector can be replaced
            without touching the others.
          </p>
        </Reveal>

        <div className="rows mt-12">
          {components.map((c, i) => (
            <Reveal key={c.slug} delay={i * 80}>
              <Link
                to={`/components/${c.slug}`}
                className="group arrow-slide grid items-baseline gap-x-8 gap-y-2 rounded-lg px-3 py-7 -mx-3 transition-[background-color,transform] duration-300 hover:bg-surface hover:translate-x-1 md:grid-cols-[3rem_8rem_minmax(0,20rem)_minmax(0,1fr)_5rem]"
                style={{ transitionTimingFunction: 'var(--ease-hover)' }}
              >
                <span className="display text-[2rem] leading-none text-slate-700 transition-colors group-hover:text-slate-500">
                  0{i + 1}
                </span>
                <span className={`eyebrow ${MODALITY_TEXT[c.color] ?? 'text-slate-500'}`}>
                  {c.modality}
                </span>
                <span className="text-base font-semibold leading-snug text-slate-100">
                  {c.title}
                </span>
                <span className="text-sm leading-relaxed text-slate-400">
                  {c.question}
                </span>
                <span className="text-xs text-slate-600 transition-colors group-hover:text-accent-400 md:text-right">
                  Explore <span className="arrow inline-block">&rarr;</span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── the pipeline ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>The pipeline</Eyebrow>
          <h2 className="display mt-4 text-[2.5rem] text-slate-100 sm:text-[3.25rem]">
            Six stages,{' '}
            <span className="display-italic text-accent-400">arrival to report.</span>
          </h2>
        </Reveal>

        <div className="rows mt-12">
          {PIPELINE.map(([step, label, desc], i) => (
            <Reveal key={step} delay={i * 70}>
              <div className="grid gap-x-8 gap-y-2 py-7 md:grid-cols-[3rem_minmax(0,18rem)_minmax(0,1fr)]">
                <span className="display text-[2rem] leading-none text-slate-700">{step}</span>
                <p className="text-base font-semibold leading-snug text-slate-100">{label}</p>
                <p className="text-sm leading-relaxed text-slate-400">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── why three ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>Why three</Eyebrow>
          <h2 className="display mt-4 text-[2.5rem] text-slate-100 sm:text-[3.25rem]">
            No single model{' '}
            <span className="display-italic text-accent-400">sees all of it.</span>
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-slate-400">
            Each column has blind spots the others cover. That is the entire
            argument for fusion, and it is why a missing detector abstains rather
            than voting zero.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-12 overflow-x-auto">
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
                        <span className="text-slate-700" aria-label="no">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </section>

      {/* ── the stack ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>Built with</Eyebrow>
          <h2 className="display mt-4 text-[2.5rem] text-slate-100 sm:text-[3.25rem]">
            The stack,{' '}
            <span className="display-italic text-accent-400">end to end.</span>
          </h2>
        </Reveal>

        <div className="hair-t mt-12 grid gap-x-10 gap-y-10 pt-10 sm:grid-cols-2 lg:grid-cols-3">
          {STACK.map(([layer, items], i) => (
            <Reveal key={layer} delay={i * 60}>
              <div className={i % 3 !== 0 ? 'lg:hair-l lg:pl-10' : ''}>
                <p className="eyebrow text-slate-500">{layer}</p>
                <ul className="mt-3 space-y-1.5">
                  {items.map((item) => (
                    <li key={item} className="numeric text-xs text-slate-400">{item}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── closing ────────────────────────────────────────────────────── */}
      <section className="hair-t mx-auto max-w-[88rem] px-5 pt-14 sm:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-lg">
              <p className="display text-[2rem] text-slate-100">Each component, in depth.</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                What it detects, how it was evaluated, and what it hands to the
                fusion engine — including the results that did not go our way.
              </p>
            </div>
            <Link
              to="/components/network"
              className="hair border-b pb-1 text-sm text-slate-300 transition-colors hover:text-slate-100"
            >
              Explore components &rarr;
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
