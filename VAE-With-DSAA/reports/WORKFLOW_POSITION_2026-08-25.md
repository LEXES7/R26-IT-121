# Workflow Position — 25 August 2026 (08:00)

**Project** R26-IT-121 · **Member 2** · Wijesinghe L.P.D.B. (IT22109194)
**Supervisor** Mrs. Anjalie Gamage · SLIIT
**Repository** `D:\Research\VAE-With-DSAA`

This document answers three questions: where the component stands in its
workflow, what changed in the overnight working session, and what remains.

It supersedes the status section of `reports/PROJECT_STATUS_2026-08-25.md`,
which describes the state at 02:58 on the same day — before the DSAA port, the
F3 ablation and the document regeneration. That file is retained as the
earlier snapshot.

Every figure below was verified against the artefacts on disk.

---

## 1. Position in the workflow

| # | Stage | State |
| --- | --- | --- |
| 1 | Feature engineering | ✅ Complete |
| 2 | Exploratory data analysis | ✅ Complete |
| 3 | Global VAE baseline | ✅ Complete |
| 4 | Stratified VAE | ✅ Complete |
| 5 | Leakage fix / clean chronological protocol | ✅ Complete |
| 6 | Feature-set ablation | ✅ Complete — 6 tiers |
| 7 | Artifact quantification | ✅ Complete — extended to F3 and F4 |
| 8 | Model persistence + round-trip verification | ✅ Complete |
| 9 | DSAA + typology port to v4 | ✅ **Complete — closed overnight** |
| 10 | Gamma / Tri-Signal decision | ✅ Complete — Option A implemented |
| 11 | **Final feature-set framing decision** | ⚠️ **← current position** |
| 12 | v4 figures | ❌ Not started |
| 13 | REST API | ❌ Not started |
| 14 | Official repository push | ❌ Not started |
| 15 | Thesis / paper | ❌ Not started |

**Modelling and experimentation are finished.** What remains is one
interpretive decision, followed by presentation and delivery work. No further
training runs are required by anything on the critical path.

---

## 2. Completed since the 02:58 audit

All of the following landed between approximately 05:30 and 07:52.

| # | Item | Evidence |
| --- | --- | --- |
| 1 | `PRIMARY_FEATURE_SET = "FS-ORIGIN"` recorded, with the full caveat in its docstring | `src/vae_dsaa/data/features.py:117` |
| 2 | **DSAA ported to v4** — no longer a stub | `src/vae_dsaa/dsaa/signals.py` (4,186 bytes) |
| 3 | **Typology / DBSCAN ported to v4** | `src/vae_dsaa/typology/cluster.py` (7,191 bytes) |
| 4 | DSAA executed on FS-ORIGIN bundles | `reports/v4/dsaa/dsaa_FS-ORIGIN.json` (48 KB) |
| 5 | Config A retrained on FS-ORIGIN | AP 0.6078 · lift 33.30× · F1 0.4187 |
| 6 | Config D regenerated deterministically, both tiers | FS-ORIGIN 0.7000 / 20.78× / F1 0.6821 · FS-FULL 0.9111 / 27.05× / F1 0.8482 |
| 7 | New ablation tier `FS-ORIGIN-NOF3` (6 features) trained on both strata | `reports/v4/clean__FS-ORIGIN-NOF3__*.json` |
| 8 | Deterministic single-feature baselines computed | `reports/v4/single_feature_baselines.json` |
| 9 | Gamma decision taken — Option A, Tri-Signal; `signal_3` implemented additively | `dsaa_FS-ORIGIN.json` → `gamma_comparison` |
| 10 | Documents regenerated — `RESULTS_v4.md` is now auto-generated from the authoritative JSON | `scripts/make_report.py` |
| 11 | `README.md`, `BALANCE_ABLATION_FINDING.md`, `configs/model_config.yaml` rewritten with changes marked | working tree |
| 12 | `FS11` → `FS-FULL` rename completed; superseded prototype relocated | `scripts/legacy/v4_prototype/` |
| 13 | Staging copy rebuilt | 139 files, 19.55 MB |
| 14 | Test suite | **9 passed** — re-run and confirmed |

Two of the three package stubs are now real implementations. Only
`src/vae_dsaa/api/` remains empty.

---

## 3. New finding — FS-ORIGIN is substantially an F3 detector

This is more serious than the destination-side artifact documented on 24 August,
and it changes what the component can claim.

### 3.1 Removing F3 collapses the tier

`FS-ORIGIN-NOF3` removes `F3_balance_consistency` and nothing else.

| Stratum | FS-ORIGIN (7) | **FS-ORIGIN-NOF3 (6)** | FS-CLEAN (4) |
| --- | --- | --- | --- |
| TRANSFER AP lift | 9.85× | **5.09×** | 4.89× |
| CASH_OUT AP lift | 33.97× | **15.70×** | 16.59× |

On TRANSFER the tier falls to roughly FS-CLEAN's level. On CASH_OUT it falls
**below** it.

### 3.2 F3 is itself a simulator artifact

`F3_balance_consistency` flags rows where
`oldbalanceOrg − amount − newbalanceOrig ≈ 0`.

