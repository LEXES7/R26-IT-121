"""Make the src-layout package importable without installing it.

The project uses a src layout, so ``vae_dsaa`` is only importable after
``pip install -e .``. Putting the path in here rather than in each test file
means a new test module does not have to remember to do it.
"""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
