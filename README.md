# R26-IT-121

**DeepSentinel — AI-Powered Financial Fraud Detection Platform**

---

## Member 2 — VAE-With-DSAA

**Behavioral Fraud Detection via Stratified VAE with Dual-Signal Anomaly Attribution**

Author: Wijesinghe L P D B (IT22109194)
Institution: SLIIT

### Overview

Stratified Variational Autoencoder (VAE) with Dual-Signal Anomaly Attribution (DSAA) for unsupervised behavioral fraud detection on the PaySim dataset. Produces a behavioral risk score, 16-dimensional anomaly fingerprint, and fraud typology for each transaction. Outputs feed into the DeepSentinel fusion engine (Member 4).

### Project Status

🚧 Work in progress

| Stage | Status |
|---|---|
| Feature Engineering | Done |
| EDA | Done |
| Global VAE Baseline (Config A) | Done |
| Stratified VAE (Configs B/C/D) | In progress |
| Hyperparameter Tuning | Pending |
| DSAA Framework | Pending |
| Ablation Study | Pending |
| FastAPI Integration | Pending |

### Folder Structure

```
VAE-With-DSAA/
├── configs/              # YAML hyperparameter config
├── data/                 # raw + processed data (gitignored)
├── models/               # trained model artifacts (gitignored)
├── notebooks/            # research notebooks (run in Google Colab)
│   ├── 01_Feature_Engineering.ipynb
│   ├── 02_EDA.ipynb
│   ├── 03_Global_VAE_Baseline.ipynb
│   └── 04_Stratified_VAE.ipynb
├── results/              # metrics and plots (gitignored)
└── requirements.txt
```

### How to Run

Notebooks are designed for Google Colab with mounted Google Drive.

```bash
pip install -r requirements.txt
```

Run notebooks in order: 01 → 02 → 03 → 04.

### Dataset

PaySim mobile money simulation — 6.3M transactions, 8,213 fraud cases.
Source: `kaggle/ealaxi/paysim1`
