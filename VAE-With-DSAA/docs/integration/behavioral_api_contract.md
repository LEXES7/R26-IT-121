# Behavioural Detector — API Contract

**Component:** Stratified VAE with Dual-Signal Anomaly Attribution
**Project:** R26-IT-121 · Wijesinghe L.P.D.B. (IT22109194)
**Consumer:** DeepSentinel Fusion Engine (Member 4)
**Version:** v1.0.0 · **Status: implemented and serving**
**Model version:** `vae-dsaa-v4.0.0` · **Feature set:** `FS-ORIGIN`

---

## 1. Service overview

| | |
| --- | --- |
| Base URL | `http://localhost:8001` (`BEHAVIORAL_API_BASE`) |
| Primary endpoint | `POST /api/v1/behavioral/classify` — one transaction |
| Batch endpoint | `POST /api/v1/behavioral/score` — evaluation runs |
| Health | `GET /health` |
| Runtime | `GET /api/v1/behavioral/runtime` |
| Latency | 1–3 ms measured; NFR1 budget is 50 ms |
| Auth | none — internal trusted network |
| Concurrency | stateless; safe to call in parallel |
| Startup | returns **503** until bundles are loaded, never a neutral score |

Unlike the graph modality, nothing is precomputed. Inference happens at request
time on a seven-feature forward pass, so **any** transaction can be scored,
including accounts never seen during training. There is no "unknown account"
branch and no 404.

---

## 2. Request

```http
POST /api/v1/behavioral/classify
Content-Type: application/json
```

