# Architecture Decision Log

A running journal of significant design decisions and their rationale.
New decisions are appended to the top.

---

## ADR-005 — `BinaryFocalCrossentropy(γ=2.0)` shared by B2 and TS-TCN
**Date:** 2026-04-14 · **Status:** Accepted

Identical loss across the non-linear baseline (B2 MLP) and the sequential
model (TS-TCN). Attributing the performance gap entirely to sequence context
requires the loss function to be controlled.

---

## ADR-004 — TFRecord format over in-memory tensors
**Date:** 2026-04-26 · **Status:** Accepted

The 6.36M × 32 × 10 float32 tensor (~8 GB) cannot reliably fit in Colab
high-RAM runtimes. Streaming TFRecords with `tf.data.TFRecordDataset` plus
`prefetch(AUTOTUNE)` keeps GPU at full utilisation while bounding RAM.

---

## ADR-003 — Snapshot deque BEFORE pushing current row
**Date:** 2026-04-26 · **Status:** Accepted

To guarantee strict causality, the window for transaction T must contain
the 32 transactions *strictly preceding* T. Snapshotting the deque before
appending the current vector enforces this without an explicit time check.

---

## ADR-002 — Custom `FraudAttention` layer over `MultiHeadAttention`
**Date:** 2026-05-08 · **Status:** Accepted

Keras's built-in `MultiHeadAttention` cannot expose attention weights as a
model output cleanly. We need the weights for attribution (Member 4 contract),
so a custom single-head layer is implemented from scratch. Single-head also
matches the proposal text (`fraud_attention` — singular).

---

## ADR-001 — F6 (`type_risk_weight`) train-only derivation
**Date:** 2026-04-13 · **Status:** Accepted

`type_risk_weight = fraud_count_per_type / total_train_fraud`, computed from
rows with `step ≤ 595` only. Computing from the entire dataset would leak
test-set information. FR1 compliance.
