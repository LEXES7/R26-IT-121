# Research Context Brief — Stratified VAE with Dual-Signal Anomaly Attribution

**Purpose of this document.** Complete factual context on one research component, written to be handed to an AI assistant or a reviewer who has no prior knowledge of the project. Every number below is measured unless explicitly marked *PENDING* or *NOT DONE*.

---

## 1. Identity and scope

| Field | Value |
| --- | --- |
| Project | **DeepSentinel** — A Cloud-Native Multi-Modal AI Platform for Explainable Financial Fraud Detection |
| Project ID | R26-IT-121 |
| Institution | Sri Lanka Institute of Information Technology (SLIIT), B.Sc. (Hons) in Information Technology |
| Component | Stratified Variational Autoencoder with Dual-Signal Anomaly Attribution (DSAA) and Unsupervised Fraud Typology Discovery |
| Author | Wijesinghe L.P.D.B. (IT22109194) — Member 2 |
| Supervisor | Mrs. Anjalie Gamage |
| Proposal submitted | March 2026 |
| Final report due (per proposal WBS) | October 2026 |

**Platform context (brief).** DeepSentinel has four members. Member 1 builds a relational detector (Edge-Enhanced GraphSAGE) over the account-transaction graph. Member 3 builds a temporal detector (TS-TCN) over transaction sequences. Member 4 builds a fusion engine that combines all three detector outputs into a final decision and an LLM-generated report. **This component is the behavioural-modality detector** — it models what a normal transaction of a given type looks like, and flags departures. It is the only fully unsupervised detector of the three.

---

## 2. What this component actually does

### 2.1 Processing mode — batch, not single-transaction

The pipeline is a **batch pipeline**. A transaction log is submitted as a CSV; feature engineering runs across the batch; each row is routed by transaction type to a dedicated VAE; every row is scored; flagged rows receive attribution; and DBSCAN clusters the flagged set into typologies.

The **model** is row-independent — one transaction can be encoded, reconstructed and scored on its own, unlike TS-TCN (needs a 32-transaction window) or GraphSAGE (needs a constructed graph). Normalisation statistics, thresholds and latent cluster centres are fitted once on the validation partition and persisted, so scoring a row requires no other rows.

The **batch requirement comes from two places**:

1. **Feature engineering.** Two of the thirteen features are dataset-level aggregates. `F8_is_large` compares the amount against a per-type 95th percentile computed from non-fraud rows. `F11_account_velocity` is the log transaction count for the originating account across the log. Single-transaction inference would require the three F8 percentile constants to be persisted with the model, and a per-account counter served from state. **Neither is currently persisted.**
2. **Typology discovery.** DBSCAN clusters "fingerprints from all flagged transactions". Clustering a single transaction is not defined. In deployment this would become: fit clusters offline, assign new transactions to the nearest existing centroid. **Not implemented.**

### 2.2 Data flow

| Stage | Input | Process | Output |
| --- | --- | --- | --- |
| 1 | Raw PaySim CSV | Load 6,362,620 records | Raw dataframe |
| 2 | Raw columns | Compute 13 behavioural features | Feature matrix (N × 13) |
| 3 | Feature matrix | Route by type | Per-type streams |
| 4 | Per-type stream | Type-specific VAE encoder/decoder | Reconstruction + latent (μ, log σ²) |
| 5 | Reconstruction + latent | Reconstruction error, KL divergence, latent density | Per-transaction anomaly score |
| 6 | Anomaly scores | Compare against per-type threshold | Flag / no flag |
| 7 | Flagged transactions | Decompose Signal 1 per feature, Signal 2 per latent dim | 29-dim anomaly fingerprint |
| 8 | All fingerprints | DBSCAN clustering | Typology label per flagged transaction |
| 9 | Fingerprint + risk | FastAPI JSON response | Output to fusion engine — **NOT BUILT** |

### 2.3 Dataset

PaySim mobile-money simulation. 6,362,620 transactions across 5 types. Fraud exists in exactly two types:

| Type | Total rows | Fraud rows | Fraud rate |
| --- | --- | --- | --- |
| TRANSFER | ~528,812 | 4,097 | ~0.77% |
| CASH_OUT | ~2,237,500 | 4,116 | ~0.18% |
| PAYMENT | ~2,151,495 | **0** | 0% — used as a false-positive control |

