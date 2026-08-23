import { useState } from 'react'
import { Link } from 'react-router-dom'

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
        a: 'DeepSentinel is a research platform built for SLIIT Final Year Research Project 2026. The Fusion Engine, RAG retrieval, and LLM reporting are fully functional and deployed. The upstream deep learning models (GNN, VAE, TCN) are currently simulated via scenario-based mock scores while the other team members finalize their components.',
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
    <div className={`border rounded-xl overflow-hidden transition-colors ${open ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/7 bg-white/[0.02]'}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
      >
        <span className={`font-medium text-sm ${open ? 'text-white' : 'text-slate-300'}`}>{q}</span>
        <span className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-xs transition-all ${open ? 'border-blue-500/50 text-blue-400 rotate-45' : 'border-white/15 text-slate-500'}`}>
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
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 space-y-16">

      {/* Header */}
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-4 py-1.5 rounded-full font-medium">
          Frequently Asked Questions
        </div>
        <h1 className="text-4xl font-bold text-white">Everything you need to know</h1>
        <p className="text-slate-400 text-lg leading-relaxed">
          Questions about the platform, the research, and how to use the Analyzer.
          Can't find your answer?{' '}
          <Link to="/about" className="text-blue-400 hover:text-blue-300 transition-colors">
            Reach out to the team →
          </Link>
        </p>
      </div>

      {/* FAQ sections */}
      {FAQS.map(section => (
        <section key={section.category} className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
            {section.category}
          </h2>
          <div className="space-y-2">
            {section.items.map(item => (
              <AccordionItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </section>
      ))}

      {/* Bottom CTA */}
      <div className="card p-8 text-center space-y-4">
        <p className="text-white font-semibold text-lg">Ready to see it live?</p>
        <p className="text-slate-400 text-sm">
          Run any fraud scenario through the full pipeline — Fusion, RAG retrieval, and LLM forensic report.
        </p>
        <Link
          to="/analyzer"
          className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold px-7 py-3 rounded-xl transition-all text-sm shadow-lg shadow-blue-600/20"
        >
          Open Transaction Analyzer →
        </Link>
      </div>

    </div>
  )
}
