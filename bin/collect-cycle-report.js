#!/usr/bin/env node
// Aggregate N comparison builds per JS mode into a single Layer-2 diff report.
//
// Layer 2 shape (per JS mode):
//   1. Regressions — every run had a diff. Real browser-upgrade impact.
//   2. Flaky      — some runs had a diff, some didn't. Likely site noise.
//   3. Stable     — no run had a diff. Collapsed summary only.
//
// Each row is (snapshot × browser-target). Browser-targets are resolved AFTER
// comparisons ran (so post-upgrade version numbers get labelled correctly).
//
// Meta-data contract (set upstream):
//   CYCLE_ID
//   BASELINE_COMMIT
//   PERCY_TOKEN_JS_<MODE>             full-access project token
//   PERCY_PROJECT_ID_JS_<MODE>
//   PERCY_PROJECT_SLUG_JS_<MODE>
//   PERCY_BUILD_ID_JS_<MODE>_BASELINE
//   PERCY_BUILD_ID_JS_<MODE>_COMPARISON_<N>   for N in 1..COMPARISON_RUN_COUNT
//
// Config (for org-level browser-target fetch):
//   Reuses configs/<PROFILE>.js (PROFILE=prod) just like create-projects.js.
//   Config must be decrypted by cycle-step4.sh BEFORE this script runs.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const {
  listComparisonsForBuild,
  getBuild,
} = require('./lib/percy-api');

const COMPARISON_RUN_COUNT = Number(process.env.COMPARISON_RUN_COUNT || 5);
const MIN_DIFF_THRESHOLD = Number(process.env.MIN_DIFF_THRESHOLD || 0); // raw ratio; 0 = any diff counts

function meta(key, { optional = false } = {}) {
  if (!process.env.BUILDKITE) throw new Error(`BUILDKITE not set — cannot read meta-data "${key}"`);
  try {
    return execSync(`buildkite-agent meta-data get ${key}`, { encoding: 'utf8' }).trim();
  } catch (e) {
    if (optional) return null;
    throw e;
  }
}

function loadConfig() {
  const profile = process.env.PROFILE || 'prod';
  const configPath = path.resolve(`./configs/${profile}.js`);
  let fileCfg = {};
  if (fs.existsSync(configPath)) {
    try {
      fileCfg = require(configPath);
    } catch {
      console.error(`WARN: could not require ${configPath} — is it still encrypted?`);
    }
  }
  const merged = {
    PERCY_USER_TOKEN: process.env.PERCY_USER_TOKEN || fileCfg.PERCY_USER_TOKEN,
    PERCY_TEAM_ID: process.env.PERCY_TEAM_ID || fileCfg.PERCY_TEAM_ID,
    PERCY_BASE_URL: process.env.PERCY_BASE_URL || fileCfg.PERCY_BASE_URL || 'https://percy.io',
  };
  for (const k of ['PERCY_USER_TOKEN', 'PERCY_TEAM_ID']) {
    if (!merged[k]) throw new Error(`${k} missing — set env var or decrypt configs/${profile}.js`);
  }
  process.env.PERCY_BASE_URL = merged.PERCY_BASE_URL;
  return merged;
}

// Strip the "<teamHash>/" prefix from a full-slug — listProjectBrowsers +
// getProjectBrowserTargets want the tail only.
function projectSlugTail(fullSlug) {
  const parts = fullSlug.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : fullSlug;
}

function snapshotUrlFor(buildWebUrl, snapshotId) {
  return `${buildWebUrl.replace(/\/$/, '')}/snapshots/${snapshotId}`;
}


