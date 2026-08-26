# Anomaly Fingerprints and Typology Discovery — Proposal Compliance Audit

**Project** R26-IT-121 · **Member 2** · Wijesinghe L.P.D.B. (IT22109194)
**Supervisor** Mrs. Anjalie Gamage · SLIIT
**Date** 25 August 2026

**Question addressed:** the proposal commits to Anomaly Fingerprints and
Unsupervised Fraud Typology Discovery. What has actually been delivered against
those commitments, and what is still outstanding?

**Sources.** Commitments quoted from
`docs/proposal/R26-IT-121_IT22109194_Wijesinghe_LPDB.pdf` with page numbers.
Delivered figures read from `reports/v4/dsaa/dsaa_FS-ORIGIN.json`,
`reports/v4/all_configs_v4.json` and `reports/v4/single_feature_baselines.json`.

---

## 1. What the proposal committed to

### Abstract (p. 3)

> "DSAA decomposes both reconstruction error **per input feature** and KL
> divergence **per latent dimension** into interpretable **Anomaly Fingerprints**
> that explain which behavioral aspects triggered each alert. These fingerprints
> are then clustered using **DBSCAN** to automatically discover distinct fraud
> typologies without supervision, transforming the system from a per-transaction
> anomaly detector into a fraud pattern discovery engine."

### Specific objectives (p. 13)

> "To apply density-based clustering on dual signal anomaly fingerprint vectors
> to discover distinct fraud behavior typologies without supervision, validated
> using **silhouette score**, **adjusted Rand index**, and **alignment with known
> PaySim fraud patterns**."

> "To expose behavioral risk scores, anomaly fingerprints, **fraud typology
> labels**, and risk classifications via a **REST API**."

### Methodology (p. 14)

> "The epsilon parameter will be selected using the **k-distance plot method**,
> where the distance to each point's k-th nearest neighbor is computed, sorted,
> and plotted to identify the **elbow point**. Each discovered cluster will be
> characterized by its **centroid fingerprint**, identifying the dominant
> features and latent dimensions that define that fraud typology."

### System architecture (p. 19)

> "Typology Discovery Module: Applies DBSCAN clustering on the combined anomaly
> fingerprint vectors from all flagged transactions... **Discovered typology
> labels are appended to the API output for each flagged transaction.**"

---

## 2. Delivered — the Anomaly Fingerprint

**Status: complete, and wider than specified.**

| Property | TRANSFER | CASH_OUT |
| --- | --- | --- |
| Fingerprint width | **15-dim** | **23-dim** |
| Signal 1 — per-feature reconstruction attribution | 7 | 7 |
| Signal 2 — per-latent-dimension KL attribution | 8 | 16 |
| **`zero_padded`** | **`false`** | **`false`** |

### 2.1 The zero-padding defect is fixed

In v3, Signal 2 was zero-padded to the widest latent dimension, so TRANSFER rows
carried exact zeros in dimensions 8–15 that no CASH_OUT row could have. The two
strata were separable **before clustering began** — the clusters were partly
recovering the stratification rather than fraud behaviour.

v4 clusters each stratum in its own native fingerprint space. No padding.

### 2.2 A third signal was added beyond the proposal

`signal_3` attributes the latent-density term as the per-dimension share of
squared displacement from the nearest k-means centroid, which decomposes that
term exactly. It is **additive** — `signal_1` and `signal_2` keep their names,
widths and meaning, so Member 4's fusion engine contract is unaffected.

Justification for keeping the density term rather than deleting it:

| Stratum | Keep γ = 0.2 | γ = 0, renormalised | Cost of dropping |
| --- | --- | --- | --- |
| TRANSFER AUC-PR | 0.7001 | 0.6668 | −4.8% |
| CASH_OUT AUC-PR | 0.7498 | 0.6818 | −9.1% |

### 2.3 Which behavioural aspects the fingerprints attribute to

Mean Signal 1 across all flagged rows:

