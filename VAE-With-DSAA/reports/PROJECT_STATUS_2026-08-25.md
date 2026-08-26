# Project Status — Stratified VAE with Dual-Signal Anomaly Attribution

**Project** R26-IT-121 · **Member 2** · Wijesinghe L.P.D.B. (IT22109194)
**Supervisor** Mrs. Anjalie Gamage · SLIIT
**Status date** 25 August 2026
**Repository** `D:\Research\VAE-With-DSAA` — working tree clean at commit `a19b153`

This document is a factual audit of the component as it stands: what has been
trained, what has been verified, what the numbers actually say, and what is
still missing. Every figure below was read from the artefacts on disk, not
from prior reports.

---

## 1. Executive summary

| Dimension | State |
| --- | --- |
| Pipeline version | **v4** — PyTorch, chronological split at step 595 |
| Models trained | **16 of 16 configurations complete**, 13,844 s (3 h 51 m) |
| Model persistence | **Complete and verified** — 86 round-trip checks, 0 mismatches |
| Reproducibility | **Deterministic** — a stochastic-scoring defect was found and fixed |
| Evaluation protocol | **Leakage-free** — fit / validation / test disjoint by time |
| Repository hygiene | **Complete** — 2,046 MB → 1,325 MB, 162 tracked files, 25 MB |
| Official staging copy | **Built** — 122 files, 19.39 MB, not yet pushed |
| DSAA (novelty N2) on v4 | **Not ported** — still only on v3 leaky Keras models |
| REST API | **Contract drafted, not implemented** |
| Final report / paper | **Not written** |

Engineering maturity is high. The remaining risk is scientific, not
infrastructural: the component's headline detection result is driven by a
documented PaySim data-generation artifact, and the project's actual novelty —
Dual-Signal Anomaly Attribution — has not yet been demonstrated on the clean
v4 pipeline.

---

## 2. Version history

Four full rebuilds have taken place. Only v4 is current.

| Version | Framework | Split | Status |
| --- | --- | --- | --- |
| v1 | Keras | random | Superseded. Retained in `notebooks/v1/`. |
| v2 | Keras | random | Superseded. This is what the official repo still contains. |
| v3 | Keras | random (**leaky**) | KL fix, DSAA, DBSCAN. Retained as evidence only. |
| **v4** | **PyTorch 2.13.0+cpu** | **chronological, step 595** | **Current and complete.** |

The move from v3 to v4 was not a tuning pass. It changed the framework, the
evaluation protocol, the feature provenance rules, and the persistence layer.

---

## 3. Evaluation protocol (v4)

| Partition | Steps | What is fitted on it |
| --- | --- | --- |
| fit | 1 – ~374 | VAE weights, MinMax scaler, k-means latent centroids |
| validation | ~375 – 595 | decision thresholds, z-score normalisation statistics |
| test | 596 – 743 | nothing — scored once, after all decisions were final |

The PaySim simulation step is recovered from the engineered day feature as
`step = F7_day × 720`, verified integral to within 2.3 × 10⁻¹³. Splitting at
step 595 yields **1,642 fraudulent test transactions** and matches the split
point used by the platform's temporal component, which makes cross-member
comparison meaningful.

**Measured cost of the earlier leakage.** With framework and features held
constant, correcting the protocol reduced AP lift by **8.7×** on TRANSFER and
**8.3×** on CASH_OUT. That measurement is itself a reportable result.

Because the chronological split raises the test fraud rate well above the
dataset base rate, **average precision is the primary metric** and AP lift
(AP ÷ base rate) is the only honest cross-protocol comparison. AUC-ROC is
retained as a secondary statistic.

---

## 4. Trained models — verified complete

`reports/v4/train_log.txt`, final line:

```
DONE 16/16 in 13844s -> reports/v4/all_configs_v4.json
```

All 16 bundles are present under `checkpoints/v4/`, each containing all five
required artefacts:

```
kmeans.pkl   manifest.json   scaler.pkl   thresholds.json   vae.pt
```

80 files, 0.34 MB total. Audited directory by directory — **no bundle is
missing any artefact**.

