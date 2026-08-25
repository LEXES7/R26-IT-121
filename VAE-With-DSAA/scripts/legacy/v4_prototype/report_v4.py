"""
v4 reporting — builds the deliverable tables, Config D, PR curves and the
methodology paragraph. Reads only results/v4/ plus the v3 metrics (read-only).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt          # noqa: E402
import numpy as np                       # noqa: E402
from sklearn.metrics import (average_precision_score, precision_recall_curve,
                             roc_auc_score)                      # noqa: E402

ROOT = Path(r"D:\Research\VAE-With-DSAA")
V4 = ROOT / "results" / "v4"
V3 = ROOT / "DeepSentinel-VAE-Results" / "DeepSentinel_Results_v3"

ALL = json.loads((V4 / "metrics" / "all_configs.json").read_text())
PREP = json.loads((V4 / "metrics" / "prep_report.json").read_text())
CUR = np.load(V4 / "curves" / "pr_inputs.npz")
OUT = []


def w(s=""):
    OUT.append(s)
    # the Windows console is cp1252; the file itself is written as UTF-8
    enc = sys.stdout.encoding or "utf-8"
    print(s.encode(enc, errors="replace").decode(enc))


def g(proto, fs, stratum):
    return ALL.get(f"{proto}|{fs}|{stratum}")


def ys(proto, fs, stratum):
    k = f"{proto}__{fs}__{stratum}"
    return CUR[k + "__y"], CUR[k + "__s"]


def fmt(v, n=4):
    return "—" if v is None else f"{v:.{n}f}"


# ---------------------------------------------------------------- Config D
def build_config_d(proto, fs):
    """Stratified ensemble: per-type thresholds applied, then pooled."""
    yy, ss, pred = [], [], []
    for s in ["TRANSFER", "CASH_OUT"]:
        m = g(proto, fs, s)
        if m is None:
            return None
        y, sc = ys(proto, fs, s)
        for op in ["f2", "f1"]:
            pass
        yy.append(y); ss.append(sc)
        pred.append(sc >= m["operating_point_f2_optimal"]["threshold"])
    y = np.concatenate(yy); s = np.concatenate(ss); p = np.concatenate(pred)
    tp = int((p & (y == 1)).sum()); fp = int((p & (y == 0)).sum())
    fn = int((~p & (y == 1)).sum()); tn = int((~p & (y == 0)).sum())
    pr = tp / (tp + fp) if tp + fp else 0.0
    rc = tp / (tp + fn) if tp + fn else 0.0
    return {
        "config": f"{proto}|{fs}|D_ensemble",
        "n_rows": int(len(y)), "n_fraud": int(y.sum()),
        "test_fraud_rate": float(y.mean()),
        "auc_pr_average_precision": float(average_precision_score(y, s)),
        "auc_roc": float(roc_auc_score(y, s)),
        "precision_at_500": float(y[np.argpartition(-s, 499)[:500]].sum()) / 500,
        "precision_at_1000": float(y[np.argpartition(-s, 999)[:1000]].sum()) / 1000,
        "operating_point_f2_optimal": {
            "precision": pr, "recall": rc,
            "f1": 2 * pr * rc / (pr + rc) if pr + rc else 0.0,
            "f2": 5 * pr * rc / (4 * pr + rc) if 4 * pr + rc else 0.0,
            "tp": tp, "fp": fp, "tn": tn, "fn": fn,
            "fpr": fp / (fp + tn) if fp + tn else 0.0,
        },
    }


# ---------------------------------------------------------------- tables
def table_main():
    w("## 1. Before / after — v3 leaky random split vs v4 clean chronological split")
    w()
    w("v3 figures are read from DeepSentinel_Results_v3/*.json (unmodified).")
    w("v4 operating point shown is the F2-optimal one, matching v3's tuning rule.")
    w()
    v3map = {"B": ("config_b_metrics.json", "TRANSFER"),
             "C": ("config_c_metrics.json", "CASH_OUT"),
             "D": ("config_d_metrics.json", None)}
    hdr = (f"| Config | Protocol | Test fraud rate | AUC-PR | AUC-ROC | "
           f"Precision | Recall | F1 | F2 |")
    w(hdr); w("|" + "---|" * 9)

    for cfg, (fn, stratum) in v3map.items():
        p = V3 / fn
        if p.exists():
            m = json.loads(p.read_text())
            n = m["tp"] + m["fp"] + m["tn"] + m["fn"]
            rate = (m["tp"] + m["fn"]) / n
            w(f"| {cfg} | v3 leaky (random) | {rate*100:.2f}% | not computed | "
              f"{fmt(m.get('auc_roc'))} | {fmt(m['precision'])} | {fmt(m['recall'])} | "
              f"{fmt(m['f1_score'])} | {fmt(m.get('f2_score'))} |")
    ga = g("clean", "FS12", "GLOBAL")
    if ga:
        w(f"| A | v3 leaky (random) | — | not run in v3 | — | — | — | — | — |")

    order = [("A", ga), ("B", g("clean", "FS12", "TRANSFER")),
             ("C", g("clean", "FS12", "CASH_OUT")), ("D", build_config_d("clean", "FS12"))]
    for cfg, m in order:
        if not m:
            continue
        op = m["operating_point_f2_optimal"]
        w(f"| {cfg} | **v4 clean (step 595)** | {m['test_fraud_rate']*100:.2f}% | "
          f"**{fmt(m['auc_pr_average_precision'])}** | {fmt(m['auc_roc'])} | "
          f"{fmt(op['precision'])} | {fmt(op['recall'])} | {fmt(op['f1'])} | {fmt(op['f2'])} |")
    w()

    w("### Leakage isolated with framework held constant")
    w()
    w("Both rows below are the same PyTorch code and the same 12 features; only the")
    w("protocol differs. This removes the framework and feature-set confounds.")
    w()
    w("AUC-PR depends on the base rate, and the two protocols have different base")
    w("rates, so raw AP is not comparable across them. **AP lift = AP / base rate**")
    w("normalises for that and is the honest comparison.")
    w()
    w("| Stratum | Protocol | Test fraud rate | AUC-PR | **AP lift** | AUC-ROC | P@1000 | F1 (F1-opt) |")
    w("|" + "---|" * 8)
    for s in ["TRANSFER", "CASH_OUT"]:
        lifts = {}
        for proto, fs, lbl in [("leaky", "FS13old", "leaky (v3 protocol)"),
                               ("clean", "FS12", "clean (step 595)")]:
            m = g(proto, fs, s)
            if not m:
                continue
            base = m["test_fraud_rate"]
            lift = m["auc_pr_average_precision"] / base if base else float("nan")
            lifts[proto] = lift
            w(f"| {s} | {lbl} | {base*100:.2f}% | "
              f"{fmt(m['auc_pr_average_precision'])} | **{lift:.1f}x** | {fmt(m['auc_roc'])} | "
              f"{fmt(m['precision_at_1000'],3)} | "
              f"{fmt(m['operating_point_f1_optimal']['f1'])} |")
        if len(lifts) == 2:
            w(f"| {s} | *inflation factor* | | | **{lifts['leaky']/lifts['clean']:.1f}x** | | | |")
    w()

    w("### Both operating points, v4 clean")
    w()
    w("| Stratum | Point | Threshold | Precision | Recall | F1 | F2 | Flag rate |")
    w("|" + "---|" * 8)
    for s in ["TRANSFER", "CASH_OUT"]:
        m = g("clean", "FS12", s)
        if not m:
            continue
        for lbl, k in [("F2-optimal", "operating_point_f2_optimal"),
                       ("F1-optimal", "operating_point_f1_optimal")]:
            o = m[k]
            w(f"| {s} | {lbl} | {o['threshold']:.4f} | {fmt(o['precision'])} | "
              f"{fmt(o['recall'])} | {fmt(o['f1'])} | {fmt(o['f2'])} | "
              f"{o['flag_rate']*100:.2f}% |")
    w()


def table_ablations():
    w("## 2. F11 ablation — what dropping account velocity cost")
    w()
    w("FS13 keeps F11_account_velocity (which carries look-ahead); FS12 drops it.")
    w("Both use the causally recomputed F8 and the same clean protocol.")
    w()
    w("| Stratum | Feature set | AUC-PR | AUC-ROC | P@1000 | F1 (F1-opt) | Δ AUC-PR |")
    w("|" + "---|" * 7)
    for s in ["TRANSFER", "CASH_OUT"]:
        a, b = g("clean", "FS13", s), g("clean", "FS12", s)
        if not (a and b):
            continue
        d = b["auc_pr_average_precision"] - a["auc_pr_average_precision"]
        w(f"| {s} | FS13 (with F11) | {fmt(a['auc_pr_average_precision'])} | "
          f"{fmt(a['auc_roc'])} | {fmt(a['precision_at_1000'],3)} | "
          f"{fmt(a['operating_point_f1_optimal']['f1'])} | — |")
        w(f"| {s} | **FS12 (F11 dropped)** | {fmt(b['auc_pr_average_precision'])} | "
          f"{fmt(b['auc_roc'])} | {fmt(b['precision_at_1000'],3)} | "
          f"{fmt(b['operating_point_f1_optimal']['f1'])} | **{d:+.4f}** |")
    w()

    w("## 3. F7_day diagnostic — a feature that cannot generalise across a time split")
    w()
    for s, d in PREP["strata"].items():
        f = d["f7_day_range"]
        w(f"- **{s}**: fit-partition max {f['fit_max']:.4f}, test-partition min "
          f"{f['test_min']:.4f} — every test row lies outside the training range "
          f"(`{f['test_entirely_above_fit_max']}`).")
    w()
    w("FS11 removes F7_day from the 12-feature set.")
    w()
    w("| Stratum | Feature set | AUC-PR | AUC-ROC | P@1000 | F1 (F1-opt) | Δ AUC-PR |")
    w("|" + "---|" * 7)
    for s in ["TRANSFER", "CASH_OUT"]:
        a, b = g("clean", "FS12", s), g("clean", "FS11", s)
        if not (a and b):
            continue
        d = b["auc_pr_average_precision"] - a["auc_pr_average_precision"]
        w(f"| {s} | FS12 (with F7_day) | {fmt(a['auc_pr_average_precision'])} | "
          f"{fmt(a['auc_roc'])} | {fmt(a['precision_at_1000'],3)} | "
          f"{fmt(a['operating_point_f1_optimal']['f1'])} | — |")
        w(f"| {s} | FS11 (F7_day dropped) | {fmt(b['auc_pr_average_precision'])} | "
          f"{fmt(b['auc_roc'])} | {fmt(b['precision_at_1000'],3)} | "
          f"{fmt(b['operating_point_f1_optimal']['f1'])} | **{d:+.4f}** |")
    w()


def table_f8_payment():
    w("## 4. F8 recomputation — did it change anything?")
    w()
    w("`amount = expm1(F1_log_amount)`; the 95th percentile is recomputed on")
    w("non-fraud rows of the FIT partition only, instead of the whole dataset.")
    w()
    w("| Stratum | P95 original (all rows) | P95 causal (fit only) | Rows changed | % of rows |")
    w("|" + "---|" * 5)
    for s, d in PREP["strata"].items():
        f = d["f8"]
        w(f"| {s} | {f['p95_original_whole_dataset']:,.2f} | "
          f"{f['p95_causal_fit_partition']:,.2f} | {f['rows_changed']:,} | "
          f"{f['rows_changed_pct']:.3f}% |")
    w()

    w("## 5. PAYMENT false-positive control")
    w()
    m = g("clean", "FS12", "PAYMENT")
    if m and "payment_control" in m:
        pc = m["payment_control"]
        old, new = pc["rule_old_mean_plus_3std"], pc["rule_new_quantile_0.999"]
        w(f"PAYMENT test partition: {pc['test_rows']:,} rows, zero fraud by construction.")
        w()
        w("| Threshold rule | Threshold | False positives | FP rate |")
        w("|" + "---|" * 4)
        w(f"| Old — mean + 3σ | {old['threshold']:.4f} | {old['false_positives']:,} | "
          f"{old['fp_rate']*100:.3f}% |")
        w(f"| **New — 0.999 quantile on validation** | {new['threshold']:.4f} | "
          f"**{new['false_positives']:,}** | **{new['fp_rate']*100:.3f}%** |")
        w()
        w(f"For reference, the v3 run reported 17,669 false positives on 1,506,047 "
          f"rows (1.173%) under the old rule with the random split.")
    w()


def curves():
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.6))
    fig.suptitle("Precision–Recall by transaction type — v4 clean chronological split (step 595)",
                 fontweight="bold", color="#5f3dc4")
    panels = [("TRANSFER", "#fa5252"), ("CASH_OUT", "#5f3dc4")]
    for ax, (s, col) in zip(axes, panels):
        for proto, fs, lbl, ls in [("clean", "FS12", "clean (step 595)", "-"),
                                   ("leaky", "FS13old", "leaky (v3 protocol)", "--")]:
            try:
                y, sc = ys(proto, fs, s)
            except KeyError:
                continue
            p, r, _ = precision_recall_curve(y, sc)
            ap = average_precision_score(y, sc)
            ax.plot(r, p, ls, color=col if proto == "clean" else "#868e96",
                    lw=2, label=f"{lbl}  AP={ap:.3f}")
        y, _ = ys("clean", "FS12", s)
        ax.axhline(y.mean(), color="#2b8a3e", ls=":", lw=1.5,
                   label=f"base rate {y.mean()*100:.2f}%")
        ax.set_title(s, fontweight="bold"); ax.set_xlabel("Recall")
        ax.set_ylabel("Precision"); ax.set_ylim(-0.03, 1.03)
        ax.legend(fontsize=8); ax.grid(alpha=0.3)

    ax = axes[2]
    d = build_config_d("clean", "FS12")
    if d:
        yy, ss = [], []
        for s in ["TRANSFER", "CASH_OUT"]:
            y, sc = ys("clean", "FS12", s); yy.append(y); ss.append(sc)
        y = np.concatenate(yy); sc = np.concatenate(ss)
        p, r, _ = precision_recall_curve(y, sc)
        ax.plot(r, p, "-", color="#1864ab", lw=2,
                label=f"Config D ensemble  AP={average_precision_score(y,sc):.3f}")
        ax.axhline(y.mean(), color="#2b8a3e", ls=":", lw=1.5,
                   label=f"base rate {y.mean()*100:.2f}%")
    ax.set_title("Config D — stratified ensemble", fontweight="bold")
    ax.set_xlabel("Recall"); ax.set_ylabel("Precision"); ax.set_ylim(-0.03, 1.03)
    ax.legend(fontsize=8); ax.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(V4 / "figures" / "pr_curves_v4.png", dpi=150, bbox_inches="tight")
    w("## 6. Precision–recall curves")
    w()
    w("Saved to `results/v4/figures/pr_curves_v4.png` — one panel per transaction")
    w("type plus the ensemble, each with the clean and leaky curves overlaid and the")
    w("base rate marked.")
    w()


def methodology():
    p = PREP["strata"]["TRANSFER"]
    w("## 7. Methodology paragraph (paste into the thesis)")
    w()
    w("> **Evaluation protocol.** All transactions were partitioned chronologically "
      "using the PaySim simulation step, recovered from the engineered day feature as "
      "`step = F7_day × 720` and verified integral to within 2.3×10⁻¹³. Transactions at "
      f"step ≤ 595 form the training partition and step > 595 the test partition, "
      f"matching the split point used by the temporal component of the platform and "
      f"yielding 1,642 fraudulent test transactions. Within the training partition, the "
      f"final 15 percent by step (steps {p['val_cut_step']+1}–595) was held out as a "
      "validation partition. Each type-specific variational autoencoder was fitted on "
      "non-fraud rows of the model-fitting slice only; the MinMax scaler, the z-score "
      "normalisation statistics and the k-means centroids used by the latent-density "
      "term were fitted on the same rows, never on validation or test data. Decision "
      "thresholds were selected on the validation partition, which carries labels but "
      "is disjoint from both the fitting slice and the test partition. The test "
      "partition was scored once, after all modelling and threshold decisions were "
      "final, and was not used for any selection. The `is_large` feature was recomputed "
      "so that its 95th-percentile reference is drawn from non-fraud rows of the "
      "fitting slice alone, and the account-velocity feature was removed because it "
      "aggregates transaction counts across the full log and therefore encodes "
      "information unavailable at scoring time. Because the chronological split raises "
      "the test-set fraud rate substantially above the dataset base rate, average "
      "precision is reported as the primary metric, with AUC-ROC retained only as a "
      "secondary threshold-independent statistic.")
    w()


def main():
    w("# v4 Results — Clean Chronological Protocol")
    w()
    w(f"Configurations completed: {len(ALL)}")
    w()
    table_main()
    table_ablations()
    table_f8_payment()
    curves()
    methodology()
    d = build_config_d("clean", "FS12")
    if d:
        (V4 / "metrics" / "clean__FS12__D_ensemble.json").write_text(json.dumps(d, indent=2))
    (V4 / "RESULTS_v4.md").write_text("\n".join(OUT), encoding="utf-8")
    print(f"\nWrote {V4/'RESULTS_v4.md'}")


if __name__ == "__main__":
    main()