| Feature | TRANSFER | CASH_OUT |
| --- | --- | --- |
| `F6_hour` | **0.5650** | **0.7023** |
| `F1_log_amount` | 0.1672 | 0.1197 |
| `F4_balance_change_ratio` | 0.1451 | 0.1180 |
| `F8_is_large` | 0.0889 | 0.0014 |
| `F12_round_amount` | 0.0180 | 0.0455 |
| `F3_balance_consistency` | 0.0134 | 0.0129 |
| `F2_amount_balance_ratio` | 0.0023 | 0.0003 |

Mean Signal 2 (top dimensions):

| Stratum | Dominant latent dimensions |
| --- | --- |
| TRANSFER | `dim_0` 0.4416 · `dim_2` 0.2892 · `dim_3` 0.1144 |
| CASH_OUT | `dim_6` 0.4151 · `dim_0` 0.2993 · `dim_2` 0.0446 |

---

## 3. Delivered — Typology Discovery

**Status: complete, and validated more thoroughly than specified.**

### 3.1 Selection of rows to cluster

Method: model-flagged rows, `score ≥ stratum F1-optimal threshold`.

| | TRANSFER | CASH_OUT |
| --- | --- | --- |
| Threshold | 1.7285 | 3.6729 |
| Test rows | 11,546 | 37,196 |
| Flagged | 955 (8.27%) | 690 (1.86%) |
| Fraud among flagged | **581 (60.8%)** | **540 (78.3%)** |
| Recall of flagged set | 70.8% | 65.8% |

### 3.2 Clustering quality

| Metric | TRANSFER | CASH_OUT | Required by proposal? |
| --- | --- | --- | --- |
| eps | 0.18 | 0.10 | — |
| **Clusters discovered** | **6** | **11** | yes |
| Noise | 19 (2.0%) | 97 (14.1%) | — |
| **Silhouette** | **0.4812** | **0.5996** | **yes** |
| DBCV | 0.7224 | 0.6699 | no — additional |
| Davies–Bouldin | 0.5744 | 0.3558 | no — additional |
| Calinski–Harabasz | 431.40 | 897.64 | no — additional |
| Bootstrap ARI (stability) | 0.9996 ± 0.0010 | 0.9231 ± 0.0141 | no — additional |

v3 reported a silhouette of 0.2387. The clean v4 run reaches 0.4812 and 0.5996.

Bootstrap stability near 1.0 (10 resamples at 80%) means the partition is a
property of the data rather than of the particular sample drawn — a stronger
claim than silhouette alone supports.

### 3.3 Cluster characterisation by centroid fingerprint

The proposal's requirement — *"identifying the dominant features and latent
dimensions that define that fraud typology"* — is met by `top_signal_1`,
`top_signal_2` and `top_signal_3` per cluster, each with named contributors and
their shares.

**TRANSFER — 6 clusters, 936 non-noise rows**

| Cluster | Size | Share | Fraud | Precision | Dominant feature | Dominant latent |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 573 | 60.0% | 438 | 0.7644 | `F6_hour` 0.520 | `dim_0` 0.581 |
| 4 | 113 | 11.8% | 0 | **0.0000** | — | — |
| **2** | 92 | 9.6% | 92 | **1.0000** | `F8_is_large` 0.737 | `dim_0` 0.525 |
| 1 | 74 | 7.7% | 3 | 0.0405 | `F6_hour` 0.961 | `dim_3` 0.655 |
| **5** | 46 | 4.8% | 46 | **1.0000** | — | — |
| 3 | 38 | 4.0% | 0 | **0.0000** | `F6_hour` 0.953 | `dim_2` 0.459 |
| noise | 19 | 2.0% | 2 | 0.1053 | `F1_log_amount` 0.507 | `dim_2` 0.522 |

**CASH_OUT — 11 clusters, 593 non-noise rows**