Each `manifest.json` records the ordered feature list, architecture
(64 → 32 → latent 16), hyperparameters (free_bits 0.1, beta_max 0.05,
anneal 10 epochs, Adam, lr 1e-3, batch 256), split strategy and step, git
commit, framework version, seed 42, and training history. This is sufficient
for full reproduction.

### 4.1 Round-trip verification

**86 checks, 0 mismatches.** Each saved bundle was loaded from disk, used to
score the test partition, and its metrics compared against the stored JSON.

### 4.2 A real defect surfaced during verification

The first round-trip failed on **every** metric. Cause: the scoring path
sampled the latent variable, `z = mu + exp(0.5·logvar)·ε`, so scores were
stochastic.

> **Consequence: the v4 metrics reported before this fix were not reproducible
> even by re-running the identical code.**

Fixed by decoding the **posterior mean** at inference; training still samples,
which is correct. All v4 metrics were then regenerated deterministically.
`reports/v4/*.json` is the authoritative source of numbers.

---

## 5. Configuration naming — v2/v3 letters vs v4 identifiers

The A/B/C/D labels no longer exist in v4. Configurations are now identified as
`<protocol>__<featureset>__<stratum>`.

| Legacy label | v4 identifier | Trained? |
| --- | --- | --- |
| **Config A** — global VAE, all types in one model | `clean__FS-FULL__GLOBAL` | ✅ Yes — **FS-FULL only** |
| **Config B** — TRANSFER | `clean__<FS>__TRANSFER` | ✅ Yes — all 5 feature sets |
| **Config C** — CASH_OUT | `clean__<FS>__CASH_OUT` | ✅ Yes — all 5 feature sets |
| **Config D** — stratified ensemble | — | ❌ **Not regenerated** |
| PAYMENT control | `clean__<FS>__PAYMENT` | ✅ Yes — all 5 feature sets |

### Gap — Config D

`results/v4/metrics/clean__FS12__D_ensemble.json` exists (AP 0.7978) but
predates the determinism fix. There is **no D_ensemble file in the
authoritative `reports/v4/` directory**. The ensemble result is therefore not
currently reproducible.

### Gap — Config A coverage

Config A was trained on FS-FULL only. If FS-ORIGIN becomes the primary feature
set, Config A must be retrained on FS-ORIGIN for a like-for-like ablation
table. GLOBAL training took 3,513 s (~1 hour).

---

## 6. Feature sets

Which set is primary is a decision the ablation is meant to make, so
`features.PRIMARY_FEATURE_SET` is deliberately `None`, with a test asserting it
stays that way until the decision is taken.

| Set | n | Definition |
| --- | --- | --- |
| `FS-FULL` | 11 | All features minus F11 (look-ahead) and F7_day (extrapolation) |
| `FS-ORIGIN` | 7 | FS-FULL minus destination-side balance features (F5, F9, F10, F13) |
| `FS-CLEAN` | 4 | FS-FULL minus all balance-derived features |
| `FS12` | 12 | Keeps F7_day — reference arm for the F7_day ablation |
| `FS13` | 13 | Keeps F11 — reference arm for the F11 ablation |

Two exclusions are **methodological, not tuning**:

- **`F11_account_velocity`** aggregates an account's transaction count across
  the entire log, including rows occurring after the transaction being scored.
  It encodes information unavailable at scoring time.
- **`F7_day`** is a monotone function of time. Under a chronological split,
  every test row falls outside the training range — verified: fit-partition
  max 0.5194, test-partition min 0.8278, on all three strata.

---

## 7. Results — deterministic, from `reports/v4/all_configs_v4.json`

### 7.1 TRANSFER
Test: 11,546 rows · 821 fraud · base rate 7.11% · **maximum attainable AP lift 14.06×**

