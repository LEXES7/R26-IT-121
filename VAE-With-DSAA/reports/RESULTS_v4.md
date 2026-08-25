# v4 Results — Clean Chronological Protocol

**Primary feature set: `FS-ORIGIN`** · protocol `clean` · split at step 595

> **Numbers changed on 25 August 2026.** Scoring previously sampled the
> latent variable (`z = mu + exp(0.5·logvar)·ε`), which made every score —
> and therefore every metric — dependent on RNG state. A reloaded model could
> not reproduce the figures recorded when it was trained. Inference now
> decodes the posterior mean; training still samples, which is correct. All
> figures below were regenerated after that fix and are reproducible via
> `scripts/roundtrip_check.py` (86 checks, 0 mismatches). Any earlier figure
> for the same experiment is superseded.

Source of truth: `reports/v4/all_configs_v4.json`.

## 1. Detection results by stratum

### TRANSFER

Test: 11,546 rows · 821 fraud · base rate 7.11% · **maximum attainable AP lift 14.06×**

| Feature set | n | AUC-PR | AP lift | AUC-ROC | F1 | Precision | Recall | P@1000 |
|---|---|---|---|---|---|---|---|---|
| FS-FULL | 11 | 1.0000 | 14.06× | 1.0000 | 0.9994 | 1.0000 | 0.9988 | 0.821 |
| FS12 | 12 | 1.0000 | 14.06× | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.821 |
| FS13 | 13 | 0.9996 | 14.06× | 1.0000 | 0.9964 | 0.9927 | 1.0000 | 0.821 |
| **FS-ORIGIN** | 7 | 0.7001 | 9.85× | 0.9759 | 0.6543 | 0.6084 | 0.7077 | 0.597 |
| FS-ORIGIN-NOF3 | 6 | 0.3620 | 5.09× | 0.7847 | 0.3601 | 0.5884 | 0.2594 | 0.345 |
| FS-CLEAN | 4 | 0.3476 | 4.89× | 0.7591 | 0.3427 | 0.6597 | 0.2314 | 0.312 |

### CASH_OUT

Test: 37,196 rows · 821 fraud · base rate 2.21% · **maximum attainable AP lift 45.31×**

| Feature set | n | AUC-PR | AP lift | AUC-ROC | F1 | Precision | Recall | P@1000 |
|---|---|---|---|---|---|---|---|---|
| **FS-ORIGIN** | 7 | 0.7498 | 33.97× | 0.9907 | 0.7148 | 0.7826 | 0.6577 | 0.630 |
| FS-FULL | 11 | 0.7397 | 33.51× | 0.9868 | 0.6569 | 0.8950 | 0.5189 | 0.598 |
| FS13 | 13 | 0.6125 | 27.75× | 0.8891 | 0.0606 | 0.0313 | 0.9817 | 0.514 |
| FS12 | 12 | 0.5765 | 26.12× | 0.9114 | 0.0583 | 0.0300 | 0.9988 | 0.470 |
| FS-CLEAN | 4 | 0.3663 | 16.59× | 0.8308 | 0.2497 | 0.8571 | 0.1462 | 0.356 |
| FS-ORIGIN-NOF3 | 6 | 0.3464 | 15.70× | 0.8296 | 0.3363 | 0.4953 | 0.2546 | 0.364 |

### GLOBAL (Config A) — one model across all types

| Feature set | AUC-PR | AP lift | AUC-ROC | F1 | P@1000 |
|---|---|---|---|---|---|
| FS-ORIGIN | 0.6078 | 33.30× | 0.9838 | 0.4187 | 0.694 |
| FS-FULL | 0.7333 | 40.18× | 0.9930 | 0.5258 | 0.741 |

Test: 89,961 rows · 1,642 fraud · base rate 1.83% · max lift 54.79×.

### Config D — stratified ensemble

Per-stratum F1-optimal thresholds applied, then pooled over TRANSFER and
CASH_OUT. Computed from the saved bundles, so it is deterministic.

| Feature set | AUC-PR | AP lift | AUC-ROC | F1 | Precision | Recall |
|---|---|---|---|---|---|---|
| FS-ORIGIN | 0.7000 | 20.78× | 0.9832 | 0.6821 | 0.6815 | 0.6827 |
| FS-FULL | 0.9111 | 27.05× | 0.9937 | 0.8482 | 0.9614 | 0.7588 |

## 2. PAYMENT false-positive control

Zero fraud by construction. Threshold: 0.999 quantile on the validation
partition.

| Feature set | Threshold | False positives | FP rate |
|---|---|---|---|
| FS-FULL | 5.015 | 45 | 0.109% |
| **FS-ORIGIN** | 5.149 | 28 | 0.068% |
| FS-CLEAN | 4.794 | 51 | 0.124% |
| FS12 | 3.224 | 27,547 | 66.831% |
| FS13 | 3.055 | 30,265 | 73.425% |

The two sets retaining `F7_day` (FS12, FS13) fail catastrophically here —
the strongest single argument for excluding an absolute time index under a
chronological split.

## 3. The F3 dependence of FS-ORIGIN

`FS-ORIGIN-NOF3` removes `F3_balance_consistency` and nothing else.

| Stratum | FS-ORIGIN | FS-ORIGIN-NOF3 | FS-CLEAN |
|---|---|---|---|
| TRANSFER AP lift | 9.85× | **5.09×** | 4.89× |
| CASH_OUT AP lift | 33.97× | **15.70×** | 16.59× |

Deterministic single-feature baselines — the feature used directly as a
score, with no model:

| Stratum | Feature | AUC-PR | AP lift |
|---|---|---|---|
| TRANSFER | `F3_balance_consistency` | 0.6002 | 8.44× |
| TRANSFER | `F4_balance_change_ratio` | 0.6996 | 9.84× |
| TRANSFER | `F2_amount_balance_ratio` | 0.3928 | 5.52× |
| CASH_OUT | `F3_balance_consistency` | 0.1456 | 6.60× |
| CASH_OUT | `F4_balance_change_ratio` | 0.7227 | 32.74× |
| CASH_OUT | `F2_amount_balance_ratio` | 0.0854 | 3.87× |

Removing F3 collapses FS-ORIGIN to roughly FS-CLEAN's level on both strata,
and FS-ORIGIN barely exceeds `F4_balance_change_ratio` used alone. FS-ORIGIN
is defensible as the tier that removes the destination-side artifact, but it
does not demonstrate that the VAE adds capability over a single column.
