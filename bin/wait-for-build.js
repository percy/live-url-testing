#!/usr/bin/env node
// Poll Percy until a build reaches a terminal state (finished/failed/expired),
// then sleep a configurable buffer so comparison builds see a fully-settled
// baseline.
//
// Why: `percy exec` returns as soon as snapshot upload + finalize API calls
// complete. Percy then runs server-side processing (render, diff, comparisons)
// asynchronously. If the next BK step starts immediately, its comparison
// build may race against an unfinalized master baseline.
//
// Usage:
//   node bin/wait-for-build.js --build-id=<id> --token=<master-token> \
//     [--timeout-seconds=900] [--interval-seconds=15] [--post-sleep-seconds=30]
//
// Exits 0 on finished, 1 on failed/expired/timeout.

'use strict';

const { getBuild } = require('./lib/percy-api');

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const buildId = args['build-id'];
  const token = args.token;
  if (!buildId) { console.error('ERROR: --build-id required'); process.exit(2); }
  if (!token) { console.error('ERROR: --token required'); process.exit(2); }

  const timeoutSec = parseInt(args['timeout-seconds'] || '900', 10);
  const intervalSec = parseInt(args['interval-seconds'] || '15', 10);
  const postSleepSec = parseInt(args['post-sleep-seconds'] || '30', 10);

  const TERMINAL_OK = new Set(['finished']);
  const TERMINAL_FAIL = new Set(['failed', 'expired']);

  const deadline = Date.now() + timeoutSec * 1000;
  let lastState = null;
  let pollCount = 0;

  console.log(`[wait-for-build] polling build ${buildId} (timeout=${timeoutSec}s, interval=${intervalSec}s)`);

  while (Date.now() < deadline) {
    pollCount += 1;
    let build;
    try {
      build = await getBuild({ token, buildId });
    } catch (e) {
      console.error(`[wait-for-build] poll #${pollCount} error: ${e.message}`);
      await sleep(intervalSec * 1000);
      continue;
    }
    if (build.state !== lastState) {
      console.log(`[wait-for-build] poll #${pollCount}: state=${build.state} snapshots=${build.totalSnapshots ?? '?'} comparisons=${build.totalComparisons ?? '?'}`);
      lastState = build.state;
    }
    if (TERMINAL_OK.has(build.state)) {
      console.log(`[wait-for-build] build ${buildId} finalized.  sleeping ${postSleepSec}s for safety buffer...`);
      await sleep(postSleepSec * 1000);
      console.log(`[wait-for-build] done.`);
      process.exit(0);
    }
    if (TERMINAL_FAIL.has(build.state)) {
      console.error(`[wait-for-build] build ${buildId} ended in state=${build.state}`);
      process.exit(1);
    }
    await sleep(intervalSec * 1000);
  }
  console.error(`[wait-for-build] timed out after ${timeoutSec}s (last state=${lastState})`);
  process.exit(1);
}

main().catch((e) => {
  console.error('[wait-for-build] FATAL:', e.message);
  process.exit(1);
});
