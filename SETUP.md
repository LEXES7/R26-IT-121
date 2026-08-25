# DeepSentinel — setup and configuration

Everything needed to run the platform locally: which files to create, what goes
in them, which artefacts are not in the repository, and how to start each
service.

> **No real secrets appear in this file, and none should ever be committed.**
> Every config file holding credentials is gitignored. Placeholders below are
> marked `<...>`. If you already have working copies, §6 says where they live.

For how the system works, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Three services

| Service | Port | Path | Command |
|---|---|---|---|
| GraphSAGE detector | 8000 | `GraphSage/` | `uvicorn graphsage.api.app:app --port 8000` |
| Fusion backend | 8090 | `fusion_engine/DeepSentinel/` | `uvicorn backend.main:app --port 8090` |
| Web app | 5173 | `fusion_engine/Deepsentinel-WEB/` | `npm run dev` |

Start them in that order — the backend calls GraphSAGE, the web app calls the
backend.

---

## 2. Files you must create

None of these are in a fresh clone. Each has a tracked `.example` alongside it.

| Create this | Copy from | Holds |
|---|---|---|
| `fusion_engine/DeepSentinel/config.ini` | `config.example.ini` | All backend settings **including secrets** |
| `fusion_engine/DeepSentinel/.env` | — (create by hand) | Overrides for local dev |
| `fusion_engine/Deepsentinel-WEB/.env` | `.env.example` | The backend URL the browser calls |
| `GraphSage/.env` | `GraphSage/.env.example` | Optional — Kaggle credentials for dataset download |

### `fusion_engine/DeepSentinel/.env`

Two lines are enough for local development, and they matter more than they look:

```bash
DATABASE_URL=sqlite+aiosqlite:///./deepsentinel.db
GRAPH_API_BASE=http://127.0.0.1:8000
```

**Why `DATABASE_URL` matters.** `config.ini` points at a shared Neon Postgres
instance. Without this line the backend tries to connect to it and fails on a
missing `asyncpg` driver. Setting SQLite here keeps local runs off the team
database entirely — safer as well as simpler.

**This file must be sourced, not just present.** Nothing loads it automatically:

```bash
set -a && . ./.env && set +a
```

Forget that and you get the Neon URL from `config.ini` instead. This is the
single most common startup failure.

### `fusion_engine/Deepsentinel-WEB/.env`

```bash
VITE_API_URL=http://localhost:8090
```

Vite inlines this at **build** time, so changing it requires a dev-server
restart — editing it while running has no effect.

---

## 3. `config.ini` — every setting

Copy `config.example.ini` to `config.ini` and fill in. Environment variables
override any value here.

### `[secrets]` — never commit these

| Key | Env var | What it's for |
|---|---|---|
| `jwt_secret_key` | `JWT_SECRET_KEY` | Signs session tokens. Any long random string; changing it logs everyone out |
| `admin_bootstrap_password` | `ADMIN_BOOTSTRAP_PASSWORD` | Password for the `admin` account created on first start |
| `gemini_api_key` | `GEMINI_API_KEY` | Forensic report generation |
| `chatbot_gemini_api_key` | `CHATBOT_GEMINI_API_KEY` | Separate key for the chatbots, so their traffic doesn't consume the report quota. Falls back to `gemini_api_key` |
| `sendgrid_api_key` | `SENDGRID_API_KEY` | Optional — alternative to SMTP |
| `smtp_username` | `SMTP_USERNAME` | Gmail address sending alerts |
| `smtp_password` | `SMTP_PASSWORD` | Gmail **app password**, not the account password |

### `[upstream]` — the three detectors

```ini
[upstream]
graph_api_base = http://127.0.0.1:8000
behavioral_api_base =
temporal_api_base =
timeout_ms = 5000
```

Leave the two blanks empty until those services exist. The system treats an
unreachable detector as unavailable, imputes 0.5, excludes it from the fused
score and applies an uncertainty penalty — so a blank is handled correctly,
whereas a wrong URL produces timeouts on every transaction.

### `[llm]`

```ini
[llm]
provider = gemini              ; gemini | ollama
gemini_model = gemini-2.5-flash
ollama_base_url = http://localhost:11434
ollama_model = llama3
```

### `[database]`

```ini
[database]
url = <postgres-url-or-leave-for-sqlite>
pool_size = 5
max_overflow = 10
echo_sql = false
```

### `[email]`

```ini
[email]
smtp_host = smtp.gmail.com
smtp_port = 587
smtp_use_tls = true
sender_email = <the-gmail-address-you-send-from>
sender_name = DeepSentinel Alerts
```

