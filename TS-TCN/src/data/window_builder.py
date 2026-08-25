"""System-wide W=32 window builder (Novelty N1).

To be filled in by extracting Cell 4 of notebooks/02_window_builder.ipynb.
"""
from collections import deque
from pathlib import Path
import numpy as np
import tensorflow as tf

from .tfrecord_io import serialize_example


def build_windows(df, feature_cols: list, scaler,
                  train_path: Path, test_path: Path,
                  W: int = 32, split_step: int = 595) -> dict:
    """Stream the chronologically-sorted DataFrame and write TFRecords.

    Args:
        df: Sorted DataFrame with feature_cols + [step, isFraud, composite_id].
        feature_cols: Column names of F1–F10.
        scaler: Fit StandardScaler from training partition.
        train_path/test_path: Output TFRecord paths.
        W: Window length.
        split_step: Step boundary between train and test partitions.

    Returns:
        Dict with counts and metadata.
    """
    features_arr = scaler.transform(df[feature_cols].values.astype(np.float32))
    labels_arr = df["isFraud"].values.astype(np.int64)
    steps_arr = df["step"].values.astype(np.int64)
    cids_arr = df["composite_id"].values.astype(str)

    buffer = deque(maxlen=W)
    counts = {"train": 0, "test": 0, "skipped": 0,
              "fraud_train": 0, "fraud_test": 0}

    with tf.io.TFRecordWriter(str(train_path)) as tw, \
         tf.io.TFRecordWriter(str(test_path)) as ts:
        for i in range(len(df)):
            if len(buffer) == W:
                example = serialize_example(
                    np.stack(buffer, axis=0),
                    labels_arr[i], cids_arr[i], steps_arr[i])
                if steps_arr[i] <= split_step:
                    tw.write(example); counts["train"] += 1
                    counts["fraud_train"] += int(labels_arr[i])
                else:
                    ts.write(example); counts["test"] += 1
                    counts["fraud_test"] += int(labels_arr[i])
            else:
                counts["skipped"] += 1
            buffer.append(features_arr[i])

    return counts
