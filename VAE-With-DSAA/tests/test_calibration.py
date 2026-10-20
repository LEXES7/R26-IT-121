"""Risk level at the flag boundary, read from the served calibrators.

A row is flagged when its raw score reaches the stratum's threshold, and HIGH is
meant to be that same boundary, so a flagged row must never come back below
HIGH and an unflagged one never at or above it. The stored bands are rounded to
six places and isotonic is nearly flat at the threshold, so comparing against
the stored band labelled rows just past the threshold MEDIUM. These tests load
the real calibrators because the bug lived in their numbers, not in the logic.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from vae_dsaa.inference.calibration import Calibrator

BUNDLES = Path(__file__).resolve().parents[1] / "checkpoints" / "v4"
STRATA = ["TRANSFER", "CASH_OUT", "PAYMENT", "GLOBAL"]


def _calibrator(stratum: str) -> Calibrator:
    c = Calibrator.load(BUNDLES / f"clean__FS-ORIGIN__{stratum}")
    if c is None:
        pytest.skip(f"no calibrator in the {stratum} bundle")
    return c


def _level(c: Calibrator, raw: float) -> str:
    return c.risk_level(float(c.transform(np.array([raw]))[0]))


@pytest.mark.parametrize("stratum", STRATA)
def test_flagged_rows_are_never_below_high(stratum):
    c = _calibrator(stratum)
    for step in (0.0, 1e-9, 1e-6, 1e-3, 0.1):
        assert _level(c, c.raw_threshold + step) in ("HIGH", "CRITICAL"), step


@pytest.mark.parametrize("stratum", STRATA)
def test_unflagged_rows_stay_below_high(stratum):
    c = _calibrator(stratum)
    for step in (1e-9, 1e-6, 1e-3, 0.1):
        assert _level(c, c.raw_threshold - step) in ("LOW", "MEDIUM"), step


def test_known_fraud_example_is_high():
    """LK-2026-0041: raw 1.7608 against 1.7285, flagged, and shown MEDIUM before."""
    assert _level(_calibrator("TRANSFER"), 1.7608) == "HIGH"
