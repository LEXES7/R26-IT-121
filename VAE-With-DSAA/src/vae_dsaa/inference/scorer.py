"""Anomaly scoring: scaling, latent extraction and the three-term score.

    score = alpha*z(reconstruction) + beta*z(KL) + gamma*z(latent density)

The z-score statistics and the k-means centroids behind the density term are
fitted on non-test rows only; see `fit_scorer`.
"""
from __future__ import annotations

import numpy as np
import torch
from sklearn.cluster import KMeans

from vae_dsaa.models.vae import VAE  # noqa: F401  (typing / re-export)


class MinMax:
    """MinMaxScaler with sklearn's semantics (clip=False)."""

    def fit(self, X: np.ndarray) -> "MinMax":
        self.min_ = X.min(axis=0)
        rng = X.max(axis=0) - self.min_
        rng[rng == 0] = 1.0
        self.range_ = rng
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        return ((X - self.min_) / self.range_).astype(np.float32)

    def inverse_transform(self, X: np.ndarray) -> np.ndarray:
        """Back to feature units.

        Scoring never needs this — the model works in scaled space throughout.
        Attribution does: a reconstruction is only readable next to the value it
        was trying to rebuild, and both have to be in the units the feature is
        named for. Exact wherever ``transform`` was, since the mapping is
        affine; features whose training range was zero were divided by 1.0 and
        come back unchanged.
        """
        return (np.asarray(X) * self.range_ + self.min_).astype(np.float32)


# --------------------------------------------------------------------------
@torch.no_grad()
def encode_all(model: VAE, X: np.ndarray, bs: int = 16384, sample: bool = False):
    """Encode and reconstruct.

    ``sample=False`` (the default) decodes the posterior mean, which makes
    scoring deterministic: the same model and the same rows always produce the
    same score. Training still samples, because the reparameterised draw is what
    the gradient needs; only inference is made deterministic. Sampling at score
    time would leave every reported metric dependent on RNG state and would stop
    a reloaded model from reproducing the metrics recorded when it was trained.
    """
    model.eval()
    mus, lvs, recons = [], [], []
    for i in range(0, len(X), bs):
        xb = torch.from_numpy(X[i:i + bs])
        mu, lv = model.encode(xb)
        z = mu + torch.exp(0.5 * lv) * torch.randn_like(mu) if sample else mu
        recons.append(model.decode(z).numpy())
        mus.append(mu.numpy()); lvs.append(lv.numpy())
    return np.vstack(mus), np.vstack(lvs), np.vstack(recons)


def _components(model, X):
    mu, lv, recon = encode_all(model, X)
    rec = np.sum((X - recon) ** 2, axis=1)
    kl = np.sum(-0.5 * (1 + lv - mu**2 - np.exp(lv)), axis=1)
    return mu, lv, rec, kl


def _nearest(mu, C, chunk=200_000):
    out = np.empty(len(mu), dtype=np.float64)
    for i in range(0, len(mu), chunk):
        b = mu[i:i + chunk]
        out[i:i + chunk] = np.min(np.linalg.norm(b[:, None, :] - C[None, :, :], axis=2), axis=1)
    return out


def fit_scorer(model, X_ref, n_clusters=8, seed=42):
    """Fit z-score statistics and k-means centroids on reference (non-test) rows."""
    mu, _, rec, kl = _components(model, X_ref)
    k = min(n_clusters, max(2, len(mu) // 1000))
    km = KMeans(n_clusters=k, random_state=seed, n_init=10).fit(mu)
    dens = _nearest(mu, km.cluster_centers_)
    return {
        "recon_mean": float(rec.mean()), "recon_std": float(rec.std() + 1e-8),
        "kl_mean": float(kl.mean()), "kl_std": float(kl.std() + 1e-8),
        "dens_mean": float(dens.mean()), "dens_std": float(dens.std() + 1e-8),
        "alpha": 0.5, "beta": 0.3, "gamma": 0.2,
        "n_clusters": int(k), "cluster_centers": km.cluster_centers_.tolist(),
    }


def score(model, X, st):
    mu, _, rec, kl = _components(model, X)
    dens = _nearest(mu, np.asarray(st["cluster_centers"]))
    return (st["alpha"] * (rec - st["recon_mean"]) / st["recon_std"]
            + st["beta"] * (kl - st["kl_mean"]) / st["kl_std"]
            + st["gamma"] * (dens - st["dens_mean"]) / st["dens_std"])