> **Send alerts to real recipients, not to `sender_email`.** Recipients are
> configured in the app under Settings → Risk managers. An earlier bug sent
> alerts *to* the sender address on a domain that did not exist, and every one
> bounced.

### `[paths]`

```ini
[paths]
chroma_db = ./chroma_store
fatf_data = ./data/fatf_typologies.json
meta_classifier = ./models/meta_classifier.joblib
users_db = ./users.json
runtime_settings = ./settings.json
```

`users.json` and `settings.json` are created automatically on first start.

---

## 4. GraphSAGE model artefacts

**These are not in the repository** — too large — and the API will not start
without the first one. Produce them in Colab (`GraphSage/notebooks/train_colab.ipynb`)
and copy them in.

| File | Size | Needed for |
|---|---|---|
| `GraphSage/data/graph/serving_bundle.pt` | ~162 MB | **Required.** Graph tensors + calibrated scores + edge attention |
| `GraphSage/data/processed/features.parquet` | ~65 MB | **Required.** Account-name lookup |
| `GraphSage/data/graph/node_names.npy` | ~138 MB | Generated from the parquet on first run |
| `GraphSage/checkpoints/temporal_stage3b_v2_seed0.pt` | ~52 KB | Optional — enables live inference for unseen accounts |
| `GraphSage/data/graph/node_features_v2.pt` | ~75 MB | Optional — required with the checkpoint above |

Without the two optional files the service runs precomputed-only: accounts in
the snapshot score normally, unknown accounts return 404. `GET /api/graph/runtime`
reports which mode is active.

---

## 5. Starting everything

### Install

```bash
# GraphSAGE
cd GraphSage && python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Backend — chromadb and sentence-transformers are required by backend.main
cd ../fusion_engine/DeepSentinel && pip install -r requirements.txt

# Web
cd ../Deepsentinel-WEB && npm install
```

### Run — three terminals

```bash
# 1 — GraphSAGE
cd GraphSage && source .venv/bin/activate
python -m uvicorn graphsage.api.app:app --host 127.0.0.1 --port 8000

# 2 — backend  (note the env sourcing)
cd fusion_engine/DeepSentinel
set -a && . ./.env && set +a
PYTHONPATH=. python -m uvicorn backend.main:app --host 127.0.0.1 --port 8090

# 3 — web
cd fusion_engine/Deepsentinel-WEB && npm run dev
```

First backend start downloads the `all-MiniLM-L6-v2` embedding model (~90 MB)
and builds the FATF vector store — roughly 30 seconds. Cached afterwards.

### Verify

```bash
curl http://127.0.0.1:8000/health          # stage, threshold, risk bands
curl http://127.0.0.1:8090/health          # expect 41 routes on /openapi.json
open http://127.0.0.1:5173
```

Sign in with `admin` and your `admin_bootstrap_password`.

---

## 6. Where your existing working config lives

If you already have these machines set up, the filled-in files are at:

```
fusion_engine/DeepSentinel/config.ini     ← all secrets, gitignored
fusion_engine/DeepSentinel/.env           ← SQLite + graph URL, gitignored
```

Both are gitignored and have been verified never to have been committed. To move
them to another machine, copy them directly — do not add them to git, and do not
paste their contents into any file that will be.

---

## 7. Things that will catch you out

| Symptom | Cause |
|---|---|
| `ModuleNotFoundError: asyncpg` | `.env` not sourced, so `config.ini`'s Neon URL is being used |
| `serving_bundle.pt not found` | Model artefacts not copied — see §4 |
| Web app shows nothing / blank page | Vite cache broken. `rm -rf node_modules/.vite` and restart |
| `Could not resolve "./lib/motion"` | Stale clone from before that file was committed. Pull `main` |
| Endpoint returns 404 that should exist | Running `serve_bots_dev.py`, which mounts a subset. Use `backend.main` |
| Monitor screens but never alerts | Correct — 1 of 3 detectors is live, so the uncertainty penalty suppresses most alerts |
| Test email bounces | Recipient set to a non-existent domain. Configure real risk managers under Settings |
| A new `.py` file silently isn't committed | Check `.gitignore` — broad rules from one component have twice matched the whole repo |

---

## 8. Ports

| Port | Service |
|---|---|
| 8000 | GraphSAGE |
| 8090 | Fusion backend |
| 5173 | Web (dev) |
| 8001 | Reserved — TS-TCN temporal, when it exists |

> **On the port choice.** `QUICKSTART.md` documents the backend on 8000 and
> `INTEGRATION_GRAPHSAGE.md` documents GraphSAGE on 8000 — they collide. The
> graph service's port is fixed by its API contract and its Docker setup, so the
> backend takes 8090. The web app's defaults were still pointing at 8000, which
> aimed it at the graph service; that is now corrected.
