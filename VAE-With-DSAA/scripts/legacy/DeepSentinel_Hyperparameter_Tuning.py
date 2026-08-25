# ============================================================
# DeepSentinel — VAE-With-DSAA
# Stage 5: Hyperparameter Tuning with Optuna
# ============================================================
# This notebook performs automated hyperparameter optimization
# on the per-type VAEs using Optuna's Tree-Structured Parzen
# Estimator (TPE) sampler.
#
# Why this notebook:
#   The base Stratified VAE (Notebook 04) uses manually selected
#   hyperparameters. This notebook searches over a defined space
#   to find configurations that maximise F2-score (recall-weighted)
#   on a held-out validation sample.
#
# Targets to tune:
#   - hidden_1, hidden_2, latent_dim (architecture)
#   - learning_rate (optimization)
#   - free_bits_lambda (KL collapse prevention)
#   - alpha (recon weight in hybrid score)
#
# Workflow:
#   1. Load preprocessed data for ONE transaction type
#   2. Run Optuna study (30 trials, ~3-5 min each)
#   3. Train final VAE with best hyperparameters
#   4. Evaluate on full test set, compare to untuned baseline
#   5. Save tuned models + best params to Drive
#
# REQUIRES: 01_Feature_Engineering already run (CSVs in _v2 folder)
# RUNTIME:  T4 GPU, 2-4 hours per type for 30 trials
# ============================================================

# ============================================================
# CELL 1: Install & Import Libraries
# ============================================================
!pip install optuna kagglehub -q

import optuna
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import json
import time
import os
import pickle

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, Model

from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import (
    f1_score, fbeta_score, roc_auc_score,
    precision_score, recall_score, precision_recall_curve
)

# Reduce optuna's logging noise
optuna.logging.set_verbosity(optuna.logging.WARNING)

print(f"TensorFlow: {tf.__version__}")
print(f"Optuna:     {optuna.__version__}")
print(f"GPU:        {tf.config.list_physical_devices('GPU')}")
print("All libraries loaded successfully!")

# ============================================================
# CELL 2: Mount Drive and Set Paths
# ============================================================
from google.colab import drive
drive.mount('/content/drive')

output_dir  = '/content/drive/MyDrive/DeepSentinel/DeepSentinel_Output_v2'
results_dir = '/content/drive/MyDrive/DeepSentinel/DeepSentinel_Results_v2'
tuning_dir  = '/content/drive/MyDrive/DeepSentinel/DeepSentinel_Tuning_v2'
os.makedirs(tuning_dir, exist_ok=True)

# Feature columns — must match Feature Engineering output
feature_cols = ['F1_log_amount', 'F2_amount_balance_ratio', 'F3_balance_consistency',
                'F4_balance_change_ratio', 'F5_dest_balance_ratio', 'F6_hour',
                'F7_day', 'F8_is_large',
                'F9_dest_starts_empty', 'F10_recipient_emptied',
                'F11_account_velocity', 'F12_round_amount', 'F13_zero_dest_history']
N_FEAT = len(feature_cols)  # 13

# ============================================================
# CELL 3: Choose Which Transaction Type to Tune
# ============================================================
# Recommendation: tune CASH_OUT first (weakest in the baseline).
# After CASH_OUT, you can re-run this notebook with TYPE_TO_TUNE='TRANSFER'.
# PAYMENT has zero fraud — tuning it produces no useful signal.

TYPE_TO_TUNE = 'CASH_OUT'   # Options: 'CASH_OUT' or 'TRANSFER'

# Untuned baseline F1 from 04_Stratified_VAE — used for comparison report
BASELINE_F1 = {'CASH_OUT': 0.2827, 'TRANSFER': 0.6476}

print(f"=" * 60)
print(f"TUNING TARGET: {TYPE_TO_TUNE}")
print(f"=" * 60)
print(f"Baseline F1 (untuned): {BASELINE_F1[TYPE_TO_TUNE]:.4f}")

