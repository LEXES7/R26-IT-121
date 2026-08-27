"""Request schema. Locked contract — see docs/api_contract.md.

Flat body, not nested under a "transaction" key: the fusion engine spreads
the full transaction dict and adds composite_id before POSTing
(backend/adapters/upstream.py::call_temporal_api), so this model declares the
fields classification actually needs and ignores the rest (nameDest,
isFlaggedFraud, transaction_id, composite_id, ...) rather than rejecting them.
"""
from pydantic import BaseModel, ConfigDict, Field


class ClassifyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    nameOrig: str
    step: int = Field(..., ge=1, le=744)
    type: str = Field(..., pattern="^(CASH_IN|CASH_OUT|DEBIT|PAYMENT|TRANSFER)$")
    amount: float = Field(..., ge=0.0)
    oldbalanceOrg: float = Field(..., ge=0.0)
    newbalanceOrig: float = Field(..., ge=0.0)
    oldbalanceDest: float = Field(..., ge=0.0)
    newbalanceDest: float = Field(..., ge=0.0)
