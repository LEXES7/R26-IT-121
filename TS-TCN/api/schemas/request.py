"""Request schemas. Locked contract — see docs/api_contract.md."""
from pydantic import BaseModel, Field


class TransactionPayload(BaseModel):
    step: int = Field(..., ge=1, le=744)
    type: str = Field(..., pattern="^(CASH_IN|CASH_OUT|DEBIT|PAYMENT|TRANSFER)$")
    amount: float = Field(..., ge=0.0)
    nameOrig: str
    oldbalanceOrg: float = Field(..., ge=0.0)
    newbalanceOrig: float = Field(..., ge=0.0)
    nameDest: str
    oldbalanceDest: float = Field(..., ge=0.0)
    newbalanceDest: float = Field(..., ge=0.0)


class ClassifyRequest(BaseModel):
    transaction: TransactionPayload
