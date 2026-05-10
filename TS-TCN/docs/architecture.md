# TS-TCN Architecture

## Overview

The TS-TCN classifies a transaction as fraudulent based on a **window of 32
preceding transactions across the entire system stream** (Novelty N1). The
architecture has four parts: a feature embedding (the window itself, scaled),
a stack of dilated causal Conv1D blocks, a self-attention attribution layer,
and a small dense head that emits a fraud probability.

## Forward Pass

```
Input window: (B, 32, 10)  ← B = batch, 32 = W, 10 = F (features F1–F10)
    │
    ├── DilatedCausalBlock 1  (filters=96, dilation=1)   ← immediate predecessor
    ├── DilatedCausalBlock 2  (filters=96, dilation=2)   ← 2-step patterns
    ├── DilatedCausalBlock 3  (filters=96, dilation=4)   ← 4-step escalation
    └── DilatedCausalBlock 4  (filters=96, dilation=8)   ← 8-step escalation
    │   each block: Conv1D(causal) → BN → ReLU → Dropout
    │             → Conv1D(causal) → BN → ReLU → Dropout
    │             → +residual
    │
    ├── FraudAttention(d_k=32)   ← Novelty N3
    │     │
    │     ├── context        (B, 32)         used in head
    │     └── attention_wts  (B, 32)         exposed for attribution
    │
    ├── GlobalAveragePooling1D
    ├── Concat([context, pooled])
    ├── Dense(64, relu) → Dropout(0.3)
    └── Dense(1, sigmoid) → fraud probability
```

## Receptive Field

With kernel size 3 and dilations [1, 2, 4, 8] across 4 blocks (2 conv layers
each), the receptive field is:

    RF = 1 + Σₗ (k − 1) · dₗ
       = 1 + 2·(2·1) + 2·(2·2) + 2·(2·4) + 2·(2·8)
       = 1 + 4 + 8 + 16 + 32
       = 61

This **exceeds W = 32**, so every centre position can attend to the entire
predecessor history through convolution.

## Causality Guarantee

Every Conv1D uses `padding='causal'` (Keras left-pads the input), so the
output at time *t* depends only on input positions ≤ *t*. The window
construction also snapshots the deque **before** pushing the current row,
giving a strict causal contract end-to-end — no future information ever
leaks into the classification decision.

## Loss

`BinaryFocalCrossentropy(γ=2.0)` — handles the 1:773 class imbalance by
down-weighting easy negatives. Identical loss to the B2 baseline so the
performance gap can be attributed entirely to the addition of sequence context.

## Outputs

The model has **two outputs**:

| Output             | Used for                         | In loss? |
|--------------------|----------------------------------|----------|
| `fraud_prob`       | Binary classification            | ✅ Yes   |
| `attention_weights` (32,) | Attribution to Member 4   | ❌ No    |

Total parameters: ≈ 219 K (target ~210 K per proposal §3.6).
