# TS-TCN — Transaction-Sequence Temporal Convolutional Network

Multi-modal AI fraud detection — Member 3 component of the **DeepSentinel** capstone (R26-IT-121).

> A dilated causal Temporal Convolutional Network with self-attention attribution for explainable fraud detection on PaySim mobile money transactions.

| Field | Value |
|---|---|
| **Project** | R26-IT-121 — DeepSentinel |
| **Author** | Pathirana P.K.V. (IT22237972) — Member 3 |
| **Supervisor** | Mrs. Anjalie Gamage |
| **Institution** | SLIIT — Faculty of Computing, BSc (Hons) in Information Technology |
| **Specialisation** | Software Engineering |
| **Year** | Final-year research project, 2026 |

---

## 🔬 Research Novelties

| ID | Novelty | Status |
|----|---------|--------|
| **N1** | System-wide W=32 transaction-stream window — zero per-account history requirement | ✅ Complete |
| **N2** | Dilated causal TCN (rates 1, 2, 4, 8) for multi-transaction escalation patterns | ✅ Complete |
| **N3** | `fraud_attention` self-attention layer — architecturally intrinsic attribution (no SHAP) | ✅ Complete |
| **N4** | Data-driven `type_risk_weight` derived from training partition only | ✅ Complete |

---

## 📁 Repository Structure

```
TS-TCN/
├── notebooks/              Jupyter notebooks for stages 1 to 8
├── src/                    Reusable Python modules (refactored from notebooks)
│   ├── data/               Feature engineering, window builder, TFRecord I/O
│   ├── models/             TCN blocks, fraud_attention layer, full model
│   └── utils/              Plotting helpers, metric utilities, config
├── api/                    FastAPI deployment service (Stage 8)
│   ├── routes/             Endpoint handlers
│   └── schemas/            Pydantic request/response models
├── configs/                YAML configs (model hyperparams, training settings)
├── scripts/                One-shot CLI scripts (data prep, training, eval)
├── data/                   Datasets — gitignored, hosted on Drive
│   ├── raw/                Original PaySim CSV
│   ├── processed/          Engineered features (Stage 1 output)
│   └── windows/            TFRecord windows (Stage 3 output)
├── outputs/                Generated artefacts — gitignored
│   ├── stage1_features/    features.parquet, type_risk_weights.json
│   ├── stage2_baselines/   baseline_metrics.json, scaler.pkl, B0/B1/B2 probs
│   ├── stage3_windows/     train/test_windows.tfrecord, windows_metadata.json
│   ├── stage4_tcn/         best_tstcn.keras, full_training_history.csv
│   ├── stage5_ablation/    ablation_results.json
│   ├── stage6_evaluation/  test_metrics.json, four_model_comparison.csv
│   ├── stage7_visualisations/  Final figures for the report
│   └── stage8_api/         Deployment artefacts and logs
├── reports/                Academic deliverables
│   ├── proposal/           Research proposal DOCX
│   ├── progress/           PP1, PP2 progress reports and slide decks
│   └── figures/            Diagrams used in reports and slides
├── tests/                  Unit tests (pytest)
└── docs/                   Architecture notes, API contract, design log
```

---

## 🛠️ Setup

```bash
git clone https://github.com/<your-username>/TS-TCN.git
cd TS-TCN
python -m venv .venv
source .venv/bin/activate          # Linux/Mac
# .venv\Scripts\activate            # Windows
pip install -r requirements.txt
```

Datasets are not stored in this repo (size limits). Download PaySim from
[Kaggle](https://www.kaggle.com/datasets/ealaxi/paysim1) and place it under
`data/raw/PS_20174392719_1491204439457_log.csv`, or run notebook 01 which fetches
it automatically via `kagglehub`.

---

## 🚀 Usage

### Run notebooks in order

```bash
jupyter notebook notebooks/01_baseline_evaluation.ipynb
```

| # | Notebook | Stage | Output |
|---|----------|-------|--------|
| 01 | `01_baseline_evaluation.ipynb`  | Stages 1 + 2 | `features.parquet`, `baseline_metrics.json` |
| 02 | `02_window_builder.ipynb`        | Stage 3      | `train_windows.tfrecord`, `test_windows.tfrecord` |
| 03 | `03_tcn_architecture.ipynb`      | Stage 4 build | Architecture diagram, attention demo (1-epoch sanity, superseded) |
| 04 | `04_full_training.ipynb`         | Stages 4 + 6 + 7 | `best_tstcn.keras`, `tstcn_test_metrics.json`, `four_model_comparison.csv`, figures |
| 06 | `06_ablation_study.ipynb`        | Stage 5 (A1 ref, A2, A3) | Partial `ablation_results.json` |
| 07 | `07_ablation_a4_completion.ipynb`| Stage 5 (A4) | Completes `ablation_results.json` |

See [`notebooks/README.md`](notebooks/README.md) for why there is no `05` and why the ablation
study is two notebooks.

### Serve the API (Stage 8)

```bash
uvicorn api.main:app --reload --port 8003
# POST http://localhost:8003/api/v1/classify
```

Port 8003 is the fusion engine's default `TEMPORAL_API_BASE` — running here
means the Fusion Engine and website pick it up with no extra configuration.
See [`docs/api_contract.md`](docs/api_contract.md) for the full request /
response schema and the checkpoint's real measured performance
(F1 0.851, AUC-ROC 0.947 — see the caveat there for the full picture,
including where it still falls short of the proposal's stretch targets).

---

## 📊 Stage Map (per proposal §4, Table 7)

| Stage | Component             | Deliverable                  | Status |
|------:|-----------------------|-------------------------------|:------:|
| 1 | Feature Engineering         | `features.parquet`           | ✅ |
| 2 | Baseline Evaluation         | `baseline_metrics.json`      | ✅ |
| 3 | Window + ID Buffer          | Pipeline code, `scaler.pkl`  | ✅ |
| 4 | TCN Training                | `best_tstcn.keras`           | ✅ |
| 5 | Ablation Study              | `ablation_results.json`      | ✅ |
| 6 | Evaluation                  | `tstcn_test_metrics.json`    | ✅ |
| 7 | Visualisations              | Figures in `outputs_final/`  | ✅ |
| 8 | API Delivery                | Working endpoint, live in the DeepSentinel platform | ✅ |

---

## 👥 Team Integration

The TS-TCN exposes a single REST endpoint (Stage 8) that returns a fraud
probability and attention-based attribution for the centre transaction of
a 32-step window. The **Fusion Engine** (Member 4) consumes this endpoint
alongside the Edge-Enhanced GraphSAGE (Member 1) and Stratified VAE (Member 2)
endpoints.

The cross-component join key is `composite_id = "{nameOrig}_{step}"`.

---

## 📜 License

This repository is part of an academic research project. All rights reserved.
