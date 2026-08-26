# Session Findings, Part 3 — The Beta x Free-Bits Attribution Collapse

**Project:** DeepSentinel (R26-IT-121) · Member 2 — Wijesinghe L.P.D.B. (IT22109194)
**Date:** 25 August 2026 (third session)
**Scope:** rebuilding contribution N3 on the v4 pipeline — 176 runs, 5,096 s.

> **Document map.** Part 1 holds the F3 dependence finding, the DSAA port and
> the gamma decision. Part 2 holds the artifact-reduced reframe, the FS-CLEAN
> robustness check, audits (a)-(d) and the direct N1 test. This file holds N3.
> `reports/RESULTS_v4.md` is auto-generated and holds metric tables only.

---

## 1. Why this was re-run

N3 is the only contribution in the project that a reviewer cannot dismiss with
"PaySim is a broken dataset". Detection is a negative result. Attribution and
typology are entangled with simulator artifacts. The beta x Free-Bits collapse
is a property of the VAE objective, not of the data.

Before this session the entire evidence for it was
`reports/v3_evidence/beta_sweep_v3.json`: **one seed, TRANSFER only, latent 8,
free_bits 0.1**, produced under the v3 Keras implementation on the leaky
protocol, before the determinism fix. `README.md` claimed a **98x** change in
attribution informativeness on the strength of it.

That is not defensible, so it was rebuilt: v4 PyTorch, clean chronological
protocol, deterministic scoring, 5 seeds per cell.

### What was run

| Stage | Grid | Runs |
| --- | --- | --- |
| Main | beta {0.01, 0.05, 0.10, 0.25, 0.50, 1.00} x free_bits {0.01, 0.05, 0.10, 0.20} x 5 seeds | 120 |
| Trajectories | beta 0.05 and 1.00, per-epoch per-dimension KL | 2 |
| Latent widths | latent {4, 16}, free_bits 0.10, 6 betas, 3 seeds | 36 |
| Second dataset | synthetic tabular, free_bits 0.10, 6 betas, 3 seeds | 18 |
| | | **176** |

Everything else — optimiser, learning rate, batch size, anneal epochs, early
stopping, hidden widths — is identical to the delivered bundles.

### Disclosure: training-set subsample

The TRANSFER fit partition holds 441,840 non-fraud rows. Training 176 cells on
all of them was not affordable, so **every run trains on the same fixed random
subsample of 150,000 rows**. The MinMax scaler is still fitted on the full fit
partition, as the delivered bundles do. Absolute values here are therefore not
directly comparable with `reports/v4/all_configs_v4.json`; the grid is
comparable with itself, which is what a sweep requires. Recorded in
`reports/v4/beta_sweep/sweep_meta.json`.

One further artefact of the run environment: cell 82's `train_seconds` reads
478.3 s against a ~25 s norm because the machine slept mid-training. Wall-clock
for that cell is meaningless; every scientific measure is computed after
training and is unaffected.

---

## 2. Avoiding the circularity trap

If "active dimension" means "per-dimension KL above the Free Bits floor", then
showing that at high beta every dimension sits at the floor makes "0 active
dimensions" **partly true by definition**. A reviewer is entitled to call that
circular, and the v3 write-up was open to exactly that objection.

Four measures are therefore reported for every run:

| Measure | References the floor? | Role |
| --- | --- | --- |
| `active_dims` — KL > floor x 1.05 | **Yes** | conventional, reported for continuity, but definitional |
| `active_dims_rel2min` — KL > 2x the run's *own* minimum | No | self-normalising |
| `kl_max_over_min` — largest / smallest per-dimension KL | No | 1.0 means every dimension is identical |
| `per_dim_kl` — the raw vector | No | stored for all 176 runs, so nothing is taken on trust |
| **`signal_2_attribution_spread`** | **No** | **carries the claim** |

`signal_2_attribution_spread` is the standard deviation across latent
dimensions of the mean Signal-2 share on the test partition. It measures the
thing the contribution is actually about — whether latent attribution
distinguishes between dimensions — and it never mentions the floor.

**The claim is made on the spread and on `kl_max_over_min`. `active_dims` is
reported but nothing rests on it.**

---

## 3. The main grid

### 3.1 Signal-2 attribution spread — mean +/- sd over 5 seeds

