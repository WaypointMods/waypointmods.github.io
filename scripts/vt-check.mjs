// Checks that VT_API_KEY works by looking up the EICAR test file: a harmless, standard
// "fake virus" string that every antivirus engine is built to detect. Never prints the key.
const EICAR_SHA256 = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';
const FLAG_AT = Number(process.env.VT_FLAG_AT || 2);
const key = process.env.VT_API_KEY;

if (!key) {
  console.error('VT_API_KEY is not set. Add it under Settings → Secrets and variables → Actions.');
  process.exit(1);
}

const res = await fetch(`https://www.virustotal.com/api/v3/files/${EICAR_SHA256}`, { headers: { 'x-apikey': key } });
if (res.status === 401 || res.status === 403) {
  console.error(`VirusTotal rejected the key (HTTP ${res.status}). Copy it again from virustotal.com → profile → API key.`);
  process.exit(1);
}
if (!res.ok) {
  console.error(`VirusTotal answered HTTP ${res.status}. Try again in a minute.`);
  process.exit(1);
}

const stats = (await res.json()).data.attributes.last_analysis_stats;
const verdict = stats.malicious >= FLAG_AT ? 'would be FLAGGED (correct)' : 'would NOT be flagged (unexpected)';
const summary = `## VirusTotal key check\n\nThe key works.\n\nEICAR test file: ${stats.malicious} engines say malicious, ` +
  `${stats.suspicious} suspicious, ${stats.undetected} undetected. On Waypoint it ${verdict}.\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) (await import('node:fs')).appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (stats.malicious < FLAG_AT) process.exit(1);
