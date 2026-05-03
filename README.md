# VAE-With-DSAA

**DeepSentinel — Behavioral Fraud Detection via Stratified VAE with Dual-Signal Anomaly Attribution**

Research ID: R26-IT-121
Author: Wijesinghe L P D B (IT22109194)
Institution: SLIIT

---

## Overview

This repository contains Member 2's component of the DeepSentinel platform — a Stratified Variational Autoencoder (VAE) with Dual-Signal Anomaly Attribution (DSAA) for unsupervised behavioral fraud detection on the PaySim dataset.

The component produces:
- A behavioral risk score per transaction
- A 16-dimensional anomaly fingerprint (per-feature reconstruction error + per-latent KL divergence)
- A predicted fraud typology via DBSCAN clustering of fingerprints

These outputs feed into Member 4's fusion engine and RAG-LLM explanation module.

---

## Project Status

🚧 **Work in progress** — research is ongoing.

| Stage | Status |
|---|---|
| Feature Engineering (F1–F8) | Done |
| EDA | Done |
| Global VAE Baseline (Config A) | Done |
| Stratified VAE (Configs B/C/D) | First run done — under improvement |
| Hyperparameter Tuning | Pending |
| DSAA Framework | Pending |
| Ablation Study | Pending |
| FastAPI Integration | Pending |

---

## Folder Structure

```
VAE-With-DSAA/
├── configs/              # YAML hyperparameter config
├── data/                 # raw + processed data (gitignored)
├── models/               # trained model artifacts (gitignored)
├── notebooks/            # main research notebooks (run in Colab)
│   ├── 01_Feature_Engineering.ipynb
│   ├── 02_EDA.ipynb
│   ├── 03_Global_VAE_Baseline.ipynb
│   └── 04_Stratified_VAE.ipynb
├── results/              # metrics, plots (gitignored)
├── requirements.txt
└── README.md
```

---

## How to Run

Notebooks are designed for Google Colab with mounted Drive.

```bash
pip install -r requirements.txt
```

Open notebooks in Colab and run cells in order (01 → 02 → 03 → 04).

---

## Dataset

PaySim mobile money simulation — 6.3M transactions, 8,213 fraud cases.
Source: `kaggle/ealaxi/paysim1`
