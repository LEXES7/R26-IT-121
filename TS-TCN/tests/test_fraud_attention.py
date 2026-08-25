"""FraudAttention sanity tests."""
import numpy as np
import tensorflow as tf

from src.models import FraudAttention


def test_output_shape():
    layer = FraudAttention(d_k=32)
    x = tf.random.normal((4, 32, 96))
    context, weights = layer(x)
    assert context.shape == (4, 32)
    assert weights.shape == (4, 32)


def test_weights_sum_to_one():
    layer = FraudAttention(d_k=32)
    x = tf.random.normal((4, 32, 96))
    _, weights = layer(x)
    sums = tf.reduce_sum(weights, axis=-1).numpy()
    assert np.allclose(sums, 1.0, atol=1e-5)


def test_serializable():
    layer = FraudAttention(d_k=32)
    cfg = layer.get_config()
    rebuilt = FraudAttention.from_config(cfg)
    assert rebuilt.d_k == 32
