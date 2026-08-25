"""Contract tests for the behavioural API.

A ``FakePredictor`` is injected, so the suite never loads a trained bundle and
runs in milliseconds. The point of these tests is the *contract* — the exact
field names and shapes the fusion engine reads — not the model.

The critical one is ``test_adapter_reads_every_field_it_needs``: the adapter in
``fusion_engine/DeepSentinel/backend/adapters/upstream.py`` uses ``.get()`` with
defaults everywhere, so a renamed or missing field produces no error at all —
the modality reports itself available and silently contributes a neutral 0.5.
That failure is invisible in production, so it has to be caught here.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from vae_dsaa.api.app import create_app
from vae_dsaa.inference.service import ROUTE, build_summary


class FakePredictor:
    """Duck-typed stand-in for BehavioralPredictor."""

    protocol = "clean"
    feature_set = "FS-ORIGIN"

    def __init__(self):
        self.scored = 0
        self.latency_ms_total = 0.0
        self.startup_seconds = 0.0
        self.bundles = {"TRANSFER": None, "CASH_OUT": None,
                        "PAYMENT": None, "GLOBAL": None}

    def stratum_for(self, txn_type):
        return ROUTE.get(str(getattr(txn_type, "value", txn_type)).upper(), "GLOBAL")

    def classify(self, tx):
        stratum = self.stratum_for(tx.get("type"))
        flagged = float(tx.get("amount", 0)) > 1000
        raw = 7.8124 if flagged else 0.42
        prob = 0.8734 if flagged else 0.0123
        s1 = [{"name": "F4_balance_change_ratio", "share": 0.41},
              {"name": "F3_balance_consistency", "share": 0.23}]
        s2 = [{"name": "dim_3", "share": 0.36}, {"name": "dim_7", "share": 0.31}]
        s3 = [{"name": "dim_1", "share": 0.28}]
        typ = {"typology_label": "PASS_THROUGH_MULE", "cluster_id": 0,
               "confidence": 0.83, "cluster_fraud_purity": 0.985,
               "cluster_size": 267, "fatf_hint": "FATF-003",
               "rationale": "destination ends at zero after receiving funds"}
        self.scored += 1
        from vae_dsaa.inference.service import OUT_OF_TRAINING_TYPES
        txn_type = str(getattr(tx.get("type"), "value", tx.get("type"))).upper()
        extrapolated = txn_type in OUT_OF_TRAINING_TYPES
        return {
            "stratum": stratum,
            "transaction_type": txn_type,
            "out_of_training_distribution": extrapolated, "behavioral_risk_score": prob,
            "risk_level": "CRITICAL" if flagged else "LOW", "flagged": flagged,
            "raw_score": raw, "raw_threshold": 1.7285,
            "calibrated_threshold": 0.208016,
            "z_terms": {"recon_z": 5.21, "kl_z": 1.84, "density_z": 0.76,
                        "weights": {"alpha": 0.5, "beta": 0.3, "gamma": 0.2}},
            "signal_1": s1, "signal_2": s2, "signal_3": s3, "typology": typ,
            "engineered_features": {"F1_log_amount": 5.2},
            "summary": build_summary(stratum, raw, 1.7285, flagged, prob,
                                     "CRITICAL" if flagged else "LOW", s1, s2, typ,
                                     extrapolated=extrapolated, txn_type=txn_type),
            "latency_ms": 1.4, "calibration_method": "isotonic",
        }

    def health(self):
        return {"status": "ok", "model_version": "vae-dsaa-v4.0.0",
                "strata_loaded": sorted(self.bundles), "feature_set": self.feature_set,
                "strata": {}, "routing": ROUTE}


@pytest.fixture()
def client():
    with TestClient(create_app(predictor=FakePredictor())) as c:
        yield c


def make_tx(**over) -> dict:
    base = {
        "transaction_id": "TX_TEST_001", "composite_id": "C1231006815_601",
        "step": 601, "type": "TRANSFER", "amount": 181000.0,
        "nameOrig": "C1231006815", "nameDest": "C1666544295",
        "oldbalanceOrg": 181000.0, "newbalanceOrig": 0.0,
        "oldbalanceDest": 0.0, "newbalanceDest": 0.0, "isFlaggedFraud": 0,
    }
    base.update(over)
    return base


# ------------------------------------------------------------------ basics
def test_health_reports_loaded_strata(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["strata_loaded"] == ["CASH_OUT", "GLOBAL", "PAYMENT", "TRANSFER"]


def test_classify_returns_200(client):
    assert client.post("/api/v1/behavioral/classify", json=make_tx()).status_code == 200


def test_score_is_a_probability(client):
    """Unbounded z-composites reach 7.8; the adapter clamps, so this must be [0,1]."""
    d = client.post("/api/v1/behavioral/classify", json=make_tx()).json()
    assert 0.0 <= d["behavioral_risk_score"] <= 1.0
    assert d["vae_diagnostics"]["raw_score"] > 1.0     # raw really is unbounded


# ----------------------------------------------------- the adapter contract
def test_adapter_reads_every_field_it_needs(client):
    """Mirror upstream.call_behavioral_api exactly, including its .get() defaults.

    Every default that fires here would fire silently in production.
    """
    data = client.post("/api/v1/behavioral/classify", json=make_tx()).json()

    score = data.get("behavioral_risk_score", 0.5)
    assert score != 0.5, "adapter would fall back to the neutral default"

    summary = data.get("evidence", {}).get("current_transaction", {}) \
                  .get("fraud_signal_summary")
    assert summary, "fraud_signal_summary missing — the LLM report loses this modality"

    fp = data.get("anomaly_fingerprint", {})
    assert fp.get("signal_1_reconstruction_error", {}).get("dominant_feature_signal")
    assert fp.get("signal_2_kl_divergence", {}).get("dominant_dimension_signal")
    assert data.get("fraud_typology", {}).get("typology_label")
    assert data.get("vae_diagnostics", {}).get("combined_anomaly_score") is not None
    assert data.get("transaction_type")


def test_american_spelling_is_used(client):
    """British spelling would make the adapter substitute 0.5 without erroring."""
    d = client.post("/api/v1/behavioral/classify", json=make_tx()).json()
    assert "behavioral_risk_score" in d
    assert "behavioural_risk_score" not in d


# ------------------------------------------------------------------ routing
@pytest.mark.parametrize("txn_type,expected", [
    ("TRANSFER", "TRANSFER"), ("CASH_OUT", "CASH_OUT"), ("PAYMENT", "PAYMENT"),
    ("CASH_IN", "GLOBAL"), ("DEBIT", "GLOBAL"),
])
def test_routing(client, txn_type, expected):
    """A type arriving as an Enum once routed everything to GLOBAL silently."""
    d = client.post("/api/v1/behavioral/classify",
                    json=make_tx(type=txn_type)).json()
    assert d["vae_diagnostics"]["stratum"] == expected
    assert d["transaction_type"] == txn_type


def test_cash_in_is_marked_as_extrapolation(client):
    """GLOBAL is trained on outgoing transactions only.

    A CASH_IN raises the origin balance, which never happens in training, so the
    score saturates for a type PaySim never labels as fraud. Reporting that as a
    plain CRITICAL would reach an analyst as a real alert.
    """
    d = client.post("/api/v1/behavioral/classify",
                    json=make_tx(type="CASH_IN")).json()
    assert d["vae_diagnostics"]["out_of_training_distribution"] is True
    assert "CAVEAT" in d["evidence"]["current_transaction"]["fraud_signal_summary"]


def test_modelled_types_are_not_marked_as_extrapolation(client):
    for t in ("TRANSFER", "CASH_OUT", "PAYMENT"):
        d = client.post("/api/v1/behavioral/classify", json=make_tx(type=t)).json()
        assert d["vae_diagnostics"]["out_of_training_distribution"] is False


def test_payment_is_marked_as_a_control_stratum(client):
    d = client.post("/api/v1/behavioral/classify",
                    json=make_tx(type="PAYMENT")).json()
    assert d["vae_diagnostics"]["is_control_stratum"] is True


# ------------------------------------------------------------------ errors
def test_bad_request_shape_matches_the_contract(client):
    r = client.post("/api/v1/behavioral/classify",
                    json={"step": 0, "type": "TRANSFER", "amount": -1})
    assert r.status_code == 422
    assert set(r.json()) >= {"error", "message"}


def test_unknown_type_is_rejected(client):
    assert client.post("/api/v1/behavioral/classify",
                       json=make_tx(type="CRYPTO")).status_code == 422


def test_extra_fields_are_ignored_not_rejected(client):
    """An added upstream field must not turn into a 422."""
    r = client.post("/api/v1/behavioral/classify",
                    json=make_tx(some_new_upstream_field="x"))
    assert r.status_code == 200


# ------------------------------------------------------------------- batch
def test_batch_endpoint(client):
    r = client.post("/api/v1/behavioral/score",
                    json={"transactions": [make_tx(), make_tx(type="CASH_OUT")]})
    assert r.status_code == 200
    assert r.json()["count"] == 2


# ----------------------------------------------------------------- summary
def test_summary_names_the_evidence():
    typ = {"typology_label": "PASS_THROUGH_MULE", "cluster_id": 0,
           "confidence": 0.83, "cluster_fraud_purity": 0.985}
    s = build_summary("TRANSFER", 7.81, 1.73, True, 0.87, "CRITICAL",
                      [{"name": "F4_balance_change_ratio", "share": 0.41}],
                      [{"name": "dim_3", "share": 0.36}], typ)
    for token in ("TRANSFER", "F4_balance_change_ratio", "dim_3",
                  "PASS_THROUGH_MULE", "7.81"):
        assert token in s


def test_summary_does_not_assert_a_typology_it_does_not_have():
    s = build_summary("CASH_OUT", 0.4, 3.7, False, 0.01, "LOW",
                      [{"name": "F1_log_amount", "share": 0.9}],
                      [{"name": "dim_0", "share": 0.5}],
                      {"typology_label": "UNASSIGNED"})
    assert "outside every discovered typology" in s
