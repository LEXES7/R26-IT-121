# Stratified VAE with Dual-Signal Anomaly Attribution

**DeepSentinel** — behavioural-modality fraud detector
Project **R26-IT-121** · Member 2 · Wijesinghe L.P.D.B. (IT22109194)
Supervisor: Mrs. Anjalie Gamage · SLIIT

One variational autoencoder per transaction type, trained only on non-fraud
rows, scoring transactions by how poorly the type-specific model reconstructs
them — and decomposing every alert into per-feature and per-latent-dimension
attribution.

---

## Quick start

```bash
pip install -r requirements.txt

python scripts/prep_data.py            # build chronological-split arrays
python scripts/train_models.py         # train + persist every bundle
python scripts/patch_bundle_serving.py # serving constants into each manifest
python scripts/export_calibrators.py   # isotonic calibration per stratum
python scripts/export_typologies.py    # typology medoids for assignment
python scripts/roundtrip_check.py      # verify bundles reproduce their metrics
pytest -q
```

### Serve it

```bash
python scripts/serve_api.py                    # http://localhost:8001
python scripts/contract_test.py                # 55 contract checks
python scripts/integration_test_behavioral.py  # via the fusion engine's adapter
```

or `docker compose up --build`. See
[`docs/integration/README.md`](docs/integration/README.md).

Scoring with a saved bundle:

```python
from vae_dsaa.utils.persistence import load_bundle

p = load_bundle("checkpoints/v4/clean__FS-FULL__TRANSFER")
scores = p.score(X)        # X shaped (n, len(p.features)), raw and unscaled
flags  = p.predict(X)      # boolean, at the stored F1-optimal threshold
```

---

## Layout

```
src/vae_dsaa/
    data/          feature definitions, provenance, split preparation
    models/        VAE architecture, training loop, orchestration
    inference/     scaling, score composition, bundle-backed Predictor
    dsaa/          dual-signal attribution
    typology/      DBSCAN typology discovery
    api/           FastAPI surface — app factory, schemas, endpoints
    utils/         bundle persistence
scripts/           runnable wrappers; scripts/legacy/ holds v1 exports
notebooks/         v1, v2, v3 — the experimental record
reports/           metrics JSON, markdown findings, v3 evidence, figures
docs/integration/  API contract + technical specification
checkpoints/       trained bundles (not committed — regenerable)
data/              raw and processed CSVs (not committed — regenerable)
```

Nothing large is committed. `data/README.md` and `checkpoints/README.md` give
the exact commands to regenerate everything ignored.

---

## Evaluation protocol

Results are produced under a **chronological split**, not a random one.

| Partition | Steps | Fitted on it |
| --- | --- | --- |
| fit | 1 – ~374 | VAE, scaler, k-means centroids |
| validation | ~375 – 595 | thresholds, z-score statistics |
| test | 596 – 743 | nothing — scored once, at the end |

The simulation step is recovered from the engineered day feature as
`step = F7_day * 720`, verified integral to within 2.3e-13. Splitting at step
595 yields **1,642 test fraud transactions**, matching the split point used by
the platform's temporal component.

An earlier revision fitted the scaler and the VAE on all non-fraud rows and then
evaluated on a set containing those same rows. Correcting that, with framework
and features held constant, reduced AP lift by **9.14×** (TRANSFER) and **11.27×**
(CASH_OUT). Both arms are scored deterministically; see
`docs/keras_to_pytorch_migration.md` §4.

---

## Feature sets

**Primary set: `FS-ORIGIN`**, chosen from the measured ablation gradient rather
than assumed. It carries a documented caveat — see below.

| Set | n | Definition |
| --- | --- | --- |
| `FS-FULL` | 11 | F11 dropped (look-ahead), F7_day dropped (extrapolation) |
| `FS-ORIGIN` | 7 | FS-FULL minus destination-side balance features |
| `FS-CLEAN` | 4 | FS-FULL minus all balance-derived features |
| `FS-ORIGIN-NOF3` | 6 | FS-ORIGIN minus F3 — measures FS-ORIGIN's F3 dependence |
| `FS12` | 12 | keeps F7_day — F7_day ablation reference |
| `FS13` | 13 | keeps F11 — F11 ablation reference |

Two exclusions are methodological, not tuning:

- **`F11_account_velocity`** counts an account's transactions across the whole
  log, including rows after the transaction being scored.
- **`F7_day`** is a monotone function of time, so under a chronological split
  every test row falls outside the training range. Removing it moved CASH_OUT
  F1 from 0.0800 to 0.5648.

---

## Known dataset artifacts

