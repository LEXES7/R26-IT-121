"""Training orchestration for the clean chronological protocol.

Every configuration trained here persists a complete bundle, so no result is
reachable only from memory.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from sklearn.metrics import (average_precision_score, precision_recall_curve,
                             roc_auc_score)

from vae_dsaa.data import features as F
from vae_dsaa.inference.scorer import MinMax, fit_scorer, score
from vae_dsaa.models.vae import train_vae
from vae_dsaa.utils.persistence import save_bundle

ARCH = {
    "TRANSFER": {"h1": 32, "h2": 16, "latent": 8},
    "CASH_OUT": {"h1": 64, "h2": 32, "latent": 16},
    "PAYMENT": {"h1": 32, "h2": 16, "latent": 8},
    "GLOBAL": {"h1": 32, "h2": 16, "latent": 8},
}
STRATA = ["TRANSFER", "CASH_OUT", "PAYMENT"]
SPLIT_STEP = 595
FREE_BITS = 0.1
BETA_MAX = 0.05
ANNEAL_EPOCHS = 10


# ------------------------------------------------------------------ metrics
def metrics_at(y, s, thr):
    pred = s >= thr
    tp = int((pred & (y == 1)).sum()); fp = int((pred & (y == 0)).sum())
    fn = int((~pred & (y == 1)).sum()); tn = int((~pred & (y == 0)).sum())
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return {"threshold": float(thr), "precision": p, "recall": r,
            "f1": 2 * p * r / (p + r) if p + r else 0.0,
            "f2": 5 * p * r / (4 * p + r) if 4 * p + r else 0.0,
            "tp": tp, "fp": fp, "tn": tn, "fn": fn,
            "fpr": fp / (fp + tn) if fp + tn else 0.0,
            "flag_rate": float(pred.mean())}


def best_threshold(y, s, beta):
    p, r, t = precision_recall_curve(y, s)
    b2 = beta ** 2
    f = (1 + b2) * p * r / (b2 * p + r + 1e-12)
    return float(t[int(np.nanargmax(f[:-1]))])


def prec_at_k(y, s, k):
    k = min(k, len(s))
    return float(y[np.argpartition(-s, k - 1)[:k]].sum()) / k


def evaluate(name, y, s, thr_f1, thr_f2, feature_set, n_features):
    base = float(y.mean())
    ap = float(average_precision_score(y, s)) if y.sum() else None
    return {
        "config": name, "feature_set": feature_set, "n_features": n_features,
        "n_rows": int(len(y)), "n_fraud": int(y.sum()), "test_fraud_rate": base,
        "auc_pr_average_precision": ap,
        "ap_lift_over_base_rate": (ap / base) if (ap and base) else None,
        "max_possible_ap_lift": (1.0 / base) if base else None,
        "auc_roc": float(roc_auc_score(y, s)) if 0 < y.sum() < len(y) else None,
        "precision_at_500": prec_at_k(y, s, 500),
        "precision_at_1000": prec_at_k(y, s, 1000),
        "operating_point_f1_optimal": metrics_at(y, s, thr_f1),
        "operating_point_f2_optimal": metrics_at(y, s, thr_f2),
    }


# --------------------------------------------------------------------- data
def load_arrays(data_dir: Path, stratum: str, feature_set: str):
    """Return (X, y, fit_mask, val_mask, test_mask) for one stratum."""
    if stratum == "GLOBAL":
        Xs, ys, f, v, t = [], [], [], [], []
        for s in STRATA:
            X, y, fm, vm, tm = load_arrays(data_dir, s, feature_set)
            Xs.append(X); ys.append(y); f.append(fm); v.append(vm); t.append(tm)
        return (np.vstack(Xs), np.concatenate(ys), np.concatenate(f),
                np.concatenate(v), np.concatenate(t))

    d = np.load(Path(data_dir) / f"{stratum}.npz")
    key, idx = F.indices(feature_set)
    return (d[key][:, idx], d["y"].astype(np.int64),
            d["is_fit"], d["is_val"], d["is_test"])


# ----------------------------------------------------------------- training
def train_one(data_dir, models_dir, stratum, feature_set, *, protocol="clean",
              seed=42, log=print):
    """Train one configuration, persist its bundle, return its metrics."""
    cols = F.columns(feature_set)
    X, y, fit, val, test = load_arrays(data_dir, stratum, feature_set)
    fit_n, val_n = fit & (y == 0), val & (y == 0)

    scaler = MinMax().fit(X[fit_n])
    log(f"  [{protocol}|{feature_set}|{stratum}] {len(cols)} features | "
        f"fit {int(fit_n.sum()):,} | val {int(val_n.sum()):,} | "
        f"test {int(test.sum()):,} ({int(y[test].sum()):,} fraud)")

    model, hist = train_vae(scaler.transform(X[fit_n]), scaler.transform(X[val_n]),
                            ARCH[stratum], free_bits=FREE_BITS, beta_max=BETA_MAX,
                            anneal_epochs=ANNEAL_EPOCHS, seed=seed, log=log)

    stats = fit_scorer(model, scaler.transform(X[val_n]), seed=seed)
    s_val = score(model, scaler.transform(X[val]), stats)
    s_test = score(model, scaler.transform(X[test]), stats)
    yv, yt = y[val], y[test]

    if yv.sum() > 0:
        t1, t2 = best_threshold(yv, s_val, 1.0), best_threshold(yv, s_val, 2.0)
        sel = "validation partition, F-beta optimal"
    else:                       # PAYMENT: no labels anywhere -> false-alarm budget
        t1 = t2 = float(np.quantile(s_val, 0.999))
        sel = "validation partition, 0.999 quantile false-alarm budget"

    name = f"{protocol}|{feature_set}|{stratum}"
    m = evaluate(name, yt, s_test, t1, t2, feature_set, len(cols))
    m["train"] = hist
    m["threshold_source"] = sel
    if yt.sum() == 0:
        m["payment_control"] = _payment_control(s_val, s_test)

    bundle = save_bundle(
        models_dir, protocol, feature_set, stratum,
        model=model, scaler=scaler, kmeans_centers=np.asarray(stats["cluster_centers"]),
        stats=stats, thresholds={"f1_optimal": t1, "f2_optimal": t2,
                                 "selection_set": sel},
        features=cols, arch=ARCH[stratum], free_bits=FREE_BITS,
        beta_max=BETA_MAX, anneal_epochs=ANNEAL_EPOCHS, split_step=SPLIT_STEP,
        train_history=hist, extra={"provenance": F.describe(feature_set),
                                   "seed": seed},
    )
    m["bundle"] = str(bundle)
    return m


def _payment_control(s_val, s_test):
    q = float(np.quantile(s_val, 0.999))
    old = float(s_val.mean() + 3 * s_val.std())
    return {
        "rule_new_quantile_0.999": {"threshold": q,
                                    "false_positives": int((s_test >= q).sum()),
                                    "fp_rate": float((s_test >= q).mean())},
        "rule_old_mean_plus_3std": {"threshold": old,
                                    "false_positives": int((s_test >= old).sum()),
                                    "fp_rate": float((s_test >= old).mean())},
        "test_rows": int(len(s_test)),
    }
