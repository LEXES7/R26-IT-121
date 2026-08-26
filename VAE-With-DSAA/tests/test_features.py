"""Feature-set definitions and provenance invariants."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from vae_dsaa.data import features as F


def test_tier_sizes():
    assert len(F.columns("FS-FULL")) == 11
    assert len(F.columns("FS-ORIGIN")) == 7
    assert len(F.columns("FS-CLEAN")) == 4


def test_tiers_are_nested():
    full, origin, clean = (set(F.columns(k)) for k in ("FS-FULL", "FS-ORIGIN", "FS-CLEAN"))
    assert clean < origin < full


def test_look_ahead_and_absolute_time_excluded_from_every_corrected_tier():
    for k in ("FS-FULL", "FS-ORIGIN", "FS-CLEAN"):
        cols = set(F.columns(k))
        assert not (cols & F.LOOK_AHEAD), f"{k} leaks F11"
        assert not (cols & F.TIME_ABSOLUTE), f"{k} keeps F7_day"


def test_balance_groups_partition_cleanly():
    assert F.ORIGIN_BALANCE & F.DESTINATION_BALANCE == set()
    assert F.ORIGIN_BALANCE | F.DESTINATION_BALANCE == F.BALANCE_DERIVED
    assert len(F.BALANCE_DERIVED) == 7


def test_fs_clean_touches_no_balance_column():
    balance_cols = {"oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest"}
    used = set(F.describe("FS-CLEAN")["source_columns"])
    assert not (used & balance_cols)


def test_fs_origin_touches_no_destination_column():
    used = set(F.describe("FS-ORIGIN")["source_columns"])
    assert not (used & {"oldbalanceDest", "newbalanceDest"})


def test_primary_feature_set_is_a_known_tier():
    # decided from the measured ablation gradient, not assumed
    assert F.PRIMARY_FEATURE_SET == "FS-ORIGIN"
    assert F.PRIMARY_FEATURE_SET in F.FEATURE_SETS


def test_f3_ablation_tier_exists():
    # FS-ORIGIN's advantage rests on F3; the tier that measures that must stay
    assert "FS-ORIGIN-NOF3" in F.FEATURE_SETS
    assert set(F.columns("FS-ORIGIN")) - set(F.columns("FS-ORIGIN-NOF3")) == {
        "F3_balance_consistency"}


def test_every_feature_has_declared_provenance():
    assert set(F.SOURCE_COLUMNS) == set(F.COLS13)
