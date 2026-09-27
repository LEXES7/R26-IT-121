# Member 4 — Fusion Engine & Retrieval-Grounded Forensic Reporting

**Vidanaarachchi T. M.** · R26-IT-121 · SLIIT
**Repository:** `fusion_engine/` in `LEXES7/R26-IT-121`
**Runs as:** `uvicorn backend.main:app --port 8090`
**API surface:** 40 endpoints in `backend/main.py`, plus 4 mounted routers (monitor, chatbot, assistant, enquiry)

---

## 1. What this component is for

The other three members each build a **detector**: a model that reads a
transaction one way and returns a number. This component is everything that
happens after those numbers exist.

It answers a question the detectors cannot:

> Three models produced three scores. What does that mean, and how would you
> justify acting on it to a regulator?

That splits into two problems.

**Combining the scores.** Three numbers on different scales, produced by models
that disagree, sometimes with one or two unavailable. A rule like "average
them" is arbitrary and cannot be defended. The fusion layer learns the
weighting instead, and degrades honestly when a detector is missing.

**Justifying the decision.** A score of `0.87` cannot support an account
freeze. An investigator needs a narrative; a regulator needs an audit trail.
The obvious fix — asking a language model to explain the score — makes things
worse, because an unconstrained model invents details that sound authoritative.
The reporting layer exists to make that impossible.

---

## 2. The research novelty

The claimed contribution is **retrieval-grounded forensic reporting with a
deterministic measurement of whether the grounding holds.**

Two halves, and the second is what makes it research rather than engineering.

### 2.1 Chain-of-Evidence prompting

`backend/rag/prompt_builder.py` constrains generation with explicit rules:

| Rule | What it prevents |
|---|---|
| Cite only the numerical scores supplied | Invented figures |
| Reference only the one retrieved FATF typology | Invented crime patterns |
| Cite the typology identifier | Unattributable claims |
| Mark an unavailable modality as such, never estimate it | A fabricated score for a model that never answered |
| No hedging language ("possibly", "might") | Narrative that cannot be acted on |

The **classification is passed in, not derived by the model**. It cannot
disagree with the system's own risk banding, which removes an entire class of
hallucination rather than asking the model not to commit it.

### 2.2 Measuring whether it works

Anyone can claim their prompt reduces hallucination. `scripts/evaluate_ablation.py`
measures it.

The same transaction is generated twice — once grounded, once with an
ungrounded baseline receiving only the raw scores — and both reports are scored
by **deterministic checks against the exact evidence in the prompt**.

No language model grades another language model. Doing so would introduce the
failure mode being measured.

| Measure | Question |
|---|---|
| Numeric fidelity | Does every figure in the report match a supplied value? |
| Typology grounding | Was the cited FATF identifier actually provided? |
| Pattern support | Do named laundering patterns appear in the retrieved text? |
| Missing-modality handling | Is an absent detector flagged, or given an invented score? |

**Result across five scenarios** (mule network, layering, smurfing, account
takeover, velocity fraud):

| | Grounded | Ungrounded baseline |
|---|---:|---:|
| Unsupported figures per report | **0** | 1–2 |

Reported as **preliminary** — n=5, limited by API quota. The contribution being
claimed is the measurement method, not the effect size.

---

## 3. What was built

### 3.1 Adapter layer — `backend/adapters/upstream.py`

Three members, three API schemas, three field names for "the score". This
normalises all of them into one internal shape, so a change to any detector's
contract is absorbed in one file.

It also handles the cases that are normal rather than exceptional: a `404` when
an account is not in the graph snapshot, a `NOT_APPLICABLE` verdict when a
transaction type is outside a model's scope, and a `503` while a service is
still loading.

### 3.2 Fusion — `backend/fusion_engine.py`

A logistic-regression meta-classifier over the three scores, producing one
calibrated confidence. It applies an **uncertainty penalty** when detectors are
missing.

With only the graph detector live, every transaction runs 1-of-3 and confidence
is deliberately dragged down. **This is correct behaviour, not a defect** — a
conclusion from one modality should not carry the weight of one from three.

> **Be careful with this number.** The classifier currently trains and
> cross-validates on data it generates itself, so its CV F1 is a *fit
> diagnostic*, not a detection accuracy measurement. Quoting it as system
> accuracy would not survive a panel question. A defensible figure needs
> labelled transactions scored by all three deployed detectors.

### 3.3 Retrieval — `backend/rag/`