# Load data for the chosen type
type_normal = pd.read_csv(f'{output_dir}/{TYPE_TO_TUNE}_normal_features.csv')
type_all    = pd.read_csv(f'{output_dir}/{TYPE_TO_TUNE}_all_features.csv')

print(f"\nData loaded for {TYPE_TO_TUNE}:")
print(f"  Normal transactions: {len(type_normal):,}")
print(f"  All transactions:    {len(type_all):,}")
print(f"  Fraud transactions:  {type_all['isFraud'].sum():,}")

# ============================================================
# CELL 4: Prepare Train / Val / Eval-Sample Splits
# ============================================================
# Strategy:
#   - Fit scaler on normal data only (no leakage)
#   - 80/20 split of normal data for VAE training/validation
#   - Sample 50K transactions from the full evaluation set
#     (used inside Optuna trials — too slow to evaluate on full data)
#   - Final model evaluation uses the FULL eval set (Cell 10)

scaler = MinMaxScaler()
X_train_full = scaler.fit_transform(type_normal[feature_cols].values)
X_eval_all   = scaler.transform(type_all[feature_cols].values)
y_eval_all   = type_all['isFraud'].values

# Train/val split for VAE (80/20 of normal-only data)
n_train     = int(0.8 * len(X_train_full))
X_train_vae = X_train_full[:n_train]
X_val_vae   = X_train_full[n_train:]

# Per-trial evaluation sample (50K txns max — keeps trials fast)
np.random.seed(42)
sample_size = min(50000, len(X_eval_all))
sample_idx  = np.random.choice(len(X_eval_all), size=sample_size, replace=False)
X_eval_sample = X_eval_all[sample_idx]
y_eval_sample = y_eval_all[sample_idx]

print(f"\nSplits prepared:")
print(f"  VAE train set:    {X_train_vae.shape[0]:,}")
print(f"  VAE val set:      {X_val_vae.shape[0]:,}")
print(f"  Eval sample (per trial): {len(X_eval_sample):,} "
      f"({y_eval_sample.sum()} fraud)")
print(f"  Eval full (final): {len(X_eval_all):,} "
      f"({y_eval_all.sum()} fraud)")

# Save scaler for downstream use
with open(f'{tuning_dir}/scaler_{TYPE_TO_TUNE.lower()}.pkl', 'wb') as f:
    pickle.dump(scaler, f)

# ============================================================
# CELL 5: VAE Builder Function (parameterised by hyperparameters)
# ============================================================
# Single function that builds a VAE with arbitrary architecture +
# hyperparameters. Called once per Optuna trial.
# ============================================================

