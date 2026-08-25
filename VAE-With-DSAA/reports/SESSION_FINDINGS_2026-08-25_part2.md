# Session Findings, Part 2 — Robustness Check and Pending Audits

**Project:** DeepSentinel (R26-IT-121) · Member 2 — Wijesinghe L.P.D.B. (IT22109194)
**Date:** 25 August 2026 (second session)
**Scope:** the FS-ORIGIN reframe, the FS-CLEAN three-variant robustness check, and audits (a)–(d).

> **Document map.** This file holds the reasoning and verdicts from this session.
> It is one of several and they do not overlap:
>
> | File | Contains |
> | --- | --- |
> | `reports/SESSION_FINDINGS_2026-08-25.md` | Part 1 — the F3 dependence finding, the DSAA port, the gamma decision |
> | **this file** | Part 2 — the artifact-reduced reframe, the FS-CLEAN robustness check, audits (a)–(d) |
> | `docs/keras_to_pytorch_migration.md` | Audit (d) in full — the framework deviation write-up, for the thesis deviations section |
> | `reports/RESULTS_v4.md` | Auto-generated metric tables only. Overwritten by `scripts/make_report.py`. Never hand-edit |

---

## 1. The decision, as instructed

`PRIMARY_FEATURE_SET` stays **`FS-ORIGIN`**, on two grounds: the DSAA results are
computed on it and they are strong, and it gives the best CASH_OUT and the fewest
PAYMENT false positives (28, 0.068%).

**Reframed as artifact-REDUCED, never artifact-free.** `F3_balance_consistency`
is itself a simulator artifact — it holds for 99.03% of TRANSFER fraud and 100%
of CASH_OUT fraud, against 4.94% and 13.24% of normals, because the simulated
fraudster drains the account to the cent so the ledger reconciles exactly. Real
fraud is not that tidy.

Recorded in code as a full docstring on the constant, plus
`PRIMARY_FEATURE_SET_QUALIFIER = "artifact-reduced"` for generated documents.
Stale "artifact-free" wording removed from `README.md` and
`BALANCE_ABLATION_FINDING.md`.

## 2. The reframe

**Detection is a negative result and is reported as one.** No feature tier
demonstrates that the VAE adds detection capability over a single raw column:
`F4_balance_change_ratio` used directly as a score reaches 9.84× on TRANSFER and
32.74× on CASH_OUT, against FS-ORIGIN's 9.85× and 33.97× — margins of 0.1% and
3.8%.

**The contribution is attribution and triage.** A raw score produces a ranking.
It cannot say *why* a row was flagged, and it cannot partition the flagged set
into pure and impure groups. The DSAA fingerprint does both, stably. That is
what the proposal claimed as primary novelty (N2), so this is consistent with
the proposal rather than a retreat from it.

---

## 3. FS-CLEAN robustness check — verdict **(b) confirmed on TRANSFER, not established on CASH_OUT**

Three row-selection variants were run so cluster-validity indices, which are all
sensitive to *n*, could not confound "balance features removed" with "DBSCAN had
fewer points". eps was re-swept independently for every variant.

### 3.1 Purity separation — with both denominators stated

"Rows resolved" counts rows landing in a cluster that is either ≥95% or ≤5%
fraud. It was previously reported against **non-noise rows only**, which was not
stated and which flatters any run with heavy noise. Both denominators:

| | FS-ORIGIN TRANSFER | FS-CLEAN TRANSFER | FS-ORIGIN CASH_OUT | FS-CLEAN CASH_OUT |
| --- | --- | --- | --- | --- |
| clusters (size ≥ 5) | 6 | 3 | 11 | 7 |
| purity range | 0% … 100% | 29.5% … 62.5% | 0% … 100% | 0% … 100% |
| noise fraction | 2.0% | 1.8% | 14.1% | **32.5%** |
| resolved / **non-noise** rows | 38.8% | 0.0% | 69.6% | 11.8% |
| resolved / **all selected** rows | **38.0%** | **0.0%** | **59.9%** | **8.0%** |

