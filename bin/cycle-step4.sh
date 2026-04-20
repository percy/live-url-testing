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

# node_modules isn't carried across parallel agents, so re-install for the
# collect step's own npm dependencies (currently none runtime but keeps shape
# consistent if we add any).
npm ci

node bin/collect-cycle-report.js
