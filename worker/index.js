// Waypoint stats Worker (Cloudflare, free plan).
// GET /stats returns live download counts and stars for every listed mod in one response, so the
// home and browse pages can show fresh numbers without each visitor using up their own GitHub allowance.
// GitHub is asked at most once every 5 minutes per Worker instance, using a read-only token.
//
// Settings: SITE_URL and SITE_REPO in wrangler.toml; secret GITHUB_TOKEN (a GitHub token with NO
// permissions, used only to read public data). Optional secret BUILD_TOKEN: if set, the cron trigger
// also starts a site build every 4 hours (a backup for GitHub's own unreliable schedule).

const TTL_MS = 5 * 60 * 1000;
const BATCH = 25; // repos per GitHub query
const ARCHIVE_RE = /\.(7z|zip|rar)$/i;
let cache = null; // { at, body } - kept per Worker instance

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
    if (new URL(request.url).pathname !== '/stats') return reply({ error: 'not found' }, 404);
    if (!cache || Date.now() - cache.at > TTL_MS) {
      try {
        cache = { at: Date.now(), body: JSON.stringify(await collect(env)) };
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
    ctx.waitUntil(fetch(`https://api.github.com/repos/${env.SITE_REPO}/actions/workflows/build.yml/dispatches`, {
      method: 'POST',
      headers: { ...ghHeaders(env.BUILD_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' })
    }));
  }
};

const cors = () => ({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
const reply = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { ...cors(), 'Content-Type': 'application/json' } });
const ghHeaders = token => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'waypoint-stats' });

async function collect(env) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is not set');
  const listRes = await fetch(new URL('data/mods.json', env.SITE_URL), { cf: { cacheTtl: 300 } });
  if (!listRes.ok) throw new Error(`mod list ${listRes.status}`);
  const repos = [...new Set((await listRes.json()).map(m => m.repo))];

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
