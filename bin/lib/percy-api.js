// Thin Percy REST API wrapper. Uses Node 20 built-in fetch. No external deps.
//
// Auth model:
//   - USER_TOKEN (org-level): creates projects, lists tokens, manages browser targets
//   - per-project master (full-access) token: used by Percy CLI to upload snapshots
//     AND for reading builds/snapshots for diff extraction. One token per project.
//
// Env:
//   PERCY_BASE_URL   default: https://percy.io
//   PERCY_USER_TOKEN org-level token (required for create/list-tokens/browser-targets)

'use strict';

const BASE_URL = process.env.PERCY_BASE_URL || 'https://percy.io';

function authHeaders(token) {
  if (!token) throw new Error('percy-api: token is required');
  return {
    Authorization: `Token ${token}`,
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
  };
}

async function request(method, path, { token, body, query } = {}) {
  let url = `${BASE_URL}${path}`;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers: authHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`percy-api: non-JSON response from ${method} ${path} (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = json.errors ? JSON.stringify(json.errors) : text;
    throw new Error(`percy-api: ${method} ${path} -> ${res.status}: ${msg}`);
  }
  return json;
}

// --- Project lifecycle ---

async function createProject({ userToken, teamId, name, type = 'web' }) {
  const body = { data: { type: 'projects', attributes: { name, type } } };
  const r = await request('POST', `/api/v1/organizations/${teamId}/projects`, { token: userToken, body });
  const p = r.data;
  return { id: p.id, slug: p.attributes.slug, fullSlug: p.attributes['full-slug'], name: p.attributes.name };
}

async function getProjectTokens({ userToken, teamId, projectSlug }) {
  const r = await request('GET', `/api/v1/projects/${teamId}/${projectSlug}/tokens`, { token: userToken });
  const byRole = {};
  for (const t of r.data) byRole[t.attributes.role] = t.attributes.token;
  return byRole; // { write_only, master, read_only }
}

// --- Builds & snapshots ---

async function listBuildsForProject({ token, projectId, branch, limit = 10 }) {
  const query = { 'filter[project_id]': projectId, 'page[limit]': String(limit) };
  if (branch) query['filter[branch]'] = branch;
  const r = await request('GET', `/api/v1/builds`, { token, query });
  return r.data.map((b) => ({
    id: b.id,
    state: b.attributes.state,
    branch: b.attributes.branch,
    buildNumber: b.attributes['build-number'],
    totalSnapshots: b.attributes['total-snapshots'],
    totalComparisons: b.attributes['total-comparisons'],
    totalDiff: b.attributes['total-comparisons-diff'],
    reviewState: b.attributes['review-state'],
    webUrl: b.attributes['web-url'],
  }));
}

async function listSnapshotsForBuild({ token, buildId, limit = 500 }) {
  const query = { build_id: buildId, 'page[limit]': String(limit) };
  const r = await request('GET', `/api/v1/snapshots`, { token, query });
  return r.data.map((s) => {
    const a = s.attributes;
    const comparisons = (s.relationships?.comparisons?.data || []).map((c) => c.id);
    return {
      id: s.id,
      name: a.name,
      reviewState: a['review-state'],
      reviewStateReason: a['review-state-reason'],
      diffRatio: a['diff-ratio'],
      aiDiffRatio: a['ai-diff-ratio'],
      comparisonIds: comparisons,
    };
  });
}

// Returns [{ snapshot: {id,name}, comparison: {id, diffRatio, browserTargetId} }]
// for every (snapshot × browser-target) on a build. Implemented as:
//   1. One /snapshots?build_id=X call to list snapshots + their comparison IDs
//   2. A parallel fan-out of /comparisons/:id calls to get per-comparison
//      attributes + browser-target relationship
// Earlier attempt using /snapshots?include=comparisons,comparisons.browser-target
// returned data with empty "included" — Percy's /snapshots endpoint does not
// sideload comparisons via JSON:API include. The per-id fetch is slower (100
// calls per build) but guaranteed to work.
async function listComparisonsForBuild({ token, buildId, limit = 500, concurrency = 20 }) {
  const snapshots = await listSnapshotsForBuild({ token, buildId, limit });

  // Flatten into { snapshot, comparisonId } tasks.
  const tasks = [];
  for (const s of snapshots) {
    for (const cid of s.comparisonIds || []) {
      tasks.push({ snapshot: { id: s.id, name: s.name }, comparisonId: cid });
    }
  }

  // Bounded-concurrency fan-out: run `concurrency` tasks in parallel.
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      const t = tasks[idx];
      try {
        const cmp = await getComparison({ token, comparisonId: t.comparisonId });
        rows.push({ snapshot: t.snapshot, comparison: cmp });
      } catch (e) {
        // Skip individual comparison failures — don't abort the whole aggregation.
        // The missing row will just not appear in the report.
        console.error(`[percy-api] getComparison(${t.comparisonId}) failed: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return rows;
}

async function getComparison({ token, comparisonId }) {
  // Include browser + browser-family sideload so each comparison row gets
  // family name (e.g. "Chrome") and version ("135.0.6778.85") in one request.
  // Percy's comparison resource links to a `browser` (not a browser-target),
  // so the browser-target-based lookup does not apply here.
  const query = { include: 'browser,browser.browser-family' };
  const r = await request('GET', `/api/v1/comparisons/${comparisonId}`, { token, query });
  const a = r.data.attributes;
  const included = r.included || [];
  const browserRes = included.find((x) => x.type === 'browsers');
  const familyRes = included.find((x) => x.type === 'browser-families');
  const family = familyRes?.attributes?.name || 'unknown';
  const version = browserRes?.attributes?.version || '';
  const major = (version.match(/^(\d+)/) || [])[1] || version;
  return {
    id: r.data.id,
    diffRatio: a['diff-ratio'],
    aiDiffRatio: a['ai-diff-ratio'],
    headImageUrl: a['head-image-url'],
    baseImageUrl: a['base-image-url'],
    diffImageUrl: a['diff-image-url'],
    width: a.width,
    browserId: r.data.relationships?.browser?.data?.id,
    browserFamily: family,
    browserVersion: version,
    browserDisplay: major ? `${family} ${major}` : family,
  };
}

