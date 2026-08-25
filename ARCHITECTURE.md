# DeepSentinel — how the system fits together

Four detection components feed one fusion engine, which produces a grounded
forensic report and serves a web application. This document explains what each
piece does, how a transaction flows through them, and where the seams are.

For getting it running, see [SETUP.md](SETUP.md).

---

## 1. The shape of the system

```
                    ┌──────────────────────────────────────┐
                    │  Deepsentinel-WEB   (React, :5173)   │
                    │  Monitor · Analyzer · Assistant       │
                    └───────────────┬──────────────────────┘
                                    │  REST + SSE
                    ┌───────────────▼──────────────────────┐
                    │  Fusion engine backend  (:8090)      │
                    │  FastAPI — backend.main:app          │
                    │                                       │
                    │  monitor/  always-on screening loop   │
                    │  pipeline  score → fuse → retrieve →  │
                    │            generate report            │
                    │  chatbot/  public project Q&A         │
                    │  assistant/ licensed operator agent   │
                    └───┬──────────────┬──────────────┬─────┘
                        │              │              │
          ┌─────────────▼──┐  ┌────────▼──────┐  ┌────▼──────────┐
          │ GraphSAGE      │  │ Behavioural   │  │ Temporal      │
          │ :8000  LIVE    │  │ VAE + DSAA    │  │ TS-TCN        │
          │                │  │ not built     │  │ not implemented│
          └────────────────┘  └───────────────┘  └───────────────┘
```

Only the graph detector is deployed today. The system is designed so the other
two can be added with a URL and no code change — see §6.

---

## 2. GraphSAGE — the relational detector

**Repo:** `GraphSage/` (mirrored from a standalone component repo)
**Runs as:** `uvicorn graphsage.api.app:app --port 8000`

### What it does

Models the banking network as a directed graph — accounts are nodes, transfers
are edges — and scores an account's probability of being a fraud sink. The
insight it encodes is that PaySim fraud is structural: senders are disposable
one-shot accounts, while the *receiving* account persists across a ring. So the
score attaches to the destination, not the sender.

### Three novelties

| | What | Status |
|---|---|---|
| 1 | **Edge-MLP attention** — per-edge weight from `(amount, drain_ratio, src_drained, dst_was_empty, time_gap, txn_type)` | Retained for **explainability**, not accuracy — see below |
| 2 | **Graph-aware imbalance sampler** + Focal Loss — extracts intact k-hop fraud-ring subgraphs rather than destroying topology the way SMOTE does | Significant contributor |
| 3 | **Suspicious subgraph extractor** — k=2 walk from every flagged node producing a forensic JSON payload | The evidence layer |

Novelty 1 does **not** improve detection accuracy. Three independent ablations
agree, and with the 12-dim feature set removing it significantly *improves* F1
(−0.0102, p=0.031). It is kept because its attention weights are what let the
extractor rank which transfers implicate an account — the `weight` on every edge
the forensic report cites. Full reasoning in
[GraphSage/docs/novelty1_position.md](GraphSage/docs/novelty1_position.md).

### Results (leakage-free)

Evaluated under a temporal snapshot protocol — features and message passing use
past-only edges (train ≤ step 600, val ≤ 700, test > 700), so no future
information reaches a prediction.

| Stage | F1 | PR-AUC | vs baseline |
|---|---|---|---|
| 1 — baseline | 0.2806 ± 0.0867 | 0.2411 | — |
| 3b — + sampler | 0.3944 ± 0.0077 | 0.3737 | +0.1138 (p=0.046) |
| **3c-v2 — best** | **0.4056 ± 0.0026** | **0.4479** | **+0.1250 (p=0.045)** |

Calibration matters as much as ranking here: raw focal-loss sigmoids have an
expected calibration error of 0.80. Isotonic regression brings that to **0.024**,
which is what makes the score usable as a probability by the fusion engine.

### How it serves

Two paths, chosen per request:

- **Precomputed** — a `serving_bundle.pt` holds graph tensors plus
  isotonic-calibrated node scores and per-edge attention. No model is
  instantiated; a request is a lookup plus subgraph extraction. This is what
  keeps p95 under the 500 ms budget.
- **Live inference** — when an account has no precomputed score (it was never in
  the snapshot), the trained network is loaded and run over its k-hop
  neighbourhood. This is what makes the model genuinely inductive rather than a
  lookup table. The response reports which path produced the score.

### Its API

```
POST /api/graph/analyze     score one transaction + return its subgraph
GET  /health                model version, stage, risk bands, node/edge counts
GET  /api/graph/runtime     is the network loaded, uptime, forward passes
GET  /api/graph/sample-transactions?n=20   real PaySim edges to replay
```

Risk bands are derived from the served score distribution, not hardcoded:
`HIGH` is exactly the validation-tuned decision threshold, `CRITICAL` the 99.5th
percentile of scored accounts. Fixed 0.25/0.5/0.75 cutoffs were written for raw
sigmoid output and would never fire against calibrated probabilities.

---

## 3. The fusion engine backend

**Path:** `fusion_engine/DeepSentinel/`
**Runs as:** `uvicorn backend.main:app --port 8090` (41 routes)

### The pipeline

`backend/pipeline.py` is a single generator that both `/analyze` and
`/analyze/stream` consume, so the one-shot and streaming endpoints cannot
diverge. Five stages, each emitting a timed event:

1. **Input** — validate the transaction (Pydantic)
2. **Models** — call all three detectors in parallel
3. **Fusion** — combine into one confidence via `MetaClassifier`
4. **Typology** — retrieve the closest FATF pattern from a ChromaDB vector store
5. **Report** — generate a forensic narrative constrained to the retrieved
   evidence

