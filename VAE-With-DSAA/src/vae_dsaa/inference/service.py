"""BehavioralPredictor — every stratum this service can answer for, in memory.

The analogue of GraphSAGE's ``GraphPredictor``: all heavy state is built once at
startup, and request handling is feature engineering plus one small forward
pass. A VAE forward pass over seven features costs microseconds, so unlike the
graph component nothing has to be precomputed and **any** transaction can be
scored — there is no "account not in the snapshot" branch to return 404 for.

Per stratum it holds:

* the trained bundle          (``Predictor``)
* the score calibrator        (``Calibrator``)     raw z-composite -> [0, 1]
* the typology index          (``TypologyIndex``)  nearest-medoid assignment
* the serving constants       (manifest ``serving`` block) for feature engineering
"""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np

from vae_dsaa.data import live_features
from vae_dsaa.dsaa.signals import compute_signals, fingerprint, rank_signal
from vae_dsaa.inference.calibration import Calibrator
from vae_dsaa.typology.assign import TypologyIndex
from vae_dsaa.utils.persistence import load_bundle

MODEL_VERSION = "vae-dsaa-v4.0.0"

#: PaySim fraud exists only in TRANSFER and CASH_OUT. PAYMENT is the
#: false-positive control stratum and still returns a score. CASH_IN and DEBIT
#: have no stratum model of their own and route to the pooled GLOBAL model.
ROUTE = {
    "TRANSFER": "TRANSFER",
    "CASH_OUT": "CASH_OUT",
    "PAYMENT": "PAYMENT",
    "CASH_IN": "GLOBAL",
    "DEBIT": "GLOBAL",
}
STRATA = ("TRANSFER", "CASH_OUT", "PAYMENT", "GLOBAL")

#: Types with no model of their own AND no representation in any model's
#: training data. GLOBAL is pooled from TRANSFER, CASH_OUT and PAYMENT — all
#: outgoing transactions, where the origin balance falls. A CASH_IN raises it,
#: so ``F4_balance_change_ratio`` lands far outside anything seen in training:
#: the fitted range is [-1.0000, 0.3318] with a 99th percentile of 0.0, while a
#: routine deposit reaches +3.86. The reconstruction error is therefore extreme
#: and the score saturates, for a transaction that PaySim never labels as fraud.
#:
#: The score is still returned — the consumer asked for one — but it is marked
#: as extrapolation so it can be discounted. Silently reporting CRITICAL for an
#: ordinary deposit would be worse than saying nothing.
OUT_OF_TRAINING_TYPES = frozenset({"CASH_IN", "DEBIT"})


class StratumBundle:
    """One stratum's serving state."""

    def __init__(self, name: str, path: Path):
        self.name = name
        self.path = path
        self.predictor = load_bundle(path)
        self.calibrator = Calibrator.load(path)
        self.typology = TypologyIndex.load(path)
        self.manifest = self.predictor.manifest
        serving = self.manifest.get("serving") or {}
        self.f8_p95 = serving.get("f8_p95_causal")
        if self.f8_p95 is None:
            raise RuntimeError(
                f"{path.name}: manifest has no serving.f8_p95_causal. Run "
                "scripts/patch_bundle_serving.py — without it F8_is_large cannot "
                "be engineered for a single row and every served score is wrong."
            )

    @property
    def features(self) -> list[str]:
        return self.predictor.features

    @property
    def raw_threshold(self) -> float:
        return float(self.predictor.thresholds["f1_optimal"])

    @property
    def calibrated_threshold(self) -> float:
        return (self.calibrator.calibrated_threshold if self.calibrator
                else self.raw_threshold)

    @property
    def risk_bands(self) -> dict:
        return self.calibrator.risk_bands if self.calibrator else {}


