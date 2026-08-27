"""Integration tests for POST /api/v1/classify — run with `pytest tests/`.

Exercises the real Stage 4 sanity checkpoint end to end (warm-up behaviour,
response shape, predecessor exclusion), so it is skipped rather than failed
when the model/scaler artefacts are not present in the working copy (they are
gitignored — see outputs/README.md).
"""
import pytest
from fastapi.testclient import TestClient

from api import state
from api.main import app

pytestmark = pytest.mark.skipif(
    not (state.MODEL_PATH.exists() and state.SCALER_PATH.exists()),
    reason="TS-TCN model/scaler artefacts not present in this working copy",
)


def _tx(step: int, name_orig: str = "C1231006815", amount: float = 5000.0):
    return {
        "nameOrig": name_orig,
        "step": step,
        "type": "TRANSFER",
        "amount": amount,
        "oldbalanceOrg": amount,
        "newbalanceOrig": 0.0,
        "oldbalanceDest": 0.0,
        "newbalanceDest": amount,
    }


@pytest.fixture(autouse=True)
def _clean_buffer():
    state.reset_buffer()
    yield
    state.reset_buffer()


def test_warming_up_then_classifies():
    client = TestClient(app)

    # First 31 transactions: buffer below the window size, service is warming up.
    for step in range(1, state.WINDOW_SIZE):
        resp = client.post("/api/v1/classify", json=_tx(step))
        assert resp.status_code == 503
        assert "WARMING_UP" in resp.json()["detail"]

    # 32nd transaction completes the window — first real classification.
    resp = client.post("/api/v1/classify", json=_tx(state.WINDOW_SIZE))
    assert resp.status_code == 200
    body = resp.json()

    assert 0.0 <= body["temporal_risk_score"] <= 1.0
    assert body["risk_level"] in {"NORMAL", "SUSPICIOUS", "CRITICAL"}
    assert body["detection_method"] == "TS-TCN"
    assert body["modality"] == "temporal_sequence"
    assert body["transaction_ref"]["composite_id"] == f"C1231006815_{state.WINDOW_SIZE}"
    assert "fraud_signal_summary" in body["evidence"]["current_transaction"]

    predecessor = body["triggering_predecessor"]
    assert predecessor is not None
    assert 0.0 <= predecessor["attention_weight"] <= 1.0
    # Never picks the current transaction as its own predecessor.
    assert predecessor["composite_id"] != body["transaction_ref"]["composite_id"]
    assert predecessor["offset_from_current"] < 0


def test_health_reports_buffer_fill():
    client = TestClient(app)
    for step in range(1, 5):
        client.post("/api/v1/classify", json=_tx(step))

    health = client.get("/health").json()
    assert health["buffer_filled"] == 4
    assert health["warming_up"] is True
