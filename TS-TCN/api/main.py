"""FastAPI entrypoint for the TS-TCN classification service (Stage 8).

Run from the TS-TCN repo root:

    uvicorn api.main:app --reload --port 8003

Port 8003 is the default TEMPORAL_API_BASE the fusion engine dials
(DeepSentinel/backend/config.py) — see docs/api_contract.md.
"""
from fastapi import FastAPI

from . import state
from .routes import classify

app = FastAPI(
    title="TS-TCN Fraud Classifier",
    description="Transaction-Sequence Temporal Convolutional Network "
                "for explainable fraud detection. DeepSentinel — Member 3.",
    version="1.0.0",
)

app.include_router(classify.router, prefix="/api/v1")


@app.get("/health")
def health():
    """Whether this service can actually score, not merely whether it answered.

    `status` is "ok" only when the artefacts needed to score are present. With
    them missing the service still starts and still answers here — that is the
    point, since the fusion engine has to be able to tell "temporal is down"
    apart from "temporal is up but has no weights" — but it reports "degraded"
    and names what is missing.

    Reported without importing TensorFlow or loading weights, so a health probe
    stays cheap and works on a machine that could not host the model anyway.
    """
    missing = state.missing_artifacts()
    return {
        "status": "ok" if not missing else "degraded",
        "ready": not missing,
        "model_loaded": state.model_loaded(),
        "missing_artifacts": missing,
        "model_version": state.MODEL_VERSION,
        "window_size": state.WINDOW_SIZE,
        "buffer_filled": state.buffer_size(),
        "warming_up": state.buffer_size() < state.WINDOW_SIZE,
    }
