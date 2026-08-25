"""FraudAttention — single-head self-attention with attribution output (Novelty N3).

Returns both the context vector (used by the dense head) and the attention
weights at the centre time-step (used for attribution by Member 4).
"""
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers


@keras.utils.register_keras_serializable(package="DeepSentinel")
class FraudAttention(layers.Layer):
    """Single-head self-attention over W time-steps.

    Inputs:
        x: tensor (batch, W, channels)

    Outputs:
        context: tensor (batch, d_k)        — aggregated context for fraud prediction
        weights: tensor (batch, W)          — attention over predecessors (sums to 1)
    """

    def __init__(self, d_k: int = 32, **kwargs):
        super().__init__(**kwargs)
        self.d_k = d_k

    def build(self, input_shape):
        self.q_dense = layers.Dense(self.d_k, name="q_proj")
        self.k_dense = layers.Dense(self.d_k, name="k_proj")
        self.v_dense = layers.Dense(self.d_k, name="v_proj")
        self.scale = tf.cast(tf.math.sqrt(tf.cast(self.d_k, tf.float32)), tf.float32)
        super().build(input_shape)

    def call(self, x):
        Q = self.q_dense(x)
        K = self.k_dense(x)
        V = self.v_dense(x)

        scores = tf.matmul(Q, K, transpose_b=True) / self.scale
        weights = tf.nn.softmax(scores, axis=-1)

        # Centre = last time-step's row → attention over its 32 predecessors
        centre_weights = weights[:, -1, :]
        context = tf.squeeze(
            tf.matmul(tf.expand_dims(centre_weights, axis=1), V), axis=1
        )
        return context, centre_weights

    def get_config(self):
        cfg = super().get_config()
        cfg["d_k"] = self.d_k
        return cfg