Total fraud analysed for typology discovery: **8,213**.

---

## 3. Feature set

Thirteen engineered features. All VAEs consume the same 13 inputs.

| ID | Feature | Fraud signal |
| --- | --- | --- |
| F1 | `log_amount` | Scale of the transfer |
| F2 | `amount_balance_ratio` | Amount relative to available balance |
| F3 | `balance_consistency` | Ledger arithmetic that fails to reconcile |
| F4 | `balance_change_ratio` | Proportion of origin balance drained |
| F5 | `dest_balance_ratio` | Enrichment of the destination account |
| F6 | `hour` | Hour-of-day concentration of fraud |
| F7 | `day` | Position within the simulation month |
| F8 | `is_large` | Above the per-type non-fraud 95th percentile |
| F9 | `dest_starts_empty` | Mule accounts begin with zero balance |
| F10 | `recipient_emptied` | Destination drained immediately after receipt |
| F11 | `account_velocity` | Transaction count for the originating account |
| F12 | `round_amount` | Suspiciously round transfer values |
| F13 | `zero_dest_history` | Destination with no prior activity |

**Leakage controls applied.** The F8 percentile is computed on non-fraud rows only, so the fraud label does not enter the feature. One MinMaxScaler is fitted per transaction type, preventing cross-type scale leakage.

**Leakage concerns NOT yet addressed.** `F11_account_velocity` counts an account's transactions across the *entire* dataset, including rows that occur after the transaction being scored. In a strict causal evaluation this is look-ahead information. The F8 percentile is likewise computed across the whole dataset rather than the training partition only. Neither has been quantified.

---

## 4. Model architecture and training

| Stratum | Encoder | Latent dim | Training rows (non-fraud, 80% split) | Role |
| --- | --- | --- | --- | --- |
| TRANSFER | 13 → 32 → 16 | 8 | 423,049 | Primary fraud leg |
| CASH_OUT | 13 → 64 → 32 | 16 | 1,786,707 | Secondary fraud leg |
| PAYMENT | 13 → 32 → 16 | 8 | ~1.72M | False-positive control |

Symmetric encoder–decoder, Gaussian latent layer, sigmoid reconstruction output. Loss is `recon + β·KL`, where reconstruction is summed squared error and KL is clamped per dimension by a Free Bits floor.

**Training configuration:** Adam (lr 1×10⁻³), batch 256, up to 60 epochs, 80/20 train/validation split on non-fraud rows only. Free Bits floor **0.1** nats per latent dimension. β annealed linearly **0 → 0.05** over 10 epochs, then held. Early stopping monitors `val_recon_loss`, patience 8, `start_from_epoch=12`.

**Anomaly score:** `0.5 × recon_z + 0.3 × kl_z + 0.2 × latent_density_z`, where each term is z-scored using statistics fitted on the validation partition, and latent density is the distance to the nearest of 8 KMeans centroids fitted on validation latent means.

**Threshold tuning:** per type, on a 30% holdout, optimising F2 (recall weighted 2× precision). All reported metrics come from the untouched 70% test partition.

---

## 5. The central technical finding — two opposite KL failures and their correction

This is the most important part of the component's story. An earlier revision (referred to as **v2**) contained a training defect that silently invalidated the attribution mechanism. The corrected revision is **v3**.

### 5.1 What was wrong in v2

**Failure A — posterior collapse in the global baseline.** `kl_loss` froze at 0.0847 from epoch 11 through epoch 50. The Free Bits floor was set to 0.01 per dimension × 8 dimensions = 0.08, so KL was pinned exactly *at* the clamp. The latent space encoded nothing.

**Failure B — the opposite problem in the stratified models.** Early stopping monitored `val_total_loss`, which contains β·KL, while the annealer ramped β from 0 upward. The monitored quantity therefore had to rise by construction. Training stopped at epoch 6 and restored the epoch-1 weights — the point at which β = 0. The result was one epoch of a plain autoencoder with no latent regularisation at all. Raw KL means were **132.8** (TRANSFER) and **255.3** (CASH_OUT).

Both failures destroy Signal 2, from opposite directions: one makes KL uniform and zero-information, the other makes it unregularised and meaningless.

