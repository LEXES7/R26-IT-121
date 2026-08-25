"""Data pipeline for the TS-TCN.

Modules:
    features      — F1–F10 engineering on PaySim
    window_builder — System-wide W=32 sliding window (Novelty N1)
    tfrecord_io   — Read/write helpers for TFRecord windows
"""
