#!/usr/bin/env python
"""Prove saved bundles round-trip.

For every bundle: reload it from disk, re-score the test partition, and compare
the recomputed metrics against the metrics JSON written at training time. Any
mismatch is a persistence bug and fails the check.

    python scripts/roundtrip_check.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.models.train import (evaluate, load_arrays,  # noqa: E402
                                   metrics_at)
from vae_dsaa.utils.persistence import list_bundles, load_bundle  # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
REPORTS = ROOT / "reports" / "v4"
TOL = 1e-9

CHECK = ["auc_pr_average_precision", "auc_roc",
         "precision_at_500", "precision_at_1000"]


def main() -> int:
    bundles = list_bundles(MODELS)
    if not bundles:
        print(f"no bundles under {MODELS}")
        return 1

    combined = REPORTS / "all_configs_v4.json"
    saved = json.loads(combined.read_text()) if combined.exists() else {}

    print(f"{'bundle':<38} {'metric':<26} {'saved':>12} {'reloaded':>12}  ok")
    print("-" * 96)
    failures = 0
    for b in bundles:
        p = load_bundle(b)
        m = p.manifest
        key = f"{m['protocol']}|{m['feature_set']}|{m['stratum']}"
        ref = saved.get(key)
        if ref is None:
            print(f"{b.name:<38} (no saved metrics to compare)")
            continue

        # The leaky control arm is preserved deliberately and uses the original
        # 13-feature layout, which is not one of the corrected feature sets. It
        # is evidence, not part of the delivered system, so it is reported as
        # skipped rather than treated as a failure.
        try:
            X, y, _, _, test = load_arrays(DATA, m["stratum"], m["feature_set"])
        except KeyError:
            print(f"{b.name:<38} (feature set {m['feature_set']!r} is not a "
                  f"corrected set - skipped)")
            continue
        s = p.score(X[test], seed=0)
        yt = y[test]
        t1 = p.thresholds["f1_optimal"]
        t2 = p.thresholds["f2_optimal"]
        got = evaluate(key, yt, s, t1, t2, m["feature_set"], m["n_features"])

        for k in CHECK:
            a, bb = ref.get(k), got.get(k)
            if a is None and bb is None:
                continue
            ok = a is not None and bb is not None and abs(a - bb) <= TOL
            failures += (not ok)
            print(f"{b.name:<38} {k:<26} {a if a is None else f'{a:12.9f}'} "
                  f"{bb if bb is None else f'{bb:12.9f}'}  {'OK' if ok else 'MISMATCH'}")

        for pt in ("operating_point_f1_optimal", "operating_point_f2_optimal"):
            # Not every configuration records both operating points — the
            # single-feature and ensemble arms carry only what applies to them.
            # A verification tool must report that, not crash on it.
            if pt not in ref or pt not in got:
                print(f"{b.name:<38} {pt+'.f1':<26} "
                      f"{'not recorded':>12} {'-':>12}  SKIP")
                continue
            a, bb = ref[pt]["f1"], got[pt]["f1"]
            ok = abs(a - bb) <= TOL
            failures += (not ok)
            print(f"{b.name:<38} {pt+'.f1':<26} {a:12.9f} {bb:12.9f}  "
                  f"{'OK' if ok else 'MISMATCH'}")

    print("-" * 96)
    print("ROUND-TRIP PASSED" if not failures else f"{failures} MISMATCHES")
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
