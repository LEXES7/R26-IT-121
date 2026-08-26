#!/usr/bin/env python
"""Write the serving constants every bundle needs into its manifest.

    python scripts/patch_bundle_serving.py

A bundle claims to be self-contained, but single-row scoring also needs the
causal 95th-percentile amount that defines ``F8_is_large``. That constant was
computed in prep and written only to results/v4/metrics/prep_report.json, so a
served transaction could not reproduce the feature. This copies it in.

Idempotent: re-running overwrites the same block with the same values.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREP = ROOT / "results" / "v4" / "metrics" / "prep_report.json"
MODELS = ROOT / "checkpoints" / "v4"

# GLOBAL pools all three strata; PaySim fraud lives only in TRANSFER/CASH_OUT,
# and the API routes CASH_IN/DEBIT there, so it uses the TRANSFER constant.
GLOBAL_SOURCE = "TRANSFER"


def main() -> None:
    prep = json.loads(PREP.read_text())
    p95 = {s: prep["strata"][s]["f8"]["p95_causal_fit_partition"]
           for s in prep["strata"]}
    p95["GLOBAL"] = p95[GLOBAL_SOURCE]
    print("p95_causal per stratum:")
    for k, v in p95.items():
        print(f"  {k:9s} {v:,.2f}" + (f"  (from {GLOBAL_SOURCE})" if k == "GLOBAL" else ""))

    patched = 0
    for d in sorted(MODELS.iterdir()):
        mf = d / "manifest.json"
        if not mf.exists():
            continue
        m = json.loads(mf.read_text())
        stratum = m.get("stratum")
        if stratum not in p95:
            print(f"  SKIP {d.name}: no p95 for stratum {stratum!r}")
            continue
        m["serving"] = {
            "f8_p95_causal": p95[stratum],
            "f8_p95_source": ("fit-partition non-fraud amounts"
                              if stratum != "GLOBAL"
                              else f"fit-partition non-fraud amounts of {GLOBAL_SOURCE}"),
            "f6_hour_formula": "(step % 24) / 24",
            "note": ("Constants required to engineer features for a single "
                     "transaction at serving time. Without f8_p95_causal the "
                     "F8_is_large feature cannot be reproduced and every served "
                     "score is wrong."),
        }
        mf.write_text(json.dumps(m, indent=2))
        patched += 1
    print(f"\npatched {patched} manifests under {MODELS}")


if __name__ == "__main__":
    main()