def build_vae(input_dim, hidden_1, hidden_2, latent_dim,
              free_bits, learning_rate):
    """Build a VAE with the given hyperparameters.

    Returns:
        vae:     compiled VAE Model
        encoder: encoder Model with outputs (z_mean, z_log_var, z)
        decoder: decoder Model
    """

    # --- Encoder ---
    enc_input = keras.Input(shape=(input_dim,))
    x = layers.Dense(hidden_1, activation='relu')(enc_input)
    x = layers.Dense(hidden_2, activation='relu')(x)
    z_mean    = layers.Dense(latent_dim, name='z_mean')(x)
    z_log_var = layers.Dense(latent_dim, name='z_log_var')(x)

    def sampling(args):
        zm, zlv = args
        eps = tf.random.normal(shape=tf.shape(zm))
        return zm + tf.exp(0.5 * zlv) * eps

    z = layers.Lambda(sampling)([z_mean, z_log_var])
    encoder = Model(enc_input, [z_mean, z_log_var, z])

    # --- Decoder ---
    dec_input  = keras.Input(shape=(latent_dim,))
    x = layers.Dense(hidden_2, activation='relu')(dec_input)
    x = layers.Dense(hidden_1, activation='relu')(x)
    dec_output = layers.Dense(input_dim, activation='sigmoid')(x)
    decoder = Model(dec_input, dec_output)

    # --- VAE wrapper with custom training step ---
    class VAE(Model):
        def __init__(self, enc, dec, free_bits):
            super().__init__()
            self.enc = enc
            self.dec = dec
            self.fb  = float(free_bits)
            self.beta = tf.Variable(0.0, trainable=False)

        def train_step(self, data):
            x = data if not isinstance(data, tuple) else data[0]
            with tf.GradientTape() as tape:
                zm, zlv, z = self.enc(x)
                recon = self.dec(z)
                recon_loss = tf.reduce_mean(tf.reduce_sum(tf.square(x - recon), axis=1))
                kl_per_dim = -0.5 * (1 + zlv - tf.square(zm) - tf.exp(zlv))
                kl_clamped = tf.maximum(kl_per_dim, self.fb)
                kl_loss    = tf.reduce_mean(tf.reduce_sum(kl_clamped, axis=1))
                total_loss = recon_loss + self.beta * kl_loss
            grads = tape.gradient(total_loss, self.trainable_weights)
            self.optimizer.apply_gradients(zip(grads, self.trainable_weights))
            return {'loss': total_loss, 'recon': recon_loss, 'kl': kl_loss}

        def test_step(self, data):
            x = data if not isinstance(data, tuple) else data[0]
            zm, zlv, z = self.enc(x)
            recon = self.dec(z)
            recon_loss = tf.reduce_mean(tf.reduce_sum(tf.square(x - recon), axis=1))
            kl_per_dim = -0.5 * (1 + zlv - tf.square(zm) - tf.exp(zlv))
            kl_clamped = tf.maximum(kl_per_dim, self.fb)
            kl_loss    = tf.reduce_mean(tf.reduce_sum(kl_clamped, axis=1))
            total_loss = recon_loss + self.beta * kl_loss
            return {'loss': total_loss}

    vae = VAE(encoder, decoder, free_bits)
    vae.compile(optimizer=keras.optimizers.Adam(learning_rate=learning_rate))
    return vae, encoder, decoder


# Beta annealing callback (linear ramp from 0 → 1 over 10 epochs)
class BetaAnneal(keras.callbacks.Callback):
    def __init__(self, anneal_epochs=10):
        super().__init__()
        self.anneal_epochs = anneal_epochs
    def on_epoch_begin(self, epoch, logs=None):
        new_beta = min(1.0, epoch / self.anneal_epochs)
        self.model.beta.assign(new_beta)


print("VAE builder ready.")

# ============================================================
# CELL 6: Anomaly Score + F2 Threshold Helper Functions
# ============================================================

def compute_anomaly_score(encoder, decoder, X, alpha):
    """Compute hybrid anomaly score: alpha * recon + (1-alpha) * KL,
    z-score normalised."""
    zm, zlv, z = encoder.predict(X, batch_size=512, verbose=0)
    recon = decoder.predict(z, batch_size=512, verbose=0)
    recon_err = np.sum((X - recon) ** 2, axis=1)
    kl_div    = np.sum(-0.5 * (1 + zlv - zm**2 - np.exp(zlv)), axis=1)

    re_norm = (recon_err - recon_err.mean()) / (recon_err.std() + 1e-8)
    kl_norm = (kl_div    - kl_div.mean())    / (kl_div.std()    + 1e-8)
    return alpha * re_norm + (1 - alpha) * kl_norm


def best_f2_score(scores, y_true):
    """Find F2-optimal threshold and return the F2 score."""
    if y_true.sum() == 0:
        return 0.0, None
    precs, recs, ths = precision_recall_curve(y_true, scores)
    # F-beta with beta=2 (recall-weighted)
    f2 = (1 + 4) * (precs * recs) / (4 * precs + recs + 1e-8)
    # ths array is one shorter than precs/recs
    best_idx = int(np.argmax(f2[:-1]))
    return float(f2[best_idx]), float(ths[best_idx])


