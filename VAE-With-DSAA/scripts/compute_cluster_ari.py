#!/usr/bin/env python
"""ARI and AMI between discovered clusters and fraud labels.

The proposal commits to validating typology discovery with "silhouette score,
adjusted Rand index, and alignment with known PaySim fraud patterns". The only
ARI figures in the project so far measure bootstrap cluster stability and the v3
clusters-versus-transaction-type confound — neither is the index the proposal
names. This computes it.

Reported two ways, because the treatment of DBSCAN noise changes the answer:
  (i)  noise excluded      — agreement among rows that were assigned a cluster
  (ii) noise as a cluster  — noise treated as one more label, so rows DBSCAN
                             could not place still count against the partition

Adjusted Mutual Information is reported alongside, because ARI is known to
behave poorly when there are many small clusters and CASH_OUT has eleven.

Oracle variants are skipped: every row in them is fraud, so the label vector is
constant and ARI/AMI are degenerate rather than informative.

    python scripts/compute_cluster_ari.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import adjusted_mutual_info_score, adjusted_rand_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.dsaa.signals import compute_signals, fingerprint   # noqa: E402
from vae_dsaa.models.train import load_arrays                     # noqa: E402
from vae_dsaa.typology import cluster as C                        # noqa: E402
from vae_dsaa.utils.persistence import load_bundle                # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
DSAA = ROOT / "reports" / "v4" / "dsaa"
REFERENCE_N = {"TRANSFER": 955, "CASH_OUT": 690}
MIXED_VARIANTS = ["native", "size_matched"]


def select(pred, Xt, yt, variant, ref_n):
    s = pred.score(Xt)
    if variant == "native":
        return s >= pred.thresholds["f1_optimal"]
    if variant == "size_matched":
        n = min(ref_n, len(s))
        idx = np.argpartition(-s, n - 1)[:n]
        m = np.zeros(len(s), bool); m[idx] = True
        return m
    raise ValueError(variant)


def main() -> None:
    summary = []
    for fs in ["FS-ORIGIN", "FS-CLEAN"]:
        path = DSAA / f"dsaa_variants_{fs}.json"
        report = json.loads(path.read_text())
        for st, variants in report["strata"].items():
            pred = load_bundle(MODELS / f"clean__{fs}__{st}")
            X, y, _, _, test = load_arrays(DATA, st, fs)
            Xt, yt = X[test], y[test]

            for v, rec in variants.items():
                if v not in MIXED_VARIANTS or rec.get("error"):
                    if v == "oracle":
                        rec["cluster_vs_fraud_agreement"] = {
                            "applicable": False,
                            "reason": ("every row in the oracle variant is fraud, so "
                                       "the label vector is constant; ARI and AMI are "
                                       "degenerate and are not reported"),
                        }
                    continue

                sel = select(pred, Xt, yt, v, REFERENCE_N[st])
                y_sel = yt[sel]
                sig = compute_signals(pred, Xt[sel])
                lab = C.cluster(fingerprint(sig), rec["clustering"]["eps"])

                keep = lab != -1
                # (i) noise excluded
                ari_ex = float(adjusted_rand_score(y_sel[keep], lab[keep])) if keep.sum() > 1 else None
                ami_ex = float(adjusted_mutual_info_score(y_sel[keep], lab[keep])) if keep.sum() > 1 else None
                # (ii) noise as its own cluster
                ari_in = float(adjusted_rand_score(y_sel, lab))
                ami_in = float(adjusted_mutual_info_score(y_sel, lab))

                rec["cluster_vs_fraud_agreement"] = {
                    "applicable": True,
                    "n_selected": int(sel.sum()),
                    "base_rate_fraud_among_selected": float(y_sel.mean()),
                    "n_clusters": int(len(set(lab[keep]))),
                    "noise_fraction": float((~keep).mean()),
                    "noise_excluded": {"adjusted_rand_index": ari_ex,
                                       "adjusted_mutual_information": ami_ex,
                                       "n_scored": int(keep.sum())},
                    "noise_as_cluster": {"adjusted_rand_index": ari_in,
                                         "adjusted_mutual_information": ami_in,
                                         "n_scored": int(len(lab))},
                    "note": ("ARI and AMI are base-rate independent, unlike a purity "
                             "spread in percentage points, so they compare feature "
                             "sets whose flagged sets differ in fraud prevalence."),
                }
                summary.append({
                    "feature_set": fs, "stratum": st, "variant": v,
                    "n": int(sel.sum()), "base_rate": float(y_sel.mean()),
                    "k": int(len(set(lab[keep]))), "noise": float((~keep).mean()),
                    "ari_excl": ari_ex, "ami_excl": ami_ex,
                    "ari_incl": ari_in, "ami_incl": ami_in,
                })
        path.write_text(json.dumps(report, indent=2, default=float))
        print(f"updated {path.name}")

    print()
    hdr = (f"{'feature set':<11}{'stratum':<10}{'variant':<14}{'n':>6}{'base':>7}"
           f"{'k':>4}{'noise':>7}{'ARI ex':>9}{'AMI ex':>9}{'ARI in':>9}{'AMI in':>9}")
    print(hdr); print("-" * len(hdr))
    for r in summary:
        print(f"{r['feature_set']:<11}{r['stratum']:<10}{r['variant']:<14}"
              f"{r['n']:>6}{r['base_rate']*100:>6.1f}%{r['k']:>4}{r['noise']*100:>6.1f}%"
              f"{r['ari_excl']:>9.4f}{r['ami_excl']:>9.4f}"
              f"{r['ari_incl']:>9.4f}{r['ami_incl']:>9.4f}")

    (DSAA / "cluster_vs_fraud_ari.json").write_text(json.dumps(summary, indent=2, default=float))
    print(f"\nwrote {DSAA / 'cluster_vs_fraud_ari.json'}")


if __name__ == "__main__":
    main()
