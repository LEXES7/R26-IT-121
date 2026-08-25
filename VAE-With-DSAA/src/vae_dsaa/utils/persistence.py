"""Model bundle persistence.

A *bundle* is everything needed to score a transaction without retraining:
the VAE weights, the fitted scaler, the latent-density centroids, the z-score
normalisation statistics and the selected thresholds, plus a manifest that
records exactly how it was produced.

Layout on disk::

    <root>/<protocol>__<featureset>__<stratum>/
        vae.pt           encoder + decoder state_dict
        scaler.pkl       fitted MinMax scaler
        kmeans.pkl       latent-density centroids
        thresholds.json  F1- and F2-optimal thresholds + z-score statistics
        manifest.json    features in order, arch, hyperparameters, provenance
"""
from __future__ import annotations

import json
import pickle
import subprocess
import time
from pathlib import Path

import numpy as np
import torch

BUNDLE_FILES = ("vae.pt", "scaler.pkl", "kmeans.pkl", "thresholds.json", "manifest.json")


def git_commit(repo: Path | None = None) -> str:
    """Short commit hash of the working copy, or 'unknown' outside a repo."""
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(repo or Path(__file__).resolve().parents[3]),
            capture_output=True, text=True, timeout=10,
        )
        return out.stdout.strip() or "unknown"
    except Exception:                                    # noqa: BLE001
        return "unknown"


def bundle_name(protocol: str, feature_set: str, stratum: str) -> str:
    return f"{protocol}__{feature_set}__{stratum}"


def save_bundle(
    root: Path, protocol: str, feature_set: str, stratum: str, *,
    model, scaler, kmeans_centers: np.ndarray, stats: dict,
    thresholds: dict, features: list[str], arch: dict,
    free_bits: float, beta_max: float, anneal_epochs: int,
    split_step: int, train_history: dict | None = None, extra: dict | None = None,
) -> Path:
    d = Path(root) / bundle_name(protocol, feature_set, stratum)
    d.mkdir(parents=True, exist_ok=True)

    torch.save(model.state_dict(), d / "vae.pt")
    with open(d / "scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    with open(d / "kmeans.pkl", "wb") as f:
        pickle.dump(np.asarray(kmeans_centers), f)

    (d / "thresholds.json").write_text(json.dumps({
        "f1_optimal": thresholds.get("f1_optimal"),
        "f2_optimal": thresholds.get("f2_optimal"),
        "selection_set": thresholds.get("selection_set", "validation partition"),
        "score_weights": {"alpha": stats["alpha"], "beta": stats["beta"],
                          "gamma": stats["gamma"]},
        "zscore_statistics": {k: stats[k] for k in
                              ("recon_mean", "recon_std", "kl_mean", "kl_std",
                               "dens_mean", "dens_std")},
        "n_clusters": stats["n_clusters"],
    }, indent=2))

    (d / "manifest.json").write_text(json.dumps({
        "protocol": protocol,
        "feature_set": feature_set,
        "stratum": stratum,
        "features": list(features),
        "n_features": len(features),
        "architecture": {**arch, "input_dim": len(features)},
        "latent_dim": arch["latent"],
        "hyperparameters": {"free_bits": free_bits, "beta_max": beta_max,
                            "anneal_epochs": anneal_epochs,
                            "optimizer": "Adam", "lr": 1e-3, "batch_size": 256},
        "split": {"strategy": "chronological", "split_step": split_step,
                  "step_recovery": "step = F7_day * 720"},
        "framework": f"pytorch {torch.__version__}",
        "git_commit": git_commit(),
        "created_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "train_history": train_history or {},
        **(extra or {}),
    }, indent=2))
    return d


def load_bundle(path: Path):
    """Load a bundle and return a ready-to-use Predictor."""
    from vae_dsaa.inference.predictor import Predictor
    return Predictor.from_dir(Path(path))


def list_bundles(root: Path) -> list[Path]:
    root = Path(root)
    if not root.exists():
        return []
    return sorted(p for p in root.iterdir()
                  if p.is_dir() and all((p / f).exists() for f in BUNDLE_FILES))
