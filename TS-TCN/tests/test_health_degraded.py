"""The service's behaviour when its model artefacts are NOT on disk.

This is the state a fresh clone is in — the weights are gitignored and live on
Drive — so it is the state the fusion engine meets most often, and the one the
rest of the suite skips over. These tests need neither the artefacts nor
TensorFlow, so they run anywhere.

What they pin down is a single rule: the service must never claim it can score
when it cannot. A health check that answers "ok" without weights makes a dead
detector look live on the operator dashboard, and the fusion engine will count
it toward the modality total while every classify fails.
"""
import pytest
from fastapi.testclient import TestClient

from api import state
from api.main import app

pytestmark = pytest.mark.skipif(
    state.MODEL_PATH.exists() and state.SCALER_PATH.exists(),
    reason="artefacts are present, so the degraded path cannot be exercised",
)

client = TestClient(app)


def _tx(step: int = 1, amount: float = 5000.0):
    return {
        "nameOrig": "C1231006815",
        "step": step,
        "type": "TRANSFER",
        "amount": amount,
        "oldbalanceOrg": amount,
        "newbalanceOrig": 0.0,
        "oldbalanceDest": 0.0,
        "newbalanceDest": amount,
    }


def test_health_answers_without_artifacts():
    """The service must still start and answer — "down" and "no weights" are
    different states, and the fusion engine has to be able to tell them apart."""
    r = client.get("/health")
    assert r.status_code == 200


def test_health_reports_degraded_not_ok():
    body = client.get("/health").json()
    assert body["status"] == "degraded"
    assert body["ready"] is False
    assert body["model_loaded"] is False


def test_health_names_what_is_missing():
    """An operator should learn which files to fetch, not just that one is gone."""
    missing = client.get("/health").json()["missing_artifacts"]
    assert missing, "a degraded service must say what it is missing"
    assert any("ts_tcn" in m for m in missing)
    # Paths are repo-relative: a health body is not the place to publish
    # somebody's home directory.
    assert not any(m.startswith("/") for m in missing)


def test_health_does_not_import_tensorflow():
    """Health must stay cheap. Importing keras to answer a probe would make
    every health check cost hundreds of megabytes."""
    import sys

    client.get("/health")
    assert "tensorflow" not in sys.modules


def test_classify_is_503_not_500():
    """Missing weights is a deployment state, not a request bug. The fusion
    adapter treats 503 as "abstain for this request" and does not log an
    outage; a 500 would be recorded as a failure of the platform."""
    r = client.post("/api/v1/classify", json=_tx())
    assert r.status_code == 503
    assert "MODEL_UNAVAILABLE" in r.json()["detail"]


def test_classify_error_does_not_leak_absolute_paths():
    detail = client.post("/api/v1/classify", json=_tx()).json()["detail"]
    assert "/Users/" not in detail and "/home/" not in detail
