"""FastAPI entrypoint for the TS-TCN classification service.

All heavy state (the Keras model, the fitted scaler, the type-risk weights,
the rolling transaction buffer) lives on app.state, built once at startup —
mirrors GraphSage/src/graphsage/api/app.py's create_app() pattern, so a test
can inject fakes for the model/scaler/weights instead of loading the real
.keras file and paying TensorFlow's import/startup cost.

Run standalone on port 8003 — that's what fusion_engine/DeepSentinel/backend
/config.py's TEMPORAL_API_BASE points to by default:

    python scripts/serve_api.py
"""
from __future__ import annotations

import json
import logging
import pickle
from collections import deque
from pathlib import Path
from typing import Optional

from fastapi import FastAPI

from .constants import WINDOW_SIZE
from .routes import classify

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_PATH = REPO_ROOT / "outputs" / "stage4_tcn" / "best_tstcn.keras"
DEFAULT_SCALER_PATH = REPO_ROOT / "outputs" / "stage2_baselines" / "scaler.pkl"
DEFAULT_TYPE_WEIGHTS_PATH = REPO_ROOT / "outputs" / "stage2_baselines" / "type_risk_weights.json"


def _load_model(path: Path):
    # Deferred import: TensorFlow is only pulled in when a real model file
    # actually needs loading, so tests that inject a fake model never pay
    # for it.
    from tensorflow import keras

    from src.models.fraud_attention import FraudAttention

    return keras.models.load_model(path, custom_objects={"FraudAttention": FraudAttention})


def create_app(
    model=None,
    scaler=None,
    type_risk_weights: Optional[dict] = None,
    model_path: Path = DEFAULT_MODEL_PATH,
    scaler_path: Path = DEFAULT_SCALER_PATH,
    type_weights_path: Path = DEFAULT_TYPE_WEIGHTS_PATH,
) -> FastAPI:
    """App factory. Tests inject model/scaler/type_risk_weights directly to
    avoid loading the real model file — see tests/test_api_contract.py."""
    app = FastAPI(
        title="TS-TCN Fraud Classifier",
        description="Transaction-Sequence Temporal Convolutional Network "
                    "for explainable fraud detection. DeepSentinel — Member 3.",
        version="1.0.0",
    )

    app.state.model = model
    app.state.scaler = scaler
    app.state.type_risk_weights = type_risk_weights
    # Single global rolling window shared by every request. GraphSAGE's
    # predictor and the VAE contract are both stateless-per-call (precomputed
    # or per-account lookups) — this service is the only one of the three
    # that carries sequence state across requests.
    # TODO(review): one global deque means two interleaved transaction
    # streams (e.g. two different accounts' histories arriving interleaved
    # from a live feed) would corrupt each other's window. That's fine for
    # the single-stream demo/monitor this platform drives today; production
    # use with concurrent streams would need per-stream keying (e.g. by
    # nameOrig) instead of one shared deque.
    app.state.buffer = deque(maxlen=WINDOW_SIZE)

    @app.on_event("startup")
    def load_artifacts() -> None:
        if app.state.model is None:
            if model_path.exists():
                logger.info(f"Loading TS-TCN model from {model_path}")
                app.state.model = _load_model(model_path)
                logger.info("Model loaded.")
            else:
                logger.warning(
                    f"{model_path} not found — starting without a model. "
                    f"/health will report model_not_loaded and /api/v1/classify "
                    f"will return 503 until the file is placed there."
                )
        if app.state.scaler is None and scaler_path.exists():
            with open(scaler_path, "rb") as f:
                app.state.scaler = pickle.load(f)
        if app.state.type_risk_weights is None and type_weights_path.exists():
            with open(type_weights_path, "r", encoding="utf-8") as f:
                app.state.type_risk_weights = json.load(f)

    @app.get("/health")
    def health() -> dict:
        return {
            "status": "ok" if app.state.model is not None else "model_not_loaded",
            "detection_method": "TS-TCN",
            "model_version": "ts-tcn-v1.0",
            "buffer_size": len(app.state.buffer),
            "window_size": WINDOW_SIZE,
        }

    app.include_router(classify.router, prefix="/api/v1")
    return app


app = create_app()