# ============================================================
# CELL 7: Optuna Objective Function (the core of tuning)
# ============================================================
# Each trial:
#   1. Sample hyperparameters from the search space
#   2. Build a VAE with those params
#   3. Train for up to 10 epochs (short, with EarlyStopping)
#   4. Compute anomaly scores on the eval sample
#   5. Find the F2-optimal threshold and return F2-score
# ============================================================

def objective(trial):
    # -- Sample hyperparameters --
    hidden_1   = trial.suggest_categorical('hidden_1',   [32, 64, 128])
    hidden_2   = trial.suggest_categorical('hidden_2',   [16, 32, 64])
    latent_dim = trial.suggest_categorical('latent_dim', [8, 16, 24, 32])
    learning_rate = trial.suggest_float('learning_rate', 1e-4, 1e-3, log=True)
    free_bits  = trial.suggest_float('free_bits',  0.001, 0.1, log=True)
    alpha      = trial.suggest_float('alpha', 0.3, 0.7)

    # Skip nonsensical configs (hidden_2 must be smaller than hidden_1)
    if hidden_2 >= hidden_1:
        raise optuna.TrialPruned()

    # -- Build VAE --
    vae, enc, dec = build_vae(
        input_dim=N_FEAT,
        hidden_1=hidden_1,
        hidden_2=hidden_2,
        latent_dim=latent_dim,
        free_bits=free_bits,
        learning_rate=learning_rate,
    )

    # -- Train (short — 10 epochs with early stopping) --
    try:
        vae.fit(
            X_train_vae, X_train_vae,
            validation_data=(X_val_vae, X_val_vae),
            epochs=10,
            batch_size=256,
            verbose=0,
            callbacks=[
                BetaAnneal(anneal_epochs=5),
                keras.callbacks.EarlyStopping(monitor='val_loss',
                                              patience=3, mode='min'),
            ],
        )
    except Exception as e:
        # NaN loss / OOM / etc. — let Optuna treat as a failed trial
        print(f"  Trial {trial.number} failed during training: {e}")
        raise optuna.TrialPruned()

    # -- Evaluate on the eval sample --
    scores = compute_anomaly_score(enc, dec, X_eval_sample, alpha)
    f2, threshold = best_f2_score(scores, y_eval_sample)

    # Pruning hook (Optuna can stop poor trials early in multi-step setups)
    trial.report(f2, step=10)
    if trial.should_prune():
        raise optuna.TrialPruned()

    return f2


print("Objective function ready.")

# ============================================================
# CELL 8: Run the Optuna Study
# ============================================================
# 30 trials with TPE sampler (smarter than random, learns from previous trials).
# MedianPruner stops trials that fall below the median of completed ones.
#
# Expected runtime per trial: 2-3 minutes on T4 GPU
# Expected total: 60-90 minutes for 30 trials
# (Pruner cuts this down — bad trials stop early.)
# ============================================================

N_TRIALS = 30  # Reduce to 15 if time-constrained

study = optuna.create_study(
    direction='maximize',
    sampler=optuna.samplers.TPESampler(seed=42, n_startup_trials=5),
    pruner=optuna.pruners.MedianPruner(n_startup_trials=5, n_warmup_steps=5),
    study_name=f'vae_{TYPE_TO_TUNE.lower()}_tuning',
)

print("=" * 60)
print(f"OPTUNA STUDY — Tuning {TYPE_TO_TUNE} VAE for {N_TRIALS} trials")
print("=" * 60)
print("Search space:")
print("  hidden_1      : [32, 64, 128]")
print("  hidden_2      : [16, 32, 64]")
print("  latent_dim    : [8, 16, 24, 32]")
print("  learning_rate : [1e-4, 1e-3] (log)")
print("  free_bits     : [0.001, 0.1] (log)")
print("  alpha         : [0.3, 0.7]")
print()

