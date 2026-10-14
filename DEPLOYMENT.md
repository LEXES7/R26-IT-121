# Cloud Deployment

How DeepSentinel runs on Azure, how to change it, and what broke on the way
there. Companion to [ARCHITECTURE.md](ARCHITECTURE.md), which describes the
system itself, and [SETUP.md](SETUP.md), which describes running it locally.

Everything here lives on the `deepsentinal-Cloud` branch. `main` has none of
it, and merging is not required for the deployment to work.

---

## 1. What is running

Five containers in one Azure Container Apps environment, talking to a Neon
Postgres that was already there before any of this.

```
                    Internet
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
      web  (nginx)            fusion-api  (FastAPI)
      external ingress        external ingress
            │                       │
            └───── calls ───────────┤
                                    │  internal ingress only
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
                  vae           graphsage         tstcn
               :8001            :8000            :8003
                                    │
                                    ▼
                        Azure Files  (516 MB of graph tensors)

                       fusion-api ──► Neon Postgres (unchanged)
```

### URLs

| | |
|---|---|
| Console (what you open) | `https://web.bravedune-c12a41a0.southeastasia.azurecontainerapps.io` |
| API | `https://fusion-api.bravedune-c12a41a0.southeastasia.azurecontainerapps.io` |

The three detectors have **internal ingress** — reachable only from inside the
environment, which is why there is no public URL for them and why you cannot
curl them from your laptop. To exercise them, go through `POST /analyze`.

### Apps

| App | Ingress | Port | CPU / memory | Replicas |
|---|---|---|---|---|
| `web` | external | 80 | 0.25 / 0.5 GiB | 0–3 |
| `fusion-api` | external | 8000 | 0.5 / 1 GiB | 0–**1** |
| `vae` | internal | 8001 | 0.5 / 1 GiB | 0–3 |
| `graphsage` | internal | 8000 | 2.0 / 4 GiB | 0–3 |
| `tstcn` | internal | 8003 | 0.5 / 1 GiB | 0–**1** |

**`fusion-api` and `tstcn` are capped at one replica and must stay that way.**
Both hold state in the process: TS-TCN's 32-transaction window is a `deque` in
`api/state.py`, and the monitor's counters, event log and SSE subscribers are a
module-level object in `monitor/state.py`. A second replica means a second
window and a second event stream, and the console starts showing whichever one
the load balancer happened to pick.

### Azure resources

All in resource group **`rg-deepsentinel`**, region **southeastasia**.

| Resource | Name | Why |
|---|---|---|
| Container Registry | `acrdeepsentinel42` | Basic tier, holds the five images |
| Storage account | `stdeepsent42` | File share `graphdata` |
| Container Apps env | `cae-ds` | Consumption profile only |
| Log Analytics | `workspace-rgdeepsentinel9Qfv` | Container logs |

Two further Log Analytics workspaces (`...aGLR`, `...Dzll`) are orphans from
environments that were created and deleted during setup. They cost nothing and
can be removed.

---

## 2. Deploying a change

**Push to `deepsentinal-Cloud`. That is the whole process.**

```bash
git checkout deepsentinal-Cloud
# edit
git commit -am "..."
git push
```

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) then builds all
five images on the runner, pushes them to ACR tagged with the commit SHA, and
rolls each Container App onto that tag. Ten to fifteen minutes end to end.

All five rebuild on every push, even for a one-line change. That is deliberate:
a path filter is one more thing to get wrong, and getting it wrong means a push
that silently deploys stale code.

### Watching a deploy

The build passing is rarely the question. What matters is whether the app ended
up on the new image and came up:

```powershell
az containerapp show -n fusion-api -g rg-deepsentinel `
  --query "properties.template.containers[0].image" -o tsv
