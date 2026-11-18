// Turns a "Submit a mod" or "Edit a mod" issue into a mods/<id>.json change, published without review.
// Only the repository's owner (or a public member of the owning organization) may submit or edit.
// Writes $RUNNER_TEMP/reply.md for the issue comment and sets the "ok" and "title" step outputs.
import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORIES, GAME_LABELS, ARCHIVE_RE, IMAGE_RE, LIMITS, clean, oneLine, slugify, hueFor, today, isNone,
  readMods, writeMod, validateMod, gh, setOutput
} from './lib.mjs';

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue;
const login = issue.user.login;
const mode = issue.labels.some(l => l.name === 'edit') ? 'edit' : 'submit';
const tmp = process.env.RUNNER_TEMP || '.';
const errors = [];

// ---------- reading the form ----------
// Issue forms render as "### Label\n\nvalue"; empty answers are "_No response_".
function parseForm(body) {
  const out = {};
  const parts = String(body || '').replace(/\r\n?/g, '\n').split(/^### +(.+)$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const v = parts[i + 1].trim();
    out[parts[i].trim()] = v === '_No response_' ? '' : v;
  }
  return out;
}
const checked = v => (String(v || '').match(/^- \[[xX]\] .+$/gm) || []).map(l => l.replace(/^- \[[xX]\] /, '').trim());
const parseGames = v => checked(v).map(l => GAME_LABELS[l]).filter(Boolean);

