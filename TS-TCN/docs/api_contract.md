# API Contract — TS-TCN ↔ Fusion Engine

> **SUPERSEDED.** The contract below this notice is the authoritative one, as
> of 2026-08-25. It was aligned directly against the *live* code the fusion
> engine actually runs — `backend/adapters/upstream.py::call_temporal_api`
> in `fusion_engine/DeepSentinel` — not against the original W=32-window
> proposal this file used to describe. The old version assumed the fusion
> engine would POST a full 32-transaction window and expected a response
> shaped around `fraud_probability` / `attribution.peak_position` /
> `attention_distribution[32]`. That never shipped on the fusion side; the
> adapter that got built instead mirrors M1's VAE contract (a flat
> transaction in, a `temporal_risk_score` + `evidence`/`triggering_predecessor`
> object out). Confirmed with Member 4 (fusion engine owner) before this
> rewrite. `api/schemas/request.py` and `api/schemas/response.py` implement
> exactly what's documented below.

## Endpoint

```
POST /api/v1/classify
Host: localhost:8003   (TEMPORAL_API_BASE, see fusion_engine/DeepSentinel/backend/config.py)
Content-Type: application/json
```

## Request

The fusion adapter sends **one transaction at a time**, flat, plus a
composite id it computes itself:

```python
# backend/adapters/upstream.py::call_temporal_api
payload = {**transaction, "composite_id": f"{name_orig}_{step}"}
client.post(f"{base_url}/api/v1/classify", json=payload, timeout=timeout)
```

```json
{
  "step": 596,
  "type": "TRANSFER",
  "amount": 181.00,
  "nameOrig": "C1305486145",
  "nameDest": "C553264065",
  "oldbalanceOrg": 181.00,
  "newbalanceOrig": 0.00,
  "oldbalanceDest": 0.00,
  "newbalanceDest": 0.00,
  "isFlaggedFraud": 0,
  "composite_id": "C1305486145_596"
}
```

This service owns its own rolling `deque(maxlen=32)` of predecessor feature
vectors (keyed globally — see `routes/classify.py` for why, and the caveat
about production multi-stream use). On each call it:

1. Computes F1–F10 for the incoming transaction (`src/data/features.py`,
   scaled with the fitted `outputs/stage2_baselines/scaler.pkl`).
2. If the buffer has fewer than 32 entries, returns `503 WARMING_UP` — the
   fusion adapter treats any non-2xx response as "unavailable" with no
   special-casing needed, so this degrades gracefully.
3. Otherwise assembles a `(1, 32, 10)` window **from the buffer
   (the 32 preceding transactions, not including this one)**, runs
   inference, and returns the response below — using *this* transaction's
   `composite_id` as the result's identity.
4. Appends this transaction's own (scaled) feature vector to the buffer for
   the next call.

This mirrors exactly how `src/data/window_builder.py` built windows for
training: the label/id at position *i* pairs with the window of the 32
transactions strictly before *i*.

## Response

```json
{
  "composite_id": "C1305486145_596",
  "temporal_risk_score": 0.873,
  "risk_level": "CRITICAL",
  "step_burstiness": 0.42,
  "flagging_miss_rate": 0.998,
  "detection_method": "TS-TCN",
  "triggering_predecessor": {
    "composite_id": "C84281453_595",
    "attention_weight": 0.412,
    "predecessor_signal": "Large same-step drain into a dormant account",
    "offset_from_current": 1,
    "peak_features": {
      "drain_ratio": 0.998,
      "log_amount": 12.04,
      "post_transfer_ratio": 0.001,
      "dest_was_empty": 1.0,
      "dest_enrichment": 0.997,
      "type_risk_weight": 0.501,
      "inv_dest_ratio": 0.0,
      "amt_to_orig": 0.992,
      "hour_of_day": 0.65,
      "day_of_week": 0.5
    }
  },
  "evidence": {
    "current_transaction": {
      "fraud_signal_summary": "Step burstiness coefficient: 0.4200. Triggering predecessor: Large same-step drain into a dormant account."
    }
  },
  "model_version": "ts-tcn-v1.0",
  "inference_time_ms": 23.7
}
```

## Field contracts

Fields the fusion adapter reads directly — **names and nesting are locked**:

| Field | Type | Read by adapter as |
|---|---|---|
| `temporal_risk_score` | float ∈ [0, 1] | the fused score |
| `evidence.current_transaction.fraud_signal_summary` | string | LLM report anchor |
| `step_burstiness` | float | fallback-summary input, passed to `extra` |
| `triggering_predecessor.attention_weight` | float ∈ [0, 1] | passed to `extra` |
| `triggering_predecessor.predecessor_signal` | string | passed to `extra` |
| `flagging_miss_rate` | float, optional | passed to `extra` |
| `detection_method` | string | passed to `extra` |

Additive fields (ignored by the adapter itself, but `triggering_predecessor`
is forwarded to `extra` *whole* — so anything added inside it flows through
to the fusion engine's Step 4 `temporal_evidence` and the frontend
`TemporalEvidence.jsx` panel):

| Field | Type | Purpose |
|---|---|---|
| `composite_id` | string | join key, echoes the request |
| `risk_level` | `NORMAL \| SUSPICIOUS \| CRITICAL` | tuned-threshold classification |
| `triggering_predecessor.composite_id` | string | which predecessor, by id |
| `triggering_predecessor.offset_from_current` | int ∈ [1, 32] | how far back it sits |
| `triggering_predecessor.peak_features` | object | F1–F10 of the peak predecessor, unscaled |
| `model_version` | string | semver of the deployed model |
| `inference_time_ms` | float | end-to-end serving time |

## Risk levels (tuned threshold)

```
NORMAL      : temporal_risk_score <  0.4431
SUSPICIOUS  : 0.4431 <= temporal_risk_score < 0.90
CRITICAL    : temporal_risk_score >= 0.90
```

## Error responses

| HTTP | Body | When |
|------|------|------|
| 200 | `ClassifyResponse` | buffer full (≥32 predecessors), inference ran |
| 503 | `{"error": "WARMING_UP", "message", "buffer_size", "required": 32}` | buffer not yet full — cold start |
| 422 | FastAPI validation error | malformed/missing transaction fields |
| 500 | FastAPI default | model failed to load or inference error |

## Health check

```
GET /health → {"status": "ok" | "model_not_loaded", "detection_method": "TS-TCN"}
```
