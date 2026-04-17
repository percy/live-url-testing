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

The pipeline definition lives in [`.buildkite/pipeline.yml`](./.buildkite/pipeline.yml). First step collects `PERCY_TOKEN` and `JS_MODE` via a block step, then runs `npm ci` + `percy exec -- playwright test`.

## Files

- `tests/percy_web.spec.js` — one `test(...)` block per URL; uses `@percy/playwright` for snapshot capture.
- `.percy.js-enabled.yml` / `.percy.js-disabled.yml` — Percy config per JS mode. Mirrors `gs://percy-dev-ci-artifacts/percy_yml_js_*`.
- `playwright.config.js` — sets global `timeout: 120000` and `dot` reporter.
- `.buildkite/pipeline.yml` — Buildkite pipeline-as-code.

## Notes

- First post-migration build per Percy project is a fresh baseline. Pre-migration (`@percy/puppeteer`) builds are not comparable.
- `PERCY_TOKEN` is entered via a Buildkite input field; it is visible in build UI/logs — same exposure as the prior inline-YAML approach.
