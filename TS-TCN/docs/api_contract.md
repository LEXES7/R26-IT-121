# API Contract — TS-TCN ↔ Fusion Engine

This document defines the JSON contract between the **TS-TCN service**
(Member 3) and the **Fusion Engine** (Member 4). It is locked — any change
must be agreed by both parties.

## Endpoint

```
POST /api/v1/classify
Host: tstcn-service:8001
Content-Type: application/json
```

## Request

```json
{
  "transaction": {
    "step": 596,
    "type": "TRANSFER",
    "amount": 181.00,
    "nameOrig": "C1305486145",
    "oldbalanceOrg": 181.00,
    "newbalanceOrig": 0.00,
    "nameDest": "C553264065",
    "oldbalanceDest": 0.00,
    "newbalanceDest": 0.00
  }
}
```

The TS-TCN service maintains an internal thread-safe `deque(maxlen=32)`
of recent transactions. The request only needs the *current* transaction —
the service reconstructs the window from its own buffer.

## Response

```json
{
  "composite_id": "C1305486145_596",
  "fraud_probability": 0.873,
  "fraud_label": 1,
  "threshold_used": 0.34,
  "attribution": {
    "peak_position": 28,
    "peak_weight": 0.412,
    "peak_transaction_id": "C84281453_595",
    "peak_features": {
      "drain_ratio": 0.998,
      "log_amount": 12.04,
      "post_transfer_ratio": 0.001,
      "dest_was_empty": 1.0,
      "dest_enrichment": 0.997,
      "type_risk_weight": 0.501,
      "inv_dest_ratio": 0.000,
      "amt_to_orig": 0.992,
      "hour_of_day": 0.65,
      "day_of_week": 0.5
    },
    "attention_distribution": [0.001, 0.002, ..., 0.412]
  },
  "model_version": "ts-tcn-v1.0",
  "inference_time_ms": 23.7
}
```

## Field Contracts

| Field | Type | Description |
|-------|------|-------------|
| `composite_id` | string | `{nameOrig}_{step}` — join key across components |
| `fraud_probability` | float ∈ [0, 1] | Sigmoid output before thresholding |
| `fraud_label` | int ∈ {0, 1} | Binary decision after threshold |
| `threshold_used` | float | Tuned threshold from Stage 6 evaluation |
| `attribution.peak_position` | int ∈ [0, 31] | Most influential predecessor index in window |
| `attribution.peak_weight` | float ∈ [0, 1] | Attention weight at `peak_position` |
| `attribution.peak_transaction_id` | string | composite_id of the peak predecessor |
| `attribution.peak_features` | object | F1–F10 feature values of the peak predecessor |
| `attribution.attention_distribution` | array[32] | Full attention vector (sums to 1.0) |
| `model_version` | string | Semver string of the deployed model |
| `inference_time_ms` | float | End-to-end serving time |

## Error Responses

| HTTP | Code | When |
|------|------|------|
| 200 | OK | Successful classification |
| 400 | `BAD_REQUEST` | Missing/malformed transaction fields |
| 422 | `UNPROCESSABLE_ENTITY` | Invalid types or out-of-range values |
| 503 | `WARMING_UP` | Buffer has < 32 transactions (cold start) |
| 500 | `INTERNAL_ERROR` | Model inference failure |
