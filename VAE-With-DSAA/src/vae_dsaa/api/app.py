"""FastAPI application — the behavioural modality of DeepSentinel.

    POST /api/v1/behavioral/classify   single transaction, what the fusion
                                       engine calls
    POST /api/v1/behavioral/score      batch, for evaluation runs
    GET  /health                       live operating parameters
    GET  /api/v1/behavioral/runtime    is the model actually serving?

All heavy state lives in a ``BehavioralPredictor`` built once at startup;
per-request work is feature engineering plus one VAE forward pass over seven
features, which is why latency sits in single-digit milliseconds against the
50 ms NFR.

Usage:
    python scripts/serve_api.py
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from vae_dsaa.api.schemas import (
    AnomalyFingerprint,
    ClassifyRequest,
    ClassifyResponse,
    CurrentTransaction,
    DimensionShare,
    ErrorResponse,
    Evidence,
    FeatureShare,
    FraudTypology,
    ResponseMetadata,
    RiskLevel,
    ScoreRequest,
    ScoreResponse,
    ScoreWeights,
    Signal1,
    Signal2,
    Signal3,
    VaeDiagnostics,
)
from vae_dsaa.inference.service import MODEL_VERSION, BehavioralPredictor

REPO_ROOT = Path(__file__).resolve().parents[3]
START_TS = time.time()


def _fmt(name: str, share: float, what: str) -> str:
    return f"{name} ({share:.0%} of {what})"


def build_response(req: ClassifyRequest, r: dict, protocol: str,
                   feature_set: str) -> ClassifyResponse:
    """Shape one scored transaction into the contract payload."""
    s1, s2, s3 = r["signal_1"], r["signal_2"], r["signal_3"]
    typ = r["typology"]
    return ClassifyResponse(
        transaction_id=req.transaction_id,
        composite_id=req.composite_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        model_version=MODEL_VERSION,
        feature_set=feature_set,
        transaction_type=req.type.value,
        behavioral_risk_score=r["behavioral_risk_score"],
        risk_level=RiskLevel(r["risk_level"]),
        vae_diagnostics=VaeDiagnostics(
            combined_anomaly_score=r["raw_score"],
            raw_score=r["raw_score"],
            threshold=r["raw_threshold"],
            calibrated_threshold=r["calibrated_threshold"],
            flagged=r["flagged"],
            stratum=r["stratum"],
            recon_z=r["z_terms"]["recon_z"],
            kl_z=r["z_terms"]["kl_z"],
            density_z=r["z_terms"]["density_z"],
            weights=ScoreWeights(**r["z_terms"]["weights"]),
            calibration_method=r["calibration_method"],
            is_control_stratum=(r["stratum"] == "PAYMENT"),
            out_of_training_distribution=r.get("out_of_training_distribution", False),
        ),
        anomaly_fingerprint=AnomalyFingerprint(
            signal_1_reconstruction_error=Signal1(
                dominant_feature_signal=_fmt(s1[0]["name"], s1[0]["share"],
                                             "reconstruction error")
                if s1 else "none",
                shares=[FeatureShare(feature=x["name"], share=x["share"],
                                     observed=x.get("observed"),
                                     reconstructed=x.get("reconstructed"))
                        for x in s1],
            ),
            signal_2_kl_divergence=Signal2(
                dominant_dimension_signal=_fmt(s2[0]["name"], s2[0]["share"],
                                               "KL divergence") if s2 else "none",
                shares=[DimensionShare(dimension=x["name"], share=x["share"])
                        for x in s2],
            ),
            signal_3_latent_density=Signal3(
                dominant_dimension_signal=_fmt(s3[0]["name"], s3[0]["share"],
                                               "latent density") if s3 else "none",
                shares=[DimensionShare(dimension=x["name"], share=x["share"])
                        for x in s3],
            ) if s3 else None,
        ),
        fraud_typology=FraudTypology(
            typology_label=typ.get("typology_label", "UNASSIGNED"),
            cluster_id=int(typ.get("cluster_id", -1)),
            confidence=float(typ.get("confidence", 0.0)),
            cluster_fraud_purity=typ.get("cluster_fraud_purity"),
            cluster_size=typ.get("cluster_size"),
            fatf_hint=typ.get("fatf_hint"),
            rationale=typ.get("rationale"),
        ),
        evidence=Evidence(
            current_transaction=CurrentTransaction(fraud_signal_summary=r["summary"])
        ),
        metadata=ResponseMetadata(
            inference_latency_ms=int(round(r["latency_ms"])),
            bundle=f"{protocol}__{feature_set}__{r['stratum']}",
            protocol=protocol,
            engineered_features=r["engineered_features"],
        ),
    )


def create_app(predictor: BehavioralPredictor | None = None) -> FastAPI:
    """App factory. Tests inject a predictor so the suite loads no bundles."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Heavy state is built once, here, and never during a request.
        if app.state.predictor is None:
            print("Loading behavioural bundles...", flush=True)
            p = BehavioralPredictor(REPO_ROOT)
            app.state.predictor = p
            print(f"Ready in {p.startup_seconds:.2f}s - strata "
                  f"{sorted(p.bundles)}, feature set {p.feature_set}", flush=True)
        yield

    app = FastAPI(title="DeepSentinel Behavioural Detector (Stratified VAE + DSAA)",
                  version=MODEL_VERSION, lifespan=lifespan)
    app.state.predictor = predictor

    # The DeepSentinel dashboard calls this service from another origin. The
    # contract declares an internal trusted network with no auth, which is what
    # makes a wildcard acceptable here and nowhere else.
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"],
        allow_methods=["GET", "POST"], allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        first = exc.errors()[0]
        loc = ".".join(str(x) for x in first["loc"] if x != "body")
        body = exc.body if isinstance(exc.body, dict) else {}
        return JSONResponse(status_code=422, content=ErrorResponse(
            transaction_id=body.get("transaction_id"),
            error="BadRequest",
            message=f"Field '{loc}': {first['msg']}",
        ).model_dump())

    def _ready() -> BehavioralPredictor | JSONResponse:
        p = app.state.predictor
        if p is None:
            # 503 is honest. Returning a neutral 0.5 would be a fabricated
            # opinion that the fusion engine cannot distinguish from a real one.
            return JSONResponse(status_code=503, content=ErrorResponse(
                error="ServiceUnavailable",
                message="bundles are still loading",
            ).model_dump())
        return p

    # ------------------------------------------------------------- health
    @app.get("/health")
    def health() -> JSONResponse:
        p = app.state.predictor
        if p is None:
            return JSONResponse(status_code=503,
                                content={"status": "loading",
                                         "model_version": MODEL_VERSION})
        return JSONResponse(content=p.health())

    @app.get("/api/v1/behavioral/runtime")
    def runtime() -> dict:
        p = app.state.predictor
        return {
            "service_uptime_seconds": round(time.time() - START_TS, 1),
            "serving_mode": "live_inference",
            "model_loaded": p is not None,
            "transactions_scored": getattr(p, "scored", 0),
            "mean_latency_ms": (round(p.latency_ms_total / p.scored, 2)
                                if p and p.scored else None),
            "note": ("Genuine request-time inference — nothing is precomputed, "
                     "so any transaction can be scored, including accounts "
                     "never seen in training."),
        }

    # ----------------------------------------------------------- classify
    @app.post("/api/v1/behavioral/classify", response_model=ClassifyResponse)
    def classify(req: ClassifyRequest):
        p = _ready()
        if isinstance(p, JSONResponse):
            return p
        r = p.classify(req.model_dump(mode="json"))
        return build_response(req, r, p.protocol, p.feature_set)

    @app.post("/api/v1/behavioral/score", response_model=ScoreResponse)
    def score_batch(req: ScoreRequest):
        p = _ready()
        if isinstance(p, JSONResponse):
            return p
        results = [build_response(t, p.classify(t.model_dump(mode="json")),
                                  p.protocol, p.feature_set)
                   for t in req.transactions]
        return ScoreResponse(model_version=MODEL_VERSION,
                             feature_set=p.feature_set,
                             count=len(results), results=results)

    return app


app = create_app()