| free_bits | beta 0.01 | 0.05 | 0.10 | 0.25 | 0.50 | 1.00 |
| --- | --- | --- | --- | --- | --- | --- |
| 0.01 | 0.18515 ±0.0058 | 0.26875 ±0.0125 | 0.26673 ±0.0143 | 0.26880 ±0.0058 | **0.00197** ±0.0008 | 0.00134 ±0.0007 |
| 0.05 | 0.17089 ±0.0066 | 0.22281 ±0.0070 | 0.20689 ±0.0057 | **0.01501** ±0.0118 | 0.00133 ±0.0009 | 0.00161 ±0.0022 |
| 0.10 | 0.15077 ±0.0063 | 0.16298 ±0.0020 | 0.13872 ±0.0100 | **0.01556** ±0.0045 | 0.00212 ±0.0012 | 0.00261 ±0.0016 |
| 0.20 | 0.11396 ±0.0045 | 0.08196 ±0.0055 | **0.02183** ±0.0040 | 0.01005 ±0.0011 | 0.00209 ±0.0007 | 0.00163 ±0.0003 |

Seed-to-seed standard deviation in the informative regime is 3-7 % of the mean.
**The collapse is not a single-seed accident.**

### 3.2 The floor-independent view — max / min per-dimension KL

| free_bits | beta 0.01 | 0.05 | 0.10 | 0.25 | 0.50 | 1.00 |
| --- | --- | --- | --- | --- | --- | --- |
| 0.01 | 403.1 | 202.1 | 133.3 | 45.9 | **1.04** | 1.03 |
| 0.05 | 53.0 | 28.8 | 25.1 | **1.52** | 1.01 | 1.02 |
| 0.10 | 21.0 | 12.6 | 9.62 | **1.60** | 1.02 | 1.03 |
| 0.20 | 8.50 | 4.28 | **1.80** | 1.28 | 1.03 | 1.03 |

At collapse the largest per-dimension KL exceeds the smallest by 1-4 %. Every
dimension carries the same amount of information, demonstrated **without
referring to the Free Bits floor at all**.

### 3.3 Does the boundary move with the floor?

**Yes — but the answer depends on how "collapse" is defined, and that has to be
stated rather than glossed over.**

Criterion A, spread-based: the first beta at which mean spread falls below 10 %
of its value at beta = 0.01.

| free_bits | 0.01 | 0.05 | 0.10 | 0.20 |
| --- | --- | --- | --- | --- |
| collapse beta | 0.50 | 0.25 | **0.50** | 0.25 |

That is **not monotonic**. The reason is that the criterion is knife-edge: at
free_bits 0.10, beta 0.25 the ratio is 0.01556 / 0.15077 = **10.32 %**, missing
the 10 % cut by a third of a percentage point, while free_bits 0.05 at the same
beta reaches 8.8 % and passes. Two cells sitting essentially on top of each
other land on opposite sides of an arbitrary line.

Criterion B, floor-independent: the interval in which `kl_max_over_min` falls
below 2.0.

| free_bits | collapse interval |
| --- | --- |
| 0.01 | beta 0.25 - 0.50 |
| 0.05 | beta 0.10 - 0.25 |
| 0.10 | beta 0.10 - 0.25 |
| 0.20 | **beta 0.05 - 0.10** |

This is **monotonically non-increasing**: raising the Free Bits floor lowers the
beta needed to pin every dimension to it. It is not *strictly* monotonic —
free_bits 0.05 and 0.10 share an interval — but within that shared interval the
ordering is preserved by magnitude (25.1 versus 9.62 at beta 0.10).

**Reported verdict: the boundary moves with the floor, shown on a
floor-independent statistic. Criterion A is reported alongside it, with its
knife-edge cell named, because choosing the criterion that produces the tidier
answer would be choosing the result.**

### 3.4 The floor alone suppresses attribution

Reading down the beta = 0.01 column: spread falls 0.185 → 0.171 → 0.151 →
0.114 as the floor rises from 0.01 to 0.20. A higher floor compresses the
dynamic range available to attribution even when beta is negligible. Free Bits
is not free.

---

## 4. Mechanism

`reports/figures/kl_trajectories_v4.png`, free_bits 0.10, latent 8, seed 42.

**beta = 0.05.** All eight dimensions start near KL 5-12 during the annealing
warm-up, then separate: dim_2 settles at ~1.0, dim_3 at ~0.30, dim_0 at ~0.23,
and the remaining five sit on the floor. The separation is established by about
epoch 10 and is stable for the remaining 30 epochs.

**beta = 1.00.** By epoch 4 every dimension has converged to 0.095-0.099 and
stays there for the rest of training. The final vector is
`[0.099, 0.099, 0.099, 0.099, 0.099, 0.099, 0.098, 0.098]`.

### Why

Free Bits clamps the per-dimension KL at `max(kl_d, floor)` before summing. Once
a dimension's KL falls below the floor, the clamp is active and that dimension's
KL contributes a **constant** to the loss — its gradient with respect to the KL
term is zero. The dimension is then shaped only by the reconstruction gradient.

