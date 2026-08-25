"""Assign an unseen transaction to a discovered fraud typology.

DBSCAN has no ``predict``. It partitions the set it was fitted on and nothing
else, so a discovered typology cannot be attached to a new transaction without
an explicit assignment rule. The fusion engine reads
``fraud_typology.typology_label`` from every response, so serving needs one.

The rule here is nearest-medoid within the cluster's own radius:

* fit DBSCAN once, offline, on the flagged fingerprints (``scripts/export_typologies.py``);
* store each cluster's **medoid** — the member fingerprint with the smallest
  mean distance to the rest of its cluster — together with the radius that
  covers ``COVERAGE`` of that cluster's members;
* at serving, take the new fingerprint, find the nearest medoid, and accept the
  assignment only if the distance falls inside that cluster's radius.

A medoid is used rather than a centroid because DBSCAN clusters are
density-based and may be non-convex: their mean is not guaranteed to be a point
the cluster actually contains. Outside every radius the answer is ``UNASSIGNED``,
which mirrors DBSCAN's own noise label rather than forcing a typology onto a
transaction that does not resemble any of them.

**On the labels.** Cluster *discovery* is unsupervised — no label is used at any
point. The human-readable names attached below are a **post-hoc reading of each
cluster's dominant attribution**, added so the fusion engine's RAG step has a
retrieval key. Naming an already-discovered cluster does not make the discovery
supervised, and the distinction is recorded in every artefact this module
writes.
"""

from __future__ import annotations

import json
import pickle
from dataclasses import dataclass
from pathlib import Path

import numpy as np

TYPOLOGY_FILE = "typology.pkl"
TYPOLOGY_META = "typology.json"

#: Fraction of a cluster's members the stored radius must cover.
COVERAGE = 0.95

UNASSIGNED = "UNASSIGNED"

#: Post-hoc reading of the dominant Signal-1 feature. Descriptive only.
FEATURE_STORY = {
    "F1_log_amount": ("AMOUNT_MAGNITUDE_OUTLIER",
                      "transaction amount itself is the dominant deviation"),
    "F2_amount_balance_ratio": ("HIGH_AMOUNT_TO_BALANCE",
                                "amount is unusually large relative to the origin balance"),
    "F3_balance_consistency": ("EXACT_BALANCE_RECONCILIATION",
                               "origin ledger reconciles to the cent, which in PaySim "
                               "accompanies a precise account drain"),
    "F4_balance_change_ratio": ("ORIGIN_ACCOUNT_DRAIN",
                                "origin balance change dominates the deviation"),
    "F5_dest_balance_ratio": ("DESTINATION_BALANCE_ANOMALY",
                              "destination balance movement dominates"),
    "F6_hour": ("OFF_PATTERN_TIMING",
                "hour-of-day is the dominant deviation"),
    "F8_is_large": ("LARGE_VALUE_TRANSFER",
                    "amount exceeds the stratum's large-transaction threshold"),
    "F9_dest_starts_empty": ("FRESH_DESTINATION_ACCOUNT",
                             "destination account had no prior balance"),
    "F10_recipient_emptied": ("PASS_THROUGH_MULE",
                              "destination ends at zero after receiving funds"),
    "F12_round_amount": ("ROUND_VALUE_STRUCTURING",
                         "amount is a round figure, consistent with structuring"),
    "F13_zero_dest_history": ("DORMANT_DESTINATION",
                              "destination had no history before this transfer"),
}

#: Suggested FATF retrieval keys. Advisory: the fusion engine's RAG step may use
#: its own mapping, and this one is an interpretation, not a classification.
FATF_HINT = {
    "PASS_THROUGH_MULE": "FATF-003",
    "ORIGIN_ACCOUNT_DRAIN": "FATF-004",
    "ROUND_VALUE_STRUCTURING": "FATF-001",
    "FRESH_DESTINATION_ACCOUNT": "FATF-003",
    "DORMANT_DESTINATION": "FATF-006",
    "EXACT_BALANCE_RECONCILIATION": "FATF-004",
    "LARGE_VALUE_TRANSFER": "FATF-002",
    "HIGH_AMOUNT_TO_BALANCE": "FATF-002",
    "OFF_PATTERN_TIMING": "FATF-007",
    "AMOUNT_MAGNITUDE_OUTLIER": "FATF-002",
    "DESTINATION_BALANCE_ANOMALY": "FATF-002",
}


