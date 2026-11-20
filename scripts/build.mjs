// Builds the site into _site/: reads mods/*.json, pulls each repo's releases from GitHub,
// hashes and virus-scans new files, and writes data/mods.js for the pages.
//
//   node scripts/build.mjs           full build (needs network)
//   node scripts/build.mjs --check   only validate mods/*.json (used on hand-made pull requests)
//
// Env: GITHUB_TOKEN (raises the API rate limit), VT_API_KEY (VirusTotal; without it files are
// listed as "not virus-scanned"), VT_MAX_CALLS (default 100 per build), VT_DAILY_MAX (default 450 a
// day, under the free plan's 500), VT_FLAG_AT (default 2).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT, ARCHIVE_RE, USER_AGENT, readMods, validateMod, gh, today, hueFor, scanMode, ensureClamAV, clamScan } from './lib.mjs';

const CHECK_ONLY = process.argv.includes('--check');
const MAX_RELEASES = 5;                 // newest releases shown per mod
const VT_SMALL = 32 * 1024 * 1024;      // direct upload limit
const VT_LARGE = 650 * 1024 * 1024;     // upload_url limit
const VT_GAP_MS = Number(process.env.VT_GAP_MS || 16000);   // free API: 4 requests per minute
const VT_WAIT_TRIES = 6;                                    // while VirusTotal analyses, check up to 6 times...
const VT_WAIT_MS = Number(process.env.VT_WAIT_MS || 30000); // ...30 seconds apart, so new files list in the same build
const VT = process.env.VT_API_KEY || '';
const VT_MAX = Number(process.env.VT_MAX_CALLS || 100);
const VT_DAILY_MAX = Number(process.env.VT_DAILY_MAX || 450);
const VT_FLAG_AT = Number(process.env.VT_FLAG_AT || 2);
const STATE_FILE = path.join(ROOT, 'state', 'assets.json');
const QUOTA_FILE = path.join(ROOT, 'state', 'vt-quota.json');
const OUT = path.join(ROOT, '_site');
const SITE_FILES = ['index.html', 'browse.html', 'mod.html', 'add.html', 'about.html', 'helper.html', '.nojekyll', 'assets', 'helper', 'data/site.js'];