start = time.time()
study.optimize(objective, n_trials=N_TRIALS, show_progress_bar=True)
elapsed_min = (time.time() - start) / 60

print(f"\nStudy complete in {elapsed_min:.1f} minutes")
print(f"  Trials completed: {len([t for t in study.trials if t.value is not None])}")
print(f"  Trials pruned:    {len([t for t in study.trials if t.state == optuna.trial.TrialState.PRUNED])}")
print(f"\n  Best F2-score:   {study.best_value:.4f}")
print(f"  Best hyperparameters:")
for k, v in study.best_params.items():
    print(f"    {k}: {v}")

# ============================================================
# CELL 9: Save Study Results + Visualisations
# ============================================================
print("=" * 60)
print("SAVING STUDY ARTEFACTS")
print("=" * 60)

# 1. Save best params as JSON
best_params_path = f'{tuning_dir}/best_params_{TYPE_TO_TUNE.lower()}.json'
with open(best_params_path, 'w') as f:
    json.dump({
        'type': TYPE_TO_TUNE,
        'best_f2_score': float(study.best_value),
        'best_params':   study.best_params,
        'baseline_f1':   BASELINE_F1[TYPE_TO_TUNE],
        'n_trials':      N_TRIALS,
        'tuning_time_min': float(elapsed_min),
    }, f, indent=2)
print(f"  Best params saved to: {best_params_path}")

# 2. Save full trial dataframe
trials_df = study.trials_dataframe()
trials_csv = f'{tuning_dir}/trials_{TYPE_TO_TUNE.lower()}.csv'
trials_df.to_csv(trials_csv, index=False)
print(f"  Trial history saved to: {trials_csv}")

# 3. Visualisation: F2 progress + parameter importance
fig, axes = plt.subplots(1, 2, figsize=(15, 5))
fig.suptitle(f'{TYPE_TO_TUNE} VAE Hyperparameter Tuning',
             fontsize=14, fontweight='bold', color='#5f3dc4')

# Plot 1: F2 over trials
trial_values = [t.value for t in study.trials if t.value is not None]
running_best = np.maximum.accumulate(trial_values)
axes[0].plot(trial_values, 'o', color='#5f3dc4', alpha=0.5, label='Trial F2')
axes[0].plot(running_best, '-', color='#fa5252', linewidth=2, label='Best so far')
axes[0].axhline(y=BASELINE_F1[TYPE_TO_TUNE], color='#868e96', linestyle='--',
                label=f'Untuned baseline F1={BASELINE_F1[TYPE_TO_TUNE]:.3f}')
axes[0].set_xlabel('Trial number')
axes[0].set_ylabel('F2-Score')
axes[0].set_title('Tuning Progress')
axes[0].grid(True, alpha=0.3)
axes[0].legend()

# Plot 2: Parameter importance
try:
    importance = optuna.importance.get_param_importances(study)
    params  = list(importance.keys())
    weights = list(importance.values())
    axes[1].barh(params, weights, color='#5f3dc4')
    axes[1].set_xlabel('Importance')
    axes[1].set_title('Hyperparameter Importance (which params matter most)')
    axes[1].grid(True, alpha=0.3, axis='x')
except Exception as e:
    axes[1].text(0.5, 0.5, f'Importance plot unavailable\n{e}',
                 ha='center', va='center', transform=axes[1].transAxes)
    axes[1].set_axis_off()

plt.tight_layout()
plot_path = f'{tuning_dir}/tuning_progress_{TYPE_TO_TUNE.lower()}.png'
plt.savefig(plot_path, dpi=150, bbox_inches='tight')
plt.show()
print(f"  Tuning plot saved to: {plot_path}")

# ============================================================
# CELL 10: Train Final VAE with Best Hyperparameters
# ============================================================
# Now that we have the best params from the 10-epoch trials,
# retrain a final VAE for the FULL 50 epochs with EarlyStopping
# and save it for use in DSAA / dashboard / final report.
# ============================================================
print("=" * 60)
print(f"TRAINING FINAL TUNED {TYPE_TO_TUNE} VAE (50 epochs)")
print("=" * 60)