class BehavioralPredictor:
    """Loads every stratum once; scores one transaction per call."""

    def __init__(self, root: Path, protocol: str = "clean",
                 feature_set: str = "FS-ORIGIN"):
        t0 = time.time()
        self.root = Path(root)
        self.protocol = protocol
        self.feature_set = feature_set
        models = self.root / "checkpoints" / "v4"
        self.bundles: dict[str, StratumBundle] = {}
        missing = []
        for s in STRATA:
            d = models / f"{protocol}__{feature_set}__{s}"
            if d.exists():
                self.bundles[s] = StratumBundle(s, d)
            else:
                missing.append(s)
        if not self.bundles:
            raise RuntimeError(
                f"no bundles under {models} for {protocol}__{feature_set}__*")
        self.missing_strata = missing
        self.startup_seconds = time.time() - t0
        self.started_at = t0
        self.scored = 0
        self.latency_ms_total = 0.0
        self._parameters: int | None = None

    # ---------------------------------------------------------------- route
    @staticmethod
    def _type_name(txn_type) -> str:
        """Normalise a transaction type that may arrive as a str or an Enum.

        ``ClassifyRequest.model_dump()`` returns the ``TxnType`` member, not its
        value, and ``str(TxnType.TRANSFER)`` is ``'TxnType.TRANSFER'``. Routing
        on that silently falls through to GLOBAL for *every* transaction — the
        response still looks well-formed, so nothing surfaces the mistake.
        """
        return str(getattr(txn_type, "value", txn_type)).strip().upper()

    def stratum_for(self, txn_type) -> str:
        target = ROUTE.get(self._type_name(txn_type), "GLOBAL")
        return target if target in self.bundles else next(iter(self.bundles))

    # --------------------------------------------------------------- score
    def classify(self, tx: dict) -> dict:
        """Score one raw transaction and return the full forensic payload."""
        t0 = time.time()
        txn_type = self._type_name(tx.get("type", ""))
        stratum = self.stratum_for(txn_type)
        extrapolated = txn_type in OUT_OF_TRAINING_TYPES
        b = self.bundles[stratum]

        X = live_features.engineer(tx, b.features, b.f8_p95)
        raw = float(b.predictor.score(X)[0])
        flagged = raw >= b.raw_threshold

        if b.calibrator is not None:
            prob = float(b.calibrator.transform(np.array([raw]))[0])
            level = b.calibrator.risk_level(prob)
        else:
            prob = float(1.0 / (1.0 + np.exp(-(raw - b.raw_threshold))))
            level = "HIGH" if flagged else "LOW"

        sig = compute_signals(b.predictor, X, with_signal_3=True)
        s1 = rank_signal(sig["signal_1"], sig["feature_names"], 0, top=3,
                         observed=sig.get("observed"),
                         reconstructed=sig.get("reconstructed"))
        s2 = rank_signal(sig["signal_2"], sig["latent_names"], 0, top=3)
        s3 = rank_signal(sig["signal_3"], sig["latent_names"], 0, top=3)

        typ = {"typology_label": "UNASSIGNED", "cluster_id": -1,
               "confidence": 0.0,
               "rationale": "no typology index for this stratum"}
        if b.typology is not None:
            typ = b.typology.assign(fingerprint(sig)[0])

        z = self._z_terms(b, X)
        latency = (time.time() - t0) * 1000.0
        self.scored += 1
        self.latency_ms_total += latency

        return {
            "stratum": stratum,
            "transaction_type": txn_type,
            "out_of_training_distribution": extrapolated,
            "behavioral_risk_score": round(prob, 6),
            "risk_level": level,
            "flagged": bool(flagged),
            "raw_score": round(raw, 4),
            "raw_threshold": round(b.raw_threshold, 4),
            "calibrated_threshold": round(b.calibrated_threshold, 6),
            "z_terms": z,
            "signal_1": s1,
            "signal_2": s2,
            "signal_3": s3,
            "typology": typ,
            "engineered_features": {n: round(float(v), 6)
                                    for n, v in zip(b.features, X[0])},
            "summary": build_summary(stratum, raw, b.raw_threshold, flagged,
                                     prob, level, s1, s2, typ,
                                     extrapolated=extrapolated,
                                     txn_type=txn_type),
            "latency_ms": latency,
            "calibration_method": (b.calibrator.method if b.calibrator
                                   else "uncalibrated_logistic_fallback"),
        }

    def _z_terms(self, b: StratumBundle, X: np.ndarray) -> dict:
        """The three standardised components behind the composite score."""
        from vae_dsaa.inference.scorer import _components, _nearest
        Xs = b.predictor.scaler.transform(X)
        mu, _lv, rec, kl = _components(b.predictor.model, Xs)
        dens = _nearest(mu, b.predictor.centers)
        s = b.predictor.stats
        return {
            "recon_z": round(float((rec[0] - s["recon_mean"]) / s["recon_std"]), 4),
            "kl_z": round(float((kl[0] - s["kl_mean"]) / s["kl_std"]), 4),
            "density_z": round(float((dens[0] - s["dens_mean"]) / s["dens_std"]), 4),
            "weights": {"alpha": s["alpha"], "beta": s["beta"],
                        "gamma": s["gamma"]},
        }

    # -------------------------------------------------------------- health
    def parameter_count(self) -> int:
        """Trained weights held in memory, summed across every loaded stratum.

        One number for what is actually serving. This component is four small
        autoencoders rather than one network, so a per-stratum figure would
        answer a question nobody asked — and reporting only one of them would
        understate what is loaded. `models` alongside it says how many were
        added up. Counted once; the weights do not change after load.
        """
        if self._parameters is None:
            self._parameters = sum(
                int(sum(p.numel() for p in b.predictor.model.parameters()))
                for b in self.bundles.values()
            )
        return self._parameters

    def health(self) -> dict:
        return {
            "status": "ok",
            "model_version": MODEL_VERSION,
            "protocol": self.protocol,
            "feature_set": self.feature_set,
            "strata_loaded": sorted(self.bundles),
            "strata_missing": self.missing_strata,
            "routing": ROUTE,
            "startup_seconds": round(self.startup_seconds, 2),
            "transactions_scored": self.scored,
            "mean_latency_ms": (round(self.latency_ms_total / self.scored, 2)
                                if self.scored else None),

            # The runtime block the console's Model runtime panel reads. It
            # looks for a nested `model` on every detector and falls back to a
            # bare "serving" when there is none, so a component that publishes
            # its state under its own key names appears less alive than one
            # that does not. Additive: everything above keeps its name and
            # meaning, and a consumer reading only those is unaffected.
            "model": {
                "loaded": bool(self.bundles),
                "parameters": self.parameter_count(),
                "models": len(self.bundles),
                "inferences": self.scored,
                "uptime_seconds": round(time.time() - self.started_at, 1),
            },

            "strata": {
                s: {
                    "features": b.features,
                    "raw_threshold": round(b.raw_threshold, 4),
                    "calibrated_threshold": round(b.calibrated_threshold, 6),
                    "risk_bands": b.risk_bands,
                    "calibration": (b.calibrator.summary() if b.calibrator
                                    else {"method": "none"}),
                    "typologies": (len(b.typology.cluster_ids)
                                   if b.typology else 0),
                    "typology_labels": (b.typology.labels if b.typology else []),
                    "f8_p95_causal": b.f8_p95,
                    "latent_dim": b.manifest.get("latent_dim"),
                }
                for s, b in self.bundles.items()
            },
        }


