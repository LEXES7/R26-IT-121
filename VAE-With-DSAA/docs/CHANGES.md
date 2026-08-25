# VAE-With-DSAA — Changes Since the v2 State in the Official Repo

**Component:** Stratified VAE with Dual-Signal Anomaly Attribution (Member 2)
**Author:** Wijesinghe L.P.D.B. (IT22109194) · R26-IT-121
**Replaces:** the v2-notebooks-only folder currently in `LEXES7/R26-IT-121`

> This file lives at `docs/CHANGES.md` in the repository and is copied to the
> staging root by `scripts/build_official_copy.py`. It previously existed only in
> the staging copy, where every `--force` rebuild destroyed it.

---

## Summary

The folder currently in the official repo holds v2 notebooks and nothing else.
This update adds an installable package, a corrected evaluation protocol,
persisted model bundles, and reports documenting several methodological problems
found in the v2/v3 work.

**Two findings mean previously reported numbers should not be reused**, and one
means the headline detection claim is withdrawn. Sections 3 and 4.

---

## 1. Structure

Now follows the same conventions as the GraphSage component.

```
src/vae_dsaa/     installable package (data, models, inference, dsaa,
                  typology, api, utils)
scripts/          runnable wrappers; scripts/legacy/ keeps superseded code
notebooks/        v1, v2, v3 — the experimental record, unchanged
reports/          metrics JSON, markdown findings, v3 evidence, figures
docs/integration/ API contract + technical specification
configs/ tests/ examples/ dashboard/
checkpoints/      model bundles — not committed, regenerable
data/             CSVs — not committed, regenerable
```

**Removed:** Member 3's TCN notebooks and TS-TCN PDFs, the other members'
proposal PDFs, and the superseded `Results_v1` / `EDA_v1` / `Output_v1` sets.

**Size:** ~20 MB across ~150 files. Nothing over 50 MB; no `.csv`, `.npz`,
`.keras`, `.pt` or `.pkl` committed. The `.gitignore` was verified in both
directions with `git ls-files --others --exclude-standard`.

---

## 2. Reproducibility

- **Model bundles are persisted.** Each configuration writes `vae.pt`,
  `scaler.pkl`, `kmeans.pkl`, `thresholds.json` and `manifest.json`. A bundle is
  self-contained. The manifest records the ordered feature list, architecture,
  hyperparameters, split point, framework version, git commit and timestamp.
- **Round-trip verified.** `scripts/roundtrip_check.py` reloads every bundle,
  re-scores the test partition and compares against the metrics recorded at
  training time: **86 checks, 0 mismatches**.
- **Scoring is deterministic.** Inference decodes the posterior mean rather than
  a sampled draw. Training still samples, as it must.
- Tests and an end-to-end smoke test cover feature-set invariants and scoring.

```bash
python scripts/prep_data.py        # build split arrays
python scripts/train_models.py     # train + persist bundles
python scripts/roundtrip_check.py  # verify
pytest -q
```

---

## 3. Findings that change what can be claimed

### 3.1 The evaluation protocol leaked

The v2/v3 pipeline fitted the scaler and the VAE on all non-fraud rows, then
evaluated on a set containing those same rows. Replaced with a chronological
split: training is step ≤ 595, test is step > 595, with a validation slice carved
from the training partition for threshold selection. The test partition is scored
once. Splitting at step 595 yields **1,642 test fraud transactions**, matching the
temporal component.

Measured with framework, feature set and scoring path all held constant:

| Stratum | Leaky AP lift | Clean AP lift | Inflation |
| --- | --- | --- | --- |
| TRANSFER | 128.48× | 14.06× | **9.14×** |
| CASH_OUT | 294.30× | 26.12× | **11.27×** |

### 3.2 A dataset artifact accounts for the TRANSFER detection result

`F10_recipient_emptied` — `(newbalanceDest == 0) & (amount > 0)` — separates
TRANSFER fraud **perfectly with no model at all**: 821/821 fraud, 0/10,725
normal, AP = 1.000000. PaySim does not credit the destination account on
fraudulent rows. The Kaggle dataset card states the four balance columns "should
not be utilized"; Visbeek et al. (arXiv:2312.00586) report the same.

A four-tier ablation measures what survives removal:

| Feature set | n | TRANSFER AP / lift | CASH_OUT AP / lift |
| --- | --- | --- | --- |
| FS-FULL | 11 | 1.0000 / 14.06× | 0.7397 / 33.51× |
| **FS-ORIGIN** *(primary)* | 7 | 0.7001 / 9.85× | 0.7498 / 33.97× |
| FS-ORIGIN-NOF3 | 6 | 0.3620 / 5.10× | 0.3464 / 15.72× |
| FS-CLEAN | 4 | 0.3476 / 4.89× | 0.3663 / 16.59× |

`FS-ORIGIN` is **artifact-reduced, not artifact-free**: its advantage rests
almost entirely on `F3_balance_consistency`, which is itself a simulator artifact
(true for 99.03% of TRANSFER fraud versus 4.94% of normals, because the
simulated fraudster drains the account exactly).

### 3.3 The detection claim is withdrawn

`F4_balance_change_ratio` used directly as a score, with no model, reaches
**9.84×** on TRANSFER and **32.74×** on CASH_OUT, against FS-ORIGIN's 9.85× and
33.97× — margins of 0.1% and 3.8%. Config G confirms this: a VAE trained on
`F3` alone reproduces the raw `F3` baseline to six decimal places.

