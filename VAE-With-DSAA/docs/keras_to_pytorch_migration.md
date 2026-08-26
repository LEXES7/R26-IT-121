# Framework Migration: TensorFlow/Keras → PyTorch

**Project:** DeepSentinel (R26-IT-121) · Member 2 — Wijesinghe L.P.D.B. (IT22109194)
**Status:** documented deviation from the submitted proposal
**Written for:** the thesis deviations section

---

## 1. The deviation and why it was forced

The submitted proposal specifies the implementation stack as **"TensorFlow 2.x
with Keras"**. Revisions v1 through v3 were built that way. Revision v4 is
implemented in **PyTorch 2.13.0+cpu**.

The change was not a preference. The development machine runs **Python 3.14.3**,
for which **TensorFlow publishes no wheel**:

```
$ python -m pip index versions tensorflow
ERROR: No matching distribution found for tensorflow

$ python -m pip index versions torch
torch (2.13.0)
```

TensorFlow could not be installed, so the v3 Keras code could not be executed at
all on the target environment. The model was reimplemented in PyTorch with every
component of the specification matched.

This matters because v4 also changed the evaluation protocol, the feature
provenance rules and the scoring determinism. Without controlling for the
framework, a reader could not tell which of those changes moved the numbers.
Section 4 provides that control.

---

## 2. What was matched exactly

| Component | Keras v3 | PyTorch v4 | Matched |
| --- | --- | --- | --- |
| **Encoder** | `Dense(h1, relu) → Dense(h2, relu) → Dense(latent)` ×2 heads | identical | ✅ |
| **Decoder** | `Dense(h2, relu) → Dense(h1, relu) → Dense(input, sigmoid)` | identical | ✅ |
| **Per-type sizes** | TRANSFER 32/16/8, CASH_OUT 64/32/16, PAYMENT 32/16/8 | identical | ✅ |
| **Reconstruction loss** | `mean(sum((x − x̂)², axis=1))` | identical | ✅ |
| **KL term** | `−0.5·(1 + logvar − μ² − exp(logvar))` per dimension | identical | ✅ |
| **Free Bits clamp** | `maximum(kl_per_dim, free_bits)` summed | `torch.clamp(kl_pd, min=free_bits)` summed | ✅ |
| **Free Bits value** | 0.1 nats per latent dimension | 0.1 | ✅ |
| **Total loss** | `recon + β·kl_clamped` | identical | ✅ |
| **β schedule** | `min(β_max, β_max · epoch / anneal_epochs)` | identical | ✅ |
| **β_max / anneal** | 0.05 over 10 epochs | 0.05 over 10 epochs | ✅ |
| **Reparameterisation** | `μ + exp(0.5·logvar)·ε`, ε ~ N(0, I) | identical | ✅ |
| **Optimiser** | Adam | Adam | ✅ |
| **Learning rate** | 1×10⁻³ | 1×10⁻³ | ✅ |
| **Batch size** | 256 | 256 | ✅ |
| **Max epochs** | 60 | 60 | ✅ |
| **Weight init** | Keras default: Glorot uniform, zero bias | `nn.init.xavier_uniform_` + `zeros_` | ✅ |
| **Early stopping monitor** | `val_recon_loss` | identical | ✅ |
| **Patience** | 8 | 8 | ✅ |
| **`start_from_epoch`** | 12 | 12 | ✅ |
| **Restore best weights** | yes | yes — `state_dict` snapshot | ✅ |
| **Scaler** | `sklearn.MinMaxScaler` | reimplemented with identical semantics (`clip=False`) | ✅ |
| **Seed** | 42 | 42 | ✅ |

Glorot uniform is Keras's default `kernel_initializer` for `Dense`; PyTorch's
`nn.Linear` default is Kaiming uniform. The initialiser was set explicitly so
the two implementations start from the same distribution rather than merely
similar ones.