The denominator matters most for **FS-CLEAN CASH_OUT**, where **32.5% of the
selected set landed in no cluster at all**. Reporting against non-noise rows
hides that a third of the rows were never triaged.

Per-cluster (precision, size), size-matched:

```
FS-ORIGIN TRANSFER  (0.000, 38) (0.000,113) (0.041, 74) (0.764,573) (1.000, 46) (1.000, 92)
FS-CLEAN  TRANSFER  (0.295,400) (0.316,522) (0.625, 16)
FS-ORIGIN CASH_OUT  (0.000, 10) (0.000, 73) (0.583, 12) (0.800, 10) (0.860,143)
                    (0.933, 15) (0.985,267) (1.000, 10) (1.000, 14) (1.000, 18) (1.000, 21)
FS-CLEAN  CASH_OUT  (0.000, 10) (0.000, 12) (0.043, 23) (0.067, 15) (0.206,282)
                    (0.851,114) (1.000, 10)
```

### 3.2 ARI and AMI against fraud labels — the base-rate-independent test

Purity separation is threshold-based and therefore base-rate sensitive: reaching
95% purity from a 39% base rate is far harder than from 78%, so that measure was
always going to favour FS-ORIGIN on CASH_OUT. ARI and AMI do not have that
problem. Size-matched, noise excluded:

| | FS-ORIGIN | FS-CLEAN | agrees with (b)? |
| --- | --- | --- | --- |
| TRANSFER ARI | **0.2274** | 0.0055 | yes, decisively |
| TRANSFER AMI | **0.3272** | 0.0040 | yes, decisively |
| CASH_OUT ARI | 0.2306 | **0.2479** | **no — favours FS-CLEAN** |
| CASH_OUT AMI | **0.3028** | 0.2420 | yes |

**TRANSFER confirms verdict (b) decisively.** FS-CLEAN's ARI of 0.0055 and AMI of
0.0040 are indistinguishable from random assignment. Its clusters carry no
information about which flagged rows are fraud.

**CASH_OUT does not establish it.** ARI favours FS-CLEAN (0.2479 vs 0.2306) while
AMI favours FS-ORIGIN (0.3028 vs 0.2420). The two indices disagree, and that
disagreement is not resolved here in favour of whichever suits the argument. ARI
is known to behave poorly when there are many small clusters, and FS-ORIGIN
CASH_OUT has eleven against FS-CLEAN's seven, which is a plausible reason for the
split — but that is an explanation, not evidence. **On CASH_OUT the honest claim
is that the evidence is inconclusive.**

Treating noise as its own cluster reverses the CASH_OUT ARI ordering
(FS-ORIGIN 0.1799 vs FS-CLEAN 0.1151), consistent with FS-CLEAN's 32.5% noise
being why its noise-excluded figure looks competitive. That sensitivity is worth
reporting rather than resolving.

### 3.3 The absolute levels are modest, and that must be said

FS-ORIGIN's ARI of 0.23 and AMI of 0.30–0.33 are **modest agreement, not strong**.
Both of the following are true and both belong in the write-up:

- The pure clusters are real. TRANSFER clusters at 100% purity (46 and 92 rows)
  and CASH_OUT clusters at 98.5–100% are genuine, stable groupings.
- They are a minority of rows. The 573-row TRANSFER cluster sits at 76.4% purity
  against a 60.8% base rate — barely above chance for that population, and large
  enough to dominate and dilute the index.

The supportable claim is that the fingerprint **isolates high-purity and
zero-purity subsets of the flagged set**, not that it partitions fraud from
non-fraud.

### 3.4 Noise handling changes the sign

FS-CLEAN CASH_OUT *native* swings from **ARI −0.0596 with noise excluded** (worse
than random) to **+0.0151 with noise as a cluster**. A single choice about how to
treat unassigned rows moves the index across zero. Any reported ARI must state
its noise convention.

### 3.5 Verdict (c) does not apply

The degradation is present at matched *n*, and FS-CLEAN's native run
(n = 288 / 140) scores *higher* on DBCV than its size-matched run. This is a
feature effect, not a sample-size artefact of weaker detection.

### 3.6 The trap — cluster-quality indices point the wrong way

