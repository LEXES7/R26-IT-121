# Notebooks

Each notebook is self-contained and runnable on **Google Colab (T4/L4 GPU)**.
Run them in numerical order — outputs of one feed the next.

| # | Notebook | Stage | Inputs | Outputs | Status |
|---|----------|-------|--------|---------|--------|
| 01 | `01_baseline_evaluation.ipynb` | Stages 1 + 2 | PaySim CSV (auto-fetched) | `features.parquet`, `baseline_metrics.json`, B0/B1/B2 metrics | ✅ done |
| 02 | `02_window_builder.ipynb` | Stage 3 | `features.parquet`, `scaler.pkl` | `train_windows.tfrecord` (~8.3 GB), `test_windows.tfrecord` (~156 MB) | ✅ done |
| 03 | `03_tcn_architecture.ipynb` | Stage 4 build | TFRecord windows | Architecture diagram, attention demo — 1-epoch sanity run only, superseded by 04 | ✅ done |
| 04 | `04_full_training.ipynb` | Stages 4 + 6 + 7 | TFRecord windows | `best_tstcn.keras`, `tstcn_test_metrics.json`, `four_model_comparison.csv`, ROC/confusion-matrix/attention/latency figures | ✅ done |
| 06 | `06_ablation_study.ipynb` | Stage 5 (A1 ref, A2, A3) | TFRecord windows (W=32, W=16) | Partial `ablation_results.json` — A4 (W=64) documented as pending, completed by 07 | ✅ done |
| 07 | `07_ablation_a4_completion.ipynb` | Stage 5 (A4) | `features.parquet` (rebuilds W=64 windows) | Merges A4 into `ablation_results.json` — all four configs complete | ✅ done |

**What changed from the original plan:** stages 6 and 7 (threshold tuning, four-model comparison,
visualisations) ended up folded into `04_full_training.ipynb` rather than a separate
`05_evaluation_threshold.ipynb` — the training run and its evaluation share too much state
(the fitted model, the test predictions) to be worth splitting across a Drive round-trip.
A4 needed its own W=64 window build, which turned into its own notebook (`07`) rather than a
cell inside `06` so it could be run in parallel with A1–A3 on a separate GPU runtime.

There is no `05` notebook — the number is retired rather than reused, so a stage reference in
the proposal or the report always points at the same file it did when written.

## Superseded

`03_tcn_architecture.ipynb` produced `ts_tcn_sanity.keras` — a 1-epoch run that verified the
architecture and `fraud_attention` shapes, not a converged model. It has been deleted from
`outputs/stage4_tcn/` (superseded by `best_tstcn.keras` from notebook 04); the notebook itself
is kept for the architecture-verification record.

## Disconnect resilience

Stage 3 onwards work with multi-GB TFRecord files. Two resilience patterns
are used in every notebook:

1. **Outputs written directly to Drive** (not local `/content`)
2. **Local copy of input TFRecords** before training to avoid Drive FUSE
   instability under sustained read load

## Conventions

- Every notebook starts with environment setup + Drive mount
- Every notebook ends with a "Decision Summary" cell
- All paths are derived from a single `DRIVE_BASE` constant
- Colour theme is shared via `from src.utils import apply_theme`
