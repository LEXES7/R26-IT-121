# Session Findings — 25 August 2026

**Project:** DeepSentinel (R26-IT-121) · Member 2 — Wijesinghe L.P.D.B. (IT22109194)
**Scope:** the F3 dependence check, the DSAA/typology port to v4, the gamma decision, and the document corrections.

> **What this document is.** The interpretation and reasoning from this working
> session, preserved. It is **not** `reports/RESULTS_v4.md` — that file is
> auto-generated from `reports/v4/all_configs_v4.json` by
> `scripts/make_report.py`, holds metric tables only with no narrative, and is
> overwritten every time it is regenerated. This document is written once and kept.

---

# Part 1 — The F3 result

*Reported as soon as it finished, because it is worse than the branch that was anticipated.*

## FS-ORIGIN-NOF3: it collapsed

| Stratum | FS-ORIGIN (7) | FS-ORIGIN-NOF3 (6) | FS-CLEAN (4) |
| --- | --- | --- | --- |
| TRANSFER lift | 9.85× | **5.10×** | 4.89× |
| CASH_OUT lift | 33.97× | **15.72×** | 16.59× |

Removing `F3_balance_consistency` drops TRANSFER to 5.10× against FS-CLEAN's
4.89×, and CASH_OUT to 15.72× — actually **below** FS-CLEAN's 16.59×.

**FS-ORIGIN is essentially an F3 detector.** The suspicion was correct, and it
must be stated in the thesis.

## A second finding that was not asked for

Deterministic single-feature baselines, no model at all:

| Stratum | Feature | AP | Lift | AUROC |
| --- | --- | --- | --- | --- |
| TRANSFER | `F3` alone | 0.6002 | 8.44× | 0.9704 |
| TRANSFER | `F4` alone | 0.6996 | **9.84×** | 0.9262 |
| CASH_OUT | `F3` alone | 0.1456 | 6.60× | 0.9338 |
| CASH_OUT | `F4` alone | 0.7227 | **32.74×** | 0.9545 |

Compared against the full seven-feature VAE:

| Stratum | `F4` alone | FS-ORIGIN VAE | VAE advantage |
| --- | --- | --- | --- |
| TRANSFER | 9.84× | 9.85× | **+0.1%** |
| CASH_OUT | 32.74× | 33.97× | **+3.8%** |

The VAE adds essentially nothing over one column used directly as a score. Note
the internal contradiction: `F4` alone gives 9.84× on TRANSFER, but the
six-feature VAE that *contains* `F4` gives only 5.10× — the model is destroying
signal that the raw feature carries.

## On F3 being an artifact too

The proposed mechanism was right:

| | `F3 == 1` in fraud | `F3 == 1` in normal |
| --- | --- | --- |
| TRANSFER | **99.03%** | 4.94% |
| CASH_OUT | **100.00%** | 13.24% |

`F3` flags rows where `oldbalanceOrg − amount − newbalanceOrig ≈ 0`. Fraudulent
transfers reconcile exactly because the simulated fraudster drains the account
precisely; genuine transfers frequently do not. That is a simulator property,
not fraud behaviour.

## What was done with Decision 1

`PRIMARY_FEATURE_SET = "FS-ORIGIN"` was recorded as instructed — the stated
contingency was "say so in the thesis", not "change the choice". The constant
carries the full caveat in its docstring (both dependence numbers and the
F4-alone comparison), and `test_f3_ablation_tier_exists` was added so the
measuring tier cannot be deleted. 9 tests pass.

**Flagged for decision:** the F4-alone finding is beyond what the contingency
anticipated. FS-ORIGIN is defensible as *"the tier that removes the
destination-side artifact"*, but not as *"the tier where the VAE demonstrates
behavioural modelling capability"* — on the current evidence **no tier supports
that second claim**. Reversing to FS-CLEAN is a one-line change if the
artifact-free tier is the preferred anchor.

---

# Part 2 — All three priorities complete

Nothing committed, nothing pushed.

## 1. FS-ORIGIN-NOF3 — it collapsed

| Stratum | FS-ORIGIN (7) | FS-ORIGIN-NOF3 (6) | FS-CLEAN (4) |
| --- | --- | --- | --- |
| TRANSFER AP lift | 9.85× | **5.10×** | 4.89× |
| CASH_OUT AP lift | 33.97× | **15.72×** | 16.59× |

FS-ORIGIN is essentially an F3 detector. On CASH_OUT it falls below FS-CLEAN
once F3 is removed.