FS-CLEAN's cluster-quality indices are **higher**, not lower:

| | FS-ORIGIN | FS-CLEAN |
| --- | --- | --- |
| TRANSFER DBCV / silhouette | 0.7224 / 0.4812 | **0.7697 / 0.4257** |
| CASH_OUT DBCV / silhouette | 0.6699 / 0.5996 | **0.9517 / 0.9100** |

`F6_hour` carries **0.72** (TRANSFER) and **0.68** (CASH_OUT) of FS-CLEAN's mean
Signal 1 over flagged rows. The clusters are tight, stable hour-bands —
geometrically excellent and fraud-uninformative.

> **Methodological finding in its own right: DBCV and silhouette cannot validate
> the triage claim.** They measure geometric separation, which *improved* while
> agreement with fraud labels collapsed to zero on TRANSFER. Any validity index
> must be reported alongside a label-referenced measure.

### 3.7 A limitation of the TRANSFER typologies

The oracle variant — the 821 true-fraud rows — is the run that answers "what
fraud typologies exist". For **FS-ORIGIN TRANSFER it is unstable**: bootstrap ARI
**0.5410**, with Signal 2 collapsed onto a single latent dimension. Its three
clusters do not survive resampling.

For contrast, FS-ORIGIN CASH_OUT oracle is stable at 0.9739 and FS-CLEAN TRANSFER
oracle at 0.9940.

**The TRANSFER typologies should therefore be reported as provisional.** The
triage result on TRANSFER — which uses the *flagged* set, bootstrap ARI 0.9996 —
is unaffected and remains solid. These are different runs answering different
questions and must not be conflated.

### 3.8 Full three-variant panel

| Feature set | Stratum | Variant | n | precision | k | noise | DBCV | silhouette | bootstrap ARI | Signal 2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FS-ORIGIN | TRANSFER | native | 955 | 60.8% | 6 | 2.0% | 0.7224 | 0.4812 | 0.9996 | varies, 3 dims |
| FS-ORIGIN | TRANSFER | size-matched | 955 | 60.8% | 6 | 2.0% | 0.7224 | 0.4812 | 0.9996 | varies, 3 dims |
| FS-ORIGIN | TRANSFER | oracle | 821 | 100% | 3 | 2.6% | 0.8134 | 0.3825 | **0.5410** | **collapsed** |
| FS-ORIGIN | CASH_OUT | native | 690 | 78.3% | 11 | 14.1% | 0.6699 | 0.5996 | 0.9231 | varies, 3 dims |
| FS-ORIGIN | CASH_OUT | size-matched | 690 | 78.3% | 11 | 14.1% | 0.6699 | 0.5996 | 0.9231 | varies, 3 dims |
| FS-ORIGIN | CASH_OUT | oracle | 821 | 100% | 3 | 3.3% | 0.6757 | 0.5090 | 0.9739 | varies, 2 dims |
| FS-CLEAN | TRANSFER | native | 288 | 66.0% | 7 | 36.1% | 0.8539 | 0.8577 | 0.8926 | varies, 2 dims |
| FS-CLEAN | TRANSFER | size-matched | 955 | 32.0% | 3 | 1.8% | 0.7697 | 0.4257 | 0.9414 | varies, 2 dims |
| FS-CLEAN | TRANSFER | oracle | 821 | 100% | 2 | 1.2% | 0.7289 | 0.3263 | 0.9940 | varies, 2 dims |
| FS-CLEAN | CASH_OUT | native | 140 | 85.7% | 2 | 15.7% | 0.9703 | 0.9589 | 0.9712 | **collapsed** |
| FS-CLEAN | CASH_OUT | size-matched | 690 | 39.0% | 7 | 32.5% | 0.9517 | 0.9100 | 0.9409 | varies, 2 dims |
| FS-CLEAN | CASH_OUT | oracle | 821 | 100% | 3 | 1.2% | 0.9157 | 0.4915 | 0.7477 | **collapsed** |

FS-ORIGIN native and size-matched are identical by construction — the reference
*n* is its own flagged count. Oracle variants cannot test precision separation,
since every row in them is fraud; ARI and AMI against fraud labels are undefined
there and are not reported.

