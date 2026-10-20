#!/usr/bin/env python
"""Copy each stratum's held-out evaluation into its bundle.

    python scripts/export_evaluations.py
    python scripts/export_evaluations.py --feature-set FS-ORIGIN

The console's model card shows the numbers the evaluation wrote to reports/v4.
The serving image ships checkpoints/v4 and leaves reports/ out, so without this
step the card is empty wherever the service runs from that image. The report is
copied byte for byte, so the bundle carries the evaluation's own file rather
than a restatement of it.

Writes evaluation.json into each bundle directory.
No model is retrained and no existing bundle file is modified.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports" / "v4"
MODELS = ROOT / "checkpoints" / "v4"
STRATA = ["TRANSFER", "CASH_OUT", "PAYMENT", "GLOBAL"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--feature-set", default="FS-ORIGIN")
    ap.add_argument("--protocol", default="clean")
    a = ap.parse_args()

    for stratum in STRATA:
        name = f"{a.protocol}__{a.feature_set}__{stratum}"
        src, d = REPORTS / f"{name}.json", MODELS / name
        if not d.exists():
            print(f"  SKIP {stratum}: no bundle at {d}")
            continue
        if not src.exists():
            print(f"  SKIP {stratum}: no report at {src}")
            continue
        shutil.copyfile(src, d / "evaluation.json")
        print(f"  {stratum}: {src.name} -> {d.name}/evaluation.json")


if __name__ == "__main__":
    main()