async function collectMode(mode) {
  const suffix = mode.toUpperCase();
  const token = meta(`PERCY_TOKEN_JS_${suffix}`);
  const projectSlug = meta(`PERCY_PROJECT_SLUG_JS_${suffix}`);

  // Resolve the N comparison build IDs that were uploaded this cycle.
  const buildIds = [];
  for (let i = 1; i <= COMPARISON_RUN_COUNT; i++) {
    const v = meta(`PERCY_BUILD_ID_JS_${suffix}_COMPARISON_${i}`, { optional: true });
    if (v) buildIds.push({ run: i, buildId: v });
  }
  if (!buildIds.length) {
    return { mode, empty: true, projectSlug, reason: 'no comparison build IDs in meta-data' };
  }

  // Check each build's terminal state first — Percy backend can mark a build
  // state=failed during processing even after our CLI finalize returned 0.
  // Those builds' snapshot data is unreliable, so filter them from stats and
  // show separately.
  const checked = await Promise.all(
    buildIds.map(async ({ run, buildId }) => {
      try {
        const b = await getBuild({ token, buildId });
        return { run, buildId, state: b.state, webUrl: b.webUrl };
      } catch (e) {
        return { run, buildId, state: 'unreachable', error: e.message };
      }
    })
  );
  const erroredRuns = checked.filter((c) => c.state !== 'finished');
  const okRuns = checked.filter((c) => c.state === 'finished');

  // Fetch snapshots+comparisons only for OK runs.
  const perRun = await Promise.all(
    okRuns.map(async ({ run, buildId }) => {
      const rows = await listComparisonsForBuild({ token, buildId });
      return { run, buildId, rows };
    })
  );

  // Percy build web-url shape: https://percy.io/<fullSlug>/builds/<n>. We don't
  // have the build-number client-side, but Percy accepts the id form too.
  const buildWebUrl = (buildId) => `https://percy.io/${projectSlug}/builds/${buildId}`;

  // Aggregate key:  <snapshotName> || <browserId> || <width>
  // (width included because Percy takes one comparison per responsive width, so
  // a diff at 375px vs 1280px tells different stories and should be distinct rows.)
  const agg = new Map();

  for (const { run, buildId, rows } of perRun) {
    for (const { snapshot, comparison } of rows) {
      const browserId = comparison.browserId;
      const width = comparison.width;
      if (!browserId) continue;
      const key = `${snapshot.name}||${browserId}||${width}`;
      if (!agg.has(key)) {
        const display = width
          ? `${comparison.browserDisplay} @ ${width}px`
          : comparison.browserDisplay;
        agg.set(key, {
          snapshot: { name: snapshot.name },
          browser: {
            display,
            family: comparison.browserFamily,
            version: comparison.browserVersion,
            id: browserId,
            width,
          },
          perRun: [],
        });
      }
      const entry = agg.get(key);
      entry.perRun.push({
        run,
        buildId,
        snapshotId: snapshot.id,
        diffRatio: comparison.diffRatio || 0,
        snapshotUrl: snapshotUrlFor(buildWebUrl(buildId), snapshot.id),
      });
    }
  }

  // Finalize entries. Only perRun is used by the flat renderer; keep totalRuns
  // + runsWithDiff for JSON consumers that may want a quick summary.
  const entries = [];
  for (const entry of agg.values()) {
    const runsWithDiff = entry.perRun.filter((r) => (r.diffRatio || 0) > MIN_DIFF_THRESHOLD).length;
    entries.push({
      snapshot: entry.snapshot.name,
      browser: entry.browser,
      totalRuns: entry.perRun.length,
      runsWithDiff,
      perRun: entry.perRun.sort((a, b) => a.run - b.run),
    });
  }

  entries.sort((a, b) => a.snapshot.localeCompare(b.snapshot) || a.browser.display.localeCompare(b.browser.display));

  // Count unique browsers across all OK comparison data (for the per-mode header).
  const browserDisplaysSeen = new Set(entries.map((e) => e.browser.display));

  return {
    mode,
    projectSlug,
    buildIds,
    okRuns,
    erroredRuns,
    entries,
    browserTargetCount: browserDisplaysSeen.size,
  };
}

function fmtPct(n) {
  return `${(n * 100).toFixed(2)}%`;
}

// An entry is "interesting" if any of its aggregated (state=finished) runs
// produced a diff > threshold. Rows with zero diff across all OK runs are
// dropped entirely — no stable/flaky/regression sections, just one flat table
// listing every (snapshot × browser) that actually changed in at least one run.
function hasAnyDiff(entry) {
  return entry.perRun.some((r) => (r.diffRatio || 0) > MIN_DIFF_THRESHOLD);
}

// Render the per-run cell value. If this run has OK data, show "X.XX%"
// (linked to the snapshot on Percy). If this run errored, show "—".
function cellForRun(perRunByIndex, runIndex) {
  const r = perRunByIndex.get(runIndex);
  if (!r) return '—';
  const pct = fmtPct(r.diffRatio || 0);
  return `[${pct}](${r.snapshotUrl})`;
}

function renderMarkdownForMode(section) {
  if (section.empty) {
    return [`## JS=${section.mode} — no data`, `_${section.reason}_`, ''].join('\n');
  }
  const totalRuns = section.buildIds.length;
  const okCount = section.okRuns.length;
  const erroredCount = section.erroredRuns.length;

  const rows = section.entries
    .filter(hasAnyDiff)
    .sort((a, b) => {
      const aMax = Math.max(0, ...a.perRun.map((r) => r.diffRatio || 0));
      const bMax = Math.max(0, ...b.perRun.map((r) => r.diffRatio || 0));
      return bMax - aMax || a.snapshot.localeCompare(b.snapshot) || a.browser.display.localeCompare(b.browser.display);
    });

  const out = [];
  out.push(`## JS=${section.mode}`);
  out.push('');
  out.push(`- Project: \`${section.projectSlug}\``);
  out.push(`- Runs: **${okCount} / ${totalRuns}**${erroredCount ? ` (${erroredCount} errored on Percy backend)` : ''}`);
  out.push(`- Browsers: **${section.browserTargetCount}**`);
  out.push(`- Rows with any diff: **${rows.length}** (of ${section.entries.length} (snapshot × browser) combos)`);
  out.push('');

  // Errored runs block (Percy-side processing failures — their data isn't
  // reliable enough to aggregate but we surface the build IDs for drill-down).
  if (erroredCount) {
    out.push(`### ⚠️ Errored runs (${erroredCount})`);
    out.push('');
    out.push('| Run | Build | State |');
    out.push('|---|---|---|');
    for (const r of section.erroredRuns) {
      const buildLink = r.webUrl ? `[${r.buildId}](${r.webUrl})` : r.buildId;
      out.push(`| ${r.run} | ${buildLink} | \`${r.state}\` |`);
    }
    out.push('');
  }

  out.push('### Snapshots with diffs');
  out.push('');

  if (!rows.length) {
    out.push('_No diffs across any run for any (snapshot × browser) combo._');
    out.push('');
    return out.join('\n');
  }

  // Column headers: Snapshot | Browser | Run 1 | Run 2 | … | Run N
  const runHeader = Array.from({ length: totalRuns }, (_, i) => `Run ${i + 1}`).join(' | ');
  const runAlign = Array.from({ length: totalRuns }, () => '---:').join(' | ');
  out.push(`| Snapshot | Browser | ${runHeader} |`);
  out.push(`|---|---|${runAlign ? ` ${runAlign} |` : '|'}`);

  for (const e of rows) {
    const perRunByIndex = new Map(e.perRun.map((r) => [r.run, r]));
    const cells = Array.from({ length: totalRuns }, (_, i) => cellForRun(perRunByIndex, i + 1));
    out.push(`| ${e.snapshot} | ${e.browser.display} | ${cells.join(' | ')} |`);
  }
  out.push('');

  return out.join('\n');
}

