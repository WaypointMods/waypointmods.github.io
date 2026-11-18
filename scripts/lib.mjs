// Shared helpers for the submission and build scripts. No dependencies: Node 20+.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MODS_DIR = path.join(ROOT, 'mods');

// Keep in sync with the dropdowns in .github/ISSUE_TEMPLATE/submit-mod.yml and edit-mod.yml.
export const CATEGORIES = [
  'Animation', 'Armour and Weapons', 'Audio', 'Bug Fixes', 'Combat', 'Followers', 'Gameplay',
  'Immersion', 'Patches', 'Quests', 'UI', 'Utilities', 'Visuals', 'Other'
];
// Checkbox label in the issue forms -> game key used by the site.
export const GAME_LABELS = { 'Skyrim SE/AE': 'se', 'Skyrim VR': 'vr', 'Skyrim LE': 'le' };
export const GAME_KEYS = Object.values(GAME_LABELS);

// One place for every size limit; the form checks and the entry validator both read these.
export const LIMITS = { name: 80, authorName: 40, summary: 160, description: 20000, tags: 8, tag: 24, images: 8, requirements: 20 };
export const USER_AGENT = 'waypoint-build';

export const ARCHIVE_RE = /\.(7z|zip|rar)$/i;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Images must be hosted by GitHub: issue uploads, or files in a public repository.
export const IMAGE_RE = /^https:\/\/(?:github\.com\/user-attachments\/assets\/[0-9a-f-]{36}|user-images\.githubusercontent\.com\/\d+\/[\w.-]+\.(?:png|jpe?g|gif|webp)|raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp))$/i;

export const today = () => new Date().toISOString().slice(0, 10);
export const isNone = v => /^none$/i.test(String(v ?? '').trim());

export function slugify(s) {
  return String(s)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/, '');
}

export function hueFor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

// Strip control characters (keeps tab and newline), trim, cap length.
export const clean = (s, max) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
export const oneLine = (s, max) => clean(s, max * 2).replace(/\s+/g, ' ').slice(0, max);

export function readMods() {
  if (!fs.existsSync(MODS_DIR)) return [];
  return fs.readdirSync(MODS_DIR).filter(f => f.endsWith('.json')).sort().map(file => {
    try {
      return { file, mod: JSON.parse(fs.readFileSync(path.join(MODS_DIR, file), 'utf8')) };
    } catch (e) {
      return { file, mod: null, error: `not valid JSON (${e.message})` };
    }
  });
}

export function writeMod(mod) {
  fs.mkdirSync(MODS_DIR, { recursive: true });
  fs.writeFileSync(path.join(MODS_DIR, mod.id + '.json'), JSON.stringify(mod, null, 2) + '\n');
}

const isStr = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
const isHttps = v => { try { return new URL(v).protocol === 'https:'; } catch { return false; } };

// Returns a list of problems; empty means the entry is valid.
export function validateMod(mod, file) {
  const e = [];
  if (!mod || typeof mod !== 'object') return ['entry is not an object'];
  if (!isStr(mod.id, 1, 60) || !ID_RE.test(mod.id)) e.push('id must be lowercase letters, numbers and dashes');
  else if (file && file !== mod.id + '.json') e.push(`file name must be ${mod.id}.json`);
  const L = LIMITS;
  if (!isStr(mod.name, 1, L.name)) e.push(`name must be 1-${L.name} characters`);
  if (!isStr(mod.repo, 3, 141) || !REPO_RE.test(mod.repo)) e.push('repo must look like owner/name');
  if (!isStr(mod.summary, 1, L.summary)) e.push(`summary must be 1-${L.summary} characters`);
  if (!isStr(mod.description, 1, L.description)) e.push(`description must be 1-${L.description} characters`);
  if (!CATEGORIES.includes(mod.category)) e.push(`category must be one of: ${CATEGORIES.join(', ')}`);
  if (!Array.isArray(mod.games) || !mod.games.length || mod.games.some(g => !GAME_KEYS.includes(g))) e.push(`games must be a non-empty list of: ${GAME_KEYS.join(', ')}`);
  if (!Array.isArray(mod.tags) || mod.tags.length > L.tags || mod.tags.some(t => !isStr(t, 1, L.tag))) e.push(`tags must be up to ${L.tags} strings of 1-${L.tag} characters`);
  if (!Array.isArray(mod.requirements) || mod.requirements.length > L.requirements ||
      mod.requirements.some(r => !r || !isStr(r.name, 1, L.name) || !isHttps(r.url))) e.push('requirements must be a list of { name, https url }');
  if (!isStr(mod.created, 10, 10) || !DATE_RE.test(mod.created)) e.push('created must be YYYY-MM-DD');
  if (mod.hue !== undefined && !(Number.isInteger(mod.hue) && mod.hue >= 0 && mod.hue < 360)) e.push('hue must be a whole number 0-359');
  if (mod.license !== undefined && !isStr(mod.license, 0, 40)) e.push('license must be up to 40 characters');
  if (mod.authorName !== undefined && !isStr(mod.authorName, 1, L.authorName)) e.push(`authorName must be 1-${L.authorName} characters`);
  if (mod.images !== undefined && (!Array.isArray(mod.images) || mod.images.length > L.images ||
      mod.images.some(u => typeof u !== 'string' || !IMAGE_RE.test(u)))) e.push(`images must be up to ${L.images} GitHub-hosted image links`);
  if (mod.includePrereleases !== undefined && typeof mod.includePrereleases !== 'boolean') e.push('includePrereleases must be true or false');
  return e;
}

export async function gh(p, { method = 'GET', body } = {}) {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch('https://api.github.com' + p, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${method} ${p} failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export function setOutput(key, value) {
  const v = String(value).replace(/[\r\n]+/g, ' ');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${v}\n`);
  else console.log(`[output] ${key}=${v}`);
}
