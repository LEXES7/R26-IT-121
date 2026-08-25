"""Response schemas. Locked contract — see docs/api_contract.md."""
from typing import Dict, List
from pydantic import BaseModel, Field


class Attribution(BaseModel):
    peak_position: int = Field(..., ge=0, le=31)
    peak_weight: float = Field(..., ge=0.0, le=1.0)
    peak_transaction_id: str
    peak_features: Dict[str, float]
    attention_distribution: List[float] = Field(..., min_items=32, max_items=32)


class ClassifyResponse(BaseModel):
    composite_id: str
    fraud_probability: float = Field(..., ge=0.0, le=1.0)
    fraud_label: int = Field(..., ge=0, le=1)
    threshold_used: float = Field(..., ge=0.0, le=1.0)
    attribution: Attribution
    model_version: str = "ts-tcn-v1.0"
    inference_time_ms: float
