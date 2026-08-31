#!/usr/bin/env bash
# Stop every DeepSentinel service started by start-deepsentinel.command.
cd "$(dirname "${BASH_SOURCE[0]}")"
echo
echo "Stopping DeepSentinel"
for row in "network 8002" "behaviour 8001" "timing 8003" "platform 8090" "queryrunner 8600" "web 5173"; do
  set -- $row
  pids=$(lsof -ti:"$2" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null
    printf '  · stopped %s (%s)\n' "$1" "$2"
  else
    printf '  · %s was not running\n' "$1"
  fi
done
echo
