#!/usr/bin/env python
"""Beta x Free-Bits collapse sweep on the v4 PyTorch pipeline.

Rebuilds the N3 evidence that previously existed only as a single-seed Keras run
under the leaky v3 protocol (reports/v3_evidence/beta_sweep_v3.json).

    python scripts/run_beta_sweep.py --stage all

Writes reports/v4/beta_sweep/. Trains nothing into checkpoints/v4/ and touches
no delivered bundle.

DISCLOSURE - training-set subsample
    The TRANSFER fit partition holds 441,840 non-fraud rows. Training every cell
    of a 174-run grid on all of them is not affordable, so each run trains on a
    fixed random subsample of SUBSAMPLE_FIT rows - the same rows in every cell,
    so the grid stays internally comparable. The MinMax scaler is still fitted on
    the FULL fit partition, exactly as the delivered bundles do. Absolute values
    here are therefore not directly comparable with reports/v4/all_configs_v4.json;
    the grid is comparable with itself.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from sklearn.metrics import average_precision_score, roc_auc_score        # noqa: E402

from vae_dsaa.data import features as F                                   # noqa: E402
from vae_dsaa.dsaa.signals import compute_signals, mean_signals           # noqa: E402
from vae_dsaa.inference.scorer import (MinMax, encode_all, fit_scorer,    # noqa: E402
                                       score)
from vae_dsaa.models.train import ARCH, load_arrays                       # noqa: E402
from vae_dsaa.models.vae import VAE, train_vae                            # noqa: E402

DATA = ROOT / "results" / "v4" / "data"
OUT = ROOT / "reports" / "v4" / "beta_sweep"
OUT.mkdir(parents=True, exist_ok=True)

SUBSAMPLE_FIT = 150_000
SUBSAMPLE_SEED = 12345          # fixed: the same rows in every cell

BETAS = [0.01, 0.05, 0.10, 0.25, 0.50, 1.00]
FREE_BITS = [0.01, 0.05, 0.10, 0.20]
SEEDS = [42, 43, 44, 45, 46]
LATENT_VARIANTS = [4, 16]
LATENT_SEEDS = [42, 43, 44]

#: A latent dimension counts as ACTIVE if its mean KL over validation-normal
#: rows exceeds the Free Bits floor by more than ACTIVE_MARGIN (relative).
#: That definition is floor-dependent by construction: if every dimension is
#: pinned to the floor then "0 active" is partly true by definition, and a
#: reviewer is entitled to call the result circular.
#:
#: So two floor-independent measures are reported alongside it:
#:   active_dims_rel2min - dimensions carrying more than ACTIVE_REL_TO_MIN times
#:       the run's own smallest per-dimension KL. Self-normalising: it asks
#:       whether ANY dimension stands out from the pack, whatever level the pack
#:       has settled at, so it never references the floor.
#:   the raw per_dim_kl vector, stored for every run.
#: The claim itself is carried by signal_2_attribution_spread, which is not
#: definitional at all.
ACTIVE_MARGIN = 0.05
ACTIVE_REL_TO_MIN = 2.0


def log(*a):
    print(" ".join(str(x) for x in a), flush=True)


class Shim:
    """Minimal stand-in for a Predictor, for compute_signals."""

    def __init__(self, model, scaler, features):
        self.model, self.scaler, self.features = model, scaler, features


# ------------------------------------------------------------------ measures
def per_dim_kl(model, Xs):
    mu, lv, _ = encode_all(model, Xs)
    return (-0.5 * (1 + lv - mu ** 2 - np.exp(lv))).mean(axis=0)


def measure(model, scaler, cols, Xs_valn, X_test_raw, free_bits):
    kl_pd = per_dim_kl(model, Xs_valn)
    sig = compute_signals(Shim(model, scaler, cols), X_test_raw, with_signal_3=False)
    ms = mean_signals(sig, include_signal_3=False)
    return {
        "per_dim_kl": [float(v) for v in kl_pd],
        "kl_per_dim_mean": float(kl_pd.mean()),
        "kl_per_dim_std": float(kl_pd.std()),
        "kl_total": float(kl_pd.sum()),
        "n_dims": int(len(kl_pd)),
        "active_dims": int((kl_pd > free_bits * (1 + ACTIVE_MARGIN)).sum()),
        "active_dims_rel2min": int((kl_pd > ACTIVE_REL_TO_MIN * kl_pd.min()).sum()),
        "kl_max_over_min": float(kl_pd.max() / (kl_pd.min() + 1e-12)),
        "signal_2_attribution_spread": float(ms["signal_2_uniformity_std"]),
        "signal_1_spread": float(ms["signal_1_uniformity_std"]),
    }


def detection(model, scaler, d, seed):
    stats = fit_scorer(model, scaler.transform(d["X"][d["val_n"]]), seed=seed)
    s_test = score(model, scaler.transform(d["X"][d["test"]]), stats)
    yt = d["y"][d["test"]]
    base = float(yt.mean())
    ap = float(average_precision_score(yt, s_test))
    return {"auc_pr": ap,
            "ap_lift": (ap / base) if base else None,
            "auc_roc": float(roc_auc_score(yt, s_test)),
            "base_rate": base}


# ------------------------------------------------------------------ one cell
def run_cell(ctx, beta_max, free_bits, seed, latent=None):
    arch = dict(ctx["arch"])
    if latent is not None:
        arch["latent"] = latent
    t0 = time.time()
    model, hist = train_vae(ctx["Xs_fit_sub"], ctx["Xs_valn"], arch,
                            free_bits=free_bits, beta_max=beta_max,
                            anneal_epochs=10, seed=seed, log=lambda *a: None)
    row = {"dataset": ctx["name"], "beta_max": beta_max, "free_bits": free_bits,
           "seed": seed, "latent": arch["latent"],
           "epochs_run": hist["epochs_run"],
           "val_recon_loss": hist["val_recon_loss"],
           "val_kl_raw": hist["val_kl_raw"],
           "train_seconds": round(time.time() - t0, 1)}
    row.update(measure(model, ctx["scaler"], ctx["cols"], ctx["Xs_valn"],
                       ctx["X_test_raw"], free_bits))
    if ctx.get("detect") is not None:
        row.update(detection(model, ctx["scaler"], ctx["detect"], seed))
    return row


# -------------------------------------------------------------- trajectories
def train_with_trajectory(X_fit, X_val, arch, *, free_bits, beta_max,
                          anneal_epochs=10, epochs=60, batch_size=256,
                          patience=8, start_from_epoch=12, lr=1e-3, seed=42):
    """Copy of vae.train_vae with per-epoch per-dimension KL logging added.

    Copied rather than imported so src/vae_dsaa/models/vae.py stays untouched.
    Kept equivalent to the source; the only addition is the trajectory record.
    """
    torch.manual_seed(seed)
    np.random.seed(seed)
    model = VAE(X_fit.shape[1], arch["h1"], arch["h2"], arch["latent"], free_bits)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    Xt, Xv = torch.from_numpy(X_fit), torch.from_numpy(X_val)
    n = len(Xt)
    steps = math.ceil(n / batch_size)
    best, best_state, wait, stopped = math.inf, None, 0, epochs
    traj = []
    for ep in range(epochs):
        beta = min(beta_max, beta_max * ep / anneal_epochs)
        model.train()
        perm = torch.randperm(n)
        for i in range(steps):
            xb = Xt[perm[i * batch_size:(i + 1) * batch_size]]
            recon, kl, _ = model.losses(xb)
            loss = recon + beta * kl
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
        model.eval()
        with torch.no_grad():
            vr = []
            for i in range(0, len(Xv), 8192):
                r, _k, _kr = model.losses(Xv[i:i + 8192])
                vr.append(r.item() * min(8192, len(Xv) - i))
            val_recon = sum(vr) / len(Xv)
        traj.append({"epoch": ep, "beta": beta, "val_recon": val_recon,
                     "per_dim_kl": [float(v) for v in per_dim_kl(model, X_val)]})
        if ep < start_from_epoch:
            continue
        if val_recon < best - 1e-9:
            best, wait = val_recon, 0
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        else:
            wait += 1
            if wait >= patience:
                stopped = ep + 1
                break
    if best_state is not None:
        model.load_state_dict(best_state)
    return model, traj, stopped


# --------------------------------------------------------------------- data
def paysim_ctx():
    X, y, fit, val, test = load_arrays(DATA, "TRANSFER", "FS-ORIGIN")
    cols = F.columns("FS-ORIGIN")
    fit_n, val_n = fit & (y == 0), val & (y == 0)
    scaler = MinMax().fit(X[fit_n])                     # FULL fit partition
    idx = np.flatnonzero(fit_n)
    rng = np.random.default_rng(SUBSAMPLE_SEED)
    keep = rng.choice(idx, size=min(SUBSAMPLE_FIT, len(idx)), replace=False)
    log("  PaySim TRANSFER/FS-ORIGIN: fit {:,} -> subsample {:,} | val_n {:,} "
        "| test {:,} ({:,} fraud)".format(len(idx), len(keep), int(val_n.sum()),
                                          int(test.sum()), int(y[test].sum())))
    return {
        "name": "paysim_transfer_fs_origin", "cols": cols, "scaler": scaler,
        "arch": ARCH["TRANSFER"],
        "Xs_fit_sub": scaler.transform(X[keep]),
        "Xs_valn": scaler.transform(X[val_n]),
        "X_test_raw": X[test],
        "detect": {"X": X, "y": y, "val_n": val_n, "test": test},
        "fit_rows_available": int(len(idx)), "fit_rows_used": int(len(keep)),
    }


def synthetic_ctx():
    """Second dataset: synthetic tabular data with a rare positive class.

    Deliberately synthetic and self-contained (no download). Its only job is to
    show the collapse is a property of the objective, not of PaySim.
    """
    from sklearn.datasets import make_classification
    Xa, ya = make_classification(
        n_samples=60_000, n_features=7, n_informative=5, n_redundant=1,
        n_clusters_per_class=3, weights=[0.98, 0.02], flip_y=0.01,
        class_sep=1.2, random_state=7)
    Xa = Xa.astype(np.float32)
    ya = ya.astype(np.int64)
    n = len(Xa)
    fit = np.zeros(n, bool)
    val = np.zeros(n, bool)
    test = np.zeros(n, bool)
    fit[:int(0.6 * n)] = True
    val[int(0.6 * n):int(0.8 * n)] = True
    test[int(0.8 * n):] = True
    fit_n, val_n = fit & (ya == 0), val & (ya == 0)
    scaler = MinMax().fit(Xa[fit_n])
    cols = ["S{}".format(i) for i in range(Xa.shape[1])]
    log("  synthetic: fit_n {:,} | val_n {:,} | test {:,} ({:,} positive)".format(
        int(fit_n.sum()), int(val_n.sum()), int(test.sum()), int(ya[test].sum())))
    return {
        "name": "synthetic_tabular", "cols": cols, "scaler": scaler,
        "arch": ARCH["TRANSFER"],
        "Xs_fit_sub": scaler.transform(Xa[fit_n]),
        "Xs_valn": scaler.transform(Xa[val_n]),
        "X_test_raw": Xa[test],
        "detect": {"X": Xa, "y": ya, "val_n": val_n, "test": test},
    }


# -------------------------------------------------------------------- stages
def append(path, rows):
    old = json.loads(path.read_text()) if path.exists() else []
    old.extend(rows)
    path.write_text(json.dumps(old, indent=1))


def _done(path, keys):
    if not path.exists():
        return set()
    return {tuple(r[k] for k in keys) for r in json.loads(path.read_text())}


def stage_main(ctx):
    p = OUT / "grid_main.json"
    done = _done(p, ["beta_max", "free_bits", "seed"])
    total = len(BETAS) * len(FREE_BITS) * len(SEEDS)
    i = 0
    for fb in FREE_BITS:
        for b in BETAS:
            for s in SEEDS:
                i += 1
                if (b, fb, s) in done:
                    continue
                r = run_cell(ctx, b, fb, s)
                append(p, [r])
                log("  [{}/{}] fb={} beta={} seed={} -> active {}/{} "
                    "spread {:.5f} AP {:.4f} ({}s)".format(
                        i, total, fb, b, s, r["active_dims"], r["n_dims"],
                        r["signal_2_attribution_spread"], r.get("auc_pr", 0.0),
                        r["train_seconds"]))


def stage_latent(ctx):
    p = OUT / "grid_latent.json"
    done = _done(p, ["beta_max", "latent", "seed"])
    for lat in LATENT_VARIANTS:
        for b in BETAS:
            for s in LATENT_SEEDS:
                if (b, lat, s) in done:
                    continue
                r = run_cell(ctx, b, 0.10, s, latent=lat)
                append(p, [r])
                log("  latent={} beta={} seed={} -> active {}/{} spread {:.5f}".format(
                    lat, b, s, r["active_dims"], r["n_dims"],
                    r["signal_2_attribution_spread"]))


def stage_dataset2():
    ctx = synthetic_ctx()
    p = OUT / "grid_dataset2.json"
    done = _done(p, ["beta_max", "seed"])
    for b in BETAS:
        for s in LATENT_SEEDS:
            if (b, s) in done:
                continue
            r = run_cell(ctx, b, 0.10, s)
            append(p, [r])
            log("  synthetic beta={} seed={} -> active {}/{} spread {:.5f}".format(
                b, s, r["active_dims"], r["n_dims"],
                r["signal_2_attribution_spread"]))


def stage_traj(ctx):
    out = {}
    for b in [0.05, 1.00]:
        log("  trajectory beta={} free_bits=0.1 seed=42".format(b))
        _, traj, stopped = train_with_trajectory(
            ctx["Xs_fit_sub"], ctx["Xs_valn"], ctx["arch"],
            free_bits=0.10, beta_max=b, seed=42)
        out["beta_{}".format(b)] = {"beta_max": b, "free_bits": 0.10, "seed": 42,
                                    "epochs_run": stopped, "trajectory": traj}
    (OUT / "kl_trajectories.json").write_text(json.dumps(out, indent=1))
    log("  wrote kl_trajectories.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="all",
                    choices=["all", "main", "latent", "dataset2", "traj"])
    a = ap.parse_args()
    t0 = time.time()
    ctx = paysim_ctx() if a.stage in ("all", "main", "latent", "traj") else None
    if a.stage in ("all", "main"):
        log("== stage: main grid ==")
        stage_main(ctx)
    if a.stage in ("all", "traj"):
        log("== stage: trajectories ==")
        stage_traj(ctx)
    if a.stage in ("all", "latent"):
        log("== stage: latent widths ==")
        stage_latent(ctx)
    if a.stage in ("all", "dataset2"):
        log("== stage: second dataset ==")
        stage_dataset2()
    meta = {
        "subsample_fit_rows": SUBSAMPLE_FIT,
        "subsample_seed": SUBSAMPLE_SEED,
        "scaler_fitted_on": "full fit partition, not the subsample",
        "betas": BETAS, "free_bits": FREE_BITS, "seeds": SEEDS,
        "latent_variants": LATENT_VARIANTS, "latent_seeds": LATENT_SEEDS,
        "active_definition": {
            "active_dims": "mean per-dim KL over validation-normal rows > "
                           "free_bits * (1 + {})".format(ACTIVE_MARGIN),
            "active_dims_rel2min": "mean per-dim KL > {}x the run's own minimum "
                                   "per-dim KL. Self-normalising, so it never "
                                   "references the Free Bits floor and cannot be "
                                   "true by definition.".format(ACTIVE_REL_TO_MIN),
            "kl_max_over_min": "ratio of largest to smallest per-dim KL; 1.0 "
                               "means every dimension carries the same amount",
            "note": "the raw per_dim_kl vector is stored for every run, so no "
                    "count has to be taken on trust. The claim is carried by "
                    "signal_2_attribution_spread, which is not definitional.",
        },
        "signal_2_attribution_spread": "std across latent dimensions of the "
                                       "mean Signal-2 share, computed on the "
                                       "test partition",
        "elapsed_seconds": round(time.time() - t0, 1),
    }
    (OUT / "sweep_meta.json").write_text(json.dumps(meta, indent=1))
    log("DONE in {:.0f}s -> {}".format(time.time() - t0, OUT))


if __name__ == "__main__":
    main()