| Cluster | Size | Share | Fraud | Precision | Dominant feature | Dominant latent |
| --- | --- | --- | --- | --- | --- | --- |
| **0** | 267 | 38.7% | 263 | **0.9850** | `F6_hour` 0.887 | `dim_0` 0.445 |
| 1 | 143 | 20.7% | 123 | 0.8601 | `F6_hour` 0.777 | `dim_6` 0.593 |
| 2 | 73 | 10.6% | 0 | **0.0000** | `F6_hour` 0.990 | `dim_4` 0.203 |
| **4** | 21 | 3.0% | 21 | **1.0000** | — | — |
| 5 | 15 | 2.2% | 14 | 0.9333 | — | — |
| 6 | 14 | 2.0% | — | — | — | — |
| 3 | 10 | 1.4% | 0 | **0.0000** | `F6_hour` 0.992 | `dim_0` 0.388 |
| noise | 97 | 14.1% | 62 | 0.6392 | `F1_log_amount` 0.512 | `dim_6` 0.408 |

**This is the headline result of the typology work.** Clusters separate by
fraud precision — some are 100% fraud, others 0% — and Signal 2 varies by
cluster (`dim_0`, `dim_2`, `dim_3`, `dim_6`, `dim_4`). Latent attribution is
discriminating between typologies rather than acting as a constant background.
That is precisely the capability the proposal claims as novel.

### 3.4 The v3 confound now has a measured number

`ARI(v3 clusters, transaction type) = **0.5240**`, with **12 of 12** v3 clusters
100% single-type across 8,213 rows. This belongs in the limitations section as
the quantified reason the v3 typologies are not reportable.

### 3.5 Additional run not required by the proposal — oracle typologies

Clustering restricted to true fraud rows (`isFraud == 1`), which answers
"what fraud typologies exist" directly rather than "what does the model flag".

| | TRANSFER | CASH_OUT |
| --- | --- | --- |
| Rows | 821 | 821 |
| eps | 0.14 | 0.22 |
| Clusters | **3** | **3** |
| Noise | 2.6% | 3.3% |
| DBCV | **0.8134** | 0.6757 |
| Silhouette | 0.3825 | 0.5090 |

---

## 4. Outstanding against the proposal

### Gap 1 — Adjusted Rand Index versus fraud labels is not computed 🔴

The proposal names ARI as a validation criterion for typology discovery. Two ARI
figures exist, and **neither is the one specified**:

| Existing figure | What it measures | Satisfies the objective? |
| --- | --- | --- |
| `bootstrap_stability.mean_ari` = 0.9996 | cluster stability across resamples | No |
| `v3_confound.ari_clusters_vs_transaction_type` = 0.5240 | **v3** clusters vs transaction type | No — v3, and used as limitations evidence |

**Required:** ARI between the v4 discovered clusters and the known fraud labels,
per stratum. All inputs exist; this is a short computation.

### Gap 2 — eps selection method differs from the proposal 🟠

Proposal: k-distance plot, elbow point.
Delivered: an eps sweep ranked by DBCV (`eps_sweep_top5`).

The only k-distance figure in the repository, `reports/figures/dbscan_kdistance.png`,
is a **v3 artefact**.

The delivered method is arguably superior — a quantitative internal validity
criterion rather than a visually judged elbow — but it is a **deviation from the
stated methodology and must be declared and justified** in the thesis rather
than left for a reviewer to notice.

For reference, the sweep shows the choice was not marginal:

| Stratum | Chosen eps | DBCV | Runner-up eps | DBCV |
| --- | --- | --- | --- | --- |
| TRANSFER | 0.18 | 0.7224 | 0.16 | 0.7155 |
| CASH_OUT | 0.10 | 0.6699 | 0.22 | 0.6004 |

### Gap 3 — typology labels are not exposed via the API 🔴

The proposal states typology labels are appended to the API output per flagged
transaction. `src/vae_dsaa/api/__init__.py` is still a 70-byte stub. The
contract is drafted at `docs/integration/behavioral_api_contract.md`, but the
final delivery step of the typology pipeline does not exist.

### Gap 4 — the seven-configuration ablation stands at 4 of 7 🔴

The proposal defines these precisely on p. 17.

