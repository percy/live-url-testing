#!/usr/bin/env node
// Aggregate two fetch-diffs JSON reports (JS=enabled + JS=disabled) into one combined report.
// Prints to stdout (for BK log) and posts a buildkite-agent annotation when BUILDKITE is set.
//
// Usage:
//   node bin/report.js --js-enabled=enabled.json --js-disabled=disabled.json [--out=diff-report.md]
//
// Each input is the JSON produced by fetch-diffs.js.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function loadReport(p) {
  if (!p) return null;
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function percyBuildUrl(buildId, orgSlug, projectSlug) {
  if (!orgSlug || !projectSlug) return `https://percy.io/build/${buildId}`;
  return `https://percy.io/${orgSlug}/${projectSlug}/builds/${buildId}`;
}

function renderSection(title, report, ctx) {
  if (!report) return `── ${title} ──\n  (no data)\n`;
  const lines = [];
  lines.push(`── ${title} ──`);
  const { summary, tests } = report;
  const buildUrl = percyBuildUrl(summary.buildId, ctx.orgSlug, ctx[title.replace(/\W/g, '_')]);
  lines.push(`Build:    ${buildUrl}`);
  lines.push(`Snapshots ${summary.total}   diff=${summary.withDiff}   no_diff=${summary.noDiff}`);
  lines.push('');
  const diffs = tests.filter((t) => t.status === 'diff');
  if (!diffs.length) {
    lines.push('  No diffs. All snapshots match baseline.');
  } else {
    for (const t of diffs) {
      const pct = (t.diffRatio * 100).toFixed(2);
      const aiPct = (t.aiDiffRatio * 100).toFixed(2);
      lines.push(`  [diff] ${t.name.padEnd(36)} diff=${pct}%  ai=${aiPct}%`);
    }
    const noDiffCount = tests.filter((t) => t.status === 'no_diff').length;
    if (noDiffCount) lines.push(`  ${noDiffCount} other snapshots: no diff`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderMarkdown(reports, ctx) {
  const sections = [];
  sections.push(`# Percy diff report — ${ctx.cycleId || 'cycle'}`);
  sections.push('');
  for (const [mode, r] of Object.entries(reports)) {
    if (!r) continue;
    const diffs = r.tests.filter((t) => t.status === 'diff');
    sections.push(`## JS=${mode} (${diffs.length} diff${diffs.length === 1 ? '' : 's'} / ${r.summary.total} snapshots)`);
    if (!diffs.length) {
      sections.push('');
      sections.push('No diffs.');
    } else {
      sections.push('');
      sections.push('| Name | diff% | ai% | snapshot |');
      sections.push('|---|---:|---:|---|');
      for (const t of diffs) {
        sections.push(`| ${t.name} | ${(t.diffRatio * 100).toFixed(2)} | ${(t.aiDiffRatio * 100).toFixed(2)} | \`${t.snapshotId}\` |`);
      }
    }
    sections.push('');
  }
  return sections.join('\n');
}

function annotateBK(markdown, totalDiffs) {
  if (!process.env.BUILDKITE) return;
  const style = totalDiffs === 0 ? 'success' : 'warning';
  try {
    execSync(`buildkite-agent annotate --style ${style} --context percy-diffs`, {
      input: markdown,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch (e) {
    console.error('[report] buildkite-agent annotate failed (non-fatal):', e.message);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reports = {
    enabled: loadReport(args['js-enabled']),
    disabled: loadReport(args['js-disabled']),
  };

  const ctx = {
    cycleId: process.env.CYCLE_ID || '',
    orgSlug: process.env.PERCY_ORG_SLUG || '',
  };

  // stdout (lands in BK log)
  console.log('================================================================');
  console.log(`  Per-test diff report${ctx.cycleId ? ` — Cycle ${ctx.cycleId}` : ''}`);
  console.log('================================================================');
  console.log('');
  console.log(renderSection('JS=enabled', reports.enabled, ctx));
  console.log(renderSection('JS=disabled', reports.disabled, ctx));

  const totalDiffs =
    (reports.enabled?.summary.withDiff || 0) +
    (reports.disabled?.summary.withDiff || 0);
  console.log(`Total: ${totalDiffs} snapshot(s) with diffs across both modes.`);

  if (args.out) {
    const md = renderMarkdown(reports, ctx);
    fs.writeFileSync(path.resolve(args.out), md);
    console.error(`[report] wrote ${args.out}`);
    annotateBK(md, totalDiffs);
  }

  process.exit(0);
}

main();
