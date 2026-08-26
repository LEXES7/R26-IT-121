#!/usr/bin/env python
"""Leaky-protocol control, re-run on the current deterministic code path.

This reproduces the v3 evaluation protocol *deliberately*, leakage and all, so
that the effect of correcting the protocol can be measured with framework,
feature set and scoring path held constant.

What is preserved from v3 (the leakage — this is the point of the control):
  * the MinMax scaler is fitted on ALL non-fraud rows, including rows that later
    appear in the evaluation set
  * the VAE is trained on a random 80% of those same rows
  * the evaluation set is the FULL dataset, so every negative in it was seen
    during training
  * the decision threshold is tuned on a random 30% of the evaluation scores

What differs from the original leaky run:
  * scoring decodes the posterior mean instead of sampling, so the metrics are
    reproducible. Nothing else.

Feature set is the original 13 features with the ORIGINAL whole-dataset F8
percentile, matching what v3 actually consumed.

    python scripts/run_leaky_control.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.data import features as F                              # noqa: E402
from vae_dsaa.inference.scorer import MinMax, fit_scorer, score      # noqa: E402
from vae_dsaa.models.train import (ANNEAL_EPOCHS, ARCH, BETA_MAX,    # noqa: E402
                                   FREE_BITS, SPLIT_STEP,
                                   best_threshold, evaluate)
from vae_dsaa.models.vae import train_vae                            # noqa: E402
from vae_dsaa.utils.persistence import save_bundle                   # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
REPORTS = ROOT / "reports" / "v4"
STRATA = ["TRANSFER", "CASH_OUT", "PAYMENT"]
FEATURE_SET = "FS13old"       # 13 features, original whole-dataset F8


def log(*a):
    print(" ".join(str(x) for x in a), flush=True)


def build_matrix(stratum):
    """13 features with the ORIGINAL F8 column, as v3 consumed them."""
    d = np.load(DATA / f"{stratum}.npz")
    X = d["X13"].copy()
    X[:, F.COLS13.index("F8_is_large")] = d["f8_old"]
    return X, d["y"].astype(np.int64)


def run(stratum, seed=42):
    X, y = build_matrix(stratum)
    normal = y == 0

    # --- LEAK 1: scaler fitted on all non-fraud rows, evaluation included ---
    scaler = MinMax().fit(X[normal])
    Xn = scaler.transform(X[normal])

    # --- LEAK 2: VAE trained on a random 80% of those same rows ------------
    rng = np.random.RandomState(seed)
    perm = rng.permutation(len(Xn))
    cut = int(0.8 * len(Xn))
    Xf, Xv = Xn[perm[:cut]], Xn[perm[cut:]]

    log(f"  [leaky|{FEATURE_SET}|{stratum}] fit {len(Xf):,} normals | "
        f"eval {len(X):,} rows ({int(y.sum()):,} fraud) "
        f"-- eval CONTAINS the training rows")
    model, hist = train_vae(Xf, Xv, ARCH[stratum], free_bits=FREE_BITS,
                            beta_max=BETA_MAX, anneal_epochs=ANNEAL_EPOCHS,
                            seed=seed, log=log)

    stats = fit_scorer(model, Xv, seed=seed)

    # --- LEAK 3: evaluation set is the full dataset ------------------------
    s_all = score(model, scaler.transform(X), stats)      # deterministic now

    # --- LEAK 4: threshold tuned on a random 30% of the evaluation scores --
    n = len(y)
    ridx = np.random.RandomState(42).permutation(n)
    tune, test = ridx[:int(0.3 * n)], ridx[int(0.3 * n):]
    y_tune, s_tune = y[tune], s_all[tune]
    y_test, s_test = y[test], s_all[test]

    if y_tune.sum() > 0:
        t1 = best_threshold(y_tune, s_tune, 1.0)
        t2 = best_threshold(y_tune, s_tune, 2.0)
        sel = "random 30% of the evaluation scores, F-beta optimal"
    else:
        t1 = t2 = float(np.quantile(s_tune, 0.999))
        sel = "random 30% of the evaluation scores, 0.999 quantile"

    key = f"leaky|{FEATURE_SET}|{stratum}"
    m = evaluate(key, y_test, s_test, t1, t2, FEATURE_SET, X.shape[1])
    m["train"] = hist
    m["threshold_source"] = sel
    m["protocol_note"] = (
        "LEAKY CONTROL. Scaler and VAE fitted on all non-fraud rows; the "
        "evaluation set contains those same rows; threshold tuned on a random "
        "30% of evaluation scores. Reproduces the v3 protocol deliberately. "
        "Scoring is deterministic (posterior mean), unlike the original run.")
    m["deterministic_scoring"] = True

    bundle = save_bundle(
        MODELS, "leaky", FEATURE_SET, stratum,
        model=model, scaler=scaler,
        kmeans_centers=np.asarray(stats["cluster_centers"]), stats=stats,
        thresholds={"f1_optimal": t1, "f2_optimal": t2, "selection_set": sel},
        features=F.COLS13, arch=ARCH[stratum], free_bits=FREE_BITS,
        beta_max=BETA_MAX, anneal_epochs=ANNEAL_EPOCHS, split_step=SPLIT_STEP,
        train_history=hist,
        extra={"protocol": "leaky", "f8_variant": "original whole-dataset percentile",
               "seed": seed})
    m["bundle"] = str(bundle)
    return m


def main():
    t0 = time.time()
    REPORTS.mkdir(parents=True, exist_ok=True)
    results = {}
    for st in STRATA:
        log(f"\n=== {st} ===")
        m = run(st)
        results[m["config"]] = m
        ap = m["auc_pr_average_precision"]
        lift = m["ap_lift_over_base_rate"]
        log(f"    AP={ap if ap is None else round(ap, 4)} "
            f"lift={lift if lift is None else round(lift, 2)} "
            f"AUROC={m['auc_roc'] if m['auc_roc'] is None else round(m['auc_roc'], 4)} "
            f"F1={m['operating_point_f1_optimal']['f1']:.4f} "
            f"base={m['test_fraud_rate']:.5f}")
        (REPORTS / (m["config"].replace("|", "__") + ".json")).write_text(
            json.dumps(m, indent=2))

    combined = REPORTS / "all_configs_v4.json"
    prev = json.loads(combined.read_text()) if combined.exists() else {}
    prev.update(results)
    combined.write_text(json.dumps(prev, indent=2))
    log(f"\nDONE {len(results)} leaky configs in {time.time()-t0:.0f}s")
    log(f"merged into {combined}")


if __name__ == "__main__":
    main()
