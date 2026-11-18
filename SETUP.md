# Waypoint: setup and moderation

The whole site runs on GitHub's free tier: static pages on GitHub Pages, rebuilt by GitHub Actions.
Mod files stay in each author's own GitHub releases.

## How it fits together

| Part | What it does |
|---|---|
| `mods/<id>.json` | One file per listed mod. This is the registry. |
| `.github/ISSUE_TEMPLATE/` | The Add your mod, Edit and Report forms. |
| `.github/workflows/submission.yml` | When someone adds or edits a mod, checks the form, commits `mods/<id>.json` straight to `main`, starts a build and closes the issue. No manual approval. Only a repo's owner (or a public member of the owning organization) can add or edit it. Authors can opt out of the virus scan; their mod then shows a "Not virus-scanned" warning. Replies on the issue with problems if a check fails. |
| `.github/workflows/build.yml` | On every push to `main`, when the stats Worker spots a new release or deleted repo, and every 6 hours as a safety net: pulls releases, hashes and scans new files (waiting up to 3 minutes for VirusTotal), builds `_site/`, publishes to Pages. |
| `.github/workflows/check.yml` | Validates `mods/*.json` on pull requests that people open by hand. |
| `state/assets.json` | Written by the build: every file's approved SHA-256 hash and scan status. Committed back automatically. |
| `data/mods.js` | Example data for previewing locally only. The build replaces it with real data. |

## One-time setup

1. Create a **public** repository and push this folder to its `main` branch.
2. In `data/site.js`, set `name` and `indexRepo` (`your-name/your-repo`).
3. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
4. Nothing to change under Actions permissions: each workflow asks for the access it needs.
5. **Actions → Set up labels → Run workflow** (once). The issue forms need these labels.
6. Recommended: get a free VirusTotal API key (virustotal.com → sign in → API key) and add it under
   **Settings → Secrets and variables → Actions** as `VT_API_KEY`. Without it every file is listed as
   "not virus-scanned". Then run **Actions → Check VirusTotal key** to confirm it works.
7. Optional, for comments: **Settings → Features → Discussions**, create a category such as "Mod comments",
   install the giscus app (giscus.app), and copy the repo ID and category ID into `data/site.js`.
8. **Actions → Build site → Run workflow** for the first build.

## Live numbers (optional, Cloudflare free plan)

`worker/` is a small Cloudflare Worker. The home and browse pages ask it once for every mod's current
download counts and stars, and it asks GitHub at most every 5 minutes. Mod pages use it too, and ask
GitHub directly if it doesn't answer. Without it, lists show the numbers from the last build.

1. Create a free Cloudflare account.
2. From `worker/`: `npx wrangler login`, then `npx wrangler deploy`.
3. Create a GitHub token (classic) with **no scopes** and no expiration, then run
   `npx wrangler secret put GITHUB_TOKEN --name waypoint-stats` and paste it.
4. Put the Worker's `/stats` address in `data/site.js` as `statsUrl`.

Optional: a fine-grained token with **Actions: Read and write** on this repo only, saved as the secret
`BUILD_TOKEN`, lets the Worker check every minute for new releases and deleted repos and start a site
build straight away, plus a safety-net build every 6 hours (GitHub's own schedule is unreliable).
Without it, new releases only appear on GitHub's 6-hourly schedule or after a push.

Check both tokens any time at the Worker's `/health` address, for example after renewing one. It shows
`ok`, `missing` or `rejected` for each, never the tokens themselves. The build token is fine-grained, so it
expires (at most after a year); GitHub emails a reminder. Renew it with **Regenerate token** on GitHub, then
run `npx wrangler secret put BUILD_TOKEN --name waypoint-stats` again.

## Moderating

New mods and edits go live without review, so moderation is reactive:

- **Reports** arrive as issues labelled `report`. Watch the repo (Watch → All activity) to get them by email.
- **Remove a mod:** delete `mods/<id>.json` and commit. The build after that push takes it off the site.
- **Block an author:** remove their mods and lock or delete their issues. GitHub's
  "Block user" on the organization stops them opening new issues.
- **Every listing is in git history,** so you can always see who added what and when.

### Scanning and replaced files

Each new release file is downloaded once, hashed, and checked against VirusTotal. The free API allows
4 requests a minute and 500 a day, so the build spaces requests out and stops after `VT_MAX_CALLS`
(default 100) per run. Anything left over is picked up by the next build.

| Status in `state/assets.json` | Meaning | On the site |
|---|---|---|
| `clean` | VirusTotal found fewer than 2 detections | Listed |
| `unscanned` | No API key, or over VirusTotal's 650 MB limit | Listed, marked "not virus-scanned" |
| `pending` / `queued` | Waiting for a VirusTotal result | That release is held back until the next build |
| `flagged` | 2 or more engines flagged it | **Whole mod hidden**, review issue opened |

If an author replaces a file inside an existing release, the build notices the new hash and scans it
again like a new file.

A flagged file is the only thing that needs you. If it's a false positive, edit its entry in
`state/assets.json`:

- `"status": "clean"` accepts the file as it is.
- `"status": "rescan"` checks it with VirusTotal again.

Then commit. The next build lists the mod again. If it's real malware, delete `mods/<id>.json` instead.

### Limits

- GitHub doesn't allow sexually explicit content, so neither can this site.
- GitHub Pages: 1 GB site size, about 100 GB a month of traffic. Mod downloads come from the authors'
  repositories and don't count toward it.
- Pages isn't allowed for commercial sites, so no ads or paid tiers.
- New releases appear about 2–5 minutes after they're published (with the Worker's `BUILD_TOKEN`),
  or straight away if you run **Build site** by hand.

## Preview locally

Open `index.html` in a browser. It uses the example data in `data/mods.js`.
To test a real build: `node scripts/build.mjs`, then serve the `_site/` folder.