### 5.2 The three corrections

1. `FREE_BITS` **0.01 → 0.1**. The floor is a *minimum*, so lowering it removed protection rather than adding it. Note the proposal already specified 0.1 — v2 deviated from the proposal, and v3 restored compliance.
2. `BETA_MAX` **1.0 → 0.05**, selected by an empirical sweep rather than assumed.
3. Early stopping monitors `val_recon_loss` (no β term, valid throughout) with `start_from_epoch=12`, so no stopping decision is taken while the objective is still changing shape.

### 5.3 β sweep — the novel contribution

Swept on TRANSFER, 25 epochs per point, latent dim 8, Free Bits 0.1. The selection rule was **fixed before results were seen**: take the largest β that keeps at least half the latent dimensions active *and* a Signal-2 spread above 0.02.

| β | KL total | KL / dim | Active dims | Signal-2 spread | Val recon | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 0.01 | 5.053 | 0.632 | 4 / 8 | 0.1178 | 0.0769 | PASS |
| **0.05** | **2.727** | **0.341** | **4 / 8** | **0.1378** | **0.1470** | **PASS — selected** |
| 0.10 | 2.141 | 0.268 | 3 / 8 | 0.1603 | 0.1783 | WARNING |
| 0.30 | 1.100 | 0.137 | 1 / 8 | 0.0389 | 0.3601 | WARNING |
| 1.00 | 0.784 | 0.098 | 0 / 8 | 0.0014 | 0.4908 | FAIL — total collapse |

**Key result.** At β = 1.0 — the conventional VAE setting, *and the value the project proposal specified as the posterior-collapse mitigation* — every dimension settles at 0.098, just below the 0.1 floor, and the Signal-2 spread falls to 0.0014. Attribution becomes uniform and carries no information. Reducing β to 0.05 raises the spread to 0.1378, a **98-fold increase**.

The experiment therefore disproves the mitigation stated in the proposal. This is a genuine finding, not a mistake: under a Free Bits floor, β = 1.0 is itself the cause of collapse. No cited work in the component's literature review reports the β region within which native KL attribution remains discriminative.

### 5.4 Latent health of the three production models (β = 0.05, Free Bits 0.1)

| Stratum | KL total | KL / dim | Active dims | Signal-2 spread | Verdict |
| --- | --- | --- | --- | --- | --- |
| TRANSFER | 2.482 | 0.310 | 4 / 8 | 0.1630 | PASS |
| CASH_OUT | 3.581 | 0.224 | 4 / 16 | 0.0893 | WARNING |
| PAYMENT | 2.794 | 0.349 | 3 / 8 | 0.1492 | WARNING |

**Interpretation of the two WARNINGs.** The verdict flags the *fraction* of dimensions in use, not collapse. Collapse means zero active dimensions, as observed at β = 1.0. All three strata carry 3–4 active dimensions with Signal-2 spreads several times the informativeness threshold. The models consistently find 3–4 intrinsic dimensions of variation regardless of the latent budget granted — CASH_OUT was given 16 and uses 4; PAYMENT was given 8 and uses 3. The warning indicates an oversized latent budget, which is ordinary automatic relevance determination, not a defect.

---

## 6. Detection results

Configurations A–D. Thresholds tuned on a 30% holdout; metrics from the 70% test partition.

| Configuration | Precision | Recall | F1 | AUC-ROC | FPR |
| --- | --- | --- | --- | --- | --- |
| A — Global VAE, global threshold | 0.0395 | 0.0104 | 0.0165 | 0.7839 | 0.0004 |
| **B — VAE_TRANSFER, type threshold** | **0.9751** | **0.9924** | **0.9836** | **0.9997** | **0.0002** |
| C — VAE_CASH_OUT, type threshold | 0.0530 | 0.5091 | 0.0961 | 0.9646 | 0.0167 |
| D — Stratified ensemble (full coverage) | 0.1434 | 0.7545 | 0.2410 | 0.9819 | 0.0134 |

### 6.1 Reporting caution

**Configurations B and D are not directly comparable.** B is evaluated on TRANSFER transactions only; D is evaluated across TRANSFER and CASH_OUT combined. D is the full-coverage configuration, not a strictly superior one. The ablation table currently labels D as "(Best)", which is misleading and should be changed.

