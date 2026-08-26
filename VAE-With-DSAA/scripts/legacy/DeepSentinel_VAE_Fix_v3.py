# ============================================================
# DeepSentinel — VAE-With-DSAA
# FIX PACK v3: correct the latent-space failure (D1 + D15)
# ============================================================
# WHAT THIS FIXES
#
#   Config A  : posterior collapse. kl_loss froze at 0.0847 from epoch 11
#               to epoch 50. Free Bits floor was 0.01 x 8 dims = 0.0800,
#               so KL sat pinned AT the clamp. Latent space encoded nothing.
#
#   Config B/C/D : the opposite. EarlyStopping monitored val_total_loss
#               (= recon + beta*KL) while BetaAnnealing ramped beta 0 -> 1,
#               so the monitored value had to rise. It stopped at epoch 6 and
#               restored epoch 1, where beta = 0. One epoch of plain
#               autoencoder. kl_mean 132.8 (TRANSFER) / 255.3 (CASH_OUT).
#
# THREE CHANGES — all three are needed. Fixing only the callback moves you
# from collapse-mode to no-regularisation-mode without solving anything.
#
#   1. FREE_BITS  0.01 -> 0.1     (0.01 is inert; it is a FLOOR, so lowering
#                                  it removed the protection, not added it)
#   2. BETA_MAX   1.0  -> swept    (beta=1 pushes every dim onto the floor,
#                                  which makes Signal 2 uniform and useless)
#   3. EarlyStopping monitors val_recon_loss, and not until annealing is done
#
# HOW TO USE IN COLAB
#   Replace CELL 4 of DeepSentinel_Stratified_VAE_v2.ipynb with CELL 4-FIXED
#   below, then run CELL 4b (health check) and CELL 4c (beta sweep) before
#   retraining the three production VAEs.
# ============================================================


# ============================================================
# CELL 4-FIXED: VAE architecture with working Free Bits + beta cap
# ============================================================
import numpy as np
import time
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, Model

INPUT_DIM = 13

ARCH = {
    'TRANSFER': {'hidden_1': 32, 'hidden_2': 16, 'latent_dim': 8},
    'CASH_OUT': {'hidden_1': 64, 'hidden_2': 32, 'latent_dim': 16},
    'PAYMENT':  {'hidden_1': 32, 'hidden_2': 16, 'latent_dim': 8},
}

# ---- the two hyperparameters that caused the failure ----
FREE_BITS = 0.1    # nats per latent dimension. Was 0.01 (inert).
BETA_MAX  = 0.05   # set by the sweep in CELL 4c. Was 1.0 (caused collapse).
ANNEAL_EPOCHS = 10


