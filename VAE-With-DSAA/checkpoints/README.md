# checkpoints/

Trained model bundles. Not committed — weights are regenerable from the
committed source in minutes, and binary weights do not belong in a git history.

## Bundle layout

One directory per configuration, named `<protocol>__<featureset>__<stratum>`:

```
checkpoints/v4/clean__FS-ORIGIN__TRANSFER/
    vae.pt           encoder + decoder state_dict
    scaler.pkl       fitted MinMax scaler
    kmeans.pkl       latent-density centroids
    thresholds.json  F1- and F2-optimal thresholds + z-score statistics
    manifest.json    features in order, architecture, hyperparameters,
                     split point, framework version, git commit, timestamp,
                     and a `serving` block holding the constants single-row
                     feature engineering needs (f8_p95_causal)
    calibrator.pkl   raw z-composite -> calibrated probability   (serving)
    calibration.json its method, thresholds, risk bands and ECE  (serving)
    typology.pkl     cluster medoids + radii for typology assignment (serving)
    typology.json    the discovered typologies, readable          (serving)
```

A bundle is self-contained: it holds everything needed to score a transaction
without retraining and without consulting any other file.

The four `serving` artefacts were added when the API was built. Training alone
produces the first five files; the last four come from the export steps below.
Without `serving.f8_p95_causal` a single transaction cannot reproduce
`F8_is_large`, and every served score is wrong — silently, because the response
still looks well formed.

## Regenerating

```bash
# 1. train every configuration (feature sets x strata + the pooled model)
python scripts/train_models.py

# a single tier, or a single stratum
python scripts/train_models.py --sets FS-FULL
python scripts/train_models.py --sets FS-FULL --strata TRANSFER --no-global

# 2. serving artefacts — required before the API can be started
python scripts/patch_bundle_serving.py     # f8_p95_causal into every manifest
python scripts/export_calibrators.py       # isotonic calibration per stratum
python scripts/export_typologies.py        # typology medoids and radii
```

Steps 2 retrain nothing; they re-score the validation partition with the models
already on disk, so they take seconds. Run them after any retraining, or the
calibrator and typology index will belong to the previous model.

Metrics are written alongside, under `reports/v4/` —
`calibration_report.json` and `typology_index_report.json` record what the
export steps produced.

## Verifying

```bash
python scripts/roundtrip_check.py
```

Reloads every bundle from disk, re-scores the test partition, and compares
against the metrics recorded at training time. Scoring is deterministic — the
posterior mean is decoded rather than a sampled draw — so a correct bundle
reproduces its recorded metrics exactly. Any mismatch is a persistence bug and
fails the check.

## Feature sets

| Set | Features | Purpose |
| --- | --- | --- |
| `FS-FULL` | 11 | F11 dropped (look-ahead), F7_day dropped (extrapolation) |
| `FS-ORIGIN` | 7 | FS-FULL minus destination-side balance features |
| `FS-CLEAN` | 4 | FS-FULL minus all balance-derived features |
| `FS12` | 12 | keeps F7_day — reference for the F7_day ablation |
| `FS13` | 13 | keeps F11 — reference for the F11 ablation |

`FS-ORIGIN-NOF3` (6 features) also exists, as the tier that measures
FS-ORIGIN's dependence on `F3_balance_consistency`.

The primary tier was decided by the ablation rather than assumed:
`vae_dsaa.data.features.PRIMARY_FEATURE_SET` is `"FS-ORIGIN"`, and its docstring
carries the caveat that must be reported with any result produced from it. The
API serves `FS-ORIGIN`.

## Using a bundle

```python
from vae_dsaa.utils.persistence import load_bundle

p = load_bundle("checkpoints/v4/clean__FS-ORIGIN__TRANSFER")
p.features                      # feature order the model expects
scores = p.score(X)             # X shaped (n, len(p.features)), raw/unscaled
flags  = p.predict(X)           # boolean, at the stored F1-optimal threshold
```
