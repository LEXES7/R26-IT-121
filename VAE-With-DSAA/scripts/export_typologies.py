#!/usr/bin/env python
"""Fit the typology index each stratum serves, and persist it in its bundle.

    python scripts/export_typologies.py
    python scripts/export_typologies.py --feature-set FS-ORIGIN

DBSCAN partitions only the set it was fitted on, so an unseen transaction
cannot be given a typology without an explicit assignment rule. This runs the
same discovery the research pipeline runs — model-flagged rows, per-stratum
fingerprints, eps chosen by a DBCV-ranked sweep — then stores each cluster's
medoid and radius so serving can assign by nearest medoid.

PAYMENT is skipped: it is the false-positive control stratum and carries no
fraud, so there is no typology to discover there.

Writes typology.pkl and typology.json into each bundle directory. Nothing is
retrained and no existing bundle file is modified.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.dsaa.signals import compute_signals, fingerprint          # noqa: E402
from vae_dsaa.models.train import load_arrays                           # noqa: E402
from vae_dsaa.typology import assign as A                               # noqa: E402
from vae_dsaa.typology import cluster as C                              # noqa: E402
from vae_dsaa.utils.persistence import load_bundle                      # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
STRATA = ["TRANSFER", "CASH_OUT", "GLOBAL"]      # PAYMENT has no fraud


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--feature-set", default="FS-ORIGIN")
    ap.add_argument("--protocol", default="clean")
    a = ap.parse_args()

    report = {"feature_set": a.feature_set, "protocol": a.protocol, "strata": {}}

    for stratum in STRATA:
        d = MODELS / f"{a.protocol}__{a.feature_set}__{stratum}"
        if not d.exists():
            print(f"  SKIP {stratum}: no bundle")
            continue

        pred = load_bundle(d)
        X, y, _fit, _val, test = load_arrays(DATA, stratum, a.feature_set)
        Xt, yt = X[test], y[test]

        thr = pred.thresholds["f1_optimal"]
        flagged = C.select_rows(pred.score(Xt), thr)
        n_fl = int(flagged.sum())
        if n_fl < 20:
            print(f"  SKIP {stratum}: only {n_fl} flagged rows")
            continue

        sig = compute_signals(pred, Xt[flagged], with_signal_3=False)
        fp = fingerprint(sig)
        sweep = C.sweep_eps(fp)
        if not sweep:
            print(f"  SKIP {stratum}: no usable eps")
            continue
        best = sweep[0]
        labels = C.cluster(fp, best["eps"])

        idx = A.build(stratum, a.feature_set, fp, labels, sig,
                      best["eps"], y=yt[flagged])
        idx.save(d)

        # Self-check: every fitted member should land back in its own cluster.
        hits = 0
        for i in np.flatnonzero(labels != -1):
            got = idx.assign(fp[i])
            if got["cluster_id"] == int(labels[i]):
                hits += 1
        n_member = int((labels != -1).sum())
        recovery = hits / max(1, n_member)

        report["strata"][stratum] = {
            **idx.summary(),
            "flagged_rows": n_fl,
            "fraud_among_flagged": int(yt[flagged].sum()),
            "dbcv": best["dbcv"],
            "silhouette": best["silhouette"],
            "noise_frac": best["noise_frac"],
            "self_assignment_recovery": round(recovery, 4),
        }
        print(f"  {stratum:9s} eps={best['eps']:.2f} clusters={len(idx.cluster_ids)} "
              f"flagged={n_fl} DBCV={best['dbcv']:.4f} "
              f"self-recovery={recovery:.1%}")
        for c, lab, s, p in zip(idx.cluster_ids, idx.labels, idx.sizes, idx.purities):
            print(f"      cl{c:<3d} n={s:<5d} purity={p:.3f}  {lab}")

    out = ROOT / "reports" / "v4" / "typology_index_report.json"
    out.write_text(json.dumps(report, indent=2))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
