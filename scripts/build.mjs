// Builds the site into _site/: reads mods/*.json, pulls each repo's releases from GitHub,
// hashes and virus-scans new files, and writes data/mods.js for the pages.
//
//   node scripts/build.mjs           full build (needs network)
//   node scripts/build.mjs --check   only validate mods/*.json (used on hand-made pull requests)
//
// Env: GITHUB_TOKEN (raises the API rate limit), VT_API_KEY (VirusTotal; without it files are
// listed as "not virus-scanned"), VT_MAX_CALLS (default 100 per build), VT_FLAG_AT (default 2).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, ARCHIVE_RE, readMods, validateMod, gh, today, hueFor } from './lib.mjs';

const CHECK_ONLY = process.argv.includes('--check');
const MAX_RELEASES = 5;                 // newest releases shown per mod
const VT_SMALL = 32 * 1024 * 1024;      // direct upload limit
const VT_LARGE = 650 * 1024 * 1024;     // upload_url limit
const VT_GAP_MS = 16000;                // free API: 4 requests per minute
const VT = process.env.VT_API_KEY || '';
const VT_MAX = Number(process.env.VT_MAX_CALLS || 100);
const VT_FLAG_AT = Number(process.env.VT_FLAG_AT || 2);
const STATE_FILE = path.join(ROOT, 'state', 'assets.json');
const OUT = path.join(ROOT, '_site');
const SITE_FILES = ['index.html', 'browse.html', 'mod.html', 'submit.html', 'about.html', '.nojekyll', 'assets', 'data/site.js'];

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
  const res = await fetch(a.browser_download_url, { headers: { 'User-Agent': 'mod-index-build' } });
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

// Look the hash up on VirusTotal; upload the file if VirusTotal has never seen it.
async function scan(e, a, local) {
  if (!VT) { e.status = 'unscanned'; e.note = 'no-key'; return; }
  if (vtCalls >= VT_MAX) { e.status = 'queued'; return; }
  delete e.note;
  try {
    const found = await vt(`https://www.virustotal.com/api/v3/files/${e.sha256}`);
    const stats = found && found.data && found.data.attributes && found.data.attributes.last_analysis_stats;
    const total = stats ? Object.values(stats).reduce((x, y) => x + y, 0) : 0;
    if (stats && total > 0) {
      e.vt = { malicious: stats.malicious, suspicious: stats.suspicious, checked: today() };
      e.status = stats.malicious >= VT_FLAG_AT ? 'flagged' : 'clean';
      report.scanned.push(`${a.name}: ${e.status} (${stats.malicious} malicious, ${stats.suspicious} suspicious)`);
      return;
    }
    if (found || e.uploaded) { e.status = 'pending'; return; } // analysis still running
    if (a.size > VT_LARGE) { e.status = 'unscanned'; e.note = 'too-large'; return; }
    if (vtCalls + 2 > VT_MAX) { e.status = 'queued'; return; }
    const dl = local || await download(a);
    try {
      let target = 'https://www.virustotal.com/api/v3/files';
      if (a.size > VT_SMALL) target = (await vt('https://www.virustotal.com/api/v3/files/upload_url')).data;
      const form = new FormData();
      form.append('file', await fs.openAsBlob(dl.file), a.name);
      await vt(target, { method: 'POST', body: form });
      e.uploaded = today();
      e.status = 'pending';
      report.scanned.push(`${a.name}: uploaded to VirusTotal, result on the next build`);
    } finally {
      if (!local) fs.rmSync(dl.file, { force: true });
    }
  } catch (err) {
    e.status = 'queued';
    console.warn(`VirusTotal check failed for ${a.name}: ${err.message}`);
  }
}

async function checkAsset(key, a) {
  let e = state[key];
  const meta = { assetId: a.id, size: a.size, updatedAt: a.updated_at };
  const same = e && e.assetId === a.id && e.size === a.size && e.updatedAt === a.updated_at;

  if (same) {
    // A moderator can set "rescan" (scan again) or "clean" (false positive) on a flagged file.
    if (e.status === 'rescan' || e.status === 'pending' || e.status === 'queued' || (e.status === 'unscanned' && e.note === 'no-key' && VT)) {
      await scan(e, a);
    }
    return e;
  }

  const dl = await download(a);
  try {
    if (!e) {
      e = state[key] = { ...meta, sha256: dl.sha256, status: 'queued', firstSeen: today() };
      await scan(e, a, dl);
      return e;
    }
    Object.assign(e, meta);
    if (dl.sha256 !== e.sha256) {
      // Replaced under the same name: treat it as a new file and scan it again.
      Object.assign(e, { sha256: dl.sha256, status: 'queued', changed: today() });
      delete e.seenSha256;
      delete e.vt;
      delete e.uploaded;
      delete e.note;
      report.changed.push(key);
      await scan(e, a, dl);
    }
    return e;
  } finally {
    fs.rmSync(dl.file, { force: true });
  }
}

// ---------- 3. build each mod ----------
const out = [];
const needsReview = [];
for (const { mod } of entries) {
  let repo, releases;
  try {
    repo = await gh(`/repos/${mod.repo}`);
    releases = await gh(`/repos/${mod.repo}/releases?per_page=30`);
  } catch (err) {
    report.unavailable.push(`${mod.id}: ${err.message}`);
    continue;
  }
  if (repo.private) { report.unavailable.push(`${mod.id}: repository is private`); continue; }

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
      try { e = await checkAsset(key, a); } catch (err) { console.warn(`${key}: ${err.message}`); ready = false; continue; }
      if (e.status === 'flagged') { hideReason = `${a.name} flagged by VirusTotal`; report.flagged.push(key); }
      if (['pending', 'queued', 'rescan'].includes(e.status)) ready = false;
      assets.push({
        name: a.name, size: a.size, downloads: a.download_count, sha256: e.sha256,
        url: a.browser_download_url, scan: e.status === 'clean' ? 'clean' : 'unscanned'
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
    id: mod.id, name: mod.name, author: repo.owner.login, repo: repo.full_name,
    summary: mod.summary, description: mod.description, games: mod.games, category: mod.category,
    tags: mod.tags, requirements: mod.requirements,
    license: mod.license || (spdx && spdx !== 'NOASSERTION' ? spdx : ''),
    created: mod.created, endorsements: repo.stargazers_count,
    hue: mod.hue ?? hueFor(mod.id),
    releases: outRels
  });
  report.listed.push(mod.id);
}

// ---------- 4. write state and site ----------
fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
const sorted = Object.fromEntries(Object.keys(state).sort().map(k => [k, state[k]]));
fs.writeFileSync(STATE_FILE, JSON.stringify(sorted, null, 2) + '\n');

fs.rmSync(OUT, { recursive: true, force: true });
for (const f of SITE_FILES) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, f), { recursive: true });
}
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'data', 'mods.js'), `// Generated ${new Date().toISOString()}\nwindow.MODS = ${JSON.stringify(out)};\n`);
fs.writeFileSync(path.join(OUT, 'data', 'mods.json'), JSON.stringify(out));

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
const summary = `## Site build\n\n${report.listed.length} of ${entries.length} mods listed. VirusTotal calls: ${vtCalls}${VT ? '' : ' (no VT_API_KEY set: files are listed as not virus-scanned)'}.\n\n` +
  section('Flagged by VirusTotal', report.flagged) + section('Hidden', report.hidden) + section('Repository unavailable', report.unavailable) +
  section('Files replaced and rescanned', report.changed) + section('Scanned this build', report.scanned);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