| Feature set | n | AUC-PR | AP lift | AUC-ROC | F1 | Precision | Recall | P@1000 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FS12 | 12 | 1.0000 | 14.06× *(ceiling)* | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.821 |
| FS-FULL | 11 | 1.0000 | 14.06× *(ceiling)* | 1.0000 | 0.9994 | 1.0000 | 0.9988 | 0.821 |
| FS13 | 13 | 0.9996 | 14.06× | 1.0000 | 0.9964 | 0.9927 | 1.0000 | 0.821 |
| **FS-ORIGIN** | 7 | 0.7001 | 9.85× | 0.9759 | 0.6543 | 0.6084 | 0.7077 | 0.597 |
| FS-CLEAN | 4 | 0.3476 | 4.89× | 0.7591 | 0.3427 | 0.6597 | 0.2314 | 0.312 |

### 7.2 CASH_OUT
Test: 37,196 rows · 821 fraud · base rate 2.21% · **maximum attainable AP lift 45.31×**

| Feature set | n | AUC-PR | AP lift | AUC-ROC | F1 | Precision | Recall | P@1000 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **FS-ORIGIN** | 7 | **0.7498** | **33.97×** | 0.9907 | **0.7148** | 0.7826 | 0.6577 | 0.630 |
| FS-FULL | 11 | 0.7397 | 33.51× | 0.9868 | 0.6569 | 0.8950 | 0.5189 | 0.598 |
| FS13 | 13 | 0.6125 | 27.75× | 0.8891 | 0.0606 | 0.0313 | 0.9817 | 0.514 |
| FS12 | 12 | 0.5765 | 26.12× | 0.9114 | 0.0583 | 0.0300 | 0.9988 | 0.470 |
| FS-CLEAN | 4 | 0.3663 | 16.59× | 0.8308 | 0.2497 | 0.8571 | 0.1462 | 0.356 |

### 7.3 GLOBAL (Config A)
Test: 89,961 rows · 1,642 fraud · base rate 1.82% · maximum attainable AP lift 54.79×

| Configuration | AUC-PR | AP lift | AUC-ROC | F1 | Precision | Recall | P@1000 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `clean__FS-FULL__GLOBAL` | 0.7333 | 40.18× | 0.9930 | 0.5258 | 0.7557 | 0.4032 | 0.741 |

The stratified models beat the global model on their own strata, which is the
evidence for contribution N1.

### 7.4 PAYMENT false-positive control
Test: 41,219 rows, **zero fraud by construction**. Threshold rule: 0.999
quantile fitted on the validation partition.

| Feature set | Threshold | False positives | FP rate |
| --- | --- | --- | --- |
| **FS-ORIGIN** | 5.149 | **28** | **0.068%** |
| FS-FULL | 5.015 | 45 | 0.109% |
| FS-CLEAN | 4.794 | 51 | 0.124% |
| FS12 | 3.224 | **27,547** | **66.83%** |
| FS13 | 3.055 | **30,265** | **73.42%** |

The two feature sets that retain `F7_day` fail catastrophically on the control
stratum. This is the strongest single piece of evidence for excluding it.

### 7.5 What the ablation gradient says

**FS-ORIGIN should be the primary feature set.**

1. It beats FS-FULL on CASH_OUT on **every** measure (AP 0.7498 vs 0.7397,
   F1 0.7148 vs 0.6569, AUC-ROC 0.9907 vs 0.9868, P@1000 0.630 vs 0.598).
   Removing the artifact features *improved* the weakest stratum.
2. It produces the fewest PAYMENT false positives of any set (28).
3. On TRANSFER it retains **twice** FS-CLEAN's lift (9.85× vs 4.89×),
   demonstrating that origin-side behavioural signal is real and separable from
   the destination-side artifact.

This decision has not yet been recorded in code.

---

## 8. The central finding — PaySim artifact quantification

Full write-up: `reports/BALANCE_ABLATION_FINDING.md`. Verdict: **artifact-driven,
unambiguously.**

### 8.1 One column separates TRANSFER fraud perfectly

```
F10_recipient_emptied = (newbalanceDest == 0) & (amount > 0)
```

| | fraud | normal |
| --- | --- | --- |
| `F10 == 1` | **821 / 821** (100.0%) | **0 / 10,725** (0.0%) |

**AP = 1.000000**, verified directly as `min(score｜fraud) > max(score｜normal)`
rather than as a rounded metric. `F5_dest_balance_ratio` achieves the same.

