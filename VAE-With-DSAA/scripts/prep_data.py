#!/usr/bin/env python
"""Build the chronological-split arrays used by the training pipeline.

    python scripts/prep_data.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vae_dsaa.data.prep import main  # noqa: E402

if __name__ == "__main__":
    main()