// ---------- 1. validate the registry ----------
const entries = readMods();
const problems = [];
for (const { file, mod, error } of entries) {
  if (error) problems.push(`${file}: ${error}`);
  else validateMod(mod, file).forEach(p => problems.push(`${file}: ${p}`));
}
const repos = new Map();
for (const { file, mod } of entries) {
  if (!mod || !mod.repo) continue;
  const k = mod.repo.toLowerCase();
  if (repos.has(k)) problems.push(`${file}: same repo as ${repos.get(k)}`);
  repos.set(k, file);
}
if (problems.length) {
  console.error('Problems in mods/:\n' + problems.map(p => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`mods/: ${entries.length} entries, all valid`);
if (CHECK_ONLY) process.exit(0);

// ---------- 2. scan state ----------
// Key: "owner/repo@tag/file". Status: clean | flagged | pending | queued | unscanned | rescan
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const report = { listed: [], hidden: [], unavailable: [], scanned: [], changed: [], flagged: [] };
let vtCalls = 0, vtLast = 0;
// VirusTotal calls already used today (UTC) by earlier builds. Past the daily budget, files wait for
// tomorrow rather than using up the free quota. They are never listed unscanned because of it.
let quota = fs.existsSync(QUOTA_FILE) ? JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8')) : {};
if (quota.date !== today()) quota = { date: today(), calls: 0 };
const vtBudget = n => vtCalls + n <= VT_MAX && quota.calls + vtCalls + n <= VT_DAILY_MAX;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function vt(url, opts = {}) {
  const wait = vtLast + VT_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  vtLast = Date.now();
  vtCalls++;
  const res = await fetch(url, { ...opts, headers: { 'x-apikey': VT, ...(opts.headers || {}) } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`VirusTotal ${res.status}`);
  return res.json();
}

async function download(a) {
  const file = path.join(os.tmpdir(), `modindex-${a.id}-${Date.now()}`);
  const res = await fetch(a.browser_download_url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`download ${a.name}: ${res.status}`);
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(file);
  for await (const chunk of res.body) {
    hash.update(chunk);
    if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
  }
  await new Promise((r, j) => out.end(e => (e ? j(e) : r())));
  return { file, sha256: hash.digest('hex') };
}

// ---------- scanning ----------
// The author picks the scan: 'full' (VirusTotal), 'private' (ClamAV here + VirusTotal fingerprint only)
// or 'off'. Each file record keeps which method checked it, so the site can say so.

// Ask VirusTotal about a hash (no file is sent): { state: 'unknown' | 'running' | 'done', stats }.
async function vtReport(sha256) {
  const found = await vt(`https://www.virustotal.com/api/v3/files/${sha256}`);
  if (!found) return { state: 'unknown' };
  const stats = found.data && found.data.attributes && found.data.attributes.last_analysis_stats;
  const total = stats ? Object.values(stats).reduce((x, y) => x + y, 0) : 0;
  return total ? { state: 'done', stats } : { state: 'running' };
}
const vtDetail = s => `${s.malicious} malicious, ${s.suspicious} suspicious`;

function verdict(e, a, method, flagged, detail) {
  e.status = flagged ? 'flagged' : 'clean';
  e.method = method;
  e.checked = today();
  delete e.uploaded;
  delete e.note;
  report.scanned.push(`${a.name}: ${e.status} by ${method === 'private' ? 'private scan' : 'VirusTotal'} (${detail})`);
}

// Full scan: look the hash up, upload the file if VirusTotal has never seen it, and wait for the verdict
// here (up to ~3 minutes) rather than leaving it to the next build.
async function fullScan(e, a, local) {
  if (!VT) { e.status = 'unscanned'; e.note = 'no-key'; return; }
  if (!vtBudget(1)) { e.status = 'queued'; return; }
  const settle = r => {
    e.vt = { malicious: r.stats.malicious, suspicious: r.stats.suspicious };
    verdict(e, a, 'virustotal', r.stats.malicious >= VT_FLAG_AT, vtDetail(r.stats));
  };
  const wait = async () => {
    e.status = 'pending';
    for (let i = 0; i < VT_WAIT_TRIES && vtBudget(1); i++) {
      await sleep(VT_WAIT_MS);
      const r = await vtReport(e.sha256);
      if (r.state === 'done') return settle(r);
    }
    report.scanned.push(`${a.name}: still being analysed by VirusTotal; listed on a later build`);
  };

  const first = await vtReport(e.sha256);
  if (first.state === 'done') return settle(first);
  if (first.state === 'running' || e.uploaded) return wait();
  if (a.size > VT_LARGE) { e.status = 'unscanned'; e.note = 'too-large'; return; }
  if (!vtBudget(2)) { e.status = 'queued'; return; }
  const dl = local || await download(a);
  try {
    let target = 'https://www.virustotal.com/api/v3/files';
    if (a.size > VT_SMALL) target = (await vt('https://www.virustotal.com/api/v3/files/upload_url')).data;
    const form = new FormData();
    form.append('file', await fs.openAsBlob(dl.file), a.name);
    await vt(target, { method: 'POST', body: form });
    e.uploaded = today();
  } finally {
    if (!local) fs.rmSync(dl.file, { force: true });
  }
  return wait();
}

// Private scan: ClamAV on the build machine, plus a fingerprint-only VirusTotal lookup.
// The file itself is never sent anywhere.
async function privateScan(e, a, local) {
  if (VT && !vtBudget(1)) { e.status = 'queued'; return; } // keep the promised fingerprint check for later
  if (!ensureClamAV()) { e.status = 'queued'; e.note = 'clamav-unavailable'; return; }
  const dl = local || await download(a);
  let clam;
  try { clam = clamScan(dl.file); } finally { if (!local) fs.rmSync(dl.file, { force: true }); }
  if (clam.result === 'error') {
    e.status = 'queued';
    e.note = 'clamav-error';
    console.warn(`ClamAV could not scan ${a.name}: ${clam.detail}`);
    return;
  }
  let fp = null;
  if (VT) {
    const r = await vtReport(e.sha256);
    if (r.state === 'done') fp = r.stats;
  }
  e.clamav = clam.result === 'infected' ? clam.name : 'clean';
  if (fp) e.vt = { malicious: fp.malicious, suspicious: fp.suspicious }; else delete e.vt;
  const flagged = clam.result === 'infected' || (!!fp && fp.malicious >= VT_FLAG_AT);
  verdict(e, a, 'private', flagged, `ClamAV: ${e.clamav}; fingerprint: ${fp ? vtDetail(fp) : 'not known to VirusTotal'}`);
}

async function scan(e, a, local, mode) {
  try {
    if (mode === 'off') { e.status = 'unscanned'; e.note = 'opted-out'; return; }
    if (mode === 'private') return await privateScan(e, a, local);
    return await fullScan(e, a, local);
  } catch (err) {
    e.status = 'queued';
    console.warn(`Scan failed for ${a.name}: ${err.message}`);
  }
}

async function checkAsset(key, a, mode) {
  let e = state[key];
  const meta = { assetId: a.id, size: a.size, updatedAt: a.updated_at };
  // The same file as before? GitHub gives each file's SHA-256, so a replaced file is caught without
  // downloading it; older answers without it fall back to size and upload time.
  const same = e && e.size === a.size && (a.sha256 ? e.sha256 === a.sha256 : e.updatedAt === a.updated_at);

  if (same) {
    // A moderator can set "rescan" (scan again) or "clean" (false positive) on a flagged file.
    // A flagged file stays flagged even if the author later turns scanning off.
    const waiting = ['rescan', 'pending', 'queued'].includes(e.status);
    const canScanNow = e.status === 'unscanned' && ((e.note === 'no-key' && VT) || (e.note === 'opted-out' && mode !== 'off'));
    const upgrade = e.status === 'clean' && e.method === 'private' && mode === 'full'; // author moved to the full scan
    if (waiting || canScanNow || upgrade) await scan(e, a, undefined, mode);
    return e;
  }

  const dl = await download(a);
  try {
    if (!e) {
      e = state[key] = { ...meta, sha256: dl.sha256, status: 'queued', firstSeen: today() };
      await scan(e, a, dl, mode);
      return e;
    }
    Object.assign(e, meta);
    if (dl.sha256 !== e.sha256) {
      // Replaced under the same name: treat it as a new file and scan it again.
      Object.assign(e, { sha256: dl.sha256, status: 'queued', changed: today() });
      for (const k of ['vt', 'clamav', 'method', 'uploaded', 'note']) delete e[k];
      report.changed.push(key);
      await scan(e, a, dl, mode);
    }
    return e;
  } finally {
    fs.rmSync(dl.file, { force: true });
  }
}

// ---------- 3. build each mod ----------
// Ask GitHub about every repo first. One GraphQL request answers for a whole batch of repositories:
// details, newest releases with their files, and the donation links behind GitHub's Sponsor button
// (FUNDING.yml). The REST API needed about 5 requests per mod, and a build may make only 1,000 an
// hour, which capped the site at roughly 200 mods. Scanning stays one file at a time below, because
// VirusTotal's free tier only allows 4 requests a minute anyway.
const BATCH = 20;
const REPO_FIELDS = `nameWithOwner isPrivate stargazerCount owner { login } licenseInfo { spdxId }
  fundingLinks { platform url } hasIssuesEnabled issues(states: OPEN) { totalCount }
  releases(first: 15, orderBy: { field: CREATED_AT, direction: DESC }) { nodes {
    tagName isDraft isPrerelease publishedAt description
    releaseAssets(first: 30) { nodes { id name size downloadCount downloadUrl updatedAt digest } } } }`;

// Donations go straight to the author; Waypoint only links to them.
const FUNDING_PLATFORMS = {
  GITHUB: 'GitHub Sponsors', PATREON: 'Patreon', KO_FI: 'Ko-fi', BUY_ME_A_COFFEE: 'Buy Me a Coffee', LIBERAPAY: 'Liberapay',
  OPEN_COLLECTIVE: 'Open Collective', POLAR: 'Polar', THANKS_DEV: 'thanks.dev', ISSUEHUNT: 'IssueHunt', TIDELIFT: 'Tidelift',
  COMMUNITY_BRIDGE: 'LFX', LFX_CROWDFUNDING: 'LFX'
};
const fundingLabel = url => {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const known = { 'paypal.me': 'PayPal', 'paypal.com': 'PayPal', 'ko-fi.com': 'Ko-fi', 'patreon.com': 'Patreon', 'buymeacoffee.com': 'Buy Me a Coffee',
    'github.com': 'GitHub Sponsors', 'liberapay.com': 'Liberapay', 'opencollective.com': 'Open Collective', 'boosty.to': 'Boosty', 'streamelements.com': 'StreamElements' };
  return known[host] || host;
};

// GraphQL answers, reshaped like the REST ones the rest of this script reads.
function fromGraphql(r) {
  return {
    repo: {
      full_name: r.nameWithOwner, private: r.isPrivate, owner: { login: r.owner.login },
      stargazers_count: r.stargazerCount, license: r.licenseInfo ? { spdx_id: r.licenseInfo.spdxId } : null,
      has_issues: r.hasIssuesEnabled, open_bugs: r.issues.totalCount
    },
    releases: r.releases.nodes.map(x => ({
      tag_name: x.tagName, draft: x.isDraft, prerelease: x.isPrerelease, published_at: x.publishedAt, body: x.description,
      assets: x.releaseAssets.nodes.map(a => ({
        id: a.id, name: a.name, size: a.size, download_count: a.downloadCount, browser_download_url: a.downloadUrl,
        updated_at: a.updatedAt, sha256: (a.digest || '').replace(/^sha256:/, '') || undefined, state: 'uploaded'
      }))
    })),
    funding: r.fundingLinks.filter(f => /^https:\/\//i.test(f.url))
      .map(f => ({ label: FUNDING_PLATFORMS[f.platform] || fundingLabel(f.url), url: f.url }))
  };
}

async function fetchBatch(mods) {
  const parts = mods.map((m, k) => {
    const [owner, name] = m.repo.split('/');
    return `r${k}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${REPO_FIELDS} }`;
  });
  try {
    const res = await gh('/graphql', { method: 'POST', body: { query: `{ ${parts.join('\n')} }` } });
    const missing = new Map((res.errors || []).map(e => [String((e.path || [])[0]), e.type === 'NOT_FOUND' ? 'repository not found' : e.message]));
    return mods.map((m, k) => {
      const r = res.data && res.data[`r${k}`];
      if (!r) return { error: missing.get(`r${k}`) || 'no answer from GitHub' };
      return r.isPrivate ? { error: 'repository is private' } : fromGraphql(r);
    });
  } catch (err) {
    return mods.map(() => ({ error: err.message }));
  }
}

// Without a token (a local test build) GitHub's GraphQL API isn't available: ask the REST API instead.
async function fetchRest(mod) {
  try {
    const [repo, releases] = await Promise.all([gh(`/repos/${mod.repo}`), gh(`/repos/${mod.repo}/releases?per_page=30`)]);
    return repo.private ? { error: 'repository is private' } : { repo, releases, funding: [] };
  } catch (err) {
    return { error: err.message };
  }
}

const fetched = [];
if (process.env.GITHUB_TOKEN) {
  for (let i = 0; i < entries.length; i += BATCH) fetched.push(...await fetchBatch(entries.slice(i, i + BATCH).map(x => x.mod)));
} else {
  for (const { mod } of entries) fetched.push(await fetchRest(mod));
}
console.log(`GitHub: ${entries.length} repos in ${process.env.GITHUB_TOKEN ? Math.ceil(entries.length / BATCH) + ' GraphQL request(s)' : entries.length * 2 + ' REST requests'}`);

const out = [];
const needsReview = [];
const liveRepos = new Set();
for (const [i, { mod }] of entries.entries()) {
  const { repo, releases, funding, error } = fetched[i];
  if (error) { report.unavailable.push(`${mod.id}: ${error}`); continue; }
  liveRepos.add(repo.full_name.toLowerCase());

  const rels = releases
    .filter(r => !r.draft && (mod.includePrereleases || !r.prerelease) && r.published_at)
    .sort((x, y) => y.published_at.localeCompare(x.published_at))
    .slice(0, MAX_RELEASES);

  let hideReason = null;
  const outRels = [];
  for (const r of rels) {
    const assets = [];
    let ready = true;
    for (const a of r.assets.filter(x => ARCHIVE_RE.test(x.name) && x.state === 'uploaded')) {
      const key = `${repo.full_name}@${r.tag_name}/${a.name}`;
      let e;
      try { e = await checkAsset(key, a, scanMode(mod)); } catch (err) { console.warn(`${key}: ${err.message}`); ready = false; continue; }
      if (e.status === 'flagged') {
        const by = e.clamav && e.clamav !== 'clean' ? `ClamAV (${e.clamav})` : 'VirusTotal';
        hideReason = `${a.name} flagged by ${by}`;
        report.flagged.push(key);
      }
      if (['pending', 'queued', 'rescan'].includes(e.status)) ready = false;
      assets.push({
        name: a.name, size: a.size, downloads: a.download_count, sha256: e.sha256,
        url: a.browser_download_url, scan: e.status === 'clean' ? (e.method === 'private' ? 'private' : 'virustotal') : 'unscanned'
      });
    }
    if (ready && assets.length) {
      outRels.push({
        version: r.tag_name.replace(/^v(?=\d)/i, ''),
        date: r.published_at.slice(0, 10),
        notes: (r.body || '').slice(0, 4000),
        assets
      });
    }
  }

  if (hideReason) { report.hidden.push(`${mod.id}: ${hideReason}`); needsReview.push({ mod, reason: hideReason }); continue; }
  if (!outRels.length) { report.hidden.push(`${mod.id}: no release with files ready yet (no archive attached, or scan pending)`); continue; }

  const spdx = repo.license && repo.license.spdx_id;
  out.push({
    id: mod.id, name: mod.name, author: repo.owner.login, authorName: mod.authorName || '', repo: repo.full_name,
    summary: mod.summary, description: mod.description, readme: !!mod.readme, games: mod.games, category: mod.category,
    tags: mod.tags, requirements: mod.requirements, images: mod.images || [], scanMode: scanMode(mod),
    ai: mod.ai || '', aiParts: mod.aiParts || [], permissions: mod.permissions || {},
    credits: mod.credits || '', permissionNotes: mod.permissionNotes || '', donate: mod.donate || '',
    listedBy: mod.listedBy || '', // 'waypoint': listed by an admin, not by its author
    // The author's own donation link first, then any from their FUNDING.yml, without repeats.
    funding: [...(mod.donate ? [{ label: fundingLabel(mod.donate), url: mod.donate }] : []), ...(funding || [])]
      .filter((f, k, all) => all.findIndex(x => x.url.replace(/\/$/, '').toLowerCase() === f.url.replace(/\/$/, '').toLowerCase()) === k).slice(0, 6),
    license: mod.license || (spdx && spdx !== 'NOASSERTION' ? spdx : ''),
    created: mod.created, stars: repo.stargazers_count,
    // Bug reports are the author's own GitHub issues; the mod page loads the list itself, live.
    // (Without a token the REST count also includes pull requests: close enough for a local test build.)
    bugs: { enabled: repo.has_issues !== false, open: repo.open_bugs ?? repo.open_issues_count ?? 0 },
    hue: mod.hue ?? hueFor(mod.id),
    releases: outRels
  });
  report.listed.push(mod.id);
}

// ---------- 4. write state and site ----------
// Forget files from mods that are no longer listed. A repo that is only temporarily unreachable
// keeps its records, so it isn't rescanned when it comes back.
const keepRepos = new Set([...liveRepos, ...entries.map(x => x.mod.repo.toLowerCase())]);
let pruned = 0;
for (const k of Object.keys(state)) {
  if (!keepRepos.has(k.slice(0, k.indexOf('@')).toLowerCase())) { delete state[k]; pruned++; }
}
fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
const sorted = Object.fromEntries(Object.keys(state).sort().map(k => [k, state[k]]));
fs.writeFileSync(STATE_FILE, JSON.stringify(sorted, null, 2) + '\n');
quota.calls += vtCalls;
fs.writeFileSync(QUOTA_FILE, JSON.stringify(quota, null, 2) + '\n');

fs.rmSync(OUT, { recursive: true, force: true });
for (const f of SITE_FILES) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, f), { recursive: true });
}
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'data', 'mods.js'), `// Generated ${new Date().toISOString()}\nwindow.MODS = ${JSON.stringify(out)};\n`);
fs.writeFileSync(path.join(OUT, 'data', 'mods.json'), JSON.stringify(out));