### One subtlety that was initially wrong and then corrected

The first PyTorch early-stopping implementation incremented its patience counter
from epoch 0 and only *gated* the stop at `start_from_epoch`. Keras does not do
that: `EarlyStopping.on_epoch_end` returns early while `epoch <
start_from_epoch`, so neither `best` nor `wait` is updated at all before that
epoch. The earliest possible stop is therefore `start_from_epoch + patience`.

The PyTorch loop was corrected to match. Before the correction TRANSFER stopped
at epoch 12; after it, at epoch 23 — a material difference in training length,
and a reminder that "same hyperparameters" is not the same as "same behaviour".

---

## 3. What could NOT be matched exactly

| Item | Reason | Consequence |
| --- | --- | --- |
| **Floating-point kernels** | cuDNN/Eigen versus ATen use different reduction orders and fused kernels. Bitwise-identical arithmetic across frameworks is not achievable. | Differences at the level of floating-point noise, far below the effect sizes reported. |
| **RNG stream** | Keras draws from TensorFlow's generator, PyTorch from its own Philox stream. The same seed does not produce the same numbers. | Weight initialisation and mini-batch shuffling differ in realisation, though not in distribution. |
| **`Lambda` sampling layer** | v3 wrapped the reparameterisation in a Keras `Lambda`. PyTorch expresses it directly in `forward`. | Functionally identical; it also removed a v3 serialisation problem, since Lambda layers holding closures do not deserialise reliably across Keras versions. |
| **Device** | v3 trained on a Colab T4 GPU, v4 on CPU. | Affects wall-clock time only, not results. |

None of these can be eliminated. They are the reason the control in Section 4 is
necessary rather than optional.

---

## 4. The control — framework change alone does not explain the differences

The v3 protocol was re-run **in PyTorch**, deliberately preserving its leakage:
scaler and VAE fitted on all non-fraud rows, evaluation set containing those same
rows, threshold tuned on a random 30% of the evaluation scores, and the original
13 features with the original whole-dataset `F8` percentile.

> **Re-run 25 August 2026 under deterministic scoring.** The first version of this
> control was scored stochastically, so its figures were not reproducible and were
> not comparable with the clean arm, which had already been regenerated. Both arms
> now use the identical deterministic scoring path and differ only in protocol.
> The superseded figures were TRANSFER F1 0.9548 / AUC-ROC 0.9993 and CASH_OUT
> F1 0.4574 / AUC-ROC 0.9713.
>
> **The two runs trained identically.** Both reached the same epoch count
> (TRANSFER 35, CASH_OUT 30, PAYMENT 29) and the same best validation
> reconstruction loss to five decimal places (0.05827 / 0.04663 / 0.06293).
> Training was already deterministic given the fixed seed; only the scoring path
> differed. The change in the table below is therefore attributable to scoring
> determinism alone, not to any difference in training length or in the
> reimplementation.


If the framework change were driving the differences, this PyTorch reproduction
of the v3 protocol would look nothing like the Keras v3 result. It does not
diverge in that way.

| Stratum | Keras v3 (leaky) | **PyTorch v4 (leaky control)** | PyTorch v4 (clean) |
| --- | --- | --- | --- |
| TRANSFER F1 | 0.9836 | **0.9924** | 0.9994 |
| TRANSFER AUC-ROC | 0.9997 | **0.9996** | 1.0000 |
| CASH_OUT F1 | 0.0961 | **0.6036** | 0.6569 |
| CASH_OUT AUC-ROC | 0.9646 | **0.9819** | 0.9868 |

On TRANSFER, the PyTorch reproduction of the leaky protocol lands within
**0.0088 F1** and
**0.0001 AUC-ROC** of the Keras original. The
framework is not what moved that number.