```json
{
  "transaction_id": "TX_INT_001",
  "composite_id": "C1231006815_601",
  "step": 601,
  "type": "TRANSFER",
  "amount": 181000.0,
  "nameOrig": "C1231006815",
  "nameDest": "C1666544295",
  "oldbalanceOrg": 181000.0,
  "newbalanceOrig": 0.0,
  "oldbalanceDest": 0.0,
  "newbalanceDest": 0.0,
  "isFlaggedFraud": 0
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `step` | int ≥ 1 | **yes** | PaySim hour; drives `F6_hour` |
| `type` | enum | **yes** | TRANSFER, CASH_OUT, PAYMENT, CASH_IN, DEBIT |
| `amount` | float ≥ 0 | **yes** | |
| `oldbalanceOrg`, `newbalanceOrig` | float ≥ 0 | **yes** | origin balances |
| `oldbalanceDest`, `newbalanceDest` | float ≥ 0 | **yes** | destination balances |
| `transaction_id`, `composite_id` | string | no | echoed back |
| `nameOrig`, `nameDest` | string | no | not used by the model |
| `isFlaggedFraud` | 0/1 | no | not used by the model |

Unknown fields are **ignored**, not rejected, so an addition upstream cannot
turn into a 422.

### Routing

| `type` | Stratum model | Note |
| --- | --- | --- |
| TRANSFER | `TRANSFER` | |
| CASH_OUT | `CASH_OUT` | |
| PAYMENT | `PAYMENT` | false-positive control, still scored |
| CASH_IN, DEBIT | `GLOBAL` | **outside the training distribution — see below** |

### CASH_IN and DEBIT are extrapolation

`GLOBAL` is pooled from TRANSFER, CASH_OUT and PAYMENT — all **outgoing**
transactions, where the origin balance falls. A `CASH_IN` raises it, so
`F4_balance_change_ratio` lands far outside anything the model has seen: the
fitted range is `[-1.0000, 0.3318]` with a 99th percentile of `0.0`, while an
ordinary deposit reaches `+3.86`. Reconstruction error is therefore extreme and
the score saturates at 1.0 — for a transaction type PaySim never labels as
fraud.

The score is still returned, because a consumer asked for one, but the response
carries `vae_diagnostics.out_of_training_distribution: true` and the
`fraud_signal_summary` opens with an explicit caveat.

**Recommended handling:** treat `out_of_training_distribution: true` as low
information and discount it in the fusion, or skip the behavioural modality for
those two types. Reporting CRITICAL for a routine deposit would otherwise reach
the analyst as a real alert.

---

## 3. Response

```json
{
  "transaction_id": "TX_INT_001",
  "composite_id": "C1231006815_601",
  "timestamp": "2026-08-25T18:10:44.512Z",
  "model_version": "vae-dsaa-v4.0.0",
  "feature_set": "FS-ORIGIN",
  "transaction_type": "TRANSFER",

  "behavioral_risk_score": 0.556159,
  "risk_level": "HIGH",

  "vae_diagnostics": {
    "combined_anomaly_score": 21.7337,
    "raw_score": 21.7337,
    "threshold": 1.7285,
    "calibrated_threshold": 0.208016,
    "flagged": true,
    "operating_point": "f1_optimal",
    "stratum": "TRANSFER",
    "recon_z": 41.9,
    "kl_z": 2.31,
    "density_z": 1.04,
    "weights": { "alpha": 0.5, "beta": 0.3, "gamma": 0.2 },
    "calibration_method": "isotonic",
    "is_control_stratum": false
  },

  "anomaly_fingerprint": {
    "signal_1_reconstruction_error": {
      "dominant_feature_signal": "F4_balance_change_ratio (41% of reconstruction error)",
      "shares": [{ "feature": "F4_balance_change_ratio", "share": 0.41 }]
    },
    "signal_2_kl_divergence": {
      "dominant_dimension_signal": "dim_3 (36% of KL divergence)",
      "shares": [{ "dimension": "dim_3", "share": 0.36 }]
    },
    "signal_3_latent_density": {
      "dominant_dimension_signal": "dim_1 (28% of latent density)",
      "shares": [{ "dimension": "dim_1", "share": 0.28 }]
    }
  },

  "fraud_typology": {
    "typology_label": "LARGE_VALUE_TRANSFER",
    "cluster_id": 2,
    "confidence": 0.83,
    "cluster_fraud_purity": 1.0,
    "cluster_size": 92,
    "fatf_hint": "FATF-002",
    "rationale": "amount exceeds the stratum's large-transaction threshold …",
    "discovery": "unsupervised DBSCAN over DSAA fingerprints; label is post-hoc"
  },

  "evidence": {
    "current_transaction": {
      "fraud_signal_summary": "Behavioural anomaly score 21.73 against the TRANSFER threshold 1.73 (flagged, F1-optimal operating point), calibrated to a risk probability of 0.556 (HIGH). Dominant reconstruction error: F4_balance_change_ratio at 41% of the total…"
    }
  },

  "metadata": {
    "inference_latency_ms": 2,
    "bundle": "clean__FS-ORIGIN__TRANSFER",
    "protocol": "clean",
    "engineered_features": { "F1_log_amount": 12.106, "…": 0.0 }
  }
}
```

### Field notes

| Field | Meaning |
| --- | --- |
| `behavioral_risk_score` | **calibrated probability in [0, 1]** — the field to fuse |
| `risk_level` | LOW / MEDIUM / HIGH / CRITICAL, from the bands in §5 |
| `vae_diagnostics.raw_score` | the underlying composite `0.5·z(recon) + 0.3·z(KL) + 0.2·z(density)`; unbounded, for diagnostics only |
| `signal_1_reconstruction_error` | per-feature share of reconstruction error, sums to 1 |
| `signal_2_kl_divergence` | per-latent-dimension share of KL divergence, sums to 1 |
| `signal_3_latent_density` | per-dimension share of the density term — **additive**; signals 1 and 2 are unchanged |
| `fraud_typology.typology_label` | nearest discovered typology, or `UNASSIGNED` |
| `evidence…fraud_signal_summary` | grounded evidence sentence for the LLM report |

### Spelling

Every field is spelled **American**: `behavioral_risk_score`, not
`behavioural_`. The adapter reads it as
`data.get("behavioral_risk_score", 0.5)`, so the British spelling would produce
no error, keep `available=True`, and silently substitute `0.5` for every
transaction. This is enforced by a test.

---

## 4. The score is a calibrated probability

The model produces an unbounded z-composite — a flagged TRANSFER reaches 21.7,
and the test partition ranges to 63.6. The fusion engine clamps to `[0, 1]`, so
sending the raw value would deliver exactly `1.0` for every flagged transaction
and discard the ranking entirely.

`behavioral_risk_score` is therefore **isotonic-calibrated per stratum**, fitted
on the validation partition — labelled, and disjoint from both the fitting slice
and the test partition.

| Stratum | Method | Raw threshold | Calibrated | ECE (test, out-of-sample) |
| --- | --- | --- | --- | --- |
| TRANSFER | isotonic | 1.7285 | 0.208016 | **0.0392** |
| CASH_OUT | isotonic | 3.6729 | 0.310365 | **0.0126** |
| GLOBAL | isotonic | 4.6784 | 0.147984 | **0.0132** |
| PAYMENT | threshold-centred logistic | 5.1490 | 0.500000 | n/a — no fraud to calibrate against |

Isotonic alone is monotone *non-decreasing*, which ties raw scores together and
measurably perturbs AUC-PR (0.7001 → 0.6634 on TRANSFER). A 1e-6 `tanh`
tie-break restores strict monotonicity, so **ranking, AUC-PR, AUC-ROC and the
tuned operating point are all preserved exactly** — verified in
`reports/v4/calibration_report.json` by comparing `auc_pr_raw` against
`auc_pr_calibrated`.

Because every stratum now emits a probability on the same scale, the earlier
caveat that scores were *"comparable only within a stratum"* **no longer
applies**. Cross-stratum comparison is valid.

---

## 5. Risk bands — and why the original cutoffs were wrong

Fixed `0.25 / 0.50 / 0.75 / 0.90` cutoffs are written for raw sigmoid output.
They do not transfer to a calibrated probability on a low-base-rate population,
and a `>= 0.90` rule would essentially never fire.

The bands are derived at startup:

* **HIGH** = the tuned decision threshold — the flag / no-flag boundary
* **MEDIUM** = half of it
* **CRITICAL** = the 75th percentile of the *alert* population

CRITICAL is deliberately not a quantile of everything scored. Isotonic on a
well-separated binary target is a step function — only 17 distinct values on the
TRANSFER test partition — so a 0.995 quantile of all rows lands on the threshold
itself and HIGH and CRITICAL collapse into one band.

| Stratum | medium | high | critical |
| --- | --- | --- | --- |
| TRANSFER | 0.104008 | 0.208016 | 0.604008 |
| CASH_OUT | 0.155182 | 0.310365 | 0.655182 |
| GLOBAL | 0.073992 | 0.147984 | 0.317899 |
| PAYMENT | 0.25 | 0.5 | 0.945012 |

Measured on the TRANSFER test partition, the ladder is monotone in precision:

| Level | rows | fraud | precision |
| --- | --- | --- | --- |
| LOW | 10,345 | 110 | 0.011 |
| MEDIUM | 326 | 173 | 0.531 |
| HIGH | 737 | 400 | 0.543 |
| CRITICAL | 138 | 138 | **1.000** |

**Read the live values from `/health`.** Do not hard-code them; they move when
models are retrained.

---

## 6. Typology labels

`fraud_typology.typology_label` is the RAG retrieval key. Clusters are
discovered by DBSCAN over DSAA fingerprints with **no label used at any point**.
The names are a post-hoc reading of what distinguishes each cluster from the
others, and `fatf_hint` is advisory.

Assignment for an unseen transaction is **nearest medoid within that cluster's
radius** — DBSCAN itself cannot label a point it was not fitted on. Outside
every radius the answer is `UNASSIGNED`, which mirrors DBSCAN's own noise label
rather than forcing a typology onto a transaction that resembles none of them.

| Stratum | Typologies | Labels |
| --- | --- | --- |
| TRANSFER | 6 | AMOUNT_MAGNITUDE_OUTLIER, OFF_PATTERN_TIMING, LARGE_VALUE_TRANSFER, ROUND_VALUE_STRUCTURING |
| CASH_OUT | 11 | as above plus ORIGIN_ACCOUNT_DRAIN |
| GLOBAL | 4 | AMOUNT_MAGNITUDE_OUTLIER, OFF_PATTERN_TIMING, ROUND_VALUE_STRUCTURING |
| PAYMENT | 0 | control stratum — no fraud, so no typology |

`UNASSIGNED` is a normal outcome, not an error. Treat a missing
`typology_hint` as "no retrieval key for this transaction".

---

## 7. Errors

| Status | Condition | Adapter behaviour |
| --- | --- | --- |
| 422 | missing or invalid field | treated as unavailable |
| 503 | bundles still loading | treated as unavailable |

```json
{ "transaction_id": "TX_1", "error": "BadRequest",
  "message": "Field 'step': Input should be greater than or equal to 1",
  "fallback_score": null }
