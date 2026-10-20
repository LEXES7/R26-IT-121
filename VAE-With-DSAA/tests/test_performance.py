"""The held-out results /health publishes for the console's model card.

Loads the real bundles and reports, because the point is that the card shows
the numbers the evaluation wrote, not numbers restated somewhere else.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def predictor():
    if not (ROOT / "checkpoints" / "v4").exists():
        pytest.skip("no served bundles in this checkout")
    from vae_dsaa.inference.service import BehavioralPredictor
    return BehavioralPredictor(ROOT)


def test_performance_matches_the_transfer_report(predictor):
    report = json.loads((ROOT / "reports" / "v4" / "clean__FS-ORIGIN__TRANSFER.json").read_text())
    p = predictor.health()["performance"]["TRANSFER"]
    assert p["rows"] == report["n_rows"]
    assert p["frauds"] == report["n_fraud"]
    assert p["auc_roc"] == report["auc_roc"]
    assert p["f1"] == report["operating_point_f1_optimal"]["f1"]


def test_health_still_serialises_without_nan(predictor):
    # PAYMENT has no fraud, so its AUCs are undefined; the response must not carry NaN.
    json.dumps(predictor.health(), allow_nan=False)


def test_each_bundle_carries_its_report(predictor):
    # The serving image leaves reports/ out, so there these copies are the card.
    for s, b in predictor.bundles.items():
        report = ROOT / "reports" / "v4" / f"clean__FS-ORIGIN__{s}.json"
        assert (b.path / "evaluation.json").read_bytes() == report.read_bytes(), s


def test_card_survives_an_image_without_reports(predictor, tmp_path):
    # The image's layout: checkpoints/v4 copied in, and no reports/ beside it.
    for b in predictor.bundles.values():
        shutil.copytree(b.path, tmp_path / "checkpoints" / "v4" / b.path.name)
    from vae_dsaa.inference.service import BehavioralPredictor
    assert BehavioralPredictor(tmp_path).performance == predictor.performance
