"""Process-wide model, scaler and rolling-window state for /api/v1/classify.

Loaded once (module-level singletons, lazy on first request) and shared
across requests. The buffer is the system-wide W=32 window from proposal
§3.5 / novelty N1 — one deque(maxlen=32) fed by every transaction the service
sees, in arrival order, not one per account. A lock makes each request's
append-then-snapshot atomic (FR8), so two concurrent requests cannot
interleave a partial window.
"""
import json
import logging
import threading
import time
from collections import deque
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd

from src.data.features import FEATURE_NAMES, compute_features

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent.parent
_ARTIFACT_DIR = _REPO_ROOT / "outputs"

MODEL_PATH = _ARTIFACT_DIR / "stage4_tcn" / "ts_tcn_sanity.keras"
SCALER_PATH = _ARTIFACT_DIR / "stage2_baselines" / "scaler.pkl"
TYPE_RISK_WEIGHTS_PATH = _ARTIFACT_DIR / "stage2_baselines" / "type_risk_weights.json"

# Stage 4 sanity checkpoint (1 epoch, architecture verification only — see
# docs/api_contract.md "Model status caveat"). Swap to a versioned name once
# the full Stage 4 training run (best_tstcn.h5) replaces it.
MODEL_VERSION = "ts-tcn-sanity-v0.1"
WINDOW_SIZE = 32

# Provisional — Stage 6 (precision_recall_curve threshold tuning) has not run
# yet. 0.5 is the untuned sigmoid midpoint, not a validated operating point.
THRESHOLD = 0.5

_model = None
_scaler = None
_type_risk_weights: Optional[dict] = None
_lock = threading.Lock()
_buffer: deque = deque(maxlen=WINDOW_SIZE)


class WarmingUp(Exception):
    """Buffer has fewer than WINDOW_SIZE transactions since service start."""


class ModelArtifactsMissing(Exception):
    """A required model/scaler/weights artefact was not found on disk."""


# Each artefact with the step that produces it, so a missing one reports how to
# get it rather than just its absence.
REQUIRED_ARTIFACTS = (
    (MODEL_PATH, "Run notebooks/03_tcn_architecture.ipynb (Stage 4 build) "
                 "or copy ts_tcn_sanity.keras from Drive"),
    (SCALER_PATH, "Run notebooks/01_baseline_evaluation.ipynb (Stage 2) "
                  "to fit and save the scaler"),
    (TYPE_RISK_WEIGHTS_PATH, "Produced alongside scaler.pkl in Stage 2"),
)


def missing_artifacts() -> list[str]:
    """Which required files are absent. Cheap: filesystem only, no TensorFlow.

    /health calls this so the service can answer "am I able to score?" without
    importing keras or loading weights. A health check that says "ok" while
    every classify() raises is worse than one that fails outright — the fusion
    engine reads this endpoint to decide whether the detector contributes, and
    a false "ok" makes a dead detector look live on the dashboard.
    """
    return [str(p.relative_to(_REPO_ROOT)) for p, _ in REQUIRED_ARTIFACTS
            if not p.exists()]


def model_loaded() -> bool:
    """Whether weights are resident in this process right now."""
    return _model is not None


def _load() -> None:
    global _model, _scaler, _type_risk_weights
    if _model is not None:
        return

    for path, note in REQUIRED_ARTIFACTS:
        if not path.exists():
            raise ModelArtifactsMissing(f"{path} not found. {note}.")

    # Deferred: tensorflow is a heavy import, and pulling it in at module load
    # would force every consumer of this module (including tests that stub
    # the model) to have it installed even when they never call classify().
    from tensorflow import keras

    from src.models import FraudAttention

    logger.info(f"Loading TS-TCN model from {MODEL_PATH}")
    # compile=False: this service only calls .predict(), never .fit(), and the
    # sanity checkpoint was compiled against a throwaway loss ("zero_loss")
    # that was never registered for deserialization — trying to rebuild the
    # optimizer/loss config on load fails even though the model graph and
    # weights themselves are fine for inference.
    _model = keras.models.load_model(
        MODEL_PATH, custom_objects={"FraudAttention": FraudAttention}, compile=False
    )
    _scaler = joblib.load(SCALER_PATH)
    with open(TYPE_RISK_WEIGHTS_PATH) as f:
        _type_risk_weights = json.load(f)
    logger.info("TS-TCN model, scaler and type-risk weights loaded.")


def buffer_size() -> int:
    return len(_buffer)


def reset_buffer() -> None:
    """Test-only: clear the rolling window between test cases."""
    with _lock:
        _buffer.clear()


def _fraud_signal_summary(row: dict) -> str:
    drain, post, dest_empty = row["drain_ratio"], row["post_transfer_ratio"], row["dest_was_empty"]
    if drain >= 0.95 and dest_empty:
        return "Account fully drained into empty destination account"
    if drain >= 0.95:
        return "Account fully drained"
    if drain >= 0.5 and dest_empty:
        return "Partial drain from account into a previously empty destination"
    if drain >= 0.5:
        return "Partial drain from account"
    if post >= 0.95:
        return "Small transfer, originator balance largely intact"
    return "No strong drain signal on this transaction"