def name_cluster(cluster_id: int, cluster_mean: np.ndarray,
                 peer_mean: np.ndarray, feature_names: list[str]) -> tuple[str, str]:
    """Label a cluster by what makes it *different*, not by what it shares.

    Naming by the single largest Signal-1 share is the obvious rule and it does
    not work here: ``F6_hour`` carries 0.57-0.70 of mean Signal 1 across the
    whole flagged set, so almost every cluster reports the same dominant
    feature and the labels stop discriminating — a 98%-fraud cluster and a
    0%-fraud cluster would receive the same name and the same RAG key.

    The distinguishing feature is the one where this cluster's mean share
    exceeds the mean over the *other* clusters by the widest margin. That is
    what separates this typology from its peers, which is what a typology label
    is supposed to convey.
    """
    delta = np.asarray(cluster_mean) - np.asarray(peer_mean)
    j = int(np.argmax(delta))
    feat = feature_names[j]
    share = float(cluster_mean[j])
    label, why = FEATURE_STORY.get(
        feat, (f"TYPOLOGY_{cluster_id}", f"distinguished by {feat}"))
    return label, (f"{why} — {feat} carries {share:.0%} of this cluster's "
                   f"reconstruction error, {delta[j]:+.0%} against the other "
                   f"typologies")


@dataclass
class TypologyIndex:
    """Medoids and radii for one stratum's discovered typologies."""

    stratum: str
    feature_set: str
    eps: float
    fingerprint_width: int
    medoids: np.ndarray                 # (k, width)
    cluster_ids: list[int]
    labels: list[str]
    rationales: list[str]
    radii: list[float]
    sizes: list[int]
    purities: list[float]
    fatf_hints: list[str]
    n_fitted_rows: int
    coverage: float = COVERAGE

    # ------------------------------------------------------------- assign
    def assign(self, fingerprint: np.ndarray) -> dict:
        """Nearest medoid inside its radius, else UNASSIGNED."""
        fp = np.asarray(fingerprint, dtype=np.float64).ravel()
        if fp.shape[0] != self.fingerprint_width or not len(self.cluster_ids):
            return {"typology_label": UNASSIGNED, "cluster_id": -1,
                    "confidence": 0.0, "distance": None,
                    "rationale": "fingerprint width does not match this index"}
        d = np.linalg.norm(self.medoids - fp[None, :], axis=1)
        j = int(np.argmin(d))
        dist, radius = float(d[j]), float(self.radii[j])
        if dist > radius:
            return {"typology_label": UNASSIGNED, "cluster_id": -1,
                    "confidence": 0.0, "distance": round(dist, 6),
                    "nearest_label": self.labels[j],
                    "nearest_radius": round(radius, 6),
                    "rationale": ("outside every discovered cluster's radius; "
                                  "DBSCAN would call this noise")}
        return {
            "typology_label": self.labels[j],
            "cluster_id": int(self.cluster_ids[j]),
            # 1 at the medoid, 0 at the radius. A geometric fit measure, not a
            # probability of fraud.
            "confidence": round(float(max(0.0, 1.0 - dist / (radius + 1e-12))), 4),
            "distance": round(dist, 6),
            "cluster_fraud_purity": round(float(self.purities[j]), 4),
            "cluster_size": int(self.sizes[j]),
            "fatf_hint": self.fatf_hints[j],
            "rationale": self.rationales[j],
        }

    # ----------------------------------------------------------------- io
    def save(self, bundle_dir: Path) -> Path:
        d = Path(bundle_dir)
        with open(d / TYPOLOGY_FILE, "wb") as f:
            pickle.dump(self, f)
        (d / TYPOLOGY_META).write_text(json.dumps(self.summary(), indent=2))
        return d / TYPOLOGY_FILE

    @classmethod
    def load(cls, bundle_dir: Path) -> "TypologyIndex | None":
        p = Path(bundle_dir) / TYPOLOGY_FILE
        if not p.exists():
            return None
        with open(p, "rb") as f:
            return pickle.load(f)

    def summary(self) -> dict:
        return {
            "stratum": self.stratum,
            "feature_set": self.feature_set,
            "eps": self.eps,
            "fingerprint_width": self.fingerprint_width,
            "n_clusters": len(self.cluster_ids),
            "n_fitted_rows": self.n_fitted_rows,
            "assignment_rule": (f"nearest medoid within a radius covering "
                                f"{self.coverage:.0%} of that cluster's members; "
                                f"outside every radius -> {UNASSIGNED}"),
            "discovery": ("unsupervised — DBSCAN over DSAA fingerprints, no "
                          "label used at any point"),
            "labelling": ("post-hoc interpretation of each cluster's dominant "
                          "Signal-1 attribution; naming a discovered cluster "
                          "does not make the discovery supervised"),
            "clusters": [
                {"cluster_id": c, "label": lab, "size": s,
                 "fraud_purity": round(float(p), 4), "radius": round(float(r), 6),
                 "fatf_hint": f, "rationale": why}
                for c, lab, s, p, r, f, why in zip(
                    self.cluster_ids, self.labels, self.sizes, self.purities,
                    self.radii, self.fatf_hints, self.rationales)
            ],
        }