Deterministic single-feature baselines — these never involved the model, so the
determinism fix did not move them; the 8.44× and 32.74× figures stand:

| Stratum | `F4` alone | `F3` alone | FS-ORIGIN VAE | VAE advantage |
| --- | --- | --- | --- | --- |
| TRANSFER | **9.84×** | 8.44× | 9.85× | **+0.1%** |
| CASH_OUT | **32.74×** | 6.60× | 33.97× | **+3.8%** |

## 2. DSAA on FS-ORIGIN — the results are strong

| | TRANSFER | CASH_OUT |
| --- | --- | --- |
| Flagged rows | 955 / 11,546 | 690 / 37,196 |
| **Fraud among flagged** | **581 (60.8%)** | **540 (78.3%)** |
| Recall | 70.8% | 65.8% |
| Fingerprint | 15-dim (7+8) | 23-dim (7+16) |
| Clusters | **6** | **11** |
| Noise | 2.0% | 14.1% |
| **DBCV** | **0.7224** | **0.6699** |
| Silhouette | 0.4812 | 0.5996 |
| Davies-Bouldin | 0.574 | 0.356 |
| Bootstrap ARI | **0.9996 ± 0.0010** | 0.9231 ± 0.0141 |

Against v3's silhouette of 0.2387 this is a different quality of result, and
bootstrap stability near 1.0 means the partition is a property of the data, not
of the sample.

**Clusters separate by precision, which is operationally meaningful.** TRANSFER
cluster 2 (92 rows) and cluster 5 (46 rows) are **100% fraud**; clusters 3 and 4
(38 and 113 rows) are **0% fraud**. CASH_OUT cluster 0 (267 rows) is 98.5%
fraud. Signal 2 varies by cluster (dim_0, dim_2, dim_3, dim_7), so latent
attribution is discriminating rather than constant.

**v3 confound quantified:** ARI(clusters, transaction type) = **0.5240**, with
**12 of 12** clusters 100% one type. The limitations section has its number.

## 3. Gamma — recommend Option A (Tri-Signal)

| Stratum | A: keep γ=0.2 | B: γ=0, renormalised | Δ (B−A) |
| --- | --- | --- | --- |
| TRANSFER AUC-PR | **0.7001** | 0.6668 | **−0.0333** |
| CASH_OUT AUC-PR | **0.7498** | 0.6818 | **−0.0680** |

Dropping the density term costs 4.8% and 9.1% of AP. It earns its weight, so the
honest fix is to attribute it, not delete it. `signal_3` is implemented as the
per-dimension share of squared displacement from the nearest centroid — which
decomposes the density term exactly — and is **additive**: `signal_1` and
`signal_2` keep their names, widths and meaning, so Member 4's fusion engine is
unaffected.

One caveat: signal_3's non-uniformity (0.0708 / 0.0835) is lower than signal_1
(0.1828 / 0.2332) and signal_2 (0.1465 / 0.1136), so it is the least
discriminative of the three per-dimension.

## 4. Documents updated

`RESULTS_v4.md` regenerated from `reports/v4/`; `README.md`,
`BALANCE_ABLATION_FINDING.md` (sections 2 and 6 rebuilt from authoritative
metrics, plus a new section 9) and `configs/model_config.yaml` rewritten with
every change marked `CHANGED` against its old value. Each carries the
determinism note.

`FS11` → `FS-FULL` done; the remaining `FS11` strings were in
`results/v4/code/`, the superseded prototype that was not to be left under
`results/` — moved to `scripts/legacy/v4_prototype/`.

**Config D regenerated deterministically:** FS-ORIGIN AP 0.7000 / 20.78× /
F1 0.6821; FS-FULL AP 0.9111 / 27.05× / F1 0.8482.

9 tests pass. Staging copy rebuilt: **138 files, 19.54 MB**, zero leaks.

Stopped there as instructed — no API, no Docker.

---

## Where the underlying numbers live

| Artefact | Path |
| --- | --- |
| Authoritative metrics, all configurations | `reports/v4/all_configs_v4.json` |
| Single-feature baselines | `reports/v4/single_feature_baselines.json` |
| DSAA, typology and gamma results | `reports/v4/dsaa/dsaa_FS-ORIGIN.json` |
| Auto-generated metric tables | `reports/RESULTS_v4.md` |
| Artifact quantification | `reports/BALANCE_ABLATION_FINDING.md` |
| Model bundles | `checkpoints/v4/` |
