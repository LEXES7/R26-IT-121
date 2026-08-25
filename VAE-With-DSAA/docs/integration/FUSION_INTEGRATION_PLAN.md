# Fusion Engine Integration — Analysis and Plan

**Component:** Stratified VAE with Dual-Signal Anomaly Attribution (behavioural modality)
**Consumer:** DeepSentinel Fusion Engine
**Written:** 2026-08-25
**Purpose:** Everything needed to take this component from "trained models on disk" to
"a live service the fusion engine calls", derived from reading the GraphSAGE component
that is already integrated.

Workspace root for all paths below is `d:\Research`. The three repositories referenced are:

| Path | Owner | Status |
| --- | --- | --- |
| `VAE-With-DSAA/` | this component (behavioural) | **not yet serving** |
| `GraphSage/` | relational modality | **integrated and serving** |
| `fusion_engine/DeepSentinel/` | fusion engine + LLM reporting | consumes all three |

---

## 1. System architecture

DeepSentinel is four independent services. Each modality owner runs their own FastAPI
process; the fusion engine reaches them over HTTP. There is no shared Python process and
no shared model registry — the only coupling is the JSON contract.

```
                    ┌─────────────────────────────────────┐
                    │  Deepsentinel-WEB (React / Vite)    │
                    └──────────────┬──────────────────────┘
                                   │ POST /analyze
                    ┌──────────────▼──────────────────────┐
                    │  fusion_engine/DeepSentinel         │
                    │  backend/main.py  →  /analyze       │
                    │  _fetch_from_upstream_apis()        │
                    │        asyncio.gather(3 calls)      │
                    └───┬──────────────┬──────────────┬───┘
                        │              │              │
             port 8001  │   port 8000  │   port 8003  │
        ┌───────────────▼──┐  ┌────────▼───────┐  ┌───▼────────────┐
        │ Behavioural      │  │ GraphSAGE      │  │ TCN / TSCFD    │
        │ (this component) │  │                │  │                │
        │ /api/v1/         │  │ /api/graph/    │  │ /api/v1/       │
        │  behavioral/     │  │  analyze       │  │  classify      │
        │  classify        │  │                │  │                │
        │  NOT BUILT       │  │  LIVE          │  │  NOT BUILT     │
        └──────────────────┘  └────────────────┘  └────────────────┘
```

Only GraphSAGE is actually live. With the fusion engine running today, the behavioural
modality returns `available=False`, its score is imputed as `0.5`, and a `0.10` confidence
penalty is applied per missing modality.

---

## 2. What GraphSAGE built — folder structure

```
GraphSage/
├── pyproject.toml           package name "graphsage", src-layout,
│                            fastapi + uvicorn in the main dependency list
├── Dockerfile               CPU-only torch, data/ mounted at runtime, HEALTHCHECK
│                            with a 90 s start-period
├── docker-compose.yml       service "graphsage" on a "deepsentinel" network,
│                            plus a "contract-test" service behind a test profile
├── .env.example             GRAPHSAGE_API_HOST / GRAPHSAGE_API_PORT
├── configs/model_config.yaml
├── checkpoints/             trained weights (gitignored)
├── data/
│   ├── raw/ processed/      features.parquet
│   ├── graph/               serving_bundle.pt   <- the only file serving needs
│   │                        node_names.npy      (rebuilt name<->id cache)
│   └── demo/demo_transactions.json   curated transactions covering every
│                                     response branch, including a 422
├── docs/
│   └── integration/
│       ├── README.md               consumer-facing "how to call me"
│       └── graph_api_contract.md   the locked contract (v0.3)
├── examples/api_responses/         3 sample JSON payloads for mock generation
│   ├── critical_fraud_hub_and_spoke.json
│   ├── medium_risk_ambiguous.json
│   └── subgraph_demo.json
├── scripts/
│   ├── serve_api.py                uvicorn launcher
│   ├── export_serving_bundle.py    the training -> serving bridge
│   └── train_*.py, build_*.py, eval_*.py, calibration_study.py
├── src/graphsage/
│   ├── api/
│   │   ├── app.py            FastAPI app, create_app() factory
│   │   ├── schemas.py        Pydantic v2 request/response models
│   │   └── static/demo.html  the /demo investigation page
│   ├── inference/predictor.py    GraphPredictor — owns all serving state
│   ├── extraction/subgraph.py, pattern_classifier.py
│   └── models/ data/ sampling/ training/ utils/
└── tests/
    ├── test_api.py           TestClient + injected FakePredictor
    └── test_subgraph.py
```

