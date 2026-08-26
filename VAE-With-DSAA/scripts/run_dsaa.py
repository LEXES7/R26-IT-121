#!/usr/bin/env python
"""DSAA and typology discovery on the clean v4 bundles.

    python scripts/run_dsaa.py [--feature-set FS-ORIGIN]

Writes reports/v4/dsaa/ — signals, typologies, validation indices, the gamma
comparison, and the v3 confound quantification.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.data import features as F                     # noqa: E402
from vae_dsaa.dsaa.signals import (compute_signals,          # noqa: E402
                                   fingerprint, mean_signals)
from vae_dsaa.models.train import evaluate, load_arrays, best_threshold  # noqa: E402
from vae_dsaa.typology import cluster as C                   # noqa: E402
from vae_dsaa.utils.persistence import load_bundle           # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
OUT = ROOT / "reports" / "v4" / "dsaa"
STRATA = ["TRANSFER", "CASH_OUT"]          # PAYMENT has no fraud to attribute


def log(*a):
    print(" ".join(str(x) for x in a), flush=True)


# ----------------------------------------------------------------- gamma
def gamma_comparison(pred, X, y, X_val, y_val):
    """Option A keeps gamma and attributes it; Option B sets gamma to 0.

    Re-scores from saved components — no retraining. Thresholds are re-selected
    on the validation partition for each variant, so the comparison is fair.
    """
    from vae_dsaa.inference.scorer import _nearest, encode_all
    s = pred.stats

    def parts(Xr):
        Xs = pred.scaler.transform(np.asarray(Xr, dtype=np.float32))
        mu, lv, recon = encode_all(pred.model, Xs)
        rec = np.sum((Xs - recon) ** 2, axis=1)
        kl = np.sum(-0.5 * (1 + lv - mu ** 2 - np.exp(lv)), axis=1)
        dens = _nearest(mu, np.asarray(pred.centers))
        return ((rec - s["recon_mean"]) / s["recon_std"],
                (kl - s["kl_mean"]) / s["kl_std"],
                (dens - s["dens_mean"]) / s["dens_std"])

    zr_v, zk_v, zd_v = parts(X_val)
    zr_t, zk_t, zd_t = parts(X)
    out = {}
    for name, (a, b, g) in {
        "A_keep_gamma_0.5_0.3_0.2": (0.5, 0.3, 0.2),
        "B_gamma_zero_renormalised_0.625_0.375_0.0": (0.625, 0.375, 0.0),
    }.items():
        sv = a * zr_v + b * zk_v + g * zd_v
        st = a * zr_t + b * zk_t + g * zd_t
        t1 = best_threshold(y_val, sv, 1.0) if y_val.sum() else float(np.quantile(sv, 0.999))
        t2 = best_threshold(y_val, sv, 2.0) if y_val.sum() else t1
        m = evaluate(name, y, st, t1, t2, "gamma_variant", 0)
        out[name] = {"weights": {"alpha": a, "beta": b, "gamma": g},
                     "auc_pr": m["auc_pr_average_precision"],
                     "ap_lift": m["ap_lift_over_base_rate"],
                     "auc_roc": m["auc_roc"],
                     "f1": m["operating_point_f1_optimal"]["f1"],
                     "precision_at_1000": m["precision_at_1000"]}
    a, b = out["A_keep_gamma_0.5_0.3_0.2"], out["B_gamma_zero_renormalised_0.625_0.375_0.0"]
    out["delta_B_minus_A"] = {
        "auc_pr": b["auc_pr"] - a["auc_pr"],
        "ap_lift": b["ap_lift"] - a["ap_lift"],
        "f1": b["f1"] - a["f1"],
    }
    return out


# ------------------------------------------------------------- v3 confound
def v3_confound():
    """ARI between the v3 cluster labels and transaction type."""
    p = ROOT / "DeepSentinel-VAE-Results" / "DeepSentinel_DSAA_v3" / "fingerprints.npz"
    if not p.exists():
        return {"available": False}
    d = np.load(p, allow_pickle=True)
    lab, ftype = d["cluster_labels"], d["fraud_type"]
    keep = lab != -1
    groups = (ftype == "TRANSFER").astype(int)
    per = {}
    for cid in sorted(set(lab[keep].tolist())):
        m = lab == cid
        t = int((ftype[m] == "TRANSFER").sum()); o = int((ftype[m] == "CASH_OUT").sum())
        per[str(cid)] = {"size": int(m.sum()), "TRANSFER": t, "CASH_OUT": o,
                         "purity": max(t, o) / max(1, t + o)}
    return {"available": True,
            "ari_clusters_vs_transaction_type": C.confound_ari(lab, groups),
            "n_clusters": int(len(set(lab[keep].tolist()))),
            "n_rows": int(len(lab)),
            "clusters_100pct_one_type": sum(1 for v in per.values() if v["purity"] == 1.0),
            "per_cluster": per,
            "note": ("v3 padded Signal 2 to the widest latent dimension, so TRANSFER "
                     "rows carried exact zeros in dims 8-15. The two strata were "
                     "separable before clustering began.")}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--feature-set", default=F.PRIMARY_FEATURE_SET)
    a = ap.parse_args()
    fs = a.feature_set
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"feature_set": fs, "protocol": "clean", "strata": {}}

    for st in STRATA:
        log(f"\n=== {st} / {fs} ===")
        pred = load_bundle(MODELS / f"clean__{fs}__{st}")
        X, y, _, val, test = load_arrays(DATA, st, fs)
        Xt, yt = X[test], y[test]
        thr = pred.thresholds["f1_optimal"]

        # ---- (a) model-flagged selection, not label selection --------------
        s_test = pred.score(Xt)
        flagged = C.select_rows(s_test, thr)
        n_fl = int(flagged.sum())
        prec = float(yt[flagged].mean()) if n_fl else 0.0
        log(f"  flagged {n_fl:,}/{len(yt):,} rows | fraud among flagged "
            f"{int(yt[flagged].sum()):,} ({prec*100:.1f}%) | recall "
            f"{yt[flagged].sum()/max(1,yt.sum())*100:.1f}%")

        sig = compute_signals(pred, Xt[flagged])
        fp = fingerprint(sig)
        log(f"  fingerprint {fp.shape} (S1 {len(sig['feature_names'])} + "
            f"S2 {len(sig['latent_names'])}, no padding)")

        # ---- (b/c) per-stratum clustering + validation ---------------------
        sweep = C.sweep_eps(fp)
        if not sweep:
            log("  no usable eps found"); continue
        best = sweep[0]
        lab = C.cluster(fp, best["eps"])
        stab = C.bootstrap_stability(fp, best["eps"])
        log(f"  eps={best['eps']:.2f} -> {best['n_clusters']} clusters, "
            f"noise {best['noise_frac']*100:.1f}% | DBCV={best['dbcv']} "
            f"silhouette={best['silhouette']:.4f}")
        log(f"  bootstrap stability ARI {stab['mean_ari']:.4f} +/- {stab['std_ari']:.4f}")

        # ---- oracle comparison: label-selected rows ------------------------
        sig_o = compute_signals(pred, Xt[yt == 1])
        fp_o = fingerprint(sig_o)
        sweep_o = C.sweep_eps(fp_o)
        oracle = None
        if sweep_o:
            lab_o = C.cluster(fp_o, sweep_o[0]["eps"])
            oracle = {"selection": "ORACLE — rows selected by isFraud == 1 (supervised)",
                      "n_rows": int((yt == 1).sum()),
                      **{k: sweep_o[0][k] for k in
                         ("eps", "n_clusters", "noise_frac", "dbcv", "silhouette")},
                      "clusters": C.describe_clusters(lab_o, sig_o)}

        report["strata"][st] = {
            "selection": {
                "method": "model-flagged: score >= stratum F1-optimal threshold",
                "threshold": thr,
                "n_test_rows": int(len(yt)),
                "n_flagged": n_fl,
                "flag_rate": float(flagged.mean()),
                "fraud_among_flagged": int(yt[flagged].sum()),
                "precision_of_flagged": prec,
                "recall_of_flagged": float(yt[flagged].sum() / max(1, yt.sum())),
            },
            "fingerprint": {"width": int(fp.shape[1]),
                            "signal_1_width": len(sig["feature_names"]),
                            "signal_2_width": len(sig["latent_names"]),
                            "zero_padded": False},
            "mean_signals": mean_signals(sig, include_signal_3=True),
            "clustering": {**best, "bootstrap_stability": stab,
                           "clusters": C.describe_clusters(lab, sig, y=yt[flagged])},
            "eps_sweep_top5": sweep[:5],
            "oracle_label_selected": oracle,
            "gamma_comparison": gamma_comparison(pred, Xt, yt, X[val], y[val]),
        }
        g = report["strata"][st]["gamma_comparison"]
        log(f"  gamma A(keep)={g['A_keep_gamma_0.5_0.3_0.2']['auc_pr']:.4f} "
            f"B(zero)={g['B_gamma_zero_renormalised_0.625_0.375_0.0']['auc_pr']:.4f} "
            f"delta={g['delta_B_minus_A']['auc_pr']:+.4f}")

    report["v3_confound"] = v3_confound()
    if report["v3_confound"].get("available"):
        log(f"\nv3 confound: ARI(clusters, transaction type) = "
            f"{report['v3_confound']['ari_clusters_vs_transaction_type']:.4f}, "
            f"{report['v3_confound']['clusters_100pct_one_type']}/"
            f"{report['v3_confound']['n_clusters']} clusters are 100% one type")

    (OUT / f"dsaa_{fs}.json").write_text(json.dumps(report, indent=2, default=float))
    log(f"\nwrote {OUT / f'dsaa_{fs}.json'}")


if __name__ == "__main__":
    main()
