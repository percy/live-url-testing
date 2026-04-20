// Thin Percy REST API wrapper. Uses Node 20 built-in fetch. No external deps.
//
// Auth model:
//   - USER_TOKEN (org-level): creates projects, lists tokens
//   - per-project write_only token: used by Percy CLI to upload snapshots (env PERCY_TOKEN)
//   - per-project read_only / master token: reads builds + snapshots for diff extraction
//
// Env:
//   PERCY_BASE_URL   default: https://percy.io
//   PERCY_USER_TOKEN org-level token (required for create/list-tokens)

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

async function listBuildsForProject({ readToken, projectId, branch, limit = 10 }) {
  const query = { 'filter[project_id]': projectId, 'page[limit]': String(limit) };
  if (branch) query['filter[branch]'] = branch;
  const r = await request('GET', `/api/v1/builds`, { token: readToken, query });
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

async function listSnapshotsForBuild({ readToken, buildId, limit = 500 }) {
  const query = { build_id: buildId, 'page[limit]': String(limit) };
  const r = await request('GET', `/api/v1/snapshots`, { token: readToken, query });
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

async function getComparison({ readToken, comparisonId }) {
  const r = await request('GET', `/api/v1/comparisons/${comparisonId}`, { token: readToken });
  const a = r.data.attributes;
  return {
    id: r.data.id,
    diffRatio: a['diff-ratio'],
    aiDiffRatio: a['ai-diff-ratio'],
    headImageUrl: a['head-image-url'],
    baseImageUrl: a['base-image-url'],
    diffImageUrl: a['diff-image-url'],
  };
}

module.exports = {
  createProject,
  getProjectTokens,
  listBuildsForProject,
  listSnapshotsForBuild,
  getComparison,
};
