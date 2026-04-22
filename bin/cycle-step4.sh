#!/bin/bash
# Step 4 of the cycle pipeline: fetch per-snapshot diffs from both comparison
# builds and publish the combined report (BK artifact + annotation).
#
# Runs on the same pattern as cycle-step1.sh — handles nvm setup itself so the
# pipeline.yml YAML can just call this script.

set -euo pipefail

# Ensure Node 20 is present on whichever BK agent picked up this step.
if [ -s "${HOME}/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "${HOME}/.nvm/nvm.sh"
  nvm install 20
  nvm use 20
fi

# Cross-agent settle buffer: 10 comparison builds just finalized on Percy;
# give the server 10s to fully settle snapshot/comparison data before we
# read per-snapshot diffs.
echo "=== Settling 10s before diff check ==="
sleep 10

# node_modules isn't carried across parallel agents, so re-install for the
# collect step's own npm dependencies (currently none runtime but keeps shape
# consistent if we add any).
npm ci

# Decrypt configs/<PROFILE>.js so collect-cycle-report.js can read
# PERCY_USER_TOKEN + PERCY_TEAM_ID to fetch the (potentially post-upgrade)
# browser-target map. ENCRYPTION_PASSWORD is a pipeline-level env var.
npm run decrypt:config

# Run the report. It reads 5 comparison build IDs per JS mode from meta-data,
# aggregates per (snapshot, browser-target), classifies regression/flaky/stable,
# writes diff-report.md + diff-report.json, and annotates the BK build.
node bin/collect-cycle-report.js

# Re-encrypt so the decrypted form doesn't end up in any residual agent cache.
npm run encrypt:config