```

If that shows your commit SHA, your code is live.

### Reading logs

```powershell
az containerapp logs show -n fusion-api -g rg-deepsentinel --tail 50 --format text
```

**This only works while a replica exists.** An app that failed to start has no
replica and the command answers `Could not find a replica for this app`, which
is exactly when you most want the logs. The way through is to set
`--min-replicas 1`, let it fail with a replica present, read the logs, then set
it back to 0.

### Revisions

A deploy creates a new revision and the old one keeps serving until the new one
is healthy. Traffic is `Single` mode, 100% to latest. If you check an endpoint
immediately after a deploy and see the old behaviour, you are talking to the
previous revision — look at `az containerapp revision list` before concluding
the deploy did nothing.

---

## 3. Configuration

`fusion-api` is the only app with meaningful configuration. The backend's
config system resolves **environment > config.ini > default**
(`backend/config.py`), and `config.ini` is not in the image, so in the cloud
everything comes from environment variables.

### Secrets

Stored as Container Apps secrets and referenced as `secretref:<name>`:

| Secret | Env var |
|---|---|
| `db-url` | `DATABASE_URL` |
| `jwt` | `JWT_SECRET_KEY` |
| `gemini` | `GEMINI_API_KEY` |
| `adminpw` | `ADMIN_BOOTSTRAP_PASSWORD` |
| `smtp-user` / `smtp-pass` | `SMTP_USERNAME` / `SMTP_PASSWORD` |

```powershell
az containerapp secret set -n fusion-api -g rg-deepsentinel --secrets name="value"
```

> **Windows trap.** `az` is a `.cmd` batch file, so cmd.exe re-parses every
> argument — and the Neon URL contains `?sslmode=require&channel_binding=require`.
> cmd.exe reads that `&` as a command separator, truncates the secret there, and
> tries to run `channel_binding` as a program. Call the CLI through its own
> Python to skip cmd.exe entirely:
>
> ```powershell
> & "C:\Program Files\Microsoft SDKs\Azure\CLI2\python.exe" -m azure.cli containerapp secret set ...
> ```

### Plain environment variables

| Variable | Value |
|---|---|
| `DEEPSENTINEL_ENV` | `production` |
| `UPSTREAM_TIMEOUT_MS` | `5000` |
| `BEHAVIORAL_API_BASE` | `https://vae.internal.<env>.azurecontainerapps.io` |
| `GRAPH_API_BASE` | `https://graphsage.internal.<env>...` |
| `TEMPORAL_API_BASE` | `https://tstcn.internal.<env>...` |
| `CORS_ORIGINS` | the `web` URL |

`DEEPSENTINEL_ENV=production` makes the app **refuse to start** without
`JWT_SECRET_KEY`. That is intentional (`backend/config.py`): it fails loudly at
startup rather than quietly signing everyone out on every restart. If
`fusion-api` is in `ActivationFailed` right after a config change, check this
first.

### The frontend's API URL is a build argument, not an environment variable

Vite substitutes `import.meta.env.VITE_API_URL` **when the bundle is built**.
Setting it on the running container does nothing — the bundle still carries
whatever was baked in. It is passed in the workflow:

```yaml
- app: web
  buildargs: --build-arg VITE_API_URL=https://fusion-api...
```

**If the backend URL ever changes, that line must change too**, and the web
image must be rebuilt. To check what a deployed bundle actually calls, fetch it
and grep:

```bash
curl -s <web-url>/assets/index-XXXX.js | grep -c "fusion-api"
```

---

## 4. GraphSAGE's 516 MB

GraphSAGE loads `serving_bundle.pt` (162 MB), `node_features_v2.pt` (151 MB),
`node_names.npy` (138 MB) and `features.parquet` (65 MB) at startup. These are
gitignored, so CI never sees them and they cannot be baked into the image.

They live on an Azure Files share mounted into the container at `/graphdata`,
with `GRAPHSAGE_DATA_ROOT=/graphdata` pointing the app at it. That environment
variable already existed in `app.py` for exactly this reason.

Re-uploading after retraining:

```powershell
$key = az storage account keys list -n stdeepsent42 -g rg-deepsentinel --query "[0].value" -o tsv
az storage file upload --share-name graphdata --account-name stdeepsent42 --account-key $key `
  --source GraphSage/data/graph/serving_bundle.pt --path data/graph/serving_bundle.pt