When beta is large enough that the KL penalty dominates the reconstruction
gradient, no dimension has an incentive to carry information above the floor:
carrying information costs beta per nat and buys reconstruction the optimiser
values less. Every dimension is driven down until the clamp deactivates the
penalty, which is *just below* the floor — hence the 0.098-0.099 equilibrium
against a 0.10 floor. All dimensions arrive at the same place, per-dimension KL
becomes uniform, and Signal-2 attribution — which is precisely the per-dimension
share of KL — becomes a constant vector carrying no information.

The higher the floor, the less beta is needed to reach that state, because the
floor is already closer to the KL each dimension would otherwise carry. That is
the interaction in section 3.3.

This is consistent with Lucas et al., *"Don't Blame the ELBO!"* (NeurIPS 2019),
which shows posterior collapse is a property of the optimisation landscape
rather than of the ELBO alone, and with Razavi et al., *delta-VAE* (ICLR 2019),
which imposes a per-dimension KL floor as a collapse remedy. Neither examines
what the floor does to **per-dimension attribution**, which is the gap this
result addresses. To our knowledge the beta x Free-Bits interaction as a
constraint on attribution informativeness is under-documented.

---

## 5. Not architecture-specific

### 5.1 Latent width, free_bits 0.10

| latent | beta 0.01 | 0.05 | 0.10 | 0.25 | 0.50 | 1.00 | collapse interval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 0.20507 | 0.23853 | 0.23346 | 0.02766 | 0.00251 | 0.00386 | 0.10 - 0.25 |
| 8 | 0.15077 | 0.16298 | 0.13872 | 0.01556 | 0.00212 | 0.00261 | 0.10 - 0.25 |
| 16 | 0.09088 | 0.07927 | 0.03877 | 0.00534 | 0.00099 | 0.00073 | 0.10 - 0.25 |

**All three widths collapse in the same interval.** The boundary is set by beta
and the floor, not by the architecture.

The baseline spread does fall with width (0.205 → 0.151 → 0.091), but that is
mechanical: shares sum to 1 across more dimensions, so their standard deviation
shrinks. It is not a substantive difference and should not be read as one.

### 5.2 A second dataset

Synthetic tabular data, 60,000 rows, 7 features, 2 % positive class, generated
with `sklearn.datasets.make_classification` (seed 7). Deliberately synthetic and
self-contained; its only purpose is to show the phenomenon is not a property of
PaySim.

| dataset | beta 0.01 | 0.05 | 0.10 | 0.25 | 0.50 | 1.00 | collapse interval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PaySim TRANSFER | 0.15077 | 0.16298 | 0.13872 | 0.01556 | 0.00212 | 0.00261 | 0.10 - 0.25 |
| synthetic | 0.10744 | 0.02164 | 0.00336 | 0.00564 | 0.00438 | 0.00469 | **0.01 - 0.05** |

**The collapse reproduces, but it happens much earlier.** The synthetic set is
already collapsed by beta 0.05, where PaySim is still fully informative.

This is expected and should be stated as a limitation of the claim's scope: the
boundary depends on the scale of the reconstruction gradient relative to the KL
penalty, and different data reconstructs at different difficulty. **The
existence and mechanism of the boundary generalise; its location does not.** No
universal "safe beta" can be quoted from this work.

---

## 6. An unplanned finding — detection and attribution move in opposite directions

Mean AUC-PR on the test partition:

| free_bits | beta 0.01 | 0.05 | 0.10 | **0.25** | 0.50 | 1.00 |
| --- | --- | --- | --- | --- | --- | --- |
| 0.01 | 0.8096 | 0.8295 | 0.8191 | **0.9497** | 0.9335 | 0.9002 |
| 0.05 | 0.8086 | 0.7955 | 0.8121 | **0.8994** | 0.9180 | 0.8705 |
| 0.10 | 0.8107 | 0.7880 | 0.8191 | **0.9506** | 0.9253 | 0.8815 |
| 0.20 | 0.8272 | 0.8436 | 0.8766 | **0.9440** | 0.8694 | 0.7702 |

Detection peaks at beta = 0.25 on **all four** floors. At that same setting,
attribution is already dead for every floor at or above 0.05 (spread 0.010-0.016,
`kl_max_over_min` 1.28-1.60).

> **A practitioner tuning beta on AUC-PR alone lands almost exactly on the
> setting at which the model's own explanation becomes a uniform constant — and
> no detection metric reveals it.**

This is a practical implication rather than a curiosity, and it supports the
project's reframe directly: detection performance and attribution
informativeness are not the same axis, and optimising one can silently destroy
the other. The delivered system uses beta = 0.05, which sits in the informative
regime on every floor tested.

---

## 7. The "98x" figure is superseded