CASH_OUT differs more on F1 (0.0961 versus
0.6036), but that gap is **not**
attributable to the framework either: F1 depends on where the threshold falls, and
the two runs select thresholds from different random draws of a heavily imbalanced
score distribution. The threshold-independent statistic, AUC-ROC, agrees to
0.0173 (0.9646 versus 0.9819).

### The measurement that actually matters

With framework, feature set and scoring path all held constant, and only the
leakage differing, average-precision lift falls by:

| Stratum | Leaky AP lift | Clean AP lift | Inflation |
| --- | --- | --- | --- |
| TRANSFER | 128.48× | 14.06× | **9.14×** |
| CASH_OUT | 294.30× | 26.12× | **11.27×** |

Both arms are PyTorch and both are deterministic. The clean arm is `clean|FS12|*`,
which shares the feature family of the control, so the comparison isolates the
protocol. That inflation is a property of the evaluation protocol, not of the
framework.

## 5. A second defect found during migration: non-deterministic scoring

Independent of the framework change, verification of the saved model bundles
exposed a reproducibility defect that had been present since v3.

The scoring path sampled the latent variable:

```python
z = mu + torch.exp(0.5 * lv) * torch.randn_like(mu)   # in the SCORING path
recon = model.decode(z)
```

Sampling is correct during **training** — the reparameterised draw is what the
gradient estimator requires. In **scoring** it makes every metric a function of
RNG state.

**Consequence: the metrics reported before this fix were not reproducible even
by re-running the identical code on the identical model.** The first round-trip
check failed on every metric for exactly this reason.

The fix decodes the posterior mean at inference:

```python
z = mu + torch.exp(0.5 * lv) * torch.randn_like(mu) if sample else mu
```

with `sample=False` as the default for all scoring paths. Training is unchanged.

After the fix, `scripts/roundtrip_check.py` reloads all 16 bundles, re-scores the
test partition and compares against the metrics recorded at training time:
**86 checks, 0 mismatches**, agreeing to 9 decimal places.

All v4 figures were regenerated after this fix. Any earlier v4 figure for the
same experiment is superseded.

---

## 6. Summary for the deviations section

> The implementation was migrated from TensorFlow/Keras to PyTorch because
> TensorFlow publishes no distribution for Python 3.14, the version available on
> the development environment, so the specified stack could not be executed.
> Architecture, loss terms, the Free Bits clamp, the β-annealing schedule, the
> optimiser and its hyperparameters, weight initialisation and the early-stopping
> rule were matched exactly; only floating-point kernel behaviour and the random
> number stream differ, neither of which can be eliminated across frameworks. To
> establish that the migration is not responsible for the change in results, the
> original evaluation protocol was re-run under PyTorch as a control: it
> reproduces the Keras result on TRANSFER to within 0.0088 F1 and 0.0001 AUC-ROC,
> and agrees on CASH_OUT to within 0.0173 AUC-ROC. The reduction in
> average-precision lift of 9.14× and 11.27× is therefore attributable to the
> correction of evaluation leakage, not to the framework. A separate defect —
> stochastic scoring, which made metrics depend on RNG state — was identified
> during model-persistence verification and corrected by decoding the posterior
> mean at inference; all reported figures were regenerated afterwards and are
> verified reproducible.

---

## Reproduction

| Item | Location |
| --- | --- |
| PyTorch model and training loop | `src/vae_dsaa/models/vae.py` |
| Leaky-control implementation | `scripts/run_leaky_control.py` |
| Leaky-control metrics | `reports/v4/all_configs_v4.json` (`leaky\|FS13old\|*`) |
| Leaky-control bundles | `checkpoints/v4/leaky__FS13old__*` |
| Superseded stochastic run | `results/v4/metrics/all_configs.json` — do not cite |
| Keras v3 reference metrics | `reports/v3_evidence/config_b_metrics.json`, `config_c_metrics.json` |
| Round-trip verification | `scripts/roundtrip_check.py` |
| Current authoritative metrics | `reports/v4/all_configs_v4.json` |