PaySim does not credit the destination account on fraudulent rows. A single
`if` statement reproduces the entire headline result of the component.

### 8.2 On CASH_OUT, one feature beats the whole model

`F4_balance_change_ratio` used alone as a ranking score reaches AP lift
**32.7×**. The full FS12 VAE reaches **26.1×**. The model destroys signal that
one column already carries.

### 8.3 Provenance

**7 of 13 engineered features derive from the four balance columns** that the
Kaggle PaySim dataset card states "should not be utilized" for fraud analysis.
Visbeek et al. (arXiv:2312.00586) report the same class of triviality.

### 8.4 What can and cannot be claimed

| No longer claimable | Unaffected and defensible |
| --- | --- |
| "The stratified VAE detects TRANSFER fraud at F1 0.98" | **N3** — the β collapse boundary. At β = 1.0, 0 of 8 latent dimensions stay active and Signal-2 spread is 0.0014; at β = 0.05 it is 98× higher. Independent of feature choice. |
| Any headline framing built on the F1 0.98 / AUC 0.9997 figures | **N2** — the Signal-2 attribution correction: latent attribution moved from a constant background to cluster-distinct dimensions, non-uniformity 0.0400 → 0.0716. |
| | **N4** — unsupervised fraud typology discovery. |
| | **Leakage inflation measurement** — 8.7× / 8.3×, framework and features held constant. |
| | **This artifact quantification**, which is itself a reportable methodological result. |

### 8.5 Why this is a strength, not a weakness

The project proposal's own risk table committed to exactly this:

> *"PaySim fraud trivially detectable — Run ablation with and without balance
> features. Report finding honestly."*

That commitment is now discharged with a measured number. Presented correctly,
this is methodological rigour, and it pre-empts the first question a reviewing
panel would otherwise ask.

**Broader implication for the platform:** any PaySim result that uses the
balance columns is measuring the simulator rather than fraud behaviour. This
applies to any DeepSentinel component whose features touch those columns.

---

## 9. Repository restructure — complete

