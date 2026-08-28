"""FastAPI application — the temporal-sequence modality of DeepSentinel.

    POST /api/v1/classify   single transaction, what the fusion engine calls
    GET  /health             live operating parameters
    GET  /api/v1/runtime      is the model actually serving?

All heavy state (model, scaler, type-risk weights, the rolling window) lives
in a TSTCNService built once at startup (see `create_app`'s lifespan) —
mirrors GraphSage's and VAE-With-DSAA's `create_app(predictor=...)` pattern,
so tests can inject a fake service and exercise the route/schema contract
without TensorFlow or the real model artefacts.

Run from the TS-TCN repo root:

    python scripts/serve_api.py
    # or: uvicorn api.main:app --reload --port 8003

Port 8003 is the default TEMPORAL_API_BASE the fusion engine dials
(DeepSentinel/backend/config.py) — see docs/api_contract.md.
"""
import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import state
from .routes import classify as classify_route
from .schemas.response import ErrorResponse

logger = logging.getLogger(__name__)

START_TS = time.time()


def create_app(service: Optional[state.TSTCNService] = None) -> FastAPI:
    """App factory. Tests inject a service so the suite loads no artefacts."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Heavy state is built once, here, and never during a request.
        if app.state.service is None:
            app.state.service = state.TSTCNService()
        svc = app.state.service
        try:
            svc.load()
            logger.info(f"TS-TCN ready in {svc.startup_seconds:.2f}s")
        except Exception as e:  # noqa: BLE001 — see below
            # Deliberately broad. Missing artefacts is only one way loading
            # fails: a broken or absent TensorFlow, a checkpoint saved by an
            # incompatible Keras, a corrupt download. All of them should
            # surface the same way — the service answers /health with
            # status "error" and the reason, instead of the process refusing
            # to start and leaving the reason only in a container log.
            if not isinstance(e, state.ModelArtifactsMissing):
                logger.exception("TS-TCN failed to load its model")
            # Fail visible, not fail hard: /health reports "error" with the
            # reason rather than the process refusing to start, so ops can
            # see why via curl instead of reading container logs.
            # Relative paths: /health is read over the network, and the
            # exception text carries the absolute path of whoever's machine
            # this is running on.
            missing = svc.missing_artifacts()
            # Relative paths: /health is read over the network, and the
            # exception text carries the absolute path of whoever's machine
            # this is running on.
            svc.load_error = (
                "Model artefacts are not present on this instance: "
                + ", ".join(missing)
                if missing
                else f"Model could not be loaded: {type(e).__name__}: {e}"
            )
            logger.error(f"TS-TCN artefacts missing at startup: {e}")
        yield

    app = FastAPI(
        title="TS-TCN Fraud Classifier",
        description="Transaction-Sequence Temporal Convolutional Network "
                    "for explainable fraud detection. DeepSentinel — Member 3.",
        version=state.MODEL_VERSION,
        lifespan=lifespan,
    )
    app.state.service = service

    # The fusion engine (and, in dev, the dashboard directly) calls this
    # service from another origin. The contract declares an internal trusted
    # network with no auth, which is what makes a wildcard acceptable here.
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"],
        allow_methods=["GET", "POST"], allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        first = exc.errors()[0]
        loc = ".".join(str(x) for x in first["loc"] if x != "body")
        return JSONResponse(status_code=422, content=ErrorResponse(
            error="BadRequest", message=f"Field '{loc}': {first['msg']}",
        ).model_dump())

    app.include_router(classify_route.router, prefix="/api/v1")

    @app.get("/health")
    def health():
        return app.state.service.health()

    @app.get("/api/v1/runtime")
    def runtime():
        svc = app.state.service
        return {
            "service_uptime_seconds": round(time.time() - START_TS, 1),
            "serving_mode": "live_inference",
            "model_loaded": svc.loaded,
            **svc.health(),
            "note": ("Genuine request-time inference over a system-wide sliding "
                     "window — nothing is precomputed, so any transaction "
                     "advances the buffer, including accounts never seen in "
                     "training."),
        }

    return app


app = create_app()
