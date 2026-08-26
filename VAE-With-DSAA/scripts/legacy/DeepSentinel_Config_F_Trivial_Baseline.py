# ============================================================
# DeepSentinel — VAE-With-DSAA
# CONFIG F: F3-alone threshold classifier (no VAE) — trivial baseline
# ============================================================
# WHY THIS IS THE HIGHEST VALUE-PER-MINUTE WORK LEFT IN THE PROJECT
#
# Your own risk register names it: "PaySim fraud trivially detectable".
# The first question a panel asks is "isn't this just a balance check with
# extra steps?" Config F is the answer, and it takes five minutes.
#
#   EDA finding: 99.5% of fraud has F3 = 1, versus 25.4% of normal.
#   So F3 alone catches almost all fraud — but also flags ~1 in 4 normal
#   transactions. At 0.13% prevalence that means precision near 0.005.
#
# If that is what comes out, it is GOOD news: the trivial baseline is useless
# in practice, so the multi-dimensional model earns its place. But you need
# the number, and you need it before you write anything else.
#
# No VAE, no GPU. Runs on CPU in Colab or locally.
# ============================================================

# ============================================================
# CELL 1: Imports and paths
# ============================================================
import json
import numpy as np
import pandas as pd
from sklearn.metrics import (
    precision_score, recall_score, f1_score, fbeta_score,
    roc_auc_score, average_precision_score,
)

# Colab:
from google.colab import drive
drive.mount('/content/drive')
output_dir  = '/content/drive/MyDrive/DeepSentinel/DeepSentinel_Output_v2'
results_dir = '/content/drive/MyDrive/DeepSentinel/DeepSentinel_Results_v2'

# Local alternative:
# output_dir  = 'DeepSentinel-VAE-Results/DeepSentinel_Output_v2'
# results_dir = 'DeepSentinel-VAE-Results/DeepSentinel_Results_v2'

F3 = 'F3_balance_consistency'


# ============================================================
# CELL 2: Reproduce the EXACT split used by Configs B, C, D
# ============================================================
# Non-negotiable for comparability. tune_threshold() in the Stratified VAE
# notebook seeds numpy with 42, draws 30% without replacement, and keeps the
# complement as test. Replicated verbatim below — same seed, same call order,
# same per-type sizes, therefore the same indices.
# ============================================================

def same_split_as_configs_bcd(n):
    np.random.seed(42)
    tune_idx = np.random.choice(n, size=int(0.3 * n), replace=False)
    test_idx = np.setdiff1d(np.arange(n), tune_idx)
    return tune_idx, test_idx


def metrics_at(y_true, y_pred, score, label):
    """Full metric set, including the ones that are honest at 0.13% prevalence."""
    tn = int(((y_true == 0) & (y_pred == 0)).sum())
    fp = int(((y_true == 0) & (y_pred == 1)).sum())
    fn = int(((y_true == 1) & (y_pred == 0)).sum())
    tp = int(((y_true == 1) & (y_pred == 1)).sum())

    out = {
        'config': label,
        'precision': float(precision_score(y_true, y_pred, zero_division=0)),
        'recall':    float(recall_score(y_true, y_pred, zero_division=0)),
        'f1_score':  float(f1_score(y_true, y_pred, zero_division=0)),
        'f2_score':  float(fbeta_score(y_true, y_pred, beta=2.0, zero_division=0)),
        'fpr': float(fp / (fp + tn)) if (fp + tn) else 0.0,
        'tp': tp, 'fp': fp, 'tn': tn, 'fn': fn,
    }
    if y_true.sum() > 0:
        out['auc_roc'] = float(roc_auc_score(y_true, score))
        # Average precision = AUC-PR. THE metric at extreme imbalance, and one
        # your report currently never reports. Add it to every config.
        out['auc_pr'] = float(average_precision_score(y_true, score))
        out['prevalence'] = float(y_true.mean())
        out['lift_over_random'] = (out['precision'] / float(y_true.mean())
                                   if y_true.mean() > 0 else 0.0)
    return out


def precision_at_k(y_true, score, ks=(100, 500, 1000, 5000)):
    """What an investigation team actually experiences: they work a queue of
    fixed length, highest score first. Far more meaningful operationally than
    F1 at a tuned threshold, and it flatters a well-calibrated detector."""
    order = np.argsort(-score)
    return {f'precision_at_{k}': float(y_true[order[:k]].mean())
            for k in ks if k <= len(y_true)}


# ============================================================
# CELL 3: Run Config F per transaction type
# ============================================================
print("=" * 70)
print("CONFIG F — F3 ALONE, SIMPLE THRESHOLD CLASSIFIER (NO VAE)")
print("=" * 70)

results, per_type_arrays = {}, {}

