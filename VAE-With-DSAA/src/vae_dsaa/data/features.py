"""Feature definitions, provenance and the named feature sets.

Provenance is encoded as data so the artifact ablation stays auditable. Seven of
the thirteen engineered features are derived from the four PaySim balance
columns that the dataset card states "should not be utilized" for fraud
analysis, and they split cleanly into origin-side and destination-side groups.

That split matters. The documented PaySim artifact lives on the destination
side: fraudulent rows leave ``newbalanceDest == 0``, which makes
``F10_recipient_emptied`` a perfect separator on TRANSFER with no model at all.
Origin-side ratios such as ``F2`` and ``F4`` express legitimate behavioural
concepts ("how much of the available balance moved"), and ``F4`` alone reaches
lift 32.7x on CASH_OUT. Removing the two groups separately measures how much
signal is artifact and how much is behaviour.

Note that removing the destination group leaves the result *artifact-reduced*,
not artifact-free: F3_balance_consistency is itself a simulator artifact. See
PRIMARY_FEATURE_SET below.
"""
from __future__ import annotations

# order written by the preparation stage — do not reorder
COLS13 = [
    "F1_log_amount", "F2_amount_balance_ratio", "F3_balance_consistency",
    "F4_balance_change_ratio", "F5_dest_balance_ratio", "F6_hour",
    "F7_day", "F8_is_large", "F9_dest_starts_empty", "F10_recipient_emptied",
    "F11_account_velocity", "F12_round_amount", "F13_zero_dest_history",
]
COLS12 = [c for c in COLS13 if c != "F11_account_velocity"]

#: derived from oldbalanceOrg / newbalanceOrig — legitimate behavioural ratios
ORIGIN_BALANCE = {
    "F2_amount_balance_ratio",
    "F3_balance_consistency",
    "F4_balance_change_ratio",
}

#: derived from oldbalanceDest / newbalanceDest — where the PaySim artifact lives
DESTINATION_BALANCE = {
    "F5_dest_balance_ratio",
    "F9_dest_starts_empty",
    "F10_recipient_emptied",
    "F13_zero_dest_history",
}

BALANCE_DERIVED = ORIGIN_BALANCE | DESTINATION_BALANCE

#: absolute time index — pure extrapolation under a chronological split
TIME_ABSOLUTE = {"F7_day"}

#: cyclic time — expected safe across a chronological split (verify empirically)
TIME_CYCLIC = {"F6_hour"}

#: aggregates over the whole log, so it encodes look-ahead information
LOOK_AHEAD = {"F11_account_velocity"}

SOURCE_COLUMNS = {
    "F1_log_amount": ["amount"],
    "F2_amount_balance_ratio": ["amount", "oldbalanceOrg"],
    "F3_balance_consistency": ["oldbalanceOrg", "amount", "newbalanceOrig"],
    "F4_balance_change_ratio": ["newbalanceOrig", "oldbalanceOrg"],
    "F5_dest_balance_ratio": ["newbalanceDest", "oldbalanceDest"],
    "F6_hour": ["step"],
    "F7_day": ["step"],
    "F8_is_large": ["amount"],
    "F9_dest_starts_empty": ["oldbalanceDest"],
    "F10_recipient_emptied": ["newbalanceDest", "amount"],
    "F11_account_velocity": ["nameOrig"],
    "F12_round_amount": ["amount"],
    "F13_zero_dest_history": ["oldbalanceDest", "newbalanceDest", "amount"],
}

_FS_FULL = [c for c in COLS12 if c not in TIME_ABSOLUTE]

#: Named feature sets.
#:
#: The three ablation tiers form a gradient from "everything defensible" to
#: "no balance columns at all":
#:
#:   FS-FULL    11 features — F11 dropped (look-ahead), F7_day dropped
#:                            (extrapolation under a time split)
#:   FS-ORIGIN   7 features — FS-FULL minus destination-side balance features
#:   FS-CLEAN    4 features — FS-FULL minus all balance-derived features
#:
#: FS12 and FS13 are retained so the F7_day and F11 ablations stay reproducible.
FEATURE_SETS = {
    "FS-FULL": list(_FS_FULL),
    "FS-ORIGIN": [c for c in _FS_FULL if c not in DESTINATION_BALANCE],
    "FS-CLEAN": [c for c in _FS_FULL if c not in BALANCE_DERIVED],
    # FS-ORIGIN minus F3. F3 flags rows whose balances reconcile exactly, which
    # in PaySim is itself close to an artifact: a fraudulent transfer drains the
    # account precisely, so it reconciles, while genuine transfers frequently do
    # not. This tier tests whether FS-ORIGIN is a distributed signal or an F3
    # detector with extra columns.
    "FS-ORIGIN-NOF3": [c for c in _FS_FULL
                       if c not in DESTINATION_BALANCE
                       and c != "F3_balance_consistency"],
    # Config G of the proposal's ablation: the single balance-consistency
    # feature, put through the identical modelling pipeline. Isolates how much
    # of the result is reachable from F3 alone with a VAE on top.
    "FS-F3ONLY": ["F3_balance_consistency"],
    "FS12": list(COLS12),          # keeps F7_day — F7_day ablation reference
    "FS13": list(COLS13),          # keeps F11     — F11 ablation reference
}

