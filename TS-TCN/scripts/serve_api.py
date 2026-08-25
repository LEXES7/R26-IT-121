"""Launch the TS-TCN classification service locally.

Usage:
    python scripts/serve_api.py

Runs on port 8003 by default — the value fusion_engine/DeepSentinel/backend
/config.py's TEMPORAL_API_BASE points to out of the box, so the fusion
engine finds it with no configuration change.
"""
import os
from pathlib import Path

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "api.main:app",
        host=os.getenv("TSTCN_API_HOST", "0.0.0.0"),
        port=int(os.getenv("TSTCN_API_PORT", "8003")),
        reload=True,
        # TS-TCN has no pyproject.toml/editable install (unlike GraphSage),
        # so api.main isn't importable via plain cwd-relative sys.path when
        # this script is invoked as `python scripts/serve_api.py` — app_dir
        # tells uvicorn (and its reload subprocess) to add the repo root.
        app_dir=str(Path(__file__).resolve().parents[1]),
    )
