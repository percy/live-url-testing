# percy-live-url-test

Playwright + Percy visual regression pipeline for Percy's **browser-upgrade validation cycle**.

One Buildkite build on [`percy/live-url-test`](https://buildkite.com/percy/live-url-test) runs the whole cycle end-to-end — creates fresh per-cycle Percy projects, runs 25 curated URLs as baselines, waits for an operator to upgrade browsers (once platform-ops ships that automation), runs comparisons, and publishes per-snapshot diffs.

---

## Quickstart for engineers

**How to run a full validation cycle:**

1. Open [`percy/live-url-test`](https://buildkite.com/percy/live-url-test) in Buildkite.
2. Click **New Build**.
3. (Optional) Expand **Options → Environment Variables** and add the browser family you want to test:
   ```
   TARGET_BROWSERS=chrome_on_android
   ```
   See [Selecting browsers](#selecting-browsers-via-target_browsers) below for all accepted values.
4. Click **Create Build**.

That's it. No tokens, passwords, or config files to set — everything is wired up at the pipeline level.

Total runtime: ~15 min when all 6 browser families are active, ~5–8 min when only one family is targeted.

---

## What one build does (pipeline flow)

```
Step 1 — Prep + create projects
  - decrypts configs/prod.js using ENCRYPTION_PASSWORD (stored in BK pipeline config)
  - archives any auto-live-url-* Percy projects older than 90 days
  - creates auto-live-url-<cycle>-js-enabled + auto-live-url-<cycle>-js-disabled
  - if TARGET_BROWSERS is set: syncs each project to exactly those browser families
    (adds missing families via POST /project-browser-targets, deletes extras via DELETE)
  - emits per-project master token + IDs + slugs as BK meta-data
  - re-encrypts configs/prod.js (decrypted form never leaves this step)

Step 2 — Baselines  (parallel, per JS mode)
  - PERCY_BRANCH=master  (project default branch, where Percy anchors diffs)
  - npx percy exec -- playwright test tests/percy_web.spec.js (25 URLs, 5 workers)
  - PERCY_IGNORE_TIMEOUT_ERROR=true (tolerate slow-loading assets)
  - wait-for-build.js polls Percy API until each build state=finished

Step 3 — Settle 30s
  - single BK step; gives Percy server-side processing a final buffer
    before comparisons start uploading on the next branch

Step 4 — Comparisons  (parallel, per JS mode)
  - PERCY_BRANCH=staging  (non-default branch; Percy auto-compares vs latest master)
  - same test + wait-for-finalize flow as baselines

Step 5 — Fetch diffs + annotate report
  - 10s settle
  - for each project: fetches latest build on the staging branch via Percy API
  - writes diff-report.json + diff-report.md artifacts
  - posts a BK annotation pinned to the top of the build page
    (2 sections: JS=enabled + JS=disabled; per-snapshot diff% + clickable snapshot links)
```

**Browser-upgrade step (between 3 and 4):** currently a placeholder. Operator can manually upgrade browser versions in Percy's UI on the two per-cycle projects after baselines finish — or wait for platform-ops to ship an automation endpoint we can call as an additional BK step.

---

## Selecting browsers via `TARGET_BROWSERS`

Control which browser families render on each per-cycle Percy project. Set this at **build trigger time** (BK UI → New Build → Environment Variables, or `mcp__buildkite__create_build` `environment`).

| Family | Accepted values | Percy family ID |
|---|---|---|
| Firefox | `firefox` or `1` | 1 |
| Chrome | `chrome` or `2` | 2 |
| Edge | `edge` or `3` | 3 |
| Safari | `safari` or `4` | 4 |
| Safari on iPhone | `iphone` **or** `safari_on_iphone` or `5` | 5 |
| Chrome on Android | `android` **or** `chrome_on_android` or `6` | 6 |

**Examples:**

```bash
TARGET_BROWSERS=chrome_on_android            # validate Chrome-on-Android upgrade
TARGET_BROWSERS=android                      # alias for above
TARGET_BROWSERS=chrome,firefox               # two desktop browsers
TARGET_BROWSERS=iphone,android               # both mobile families
TARGET_BROWSERS=5,6                          # numeric family IDs
                                             # (unset) -> Percy's default 4 desktop browsers
```

Case-insensitive, CSV, dedupes automatically. If omitted, each project keeps Percy's default 4-desktop set.

---

## Typical browser-upgrade validation flow

1. Engineer: *"I'm validating Chrome-on-Android N → N+1 this week."*
2. Trigger BK build with `TARGET_BROWSERS=chrome_on_android`.
3. Pipeline runs Step 1 — creates two Percy projects, each with only Chrome on Android enabled.
4. Pipeline runs Step 2 — baselines on browser version N (all 25 URLs, both JS modes), ends on `PERCY_BRANCH=master`.
5. Pipeline pauses at the Settle 30s step. (Future: a `block:` or automation step upgrades Percy's Chrome-on-Android target to version N+1.)
6. Pipeline runs Step 4 — comparisons on version N+1, on `PERCY_BRANCH=staging`.
7. Step 5 report surfaces every snapshot where browser-upgrade caused a pixel diff. Each row links directly to the Percy snapshot comparison view.

---

## Pipeline configuration

Stored at the Buildkite pipeline level (not in git):

| Setting | Value | Scope |
|---|---|---|
| `ENCRYPTION_PASSWORD` | decrypts `configs/prod.js` | Pipeline env var (auto-injected on every build) |
| Repository | `https://github.com/percy/live-url-testing` (public, anon HTTPS clone) | Pipeline settings |
| Default branch | `main` | Pipeline settings |
| Bootstrap YAML | `env: ENCRYPTION_PASSWORD: ...` + `buildkite-agent pipeline upload .buildkite/pipeline.yml` | Pipeline configuration |

Cycle steps live in `.buildkite/pipeline.yml` (read at each build).

---

## Config encryption (`configs/prod.js`)

Secrets (Percy user token + team ID) live in `configs/prod.js`, **always committed encrypted** (AES-256-CBC, format `<iv_hex>.<cipher_hex>`).

```bash
# decrypt before editing locally
PROFILE=prod ENCRYPTION_PASSWORD='<password>' npm run decrypt:config
# ... edits ...
PROFILE=prod ENCRYPTION_PASSWORD='<password>' npm run encrypt:config
git commit configs/prod.js
```

Both scripts are idempotent. The CI pipeline decrypts at the start of Step 1 and re-encrypts before Step 1 ends, so the decrypted form never lives on the agent fs beyond that one step.

---

## Local debug run (single mode)

For debugging a specific URL or Percy config locally, against a manually-provided token:

```bash
nvm use 20
npm ci
PERCY_TOKEN=<project-master-token> npm run test-web:js-enabled
# or: npm run test-web:js-disabled
```

This bypasses the cycle (no project creation, no sync, no report) — just runs `percy exec -- playwright test` against the 25 URLs.

---

## URL set

25 curated URLs in `tests/percy_web.spec.js`, chosen for cross-browser rendering diversity without dynamic-content churn:

| Category | Samples |
|---|---|
| Text / i18n | `wikipedia-help-testing`, `wikipedia-einstein`, `wikipedia-arabic-article` (RTL), `wikipedia-japanese-article` (CJK), `wikipedia-nasa` |
| Docs / stable | `mdn-css-grid`, `w3c-css`, `httpbin-html`, `nodejs-home`, `bootstrap-home`, `shibhani-regions` |
| Marketing (SaaS) | `stripe-home`, `vercel-home`, `linear-home`, `openai-home`, `imdb-home` |
| BrowserStack | `browserstack-home`, `browserstack-percy`, `browserstack-pricing` |
| Enterprise | `salesforce-home`, `github-home` |
| CSS-heavy / transforms | `tesla-home`, `porsche-usa` |
| Aerospace / gov | `spacex-home`, `nasa-mars-facts` |

URLs known to hang Percy's renderer (`apple-home`, `figma-home`, `nasa-home`, `amazon-home`, `google-play`) have been removed. Replacements are static-first (docs, wikis, framework landings) to keep diff signal driven by the browser engine, not content churn.

---

## Files

| File | Purpose |
|---|---|
| `tests/percy_web.spec.js` | 25 `test(...)` blocks, one per URL; uses `@percy/playwright` |
| `.percy.js-enabled.yml` / `.percy.js-disabled.yml` | Percy config per JS mode |
| `playwright.config.js` | `timeout: 120000`, `dot` reporter, 5 workers |
| `.buildkite/pipeline.yml` | Cycle steps |
| `configs/prod.js` | Encrypted Percy user token + team ID |
| `bin/lib/percy-api.js` | Zero-dep Percy REST wrapper (Node 20 fetch). `createProject`, `getProjectTokens`, `listBuildsForProject`, `listSnapshotsForBuild`, `getComparison`, `getBuild`, `addProjectBrowserFamily`, `removeProjectBrowser`, `listProjectBrowsers` |
| `bin/lib/encryption.js` | AES-256-CBC file encrypt/decrypt |
| `bin/cycle-step1.sh` | Step 1 orchestrator |
| `bin/cycle-step4.sh` | Step 5 orchestrator (diff-report fetch + annotate) |
| `bin/run-percy-mode.sh` | Reusable per-mode × phase runner (called 4× per cycle) |
| `bin/create-projects.js` | Creates 2 fresh projects, syncs browser targets if `TARGET_BROWSERS` set, emits meta-data |
| `bin/cleanup-old-projects.js` | Archives `auto-live-url-*` projects older than N days |
| `bin/wait-for-build.js` | Polls Percy API until a build reaches `state=finished` (terminal) |
| `bin/fetch-diffs.js` | CLI: per-test diff table for one Percy build |
| `bin/collect-cycle-report.js` | Final step: fetch both comparison builds, write `diff-report.{json,md}`, annotate BK |
| `bin/encrypt-config.js` / `bin/decrypt-config.js` | Encryption CLIs |

---

## Notes

- Cycle projects are named `auto-live-url-<build#>-<YYYYMMDD>-js-<enabled|disabled>`. Old ones are archived (`is-enabled: false`) by the cleanup step at the start of each cycle — not deleted; reversible via Percy UI.
- Percy build lifecycle: `pending → processing → finished` (terminal) or `failed`/`expired`. `wait-for-build.js` polls every 15s (15 min timeout) so BK's `wait` only lifts after the Percy build is truly done, not just uploaded.
- `PERCY_IGNORE_TIMEOUT_ERROR=true` is exported in `run-percy-mode.sh` so a single slow-loading asset on one snapshot doesn't take down the whole Percy build — the snapshot is captured anyway and the cycle continues.
- See the [Jira epic PER-7755](https://browserstack.atlassian.net/browse/PER-7755) for background and rollout context.