// Simple per-mode summary used by the top-of-report banner + console output.
function modeSummary(section) {
  if (section.empty) return { rowsWithDiff: 0, totalEntries: 0 };
  const rowsWithDiff = section.entries.filter(hasAnyDiff).length;
  return { rowsWithDiff, totalEntries: section.entries.length };
}

function renderMarkdown(sections, { cycleId, baselineCommit }) {
  const header = [
    `# Percy diff report — Cycle ${cycleId}`,
    '',
    `Baseline pinned via \`PERCY_TARGET_COMMIT=${baselineCommit}\`. Each comparison run was compared against the same baseline (not chained).`,
    '',
  ].join('\n');

  // Top-of-report one-line per mode summary for the at-a-glance read.
  const banner = [];
  for (const s of sections) {
    if (s.empty) {
      banner.push(`- **JS=${s.mode}** — no data (${s.reason})`);
      continue;
    }
    const m = modeSummary(s);
    banner.push(`- **JS=${s.mode}** — ${m.rowsWithDiff} (snapshot × browser) rows with any diff (of ${m.totalEntries})`);
  }
  banner.push('');

  return [header, ...banner, ...sections.map(renderMarkdownForMode)].join('\n');
}

async function main() {
  // Config is loaded only to ensure PERCY_BASE_URL is set; user-token + team-id
  // are no longer needed by the report (browser metadata now rides on each
  // comparison via ?include=browser,browser.browser-family). Keep the call for
  // the side-effect of setting PERCY_BASE_URL in env for percy-api.js.
  loadConfig();

  const cycleId = meta('CYCLE_ID');
  const baselineCommit = meta('BASELINE_COMMIT');

  const [enabled, disabled] = await Promise.all([
    collectMode('enabled'),
    collectMode('disabled'),
  ]);
  const sections = [enabled, disabled];

  console.log('================================================================');
  console.log(`  Cycle ${cycleId} — 5-run pinned-baseline diff report`);
  console.log('================================================================');
  for (const s of sections) {
    if (s.empty) {
      console.log(`\n── JS=${s.mode} — EMPTY — ${s.reason}`);
      continue;
    }
    const m = modeSummary(s);
    console.log(`\n── JS=${s.mode}: ${m.rowsWithDiff} rows with any diff (of ${m.totalEntries} combos, across ${s.buildIds.length} runs, ${s.erroredRuns.length} errored)`);
  }
  console.log('');

  const md = renderMarkdown(sections, { cycleId, baselineCommit });
  fs.writeFileSync('diff-report.md', md);

  const json = {
    cycleId,
    baselineCommit,
    generatedAt: new Date().toISOString(),
    sections: sections.map((s) => {
      if (s.empty) return { mode: s.mode, empty: true, reason: s.reason };
      return {
        mode: s.mode,
        projectSlug: s.projectSlug,
        runs: s.buildIds,
        okRuns: s.okRuns,
        erroredRuns: s.erroredRuns,
        entries: s.entries,
      };
    }),
  };
  fs.writeFileSync('diff-report.json', JSON.stringify(json, null, 2));

  // BK annotation — short banner + a pointer to the full artifact.
  // Style picks up on total rows with any diff — informational at low counts,
  // warning as they grow.
  const totalRowsWithDiff = sections.reduce(
    (n, s) => n + (s.empty ? 0 : modeSummary(s).rowsWithDiff),
    0
  );
  const style = totalRowsWithDiff === 0 ? 'success' : totalRowsWithDiff <= 10 ? 'info' : 'warning';
  try {
    execSync(`buildkite-agent annotate --style ${style} --context percy-diffs`, {
      input: md,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch (e) {
    console.error('[collect] annotate failed (non-fatal):', e.message);
  }
}

main().catch((e) => {
  console.error('[collect-cycle-report] FATAL:', e.message);
  process.exit(1);
});