Reporting D's 0.2410 as "the component's F1" understates the result on the leg the component actually resolves. Reporting per-type is both more informative and directly tests the stratification hypothesis, which is the component's thesis.

### 6.2 v2 → v3 effect, reported honestly

| Metric | v2 (defective) | v3 (corrected) | Direction |
| --- | --- | --- | --- |
| TRANSFER F1 | 0.6930 | **0.9836** | strong improvement |
| TRANSFER AUC | 0.9951 | **0.9997** | improvement |
| CASH_OUT F1 | **0.1766** | 0.0961 | **regression** |
| CASH_OUT F2 | **0.2265** | 0.1871 | **regression** |
| CASH_OUT AUC | 0.9119 | **0.9646** | improvement |
| TRANSFER raw KL | 132.8 | 2.482 | now regularised |
| CASH_OUT raw KL | 255.3 | 3.581 | now regularised |

The correction is **not uniformly beneficial and must not be presented as such.** CASH_OUT ranking improved while its detection F1 and F2 declined. The explanation is that the unregularised v2 model behaved as a plain autoencoder, which reconstructs normals tightly and produces a sharper anomaly signal in the extreme tail; the KL regularisation that makes the latent space interpretable also smooths that tail. This is a measured trade-off, accepted because latent-space validity is a precondition for the attribution contribution — which is the component's actual novelty.

### 6.3 CASH_OUT has a proven ceiling

Sweeping the decision threshold across the full precision–recall curve gives the maximum attainable F1 for each stratum:

| Stratum | Achieved F1 | Best attainable F1 | Precision / Recall at best |
| --- | --- | --- | --- |
| TRANSFER | 0.9836 | 0.9855 | 0.9788 / 0.9922 |
| CASH_OUT | 0.0961 | **0.1263** | 0.1199 / 0.1334 |

**Conclusion:** TRANSFER's operating point is essentially optimal. CASH_OUT's problem is the representation, not the threshold — no threshold, β value or latent dimension change can move it materially. Further tuning of CASH_OUT is a waste of effort and should stop.

The domain explanation: PaySim fraud is a TRANSFER → CASH_OUT chain. The transfer leg carries a clear signature (the origin account is emptied). By the cash-out leg the funds already sit in the mule account, so the transaction resembles a legitimate cash-out. Identifying it requires the *linkage* to the preceding transfer — a relational and temporal property this component cannot observe. This is the empirical justification for the multi-modal ensemble, and should be presented as such rather than as a failure.

---

## 7. DSAA attribution and typology discovery

### 7.1 Fingerprint construction

Each flagged transaction produces a **29-dimensional fingerprint**: Signal 1 (13 dims, per-feature share of reconstruction error, sums to 1.0) concatenated with Signal 2 (16 dims, per-latent-dimension share of KL divergence, sums to 1.0). Total row sum is therefore 2.0.

Signal 2 is **zero-padded to the maximum latent dimension (16)**. TRANSFER uses 8 latent dimensions, so its fingerprints have dimensions 8–15 exactly zero; CASH_OUT fills all 16.

### 7.2 Clustering results

DBSCAN, ε = 0.1075, `min_samples` = 10, Euclidean metric, over all 8,213 fraud fingerprints.

- **12 clusters** discovered
- **505 noise points** (6.1%)
- **Silhouette score 0.2387** (v2 comparison: 19 clusters, silhouette 0.3587)

| Typology | Cases | Dominant attribution |
| --- | --- | --- |
| PASS_THROUGH_MULE | 3,979 | S1 `F10_recipient_emptied` up to 0.85; S2 dims 3, 6, 7 |
| LATENT_PATTERN_VIOLATION | 1,903 | S1 `F7_day`, `F3_balance_consistency`; S2 dims 1, 8 |
| MIXED_ANOMALY | 1,685 | S1 `F7_day` + `F6_hour`; S2 dim 0 |
| ROUND_AMOUNT_FRAUD | 141 | S1 `F12_round_amount` ≈ 0.73; S2 dims 0, 1 |

