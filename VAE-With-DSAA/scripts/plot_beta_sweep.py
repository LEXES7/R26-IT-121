#!/usr/bin/env python
"""Figures for the beta x Free-Bits collapse sweep.

    python scripts/plot_beta_sweep.py

Writes reports/figures/beta_sweep_v4.png and kl_trajectories_v4.png.
"""
from __future__ import annotations

import json
import statistics as st
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt          # noqa: E402
import numpy as np                       # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SWEEP = ROOT / "reports" / "v4" / "beta_sweep"
FIG = ROOT / "reports" / "figures"
FIG.mkdir(parents=True, exist_ok=True)

BETAS = [0.01, 0.05, 0.10, 0.25, 0.50, 1.00]
FB = [0.01, 0.05, 0.10, 0.20]
CMAP = {0.01: "#1f77b4", 0.05: "#2ca02c", 0.10: "#ff7f0e", 0.20: "#d62728"}


def group(rows, keyf):
    g = defaultdict(list)
    for r in rows:
        g[(keyf(r), r["beta_max"])].append(r)
    return g


def stats(g, key, field):
    m, s = [], []
    for b in BETAS:
        v = [x[field] for x in g.get((key, b), [])]
        m.append(sum(v) / len(v) if v else np.nan)
        s.append(st.pstdev(v) if len(v) > 1 else 0.0)
    return np.array(m), np.array(s)


def collapse_bracket(g, key):
    """First beta interval in which kl_max_over_min falls below 2.0.

    Floor-independent: it asks only whether any dimension still stands out from
    the rest, never where the Free Bits floor sits.
    """
    prev = None
    for b in BETAS:
        v = [x["kl_max_over_min"] for x in g.get((key, b), [])]
        if not v:
            continue
        m = sum(v) / len(v)
        if m < 2.0:
            return (prev, b)
        prev = b
    return (prev, None)


