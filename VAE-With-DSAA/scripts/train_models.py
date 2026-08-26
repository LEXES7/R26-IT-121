#!/usr/bin/env python
"""Train configurations and persist a bundle for each.

    python scripts/train_models.py                  # full matrix
    python scripts/train_models.py --sets FS-FULL   # one tier
    python scripts/train_models.py --strata TRANSFER

Every run writes a bundle under checkpoints/ and a metrics JSON under reports/.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.data import features as F           # noqa: E402
from vae_dsaa.models.train import STRATA, train_one   # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
REPORTS = ROOT / "reports" / "v4"

# the three ablation tiers, plus the two sets that keep the F7/F11 ablations
# reproducible. GLOBAL (Config A) is trained on FS-FULL only.
DEFAULT_SETS = ["FS-FULL", "FS-ORIGIN", "FS-CLEAN", "FS12", "FS13"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets", nargs="*", default=DEFAULT_SETS)
    ap.add_argument("--strata", nargs="*", default=STRATA)
    ap.add_argument("--global-set", default="FS-FULL",
                    help="feature set used for the pooled Config A model")
    ap.add_argument("--no-global", action="store_true")
    ap.add_argument("--data", default=str(DATA))
    ap.add_argument("--models", default=str(MODELS))
    ap.add_argument("--reports", default=str(REPORTS))
    a = ap.parse_args()

    Path(a.models).mkdir(parents=True, exist_ok=True)
    Path(a.reports).mkdir(parents=True, exist_ok=True)
    log_path = Path(a.reports) / "train_log.txt"
    log_f = open(log_path, "a", encoding="utf-8")

    def log(*parts):
        line = " ".join(str(p) for p in parts)
        print(line, flush=True)
        log_f.write(line + "\n"); log_f.flush()

    jobs = [(fs, st) for fs in a.sets for st in a.strata]
    if not a.no_global:
        jobs.append((a.global_set, "GLOBAL"))

    log(f"\n=== {len(jobs)} configurations | sets={a.sets} ===")
    results, t0 = {}, time.time()
    for fs, st in jobs:
        try:
            m = train_one(a.data, a.models, st, fs, log=log)
        except Exception as e:                                   # noqa: BLE001
            log(f"  FAILED {fs}|{st}: {type(e).__name__}: {e}")
            continue
        results[m["config"]] = m
        ap_ = m["auc_pr_average_precision"]
        lift = m["ap_lift_over_base_rate"]
        log(f"    AP={ap_ if ap_ is None else round(ap_, 4)} "
            f"lift={lift if lift is None else round(lift, 1)} "
            f"F1={m['operating_point_f1_optimal']['f1']:.4f} "
            f"-> {Path(m['bundle']).name}")
        out = Path(a.reports) / (m["config"].replace("|", "__") + ".json")
        out.write_text(json.dumps(m, indent=2))

    combined = Path(a.reports) / "all_configs_v4.json"
    prev = json.loads(combined.read_text()) if combined.exists() else {}
    prev.update(results)
    combined.write_text(json.dumps(prev, indent=2))
    log(f"\nDONE {len(results)}/{len(jobs)} in {time.time()-t0:.0f}s -> {combined}")


if __name__ == "__main__":
    main()
