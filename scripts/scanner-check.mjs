// Checks both virus scanners work, using the EICAR test file: a harmless, standard "fake virus"
// that every antivirus is built to detect. Run from Actions -> Check virus scanners.
//   1. VirusTotal: the VT_API_KEY works and EICAR's fingerprint is flagged.
//   2. ClamAV (private scan): installs, and catches EICAR as a file and inside .zip and .7z archives,
//      while a clean file passes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureClamAV, clamScan } from './lib.mjs';

const EICAR_SHA256 = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';
// Built at run time so the test string never sits in the repository (antivirus would quarantine it).
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-', 'TEST-FILE!$H+H*'].join('');
const FLAG_AT = Number(process.env.VT_FLAG_AT || 2);
const lines = ['## Virus scanner check', ''];
let failed = false;
const result = (ok, text) => { lines.push(`- ${ok ? '✅' : '❌'} ${text}`); if (!ok) failed = true; };

// 1. VirusTotal
const key = process.env.VT_API_KEY;
if (!key) result(false, 'VirusTotal: VT_API_KEY is not set (Settings → Secrets and variables → Actions).');
else {
  const res = await fetch(`https://www.virustotal.com/api/v3/files/${EICAR_SHA256}`, { headers: { 'x-apikey': key } });
  if (res.status === 401 || res.status === 403) result(false, `VirusTotal rejected the key (HTTP ${res.status}).`);
  else if (!res.ok) result(false, `VirusTotal answered HTTP ${res.status}. Try again in a minute.`);
  else {
    const s = (await res.json()).data.attributes.last_analysis_stats;
    result(s.malicious >= FLAG_AT, `VirusTotal: key works; EICAR fingerprint flagged by ${s.malicious} engines.`);
  }
}

// 2. ClamAV
if (!ensureClamAV()) result(false, 'ClamAV: could not be installed.');
else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scancheck-'));
  const eicar = path.join(dir, 'eicar.txt');
  const cleanFile = path.join(dir, 'readme.txt');
  fs.writeFileSync(eicar, EICAR);
  fs.writeFileSync(cleanFile, 'Just a harmless readme.\n');
  const cases = [['EICAR as a plain file', eicar, true], ['a harmless file', cleanFile, false]];
  if (spawnSync('zip', ['-j', '-q', path.join(dir, 'mod.zip'), eicar]).status === 0) cases.push(['EICAR inside a .zip', path.join(dir, 'mod.zip'), true]);
  if (spawnSync('7z', ['a', '-bd', '-y', path.join(dir, 'mod.7z'), eicar], { stdio: 'ignore' }).status === 0) cases.push(['EICAR inside a .7z', path.join(dir, 'mod.7z'), true]);
  for (const [label, file, shouldFlag] of cases) {
    const r = clamScan(file);
    const flagged = r.result === 'infected';
    result(r.result !== 'error' && flagged === shouldFlag,
      `ClamAV, ${label}: ${r.result === 'error' ? 'error ' + r.detail : flagged ? 'caught (' + r.name + ')' : 'passed as clean'}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

const summary = lines.join('\n') + '\n';
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
process.exit(failed ? 1 : 0);