Two separate shortcuts were measured, both on the destination and origin balance
columns that the Kaggle dataset card says "should not be utilized" for fraud
analysis (Visbeek et al., arXiv:2312.00586, report the same).

**Destination side.** `F10_recipient_emptied` — `(newbalanceDest == 0) & (amount
> 0)` — separates TRANSFER fraud **perfectly with no model at all**: 821/821
fraud, 0/10,725 normal, AP = 1.000000. PaySim does not credit the destination
account on fraudulent rows. `FS-ORIGIN` exists to remove this.

**Origin side.** `FS-ORIGIN`'s remaining advantage rests almost entirely on
`F3_balance_consistency`. Removing it collapses performance to roughly the
balance-free tier (FS-CLEAN):

| Stratum | FS-ORIGIN | FS-ORIGIN-NOF3 | FS-CLEAN |
| --- | --- | --- | --- |
| TRANSFER AP lift | 9.85× | **5.10×** | 4.89× |
| CASH_OUT AP lift | 33.97× | **15.72×** | 16.59× |

F3 flags rows whose balances reconcile exactly — true for 99.0% of TRANSFER
fraud and 100% of CASH_OUT fraud, because the simulated fraudster drains the
account precisely, versus 4.9% and 13.2% of normals.

**A single feature is competitive with the whole model.**
`F4_balance_change_ratio` used directly as a score reaches 9.84× on TRANSFER and
32.74× on CASH_OUT, against FS-ORIGIN's 9.85× and 33.97×.

`FS-ORIGIN` is therefore defensible as *the tier that removes the
destination-side artifact*, but the evidence does not support a claim that the
VAE adds detection capability over a single column. See
`reports/BALANCE_ABLATION_FINDING.md` and
`reports/v4/single_feature_baselines.json`.

## Serving

The component runs as its own FastAPI service on port 8001; the DeepSentinel
fusion engine reaches it over HTTP and imports nothing from this repository.

| | |
| --- | --- |
| Endpoint | `POST /api/v1/behavioral/classify` |
| Latency | 1-3 ms measured, against a 50 ms NFR budget |
| Score | isotonic-calibrated probability, out-of-sample ECE 0.013-0.039 |
| Attribution | per-feature, per-latent-dimension and per-density shares |
| Typology | nearest-medoid assignment over the discovered DBSCAN clusters |

Two decisions are worth naming. The raw composite score is unbounded and
reaches 63 on the test partition, while the consumer clamps to `[0, 1]` — so
sending it raw would deliver `1.0` for every flagged transaction and discard the
ranking. And DBSCAN cannot label a point it was not fitted on, so typology
assignment needed an explicit rule rather than a call to `predict`.

Inference is genuine and request-time rather than precomputed, so **any**
transaction can be scored, including accounts absent from training. Full field
reference: [`docs/integration/behavioral_api_contract.md`](docs/integration/behavioral_api_contract.md).

---

## Contributions

- **N1** — type-stratified VAE ensemble: one model, scaler and threshold per type.
- **N2** — Dual-Signal Anomaly Attribution read directly from the VAE objective,
  with no auxiliary explainer and no added inference latency.
- **N3** — characterisation of the β × Free Bits region in which native KL
  attribution stays informative. Measured over 120 runs (6 β × 4 Free Bits
  floors × 5 seeds) on the clean protocol: above the boundary every latent
  dimension converges to just below the floor, the largest-to-smallest
  per-dimension KL ratio falls to 1.01–1.04, and Signal-2 spread falls by about
  two orders of magnitude. At free_bits 0.10, spread is **62.5×** higher at
  β = 0.05 than at β = 1.0. Raising the floor from 0.01 to 0.20 lowers the
  collapse interval from β 0.25–0.50 to β 0.05–0.10, so the effect is the
  **interaction**, not β alone. See `reports/SESSION_FINDINGS_2026-08-25_part3.md`.
  *(An earlier single-seed Keras run under the leaky protocol reported 98×;
  that figure is superseded.)*
- **N4** — unsupervised fraud typology discovery by clustering fingerprints.

---

## Reports

| File | Contents |
| --- | --- |
| `reports/RESULTS_v4.md` | before/after tables, operating points, PR curves |
| `reports/BALANCE_ABLATION_FINDING.md` | the PaySim artifact quantification |
| `reports/v4/*.json` | per-configuration metrics |
| `reports/v3_evidence/*.json` | β sweep, KL health, DBSCAN config, typologies |
| `reports/figures/` | v3 charts, EDA charts, v4 PR curves, β×Free-Bits sweep, KL trajectories |
