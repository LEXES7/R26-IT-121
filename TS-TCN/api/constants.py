"""Shared serving constants.

Split out from main.py so routes/classify.py can import these without a
main <-> routes circular import (main.py imports the router; the router
needs the window size and thresholds).
"""

WINDOW_SIZE = 32

# Tuned decision threshold from Stage 6 evaluation.
THRESHOLD_SUSPICIOUS = 0.4431
THRESHOLD_CRITICAL = 0.90