Six files carry the entire integration: `api/app.py`, `api/schemas.py`,
`inference/predictor.py`, `scripts/serve_api.py`, `scripts/export_serving_bundle.py`,
and `docs/integration/graph_api_contract.md`. Everything else is research code.

---

## 3. The central design idea — the serving bundle

This is the most important architectural decision in the GraphSAGE component.

**The problem.** Graph inference needs 3.3 M nodes. Running it per request makes the
p95 < 500 ms NFR impossible and makes a laptop demo impossible.

**The solution.** `scripts/export_serving_bundle.py` runs offline (in Colab), computes
every score in advance, and writes one file:

```python
bundle = {
    "edge_index", "edge_attr", "edge_step", "edge_isFraud",   # graph structure
    "node_degrees",     # x[:, :2] only — the extractor uses in/out degree
    "node_scores",      # isotonic-calibrated mule probability per node
    "edge_attention",   # mean per-edge attention from the Edge-MLP layers
    "threshold",        # val-tuned threshold, mapped through the same
                        # isotonic transform so it stays comparable
    "meta": {stage, features, seed, protocol, calibration, step_range, ...},
}
torch.save(bundle, "data/graph/serving_bundle.pt")   # ~170 MB
```

`inference/predictor.py` then does a single file read at startup. Its own docstring states
the consequence:

> Nothing is inferred at request time and no model is instantiated at all, so startup is a
> single file read and per-request work is only: resolve the trigger edge, extract the
> k=2 subgraph, serialize. That is what keeps p95 under the 500 ms budget (NFR1).

A second benefit the docstring calls out: the bundle comes from the leakage-free temporal
protocol, so the scores served are the same ones reported in the dissertation — *"the demo
and the dissertation cannot drift apart."*

### What this means for the behavioural component

**The equivalent already exists.** `checkpoints/v4/<protocol>__<featureset>__<stratum>/`
holds `vae.pt`, `scaler.pkl`, `kmeans.pkl`, `thresholds.json`, `manifest.json`, and
[`persistence.load_bundle()`](../../src/vae_dsaa/utils/persistence.py) /
[`Predictor.from_dir()`](../../src/vae_dsaa/inference/predictor.py) already load it. That is
a direct analogue of GraphSAGE's serving bundle.

**The difference is in our favour.** A VAE forward pass on one row of seven features costs
microseconds, so precomputation is unnecessary — this component can do genuine
request-time inference. GraphSAGE cannot score a transaction between accounts absent from
its fixed snapshot and must return 404; this component can score any transaction. That is
a real advantage worth stating in the integration README and in the viva.

The startup task is therefore: **load four bundles into memory and keep them** (TRANSFER,
CASH_OUT, PAYMENT, GLOBAL).

---

## 4. The API layer — seven patterns worth copying

From `GraphSage/src/graphsage/api/app.py`:

**1. An app factory with an injectable predictor.**

```python
def create_app(predictor: GraphPredictor | None = None) -> FastAPI:
    app = FastAPI(title=..., version=MODEL_VERSION)
    app.state.predictor = predictor
    ...
    return app

app = create_app()      # module-level; uvicorn points at this
```

Tests inject a fake predictor, so the suite never loads the 204 MB production graph. See
the `FakePredictor` class in `GraphSage/tests/test_api.py`.

**2. Heavy loading only in the startup event.**

```python
@app.on_event("startup")
def load_predictor() -> None:
    if app.state.predictor is None:      # only when nothing was injected
        app.state.predictor = GraphPredictor(REPO_ROOT)
```

**3. CORS middleware** with `allow_origins=["*"]`, so the browser dashboard can call the
service directly. The code comments this against contract §1's "internal trusted network"
assumption rather than leaving it unexplained.

**4. A custom `RequestValidationError` handler.** FastAPI's default 422 body does not match
the contract, so it is replaced:

```python
@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(status_code=422, content=ErrorResponse(...).model_dump())
```

**5. `/health` returns live operating parameters** — tuned threshold, risk bands, model
metadata — so consumers never hard-code them:

