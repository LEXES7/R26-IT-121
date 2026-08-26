# Balance-Feature Ablation — PaySim Artifact Quantification

**Project:** DeepSentinel (R26-IT-121) · Member 2 — Wijesinghe L.P.D.B. (IT22109194)
**Experiment:** Does the Stratified VAE detect fraud, or does it exploit a documented PaySim data-generation artifact?
**Protocol:** clean chronological split at step 595, FS12 feature set (12 features, F11 dropped, F8 recomputed causally)
**Verdict:** **Artifact-driven. Unambiguously.**

> This is an ablation experiment. The delivered system retains its full feature set;
> nothing in the production pipeline was changed by this analysis.

> **Updated 25 August 2026.** Two changes since this document was first written.
> First, scoring was made deterministic — it previously sampled the latent
> variable, so every metric depended on RNG state and a reloaded model could not
> reproduce its own recorded figures. All numbers below were regenerated after
> that fix. Second, the feature tiers were renamed and extended: the ad-hoc
> `FS12_nobalance` arm has been replaced by a designed gradient
> (`FS-FULL` → `FS-ORIGIN` → `FS-ORIGIN-NOF3` → `FS-CLEAN`) that separates
> origin-side from destination-side balance features. Any earlier figure for the
> same experiment is superseded by `reports/v4/all_configs_v4.json`.

---

## 1. Headline result — a single column separates TRANSFER fraud perfectly

```
F10_recipient_emptied = (newbalanceDest == 0) & (amount > 0)
```

| | fraud | normal |
| --- | --- | --- |
| `F10 == 1` | **821 / 821** (100.0%) | **0 / 10,725** (0.0%) |

**AP = 1.000000.** Perfect separation, verified directly as `min(score｜fraud) > max(score｜normal)` — not merely a rounded metric. `F5_dest_balance_ratio` achieves the same.

In PaySim, every fraudulent TRANSFER leaves the destination balance at exactly zero, and no legitimate TRANSFER does. The simulator does not credit the destination account on fraud rows. A single `if` statement reproduces the entire headline result of the component.

---

## 2. The measured gradient

Regenerated deterministically on the designed tiers. Each tier removes a named
group; nothing else changes.

### TRANSFER — base rate 7.11%, maximum attainable AP lift 14.06×

| Configuration | Features | AUC-PR | AP lift | P@1000 | F1 |
| --- | --- | --- | --- | --- | --- |
| FS-FULL — all defensible features | 11 | 1.0000 | 14.06× *(ceiling)* | 0.821 | 0.9994 |
| FS-ORIGIN — destination-side removed | 7 | 0.7001 | 9.85× | 0.597 | 0.6543 |
| FS-ORIGIN-NOF3 — F3 also removed | 6 | 0.3620 | **5.09×** | 0.345 | 0.3601 |
| FS-CLEAN — no balance columns | 4 | 0.3476 | 4.89× | 0.312 | 0.3427 |
| `F10_recipient_emptied` alone, no VAE | 1 | **1.0000** | **14.06×** | — | — |

### CASH_OUT — base rate 2.21%, maximum attainable AP lift 45.31×

| Configuration | Features | AUC-PR | AP lift | P@1000 | F1 |
| --- | --- | --- | --- | --- | --- |
| FS-FULL | 11 | 0.7397 | 33.51× | 0.598 | 0.6569 |
| FS-ORIGIN | 7 | 0.7498 | 33.97× | 0.630 | 0.7148 |
| FS-ORIGIN-NOF3 | 6 | 0.3464 | **15.70×** | 0.364 | 0.3363 |
| FS-CLEAN | 4 | 0.3663 | 16.59× | 0.356 | 0.2497 |
| `F4_balance_change_ratio` alone, no VAE | 1 | **0.7227** | **32.74×** | — | — |

**On CASH_OUT a single feature outperforms every VAE tier** — 32.74× against
FS-ORIGIN's 33.97×, the best model result.

---

## 3. Feature provenance

Classified by reading the feature-engineering source, not by inference.

| Feature | Source columns | Balance-derived? |
| --- | --- | --- |
| `F1_log_amount` | `amount` | No |
| `F2_amount_balance_ratio` | `amount`, `oldbalanceOrg` | **Yes** |
| `F3_balance_consistency` | `oldbalanceOrg`, `amount`, `newbalanceOrig` | **Yes** |
| `F4_balance_change_ratio` | `newbalanceOrig`, `oldbalanceOrg` | **Yes** |
| `F5_dest_balance_ratio` | `newbalanceDest`, `oldbalanceDest` | **Yes** |
| `F6_hour` | `step` | No |
| `F7_day` | `step` | No |
| `F8_is_large` | `amount` | No |
| `F9_dest_starts_empty` | `oldbalanceDest` | **Yes** |
| `F10_recipient_emptied` | `newbalanceDest`, `amount` | **Yes** |
| `F11_account_velocity` | `nameOrig` | No (dropped for look-ahead) |
| `F12_round_amount` | `amount` | No |
| `F13_zero_dest_history` | `oldbalanceDest`, `newbalanceDest`, `amount` | **Yes** |