function parseRepo(v) {
  const m = oneLine(v, 300).match(/^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?(?:[/?#].*)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function parseSummary(v) {
  const s = oneLine(v, LIMITS.summary * 2);
  if (!s) errors.push('Summary: write one sentence about the mod.');
  else if (s.length > LIMITS.summary) errors.push(`Summary: ${s.length} characters; keep it to ${LIMITS.summary}.`);
  return s;
}

function parseDescription(v) {
  const d = clean(v, LIMITS.description + 1);
  if (!d) errors.push('Description: tell people what the mod does.');
  else if (d.length > LIMITS.description) errors.push(`Description: keep it under ${LIMITS.description.toLocaleString('en')} characters.`);
  return d;
}

function parseCategory(v) {
  const c = oneLine(v, 40);
  if (!CATEGORIES.includes(c)) errors.push('Category: pick one from the list.');
  return c;
}

function parseRequirements(v) {
  const reqs = [];
  for (const raw of clean(v, 4000).split('\n')) {
    const line = raw.replace(/^[-*]\s*/, '').trim();
    if (!line || isNone(line)) continue;
    const [a, b] = line.includes('|') ? line.split('|').map(s => s.trim()) : [line, line];
    let url;
    try { url = new URL(b); } catch { url = null; }
    if (!url || url.protocol !== 'https:') { errors.push(`Requirements: "${oneLine(line, 80)}" needs an https link, like \`SKSE | https://skse.silverlock.org/\`.`); continue; }
    reqs.push({ name: oneLine(a === b ? url.hostname : a, LIMITS.name), url: url.href });
  }
  if (reqs.length > LIMITS.requirements) errors.push(`Requirements: list ${LIMITS.requirements} or fewer.`);
  return reqs;
}

function parseTags(v) {
  if (isNone(v)) return [];
  const tags = [...new Set(oneLine(v, 400).split(',')
    .map(t => t.trim().toLowerCase().replace(/[^a-z0-9 &-]/g, '').slice(0, LIMITS.tag)).filter(Boolean))];
  if (tags.length > LIMITS.tags) errors.push(`Tags: use ${LIMITS.tags} or fewer.`);
  return tags.slice(0, LIMITS.tags);
}

// Dragging an image into an issue form inserts ![name](url) or <img src="url">; accept bare links too.
function parseImages(v) {
  const text = clean(v, 8000);
  const urls = [...new Set([...text.matchAll(/!\[[^\]]*\]\(\s*(\S+?)\s*\)|<img\b[^>]*?\bsrc=["']([^"']+)["']|(https?:\/\/\S+)/gi)]
    .map(m => (m[1] || m[2] || m[3]).replace(/[)>.,]+$/, '')))];
  const images = [];
  for (const u of urls) {
    if (IMAGE_RE.test(u)) images.push(u);
    else if (/private-user-images\.githubusercontent\.com/i.test(u)) errors.push('Screenshots: an image link is private and expires. Drag the image into this form again instead of copying its link.');
    else errors.push(`Screenshots: "${oneLine(u, 80)}" isn't a GitHub-hosted image. Drag the image file into the form so GitHub uploads it.`);
  }
  if (!urls.length && text) errors.push('Screenshots: no images found. Drag image files into the box, or leave it empty.');
  if (images.length > LIMITS.images) errors.push(`Screenshots: ${images.length} images; the limit is ${LIMITS.images}.`);
  return images.slice(0, LIMITS.images);
}

// ---------- checking the repository ----------
// Returns the repo, or null after recording why it can't be used.
async function loadRepo(full) {
  let repo;
  try {
    repo = await gh(`/repos/${full}`);
  } catch {
    errors.push(`Repository: couldn't find \`${full}\` on GitHub. Check the name, and that it is public.`);
    return null;
  }
  if (repo.private) { errors.push('Repository: it must be public.'); return null; }

  const releases = (await gh(`/repos/${repo.full_name}/releases?per_page=30`)).filter(r => !r.draft);
  if (!releases.some(r => r.assets.some(a => ARCHIVE_RE.test(a.name)))) {
    errors.push('Repository: no published release with a .7z, .zip or .rar file attached. Publish a release first (see the Submit page).');
  }

  const owner = repo.owner.login;
  if (owner.toLowerCase() === login.toLowerCase()) return repo;
  if (repo.owner.type === 'Organization') {
    try {
      await gh(`/orgs/${owner}/public_members/${login}`);
      return repo;
    } catch {
      errors.push(`Repository: it belongs to the **${owner}** organization. Make your membership of ${owner} public (on the organization's People page), then edit this issue to run the checks again.`);
      return repo;
    }
  }
  errors.push(`Repository: it belongs to **${owner}**, and only the owner can ${mode === 'edit' ? 'change' : 'list'} it. Ask them to submit it, or use the report form if it's your work.`);
  return repo;
}

// ---------- build the entry ----------
const f = parseForm(issue.body);
const all = readMods();
const changed = [];
let mod;

if (mode === 'submit') {
  const full = parseRepo(f['Repository']);
  if (!full) errors.push('Repository: give it as `owner/name` or paste the GitHub link.');
  const name = oneLine(f['Mod name'], LIMITS.name);
  const id = slugify(name);
  if (!id) errors.push('Mod name: needs at least one letter or number.');
  else if (all.some(x => x.file === id + '.json')) errors.push(`Mod name: \`${id}\` is already taken. Pick a different name.`);
  const games = parseGames(f['Games']);
  if (!games.length) errors.push('Games: tick at least one.');

  mod = {
    id, name, repo: full || '',
    summary: parseSummary(f['Summary']),
    description: parseDescription(f['Description']),
    category: parseCategory(f['Category']),
    games,
    tags: parseTags(f['Tags']),
    requirements: parseRequirements(f['Requirements']),
    created: today(),
    hue: hueFor(id || 'mod')
  };
  const authorName = oneLine(f['Display name'], LIMITS.authorName);
  if (authorName) mod.authorName = authorName;
  if (f['Screenshots']) mod.images = parseImages(f['Screenshots']);

  const repo = full && await loadRepo(full);
  if (repo) {
    mod.repo = repo.full_name;
    const dupe = all.find(x => x.mod && x.mod.repo && x.mod.repo.toLowerCase() === repo.full_name.toLowerCase());
    if (dupe) errors.push(`This repository is already listed as \`${dupe.mod.id}\`. Use the edit form to change it.`);
  }
} else {
  const id = oneLine(f['Mod ID'], 80).toLowerCase();
  const entry = all.find(x => x.file === id + '.json');
  if (!entry || !entry.mod) {
    errors.push('Mod ID: no listed mod has that ID. It is the part after `?id=` in the mod page address.');
  } else {
    mod = { ...entry.mod };
    const set = (key, value) => { if (JSON.stringify(mod[key]) !== JSON.stringify(value)) { mod[key] = value; changed.push(key); } };
    const unset = key => { if (key in mod) { delete mod[key]; changed.push(key); } };
    const v = label => f[label] || '';

    if (v('Mod name')) set('name', oneLine(v('Mod name'), LIMITS.name));
    if (v('Display name')) isNone(v('Display name')) ? unset('authorName') : set('authorName', oneLine(v('Display name'), LIMITS.authorName));
    if (v('Summary')) set('summary', parseSummary(v('Summary')));
    if (v('Category') && v('Category') !== 'No change') set('category', parseCategory(v('Category')));
    const games = parseGames(v('Games'));
    if (games.length) set('games', games);
    if (v('Description')) set('description', parseDescription(v('Description')));
    if (v('Screenshots')) isNone(v('Screenshots')) ? unset('images') : set('images', parseImages(v('Screenshots')));
    if (v('Requirements')) set('requirements', parseRequirements(v('Requirements')));
    if (v('Tags')) set('tags', parseTags(v('Tags')));
    if (!changed.length && !errors.length) errors.push('Nothing to change: every field matches what is listed now.');
    await loadRepo(mod.repo);
  }
}

if (mod && !errors.length) errors.push(...validateMod(mod, mod.id + '.json').map(e => `Entry: ${e}`));

// ---------- reply ----------
if (errors.length) {
  fs.writeFileSync(path.join(tmp, 'reply.md'),
    `Thanks, @${login}! A few things need fixing before this can be listed:\n\n` +
    errors.map(e => `- ${e}`).join('\n') +
    '\n\nEdit this issue to fix them. The checks run again automatically when you save.\n');
  setOutput('ok', 'false');
  console.log(errors.join('\n'));
  process.exit(0);
}

writeMod(mod);

// Site address: owner.github.io for a <owner>.github.io repo, otherwise owner.github.io/repo/.
const [siteOwner, siteRepo] = (process.env.GITHUB_REPOSITORY || 'owner/owner.github.io').split('/');
const siteUrl = siteRepo.toLowerCase() === `${siteOwner.toLowerCase()}.github.io`
  ? `https://${siteRepo.toLowerCase()}/`
  : `https://${siteOwner.toLowerCase()}.github.io/${siteRepo}/`;
const page = `${siteUrl}mod.html?id=${mod.id}`;
const FIELD_NAMES = { authorName: 'display name', name: 'mod name', images: 'screenshots' };

fs.writeFileSync(path.join(tmp, 'reply.md'), mode === 'submit'
  ? `Thanks, @${login}! **${mod.name}** passed the checks and is being published.\n\n` +
    `It will appear at ${page}, usually within 2 to 5 minutes, once the site has rebuilt and its files are virus-scanned. ` +
    'Files VirusTotal hasn\'t seen before take a few minutes longer while it analyses them.\n\n' +
    'If you had the site open already, press Ctrl + F5 to reload: browsers can keep an old copy for up to 10 minutes.\n\n' +
    'New versions show up automatically when you publish a GitHub release. To change the description, screenshots or tags later, use the Edit a mod form.\n'
  : `Done, @${login}. Updated the ${changed.map(k => FIELD_NAMES[k] || k).join(', ')} for **${mod.name}**. ` +
    `The change appears at ${page} within a few minutes (press Ctrl + F5 if you had the page open).\n`);
setOutput('ok', 'true');
setOutput('title', mode === 'submit' ? `Add ${mod.name}` : `Update ${mod.name}`);
console.log(`Wrote mods/${mod.id}.json`);
