#!/usr/bin/env bash
# demo.sh — start/stop ONLY what NightCap starts: the API (:8788), Metro (:8091) and our simulator.
# PIDs live in .run/. `stop` kills exactly those PIDs (and their children), nothing else.
#
#   scripts/demo.sh start     API + Metro in the background, boot our sim, install Expo Go, open the app
#   scripts/demo.sh api       just the API
#   scripts/demo.sh metro     just Metro
#   scripts/demo.sh open [p]  open the app (optionally a path, e.g. /devtools?chrome=0) on our sim
#   scripts/demo.sh stop      stop our API + Metro (+ recording); leaves the sim booted
#   scripts/demo.sh status
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .run
set -a
# shellcheck disable=SC1091
[[ -f .env ]] && source .env
set +a
API_PORT=${API_PORT:-8788}
METRO_PORT=${METRO_PORT:-8091}

alive() { [[ -f .run/$1.pid ]] && kill -0 "$(cat .run/$1.pid)" 2>/dev/null; }
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

start_api() {
  if alive api; then echo "api already running (pid $(cat .run/api.pid))"; return; fi
  if port_busy "$API_PORT"; then echo "port $API_PORT is taken by someone else; not touching it" >&2; exit 1; fi
  (cd apps/api; nohup npx tsx src/index.ts > ../../.run/api.log 2>&1 & echo $! > ../../.run/api.launcher.pid) # index.ts writes .run/api.pid
  for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 && break; sleep 0.5; done
  curl -fs "http://127.0.0.1:$API_PORT/health" >/dev/null || { echo "api didn't come up; see .run/api.log" >&2; tail -20 .run/api.log; exit 1; }
  echo "api up on :$API_PORT (pid $(cat .run/api.pid))"
}

start_metro() {
  if alive metro; then echo "metro already running (pid $(cat .run/metro.pid))"; return; fi
  if port_busy "$METRO_PORT"; then echo "port $METRO_PORT is taken by someone else; not touching it" >&2; exit 1; fi
  (cd apps/mobile; CI=1 EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://127.0.0.1:$API_PORT}" EXPO_PUBLIC_MOCK="${EXPO_PUBLIC_MOCK:-1}" \
    nohup npx expo start --go --port "$METRO_PORT" --localhost > ../../.run/metro.log 2>&1 & echo $! > ../../.run/metro.pid)
  for _ in $(seq 1 120); do curl -fs "http://127.0.0.1:$METRO_PORT/status" 2>/dev/null | grep -q running && break; sleep 1; done
  curl -fs "http://127.0.0.1:$METRO_PORT/status" | grep -q running || { echo "metro didn't come up; see .run/metro.log" >&2; tail -30 .run/metro.log; exit 1; }
  echo "metro up on :$METRO_PORT (pid $(cat .run/metro.pid))"
}

open_app() {
  local path="${1:-}"
  scripts/sim.sh open "exp://127.0.0.1:$METRO_PORT${path:+/--$path}"
}

kill_tree() {
  local pid=$1
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}

stop_one() {
  local name=$1
  if [[ -f .run/$name.pid ]]; then
    kill_tree "$(cat .run/$name.pid)"
    rm -f ".run/$name.pid"
    echo "stopped $name"
  fi
}

case "${1:-}" in
  start)
    scripts/wait-for-quiet.sh --interval 60
    start_api
    start_metro
    scripts/sim.sh boot
    xcrun simctl listapps "$(scripts/sim.sh udid)" 2>/dev/null | grep -q host.exp.Exponent || scripts/sim.sh expo-go
    open_app "${2:-}"
    ;;
  api) start_api ;;
  metro) start_metro ;;
  open) open_app "${2:-}" ;;
  stop)
    scripts/sim.sh record-stop >/dev/null 2>&1 || true
    stop_one metro
    stop_one api.launcher
    stop_one api
    ;;
  status)
    for n in api metro; do if alive $n; then echo "$n: running (pid $(cat .run/$n.pid))"; else echo "$n: stopped"; fi; done
    ;;
  *) sed -n '2,11p' "$0"; exit 2 ;;
esac
