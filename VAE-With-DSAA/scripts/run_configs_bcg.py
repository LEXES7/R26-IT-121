#!/usr/bin/env python
"""Configurations B, C and G from the proposal's seven-configuration ablation.

    B  single GLOBAL VAE  + PER-TYPE thresholds
    C  STRATIFIED VAEs    + a SINGLE GLOBAL threshold
    G  stratified VAE trained on F3_balance_consistency as the ONLY input

B and C need no training — only the threshold rule changes, so they reuse the
existing bundles. G is trained here.

Together B and C isolate the two halves of contribution N1: B holds the model
global and varies the threshold, C holds the threshold global and varies the
model. Comparing both against A (global model, global threshold) and D
(stratified model, per-type thresholds) attributes the gain to one or the other.

    python scripts/run_configs_bcg.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.data import features as F                              # noqa: E402
from vae_dsaa.inference.scorer import MinMax, fit_scorer, score      # noqa: E402
from vae_dsaa.models.train import (ANNEAL_EPOCHS, BETA_MAX,          # noqa: E402
                                   FREE_BITS, SPLIT_STEP,
                                   best_threshold, load_arrays,
                                   metrics_at, prec_at_k)
from vae_dsaa.models.vae import train_vae                            # noqa: E402
from vae_dsaa.utils.persistence import load_bundle, save_bundle      # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
REPORTS = ROOT / "reports" / "v4"
PAIR = ["TRANSFER", "CASH_OUT"]        # PAYMENT has no fraud; excluded from pooled metrics

#: Config G architecture. The input is a single BINARY feature, so the encoder
#: has almost nothing to compress. Hidden widths are kept identical to
#: TRANSFER/PAYMENT (32/16) so the only controlled difference from the other
#: bundles is the input dimension. latent_dim is set to 2 rather than 8: with one
#: binary input, eight latent dimensions would be pure over-parameterisation and
#: the Free Bits floor (0.1 nats x 8 dims) would dominate the objective. Two is
#: the smallest width that still permits per-dimension KL attribution, which
#: Signal 2 requires — latent_dim=1 would make Signal 2 constant at 1.0.
ARCH_G = {"h1": 32, "h2": 16, "latent": 2}


def log(*a):
    print(" ".join(str(x) for x in a), flush=True)


def pooled(name, y, s, pred, extra=None):
    tp = int((pred & (y == 1)).sum()); fp = int((pred & (y == 0)).sum())
    fn = int((~pred & (y == 1)).sum()); tn = int((~pred & (y == 0)).sum())
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    base = float(y.mean()); ap = float(average_precision_score(y, s))
    return {
        "config": name, "n_rows": int(len(y)), "n_fraud": int(y.sum()),
        "test_fraud_rate": base, "auc_pr_average_precision": ap,
        "ap_lift_over_base_rate": ap / base, "max_possible_ap_lift": 1.0 / base,
        "auc_roc": float(roc_auc_score(y, s)),
        "precision_at_500": prec_at_k(y, s, 500),
        "precision_at_1000": prec_at_k(y, s, 1000),
        "operating_point": {"precision": p, "recall": r,
                            "f1": 2 * p * r / (p + r) if p + r else 0.0,
                            "f2": 5 * p * r / (4 * p + r) if 4 * p + r else 0.0,
                            "tp": tp, "fp": fp, "tn": tn, "fn": fn,
                            "fpr": fp / (fp + tn) if fp + tn else 0.0,
                            "flag_rate": float(pred.mean())},
        **(extra or {}),
    }


# ------------------------------------------------------------------ Config B
def config_b(fs):
    """One GLOBAL model, but a separate threshold selected per stratum."""
    g = MODELS / f"clean__{fs}__GLOBAL"
    if not g.exists():
        return None
    pred = load_bundle(g)
    ys, ss, ps, thr = [], [], [], {}
    for st in PAIR:
        X, y, _, val, test = load_arrays(DATA, st, fs)
        s_val, s_test = pred.score(X[val]), pred.score(X[test])
        t = best_threshold(y[val], s_val, 1.0)
        thr[st] = t
        ys.append(y[test]); ss.append(s_test); ps.append(s_test >= t)
    return pooled(f"clean|{fs}|B_global_model_pertype_threshold",
                  np.concatenate(ys), np.concatenate(ss), np.concatenate(ps),
                  {"per_type_thresholds": thr,
                   "isolates": "thresholding alone — model held global"})


# ------------------------------------------------------------------ Config C
def config_c(fs):
    """Stratified models, but ONE threshold shared across strata."""
    ys, ss, comparability = [], [], {}
    val_scores = []
    for st in PAIR:
        b = MODELS / f"clean__{fs}__{st}"
        if not b.exists():
            return None
        pred = load_bundle(b)
        X, y, _, val, test = load_arrays(DATA, st, fs)
        sv, stt = pred.score(X[val]), pred.score(X[test])
        val_scores.append((st, y[val], sv))
        ys.append(y[test]); ss.append(stt)

        # comparability evidence: the normal-row score distribution per stratum
        nv = sv[y[val] == 0]
        comparability[st] = {
            "validation_normal_score_quantiles": {
                q: float(np.quantile(nv, q / 100))
                for q in (50, 90, 99, 99.9)},
            "mean": float(nv.mean()), "std": float(nv.std()),
        }

    # single threshold selected on the POOLED validation set
    yv = np.concatenate([v[1] for v in val_scores])
    sv = np.concatenate([v[2] for v in val_scores])
    t = best_threshold(yv, sv, 1.0)

    y = np.concatenate(ys); s = np.concatenate(ss)
    q = comparability
    med = [q[st]["validation_normal_score_quantiles"][50] for st in PAIR]
    p999 = [q[st]["validation_normal_score_quantiles"][99.9] for st in PAIR]
    comparable = abs(med[0] - med[1]) < 0.5 and abs(p999[0] - p999[1]) / max(p999) < 0.5
    return pooled(f"clean|{fs}|C_stratified_model_global_threshold",
                  y, s, s >= t,
                  {"global_threshold": float(t),
                   "isolates": "stratified modelling alone — threshold held global",
                   "score_comparability": {
                       "assumption": ("A single threshold is only meaningful if the "
                                      "per-stratum scores share a scale. Each term is "
                                      "z-normalised using that stratum's own validation "
                                      "statistics, so scores are in standardised units."),
                       "evidence": comparability,
                       "median_gap": abs(med[0] - med[1]),
                       "p99.9_relative_gap": abs(p999[0] - p999[1]) / max(p999),
                       "verdict": ("comparable in standardised units" if comparable
                                   else "NOT comparable — the tails differ in scale, so "
                                        "this pooled figure understates Config C and "
                                        "should be read as a lower bound"),
                   }})


# ------------------------------------------------------------------ Config G
def config_g(seed=42):
    """Stratified VAE on F3_balance_consistency alone."""
    fs = "FS-F3ONLY"
    out = {}
    for st in PAIR:
        X, y, fit, val, test = load_arrays(DATA, st, fs)
        fit_n, val_n = fit & (y == 0), val & (y == 0)
        scaler = MinMax().fit(X[fit_n])
        log(f"  [G|{st}] 1 feature | fit {int(fit_n.sum()):,} | "
            f"test {int(test.sum()):,} ({int(y[test].sum()):,} fraud)")
        model, hist = train_vae(scaler.transform(X[fit_n]), scaler.transform(X[val_n]),
                                ARCH_G, free_bits=FREE_BITS, beta_max=BETA_MAX,
                                anneal_epochs=ANNEAL_EPOCHS, seed=seed, log=log)
        stats = fit_scorer(model, scaler.transform(X[val_n]), seed=seed)
        sv = score(model, scaler.transform(X[val]), stats)
        stt = score(model, scaler.transform(X[test]), stats)
        t1 = best_threshold(y[val], sv, 1.0)
        base = float(y[test].mean()); ap = float(average_precision_score(y[test], stt))
        m = {"config": f"clean|{fs}|{st}", "feature_set": fs, "n_features": 1,
             "n_rows": int(test.sum()), "n_fraud": int(y[test].sum()),
             "test_fraud_rate": base, "auc_pr_average_precision": ap,
             "ap_lift_over_base_rate": ap / base, "max_possible_ap_lift": 1.0 / base,
             "auc_roc": float(roc_auc_score(y[test], stt)),
             "precision_at_500": prec_at_k(y[test], stt, 500),
             "precision_at_1000": prec_at_k(y[test], stt, 1000),
             "operating_point_f1_optimal": metrics_at(y[test], stt, t1),
             "train": hist,
             "architecture_note": (
                 "latent_dim 2, not 8. One binary input leaves nothing to compress; "
                 "8 dims would be over-parameterisation and the Free Bits floor "
                 "(0.1 x 8) would dominate the objective. latent_dim 1 would make "
                 "Signal 2 constant at 1.0 and destroy per-dimension attribution. "
                 "Hidden widths 32/16 are unchanged from the other bundles.")}
        save_bundle(MODELS, "clean", fs, st, model=model, scaler=scaler,
                    kmeans_centers=np.asarray(stats["cluster_centers"]), stats=stats,
                    thresholds={"f1_optimal": t1, "f2_optimal": t1,
                                "selection_set": "validation partition"},
                    features=F.columns(fs), arch=ARCH_G, free_bits=FREE_BITS,
                    beta_max=BETA_MAX, anneal_epochs=ANNEAL_EPOCHS,
                    split_step=SPLIT_STEP, train_history=hist,
                    extra={"provenance": F.describe(fs), "seed": seed,
                           "config": "G"})
        out[m["config"]] = m
        log(f"    AP={ap:.4f} lift={ap/base:.2f} "
            f"F1={m['operating_point_f1_optimal']['f1']:.4f}")
    return out


def main():
    t0 = time.time()
    results = {}
    for fs in ["FS-ORIGIN", "FS-FULL"]:
        log(f"\n=== Config B / {fs} ===")
        b = config_b(fs)
        if b:
            results[b["config"]] = b
            log(f"    AP={b['auc_pr_average_precision']:.4f} "
                f"lift={b['ap_lift_over_base_rate']:.2f} "
                f"F1={b['operating_point']['f1']:.4f}")
        log(f"=== Config C / {fs} ===")
        c = config_c(fs)
        if c:
            results[c["config"]] = c
            log(f"    AP={c['auc_pr_average_precision']:.4f} "
                f"lift={c['ap_lift_over_base_rate']:.2f} "
                f"F1={c['operating_point']['f1']:.4f}")
            log(f"    comparability: {c['score_comparability']['verdict']}")
    log("\n=== Config G (training) ===")
    results.update(config_g())

    combined = REPORTS / "all_configs_v4.json"
    prev = json.loads(combined.read_text())
    prev.update(results)
    combined.write_text(json.dumps(prev, indent=2))
    (REPORTS / "configs_bcg.json").write_text(json.dumps(results, indent=2))
    log(f"\nDONE {len(results)} entries in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
