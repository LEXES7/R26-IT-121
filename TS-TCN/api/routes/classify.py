"""POST /api/v1/classify — main classification endpoint.

Per docs/api_contract.md: classifies the current transaction against the
system-wide 32-transaction rolling window maintained in api/state.py.
"""
import logging

from fastapi import APIRouter, HTTPException

from .. import state
from ..schemas.request import ClassifyRequest
from ..schemas.response import ClassifyResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest) -> ClassifyResponse:
    """Classify a single transaction using the system-wide deque buffer.

    The service maintains an internal `deque(maxlen=32)` shared across
    requests, populated by the FIFO arrival order of transactions. Fewer than
    32 transactions in the buffer returns 503 WARMING_UP — normal for the
    first 31 requests after a (re)start, not a failure.
    """
    try:
        result = state.classify(req.model_dump())
    except state.WarmingUp as e:
        raise HTTPException(status_code=503, detail=f"WARMING_UP: {e}") from e
    except state.ModelArtifactsMissing as e:
        # 503, not 500. The service is healthy and correctly configured; it
        # simply has no weights on disk yet, which is a deployment state rather
        # than a bug in this request. The fusion adapter already treats 503 as
        # "unavailable for this request" and abstains instead of logging an
        # outage — exactly the right behaviour here.
        #
        # The message names the files relative to the repo: the exception text
        # carries absolute paths, and an error body is not the place to publish
        # someone's home directory.
        logger.error(f"TS-TCN model artefacts missing: {e}")
        raise HTTPException(
            status_code=503,
            detail="MODEL_UNAVAILABLE: model artefacts are not present on this "
                   f"instance ({', '.join(state.missing_artifacts())}). See "
                   "docs/api_contract.md, 'Model status caveat'.",
        ) from e
    except Exception as e:  # noqa: BLE001 — surface as a 500, never a bare 502/tracer
        logger.exception("TS-TCN inference failed")
        raise HTTPException(status_code=500, detail=f"INTERNAL_ERROR: {type(e).__name__}: {e}") from e

    return ClassifyResponse(**result)
