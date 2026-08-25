"""Pydantic request/response schemas for the behavioural detector.

Field names implement what the fusion engine's adapter actually reads —
``fusion_engine/DeepSentinel/backend/adapters/upstream.py``,
``call_behavioral_api``. Renaming any of them is a breaking change requiring
coordination with Member 4.

**The spelling is deliberate.** The adapter reads::

    score = _clamp(float(data.get("behavioral_risk_score", 0.5)))

American spelling, and a silent default. If this service answered with the
British ``behavioural_risk_score`` the adapter would raise nothing, report the
modality as ``available=True``, and quietly substitute ``0.5`` for every
transaction. The component would appear healthy while contributing nothing.
Every field the adapter reads therefore uses the American spelling regardless
of the prose elsewhere in this repository.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TxnType(str, Enum):
    TRANSFER = "TRANSFER"
    CASH_OUT = "CASH_OUT"
    CASH_IN = "CASH_IN"
    PAYMENT = "PAYMENT"
    DEBIT = "DEBIT"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# --------------------------------------------------------------------- #
# Request
# --------------------------------------------------------------------- #
class ClassifyRequest(BaseModel):
    """One transaction, as the fusion engine sends it.

    ``extra="ignore"`` so a field added upstream — the adapter already appends
    ``composite_id`` and ``transaction_id`` — never turns into a 422.
    """

    model_config = ConfigDict(extra="ignore")

    step: int = Field(ge=1, le=10_000, description="PaySim hour (1-743 in v1 data)")
    type: TxnType
    amount: float = Field(ge=0)
    oldbalanceOrg: float = Field(ge=0)
    newbalanceOrig: float = Field(ge=0)
    oldbalanceDest: float = Field(ge=0)
    newbalanceDest: float = Field(ge=0)

    transaction_id: str | None = Field(default=None, max_length=128)
    composite_id: str | None = Field(default=None, max_length=128)
    nameOrig: str | None = Field(default=None, max_length=64)
    nameDest: str | None = Field(default=None, max_length=64)
    isFlaggedFraud: int | None = Field(default=None, ge=0, le=1)

    @field_validator("nameOrig", "nameDest")
    @classmethod
    def strip_ids(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v


class ScoreRequest(BaseModel):
    """Batch form, kept for evaluation runs and the dissertation."""

    model_config = ConfigDict(extra="ignore")
    transactions: list[ClassifyRequest] = Field(min_length=1, max_length=5_000)


# --------------------------------------------------------------------- #
# Response
# --------------------------------------------------------------------- #
class FeatureShare(BaseModel):
    feature: str
    share: float = Field(ge=0, le=1)


class DimensionShare(BaseModel):
    dimension: str
    share: float = Field(ge=0, le=1)


class Signal1(BaseModel):
    """Per-feature share of reconstruction error. Sums to 1 across all features."""

    dominant_feature_signal: str
    shares: list[FeatureShare]


class Signal2(BaseModel):
    """Per-latent-dimension share of KL divergence. Sums to 1 across dimensions."""

    dominant_dimension_signal: str
    shares: list[DimensionShare]


class Signal3(BaseModel):
    """Per-dimension share of the latent-density term.

    Additive extension. Signals 1 and 2 keep their names, widths and meaning, so
    a consumer reading only those is unaffected.
    """

    dominant_dimension_signal: str
    shares: list[DimensionShare]


class AnomalyFingerprint(BaseModel):
    signal_1_reconstruction_error: Signal1
    signal_2_kl_divergence: Signal2
    signal_3_latent_density: Signal3 | None = None


class FraudTypology(BaseModel):
    """Nearest discovered typology.

    Clusters are discovered without labels. ``typology_label`` is a post-hoc
    reading of the cluster's dominant attribution, and ``fatf_hint`` is an
    advisory retrieval key — neither makes the discovery supervised.
    """

    typology_label: str
    cluster_id: int
    confidence: float = Field(ge=0, le=1)
    cluster_fraud_purity: float | None = None
    cluster_size: int | None = None
    fatf_hint: str | None = None
    rationale: str | None = None
    discovery: str = "unsupervised DBSCAN over DSAA fingerprints; label is post-hoc"


class ScoreWeights(BaseModel):
    alpha: float
    beta: float
    gamma: float


class VaeDiagnostics(BaseModel):
    combined_anomaly_score: float
    raw_score: float
    threshold: float
    calibrated_threshold: float
    flagged: bool
    operating_point: str = "f1_optimal"
    stratum: str
    recon_z: float
    kl_z: float
    density_z: float
    weights: ScoreWeights
    calibration_method: str
    is_control_stratum: bool = False
    out_of_training_distribution: bool = False


class CurrentTransaction(BaseModel):
    fraud_signal_summary: str


class Evidence(BaseModel):
    current_transaction: CurrentTransaction


class ResponseMetadata(BaseModel):
    inference_latency_ms: int
    bundle: str
    protocol: str
    engineered_features: dict[str, float]


class ClassifyResponse(BaseModel):
    transaction_id: str | None
    composite_id: str | None
    timestamp: str
    model_version: str
    feature_set: str
    transaction_type: str

    behavioral_risk_score: float = Field(ge=0, le=1)
    risk_level: RiskLevel

    vae_diagnostics: VaeDiagnostics
    anomaly_fingerprint: AnomalyFingerprint
    fraud_typology: FraudTypology
    evidence: Evidence
    metadata: ResponseMetadata


class ScoreResponse(BaseModel):
    model_version: str
    feature_set: str
    count: int
    results: list[ClassifyResponse]


class ErrorResponse(BaseModel):
    """Any non-200 is treated by the fusion engine as 'behavioural unavailable'."""

    transaction_id: str | None = None
    error: str
    message: str
    fallback_score: float | None = None
