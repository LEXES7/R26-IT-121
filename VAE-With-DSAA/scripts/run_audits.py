#!/usr/bin/env python
"""Feature-support and error-budget audits.

(a) F6_hour pathology check — cyclic time should overlap across a time split
(b) full support audit — fit vs test min/max for every feature in a set
(c) F7_day error-budget decomposition — its share of reconstruction error on
    test rows, measured on a feature set that still contains it

    python scripts/run_audits.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.data import features as F                    # noqa: E402
from vae_dsaa.dsaa.signals import compute_signals          # noqa: E402
from vae_dsaa.models.train import load_arrays              # noqa: E402
from vae_dsaa.utils.persistence import load_bundle         # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
OUT = ROOT / "reports" / "v4"
STRATA = ["TRANSFER", "CASH_OUT", "PAYMENT"]


def support_audit(feature_set: str) -> dict:
    """Is the test range contained in the training range, per feature?"""
    res = {}
    for st in STRATA:
        X, y, fit, val, test = load_arrays(DATA, st, feature_set)
        cols = F.columns(feature_set)
        fit_rows = X[fit & (y == 0)]           # what the scaler/VAE actually saw
        test_rows = X[test]
        rows = []
        for i, c in enumerate(cols):
            fmin, fmax = float(fit_rows[:, i].min()), float(fit_rows[:, i].max())
            tmin, tmax = float(test_rows[:, i].min()), float(test_rows[:, i].max())
            contained = (tmin >= fmin) and (tmax <= fmax)
            # fraction of test rows outside the training range
            out = float(((test_rows[:, i] < fmin) | (test_rows[:, i] > fmax)).mean())
            rows.append({"feature": c, "fit_min": fmin, "fit_max": fmax,
                         "test_min": tmin, "test_max": tmax,
                         "test_within_fit_range": bool(contained),
                         "frac_test_outside": out,
                         "fully_outside": bool(tmin > fmax or tmax < fmin)})
        res[st] = rows
    return res


def error_budget(feature_set: str) -> dict:
    """Per-feature share of the reconstruction error budget on test rows."""
    res = {}
    for st in ["TRANSFER", "CASH_OUT", "PAYMENT"]:
        b = MODELS / f"clean__{feature_set}__{st}"
        if not b.exists():
            continue
        pred = load_bundle(b)
        X, y, _, _, test = load_arrays(DATA, st, feature_set)
        Xt = X[test]
        n = min(50_000, len(Xt))
        idx = np.random.RandomState(42).choice(len(Xt), n, replace=False)
        sig = compute_signals(pred, Xt[idx], with_signal_3=False)
        mean = sig["signal_1"].mean(axis=0)
        order = np.argsort(-mean)
        res[st] = {
            "n_sampled": int(n),
            "mean_signal_1_share": {sig["feature_names"][i]: round(float(mean[i]), 4)
                                    for i in order},
            "top_feature": sig["feature_names"][order[0]],
            "top_share": round(float(mean[order[0]]), 4),
        }
    return res


def main() -> None:
    report = {}

    # ---- (a) + (b) -----------------------------------------------------
    print("=" * 70)
    print("(a)+(b)  FEATURE SUPPORT AUDIT — FS-ORIGIN (primary)")
    print("=" * 70)
    sup = support_audit("FS-ORIGIN")
    report["support_audit_FS-ORIGIN"] = sup
    for st, rows in sup.items():
        print(f"\n  {st}")
        print(f"    {'feature':<26}{'fit range':>22}{'test range':>22}  {'outside':>8}  ok")
        for r in rows:
            ok = "OK" if r["test_within_fit_range"] else "OUT"
            print(f"    {r['feature']:<26}"
                  f"[{r['fit_min']:>8.4f},{r['fit_max']:>9.4f}]"
                  f"[{r['test_min']:>8.4f},{r['test_max']:>9.4f}]"
                  f"  {r['frac_test_outside']*100:>7.3f}%  {ok}")

    print("\n" + "=" * 70)
    print("(a)  F6_hour SPECIFICALLY — cyclic, expected to overlap")
    print("=" * 70)
    f6 = {}
    for st, rows in sup.items():
        r = next(x for x in rows if x["feature"] == "F6_hour")
        f6[st] = r
        print(f"  {st:<10} fit [{r['fit_min']:.4f}, {r['fit_max']:.4f}]  "
              f"test [{r['test_min']:.4f}, {r['test_max']:.4f}]  "
              f"contained={r['test_within_fit_range']}  "
              f"outside={r['frac_test_outside']*100:.3f}%")
    report["f6_hour_check"] = f6

    # F7_day for contrast — on a set that keeps it
    sup12 = support_audit("FS12")
    report["support_audit_FS12"] = sup12
    print("\n  F7_day, for contrast (from FS12):")
    f7 = {}
    for st, rows in sup12.items():
        r = next(x for x in rows if x["feature"] == "F7_day")
        f7[st] = r
        print(f"  {st:<10} fit [{r['fit_min']:.4f}, {r['fit_max']:.4f}]  "
              f"test [{r['test_min']:.4f}, {r['test_max']:.4f}]  "
              f"contained={r['test_within_fit_range']}  "
              f"outside={r['frac_test_outside']*100:.3f}%")
    report["f7_day_check"] = f7

    # ---- (c) -----------------------------------------------------------
    print("\n" + "=" * 70)
    print("(c)  RECONSTRUCTION ERROR BUDGET — FS12 (contains F7_day)")
    print("=" * 70)
    eb12 = error_budget("FS12")
    report["error_budget_FS12"] = eb12
    for st, r in eb12.items():
        print(f"\n  {st}  (n={r['n_sampled']:,})")
        for feat, share in list(r["mean_signal_1_share"].items())[:6]:
            mark = "  <-- absolute time index" if feat == "F7_day" else ""
            print(f"    {feat:<28} {share:>7.4f}{mark}")

    print("\n" + "=" * 70)
    print("(c)  SAME BUDGET ON FS-ORIGIN (F7_day removed) — for contrast")
    print("=" * 70)
    ebo = error_budget("FS-ORIGIN")
    report["error_budget_FS-ORIGIN"] = ebo
    for st, r in ebo.items():
        print(f"\n  {st}")
        for feat, share in list(r["mean_signal_1_share"].items())[:4]:
            print(f"    {feat:<28} {share:>7.4f}")

    p = OUT / "feature_audits.json"
    p.write_text(json.dumps(report, indent=2, default=float))
    print(f"\nwrote {p}")


if __name__ == "__main__":
    main()
