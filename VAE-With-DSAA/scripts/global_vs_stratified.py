#!/usr/bin/env python
"""Does a per-type VAE beat the global VAE on its OWN stratum?

The A-D grid answers a pooled question: which configuration ranks the combined
TRANSFER + CASH_OUT population better. Contribution N1 claims something
narrower — that a model trained on one transaction type beats a single global
model *on that type*. That is a per-stratum question and the pooled grid cannot
answer it.

This scores the existing GLOBAL bundles on each stratum's test rows in
isolation, against the matching per-stratum bundle. No retraining.

    python scripts/global_vs_stratified.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.models.train import best_threshold, load_arrays, metrics_at, prec_at_k  # noqa: E402
from vae_dsaa.utils.persistence import load_bundle                                    # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
REPORTS = ROOT / "reports" / "v4"
PAIR = ["TRANSFER", "CASH_OUT"]


def score_on(bundle_dir, fs, stratum):
    pred = load_bundle(bundle_dir)
    X, y, _, val, test = load_arrays(DATA, stratum, fs)
    s_val, s_test = pred.score(X[val]), pred.score(X[test])
    yv, yt = y[val], y[test]
    t = best_threshold(yv, s_val, 1.0)
    base = float(yt.mean()); ap = float(average_precision_score(yt, s_test))
    return {
        "n_rows": int(len(yt)), "n_fraud": int(yt.sum()), "test_fraud_rate": base,
        "auc_pr_average_precision": ap, "ap_lift_over_base_rate": ap / base,
        "max_possible_ap_lift": 1.0 / base,
        "auc_roc": float(roc_auc_score(yt, s_test)),
        "precision_at_1000": prec_at_k(yt, s_test, 1000),
        "operating_point_f1_optimal": metrics_at(yt, s_test, t),
        "score_summary": {"mean": float(s_test.mean()), "std": float(s_test.std()),
                          "p50": float(np.quantile(s_test, 0.5)),
                          "p99.9": float(np.quantile(s_test, 0.999))},
    }


def main() -> None:
    out = {"question": ("Does a per-type VAE beat the global VAE on its own "
                        "stratum? Scored per stratum, no pooling, no retraining."),
           "feature_sets": {}}

    for fs in ["FS-ORIGIN", "FS-FULL"]:
        gdir = MODELS / f"clean__{fs}__GLOBAL"
        if not gdir.exists():
            continue
        block = {}
        print(f"\n{'='*74}\n{fs}\n{'='*74}")
        print(f"{'stratum':<10}{'model':<12}{'AUC-PR':>9}{'AP lift':>9}"
              f"{'ceiling':>9}{'AUC-ROC':>9}{'P@1000':>8}{'F1':>8}")
        print("-" * 74)
        for st in PAIR:
            g = score_on(gdir, fs, st)
            s = score_on(MODELS / f"clean__{fs}__{st}", fs, st)
            for lbl, m in [("global", g), ("stratified", s)]:
                print(f"{st:<10}{lbl:<12}{m['auc_pr_average_precision']:>9.4f}"
                      f"{m['ap_lift_over_base_rate']:>9.2f}"
                      f"{m['max_possible_ap_lift']:>9.2f}{m['auc_roc']:>9.4f}"
                      f"{m['precision_at_1000']:>8.3f}"
                      f"{m['operating_point_f1_optimal']['f1']:>8.4f}")
            d_ap = s["auc_pr_average_precision"] - g["auc_pr_average_precision"]
            d_lift = s["ap_lift_over_base_rate"] - g["ap_lift_over_base_rate"]
            d_f1 = (s["operating_point_f1_optimal"]["f1"]
                    - g["operating_point_f1_optimal"]["f1"])
            helps = d_ap > 0
            print(f"{'':<10}{'DELTA':<12}{d_ap:>+9.4f}{d_lift:>+9.2f}"
                  f"{'':>9}{s['auc_roc']-g['auc_roc']:>+9.4f}"
                  f"{s['precision_at_1000']-g['precision_at_1000']:>+8.3f}"
                  f"{d_f1:>+8.4f}   -> stratification "
                  f"{'HELPS' if helps else 'does NOT help'}")
            print()
            block[st] = {"global_model": g, "stratified_model": s,
                         "delta_auc_pr": d_ap, "delta_ap_lift": d_lift,
                         "delta_f1": d_f1,
                         "stratification_helps_on_this_stratum": bool(helps)}
        out["feature_sets"][fs] = block

    # ---- does the pooled grid disagree with the per-stratum result? --------
    allc = json.loads((REPORTS / "all_configs_v4.json").read_text())
    print(f"\n{'='*74}\nPOOLED versus PER-STRATUM\n{'='*74}")
    for fs, block in out["feature_sets"].items():
        a = allc.get(f"clean|{fs}|A_restricted_pair")
        d = allc.get(f"clean|{fs}|D_ensemble")
        if not (a and d):
            continue
        pooled_helps = d["auc_pr_average_precision"] > a["auc_pr_average_precision"]
        per_stratum = {st: block[st]["stratification_helps_on_this_stratum"]
                       for st in PAIR}
        disagree = pooled_helps != all(per_stratum.values())
        print(f"  {fs}")
        print(f"    pooled  A {a['auc_pr_average_precision']:.4f} -> "
              f"D {d['auc_pr_average_precision']:.4f}  "
              f"stratification {'helps' if pooled_helps else 'does NOT help'}")
        for st in PAIR:
            print(f"    {st:<9} stratification "
                  f"{'helps' if per_stratum[st] else 'does NOT help'} "
                  f"(dAP {block[st]['delta_auc_pr']:+.4f})")
        print(f"    -> pooled and per-stratum {'DISAGREE' if disagree else 'agree'}")
        out["feature_sets"][fs]["_pooled_comparison"] = {
            "pooled_A_auc_pr": a["auc_pr_average_precision"],
            "pooled_D_auc_pr": d["auc_pr_average_precision"],
            "pooled_says_stratification_helps": bool(pooled_helps),
            "per_stratum_says_stratification_helps": per_stratum,
            "pooled_disagrees_with_per_stratum": bool(disagree),
        }

    p = REPORTS / "global_vs_stratified.json"
    p.write_text(json.dumps(out, indent=2, default=float))
    print(f"\nwrote {p}")


if __name__ == "__main__":
    main()
