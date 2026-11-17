// Turns a "Submit a mod" or "Edit a mod" issue into a mods/<id>.json change.
// Writes $RUNNER_TEMP/pr-body.md (ok) or $RUNNER_TEMP/errors.md (problems) and sets step outputs.
import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORIES, GAME_LABELS, ARCHIVE_RE, clean, oneLine, slugify, hueFor, today,
  readMods, writeMod, validateMod, gh, setOutput
} from './lib.mjs';

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue;
const login = issue.user.login;
const mode = issue.labels.some(l => l.name === 'edit') ? 'edit' : 'submit';
const tmp = process.env.RUNNER_TEMP || '.';
const errors = [];
const warnings = [];

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

function parseRepo(v) {
  const m = oneLine(v, 300).match(/^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?(?:[/?#].*)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}
function parseRequirements(v) {
  const reqs = [];
  for (const raw of clean(v, 4000).split('\n')) {
    const line = raw.replace(/^[-*]\s*/, '').trim();
    if (!line || /^none$/i.test(line)) continue;
    const [a, b] = line.includes('|') ? line.split('|').map(s => s.trim()) : [line, line];
    let url;
    try { url = new URL(b); } catch { url = null; }
    if (!url || url.protocol !== 'https:') { errors.push(`Requirements: "${oneLine(line, 80)}" needs an https link, like \`SKSE | https://skse.silverlock.org/\`.`); continue; }
    reqs.push({ name: oneLine(a === b ? url.hostname : a, 80), url: url.href });
  }
  return reqs;
}
function parseTags(v) {
  const tags = [...new Set(oneLine(v, 400).split(',').map(t => t.trim().toLowerCase().replace(/[^a-z0-9 &-]/g, '').slice(0, 24)).filter(Boolean))];
  if (tags.length > 8) errors.push('Tags: use 8 or fewer.');
  return tags.slice(0, 8);
}
const parseGames = v => checked(v).map(l => GAME_LABELS[l]).filter(Boolean);

const f = parseForm(issue.body);
const all = readMods();
let mod, repo, releases, changed = [];

async function loadRepo(full) {
  try {
    repo = await gh(`/repos/${full}`);
  } catch (e) {
    errors.push(`Repository: couldn't find \`${full}\` on GitHub. Check the name, and that it is public.`);
    return;
  }
  if (repo.private) { errors.push('Repository: it must be public.'); return; }
  releases = (await gh(`/repos/${repo.full_name}/releases?per_page=30`)).filter(r => !r.draft);
  if (!releases.some(r => r.assets.some(a => ARCHIVE_RE.test(a.name)))) {
    errors.push('Repository: no published release with a .7z, .zip or .rar file attached. Publish a release first (see the Submit page).');
  }
  if (repo.owner.login.toLowerCase() !== login.toLowerCase()) {
    warnings.push(`The repository belongs to **${repo.owner.login}** (${repo.owner.type}), but this was submitted by **${login}**. Check they have permission.`);
  }
}

if (mode === 'submit') {
  const full = parseRepo(f['Repository']);
  if (!full) errors.push('Repository: give it as `owner/name` or paste the GitHub link.');
  const name = oneLine(f['Mod name'], 80);
  const id = slugify(name);
  if (!id) errors.push('Mod name: needs at least one letter or number.');
  const summary = oneLine(f['Summary'], 400);
  if (!summary) errors.push('Summary: write one sentence about the mod.');
  else if (summary.length > 160) errors.push(`Summary: ${summary.length} characters; keep it to 160.`);
  const category = oneLine(f['Category'], 40);
  if (!CATEGORIES.includes(category)) errors.push('Category: pick one from the list.');
  const games = parseGames(f['Games']);
  if (!games.length) errors.push('Games: tick at least one.');
  const description = clean(f['Description'], 20001);
  if (!description) errors.push('Description: tell people what the mod does.');
  else if (description.length > 20000) errors.push('Description: keep it under 20,000 characters.');

  mod = {
    id, name, repo: full || '', summary, description, category, games,
    tags: parseTags(f['Tags']),
    requirements: parseRequirements(f['Requirements']),
    created: today(),
    hue: hueFor(id || 'mod')
  };

  if (full) {
    await loadRepo(full);
    if (repo) {
      mod.repo = repo.full_name;
      const dupe = all.find(x => x.mod && x.mod.repo && x.mod.repo.toLowerCase() === repo.full_name.toLowerCase());
      if (dupe) errors.push(`This repository is already listed as \`${dupe.mod.id}\`. Use the edit form to change it.`);
    }
  }
  if (id && all.some(x => x.file === id + '.json')) errors.push(`Mod name: \`${id}\` is already taken. Pick a different name.`);
} else {
  const id = oneLine(f['Mod ID'], 80).toLowerCase();
  const entry = all.find(x => x.file === id + '.json');
  if (!entry || !entry.mod) {
    errors.push('Mod ID: no listed mod has that ID. It is the part after `?id=` in the mod page address.');
  } else {
    mod = { ...entry.mod };
    const set = (key, value) => { if (JSON.stringify(mod[key]) !== JSON.stringify(value)) { mod[key] = value; changed.push(key); } };
    if (f['Mod name']) set('name', oneLine(f['Mod name'], 80));
    if (f['Summary']) {
      const s = oneLine(f['Summary'], 400);
      if (s.length > 160) errors.push(`Summary: ${s.length} characters; keep it to 160.`); else set('summary', s);
    }
    if (f['Category'] && f['Category'] !== 'No change') {
      if (CATEGORIES.includes(f['Category'])) set('category', f['Category']); else errors.push('Category: pick one from the list.');
    }
    const games = parseGames(f['Games']);
    if (games.length) set('games', games);
    if (f['Description']) set('description', clean(f['Description'], 20000));
    if (f['Requirements']) set('requirements', parseRequirements(f['Requirements']));
    if (f['Tags']) set('tags', /^none$/i.test(f['Tags'].trim()) ? [] : parseTags(f['Tags']));
    if (!changed.length && !errors.length) errors.push('Nothing to change: every field matches what is listed now.');
    await loadRepo(mod.repo);
  }
}

if (mod && !errors.length) errors.push(...validateMod(mod, mod.id + '.json').map(e => `Entry: ${e}`));

if (errors.length) {
  fs.writeFileSync(path.join(tmp, 'errors.md'),
    `Thanks, @${login}! A few things need fixing before this can go to a moderator:\n\n` +
    errors.map(e => `- ${e}`).join('\n') +
    '\n\nEdit this issue to fix them. The checks run again automatically when you save.\n');
  setOutput('ok', 'false');
  console.log(errors.join('\n'));
  process.exit(0);
}

writeMod(mod);
const esc = s => String(s).replace(/\|/g, '\\|').replace(/[<>]/g, '');
const latestWithFiles = releases.find(r => r.assets.some(a => ARCHIVE_RE.test(a.name)));
const lines = [
  `Closes #${issue.number}. ${mode === 'submit' ? 'Submitted' : 'Edit requested'} by @${login}.`,
  '',
  '| | |', '|---|---|',
  `| Mod | ${esc(mod.name)} (\`${mod.id}\`) |`,
  `| Repository | https://github.com/${mod.repo} |`,
  `| Category | ${esc(mod.category)} |`,
  `| Games | ${mod.games.join(', ')} |`,
  `| Latest release | ${esc(latestWithFiles.tag_name)} (${latestWithFiles.assets.filter(a => ARCHIVE_RE.test(a.name)).length} archive file(s)) |`,
  ...(mode === 'edit' ? [`| Changed | ${changed.join(', ')} |`] : []),
  '',
  '### Automatic checks',
  '- ✅ Repository is public and has a release with an archive attached',
  '- ✅ Entry matches the site format',
  ...warnings.map(w => `- ⚠️ ${w}`),
  '',
  '### Moderator checklist',
  ...(mode === 'submit' ? ['- [ ] Not a reupload of someone else\'s work'] : []),
  '- [ ] Name, summary and description are accurate',
  '- [ ] No sexually explicit content',
  '- [ ] Requirements look right',
  '',
  'Merging publishes the change on the next build. Files are virus-scanned during the build.'
];
fs.writeFileSync(path.join(tmp, 'pr-body.md'), lines.join('\n') + '\n');
setOutput('ok', 'true');
setOutput('branch', `${mode}/${issue.number}`);
setOutput('title', mode === 'submit' ? `Add ${mod.name}` : `Update ${mod.name}`);
console.log(`Wrote mods/${mod.id}.json`);
