"""Unsupervised fraud typology discovery over anomaly fingerprints.

Three corrections carried over from the v3 implementation:

**Row selection.** v3 clustered rows selected by ``isFraud == 1`` — supervised
selection followed by unsupervised clustering, which undermines the claim that
typologies are discovered without labels. Rows are now selected by the *model*:
score at or above the stratum threshold. The label-selected variant is retained
explicitly as an oracle analysis and is labelled as such.

**Per-stratum clustering.** v3 padded Signal 2 to the widest latent dimension,
so TRANSFER rows carried exact zeros in dims 8-15 while CASH_OUT rows did not.
That made the two strata linearly separable before clustering began, and DBSCAN
largely rediscovered transaction type. Clustering now runs within each stratum
at that stratum's native width, with no padding.

**Validation.** Silhouette assumes convex, equal-density clusters, which DBSCAN
output is not. DBCV (Moulavi et al., 2014) is density-based and is the primary
index here; Davies-Bouldin and Calinski-Harabasz are secondary; a bootstrap
resampling check reports label stability. Silhouette is retained but reported as
weak-but-expected in a high-dimensional compositional space.
"""
from __future__ import annotations

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.metrics import (adjusted_rand_score, calinski_harabasz_score,
                             davies_bouldin_score, silhouette_score)

try:                                            # reference DBCV implementation
    from hdbscan.validity import validity_index as _dbcv
    HAVE_DBCV = True
except Exception:                               # noqa: BLE001
    HAVE_DBCV = False


def select_rows(scores: np.ndarray, threshold: float) -> np.ndarray:
    """Model-flagged rows — the unsupervised selection."""
    return scores >= threshold


def cluster(fingerprints: np.ndarray, eps: float, min_samples: int = 10,
            metric: str = "euclidean") -> np.ndarray:
    return DBSCAN(eps=eps, min_samples=min_samples, metric=metric,
                  n_jobs=-1).fit_predict(fingerprints)


def sweep_eps(fingerprints: np.ndarray, *, min_samples: int = 10,
              grid=None, metric: str = "euclidean",
              min_clusters: int = 2, max_clusters: int = 30,
              max_noise: float = 0.5) -> list[dict]:
    """Search eps, ranked by DBCV where available and silhouette otherwise."""
    if grid is None:
        grid = np.arange(0.02, 0.51, 0.02)
    n = len(fingerprints)
    rows = []
    for eps in grid:
        lab = cluster(fingerprints, float(eps), min_samples, metric)
        keep = lab != -1
        k = len(set(lab[keep]))
        if k < min_clusters or k > max_clusters or keep.sum() < (1 - max_noise) * n:
            continue
        rows.append({"eps": float(eps), "n_clusters": int(k),
                     "noise": int((~keep).sum()),
                     "noise_frac": float((~keep).mean()),
                     **validate(fingerprints, lab)})
    key = "dbcv" if HAVE_DBCV else "silhouette"
    rows.sort(key=lambda r: (r[key] if r[key] is not None else -9e9), reverse=True)
    return rows


def validate(X: np.ndarray, labels: np.ndarray, *, sample: int = 4000,
             seed: int = 42) -> dict:
    """Cluster validity indices. DBCV is primary; the rest are secondary."""
    keep = labels != -1
    Xk, lk = X[keep], labels[keep]
    out = {"dbcv": None, "silhouette": None, "davies_bouldin": None,
           "calinski_harabasz": None, "n_scored": int(keep.sum())}
    if len(set(lk)) < 2 or keep.sum() < 3:
        return out

    rng = np.random.RandomState(seed)
    idx = (rng.choice(len(Xk), sample, replace=False)
           if len(Xk) > sample else np.arange(len(Xk)))
    Xs, ls = np.ascontiguousarray(Xk[idx], dtype=np.float64), lk[idx]
    if len(set(ls)) < 2:
        return out

    if HAVE_DBCV:
        try:
            out["dbcv"] = float(_dbcv(Xs, ls))
        except Exception:                        # noqa: BLE001
            out["dbcv"] = None
    for name, fn, better in [("silhouette", silhouette_score, "higher"),
                             ("davies_bouldin", davies_bouldin_score, "lower"),
                             ("calinski_harabasz", calinski_harabasz_score, "higher")]:
        try:
            out[name] = float(fn(Xs, ls))
        except Exception:                        # noqa: BLE001
            pass
    return out


def bootstrap_stability(X: np.ndarray, eps: float, min_samples: int = 10, *,
                        n_boot: int = 10, frac: float = 0.8, seed: int = 42) -> dict:
    """Re-cluster resamples and score agreement with the full-data labels.

    Adjusted Rand index between the full-data labels restricted to a resample
    and the labels DBSCAN assigns to that resample. High agreement means the
    partition is a property of the data rather than of the particular sample.
    """
    base = cluster(X, eps, min_samples)
    rng = np.random.RandomState(seed)
    n = len(X)
    scores = []
    for _ in range(n_boot):
        idx = rng.choice(n, int(frac * n), replace=False)
        scores.append(adjusted_rand_score(base[idx], cluster(X[idx], eps, min_samples)))
    return {"mean_ari": float(np.mean(scores)), "std_ari": float(np.std(scores)),
            "min_ari": float(np.min(scores)), "n_bootstrap": n_boot,
            "subsample_frac": frac}


def confound_ari(labels: np.ndarray, groups: np.ndarray) -> float:
    """ARI between cluster labels and a grouping such as transaction type.

    Near 1.0 means the clustering largely recovered the grouping rather than
    discovering structure within it.
    """
    keep = labels != -1
    if keep.sum() < 2 or len(set(labels[keep])) < 2:
        return float("nan")
    return float(adjusted_rand_score(groups[keep], labels[keep]))


def describe_clusters(labels: np.ndarray, signals: dict, *, y: np.ndarray | None = None,
                      top: int = 3) -> list[dict]:
    """Per-cluster size, purity and dominant attribution components."""
    s1, s2 = signals["signal_1"], signals["signal_2"]
    fnames, lnames = signals["feature_names"], signals["latent_names"]
    out = []
    for cid in sorted(set(labels)):
        m = labels == cid
        rec = {"cluster": int(cid), "size": int(m.sum()),
               "share_of_rows": float(m.mean()),
               "is_noise": bool(cid == -1)}
        if y is not None:
            rec["fraud_in_cluster"] = int(y[m].sum())
            rec["precision_in_cluster"] = float(y[m].mean())
        m1, m2 = s1[m].mean(axis=0), s2[m].mean(axis=0)
        rec["top_signal_1"] = [{"name": fnames[i], "share": round(float(m1[i]), 4)}
                               for i in np.argsort(-m1)[:top]]
        rec["top_signal_2"] = [{"name": lnames[i], "share": round(float(m2[i]), 4)}
                               for i in np.argsort(-m2)[:top]]
        if "signal_3" in signals:
            m3 = signals["signal_3"][m].mean(axis=0)
            rec["top_signal_3"] = [{"name": lnames[i], "share": round(float(m3[i]), 4)}
                                   for i in np.argsort(-m3)[:top]]
        out.append(rec)
    return out
