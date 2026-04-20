#!/bin/bash
# Emits the dynamic portion of the cycle pipeline YAML, with Percy project tokens
# + IDs baked in as literal values (so child trigger steps can reference them).
#
# Reads from Buildkite meta-data set by bin/create-projects.js.

set -euo pipefail

CYCLE_ID=$(buildkite-agent meta-data get CYCLE_ID)
TOKEN_E=$(buildkite-agent meta-data get PERCY_TOKEN_JS_ENABLED)
TOKEN_D=$(buildkite-agent meta-data get PERCY_TOKEN_JS_DISABLED)

cat <<EOF
steps:
  - group: ":chromium: Step 3 — Baselines (parallel)"
    key: "baselines"
    steps:
      - trigger: "live-url-test"
        label: ":chromium: Baseline JS=enabled"
        build:
          branch: "main"
          message: "[cycle ${CYCLE_ID}] Baseline JS=enabled"
          env:
            PERCY_TOKEN: "${TOKEN_E}"
            JS: "enabled"
            PERCY_BRANCH: "cycle-${CYCLE_ID}"
      - trigger: "live-url-test"
        label: ":chromium: Baseline JS=disabled"
        build:
          branch: "main"
          message: "[cycle ${CYCLE_ID}] Baseline JS=disabled"
          env:
            PERCY_TOKEN: "${TOKEN_D}"
            JS: "disabled"
            PERCY_BRANCH: "cycle-${CYCLE_ID}"

  - wait

  - block: ":hand: Step 4 — Ops: upgrade browser version in Percy projects"
    prompt: "Ask platform-ops to upgrade the browser version on both Percy projects for this cycle, then click Continue. (TODO: replace with automation once platform-ops API lands.)"

  - group: ":chromium: Step 5 — Comparisons (parallel)"
    key: "comparisons"
    steps:
      - trigger: "live-url-test"
        label: ":chromium: Comparison JS=enabled"
        build:
          branch: "main"
          message: "[cycle ${CYCLE_ID}] Comparison JS=enabled"
          env:
            PERCY_TOKEN: "${TOKEN_E}"
            JS: "enabled"
            PERCY_BRANCH: "cycle-${CYCLE_ID}"
      - trigger: "live-url-test"
        label: ":chromium: Comparison JS=disabled"
        build:
          branch: "main"
          message: "[cycle ${CYCLE_ID}] Comparison JS=disabled"
          env:
            PERCY_TOKEN: "${TOKEN_D}"
            JS: "disabled"
            PERCY_BRANCH: "cycle-${CYCLE_ID}"

  - wait

  - label: ":mag: Step 6 — Fetch per-snapshot diffs + annotate report"
    agents:
      os: "linux"
    commands:
      - "source ~/.nvm/nvm.sh && nvm use 20"
      - "node bin/collect-cycle-report.js"
    artifact_paths:
      - "diff-report.json"
      - "diff-report.md"
EOF
