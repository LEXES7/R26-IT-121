"""POST /api/v1/classify — main classification endpoint.

Per docs/api_contract.md: classifies the current transaction against the
system-wide 32-transaction rolling window owned by the app's TSTCNService
(request.app.state.service — see api/main.py's lifespan / create_app).
"""
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import state
from ..schemas.request import ClassifyRequest
from ..schemas.response import ClassifyResponse, ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest, request: Request):
    """Classify a single transaction using the system-wide deque buffer.

    The service maintains an internal `deque(maxlen=32)` shared across
    requests, populated by the FIFO arrival order of transactions. Fewer than
    32 transactions in the buffer returns 503 WarmingUp — normal for the
    first 31 requests after a (re)start, not a failure.
    """
    service: state.TSTCNService = request.app.state.service

    try:
        result = service.classify(req.model_dump())
    except state.WarmingUp as e:
        logger.info(f"TS-TCN warming up: {e}")
        return JSONResponse(status_code=503, content=ErrorResponse(
            error="WarmingUp",
            message=f"Rolling window buffer not yet full: {e}",
        ).model_dump())
    except state.ModelArtifactsMissing as e:
        # 503, not 500. The service is healthy and correctly configured; it
        # simply has no weights on disk yet, which is a deployment state rather
        # than a bug in this request. The fusion adapter already treats 503 as
        # "unavailable for this request" and abstains instead of logging an
        # outage — exactly the right behaviour here.
        logger.error(f"TS-TCN model artefacts missing: {e}")
        return JSONResponse(status_code=503, content=ErrorResponse(
            error="ModelUnavailable", message=str(e),
        ).model_dump())
    except Exception as e:  # noqa: BLE001 — surface as a structured 500, never a bare trace
        logger.exception("TS-TCN inference failed")
        return JSONResponse(status_code=500, content=ErrorResponse(
            error="InternalError", message=f"{type(e).__name__}: {e}",
        ).model_dump())

    return ClassifyResponse(**result)
