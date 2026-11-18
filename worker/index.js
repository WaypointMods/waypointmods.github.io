// Waypoint stats Worker (Cloudflare, free plan).
//
// GET /stats  Live download counts and stars for every listed mod in one response, so pages show fresh
//             numbers without each visitor using up their own GitHub allowance. GitHub is asked at most
//             once every 5 minutes per Worker instance.
// GET /health Says whether each token works ("ok" / "missing" / "rejected"). Never shows the tokens.
// Every minute (cron): if an author published a release the site hasn't listed yet, or a listed repo
//             was deleted, start a site build straight away, so changes show within minutes.
// Every 6 hours (cron): start a build regardless, as a safety net.
//
// Settings: SITE_URL and SITE_REPO in wrangler.toml.
// Secrets:  GITHUB_TOKEN  a GitHub token with NO permissions, only used to read public data.
//           BUILD_TOKEN   optional; a fine-grained token with Actions: Read and write on SITE_REPO only.
//                         Without it the cron jobs do nothing.

const TTL_MS = 5 * 60 * 1000;
const BATCH = 25;                 // repos per GitHub query
const GONE_RETRY_MS = 10 * 60 * 1000;
const SAFETY_NET_CRON = '17 */6 * * *';
const ARCHIVE_RE = /\.(7z|zip|rar)$/i;
let cache = null;  // { at, body } - kept per Worker instance
let health = null; // { at, body } - checked at most once a minute

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
    const path = new URL(request.url).pathname;
    if (path === '/health') return reply(await checkHealth(env), 200);
    if (path !== '/stats') return reply({ error: 'not found' }, 404);
    if (!cache || Date.now() - cache.at > TTL_MS) {
      try {
        cache = { at: Date.now(), body: JSON.stringify(await collect(env, await siteMods(env))) };
      } catch (err) {
        if (!cache) return reply({ error: err.message }, 502);
        // GitHub had a problem: keep serving the last good answer.
      }
    }
    return new Response(cache.body, {
      headers: { ...cors(), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
    });
  },

  async scheduled(event, env, ctx) {
    if (!env.BUILD_TOKEN) return;
    ctx.waitUntil(event.cron === SAFETY_NET_CRON ? startBuild(env) : watch(env));
  }
};

async function checkHealth(env) {
  if (health && Date.now() - health.at < 60 * 1000) return health.body;
  const probe = async (token, url) => {
    if (!token) return 'missing';
    try {
      const res = await fetch(url, { headers: ghHeaders(token) });
      return res.ok ? 'ok' : `rejected (${res.status})`;
    } catch (e) { return 'unreachable'; }
  };
  const [statsToken, buildToken] = await Promise.all([
    probe(env.GITHUB_TOKEN, 'https://api.github.com/rate_limit'),
    probe(env.BUILD_TOKEN, `https://api.github.com/repos/${env.SITE_REPO}/actions/workflows/build.yml/runs?per_page=1`)
  ]);
  health = { at: Date.now(), body: { statsToken, buildToken, checked: new Date().toISOString() } };
  return health.body;
}

const cors = () => ({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
const reply = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { ...cors(), 'Content-Type': 'application/json' } });
const ghHeaders = token => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'waypoint-stats' });

// The site's own list of mods, as published by the last build.
async function siteMods(env) {
  const res = await fetch(new URL('data/mods.json', env.SITE_URL), { cf: { cacheTtl: 60 } });
  if (!res.ok) throw new Error(`mod list ${res.status}`);
  return res.json();
}

async function collect(env, mods) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is not set');
  const repos = [...new Set(mods.map(m => m.repo))];
  const out = {};
  for (let i = 0; i < repos.length; i += BATCH) {
    const part = repos.slice(i, i + BATCH);
    const fields = part.map((full, j) => {
      const [owner, name] = full.split('/');
      return `r${j}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
        stargazerCount
        releases(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes { tagName isDraft isPrerelease publishedAt releaseAssets(first: 30) { nodes { name downloadCount downloadUrl } } }
        }
      }`;
    }).join('\n');
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { ...ghHeaders(env.GITHUB_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ ${fields} }` })
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const { data, errors = [] } = await res.json();
    if (!data) throw new Error((errors[0] && errors[0].message) || 'GitHub query failed');
    part.forEach((full, j) => {
      const repo = data['r' + j];
      if (repo) out[full.toLowerCase()] = shape(repo);
      // Only "not found" means gone. Any other error leaves the repo out, so pages keep the built numbers.
      else if (errors.some(e => e.type === 'NOT_FOUND' && e.path && e.path[0] === 'r' + j)) out[full.toLowerCase()] = { gone: true };
    });
  }
  return { at: new Date().toISOString(), repos: out };
}

// Same shape the site uses when it asks GitHub directly: { stars, counts: { url: downloads }, newest }.
function shape(repo) {
  const rels = repo.releases.nodes
    .filter(r => !r.isDraft && !r.isPrerelease && r.publishedAt)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const counts = {};
  rels.forEach(r => r.releaseAssets.nodes.forEach(a => { counts[a.downloadUrl] = a.downloadCount; }));
  const top = rels[0];
  return {
    stars: repo.stargazerCount,
    counts,
    newest: top ? { tag: top.tagName, date: top.publishedAt, urls: top.releaseAssets.nodes.filter(a => ARCHIVE_RE.test(a.name)).map(a => a.downloadUrl) } : null
  };
}

// ---------- automatic builds ----------
async function lastBuild(env) {
  const res = await fetch(`https://api.github.com/repos/${env.SITE_REPO}/actions/workflows/build.yml/runs?per_page=1`, { headers: ghHeaders(env.BUILD_TOKEN) });
  if (!res.ok) throw new Error(`build list ${res.status}`);
  return (await res.json()).workflow_runs[0] || null;
}

function startBuild(env) {
  return fetch(`https://api.github.com/repos/${env.SITE_REPO}/actions/workflows/build.yml/dispatches`, {
    method: 'POST',
    headers: { ...ghHeaders(env.BUILD_TOKEN), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' })
  });
}

// Start a build when the live data shows something the site doesn't have yet.
async function watch(env) {
  const mods = await siteMods(env);
  if (!mods.length) return;
  const stats = await collect(env, mods);
  cache = { at: Date.now(), body: JSON.stringify(stats) }; // keep /stats fresh while we're at it

  const newReleases = [], goneRepos = [];
  for (const m of mods) {
    const s = stats.repos[m.repo.toLowerCase()];
    if (!s) continue;
    if (s.gone) { goneRepos.push(m.repo); continue; }
    const known = new Set(m.releases.flatMap(r => r.assets.map(a => a.url)));
    if (s.newest && s.newest.urls.length && !s.newest.urls.some(u => known.has(u))) newReleases.push(s.newest.date);
  }
  if (!newReleases.length && !goneRepos.length) return;

  // Never queue a second build, and never start one for something an earlier build already saw.
  const run = await lastBuild(env);
  if (run && run.status !== 'completed') return;
  const lastStart = run ? run.created_at : '';
  const releaseIsNewer = newReleases.some(d => d > lastStart);
  const goneWaited = goneRepos.length && (!run || Date.now() - Date.parse(lastStart) > GONE_RETRY_MS);
  if (releaseIsNewer || goneWaited) await startBuild(env);
}
