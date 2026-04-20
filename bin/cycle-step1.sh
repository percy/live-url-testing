#!/bin/bash
# Step 1 of the cycle pipeline: prep environment + create per-cycle Percy projects.
#
# Runs in a single shell invocation (not split across BK `commands:` array
# entries) so shell-set env vars like CYCLE_ID persist through the whole step.
# Also avoids BK's YAML `$VAR` interpolation eating our shell variables.
#
# Required env (pipeline-level in BK):
#   ENCRYPTION_PASSWORD   decrypts configs/prod.js (holds PERCY_USER_TOKEN + team id)
#
# Reads automatically from BK:
#   BUILDKITE_BUILD_NUMBER
#
# Side effects:
#   - CYCLE_ID meta-data set
#   - 8 per-project meta-data keys set by bin/create-projects.js
#   - configs/prod.js re-encrypted before step ends

set -euo pipefail

# Ensure Node 20 is present on whichever BK agent picked up this step.
if [ -s "${HOME}/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "${HOME}/.nvm/nvm.sh"
  nvm install 20
  nvm use 20
fi

if [ -z "${ENCRYPTION_PASSWORD:-}" ]; then
  echo "ERROR: ENCRYPTION_PASSWORD is not set."
  echo "Open pipeline Settings -> Environment Variables and add ENCRYPTION_PASSWORD."
  exit 1
fi

export CYCLE_ID="${BUILDKITE_BUILD_NUMBER}-$(date +%Y%m%d)"
echo "CYCLE_ID=${CYCLE_ID}"
buildkite-agent meta-data set CYCLE_ID "${CYCLE_ID}"

npm ci

echo ""
echo "=== Decrypt config + cleanup stale projects + create fresh projects ==="
npm run decrypt:config

# Cleanup is best-effort: don't fail the cycle if it errors (e.g. transient API flake).
node bin/cleanup-old-projects.js --max-age-days=90 || echo "WARN: cleanup-old-projects failed (non-fatal)"

node bin/create-projects.js

# Re-encrypt so the decrypted form never leaves the agent beyond this step.
npm run encrypt:config
