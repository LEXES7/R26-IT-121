"""Response schema — EXACTLY matches what backend/adapters/upstream.py::
call_temporal_api reads, plus safe additive fields for the fusion engine's
Step 4 (temporal_evidence) and the TemporalEvidence.jsx panel.

Fields the adapter reads directly — do not rename or remove:
    temporal_risk_score
    evidence.current_transaction.fraud_signal_summary
    step_burstiness
    triggering_predecessor.attention_weight
    triggering_predecessor.predecessor_signal
    flagging_miss_rate
    detection_method

Everything else here is additive: the adapter ignores unknown fields, but
`triggering_predecessor` is forwarded to `extra` *whole*, so anything added
inside it (composite_id, offset_from_current, peak_features) survives into
the fusion engine and is available downstream. See docs/api_contract.md.
"""
from typing import Dict, Optional

from pydantic import BaseModel, Field


class CurrentTransactionEvidence(BaseModel):
    fraud_signal_summary: str


class Evidence(BaseModel):
    current_transaction: CurrentTransactionEvidence


class TriggeringPredecessor(BaseModel):
    """The predecessor in the 32-window the model attended to most."""

    composite_id: str = Field(..., description='"{nameOrig}_{step}" of the peak predecessor')
    attention_weight: float = Field(..., ge=0.0, le=1.0)
    predecessor_signal: str
    offset_from_current: int = Field(
        ..., ge=1, le=32,
        description="How many transactions back the peak predecessor sits (1 = immediately prior).",
    )
    peak_features: Dict[str, float] = Field(
        default_factory=dict,
        description="F1–F10 feature values of the peak predecessor (unscaled, for readability).",
    )


class ClassifyResponse(BaseModel):
    composite_id: str
    temporal_risk_score: float = Field(..., ge=0.0, le=1.0)
    risk_level: str = Field(..., description="NORMAL | SUSPICIOUS | CRITICAL")
    step_burstiness: float
    flagging_miss_rate: Optional[float] = None
    detection_method: str = "TS-TCN"
    triggering_predecessor: TriggeringPredecessor
    evidence: Evidence
    model_version: str = "ts-tcn-v1.0"
    inference_time_ms: float


class WarmingUpResponse(BaseModel):
    """Body returned with HTTP 503 while the rolling buffer has < 32 transactions.

    The fusion adapter has no special-case handling for this — any non-2xx
    response falls into its generic except branch and degrades to
    available=False, exactly like an unreachable service. No adapter change
    needed for this to work.
    """

    error: str = "WARMING_UP"
    message: str
    buffer_size: int
    required: int = 32
