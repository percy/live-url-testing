#!/usr/bin/env node
// Archive auto-live-url-* Percy projects older than N days.
// Intended to run at the start of every cycle so the org doesn't accumulate
// one-shot cycle projects indefinitely.
//
// Env (loaded from configs/<PROFILE>.js or env vars):
//   PERCY_USER_TOKEN   org-level token
//   PERCY_TEAM_ID      e.g. "fac6cb3e"
//
// Args:
//   --max-age-days=N   default 90
//   --dry-run          list candidates but don't archive
//
// Archive = PATCH { data: { attributes: { is-enabled: false } } } on each project.

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const BASE_URL = process.env.PERCY_BASE_URL || 'https://percy.io';

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function loadConfig() {
  const profile = process.env.PROFILE || 'prod';
  const configPath = path.resolve(`./configs/${profile}.js`);
  let fileCfg = {};
  if (fs.existsSync(configPath)) {
    try { fileCfg = require(configPath); } catch { /* file still encrypted */ }
  }
  return {
    PERCY_USER_TOKEN: process.env.PERCY_USER_TOKEN || fileCfg.PERCY_USER_TOKEN,
    PERCY_TEAM_ID: process.env.PERCY_TEAM_ID || fileCfg.PERCY_TEAM_ID,
  };
}

async function request(method, path, { token, body, query } = {}) {
  let url = `${BASE_URL}${path}`;
  if (query) url += `?${new URLSearchParams(query).toString()}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json.errors || text)}`);
  return json;
}

async function listAutoLiveUrlProjects(token, teamId) {
  // Paginate via page[cursor] with explicit organization_id. Server-side search
  // narrows to auto-live-url-* so we don't scan the whole org.
  const found = [];
  let cursor;
  for (let page = 0; page < 20; page++) {
    const query = {
      organization_id: teamId,
      origin: 'percy_web',
      'filter[search]': 'auto-live-url',
      'page[limit]': '100',
    };
    if (cursor) query['page[cursor]'] = cursor;
    const r = await request('GET', '/api/v1/projects', { token, query });
    for (const p of r.data) {
      const slug = p.attributes.slug || '';
      const isAutoCycle = slug.startsWith('auto-live-url-');
      const isEnabled = p.attributes['is-enabled'] === true;
      if (isAutoCycle && isEnabled) {
        found.push({
          id: p.id,
          slug,
          fullSlug: p.attributes['full-slug'],
          name: p.attributes.name,
          createdAt: new Date(p.attributes['created-at']),
        });
      }
    }
    cursor = r.meta?.['next-page-cursor'] || r.links?.next ? new URL(r.links.next, BASE_URL).searchParams.get('page[cursor]') : null;
    if (!cursor) break;
  }
  return found;
}

async function archive(token, teamId, slug) {
  await request('PATCH', `/api/v1/projects/${teamId}/${slug}`, {
    token,
    body: { data: { attributes: { 'is-enabled': false } } },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const maxAgeDays = Number(args['max-age-days'] || 90);
  const dryRun = !!args['dry-run'];

  const cfg = loadConfig();
  if (!cfg.PERCY_USER_TOKEN || !cfg.PERCY_TEAM_ID) {
    console.error('ERROR: PERCY_USER_TOKEN + PERCY_TEAM_ID required (env or configs/<PROFILE>.js)');
    process.exit(2);
  }

  const cutoff = new Date(Date.now() - maxAgeDays * 86400 * 1000);
  console.error(`[cleanup] archiving auto-live-url-* projects in ${cfg.PERCY_TEAM_ID} older than ${maxAgeDays}d (cutoff ${cutoff.toISOString()})`);

  const all = await listAutoLiveUrlProjects(cfg.PERCY_USER_TOKEN, cfg.PERCY_TEAM_ID);
  const stale = all.filter((p) => p.createdAt < cutoff);

  console.error(`[cleanup] ${all.length} active auto-live-url-* projects; ${stale.length} stale`);
  if (!stale.length) return;

  for (const p of stale) {
    const ageDays = Math.round((Date.now() - p.createdAt.getTime()) / 86400000);
    if (dryRun) {
      console.error(`[cleanup] would archive: ${p.fullSlug} (${ageDays}d old)`);
      continue;
    }
    try {
      await archive(cfg.PERCY_USER_TOKEN, cfg.PERCY_TEAM_ID, p.slug);
      console.error(`[cleanup] archived: ${p.fullSlug} (${ageDays}d old)`);
    } catch (e) {
      console.error(`[cleanup] failed to archive ${p.fullSlug}: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error('[cleanup-old-projects] FATAL:', e.message);
  process.exit(1);
});