Source: `reports/v4/dsaa/cluster_vs_fraud_ari.json` and the
`cluster_vs_fraud_agreement` blocks in `dsaa_variants_*.json`.

---

## 4. Pending audits

### (a) F6_hour pathology check — **clean**

| Stratum | fit range | test range | contained | % outside |
| --- | --- | --- | --- | --- |
| TRANSFER | [0.0000, 0.9583] | [0.0000, 0.9583] | yes | **0.000%** |
| CASH_OUT | [0.0000, 0.9583] | [0.0000, 0.9583] | yes | **0.000%** |
| PAYMENT | [0.0000, 0.9583] | [0.0000, 0.9583] | yes | **0.000%** |

Cyclic encoding behaves as expected. Nothing else shares F7_day's pathology.

### (b) Full FS-ORIGIN support audit

All seven features are contained or near-contained. Worst excursions:

| Stratum | Feature | % of test rows outside fit range |
| --- | --- | --- |
| TRANSFER | `F4_balance_change_ratio` | 0.831% |
| CASH_OUT | `F4_balance_change_ratio` | 0.729% |
| CASH_OUT | `F1_log_amount` | 0.374% |
| CASH_OUT | `F2_amount_balance_ratio` | 0.022% |

All under 1%. For contrast, `F7_day` is **100.000% outside on all three strata**
(fit max ≈ 0.519, test min 0.828).

### (c) F7_day reconstruction error budget — the mechanism, quantified

Mean per-feature share of reconstruction error on test rows, measured on FS12
(which still contains F7_day):

| Stratum | `F7_day` share | next feature |
| --- | --- | --- |
| TRANSFER | **0.9403** | F6_hour 0.0275 |
| CASH_OUT | **0.9717** | F6_hour 0.0177 |
| PAYMENT | **0.9586** | F6_hour 0.0206 |

The model spends **94–97% of its reconstruction error** on a feature that is 100%
out of range, swamping every real signal. This is the mechanism behind the
FS12 → FS-FULL CASH_OUT jump (F1 0.0583 → 0.6569) and the 66.83% PAYMENT
false-positive rate.

With F7_day removed (FS-ORIGIN), the budget redistributes:

| Stratum | F6_hour | F1_log_amount | F4 | F2 |
| --- | --- | --- | --- | --- |
| TRANSFER | 0.5683 | 0.3788 | 0.0366 | — |
| CASH_OUT | 0.6147 | 0.2929 | 0.0493 | 0.0413 |
| PAYMENT | 0.4870 | 0.3317 | 0.1365 | 0.0445 |

### (d) Keras → PyTorch migration

Written in full to **`docs/keras_to_pytorch_migration.md`**. Covers what was
matched exactly (architecture, loss terms, Free Bits clamp, β schedule,
optimiser and hyperparameters, Glorot-uniform initialisation, early-stopping
rule), what could not be matched and why (floating-point kernels, RNG stream,
Lambda layer, device), the leaky-control evidence, the determinism defect, and a
paste-ready summary paragraph.

Headline control result:

| Stratum | Keras v3 (leaky) | PyTorch v4 (leaky control) | PyTorch v4 (clean) |
| --- | --- | --- | --- |
| TRANSFER F1 | 0.9836 | 0.9548 | 0.9994 |
| TRANSFER AUC-ROC | 0.9997 | 0.9993 | 1.0000 |
| CASH_OUT F1 | 0.0961 | 0.4574 | 0.6569 |
| CASH_OUT AUC-ROC | 0.9646 | 0.9713 | 0.9868 |

PyTorch reproduces the Keras TRANSFER result to within 0.03 F1 and 0.0004
AUC-ROC under the same leaky protocol. The framework change does not explain the
differences; the **9.14× / 11.27×** reduction in AP lift is a property of the
evaluation protocol. *(Re-measured 25 Aug 2026 after the leaky control was
re-scored deterministically; the earlier 8.7× / 8.3× mixed a stochastic leaky
arm with a deterministic clean arm. Both runs trained to identical epochs and
identical validation loss, so the change is scoring determinism alone.)*