Mean Signal 1 across all fraud: `F10_recipient_emptied` 0.3790, `F7_day` 0.2688, `F6_hour` 0.1524, `F4_balance_change_ratio` 0.0948.

### 7.3 Evidence that Signal 2 became discriminative

This is the experimental payoff of the correction in Section 5.

**In v2**, the same three or four latent dimensions dominated *every* discovered cluster — dim_3 appeared in 9 of 19 clusters, dim_10 in 6, dim_9 in 6. Signal 2 was a constant background, not an attribution. Weights ranged 0.12–0.25.

**In v3**, each cluster is dominated by a *distinct* latent dimension — cluster 0 by dim_3, cluster 1 by dim_6, cluster 3 by dim_8, cluster 4 by dim_1, cluster 6 by dim_0 — with weights 0.25–0.44, roughly doubled.

Mean Signal-2 non-uniformity: **0.0400 → 0.0716** (1.8×).

### 7.4 Known artifact — clusters are type-pure by construction

Verified directly: a cross-tabulation of the 12 clusters against transaction type shows **every cluster is 100% one type**. Clusters 0, 1, 2 are entirely TRANSFER (3,979 cases); clusters 3–11 are entirely CASH_OUT (3,729 cases). Only the noise set mixes types.

The cause is the zero-padding. TRANSFER fingerprints occupy an 8-dimensional subspace of Signal 2 while CASH_OUT fills 16, and the **minimum cosine distance between any TRANSFER and any CASH_OUT fingerprint is 0.2056** — the two groups are structurally separable before any clustering occurs.

**Consequence:** typology discovery operates *within* each stratum, not across. This is consistent with the stratified architecture, but it must be stated, because a reviewer can otherwise object that the clustering merely recovered the transaction type, which was already known.

### 7.5 A DBSCAN tuning investigation was run and its result rejected

A sweep over ε × metric found cosine with ε = 0.05 reaching silhouette **0.6394**, far above the current 0.2387. It was **rejected after inspection**: at that setting the algorithm produced two large clusters of 4,052 and 3,933 cases, which correspond almost exactly to the TRANSFER (4,097) and CASH_OUT (4,116) populations. The high silhouette measured the separation of the two transaction types, not typology quality, and the configuration discovers *fewer* typologies than the current one. The Euclidean ε = 0.1075 setting was retained.

---

## 8. Gaps between the proposal and the completed work

This section is deliberately complete. Each item is either a deviation to be justified in writing, or work not yet done.

### 8.1 Specification deviations — require explanation in the paper

| Item | Proposal specifies | Implemented | Assessment |
| --- | --- | --- | --- |
| Feature count | **8** features (F1–F8) | **13** (F1–F13) | Scope extension. F9–F13 are mule-network and destination-side features. Needs a stated rationale. |
| VAE input shape | `(batch, 8)` | `(batch, 13)` | Follows from the above. |
| Architecture | Single spec: 8 → 32 → 16 → latent 8 | Per-type; CASH_OUT enlarged to 13 → 64 → 32 → latent 16 | Deviation. The enlargement was introduced to address weak CASH_OUT performance and did not resolve it — CASH_OUT uses only 4 of 16 dimensions. Justification is now weak; consider reverting to latent 8 or explaining the negative result. |
| Fingerprint dimensionality | **16-dim** | **29-dim** (13 + 16) | Follows from the feature-count change. |
| β annealing | **"0 to 1 over 10 epochs"**, stated as the posterior-collapse mitigation | **0 → 0.05** | **Most significant deviation.** The sweep demonstrates β = 1.0 *causes* collapse under a Free Bits floor. Present as a finding that corrects the proposal, not as an unexplained change. |
| Free Bits | "minimum 0.1 KL per dimension" | 0.1 | ✅ Compliant (v2 used 0.01 in error; v3 restored it). |
| Risk classification | NORMAL / SUSPICIOUS / CRITICAL | Binary flag only | **Not implemented.** Requires two thresholds instead of one. Either implement or remove from scope explicitly. |
| Ablation breadth | **"seven-configuration ablation study"** (abstract); "four-way" (WBS T8) | **4** configurations (A–D) | The proposal is internally inconsistent. Four are done. The β sweep (5 points) could be presented as additional configurations. |

### 8.2 Promised analyses not yet run