#: Primary feature set: **artifact-REDUCED, not artifact-free**.
#:
#: FS-ORIGIN removes the destination-side balance features, which is where the
#: documented PaySim generation artifact lives (``newbalanceDest == 0`` on fraud
#: rows makes ``F10_recipient_emptied`` a perfect separator on TRANSFER). It does
#: NOT remove every artifact, and must never be described as artifact-free.
#:
#: ``F3_balance_consistency`` is itself a simulator artifact. It holds for 99.03%
#: of TRANSFER fraud and 100% of CASH_OUT fraud, against 4.94% and 13.24% of
#: normals, because the simulated fraudster drains the account to the cent so the
#: ledger reconciles exactly. Real fraud is not that tidy. FS-ORIGIN's advantage
#: over FS-CLEAN rests almost entirely on it:
#:
#:     TRANSFER lift   FS-ORIGIN 9.85x -> FS-ORIGIN-NOF3 5.10x (FS-CLEAN 4.89x)
#:     CASH_OUT lift   FS-ORIGIN 33.97x -> FS-ORIGIN-NOF3 15.72x (FS-CLEAN 16.59x)
#:
#: and FS-ORIGIN barely exceeds a single raw column used directly as a score:
#: ``F4_balance_change_ratio`` alone reaches 9.84x on TRANSFER and 32.74x on
#: CASH_OUT, against FS-ORIGIN's 9.85x and 33.97x — margins of 0.1% and 3.8%.
#:
#: **The detection claim is therefore a negative result and is reported as one.**
#: No feature tier demonstrates that the VAE adds detection capability over a
#: single column. The component's contribution is attribution and triage: a raw
#: score produces a ranking but cannot say why a row was flagged, nor partition
#: the flagged set into pure and impure groups. The DSAA fingerprint does both,
#: stably (DBCV 0.7224 / 0.6699, bootstrap ARI 0.9996 / 0.9231).
#:
#: FS-ORIGIN is retained as primary because the DSAA results are computed on it,
#: it is best on CASH_OUT across every measure, and it yields the fewest PAYMENT
#: false positives (28, 0.068%).
#:
#: Evidence: reports/v4/single_feature_baselines.json, the FS-ORIGIN-NOF3 entries
#: in reports/v4/all_configs_v4.json, and reports/v4/dsaa/.
PRIMARY_FEATURE_SET: str = "FS-ORIGIN"

#: Human-readable qualifier. Use this wording in generated documents; do not
#: write "artifact-free" anywhere.
PRIMARY_FEATURE_SET_QUALIFIER = "artifact-reduced"

#: Sets that can be built from the stored 12-column matrix (everything but FS13,
#: which needs the separate 13-column matrix because it includes F11).
SETS_FROM_COLS12 = [k for k in FEATURE_SETS if k != "FS13"]


def columns(feature_set: str) -> list[str]:
    """Ordered feature names for a named set."""
    if feature_set not in FEATURE_SETS:
        raise KeyError(f"unknown feature set {feature_set!r}; "
                       f"known: {sorted(FEATURE_SETS)}")
    return list(FEATURE_SETS[feature_set])


def indices(feature_set: str) -> tuple[str, list[int]]:
    """Return which stored matrix to slice, and the column positions to take.

    Returns ``("X13", idx)`` for FS13 and ``("X12", idx)`` for every other set.
    """
    cols = columns(feature_set)
    if feature_set == "FS13":
        return "X13", [COLS13.index(c) for c in cols]
    return "X12", [COLS12.index(c) for c in cols]


def describe(feature_set: str) -> dict:
    """Provenance summary for a feature set, for manifests and reports."""
    cols = columns(feature_set)
    return {
        "feature_set": feature_set,
        "n_features": len(cols),
        "features": cols,
        "origin_balance": sorted(set(cols) & ORIGIN_BALANCE),
        "destination_balance": sorted(set(cols) & DESTINATION_BALANCE),
        "excluded_look_ahead": sorted(LOOK_AHEAD - set(cols)),
        "excluded_absolute_time": sorted(TIME_ABSOLUTE - set(cols)),
        "source_columns": sorted({c for f in cols for c in SOURCE_COLUMNS[f]}),
    }