---

## 5. Confirmations

- **Gamma: Option A accepted.** Tri-Signal, `signal_3` additive. The density term
  earns its 4.8% / 9.1% of AP; `signal_1` and `signal_2` keep their names,
  widths and meaning, so Member 4's integration is unaffected.
- **`RESULTS_v4.md` is auto-generated** by `scripts/make_report.py` and must not
  be hand-edited. Narrative stays in these SESSION_FINDINGS documents.
- 9 tests pass. Staging copy: 147 files, 19.78 MB, zero blocked-extension leaks,
  nothing over 50 MB.
- **No commits, no pushes.**

---

## 6. Contribution N1 tested directly — per stratum, not pooled

The A–D grid answers a pooled question: which configuration ranks the combined
TRANSFER + CASH_OUT population better. **N1 claims something narrower** — that a
model trained on one transaction type beats a single global model *on that
type*. That is a per-stratum question and the pooled grid cannot answer it.

The existing `clean__FS-ORIGIN__GLOBAL` and `clean__FS-FULL__GLOBAL` bundles were
therefore scored on each stratum's test rows in isolation, against the matching
per-stratum bundle. No retraining; thresholds re-selected on each stratum's own
validation partition for both models, so the comparison is fair at the operating
point as well as in ranking.

### 6.1 FS-ORIGIN (primary) — stratification does **not** help on either stratum

| Stratum | Model | AUC-PR | AP lift | ceiling | AUC-ROC | P@1000 | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TRANSFER | global | **0.7877** | **11.08×** | 14.06× | **0.9811** | **0.660** | 0.6215 |
| TRANSFER | stratified | 0.7001 | 9.85× | 14.06× | 0.9759 | 0.597 | **0.6543** |
| | *delta* | **−0.0876** | −1.23 | | −0.0051 | −0.063 | **+0.0328** |
| CASH_OUT | global | **0.7990** | **36.20×** | 45.31× | **0.9929** | 0.620 | 0.5389 |
| CASH_OUT | stratified | 0.7498 | 33.97× | 45.31× | 0.9907 | **0.630** | **0.7148** |
| | *delta* | **−0.0492** | −2.23 | | −0.0023 | +0.010 | **+0.1759** |

### 6.2 FS-FULL — stratification helps on both strata

| Stratum | Model | AUC-PR | AP lift | ceiling | AUC-ROC | P@1000 | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TRANSFER | global | 0.8235 | 11.58× | 14.06× | 0.9895 | 0.760 | 0.8190 |
| TRANSFER | stratified | **1.0000** | **14.06×** | 14.06× | **1.0000** | **0.821** | **0.9994** |
| | *delta* | **+0.1765** | +2.48 | | +0.0105 | +0.061 | **+0.1804** |
| CASH_OUT | global | 0.7088 | 32.11× | 45.31× | **0.9881** | **0.610** | 0.5584 |
| CASH_OUT | stratified | **0.7397** | **33.51×** | 45.31× | 0.9868 | 0.598 | **0.6569** |
| | *delta* | **+0.0309** | +1.40 | | −0.0013 | −0.012 | **+0.0985** |

### 6.3 Plain answer

**N1 is not supported on the primary feature set, and is supported on FS-FULL.**

| Feature set | TRANSFER | CASH_OUT |
| --- | --- | --- |
| FS-ORIGIN *(primary)* | does **not** help | does **not** help |
| FS-FULL | helps | helps |

On FS-ORIGIN the global model ranks better on both strata — higher AUC-PR, higher
AP lift and higher AUC-ROC. Since FS-ORIGIN is the primary feature set, **the
stratification contribution cannot be claimed from ranking performance as the
work currently stands.**

### 6.4 Ranking and operating point disagree

On FS-ORIGIN the global model wins on every threshold-independent measure while
the stratified models win on F1 — by +0.0328 on TRANSFER and **+0.1759** on
CASH_OUT. The two are not in conflict: AUC-PR measures the whole ranking, F1
measures one operating point. A per-stratum model paired with a threshold chosen
on that stratum's own validation rows lands on a better operating point even
though its ranking is worse.

