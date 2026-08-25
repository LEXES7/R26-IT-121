"""Map the raw anomaly score onto a probability the fusion engine can use.

The composite score is unbounded::

    score = 0.5*z(recon) + 0.3*z(KL) + 0.2*z(latent density)

A flagged TRANSFER can reach 7.8. The fusion engine's adapter clamps whatever
it receives into ``[0, 1]``:

    score = _clamp(float(data.get("behavioral_risk_score", 0.5)))

so every flagged transaction would arrive as exactly ``1.0`` and the ranking the
model produces would be discarded at the boundary. That is silent: no error, no
warning, and the modality still reports itself available.

**Isotonic regression** fitted on the validation partition is used wherever
labels exist. It is monotone, so AUC-PR, AUC-ROC, the ranking and the tuned
operating point are all unchanged — only the scale moves. GraphSAGE reached
ECE 0.02 with the same approach after measuring ECE 0.48 for an ECDF percentile
transform ("a percentile is a rank, not a probability").

**PAYMENT has no fraud by construction**, so isotonic cannot be fitted there. It
falls back to a threshold-centred logistic, which is exactly 0.5 at the tuned
threshold and monotone everywhere. The method used is recorded in the artefact
and surfaced on ``/health``, so a consumer is never guessing.

Calibrating per stratum has a second effect worth stating: it also removes the
"scores are comparable only within a stratum" caveat from the API contract,
because every stratum now emits a probability on the same scale.
"""

from __future__ import annotations

import json
import pickle
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

CALIBRATOR_FILE = "calibrator.pkl"
CALIBRATOR_META = "calibration.json"

#: Size of the strict-monotonicity tie-break added on top of isotonic output.
#: Large enough to order tied rows in float64, small enough that no reported
#: probability moves in its sixth decimal place.
TIE_EPS = 1e-6

#: CRITICAL is placed at this quantile of the alert population — the rows the
#: stratum actually flags — rather than a quantile of everything scored.
ALERT_QUANTILE = 0.75

#: CRITICAL must sit at least this far above HIGH, or the two bands cannot
#: separate any alert from any other and the level stops carrying information.
MIN_BAND_GAP = 0.05


def expected_calibration_error(p: np.ndarray, y: np.ndarray, bins: int = 15) -> float:
    """Standard binned ECE. Lower is better; 0 is perfect."""
    p = np.asarray(p, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    if len(p) == 0 or y.sum() == 0:
        return float("nan")
    edges = np.linspace(0.0, 1.0, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1], right=True), 0, bins - 1)
    ece = 0.0
    for b in range(bins):
        m = idx == b
        if not m.any():
            continue
        ece += (m.mean()) * abs(p[m].mean() - y[m].mean())
    return float(ece)


@dataclass
class Calibrator:
    """Raw composite score -> probability, plus the operating parameters."""

    method: str                       # "isotonic" | "threshold_logistic"
    stratum: str
    raw_threshold: float
    calibrated_threshold: float
    risk_bands: dict
    ece: float | None = None
    n_val_rows: int = 0
    n_val_fraud: int = 0
    scale: float | None = None        # threshold_logistic only
    tie_scale: float | None = None    # isotonic only — tanh scale for tie-breaks
    ece_test: float | None = None     # out-of-sample, filled by the exporter
    _iso: object | None = field(default=None, repr=False)

    # ------------------------------------------------------------ transform
    def transform(self, raw: np.ndarray) -> np.ndarray:
        raw = np.asarray(raw, dtype=np.float64)
        if self.method != "isotonic":
            z = (raw - self.raw_threshold) / (self.scale or 1.0)
            return np.clip(1.0 / (1.0 + np.exp(-np.clip(z, -50, 50))), 0.0, 1.0)

        # Isotonic is monotone NON-DECREASING, so it maps whole intervals of raw
        # score onto one probability. Those ties are not harmless: measured on
        # the TRANSFER test partition, plain isotonic moved AUC-PR from 0.7001
        # to 0.6634 purely because tied rows can no longer be ordered. The
        # operating point was unaffected (955 flags either way), but a fusion
        # engine that ranks alerts would lose real information.
        #
        # TIE_EPS * tanh restores strict monotonicity: tanh is strictly
        # increasing and bounded, so rows sharing an isotonic value are ordered
        # again by their raw score, while no probability moves by more than
        # 2 * TIE_EPS. Calibration is preserved to six decimal places and the
        # ranking is preserved exactly.
        base = np.clip(self._iso.predict(raw), 0.0, 1.0) * (1.0 - 2.0 * TIE_EPS) + TIE_EPS
        tie = TIE_EPS * np.tanh(raw / (self.tie_scale or 1.0))
        return np.clip(base + tie, 0.0, 1.0)

    def risk_level(self, p: float) -> str:
        b = self.risk_bands
        if p >= b["critical"]:
            return "CRITICAL"
        if p >= b["high"]:
            return "HIGH"
        if p >= b["medium"]:
            return "MEDIUM"
        return "LOW"

    # ----------------------------------------------------------------- io
    def save(self, bundle_dir: Path) -> Path:
        d = Path(bundle_dir)
        with open(d / CALIBRATOR_FILE, "wb") as f:
            pickle.dump(self, f)
        (d / CALIBRATOR_META).write_text(json.dumps(self.summary(), indent=2))
        return d / CALIBRATOR_FILE

    @classmethod
    def load(cls, bundle_dir: Path) -> "Calibrator | None":
        p = Path(bundle_dir) / CALIBRATOR_FILE
        if not p.exists():
            return None
        with open(p, "rb") as f:
            return pickle.load(f)

    def summary(self) -> dict:
        return {
            "stratum": self.stratum,
            "method": self.method,
            "raw_threshold": self.raw_threshold,
            "calibrated_threshold": self.calibrated_threshold,
            "risk_bands": self.risk_bands,
            "ece_validation_in_sample": self.ece,
            "ece_test_out_of_sample": self.ece_test,
            "n_val_rows": self.n_val_rows,
            "n_val_fraud": self.n_val_fraud,
            "scale": self.scale,
            "tie_scale": self.tie_scale,
            "fitted_on": "validation partition (disjoint from fit and test)",
            "monotone": "strict",
            "note": ("Isotonic alone is monotone non-decreasing and ties raw "
                     "scores together, which perturbs AUC-PR. A tanh tie-break "
                     "of size 1e-6 restores strict monotonicity, so ranking, "
                     "AUC-PR, AUC-ROC and the tuned operating point are all "
                     "preserved exactly. ece_validation_in_sample is near zero "
                     "by construction and proves nothing; read "
                     "ece_test_out_of_sample."),
        }


