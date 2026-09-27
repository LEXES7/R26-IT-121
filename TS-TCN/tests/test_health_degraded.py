"""The service's behaviour when its model artefacts are NOT on disk.

This is the state a fresh clone is in — the weights are gitignored and live on
Drive — so it is the state the fusion engine meets most often, and the one the
rest of the suite skips over. These tests need neither the artefacts nor
TensorFlow, so they run anywhere.

What they pin down is a single rule: the service must never report itself as
`ok` when it cannot score. The fusion engine reads /health to decide whether
the detector contributes to a verdict, so a service that answers "ok" without
weights makes a dead detector look live on the operator dashboard and inflates
the modality count behind every fused score.
"""
import pytest
from fastapi.testclient import TestClient

from api import state
from api.main import app

_svc = state.TSTCNService()

pytestmark = pytest.mark.skipif(
    _svc.model_path.exists() and _svc.scaler_path.exists(),
    reason="artefacts are present, so the degraded path cannot be exercised",
)

# The service is built in the app's lifespan, so the client has to be entered
# as a context manager — outside one, Starlette skips startup and every route
# sees app.state.service as None.
@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


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


def test_health_answers_without_artifacts(client):
    """The service must still start and answer — "down" and "no weights" are
    different states, and the fusion engine has to tell them apart."""
    assert client.get("/health").status_code == 200


def test_health_does_not_claim_ok_without_a_model(client):
    """The load-bearing assertion. Anything but "ok" is acceptable here; "ok"
    is not, because that is what the fusion engine counts as a live detector."""
    body = client.get("/health").json()
    assert body["status"] != "ok"
    assert body["status"] in {"loading", "error"}


def test_health_does_not_import_tensorflow(client):
    """Health must stay cheap. Importing keras to answer a probe would make
    every health check cost hundreds of megabytes."""
    import sys

    client.get("/health")
    assert "tensorflow" not in sys.modules


def test_classify_does_not_return_a_success_body(client):
    """Whatever the status code, a request that could not be scored must never
    come back looking like a score."""
    r = client.post("/api/v1/classify", json=_tx())
    assert r.status_code >= 400
    assert "temporal_risk_score" not in r.text


def test_error_does_not_leak_absolute_paths(client):
    """An error body is not the place to publish somebody's home directory."""
    text = client.post("/api/v1/classify", json=_tx()).text
    assert "/Users/" not in text and "/home/" not in text


def test_health_error_does_not_leak_absolute_paths(client):
    """/health is read over the network by the fusion engine and by ops."""
    assert "/Users/" not in client.get("/health").text
