"""TFRecord serialisation helpers."""
import numpy as np
import tensorflow as tf

W = 32
F = 10

FEATURE_DESCRIPTION = {
    "window":       tf.io.FixedLenFeature([], tf.string),
    "label":        tf.io.FixedLenFeature([], tf.int64),
    "composite_id": tf.io.FixedLenFeature([], tf.string),
    "step":         tf.io.FixedLenFeature([], tf.int64),
}


def _bytes_feature(v):
    return tf.train.Feature(bytes_list=tf.train.BytesList(value=[v]))


def _int64_feature(v):
    return tf.train.Feature(int64_list=tf.train.Int64List(value=[v]))


def serialize_example(window: np.ndarray, label: int,
                      composite_id: str, step: int) -> bytes:
    feat = {
        "window":       _bytes_feature(window.astype(np.float32).tobytes()),
        "label":        _int64_feature(int(label)),
        "composite_id": _bytes_feature(composite_id.encode("utf-8")),
        "step":         _int64_feature(int(step)),
    }
    proto = tf.train.Example(features=tf.train.Features(feature=feat))
    return proto.SerializeToString()


def parse_example(serialized):
    parsed = tf.io.parse_single_example(serialized, FEATURE_DESCRIPTION)
    window = tf.reshape(tf.io.decode_raw(parsed["window"], tf.float32), (W, F))
    label = tf.cast(parsed["label"], tf.float32)
    return window, label
