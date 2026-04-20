#!/usr/bin/env node
// Create two per-cycle Percy projects (js-enabled + js-disabled), fetch their
// write_only tokens, and emit them as Buildkite meta-data so downstream steps
// can trigger child builds without human input.
//
// Config resolution (in order):
//   1. Env vars PERCY_USER_TOKEN, PERCY_TEAM_ID, PERCY_BASE_URL (for local dev / overrides)
//   2. ./configs/$PROFILE.js (default PROFILE=prod) — must be decrypted beforehand
//      via `npm run decrypt:config` (ENCRYPTION_PASSWORD env var required).
//
// Env:
//   CYCLE_ID          (required) unique identifier for this cycle, used in project names
//   PROFILE           (optional) defaults to "prod" — which configs/<PROFILE>.js to load
//
// Outputs (when BUILDKITE is set, writes via `buildkite-agent meta-data set`):
//   PERCY_TOKEN_JS_ENABLED         write_only token for JS=enabled project
//   PERCY_TOKEN_JS_DISABLED        write_only token for JS=disabled project
//   PERCY_PROJECT_ID_JS_ENABLED    numeric project ID
//   PERCY_PROJECT_ID_JS_DISABLED   numeric project ID
//   PERCY_PROJECT_SLUG_JS_ENABLED  full-slug for Percy UI links
//   PERCY_PROJECT_SLUG_JS_DISABLED full-slug for Percy UI links
//
// Outside Buildkite, prints KEY=VALUE lines to stdout for eval.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { createProject, getProjectTokens } = require('./lib/percy-api');

function loadConfig() {
  // Env var overrides win; fall back to decrypted configs/<PROFILE>.js
  const profile = process.env.PROFILE || 'prod';
  const configPath = path.resolve(`./configs/${profile}.js`);
  let fileCfg = {};
  if (fs.existsSync(configPath)) {
    try {
      fileCfg = require(configPath);
    } catch (e) {
      console.error(`WARN: could not require ${configPath} — is it still encrypted? Run 'npm run decrypt:config' first.`);
    }
  }
  const merged = {
    PERCY_USER_TOKEN: process.env.PERCY_USER_TOKEN || fileCfg.PERCY_USER_TOKEN,
    PERCY_TEAM_ID: process.env.PERCY_TEAM_ID || fileCfg.PERCY_TEAM_ID,
    PERCY_BASE_URL: process.env.PERCY_BASE_URL || fileCfg.PERCY_BASE_URL || 'https://percy.io',
  };
  for (const k of ['PERCY_USER_TOKEN', 'PERCY_TEAM_ID']) {
    if (!merged[k]) {
      console.error(`ERROR: ${k} missing — set it via env var or in configs/${profile}.js`);
      process.exit(2);
    }
  }
  // Export PERCY_BASE_URL so percy-api.js picks it up.
  process.env.PERCY_BASE_URL = merged.PERCY_BASE_URL;
  return merged;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`ERROR: ${name} env var is required`);
    process.exit(2);
  }
  return v;
}

function setMetaOrPrint(key, value) {
  if (process.env.BUILDKITE) {
    try {
      execSync(`buildkite-agent meta-data set ${key}`, { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
    } catch (e) {
      console.error(`[create-projects] failed to set meta-data ${key}:`, e.message);
      throw e;
    }
  } else {
    console.log(`${key}=${value}`);
  }
}

async function createOne({ userToken, teamId, name }) {
  console.error(`[create-projects] creating: ${name}`);
  const project = await createProject({ userToken, teamId, name, type: 'web' });
  console.error(`[create-projects]   id=${project.id} slug=${project.slug}`);
  const tokens = await getProjectTokens({ userToken, teamId, projectSlug: project.fullSlug.split('/').slice(1).join('/') });
  // master = full-access; can upload snapshots AND read builds/snapshots.
  // One token used by both `percy exec` (upload) and fetch-diffs (read).
  if (!tokens.master) throw new Error(`no master token returned for ${name}`);
  return { ...project, token: tokens.master };
}

async function main() {
  const cfg = loadConfig();
  const { PERCY_USER_TOKEN: userToken, PERCY_TEAM_ID: teamId } = cfg;
  const cycleId = requireEnv('CYCLE_ID');

  const jsEnabled = await createOne({
    userToken,
    teamId,
    name: `auto-live-url-${cycleId}-js-enabled`,
  });
  const jsDisabled = await createOne({
    userToken,
    teamId,
    name: `auto-live-url-${cycleId}-js-disabled`,
  });

  setMetaOrPrint('PERCY_TOKEN_JS_ENABLED', jsEnabled.token);
  setMetaOrPrint('PERCY_TOKEN_JS_DISABLED', jsDisabled.token);
  setMetaOrPrint('PERCY_PROJECT_ID_JS_ENABLED', jsEnabled.id);
  setMetaOrPrint('PERCY_PROJECT_ID_JS_DISABLED', jsDisabled.id);
  setMetaOrPrint('PERCY_PROJECT_SLUG_JS_ENABLED', jsEnabled.fullSlug);
  setMetaOrPrint('PERCY_PROJECT_SLUG_JS_DISABLED', jsDisabled.fullSlug);

  console.error('[create-projects] done');
}

main().catch((e) => {
  console.error('[create-projects] FATAL:', e.message);
  process.exit(1);
});
