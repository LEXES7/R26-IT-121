#!/usr/bin/env python
"""Fit and persist one score calibrator per stratum.

    python scripts/export_calibrators.py
    python scripts/export_calibrators.py --feature-set FS-ORIGIN

The training pipeline emits an unbounded composite z-score. The fusion engine
clamps to [0, 1], so without this step every flagged transaction reaches it as
exactly 1.0 and the model's ranking is thrown away at the boundary.

Isotonic regression is fitted on the **validation** partition — labelled, and
disjoint from both the fitting slice and the test partition, so nothing here
touches test data. The stored decision threshold is mapped through the same
transform so it stays comparable, and the risk bands are derived from it.

Writes calibrator.pkl and calibration.json into each bundle directory.
No model is retrained and no existing bundle file is modified.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from sklearn.metrics import average_precision_score, roc_auc_score      # noqa: E402

from vae_dsaa.inference import calibration                             # noqa: E402
from vae_dsaa.models.train import load_arrays                          # noqa: E402
from vae_dsaa.utils.persistence import load_bundle                     # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
STRATA = ["TRANSFER", "CASH_OUT", "PAYMENT", "GLOBAL"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--feature-set", default="FS-ORIGIN")
    ap.add_argument("--protocol", default="clean")
    a = ap.parse_args()

    out = {}
    for stratum in STRATA:
        d = MODELS / f"{a.protocol}__{a.feature_set}__{stratum}"
        if not d.exists():
            print(f"  SKIP {stratum}: no bundle at {d}")
            continue

        pred = load_bundle(d)
        X, y, _fit, val, test = load_arrays(DATA, stratum, a.feature_set)
        raw_val = pred.score(X[val])
        y_val = y[val]
        raw_thr = pred.thresholds["f1_optimal"]

        cal = calibration.fit(stratum, raw_val, y_val, raw_thr)

        # Monotonicity is the property that makes this safe: prove it on test
        # rather than asserting it. Rank-based metrics must not move.
        raw_test = pred.score(X[test])
        cal_test = cal.transform(raw_test)
        y_test = y[test]
        if y_test.sum() > 0:
            cal.ece_test = calibration.expected_calibration_error(cal_test, y_test)
        cal.save(d)
        line = {
            "stratum": stratum,
            "method": cal.method,
            "raw_threshold": round(float(raw_thr), 4),
            "calibrated_threshold": round(cal.calibrated_threshold, 6),
            "risk_bands": cal.risk_bands,
            "ece_validation_in_sample": None if cal.ece is None else round(cal.ece, 6),
            "ece_test_out_of_sample": None if cal.ece_test is None else round(cal.ece_test, 6),
            "n_val_rows": cal.n_val_rows,
            "n_val_fraud": cal.n_val_fraud,
        }
        if y_test.sum() > 0:
            line["auc_pr_raw"] = round(float(average_precision_score(y_test, raw_test)), 6)
            line["auc_pr_calibrated"] = round(float(average_precision_score(y_test, cal_test)), 6)
            line["auc_roc_raw"] = round(float(roc_auc_score(y_test, raw_test)), 6)
            line["auc_roc_calibrated"] = round(float(roc_auc_score(y_test, cal_test)), 6)
            line["flags_raw"] = int((raw_test >= raw_thr).sum())
            line["flags_calibrated"] = int((cal_test >= cal.calibrated_threshold).sum())
        line["raw_score_range_test"] = [round(float(raw_test.min()), 4),
                                        round(float(raw_test.max()), 4)]
        line["calibrated_range_test"] = [round(float(cal_test.min()), 6),
                                         round(float(cal_test.max()), 6)]
        out[stratum] = line

        ap_ok = ("n/a" if "auc_pr_raw" not in line else
                 ("PRESERVED" if abs(line["auc_pr_raw"] - line["auc_pr_calibrated"]) < 1e-6
                  else f"MOVED {line['auc_pr_calibrated'] - line['auc_pr_raw']:+.4f}"))
        print(f"  {stratum:9s} {cal.method:20s} thr {raw_thr:8.4f} -> "
              f"{cal.calibrated_threshold:.6f} | ECE(test) "
              f"{'n/a' if cal.ece_test is None else f'{cal.ece_test:.4f}'} | "
              f"raw [{raw_test.min():.2f}, {raw_test.max():.2f}] -> "
              f"[{cal_test.min():.4f}, {cal_test.max():.4f}] | AUC-PR {ap_ok}")

    rep = ROOT / "reports" / "v4" / "calibration_report.json"
    rep.write_text(json.dumps({
        "feature_set": a.feature_set, "protocol": a.protocol, "strata": out,
        "note": ("Calibration is monotone. Compare auc_pr_raw with "
                 "auc_pr_calibrated and auc_roc_raw with auc_roc_calibrated: "
                 "identical values are the evidence that ranking is preserved "
                 "and only the scale changed."),
    }, indent=2))
    print(f"\nwrote {rep}")


if __name__ == "__main__":
    main()