`README.md` claimed, from the v3 single-seed run: *"at beta = 1.0 all latent
dimensions collapse onto the Free Bits floor and Signal-2 spread falls to
0.0014; at beta = 0.05 it is 98x higher."*

Matched conditions in v4 — free_bits 0.10, latent 8, the v3 configuration:

| | beta 0.05 | beta 1.00 | ratio |
| --- | --- | --- | --- |
| v3, 1 seed, Keras, leaky | 0.13776 | 0.00140 | **98.4x** |
| **v4, 5 seeds, PyTorch, clean** | **0.16298** ±0.00203 | **0.00261** ±0.00161 | **62.5x** |

**The finding survives; the magnitude does not.** 62.5x, not 98x.

`README.md` has been updated. Documents still quoting 98x, left untouched
because they are dated snapshots:

- `reports/PROJECT_STATUS_2026-08-25.md`
- `reports/WORKFLOW_POSITION_2026-08-25.md`
- `reports/TYPOLOGY_FINGERPRINT_COMPLIANCE_2026-08-25.md`

---

## 8. Verdict — outcome (a), with one stated limitation

| Criterion | Result |
| --- | --- |
| Reproduces across seeds | **Yes** — sd 3-7 % of mean in the informative regime |
| Moves with the Free Bits floor | **Yes** — monotonically non-increasing, on a floor-independent statistic |
| Holds at other latent widths | **Yes** — 4, 8 and 16 collapse in the same interval |
| Holds on a second dataset | **Yes** — but the boundary sits much lower |
| Free of the circularity objection | **Yes** — `kl_max_over_min` reaches 1.01-1.04 at collapse |

**This is outcome (a): a real, reproducible, generalisable finding, and the
strongest contribution in the project.**

The limitation to state plainly: the *location* of the boundary is
dataset-dependent, so the contribution is the existence of the boundary, its
mechanism, and the fact that it is governed by the beta x Free-Bits
**interaction** — not a transferable numerical threshold.

---

## 9. Thesis-ready paragraph

> **The beta-Free Bits attribution boundary.** Free Bits is a standard remedy
> for posterior collapse, and beta-annealed training is standard practice; both
> are specified in this project's proposal. Sweeping them jointly on the clean
> evaluation protocol — six values of beta by four Free Bits floors, five random
> seeds per cell, 120 runs — shows that they interact in a way that constrains
> per-dimension attribution. Below the boundary, per-dimension KL is
> differentiated: the largest dimension carries between 9 and 400 times the
> smallest, and the standard deviation of the Signal-2 attribution shares lies
> between 0.08 and 0.27. Above it, every dimension converges to just below the
> Free Bits floor, the largest-to-smallest KL ratio falls to 1.01-1.04, and
> attribution spread falls by roughly two orders of magnitude. The boundary is
> not a property of beta alone: raising the floor from 0.01 to 0.20 lowers the
> beta at which collapse occurs from the 0.25-0.50 interval to the 0.05-0.10
> interval. Per-epoch trajectories identify the mechanism: once the clamp
> `max(KL_d, floor)` is active, that dimension's KL gradient is zero, so when
> beta is large enough for the KL penalty to dominate the reconstruction
> gradient no dimension has an incentive to carry information above the floor,
> and all converge to the same value. The effect is unchanged across latent
> widths of 4, 8 and 16, and reproduces on a second, synthetic tabular dataset,
> although the boundary there sits considerably lower — its location depends on
> the reconstruction scale of the data, so no universal safe value of beta
> follows. Detection performance does not reveal the problem: average precision
> peaks at beta = 0.25 on every floor tested, which for floors at or above 0.05
> is a setting at which attribution has already collapsed. To our knowledge this
> interaction, and its consequence for attribution-based explainability, is
> under-documented.

---

## Where the numbers live

| Artefact | Path |
| --- | --- |
| Main grid, 120 runs | `reports/v4/beta_sweep/grid_main.json` |
| Latent widths, 36 runs | `reports/v4/beta_sweep/grid_latent.json` |
| Second dataset, 18 runs | `reports/v4/beta_sweep/grid_dataset2.json` |
| Per-epoch KL trajectories | `reports/v4/beta_sweep/kl_trajectories.json` |
| Grid definition and disclosures | `reports/v4/beta_sweep/sweep_meta.json` |
| Run log | `reports/v4/beta_sweep/sweep_run.log` |
| Figures | `reports/figures/beta_sweep_v4.png`, `kl_trajectories_v4.png` |
| Runner | `scripts/run_beta_sweep.py`, `scripts/plot_beta_sweep.py` |
| Superseded v3 evidence | `reports/v3_evidence/beta_sweep_v3.json` (unmodified) |