def main():
    main_rows = json.loads((SWEEP / "grid_main.json").read_text())
    lat_rows = json.loads((SWEEP / "grid_latent.json").read_text())
    syn_rows = json.loads((SWEEP / "grid_dataset2.json").read_text())
    gm = group(main_rows, lambda r: r["free_bits"])
    gl = group(lat_rows, lambda r: r["latent"])
    gs = group(syn_rows, lambda r: "synthetic")

    fig, ax = plt.subplots(2, 2, figsize=(13, 9.5))
    x = np.arange(len(BETAS))
    xt = [str(b) for b in BETAS]

    # -- (a) attribution spread, the measure that carries the claim ----------
    a = ax[0][0]
    for fb in FB:
        m, s = stats(gm, fb, "signal_2_attribution_spread")
        a.errorbar(x, m, yerr=s, marker="o", capsize=3, lw=1.8,
                   color=CMAP[fb], label=f"free_bits = {fb}")
        lo, hi = collapse_bracket(gm, fb)
        if hi is not None:
            a.axvspan(BETAS.index(lo) if lo else 0, BETAS.index(hi),
                      color=CMAP[fb], alpha=0.06)
    a.set_title("(a) Signal-2 attribution spread\nnot definitional — carries the claim",
                fontsize=11, loc="left")
    a.set_ylabel("std of mean per-dimension Signal-2 share")
    a.set_yscale("log")

    # -- (b) floor-independent concentration --------------------------------
    b_ = ax[0][1]
    for fb in FB:
        m, s = stats(gm, fb, "kl_max_over_min")
        b_.errorbar(x, m, yerr=s, marker="s", capsize=3, lw=1.8,
                    color=CMAP[fb], label=f"free_bits = {fb}")
    b_.axhline(1.0, color="k", ls=":", lw=1)
    b_.text(0.05, 1.03, "1.0 = every dimension carries identical KL",
            fontsize=8, color="k")
    b_.set_title("(b) max / min per-dimension KL\nfloor-independent, so not circular",
                 fontsize=11, loc="left")
    b_.set_ylabel("largest / smallest per-dimension KL")
    b_.set_yscale("log")

    # -- (c) latent width ---------------------------------------------------
    c = ax[1][0]
    m8, s8 = stats(gm, 0.10, "signal_2_attribution_spread")
    c.errorbar(x, m8, yerr=s8, marker="o", capsize=3, lw=1.8,
               color="#ff7f0e", label="latent = 8 (delivered)")
    for lat, col in [(4, "#9467bd"), (16, "#8c564b")]:
        m, s = stats(gl, lat, "signal_2_attribution_spread")
        c.errorbar(x, m, yerr=s, marker="^", capsize=3, lw=1.8, ls="--",
                   color=col, label=f"latent = {lat}")
    c.set_title("(c) latent width, free_bits = 0.10\nboundary does not move with width",
                fontsize=11, loc="left")
    c.set_ylabel("Signal-2 attribution spread")
    c.set_yscale("log")

    # -- (d) second dataset -------------------------------------------------
    d = ax[1][1]
    d.errorbar(x, m8, yerr=s8, marker="o", capsize=3, lw=1.8,
               color="#ff7f0e", label="PaySim TRANSFER")
    m, s = stats(gs, "synthetic", "signal_2_attribution_spread")
    d.errorbar(x, m, yerr=s, marker="D", capsize=3, lw=1.8, ls="--",
               color="#17becf", label="synthetic tabular")
    d.set_title("(d) second dataset, free_bits = 0.10\nphenomenon reproduces; "
                "location is dataset-dependent", fontsize=11, loc="left")
    d.set_ylabel("Signal-2 attribution spread")
    d.set_yscale("log")

    for a_ in ax.ravel():
        a_.set_xticks(x)
        a_.set_xticklabels(xt)
        a_.set_xlabel(r"$\beta_{max}$")
        a_.grid(alpha=0.25, lw=0.6)
        a_.legend(fontsize=8, framealpha=0.9)

    fig.suptitle("Beta x Free-Bits attribution collapse — v4 PyTorch, clean chronological "
                 "protocol, 5 seeds per cell (3 for panels c-d)", fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.965))
    fig.savefig(FIG / "beta_sweep_v4.png", dpi=150)
    print("wrote", FIG / "beta_sweep_v4.png")

    # ---------------------------------------------------------------- traj
    traj = json.loads((SWEEP / "kl_trajectories.json").read_text())
    fig2, axs = plt.subplots(1, 2, figsize=(12.5, 4.6), sharey=True)
    for ax2, key in zip(axs, ["beta_0.05", "beta_1.0"]):
        blk = traj[key]
        tr = blk["trajectory"]
        eps = [r["epoch"] for r in tr]
        K = np.array([r["per_dim_kl"] for r in tr])
        for j in range(K.shape[1]):
            ax2.plot(eps, K[:, j], lw=1.3, label=f"dim_{j}")
        ax2.axhline(blk["free_bits"], color="k", ls="--", lw=1.2)
        ax2.text(eps[-1], blk["free_bits"] * 1.08,
                 f"Free Bits floor = {blk['free_bits']}", ha="right", fontsize=8)
        ax2.set_yscale("log")
        ax2.set_xlabel("epoch")
        ax2.set_title(r"$\beta_{max}$ = " + str(blk["beta_max"])
                      + f"   ({blk['epochs_run']} epochs)", fontsize=11)
        ax2.grid(alpha=0.25, lw=0.6)
    axs[0].set_ylabel("per-dimension KL (validation normals)")
    axs[1].legend(fontsize=7, ncol=2, framealpha=0.9)
    fig2.suptitle("Per-dimension KL during training — free_bits 0.10, latent 8, seed 42. "
                  "At high beta every dimension converges onto the floor and stays there.",
                  fontsize=11)
    fig2.tight_layout(rect=(0, 0, 1, 0.93))
    fig2.savefig(FIG / "kl_trajectories_v4.png", dpi=150)
    print("wrote", FIG / "kl_trajectories_v4.png")


if __name__ == "__main__":
    main()