def build(stratum: str, feature_set: str, fingerprints: np.ndarray,
          labels: np.ndarray, signals: dict, eps: float,
          y: np.ndarray | None = None) -> TypologyIndex:
    """Build the index from a fitted DBSCAN labelling."""
    from vae_dsaa.typology.cluster import describe_clusters

    described = {c["cluster"]: c for c in describe_clusters(labels, signals, y=y)}
    ids, meds, labs, whys, radii, sizes, purities, hints = [], [], [], [], [], [], [], []

    feat_names = list(signals["feature_names"])
    s1 = signals["signal_1"]
    present = sorted({int(c) for c in labels if c != -1})
    # Mean Signal-1 profile per cluster, used to find what distinguishes each.
    profiles = {cid: s1[labels == cid].mean(axis=0) for cid in present}

    for cid in present:
        member = fingerprints[labels == cid]
        if len(member) == 0:
            continue
        # medoid: smallest mean distance to the other members
        dm = np.linalg.norm(member[:, None, :] - member[None, :, :], axis=2)
        medoid = member[int(np.argmin(dm.mean(axis=1)))]
        dist = np.linalg.norm(member - medoid[None, :], axis=1)
        info = described.get(cid, {})
        peers = [profiles[o] for o in present if o != cid]
        peer_mean = (np.mean(peers, axis=0) if peers
                     else np.zeros_like(profiles[cid]))
        lab, why = name_cluster(cid, profiles[cid], peer_mean, feat_names)

        ids.append(cid)
        meds.append(medoid)
        labs.append(lab)
        whys.append(why)
        radii.append(float(np.quantile(dist, COVERAGE)))
        sizes.append(int(len(member)))
        purities.append(float(info.get("precision_in_cluster", float("nan"))))
        hints.append(FATF_HINT.get(lab, "FATF-002"))

    return TypologyIndex(
        stratum=stratum, feature_set=feature_set, eps=float(eps),
        fingerprint_width=int(fingerprints.shape[1]),
        medoids=np.asarray(meds, dtype=np.float64) if meds
        else np.zeros((0, fingerprints.shape[1])),
        cluster_ids=ids, labels=labs, rationales=whys, radii=radii,
        sizes=sizes, purities=purities, fatf_hints=hints,
        n_fitted_rows=int(len(fingerprints)),
    )