for txn_type, fname in [('TRANSFER', 'TRANSFER_all_features.csv'),
                        ('CASH_OUT', 'CASH_OUT_all_features.csv')]:
    df = pd.read_csv(f'{output_dir}/{fname}')
    y  = df['isFraud'].values
    f3 = df[F3].values.astype(float)

    tune_idx, test_idx = same_split_as_configs_bcd(len(y))

    # "Tune" on the 30% split: F3 is binary, so the only decision is polarity.
    # Pick whichever direction maximises F2 on the tuning split, exactly as the
    # VAE configs pick their threshold on the same split.
    f2_pos = fbeta_score(y[tune_idx], (f3[tune_idx] == 1).astype(int),
                         beta=2.0, zero_division=0)
    f2_neg = fbeta_score(y[tune_idx], (f3[tune_idx] == 0).astype(int),
                         beta=2.0, zero_division=0)
    flag_when_one = f2_pos >= f2_neg
    rule = 'F3 == 1' if flag_when_one else 'F3 == 0'

    score  = f3 if flag_when_one else (1.0 - f3)
    y_pred = (score[test_idx] == 1).astype(int)

    m = metrics_at(y[test_idx], y_pred, score[test_idx], f'F - {txn_type} (F3 alone)')
    m['rule'] = rule
    m.update(precision_at_k(y[test_idx], score[test_idx]))
    results[txn_type] = m
    per_type_arrays[txn_type] = (y[test_idx], y_pred, score[test_idx])

    print(f"\n  {txn_type}  —  decision rule: flag when {rule}")
    print(f"    Precision {m['precision']:.4f} | Recall {m['recall']:.4f} | "
          f"F1 {m['f1_score']:.4f} | F2 {m['f2_score']:.4f}")
    print(f"    AUC-ROC   {m.get('auc_roc', float('nan')):.4f} | "
          f"AUC-PR {m.get('auc_pr', float('nan')):.4f} | FPR {m['fpr']:.4f}")
    print(f"    TP {m['tp']:,}  FP {m['fp']:,}  FN {m['fn']:,}  TN {m['tn']:,}")
    print(f"    Lift over random: {m.get('lift_over_random', 0):.1f}x")


# ============================================================
# CELL 4: Combined Config F — the number that goes in the ablation table
# ============================================================
y_all    = np.concatenate([per_type_arrays['TRANSFER'][0], per_type_arrays['CASH_OUT'][0]])
pred_all = np.concatenate([per_type_arrays['TRANSFER'][1], per_type_arrays['CASH_OUT'][1]])
sc_all   = np.concatenate([per_type_arrays['TRANSFER'][2], per_type_arrays['CASH_OUT'][2]])

combined = metrics_at(y_all, pred_all, sc_all, 'F - F3 alone, no VAE (trivial baseline)')
combined.update(precision_at_k(y_all, sc_all))
combined['note'] = ('Trivial baseline for the feature necessity analysis. '
                    'No model, no learning — a single binary balance check. '
                    'Evaluated on the same 70% test split as Configs B/C/D.')
results['COMBINED'] = combined

print("\n" + "=" * 70)
print("CONFIG F — COMBINED (this row goes in the ablation table)")
print("=" * 70)
print(f"  Precision {combined['precision']:.4f} | Recall {combined['recall']:.4f} | "
      f"F1 {combined['f1_score']:.4f}")
print(f"  AUC-PR    {combined.get('auc_pr', float('nan')):.4f} | "
      f"FPR {combined['fpr']:.4f} | "
      f"False alarms {combined['fp']:,}")


# ============================================================
# CELL 5: The interpretation — read this before writing anything
# ============================================================
print("\n" + "=" * 70)
print("WHAT THIS MEANS FOR YOUR THESIS")
print("=" * 70)

CONFIG_D_F1 = 0.422   # replace with the corrected D2 value once rerun
p, r, f1 = combined['precision'], combined['recall'], combined['f1_score']

print(f"""
  Config F (trivial)  : F1 = {f1:.4f}, precision = {p:.4f}, recall = {r:.4f}
  Config D (proposed) : F1 = {CONFIG_D_F1:.4f}
""")

if f1 < CONFIG_D_F1:
    print(f"""  RESULT: the trivial baseline is BEATEN by the proposed system.

  Write it as: "A single balance-consistency check achieves recall {r:.3f} but
  precision {p:.4f}, generating {combined['fp']:,} false alarms on the test
  partition. It is therefore operationally unusable despite near-complete
  recall. The stratified VAE ensemble reaches F1 {CONFIG_D_F1:.3f}, a
  {CONFIG_D_F1 / max(f1, 1e-9):.1f}x improvement, confirming that
  multi-dimensional behavioural modelling contributes detection value beyond
  balance verification alone."

  That sentence answers the panel's first question. Put it in the abstract.""")
else:
    print(f"""  RESULT: the trivial baseline MATCHES or BEATS the proposed system on F1.

  Do not hide this — it is a legitimate and publishable negative finding, and
  concealing it is the one thing that genuinely endangers your submission.
  Argue on the axes where F3 alone cannot compete:
    - precision at a fixed alert budget (precision@k above)
    - forensic attribution: F3 alone explains nothing; DSAA explains every alert
    - generalisation: F3 exploits a PaySim simulation artefact and will not
      transfer to real data, where the accounting identity always holds
  Then state plainly that on this dataset the balance feature dominates, and
  that this is a property of PaySim rather than of the method.""")


# ============================================================
# CELL 6: Save
# ============================================================
with open(f'{results_dir}/config_f_metrics.json', 'w') as f:
    json.dump(results, f, indent=2)
print(f"\nSaved: {results_dir}/config_f_metrics.json")

print("""
NEXT AFTER THIS:
  Config E — stratified VAEs with F3 REMOVED (12 features). Does the model
             still work without the balance feature?
  Config G — stratified VAEs trained on F3 ONLY (1 feature). Does the VAE add
             anything over the plain threshold?
  Both need the corrected trainer from DeepSentinel_VAE_Fix_v3.py, so run the
  VAE fix first.
""")
