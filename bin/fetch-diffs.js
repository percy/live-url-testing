#!/usr/bin/env node
// Fetch per-test diff data for a Percy build and emit a report to stdout + optional JSON file.
//
// Usage:
//   node bin/fetch-diffs.js --build-id=<percy-build-id> --token=<project-master-token> [--json=path]
//   node bin/fetch-diffs.js --latest --project-id=<id> --token=<project-master-token> [--branch=<x>]
//
// Output: structured stdout (human-readable, emoji-free for BK) + optional JSON file.
// Designed to be called twice per cycle (once per JS mode) and combined by report.js.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { listBuildsForProject, listSnapshotsForBuild } = require('./lib/percy-api');

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

async function resolveBuildId(args) {
  if (args['build-id']) return args['build-id'];
  if (args.latest && args['project-id']) {
    const builds = await listBuildsForProject({
      token: args.token,
      projectId: args['project-id'],
      branch: args.branch,
      limit: 1,
    });
    if (!builds.length) throw new Error(`no builds found for project ${args['project-id']}`);
    return builds[0].id;
  }
  throw new Error('pass --build-id=<id> or --latest --project-id=<id>');
}

function classify(snap) {
  // Percy's review-state-reason tells us what's going on:
  //   "no_diffs"              -> no diff vs baseline
  //   "unreviewed_comparisons"-> diff exists, needs human review
  //   (empty) + approved      -> user approved
  if (snap.reviewStateReason === 'no_diffs') return 'no_diff';
  if (snap.reviewStateReason === 'unreviewed_comparisons') return 'diff';
  if (snap.reviewState === 'approved') return 'approved';
  if (snap.reviewState === 'rejected') return 'rejected';
  return 'other';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.token) {
    console.error('ERROR: --token=<percy-token> is required');
    process.exit(2);
  }

  const buildId = await resolveBuildId(args);
  const snapshots = await listSnapshotsForBuild({ token: args.token, buildId });

  const tests = snapshots.map((s) => ({
    name: s.name,
    status: classify(s),
    diffRatio: s.diffRatio || 0,
    aiDiffRatio: s.aiDiffRatio || 0,
    reviewState: s.reviewState,
    reviewStateReason: s.reviewStateReason,
    snapshotId: s.id,
  }));

  const diffTests = tests.filter((t) => t.status === 'diff');
  const summary = {
    buildId,
    total: tests.length,
    withDiff: diffTests.length,
    noDiff: tests.filter((t) => t.status === 'no_diff').length,
    approved: tests.filter((t) => t.status === 'approved').length,
    other: tests.filter((t) => t.status === 'other' || t.status === 'rejected').length,
  };

  const report = { summary, tests };

  if (args.json) {
    fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
    fs.writeFileSync(path.resolve(args.json), JSON.stringify(report, null, 2));
    console.error(`[fetch-diffs] wrote ${args.json}`);
  }

  // Human-readable stdout
  console.log(`Build ${buildId}`);
  console.log(`  total=${summary.total}  diff=${summary.withDiff}  no_diff=${summary.noDiff}  approved=${summary.approved}  other=${summary.other}`);
  if (diffTests.length) {
    console.log('  Diffs:');
    for (const t of diffTests) {
      const pct = (t.diffRatio * 100).toFixed(2);
      const aiPct = (t.aiDiffRatio * 100).toFixed(2);
      console.log(`    [diff] ${t.name.padEnd(36)}  diff=${pct}%  ai=${aiPct}%  snapshot=${t.snapshotId}`);
    }
  }

  // Exit 0 regardless of diff presence — orchestrator decides success/fail semantics.
  process.exit(0);
}

main().catch((err) => {
  console.error('[fetch-diffs] FATAL:', err.message);
  process.exit(1);
});