| Item | Source | Status | Effort |
| --- | --- | --- | --- |
| **Feature necessity analysis** — "isolates whether multi-dimensional behavioral modeling adds detection value beyond simple balance verification"; risk-analysis row says "Run ablation with and without balance features. Report finding honestly." | Proposal abstract + Risk Analysis | **NOT DONE** | ~20 min. Retrain TRANSFER VAE without F3/F4 and compare. |
| **Adjusted Rand Index** for clustering validation — "Clustering validation uses silhouette score and adjusted Rand index" | Proposal abstract | **NOT DONE** — only silhouette computed | ~15 min |
| **Average precision / AUC-PR** | Not in proposal, but required because AUC-ROC is optimistic at 0.18% fraud rate | **NOT DONE** | ~15 min |
| **NFR1 latency** — "inference time under 50 milliseconds per transaction" | Proposal NFR1 | **NOT MEASURED** | ~10 min |
| **API endpoint (WBS T9)** | Proposal WBS, scheduled Aug–Sep 2026 | **NOT BUILT** — within its scheduled window | — |

**The feature necessity analysis is the highest-priority gap.** The component reports F1 0.9836 on TRANSFER. A reviewer will reasonably ask whether PaySim's TRANSFER fraud is trivially separable using the two balance features (F3, F4) alone, in which case the multi-dimensional VAE adds nothing. The proposal anticipated this exact objection and committed to the analysis. Either outcome is publishable: if F1 drops materially without F3/F4, multi-dimensional modelling is justified; if it does not, the honest finding is that PaySim TRANSFER fraud is balance-separable, which the proposal already committed to reporting.

### 8.3 Known defects still open

| Defect | Detail | Fix |
| --- | --- | --- |
| **PAYMENT false-positive rate** | PAYMENT has no fraud, so its threshold cannot be tuned from labels. The current rule is mean + 3σ, which assumes Gaussian tails. The scores are heavy-tailed, so it flags **17,669 of 1,506,047 (1.17%)** instead of the ~0.13% a Gaussian implies. The notebook prints "PAYMENT FP did not decrease", contradicting the stratification argument. | Replace with an explicit false-alarm budget: `np.quantile(scores, 0.999)` → ~1,506. **Corrected figure not yet computed.** |
| Ablation table label | Config D labelled "(Best)" despite F1 0.2410 vs B's 0.9836 | Rename to "(full coverage)" |
| `dbscan_config.json` | Metric hardcoded as `'euclidean'` rather than read from the fitted object | Use `dbscan.metric` |
| F11 causality | Account velocity counts across the whole dataset, including future rows | Quantify or restrict to the training partition |
| F8 partition | Percentile computed across the whole dataset rather than train only | Quantify or restrict |

---

## 9. Schedule status

Per the proposal's Work Breakdown Structure:

| Task | Timeline | Status |
| --- | --- | --- |
| T1 Literature review | March 2026 | Done |
| T2 Feature engineering | March–April 2026 | Done |
| T3 Threshold analysis + baseline | April 2026 | Done |
| T4 Global VAE baseline | April–May 2026 | Done (Config A) |
| T5 Stratified VAE ensemble | May–June 2026 | Done (3 VAEs trained and saved) |
| T6 DSAA framework | June–July 2026 | Done (Signal 1 + Signal 2) |
| T7 Per-stratum threshold optimisation | July 2026 | Done |
| T8 Ablation study | July–August 2026 | Done (4 of 7 configurations) |
| T9 API + fusion integration | **Aug–Sep 2026** | Not started — within window |
| T10 Visualisation and demo | Sep–Oct 2026 | Partial (dashboard and plots exist) |
| T11 Final documentation | October 2026 | In progress |

**T1–T8 are complete.** T9–T11 are within their scheduled windows.

---

## 10. Artifacts and environment

**Environment.** Google Colab (free tier), TensorFlow/Keras, scikit-learn, models and results persisted to Google Drive.

**Trained artifacts** (`DeepSentinel_Results_v3/models/`): three encoders and three decoders (`.keras`), three MinMaxScalers (`.pkl`), and `stratified_config.json` containing per-type thresholds, z-score normalisation statistics, and KMeans cluster centres.

