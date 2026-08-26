#!/usr/bin/env python
"""Build a clean staging copy for the official repository.

Copies exactly what should live in LEXES7/R26-IT-121 under VAE-With-DSAA/ and
nothing else. The destination is a SIBLING of this repository, deliberately
outside it, so the staging copy can never be caught by this repo's git index.

    python scripts/build_official_copy.py [--dest PATH] [--force]

Nothing is pushed and nothing is committed.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEST = ROOT.parent / "VAE-With-DSAA-official"

# extensions never copied, whatever directory they appear in
BLOCKED_SUFFIXES = {".npz", ".keras", ".h5", ".pt", ".pth", ".pkl",
                    ".joblib", ".csv", ".parquet", ".npy", ".log"}
BLOCKED_DIRS = {"__pycache__", ".ipynb_checkpoints", ".git", ".pytest_cache"}

# (source, destination) directory pairs
DIR_COPIES = [
    ("src", "src"),
    ("scripts", "scripts"),
    ("notebooks/v1", "notebooks/v1"),
    ("notebooks/v2", "notebooks/v2"),
    ("notebooks/v3", "notebooks/v3"),
    ("reports", "reports"),
    ("docs", "docs"),
    ("configs", "configs"),
    ("tests", "tests"),
    ("examples", "examples"),
    ("dashboard", "dashboard"),
]

# (source in repo, destination in staging). Anything the staging copy needs must
# be sourced from the repository — a file that exists only in staging is deleted
# by every --force rebuild, which is how CHANGES.md was lost twice.
FILE_COPIES = [
    ("README.md", "README.md"),
    (".gitignore", ".gitignore"),
    ("requirements.txt", "requirements.txt"),
    ("pyproject.toml", "pyproject.toml"),
    ("checkpoints/README.md", "checkpoints/README.md"),
    ("data/README.md", "data/README.md"),
    ("docs/CHANGES.md", "CHANGES.md"),
    # Serving. The bundles themselves are blocked extensions and stay
    # regenerable, but everything needed to stand the service up is tracked.
    ("Dockerfile", "Dockerfile"),
    ("docker-compose.yml", "docker-compose.yml"),
    (".dockerignore", ".dockerignore"),
    (".env.example", ".env.example"),
    ("data/demo/demo_transactions.json", "data/demo/demo_transactions.json"),
]

#: Files that may legitimately exist only in the staging copy. They are carried
#: across a --force rebuild instead of being destroyed by it.
PRESERVE_IF_STAGING_ONLY = ["CHANGES.md"]


def blocked(p: Path) -> bool:
    if p.suffix.lower() in BLOCKED_SUFFIXES:
        return True
    return any(part in BLOCKED_DIRS for part in p.parts)


def copy_tree(src: Path, dst: Path) -> tuple[int, int]:
    files = bytes_ = 0
    if not src.exists():
        return 0, 0
    for s in sorted(src.rglob("*")):
        if not s.is_file() or blocked(s.relative_to(src)) or blocked(s):
            continue
        d = dst / s.relative_to(src)
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(s, d)
        files += 1
        bytes_ += d.stat().st_size
    return files, bytes_


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dest", default=str(DEFAULT_DEST))
    ap.add_argument("--force", action="store_true",
                    help="replace an existing staging copy")
    a = ap.parse_args()
    dest = Path(a.dest)

    preserved = {}
    if dest.exists():
        if not a.force:
            raise SystemExit(f"{dest} exists — pass --force to replace it")
        # rescue staging-only files before the tree is destroyed
        for rel in PRESERVE_IF_STAGING_ONLY:
            q = dest / rel
            if q.exists():
                preserved[rel] = q.read_bytes()
        shutil.rmtree(dest)
    dest.mkdir(parents=True)

    total_files = total_bytes = 0
    print(f"building staging copy at {dest}\n")
    print(f"{'directory':<24} {'files':>7} {'size':>10}")
    print("-" * 44)
    for s, d in DIR_COPIES:
        f, b = copy_tree(ROOT / s, dest / d)
        total_files += f; total_bytes += b
        if f:
            print(f"{d:<24} {f:>7} {b/1048576:>9.2f}M")

    for src_rel, dst_rel in FILE_COPIES:
        s = ROOT / src_rel
        if not s.exists():
            print(f"{'MISSING SOURCE':<24} {src_rel}")
            continue
        d = dest / dst_rel
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(s, d)
        total_files += 1; total_bytes += d.stat().st_size

    # restore anything that legitimately lives only in staging and was not
    # re-supplied from the repository above
    for rel, blob in preserved.items():
        q = dest / rel
        if not q.exists():
            q.parent.mkdir(parents=True, exist_ok=True)
            q.write_bytes(blob)
            print(f"{'preserved':<24} {rel}")
            total_files += 1; total_bytes += len(blob)

    # placeholders so the ignored trees exist in a fresh clone
    for rel in ["data/raw", "data/processed", "checkpoints"]:
        (dest / rel).mkdir(parents=True, exist_ok=True)
        gk = dest / rel / ".gitkeep"
        if not gk.exists():
            gk.touch()
            total_files += 1

    print("-" * 44)
    print(f"{'TOTAL':<24} {total_files:>7} {total_bytes/1048576:>9.2f}M")

    leaks = [p for p in dest.rglob("*") if p.is_file() and blocked(p.relative_to(dest))]
    print(f"\nblocked-extension leaks: {len(leaks)}")
    for p in leaks[:10]:
        print("   ", p.relative_to(dest))

    big = [(p, p.stat().st_size) for p in dest.rglob("*")
           if p.is_file() and p.stat().st_size > 50 * 1024 * 1024]
    print(f"files over 50 MB: {len(big)}")
    for p, s in big:
        print(f"    {s/1048576:.1f}M  {p.relative_to(dest)}")


if __name__ == "__main__":
    main()