| Item | State |
| --- | --- |
| Repository size | 2,046 MB → **1,325 MB** |
| Would be committed | **162 files, 25 MB** — no file over 50 MB, no CSV/npz/keras/pt/pkl leaking |
| `src/vae_dsaa/` package | Created — `data`, `models`, `inference`, `utils` implemented |
| `scripts/` wrappers | `prep_data.py`, `train_models.py`, `roundtrip_check.py`, `build_official_copy.py` |
| `scripts/legacy/` | 8 original `.py` files retained for provenance (0.5 MB) |
| Member 3's material | Removed |
| `Results_v1`, `EDA_v1`, `Output_v1` | Removed — superseded |
| Tests | 8 passing |
| Smoke test | Passing — bundle loads, fraud row scores 19.14 → flagged, normal row 0.95 → not flagged, deterministic, bad input rejected |
| **Official staging copy** | Built at `D:\Research\VAE-With-DSAA-official\` — **122 files, 19.39 MB**, with `CHANGES.md` |
| Git | Clean tree, last commit `a19b153` |

**A note on `.gitignore` verification.** `git check-ignore -v` reports the
*last matching pattern*, which reads backwards in the presence of negation
rules and produced false positives on the first attempt. The authoritative
test is `git ls-files --others --exclude-standard`, which is what the final
verification used. All 33 sampled tracked categories were confirmed present.

---

## 10. Outstanding work

### 10.1 Critical — affects the novelty claim

**1. DSAA has not been ported to v4.**
`src/vae_dsaa/dsaa/__init__.py` is a 70-byte stub. So is
`src/vae_dsaa/typology/__init__.py`.

> The component's primary novelty — **N2, Dual-Signal Anomaly Attribution** —
> exists only in the v3 notebook, computed on **leaky random-split Keras
> models**. There is no DSAA implementation running on the clean v4 pipeline.

Fingerprints, Signal-1, Signal-2 and the DBSCAN typologies are all preserved as
v3 evidence, but they were produced under the protocol the project has since
declared invalid. This is the largest open gap.

**2. `PRIMARY_FEATURE_SET` is still `None`.** The ablation now supports
FS-ORIGIN. Once set, two follow-ons are required:
   - retrain Config A on FS-ORIGIN (~1 hour) for a like-for-like table
   - regenerate the Config D ensemble deterministically

**3. REST API not implemented.** `src/vae_dsaa/api/__init__.py` is a stub.
The contract is drafted at `docs/integration/behavioral_api_contract.md` and
two sample payloads exist in `examples/api_responses/`, but
`/api/v1/behavioral/classify` does not exist. This blocks Member 4's fusion
engine integration.

### 10.2 High — documents carry pre-determinism-fix numbers

Metrics changed when scoring was made deterministic, but the prose documents
were not updated. **These stale figures are a direct risk to the thesis.**

| File | States | Actual (`reports/v4/`) |
| --- | --- | --- |
| `RESULTS_v4.md` — Config A | AP 0.3387, ROC 0.8627 | **AP 0.7333, ROC 0.9930** |
| `RESULTS_v4.md` — Config C (FS12) | AP 0.4550 | **AP 0.5765** |
| `RESULTS_v4.md` — "FS11" CASH_OUT | AP 0.5234, F1 0.5648 | **FS-FULL: AP 0.7397, F1 0.6569** |
| `README.md` (F7_day claim) | "F1 0.0800 → 0.5648" | **0.0583 → 0.6569** |
| `BALANCE_ABLATION_FINDING.md` | FS12 CASH_OUT AP 0.4550 / 20.6× | **0.5765 / 26.12×** |
| `BALANCE_ABLATION_FINDING.md` appendix | paths under `results/v4/code/` | superseded by `src/vae_dsaa/` |

`configs/model_config.yaml` has not been updated since 3 May 2026.

Note also that the `FS11` label used in `RESULTS_v4.md` was renamed to
`FS-FULL` during the three-tier ablation. The two are the same 11-feature set,
but the numbers differ because FS-FULL was re-run deterministically.

### 10.3 Medium — carried over from the previous session

- `F6_hour` pathology check
- 11-feature support audit
- `F7_day` error-budget decomposition
- Keras ↔ PyTorch migration write-up
- gamma / Tri-Signal decision
- `configs/model_config.yaml` refresh

### 10.4 Low

- `Dockerfile` and `docker-compose.yml` — absent
- `notebooks/demo.ipynb` — absent
- Push to the official repo `LEXES7/R26-IT-121` — staging copy ready, awaiting
  manual review and copy
- **Final report / research paper — not written**

---

## 11. Recommended order of work

The stated deadline of ~24 August 2026 has passed, so sequencing should
maximise defensibility per hour spent.

| # | Task | Estimate | Rationale |
| --- | --- | --- | --- |
| 1 | Set `PRIMARY_FEATURE_SET = "FS-ORIGIN"`; retrain Config A on FS-ORIGIN; regenerate Config D ensemble | ~1.5 h | Completes the ablation table and records a decision the data already supports |
| 2 | **Port DSAA and typology discovery to v4, run on FS-ORIGIN bundles** | ~3–4 h | The novelty itself. Without this, N2 cannot be defended under the clean protocol |
| 3 | Update the four stale documents to the deterministic numbers | ~1 h | Prevents unreproducible figures entering the thesis |
| 4 | Implement `/api/v1/behavioral/classify` | ~2–3 h | Unblocks Member 4's integration |
| 5 | Review and push the staging copy to the official repo | ~30 min | Copy is built and verified; only review remains |
| 6 | Write the report, leading with the artifact finding | — | Frame the ablation as the methodological contribution it is |

---

## 12. Bottom line

The engineering is in good shape: 16 of 16 models trained, persisted,
round-trip verified and deterministic; a leakage-free chronological protocol;
a clean, organised, correctly-ignored repository with passing tests and a
staging copy ready for the official remote.

The science has found an honest problem and measured it rather than hiding it,
which is a defensible position and one the proposal explicitly committed to.

The single most important remaining task is bringing **DSAA onto the clean v4
pipeline**. Everything else is scheduling; that one is the difference between a
component that has a novelty and a component that can demonstrate it.
