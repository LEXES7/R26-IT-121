# Behavioural Detector — how to call it

The behavioural modality of DeepSentinel. One VAE per transaction type scores a
transaction and decomposes the alert into per-feature and per-latent-dimension
attribution.

Full field reference: [`behavioral_api_contract.md`](behavioral_api_contract.md).

---

## Run it

```bash
pip install -r requirements.txt
python scripts/serve_api.py            # http://localhost:8001
```

Or in a container — the bundles are baked in, so nothing needs mounting:

```bash
docker compose up --build
```

Verify:

```bash
python scripts/contract_test.py               # 55 contract checks, no fusion engine needed
python scripts/integration_test_behavioral.py # calls the fusion engine's own adapter
```

---

## Call it

```bash
curl -s localhost:8001/api/v1/behavioral/classify -H 'Content-Type: application/json' -d '{
  "transaction_id": "TX_1", "composite_id": "C1231006815_601",
  "step": 601, "type": "TRANSFER", "amount": 181000.0,
  "nameOrig": "C1231006815", "nameDest": "C1666544295",
  "oldbalanceOrg": 181000.0, "newbalanceOrig": 0.0,
  "oldbalanceDest": 0.0, "newbalanceDest": 0.0, "isFlaggedFraud": 0
}'
```

The four fields a consumer normally wants:

| Field | Use |
| --- | --- |
| `behavioral_risk_score` | calibrated probability in `[0, 1]` — fuse this |
| `risk_level` | LOW / MEDIUM / HIGH / CRITICAL |
| `evidence.current_transaction.fraud_signal_summary` | grounded sentence for the LLM report |
| `fraud_typology.typology_label` | RAG retrieval key, or `UNASSIGNED` |

Sample payloads for mock generation live in
[`../../examples/api_responses/`](../../examples/api_responses) — one per
response branch, including the 422.

---

## Four things worth knowing

**1. The score is a probability, not the model's raw output.** The VAE emits an
unbounded composite z-score that reaches 63 on the test partition. Sending that
raw would make the fusion engine's `_clamp()` return exactly `1.0` for every
flagged transaction, destroying the ranking. The score is isotonic-calibrated
per stratum, out-of-sample ECE 0.013–0.039. `vae_diagnostics.raw_score` still
carries the underlying value for diagnostics.

**2. Read the risk bands from `/health`.** They are derived at startup from the
tuned threshold and the served score distribution, and they move when models are
retrained. Do not hard-code them.

**3. Any transaction can be scored.** Inference is genuine and request-time —
1–3 ms against a 50 ms budget — so unlike the graph modality there is no
"account not in the snapshot" case and no 404. `CASH_IN` and `DEBIT` route to
the pooled GLOBAL model; `PAYMENT` is the false-positive control stratum and is
scored but marked `is_control_stratum: true`.

**4. Typology labels are post-hoc.** Clusters are discovered by DBSCAN over the
attribution fingerprints with no label used at any point. The names describe
what distinguishes each cluster; `fatf_hint` is advisory. `UNASSIGNED` means the
fingerprint fell outside every discovered cluster — a normal outcome, not an
error.

---

## During startup

The service answers **503** until the bundles are loaded, never a neutral score.
A `0.5` would be a fabricated opinion the consumer cannot tell from a real one.
Startup takes well under a second.

---

## If something breaks

The adapter reads every field with `.get()` and a default, so a renamed field
produces **no error** — the modality reports itself available and contributes a
neutral `0.5`. If the behavioural signal looks suspiciously flat:

```bash
python scripts/integration_test_behavioral.py
```

Stage 3 calls the real adapter and fails loudly when a score comes back as
exactly `0.5` or a summary is missing.
