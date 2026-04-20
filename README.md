# percy-live-url-test

Playwright-based Percy visual regression tests for Percy's browser-upgrade validation cycle.

Replaces the previous `@percy/puppeteer` + Node 14 + GCS-hosted config setup. Triggered from the Buildkite pipeline [`percy/live-url-test`](https://buildkite.com/percy/live-url-test).

## What this does

Captures Percy snapshots of ~50 live URLs across two modes:

- **JS-enabled** — `enableJavaScript: true`. Runs against the `live-url-testing-js-enabled` Percy project.
- **JS-disabled** — `enableJavaScript: false`. Runs against the `live-url-testing-js-disabled` Percy project.

Workflow:

1. Engineer triggers a Buildkite build, pastes `PERCY_TOKEN`, picks `JS_MODE`. Baseline snapshots upload to Percy.
2. `percy-platform-ops` upgrades the browser version on that Percy project (external prod action).
3. Engineer triggers the build again with the same token. Percy auto-compares against the baseline and surfaces diffs.

## Local run

```bash
nvm use 20
npm ci

# JS-enabled mode
PERCY_TOKEN=<token-for-js-enabled-project> npm run test-web:js-enabled

# JS-disabled mode
PERCY_TOKEN=<token-for-js-disabled-project> npm run test-web:js-disabled
```

The `test-web:js-*` scripts copy the matching `.percy.js-<mode>.yml` to `.percy.yml` (gitignored) before running, so Percy CLI picks it up automatically.

## Buildkite

The pipeline definition lives in [`.buildkite/pipeline.yml`](./.buildkite/pipeline.yml).

To trigger a build:

1. Open the pipeline in Buildkite and click **New Build**
2. Click the **Options** dropdown in the modal and expand **Environment Variables**
3. Paste (one per line):
   ```
   PERCY_TOKEN=<your-percy-write-token>
   JS=enabled
   ```
   (or `JS=disabled` for JS-disabled mode)
4. Click **Create Build**

`JS=enabled` activates `.percy.js-enabled.yml`; `JS=disabled` activates `.percy.js-disabled.yml`. The command step validates both vars and fails fast if `PERCY_TOKEN` is missing or `JS` is anything other than `enabled` / `disabled`. Then it runs `npm ci` + `percy exec -- playwright test`.

## Automated cycle pipeline (`percy/live-url-cycle`)

A second Buildkite pipeline wraps the whole browser-upgrade cycle end-to-end with zero per-build human input. It creates per-cycle Percy projects via the Percy REST API, triggers four child `live-url-test` builds (2 baselines + 2 comparisons), then fetches and publishes per-snapshot diffs as a Buildkite annotation.

Cycle flow (defined in `.buildkite/cycle.yml`):

1. `node bin/create-projects.js` — creates `auto-live-url-<cycle>-js-enabled` + `auto-live-url-<cycle>-js-disabled` on the QA-test-team org. Writes each project's `write_only` / `read_only` tokens to Buildkite meta-data.
2. A dynamic pipeline step (`.buildkite/generate-cycle-steps.sh`) upload reads those meta-data values and emits trigger steps for baselines + comparisons with literal tokens baked in.
3. Both baseline child builds run in parallel with `PERCY_BRANCH=<cycle>-baseline`.
4. A `block:` step waits for platform-ops to upgrade the browser version on both Percy projects (replace with an API call once platform-ops ships automation).
5. Both comparison child builds run in parallel with `PERCY_BRANCH=<cycle>-comparison`.
6. `node bin/collect-cycle-report.js` uses the stored read tokens to fetch per-snapshot diff data from both comparison builds, writes `diff-report.json` + `diff-report.md` as BK artifacts, and posts a `buildkite-agent annotate` summary (JS=enabled + JS=disabled sections) with direct snapshot links.

Pipeline-level env vars required on `percy/live-url-cycle`:

- `ENCRYPTION_PASSWORD` — used to decrypt `configs/prod.js` at step 1 (holds Percy user token + team id)
- `PROFILE` — optional; defaults to `prod`

## Config encryption (`configs/prod.js`)

Secrets (the Percy user token, team ID) live in `configs/prod.js`, **always committed encrypted** (AES-256-CBC, same format as `BStackAutomation/percy/ui/configs/prod.js`). The encrypted file is ~200 bytes of hex on a single line: `<iv_hex>.<ciphertext_hex>`.

**Local workflow:**

```bash
# decrypt before editing / testing locally
PROFILE=prod ENCRYPTION_PASSWORD='<password>' npm run decrypt:config

# make edits to configs/prod.js …

# ALWAYS re-encrypt before committing — plaintext must never land in git
PROFILE=prod ENCRYPTION_PASSWORD='<password>' npm run encrypt:config

git add configs/prod.js && git commit -m "..."
```

**How scripts consume it:**

`bin/create-projects.js` resolves config in this order:
1. Env vars (`PERCY_USER_TOKEN`, `PERCY_TEAM_ID`, `PERCY_BASE_URL`) — local overrides win
2. `require('./configs/<PROFILE>.js')` — fails with a friendly message if still encrypted

**Buildkite flow:** step 1 runs `npm run decrypt:config` → `node bin/create-projects.js` → `npm run encrypt:config` in sequence. The agent never leaves the file decrypted after the step finishes.

**Safety check:** the encrypt helper detects already-encrypted files (looks for `exports`) and is idempotent. Decrypt is also idempotent. A plaintext `configs/prod.js` in the diff is always a bug — the encrypted form has no JS syntax, so any `exports` keyword in that path blocks the commit by convention.

### Per-child diff output

Each child `percy/live-url-test` build also prints its own per-snapshot diff listing after `percy exec` finalizes — by parsing the Percy build URL from the CLI log, setting `PERCY_BUILD_ID` as meta-data, and running `node bin/fetch-diffs.js --build-id=$ID`. So diffs are visible both on each child build's own log and in the aggregated cycle annotation.

## Files

- `tests/percy_web.spec.js` — one `test(...)` block per URL; uses `@percy/playwright` for snapshot capture.
- `.percy.js-enabled.yml` / `.percy.js-disabled.yml` — Percy config per JS mode.
- `playwright.config.js` — sets global `timeout: 120000` and `dot` reporter.
- `.buildkite/pipeline.yml` — per-run pipeline (`percy/live-url-test`), triggered by cycle or by hand.
- `.buildkite/cycle.yml` — orchestrator pipeline (`percy/live-url-cycle`).
- `.buildkite/generate-cycle-steps.sh` — dynamic pipeline generator for the middle of the cycle.
- `configs/prod.js` — encrypted config holding the Percy user token + team ID.
- `bin/lib/encryption.js` — AES-256-CBC file encrypt/decrypt (matches bstackautomation-helpers format, zero deps).
- `bin/encrypt-config.js` / `bin/decrypt-config.js` — CLI wrappers.
- `bin/lib/percy-api.js` — thin wrapper over Percy REST API (Node 20 built-in fetch, zero deps).
- `bin/create-projects.js` — creates per-cycle projects + emits tokens as BK meta-data.
- `bin/fetch-diffs.js` — CLI: fetch per-test diffs for a single Percy build.
- `bin/collect-cycle-report.js` — final cycle step: fetches diffs for both comparison builds, writes report, annotates BK.
- `bin/report.js` — standalone merger of two `fetch-diffs` outputs (useful for local dev / one-offs).

## Notes

- First post-migration build per Percy project is a fresh baseline. Pre-migration (`@percy/puppeteer`) builds are not comparable.
- `PERCY_TOKEN` is entered via a Buildkite input field; it is visible in build UI/logs — same exposure as the prior inline-YAML approach.
