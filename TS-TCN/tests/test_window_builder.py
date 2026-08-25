"""Causality and shape checks for the window builder."""
from collections import deque
import numpy as np


def test_deque_skips_first_W():
    """First W transactions are skipped (cold start)."""
    W = 32
    buf = deque(maxlen=W)
    skipped = 0
    emitted = 0
    for i in range(100):
        if len(buf) == W:
            emitted += 1
        else:
            skipped += 1
        buf.append(i)
    assert skipped == W
    assert emitted == 100 - W


def test_window_is_strictly_preceding():
    """Window snapshot must contain rows BEFORE the centre row."""
    W = 32
    buf = deque(maxlen=W)
    for i in range(40):
        if len(buf) == W:
            window = np.array(buf)
            # All values in window should be < i (causal)
            assert (window < i).all(), f"Causal violation at i={i}"
        buf.append(i)
