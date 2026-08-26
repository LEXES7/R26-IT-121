# Data Inventory and Split Options — Stratified VAE + DSAA Component

**Project:** DeepSentinel (R26-IT-121) · Member 2 — Wijesinghe L.P.D.B. (IT22109194)
**Purpose:** Confirms which v3 artifacts exist on disk, and establishes whether a chronological train/test split is possible without re-running feature engineering.
**Status:** Inspection only — nothing was modified.

---

## 1. v3 notebooks

Location: `D:\Research\VAE-With-DSAA\notebooks\v3\`

| File | Note |
| --- | --- |
| `DeepSentinel_Stratified_VAE_v3_FIXED.ipynb` | main, fully run |
| `DeepSentinel_DSAA_Framework_V3.ipynb` | fully run |
| `Before_run_DeepSentinel_Stratified_VAE_v3_FIXED.ipynb` | snapshot |
| `After_check_DeepSentinel_Stratified_VAE_v3_FIXED.ipynb` | snapshot |
| `DSAA_DBSCAN_Tuning_v3.ipynb` | tuning (Sinhala) |
| `DSAA_DBSCAN_Tuning_v3_EN.ipynb` | tuning (English) |

---

## 2. v3 models and metrics

Location: `D:\Research\VAE-With-DSAA\DeepSentinel-VAE-Results\`

### `DeepSentinel_Results_v3\models\`

- 6 × `.keras` — `vae_transfer_encoder/decoder`, `vae_cashout_encoder/decoder`, `vae_payment_encoder/decoder`
- 3 × `.pkl` — `scaler_transfer`, `scaler_cashout`, `scaler_payment`
- `stratified_config.json` — per-type thresholds, z-score normalisation statistics, KMeans cluster centres

### `DeepSentinel_Results_v3\`

- `beta_sweep_v3.json`, `beta_sweep_v3.png`
- `kl_health_v3.json`
- `config_b_metrics.json`, `config_c_metrics.json`, `config_d_metrics.json`
- `config_payment_control.json`
- `confusion_matrices.png`, `stratified_vae_evaluation.png`

### `DeepSentinel_DSAA_v3\`

- `fingerprints.npz` — arrays: `fingerprints` (8213 × 29), `signal_1`, `signal_2`, `cluster_labels`, `fraud_type`
- `dbscan_config.json`, `mean_signals.json`, `typology_records.json`
- `dsaa_dashboard.png`, `typology_radar.png`, `dbscan_kdistance.png`

---

## 3. Preprocessed CSV files

Location: `D:\Research\VAE-With-DSAA\DeepSentinel-VAE-Results\DeepSentinel_Output_v2\`

6 files, 1,150 MB total. **This is the set the v3 notebooks read** (`output_dir` → `DeepSentinel_Output_v2`).

An older `DeepSentinel_Output_v1\` (5 files, 714 MB) also exists and should be ignored.

| File | Rows | Fraud |
| --- | --- | --- |
| `TRANSFER_all_features.csv` | 532,909 | 4,097 |
| `CASH_OUT_all_features.csv` | 2,237,500 | 4,116 |
| `PAYMENT_all_features.csv` | 2,151,495 | 0 |
| `TRANSFER_normal_features.csv` | non-fraud only | — |
| `CASH_OUT_normal_features.csv` | non-fraud only | — |
| `PAYMENT_normal_features.csv` | non-fraud only | — |

The `*_normal_features.csv` files are the VAE training inputs and carry no `isFraud` column.

---

## 4. The `step` column: absent, but fully recoverable

The CSV schema is exactly:

```
F1_log_amount, F2_amount_balance_ratio, F3_balance_consistency,
F4_balance_change_ratio, F5_dest_balance_ratio, F6_hour, F7_day,
F8_is_large, F9_dest_starts_empty, F10_recipient_emptied,
F11_account_velocity, F12_round_amount, F13_zero_dest_history, isFraud
```

There is no `step`, `type`, `nameOrig` or `nameDest` column.

**However `F7_day = (step / 24) / 30`, which is invertible.** Verified across all three `*_all_features.csv` files:

```
step = F7_day × 720

max deviation from integer : 2.27e-13
range 1–743, 743 unique values          ← matches PaySim exactly
cross-check step % 24 == F6_hour × 24   ← passes on every row
rows already sorted by step             ← True
```

### Conclusion

**A chronological split is possible right now.** No feature-engineering re-run and no raw PaySim download are needed.

---

## 5. The split point matches the TS-TCN component exactly

The TS-TCN documentation states: *"train: step ≤ 595; test: step > 595, 1,642 test fraud cases."*

Applying that split to this component's data:

| Stratum | Train rows | Test rows | Test fraud |
| --- | --- | --- | --- |
| TRANSFER | 521,363 | 11,546 | 821 |
| CASH_OUT | 2,200,304 | 37,196 | 821 |
| PAYMENT | 2,110,276 | 41,219 | 0 |
| **Total** | | | **1,642** ✅ |

Exact match. Adopting step 595 makes this component's results **directly comparable to Member 3's** on an identical test population.

---

## 6. Three considerations before deciding

### 6.1 Fraud is heavily time-skewed

TRANSFER fraud by step quartile:

| Step range | Normal | Fraud |
| --- | --- | --- |
| 1–156 | 133,327 | 883 |
| 157–250 | 134,038 | 528 |
| 251–346 | 131,055 | 510 |
| 347–743 | 130,392 | **2,176** |

The final quartile holds over half of all TRANSFER fraud.

### 6.2 A chronological split changes the fraud rate drastically — every current number will move

TRANSFER test fraud rate rises from 0.77% overall to **821 / 11,546 = 7.1%**. Precision at that class balance is a fundamentally different quantity, so the current F1 of 0.9836 is **not comparable** to whatever a chronological split produces.

This is a re-baseline, not a tweak. All reported metrics (Configs A–D) would need regenerating.

### 6.3 A chronological split does not fix the causality problem in F8 and F11

Both features were computed across the **entire** dataset during preprocessing:

- `F11_account_velocity` counts an account's transactions including rows that occur *after* the transaction being scored.
- `F8_is_large` uses a 95th percentile computed over all rows rather than the training partition only.

Splitting by time afterwards leaves that look-ahead information baked into the feature values. Removing it genuinely requires re-running feature engineering — and there is **no raw PaySim file on disk**, so that path needs a fresh `kagglehub` download (~180 MB).

---

## 7. Summary of options

| Option | Cost | What it gives |
| --- | --- | --- |
| **A — Chronological split at step 595** | Free, available now | Causally valid split; results directly comparable to Member 3; requires regenerating all Config A–D metrics |
| **B — Keep the current stratified random split** | Already done | Existing numbers stand; but the split is not causal and a reviewer may object |
| **C — Full causal pipeline** | Re-run feature engineering + fresh PaySim download + full retrain | Removes look-ahead from F8 and F11 as well as from the split; largest job |

Option A alone is free and available immediately. Option C is a substantially larger piece of work.
