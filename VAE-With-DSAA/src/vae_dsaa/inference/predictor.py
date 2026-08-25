"""Load a saved bundle and score transactions without retraining."""
from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
import torch

from vae_dsaa.inference.scorer import _nearest, encode_all
from vae_dsaa.models.vae import VAE


class Predictor:
    """A trained stratum model plus everything needed to reproduce its scores."""

    def __init__(self, model, scaler, centers, stats, thresholds, manifest):
        self.model = model
        self.scaler = scaler
        self.centers = np.asarray(centers)
        self.stats = stats
        self.thresholds = thresholds
        self.manifest = manifest

    # ---------------------------------------------------------------- load
    @classmethod
    def from_dir(cls, path: str | Path) -> "Predictor":
        d = Path(path)
        manifest = json.loads((d / "manifest.json").read_text())
        thr = json.loads((d / "thresholds.json").read_text())

        arch = manifest["architecture"]
        model = VAE(arch["input_dim"], arch["h1"], arch["h2"], arch["latent"],
                    manifest["hyperparameters"]["free_bits"])
        model.load_state_dict(torch.load(d / "vae.pt", map_location="cpu"))
        model.eval()

        with open(d / "scaler.pkl", "rb") as f:
            scaler = pickle.load(f)
        with open(d / "kmeans.pkl", "rb") as f:
            centers = pickle.load(f)

        stats = {**thr["zscore_statistics"], **thr["score_weights"],
                 "n_clusters": thr["n_clusters"]}
        return cls(model, scaler, centers, stats, thr, manifest)

    # ------------------------------------------------------------- scoring
    @property
    def features(self) -> list[str]:
        return list(self.manifest["features"])

    def score(self, X: np.ndarray, seed: int | None = None) -> np.ndarray:
        """Anomaly score for raw (unscaled) feature rows, in manifest order.

        Deterministic: the posterior mean is decoded rather than a sampled draw,
        so a reloaded bundle reproduces its recorded metrics exactly. ``seed`` is
        accepted for API compatibility and is not needed.
        """
        X = np.asarray(X, dtype=np.float32)
        if X.ndim == 1:
            X = X[None, :]
        if X.shape[1] != len(self.features):
            raise ValueError(
                f"expected {len(self.features)} features "
                f"{self.features}, got {X.shape[1]}")
        if seed is not None:
            torch.manual_seed(seed)   # only affects sample=True paths

        Xs = self.scaler.transform(X)
        mu, lv, recon = encode_all(self.model, Xs)
        rec = np.sum((Xs - recon) ** 2, axis=1)
        kl = np.sum(-0.5 * (1 + lv - mu ** 2 - np.exp(lv)), axis=1)
        dens = _nearest(mu, self.centers)
        s = self.stats
        return (s["alpha"] * (rec - s["recon_mean"]) / s["recon_std"]
                + s["beta"] * (kl - s["kl_mean"]) / s["kl_std"]
                + s["gamma"] * (dens - s["dens_mean"]) / s["dens_std"])

    def predict(self, X: np.ndarray, point: str = "f1_optimal",
                seed: int | None = None) -> np.ndarray:
        """Boolean flags at a stored operating point."""
        thr = self.thresholds[point]
        if thr is None:
            raise ValueError(f"no stored threshold for {point!r}")
        return self.score(X, seed=seed) >= thr

    def __repr__(self) -> str:
        m = self.manifest
        return (f"<Predictor {m['protocol']}|{m['feature_set']}|{m['stratum']} "
                f"{m['n_features']}feat latent={m['latent_dim']}>")
