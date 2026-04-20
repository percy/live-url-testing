# percy-live-url-test

Playwright + Percy visual regression pipeline for Percy's browser-upgrade validation cycle.

One Buildkite build on [`percy/live-url-test`](https://buildkite.com/percy/live-url-test) executes the whole cycle end-to-end: creates fresh per-cycle Percy projects, runs 25 URLs through both JS=enabled and JS=disabled baselines, then runs the matching comparisons in parallel, then publishes per-snapshot diff data as a BK artifact + annotation.

## What one build does

```
Step 1: Prep + create projects
  - decrypts configs/prod.js using ENCRYPTION_PASSWORD
  - archives any auto-live-url-* Percy projects older than 90 days
  - creates auto-live-url-<cycle>-js-enabled + auto-live-url-<cycle>-js-disabled
  - writes each project's write_only/read_only tokens + IDs to BK meta-data
  - re-encrypts configs/prod.js (secrets never linger on the agent fs)

Step 2: Baselines (parallel, one agent per JS mode)
  - percy exec -- playwright test tests/percy_web.spec.js (25 URLs, 5 workers)
  - per-snapshot diff listing printed inline at tail of each mode's log
  - PERCY_BRANCH=cycle-<cycle-id>

Step 3: Comparisons (parallel, same shape as step 2)
  - same PERCY_BRANCH so Percy natively chains the comparison against the baseline

Step 4: Fetch diffs + annotate report
  - for each project: fetch latest build on cycle-<cycle-id> branch via Percy API
  - extract per-snapshot diff-ratio, review-state, snapshot links
  - write diff-report.json + diff-report.md as BK artifacts
  - post a buildkite-agent annotation pinned to top of the build page
    (2 sections: JS=enabled + JS=disabled, with per-diff Percy snapshot links)
```

The browser-upgrade step is **currently skipped** — baselines and comparisons run back-to-back on the same browser (so comparisons show ~0 diffs unless Percy has some rendering flake). A `block:` step will be re-inserted once platform-ops ships a browser-upgrade automation endpoint that can be hit from the pipeline.

## Triggering a build

1. Open the pipeline in Buildkite → **New Build**
2. No env vars needed at build time
3. **Create Build**

Pipeline-level env var required (one-time Setup → Environment Variables):

- `ENCRYPTION_PASSWORD` — decrypts `configs/prod.js` (holds Percy user token + team ID)

## Local run of a single JS mode

Still possible for debug, against a manually-provided token:

```bash
nvm use 20
npm ci
PERCY_TOKEN=<project-write-token> npm run test-web:js-enabled
# or test-web:js-disabled
```

This bypasses the cycle (no create-projects, no diff report) and just does `percy exec -- playwright test`.

## Config encryption (`configs/prod.js`)

Secrets live in `configs/prod.js`, **always committed encrypted** (AES-256-CBC, same format as `BStackAutomation/percy/ui/configs/prod.js`).

```bash
# decrypt before editing locally
PROFILE=prod ENCRYPTION_PASSWORD='<password>' npm run decrypt:config
# ... edits ...
PROFILE=prod ENCRYPTION_PASSWORD='<password>' npm run encrypt:config
git commit configs/prod.js
```

Both scripts are idempotent (detect the current state). The CI pipeline decrypts at the start of step 1 and re-encrypts before the step ends, so the decrypted form never leaves the agent beyond that one step.

## Files

- `tests/percy_web.spec.js` — 25 `test(...)` blocks, one per URL; uses `@percy/playwright`
- `.percy.js-enabled.yml` / `.percy.js-disabled.yml` — Percy config per JS mode
- `playwright.config.js` — global `timeout: 120000`, `dot` reporter
- `.buildkite/pipeline.yml` — single consolidated pipeline
- `configs/prod.js` — encrypted config (Percy user token + team ID)
- `bin/lib/percy-api.js` — Percy REST wrapper (zero deps)
- `bin/lib/encryption.js` — AES-256-CBC file encrypt/decrypt
- `bin/create-projects.js` — creates 2 fresh per-cycle projects, emits meta-data
- `bin/cleanup-old-projects.js` — archives `auto-live-url-*` projects older than N days
- `bin/run-percy-mode.sh` — reusable runner invoked per JS mode × phase
- `bin/fetch-diffs.js` — CLI: per-test diff table for one Percy build
- `bin/collect-cycle-report.js` — final step: fetch both comparison builds' diffs, write report, annotate BK
- `bin/report.js` — standalone 2-report merger (local dev)
- `bin/encrypt-config.js` / `bin/decrypt-config.js` — encryption CLIs

## Notes

- First build after merging this pipeline creates fresh Percy projects. Pre-existing `live-url-testing-js-enabled` / `-js-disabled` projects are no longer used by this pipeline; they remain untouched in Percy if needed for historical reference.
- Cycle projects are named `auto-live-url-<build#>-<YYYYMMDD>-js-<enabled|disabled>`. Old ones are archived (`is-enabled: false`) by the cleanup step at the start of each cycle, not deleted — reversible via Percy UI or the same script with `--max-age-days=0 --dry-run` removed.