def build_vae(name="vae", arch=None, free_bits=FREE_BITS):
    """VAE with a working Free Bits floor.

    free_bits is a per-dimension FLOOR on KL. Where kl_per_dim < free_bits the
    gradient is zeroed, so the optimiser has no incentive to switch that
    dimension off. This is what prevents posterior collapse. Kingma et al.,
    NeurIPS 2016 (reference [9] in the proposal) use 0.5-2.0; on 13 MinMax
    features 0.1 leaves room for dims to sit meaningfully above the floor,
    which is what Signal 2 needs in order to discriminate.
    """
    if arch is None:
        arch = ARCH['TRANSFER']
    H1, H2, LD = arch['hidden_1'], arch['hidden_2'], arch['latent_dim']

    enc_input = keras.Input(shape=(INPUT_DIM,), name=f'{name}_enc_input')
    x = layers.Dense(H1, activation='relu', name=f'{name}_enc_h1')(enc_input)
    x = layers.Dense(H2, activation='relu', name=f'{name}_enc_h2')(x)
    z_mean    = layers.Dense(LD, name=f'{name}_z_mean')(x)
    z_log_var = layers.Dense(LD, name=f'{name}_z_log_var')(x)

    def sampling(args):
        zm, zlv = args
        eps = tf.random.normal(shape=(tf.shape(zm)[0], LD))
        return zm + tf.exp(0.5 * zlv) * eps

    z = layers.Lambda(sampling, output_shape=(LD,), name=f'{name}_z')([z_mean, z_log_var])
    encoder = Model(enc_input, [z_mean, z_log_var, z], name=f'{name}_encoder')

    dec_input = keras.Input(shape=(LD,), name=f'{name}_dec_input')
    x = layers.Dense(H2, activation='relu', name=f'{name}_dec_h1')(dec_input)
    x = layers.Dense(H1, activation='relu', name=f'{name}_dec_h2')(x)
    dec_output = layers.Dense(INPUT_DIM, activation='sigmoid', name=f'{name}_dec_out')(x)
    decoder = Model(dec_input, dec_output, name=f'{name}_decoder')

    class VAE(Model):
        def __init__(self, enc, dec, fb, **kwargs):
            super().__init__(**kwargs)
            self.encoder = enc
            self.decoder = dec
            self.free_bits = float(fb)
            self.total_loss_tracker = keras.metrics.Mean(name="total_loss")
            self.recon_loss_tracker = keras.metrics.Mean(name="recon_loss")
            self.kl_loss_tracker    = keras.metrics.Mean(name="kl_loss")
            # raw (unclamped) KL — the number that tells you if the latent
            # space is alive. kl_loss alone cannot, because the clamp hides it.
            self.kl_raw_tracker     = keras.metrics.Mean(name="kl_raw")
            self.beta = tf.Variable(0.0, trainable=False, name='beta')

        @property
        def metrics(self):
            return [self.total_loss_tracker, self.recon_loss_tracker,
                    self.kl_loss_tracker, self.kl_raw_tracker]

        def _compute_losses(self, data):
            z_mean, z_log_var, z = self.encoder(data)
            reconstruction = self.decoder(z)
            recon_loss = tf.reduce_mean(tf.reduce_sum(tf.square(data - reconstruction), axis=1))

            kl_per_dim = -0.5 * (1 + z_log_var - tf.square(z_mean) - tf.exp(z_log_var))
            kl_raw     = tf.reduce_mean(tf.reduce_sum(kl_per_dim, axis=1))
            kl_clamped = tf.maximum(kl_per_dim, self.free_bits)
            kl_loss    = tf.reduce_mean(tf.reduce_sum(kl_clamped, axis=1))

            total_loss = recon_loss + self.beta * kl_loss
            return total_loss, recon_loss, kl_loss, kl_raw

        def _update(self, total, recon, kl, kl_raw):
            self.total_loss_tracker.update_state(total)
            self.recon_loss_tracker.update_state(recon)
            self.kl_loss_tracker.update_state(kl)
            self.kl_raw_tracker.update_state(kl_raw)
            return {m.name: m.result() for m in self.metrics}

        def train_step(self, data):
            with tf.GradientTape() as tape:
                total, recon, kl, kl_raw = self._compute_losses(data)
            grads = tape.gradient(total, self.trainable_weights)
            self.optimizer.apply_gradients(zip(grads, self.trainable_weights))
            return self._update(total, recon, kl, kl_raw)

        def test_step(self, data):
            total, recon, kl, kl_raw = self._compute_losses(data)
            return self._update(total, recon, kl, kl_raw)

    vae = VAE(encoder, decoder, free_bits, name=name)
    vae.compile(optimizer=keras.optimizers.Adam(learning_rate=0.001))
    return vae


class BetaAnnealing(keras.callbacks.Callback):
    """Linear ramp 0 -> beta_max over anneal_epochs, then hold.

    beta_max is capped below 1.0 deliberately. At beta=1 the KL term drives
    every dimension down onto the Free Bits floor; all dims then carry an
    identical amount of information, Signal 2 becomes uniform (1/n per dim),
    and DSAA attribution stops discriminating. The floor prevents collapse;
    the cap preserves variation ABOVE the floor. Both are needed.
    """
    def __init__(self, vae_model, beta_max=BETA_MAX, anneal_epochs=ANNEAL_EPOCHS, verbose=True):
        super().__init__()
        self.vae_model = vae_model
        self.beta_max = beta_max
        self.anneal_epochs = anneal_epochs
        self.verbose = verbose

    def on_epoch_begin(self, epoch, logs=None):
        new_beta = min(self.beta_max, self.beta_max * epoch / self.anneal_epochs)
        self.vae_model.beta.assign(new_beta)
        if self.verbose and epoch <= self.anneal_epochs:
            print(f"    beta = {new_beta:.4f}")


