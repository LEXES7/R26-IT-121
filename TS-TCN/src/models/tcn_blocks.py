"""Dilated causal Conv1D building block (Novelty N2).

To be filled in by extracting Cell 3 of notebooks/03_tcn_architecture.ipynb.
"""
from tensorflow.keras import layers


def dilated_causal_block(x, filters: int, dilation: int,
                         dropout: float = 0.2,
                         block_name: str = "block"):
    """Two stacked causal Conv1D layers with residual connection.

    Args:
        x: Input tensor of shape (batch, time, channels).
        filters: Number of filters in each Conv1D.
        dilation: Dilation rate (1, 2, 4, or 8 in the primary model).
        dropout: Dropout probability after each ReLU.
        block_name: Prefix for layer names (must be unique per block).

    Returns:
        Tensor of shape (batch, time, filters).
    """
    in_channels = x.shape[-1]
    skip = x

    x = layers.Conv1D(filters, 3, padding="causal", dilation_rate=dilation,
                      kernel_initializer="he_normal",
                      name=f"{block_name}_conv1")(x)
    x = layers.BatchNormalization(name=f"{block_name}_bn1")(x)
    x = layers.ReLU(name=f"{block_name}_relu1")(x)
    x = layers.Dropout(dropout, name=f"{block_name}_drop1")(x)

    x = layers.Conv1D(filters, 3, padding="causal", dilation_rate=dilation,
                      kernel_initializer="he_normal",
                      name=f"{block_name}_conv2")(x)
    x = layers.BatchNormalization(name=f"{block_name}_bn2")(x)
    x = layers.ReLU(name=f"{block_name}_relu2")(x)
    x = layers.Dropout(dropout, name=f"{block_name}_drop2")(x)

    if in_channels != filters:
        skip = layers.Conv1D(filters, 1, padding="same",
                             name=f"{block_name}_residual_proj")(skip)
    return layers.Add(name=f"{block_name}_add")([skip, x])
