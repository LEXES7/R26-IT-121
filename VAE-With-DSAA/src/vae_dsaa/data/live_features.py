"""Single-transaction feature engineering for serving.

The training pipeline reads features that were engineered in bulk (see
``scripts/legacy/DeepSentinel_Feature_Engineering_Colab.py``). Serving has to
reproduce those formulas exactly from one raw PaySim record, or the served
score is not the score the model was trained to produce.

Every formula below is copied from the original engineering script, not
re-derived::

    F1_log_amount            log1p(amount)
    F2_amount_balance_ratio  amount / (oldbalanceOrg + 1)
    F3_balance_consistency   int(|oldbalanceOrg - amount - newbalanceOrig| < 0.01)
    F4_balance_change_ratio  (newbalanceOrig - oldbalanceOrg) / (oldbalanceOrg + 1)
    F5_dest_balance_ratio    newbalanceDest / (oldbalanceDest + 1)
    F6_hour                  (step % 24) / 24
    F7_day                   step / 720
    F8_is_large              int(amount > p95_causal)      <- stratum constant
    F9_dest_starts_empty     int(oldbalanceDest == 0)
    F10_recipient_emptied    int(newbalanceDest == 0 and amount > 0)
    F12_round_amount         int(amount % 1000 == 0 and amount >= 10000)
    F13_zero_dest_history    int(oldbalanceDest == 0 and newbalanceDest == amount)

``F11_account_velocity`` is deliberately absent: it aggregates an account's
transactions across the whole log, including rows after the one being scored,
so it is excluded from every corrected feature set and cannot be computed for a
single transaction anyway.

The ``F8`` percentile is read from the bundle manifest (``serving.f8_p95_causal``),
written there by ``scripts/patch_bundle_serving.py``.
"""

from __future__ import annotations

import math

import numpy as np

#: Every feature this module can build. Order is irrelevant here — callers
#: request features by name, in the order the bundle manifest specifies.
SUPPORTED = (
    "F1_log_amount", "F2_amount_balance_ratio", "F3_balance_consistency",
    "F4_balance_change_ratio", "F5_dest_balance_ratio", "F6_hour", "F7_day",
    "F8_is_large", "F9_dest_starts_empty", "F10_recipient_emptied",
    "F12_round_amount", "F13_zero_dest_history",
)

#: Requires the whole transaction log; never computable from one row.
UNSUPPORTED = ("F11_account_velocity",)


class FeatureError(ValueError):
    """A feature was requested that a single row cannot produce."""


def engineer(tx: dict, features: list[str], f8_p95: float) -> np.ndarray:
    """Build one raw, unscaled feature row in the order ``features`` gives.

    Args:
        tx: raw PaySim fields — step, amount, oldbalanceOrg, newbalanceOrig,
            oldbalanceDest, newbalanceDest.
        features: the bundle's manifest feature list, in order.
        f8_p95: the stratum's causal 95th-percentile amount.

    Returns:
        ``(1, len(features))`` float32 array, ready for ``Predictor.score``.
    """
    step = int(tx["step"])
    amount = float(tx["amount"])
    old_org = float(tx["oldbalanceOrg"])
    new_org = float(tx["newbalanceOrig"])
    old_dest = float(tx["oldbalanceDest"])
    new_dest = float(tx["newbalanceDest"])

    values = {
        "F1_log_amount": math.log1p(amount),
        "F2_amount_balance_ratio": amount / (old_org + 1.0),
        "F3_balance_consistency": float(abs(old_org - amount - new_org) < 0.01),
        "F4_balance_change_ratio": (new_org - old_org) / (old_org + 1.0),
        "F5_dest_balance_ratio": new_dest / (old_dest + 1.0),
        "F6_hour": (step % 24) / 24.0,
        "F7_day": step / 720.0,
        "F8_is_large": float(amount > f8_p95),
        "F9_dest_starts_empty": float(old_dest == 0.0),
        "F10_recipient_emptied": float(new_dest == 0.0 and amount > 0.0),
        "F12_round_amount": float(amount % 1000 == 0 and amount >= 10000),
        "F13_zero_dest_history": float(old_dest == 0.0 and new_dest == amount),
    }

    missing = [f for f in features if f not in values]
    if missing:
        raise FeatureError(
            f"cannot engineer {missing} from a single transaction"
            + (f"; {[m for m in missing if m in UNSUPPORTED]} needs the whole log"
               if any(m in UNSUPPORTED for m in missing) else "")
        )
    return np.array([[values[f] for f in features]], dtype=np.float32)


def explain(tx: dict, features: list[str], f8_p95: float) -> dict:
    """The same values as a name -> value mapping, for diagnostics."""
    row = engineer(tx, features, f8_p95)[0]
    return {name: float(v) for name, v in zip(features, row)}
