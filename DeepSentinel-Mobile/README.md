# DeepSentinel Mobile

The analyst-facing phone client for the DeepSentinel fraud detection platform
(R26-IT-121). It does two things: show what the platform has screened, and
screen a transaction from the phone and show every piece of evidence behind the
verdict.

It holds no model and makes no judgement of its own. Every number on every
screen came from the fusion engine, and where the engine cannot answer, the app
says so rather than filling the gap.

React Native via Expo SDK 54, TypeScript throughout.

---

## What it needs

| Service | Port | Required |
|---|---|---|
| Fusion engine (`fusion_engine/DeepSentinel`) | `8090` | **yes** — nothing works without it |
| Behavioural detector (VAE-DSAA) | `8001` | for behavioural evidence |
| Graph detector (GraphSAGE) | `8002` | not deployed yet |
| Temporal detector (TS-TCN) | `8003` | not deployed yet |

The fusion engine imputes a missing detector at 0.5 and excludes it from the
fused score rather than counting it as a vote for innocence, so the app is
usable with only the behavioural service running. It reports how many detectors
actually answered on every case.

## Running it

```bash
npm install
npx expo start
```

Then open the project in **Expo Go** on a phone on the same Wi-Fi. The Expo Go
version must be SDK 54 — the project is pinned to it because that is what Expo
Go installs from the stores today.

## Pointing it at a backend

Every request goes through `src/api/client.ts`, which reads `API_BASE` from
`src/config.ts`, which reads `extra.apiBase` from `app.config.js`. That is the
one place the address lives, and it is set by an environment variable:

```bash
EXPO_PUBLIC_API_BASE=http://192.168.1.42:8090 npx expo start
```

Without the variable it falls back to a LAN address hard-coded in
`app.config.js`. **That fallback is a DHCP lease on one developer's laptop and
will not be your address.** Set the variable, or edit the fallback locally.

The fallback is a LAN address rather than `localhost` on purpose: on a phone
`localhost` is the phone, so that default would fail in a way that looks like
the server is down.

Once the fusion engine is on Azure this becomes the deployed URL and
`usesCleartextTraffic` (see below) should be removed.

## Building an APK

Expo Go is enough for development. A standalone APK is needed to show the app
without a laptop running Metro.

```bash
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$HOME/AppData/Local/Android/Sdk"

npx expo prebuild --platform android --clean   # only after changing app.json
cd android && ./gradlew assembleRelease
```

The APK lands in `android/app/build/outputs/apk/release/app-release.apk`
(~55 MB). `android/` is generated and git-ignored — never commit it.

Two things that are easy to get wrong:

- **`usesCleartextTraffic`.** Android blocks plain HTTP from targetSdk 28
  onward, and only the *debug* manifest opts back in. Without the
  `expo-build-properties` plugin in `app.json`, a release APK cannot reach an
  `http://` backend at all, and the failure looks like a network problem rather
  than the OS refusing to send the request.
- **Signing.** `prebuild --clean` regenerates `android/`. If the signing key
  changes, Android refuses to install over the previous build — uninstall the
  old app first.

## Icons

`assets/` is generated. To change the mark, edit the constants in
`tools/make-icons.py` and re-run it:

```bash
python tools/make-icons.py          # needs Pillow
```

It writes the launcher icon, both adaptive layers, the Android 13 monochrome
layer, the splash image and the favicon at the sizes and safe zones each one
needs. The palette is duplicated from `src/theme/tokens.ts`; when the web
dashboard's palette moves, change both.

## Layout

```
App.tsx                     session gate, two tabs, the pushed case screen
app.config.js               the one place the API address is configured
src/
  api/client.ts             one request path: timeouts, central 401, error types
  api/{auth,analyses,analyze}.ts
  auth/session.ts           the token, in the Android keystore
  screens/
    LoginScreen.tsx         sign-in, lockout feedback
    AlertsScreen.tsx        what has been screened, polled every 15s
    AnalyzeScreen.tsx       screen a sample transaction
    CaseScreen.tsx          one case, in full
  components/
    ui.tsx                  the shared primitives every screen is built from
    ForensicReport.tsx      the engine's narrative report, as its five sections
    evidence/{Behavioural,Graph,Temporal}.tsx
  lib/format.ts             money, scores, timestamps — formatted one way only
  lib/forensicReport.ts     parses the report; degrades rather than fails
  theme/tokens.ts           colours copied from the web app's tailwind config
  data/samples.ts           four real PaySim rows
tools/make-icons.py         regenerates everything in assets/
```

## Status

| | |
|---|---|
| Sign-in, keystore session, auto-lock on backgrounding | working |
| Alert list, filters, pull to refresh | working |
| Screening a transaction from the phone | working |
| Case screen: verdict, detector contributions, uncertainty penalty | working |
| Behavioural evidence panel | working, from the `/analyze` path |
| Forensic report panel | working when an LLM is configured |
| **Graph evidence panel** | **built, no data — GraphSAGE is not deployed** |
| **Temporal evidence panel** | **built, no data — TS-TCN is not deployed** |
| Monitor / live ingestion screen | not built — the Query Runner is not ready |

Two limitations worth knowing before reviewing:

**Evidence only arrives on the screening path.** `GET /analyses` returns a
summary per transaction and does not carry the per-modality evidence or the
forensic report, so a case opened from the alert list shows the verdict and the
scores but empty panels. A case opened from a screening shows everything. The
app says which situation it is in rather than leaving the panels blank without
explanation. When the backend serves stored evidence, the panels fill in with
no change here.

**The graph and temporal panels are written against the API contracts, not
against live responses.** They are built so that the moment those services are
deployed there is somewhere for their output to land — but they have never
rendered real data, and should be re-checked when the services come up.

## Notes on some decisions

- **The four sample transactions are real PaySim rows, not a form.** A form
  invites numbers that never occur in the data, and a model asked about an
  impossible transaction gives an answer that means nothing. The four are an
  honest test rather than a flattering one: two the dataset labels fraudulent,
  two it does not, and among the normal ones a transfer larger than either
  fraud — so a detector that simply flags large amounts fails visibly.
- **The dataset's fraud label is never sent to the models.** It is shown beside
  the score after a result comes back, so the two can be read against each
  other.
- **The session lives in `expo-secure-store`, not AsyncStorage** — the Android
  keystore, so a token is not readable from a backup or a rooted file browser.
  It is cleared after 60 seconds in the background: a fraud tool on an unlocked
  phone left on a desk is the risk that guards.
- **Colours mean the same thing here as on the dashboard.** A CRITICAL badge is
  the same red on a phone as in the web app and the alert email, because
  `theme/tokens.ts` is copied from the web's tailwind config.
