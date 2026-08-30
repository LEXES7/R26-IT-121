"""Tests for POST /api/v1/classify — run with `pytest tests/`.

Two layers, mirroring GraphSage's/VAE-With-DSAA's test structure:

  * Fast contract tests inject a FakeService (no TensorFlow, no model
    artefacts) and exercise the route/schema/error-shape contract. These
    always run, including in CI with no checkpoint present.
  * A real-model integration test drives the actual Stage 4 checkpoint end
    to end (buffer warm-up, fraud_attention, predecessor exclusion). Skipped
    when the artefacts are not present in the working copy (gitignored —
    see outputs/README.md).
"""
import pytest
from fastapi.testclient import TestClient

from api import state
from api.main import create_app


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


# ── Fast contract tests (FakeService, no TensorFlow) ────────────────────────


class FakeService:
    """Duck-types state.TSTCNService without touching TensorFlow or disk.

    `warm` controls how many `.classify()` calls succeed before the buffer
    reports full — mirrors WarmingUp without needing 32 real calls.
    """

    def __init__(self, warm_after: int = 0, raise_on_classify: Exception | None = None):
        self._warm_after = warm_after
        self._calls = 0
        self._raise = raise_on_classify
        self.loaded = True
        self.load_error = None
        self.startup_seconds = 0.01

    def load(self):
        pass

    def buffer_size(self) -> int:
        return min(self._calls, state.WINDOW_SIZE)

    def reset_buffer(self):
        self._calls = 0

    def health(self) -> dict:
        return {
            "status": "ok",
            "model_version": "fake-v0",
            "window_size": state.WINDOW_SIZE,
            "buffer_filled": self.buffer_size(),
            "warming_up": self._calls < self._warm_after,
            "threshold": 0.5,
            "startup_seconds": 0.01,
            "transactions_scored": self._calls,
            "mean_latency_ms": 1.0 if self._calls else None,
        }

    def classify(self, tx: dict) -> dict:
        self._calls += 1
        if self._raise is not None:
            raise self._raise
        if self._calls <= self._warm_after:
            raise state.WarmingUp(f"{self._calls}/{self._warm_after} buffered")
        return {
            "transaction_ref": {
                "nameOrig": tx["nameOrig"], "step": tx["step"],
                "composite_id": f"{tx['nameOrig']}_{tx['step']}",
            },
            "temporal_risk_score": 0.42,
            "risk_level": "SUSPICIOUS",
            "detection_method": "TS-TCN",
            "modality": "temporal_sequence",
            "evidence": {"current_transaction": {
                "type": tx["type"], "amount": tx["amount"], "drain_ratio": 0.5,
                "post_transfer_ratio": 0.5, "dest_was_empty": 0.0, "dest_enrichment": 0.5,
                "type_risk": 0.5, "hour_of_day": 0.5,
                "fraud_signal_summary": "fake summary",
            }},
            "triggering_predecessor": {
                "nameOrig": tx["nameOrig"], "step": tx["step"] - 1,
                "composite_id": f"{tx['nameOrig']}_{tx['step']-1}",
                "attention_weight": 0.9, "offset_from_current": -1,
                "features": {"type": "TRANSFER", "amount": 1.0, "drain_ratio": 0.5,
                             "post_transfer_ratio": 0.5, "dest_was_empty": 0.0, "type_risk": 0.5},
                "predecessor_signal": "fake predecessor signal",
            },
            "model_version": "fake-v0",
            "inference_time_ms": 1.0,
        }


def test_classify_happy_path_fake_service():
    app = create_app(service=FakeService())
    with TestClient(app) as client:
        r = client.post("/api/v1/classify", json=_tx(1))
        assert r.status_code == 200
        body = r.json()
        assert body["temporal_risk_score"] == 0.42
        assert body["risk_level"] == "SUSPICIOUS"
        assert body["triggering_predecessor"]["composite_id"] != body["transaction_ref"]["composite_id"]


def test_warming_up_returns_structured_503():
    app = create_app(service=FakeService(warm_after=2))
    with TestClient(app) as client:
        r = client.post("/api/v1/classify", json=_tx(1))
        assert r.status_code == 503
        body = r.json()
        assert body["error"] == "WarmingUp"
        assert "1/2 buffered" in body["message"]


def test_model_artifacts_missing_returns_structured_503():
    """503, not 500 — the endpoint's own comment and docs/api_contract.md both
    say so. Missing weights is a deployment state, not a fault in this request:
    the fusion adapter treats 503 as "abstain for this call" and keeps going,
    where a 500 is recorded as a platform failure and trips the circuit."""
    app = create_app(service=FakeService(raise_on_classify=state.ModelArtifactsMissing("no checkpoint")))
    with TestClient(app) as client:
        r = client.post("/api/v1/classify", json=_tx(1))
        assert r.status_code == 503
        assert r.json()["error"] == "MODEL_UNAVAILABLE"


def test_unexpected_exception_returns_structured_500_not_a_trace():
    app = create_app(service=FakeService(raise_on_classify=RuntimeError("boom")))
    with TestClient(app) as client:
        r = client.post("/api/v1/classify", json=_tx(1))
        assert r.status_code == 500
        assert "RuntimeError" in r.json()["message"]


def test_malformed_request_returns_structured_422():
    app = create_app(service=FakeService())
    with TestClient(app) as client:
        bad = _tx(1)
        bad["type"] = "NOT_A_REAL_TYPE"
        r = client.post("/api/v1/classify", json=bad)
        assert r.status_code == 422
        body = r.json()
        assert body["error"] == "BadRequest"
        assert "type" in body["message"]


def test_health_and_runtime_endpoints():
    app = create_app(service=FakeService())
    with TestClient(app) as client:
        h = client.get("/health").json()
        assert h["status"] == "ok"
        rt = client.get("/api/v1/runtime").json()
        assert rt["model_loaded"] is True
        assert "service_uptime_seconds" in rt


def test_cors_header_present():
    app = create_app(service=FakeService())
    with TestClient(app) as client:
        r = client.post("/api/v1/classify", json=_tx(1), headers={"Origin": "http://localhost:5173"})
        assert r.headers.get("access-control-allow-origin") == "*"


# ── Real-model integration test (needs the actual Stage 4 checkpoint) ──────

_real_service = state.TSTCNService()
pytestmark_real = pytest.mark.skipif(
    not (_real_service.model_path.exists() and _real_service.scaler_path.exists()),
    reason="TS-TCN model/scaler artefacts not present in this working copy",
)


@pytestmark_real
def test_warming_up_then_classifies_real_model():
    app = create_app(service=state.TSTCNService())
    with TestClient(app) as client:
        for step in range(1, state.WINDOW_SIZE):
            r = client.post("/api/v1/classify", json=_tx(step))
            assert r.status_code == 503, (step, r.status_code, r.text)
            assert r.json()["error"] == "WarmingUp"

        r = client.post("/api/v1/classify", json=_tx(state.WINDOW_SIZE))
        assert r.status_code == 200
        body = r.json()

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

        health = client.get("/health").json()
        assert health["buffer_filled"] == state.WINDOW_SIZE
        assert health["warming_up"] is False