// Pack the mod manager helper into one zip for people to download (helper.html links to it).
{
  const zipPath = path.join(OUT, 'helper', 'waypoint-helper.zip');
  const files = fs.readdirSync(path.join(ROOT, 'helper')).map(f => path.join(ROOT, 'helper', f));
  const r = process.platform === 'win32'
    ? spawnSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Force -DestinationPath '${zipPath}' -Path ${files.map(f => `'${f}'`).join(',')}`])
    : spawnSync('zip', ['-j', '-q', zipPath, ...files]);
  if (r.status !== 0) console.warn('Could not create the helper zip.');
}

// GitHub Pages lets browsers cache files for 10 minutes. Stamp each build's script and style links
// so a page always loads the data from the same build, instead of a stale mod list.
const stamp = Date.now().toString(36);
for (const f of fs.readdirSync(OUT).filter(n => n.endsWith('.html'))) {
  const p = path.join(OUT, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/((?:src|href)="(?:assets|data)\/[^"?]+\.(?:js|css))"/g, `$1?v=${stamp}"`));
}

// ---------- 5. open review issues for hidden mods ----------
if (needsReview.length && process.env.GITHUB_REPOSITORY && process.env.GITHUB_TOKEN) {
  const site = process.env.GITHUB_REPOSITORY;
  try {
    const open = await gh(`/repos/${site}/issues?labels=review&state=open&per_page=100`);
    for (const { mod, reason } of needsReview) {
      const title = `Review needed: ${mod.id}`;
      if (open.some(i => i.title === title)) continue;
      await gh(`/repos/${site}/issues`, {
        method: 'POST',
        body: {
          title, labels: ['review'],
          body: `**${mod.name}** (https://github.com/${mod.repo}) is hidden from the site.\n\nReason: ${reason}\n\n` +
            'If it is a false positive, set the file\'s `status` in `state/assets.json` to `clean`, or to `rescan` to check it again. ' +
            'To remove the mod instead, delete `mods/' + mod.id + '.json`.'
        }
      });
    }
  } catch (err) { console.warn(`Could not open review issues: ${err.message}`); }
}

// ---------- 6. report ----------
const section = (title, items) => items.length ? `### ${title} (${items.length})\n${items.map(i => `- ${i}`).join('\n')}\n\n` : '';
const summary = `## Site build\n\n${report.listed.length} of ${entries.length} mods listed. VirusTotal calls: ${vtCalls} (today: ${quota.calls} of ${VT_DAILY_MAX})${VT ? '' : ' (no VT_API_KEY set: files are listed as not virus-scanned)'}.` +
  `${pruned ? ` Forgot ${pruned} file record(s) from removed mods.` : ''}\n\n` +
  section('Flagged by VirusTotal', report.flagged) + section('Hidden', report.hidden) + section('Repository unavailable', report.unavailable) +
  section('Files replaced and rescanned', report.changed) + section('Scanned this build', report.scanned);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