**7 of 13 features are derived from the four balance columns** that the Kaggle dataset card states "should not be utilized" for fraud analysis.

---

## 4. Single-feature discriminative power (test partition, no model)

Each feature used directly as a ranking score, best of both directions.

### TRANSFER (base rate 7.11%, ceiling 14.1×)

| Rank | Feature | Balance? | AUC-PR | AP lift |
| --- | --- | --- | --- | --- |
| 1 | `F5_dest_balance_ratio` | **BAL** | **1.0000** | **14.1×** |
| 1 | `F10_recipient_emptied` | **BAL** | **1.0000** | **14.1×** |
| 3 | `F4_balance_change_ratio` | **BAL** | 0.6996 | 9.8× |
| 4 | `F3_balance_consistency` | **BAL** | 0.6002 | 8.4× |
| 5 | `F2_amount_balance_ratio` | **BAL** | 0.3928 | 5.5× |
| 6 | `F9_dest_starts_empty` | **BAL** | 0.3692 | 5.2× |
| 7 | `F7_day` | | 0.2817 | 4.0× |
| 8 | `F6_hour` | | 0.2461 | 3.5× |
| 9 | `F1_log_amount` | | 0.1651 | 2.3× |
| 10 | `F12_round_amount` | | 0.1101 | 1.5× |
| 11 | `F8_is_large` | | 0.1059 | 1.5× |
| 12 | `F13_zero_dest_history` | **BAL** | 0.0809 | 1.1× |

The six strongest features are all balance-derived. The best non-balance feature reaches 4.0×.

### CASH_OUT (base rate 2.21%, ceiling 45.3×)

| Rank | Feature | Balance? | AUC-PR | AP lift |
| --- | --- | --- | --- | --- |
| 1 | `F4_balance_change_ratio` | **BAL** | **0.7227** | **32.7×** |
| 2 | `F1_log_amount` | | 0.4683 | 21.2× |
| 3 | `F7_day` | | 0.2152 | 9.7× |
| 4 | `F5_dest_balance_ratio` | **BAL** | 0.1968 | 8.9× |
| 5 | `F6_hour` | | 0.1655 | 7.5× |
| 6 | `F3_balance_consistency` | **BAL** | 0.1456 | 6.6× |
| 7 | `F8_is_large` | | 0.1171 | 5.3× |
| 8 | `F2_amount_balance_ratio` | **BAL** | 0.0854 | 3.9× |
| 9 | `F12_round_amount` | | 0.0769 | 3.5× |
| 10 | `F13_zero_dest_history` | **BAL** | 0.0278 | 1.3× |
| 11 | `F9_dest_starts_empty` | **BAL** | 0.0278 | 1.3× |
| 12 | `F10_recipient_emptied` | **BAL** | 0.0221 | 1.0× |

`F10`, which perfectly separates TRANSFER fraud, is **useless on CASH_OUT** (0 of 821 fraud rows). The artifact is specific to the transfer leg.

---

## 5. Correction to an earlier baseline

The first trivial-baseline run scored `1 − F3_balance_consistency` and reported lift 1.0×. That direction was **inverted**.

`F3 == 1` (balances reconcile) holds for **99.0% of fraud** versus **4.9% of normals** on TRANSFER — fraudulent transfers reconcile *exactly*, because the fraudster drains the account precisely. In the correct direction F3 alone reaches AP 0.6002, lift 8.4×.

The per-feature table in Section 4 supersedes the earlier figure.

---

## 6. Answer to the question posed

> *Does TRANSFER stay strong without the balance features (genuine behavioural
> structure), or does it collapse toward the trivial baseline (artifact-driven)?*

**It collapses — and the trivial baseline is not merely competitive, it is
perfect.**

- AP lift falls 14.06× → 4.89× when all balance features are removed.
- F1 falls 0.9994 → 0.3427.
- A single balance column achieves AP 1.000000 with no model at all.

The claim *"the stratified VAE detects TRANSFER fraud at F1 0.99"* is not
supportable. What the result demonstrates is that `newbalanceDest == 0`
identifies fraudulent transfers in PaySim.

Section 9 shows the collapse is not confined to the destination side.

---

## 7. What survives

This relocates the contribution; it does not eliminate it.

**No longer claimable**
- TRANSFER detection performance as evidence of behavioural modelling capability.
- Any headline framing built on the F1 0.98 / AUC 0.9997 figures.