# ------------------------------------------------------------------ summary
def build_summary(stratum: str, raw: float, threshold: float, flagged: bool,
                  prob: float, level: str, s1: list[dict], s2: list[dict],
                  typ: dict, *, extrapolated: bool = False,
                  txn_type: str | None = None) -> str:
    """The grounded evidence sentence the fusion engine feeds to its LLM.

    The graph adapter builds its own summary client-side from the subgraph it
    receives. The behavioural adapter does not: it reads
    ``evidence.current_transaction.fraud_signal_summary`` straight out of this
    response body. If the field is missing, the LLM forensic report contains
    nothing derived from this component while the other two modalities both
    appear — a gap visible in any demo. So it is built here, from the same
    numbers the rest of the response reports, and is never left empty.
    """
    verdict = "flagged" if flagged else "below threshold"
    parts = []
    if extrapolated:
        # Say this first. A reader who stops after one sentence must still know
        # the number that follows is extrapolation.
        parts.append(
            f"CAVEAT: {txn_type or 'this transaction type'} is not represented "
            f"in any stratum's training data, which covers TRANSFER, CASH_OUT "
            f"and PAYMENT only. The score below is extrapolation and should "
            f"carry little weight; PaySim labels no fraud in this type.")
    parts += [
        f"Behavioural anomaly score {raw:.2f} against the {stratum} threshold "
        f"{threshold:.2f} ({verdict}, F1-optimal operating point), calibrated "
        f"to a risk probability of {prob:.3f} ({level})."
    ]
    if s1:
        tail = (f", followed by {s1[1]['name']} at {s1[1]['share']:.0%}."
                if len(s1) > 1 else ".")
        parts.append(f"Dominant reconstruction error: {s1[0]['name']} at "
                     f"{s1[0]['share']:.0%} of the total{tail}")
    if s2:
        parts.append(f"Dominant latent deviation: {s2[0]['name']} at "
                     f"{s2[0]['share']:.0%} of KL divergence.")

    label = typ.get("typology_label", "UNASSIGNED")
    if label != "UNASSIGNED":
        purity = typ.get("cluster_fraud_purity")
        pur = (f", {purity:.0%} of that cluster's members are fraud in the "
               f"held-out test partition"
               if isinstance(purity, float) and purity == purity else "")
        parts.append(f"Nearest discovered typology: {label} (cluster "
                     f"{typ.get('cluster_id')}, fit confidence "
                     f"{typ.get('confidence', 0):.2f}{pur}).")
    else:
        parts.append("The attribution fingerprint falls outside every "
                     "discovered typology, so no typology is asserted.")
    return " ".join(parts)
