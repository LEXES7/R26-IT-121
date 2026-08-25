# Restructure + Persistence — Working State

Checkpoint written before conversation compaction. Resume from here.

**Global constraint in force:** no `git push`, no commits without explicit request.
Local working copy only.

---

## Survey findings (done)

| Item | Value |
| --- | --- |
| Repo total | **2,046 MB** |
| `DeepSentinel_Output_v2/` | 1,151 MB (10 files) — the preprocessed CSVs |
| `DeepSentinel_Output_v1/` | 716 MB (9 files) — superseded, to drop |
| Everything else | ~180 MB |

Root contains **8 loose `.py` files**, **4 loose notebooks**, `dashboard.html`,
`generate_dashboard.py`, `streamlit_app.py`, `MY CV/`, `Research Proposals/`
(4 PDFs incl. 3 other members'), `research documents/` (incl. 2 TS-TCN PDFs).

`notebooks/` has `TCN - Another member/` (4 files, Member 3's work) plus `v2/`
(6 notebooks) and `v3/` (6 notebooks). `notebooks/v1/` created, still empty.

---

## PROBLEM 1 — model persistence

**Status: package modules written, training run NOT yet started.**

Done:
- `src/vae_dsaa/utils/persistence.py` — `save_bundle`, `load_bundle`,
  `list_bundles`, `git_commit`, `bundle_name`. Bundle = `vae.pt`, `scaler.pkl`,
  `kmeans.pkl`, `thresholds.json`, `manifest.json`.
- `src/vae_dsaa/models/vae.py` — `VAE`, `train_vae` (split out of `vae_v4.py`).
- `src/vae_dsaa/inference/scorer.py` — `MinMax`, `encode_all`, `fit_scorer`,
  `score`.
- `src/vae_dsaa/data/features.py` — `COLS13`/`COLS12`, `BALANCE_DERIVED`,
  `TIME_ABSOLUTE`, `LOOK_AHEAD`, `SOURCE_COLUMNS`, `FEATURE_SETS`,
  `PRIMARY_FEATURE_SET = "FS11"`.

Still to do:
- `src/vae_dsaa/inference/predictor.py` — `Predictor.from_dir()` loader.
- `src/vae_dsaa/data/prep.py` + `src/vae_dsaa/models/train.py` (port
  `prep_v4.py` / `run_v4.py`).
- `scripts/` thin wrappers.
- **Run training to produce bundles.** Plan: clean/FS12 ×4
  (GLOBAL, TRANSFER, CASH_OUT, PAYMENT) + clean/FS11 ×3 = 7 bundles, ~45 min.
  Seeds are fixed (42) so metrics must reproduce the saved JSON exactly —
  that is the round-trip proof.
- Round-trip check script comparing reloaded-model metrics against
  `results/v4/metrics/*.json`.

---

## PROBLEM 2 — restructure

**Status: skeleton created only.**

Created: `src/vae_dsaa/{api,data,models,dsaa,typology,inference,utils}` with
`__init__.py`, `scripts/legacy/`, `tests/`, `docs/integration/`,
`examples/api_responses/`, `dashboard/`, `checkpoints/`, `reports/figures/`,
`notebooks/v1/`.

Still to do:
- Move 4 root notebooks → `notebooks/v1/`.
- Move `dashboard.html`, `generate_dashboard.py`, `streamlit_app.py` → `dashboard/`.
- 8 loose root `.py` files → recommendation is `scripts/legacy/` (they are the
  exported v1 notebook sources; keeping them costs ~0.5 MB and preserves
  provenance). **Await user decision before deleting.**
- Delete `notebooks/TCN - Another member/` and `research documents/TS-TCN_*.pdf`.
- Drop `DeepSentinel_Results_v1`, `DeepSentinel_EDA_v1`, `DeepSentinel_Output_v1`.
- Keep v3 JSON/PNG evidence; exclude `.keras` and `fingerprints.npz`.
- Move v4 metrics JSON + markdown findings → `reports/`.
- Write `.gitignore` (track `src/scripts/reports/configs/docs/examples/tests/notebooks`;
  ignore `*.npz *.keras *.h5 *.pt *.pkl *.csv` and >50 MB) then prove with
  `git check-ignore -v`.
- `data/README.md`, `checkpoints/README.md`.
- Smoke test: import package, load a bundle, score one transaction.

---

## PROBLEM 3 — official staging copy

**Status: not started.** Target `VAE-With-DSAA-official/`, well under 50 MB.
Needs size, file count by directory, `git check-ignore -v` sample, and
`CHANGES.md`.

---

## Key results already established (do not recompute)

- Clean chronological split at **step 595**; total test fraud **1,642**
  (TRANSFER 821 + CASH_OUT 821), matching TS-TCN.
- Leakage inflation, framework and scoring path held constant: AP lift
  **9.14×** (TRANSFER), **11.27×** (CASH_OUT). *(Re-measured 25 Aug 2026;
  the earlier 8.7× / 8.3× mixed a stochastic leaky arm with a deterministic
  clean arm.)*
- `F7_day` is pure extrapolation under a time split — dropping it moved
  CASH_OUT F1 **0.0800 → 0.5648**.
- **Balance artifact:** `F10_recipient_emptied` alone gives **AP = 1.000000**,
  perfect separation on TRANSFER (821/821 fraud, 0/10,725 normal).
  Removing balance features drops TRANSFER AP 0.9999 → 0.3127.
  On CASH_OUT a single feature (lift 32.7×) beats the full VAE (20.6×).
- F8 causal recomputation changed <0.21% of rows — real but negligible.
- PAYMENT control: old `mean+3σ` flags 72.8% of the test partition;
  `quantile 0.999` gives 7.82%.

Full detail: `results/v4/RESULTS_v4.md` and
`results/v4/BALANCE_ABLATION_FINDING.md`.

---

## Outstanding items from the previous prompt (not yet done)

1. Re-run Configs A–D on **FS11** as the headline numbers.
2. `F6_hour` pathology check (expected safe — cyclic).
3. Support-overlap audit for all 11 features (fit vs test min/max).
4. PAYMENT control re-run on FS11.
5. `F7_day` reconstruction-error budget decomposition under FS12.
6. Keras ↔ PyTorch equivalence write-up.
7. Gamma / Tri-Signal decision (Option A vs B).
8. `configs/model_config.yaml` update with before/after.