| | `F3 == 1` among fraud | `F3 == 1` among normal |
| --- | --- | --- |
| TRANSFER | **99.03%** | 4.94% |
| CASH_OUT | **100.00%** | 13.24% |

Fraudulent transfers reconcile exactly because the simulated fraudster drains
the account precisely; genuine transfers frequently do not. This is a property
of PaySim, not of fraud behaviour.

### 3.3 The VAE adds almost nothing over a single column

Deterministic single-feature baselines — the raw feature used directly as a
ranking score, with no model at all:

| Stratum | `F4` alone | `F3` alone | FS-ORIGIN VAE (7 features) | VAE advantage |
| --- | --- | --- | --- | --- |
| TRANSFER | 9.84× | 8.44× | 9.85× | **+0.1%** |
| CASH_OUT | 32.74× | 6.60× | 33.97× | **+3.8%** |

There is also an internal contradiction worth stating plainly: `F4` alone
reaches 9.84× on TRANSFER, but the six-feature VAE that *contains* `F4`
reaches only 5.09×. The model is destroying signal the raw feature carries.

These baselines never involved the model, so the determinism fix did not move
them; the 8.44× and 32.74× figures stand unchanged.

---

## 4. DSAA on v4 — the results are strong

This is the part of the component that survives the artifact findings intact,
and it should become the centre of the thesis.

| Metric | TRANSFER | CASH_OUT |
| --- | --- | --- |
| Flagged rows | 955 / 11,546 | 690 / 37,196 |
| **Fraud among flagged** | **581 (60.8%)** | **540 (78.3%)** |
| Recall | 70.8% | 65.8% |
| Fingerprint width | 15-dim (7 + 8) | 23-dim (7 + 16) |
| Clusters discovered | 6 | 11 |
| Noise | 2.0% | 14.1% |
| **DBCV** | **0.7224** | **0.6699** |
| **Silhouette** | **0.4812** | **0.5996** |
| Davies–Bouldin | 0.574 | 0.356 |
| **Bootstrap ARI** | **0.9996 ± 0.0010** | 0.9231 ± 0.0141 |

Three points make this defensible:

1. **Quality.** v3 reported a silhouette of 0.2387. The clean v4 run reaches
   0.4812 and 0.5996 — a different class of result.
2. **Stability.** Bootstrap ARI near 1.0 means the partition is a property of
   the data, not of the particular sample drawn.
3. **Operational meaning.** Clusters separate by precision. TRANSFER cluster 2
   (92 rows) and cluster 5 (46 rows) are **100% fraud**; clusters 3 and 4
   (38 and 113 rows) are **0% fraud**. CASH_OUT cluster 0 (267 rows) is 98.5%
   fraud. Signal 2 varies by cluster (dim_0, dim_2, dim_3, dim_7), so latent
   attribution is discriminating rather than a constant background.

### 4.1 The v3 confound now has a number

`ARI(clusters, transaction type) = **0.5240**`, with **12 of 12** v3 clusters
being 100% single-type across 8,213 rows.

v3 padded Signal 2 to the widest latent dimension, so TRANSFER rows carried
exact zeros in dimensions 8–15. The two strata were separable before
clustering began. The limitations section of the thesis now has its measured
figure.

### 4.2 Gamma — Option A adopted

| Stratum | A: keep γ = 0.2 | B: γ = 0, renormalised | Δ (B − A) |
| --- | --- | --- | --- |
| TRANSFER AUC-PR | **0.7001** | 0.6668 | −0.0333 |
| CASH_OUT AUC-PR | **0.7498** | 0.6818 | −0.0680 |

Dropping the latent-density term costs 4.8% and 9.1% of AP, so it earns its
weight. The honest fix is to attribute it rather than delete it. `signal_3` is
implemented as the per-dimension share of squared displacement from the nearest
centroid, which decomposes the density term exactly, and is **additive** —
`signal_1` and `signal_2` keep their names, widths and meaning, so Member 4's
fusion engine is unaffected.

Caveat: `signal_3`'s non-uniformity (0.0708 / 0.0835) is lower than `signal_1`
(0.1828 / 0.2332) and `signal_2` (0.1465 / 0.1136), making it the least
discriminative of the three per-dimension.

---

## 5. The open decision — current position

`reports/SESSION_FINDINGS_2026-08-25.md` flags this for a decision:

> FS-ORIGIN is defensible as *"the tier that removes the destination-side
> artifact"*, but not as *"the tier where the VAE demonstrates behavioural
> modelling capability"*. On the current evidence **no tier supports that
> second claim.**

### Options

| | Option | Consequence |
| --- | --- | --- |
| **A** | **Keep FS-ORIGIN** (current state) | Framed as the tier that removes the destination-side artifact. The F3 dependence is stated in the thesis. No code change. |
| **B** | **Switch to FS-CLEAN** | An artifact-free anchor. Lower numbers (TRANSFER 4.89×, CASH_OUT 16.59×) but no artifact mechanism at all. One-line change. |

### Recommendation — Option A, with the framing changed

Keep FS-ORIGIN, but stop claiming detection accuracy as the contribution. That
claim cannot be defended against a single column. Build the thesis on three
things that can be:

