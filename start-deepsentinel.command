#!/usr/bin/env bash
# Start every DeepSentinel service, in the order they need each other.
#
# Double-click this file in Finder, or run it from a terminal. Each service is
# detached with nohup, so closing the window that launched it does not take the
# platform down with it — which is what happens when they are started by hand
# in editor terminals.
#
# Logs go to logs/<service>.log beside this script. Run ./stop-deepsentinel.command
# to shut everything down.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
ROOT="$(pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

# The one interpreter with torch, fastapi and the rest. The TCN is the
# exception: TensorFlow needs its own Python 3.12 environment.
PY="${DEEPSENTINEL_PYTHON:-$HOME/Documents/Graphsage/.venv/bin/python}"
TCN_PY="$ROOT/TS-TCN/.venv/bin/python"
QUERY_RUNNER="${QUERY_RUNNER_DIR:-$HOME/Documents/deepsentinel-query_runner}"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
dim()   { printf '\033[2m%s\033[0m\n' "$1"; }

# $2 is the path that proves it is alive — /health where there is one, / where
# there is not.
# `localhost`, not 127.0.0.1: Vite binds IPv6 only, so an IPv4 probe reports a
# healthy dev server as dead. curl resolves both and takes whichever answers.
up() { curl -s -o /dev/null --max-time 2 "http://localhost:$1${2:-/health}" 2>/dev/null; }

# Start one service unless its port is already answering. Idempotent on
# purpose: running this twice should not leave two copies fighting for a port.
start() {
  local name="$1" port="$2" path="$3" dir="$4"; shift 4
  if up "$port" "$path"; then
    dim "  · $name already running on $port"
    return
  fi
  ( cd "$dir" && nohup "$@" > "$LOGS/$name.log" 2>&1 & disown ) 2>/dev/null
  printf '  · starting %s on %s' "$name" "$port"
  for _ in $(seq 1 60); do
    sleep 1
    printf '.'
    if up "$port" "$path"; then printf '\n'; green "    $name is up"; return; fi
  done
  printf '\n'
  red "    $name did not answer — see logs/$name.log"
}

echo
echo "DeepSentinel"
echo "────────────────────────────────────────────"

[ -x "$PY" ] || { red "No interpreter at $PY"; echo "Set DEEPSENTINEL_PYTHON."; exit 1; }

# Detectors first — the fusion backend probes them as it starts.
start network    8002 /health "$ROOT/GraphSage"                ./run_api.sh
start behaviour  8001 /health "$ROOT/VAE-With-DSAA"            "$PY" scripts/serve_api.py
if [ -x "$TCN_PY" ]; then
  start timing   8003 /health "$ROOT/TS-TCN"           "$TCN_PY" -m uvicorn api.main:app --host 127.0.0.1 --port 8003
else
  red "  · timing skipped — no venv at TS-TCN/.venv (TensorFlow needs Python 3.12)"
fi

# Then the platform, then the things people click.
start platform   8090 /health "$ROOT/fusion_engine/DeepSentinel" "$PY" -m uvicorn backend.main:app --host 127.0.0.1 --port 8090

if [ -d "$QUERY_RUNNER" ]; then
  start queryrunner 8600 / "$QUERY_RUNNER" env QUERY_RUNNER_NO_BROWSER=1 "$PY" run.py
else
  dim "  · query runner not found at $QUERY_RUNNER — skipped"
fi

start web        5173 / "$ROOT/fusion_engine/Deepsentinel-WEB" npm run dev

echo
echo "────────────────────────────────────────────"
for row in "network 8002 /health" "behaviour 8001 /health" "timing 8003 /health" \
           "platform 8090 /health" "queryrunner 8600 /" "web 5173 /"; do
  set -- $row
  if up "$2" "$3"; then green "  ✓ $1 ($2)"; else red "  ✗ $1 ($2)"; fi
done

echo
echo "  Console   http://localhost:5173"
echo "  Ingest    http://localhost:8600"
echo "  Logs      $LOGS"
echo
echo "  Detectors need 32 transactions before Timing can score."
echo "  Stop everything with ./stop-deepsentinel.command"
echo
