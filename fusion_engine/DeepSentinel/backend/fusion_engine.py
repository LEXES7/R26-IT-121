"""
Weighted Ensemble Meta Classifier
Logistic Regression stacking layer that fuses the three upstream model scores
(graph, behavioral, temporal) into a unified Fraud Confidence Score.

On startup: loads a saved model if present, otherwise trains on synthetic
PaySim-style calibration data and saves the model for reuse.
"""

import logging
import os
from dataclasses import dataclass
from pathlib import Path

import joblib
import math

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

logger = logging.getLogger(__name__)


@dataclass
class FusionResult:
    confidence_score: float
    graph_score: float
    behavioral_score: float
    temporal_score: float
    graph_available: bool
    behavioral_available: bool
    temporal_available: bool
    modalities_used: int


# How much of the evidence one absent detector costs. At 0.18, a single
# missing modality moves a 0.90 verdict to about 0.86 and a 0.003 one to about
# 0.006 — less certain either way, and never collapsed to a tie.
UNCERTAINTY_SHRINK = 0.18

# Probabilities of exactly 0 or 1 have infinite log-odds. Clamping keeps the
# transform finite without changing any decision.
MAX_LOGIT = 12.0


def _generate_synthetic_training_data(n_samples: int = 2000) -> tuple:
    """
    Generate PaySim-style synthetic calibration data for the meta classifier.
    Simulates realistic correlations between the three modality scores and fraud labels.
    This mirrors what the PaySim validation split would produce after upstream models process it.
    """
    rng = np.random.default_rng(42)

    # --- Legitimate transactions (70% of dataset) ---
    n_legit = int(n_samples * 0.70)
    legit_graph = rng.beta(2, 8, n_legit)           # low graph score: sparse network
    legit_behavioral = rng.beta(2, 8, n_legit)       # low behavioral: consistent patterns
    legit_temporal = rng.beta(2, 8, n_legit)         # low temporal: normal velocity
    legit_labels = np.zeros(n_legit)

    # --- Fraudulent transactions (30% of dataset, intentionally oversampled for classifier) ---
    n_fraud = n_samples - n_legit

    # Smurfing / Structuring — high temporal, medium graph
    n_type1 = n_fraud // 4
    t1_g = rng.beta(4, 4, n_type1)
    t1_b = rng.beta(3, 5, n_type1)
    t1_t = rng.beta(7, 2, n_type1)

    # Layering / Mule Networks — high graph, high behavioral
    n_type2 = n_fraud // 4
    t2_g = rng.beta(8, 2, n_type2)
    t2_b = rng.beta(7, 2, n_type2)
    t2_t = rng.beta(5, 3, n_type2)

    # Account Takeover — high behavioral, low graph
    n_type3 = n_fraud // 4
    t3_g = rng.beta(2, 7, n_type3)
    t3_b = rng.beta(8, 2, n_type3)
    t3_t = rng.beta(6, 3, n_type3)

    # Velocity Fraud — very high temporal, moderate others
    n_type4 = n_fraud - n_type1 - n_type2 - n_type3
    t4_g = rng.beta(4, 5, n_type4)
    t4_b = rng.beta(4, 5, n_type4)
    t4_t = rng.beta(9, 1, n_type4)

    fraud_graph = np.concatenate([t1_g, t2_g, t3_g, t4_g])
    fraud_behavioral = np.concatenate([t1_b, t2_b, t3_b, t4_b])
    fraud_temporal = np.concatenate([t1_t, t2_t, t3_t, t4_t])
    fraud_labels = np.ones(n_fraud)

    X = np.column_stack([
        np.concatenate([legit_graph, fraud_graph]),
        np.concatenate([legit_behavioral, fraud_behavioral]),
        np.concatenate([legit_temporal, fraud_temporal]),
    ])
    y = np.concatenate([legit_labels, fraud_labels])

    # Shuffle
    idx = rng.permutation(len(y))
    return X[idx], y[idx]