```json
{"status": "ok", "model_version": "...", "stage": "stage_3b_v2",
 "num_nodes": 3300000, "tuned_threshold": 0.0143,
 "risk_bands": {"medium": 0.0072, "high": 0.0143, "critical": 0.1907},
 "model_meta": {...}}
```

**6. A `respond()` closure** so every branch produces an identically shaped response and
stamps `inference_latency_ms` uniformly.

**7. The demo page is served from the same app** — `GET /demo` plus
`GET /api/graph/demo-transactions`, with deep-link support
(`/demo?nameOrig=..&nameDest=..&step=..&autorun=1`) so the dashboard can link into a
specific transaction.

### schemas.py

Pydantic v2. Four enums (`TxnType`, `RiskLevel`, `Pattern`, `NodeRole`) and eight nested
models, with real validation constraints:

```python
step: int = Field(ge=1, le=10_000)
amount: float = Field(ge=0)
node_risk_score: float = Field(ge=0, le=1)
```

The module docstring carries the warning that matters: *"Renaming any field is a breaking
change requiring coordination with Member 4."*

---

## 5. The contract document

`GraphSage/docs/integration/graph_api_contract.md`, seven sections:

| § | Content |
| --- | --- |
| 1 | Service overview table — method, path, latency NFR, auth, concurrency |
| 2 | Request schema plus a field table, and the `NOT_APPLICABLE` note |
| 3 | Response schema, object by object, each with its own field table |
| 4 | Error responses |
| 5 | Risk thresholds — **an admission that the original placeholders were wrong** |
| 6 | Sample responses for mock generation |
| 7 | Versioning policy plus a "changes since locked" table |

Sections 5 and 7 are what make the contract survive contact with a real model.

**§5** states plainly that the original `0.25 / 0.50 / 0.75 / 0.90` cutoffs were written for
raw sigmoid output and no longer apply: an isotonic-calibrated probability on a 4.7%
base-rate population tops out around 0.25, so a fixed `>= 0.90` rule would never produce
`CRITICAL`. The bands are now derived at startup from the tuned threshold and the served
score distribution, and consumers are told to read them from `/health`. Nothing is hidden
and the fix ships with the admission.

**§7** tags every post-lock change as **additive**, **semantics**, or **breaking**. That is
the correct discipline for changing a contract that other people already build against.

The behavioural contract at [`behavioral_api_contract.md`](behavioral_api_contract.md)
should adopt both sections. Its status line currently reads *"contract draft — endpoint not
yet implemented"*.

---

## 6. The fusion engine side — what actually consumes us

```
fusion_engine/
├── DeepSentinel/                          FastAPI backend
│   ├── backend/
│   │   ├── main.py                        /analyze, /health, schemas,
│   │   │                                  _fetch_from_upstream_apis
│   │   ├── adapters/upstream.py           THE file that matters to us
│   │   ├── fusion_engine.py               MetaClassifier (LogReg stacking)
│   │   ├── pipeline.py                    run_pipeline() generator, stages,
│   │   │                                  mock fallback
│   │   ├── config.py                      reads config.ini -> BEHAVIORAL_API_BASE
│   │   ├── mock_scores.py, batch.py, errors.py, auth.py, email_service.py
│   │   └── db/ llm/ rag/
│   ├── config.example.ini                 [upstream] behavioral_api_base = :8001
│   ├── data/fatf_typologies.json          FATF-001 .. FATF-010 (RAG corpus)
│   ├── INTEGRATION_GRAPHSAGE.md           the GraphSAGE integration guide
│   └── integration_test_graphsage.py      the test script to copy
└── Deepsentinel-WEB/                      React / Vite frontend
```

### Call flow

`backend/main.py`, `_fetch_from_upstream_apis`:

```python
tx_dict = transaction.model_dump()
tx_dict["transaction_id"] = transaction_id
async with httpx.AsyncClient() as client:
    b_task = call_behavioral_api(client, BEHAVIORAL_API_BASE, tx_dict, UPSTREAM_TIMEOUT)
    g_task = call_graph_api(client, GRAPH_API_BASE, tx_dict, UPSTREAM_TIMEOUT)
    t_task = call_temporal_api(client, TEMPORAL_API_BASE, tx_dict, UPSTREAM_TIMEOUT)
    behavioral, graph, temporal = await asyncio.gather(b_task, g_task, t_task)
```

