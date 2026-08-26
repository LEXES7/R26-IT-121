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
    return {
        "status": "ok",
        "model_version": state.MODEL_VERSION,
        "window_size": state.WINDOW_SIZE,
        "buffer_filled": state.buffer_size(),
        "warming_up": state.buffer_size() < state.WINDOW_SIZE,
    }