def train_vae(vae, X_train, X_val, txn_type, epochs=60, batch_size=256,
              beta_max=BETA_MAX, verbose_beta=True):
    """Train with annealing + early stopping that cannot fight the annealer.

    monitor='val_recon_loss' NOT 'val_total_loss'. total_loss contains
    beta*KL, and beta rises every epoch during annealing, so total_loss rises
    by construction — that is what stopped the v2 run at epoch 6 and restored
    the beta=0 weights. Reconstruction loss carries no beta term, so it is a
    valid stopping signal throughout.

    start_from_epoch delays stopping until annealing has finished, so no
    decision is made while the objective is still changing shape.
    """
    print(f"\n  Training {txn_type} VAE — {X_train.shape[0]:,} samples, "
          f"free_bits={vae.free_bits}, beta_max={beta_max}")

    beta_cb = BetaAnnealing(vae, beta_max=beta_max, verbose=verbose_beta)
    early_stop = keras.callbacks.EarlyStopping(
        monitor='val_recon_loss',
        patience=8,
        mode='min',
        restore_best_weights=True,
        start_from_epoch=ANNEAL_EPOCHS + 2,
        verbose=1,
    )

    t0 = time.time()
    history = vae.fit(
        X_train, epochs=epochs, batch_size=batch_size,
        validation_data=X_val,
        callbacks=[beta_cb, early_stop], verbose=0,
    )
    elapsed = time.time() - t0
    n_epochs = len(history.history['total_loss'])
    print(f"  Done in {elapsed:.1f}s — ran {n_epochs} epochs "
          f"(v2 ran 6) — val_recon_loss {history.history['val_recon_loss'][-1]:.4f} "
          f"| val_kl_raw {history.history['val_kl_raw'][-1]:.3f}")
    return history, elapsed


# ============================================================
# CELL 4b: KL HEALTH CHECK — run this before trusting any result
# ============================================================
# This is your NFR3 evidence. The proposal states the pipeline shall prevent
# posterior collapse "with at least 98 percent reliability" — it is one of only
# two quantitative targets you set, and v2 fails it. Save this printout.
# ============================================================

def kl_health_report(vae, X_val, txn_type, free_bits=None):
    """Per-dimension KL diagnostics. Returns a dict for the report."""
    fb = vae.free_bits if free_bits is None else free_bits
    z_mean, z_log_var, _ = vae.encoder.predict(X_val, batch_size=1024, verbose=0)

    kl_per_dim  = -0.5 * (1 + z_log_var - z_mean**2 - np.exp(z_log_var))
    mean_by_dim = kl_per_dim.mean(axis=0)
    kl_total    = mean_by_dim.sum()

    # A dimension is "active" if it carries meaningfully more than the floor.
    active = int((mean_by_dim > fb * 1.5).sum())
    n_dim  = len(mean_by_dim)

    # Signal 2 as DSAA computes it: row-normalised, then spread across dims.
    s2 = np.maximum(kl_per_dim, 0.0)
    s2 = s2 / (s2.sum(axis=1, keepdims=True) + 1e-8)
    s2_std = float(s2.mean(axis=0).std())

    print(f"\n  {'=' * 58}")
    print(f"  KL HEALTH — {txn_type}   (free_bits floor = {fb})")
    print(f"  {'=' * 58}")
    print(f"    Total KL           : {kl_total:8.3f}   "
          f"(v2 was 132.8 / 255.3 — unregularised)")
    print(f"    KL per dimension   : {kl_total / n_dim:8.3f}   (healthy ~0.5-3)")
    print(f"    Active dimensions  : {active} / {n_dim}")
    print(f"    Signal-2 spread    : {s2_std:8.4f}   (>0.02 = informative)")
    print(f"\n    Per-dimension KL:")
    for i, v in enumerate(mean_by_dim):
        flag = "active" if v > fb * 1.5 else "AT FLOOR"
        bar  = '#' * min(40, int(v * 12))
        print(f"      dim_{i:<2} {v:7.4f}  {flag:<9} {bar}")

    collapsed = active == 0
    degraded  = active < n_dim * 0.5
    if collapsed:
        print(f"\n    FAIL — total posterior collapse. Lower beta_max.")
    elif degraded:
        print(f"\n    WARNING — under half the dimensions are active. "
              f"Lower beta_max or reduce latent_dim.")
    else:
        print(f"\n    PASS — latent space is alive. NFR3 satisfied.")

    return {
        'transaction_type': txn_type, 'free_bits': float(fb),
        'kl_total': float(kl_total), 'kl_per_dim': float(kl_total / n_dim),
        'active_dims': active, 'n_dims': int(n_dim),
        'signal_2_std': s2_std,
        'per_dim_kl': [float(v) for v in mean_by_dim],
        'verdict': 'FAIL' if collapsed else ('WARNING' if degraded else 'PASS'),
    }