bp = study.best_params
print(f"Using best hyperparameters:")
for k, v in bp.items():
    print(f"  {k}: {v}")

final_vae, final_encoder, final_decoder = build_vae(
    input_dim=N_FEAT,
    hidden_1=bp['hidden_1'],
    hidden_2=bp['hidden_2'],
    latent_dim=bp['latent_dim'],
    free_bits=bp['free_bits'],
    learning_rate=bp['learning_rate'],
)

print("\nStarting full training...")
t0 = time.time()
final_history = final_vae.fit(
    X_train_vae, X_train_vae,
    validation_data=(X_val_vae, X_val_vae),
    epochs=50,
    batch_size=256,
    verbose=1,
    callbacks=[
        BetaAnneal(anneal_epochs=10),
        keras.callbacks.EarlyStopping(monitor='val_loss', patience=5, mode='min',
                                      restore_best_weights=True),
    ],
)
final_train_time = time.time() - t0
print(f"\nFinal training complete in {final_train_time/60:.1f} minutes "
      f"({len(final_history.history['loss'])} epochs)")

# Save tuned encoder + decoder
final_encoder.save(f'{tuning_dir}/vae_{TYPE_TO_TUNE.lower()}_encoder_tuned.keras')
final_decoder.save(f'{tuning_dir}/vae_{TYPE_TO_TUNE.lower()}_decoder_tuned.keras')
print(f"  Encoder saved: vae_{TYPE_TO_TUNE.lower()}_encoder_tuned.keras")
print(f"  Decoder saved: vae_{TYPE_TO_TUNE.lower()}_decoder_tuned.keras")

# ============================================================
# CELL 11: Final Evaluation on Full Test Set
# ============================================================
# This is the headline number — F1 on the FULL evaluation set
# with the F2-optimal threshold tuned on a 30% holdout.
# ============================================================
print("=" * 60)
print(f"FINAL EVALUATION — TUNED {TYPE_TO_TUNE} VAE")
print("=" * 60)

alpha_best = bp['alpha']

# Compute scores on full evaluation set
scores_full = compute_anomaly_score(final_encoder, final_decoder, X_eval_all, alpha_best)

# 30/70 split for threshold tuning vs reporting
np.random.seed(42)
n_eval   = len(scores_full)
tune_idx = np.random.choice(n_eval, size=int(0.3 * n_eval), replace=False)
test_idx = np.setdiff1d(np.arange(n_eval), tune_idx)

# Tune threshold on tune split
y_tune = y_eval_all[tune_idx]
s_tune = scores_full[tune_idx]
_, optimal_threshold = best_f2_score(s_tune, y_tune)
if optimal_threshold is None:
    # Fallback: mean + 3 std
    optimal_threshold = float(scores_full.mean() + 3 * scores_full.std())
    print("  (No fraud in tune set — using mean+3sigma fallback threshold)")

# Report metrics on test split
y_test = y_eval_all[test_idx]
s_test = scores_full[test_idx]
y_pred = (s_test >= optimal_threshold).astype(int)

precision = precision_score(y_test, y_pred, zero_division=0)
recall    = recall_score(y_test, y_pred, zero_division=0)
f1        = f1_score(y_test, y_pred, zero_division=0)
f2        = fbeta_score(y_test, y_pred, beta=2.0, zero_division=0)
auc       = roc_auc_score(y_test, s_test) if y_test.sum() > 0 else float('nan')

tn = int(((y_test == 0) & (y_pred == 0)).sum())
fp = int(((y_test == 0) & (y_pred == 1)).sum())
fn = int(((y_test == 1) & (y_pred == 0)).sum())
tp = int(((y_test == 1) & (y_pred == 1)).sum())
fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0