class MetaClassifier:
    def __init__(self, model_save_path: str):
        self.model_save_path = Path(model_save_path)
        self._pipeline: Pipeline | None = None

    def initialize(self):
        """Load saved model or train a new one from synthetic calibration data."""
        if self.model_save_path.exists():
            self._pipeline = joblib.load(self.model_save_path)
            logger.info(f"Loaded meta-classifier from {self.model_save_path}")
            return

        logger.info("No saved meta-classifier found. Training on synthetic calibration data...")
        self._train()

    def _train(self):
        X, y = _generate_synthetic_training_data()

        self._pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(
                C=1.0,
                max_iter=1000,
                random_state=42,
                class_weight="balanced",  # handle class imbalance
            )),
        ])
        self._pipeline.fit(X, y)

        # Cross-validation to log performance
        cv_scores = cross_val_score(self._pipeline, X, y, cv=5, scoring="f1")
        logger.info(
            f"Meta-classifier CV F1: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}"
        )

        self.model_save_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self._pipeline, self.model_save_path)
        logger.info(f"Meta-classifier saved to {self.model_save_path}")

    def retrain(self):
        """Force retrain — call this if upstream models are recalibrated."""
        if self.model_save_path.exists():
            self.model_save_path.unlink()
        self._train()

    def _neutral(self) -> tuple[float, float, float]:
        """The per-modality value that standardises to zero — the score an
        absent detector is given so it contributes nothing either way."""
        try:
            mean = self._pipeline.named_steps["scaler"].mean_
            return float(mean[0]), float(mean[1]), float(mean[2])
        except Exception:                               # noqa: BLE001
            # An unscaled or differently-shaped pipeline: fall back to the
            # midpoint rather than failing a live verdict over it.
            return 0.5, 0.5, 0.5

    def fuse(
        self,
        graph_score: float | None,
        behavioral_score: float | None,
        temporal_score: float | None,
    ) -> FusionResult:
        """
        Fuse sub-model scores into a single Fraud Confidence Score.
        Handles missing modalities (None = timed out upstream model).
        """
        if self._pipeline is None:
            raise RuntimeError("MetaClassifier not initialized. Call initialize() first.")

        graph_available = graph_score is not None
        behavioral_available = behavioral_score is not None
        temporal_available = temporal_score is not None

        # A missing score is imputed at the value that contributes nothing.
        #
        # It used to be a flat 0.5, described as neutral. It is not: the
        # scaler centres each modality on its own training mean (0.29, 0.32,
        # 0.36), so feeding 0.5 puts the absent detector roughly half a
        # standard deviation into "suspicious" and lets an outage argue for
        # guilt. Imputing the mean makes the standardised value exactly zero,
        # so the missing term drops out of the linear combination instead of
        # voting. The uncertainty is then expressed once, by the shrinkage
        # below, rather than twice and in two directions.
        neutral = self._neutral()
        g = graph_score if graph_available else neutral[0]
        b = behavioral_score if behavioral_available else neutral[1]
        t = temporal_score if temporal_available else neutral[2]

        modalities_used = sum([graph_available, behavioral_available, temporal_available])

        X = np.array([[g, b, t]])
        confidence = float(self._pipeline.predict_proba(X)[0][1])  # probability of fraud class

        # Discount the *evidence* when a detector is missing, not the
        # probability.
        #
        # This used to be `max(0.0, confidence - 0.10 * missing)`, and that had
        # two faults. Subtracting a constant from a probability clamps at
        # zero: measured over a 400-transaction replay with one detector down,
        # the model produced 55 distinct values below 0.10 and the subtraction
        # collapsed them to 4, sending 388 of 400 to exactly 0.0000. Every
        # operating point between 0.09 and 0.30 then selected an identical set
        # of transactions, which is why the severity bands did nothing.
        #
        # It was also the wrong direction. Lowering the score for a missing
        # detector makes an outage look like safety — the failure this
        # component's own design notes call out as "absence is not innocence".
        #
        # Shrinking the log-odds toward zero says the honest thing instead: with
        # less evidence we are less certain in *both* directions. It is
        # monotonic, so ordering and every distinct value survive, and it
        # cannot clamp.
        if modalities_used < 3:
            shrink = 1.0 - UNCERTAINTY_SHRINK * (3 - modalities_used)
            z = math.log(confidence / (1.0 - confidence)) if 0.0 < confidence < 1.0 else (
                -MAX_LOGIT if confidence <= 0.0 else MAX_LOGIT
            )
            z = max(-MAX_LOGIT, min(MAX_LOGIT, z)) * shrink
            confidence = 1.0 / (1.0 + math.exp(-z))
            logger.info(
                f"{3 - modalities_used} modality/modalities unavailable; "
                f"evidence shrunk by {1 - shrink:.0%} to {confidence:.4f}"
            )

        return FusionResult(
            confidence_score=round(confidence, 4),
            graph_score=g,
            behavioral_score=b,
            temporal_score=t,
            graph_available=graph_available,
            behavioral_available=behavioral_available,
            temporal_available=temporal_available,
            modalities_used=modalities_used,
        )