// Fetch a single build by ID. Used by wait-for-build.js to poll state.
// Percy build states: pending -> processing -> finished (terminal), or failed/expired.
async function getBuild({ token, buildId }) {
  const r = await request('GET', `/api/v1/builds/${buildId}`, { token });
  const a = r.data.attributes;
  return {
    id: r.data.id,
    state: a.state,
    branch: a.branch,
    buildNumber: a['build-number'],
    totalSnapshots: a['total-snapshots'],
    totalComparisons: a['total-comparisons'],
    totalDiff: a['total-comparisons-diff'],
    reviewState: a['review-state'],
    webUrl: a['web-url'],
  };
}

// --- Browser target management ---
//
// New Percy projects default to 4 desktop browser-targets (Firefox, Chrome, Edge,
// Safari). We can add or remove any via POST/DELETE on /api/v1/project-browser-targets
// using our org user Token (no session/CSRF required — shape mirrors Percy UI's own
// network call but with Token auth working the same).
//
// Family IDs are stable (verified via GET /api/v1/browser-families):
//   1 = Firefox    4 = Safari              (default, already enabled)
//   2 = Chrome     5 = Safari on iPhone    ← mobile
//   3 = Edge       6 = Chrome on Android   ← mobile
//
// Flow: POST with a browser-FAMILY relationship (not browser-target) — Percy auto-
// picks the current latest browser-target for that family.
// DELETE by the project-browser-target record's own ID removes a browser.
// Confirmed working end-to-end via probes on 2026-04-21 (add 201, remove 204).

async function addProjectBrowserFamily({ userToken, projectId, browserFamilyId }) {
  const body = {
    data: {
      type: 'project-browser-targets',
      relationships: {
        project: { data: { type: 'projects', id: String(projectId) } },
        'browser-family': { data: { type: 'browser-families', id: String(browserFamilyId) } },
      },
    },
  };
  return request('POST', `/api/v1/project-browser-targets`, { token: userToken, body });
}

async function removeProjectBrowser({ userToken, projectBrowserTargetId }) {
  return request('DELETE', `/api/v1/project-browser-targets/${projectBrowserTargetId}`, { token: userToken });
}

// Returns [{ pbtId, browserTargetId, familyId }] for all currently-attached browsers.
async function listProjectBrowsers({ userToken, teamId, projectSlug }) {
  const r = await request('GET', `/api/v1/projects/${teamId}/${projectSlug}?include=project-browser-targets,browser-targets`, { token: userToken });
  const included = r.included || [];
  const bts = included.filter((x) => x.type === 'browser-targets');
  const famByBt = new Map(bts.map((bt) => [bt.id, bt.relationships?.['browser-family']?.data?.id]));
  const pbts = included.filter((x) => x.type === 'project-browser-targets');
  return pbts.map((p) => {
    const btId = p.relationships?.['browser-target']?.data?.id;
    return { pbtId: p.id, browserTargetId: btId, familyId: famByBt.get(btId) };
  });
}

// Returns a map keyed by browser-target id:
//   { "77": { family: "Chrome", familyId: 2, version: "135.0.6778.85",
//             major: "135", slug: "chrome-linux-135.0.6778.85", os: "linux",
//             display: "Chrome 135" } }
//
// Must be called AFTER any browser upgrade so comparison builds get labelled
// with the correct post-upgrade version. Resolved from one include= request
// (no extra round-trips per family).
async function getProjectBrowserTargets({ userToken, teamId, projectSlug }) {
  const r = await request(
    'GET',
    `/api/v1/projects/${teamId}/${projectSlug}?include=project-browser-targets,browser-targets,browser-families`,
    { token: userToken }
  );
  const included = r.included || [];
  const familyNameById = new Map(
    included
      .filter((x) => x.type === 'browser-families')
      .map((f) => [f.id, f.attributes?.name || f.attributes?.slug || `family_${f.id}`])
  );
  const out = {};
  for (const bt of included.filter((x) => x.type === 'browser-targets')) {
    const famId = bt.relationships?.['browser-family']?.data?.id;
    const familyName = familyNameById.get(famId) || `family_${famId}`;
    const slug = bt.attributes?.['browser-slug'] || '';
    const version = bt.attributes?.['browser-version'] || '';
    const major = (version.match(/^(\d+)/) || [])[1] || (slug.match(/-(\d+)\./) || [])[1] || '';
    const os = bt.attributes?.['os-slug'] || '';
    out[bt.id] = {
      family: familyName,
      familyId: famId,
      version,
      major,
      slug,
      os,
      display: major ? `${familyName} ${major}` : familyName,
    };
  }
  return out;
}

module.exports = {
  createProject,
  getProjectTokens,
  listBuildsForProject,
  listSnapshotsForBuild,
  listComparisonsForBuild,
  getComparison,
  getBuild,
  addProjectBrowserFamily,
  removeProjectBrowser,
  listProjectBrowsers,
  getProjectBrowserTargets,
};