print(f"\nMetrics on test set ({len(test_idx):,} txns, {y_test.sum()} fraud):")
print(f"  Precision: {precision:.4f}")
print(f"  Recall:    {recall:.4f}")
print(f"  F1-Score:  {f1:.4f}")
print(f"  F2-Score:  {f2:.4f}")
print(f"  AUC-ROC:   {auc:.4f}")
print(f"  FPR:       {fpr:.4f}")
print(f"  Threshold: {optimal_threshold:.4f}")
print(f"\nConfusion matrix:")
print(f"  TP={tp}  FP={fp}")
print(f"  FN={fn}  TN={tn:,}")

# Save tuned metrics
tuned_metrics = {
    'config': f'TUNED-{TYPE_TO_TUNE}',
    'precision': float(precision),
    'recall':    float(recall),
    'f1_score':  float(f1),
    'f2_score':  float(f2),
    'auc_roc':   float(auc),
    'fpr':       float(fpr),
    'threshold': float(optimal_threshold),
    'tp': tp, 'fp': fp, 'tn': tn, 'fn': fn,
    'best_params': bp,
    'baseline_f1': BASELINE_F1[TYPE_TO_TUNE],
    'f1_improvement_abs': float(f1 - BASELINE_F1[TYPE_TO_TUNE]),
    'f1_improvement_pct': float((f1 - BASELINE_F1[TYPE_TO_TUNE]) /
                                 BASELINE_F1[TYPE_TO_TUNE] * 100),
    'final_train_time_seconds': float(final_train_time),
    'tuning_time_min': float(elapsed_min),
}
with open(f'{tuning_dir}/tuned_metrics_{TYPE_TO_TUNE.lower()}.json', 'w') as f:
    json.dump(tuned_metrics, f, indent=2)

# ============================================================
# CELL 12: Comparison — Untuned vs Tuned
# ============================================================
print("=" * 60)
print(f"COMPARISON — UNTUNED vs TUNED ({TYPE_TO_TUNE})")
print("=" * 60)
print(f"\n  {'Metric':<12} {'Untuned':>12} {'Tuned':>12} {'Delta':>10}")
print(f"  {'-'*48}")
delta_f1 = f1 - BASELINE_F1[TYPE_TO_TUNE]
print(f"  {'F1-Score':<12} {BASELINE_F1[TYPE_TO_TUNE]:>12.4f} {f1:>12.4f} {delta_f1:>+10.4f}")
print(f"  {'Improvement':<12} {'':>12} {'':>12} {(delta_f1 / BASELINE_F1[TYPE_TO_TUNE] * 100):>+9.1f}%")

if delta_f1 > 0:
    print(f"\n  ✅ Tuning improved F1 by {(delta_f1/BASELINE_F1[TYPE_TO_TUNE]*100):.1f}%")
else:
    print(f"\n  ⚠️  Tuning did not improve F1 — baseline hyperparameters were already strong.")
    print(f"     Try: more trials (N_TRIALS=50+), wider search space, or different metric.")

# ============================================================
# CELL 13: Diagnostic Report (text-only — copy this to share)
# ============================================================
print("\n" + "=" * 70)
print(f"DIAGNOSTIC REPORT — TUNED {TYPE_TO_TUNE} VAE")
print("=" * 70)

print("\n[1] STUDY HEALTH")
print(f"    Trials completed:      {len([t for t in study.trials if t.value is not None])}")
print(f"    Trials pruned:         {len([t for t in study.trials if t.state == optuna.trial.TrialState.PRUNED])}")
print(f"    Tuning time:           {elapsed_min:.1f} min")
print(f"    Final training time:   {final_train_time/60:.1f} min")

print("\n[2] BEST HYPERPARAMETERS")
for k, v in bp.items():
    if isinstance(v, float):
        print(f"    {k}: {v:.5f}")
    else:
        print(f"    {k}: {v}")

