"""
v4 run driver — trains every configuration and writes metrics under results/v4/.

Run matrix
    clean / FS12      GLOBAL, TRANSFER, CASH_OUT, PAYMENT   <- main pipeline
    clean / FS13      TRANSFER, CASH_OUT, PAYMENT           <- F11 ablation
    clean / FS11      TRANSFER, CASH_OUT, PAYMENT           <- F7_day diagnostic
    leaky / FS13old   TRANSFER, CASH_OUT, PAYMENT           <- v3 protocol reproduction

Nothing under v3 is read for writing or modified.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.metrics import (average_precision_score, precision_recall_curve,
                             roc_auc_score)

sys.path.insert(0, str(Path(__file__).parent))
from vae_v4 import MinMax, fit_scorer, score, train_vae  # noqa: E402

ROOT = Path(r"D:\Research\VAE-With-DSAA")
V4 = ROOT / "results" / "v4"
for d in ["metrics", "figures", "logs", "curves"]:
    (V4 / d).mkdir(parents=True, exist_ok=True)

ARCH = {
    "TRANSFER": {"h1": 32, "h2": 16, "latent": 8},
    "CASH_OUT": {"h1": 64, "h2": 32, "latent": 16},
    "PAYMENT":  {"h1": 32, "h2": 16, "latent": 8},
    "GLOBAL":   {"h1": 32, "h2": 16, "latent": 8},
}
STRATA = ["TRANSFER", "CASH_OUT", "PAYMENT"]
F7_IDX_IN_12 = 6      # F7_day position in the 12-feature set
F8_IDX_IN_13 = 7
LOG = open(V4 / "logs" / "run_v4.log", "w", encoding="utf-8")


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.write(s + "\n"); LOG.flush()


# --------------------------------------------------------------------------
def load(stratum):
    return np.load(V4 / "data" / f"{stratum}.npz")


def features(d, fs):
    if fs == "FS13":
        return d["X13"]
    if fs == "FS12":
        return d["X12"]
    if fs == "FS11":
        return np.delete(d["X12"], F7_IDX_IN_12, axis=1)
    if fs == "FS13old":
        X = d["X13"].copy()
        X[:, F8_IDX_IN_13] = d["f8_old"]
        return X
    raise ValueError(fs)


# --------------------------------------------------------------------------
def metrics_at(y, s, thr):
    pred = s >= thr
    tp = int((pred & (y == 1)).sum()); fp = int((pred & (y == 0)).sum())
    fn = int((~pred & (y == 1)).sum()); tn = int((~pred & (y == 0)).sum())
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    f2 = 5 * p * r / (4 * p + r) if 4 * p + r else 0.0
    return {"threshold": float(thr), "precision": p, "recall": r,
            "f1": f1, "f2": f2, "tp": tp, "fp": fp, "tn": tn, "fn": fn,
            "fpr": fp / (fp + tn) if fp + tn else 0.0,
            "flag_rate": float(pred.mean())}


def best_threshold(y, s, beta):
    p, r, t = precision_recall_curve(y, s)
    b2 = beta ** 2
    f = (1 + b2) * p * r / (b2 * p + r + 1e-12)
    i = int(np.nanargmax(f[:-1]))
    return float(t[i])


def prec_at_k(y, s, k):
    k = min(k, len(s))
    idx = np.argpartition(-s, k - 1)[:k]
    return float(y[idx].sum()) / k


def evaluate(name, y, s, thr_f1, thr_f2, fraud_rate_note=""):
    out = {
        "config": name,
        "n_rows": int(len(y)),
        "n_fraud": int(y.sum()),
        "test_fraud_rate": float(y.mean()),
        "auc_pr_average_precision": float(average_precision_score(y, s)) if y.sum() else None,
        "auc_roc": float(roc_auc_score(y, s)) if 0 < y.sum() < len(y) else None,
        "precision_at_500": prec_at_k(y, s, 500),
        "precision_at_1000": prec_at_k(y, s, 1000),
        "operating_point_f2_optimal": metrics_at(y, s, thr_f2),
        "operating_point_f1_optimal": metrics_at(y, s, thr_f1),
        "note": fraud_rate_note,
    }
    return out


# --------------------------------------------------------------------------
def run_clean(stratum, fs, seed=42):
    d = load(stratum)
    X = features(d, fs); y = d["y"].astype(np.int64)
    fit, val, test = d["is_fit"], d["is_val"], d["is_test"]

    fit_n = fit & (y == 0)          # model fitted on FIT-partition NORMALS only
    val_n = val & (y == 0)

    sc = MinMax().fit(X[fit_n])     # scaler fitted on the same rows only
    Xf, Xv = sc.transform(X[fit_n]), sc.transform(X[val_n])

    log(f"    fit {int(fit_n.sum()):,} normals | val {int(val_n.sum()):,} normals "
        f"| test {int(test.sum()):,} rows ({int(y[test].sum()):,} fraud)")
    model, hist = train_vae(Xf, Xv, ARCH[stratum], seed=seed, log=log)

    st = fit_scorer(model, Xv, seed=seed)                 # kmeans on VAL normals
    s_val = score(model, sc.transform(X[val]), st)        # threshold selection set
    s_test = score(model, sc.transform(X[test]), st)      # touched once, at the end
    return {"y_val": y[val], "s_val": s_val, "y_test": y[test], "s_test": s_test,
            "hist": hist, "stats": st}


def run_leaky(stratum, fs, seed=42):
    """Reproduces v3: scaler and VAE fitted on ALL normals; eval set contains them."""
    d = load(stratum)
    X = features(d, fs); y = d["y"].astype(np.int64)
    normal = y == 0

    sc = MinMax().fit(X[normal])                 # fitted on train AND eval rows
    Xn = sc.transform(X[normal])
    rng = np.random.RandomState(seed)
    perm = rng.permutation(len(Xn)); cut = int(0.8 * len(Xn))
    Xf, Xv = Xn[perm[:cut]], Xn[perm[cut:]]

    log(f"    [leaky] fit {len(Xf):,} normals | eval {len(X):,} rows "
        f"({int(y.sum()):,} fraud) -- eval CONTAINS the training rows")
    model, hist = train_vae(Xf, Xv, ARCH[stratum], seed=seed, log=log)

    st = fit_scorer(model, Xv, seed=seed)
    s_eval = score(model, sc.transform(X), st)

    n = len(y); ridx = np.random.RandomState(42).permutation(n)
    tune, test = ridx[:int(0.3 * n)], ridx[int(0.3 * n):]
    return {"y_val": y[tune], "s_val": s_eval[tune],
            "y_test": y[test], "s_test": s_eval[test],
            "hist": hist, "stats": st}


# --------------------------------------------------------------------------
def main():
    t0 = time.time()
    results, curves = {}, {}

    matrix = ([("clean", "FS12", s) for s in ["GLOBAL"] + STRATA]
              + [("clean", "FS13", s) for s in STRATA]
              + [("clean", "FS11", s) for s in STRATA]
              + [("leaky", "FS13old", s) for s in STRATA])

    for proto, fs, stratum in matrix:
        key = f"{proto}|{fs}|{stratum}"
        log(f"\n[{key}]")
        try:
            if stratum == "GLOBAL":
                r = run_global(fs)
            else:
                r = run_clean(stratum, fs) if proto == "clean" else run_leaky(stratum, fs)
        except Exception as e:                                  # noqa: BLE001
            log(f"    FAILED: {type(e).__name__}: {e}")
            continue

        yv, sv, yt, stt = r["y_val"], r["s_val"], r["y_test"], r["s_test"]
        if yv.sum() > 0:
            t_f1, t_f2 = best_threshold(yv, sv, 1.0), best_threshold(yv, sv, 2.0)
        else:  # PAYMENT: no fraud anywhere -> false-alarm budget on the val slice
            t_f1 = t_f2 = float(np.quantile(sv, 0.999))
        m = evaluate(key, yt, stt, t_f1, t_f2)
        m["train"] = r["hist"]
        m["threshold_source"] = "validation partition" if proto == "clean" else "random 30% of eval"
        if yt.sum() == 0:
            m["payment_control"] = payment_control(sv, stt)
        results[key] = m
        curves[key] = (yt, stt)
        log(f"    AP={m['auc_pr_average_precision']} AUROC={m['auc_roc']} "
            f"F1*={m['operating_point_f1_optimal']['f1']:.4f} "
            f"F2op F1={m['operating_point_f2_optimal']['f1']:.4f}")
        (V4 / "metrics" / f"{key.replace('|','__')}.json").write_text(json.dumps(m, indent=2))

    np.savez_compressed(V4 / "curves" / "pr_inputs.npz",
                        **{k.replace("|", "__") + "__y": v[0] for k, v in curves.items()},
                        **{k.replace("|", "__") + "__s": v[1] for k, v in curves.items()})
    (V4 / "metrics" / "all_configs.json").write_text(json.dumps(results, indent=2))
    log(f"\nTOTAL {time.time()-t0:.1f}s -> {len(results)} configs")


def payment_control(s_val, s_test):
    """A3: quantile budget from the validation slice vs the old mean+3sigma rule."""
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


def run_global(fs):
    """Config A: one VAE and one threshold across all transaction types."""
    Xs, ys, fits, vals, tests = [], [], [], [], []
    for s in STRATA:
        d = load(s)
        Xs.append(features(d, fs)); ys.append(d["y"].astype(np.int64))
        fits.append(d["is_fit"]); vals.append(d["is_val"]); tests.append(d["is_test"])
    X = np.vstack(Xs); y = np.concatenate(ys)
    fit = np.concatenate(fits); val = np.concatenate(vals); test = np.concatenate(tests)
    del Xs, ys

    fit_n, val_n = fit & (y == 0), val & (y == 0)
    sc = MinMax().fit(X[fit_n])
    log(f"    fit {int(fit_n.sum()):,} normals | val {int(val_n.sum()):,} | "
        f"test {int(test.sum()):,} rows ({int(y[test].sum()):,} fraud)")
    model, hist = train_vae(sc.transform(X[fit_n]), sc.transform(X[val_n]),
                            ARCH["GLOBAL"], log=log)
    st = fit_scorer(model, sc.transform(X[val_n]))
    return {"y_val": y[val], "s_val": score(model, sc.transform(X[val]), st),
            "y_test": y[test], "s_test": score(model, sc.transform(X[test]), st),
            "hist": hist, "stats": st}


if __name__ == "__main__":
    main()