The defensible version of N1 on FS-ORIGIN is therefore about **operating-point
selection**, not about representation: stratification buys a better threshold,
not a better ranking. That is a weaker claim than the proposal makes and should
be stated as such.

### 6.5 The pooled result does **not** disagree with the per-stratum result

| Feature set | Pooled (A → D) | TRANSFER | CASH_OUT | Verdict |
| --- | --- | --- | --- | --- |
| FS-ORIGIN | 0.7900 → 0.7000, does not help | does not help | does not help | **agree** |
| FS-FULL | 0.7619 → 0.9111, helps | helps | helps | **agree** |

Both feature sets agree between the pooled and per-stratum views.

**The score-fusion / calibration explanation is therefore not supported by these
numbers and is not asserted here.** Per-stratum z-normalisation is genuinely not
calibrated across strata — that remains true, and the API contract already warns
that scores are comparable only within a stratum — but it is **not** the
mechanism behind anything observed in this experiment, because pooling did not
reverse or distort any conclusion. Invoking it would be an explanation in search
of a phenomenon.

What the numbers do show is simply that **the direction of the stratification
effect depends on the feature set**, and the direction flips between FS-FULL and
FS-ORIGIN. Why it flips is not established here. One untested possibility is that
the global model trains on roughly 4.1M rows against 442k (TRANSFER) and 1.88M
(CASH_OUT), so with only seven features the extra data may outweigh
type-specificity, whereas the eleven-feature set carries enough type-specific
structure for a global model to dilute. **That is a hypothesis, not a
measurement**, and testing it would need a global model trained on a subsample
matched to the per-stratum row counts.

Source: `reports/v4/global_vs_stratified.json`, produced by
`scripts/global_vs_stratified.py`.

---

## 7. F6_hour dominance — two populations, two numbers

`F6_hour` dominates Signal 1 on FS-ORIGIN as well as on FS-CLEAN, but the exact
figure depends on **which rows are measured**, and the two were previously
reported under one label. They are different populations:

| Population | Source | TRANSFER | CASH_OUT |
| --- | --- | --- | --- |
| **All test rows** | `feature_audits.json` -> `error_budget_FS-ORIGIN` | F6_hour 0.5683, F1_log_amount 0.3788 | F6_hour 0.6147, F1_log_amount 0.2929 |
| **Flagged rows only** | `dsaa_FS-ORIGIN.json` -> `mean_signals` | F6_hour 0.5650, F1_log_amount 0.1672 | F6_hour 0.7023, F1_log_amount 0.1197 |

The first answers "where does the model spend reconstruction error across the
whole test partition". The second answers "what explains the alerts".

**When discussing attribution and triage, use the flagged-row figures only** —
0.5650 and 0.7023 for F6_hour, 0.1672 and 0.1197 for F1_log_amount. The
all-rows budget belongs with the feature audit, where it is used to quantify the
F7_day pathology, and nowhere else.

Either way the substantive point stands: `F6_hour` is the largest single
contributor to the explanation of a flagged transaction on FS-ORIGIN. A panel
may reasonably ask why "unusual hour" dominates a fraud explanation. It is worth
a sentence in the write-up and is a candidate for future work.

---

## Where the numbers live

| Artefact | Path |
| --- | --- |
| Three-variant DSAA, FS-CLEAN | `reports/v4/dsaa/dsaa_variants_FS-CLEAN.json` |
| Three-variant DSAA, FS-ORIGIN | `reports/v4/dsaa/dsaa_variants_FS-ORIGIN.json` |
| Original single-variant DSAA | `reports/v4/dsaa/dsaa_FS-ORIGIN.json` |
| Feature support and error budgets | `reports/v4/feature_audits.json` |
| Single-feature baselines | `reports/v4/single_feature_baselines.json` |
| Authoritative metrics, all configs | `reports/v4/all_configs_v4.json` |
| N1 per-stratum test | `reports/v4/global_vs_stratified.json` |
| Model bundles | `checkpoints/v4/` |
| Runner scripts | `scripts/run_dsaa_variants.py`, `scripts/run_audits.py` |
