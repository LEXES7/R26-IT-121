"""Integration test: can the DeepSentinel fusion engine actually use this service?

Start the service first::

    python scripts/serve_api.py

Then::

    python scripts/integration_test_behavioral.py
    python scripts/integration_test_behavioral.py --url http://localhost:8001

Three stages, in increasing order of what they prove:

1. ``/health`` — the service is up and reports its live operating parameters.
2. A direct ``POST /api/v1/behavioral/classify`` — the response is well formed.
3. **The fusion engine's own adapter**, imported from
   ``fusion_engine/DeepSentinel/backend/adapters/upstream.py`` and called
   unmodified.

Stage 3 is the one that matters. The adapter reads every field with ``.get()``
and a default, so a renamed field, a British spelling, or a missing
``fraud_signal_summary`` raises nothing at all — the modality reports
``available=True`` and quietly contributes a neutral 0.5 to the fusion. Calling
the real adapter is the only way to see that from outside.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import httpx

FUSION = Path(__file__).resolve().parents[2] / "fusion_engine" / "DeepSentinel"

TRANSACTIONS = [
    ("fraud-shaped TRANSFER (account fully drained)", {
        "transaction_id": "TX_INT_001", "step": 601, "type": "TRANSFER",
        "amount": 181000.0, "nameOrig": "C1231006815", "nameDest": "C1666544295",
        "oldbalanceOrg": 181000.0, "newbalanceOrig": 0.0,
        "oldbalanceDest": 0.0, "newbalanceDest": 0.0, "isFlaggedFraud": 0}),
    ("ordinary PAYMENT (control stratum)", {
        "transaction_id": "TX_INT_002", "step": 604, "type": "PAYMENT",
        "amount": 1864.28, "nameOrig": "C1666544295", "nameDest": "M1979787155",
        "oldbalanceOrg": 21249.0, "newbalanceOrig": 19384.72,
        "oldbalanceDest": 0.0, "newbalanceDest": 0.0, "isFlaggedFraud": 0}),
    ("CASH_OUT, large", {
        "transaction_id": "TX_INT_003", "step": 610, "type": "CASH_OUT",
        "amount": 229133.94, "nameOrig": "C905080434", "nameDest": "C476402209",
        "oldbalanceOrg": 229133.94, "newbalanceOrig": 0.0,
        "oldbalanceDest": 22425.0, "newbalanceDest": 0.0, "isFlaggedFraud": 0}),
    ("CASH_IN — no stratum model, routes to GLOBAL", {
        "transaction_id": "TX_INT_004", "step": 612, "type": "CASH_IN",
        "amount": 5000.0, "nameOrig": "C111", "nameDest": "C222",
        "oldbalanceOrg": 1000.0, "newbalanceOrig": 6000.0,
        "oldbalanceDest": 20000.0, "newbalanceDest": 15000.0,
        "isFlaggedFraud": 0}),
]

OK, BAD = "[ok]", "[FAIL]"


async def main(url: str) -> int:
    failures: list[str] = []
    print(f"\n=== Behavioural modality integration test ===\n    {url}\n")

    async with httpx.AsyncClient() as client:
        # ---------------------------------------------------------- 1. health
        print("1. GET /health")
        try:
            h = (await client.get(f"{url}/health", timeout=10.0)).json()
        except Exception as e:                                    # noqa: BLE001
            print(f"   {BAD} service unreachable: {type(e).__name__}: {e}")
            print("   Start it with: python scripts/serve_api.py")
            return 1
        print(f"   {OK} {h['model_version']} | feature set {h['feature_set']}")
        print(f"        strata loaded : {h['strata_loaded']}")
        for s, meta in h.get("strata", {}).items():
            print(f"        {s:9s} thr {meta['raw_threshold']:>8} -> "
                  f"{meta['calibrated_threshold']:<10} bands {meta['risk_bands']} "
                  f"| {meta['typologies']} typologies")
        if h.get("strata_missing"):
            print(f"   {BAD} strata missing: {h['strata_missing']}")
            failures.append("strata missing")

        # ------------------------------------------------------- 2. direct call
        print("\n2. POST /api/v1/behavioral/classify (direct)")
        for label, tx in TRANSACTIONS:
            r = await client.post(f"{url}/api/v1/behavioral/classify",
                                  json=tx, timeout=10.0)
            if r.status_code != 200:
                print(f"   {BAD} {label}: HTTP {r.status_code} {r.text[:160]}")
                failures.append(label)
                continue
            d = r.json()
            score = d["behavioral_risk_score"]
            print(f"   {OK} {label}")
            print(f"        stratum {d['vae_diagnostics']['stratum']:9s} "
                  f"score {score:.6f}  {d['risk_level']:8s} "
                  f"raw {d['vae_diagnostics']['raw_score']:>9} "
                  f"{d['metadata']['inference_latency_ms']}ms")
            if not 0.0 <= score <= 1.0:
                print(f"   {BAD} score outside [0,1] — the adapter would clamp it")
                failures.append(f"{label}: score range")

        # --------------------------------------------- 3. the real adapter
        print("\n3. Through the fusion engine's own adapter")
        if not FUSION.exists():
            print(f"   -- skipped: {FUSION} not found")
        else:
            sys.path.insert(0, str(FUSION))
            try:
                from backend.adapters.upstream import call_behavioral_api
            except Exception as e:                                # noqa: BLE001
                print(f"   {BAD} could not import the adapter: "
                      f"{type(e).__name__}: {e}")
                failures.append("adapter import")
            else:
                for label, tx in TRANSACTIONS:
                    payload = {**tx,
                               "composite_id": f"{tx['nameOrig']}_{tx['step']}"}
                    resp = await call_behavioral_api(client, url, payload, 10.0)
                    ok = True
                    print(f"   -- {label}")
                    print(f"      available            : {resp.available}")
                    print(f"      score                : {resp.score}")
                    print(f"      typology_hint        : {resp.typology_hint}")
                    summary = (resp.fraud_signal_summary or "")
                    print(f"      fraud_signal_summary : "
                          f"{summary[:110]}{'...' if len(summary) > 110 else ''}")

                    if not resp.available:
                        print(f"      {BAD} adapter reports the modality unavailable")
                        ok = False
                    if resp.score == 0.5:
                        print(f"      {BAD} score is exactly 0.5 — that is the "
                              f"adapter's silent default, so it did not read "
                              f"behavioral_risk_score")
                        ok = False
                    if not resp.fraud_signal_summary:
                        print(f"      {BAD} no fraud_signal_summary — the LLM "
                              f"forensic report would contain nothing from this "
                              f"modality")
                        ok = False
                    if not resp.typology_hint:
                        print(f"      -- no typology_hint; RAG retrieval has no key "
                              f"for this transaction (acceptable when the "
                              f"fingerprint matches no discovered typology)")
                    fp = resp.extra.get("anomaly_fingerprint", {})
                    if not fp.get("dominant_reconstruction_signal"):
                        print(f"      {BAD} dominant_reconstruction_signal missing")
                        ok = False
                    if not fp.get("dominant_kl_signal"):
                        print(f"      {BAD} dominant_kl_signal missing")
                        ok = False
                    if ok:
                        print(f"      {OK} every field the adapter reads is present")
                    else:
                        failures.append(f"{label}: adapter fields")

    print("\n" + "=" * 60)
    if failures:
        print(f"{BAD} {len(failures)} problem(s):")
        for f in failures:
            print(f"   - {f}")
        return 1
    print(f"{OK} integration verified — the fusion engine can consume this service")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default="http://localhost:8001")
    raise SystemExit(asyncio.run(main(ap.parse_args().url)))