```

The share mirrors the repo layout: `data/graph/`, `data/processed/`,
`checkpoints/`.

> Azure Files mounts need a **non-express** Container Apps environment. The
> default `az containerapp env create` produces an express environment, which
> refuses storage with `ExpressEnvironmentResourceNotSupported`. `cae-ds` was
> created with `--environment-mode WorkloadProfiles` (needs the `containerapp`
> CLI extension). If the environment is ever rebuilt, it must be created that
> way or the mount cannot be attached.

---

## 5. Operating it

### Before a demo

```powershell
powershell -ExecutionPolicy Bypass -File scripts\warm-deployment.ps1
```

Everything runs at `min-replicas 0`, so the first request after an idle spell
waits for a cold start — 30–60s for GraphSAGE, which has 516 MB to read off the
file share. The script also pushes ~32 transactions through `/analyze`, because
the temporal detector answers **503 until its window holds 32 transactions** and
no health check can hurry that.

A fresh deployment reports `temporal_available: false` and `modalities_used: 2`
until that window fills. That is warm-up, not a fault.

### The live monitor, and the Neon budget

**Start the monitor only while you are demonstrating. Stop it afterwards.**

The monitor loop claims from `transactions_live` every 1.2 seconds, and that
claim is a database query. Neon's free plan allows **100 compute-hours per
month** and suspends the compute after five idle minutes — which a 1.2s poll
never allows. Left running, it spends the month's budget waiting for work, and
when the budget is gone **the database suspends until the next billing period**.

An idle backoff in `monitor/engine.py` doubles the poll interval up to 30
minutes when the queue stays empty, and resets the moment work arrives or
someone presses Start. That protects an unattended monitor. It does not protect
a dashboard left open overnight with the monitor running, because the SSE
stream keeps the container alive and the operator never pressed Stop.

Check usage in the Neon console under the project's Usage tab.

### Cost

| | |
|---|---|
| ACR Basic | ~$5/month, the only fixed cost |
| Azure Files, Log Analytics, the environment | effectively $0 |
| Container Apps | free for the first ~13 hours/month of all five running; roughly $0.12–$0.40 per hour after that |

Idle, the whole deployment is about **$5/month**. Nobody should set
`min-replicas 1` without meaning to: `graphsage` alone at 2 vCPU / 4 GiB costs
about $24/month running continuously.

### Teardown

```powershell
az group delete -n rg-deepsentinel --yes
```

Stops every charge. Neon is a separate account and is unaffected.

---

## 6. Access

### Azure

Each teammate has an account in the `kalpavidushaoutlook.onmicrosoft.com`
directory with **Contributor** on `rg-deepsentinel` — enough to deploy,
restart, scale, read logs and change secrets; not enough to grant access to
others or touch billing.

Sign in at `portal.azure.com` **in a private window**. A normal window picks up
whatever Microsoft account is already signed in and reports no subscriptions.

### GitHub

Azure access does not include GitHub. Pushing to `deepsentinal-Cloud` — which
is what actually deploys — needs write access on `LEXES7/R26-IT-121`.

---

## 7. What broke, and why it is worth knowing

Six failures stood between a working local system and a working deployment.
Three were real defects in the codebase that only a clean environment could
reveal. They are recorded because the same shapes will recur.

| # | Symptom | Cause |
|---|---|---|
| 1 | `az acr build` refused: `TasksOperationsNotAllowed` | ACR Tasks is blocked on Azure for Students. Builds moved to the GitHub runner. |
| 2 | Storage refused: `ExpressEnvironmentResourceNotSupported` | Default environments are "express" and cannot mount Azure Files. Recreated with `--environment-mode WorkloadProfiles`. |
| 3 | Secret truncated at `&`, then `'channel_binding' is not recognized` | cmd.exe re-parsing `az.cmd` arguments. Call the CLI's Python directly. |
| 4 | `graphsage` crashed at import: `Form data requires "python-multipart"` | A genuinely undeclared dependency. `/api/graph/demo/score-csv` takes an `UploadFile`, and FastAPI raises at **import** time without it. Every environment that ever ran this service had it installed by hand. Now in both the Dockerfile and `pyproject.toml`. |
| 5 | `tstcn` answered 500 on every classify: `Could not deserialize class 'Functional'` | The image pinned TensorFlow 2.15 (Keras 2); `best_tstcn.keras` was written by TF 2.21 (Keras 3), which records module paths Keras 2 has no module for. **Retraining on a different TensorFlow means moving the pin in `TS-TCN/Dockerfile` with it.** |
| 6 | Signing in gave `Request failed with status code 404` | `monitor/`, `assistant/`, `chatbot/` and `enquiry/` are top-level packages beside `backend/`, and the image copied only `backend/`. |

**The pattern worth taking away** is in #4, #5 and #6: all three failed
*silently*. The builds passed, the containers started, `/health` answered `ok`,
and nothing in any deploy log pointed at a cause. Each one is a deferred
failure — an import guarded by `try/except`, a model loaded on first request
rather than at startup, a dependency that only a clean environment lacks.

A health check that passes is not evidence that a service works. The checks
that actually caught these were: counting routes in `/openapi.json`, reading
container logs from a failing replica, and sending a real request through
`/analyze` and looking at `modalities_used`.

---

## 8. If something is wrong

| Symptom | Where to look |
|---|---|
| Console shows 404 after signing in | Count routes: `curl <api>/openapi.json`. Fewer than ~73 means a router did not mount — read the startup logs for `... unavailable`. |
| `temporal_available: false` | Expected until 32 transactions have passed through. If `tstcn` logs show 500 rather than 503, it is not warming up — check the TensorFlow pin. |
| `behavioral_available: false` on the first call only | Cold start exceeding `UPSTREAM_TIMEOUT_MS`. Call again, or warm first. |
| An app stuck in `ActivationFailed` | `--min-replicas 1`, read the logs, fix, set back to 0. |
| Login fails against the deployed API | Check `DATABASE_URL` reached the container intact — the `&` trap in §3. A bogus login returning 401 (not 500) proves the database round-trips. |
| Deploy "did nothing" | Compare `az containerapp show --query "...image"` with your commit SHA; you may be reading the previous revision. |
