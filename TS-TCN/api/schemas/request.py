"""Request schema — aligned to the LIVE fusion-engine adapter.

backend/adapters/upstream.py::call_temporal_api POSTs the transaction fields
FLAT at the top level (not nested under a "transaction" key), plus a
composite_id it computes itself as f"{nameOrig}_{step}":

    payload = {**transaction, "composite_id": f"{name_orig}_{step}"}
    client.post(f"{base_url}/api/v1/classify", json=payload, ...)

This is a single transaction, not a window — the service owns its own
rolling deque(maxlen=32) of predecessor feature vectors (see routes/classify.py)
and assembles the (1, 32, 10) model input itself. See docs/api_contract.md
for the full rationale.
"""
from pydantic import BaseModel, Field


class ClassifyRequest(BaseModel):
    step: int = Field(..., ge=1, le=744)
    type: str = Field(..., pattern="^(CASH_IN|CASH_OUT|DEBIT|PAYMENT|TRANSFER)$")
    amount: float = Field(..., ge=0.0)
    nameOrig: str
    nameDest: str
    oldbalanceOrg: float = Field(..., ge=0.0)
    newbalanceOrig: float = Field(..., ge=0.0)
    oldbalanceDest: float = Field(..., ge=0.0)
    newbalanceDest: float = Field(..., ge=0.0)
    isFlaggedFraud: int = Field(default=0, ge=0, le=1)
    composite_id: str = Field(
        ...,
        description='"{nameOrig}_{step}" — computed by the fusion adapter, '
                    "used as this transaction’s identity in the response.",
    )
