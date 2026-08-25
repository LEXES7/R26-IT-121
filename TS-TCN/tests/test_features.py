"""Sanity checks for feature engineering — run with `pytest tests/`."""
import numpy as np
import pandas as pd
import pytest

from src.data.features import (
    FEATURE_NAMES, derive_type_risk_weights, compute_features,
)


@pytest.fixture
def mini_df():
    return pd.DataFrame({
        "step": [1, 2, 100, 600, 700],
        "type": ["TRANSFER", "CASH_OUT", "PAYMENT", "TRANSFER", "TRANSFER"],
        "amount": [100.0, 200.0, 50.0, 1000.0, 5000.0],
        "oldbalanceOrg":   [100.0, 200.0, 50.0, 1000.0, 5000.0],
        "newbalanceOrig":  [0.0,   0.0,   50.0, 0.0,    0.0],
        "oldbalanceDest":  [0.0,   100.0, 50.0, 0.0,    1000.0],
        "newbalanceDest":  [100.0, 300.0, 50.0, 1000.0, 6000.0],
        "nameOrig":        [f"C{i}" for i in range(5)],
        "isFraud":         [1, 1, 0, 1, 0],
    })


def test_train_only_type_weights(mini_df):
    """F6 must be derived only from rows with step <= 595."""
    weights = derive_type_risk_weights(mini_df, split_step=595)
    # Train rows: indices 0, 1, 2 → frauds in TRANSFER (1) and CASH_OUT (1)
    # Total train fraud = 2, so each is 0.5; PAYMENT, DEBIT, CASH_IN = 0
    assert abs(weights["TRANSFER"] - 0.5) < 1e-6
    assert abs(weights["CASH_OUT"] - 0.5) < 1e-6
    assert weights["PAYMENT"] == 0.0
    assert weights["DEBIT"] == 0.0
    assert weights["CASH_IN"] == 0.0


def test_compute_features_shape(mini_df):
    weights = derive_type_risk_weights(mini_df)
    out = compute_features(mini_df, weights)
    for col in FEATURE_NAMES:
        assert col in out.columns
    assert "composite_id" in out.columns
    assert (out[FEATURE_NAMES].notna().all().all())


def test_drain_ratio_clipped(mini_df):
    weights = derive_type_risk_weights(mini_df)
    out = compute_features(mini_df, weights)
    # drain_ratio is clipped to [0, 1]
    assert (out["drain_ratio"] <= 1.0).all()
    assert (out["drain_ratio"] >= 0.0).all()
