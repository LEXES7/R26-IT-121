"""TSTCNService: model, scaler and rolling-window state for /api/v1/classify.

An instance is built once at app startup (see api/main.py's lifespan) and
shared across requests via app.state.service — not a bare module-level
singleton, so tests can inject a fake service and exercise the route/schema
contract without loading TensorFlow or the real model artefacts (mirrors
GraphSage's and VAE-With-DSAA's `create_app(predictor=...)` pattern).

The buffer is the system-wide W=32 window from proposal §3.5 / novelty N1 —
one deque(maxlen=32) fed by every transaction the service sees, in arrival
order, not one per account. A lock makes each request's append-then-snapshot
atomic (FR8), so two concurrent requests cannot interleave a partial window.
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

# Stage 4 FINAL training run (30-epoch budget, EarlyStopping patience=12 on
# val_fraud_prob_auc, fired at epoch 27 — see
# outputs/stage6_evaluation/tstcn_test_metrics.json). Supersedes the earlier
# ts-tcn-v1.0-stage4 checkpoint, which used patience=5 (not the proposal's
# §3.8 patience=10) and stopped after 6 epochs before recall could recover.
# This run clears the B2 MLP baseline on F1 (0.851 vs 0.737) and Recall
# (0.767 vs 0.586) at the Best-F1 operating point below. AUC-ROC (0.947) and
# Recall (0.767) still fall short of the proposal's stretch targets
# (AUC>0.97, Recall>0.90) — reported honestly rather than rounded up.
MODEL_VERSION = "ts-tcn-v2.0-final"
WINDOW_SIZE = 32

# Best-F1 / balanced operating point from Stage 6 (sklearn.metrics.precision_
# recall_curve on the held-out test partition) — F1=0.851, Precision=0.956,
# Recall=0.767. See outputs/stage6_evaluation/tstcn_test_metrics.json.
#
# A second, Recall-first operating point exists (threshold=0.1278: Recall=
# 0.900, Precision=0.056, F1=0.105) for a deployment that would rather
# surface far more false positives than miss fraud — not used here because
# a 94%-false-positive alert stream is not something an analyst can action,
# but documented so the choice is visible rather than silently made.
#
# Not currently consulted by classify() itself: the contract exposes a
# continuous temporal_risk_score plus a fixed-band risk_level (see
# _risk_level), not a binary decision field. Kept here as the documented
# operating point the Stage 6 F1/Precision/Recall numbers were measured at.
THRESHOLD = 0.4545


class WarmingUp(Exception):
    """Buffer has fewer than WINDOW_SIZE transactions since service start."""


class ModelArtifactsMissing(Exception):
    """A required model/scaler/weights artefact was not found on disk."""


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
    # SUSPICIOUS starts at THRESHOLD (0.4545), the Stage 6 Best-F1 boundary
    # that outputs/stage6_evaluation/tstcn_test_metrics.json's F1=0.851 was
    # measured at -- not the proposal dashboard mockup's arbitrary 0.3. A
    # score that flips this label to SUSPICIOUS is exactly the score the
    # tuned model calls fraud; a fixed 0.3 would report a boundary nobody
    # validated. CRITICAL keeps the mockup's 0.7 as a high-confidence band
    # above that.
    if score >= 0.7:
        return "CRITICAL"
    if score >= THRESHOLD:
        return "SUSPICIOUS"
    return "NORMAL"


class TSTCNService:
    """Owns the model, scaler, type-risk weights and the rolling buffer.

    Model loading is deferred to `.load()` (called from the app's lifespan,
    or lazily on first `.classify()` if a caller skips that) rather than
    module import time, so importing this module — including from tests that
    inject a fake service — never requires TensorFlow to be installed.
    """

    def __init__(self, artifact_dir: Optional[Path] = None):
        artifact_dir = artifact_dir or _ARTIFACT_DIR
        self.model_path = artifact_dir / "stage4_tcn" / "best_tstcn.keras"
        self.scaler_path = artifact_dir / "stage2_baselines" / "scaler.pkl"
        self.type_risk_weights_path = artifact_dir / "stage2_baselines" / "type_risk_weights.json"

        self._model = None
        self._scaler = None
        self._type_risk_weights: Optional[dict] = None
        self._lock = threading.Lock()
        self._buffer: deque = deque(maxlen=WINDOW_SIZE)

        self.startup_seconds: Optional[float] = None
        self.load_error: Optional[str] = None
        self.scored = 0
        self.latency_ms_total = 0.0

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        if self._model is not None:
            return
        started = time.perf_counter()

        for path, note in (
            (self.model_path, "Run the Stage 4 full-training notebook, or copy "
                              "best_tstcn.keras from Drive"),
            (self.scaler_path, "Run notebooks/01_baseline_evaluation.ipynb (Stage 2) "
                               "to fit and save the scaler"),
            (self.type_risk_weights_path, "Produced alongside scaler.pkl in Stage 2"),
        ):
            if not path.exists():
                # Relative to the repo root: the exception message ends up in
                # an HTTP error body (see routes/classify.py), and an absolute
                # path there would publish this machine's home directory.
                try:
                    shown = path.relative_to(_REPO_ROOT)
                except ValueError:
                    shown = path
                raise ModelArtifactsMissing(f"{shown} not found. {note}.")

        # Deferred: tensorflow is a heavy import, and pulling it in at module
        # load would force every consumer of this module (including tests
        # that inject a fake service) to have it installed even when they
        # never call classify().
        from tensorflow import keras

        from src.models import FraudAttention

        logger.info(f"Loading TS-TCN model from {self.model_path}")
        # compile=False: this service only calls .predict(), never .fit(),
        # and the checkpoint was compiled against a throwaway loss
        # ("zero_loss") that was never registered for deserialization —
        # rebuilding the optimizer/loss config on load fails even though the
        # model graph and weights themselves are fine for inference.
        self._model = keras.models.load_model(
            self.model_path, custom_objects={"FraudAttention": FraudAttention}, compile=False
        )
        self._scaler = joblib.load(self.scaler_path)
        with open(self.type_risk_weights_path) as f:
            self._type_risk_weights = json.load(f)

        self.startup_seconds = time.perf_counter() - started
        logger.info(f"TS-TCN model, scaler and type-risk weights loaded in {self.startup_seconds:.2f}s")

    def buffer_size(self) -> int:
        return len(self._buffer)

    def reset_buffer(self) -> None:
        """Test-only: clear the rolling window between test cases."""
        with self._lock:
            self._buffer.clear()

    def missing_artifacts(self) -> list[str]:
        """Which required files are absent, named relative to the repo.

        The exception text carries absolute paths, which are fine in a log and
        wrong in an HTTP body — an error response is not the place to publish
        somebody's home directory.
        """
        return [
            str(p.relative_to(_REPO_ROOT))
            for p in (self.model_path, self.scaler_path, self.type_risk_weights_path)
            if not p.exists()
        ]

    def health(self) -> dict:
        return {
            "status": "ok" if self.loaded else ("error" if self.load_error else "loading"),
            "model_version": MODEL_VERSION,
            "window_size": WINDOW_SIZE,
            "buffer_filled": self.buffer_size(),
            "warming_up": self.buffer_size() < WINDOW_SIZE,
            "threshold": THRESHOLD,
            "startup_seconds": round(self.startup_seconds, 2) if self.startup_seconds is not None else None,
            "transactions_scored": self.scored,
            "mean_latency_ms": (round(self.latency_ms_total / self.scored, 2)
                                if self.scored else None),
            **({"load_error": self.load_error} if self.load_error else {}),
        }

    def classify(self, tx: dict) -> dict:
        """Run one transaction through the rolling window + TS-TCN.

        Raises WarmingUp while the buffer has fewer than WINDOW_SIZE
        transactions (the transaction is still counted towards the buffer
        before raising). Returns a dict shaped exactly like
        docs/api_contract.md's response.
        """
        self.load()
        started = time.perf_counter()

        df = compute_features(pd.DataFrame([tx]), self._type_risk_weights)
        raw_row = df.iloc[0].to_dict()
        feature_vec = df[FEATURE_NAMES].values.astype(np.float32)
        scaled_vec = self._scaler.transform(feature_vec).astype(np.float32)[0]

        entry = {
            "nameOrig": tx["nameOrig"],
            "step": tx["step"],
            "composite_id": f"{tx['nameOrig']}_{tx['step']}",
            "scaled": scaled_vec,
            "raw": raw_row,
        }

        with self._lock:
            self._buffer.append(entry)
            if len(self._buffer) < WINDOW_SIZE:
                raise WarmingUp(f"{len(self._buffer)}/{WINDOW_SIZE} transactions buffered")
            window = list(self._buffer)  # oldest -> newest; window[-1] is this transaction

        window_arr = np.stack([e["scaled"] for e in window], axis=0)[None, ...]  # (1, 32, 10)
        fraud_prob, attn_weights = self._model.predict(window_arr, verbose=0)
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
        self.scored += 1
        self.latency_ms_total += elapsed_ms

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
