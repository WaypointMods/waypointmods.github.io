// Three-way merge of the scan state after a build.
// usage: node scripts/merge-state.mjs <dir>
// <dir> holds this build's files (assets.json, vt-quota.json) and the versions it started from
// (assets.base.json, vt-quota.base.json). state/ already holds the newest copy from main.
// A file entry this build changed wins; everything else keeps main's copy, so two builds
// (or a hand edit on main) never wipe each other's results.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const read = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const write = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');

const ours = read(path.join(dir, 'assets.json')) || {};
const base = read(path.join(dir, 'assets.base.json')) || {};
const theirs = read('state/assets.json') || {};
const merged = { ...theirs };
for (const k of new Set([...Object.keys(ours), ...Object.keys(base)])) {
  if (same(ours[k], base[k])) continue;          // untouched here: main's copy stands
  if (k in ours) merged[k] = ours[k]; else delete merged[k];
}
write('state/assets.json', Object.fromEntries(Object.keys(merged).sort().map(k => [k, merged[k]])));

// VirusTotal calls add up across builds on the same day.
const q = read(path.join(dir, 'vt-quota.json'));
if (q) {
  const qb = read(path.join(dir, 'vt-quota.base.json'));
  const qt = read('state/vt-quota.json');
  const mine = q.calls - (qb && qb.date === q.date ? qb.calls : 0);
  write('state/vt-quota.json', { date: q.date, calls: mine + (qt && qt.date === q.date ? qt.calls : 0) });
}
