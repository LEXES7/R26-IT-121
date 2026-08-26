#!/usr/bin/env python
"""DSAA and typology under three row-selection variants.

Cluster validity indices are all sensitive to n. A weaker feature set flags far
fewer rows at its F1-optimal threshold, so comparing native runs across feature
sets confounds "the features were removed" with "DBSCAN had a third as many
points". These three variants separate those:

  native        rows at or above the F1-optimal threshold — operational reality
  size_matched  top-N by score, N fixed to the reference feature set's flagged
                count, so n is held constant across feature sets. This is the
                run that answers whether clusters still separate pure from
                impure, because purity needs a mixed set
  oracle        isFraud == 1 rows — size-matched by construction (821 per
                stratum). Tests whether fingerprints are structured and stable.
                CANNOT test precision separation: every row is fraud

eps is re-swept independently for every variant; a narrower fingerprint does not
share an eps scale with a wider one.

    python scripts/run_dsaa_variants.py --feature-set FS-CLEAN
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.dsaa.signals import compute_signals, fingerprint, mean_signals  # noqa: E402
from vae_dsaa.models.train import load_arrays                                 # noqa: E402
from vae_dsaa.typology import cluster as C                                     # noqa: E402
from vae_dsaa.utils.persistence import load_bundle                            # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
OUT = ROOT / "reports" / "v4" / "dsaa"
STRATA = ["TRANSFER", "CASH_OUT"]

#: flagged counts of the reference set (FS-ORIGIN), used to size-match
REFERENCE_N = {"TRANSFER": 955, "CASH_OUT": 690}


def log(*a):
    print(" ".join(str(x) for x in a), flush=True)


def signal_2_spread(sig, labels) -> dict:
    """Does Signal 2 vary by cluster, or collapse onto one dimension?"""
    s2, names = sig["signal_2"], sig["latent_names"]
    doms, per = [], {}
    for cid in sorted(set(labels)):
        if cid == -1:
            continue
        m = labels == cid
        if m.sum() < 3:
            continue
        mean = s2[m].mean(axis=0)
        d = int(np.argmax(mean))
        doms.append(d)
        per[str(cid)] = {"dominant_dim": names[d], "share": round(float(mean[d]), 4)}
    n_clusters = len(doms)
    n_distinct = len(set(doms))
    return {
        "per_cluster_dominant": per,
        "n_clusters_scored": n_clusters,
        "n_distinct_dominant_dims": n_distinct,
        "collapsed_to_one_dim": bool(n_clusters > 1 and n_distinct == 1),
        "verdict": ("collapsed — every cluster attributes to the same latent dim"
                    if n_clusters > 1 and n_distinct == 1
                    else f"varies — {n_distinct} distinct dominant dims across "
                         f"{n_clusters} clusters"),
    }


def signal_1_dominance(sig) -> dict:
    """Mean Signal-1 attribution, and whether one feature dominates."""
    m = sig["signal_1"].mean(axis=0)
    order = np.argsort(-m)
    top = sig["feature_names"][order[0]]
    return {"mean_shares": {n: round(float(v), 4)
                            for n, v in zip(sig["feature_names"], m)},
            "top_feature": top, "top_share": round(float(m[order[0]]), 4),
            "dominates": bool(m[order[0]] > 0.5)}


def run_variant(pred, Xt, yt, variant, ref_n) -> dict | None:
    thr = pred.thresholds["f1_optimal"]
    s_test = pred.score(Xt)

    if variant == "native":
        sel = s_test >= thr
        desc = "score >= F1-optimal threshold"
    elif variant == "size_matched":
        n = min(ref_n, len(s_test))
        idx = np.argpartition(-s_test, n - 1)[:n]
        sel = np.zeros(len(s_test), bool); sel[idx] = True
        desc = f"top-{n} by score (matched to FS-ORIGIN flagged count)"
    elif variant == "oracle":
        sel = yt == 1
        desc = "isFraud == 1 — ORACLE, supervised selection"
    else:
        raise ValueError(variant)

    n_sel = int(sel.sum())
    if n_sel < 30:
        return {"variant": variant, "n_selected": n_sel, "error": "too few rows"}

    y_sel = yt[sel]
    sig = compute_signals(pred, Xt[sel])
    fp = fingerprint(sig)
    sweep = C.sweep_eps(fp)
    if not sweep:
        return {"variant": variant, "n_selected": n_sel,
                "error": "no eps produced a usable partition"}
    best = sweep[0]
    lab = C.cluster(fp, best["eps"])
    stab = C.bootstrap_stability(fp, best["eps"])

    return {
        "variant": variant,
        "selection": desc,
        "threshold": thr,
        "n_test_rows": int(len(yt)),
        "n_selected": n_sel,
        "selection_rate": float(sel.mean()),
        "fraud_among_selected": int(y_sel.sum()),
        "precision_of_selected": float(y_sel.mean()),
        "recall_of_selected": float(y_sel.sum() / max(1, yt.sum())),
        "fingerprint_width": int(fp.shape[1]),
        "clustering": {**best, "bootstrap_stability": stab},
        "signal_2_variation": signal_2_spread(sig, lab),
        "signal_1_dominance": signal_1_dominance(sig),
        "mean_signals": mean_signals(sig, include_signal_3=True),
        "clusters": C.describe_clusters(lab, sig, y=y_sel),
        "eps_sweep_top3": sweep[:3],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--feature-set", required=True)
    ap.add_argument("--variants", nargs="*",
                    default=["native", "size_matched", "oracle"])
    a = ap.parse_args()
    fs = a.feature_set
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"feature_set": fs, "protocol": "clean",
              "reference_n_for_size_matching": REFERENCE_N,
              "note": ("Cluster validity indices depend on n. size_matched holds n "
                       "constant against the FS-ORIGIN flagged count so feature-set "
                       "effects are not confounded with sample size."),
              "strata": {}}

    for st in STRATA:
        log(f"\n{'='*66}\n{st} / {fs}\n{'='*66}")
        pred = load_bundle(MODELS / f"clean__{fs}__{st}")
        X, y, _, _, test = load_arrays(DATA, st, fs)
        Xt, yt = X[test], y[test]
        report["strata"][st] = {}
        for v in a.variants:
            r = run_variant(pred, Xt, yt, v, REFERENCE_N[st])
            report["strata"][st][v] = r
            if r.get("error"):
                log(f"  {v:<13} n={r['n_selected']}  ERROR: {r['error']}")
                continue
            c = r["clustering"]
            log(f"  {v:<13} n={r['n_selected']:>5}  "
                f"prec={r['precision_of_selected']*100:>5.1f}%  "
                f"k={c['n_clusters']:>2}  noise={c['noise_frac']*100:>5.1f}%  "
                f"DBCV={c['dbcv'] if c['dbcv'] is None else round(c['dbcv'],4)}  "
                f"sil={c['silhouette']:.4f}  "
                f"ARI={c['bootstrap_stability']['mean_ari']:.4f}")
            log(f"  {'':<13} S1 top: {r['signal_1_dominance']['top_feature']}="
                f"{r['signal_1_dominance']['top_share']}  |  S2: "
                f"{r['signal_2_variation']['verdict']}")

    p = OUT / f"dsaa_variants_{fs}.json"
    p.write_text(json.dumps(report, indent=2, default=float))
    log(f"\nwrote {p}")


if __name__ == "__main__":
    main()
