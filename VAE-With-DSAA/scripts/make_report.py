#!/usr/bin/env python
"""Regenerate RESULTS_v4.md from the authoritative metrics, and build Config D.

Config D (the stratified ensemble) is computed here from the saved bundles, so
it is deterministic and reproducible like every other configuration.

    python scripts/make_report.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.data import features as F                       # noqa: E402
from vae_dsaa.models.train import load_arrays, metrics_at, prec_at_k  # noqa: E402
from vae_dsaa.utils.persistence import load_bundle            # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
MODELS = ROOT / "checkpoints" / "v4"
REPORTS = ROOT / "reports" / "v4"
ALL = json.loads((REPORTS / "all_configs_v4.json").read_text())
OUT: list[str] = []
TIERS = ["FS-FULL", "FS-ORIGIN", "FS-ORIGIN-NOF3", "FS-CLEAN", "FS12", "FS13"]


def w(s=""):
    OUT.append(s)


def g(fs, st):
    return ALL.get(f"clean|{fs}|{st}")


def f(v, n=4):
    return "—" if v is None else f"{v:.{n}f}"


def build_config_d(fs: str) -> dict | None:
    """Per-type thresholds applied, then pooled across TRANSFER + CASH_OUT."""
    ys, ss, ps = [], [], []
    for st in ["TRANSFER", "CASH_OUT"]:
        bundle = MODELS / f"clean__{fs}__{st}"
        if not bundle.exists():
            return None
        p = load_bundle(bundle)
        X, y, _, _, test = load_arrays(DATA, st, fs)
        s = p.score(X[test])
        ys.append(y[test]); ss.append(s)
        ps.append(s >= p.thresholds["f1_optimal"])
    y = np.concatenate(ys); s = np.concatenate(ss); pred = np.concatenate(ps)
    tp = int((pred & (y == 1)).sum()); fp = int((pred & (y == 0)).sum())
    fn = int((~pred & (y == 1)).sum()); tn = int((~pred & (y == 0)).sum())
    pr = tp / (tp + fp) if tp + fp else 0.0
    rc = tp / (tp + fn) if tp + fn else 0.0
    base = float(y.mean())
    ap = float(average_precision_score(y, s))
    return {
        "config": f"clean|{fs}|D_ensemble", "feature_set": fs,
        "n_rows": int(len(y)), "n_fraud": int(y.sum()), "test_fraud_rate": base,
        "auc_pr_average_precision": ap, "ap_lift_over_base_rate": ap / base,
        "max_possible_ap_lift": 1.0 / base,
        "auc_roc": float(roc_auc_score(y, s)),
        "precision_at_500": prec_at_k(y, s, 500),
        "precision_at_1000": prec_at_k(y, s, 1000),
        "operating_point_per_type_thresholds": {
            "precision": pr, "recall": rc,
            "f1": 2 * pr * rc / (pr + rc) if pr + rc else 0.0,
            "f2": 5 * pr * rc / (4 * pr + rc) if 4 * pr + rc else 0.0,
            "tp": tp, "fp": fp, "tn": tn, "fn": fn,
            "fpr": fp / (fp + tn) if fp + tn else 0.0,
        },
        "note": ("Per-stratum F1-optimal thresholds applied, then pooled. "
                 "Deterministic — scored from saved bundles."),
    }


def stratum_table(st, title, base_note):
    w(f"### {title}")
    w()
    w(base_note)
    w()
    w("| Feature set | n | AUC-PR | AP lift | AUC-ROC | F1 | Precision | Recall | P@1000 |")
    w("|" + "---|" * 9)
    rows = [(t, g(t, st)) for t in TIERS]
    rows = [(t, m) for t, m in rows if m]
    rows.sort(key=lambda r: -(r[1]["auc_pr_average_precision"] or 0))
    for t, m in rows:
        op = m["operating_point_f1_optimal"]
        star = "**" if t == F.PRIMARY_FEATURE_SET else ""
        w(f"| {star}{t}{star} | {m['n_features']} | {f(m['auc_pr_average_precision'])} | "
          f"{f(m['ap_lift_over_base_rate'],2)}× | {f(m['auc_roc'])} | {f(op['f1'])} | "
          f"{f(op['precision'])} | {f(op['recall'])} | {f(m['precision_at_1000'],3)} |")
    w()


def main():
    d_results = {}
    for fs in ["FS-ORIGIN", "FS-FULL"]:
        d = build_config_d(fs)
        if d:
            d_results[fs] = d
            (REPORTS / f"clean__{fs}__D_ensemble.json").write_text(json.dumps(d, indent=2))

    w("# v4 Results — Clean Chronological Protocol")
    w()
    w(f"**Primary feature set: `{F.PRIMARY_FEATURE_SET}`** · protocol `clean` · "
      "split at step 595")
    w()
    w("> **Numbers changed on 25 August 2026.** Scoring previously sampled the")
    w("> latent variable (`z = mu + exp(0.5·logvar)·ε`), which made every score —")
    w("> and therefore every metric — dependent on RNG state. A reloaded model could")
    w("> not reproduce the figures recorded when it was trained. Inference now")
    w("> decodes the posterior mean; training still samples, which is correct. All")
    w("> figures below were regenerated after that fix and are reproducible via")
    w("> `scripts/roundtrip_check.py` (86 checks, 0 mismatches). Any earlier figure")
    w("> for the same experiment is superseded.")
    w()
    w("Source of truth: `reports/v4/all_configs_v4.json`.")
    w()

    w("## 1. Detection results by stratum")
    w()
    stratum_table("TRANSFER", "TRANSFER",
                  "Test: 11,546 rows · 821 fraud · base rate 7.11% · "
                  "**maximum attainable AP lift 14.06×**")
    stratum_table("CASH_OUT", "CASH_OUT",
                  "Test: 37,196 rows · 821 fraud · base rate 2.21% · "
                  "**maximum attainable AP lift 45.31×**")

    w("### GLOBAL (Config A) — one model across all types")
    w()
    w("| Feature set | AUC-PR | AP lift | AUC-ROC | F1 | P@1000 |")
    w("|" + "---|" * 6)
    for t in ["FS-ORIGIN", "FS-FULL"]:
        m = g(t, "GLOBAL")
        if not m:
            continue
        w(f"| {t} | {f(m['auc_pr_average_precision'])} | "
          f"{f(m['ap_lift_over_base_rate'],2)}× | {f(m['auc_roc'])} | "
          f"{f(m['operating_point_f1_optimal']['f1'])} | "
          f"{f(m['precision_at_1000'],3)} |")
    w()
    w("Test: 89,961 rows · 1,642 fraud · base rate 1.83% · max lift 54.79×.")
    w()

    w("### Config D — stratified ensemble")
    w()
    w("Per-stratum F1-optimal thresholds applied, then pooled over TRANSFER and")
    w("CASH_OUT. Computed from the saved bundles, so it is deterministic.")
    w()
    w("| Feature set | AUC-PR | AP lift | AUC-ROC | F1 | Precision | Recall |")
    w("|" + "---|" * 7)
    for fs, d in d_results.items():
        op = d["operating_point_per_type_thresholds"]
        w(f"| {fs} | {f(d['auc_pr_average_precision'])} | "
          f"{f(d['ap_lift_over_base_rate'],2)}× | {f(d['auc_roc'])} | "
          f"{f(op['f1'])} | {f(op['precision'])} | {f(op['recall'])} |")
    w()

    w("## 2. PAYMENT false-positive control")
    w()
    w("Zero fraud by construction. Threshold: 0.999 quantile on the validation")
    w("partition.")
    w()
    w("| Feature set | Threshold | False positives | FP rate |")
    w("|" + "---|" * 4)
    for t in TIERS:
        m = g(t, "PAYMENT")
        if not m or "payment_control" not in m:
            continue
        r = m["payment_control"]["rule_new_quantile_0.999"]
        star = "**" if t == F.PRIMARY_FEATURE_SET else ""
        w(f"| {star}{t}{star} | {r['threshold']:.3f} | {r['false_positives']:,} | "
          f"{r['fp_rate']*100:.3f}% |")
    w()
    w("The two sets retaining `F7_day` (FS12, FS13) fail catastrophically here —")
    w("the strongest single argument for excluding an absolute time index under a")
    w("chronological split.")
    w()

    w("## 3. The F3 dependence of FS-ORIGIN")
    w()
    w("`FS-ORIGIN-NOF3` removes `F3_balance_consistency` and nothing else.")
    w()
    w("| Stratum | FS-ORIGIN | FS-ORIGIN-NOF3 | FS-CLEAN |")
    w("|" + "---|" * 4)
    for st in ["TRANSFER", "CASH_OUT"]:
        a, b, c = g("FS-ORIGIN", st), g("FS-ORIGIN-NOF3", st), g("FS-CLEAN", st)
        if not (a and b and c):
            continue
        w(f"| {st} AP lift | {f(a['ap_lift_over_base_rate'],2)}× | "
          f"**{f(b['ap_lift_over_base_rate'],2)}×** | {f(c['ap_lift_over_base_rate'],2)}× |")
    w()
    sfb = REPORTS / "single_feature_baselines.json"
    if sfb.exists():
        s = json.loads(sfb.read_text())
        w("Deterministic single-feature baselines — the feature used directly as a")
        w("score, with no model:")
        w()
        w("| Stratum | Feature | AUC-PR | AP lift |")
        w("|" + "---|" * 4)
        for k, v in s.items():
            if "prevalence" in k:
                continue
            st, feat = k.split("|")
            w(f"| {st} | `{feat}` | {v['ap']:.4f} | {v['lift']:.2f}× |")
        w()
    w("Removing F3 collapses FS-ORIGIN to roughly FS-CLEAN's level on both strata,")
    w("and FS-ORIGIN barely exceeds `F4_balance_change_ratio` used alone. FS-ORIGIN")
    w("is defensible as the tier that removes the destination-side artifact, but it")
    w("does not demonstrate that the VAE adds capability over a single column.")
    w()

    (ROOT / "reports" / "RESULTS_v4.md").write_text("\n".join(OUT), encoding="utf-8")
    print(f"wrote reports/RESULTS_v4.md ({len(OUT)} lines)")
    for fs, d in d_results.items():
        print(f"Config D {fs}: AP {d['auc_pr_average_precision']:.4f} "
              f"lift {d['ap_lift_over_base_rate']:.2f}x "
              f"F1 {d['operating_point_per_type_thresholds']['f1']:.4f}")


if __name__ == "__main__":
    main()
