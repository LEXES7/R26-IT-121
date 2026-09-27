# Model artefacts

These files are **not in git** — they are large, regenerable, and the weights
live in Drive alongside the Colab runs that produced them. The directory
structure is tracked (via `.gitkeep`) so the paths exist in a fresh clone.

## What the service needs

`api/state.py` reads exactly three files. Until all three are present the
service still starts and still answers `/health`, but reports
`status: "degraded"` and returns **503 `MODEL_UNAVAILABLE`** from
`/api/v1/classify`.

| Destination (exact path) | Produced by |
|---|---|
| `outputs/stage4_tcn/best_tstcn.keras` | the Stage 4 full-training notebook (`DeepSentinel_T4_FullTraining.ipynb`) |
| `outputs/stage2_baselines/scaler.pkl` | `notebooks/01_baseline_evaluation.ipynb`, cell 14 (fit on TRAIN only — FR1) |
| `outputs/stage2_baselines/type_risk_weights.json` | `notebooks/01_baseline_evaluation.ipynb`, cell 22 |

Copy them from Drive into those paths, or re-run those notebook cells. No code
change or restart-order trick is needed — the loader is lazy, so the next
`/classify` after the files appear will pick them up.

Check it took:

```bash
curl -s localhost:8003/health | python3 -m json.tool
# "status": "ok", "ready": true, "missing_artifacts": []
```

## Running the service

TensorFlow is imported lazily, so the API starts without it — useful on a
machine that cannot host the model. It is required to actually score.

```bash
cd TS-TCN
python -m uvicorn api.main:app --host 127.0.0.1 --port 8003
```

Port 8003 is what the fusion engine's `config.ini` expects
(`[upstream] temporal_api_base`).

## Model status

The served checkpoint is `ts-tcn-v1.0-stage4` — the full Stage 4 training run —
and `THRESHOLD = 0.4311` comes from Stage 6 tuning rather than being the
untuned sigmoid midpoint. See `docs/api_contract.md`.
