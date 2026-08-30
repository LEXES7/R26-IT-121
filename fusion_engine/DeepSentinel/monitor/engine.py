"""The always-on monitoring loop.

Screening is deliberately asymmetric, and that asymmetry is the design:

    every transaction ──▶ GraphSAGE  (cheap, structural, always on)
                              │
                     score ≥ watch threshold
                              │
                              ▼
              behavioural + temporal, in parallel  (expensive)
                              │
                              ▼
                      fusion ──▶ alert + report

The graph model is the tripwire because relational structure is visible without
any per-account history — a mule ring is a shape, and the shape is there on the
first transfer. Running all three detectors on every record would cost three
times as much to reach the same verdicts, since the other two only change the
outcome once something is already structurally suspicious.

Two alerts leave the system for one incident, on purpose:

  * **Early warning**, the moment the graph model trips. Fast and provisional —
    an analyst can start looking while the rest of the pipeline runs.
  * **Confirmed alert**, after fusion, carrying the severity band and the
    forensic narrative.

Sending only the second would waste the head start the graph model provides;
sending only the first would page people on an unconfirmed signal.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

from backend import config
from monitor.state import STATE

logger = logging.getLogger(__name__)

# Below this the transaction is not worth three model calls. Set from the
# served model's own MEDIUM band at startup, not guessed.
DEFAULT_WATCH_THRESHOLD = 0.09
POLL_BATCH = 25            # transactions fetched per refill
DEFAULT_INTERVAL = 1.2     # seconds between screenings


# Where the fused verdict changes severity.
#
# These used to fall back to `self._bands` — the risk bands the relational
# model publishes on /health. Those are the operating point for *its* score,
# and reusing them for the fused score is a category error: the two have
# different distributions, and it showed. Measured over a 2,000-transaction
# replay, 0.18, 0.25, 0.39 and 0.55 all selected the identical 49
# transactions, so HIGH and CRITICAL were the same band wearing two names.
#
# The values below sit where the flagged population actually changes:
#
#     band     flagged   recall   false alarms per real fraud
#     0.030        85     27.3%        49 : 1
#     0.090        61     19.7%        48 : 1
#     0.925        35     11.1%        54 : 1
#
# Recall and false-alarm rate are carried over from a fraud-oversampled
# sample; the alert *volume* is stated at PaySim's true 0.129% rate. Note that
# precision barely improves as the band rises — the fused score does not rank
# well at the top end, which is a statement about the detectors and not about
# fusion. An operator can move all three on the Thresholds page.
FUSED_BANDS = {"medium": 0.03, "high": 0.09, "critical": 0.925}


# A detector that just failed is left alone for this long. Under the fan-out
# every transaction pays for a dead service, so the breaker is what keeps one
# unreachable model from setting the pace of the whole pipeline.
DETECTOR_BREAKER_SECONDS = 15.0


def _upstream_timeout() -> float:
    """Per-detector call timeout, from config, in seconds."""
    try:
        return max(0.5, float(config.get("upstream", "timeout_ms")) / 1000.0)
    except Exception:                                   # noqa: BLE001
        return 5.0


class MonitorEngine:
    def __init__(self) -> None:
        self.paused = False            # holds the loop without losing counters
        self._fusion = None            # the project's trained MetaClassifier
        self._task: asyncio.Task | None = None
        self._queue: list[dict] = []
        self._source = None          # "queue" | "sample" — published when it changes
        self._label = None           # ground truth from the source file, if present
        self.interval = DEFAULT_INTERVAL
        self.watch_threshold = DEFAULT_WATCH_THRESHOLD
        self._route: dict[str, str] = {}       # detector → the path that answers
        self._down_until: dict[str, float] = {}  # detector → don't call before
        self.upstream_timeout = _upstream_timeout()
        self._background: set[asyncio.Task] = set()  # notifications in flight

    # ── lifecycle ────────────────────────────────────────────────────
    async def start(self, interval: float | None = None) -> None:
        if self._task and not self._task.done():
            return
        if interval:
            self.interval = max(0.2, min(float(interval), 10.0))
        self.paused = False
        STATE.running = True
        # Reset the whole counter set, not just the clock: keeping totals from
        # a previous run while restarting the timer reported a throughput of
        # ~1800/min on a 1.2s interval.
        from monitor.state import Counters

        STATE.counters = Counters()
        self._task = asyncio.create_task(self._run())
        STATE.publish("monitor", {"status": "started", "interval": self.interval})

    def pause(self) -> None:
        """Hold screening without tearing down state.

        Distinct from stop(): counters, alerts and the loaded model survive, so
        resuming continues the same session rather than starting a new one.
        An analyst pausing to read an alert should not lose the run.
        """
        self.paused = True
        for k in STATE.stage_status:
            STATE.stage_status[k] = "idle"
        STATE.publish("monitor", {"status": "paused"})

    def resume(self) -> None:
        self.paused = False
        STATE.publish("monitor", {"status": "resumed"})

    async def restart(self, interval: float | None = None) -> None:
        """Full cycle: drop state, reload the model's thresholds, begin again."""
        await self.stop()
        self.paused = False
        await self.start(interval)

    async def stop(self) -> None:
        STATE.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        for s in STATE.stage_status:
            STATE.stage_status[s] = "idle"
        STATE.publish("monitor", {"status": "stopped"})

    # ── the loop ─────────────────────────────────────────────────────
    async def _run(self) -> None:
        graph_base = str(config.get("upstream", "graph_api_base")).rstrip("/")
        await self._load_bands(graph_base)
        await self._load_fusion()

        async with httpx.AsyncClient(timeout=20.0) as client:
            while STATE.running:
                if self.paused:
                    await asyncio.sleep(0.4)
                    continue
                try:
                    txn = await self._next_transaction(client, graph_base)
                    if txn is None:
                        await asyncio.sleep(2.0)
                        continue
                    await self._screen(client, graph_base, txn)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:                # noqa: BLE001
                    # One bad transaction must not end the monitor.
                    logger.warning(f"Monitor iteration failed: {exc}")
                    STATE.publish("error", {"message": str(exc)[:200]})
                await asyncio.sleep(self.interval)

    async def _load_fusion(self) -> None:
        """Load the same meta-classifier the /analyze endpoint uses.

        Averaging the available scores would be a second, different fusion
        rule — the monitor and the on-demand analyzer would then disagree
        about the same transaction, which is indefensible in a system whose
        whole claim is traceability.
        """
        try:
            from backend.fusion_engine import MetaClassifier

            path = str(config.get("paths", "meta_classifier"))
            clf = MetaClassifier(path)
            await asyncio.to_thread(clf.initialize)
            self._fusion = clf
            logger.info("Monitor using the trained meta-classifier")
        except Exception as exc:                        # noqa: BLE001
            logger.warning(f"Meta-classifier unavailable, monitor will average: {exc}")
            self._fusion = None

    async def _load_bands(self, graph_base: str) -> None:
        """Take the watch threshold from the model rather than hard-coding it."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(f"{graph_base}/health")
            bands = r.json().get("risk_bands") or {}
            if bands:
                # Only the watch threshold is taken from here. The rest of the
                # relational model's bands are deliberately not kept: they
                # describe its own score, and the last time they were held on
                # the engine they ended up being applied to the fused one.
                self.watch_threshold = float(bands.get("medium", DEFAULT_WATCH_THRESHOLD))
                logger.info(f"Monitor watch threshold from model: {self.watch_threshold:.4f}")
        except Exception as exc:                        # noqa: BLE001
            logger.info(f"Using default watch threshold ({exc})")

    async def _next_transaction(self, client: httpx.AsyncClient, graph_base: str):
        """The next transaction to screen, preferring real arrivals.

        Rows ingested by the Query Runner are claimed from `transactions_live`.
        When that queue is empty — or its table lives in another database — the
        monitor falls back to its sample source so a demo still has something to
        show. The source is published either way: a dashboard must never imply
        it is watching live traffic when it is replaying samples.
        """
        from monitor import queue as ingest_queue

        if not self._queue:
            claimed = await ingest_queue.claim(POLL_BATCH)
            if claimed:
                self._queue = claimed
                if self._source != "queue":
                    self._source = "queue"
                    STATE.publish("source", {"source": "queue",
                                             "detail": "screening ingested transactions"})
            else:
                r = await client.get(
                    f"{graph_base}/api/graph/sample-transactions",
                    params={"n": POLL_BATCH, "fraud_ratio": 0.08},
                )
                r.raise_for_status()
                self._queue = r.json().get("transactions", [])
                if self._source != "sample":
                    self._source = "sample"
                    STATE.publish("source", {"source": "sample",
                                             "detail": "ingestion queue empty — replaying samples"})

        return self._queue.pop(0) if self._queue else None

    # ── stage 1: screen ──────────────────────────────────────────────
    async def _screen(self, client, graph_base: str, txn: dict) -> None:
        """Score one transaction on all three detectors at once.

        This used to be a cascade: the relational model first, and the other
        two only if it flagged something. The cascade was measured against a
        400-transaction replay and it cost half the frauds in it. Four of the
        eight it missed scored 0.011–0.107 on the relational model — far under
        the 0.183 watch line, so the cascade could never have looked at them —
        while the behavioural model scored those same four between 0.51 and
        1.00. A gate in front of an independent detector cannot do better than
        the detector; it can only hide it.

        It was not buying speed either. The three calls were sequential
        awaits, so a flagged transaction paid graph + timing + behavioural in
        series. Fanned out they cost whichever of the three is slowest, once.

        There is deliberately no "cost gate" option left behind. Any version
        of it either starves the sequence model of the stream its window
        depends on, or skips the behavioural model — which is where those four
        frauds were found. Headroom comes from bounding how many transactions
        are in flight and from the ingestion queue, not from deciding in
        advance which detectors a transaction deserves.
        """
        # row_id marks a claimed queue row; it is bookkeeping, not model input.
        row_id = txn.pop("row_id", None)
        payload = {k: v for k, v in txn.items() if not k.startswith("_")}
        self._label = txn.get("_is_fraud")
        txid = payload["transaction_id"]

        # Measured here rather than estimated later. The case table has always
        # had screening_ms and total_ms columns and the case page has always
        # rendered them; nothing was ever writing them, so every case showed a
        # dash. Timing the calls is the whole fix.
        t0 = time.perf_counter()

        # All three fired together. The relational task is awaited first
        # because the early warning depends only on it, and there is no reason
        # to make that email wait for the other two to come back.
        for name in ("graph", "temporal", "behavioural"):
            STATE.set_stage(name, "active")
        graph_task = asyncio.create_task(self._score_graph(client, graph_base, payload))
        # Held in a dict so the finally below can tell what has not been
        # collected yet, whichever way this method leaves.
        side = {
            "temporal": asyncio.create_task(self._call_upstream(
                client, "temporal_api_base", "temporal_risk_score", payload)),
            "behavioural": asyncio.create_task(self._call_upstream(
                client, "behavioral_api_base", "behavioral_risk_score", payload)),
        }

        try:
            try:
                status, result = await graph_task
            finally:
                STATE.set_stage("graph", "idle")
            screening_ms = int((time.perf_counter() - t0) * 1000)
            STATE.counters.screened += 1

            if status != 200 or result is None:
                # The other two are already in flight and are collected by the
                # finally below. They are not cancelled: the sequence model has
                # to see this transaction for its window to stay in step with
                # the stream, whatever the relational model made of the
                # accounts.
                STATE.publish("screened", {
                    "transaction_id": txid, "outcome": "unknown_accounts",
                })
                if row_id is not None:
                    from monitor import queue as ingest_queue
                    await ingest_queue.mark_done(row_id, escalated=False)
                return

            score = float(result.get("relational_risk_score") or 0.0)
            level = result.get("risk_level", "LOW")
            sg = result.get("suspicious_subgraph") or {}
            # No longer a gate. It still means something — the relational model
            # saw structure it recognises — and it is still what the early
            # warning goes out on, but nothing downstream is withheld for it.
            watch_flag = score >= self.watch_threshold

            STATE.publish("screened", {
                "transaction_id": txid,
                "amount": payload["amount"],
                "from": payload["nameOrig"],
                "to": payload["nameDest"],
                "graph_score": round(score, 4),
                "risk_level": level,
                "escalated": watch_flag,
            })

            if watch_flag:
                STATE.publish("escalated", {
                    "transaction_id": txid,
                    "graph_score": round(score, 4),
                    "pattern": sg.get("pattern"),
                    "sink_account": sg.get("sink_account"),
                    "convergence": (sg.get("structural_evidence") or {}).get("convergence_count"),
                })
                # Goes out now, while the other two detectors are still in
                # flight — and it is not awaited. An SMTP handshake takes about
                # 3.7 seconds on this connection, and awaiting it here put that
                # into total_ms for every early-flagged transaction, so the case
                # table was reporting mail latency as detection latency. The
                # notification is a consequence of the verdict, not part of it.
                self._spawn(self._notify_early(txid, payload, score, sg), "early warning")

            temporal = await self._collect(side, "temporal")
            behavioural = await self._collect(side, "behavioural")

            await self._fuse(payload, sg, score,
                             temporal=temporal, behavioural=behavioural,
                             watch_flag=watch_flag, row_id=row_id,
                             screening_ms=screening_ms, started=t0)
        finally:
            # Whatever is still in flight — because the relational call raised,
            # or the accounts were unknown — is collected here. Skipping it
            # leaves the detector's lamp lit in the live monitor forever and
            # loses its exception to asyncio's "never retrieved" warning.
            for name in list(side):
                await self._collect(side, name)

    async def _collect(self, side: dict, name: str):
        """Take one detector's answer, once. Idempotent: a second call is a
        no-op, so the cleanup path can ask for everything unconditionally."""
        task = side.pop(name, None)
        if task is None:
            return None, None
        try:
            return await task
        except Exception as exc:                        # noqa: BLE001
            logger.warning(f"{name} detector failed: {exc}")
            return None, None
        finally:
            STATE.set_stage(name, "idle")

    def _spawn(self, coro, what: str) -> None:
        """Run something alongside the pipeline without holding it up.

        The reference is kept until the task finishes: a bare create_task can
        be collected mid-flight, which loses the work silently.
        """
        task = asyncio.create_task(coro)
        self._background.add(task)
        task.add_done_callback(self._background.discard)

        def _log(t: asyncio.Task) -> None:
            if not t.cancelled() and t.exception() is not None:
                logger.warning(f"{what} failed: {t.exception()}")
        task.add_done_callback(_log)

    async def _score_graph(self, client, graph_base: str, payload: dict):
        """The relational model. Returns `(status, body)`, body None on 404."""
        r = await client.post(f"{graph_base}/api/graph/analyze", json=payload)
        if r.status_code == 404:            # accounts not in the trained graph
            return 404, None
        r.raise_for_status()
        return r.status_code, r.json()

    # ── stage 2: fuse ────────────────────────────────────────────────
    async def _fuse(self, payload: dict, sg: dict, graph_score: float, *,
                    temporal: tuple, behavioural: tuple, watch_flag: bool,
                    row_id: int | None = None,
                    screening_ms: int | None = None,
                    started: float | None = None) -> None:
        txid = payload["transaction_id"]

        # The response bodies are kept, not just the scores. A detector answers
        # with its reasoning attached, and that reasoning is what a reviewer
        # opens the case for — dropping it here is why it never reached the
        # case record.
        scores: dict[str, float | None] = {"graph": graph_score}
        bodies: dict[str, dict | None] = {}
        scores["temporal"], bodies["temporal"] = temporal
        scores["behavioural"], bodies["behavioural"] = behavioural
        for name in ("temporal", "behavioural"):
            if scores[name] is not None:
                STATE.publish("model", {
                    "transaction_id": txid, "model": name, "score": scores[name],
                })

        STATE.set_stage("fusion", "active")
        available = [v for v in scores.values() if v is not None]
        fusion_method = "meta_classifier"
        if self._fusion is not None:
            try:
                result = await asyncio.to_thread(
                    self._fusion.fuse,
                    scores.get("graph"), scores.get("behavioural"), scores.get("temporal"),
                )
                # `confidence_score`, not `fraud_confidence_score` — the
                # latter is the API response field, not the dataclass one. Read
                # it directly rather than through getattr with a default: a
                # silent 0.0 on a renamed attribute reads as "nothing
                # suspicious" and suppresses every alert.
                fused = float(result.confidence_score)
            except Exception as exc:                    # noqa: BLE001
                logger.warning(f"Fusion failed, averaging instead: {exc}")
                fused = sum(available) / len(available) if available else 0.0
                fusion_method = "mean_fallback"
        else:
            # No trained model available: average what answered. A detector
            # that is unreachable abstains rather than voting zero, which
            # would read as innocence.
            fused = sum(available) / len(available) if available else 0.0
            fusion_method = "mean_fallback"
        STATE.set_stage("fusion", "idle")

        severity = self._severity(fused)
        if severity != "LOW":
            STATE.counters.flagged += 1

        STATE.publish("fused", {
            "transaction_id": txid,
            "fused_score": round(fused, 4),
            "severity": severity,
            "fusion_method": fusion_method,
            "modalities_used": len(available),
            "scores": {k: (round(v, 4) if v is not None else None) for k, v in scores.items()},
        })

        # The queue row is closed on the fused answer, not the relational one.
        # It is the verdict the system actually stands behind.
        if row_id is not None:
            from monitor import queue as ingest_queue
            await ingest_queue.mark_done(row_id, escalated=severity != "LOW")

        # Everything is fused now, so recording everything would make the case
        # table a log of traffic. A case is opened when the fused verdict is
        # above LOW, or when the relational model raised the transaction even
        # though fusion settled it — the second kind is a disagreement between
        # detectors, which is exactly what a reviewer should see.
        if severity == "LOW" and not watch_flag:
            return

        from backend.adapters.upstream import behavioural_evidence
        from monitor import cases

        # Built through the same function the analyzer's panel is fed from, so
        # a case opened later shows the decomposition in the shape the panel
        # already knows how to render.
        b_body = bodies.get("behavioural")

        case_ref = await cases.record(
            transaction_id=txid,
            classification=severity,
            fused_score=fused,
            scores=scores,
            available_flags={k: (v is not None) for k, v in scores.items()},
            modalities_used=len(available),
            payload=payload,
            graph_evidence=sg,
            behavioral_evidence=behavioural_evidence(b_body) if b_body else None,
            # False, always. This runs before the email is attempted, so any
            # other value here is a claim about something that has not
            # happened yet. _notify_confirmed updates it with what actually
            # occurred — the table previously said "sent" for every non-LOW
            # case, including the eight in a row where the SMTP handshake
            # timed out and nothing was delivered.
            alert_sent=False,
            label_is_fraud=self._label,
            screening_ms=screening_ms,
            total_ms=(int((time.perf_counter() - started) * 1000)
                      if started is not None else None),
        )

        if severity == "LOW":
            return

        alert = {
            "transaction_id": txid,
            "severity": severity,
            "fused_score": round(fused, 4),
            "graph_score": round(graph_score, 4),
            "pattern": sg.get("pattern"),
            "sink_account": sg.get("sink_account"),
            "amount": payload["amount"],
            "from": payload["nameOrig"],
            "to": payload["nameDest"],
            "modalities_used": len(available),
            "fusion_method": fusion_method,
            "at": time.time(),
        }
        STATE.add_alert(alert)

        STATE.set_stage("report", "active")
        await self._notify_confirmed(alert, sg, case_ref)
        STATE.set_stage("report", "idle")


    async def _call_upstream(self, client, base_key: str, score_key: str, payload: dict):
        """Score one modality.

        Returns `(score, body)`. The body comes back alongside the score
        because the detectors answer with their attribution attached and the
        case record needs it; `(None, None)` when the detector cannot answer.

        A 200 without the score key is a contract violation rather than a
        measurement, so it falls through to the next path and ultimately
        counts as unavailable — the same reading the request adapters take.

        Two things here exist only because of the fan-out. The working route
        is remembered per detector, and a detector that has just failed is not
        asked again for a few seconds. Probing both paths at full timeout used
        to cost a dead service twenty seconds per transaction; that was
        survivable when only the escalated few reached it and is not now that
        every transaction does. The sequence model has been unloadable on this
        machine for days, which is exactly the case this has to absorb.
        """
        now = time.monotonic()
        if now < self._down_until.get(base_key, 0.0):
            return None, None

        base = str(config.get("upstream", base_key)).rstrip("/")
        known = self._route.get(base_key)
        candidates = ("/api/v1/classify", "/api/v1/behavioral/classify")
        paths = ([known] if known else []) + [p for p in candidates if p != known]

        for path in paths:
            try:
                r = await client.post(f"{base}{path}", json=payload,
                                      timeout=self.upstream_timeout)
                if r.status_code == 200:
                    data = r.json()
                    raw = data.get(score_key)
                    if raw is None:
                        continue
                    self._route[base_key] = path
                    return float(raw), data
            except Exception:                           # noqa: BLE001
                continue

        # Forget the route as well as opening the breaker: a service that came
        # back at a different path should be found again, not written off.
        self._route.pop(base_key, None)
        # Measured from now, not from when the call started. A detector that
        # fails by timing out burns most of the window before it gets here, so
        # dating the breaker from entry would leave it barely closed — in
        # exactly the case the breaker exists for.
        self._down_until[base_key] = time.monotonic() + DETECTOR_BREAKER_SECONDS
        return None, None

    def _severity(self, fused: float) -> str:
        # An operator-set line wins: someone looked at the replay and decided.
        # Otherwise the measured fused bands below — NOT self._bands, which
        # belong to the relational model.
        from backend import thresholds

        b = thresholds.current() or FUSED_BANDS
        if fused >= float(b.get("critical", FUSED_BANDS["critical"])):
            return "CRITICAL"
        if fused >= float(b.get("high", FUSED_BANDS["high"])):
            return "HIGH"
        if fused >= float(b.get("medium", FUSED_BANDS["medium"])):
            return "MEDIUM"
        return "LOW"

    # ── notifications ────────────────────────────────────────────────
    async def _notify_early(self, txid, payload, score, sg) -> None:
        body = (
            "EARLY WARNING — relational screening\n"
            f"{'=' * 44}\n"
            f"The graph model flagged {txid} before the other detectors ran.\n\n"
            f"Relational score : {score:.4f}\n"
            f"Pattern          : {sg.get('pattern', 'n/a')}\n"
            f"Sink account     : {sg.get('sink_account', 'n/a')}\n"
            f"Amount           : {payload['amount']:,.2f}\n"
            f"From → To        : {payload['nameOrig']} → {payload['nameDest']}\n\n"
            "Behavioural and temporal scoring is running now; a confirmed alert\n"
            "with the full narrative follows if fusion agrees."
        )
        sent = await self._send(f"[Early warning] {txid}", body)
        STATE.publish("notification", {
            "transaction_id": txid, "stage": "early", "sent": sent,
        })

    async def _notify_confirmed(self, alert: dict, sg: dict,
                                case_ref: str | None = None) -> None:
        body = (
            f"CONFIRMED {alert['severity']} — fused verdict\n"
            f"{'=' * 44}\n"
            f"Transaction : {alert['transaction_id']}\n"
            f"Fused score : {alert['fused_score']:.4f} "
            f"({alert['modalities_used']} of 3 detectors available)\n"
            f"Graph score : {alert['graph_score']:.4f}\n"
            f"Pattern     : {alert['pattern'] or 'n/a'}\n"
            f"Sink        : {alert['sink_account'] or 'n/a'}\n"
            f"Amount      : {alert['amount']:,.2f}\n"
            f"From → To   : {alert['from']} → {alert['to']}\n"
        )
        ev = sg.get("structural_evidence") or {}
        if ev:
            body += (
                f"\nStructural evidence\n"
                f"  senders converging : {ev.get('convergence_count')}\n"
                f"  brand-new senders  : {ev.get('fresh_sender_ratio')}\n"
                f"  mules in subgraph  : {ev.get('mules_in_subgraph')}\n"
            )
        sent = await self._send(
            f"[{alert['severity']}] Fraud alert {alert['transaction_id']}", body
        )
        # Record what happened, not what was intended. An operator reading a
        # case needs to know whether anyone was actually told.
        if case_ref:
            from monitor import cases as _cases

            await _cases.mark_alerted(case_ref, sent)

        STATE.publish("notification", {
            "transaction_id": alert["transaction_id"],
            "stage": "confirmed", "severity": alert["severity"], "sent": sent,
        })

    async def _send(self, subject: str, body: str) -> bool:
        """Deliver to the configured alert recipients.

        Recipients come from the risk-manager table the Settings page manages —
        NOT from [email] sender_email, which is the From address. Sending to
        the From address is what produced the NXDOMAIN bounce: the default
        alerts@deepsentinel.io is a placeholder domain that does not exist.
        """
        try:
            from backend.email_service import _provider, _send_plain
            from backend.settings import list_risk_managers

            provider, _ = _provider()
            if not provider:
                return False

            managers = await list_risk_managers()
            recipients = [m.email for m in managers if getattr(m, "enabled", True)]
            if not recipients:
                logger.info("No alert recipients configured; nothing sent.")
                return False

            return await asyncio.to_thread(_send_plain, subject, body, recipients, None)
        except Exception as exc:                        # noqa: BLE001
            logger.warning(f"Monitor notification failed: {exc}")
            return False


ENGINE = MonitorEngine()
