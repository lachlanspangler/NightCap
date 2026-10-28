#!/usr/bin/env bash
# wait-for-quiet.sh — block until this laptop is quiet enough for a heavy job.
#
# NightCap shares the machine with another long-running session (NightOut) that has its own
# simulator, Metro bundler and builds. Before any heavy job (xcodebuild, pod install,
# expo run:ios, maestro, a full e2e, a big npm install) we wait until:
#   1. no xcodebuild / simulator build is running anywhere on the machine, and
#   2. the 1-minute load average is at or below the number of cores.
#
# Usage:  scripts/wait-for-quiet.sh [--max-wait SECONDS] [--interval SECONDS] [--quiet]
#         scripts/wait-for-quiet.sh --check     # one-shot: exit 0 if quiet now, 1 if busy
# Env:    NIGHTCAP_LOAD_FACTOR (default 1.0) scales the load threshold (cores × factor).
#
# It never stops, kills or renices anything. It only looks.
set -euo pipefail

interval=120
max_wait=$((6 * 3600))
check_only=0
quiet=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) interval="$2"; shift 2 ;;
    --max-wait) max_wait="$2"; shift 2 ;;
    --check) check_only=1; shift ;;
    --quiet) quiet=1; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "wait-for-quiet: unknown arg $1" >&2; exit 2 ;;
  esac
done

cores=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)
factor="${NIGHTCAP_LOAD_FACTOR:-1.0}"
threshold=$(awk -v c="$cores" -v f="$factor" 'BEGIN { printf "%.2f", c * f }')

load1() {
  # macOS: "{ 3.21 2.80 2.55 }"; Linux: /proc/loadavg
  if sysctl -n vm.loadavg >/dev/null 2>&1; then
    sysctl -n vm.loadavg | awk '{ print $2 }'
  else
    awk '{ print $1 }' /proc/loadavg
  fi
}

heavy_jobs() {
  # Any heavy build on the machine, ours or anyone else's. We only read the process table.
  # Excludes this script's own grep. Matches: xcodebuild, the Swift/clang compile storm,
  # CocoaPods, maestro test runs, and simulator app builds driven by expo.
  ps -Ao pid=,command= 2>/dev/null \
    | grep -E '(/xcodebuild( |$)|[ /]pod install|maestro test|expo run:ios|XCBBuildService.*build|swift-frontend -frontend -c)' \
    | grep -v -E 'grep -E|wait-for-quiet' || true
}

is_quiet() {
  local l jobs
  l=$(load1)
  jobs=$(heavy_jobs)
  if [[ -n "$jobs" ]]; then
    reason="heavy job running: $(echo "$jobs" | head -1 | awk '{ $1=""; print substr($0, 2, 90) }')"
    return 1
  fi
  if awk -v l="$l" -v t="$threshold" 'BEGIN { exit !(l > t) }'; then
    reason="load ${l} > ${threshold} (${cores} cores × ${factor})"
    return 1
  fi
  reason="load ${l} ≤ ${threshold}, no heavy jobs"
  return 0
}

reason=""
if [[ $check_only -eq 1 ]]; then
  if is_quiet; then echo "quiet: $reason"; exit 0; else echo "busy: $reason"; exit 1; fi
fi

start=$(date +%s)
while true; do
  if is_quiet; then
    [[ $quiet -eq 1 ]] || echo "wait-for-quiet: go ($reason)"
    exit 0
  fi
  now=$(date +%s)
  waited=$((now - start))
  if (( waited >= max_wait )); then
    echo "wait-for-quiet: gave up after ${waited}s ($reason)" >&2
    exit 3
  fi
  [[ $quiet -eq 1 ]] || echo "wait-for-quiet: $(date +%H:%M:%S) busy — $reason; rechecking in ${interval}s"
  sleep "$interval"
done