print("\n[3] METRICS — TEST SET")
print(f"    Precision: {precision:.4f}")
print(f"    Recall:    {recall:.4f}")
print(f"    F1-Score:  {f1:.4f}")
print(f"    F2-Score:  {f2:.4f}")
print(f"    AUC-ROC:   {auc:.4f}")
print(f"    FPR:       {fpr:.4f}")

print("\n[4] COMPARISON TO UNTUNED BASELINE")
print(f"    Untuned F1: {BASELINE_F1[TYPE_TO_TUNE]:.4f}")
print(f"    Tuned   F1: {f1:.4f}")
print(f"    Delta:      {delta_f1:+.4f} ({(delta_f1/BASELINE_F1[TYPE_TO_TUNE]*100):+.1f}%)")

print("\n[5] RECOMMENDATION")
if delta_f1 > 0.05:
    print(f"    -> Strong improvement. Use tuned params in 04_Stratified_VAE.")
    print(f"       Update ARCH dict for {TYPE_TO_TUNE} with the values in [2].")
elif delta_f1 > 0:
    print(f"    -> Modest improvement. Tuned params are usable but not transformative.")
    print(f"       Consider running 50+ trials or adding more hyperparameters to the search.")
else:
    print(f"    -> No improvement. Existing manual config was already strong.")
    print(f"       Try a different objective (F1 instead of F2) or wider search space.")

print("\n" + "=" * 70)
print("END OF DIAGNOSTIC REPORT — copy text from [1] to [5] to share.")
print("=" * 70)

# ============================================================
# CELL 14: Verify Files on Drive
# ============================================================
print("\nFiles saved to Drive:")
for f in sorted(os.listdir(tuning_dir)):
    size_kb = os.path.getsize(f'{tuning_dir}/{f}') / 1024
    print(f"  {f}  ({size_kb:.1f} KB)")

# ============================================================
# CELL 15: Final Summary
# ============================================================
print("\n" + "=" * 60)
print(f"HYPERPARAMETER TUNING — {TYPE_TO_TUNE} — COMPLETE!")
print("=" * 60)
print(f"""
Inputs:
  • {len(type_normal):,} normal {TYPE_TO_TUNE} transactions for VAE training
  • {len(type_all):,} {TYPE_TO_TUNE} transactions ({y_eval_all.sum()} fraud) for evaluation

Tuning:
  • {N_TRIALS} Optuna trials (TPE sampler + Median pruner)
  • Total tuning time: {elapsed_min:.1f} minutes
  • Best F2-score (per-trial sample): {study.best_value:.4f}

Final Tuned Model:
  • Architecture: {bp['hidden_1']}-{bp['hidden_2']}-latent({bp['latent_dim']})
  • Learning rate: {bp['learning_rate']:.5f}
  • Free bits: {bp['free_bits']:.5f}
  • Alpha (recon weight): {bp['alpha']:.3f}

Final Test Set Results:
  • F1-Score: {f1:.4f}  (was {BASELINE_F1[TYPE_TO_TUNE]:.4f}, {(delta_f1/BASELINE_F1[TYPE_TO_TUNE]*100):+.1f}%)
  • Recall:   {recall:.4f}
  • AUC-ROC:  {auc:.4f}

Files saved to: {tuning_dir}/
  • best_params_{TYPE_TO_TUNE.lower()}.json
  • trials_{TYPE_TO_TUNE.lower()}.csv
  • tuning_progress_{TYPE_TO_TUNE.lower()}.png
  • vae_{TYPE_TO_TUNE.lower()}_encoder_tuned.keras
  • vae_{TYPE_TO_TUNE.lower()}_decoder_tuned.keras
  • tuned_metrics_{TYPE_TO_TUNE.lower()}.json

Next steps:
  1. Re-run this notebook with TYPE_TO_TUNE='TRANSFER' to tune the other VAE
  2. Update ARCH dict in 04_Stratified_VAE.ipynb with these best params
  3. Re-run 04 to get the new Config D ensemble F1
  4. Update final report with tuned numbers + this diagnostic report
""")