**No feature tier demonstrates that the VAE adds detection capability over a
single column.** Detection is reported as a negative result. The component's
contribution is **attribution and triage**: a raw score gives a ranking but
cannot say why a row was flagged, nor partition the flagged set by purity.

### 3.4 Two features could not survive a causal evaluation

- **`F11_account_velocity`** aggregates across the whole log, including rows
  after the transaction being scored. Removed.
- **`F7_day`** is a monotone function of time, so every test row falls outside
  the training range (100% outside, all three strata). It consumes **94–97% of
  the reconstruction error budget**, swamping all other signal. Removing it moved
  CASH_OUT F1 from 0.0583 to 0.6569.

`F8_is_large` was recomputed against a training-partition percentile; this
changed under 0.21% of rows.

---

## 4. Attribution and typology results

Computed on the clean v4 bundles, per stratum, with no zero padding.

| | TRANSFER | CASH_OUT |
| --- | --- | --- |
| Flagged rows | 955 / 11,546 | 690 / 37,196 |
| Fraud among flagged | 581 (60.8%) | 540 (78.3%) |
| Clusters | 6 | 11 |
| DBCV | 0.7224 | 0.6699 |
| Bootstrap stability ARI | 0.9996 | 0.9231 |
| ARI vs fraud labels | 0.2274 | 0.2306 |
| AMI vs fraud labels | 0.3272 | 0.3028 |

The fingerprint isolates high-purity and zero-purity subsets of the flagged set —
TRANSFER clusters at 100% purity alongside clusters at 0% — but ARI of 0.23 is
**modest agreement, not strong**, and both statements belong in the write-up.

Removing all balance features (FS-CLEAN) collapses this on TRANSFER: ARI 0.0055,
indistinguishable from random. On CASH_OUT the evidence is inconclusive — ARI
favours FS-CLEAN, AMI favours FS-ORIGIN.

Three corrections against the v3 implementation: rows are selected by the model
rather than by label; clustering runs per stratum at native width (v3's zero
padding made all 12 clusters 100% one transaction type, ARI 0.5240 against type);
and DBCV replaces silhouette as the primary validity index.

---

## 5. Ablation — Configs A to G

Pooled over TRANSFER and CASH_OUT, primary feature set.

| Config | Model | Threshold | AP | AP lift | F1 |
| --- | --- | --- | --- | --- | --- |
| A | global | global | 0.7900 | 23.45× | 0.6018 |
| B | global | per-type | 0.7900 | 23.45× | 0.5852 |
| C | stratified | global | 0.7000 | 20.78× | 0.5443 |
| D | stratified | per-type | 0.7000 | 20.78× | 0.6821 |

A/B share scores and isolate the threshold rule; C/D likewise. A/B versus C/D
isolates stratified modelling. Configs E and F are the feature ablations above;
G is the `F3`-only control.

---

## 6. Note for the Fusion Engine

**The service is implemented and serving.** `POST /api/v1/behavioral/classify`
on port 8001, matching the adapter in
`backend/adapters/upstream.py` exactly — path, request shape, and the American
spelling `behavioral_risk_score`. Start it with `python scripts/serve_api.py`
or `docker compose up`.

| | |
| --- | --- |
| Latency | 1-3 ms measured, against the 50 ms NFR budget |
| Score | isotonic-calibrated probability in `[0, 1]`, ECE 0.013-0.039 out-of-sample |
| Attribution | Signals 1, 2 and 3, per transaction |
| Typology | nearest-medoid over the discovered clusters, or `UNASSIGNED` |
| Verification | `scripts/contract_test.py` (55 checks), `scripts/integration_test_behavioral.py` (calls your adapter directly) |

Three things worth knowing:

1. **The score is calibrated, not raw.** The model's composite z-score is
   unbounded and reaches 63 on the test partition. Your `_clamp()` would have
   returned `1.0` for every flagged transaction and discarded the ranking. The
   raw value is still available at `vae_diagnostics.raw_score`.
2. **Read the risk bands from `/health`.** They are derived at startup from the
   tuned threshold and the served distribution, and they move on retraining.
3. **Cross-stratum comparison is now valid.** The earlier caveat that scores
   were "comparable only within a stratum" no longer applies, because every
   stratum emits a probability on the same scale. Routing by type is still
   reasonable, but it is no longer required.

The three detector components report metrics on **three different test
populations**, and GraphSage predicts accounts rather than transactions. Fusion
figures cannot be obtained by combining the reported numbers. Detail in
`reports/Team_Test_Split_Comparison.md`.

---

## 7. Open items

- Attribution covers all three score terms via Signal 3 (Tri-Signal, additive);
  `signal_1` and `signal_2` keep their names and shapes, so integration is
  unaffected.
- TRANSFER typologies are **provisional**: the oracle run's bootstrap ARI is
  0.5410 with Signal 2 collapsed onto one dimension.
- `F6_hour` is the largest single Signal-1 contributor on flagged rows (0.5650
  TRANSFER, 0.7023 CASH_OUT), which warrants explanation.
- `fraud_typology` returns `UNASSIGNED` when a fingerprint falls outside every
  discovered cluster. On real flagged test rows 101 of 111 receive a typology;
  outside that population it is common, and it is a normal outcome rather than
  an error.
- The `GLOBAL` model reuses TRANSFER's `f8_p95_causal`, since a pooled model has
  no percentile of its own. It affects only `CASH_IN` and `DEBIT`, which carry
  no fraud in PaySim.
