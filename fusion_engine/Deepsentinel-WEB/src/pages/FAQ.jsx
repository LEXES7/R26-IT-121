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
        a: 'DeepSentinel is a cloud-native AI research platform built for financial fraud detection. It combines three deep learning models (Graph Neural Network, Behavioral VAE, and Temporal CNN) with a Retrieval-Augmented Generation (RAG) layer to produce forensic investigation reports that are legally traceable and audit-ready.',
      },
      {
        q: 'What problem does it solve?',
        a: 'Existing fraud detection systems produce a risk score but no explanation. Compliance investigators cannot file a Suspicious Activity Report (SAR) based on a number alone. DeepSentinel bridges this gap by generating a structured 5-section forensic report where every claim is anchored to a real model output and a documented FATF financial crime typology.',
      },
      {
        q: 'How is this different from SHAP or LIME?',
        a: 'SHAP and LIME produce feature attribution numbers (e.g. "Feature 7 contributed 0.34"). While useful for data scientists, these cannot serve as legal forensic evidence. DeepSentinel generates narrative reports that explicitly reference regulatory definitions — the kind of evidence an AML investigator can submit to a Central Bank.',
      },
      {
        q: 'Is this a production system?',
        a: 'DeepSentinel is a research platform for multi-modal, explainable fraud detection. The Fusion Engine, RAG retrieval, and LLM reporting are fully functional and deployed. The upstream deep learning models (GNN, VAE, TCN) are currently simulated via scenario-based mock scores while the other team members finalize their components.',
      },
    ],
  },
  {
    category: 'How the Technology Works',
    items: [
      {
        q: 'What are the three detection models?',
        a: 'Graph Neural Network (GraphSAGE): analyses the network topology of transactions to detect mule rings and hub-and-spoke laundering. Behavioral VAE: flags transactions that deviate from an account\'s established behavioral baseline. Temporal CNN: detects mechanically regular, high-frequency transfer patterns that indicate automated fraud scripts.',
      },
      {
        q: 'What is the Fraud Confidence Score?',
        a: 'It is the output of the Logistic Regression meta-classifier (fusion layer) that combines the three sub-model scores into a single probability between 0 and 1. A score above 0.80 is classified CRITICAL, 0.65–0.80 is HIGH, 0.50–0.65 is MEDIUM, and below 0.50 is LOW. If an upstream model is unavailable, a 10% confidence penalty is applied per missing modality.',
      },
      {
        q: 'What is RAG and why does it matter here?',
        a: 'Retrieval-Augmented Generation (RAG) means the LLM retrieves relevant information before generating text. In DeepSentinel, the fused risk profile is converted into a natural language query, which searches a local ChromaDB vector database of FATF typologies. The retrieved typology document then becomes the LLM\'s only permitted source of fraud pattern information — preventing hallucination.',
      },
      {
        q: 'What are FATF typologies?',
        a: 'FATF (Financial Action Task Force) is the global anti-money laundering standards body. Their typologies are documented patterns of financial crime — Smurfing, Layering, Mule Networks, Account Takeover, Trade-Based Money Laundering, and others. DeepSentinel\'s knowledge base contains 10 of these typologies, each with specific behavioral indicators that the LLM is constrained to reference.',
      },
      {
        q: 'What is Chain-of-Evidence prompting?',
        a: 'It is a prompt engineering technique that forces the LLM to follow strict rules: it may only cite the numerical scores it was given, may only reference fraud patterns from the retrieved FATF typology, must cite the FATF typology ID in every claim, and must produce output in an exact 5-section format. These 8 rules eliminate the hallucination risk present in free-form LLM forensic generation.',
      },
    ],
  },
  {
    category: 'Using the Analyzer',
    items: [
      {
        q: 'What do the fraud scenarios mean?',
        a: 'Each scenario simulates a different type of financial crime: Mule Network (hub-and-spoke fund routing), Layering (multi-hop transaction chains), Smurfing (many small transactions below reporting thresholds), Account Takeover (sudden drain from a legitimate account), Velocity Fraud (machine-speed automated transfers), and Legitimate (normal customer transaction). Each scenario generates realistic mock scores for the three models.',
      },
      {
        q: 'What is the Ablation Study toggle?',
        a: 'The ablation study runs the same fraud scenario through two versions simultaneously: the Baseline LLM (no RAG — receives only the raw scores and generates freely) and DeepSentinel (full RAG-grounded system). Side by side, you can see the baseline hallucinating fraud patterns it was not told about, while DeepSentinel anchors every claim to the retrieved FATF definition. This is the core proof of the research novelty.',
      },
      {
        q: 'What does the cosine similarity score on the FATF match mean?',
        a: 'It measures how closely the natural language description of the risk profile matches the stored FATF typology, on a scale from 0% (no match) to 100% (perfect match). Scores above 65% indicate a reliable typology match. The system always retrieves the single best match from the 10 typologies.',
      },
      {
        q: 'Why does it say "Demo Mode — Simulated Upstream Scores"?',
        a: 'The three upstream deep learning models (GNN, VAE, TCN) are built by other team members whose APIs are not yet deployed. Until they are live, DeepSentinel generates realistic mock scores using scenario-based probability ranges. The Fusion Engine, RAG retrieval, and LLM forensic report are fully real and operational regardless of the mock scores.',
      },
    ],
  },
]

function AccordionItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${open ? 'border-accent-500/30 bg-blue-500/5' : 'border-white/7 bg-white/[0.02]'}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
      >
        <span className={`font-medium text-sm ${open ? 'text-slate-200' : 'text-slate-300'}`}>{q}</span>
        <span className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-xs transition-all ${open ? 'border-blue-500/50 text-accent-500 rotate-45' : 'border-white/15 text-slate-500'}`}>
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
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg" />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent-500/10 blur-[120px]"
        />
        <div className="relative mx-auto max-w-4xl px-4 py-20 sm:px-6">
          <Reveal>
            <Eyebrow>Frequently asked</Eyebrow>
            <Display lead="Everything you need" accent="to know" className="mt-4" />
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              How the platform works, what the research actually shows, and how to
              read what the analyzer gives you back.
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
                className="w-full rounded-xl border border-subtle bg-surface py-3 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-strong focus:outline-none"
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
            Nothing matches “{query}”. Try a broader word, or ask the assistant —
            it reads the project documentation directly.
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
          <div className="relative overflow-hidden rounded-2xl border border-subtle bg-surface p-8 text-center sm:p-10">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-accent-500/10 blur-3xl"
            />
            <div className="relative">
              <p className="text-xl font-semibold text-slate-200">Still have a question?</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                The project assistant answers from the documentation itself and
                cites where each answer came from — or run a real transaction
                through the analyzer.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/analyzer"
                  className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-sentinel-950 transition hover:bg-slate-200"
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