```

A 503 during startup is deliberate. Returning a neutral `0.5` would be a
fabricated opinion the consumer cannot distinguish from a real one.

---

## 8. Provenance

Every response is reproducible from a bundle under `checkpoints/v4/`, each
carrying `manifest.json` (features in order, architecture, hyperparameters,
split point, framework version, git commit, and the `serving` constants),
`calibrator.pkl` and `typology.pkl`. `scripts/roundtrip_check.py` verifies that
a reloaded bundle reproduces its recorded metrics exactly.

The served scores come from the same leakage-free chronological protocol as the
dissertation results, so the demo and the dissertation cannot drift apart.

---

## 9. Versioning

Changes are tagged **additive** (safe), **semantics** (same field, different
meaning — coordinate), or **breaking** (rename or removal — coordinate).

| Version | Change | Class |
| --- | --- | --- |
| v1.0.0 | Endpoint implemented; path is `/api/v1/behavioral/classify`, matching the adapter | **breaking** vs the draft's `/api/v1/behavioural/score` |
| v1.0.0 | Request is a single flat transaction; batch moved to `/score` | **breaking** vs the draft |
| v1.0.0 | `behavioral_risk_score` is a calibrated probability, not a z-composite | **semantics** vs the draft |
| v1.0.0 | `signal_3_latent_density` added; signals 1 and 2 unchanged | additive |
| v1.0.0 | `fraud_typology`, `evidence.current_transaction.fraud_signal_summary` | additive |
| v1.0.0 | Cross-stratum score comparison is now valid (see §4) | **semantics** |

Renaming any field the adapter reads is a breaking change requiring
coordination with Member 4.

---

## 10. Verifying the integration

```bash
python scripts/serve_api.py                       # terminal 1
python scripts/integration_test_behavioral.py     # terminal 2
```

Stage 3 of that script imports the fusion engine's own
`call_behavioral_api` and calls it unmodified — the only check that catches the
adapter's silent `.get()` defaults from outside.