- `knowledge_base.py` — builds a ChromaDB vector store of structured FATF
  money-laundering typologies
- `retriever.py` — embeds the fused risk profile (`all-MiniLM-L6-v2`) and
  returns the closest typology by cosine similarity
- `prompt_builder.py` — assembles the Chain-of-Evidence prompt, plus the
  ungrounded baseline prompt used by the ablation

### 3.4 Reporting — `backend/llm/forensic_reporter.py`

Gemini via the `google-genai` SDK, with Ollama as a local alternative.

Two details that matter:

- The system prompt is passed as a real `system_instruction`, not concatenated
  into the user turn. The constraints are the mechanism under evaluation, and
  instructions carry more weight in that channel.
- **An empty response raises rather than returning `""`.** Gemini 2.5+ spends
  tokens on internal reasoning before emitting output, against the same
  ceiling. When it runs out the body comes back *empty*, not truncated — a
  blank report with no error. The ceiling is 8192 and the failure now names
  its cause.

### 3.5 Pipeline — `backend/pipeline.py`

One async generator that **both** `/analyze` and `/analyze/stream` consume, so
the one-shot and streaming paths cannot drift apart.

Five stages, each emitting a timed event: input → models → fusion → retrieval →
report.

Every stage runs through `asyncio.to_thread`, because scoring, retrieval and
generation are synchronous and CPU-bound. Without that the event loop blocks
and every event flushes at the end — the streaming would be theatre.

**Measured stage timings:**

| Stage | Duration |
|---|---:|
| Input | ~0 ms |
| Models (3 calls, parallel) | ~2,450 ms |
| Fusion | ~1 ms |
| Typology retrieval | ~25 ms |
| Report generation | ~10,300 ms |

Report generation dominates by two orders of magnitude. That is the entire
justification for streaming: without it, an operator stares at nothing for ten
seconds.

### 3.6 Batch analysis — `backend/batch.py`

A bank does not analyse transactions one at a time. This accepts a CSV or Excel
file and scores every row.

Parsing is deliberately tolerant — case-insensitive headers, delimiter
sniffing, BOM handling for Excel exports, thousands separators stripped —
because a file that fails to load on a punctuation detail is how a demo stalls.
Errors name the offending row and say what to fix.

When an `isFraud` column is present it is read as ground truth and reported
back as precision, recall and a confusion matrix. **It never reaches the
models.**

Two safeguards, both found by testing:

- **Circuit breaker.** A 330-row file initially took over ten minutes because
  every row waited out the full timeout against three unreachable services.
  After three consecutive failures a modality is written off for the rest of
  the batch. Same file: **7.8 seconds**.
- **Unscored rows.** With no detector reachable, every score imputes to the
  same neutral value, which fuses above any threshold — the system would alert
  on *every* transaction. An alert with no evidence is worse than no alert.
  Rows scored with zero modalities are reported as unscored and excluded from
  the metrics.

### 3.7 Always-on monitor — `monitor/`

What makes this a product rather than a demo. A loop pulls real transactions
and screens **every one** through the graph detector first, escalating only
those above a watch threshold to the remaining detectors.

State lives in bounded deques with asyncio pub/sub, streamed to the browser
over SSE. Controls: start, stop, pause, resume, restart.

### 3.8 Platform layer

| Module | Purpose |
|---|---|
| `backend/auth.py` | JWT authentication, three roles, account lockout, audit logging |
| `backend/db/` | PostgreSQL/SQLite via SQLAlchemy — users, alert recipients, analysis history, audit log |
| `backend/config.py` | One config surface: environment > `config.ini` > default |
| `backend/email_service.py` | Fraud alert email via SMTP or SendGrid |
| `backend/settings.py` | Alert recipients, thresholds, analysis history |
| `backend/sar.py` | Suspicious Activity Report drafting — stored immutably, approval recorded, **nothing transmitted** |
| `backend/simulation.py` | Threshold replay: "if I move the line, how many more alerts and how many missed cases?" |
| `backend/packages.py` | Commercial tiering — **detection is never gated** |
| `chatbot/` | Public project Q&A over the repo's own documentation (BM25) |
| `assistant/` | Licensed operator agent with tools over live state, entitlement-gated |

### 3.9 Web application — `Deepsentinel-WEB/`

React + Vite + Tailwind.

