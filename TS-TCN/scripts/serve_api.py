"""Launch the TS-TCN FastAPI service locally.

Usage:
    python scripts/serve_api.py

Port 8003 is what the fusion engine expects — see
fusion_engine/DeepSentinel/config.example.ini, [upstream] temporal_api_base.
"""

import os
import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if __name__ == "__main__":
    uvicorn.run(
        "api.main:app",
        host=os.getenv("TSTCN_API_HOST", "0.0.0.0"),
        port=int(os.getenv("TSTCN_API_PORT", "8003")),
        reload=False,
    )
