"""POST /api/v1/classify — main classification endpoint.

To be filled in during Stage 8.
"""
from fastapi import APIRouter

from ..schemas.request import ClassifyRequest
from ..schemas.response import ClassifyResponse

router = APIRouter()


@router.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest) -> ClassifyResponse:
    """Classify a single transaction using the system-wide deque buffer.

    The service maintains an internal `deque(maxlen=32)` shared across requests,
    populated by the FIFO arrival order of transactions. Fewer than 32
    transactions in the buffer returns 503 WARMING_UP.
    """
    raise NotImplementedError("Stage 8 — to be implemented in July.")
