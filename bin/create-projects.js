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
//   TARGET_BROWSERS   (optional) comma-separated browser family slugs or numeric IDs
//                     (e.g. "chrome_on_android", "chrome,firefox", "5,6", "iphone,android").
//                     If set, each created project ends up with EXACTLY those families
//                     enabled (adds missing, deletes others). If unset, Percy's default
//                     set (4 desktop browsers) is left untouched.
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
const {
  createProject,
  getProjectTokens,
  addProjectBrowserFamily,
  removeProjectBrowser,
  listProjectBrowsers,
} = require('./lib/percy-api');

// Percy browser-family IDs are stable (verified via GET /api/v1/browser-families on
// 2026-04-21). Accept friendly slugs + short aliases + numeric IDs from TARGET_BROWSERS.
const FAMILY_BY_ALIAS = {
  firefox:             { id: 1, name: 'Firefox' },
  chrome:              { id: 2, name: 'Chrome' },
  edge:                { id: 3, name: 'Edge' },
  safari:              { id: 4, name: 'Safari' },
  iphone:              { id: 5, name: 'Safari on iPhone' },
  safari_on_iphone:    { id: 5, name: 'Safari on iPhone' },
  android:             { id: 6, name: 'Chrome on Android' },
  chrome_on_android:   { id: 6, name: 'Chrome on Android' },
};

function resolveFamily(token) {
  const k = String(token).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (FAMILY_BY_ALIAS[k]) return FAMILY_BY_ALIAS[k];
  if (/^\d+$/.test(k)) {
    // Numeric ID: accept and use as-is (Percy validates on POST).
    const names = { 1: 'Firefox', 2: 'Chrome', 3: 'Edge', 4: 'Safari', 5: 'Safari on iPhone', 6: 'Chrome on Android' };
    return { id: Number(k), name: names[Number(k)] || `family_${k}` };
  }
  throw new Error(`Unknown browser family: "${token}". Accepted: ${Object.keys(FAMILY_BY_ALIAS).join(', ')} or numeric id.`);
}

function parseTargetBrowsers(raw) {
  if (!raw) return null; // null => no mutation, leave Percy default set
  const tokens = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!tokens.length) return null;
  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    const fam = resolveFamily(t);
    if (seen.has(fam.id)) continue;
    seen.add(fam.id);
    out.push(fam);
  }
  return out;
}

// Sync a project's browser-targets to EXACTLY the desired family set: attach any
// missing, remove any extras. Idempotent and safe to re-run.
async function syncProjectBrowsers({ userToken, teamId, project, desiredFamilies }) {
  const projectSlugTail = project.fullSlug.split('/').slice(1).join('/');
  const current = await listProjectBrowsers({ userToken, teamId, projectSlug: projectSlugTail });
  const currentByFamily = new Map(current.map((c) => [String(c.familyId), c]));
  const desiredIds = new Set(desiredFamilies.map((f) => String(f.id)));

  // Add missing.
  for (const fam of desiredFamilies) {
    if (currentByFamily.has(String(fam.id))) {
      console.error(`[create-projects]   ${fam.name} already enabled (family=${fam.id})`);
      continue;
    }
    try {
      await addProjectBrowserFamily({ userToken, projectId: project.id, browserFamilyId: fam.id });
      console.error(`[create-projects]   + enabled ${fam.name} (family=${fam.id})`);
    } catch (e) {
      console.error(`[create-projects]   WARN: could not enable ${fam.name}: ${e.message}`);
    }
  }

  // Remove extras.
  for (const c of current) {
    if (desiredIds.has(String(c.familyId))) continue;
    try {
      await removeProjectBrowser({ userToken, projectBrowserTargetId: c.pbtId });
      console.error(`[create-projects]   - removed family=${c.familyId} (pbt=${c.pbtId})`);
    } catch (e) {
      console.error(`[create-projects]   WARN: could not remove pbt=${c.pbtId} (family=${c.familyId}): ${e.message}`);
    }
  }
}

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

async function createOne({ userToken, teamId, name, desiredFamilies }) {
  console.error(`[create-projects] creating: ${name}`);
  const project = await createProject({ userToken, teamId, name, type: 'web' });
  console.error(`[create-projects]   id=${project.id} slug=${project.slug}`);
  const tokens = await getProjectTokens({ userToken, teamId, projectSlug: project.fullSlug.split('/').slice(1).join('/') });
  // master = full-access; can upload snapshots AND read builds/snapshots.
  // One token used by both `percy exec` (upload) and fetch-diffs (read).
  if (!tokens.master) throw new Error(`no master token returned for ${name}`);

  if (desiredFamilies && desiredFamilies.length) {
    await syncProjectBrowsers({ userToken, teamId, project, desiredFamilies });
  }

  return { ...project, token: tokens.master };
}

async function main() {
  const cfg = loadConfig();
  const { PERCY_USER_TOKEN: userToken, PERCY_TEAM_ID: teamId } = cfg;
  const cycleId = requireEnv('CYCLE_ID');
  const desiredFamilies = parseTargetBrowsers(process.env.TARGET_BROWSERS);
  if (desiredFamilies) {
    console.error(`[create-projects] TARGET_BROWSERS => ${desiredFamilies.map((f) => `${f.name}(id=${f.id})`).join(', ')}`);
  } else {
    console.error('[create-projects] TARGET_BROWSERS not set — leaving Percy default set (4 desktop browsers) untouched.');
  }

  const jsEnabled = await createOne({
    userToken,
    teamId,
    name: `auto-live-url-${cycleId}-js-enabled`,
    desiredFamilies,
  });
  const jsDisabled = await createOne({
    userToken,
    teamId,
    name: `auto-live-url-${cycleId}-js-disabled`,
    desiredFamilies,
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
