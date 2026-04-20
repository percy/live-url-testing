#!/usr/bin/env node
// Read per-cycle meta-data, locate comparison builds on each project, fetch per-test
// diffs, merge into one report, print to stdout + write diff-report.json/md + annotate BK.
//
// Runs as the final step of .buildkite/cycle.yml. Meta-data expected:
//   CYCLE_ID                          set by Step 1
//   PERCY_READ_TOKEN_JS_ENABLED       set by create-projects.js
//   PERCY_READ_TOKEN_JS_DISABLED
//   PERCY_PROJECT_ID_JS_ENABLED
//   PERCY_PROJECT_ID_JS_DISABLED
//   PERCY_PROJECT_SLUG_JS_ENABLED
//   PERCY_PROJECT_SLUG_JS_DISABLED

'use strict';

const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { listBuildsForProject, listSnapshotsForBuild } = require('./lib/percy-api');

function meta(key) {
  if (!process.env.BUILDKITE) throw new Error(`BUILDKITE not set — cannot read meta-data "${key}"`);
  return execSync(`buildkite-agent meta-data get ${key}`, { encoding: 'utf8' }).trim();
}

function classify(s) {
  if (s.reviewStateReason === 'no_diffs') return 'no_diff';
  if (s.reviewStateReason === 'unreviewed_comparisons') return 'diff';
  if (s.reviewState === 'approved') return 'approved';
  return 'other';
}

async function collectMode(mode) {
  const suffix = mode.toUpperCase();
  // master token — can read builds/snapshots for its own project.
  const readToken = meta(`PERCY_TOKEN_JS_${suffix}`);
  const projectId = meta(`PERCY_PROJECT_ID_JS_${suffix}`);
  const projectSlug = meta(`PERCY_PROJECT_SLUG_JS_${suffix}`);
  const cycleId = meta('CYCLE_ID');
  const cycleBranch = `cycle-${cycleId}`;

  // Latest build on the cycle branch = the comparison run (2nd of 2 on this branch).
  const builds = await listBuildsForProject({
    readToken,
    projectId,
    branch: cycleBranch,
    limit: 1,
  });
  if (!builds.length) {
    return { mode, empty: true, projectSlug, reason: `no build on branch ${cycleBranch}` };
  }
  const build = builds[0];
  const snapshots = await listSnapshotsForBuild({ readToken, buildId: build.id });
  const tests = snapshots.map((s) => ({
    name: s.name,
    status: classify(s),
    diffRatio: s.diffRatio || 0,
    aiDiffRatio: s.aiDiffRatio || 0,
    snapshotId: s.id,
  }));
  return {
    mode,
    projectSlug,
    build: {
      id: build.id,
      webUrl: build.webUrl,
      totalSnapshots: build.totalSnapshots,
      totalDiff: build.totalDiff,
    },
    tests,
  };
}

function renderText(section) {
  const lines = [];
  lines.push(`── JS=${section.mode} ──`);
  if (section.empty) {
    lines.push(`  (no data: ${section.reason})`);
    return lines.join('\n') + '\n';
  }
  lines.push(`Project: ${section.projectSlug}`);
  lines.push(`Build:   ${section.build.webUrl}`);
  lines.push(`Snapshots ${section.tests.length}   diffs=${section.tests.filter((t) => t.status === 'diff').length}`);
  lines.push('');
  const diffs = section.tests.filter((t) => t.status === 'diff');
  if (!diffs.length) {
    lines.push('  No diffs. All snapshots match baseline.');
  } else {
    for (const t of diffs) {
      const pct = (t.diffRatio * 100).toFixed(2);
      const aiPct = (t.aiDiffRatio * 100).toFixed(2);
      lines.push(`  [diff] ${t.name.padEnd(36)} diff=${pct}%  ai=${aiPct}%  snapshot=${t.snapshotId}`);
    }
    const nd = section.tests.filter((t) => t.status === 'no_diff').length;
    if (nd) lines.push(`  ${nd} other snapshot(s): no diff`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderMarkdown(sections) {
  const out = [];
  out.push(`# Percy diff report — Cycle ${meta('CYCLE_ID')}`);
  out.push('');
  for (const s of sections) {
    if (s.empty) {
      out.push(`## JS=${s.mode} — no data`);
      out.push(`_${s.reason}_`);
      out.push('');
      continue;
    }
    const diffs = s.tests.filter((t) => t.status === 'diff');
    out.push(`## JS=${s.mode} — ${diffs.length} diff${diffs.length === 1 ? '' : 's'} / ${s.tests.length} snapshots`);
    out.push('');
    out.push(`- Project: \`${s.projectSlug}\``);
    out.push(`- Build: [${s.build.id}](${s.build.webUrl})`);
    out.push('');
    if (!diffs.length) {
      out.push('No diffs.');
    } else {
      out.push('| Name | diff% | ai% | snapshot |');
      out.push('|---|---:|---:|---|');
      for (const t of diffs) {
        out.push(`| ${t.name} | ${(t.diffRatio * 100).toFixed(2)} | ${(t.aiDiffRatio * 100).toFixed(2)} | \`${t.snapshotId}\` |`);
      }
    }
    out.push('');
  }
  return out.join('\n');
}

async function main() {
  const [enabled, disabled] = await Promise.all([collectMode('enabled'), collectMode('disabled')]);
  const sections = [enabled, disabled];

  console.log('================================================================');
  console.log(`  Per-test diff report — Cycle ${meta('CYCLE_ID')}`);
  console.log('================================================================');
  console.log('');
  for (const s of sections) console.log(renderText(s));

  const totalDiffs = sections.reduce((n, s) => n + (s.empty ? 0 : s.tests.filter((t) => t.status === 'diff').length), 0);
  console.log(`Total: ${totalDiffs} snapshot(s) with diffs across both modes.`);

  const json = { cycleId: meta('CYCLE_ID'), sections };
  fs.writeFileSync('diff-report.json', JSON.stringify(json, null, 2));
  const md = renderMarkdown(sections);
  fs.writeFileSync('diff-report.md', md);

  // BK annotation — pins summary to top of build page.
  try {
    const style = totalDiffs === 0 ? 'success' : 'warning';
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
