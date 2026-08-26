"""Contract conformance check against a running behavioural service.

    python scripts/contract_test.py
    python scripts/contract_test.py --url http://behavioral:8001

Unlike ``integration_test_behavioral.py`` this imports nothing from the fusion
engine, so it runs anywhere — in CI, in a container, on a machine that has only
this repository. It asserts the shape of the contract in
``docs/integration/behavioral_api_contract.md``: the fields, their types, their
ranges, and the invariants a consumer is entitled to rely on.

Exit code 0 means the service still honours the contract other people build
against. Non-zero means a consumer would break.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

OK, BAD = "[ok]", "[FAIL]"

TX = {
    "transaction_id": "CONTRACT_001", "composite_id": "C1231006815_601",
    "step": 601, "type": "TRANSFER", "amount": 181000.0,
    "nameOrig": "C1231006815", "nameDest": "C1666544295",
    "oldbalanceOrg": 181000.0, "newbalanceOrig": 0.0,
    "oldbalanceDest": 0.0, "newbalanceDest": 0.0, "isFlaggedFraud": 0,
}


def call(url: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(
        url + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="GET" if body is None else "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main(url: str) -> int:
    checks: list[tuple[bool, str]] = []

    def want(cond: bool, msg: str) -> None:
        checks.append((bool(cond), msg))

    # ---------------------------------------------------------------- health
    status, h = call(url, "/health")
    want(status == 200, "GET /health returns 200")
    for key in ("model_version", "feature_set", "strata_loaded", "strata", "routing"):
        want(key in h, f"/health exposes {key}")
    want(not h.get("strata_missing"), "no stratum is missing")
    for s, meta in (h.get("strata") or {}).items():
        b = meta.get("risk_bands") or {}
        want({"medium", "high", "critical"} <= set(b),
             f"{s}: /health publishes all three risk bands")
        want(b.get("critical", 0) > b.get("high", 0),
             f"{s}: CRITICAL band sits strictly above HIGH")
        want(b.get("high", 0) > b.get("medium", -1),
             f"{s}: HIGH band sits above MEDIUM")

    # -------------------------------------------------------------- classify
    status, d = call(url, "/api/v1/behavioral/classify", TX)
    want(status == 200, "POST /api/v1/behavioral/classify returns 200")

    want("behavioral_risk_score" in d,
         "score field uses the American spelling the adapter reads")
    want("behavioural_risk_score" not in d,
         "British spelling is absent (it would make the adapter default to 0.5)")
    score = d.get("behavioral_risk_score")
    want(isinstance(score, (int, float)) and 0.0 <= score <= 1.0,
         "behavioral_risk_score is a probability in [0, 1]")
    want(d.get("risk_level") in {"LOW", "MEDIUM", "HIGH", "CRITICAL"},
         "risk_level is one of the four contract levels")

    v = d.get("vae_diagnostics") or {}
    for key in ("combined_anomaly_score", "raw_score", "threshold",
                "calibrated_threshold", "flagged", "stratum",
                "recon_z", "kl_z", "density_z", "calibration_method"):
        want(key in v, f"vae_diagnostics.{key} present")

    fp = d.get("anomaly_fingerprint") or {}
    s1 = fp.get("signal_1_reconstruction_error") or {}
    s2 = fp.get("signal_2_kl_divergence") or {}
    want(s1.get("dominant_feature_signal"),
         "signal_1.dominant_feature_signal present")
    want(s2.get("dominant_dimension_signal"),
         "signal_2.dominant_dimension_signal present")
    for name, block in (("signal_1", s1), ("signal_2", s2)):
        shares = [x.get("share", 0) for x in (block.get("shares") or [])]
        want(all(0.0 <= x <= 1.0 for x in shares),
             f"{name} shares are all within [0, 1]")

    t = d.get("fraud_typology") or {}
    want("typology_label" in t, "fraud_typology.typology_label present")
    want(0.0 <= float(t.get("confidence", -1)) <= 1.0,
         "fraud_typology.confidence within [0, 1]")
    want("unsupervised" in str(t.get("discovery", "")).lower(),
         "fraud_typology records that discovery was unsupervised")

    summary = ((d.get("evidence") or {}).get("current_transaction") or {}) \
        .get("fraud_signal_summary")
    want(bool(summary), "evidence.current_transaction.fraud_signal_summary present")
    want(isinstance(summary, str) and len(summary) > 40,
         "fraud_signal_summary is a usable sentence, not a stub")

    m = d.get("metadata") or {}
    want("inference_latency_ms" in m, "metadata.inference_latency_ms present")
    want(m.get("inference_latency_ms", 10_000) < 50,
         "inference latency is inside the 50 ms NFR budget")
    want(d.get("transaction_type") == "TRANSFER", "transaction_type echoed back")

    # -------------------------------------------------------------- routing
    for txn_type, stratum in [("TRANSFER", "TRANSFER"), ("CASH_OUT", "CASH_OUT"),
                              ("PAYMENT", "PAYMENT"), ("CASH_IN", "GLOBAL"),
                              ("DEBIT", "GLOBAL")]:
        st, r = call(url, "/api/v1/behavioral/classify", {**TX, "type": txn_type})
        want(st == 200 and (r.get("vae_diagnostics") or {}).get("stratum") == stratum,
             f"{txn_type} routes to the {stratum} model")

    # ------------------------------------------- out-of-distribution types
    st, r = call(url, "/api/v1/behavioral/classify", {**TX, "type": "CASH_IN"})
    v = (r.get("vae_diagnostics") or {})
    want(st == 200 and v.get("out_of_training_distribution") is True,
         "CASH_IN is marked as outside the training distribution")
    summ = (((r.get("evidence") or {}).get("current_transaction") or {})
            .get("fraud_signal_summary", ""))
    want("CAVEAT" in summ,
         "the CASH_IN summary opens with the extrapolation caveat")
    st, r = call(url, "/api/v1/behavioral/classify", {**TX, "type": "TRANSFER"})
    want((r.get("vae_diagnostics") or {}).get("out_of_training_distribution") is False,
         "TRANSFER is not marked as extrapolation")

    # --------------------------------------------------------------- errors
    st, e = call(url, "/api/v1/behavioral/classify",
                 {**TX, "step": 0, "amount": -1})
    want(st == 422, "an invalid request returns 422")
    want({"error", "message"} <= set(e), "the error body carries error and message")

    st, _ = call(url, "/api/v1/behavioral/classify", {**TX, "type": "CRYPTO"})
    want(st == 422, "an unknown transaction type is rejected")

    st, r = call(url, "/api/v1/behavioral/classify",
                 {**TX, "an_added_upstream_field": 1})
    want(st == 200, "an unknown extra field is ignored, not rejected")

    # ---------------------------------------------------------------- report
    failed = [m for ok, m in checks if not ok]
    for ok, msg in checks:
        print(f"  {OK if ok else BAD} {msg}")
    print("\n" + "=" * 60)
    print(f"{len(checks) - len(failed)}/{len(checks)} contract checks passed")
    if failed:
        print(f"{BAD} a consumer would break on:")
        for m in failed:
            print(f"   - {m}")
        return 1
    print(f"{OK} the service honours the contract")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default="http://localhost:8001")
    sys.exit(main(ap.parse_args().url.rstrip("/")))
