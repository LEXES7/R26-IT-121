# Notebooks

Each notebook is self-contained and runnable on **Google Colab Pro (T4 GPU)**.
Run them in numerical order — outputs of one feed the next.

| # | Notebook | Stage | Inputs | Outputs |
|---|----------|-------|--------|---------|
| 01 | `01_baseline_evaluation.ipynb` | Stages 1 + 2 | PaySim CSV (auto-fetched) | `features.parquet`, `baseline_metrics.json`, B0/B1/B2 metrics |
| 02 | `02_window_builder.ipynb` | Stage 3 | `features.parquet`, `scaler.pkl` | `train_windows.tfrecord` (~8.3 GB), `test_windows.tfrecord` (~156 MB) |
| 03 | `03_tcn_architecture.ipynb` | Stage 4 build | TFRecord windows | `ts_tcn_sanity.keras`, architecture diagram, attention demo |
| 04 | `04_full_training.ipynb` | Stage 4 train | TFRecord windows, sanity model | `best_tstcn.h5`, training history CSV |
| 05 | `05_evaluation_threshold.ipynb` | Stages 6 + 7 | `best_tstcn.h5`, all baseline probs | `test_metrics.json`, four-model comparison, ROC/attention figures |
| 06 | `06_ablation_study.ipynb` | Stage 5 | TFRecord windows | `ablation_results.json`, A1–A4 configs |

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
