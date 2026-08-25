"""Download PaySim dataset to data/raw/. Run once.

Usage:
    python scripts/download_paysim.py
"""
import shutil
from pathlib import Path

import kagglehub


def main():
    dest = Path("data/raw")
    dest.mkdir(parents=True, exist_ok=True)

    print("Downloading PaySim from KaggleHub …")
    src_dir = Path(kagglehub.dataset_download("ealaxi/paysim1"))
    csv_files = list(src_dir.glob("*.csv"))
    if not csv_files:
        raise SystemExit("No CSV found in download")

    src = csv_files[0]
    target = dest / src.name
    shutil.copy(src, target)
    print(f"✅ {target} ({target.stat().st_size / 1024**2:.1f} MB)")


if __name__ == "__main__":
    main()
