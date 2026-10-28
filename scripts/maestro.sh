#!/usr/bin/env bash
# maestro.sh — run our Maestro flows against OUR simulator only (by UDID), on a fresh demo world.
#   scripts/maestro.sh [flow.yaml ...]   (default: every non-util flow in .maestro/)
set -euo pipefail
cd "$(dirname "$0")/.."
UDID=$(scripts/sim.sh udid)
curl -fs -X POST http://127.0.0.1:${API_PORT:-8788}/dev/reseed >/dev/null || { echo "API not running: scripts/demo.sh start" >&2; exit 1; }
flows=("$@")
[[ ${#flows[@]} -gt 0 ]] || flows=($(ls .maestro/*.yaml | grep -v '/util-'))
fail=0
for f in "${flows[@]}"; do
  echo "▶ $f"
  out=.run/maestro-out/$(basename "$f" .yaml)
  rm -rf "$out"
  maestro --device "$UDID" test --test-output-dir "$out" "$f" || fail=1
  # Maestro 2.x keeps takeScreenshot output under the test output dir → copy into docs/media.
  find "$out" -path "*takeScreenshot*" -name "*.png" -exec cp {} docs/media/ \;
  # Keep the repo light: screenshots at 1400px tall are plenty to review.
  find docs/media -name "*.png" -newer "$out" -exec sips -Z 1400 {} \; >/dev/null 2>&1 || true
  curl -fs -X POST http://127.0.0.1:${API_PORT:-8788}/dev/reseed >/dev/null
done
exit $fail