**Unaffected**
- **N3 — the β × Free Bits collapse boundary.** Measured over 120 runs (6 β × 4 Free Bits floors × 5 seeds) on the clean protocol. Above the boundary every latent dimension converges to just below the floor and the largest-to-smallest per-dimension KL ratio falls to 1.01–1.04; at free_bits 0.10 Signal-2 spread is **62.5×** higher at β = 0.05 than at β = 1.0. Raising the floor from 0.01 to 0.20 moves the collapse interval from β 0.25–0.50 to β 0.05–0.10, so the effect is the interaction rather than β alone. Independent of which features are used. *(An earlier single-seed Keras run under the leaky protocol reported 98×; superseded — see `reports/SESSION_FINDINGS_2026-08-25_part3.md`.)*
- **N2 — the Signal-2 attribution correction.** Latent attribution moved from a constant background (same 3 dimensions dominating every cluster) to cluster-distinct dimensions; non-uniformity 0.0400 → 0.0716.
- **N4 — unsupervised typology discovery.**
- **Leakage inflation measurement.** AP lift falls **9.14×** (TRANSFER) and **11.27×** (CASH_OUT) between the leaky and clean protocols, with framework, features and scoring path held constant.
- **This artifact quantification**, which is itself a reportable methodological result.

---

## 8. Supporting literature

- The Kaggle PaySim dataset card states `oldbalanceOrg`, `newbalanceOrig`, `oldbalanceDest` and `newbalanceDest` "should not be utilized" for fraud analysis.
- Visbeek et al., *arXiv:2312.00586*, show that a rule as simple as `amount == oldbalanceOrig` achieves near-trivial separation on PaySim.
- The project proposal's own risk table anticipated this: *"PaySim fraud trivially detectable — Run ablation with and without balance features. Report finding honestly."* That commitment is now discharged with a measured number.

**Broader implication:** any PaySim result that uses the balance columns is measuring the simulator rather than fraud behaviour. This applies to any component of the platform whose features touch those columns.

---

## Appendix — reproduction

| Item | Path |
| --- | --- |
| Ablation runner | `results/v4/code/ablate.py` |
| Metrics | `results/v4/metrics/ablation_fast.json` |
| Prepared arrays and split masks | `results/v4/data/*.npz` |
| Split and F8 report | `results/v4/metrics/prep_report.json` |

Command: `python results/v4/code/ablate.py fast`

---

## 9. Update — the origin side is compromised too

The `FS-ORIGIN` tier was built to keep origin-side balance ratios while removing
the destination-side artifact. It does remove the artifact, but its remaining
advantage is concentrated in a single feature.

`FS-ORIGIN-NOF3` removes `F3_balance_consistency` and nothing else:

| Stratum | FS-ORIGIN (7) | FS-ORIGIN-NOF3 (6) | FS-CLEAN (4) |
| --- | --- | --- | --- |
| TRANSFER AP lift | 9.85× | **5.10×** | 4.89× |
| CASH_OUT AP lift | 33.97× | **15.72×** | 16.59× |

Removing F3 returns both strata to roughly the balance-free level — on CASH_OUT
it falls slightly *below* it.

**Why F3 is itself close to an artifact.** F3 marks rows where
`oldbalanceOrg − amount − newbalanceOrig ≈ 0`, i.e. the ledger reconciles:

| | `F3 == 1` in fraud | `F3 == 1` in normal |
| --- | --- | --- |
| TRANSFER | **99.03%** | 4.94% |
| CASH_OUT | **100.00%** | 13.24% |

The simulated fraudster drains the account to the cent, so fraudulent rows
reconcile exactly; genuine rows frequently do not. Real fraud is not that tidy.

### A single feature is competitive with the whole model

Deterministic single-feature baselines — the raw feature used directly as a
ranking score, no model at all:

| Stratum | Feature | AUC-PR | AP lift | AUC-ROC |
| --- | --- | --- | --- | --- |
| TRANSFER | `F4_balance_change_ratio` | 0.6996 | **9.84×** | 0.9262 |
| TRANSFER | `F3_balance_consistency` | 0.6002 | 8.44× | 0.9704 |
| TRANSFER | `F2_amount_balance_ratio` | 0.3928 | 5.52× | 0.9504 |
| CASH_OUT | `F4_balance_change_ratio` | 0.7227 | **32.74×** | 0.9545 |
| CASH_OUT | `F3_balance_consistency` | 0.1456 | 6.60× | 0.9338 |
| CASH_OUT | `F2_amount_balance_ratio` | 0.0854 | 3.87× | 0.8651 |

Against the seven-feature VAE:

| Stratum | `F4` alone | FS-ORIGIN VAE | VAE advantage |
| --- | --- | --- | --- |
| TRANSFER | 9.84× | 9.85× | **+0.1%** |
| CASH_OUT | 32.74× | 33.97× | **+3.8%** |

Note the internal contradiction: `F4` alone reaches 9.84× on TRANSFER, but the
six-feature VAE that *contains* `F4` reaches only 5.10×. The model is not
extracting what the raw feature already carries.

### What can and cannot be claimed

`FS-ORIGIN` is defensible as **the tier that removes the destination-side
artifact**, and it is the primary set on that basis — it is best on CASH_OUT
across every measure and produces the fewest PAYMENT false positives.

It is **not** evidence that the VAE adds detection capability over a single
column. On the current measurements no tier supports that claim, and the
component's contribution should be argued from attribution and typology
discovery rather than from detection performance.

Source: `reports/v4/single_feature_baselines.json`, and the `FS-ORIGIN-NOF3`
entries in `reports/v4/all_configs_v4.json`.
