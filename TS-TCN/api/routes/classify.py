"""POST /api/v1/classify — the buffer-based classification endpoint.

Receives ONE transaction per call (the fusion adapter has no other way to
call it — see docs/api_contract.md). Computes its F1-F10 features by reusing
src/data/features.py::compute_features (the same formulas Stage 1/3 used for
training, not reimplemented here), scales them with the fitted
training-partition scaler, and folds them into the service-wide rolling
buffer on app.state.

Buffer ordering deliberately mirrors src/data/window_builder.py: a window is
assembled from the buffer AS IT STOOD BEFORE this transaction was appended,
so the current transaction is never a predecessor of itself — exactly how
training windows were built (confirmed against
outputs/stage3_windows/windows_metadata.json: cold_start_skipped == 32,
i.e. the first 32 transactions in a stream produce no window; the 33rd does,
using the 32 before it). Cold start here works the same way: the first 32
calls buffer up and return 503 WARMING_UP; the 33rd is the first classification.
"""
from __future__ import annotations

import time
from collections import deque

import numpy as np
import pandas as pd
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.data.features import FEATURE_NAMES, compute_features

from ..constants import THRESHOLD_CRITICAL, THRESHOLD_SUSPICIOUS, WINDOW_SIZE
from ..schemas.request import ClassifyRequest
from ..schemas.response import (
    ClassifyResponse,
    CurrentTransactionEvidence,
    Evidence,
    TriggeringPredecessor,
    WarmingUpResponse,
)

router = APIRouter()

# TODO(review): static baseline constant from the M3 rule-based baseline
# study (Stage 2), not a per-request statistic. flagging_miss_rate describes
# how often naive rule-based flagging misses fraud this model catches —
# that's a property of an evaluation run, not of one transaction, so it
# can't be computed from a single call without a labelled rolling window.
# Replace with a live statistic if the forensic report should reflect
# recent performance rather than the fixed baseline-study number.
FLAGGING_MISS_RATE = 0.998


def _extract_raw_features(tx: dict, type_risk_weights: dict) -> dict:
    """Compute F1-F10 for one transaction, reusing the training feature code."""
    df = pd.DataFrame([tx])
    out = compute_features(df, type_risk_weights)
    return {name: float(out.iloc[0][name]) for name in FEATURE_NAMES}


def _risk_level(score: float) -> str:
    if score >= THRESHOLD_CRITICAL:
        return "CRITICAL"
    if score >= THRESHOLD_SUSPICIOUS:
        return "SUSPICIOUS"
    return "NORMAL"


def _step_burstiness(buffer: deque, current_step: int) -> float:
    """Proxy for the Goh-Barabasi burstiness coefficient.

    TODO(review): this is the share of the window (buffer + the current
    transaction) that shares the current transaction's `step` — a same-step
    concentration proxy, not the real inter-arrival-time-variance formula
    the burstiness coefficient is defined by. Placeholder pending your
    review; swap in the real B-coefficient computation if you have one.
    """
    same_step = sum(1 for e in buffer if e["step"] == current_step) + 1
    return min(1.0, same_step / (len(buffer) + 1))


def _predecessor_signal(features: dict, offset: int) -> str:
    """Short human-readable description of the peak predecessor — this is
    the LLM report anchor, so it needs to read as a checkable claim, not a
    template label."""
    bits = []
    if features["drain_ratio"] >= 0.9:
        bits.append("emptied its origin account")
    elif features["drain_ratio"] >= 0.5:
        bits.append("moved most of its origin balance")
    if features["dest_was_empty"] >= 0.5:
        bits.append("into a previously empty destination")
    if features["type_risk_weight"] >= 0.4:
        bits.append("of a transaction type disproportionately linked to fraud")
    detail = ", ".join(bits) if bits else "an unremarkable-looking transfer"
    plural = "transaction" if offset == 1 else "transactions"
    return f"{offset} {plural} earlier, a transfer {detail}."


@router.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest, request: Request):
    """Classify a single transaction using the service-wide rolling buffer.

    The service maintains a shared `deque(maxlen=32)` on app.state, populated
    by call order. Fewer than 32 predecessor transactions in the buffer
    returns 503 WARMING_UP.
    """
    t0 = time.perf_counter()
    state = request.app.state

    if state.model is None:
        return JSONResponse(
            status_code=503,
            content={
                "error": "MODEL_NOT_LOADED",
                "message": "TS-TCN model artifact is not loaded on this instance.",
            },
        )

    tx = req.model_dump()
    raw_features = _extract_raw_features(tx, state.type_risk_weights)
    scaled = state.scaler.transform(
        np.array([[raw_features[n] for n in FEATURE_NAMES]], dtype=np.float32)
    )[0]

    buffer: deque = state.buffer
    entry = {
        "composite_id": req.composite_id,
        "step": req.step,
        "scaled_features": scaled,
        "raw_features": raw_features,
    }

    if len(buffer) < WINDOW_SIZE:
        buffer.append(entry)
        return JSONResponse(
            status_code=503,
            content=WarmingUpResponse(
                message=f"Rolling buffer has {len(buffer)}/{WINDOW_SIZE} transactions.",
                buffer_size=len(buffer),
            ).model_dump(),
        )

    window = np.stack([e["scaled_features"] for e in buffer], axis=0)[np.newaxis, ...]
    fraud_prob_t, attn_t = state.model(window, training=False)
    fraud_probability = float(np.asarray(fraud_prob_t)[0, 0])
    attention = np.asarray(attn_t)[0]

    peak_idx = int(np.argmax(attention))
    peak_weight = float(attention[peak_idx])
    peak_entry = buffer[peak_idx]
    # buffer[0] is the oldest predecessor (offset WINDOW_SIZE), buffer[-1]
    # the most recent (offset 1) — see module docstring on ordering.
    offset_from_current = WINDOW_SIZE - peak_idx

    step_burstiness = _step_burstiness(buffer, req.step)
    predecessor_signal = _predecessor_signal(peak_entry["raw_features"], offset_from_current)
    fraud_signal_summary = (
        f"Step burstiness coefficient: {step_burstiness:.4f}. "
        f"Triggering predecessor: {predecessor_signal}"
    )

    response = ClassifyResponse(
        composite_id=req.composite_id,
        temporal_risk_score=round(fraud_probability, 4),
        risk_level=_risk_level(fraud_probability),
        step_burstiness=round(step_burstiness, 4),
        flagging_miss_rate=FLAGGING_MISS_RATE,
        detection_method="TS-TCN",
        triggering_predecessor=TriggeringPredecessor(
            composite_id=peak_entry["composite_id"],
            attention_weight=round(peak_weight, 4),
            predecessor_signal=predecessor_signal,
            offset_from_current=offset_from_current,
            peak_features=peak_entry["raw_features"],
        ),
        evidence=Evidence(
            current_transaction=CurrentTransactionEvidence(
                fraud_signal_summary=fraud_signal_summary,
            ),
        ),
        model_version="ts-tcn-v1.0",
        inference_time_ms=round((time.perf_counter() - t0) * 1000, 2),
    )

    buffer.append(entry)

    return response
