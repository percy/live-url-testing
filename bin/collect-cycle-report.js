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
  getProjectBrowserTargets,
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

function classify(runsWithDiff, totalRuns) {
  if (runsWithDiff === 0) return 'stable';
  if (runsWithDiff === totalRuns) return 'regression';
  return 'flaky';
}

function stats(values) {
  if (!values.length) return { avg: 0, max: 0, stdev: 0 };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return { avg, max, stdev: Math.sqrt(variance) };
}

async function collectMode(mode, { userToken, teamId }) {
  const suffix = mode.toUpperCase();
  const token = meta(`PERCY_TOKEN_JS_${suffix}`);
  const projectSlug = meta(`PERCY_PROJECT_SLUG_JS_${suffix}`);

  // Fresh browser-target map (captures any post-baseline browser upgrade).
  const browserTargets = await getProjectBrowserTargets({
    userToken,
    teamId,
    projectSlug: projectSlugTail(projectSlug),
  });

  // Resolve the N comparison build IDs that were uploaded this cycle.
  const buildIds = [];
  for (let i = 1; i <= COMPARISON_RUN_COUNT; i++) {
    const v = meta(`PERCY_BUILD_ID_JS_${suffix}_COMPARISON_${i}`, { optional: true });
    if (v) buildIds.push({ run: i, buildId: v });
  }
  if (!buildIds.length) {
    return { mode, empty: true, projectSlug, reason: 'no comparison build IDs in meta-data' };
  }

  // Fetch snapshots+comparisons for every run in parallel.
  const perRun = await Promise.all(
    buildIds.map(async ({ run, buildId }) => {
      const rows = await listComparisonsForBuild({ token, buildId });
      return { run, buildId, rows };
    })
  );

  // Percy build web-url shape: https://percy.io/<fullSlug>/builds/<n>. We don't
  // have the build-number client-side, but Percy accepts the id form too.
  const buildWebUrl = (buildId) => `https://percy.io/${projectSlug}/builds/${buildId}`;

  // Aggregate key:  <snapshotName>||<browserTargetId>
  const agg = new Map();
  const nowEmpty = () => ({
    snapshot: null,      // { name, ids: Map<run, snapshotId> }
    browser: null,       // { family, major, version, slug, os, display }
    perRun: [],          // [{ run, buildId, snapshotId, diffRatio, snapshotUrl }]
  });

  for (const { run, buildId, rows } of perRun) {
    for (const { snapshot, comparison } of rows) {
      const btId = comparison.browserTargetId;
      if (!btId) continue; // shouldn't happen, but skip rather than crash
      const key = `${snapshot.name}||${btId}`;
      if (!agg.has(key)) {
        const entry = nowEmpty();
        entry.snapshot = { name: snapshot.name };
        entry.browser = browserTargets[btId] || { display: `unknown(${btId})`, family: 'unknown', major: '', version: '', slug: '', os: '' };
        agg.set(key, entry);
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

  // Finalize entries: classify + stats.
  const entries = [];
  for (const entry of agg.values()) {
    const diffValues = entry.perRun.filter((r) => (r.diffRatio || 0) > MIN_DIFF_THRESHOLD).map((r) => r.diffRatio);
    const totalRuns = entry.perRun.length;
    const runsWithDiff = diffValues.length;
    const s = stats(entry.perRun.map((r) => r.diffRatio || 0));
    entries.push({
      snapshot: entry.snapshot.name,
      browser: entry.browser,
      totalRuns,
      runsWithDiff,
      classification: classify(runsWithDiff, totalRuns),
      avg: s.avg,
      max: s.max,
      stdev: s.stdev,
      perRun: entry.perRun.sort((a, b) => a.run - b.run),
    });
  }

  // Sort: worst first inside each category is handled at render time.
  entries.sort((a, b) => a.snapshot.localeCompare(b.snapshot) || a.browser.display.localeCompare(b.browser.display));

  return {
    mode,
    projectSlug,
    buildIds,
    entries,
    browserTargetCount: Object.keys(browserTargets).length,
  };
}

function summary(section) {
  const byClass = { regression: 0, flaky: 0, stable: 0 };
  for (const e of section.entries) byClass[e.classification]++;
  return byClass;
}

function fmtPct(n) {
  return `${(n * 100).toFixed(2)}%`;
}

function renderMarkdownForMode(section) {
  if (section.empty) {
    return [`## JS=${section.mode} — no data`, `_${section.reason}_`, ''].join('\n');
  }
  const byClass = summary(section);
  const runCount = section.buildIds.length;
  const out = [];
  out.push(`## JS=${section.mode}`);
  out.push('');
  out.push(`- Project: \`${section.projectSlug}\``);
  out.push(`- Runs aggregated: **${runCount}** comparison build${runCount === 1 ? '' : 's'}`);
  out.push(`- Browsers: **${section.browserTargetCount}**`);
  out.push(`- 🔴 Regressions: **${byClass.regression}**  |  🟡 Flaky: **${byClass.flaky}**  |  🟢 Stable: **${byClass.stable}**`);
  out.push('');

  // -- Regressions (worst first)
  const regressions = section.entries
    .filter((e) => e.classification === 'regression')
    .sort((a, b) => b.avg - a.avg);
  out.push(`### 🔴 Regressions — diff in all ${runCount} runs (action needed)`);
  if (!regressions.length) {
    out.push('_None._');
    out.push('');
  } else {
    out.push('');
    out.push('| Snapshot | Browser | Avg diff | Max diff | Stdev | Per-run links |');
    out.push('|---|---|---:|---:|---:|---|');
    for (const e of regressions) {
      const links = e.perRun.map((r) => `[${r.run}](${r.snapshotUrl})`).join(' ');
      out.push(`| ${e.snapshot} | ${e.browser.display} | ${fmtPct(e.avg)} | ${fmtPct(e.max)} | ${e.stdev.toFixed(4)} | ${links} |`);
    }
    out.push('');
  }

  // -- Flaky (ordered by runs_with_diff desc then avg desc)
  const flaky = section.entries
    .filter((e) => e.classification === 'flaky')
    .sort((a, b) => b.runsWithDiff - a.runsWithDiff || b.avg - a.avg);
  out.push(`### 🟡 Flaky — diff in some runs, not others (likely site noise)`);
  if (!flaky.length) {
    out.push('_None._');
    out.push('');
  } else {
    out.push('');
    out.push('| Snapshot | Browser | Runs w/ diff | Max diff | Avg diff | Per-run links |');
    out.push('|---|---|:---:|---:|---:|---|');
    for (const e of flaky) {
      const links = e.perRun
        .map((r) => {
          const marker = (r.diffRatio || 0) > MIN_DIFF_THRESHOLD ? `**[${r.run}]**` : `[${r.run}]`;
          return `${marker}(${r.snapshotUrl})`;
        })
        .join(' ');
      out.push(`| ${e.snapshot} | ${e.browser.display} | ${e.runsWithDiff}/${e.totalRuns} | ${fmtPct(e.max)} | ${fmtPct(e.avg)} | ${links} |`);
    }
    out.push('');
  }

  // -- Stable (collapsed)
  const stable = section.entries.filter((e) => e.classification === 'stable');
  out.push(`### 🟢 Stable — no diffs in any run (${stable.length} rows)`);
  if (stable.length) {
    out.push('');
    out.push('<details><summary>Show stable snapshots</summary>');
    out.push('');
    out.push('| Snapshot | Browser |');
    out.push('|---|---|');
    for (const e of stable) out.push(`| ${e.snapshot} | ${e.browser.display} |`);
    out.push('');
    out.push('</details>');
  }
  out.push('');

  return out.join('\n');
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
    const c = summary(s);
    const impact =
      c.regression === 0 ? '✅ GREEN' :
      c.regression <= 3 ? '🟠 MEDIUM' : '🔴 HIGH';
    banner.push(`- **JS=${s.mode}** — 🔴 ${c.regression} regressions  |  🟡 ${c.flaky} flaky  |  🟢 ${c.stable} stable  →  ${impact}`);
  }
  banner.push('');

  return [header, ...banner, ...sections.map(renderMarkdownForMode)].join('\n');
}

async function main() {
  const cfg = loadConfig();
  const { PERCY_USER_TOKEN: userToken, PERCY_TEAM_ID: teamId } = cfg;

  const cycleId = meta('CYCLE_ID');
  const baselineCommit = meta('BASELINE_COMMIT');

  const [enabled, disabled] = await Promise.all([
    collectMode('enabled', { userToken, teamId }),
    collectMode('disabled', { userToken, teamId }),
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
    const c = summary(s);
    console.log(`\n── JS=${s.mode}: 🔴 ${c.regression}  🟡 ${c.flaky}  🟢 ${c.stable}  (${s.entries.length} total rows, ${s.buildIds.length} runs)`);
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
        entries: s.entries,
      };
    }),
  };
  fs.writeFileSync('diff-report.json', JSON.stringify(json, null, 2));

  // BK annotation — short banner + a pointer to the full artifact.
  const totalRegressions = sections.reduce(
    (n, s) => n + (s.empty ? 0 : summary(s).regression),
    0
  );
  const style = totalRegressions === 0 ? 'success' : totalRegressions <= 3 ? 'warning' : 'error';
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
