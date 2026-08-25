"""TS-TCN model assembly — proposal §3.6 specification."""
from tensorflow import keras
from tensorflow.keras import layers, Model

from .tcn_blocks import dilated_causal_block
from .fraud_attention import FraudAttention


def build_ts_tcn(W: int = 32, F: int = 10,
                 dilations=(1, 2, 4, 8),
                 filters: int = 96,
                 attn_d_k: int = 32,
                 dropout: float = 0.2,
                 head_dropout: float = 0.3) -> Model:
    """Build the TS-TCN model.

    Args:
        W: Window length (default 32).
        F: Number of features per time-step (default 10).
        dilations: Dilation rate per TCN block (default (1, 2, 4, 8)).
        filters: Filters per Conv1D (default 96 — yields ~219 K params).
        attn_d_k: Attention key/query dimension (default 32).
        dropout: Dropout in TCN blocks (default 0.2).
        head_dropout: Dropout in the Dense head (default 0.3).

    Returns:
        Keras Model with two outputs:
            fraud_prob:        (batch, 1) sigmoid output
            attention_weights: (batch, W) attribution vector

    Receptive field with k=3 and 4 blocks of (1,2,4,8): 61 (covers W=32).
    """
    inputs = keras.Input(shape=(W, F), name="window")

    x = inputs
    for i, d in enumerate(dilations):
        x = dilated_causal_block(x, filters=filters, dilation=d,
                                  dropout=dropout,
                                  block_name=f"tcn{i + 1}_d{d}")

    context, attn_weights = FraudAttention(d_k=attn_d_k,
                                            name="fraud_attention")(x)

    pooled = layers.GlobalAveragePooling1D(name="global_pool")(x)
    head = layers.Concatenate(name="concat_attn_pool")([context, pooled])
    head = layers.Dense(64, activation="relu", name="head_dense")(head)
    head = layers.Dropout(head_dropout, name="head_drop")(head)
    fraud_prob = layers.Dense(1, activation="sigmoid", name="fraud_prob")(head)

    return Model(inputs=inputs, outputs=[fraud_prob, attn_weights],
                  name="TS_TCN")
