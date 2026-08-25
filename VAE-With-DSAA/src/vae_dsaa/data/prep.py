"""Chronological split preparation.

Recovers the PaySim simulation step from the engineered day feature, applies the
chronological split, recomputes ``F8_is_large`` against a training-partition
percentile, and caches per-stratum arrays for the training pipeline.

The step recovery is asserted, not assumed: ``step = F7_day * 720`` must be
integral and must satisfy ``step % 24 == F6_hour * 24`` on every row.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
CSV_DIR = ROOT / "DeepSentinel-VAE-Results" / "DeepSentinel_Output_v2"
OUT = ROOT / "results" / "v4"
(OUT / "data").mkdir(parents=True, exist_ok=True)
(OUT / "metrics").mkdir(parents=True, exist_ok=True)

SPLIT_STEP = 595          # train: step <= 595   test: step > 595
VAL_FRACTION = 0.15       # last 15% of the TRAIN partition, by step

FEATURES_13 = [
    "F1_log_amount", "F2_amount_balance_ratio", "F3_balance_consistency",
    "F4_balance_change_ratio", "F5_dest_balance_ratio", "F6_hour",
    "F7_day", "F8_is_large", "F9_dest_starts_empty", "F10_recipient_emptied",
    "F11_account_velocity", "F12_round_amount", "F13_zero_dest_history",
]
# corrected set: F11 dropped (irrecoverable look-ahead), F8 recomputed causally
FEATURES_12 = [f for f in FEATURES_13 if f != "F11_account_velocity"]

STRATA = ["TRANSFER", "CASH_OUT", "PAYMENT"]

report: dict = {
    "split_step": SPLIT_STEP,
    "val_fraction_of_train": VAL_FRACTION,
    "features_original": FEATURES_13,
    "features_corrected": FEATURES_12,
    "strata": {},
}


def recover_step(df: pd.DataFrame) -> np.ndarray:
    """step = F7_day * 24 * 30. Assert the inversion is exact before use."""
    raw = df["F7_day"].to_numpy(dtype=np.float64) * 720.0
    s = np.rint(raw)
    dev = float(np.abs(raw - s).max())
    if dev > 1e-6:
        raise AssertionError(f"step recovery not integral: max deviation {dev:.3e}")
    # cross-check against F6_hour
    hour = np.rint(df["F6_hour"].to_numpy(dtype=np.float64) * 24.0)
    bad = int((s % 24 != hour).sum())
    if bad:
        raise AssertionError(f"step %% 24 != F6_hour*24 on {bad} rows")
    return s.astype(np.int32), dev


def main() -> None:
    t_all = time.time()
    for stratum in STRATA:
        t0 = time.time()
        path = CSV_DIR / f"{stratum}_all_features.csv"
        print(f"\n=== {stratum} ===")
        print(f"  reading {path.name} ...", flush=True)
        df = pd.read_csv(path)
        n = len(df)

        step, dev = recover_step(df)
        y = df["isFraud"].to_numpy(dtype=np.int8)

        # ---- partitions -------------------------------------------------
        is_train_part = step <= SPLIT_STEP
        is_test_part = ~is_train_part

        # validation = last VAL_FRACTION of the TRAIN partition, by step.
        # Chosen on a step boundary so no step straddles train/val.
        tr_steps = step[is_train_part]
        val_cut = int(np.quantile(tr_steps, 1.0 - VAL_FRACTION))
        is_val = is_train_part & (step > val_cut)
        is_fit = is_train_part & (step <= val_cut)     # model-fitting slice

        # ---- causal F8 --------------------------------------------------
        # amount = exp(F1_log_amount) - 1   (F1 = log1p(amount))
        amount = np.expm1(df["F1_log_amount"].to_numpy(dtype=np.float64))
        # percentile from FIT-partition non-fraud rows only
        ref = amount[is_fit & (y == 0)]
        p95_causal = float(np.quantile(ref, 0.95))
        f8_new = (amount > p95_causal).astype(np.float32)
        f8_old = df["F8_is_large"].to_numpy(dtype=np.float32)
        changed = int((f8_new != f8_old).sum())

        # what the original (whole-dataset, non-fraud) threshold was
        p95_original = float(np.quantile(amount[y == 0], 0.95))

        df["F8_is_large"] = f8_new

        # ---- matrices ---------------------------------------------------
        X12 = df[FEATURES_12].to_numpy(dtype=np.float32)
        X13 = df[FEATURES_13].to_numpy(dtype=np.float32)   # for the F11 ablation

        np.savez_compressed(
            OUT / "data" / f"{stratum}.npz",
            X12=X12, X13=X13, y=y, step=step,
            is_fit=is_fit, is_val=is_val, is_test=is_test_part,
            f8_old=f8_old,   # kept so the v3 protocol can be reproduced exactly
        )

        # ---- F7_day out-of-range diagnostic -----------------------------
        # F7_day is a monotone function of step, so a chronological split puts
        # every test row outside the training range of this feature.
        f7 = df["F7_day"].to_numpy(dtype=np.float64)
        f7_fit_max = float(f7[is_fit].max())
        f7_test_min = float(f7[is_test_part].min()) if is_test_part.any() else float("nan")

        st = {
            "rows": int(n),
            "fraud_total": int(y.sum()),
            "step_range": [int(step.min()), int(step.max())],
            "step_recovery_max_deviation": dev,
            "val_cut_step": val_cut,
            "fit_rows": int(is_fit.sum()),
            "fit_normal_rows": int((is_fit & (y == 0)).sum()),
            "val_rows": int(is_val.sum()),
            "val_normal_rows": int((is_val & (y == 0)).sum()),
            "test_rows": int(is_test_part.sum()),
            "test_fraud": int(y[is_test_part].sum()),
            "test_fraud_rate": float(y[is_test_part].mean()) if is_test_part.any() else 0.0,
            "overall_fraud_rate": float(y.mean()),
            "f8": {
                "p95_causal_fit_partition": p95_causal,
                "p95_original_whole_dataset": p95_original,
                "rows_changed": changed,
                "rows_changed_pct": 100.0 * changed / n,
                "positives_old": int(f8_old.sum()),
                "positives_new": int(f8_new.sum()),
            },
            "f7_day_range": {
                "fit_max": f7_fit_max,
                "test_min": f7_test_min,
                "test_entirely_above_fit_max": bool(f7_test_min > f7_fit_max),
            },
        }
        report["strata"][stratum] = st

        print(f"  rows {n:,} | fraud {int(y.sum()):,}")
        print(f"  fit {int(is_fit.sum()):,} (step<={val_cut}) | "
              f"val {int(is_val.sum()):,} (step {val_cut+1}-{SPLIT_STEP}) | "
              f"test {int(is_test_part.sum()):,} (step>{SPLIT_STEP})")
        print(f"  test fraud {int(y[is_test_part].sum()):,} "
              f"({100*float(y[is_test_part].mean()) if is_test_part.any() else 0:.2f}%) "
              f"vs overall {100*float(y.mean()):.2f}%")
        print(f"  F8 p95: causal {p95_causal:,.2f} vs original {p95_original:,.2f} "
              f"-> {changed:,} rows changed ({100*changed/n:.2f}%)")
        print(f"  done in {time.time()-t0:.1f}s", flush=True)

        del df, X12, X13
    total_test_fraud = sum(report["strata"][s]["test_fraud"] for s in STRATA)
    report["total_test_fraud_all_strata"] = total_test_fraud

    (OUT / "metrics" / "prep_report.json").write_text(json.dumps(report, indent=2))
    print(f"\nTotal test fraud across strata: {total_test_fraud:,}  (TS-TCN reports 1,642)")
    print(f"Wrote {OUT/'metrics'/'prep_report.json'}")
    print(f"Total elapsed {time.time()-t_all:.1f}s")
