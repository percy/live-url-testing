#!/bin/bash
# Runs one Percy snapshot pass (one JS mode × one phase) and emits per-snapshot
# diffs inline. Reusable across baseline + comparison phases, JS=enabled +
# JS=disabled.
#
# Args:
#   $1  JS mode:   enabled | disabled
#   $2  phase:     baseline | comparison
#
# Reads from BK meta-data (set by Step 1 / create-projects.js):
#   PERCY_TOKEN_JS_<UPPER_JS>       full-access (master) token for the target Percy project
#
# Branch convention:
#   baseline   -> PERCY_BRANCH=master  (project default branch; Percy anchors diffs here)
#   comparison -> PERCY_BRANCH=staging (non-default branch; Percy auto-compares vs master)
#
# Side effects:
#   - runs `npx percy exec -- playwright test` against 25 URLs
#   - tees output to .percy-run-$JS-$PHASE.log
#   - extracts Percy build ID, sets BK meta-data PERCY_BUILD_ID_<UPPER_JS>_<UPPER_PHASE>
#   - calls bin/fetch-diffs.js to print per-snapshot diff table in this log

set -euo pipefail

# Ensure Node 20 is present on whichever BK agent picked up this step.
# `nvm install` is idempotent: installs if missing, no-op if present, always activates.
if [ -s "${HOME}/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "${HOME}/.nvm/nvm.sh"
  nvm install 20
  nvm use 20
fi

JS="${1:?JS arg required (enabled|disabled)}"
PHASE="${2:?PHASE arg required (baseline|comparison)}"

UPPER_JS=$(echo "$JS" | tr '[:lower:]' '[:upper:]')
UPPER_PHASE=$(echo "$PHASE" | tr '[:lower:]' '[:upper:]')

TOKEN_KEY="PERCY_TOKEN_JS_${UPPER_JS}"

# Full-access (master) token — used by both `percy exec` for upload and
# `fetch-diffs.js` for GET /snapshots.
export PERCY_TOKEN=$(buildkite-agent meta-data get "$TOKEN_KEY")

case "$PHASE" in
  baseline)
    export PERCY_BRANCH="master"
    ;;
  comparison)
    export PERCY_BRANCH="staging"
    ;;
  *)
    echo "ERROR: PHASE must be 'baseline' or 'comparison', got: $PHASE" >&2
    exit 2
    ;;
esac

echo "=== Mode: JS=${JS}, Phase: ${PHASE}, PERCY_BRANCH: ${PERCY_BRANCH} ==="

rm -rf .percy.yml test-results/ playwright-report/
cp ".percy.js-${JS}.yml" .percy.yml
echo "=== Active Percy config ==="
cat .percy.yml

npm ci
npx percy --version
npx playwright install --with-deps chromium

LOG=".percy-run-${JS}-${PHASE}.log"
npx percy exec -- npx playwright test tests/percy_web.spec.js --reporter=dot 2>&1 | tee "$LOG"

# Strip ANSI escapes; extract last builds/<digits> occurrence as Percy build ID.
sed -r 's/\x1B\[[0-9;]*[a-zA-Z]//g' "$LOG" > "$LOG.clean"
PERCY_BUILD_ID=$(grep -oE 'builds/[0-9]+' "$LOG.clean" | tail -1 | cut -d/ -f2 || true)

if [ -n "${PERCY_BUILD_ID:-}" ]; then
  echo ""
  echo "=== Percy build id: ${PERCY_BUILD_ID} ==="
  buildkite-agent meta-data set "PERCY_BUILD_ID_${UPPER_JS}_${UPPER_PHASE}" "$PERCY_BUILD_ID"

  echo ""
  echo "=== Waiting for Percy build ${PERCY_BUILD_ID} to finalize (server-side processing) ==="
  # `percy exec` returns after upload+finalize API calls; Percy then runs
  # rendering + diff asynchronously. Poll until state=finished so that when
  # BK's `wait` lifts between groups, both builds are truly done.
  # Cross-agent settle buffers (30s after baselines, 10s after comparisons)
  # are handled by dedicated pipeline steps, not here.
  node bin/wait-for-build.js --build-id="$PERCY_BUILD_ID" --token="$PERCY_TOKEN" --post-sleep-seconds=0
else
  echo "WARN: could not extract Percy build ID from ${LOG}"
  echo "--- last 20 lines of ${LOG} for debugging: ---"
  tail -20 "$LOG" || true
fi