All three run in parallel; each adapter normalises its model's response into one dataclass:

```python
@dataclass
class UpstreamResponse:
    score: float                        # normalized 0–1
    available: bool
    fraud_signal_summary: str | None    # the anchor text fed to the LLM
    typology_hint: str | None           # the label fed to RAG retrieval
    extra: dict                         # raw rich data for the prompt
```

`fusion_engine.py` then fuses:

- a `StandardScaler` + `LogisticRegression` pipeline (`class_weight="balanced"`);
- currently trained on **synthetic calibration data** — 2000 rows drawn from beta
  distributions, not real upstream scores;
- missing modalities are imputed at `0.5` with a `0.10` penalty each;
- output classified as `CRITICAL >= 0.80`, `HIGH >= 0.65`, `MEDIUM >= 0.50`, else `LOW`.

Then RAG retrieval selects a FATF typology, and the LLM writes the forensic report using
each modality's `fraud_signal_summary` as grounded evidence.

---

## 7. Critical finding — the contract mismatch

**Our contract document and the fusion engine's adapter do not agree.**

Adapter source: `fusion_engine/DeepSentinel/backend/adapters/upstream.py`, function
`call_behavioral_api` (lines 36–93).

| | [`behavioral_api_contract.md`](behavioral_api_contract.md) (ours) | `upstream.py` (what is actually called) |
| --- | --- | --- |
| Path | `/api/v1/behavi**ou**ral/**score**` | `/api/v1/behavi**o**ral/**classify**` |
| Shape | **Batch**: `{"transactions": [...]}` | **Single**: flat tx dict + `composite_id` |
| Score field | `results[].behavi**ou**ral_score` | `behavi**o**ral_risk_score` (top level) |
| Score range | **Unbounded z-composite** (e.g. 7.81) | **[0, 1]**, passed through `_clamp()` |
| Fingerprint | `signal_1_reconstruction` (list of shares) | `anomaly_fingerprint.signal_1_reconstruction_error.dominant_feature_signal` (string) |
| Typology | `anomaly_fingerprint.typology.label` | `fraud_typology.typology_label` |
| Summary text | not present | `evidence.current_transaction.fraud_signal_summary` |

### 7.1 The silent failure mode

```python
score = _clamp(float(data.get("behavioral_risk_score", 0.5)))
```

If the response uses the British spelling `behavioural_risk_score`, `.get()` returns the
`0.5` default. **No exception is raised and `available` is still `True`.** The modality
appears healthy in `/health`, appears in the fusion result, and contributes exactly nothing.
This is a hard bug to notice and an easy one to avoid: use the American spelling in the API
response, whatever the rest of the codebase uses in prose.

### 7.2 The score range problem

Our score is a z-scored composite:

```
score = 0.5 * z(recon) + 0.3 * z(KL) + 0.2 * z(latent density)
```

The sample response in `examples/api_responses/transfer_flagged.json` carries `7.8124`.
`_clamp()` turns that into `1.0`. Every transaction above threshold would arrive at the
fusion engine as `1.0`, destroying the ranking the model produces.

Three mappings, in the order GraphSAGE evaluated them:

1. **Threshold-centred logistic** — cheapest, implementable immediately:
   ```python
   p = 1 / (1 + exp(-(score - threshold[stratum]) / scale[stratum]))
   ```
   Exactly `0.5` at the threshold, monotone, so ranking is preserved. Use the validation
   partition's score standard deviation for `scale`.

2. **ECDF / percentile** — rank within the validation score distribution.
   `GraphSage/scripts/calibration_study.py` measured this at ECE 0.48 and rejected it:
   *"a percentile is a rank, not a probability."*

3. **Isotonic regression** — fitted on the validation partition, reached ECE 0.02 for
   GraphSAGE against 0.80 for raw focal-loss sigmoids. Monotone, so AUROC, ranking and the
   tuned operating point are all unchanged.

**Recommendation: option 3, fitted per stratum.** Two reasons:

- It is defensible under questioning. "The score entering the fusion engine is an
  isotonic-calibrated probability with ECE *x*, fitted on the validation partition" is a
  complete answer.