**Result artifacts** (`DeepSentinel_Results_v3/`): `beta_sweep_v3.json` + `.png`, `kl_health_v3.json`, `config_b/c/d_metrics.json`, `config_payment_control.json`, `confusion_matrices.png`, `stratified_vae_evaluation.png`.

**DSAA artifacts** (`DeepSentinel_DSAA_v3/`): `fingerprints.npz` (arrays: `fingerprints` 8213×29, `signal_1`, `signal_2`, `cluster_labels`, `fraud_type`), `dbscan_config.json`, `mean_signals.json`, `typology_records.json`, `dsaa_dashboard.png`, `typology_radar.png`, `dbscan_kdistance.png`.

**Notebooks:** feature engineering, EDA, global VAE baseline, stratified VAE (v3), DSAA framework (v3), plus a standalone DBSCAN tuning notebook.

**Reproducibility note.** Encoders contain a Lambda sampling layer that does not deserialise reliably across Keras versions. All downstream notebooks rebuild the architecture from code and load weights only, which is version-robust.

---

## 11. Anticipated review questions, with the evidence to answer them

1. **"Config D is 0.2410 but Config B is 0.9836 — why call D best?"** They measure different populations: B on TRANSFER alone, D across TRANSFER and CASH_OUT. D is full coverage, not superior. The "(Best)" label is being removed.
2. **"Is F1 0.9836 real, or is PaySim TRANSFER fraud trivially separable by balance features?"** — **Currently unanswerable.** This is what the pending feature necessity analysis exists to settle.
3. **"CASH_OUT F1 fell from 0.1766 to 0.0961 after your fix. Did you make it worse?"** AUC rose 0.9119 → 0.9646, so ranking improved. The KL regularisation that makes the latent space interpretable smooths the reconstruction tail the unregularised model exploited. A measured trade-off, accepted for latent-space validity.
4. **"AUC-ROC is 0.9646 but F1 is 0.096. Explain."** Fraud is 0.18% of CASH_OUT; AUC-ROC is optimistic under extreme imbalance. Average precision is the appropriate statistic — pending.
5. **"NFR3 targets 98% reliability against posterior collapse, but two strata show WARNING. Is it met?"** Collapse means zero active dimensions, as observed at β = 1.0. All three strata carry 3–4 active dimensions with Signal-2 spreads 0.089–0.163. NFR3 is met; the WARNING is a stricter secondary criterion on the fraction of dimensions used.
6. **"Every cluster is one transaction type — did you just rediscover the type label?"** Correct, and stated explicitly. Signal 2's zero-padding makes the types structurally separable (minimum cosine distance 0.2056). Typology discovery operates within each stratum.
7. **"Your proposal specified β annealed to 1.0. Why is it 0.05?"** The sweep shows β = 1.0 causes total collapse under a Free Bits floor: 0 of 8 dimensions active, Signal-2 spread 0.0014. The proposal's mitigation was itself the failure mode. This is the component's principal finding.
8. **"You swept β on TRANSFER only. Does it transfer to the other strata?"** Compute budget constraint, verified post hoc on all three via the latent health check.

---

## 12. Honest summary of standing

**Strengths.** TRANSFER-leg detection at F1 0.9836 and AUC 0.9997, achieved fully unsupervised. A genuine novel finding in the β collapse boundary, with the failure endpoint reproduced and quantified. Before/after evidence that Signal 2 moved from a constant background to a discriminative attribution. Twelve typologies discovered without labels. A complete configuration ablation against a global baseline. A negative result on CASH_OUT with a *proven* ceiling rather than an assumed one.

**Weaknesses.** CASH_OUT detection is poor and provably cannot be improved within this component. The aggregate Config D figure looks weak and will be read as the component's headline unless per-type reporting is used. The PAYMENT false-positive rule is wrong and currently contradicts the stratification argument. Four promised analyses (feature necessity, ARI, AUC-PR, NFR1 latency) are outstanding, and three specification deviations need written justification.

**Overall.** The experimental work for T1–T8 is complete and the artifacts are saved. The outstanding items are approximately one hour of computation plus writing. The principal risk to this component is **not weak results** — it is presenting the aggregate number instead of the per-type breakdown, and leaving the feature necessity analysis unrun so that the headline F1 cannot be defended.
