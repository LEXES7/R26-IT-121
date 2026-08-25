"""Contract test: TS-TCN service <-> fusion engine.

Verifies every field backend/adapters/upstream.py::call_temporal_api reads
is present and correctly typed, and that the buffer's cold-start behaviour
matches src/data/window_builder.py's training-time semantics exactly — the
current transaction is never a predecessor of itself, so cold start takes
32 calls (windows_metadata.json: cold_start_skipped == 32), not 31.

Uses a fake model/scaler injected via api.main.create_app's factory — no
TensorFlow import, no dependency on best_tstcn.keras existing on disk. This
is what lets the test run in CI before the trained model file is checked in.

Run with `pytest tests/` (from the TS-TCN directory, matching the other
tests here).
"""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.constants import WINDOW_SIZE
from api.main import create_app

TYPE_RISK_WEIGHTS = {
    "CASH_OUT": 0.5014457464617258,
    "TRANSFER": 0.49855425353827426,
    "CASH_IN": 0.0,
    "DEBIT": 0.0,
    "PAYMENT": 0.0,
}


class _IdentityScaler:
    """Stands in for the fitted StandardScaler — this test is about the
    service's request/response contract, not real score calibration."""

    def transform(self, X):
        return np.asarray(X, dtype=np.float32)


class _FakeModel:
    """Deterministic two-output model: fixed fraud probability, attention
    peaked at a known buffer position, so the response can be asserted
    exactly rather than merely type-checked."""

    PEAK_BUFFER_INDEX = 10  # -> offset_from_current = WINDOW_SIZE - 10 = 22

    def __call__(self, window, training=False):
        batch = window.shape[0]
        fraud_prob = np.full((batch, 1), 0.87, dtype=np.float32)
        attn = np.zeros((batch, WINDOW_SIZE), dtype=np.float32)
        attn[:, self.PEAK_BUFFER_INDEX] = 1.0
        return fraud_prob, attn


def _transaction(i: int) -> dict:
    """A synthetic PaySim-shaped transaction, matching what
    backend/adapters/upstream.py::call_temporal_api actually sends: the
    flat transaction fields plus the composite_id the adapter computes."""
    return {
        "step": i,
        "type": "TRANSFER",
        "amount": 1000.0 + i,
        "nameOrig": f"C{i}",
        "nameDest": f"D{i}",
        "oldbalanceOrg": 1000.0 + i,
        "newbalanceOrig": 0.0,
        "oldbalanceDest": 0.0,
        "newbalanceDest": 1000.0 + i,
        "isFlaggedFraud": 0,
        "composite_id": f"C{i}_{i}",
    }


@pytest.fixture
def client():
    app = create_app(
        model=_FakeModel(),
        scaler=_IdentityScaler(),
        type_risk_weights=TYPE_RISK_WEIGHTS,
    )
    with TestClient(app) as c:
        yield c


def test_health_reports_model_loaded(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["detection_method"] == "TS-TCN"


def test_cold_start_matches_window_builder_semantics(client):
    """The 32nd call must still be WARMING_UP; only the 33rd gets a window —
    see the module docstring for why this isn't calls 1-31."""
    for i in range(1, WINDOW_SIZE + 1):
        r = client.post("/api/v1/classify", json=_transaction(i))
        assert r.status_code == 503, f"call {i} should warm up, got {r.status_code}"
        body = r.json()
        assert body["error"] == "WARMING_UP"
        assert body["buffer_size"] == i
        assert body["required"] == WINDOW_SIZE

    r = client.post("/api/v1/classify", json=_transaction(WINDOW_SIZE + 1))
    assert r.status_code == 200, r.text


# Field paths (dot-separated) backend/adapters/upstream.py::call_temporal_api
# reads directly, and the python type(s) it expects at each.
REQUIRED_ADAPTER_FIELDS = {
    "temporal_risk_score": (int, float),
    "step_burstiness": (int, float),
    "flagging_miss_rate": (int, float),
    "detection_method": (str,),
    "evidence.current_transaction.fraud_signal_summary": (str,),
    "triggering_predecessor.attention_weight": (int, float),
    "triggering_predecessor.predecessor_signal": (str,),
}


def _dig(body: dict, dotted_path: str):
    node = body
    for part in dotted_path.split("."):
        assert part in node, f"missing '{part}' on path '{dotted_path}'"
        node = node[part]
    return node


def test_response_has_every_field_the_fusion_adapter_reads(client):
    """This is the guardrail: if this passes and the service is reachable at
    TEMPORAL_API_BASE, call_temporal_api can parse its response."""
    for i in range(1, WINDOW_SIZE + 1):
        client.post("/api/v1/classify", json=_transaction(i))

    r = client.post("/api/v1/classify", json=_transaction(WINDOW_SIZE + 1))
    assert r.status_code == 200
    body = r.json()

    for path, types in REQUIRED_ADAPTER_FIELDS.items():
        value = _dig(body, path)
        assert isinstance(value, types), f"{path} is {type(value)}, expected {types}"

    assert 0.0 <= body["temporal_risk_score"] <= 1.0
    assert 0.0 <= body["triggering_predecessor"]["attention_weight"] <= 1.0


def test_peak_attention_identifies_correct_predecessor(client):
    """triggering_predecessor must point at the buffer position the model's
    attention actually peaked on, not just be well-typed."""
    for i in range(1, WINDOW_SIZE + 1):
        client.post("/api/v1/classify", json=_transaction(i))

    r = client.post("/api/v1/classify", json=_transaction(WINDOW_SIZE + 1))
    body = r.json()

    # Buffer holds transactions 1..32 in feed order; _FakeModel peaks
    # attention at buffer index 10 -> the 11th transaction fed (i=11).
    expected_offset = WINDOW_SIZE - _FakeModel.PEAK_BUFFER_INDEX
    tp = body["triggering_predecessor"]
    assert tp["offset_from_current"] == expected_offset
    assert tp["composite_id"] == "C11_11"
    assert tp["attention_weight"] == pytest.approx(1.0)
    assert set(tp["peak_features"].keys()) == {
        "drain_ratio", "log_amount", "post_transfer_ratio", "dest_was_empty",
        "dest_enrichment", "type_risk_weight", "inv_dest_ratio", "amt_to_orig",
        "hour_of_day", "day_of_week",
    }


def test_risk_level_thresholds():
    """NORMAL < 0.4431 <= SUSPICIOUS < 0.90 <= CRITICAL, imported straight
    from the route module so this breaks if the tuned threshold drifts."""
    from api.routes.classify import _risk_level

    assert _risk_level(0.0) == "NORMAL"
    assert _risk_level(0.4430) == "NORMAL"
    assert _risk_level(0.4431) == "SUSPICIOUS"
    assert _risk_level(0.8999) == "SUSPICIOUS"
    assert _risk_level(0.90) == "CRITICAL"
    assert _risk_level(1.0) == "CRITICAL"


def test_model_not_loaded_degrades_gracefully(tmp_path):
    """If best_tstcn.keras isn't present, the service must not crash — it
    starts, reports model_not_loaded, and returns a non-2xx status the
    fusion adapter already treats as 'unavailable'."""
    app = create_app(
        model=None,
        scaler=_IdentityScaler(),
        type_risk_weights=TYPE_RISK_WEIGHTS,
        model_path=tmp_path / "does_not_exist.keras",
    )
    with TestClient(app) as client:
        health = client.get("/health").json()
        assert health["status"] == "model_not_loaded"

        r = client.post("/api/v1/classify", json=_transaction(1))
        assert r.status_code == 503
        assert r.json()["error"] == "MODEL_NOT_LOADED"
