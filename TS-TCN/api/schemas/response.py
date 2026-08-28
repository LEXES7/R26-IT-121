"""Response schemas. Locked contract — see docs/api_contract.md (proposal
Appendix C). Field names here are read verbatim by the fusion engine's
adapter (DeepSentinel/backend/adapters/upstream.py::call_temporal_api) — do
not rename without updating both sides.
"""
from typing import Dict, Optional

from pydantic import BaseModel


class TransactionRef(BaseModel):
    nameOrig: str
    step: int
    composite_id: str


class CurrentTransactionEvidence(BaseModel):
    type: str
    amount: float
    drain_ratio: float
    post_transfer_ratio: float
    dest_was_empty: float
    dest_enrichment: float
    type_risk: float
    hour_of_day: float
    fraud_signal_summary: str


class Evidence(BaseModel):
    current_transaction: CurrentTransactionEvidence


class TriggeringPredecessor(BaseModel):
    nameOrig: str
    step: int
    composite_id: str
    attention_weight: float
    offset_from_current: int
    features: Dict[str, float | str]
    predecessor_signal: str


class ClassifyResponse(BaseModel):
    transaction_ref: TransactionRef
    temporal_risk_score: float
    risk_level: str
    detection_method: str = "TS-TCN"
    modality: str = "temporal_sequence"
    evidence: Evidence
    triggering_predecessor: Optional[TriggeringPredecessor] = None
    model_version: str
    inference_time_ms: float


class ErrorResponse(BaseModel):
    """Any non-200 is treated by the fusion engine as 'temporal unavailable'."""

    error: str
    message: str
