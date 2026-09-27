# API Contract — TS-TCN ↔ Fusion Engine

This document defines the JSON contract between the **TS-TCN service** (Member
3) and the **Fusion Engine** (Member 4). It is locked — any change must be
agreed by both parties.

> **2026-08-26 revision.** The previous version of this document (`attribution.peak_position`,
> `fraud_probability`, a nested `{"transaction": {...}}` request body) was
> never implemented against and does not match what the Fusion Engine's
> adapter (`DeepSentinel/backend/adapters/upstream.py::call_temporal_api`)
> actually parses. This revision replaces it with the schema from the
> research proposal (Appendix C), which the adapter was written against, and
> is what `api/routes/classify.py` now implements.

## Endpoint

```
POST /api/v1/classify
Host: localhost:8003
Content-Type: application/json
```

Port **8003** is the default `TEMPORAL_API_BASE` the fusion engine dials
(`DeepSentinel/backend/config.py`). Run the service on this port for it to be
picked up without extra configuration.

The service maintains an internal thread-safe `deque(maxlen=32)` of recent
transactions, shared across requests (system-wide, not per-account — see
proposal §1.3, Research Gap 1). The request only needs the *current*
transaction; the service reconstructs the 32-transaction window from its own
buffer, with the current transaction as the last (most recent) position.

## Request

Flat body — the fusion engine spreads the full transaction dict and adds
`composite_id` before sending, so extra fields (`nameDest`, `isFlaggedFraud`,
`transaction_id`, `composite_id`, ...) may be present and are ignored.

```json
{
  "nameOrig": "C1231006815",
  "step": 214,
  "type": "TRANSFER",
  "amount": 450000.0,
  "oldbalanceOrg": 451000.0,
  "newbalanceOrig": 0.0,
  "oldbalanceDest": 0.0,
  "newbalanceDest": 449000.0
}
```

## Response — 200 OK

```json
{
  "transaction_ref": {
    "nameOrig": "C1231006815",
    "step": 214,
    "composite_id": "C1231006815_214"
  },
  "temporal_risk_score": 0.974,
  "risk_level": "CRITICAL",
  "detection_method": "TS-TCN",
  "modality": "temporal_sequence",
  "evidence": {
    "current_transaction": {
      "type": "TRANSFER",
      "amount": 450000.0,
      "drain_ratio": 0.999,
      "post_transfer_ratio": 0.001,
      "dest_was_empty": 1.0,
      "dest_enrichment": 0.998,
      "type_risk": 0.499,
      "hour_of_day": 0.609,
      "fraud_signal_summary": "Account fully drained into empty destination account"
    }
  },
  "triggering_predecessor": {
    "nameOrig": "C1231006815",
    "step": 211,
    "composite_id": "C1231006815_211",
    "attention_weight": 0.847,
    "offset_from_current": -3,
    "features": {
      "type": "TRANSFER",
      "amount": 180000.0,
      "drain_ratio": 0.401,
      "post_transfer_ratio": 0.599,
      "dest_was_empty": 1.0,
      "type_risk": 0.499
    },
    "predecessor_signal": "Prior partial drain from same account — escalating fraud pattern"
  },
  "model_version": "ts-tcn-v2.0-final",
  "inference_time_ms": 23.7
}
```

## Field Contracts

| Field | Type | Description |
|-------|------|-------------|
| `transaction_ref.nameOrig` | string | PaySim originator account ID — shared cross-component key (also used by M1 graph nodes, M2 VAE account keys) |
| `transaction_ref.step` | int | Simulation hour of the current transaction |
| `transaction_ref.composite_id` | string | `{nameOrig}_{step}` — unique join key |
| `temporal_risk_score` | float ∈ [0, 1] | `fraud_prob` sigmoid output of the TS-TCN |
| `risk_level` | string | `NORMAL` (\< 0.3) · `SUSPICIOUS` (0.3–0.7) · `CRITICAL` (≥ 0.7) |
| `detection_method` | string | Constant `"TS-TCN"` |
| `modality` | string | Constant `"temporal_sequence"` — tells M4 which ensemble channel this is |
| `evidence.current_transaction` | object | The 10 engineered features (a labelled subset) for the current transaction plus `fraud_signal_summary`, a one-line human-readable anchor for the LLM prompt |
| `triggering_predecessor` | object | The window position (excluding the current transaction itself) that `fraud_attention` weighted highest |
| `triggering_predecessor.attention_weight` | float ∈ [0, 1] | Attention weight at that position (`fraud_attention` output, not a heuristic) |
| `triggering_predecessor.offset_from_current` | int, negative | Position relative to the current transaction, e.g. `-3` = 3 transactions back in the window |
| `triggering_predecessor.features` | object | Feature vector of the predecessor transaction, read from the rolling buffer |
| `triggering_predecessor.predecessor_signal` | string | Human-readable label of the escalation pattern |
| `model_version` | string | Identifies which trained checkpoint answered. `ts-tcn-v2.0-final` is the Stage 4 FINAL training run — see caveat below |
| `inference_time_ms` | float | End-to-end serving time for this request |

## Model status caveat

The checkpoint currently served (`outputs/stage4_tcn/best_tstcn.keras`) is
the Stage 4 **FINAL** training run (`DeepSentinel_T4_FullTraining_FINALI.ipynb`),
27 epochs against the 30-epoch budget, EarlyStopping on `val_fraud_prob_auc`
with patience=12 — closer to the proposal's §3.8 patience=10 than the
superseded `ts-tcn-v1.0-stage4` checkpoint's patience=5, which stopped at
epoch 6 before recall could recover.

At the served operating point (threshold=0.4545, chosen for best F1) this
checkpoint **clears Baseline 2** (MLP, no sequence) on F1 (0.851 vs 0.737)
and Recall (0.767 vs 0.586) — see `outputs/stage6_evaluation/tstcn_test_metrics.json`
for the full numbers, including a documented but unused Recall-first
operating point (threshold=0.1278: Recall 0.900, Precision 0.056). AUC-ROC
(0.947) and Recall (0.767) still fall short of the proposal's stretch
targets (AUC-ROC>0.97, Recall>0.90) — reported as measured, not rounded up.

## Error Responses

| HTTP | Detail | When |
|------|--------|------|
| 200 | — | Successful classification |
| 422 | Pydantic validation message | Missing/malformed transaction fields |
| 503 | `WARMING_UP` | Buffer has fewer than 32 transactions since service start (cold start) |
| 503 | `MODEL_UNAVAILABLE` | Service is running but its model artefacts are not on disk |
| 500 | `INTERNAL_ERROR` | Model inference failure |

`503` is expected and normal for the first 31 requests after a restart — the
fusion engine's adapter treats it as "model unavailable for this request", not
an outage, and does not log it as a failure.
