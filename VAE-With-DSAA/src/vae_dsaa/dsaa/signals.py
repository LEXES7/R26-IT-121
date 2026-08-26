"""Dual-Signal Anomaly Attribution.

Attribution is read directly out of the VAE objective — no auxiliary explainer,
no added inference latency.

    Signal 1  per-feature share of reconstruction error
    Signal 2  per-latent-dimension share of KL divergence
    Signal 3  per-latent-dimension share of the latent-density term (optional)

The anomaly score has three terms::

    score = alpha*z(recon) + beta*z(KL) + gamma*z(latent density)

but the published framework attributes only the first two, leaving the gamma
term (weight 0.2) unexplained. ``signal_3`` closes that gap and is **additive**:
``signal_1`` and ``signal_2`` keep their names, shapes and meaning, so a
consumer reading them by name is unaffected.

Every share vector is L1-normalised and sums to 1.0 per row.
"""
from __future__ import annotations

import numpy as np

from vae_dsaa.inference.scorer import _nearest, encode_all

EPS = 1e-12


def _shares(contrib: np.ndarray) -> np.ndarray:
    """Row-normalise non-negative contributions to shares summing to 1."""
    contrib = np.maximum(contrib, 0.0)
    return contrib / (contrib.sum(axis=1, keepdims=True) + EPS)


def compute_signals(predictor, X: np.ndarray, *, with_signal_3: bool = True) -> dict:
    """Per-row attribution for raw (unscaled) feature rows.

    Returns arrays aligned to ``predictor.features`` for Signal 1 and to the
    latent dimensions for Signals 2 and 3.
    """
    X = np.asarray(X, dtype=np.float32)
    if X.ndim == 1:
        X = X[None, :]
    Xs = predictor.scaler.transform(X)
    mu, lv, recon = encode_all(predictor.model, Xs)

    # Signal 1 — squared error per input feature
    recon_contrib = (Xs - recon) ** 2
    signal_1 = _shares(recon_contrib)

    # Signal 2 — KL divergence per latent dimension
    kl_contrib = -0.5 * (1 + lv - mu ** 2 - np.exp(lv))
    signal_2 = _shares(kl_contrib)

    out = {
        "signal_1": signal_1,
        "signal_2": signal_2,
        "recon_total": recon_contrib.sum(axis=1),
        "kl_total": kl_contrib.sum(axis=1),
        "feature_names": list(predictor.features),
        "latent_names": [f"dim_{i}" for i in range(mu.shape[1])],
    }

    if with_signal_3:
        # Signal 3 — squared displacement per latent dimension from the nearest
        # centroid. The density term is the Euclidean distance to that centroid,
        # so the squared per-dimension displacements decompose it exactly.
        C = np.asarray(predictor.centers)
        d = np.linalg.norm(mu[:, None, :] - C[None, :, :], axis=2)
        nearest = np.argmin(d, axis=1)
        disp = (mu - C[nearest]) ** 2
        out["signal_3"] = _shares(disp)
        out["density_total"] = _nearest(mu, C)
        out["nearest_centroid"] = nearest

    return out


def fingerprint(signals: dict, *, include_signal_3: bool = False) -> np.ndarray:
    """Concatenated attribution vector used for typology discovery.

    Signal 1 and Signal 2 are concatenated at their native widths — no zero
    padding. Padding to a common latent width is what made v3's clusters
    separable by transaction type before any clustering occurred.
    """
    parts = [signals["signal_1"], signals["signal_2"]]
    if include_signal_3:
        parts.append(signals["signal_3"])
    return np.hstack(parts)


def rank_signal(shares: np.ndarray, names: list[str], row: int, top: int = 3) -> list[dict]:
    """Top contributors for one row, as the API returns them."""
    v = shares[row]
    idx = np.argsort(-v)[:top]
    return [{"name": names[i], "share": round(float(v[i]), 4)} for i in idx]


def mean_signals(signals: dict, *, include_signal_3: bool = False) -> dict:
    """Mean attribution across rows, plus its non-uniformity."""
    out = {}
    for key, names in [("signal_1", "feature_names"),
                       ("signal_2", "latent_names"),
                       ("signal_3", "latent_names")]:
        if key not in signals:
            continue
        if key == "signal_3" and not include_signal_3:
            continue
        m = signals[key].mean(axis=0)
        out[key] = {n: float(v) for n, v in zip(signals[names], m)}
        out[f"{key}_uniformity_std"] = float(m.std())
    return out