# ============================================================
# CELL 4c: BETA SWEEP — turns the bug into a research contribution
# ============================================================
# Do not guess beta_max. Sweep it on TRANSFER only (~70s per run) and pick the
# value that keeps the latent space alive AND keeps Signal 2 discriminating.
#
# This produces a figure nobody in your cited literature has: the beta region
# in which native KL attribution becomes informative. You already own the
# beta=1.0 endpoint — that is the Config A collapse.
# ============================================================

def beta_sweep(X_train, X_val, arch, betas=(0.01, 0.05, 0.1, 0.3, 1.0),
               free_bits=FREE_BITS, epochs=25):
    """Train a short VAE per beta and record latent health + reconstruction."""
    rows = []
    for b in betas:
        print(f"\n{'=' * 60}\nBETA = {b}\n{'=' * 60}")
        vae = build_vae(f"sweep_b{str(b).replace('.', '')}", arch=arch, free_bits=free_bits)
        hist, _ = train_vae(vae, X_train, X_val, f"sweep(beta={b})",
                            epochs=epochs, beta_max=b, verbose_beta=False)
        h = kl_health_report(vae, X_val, f"beta={b}", free_bits=free_bits)
        h['beta_max'] = b
        h['val_recon_loss'] = float(hist.history['val_recon_loss'][-1])
        rows.append(h)

    print(f"\n\n{'=' * 78}")
    print("BETA SWEEP SUMMARY")
    print(f"{'=' * 78}")
    print(f"  {'beta':>6} {'KL total':>10} {'KL/dim':>8} {'active':>8} "
          f"{'S2 std':>9} {'val recon':>11}  verdict")
    print(f"  {'-' * 74}")
    for r in rows:
        print(f"  {r['beta_max']:>6} {r['kl_total']:>10.3f} {r['kl_per_dim']:>8.3f} "
              f"{r['active_dims']:>4}/{r['n_dims']:<3} {r['signal_2_std']:>9.4f} "
              f"{r['val_recon_loss']:>11.4f}  {r['verdict']}")
    print(f"\n  Choose the largest beta that still gives: active_dims >= 50% of dims")
    print(f"  AND signal_2_std > 0.02. That is your BETA_MAX for production.")
    return rows


# ============================================================
# CELL 4d: RETRAIN THE THREE PRODUCTION VAEs
# ============================================================
# Run only after the sweep has chosen BETA_MAX. Then rerun the rest of the
# v2 notebook unchanged (scoring, thresholds, save), and rerun the DSAA
# notebook — Signal 2 will change completely, and this time it means something.
# ============================================================
"""
BETA_MAX = <value chosen by CELL 4c>

vae_transfer = build_vae("vae_transfer", arch=ARCH['TRANSFER'])
hist_transfer, time_transfer = train_vae(vae_transfer, X_t_train, X_t_val,
                                         "TRANSFER", beta_max=BETA_MAX)

vae_cashout = build_vae("vae_cashout", arch=ARCH['CASH_OUT'])
hist_cashout, time_cashout = train_vae(vae_cashout, X_c_train, X_c_val,
                                       "CASH_OUT", beta_max=BETA_MAX)

vae_payment = build_vae("vae_payment", arch=ARCH['PAYMENT'])
hist_payment, time_payment = train_vae(vae_payment, X_p_train, X_p_val,
                                       "PAYMENT", beta_max=BETA_MAX)

import json
health = [kl_health_report(vae_transfer, X_t_val, 'TRANSFER'),
          kl_health_report(vae_cashout,  X_c_val, 'CASH_OUT'),
          kl_health_report(vae_payment,  X_p_val, 'PAYMENT')]
with open(f'{results_dir}/kl_health_v3.json', 'w') as f:
    json.dump(health, f, indent=2)
"""