- **It resolves an open weakness in our own contract.** §4 currently says the score is
  *"comparable only within a stratum"* and recommends the fusion engine route by transaction
  type. Per-stratum calibration puts every stratum on the same probability scale, making
  cross-stratum comparison valid and removing that requirement from the consumer.

---

## 8. The exact response payload to produce

Every field below is read by `call_behavioral_api` (lines 61–89) or is standard provenance.

```json
{
  "transaction_id": "TX_TEST_001",
  "composite_id": "C1231006815_601",
  "behavioral_risk_score": 0.8734,
  "transaction_type": "TRANSFER",

  "vae_diagnostics": {
    "combined_anomaly_score": 7.8124,
    "raw_score": 7.8124,
    "threshold": 1.7285,
    "flagged": true,
    "operating_point": "f1_optimal",
    "stratum": "TRANSFER",
    "recon_z": 5.21,
    "kl_z": 1.84,
    "density_z": 0.76
  },

  "anomaly_fingerprint": {
    "signal_1_reconstruction_error": {
      "dominant_feature_signal": "F4_balance_change_ratio (41% of reconstruction error)",
      "shares": [
        {"feature": "F4_balance_change_ratio", "share": 0.41},
        {"feature": "F3_balance_consistency",  "share": 0.23}
      ]
    },
    "signal_2_kl_divergence": {
      "dominant_dimension_signal": "latent dim_3 (36% of KL divergence)",
      "shares": [
        {"dimension": "dim_3", "share": 0.36},
        {"dimension": "dim_7", "share": 0.31}
      ]
    }
  },

  "fraud_typology": {
    "typology_label": "PASS_THROUGH_MULE",
    "cluster_id": 0,
    "confidence": 0.83
  },

  "evidence": {
    "current_transaction": {
      "fraud_signal_summary": "Behavioural anomaly score 7.81 against TRANSFER threshold 1.73 (flagged, F1-optimal operating point). Dominant reconstruction error: F4_balance_change_ratio at 41% of total. Dominant latent deviation: dim_3 at 36% of KL divergence. Nearest discovered typology: PASS_THROUGH_MULE (cluster 0)."
    }
  },

  "model_version": "vae-dsaa-v4.0.0",
  "feature_set": "FS-ORIGIN",
  "metadata": {
    "inference_latency_ms": 12,
    "bundle": "clean__FS-ORIGIN__TRANSFER"
  }
}
```

### 8.1 `fraud_signal_summary` is the highest-value field

The graph adapter *builds* its summary client-side from the subgraph payload. The
behavioural adapter **reads ours directly from the response body**. If it is absent,
`fraud_signal_summary` is `None`, and the LLM forensic report contains not one sentence
derived from this component — while `graph_signal` and `temporal_signal` both appear. That
gap is visible in any demo of the final report.

### 8.2 `typology_hint` feeds RAG retrieval

`fraud_typology.typology_label` becomes `UpstreamResponse.typology_hint`. The fusion
engine's knowledge base (`fusion_engine/DeepSentinel/data/fatf_typologies.json`) holds:

```
FATF-001  Smurfing / Structuring                 FATF-006  Shell Company Round-Tripping
FATF-002  Layering                               FATF-007  Temporal Velocity Fraud
FATF-003  Mule Network / ATO Mule                FATF-008  Trade-Based Money Laundering
FATF-004  Account Takeover Fraud                 FATF-009  Crypto-Asset Layering
FATF-005  Cash Intensive Commingling             FATF-010  Loan-Back Scheme
```

`PASS_THROUGH_MULE` maps to FATF-003. Attaching a FATF name to a discovered cluster does
**not** weaken the unsupervised claim — clusters are discovered without labels, and the
naming is a post-hoc interpretation. State that explicitly wherever the mapping appears, so
the distinction is not lost.

---

## 9. Current state — what exists, what is missing

### Already in place

| Item | Location |
| --- | --- |
| Trained bundles | `checkpoints/v4/<protocol>__<fs>__<stratum>/` |
| Bundle loader | [`src/vae_dsaa/utils/persistence.py`](../../src/vae_dsaa/utils/persistence.py) |
| Scoring | [`src/vae_dsaa/inference/predictor.py`](../../src/vae_dsaa/inference/predictor.py) |
| DSAA attribution | [`src/vae_dsaa/dsaa/signals.py`](../../src/vae_dsaa/dsaa/signals.py) |
| Typology clustering | [`src/vae_dsaa/typology/cluster.py`](../../src/vae_dsaa/typology/cluster.py) |
| Empty api package | `src/vae_dsaa/api/__init__.py` |
| Contract draft | [`behavioral_api_contract.md`](behavioral_api_contract.md) |
| Sample responses | `examples/api_responses/` (2 files) |
| API dependencies | `pyproject.toml` — `api = ["fastapi>=0.110", "uvicorn>=0.27"]` |

