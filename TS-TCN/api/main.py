"""FastAPI entrypoint for the TS-TCN classification service (Stage 8 — July).

To be filled in during Stage 8. Skeleton only at this point.
"""
from fastapi import FastAPI
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
    return {"status": "ok", "model_version": "ts-tcn-v1.0"}