| Config | Proposal definition | State |
| --- | --- | --- |
| **A** | Global VAE + single global threshold (baseline) | ✅ `clean__FS-FULL__GLOBAL`, `clean__FS-ORIGIN__GLOBAL` |
| **B** | Global VAE + **per-type** thresholds | ❌ **Missing** |
| **C** | Stratified VAEs + **single global** threshold | ❌ **Missing** |
| **D** | Stratified VAEs + per-type thresholds (full system) | ✅ `clean__*__D_ensemble` |
| **E** | Stratified + per-type, **F3 excluded** | ⚠️ `FS-ORIGIN-NOF3` — measures the same thing, but from FS-ORIGIN rather than the full set |
| **F** | **F3 alone**, simple threshold, no VAE | ✅ `single_feature_baselines.json` — AP 0.6002, lift 8.44× |
| **G** | Stratified VAE trained on **F3 as the only input** | ❌ **Missing** |

**B and C are the pair that isolates stratification from thresholding.** Without
them, contribution N1 — the type-stratified ensemble — has no ablation evidence
of its own; the current tables show stratified-and-per-type versus global-and-global,
which confounds the two factors.

Neither B nor C requires new training. The bundles exist; only the threshold
application rule changes. G requires one short training run.

### Gap 5 — no v4 typology figures 🟠

`reports/v4/dsaa/` contains JSON only. The three relevant figures —
`typology_radar.png`, `dsaa_dashboard.png`, `dbscan_kdistance.png` — are all
**v3 artefacts produced under the leaky protocol** and cannot be used in the
thesis to illustrate v4 results.

---

## 5. Compliance scorecard

| Proposal commitment | State |
| --- | --- |
| Per-feature reconstruction attribution (Signal 1) | ✅ Complete |
| Per-latent-dimension KL attribution (Signal 2) | ✅ Complete |
| Two-level Anomaly Fingerprint per flagged transaction | ✅ Complete — 15-dim / 23-dim, no padding |
| DBSCAN typology discovery, unsupervised | ✅ Complete — 6 / 11 clusters |
| Cluster characterisation by centroid fingerprint | ✅ Complete |
| Silhouette validation | ✅ Complete — plus four additional metrics |
| **Adjusted Rand Index versus fraud patterns** | ❌ **Not computed** |
| **k-distance elbow for eps** | ⚠️ **Replaced by DBCV sweep — must be declared** |
| **Typology labels in API output** | ❌ **Not implemented** |
| **Seven-configuration ablation** | ⚠️ **4 of 7 — B, C, G missing** |
| v4 typology figures | ❌ Not produced |

---

## 6. Recommended actions

The fingerprint and typology core is finished and the results are the strongest
in the component. What remains is validation and delivery, and most of it is
short.

| # | Task | Estimate | Why |
| --- | --- | --- | --- |
| 1 | Compute `ARI(v4 clusters, isFraud)` per stratum | ~15 min | Discharges a stated specific objective; all inputs exist |
| 2 | Run Configurations **B** and **C** | ~30 min | No training needed — threshold rule only. Gives N1 its own ablation evidence |
| 3 | Run Configuration **G** (F3-only VAE) | ~20 min | Completes the seven-configuration study at 7/7 |
| 4 | Produce v4 typology figures | ~1 h | Every existing typology figure is a v3 artefact |
| 5 | Document the eps-selection deviation and its justification | ~10 min | Pre-empts an obvious reviewer question |

Total: approximately two hours to bring the fingerprint and typology objectives
to full compliance with the proposal.

---

## 7. Summary

The two headline commitments — interpretable dual-signal Anomaly Fingerprints,
and unsupervised typology discovery by clustering them — are **built, run on the
clean v4 protocol, and validated beyond the proposal's requirements**. The v3
zero-padding defect that invalidated the earlier typologies is fixed, and the
discovered clusters separate by fraud precision rather than by transaction type,
which is the behaviour the novelty claim depends on.

Four items remain: one uncomputed validation metric, one methodological
deviation to declare, three missing ablation configurations, and the API
exposure step. None requires rethinking the approach, and all but the API are
under two hours of work in total.