### To be built

```
src/vae_dsaa/api/
    schemas.py            Pydantic models (use GraphSage/src/graphsage/api/schemas.py
                          as the template)
    app.py                create_app() factory, startup loader, /health, endpoints
src/vae_dsaa/inference/
    calibration.py        z-score -> [0,1] mapping, isotonic, per stratum
    service.py            BehavioralPredictor — holds all four strata in memory
scripts/
    serve_api.py          uvicorn launcher on port 8001
    export_calibrators.py fit isotonic on the validation partition and persist
    contract_test.py      contract conformance check against the live service
docs/integration/
    README.md             consumer-facing guide (mirror GraphSage's)
    behavioral_api_contract.md   update to match what is actually served
examples/api_responses/
    add: global-stratum example, error example  (2 exist today)
data/demo/demo_transactions.json  curated transactions covering every branch
tests/test_api.py         TestClient + injected FakePredictor
Dockerfile, docker-compose.yml    optional, if time allows
```

---

## 10. Step-by-step plan

### Step 1 — Single-row feature engineering

`Predictor.score()` expects raw, unscaled feature rows in manifest order. FS-ORIGIN
(the primary set) is seven features:

```
F1_log_amount            log1p(amount)
F2_amount_balance_ratio  amount / oldbalanceOrg
F3_balance_consistency   from |oldbalanceOrg - amount - newbalanceOrig|
F4_balance_change_ratio  newbalanceOrig / oldbalanceOrg
F6_hour                  (step % 24) / 24
F8_is_large              amount > p95_causal        <-- needs a stored constant
F12_round_amount         roundness test on amount
```

Six of the seven are computable from a single row. `F8_is_large` is not.

> **Blocker.** `p95_causal_fit_partition` is computed in
> [`src/vae_dsaa/data/prep.py`](../../src/vae_dsaa/data/prep.py) (line ~93) and written to
> `data/.../metrics/prep_report.json` — but it is **not** written into the bundle's
> `manifest.json`. Verified by inspecting
> `checkpoints/v4/clean__FS-ORIGIN__TRANSFER/manifest.json`: the constant is absent.
>
> `checkpoints/README.md` claims *"A bundle is self-contained: it holds everything needed
> to score a transaction without retraining and without consulting any other file."* For
> single-row scoring, that is currently not true.
>
> **Fix:** persist `p95_causal` into `manifest.json` (or `thresholds.json`) at training
> time, e.g. `"f8_percentile": 245678.12`. Small change, but without it the served features
> are wrong and every score is wrong.

Note that `F11_account_velocity` — the other feature our contract cites as requiring a
batch — is excluded from every corrected feature set, so it is not an obstacle.

### Step 2 — Export calibrators

Take validation-partition scores and labels, fit one isotonic regressor per stratum, and
persist alongside the bundle. `GraphSage/scripts/export_serving_bundle.py` (lines 115–124)
is the reference implementation:

```python
iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
iso.fit(raw_scores_val, labels_val)
calibrated = iso.predict(raw_scores)
threshold_calibrated = float(iso.predict(np.array([raw_threshold]))[0])
```

Map the stored threshold through the same transform so it stays comparable, exactly as
GraphSAGE does.

### Step 3 — `BehavioralPredictor` service class

The analogue of `GraphPredictor`. Load every stratum once at startup:

```python
self.bundles = {
    "TRANSFER": load_bundle("checkpoints/v4/clean__FS-ORIGIN__TRANSFER"),
    "CASH_OUT": load_bundle("checkpoints/v4/clean__FS-ORIGIN__CASH_OUT"),
    "PAYMENT":  load_bundle("checkpoints/v4/clean__FS-ORIGIN__PAYMENT"),
    "GLOBAL":   load_bundle("checkpoints/v4/clean__FS-ORIGIN__GLOBAL"),
}
```