### Fusion and missing models

`backend/fusion_engine.py` fuses available scores and applies an **uncertainty
penalty** when detectors are missing. With only the graph model live, every
transaction runs 1-of-3 and the confidence is deliberately dragged down.

That is correct behaviour, not a bug — it is the graceful degradation the
proposal specifies. It also means alert volume is currently low by design.

### Grounding

`backend/rag/` retrieves FATF typologies by embedding similarity
(`all-MiniLM-L6-v2` via sentence-transformers, stored in ChromaDB). The prompt
builder then constrains the language model to cite only:

- the scores that earlier stages actually produced
- the one retrieved typology

The classification is **passed in**, not derived by the model — it cannot
disagree with the system's own banding, which removes a hallucination surface.

`scripts/evaluate_ablation.py` measures whether this grounding works, comparing
a grounded report against an ungrounded baseline on numeric fidelity and
typology grounding. Every check is a deterministic string or numeric comparison
against the evidence that went into the prompt — asking a language model to
grade another one would introduce the failure mode being measured.

### The always-on monitor

`monitor/` is what makes this a product rather than a demo. A loop pulls real
transactions, screens **every one** through GraphSAGE first, and escalates only
those above a watch threshold to the remaining detectors. Fraud that GraphSAGE
catches early triggers an immediate email; the confirmed alert follows after
fusion, categorised by severity.

State lives in bounded deques with an asyncio pub/sub, streamed to the browser
over SSE. Controls: `start`, `stop`, `pause`, `resume`, `restart`.

### The two assistants

- **`chatbot/`** — public project Q&A over the repo's own documentation. BM25
  lexical retrieval, chosen over embeddings because the corpus is small and
  domain-specific, where exact term matching outperforms semantic similarity.
- **`assistant/`** — a licensed operator agent with tools over live platform
  state. Gated: disabled by default, admin-enabled, entitled roles only.

---

## 4. The web application

**Path:** `fusion_engine/Deepsentinel-WEB/` · React + Vite + Tailwind

| Page | What it does |
|---|---|
| **Monitor** | Live screening: SSE stream, forking pipeline diagram, runtime controls |
| **Analyzer** | Pull a real transaction, run the full pipeline, watch each stage, read the evidence and report |
| **Assistant** | Operator agent (entitlement-gated) |
| **Settings** | Risk-manager recipients, alert thresholds, email template preview |
| Home / About / FAQ / Architecture | Public-facing, with scrollytelling |

### Two things worth knowing

**Theming.** CSS custom properties are mapped into Tailwind, so components
reference semantic names (`surface`, `risk-critical`) and never `dark:`
variants. The palette has three states: explicit light, explicit dark, and
system default — every token is defined on bare `:root` first, then overridden.

**The analyzer shows evidence, not just a score.** `GraphEvidence.jsx` renders
the real subgraph: the typology, the sink account funds converge on, implicated
accounts by role, and every transfer ranked by attention weight with the trigger
edge marked. An analyst cannot act on "0.87"; they can act on "these 12 accounts
fund this sink".

Reports export to PDF via `window.print()` against a print stylesheet, not a
canvas screenshot library — the result has selectable, searchable text and real
pagination.

---

## 5. A transaction end to end

```
1. Monitor pulls a real PaySim edge from GraphSAGE
2. POST /api/graph/analyze  →  calibrated score + k=2 subgraph + pattern
3. Below watch threshold?  →  recorded, stop here.
   Above?                  →  escalate
4. Behavioural + temporal called in parallel (currently unavailable → imputed
   at 0.5, excluded from the fused score, penalty applied)
5. MetaClassifier.fuse()   →  one confidence + classification band
6. RAG retrieval           →  closest FATF typology + similarity
7. LLM generates the report, constrained to steps 2–6
8. record_analysis()       →  persisted to analysis_records
9. Alert email if the band warrants it
10. Every stage streamed to the browser as it completes
```

---

## 6. Adding the remaining detectors

Both slots are already wired. Each needs one endpoint:

```
POST {base}/api/v1/classify
```

**Temporal (TS-TCN).** The contract is locked in
`TS-TCN/docs/api_contract.md` and our adapter already matches it: request nested
under `"transaction"`, response `fraud_probability`, evidence under
`attribution.peak_*`, and HTTP 503 treated as *warming up* rather than an outage
(the service needs 32 buffered transactions before it can score). Its
`classify()` currently raises `NotImplementedError`.

**Behavioural (VAE + DSAA).** Not yet built. Expected to return
`behavioral_risk_score`.

When they exist, set `TEMPORAL_API_BASE` and `BEHAVIORAL_API_BASE`. No code
change — the adapters, fusion, penalty logic and UI already handle all three.

---

## 7. Deliberate design decisions

| Decision | Why |
|---|---|
| Score the **destination** account | PaySim senders are one-shot; the sink persists across a ring |
| **Isotonic calibration** | Fusion needs probabilities, not rankings. ECE 0.80 → 0.024 |
| **Precompute scores**, infer live only on misses | Meets the 500 ms budget without giving up inductive capability |
| **Uncertainty penalty** for missing models | A placeholder must never be presented as a measurement |
| **BM25** for the chatbot, embeddings for FATF | Small exact-term corpus vs. large semantic one |
| Ground truth **stripped** before reaching the UI | It exists to measure the system, never to display as output |
| **One pipeline generator** for both endpoints | The streaming and one-shot paths cannot drift apart |