| Page | Purpose |
|---|---|
| Monitor | Live screening with SSE stream and runtime controls |
| Analyzer | Run one transaction, watch each stage, read the evidence |
| Batch | Upload a file, watch every row scored, see the scorecard |
| Settings | Alert recipients, thresholds, email preview |
| Users / Audit Log | Administration |
| Home / About / FAQ | Public showcase |

**The analyzer shows evidence, not just a score.** `GraphEvidence.jsx` renders
the real subgraph — the sink account funds converge on, implicated accounts by
role, every transfer ranked by attention weight. An analyst cannot act on
"0.87"; they can act on "these 12 accounts fund this sink".

---

## 4. Roles — who can do what

| Role | Intended for | Access |
|---|---|---|
| `admin` | DeepSentinel team | Everything, including system configuration |
| `risk_manager` | Bank risk manager | Transactions, monitoring, alerts, recipients |
| `analyst` | Bank assistant manager | Read-only |

Every capability is enforced server-side. Hiding a button is usability; the
guard is the control.

---

## 5. Three roles, one API

```
POST /analyze                  score one transaction
POST /analyze/stream           the same, streamed stage by stage
POST /analyze/batch            score an uploaded file
GET  /analyses                 history
GET  /analyses/simulate        threshold replay
POST /analyses/{id}/sar        draft a Suspicious Activity Report
GET  /cases                    case queue
GET  /monitor/*                live screening state
POST /auth/login               authentication
```

40 endpoints in `main.py`, plus the monitor, chatbot, assistant and
enquiry routers mounted alongside them.

---

## 6. What is honest to claim, and what is not

This matters more than any feature list. Each item below is a question a panel
can ask.

### Claim confidently

- The pipeline runs end to end and every stage is timed by measurement
- Grounded reports produced **zero** untraceable figures across five scenarios
  where the ungrounded baseline produced 1–2
- The system degrades honestly: with no detectors reachable it reports rows as
  unscored rather than alerting on all of them
- The measurement method is deterministic and reproducible

### State the limitation before being asked

| Claim | The honest position |
|---|---|
| Fusion accuracy | **No end-to-end figure exists.** Only one detector is live, so fusion penalises every transaction. |
| Meta-classifier CV F1 | A fit diagnostic on self-generated data. Not detection accuracy. |
| Grounding study | n=5, quota-limited. Direction is consistent; effect size is not established. |
| Isotonic calibration (ECE 0.80 → 0.024) | **This is Member 1's result**, on the graph detector's score. The threshold simulator depends on it but did not produce it. |

### A correction found during development

The ablation's first run reported the **ungrounded baseline as more faithful** —
the opposite of the expected result.

That was a measurement defect, not a finding. The number extractor was pulling
`004` out of the cited identifier `FATF-004` and counting it as a fabricated
figure, several times per report. Because the prompt rules *require* citing the
identifier, the grounded arm was being penalised precisely for obeying its
instructions.

Identifiers are now stripped before numeric extraction, and figures quoted from
the retrieved typology count as grounded.

Worth telling, because it is the same lesson the paper's three negative results
teach: **a mechanism looks effective or ineffective according to whether the
measurement is asking the right question.**

---

## 7. Remaining work

1. **Larger grounding sample.** The free Gemini tier allows 20 generations a
   day and each case uses two. Run `--runs 10` across several days.
2. **Recalibrate fusion** on outputs from all three deployed detectors — this
   yields the first end-to-end accuracy figure the system can honestly claim.
3. **Integrate the remaining detectors** as they ship. The adapters are built;
   each needs a URL.

---

## 8. Where things are

```
fusion_engine/
├── DeepSentinel/
│   ├── backend/
│   │   ├── adapters/upstream.py     three detector schemas → one shape
│   │   ├── rag/                     knowledge base, retriever, prompt builder
│   │   ├── llm/forensic_reporter.py generation
│   │   ├── pipeline.py              the five stages
│   │   ├── fusion_engine.py         meta-classifier
│   │   ├── batch.py                 file upload scoring
│   │   ├── auth.py  db/  config.py  platform
│   │   └── main.py                  41 routes
│   ├── monitor/                     always-on screening
│   ├── chatbot/  assistant/         Q&A and operator agent
│   ├── scripts/evaluate_ablation.py the grounding study (655 lines)
│   └── tests/                       auth/RBAC suite
└── Deepsentinel-WEB/                React application
```

---

*Every figure in this document is traceable to a file in the repository. Where
a result belongs to another member it is attributed to them.*