Route on `type`. `CASH_IN` and `DEBIT` go to `GLOBAL`, per contract §2. Unlike GraphSAGE,
there is no `NOT_APPLICABLE` branch to handle — every transaction type can be scored.
PAYMENT remains the false-positive control stratum and should be labelled as such in
`vae_diagnostics`, but it still returns a score.

### Step 4 — `schemas.py`

Adapt GraphSAGE's. The request fields the adapter actually sends are:

```
transaction_id, composite_id, step, type, amount, nameOrig, nameDest,
oldbalanceOrg, newbalanceOrig, oldbalanceDest, newbalanceDest, isFlaggedFraud
```

Set `model_config = ConfigDict(extra="ignore")` so an added upstream field does not turn
into a 422.

### Step 5 — `app.py`

`POST /api/v1/behavioral/classify` (single transaction) plus `GET /health`. The batch
endpoint `POST /api/v1/behavioural/score` can stay in the same app for evaluation runs and
the dissertation — the two are not mutually exclusive.

Return **503** while bundles are still loading, not a neutral `0.5`. A 503 is honestly
"unavailable"; a `0.5` is a fabricated opinion.

### Step 6 — Integration test

Copy `fusion_engine/DeepSentinel/integration_test_graphsage.py` to
`integration_test_behavioral.py`. Its structure: health check, then a direct API call,
then a call through the adapter itself, printing `score`, `available`,
`fraud_signal_summary` and `typology_hint`. That last stage is what catches the silent
spelling failure described in §7.1.

### Step 7 — Update the contract document

Change the status line from *"endpoint not yet implemented"*. Adopt GraphSAGE's §5 (state
the calibration and tell consumers to read live values from `/health`) and §7 (a changes
table tagging each change additive / semantics / breaking).

---

## 11. The decision that has to be made now

Two ways to resolve the §7 mismatch:

**(a) Implement what the adapter already expects.** No coordination needed. GraphSAGE has
already locked against this adapter. Saves one to two days.

**(b) Ask for the adapter to change.** Preserves the batch-first design, but the fusion
engine's `_fetch_from_upstream_apis` is built around parallel single-transaction calls; a
batch shape would require changes to `pipeline.py` and `batch.py` as well.

**Recommendation: (a).** The batch endpoint is not lost — both can live in the same app,
single for the fusion engine and batch for evaluation runs.

---

## 12. Smaller issues found

- **Port inconsistency in the fusion engine.** `config.example.ini` sets
  `graph_api_base = http://localhost:8002`, `INTEGRATION_GRAPHSAGE.md` sets
  `GRAPH_API_BASE=http://localhost:8000`, and GraphSAGE actually defaults to 8000. The
  behavioural port is `8001` in both places, so this component is unaffected — but worth
  flagging to the team.

- **Upstream timeout is 5000 ms** (`config.example.ini`, `timeout_ms = 5000`). VAE
  inference is far below that. The only risk is startup: return 503 until the bundles load.

- **`scripts/contract_test.py` does not exist in GraphSage.** It is referenced from
  `docs/integration/README.md` and from `docker-compose.yml` (the `contract-test` service),
  but the file is absent. Writing one for this component is a genuine differentiator.

- **Member numbering is inconsistent across documents.** The fusion adapter labels this
  component M1; our contract says Member 2; the GraphSAGE contract header says Member 1
  while `INTEGRATION_GRAPHSAGE.md` says Member 2. Worth agreeing on one scheme.

- **The meta-classifier is trained on synthetic data.** `fusion_engine.py` generates 2000
  rows from beta distributions when no saved model exists. It should be retrained once real
  upstream scores are available — a `/retrain` endpoint exists. Not our task, but a likely
  question in review.

---

## 13. Summary

GraphSAGE's integration rests on four things:

1. Offline training exported to a precomputed serving bundle.
2. A thin FastAPI layer — app factory, startup loader, `/health` exposing live operating
   parameters.
3. A locked, honestly-maintained, versioned contract document.
4. An integration test script and demo data covering every response branch.

This component already has (1) and a draft of (3). What is needed is (2), (4), and the
**z-score to probability calibration** — the last being the most important technical piece,
because without it the fusion engine receives a clamped `1.0` for every flagged transaction
and the model's ranking is discarded at the boundary.
