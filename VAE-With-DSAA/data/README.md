# data/

Nothing in this directory is committed. Everything here is regenerable, and the
raw inputs are large enough that tracking them would make the repository
unusable (the preprocessed CSVs alone are ~1.15 GB).

```
data/
  raw/          original PaySim CSV, as downloaded
  processed/    per-type engineered feature CSVs
```

## What belongs here

| Path | Contents | Approx. size |
| --- | --- | --- |
| `raw/PS_20174392719_1491204439457_log.csv` | PaySim, 6,362,620 rows | ~470 MB |
| `processed/TRANSFER_all_features.csv` | 532,909 rows, F1–F13 + `isFraud` | 65 MB |
| `processed/CASH_OUT_all_features.csv` | 2,237,500 rows | 274 MB |
| `processed/PAYMENT_all_features.csv` | 2,151,495 rows | 241 MB |
| `processed/*_normal_features.csv` | non-fraud rows only (VAE training inputs) | ~570 MB |

## Regenerating it

**1. Fetch the raw dataset**

```bash
python -c "import kagglehub; print(kagglehub.dataset_download('ealaxi/paysim1'))"
# copy the CSV it prints into data/raw/
```

**2. Build the engineered features**

Run `notebooks/v2/DeepSentinel_Feature_Engineering_v2.ipynb`, which writes the
six per-type CSVs. Two details matter for correctness:

- the `F8_is_large` percentile is computed on **non-fraud rows only**, so the
  label never enters the feature;
- `F11_account_velocity` aggregates over the whole log and therefore encodes
  look-ahead information. It is excluded from every corrected feature set.

**3. Build the split arrays used by the v4 pipeline**

```bash
python scripts/prep_data.py
```

This recovers the simulation step as `step = F7_day * 720` (verified integral to
within 2.3e-13), applies the chronological split at **step 595**, recomputes
`F8_is_large` against a percentile drawn from the training partition alone, and
writes `results/v4/data/{TRANSFER,CASH_OUT,PAYMENT}.npz` containing the feature
matrices, labels, recovered steps and the fit/validation/test masks.

## Split definition

| Partition | Steps | Used for |
| --- | --- | --- |
| fit | 1 – ~374 | fitting the VAE, scaler, k-means centroids |
| validation | ~375 – 595 | threshold selection and z-score statistics |
| test | 596 – 743 | final metrics only; scored once |

Total test fraud across strata is **1,642**, matching the split point used by
the platform's temporal component.
