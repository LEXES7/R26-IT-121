"""
Generic feature-subset ablation runner (clean chronological protocol).

Feature sets are specified by NAME so the balance / time / velocity groupings
stay readable and auditable.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score

sys.path.insert(0, str(Path(__file__).parent))
from vae_v4 import MinMax, fit_scorer, score, train_vae      # noqa: E402
from run_v4 import ARCH, best_threshold, metrics_at, prec_at_k   # noqa: E402

V4 = Path(r"D:\Research\VAE-With-DSAA\results\v4")

# column order written by prep_v4.py
COLS13 = ["F1_log_amount", "F2_amount_balance_ratio", "F3_balance_consistency",
          "F4_balance_change_ratio", "F5_dest_balance_ratio", "F6_hour",
          "F7_day", "F8_is_large", "F9_dest_starts_empty", "F10_recipient_emptied",
          "F11_account_velocity", "F12_round_amount", "F13_zero_dest_history"]
COLS12 = [c for c in COLS13 if c != "F11_account_velocity"]

# derived from any of oldbalanceOrg / newbalanceOrig / oldbalanceDest / newbalanceDest
BALANCE = {"F2_amount_balance_ratio", "F3_balance_consistency",
           "F4_balance_change_ratio", "F5_dest_balance_ratio",
           "F9_dest_starts_empty", "F10_recipient_emptied",
           "F13_zero_dest_history"}
TIME = {"F6_hour", "F7_day"}

SETS = {
    "FS12":            [c for c in COLS12],
    "FS11":            [c for c in COLS12 if c != "F7_day"],
    "FS12_nobalance":  [c for c in COLS12 if c not in BALANCE],
    "FS11_nobalance":  [c for c in COLS12 if c != "F7_day" and c not in BALANCE],
}


def load(stratum):
    return np.load(V4 / "data" / f"{stratum}.npz")


def subset(d, names):
    idx = [COLS12.index(n) for n in names]
    return d["X12"][:, idx]


def run(stratum, names, tag, log=print):
    d = load(stratum)
    X = subset(d, names)
    y = d["y"].astype(np.int64)
    fit, val, test = d["is_fit"], d["is_val"], d["is_test"]
    fit_n, val_n = fit & (y == 0), val & (y == 0)

    sc = MinMax().fit(X[fit_n])
    log(f"  [{tag}|{stratum}] {len(names)} features: {', '.join(n.split('_')[0] for n in names)}")
    model, hist = train_vae(sc.transform(X[fit_n]), sc.transform(X[val_n]),
                            ARCH[stratum], log=log)
    st = fit_scorer(model, sc.transform(X[val_n]))
    s_val = score(model, sc.transform(X[val]), st)
    s_test = score(model, sc.transform(X[test]), st)
    yv, yt = y[val], y[test]
    t1 = best_threshold(yv, s_val, 1.0) if yv.sum() else float(np.quantile(s_val, 0.999))
    t2 = best_threshold(yv, s_val, 2.0) if yv.sum() else t1
    return summarise(f"{tag}|{stratum}", yt, s_test, t1, t2, names, hist)


def summarise(name, y, s, t1, t2, names, hist=None):
    base = float(y.mean())
    ap = float(average_precision_score(y, s)) if y.sum() else None
    return {
        "config": name, "n_features": len(names), "features": names,
        "n_rows": int(len(y)), "n_fraud": int(y.sum()), "test_fraud_rate": base,
        "auc_pr_average_precision": ap,
        "ap_lift_over_base_rate": (ap / base) if (ap and base) else None,
        "max_possible_ap_lift": (1.0 / base) if base else None,
        "auc_roc": float(roc_auc_score(y, s)) if 0 < y.sum() < len(y) else None,
        "precision_at_500": prec_at_k(y, s, 500),
        "precision_at_1000": prec_at_k(y, s, 1000),
        "operating_point_f1_optimal": metrics_at(y, s, t1),
        "operating_point_f2_optimal": metrics_at(y, s, t2),
        "train": hist,
    }


def trivial_baseline(stratum):
    """No VAE. Score = 1 - F3_balance_consistency (1 when balances fail to reconcile)."""
    d = load(stratum)
    y = d["y"].astype(np.int64)
    test = d["is_test"]
    f3 = d["X12"][:, COLS12.index("F3_balance_consistency")]
    s = (1.0 - f3).astype(np.float64)
    yt, st = y[test], s[test]
    return summarise(f"trivial_F3_rule|{stratum}", yt, st, 0.5, 0.5,
                     ["F3_balance_consistency"])


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "fast"
    out, t0 = {}, time.time()

    if which == "fast":
        jobs = [("FS12_nobalance", s) for s in ["TRANSFER", "CASH_OUT"]]
    else:
        jobs = [("FS11", s) for s in ["TRANSFER", "CASH_OUT", "PAYMENT"]] + \
               [("FS11_nobalance", s) for s in ["TRANSFER", "CASH_OUT"]]

    for tag, stratum in jobs:
        print(f"\n=== {tag} / {stratum} ===", flush=True)
        r = run(stratum, SETS[tag], tag)
        out[r["config"]] = r
        print(f"  AP={r['auc_pr_average_precision']:.4f} "
              f"lift={r['ap_lift_over_base_rate']:.1f}x/{r['max_possible_ap_lift']:.1f}x "
              f"P@1000={r['precision_at_1000']:.3f} "
              f"F1={r['operating_point_f1_optimal']['f1']:.4f}", flush=True)

    for stratum in ["TRANSFER", "CASH_OUT"]:
        r = trivial_baseline(stratum)
        out[r["config"]] = r
        print(f"\n=== trivial F3 rule / {stratum} ===")
        print(f"  AP={r['auc_pr_average_precision']:.4f} "
              f"lift={r['ap_lift_over_base_rate']:.1f}x "
              f"P@1000={r['precision_at_1000']:.3f} "
              f"F1={r['operating_point_f1_optimal']['f1']:.4f}", flush=True)

    p = V4 / "metrics" / f"ablation_{which}.json"
    p.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {p}  ({time.time()-t0:.1f}s)")