1. **DSAA and typology quality** — DBCV 0.7224, bootstrap ARI 0.9996,
   precision-separated clusters. Strong and independent of the artifact
   argument.
2. **Methodological contribution** — leakage inflation measured at 8.7× and
   8.3×; three PaySim artifacts quantified (F10, F3, F4); the v3 clustering
   confound measured at ARI 0.5240.
3. **N3 — the β collapse boundary** — independent of feature choice and still
   solid.

Report the detection numbers as **evidence for the artifact argument**, not as
evidence of capability.

---

## 6. Outstanding work

### 6.1 Blockers

| # | Item | State |
| --- | --- | --- |
| 1 | **FastAPI `/api/v1/behavioral/classify`** | `src/vae_dsaa/api/__init__.py` is still a 70-byte stub. The contract is drafted at `docs/integration/behavioral_api_contract.md` and two sample payloads exist, but there is no implementation. **Member 4's fusion engine is blocked on this.** |
| 2 | **No v4 figures exist** | `reports/v4/dsaa/` contains only JSON. `typology_radar.png` and `dsaa_dashboard.png` are **v3 artefacts, produced under the leaky protocol**. The thesis needs v4 equivalents. |
| 3 | **PR curves are stale** | `results/v4/curves/pr_inputs.npz` is dated **23 August, 21:20** — before the determinism fix and before FS-ORIGIN, FS-ORIGIN-NOF3, the FS-ORIGIN GLOBAL run and either D_ensemble existed. `reports/figures/pr_curves_v4.png` is superseded. |

### 6.2 Regressions and housekeeping

| # | Item |
| --- | --- |
| 4 | **`CHANGES.md` was dropped from the staging copy** during the rebuild. `VAE-With-DSAA-official/` now contains only `.gitignore`, `pyproject.toml`, `README.md` and `requirements.txt` at its root. It was the one-page summary intended for the team. |
| 5 | **Nothing is committed.** 24 modified or deleted paths and 26 untracked paths are sitting in the working tree, including the entire DSAA port. |
| 6 | `VAE-With-DSAA-official/` sits **inside** the `D:\Research` git repository, so it is tracked and its content is duplicated in history. It is a sibling of `VAE-With-DSAA/` but not outside the repo. Harmless if intentional. |

### 6.3 Carried over — medium priority

- `F6_hour` pathology check
- 11-feature support audit
- `F7_day` error-budget decomposition
- Keras ↔ PyTorch migration write-up

### 6.4 Low priority

- `Dockerfile` and `docker-compose.yml` — absent
- `notebooks/demo.ipynb` — absent
- Push to the official repository `LEXES7/R26-IT-121` — not done
- **Thesis / paper — not written**

---

## 7. Recommended order

| # | Task | Estimate | Rationale |
| --- | --- | --- | --- |
| 1 | **Commit the current working tree** | 5 min | The DSAA port is the session's most valuable output and is currently uncommitted |
| 2 | **Take the framing decision** (Option A with the reframe) | 15 min | Every subsequent word of the thesis depends on it |
| 3 | **Generate v4 figures** — regenerate PR curves, add DSAA and typology figures | ~2 h | Every figure currently in the repository is superseded |
| 4 | Restore `CHANGES.md` and re-verify the staging copy | 20 min | Team-facing deliverable |
| 5 | **Implement the REST endpoint** | ~2–3 h | Unblocks Member 4 |
| 6 | Push to the official repository | 30 min | Staging copy is built and verified |
| 7 | **Write the thesis**, leading with DSAA and methodology | — | Detection numbers become supporting evidence |

---

## 8. Summary

The overnight session closed the largest gap in the project: DSAA and typology
discovery now run on the clean v4 pipeline, and the results are the strongest
in the component — DBCV 0.7224, bootstrap ARI 0.9996, and clusters that
separate by fraud precision rather than by transaction type.

The same session also found that the chosen feature tier depends heavily on
`F3_balance_consistency`, and that the VAE improves on a single raw column by
0.1% on TRANSFER and 3.8% on CASH_OUT. That closes off any claim built on
detection accuracy, but it does not close off the component: the attribution
framework, the typology discovery and the methodological measurements all
stand on their own.

Modelling is finished. The remaining work is one decision, a set of figures, an
API endpoint, and the write-up.

---

## Where the underlying numbers live

| Artefact | Path |
| --- | --- |
| Authoritative metrics, all configurations | `reports/v4/all_configs_v4.json` |
| Single-feature baselines | `reports/v4/single_feature_baselines.json` |
| DSAA, typology and gamma results | `reports/v4/dsaa/dsaa_FS-ORIGIN.json` |
| Auto-generated metric tables | `reports/RESULTS_v4.md` |
| Artifact quantification | `reports/BALANCE_ABLATION_FINDING.md` |
| Session reasoning and interpretation | `reports/SESSION_FINDINGS_2026-08-25.md` |
| Earlier snapshot (02:58 the same day) | `reports/PROJECT_STATUS_2026-08-25.md` |
| Model bundles | `checkpoints/v4/` |
