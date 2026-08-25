# Test Split Comparison Across DeepSentinel Components

**Project:** DeepSentinel (R26-IT-121)
**Question investigated:** What test split does the GraphSAGE component use — is it step 595?
**Answer:** **No.** GraphSAGE uses `train_end = 600`, `val_end = 700`, and splits **accounts (nodes)**, not transactions.
**Source:** `D:\Research\Graphsage\` — latest version, updated 2026-08-23.

---

## 1. GraphSAGE split — what the code actually does

### 1.1 Split boundaries

From `scripts/make_splits.py`:

```python
TRAIN_END = 600
VAL_END   = 700
```

| Split | Step range | Duration |
| --- | --- | --- |
| train | 1 – 600 | ~25 days |
| val | 601 – 700 | ~4 days |
| test | 701 – 743 | ~2 days |

### 1.2 The unit split is the account, not the transaction

From the module docstring of `src/graphsage/data/splits.py`:

> *"Splits **NODES (not edges)** chronologically by the earliest step at which they appear as either sender or receiver."*

```python
train_mask = first_step <= train_end                              # train_end = 600
val_mask   = (first_step > train_end) & (first_step <= val_end)   # val_end   = 700
test_mask  = first_step > val_end
```

`first_step` is the minimum step across every edge incident on that node. An account is therefore assigned to the split containing its **first ever transaction**, and all of that account's activity follows it into that split.

### 1.3 Resulting split

From `docs/system_walkthrough.md`:

| Split | Nodes | % of nodes | Mules | Fraud rate |
| --- | --- | --- | --- | --- |
| Train (steps 1–600) | 3,223,968 | 98.4% | 7,076 | 0.22% |
| Val (steps 601–700) | 46,558 | 1.4% | 761 | 1.63% |
| **Test (steps 701–743)** | **6,983** | **0.2%** | **332** | **4.75%** |

The documented rationale:

> *"We chose train_end=600 to preserve 80% of edges for training while reserving the natural fraud-enriched tail of the simulation for evaluation. The test fraud rate of 4.75% — 16× higher than the dataset baseline — produces a stricter evaluation than random splitting would."*

The enrichment happens because PaySim's transaction volume drops roughly 90% after step 400 while fraud activity stays constant.

---

## 2. The deeper difference — GraphSAGE solves a different task

GraphSAGE's label `data.y` marks **whether an account is a mule**, not whether a transaction is fraudulent. This is visible in the split statistics, which count `train_mules`, `val_mules` and `test_mules` rather than fraudulent transactions.

**Consequence:** GraphSAGE's reported F1 of 0.5387 is **account-level mule classification**. The VAE component's F1 is **transaction-level fraud classification**. These are different prediction targets over different populations, so the two numbers are not comparable in either direction.

---

## 3. Current state across the three detector components

| Component | Prediction unit | Split strategy | Test population | Test fraud rate |
| --- | --- | --- | --- | --- |
| **Stratified VAE (Member 2)** | transaction | **stratified random**, 30% tune / 70% test | full dataset, per type | 0.18% (CASH_OUT) – 0.77% (TRANSFER) |
| **TS-TCN (Member 3)** | transaction | chronological, train step ≤ 595 / test step > 595 | 1,642 test fraud cases | — |
| **GraphSAGE (Member 1)** | **account (node)** | chronological on node first-appearance, ≤ 600 / 601–700 / > 700 | 6,983 nodes, 332 mules | 4.75% |

**All three differ.** Two differ in split boundary; one also differs in prediction unit.

---

## 4. Implications for the VAE component's split decision

### Option A — adopt step 595 (matches TS-TCN)

Verified against the preprocessed CSVs: splitting at step 595 yields **exactly 1,642 test fraud cases** (TRANSFER 821 + CASH_OUT 821 + PAYMENT 0), matching the figure stated in the TS-TCN documentation.

- ✅ Makes the VAE results **directly comparable to TS-TCN** on an identical transaction-level test population.
- ❌ Does not align with GraphSAGE's step boundary.
- Cost: free — `step` is recoverable from `F7_day × 720`, no feature-engineering re-run needed.

### Option B — adopt train ≤ 600 / test > 700 (matches GraphSAGE's boundary)

- ✅ Aligns the **time window** with GraphSAGE, which may matter to the fusion engine.
- ❌ Still not a shared test population, because GraphSAGE evaluates accounts and the VAE evaluates transactions.
- ❌ Does not align with TS-TCN.

### Option C — keep the current stratified random split

- ✅ No work; existing metrics stand.
- ❌ Not causally valid; a reviewer can object that random splitting leaks future information — an objection GraphSAGE's own documentation explicitly anticipates and defends against.

### Recommendation

**Option A (step 595)** is the strongest available choice. It is free, it is causally valid, and it makes at least the two transaction-level components measurable on the same test set. Full alignment with GraphSAGE is not achievable by choosing a split boundary, because the prediction unit differs.

---

## 5. Item for the fusion engine (Member 4)

The three detectors currently report metrics computed on **three different test populations**, one of which uses a different prediction unit entirely. Fusion-level performance figures cannot be derived by combining the three reported numbers, and any joint evaluation will require re-scoring all three components on one agreed test population.

This should be raised before integration metrics are reported.

---

## Appendix — evidence trail

| Claim | Source file |
| --- | --- |
| `TRAIN_END = 600`, `VAL_END = 700` | `Graphsage/scripts/make_splits.py` |
| Nodes split, not edges; assignment by earliest incident edge | `Graphsage/src/graphsage/data/splits.py` (docstring + `make_time_split`) |
| Split sizes, mule counts, 4.75% test fraud rate, rationale quote | `Graphsage/docs/system_walkthrough.md` |
| GraphSAGE best tuned test F1 = 0.5387 | `Graphsage/reports/ablation_tuned.json` (`stage_3a.tuned_threshold_metrics.test`) |
| TS-TCN split at step 595, 1,642 test fraud cases | `VAE-With-DSAA/research documents/TS-TCN_Paper_Notes.pdf` |
| Step 595 reproduces 1,642 exactly on the VAE component's data | Verified against `DeepSentinel_Output_v2\*_all_features.csv` |
