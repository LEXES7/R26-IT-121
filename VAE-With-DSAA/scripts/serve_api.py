"""Launch the behavioural detector locally.

Usage:
    python scripts/serve_api.py

Port 8001 is what the fusion engine expects — see
fusion_engine/DeepSentinel/config.example.ini, [upstream] behavioral_api_base.
"""

import os
import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

if __name__ == "__main__":
    uvicorn.run(
        "vae_dsaa.api.app:app",
        host=os.getenv("BEHAVIORAL_API_HOST", "0.0.0.0"),
        port=int(os.getenv("BEHAVIORAL_API_PORT", "8001")),
        reload=False,
    )
