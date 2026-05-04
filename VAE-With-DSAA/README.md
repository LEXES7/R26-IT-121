# DeepSentinel — VAE with DSAA

AI-powered financial fraud detection using Variational Autoencoders (VAE) and Dynamic Stratified Anomaly Aggregation (DSAA).

> **Status:** Under active development

## Overview

This project explores unsupervised anomaly detection for financial transactions. The approach uses a stratified VAE architecture where separate encoders are trained per transaction type (CASH_OUT, TRANSFER, PAYMENT), combined with a DSAA framework for final fraud scoring.

## Structure

```
notebooks/          # Step-by-step experiments (01–04)
configs/            # Model hyperparameters
DeepSentinel_*.py   # Core pipeline scripts
DeepSentinel-VAE-Results/  # Saved outputs and trained models
data/               # Raw and processed data (not committed)
```

## Pipeline

1. Feature Engineering
2. EDA & Stratification Analysis
3. Global VAE Baseline
4. Stratified VAE + DSAA Framework

## Requirements

```bash
pip install -r requirements.txt
```

## Team

Research project — R26-IT-121
