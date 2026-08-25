"""Feature engineering F1–F10 (proposal Table 3).

To be filled in by extracting Cell 3 of notebooks/01_baseline_evaluation.ipynb.

All features are universally computable from PaySim raw fields.
F6 (type_risk_weight) is derived from the training partition only (FR1).
"""
import numpy as np
import pandas as pd

FEATURE_NAMES = [
    "drain_ratio", "log_amount", "post_transfer_ratio", "dest_was_empty",
    "dest_enrichment", "type_risk_weight", "inv_dest_ratio",
    "amt_to_orig", "hour_of_day", "day_of_week",
]


def derive_type_risk_weights(df: pd.DataFrame, split_step: int = 595) -> dict:
    """Compute F6 weights from training partition only (no leakage)."""
    train = df[df["step"] <= split_step]
    total_fraud = int(train["isFraud"].sum())
    by_type = train[train["isFraud"] == 1].groupby("type").size()
    weights = (by_type / total_fraud).to_dict()
    for t in ["CASH_IN", "CASH_OUT", "DEBIT", "PAYMENT", "TRANSFER"]:
        weights.setdefault(t, 0.0)
    return weights


def compute_features(df: pd.DataFrame, type_risk_weights: dict,
                     eps: float = 1.0) -> pd.DataFrame:
    """Compute all 10 features in-place and return the DataFrame."""
    df = df.copy()

    df["drain_ratio"] = np.minimum(
        df["amount"] / (df["oldbalanceOrg"] + eps), 1.0)
    df["log_amount"] = np.log1p(df["amount"])
    df["post_transfer_ratio"] = df["newbalanceOrig"] / (df["oldbalanceOrg"] + eps)
    df["dest_was_empty"] = (df["oldbalanceDest"] == 0).astype(np.float32)
    df["dest_enrichment"] = np.minimum(
        (df["newbalanceDest"] - df["oldbalanceDest"]) / (df["amount"] + eps), 2.0)
    df["type_risk_weight"] = (
        df["type"].map(type_risk_weights).fillna(0.0).astype(np.float32))
    df["inv_dest_ratio"] = (
        np.log1p(df["oldbalanceDest"]) / (np.log1p(df["newbalanceDest"]) + eps))
    df["amt_to_orig"] = (
        np.log1p(df["amount"]) / (np.log1p(df["oldbalanceOrg"]) + eps))
    df["hour_of_day"] = ((df["step"] - 1) % 24) / 23.0
    df["day_of_week"] = (((df["step"] - 1) // 24) % 7) / 6.0

    df["composite_id"] = df["nameOrig"].astype(str) + "_" + df["step"].astype(str)
    return df