def _predecessor_signal(row: dict) -> str:
    drain, dest_empty = row["drain_ratio"], row["dest_was_empty"]
    if drain >= 0.5 and dest_empty:
        return "Prior partial drain into an empty account — escalating pattern"
    if drain >= 0.5:
        return "Prior partial drain from the same account — escalating pattern"
    if dest_empty:
        return "Prior transfer into a previously empty account"
    return "Elevated attention on this predecessor transaction"


def _risk_level(score: float) -> str:
    # Matches the traffic-light bands in the proposal's dashboard mockup
    # (Appendix B.1): green <=0.3, amber 0.3-0.7, red >=0.7.
    if score >= 0.7:
        return "CRITICAL"
    if score >= 0.3:
        return "SUSPICIOUS"
    return "NORMAL"


def classify(tx: dict) -> dict:
    """Run one transaction through the rolling window + TS-TCN.

    Raises WarmingUp while the buffer has fewer than WINDOW_SIZE transactions
    (the transaction is still counted towards the buffer before raising).
    Returns a dict shaped exactly like docs/api_contract.md's response.
    """
    _load()
    started = time.perf_counter()

    df = compute_features(pd.DataFrame([tx]), _type_risk_weights)
    raw_row = df.iloc[0].to_dict()
    feature_vec = df[FEATURE_NAMES].values.astype(np.float32)
    scaled_vec = _scaler.transform(feature_vec).astype(np.float32)[0]

    entry = {
        "nameOrig": tx["nameOrig"],
        "step": tx["step"],
        "composite_id": f"{tx['nameOrig']}_{tx['step']}",
        "scaled": scaled_vec,
        "raw": raw_row,
    }

    with _lock:
        _buffer.append(entry)
        if len(_buffer) < WINDOW_SIZE:
            raise WarmingUp(f"{len(_buffer)}/{WINDOW_SIZE} transactions buffered")
        window = list(_buffer)  # oldest -> newest; window[-1] is this transaction

    window_arr = np.stack([e["scaled"] for e in window], axis=0)[None, ...]  # (1, 32, 10)
    fraud_prob, attn_weights = _model.predict(window_arr, verbose=0)
    fraud_prob = float(fraud_prob[0, 0])
    attn = attn_weights[0]  # (32,) attention from the current (last) position

    # Position 31 is the current transaction itself; a "predecessor" is by
    # definition one of the other 31 positions.
    predecessor_idx = int(np.argmax(attn[:-1]))
    current, predecessor = window[-1], window[predecessor_idx]

    current_evidence = {
        "type": str(current["raw"]["type"]),
        "amount": float(current["raw"]["amount"]),
        "drain_ratio": float(current["raw"]["drain_ratio"]),
        "post_transfer_ratio": float(current["raw"]["post_transfer_ratio"]),
        "dest_was_empty": float(current["raw"]["dest_was_empty"]),
        "dest_enrichment": float(current["raw"]["dest_enrichment"]),
        "type_risk": float(current["raw"]["type_risk_weight"]),
        "hour_of_day": float(current["raw"]["hour_of_day"]),
        "fraud_signal_summary": _fraud_signal_summary(current["raw"]),
    }

    triggering_predecessor = {
        "nameOrig": predecessor["nameOrig"],
        "step": predecessor["step"],
        "composite_id": predecessor["composite_id"],
        "attention_weight": float(attn[predecessor_idx]),
        "offset_from_current": predecessor_idx - (WINDOW_SIZE - 1),
        "features": {
            "type": str(predecessor["raw"]["type"]),
            "amount": float(predecessor["raw"]["amount"]),
            "drain_ratio": float(predecessor["raw"]["drain_ratio"]),
            "post_transfer_ratio": float(predecessor["raw"]["post_transfer_ratio"]),
            "dest_was_empty": float(predecessor["raw"]["dest_was_empty"]),
            "type_risk": float(predecessor["raw"]["type_risk_weight"]),
        },
        "predecessor_signal": _predecessor_signal(predecessor["raw"]),
    }

    elapsed_ms = (time.perf_counter() - started) * 1000

    return {
        "transaction_ref": {
            "nameOrig": current["nameOrig"],
            "step": current["step"],
            "composite_id": current["composite_id"],
        },
        "temporal_risk_score": fraud_prob,
        "risk_level": _risk_level(fraud_prob),
        "detection_method": "TS-TCN",
        "modality": "temporal_sequence",
        "evidence": {"current_transaction": current_evidence},
        "triggering_predecessor": triggering_predecessor,
        "model_version": MODEL_VERSION,
        "inference_time_ms": round(elapsed_ms, 2),
    }