# --------------------------------------------------------------------- fit
def _bands(calibrated_threshold: float, calibrated_scores: np.ndarray) -> dict:
    """Anchor the bands to quantities that mean something on this scale.

    Fixed 0.25 / 0.50 / 0.75 / 0.90 cutoffs are written for a raw sigmoid and do
    not transfer to a calibrated probability on a low-base-rate population, so:

    * **HIGH** is exactly the tuned decision threshold — the flag / no-flag
      boundary the model actually defends.
    * **MEDIUM** is half of it.
    * **CRITICAL** is the median of the *alert* population, i.e. the worse half
      of what this stratum flags.

    CRITICAL deliberately is **not** a high quantile of all scored rows. Isotonic
    regression on a well-separated binary target is a step function — on the
    TRANSFER test partition it emits only 17 distinct values — so the 0.995
    quantile of everything lands on the threshold itself and HIGH and CRITICAL
    collapse onto the same number, leaving no HIGH band at all. Conditioning on
    the alert population avoids that and gives the band a statement an analyst
    can act on: CRITICAL means "in the worse half of what we flagged".
    """
    hi = float(calibrated_threshold)
    med = 0.5 * hi
    s = np.asarray(calibrated_scores, dtype=np.float64)
    alerts = s[s >= hi]
    crit = float(np.quantile(alerts, ALERT_QUANTILE)) if len(alerts) >= 10 else hi

    # A band that cannot separate anything is worse than no band. Isotonic's
    # step function puts most alerts on the threshold level itself, so the
    # quantile can land within a tie-break epsilon of HIGH; require a real gap
    # and otherwise place CRITICAL midway between HIGH and 1.
    if crit - hi < MIN_BAND_GAP:
        crit = min(1.0, hi + 0.5 * (1.0 - hi))
    return {"medium": round(med, 6), "high": round(hi, 6),
            "critical": round(crit, 6)}


def fit(stratum: str, raw_val: np.ndarray, y_val: np.ndarray,
        raw_threshold: float) -> Calibrator:
    """Fit the calibrator for one stratum on its validation partition."""
    raw_val = np.asarray(raw_val, dtype=np.float64)
    y_val = np.asarray(y_val, dtype=np.int64)
    n_fraud = int(y_val.sum())

    if n_fraud > 0:
        from sklearn.isotonic import IsotonicRegression
        iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        iso.fit(raw_val, y_val.astype(float))
        c = Calibrator(
            method="isotonic", stratum=stratum, raw_threshold=float(raw_threshold),
            calibrated_threshold=0.0, risk_bands={},
            n_val_rows=int(len(raw_val)), n_val_fraud=n_fraud,
            tie_scale=float(raw_val.std() + 1e-8), _iso=iso,
        )
        # Threshold and bands are read off the transform actually served, so
        # the tie-break is inside them rather than applied afterwards.
        c.calibrated_threshold = float(c.transform(np.array([raw_threshold]))[0])
        cal_val = c.transform(raw_val)
        c.risk_bands = _bands(c.calibrated_threshold, cal_val)
        # In-sample: isotonic fitted here, so this is near zero by construction
        # and is not evidence of anything. ece_test is the honest number and is
        # filled in by scripts/export_calibrators.py.
        c.ece = expected_calibration_error(cal_val, y_val)
        return c

    # No labels to calibrate against — PAYMENT is a false-positive control.
    scale = float(raw_val.std() + 1e-8)
    c = Calibrator(
        method="threshold_logistic", stratum=stratum,
        raw_threshold=float(raw_threshold), calibrated_threshold=0.5,
        risk_bands={}, ece=None, n_val_rows=int(len(raw_val)), n_val_fraud=0,
        scale=scale,
    )
    c.risk_bands = _bands(0.5, c.transform(raw_val))
    return c
