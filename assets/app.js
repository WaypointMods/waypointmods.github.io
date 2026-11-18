(function () {
  'use strict';

  const SITE = window.SITE || { name: 'Waypoint', tagline: '', indexRepo: '', giscus: {} };
  const MODS = window.MODS || [];
  const GAMES = { se: 'Skyrim SE/AE', vr: 'Skyrim VR', le: 'Skyrim LE' };
  const page = document.body.dataset.page;
  const $ = (s, r = document) => r.querySelector(s);

  // ---------- small helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fmtNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
  function fmtSize(b) {
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (i ? b.toFixed(1) : b) + ' ' + u[i];
  }
  const toDate = iso => new Date(iso + 'T00:00:00');
  const fmtDate = iso => toDate(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  function ago(iso) {
    const d = (Date.now() - toDate(iso)) / 864e5;
    if (d < 1) return 'today';
    if (d < 2) return 'yesterday';
    if (d < 30) return Math.floor(d) + ' days ago';
    if (d < 365) return Math.floor(d / 30) + ' mo ago';
    return Math.floor(d / 365) + ' yr ago';
  }

  const latest = m => m.releases[0];
  const authorLabel = m => m.authorName || m.author;
  const hasOwnName = m => m.authorName && m.authorName.toLowerCase() !== m.author.toLowerCase();
  const sumDownloads = m => m.releases.reduce((a, r) => a + r.assets.reduce((b, x) => b + (x.downloads || 0), 0), 0);
  // Work out each mod's totals once, instead of on every sort and every keystroke.
  MODS.forEach(m => {
    m.totalDownloads = sumDownloads(m);
    m.lastUpdated = latest(m) ? latest(m).date : m.created;
    m.searchText = [m.name, m.summary, m.author, m.authorName || '', m.category, ...m.tags].join(' ').toLowerCase();
  });
  // Mods whose repository turned out to be deleted (from live data) drop out of every list.
  const listed = () => MODS.filter(m => !m.gone);
  const issueUrl = (template, title) =>
    `https://github.com/${SITE.indexRepo}/issues/new?template=${encodeURIComponent(template)}` +
    (title ? '&title=' + encodeURIComponent(title) : '');

  function countBy(mods, fn) {
    const out = {};
    mods.forEach(m => [].concat(fn(m)).forEach(k => { out[k] = (out[k] || 0) + 1; }));
    return out;
  }

  const SORTS = {
    popular: (a, b) => b.totalDownloads - a.totalDownloads,
    updated: (a, b) => b.lastUpdated.localeCompare(a.lastUpdated),
    new: (a, b) => b.created.localeCompare(a.created),
    stars: (a, b) => b.stars - a.stars,
    name: (a, b) => a.name.localeCompare(b.name)
  };

  // ---------- icons ----------
  const P = {
    dl: '<path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/>'
  };
  const svg = (name, s = 14) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;

  // ---------- tiny markdown (headings, lists, bold, code, links) ----------
  function inline(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function md(src) {
    const out = [];
    let list = null, para = [];
    const flushP = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    const flushL = () => { if (list) { out.push('<ul>' + list.map(li => '<li>' + inline(li) + '</li>').join('') + '</ul>'); list = null; } };
    esc(src || '').split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) { flushP(); flushL(); return; }
      if (line.startsWith('## ')) { flushP(); flushL(); out.push('<h3>' + inline(line.slice(3)) + '</h3>'); return; }
      if (/^[-*] /.test(line)) { flushP(); (list = list || []).push(line.slice(2)); return; }
      flushL(); para.push(line);
    });
    flushP(); flushL();
    return out.join('');
  }

  // ---------- shared pieces ----------
  function cover(m) {
    const initials = m.name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const img = m.images && m.images[0];
    // If the picture fails to load, it removes itself and the initials show through.
    return `<div class="cover" style="--h:${Number(m.hue) || 30}"><span>${esc(initials)}</span>${img
      ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>`;
  }
  function card(m) {
    const r = latest(m);
    return `<a class="card" href="mod.html?id=${encodeURIComponent(m.id)}">
      ${cover(m)}
      <div class="card-body">
        <div class="kicker">${esc(m.category)}</div>
        <h3>${esc(m.name)}</h3>
        <p class="card-sum">${esc(m.summary)}</p>
        <div class="meta">
          <span>by ${esc(authorLabel(m))}</span>
          <span title="Downloads">${svg('dl')} ${fmtNum(m.totalDownloads)}</span>
          <span title="GitHub stars">${svg('heart')} ${fmtNum(m.stars)}</span>
          ${r ? `<span title="Updated ${esc(fmtDate(r.date))}">${svg('clock')} ${ago(r.date)}</span>` : ''}
        </div>
      </div>
    </a>`;
  }

  // ---------- theme ----------
  function readTheme() { try { return localStorage.getItem('theme'); } catch (e) { return null; } }
  function currentTheme() {
    return document.documentElement.dataset.theme ||
      (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  const saved = readTheme();
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;

  // ---------- header / footer ----------
  function shell() {
    const nav = [['browse', 'browse.html', 'Browse'], ['submit', 'submit.html', 'Submit a mod'], ['about', 'about.html', 'About']];
    const h = $('#site-header');
    if (h) {
      h.innerHTML = `<div class="wrap hdr">
        <a class="logo" href="index.html"><span class="logo-mark">${svg('pin', 18)}</span>${esc(SITE.name)}</a>
        <nav class="nav" aria-label="Main">${nav.map(([k, href, label]) =>
          `<a href="${href}"${k === page ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
        ${page === 'browse' || page === 'home' ? '' : `<form class="search hdr-search" action="browse.html" role="search">
          ${svg('search', 16)}<input class="input" name="q" type="search" placeholder="Search mods" aria-label="Search mods"></form>`}
        <button class="icon-btn" id="theme-btn" type="button" aria-label="Switch light or dark theme"></button>
      </div>`;
      const btn = $('#theme-btn');
      const paint = () => { btn.innerHTML = svg(currentTheme() === 'dark' ? 'sun' : 'moon', 18); };
      paint();
      btn.addEventListener('click', () => {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
        paint();
      });
    }
    const f = $('#site-footer');
    if (f) {
      f.innerHTML = `<div class="wrap ftr">
        <div>${esc(SITE.name)} is a free, non-commercial mod index. Files are hosted by their authors on GitHub.</div>
        <nav aria-label="Footer">
          <a href="submit.html">Submit a mod</a>
          <a href="submit.html#rules">Rules</a>
          <a href="${issueUrl('report-mod.yml')}" target="_blank" rel="noopener">Report a problem</a>
          <a href="about.html">About</a>
        </nav>
      </div>`;
    }
    document.querySelectorAll('[data-site-name]').forEach(e => { e.textContent = SITE.name; });
    document.querySelectorAll('[data-issue]').forEach(a => { a.href = issueUrl(a.dataset.issue); });
    document.querySelectorAll('[data-index-repo]').forEach(a => { a.href = 'https://github.com/' + SITE.indexRepo; });
    if (page === 'home') document.title = `${SITE.name} | ${SITE.tagline}`;
    else if (page !== 'mod') document.title = `${document.title} | ${SITE.name}`;
  }

  // ---------- pages ----------
  function home() {
    const mods = listed();
    $('#stat-mods').textContent = mods.length;
    $('#stat-dl').textContent = fmtNum(mods.reduce((a, m) => a + m.totalDownloads, 0));
    $('#stat-authors').textContent = new Set(mods.map(m => m.author)).size;
    document.querySelectorAll('[data-needs-mods]').forEach(s => { s.hidden = !mods.length; });
    $('#no-mods').hidden = !!mods.length;
    if (!mods.length) return;
    $('#popular').innerHTML = mods.slice().sort(SORTS.popular).slice(0, 4).map(card).join('');
    $('#updated').innerHTML = mods.slice().sort(SORTS.updated).slice(0, 4).map(card).join('');
    const cats = countBy(mods, m => m.category);
    $('#cats').innerHTML = Object.keys(cats).sort().map(c =>
      `<a class="chip" href="browse.html?cat=${encodeURIComponent(c)}">${esc(c)}<small>${cats[c]}</small></a>`).join('');
    return home;
  }

  const matches = (m, words) => words.every(w => m.searchText.includes(w));

  function browse() {
    const p = new URLSearchParams(location.search);
    const st = { q: p.get('q') || '', cat: p.get('cat') || '', game: p.get('game') || '', sort: SORTS[p.get('sort')] ? p.get('sort') : 'popular' };
    const q = $('#q'), sort = $('#sort');
    q.value = st.q;
    sort.value = st.sort;

    const opt = (name, val, label, n) => {
      const on = st[name] === val;
      return `<label class="${on ? 'on' : ''}"><input type="radio" name="${name}" value="${esc(val)}"${on ? ' checked' : ''}>
        <span>${esc(label)}</span><small>${n}</small></label>`;
    };

    // The filter lists only change when a filter is picked, not while typing in the search box.
    function renderFilters() {
      const mods = listed();
      const cats = countBy(mods, m => m.category);
      const games = countBy(mods, m => m.games);
      $('#f-cat').innerHTML = opt('cat', '', 'All', mods.length) + Object.keys(cats).sort().map(c => opt('cat', c, c, cats[c])).join('');
      $('#f-game').innerHTML = opt('game', '', 'All', mods.length) + Object.keys(GAMES).map(g => opt('game', g, GAMES[g], games[g] || 0)).join('');
    }

    function render() {
      const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
      const list = listed().filter(m => (!st.cat || m.category === st.cat) && (!st.game || m.games.includes(st.game)) && matches(m, words))
        .sort(SORTS[st.sort]);
      $('#count').textContent = `${list.length} mod${list.length === 1 ? '' : 's'}`;
      $('#results').innerHTML = list.length ? list.map(card).join('')
        : '<div class="empty">No mods match these filters. <a href="browse.html">Clear filters</a></div>';

      const u = new URLSearchParams();
      ['q', 'cat', 'game'].forEach(k => { if (st[k]) u.set(k, st[k]); });
      if (st.sort !== 'popular') u.set('sort', st.sort);
      const qs = u.toString();
      try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* file:// in some browsers */ }
    }

    $('.filters').addEventListener('change', e => { if (e.target.name) { st[e.target.name] = e.target.value; renderFilters(); render(); } });
    q.addEventListener('input', () => { st.q = q.value.trim(); render(); });
    sort.addEventListener('change', () => { st.sort = sort.value; render(); });
    renderFilters();
    render();
    return () => { renderFilters(); render(); };
  }

  function release(r, isLatest) {
    return `<article class="release">
      <div class="release-head"><h3>v${esc(r.version)}</h3>${isLatest ? '<span class="badge">Latest</span>' : ''}<span class="muted">${esc(fmtDate(r.date))}</span></div>
      ${r.assets.map(a => `<div class="asset">
        <div>
          <div class="asset-name">${esc(a.name)}</div>
          <div class="asset-meta">
            <span>${fmtSize(a.size)}</span>
            <span>${svg('dl', 12)} <span data-dl="${esc(a.url)}">${fmtNum(a.downloads)}</span></span>
            <span class="hash" title="SHA-256 ${esc(a.sha256)}">SHA-256 ${esc(String(a.sha256).slice(0, 12))}…</span>
            ${a.scan === 'unscanned' ? '<span>Not virus-scanned</span>' : ''}
          </div>
        </div>
        <a class="btn btn-sm${isLatest ? ' btn-primary' : ''}" href="${esc(a.url)}">${svg('dl')} Download</a>
      </div>`).join('')}
    </article>`;
  }

  function loadComments(m) {
    const box = $('#giscus');
    if (box.dataset.loaded) return;
    box.dataset.loaded = '1';
    const g = SITE.giscus || {};
    if (!g.repo || !g.repoId || !g.categoryId) {
      box.innerHTML = '<div class="notice"><strong>Comments are not switched on yet.</strong> Once Giscus is set up, comments appear here. They are stored as GitHub Discussions, so people sign in with their GitHub account.</div>';
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    const attrs = {
      repo: g.repo, 'repo-id': g.repoId, category: g.category, 'category-id': g.categoryId,
      mapping: 'specific', term: m.id, strict: '1', 'reactions-enabled': '1', 'emit-metadata': '0',
      'input-position': 'top', theme: 'preferred_color_scheme', lang: 'en', loading: 'lazy'
    };
    Object.keys(attrs).forEach(k => s.setAttribute('data-' + k, attrs[k]));
    box.appendChild(s);
  }

  function modPage() {
    const id = new URLSearchParams(location.search).get('id');
    const m = MODS.find(x => x.id === id);
    const root = $('#mod');
    if (!m) {
      document.title = `Mod not found | ${SITE.name}`;
      root.innerHTML = `<div class="page"><h1>Mod not found</h1>
        <p class="lead">This mod may have been removed, or the link is wrong.</p>
        <p><a class="btn btn-primary" href="browse.html">Browse all mods</a></p></div>`;
      return;
    }
    document.title = `${m.name} | ${SITE.name}`;
    const r = latest(m);
    const main = r && r.assets[0];
    const fileCount = m.releases.reduce((a, x) => a + x.assets.length, 0);

    root.innerHTML = `
      <div class="banner">${cover(m)}</div>
      <div class="mod-layout">
        <div>
          <div class="kicker">${esc(m.category)}</div>
          <h1 class="mod-title">${esc(m.name)}</h1>
          <div class="byline">by ${hasOwnName(m)
            ? `<strong>${esc(m.authorName)}</strong> · <a href="https://github.com/${esc(m.author)}" target="_blank" rel="noopener" title="GitHub account">@${esc(m.author)}</a>`
            : `<a href="https://github.com/${esc(m.author)}" target="_blank" rel="noopener">${esc(m.author)}</a>`}</div>
          <p class="lead">${esc(m.summary)}</p>
          <div class="statrow">
            <div><b data-live="downloads">${fmtNum(m.totalDownloads)}</b>downloads</div>
            <div><b data-live="stars">${fmtNum(m.stars)}</b>stars</div>
            <div><b>${r ? 'v' + esc(r.version) : '-'}</b>version</div>
            <div><b>${ago(m.lastUpdated)}</b>updated</div>
          </div>
          <div id="live-note"></div>
          ${m.images && m.images.length ? `<div class="gallery">${m.images.map((u, i) =>
            `<button type="button" class="thumb" data-shot="${i}" aria-label="Open screenshot ${i + 1} of ${m.images.length}">
              <img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></button>`).join('')}</div>` : ''}
          <div class="tabs" role="tablist">
            <button class="tab" role="tab" data-tab="description">Description</button>
            <button class="tab" role="tab" data-tab="files">Files<small>${fileCount}</small></button>
            <button class="tab" role="tab" data-tab="changelog">Changelog</button>
            <button class="tab" role="tab" data-tab="comments">Comments</button>
          </div>
          <section class="panel prose" role="tabpanel" id="p-description">${md(m.description)}</section>
          <section class="panel" role="tabpanel" id="p-files" hidden>${m.releases.map((x, i) => release(x, i === 0)).join('')}</section>
          <section class="panel" role="tabpanel" id="p-changelog" hidden>${m.releases.map(x =>
            `<div class="cl"><h3>v${esc(x.version)}<span class="muted">${esc(fmtDate(x.date))}</span></h3><div class="prose">${md(x.notes)}</div></div>`).join('')}</section>
          <section class="panel" role="tabpanel" id="p-comments" hidden><div id="giscus"></div></section>
        </div>
        <aside>
          <div class="side-card dl-box">
            ${main
              ? `<a class="btn btn-primary btn-lg" href="${esc(main.url)}">${svg('dl', 18)} Download v${esc(r.version)}</a>
                 <div class="dl-note">${esc(main.name)} · ${fmtSize(main.size)}</div>
                 ${r.assets.length > 1 ? `<a class="dl-note" href="#files" data-goto="files">+ ${r.assets.length - 1} more file${r.assets.length > 2 ? 's' : ''} in this release</a>` : ''}`
              : '<div class="dl-note">No files released yet.</div>'}
            ${main ? `<div class="dl-note">${svg('shield')} ${main.scan === 'unscanned'
              ? 'Not virus-scanned (too large or scanner unavailable). File hash recorded.'
              : 'Checked on VirusTotal, file hash recorded'}</div>` : ''}
            <a class="btn" href="https://github.com/${esc(m.repo)}" target="_blank" rel="noopener">Star or view on GitHub</a>
          </div>
          <div class="side-card"><h4>Details</h4>
            <dl class="facts">
              <dt>Games</dt><dd>${m.games.map(g => esc(GAMES[g] || g)).join('<br>')}</dd>
              <dt>Category</dt><dd><a href="browse.html?cat=${encodeURIComponent(m.category)}">${esc(m.category)}</a></dd>
              <dt>Created</dt><dd>${esc(fmtDate(m.created))}</dd>
              <dt>Updated</dt><dd>${esc(fmtDate(m.lastUpdated))}</dd>
              <dt>License</dt><dd>${esc(m.license || 'Not stated')}</dd>
            </dl>
          </div>
          <div class="side-card"><h4>Requirements</h4>
            ${m.requirements.length
              ? `<ul class="reqs">${m.requirements.map(q => `<li><a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.name)}</a></li>`).join('')}</ul>`
              : '<div class="muted" style="font-size:14px">None beyond the base game.</div>'}
          </div>
          ${m.tags.length ? `<div class="side-card"><h4>Tags</h4>
            <div class="chips">${m.tags.map(t => `<a class="tag" href="browse.html?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>
          </div>` : ''}
          <a class="report" href="${issueUrl('report-mod.yml', 'Report: ' + m.name)}" target="_blank" rel="noopener">Report this mod</a>
        </aside>
      </div>`;

    const tabs = Array.from(document.querySelectorAll('.tab'));
    function select(name) {
      if (!tabs.some(t => t.dataset.tab === name)) name = 'description';
      tabs.forEach(t => {
        const on = t.dataset.tab === name;
        t.setAttribute('aria-selected', on);
        $('#p-' + t.dataset.tab).hidden = !on;
      });
      if (name === 'comments') loadComments(m);
    }
    tabs.forEach(t => t.addEventListener('click', () => {
      select(t.dataset.tab);
      try { history.replaceState(null, '', location.pathname + location.search + '#' + t.dataset.tab); } catch (e) { /* ignore */ }
    }));
    document.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      select(a.dataset.goto);
      $('.tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    select(location.hash.slice(1));
    if (m.images && m.images.length) viewer(m);
    live(m);
  }

  // ---------- live data ----------
  // The site is rebuilt every few hours. In between, pages show fresh download counts and stars,
  // and notice deleted repositories. New releases are NOT offered for download here: they appear
  // only after the build has virus-scanned them.
  //  1. The stats Worker (SITE.statsUrl, Cloudflare free plan) answers for every mod in one request.
  //  2. If it isn't set up or doesn't answer, a mod page asks GitHub directly (60 requests an hour
  //     per visitor, 2 per page). Lists then just keep the built numbers.
  // Both answers are kept for 5 minutes per browser tab.
  const LIVE_TTL = 5 * 60 * 1000;

  async function remembered(key, load) {
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (hit && Date.now() - hit.at < LIVE_TTL) return hit.data;
    } catch (e) { /* storage unavailable */ }
    const data = await load();
    if (data) try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch (e) { /* storage unavailable */ }
    return data;
  }

  const getStats = () => !SITE.statsUrl || window.MODS_ARE_EXAMPLES ? Promise.resolve(null) : remembered('stats', async () => {
    try {
      const res = await fetch(SITE.statsUrl);
      return res.ok ? (await res.json()).repos : null;
    } catch (e) { return null; }
  });

  const fetchRepoDirect = repo => remembered('live:' + repo, async () => {
    const api = p => fetch('https://api.github.com/repos/' + repo + p, { headers: { Accept: 'application/vnd.github+json' } });
    const [r1, r2] = await Promise.all([api(''), api('/releases?per_page=10')]);
    if (r1.status === 404) return { gone: true };
    if (!r1.ok || !r2.ok) return null; // rate limit or network trouble: keep the built numbers
    const rels = (await r2.json()).filter(r => !r.draft && !r.prerelease && r.published_at);
    return {
      stars: (await r1.json()).stargazers_count,
      counts: Object.fromEntries(rels.flatMap(r => r.assets.map(a => [a.browser_download_url, a.download_count]))),
      newest: rels.length ? {
        tag: rels[0].tag_name,
        date: rels[0].published_at,
        urls: rels[0].assets.filter(a => /\.(7z|zip|rar)$/i.test(a.name)).map(a => a.browser_download_url)
      } : null
    };
  });

  // Put live numbers into a mod's data. Returns false if there was nothing for it.
  function applyLive(m, data) {
    if (!data) return false;
    if (data.gone) { m.gone = true; return true; }
    m.releases.forEach(r => r.assets.forEach(a => { if (data.counts[a.url] !== undefined) a.downloads = data.counts[a.url]; }));
    m.totalDownloads = sumDownloads(m);
    m.stars = data.stars;
    return true;
  }

  // Home and browse: one Worker request refreshes every card, then the page redraws.
  async function liveLists(redraw) {
    const stats = await getStats();
    if (!stats) return;
    let any = false;
    MODS.forEach(m => { any = applyLive(m, stats[m.repo.toLowerCase()]) || any; });
    if (any && redraw) redraw();
  }

  async function live(m) {
    if (window.MODS_ARE_EXAMPLES) return; // local preview data points at made-up repos
    let data;
    try {
      const stats = await getStats();
      data = (stats && stats[m.repo.toLowerCase()]) || await fetchRepoDirect(m.repo);
    } catch (e) { return; }
    if (!applyLive(m, data)) return;
    const note = $('#live-note');

    if (data.gone) {
      note.innerHTML = `<div class="notice notice-warn"><strong>This mod's GitHub repository has been removed</strong>, so its files can't be downloaded any more. It will disappear from ${esc(SITE.name)} at the next update.</div>`;
      document.querySelectorAll('#mod a.btn[href*="/releases/download/"]').forEach(a => {
        a.removeAttribute('href');
        a.classList.add('btn-disabled');
        a.setAttribute('aria-disabled', 'true');
      });
      return;
    }

    $('[data-live="downloads"]').textContent = fmtNum(m.totalDownloads);
    $('[data-live="stars"]').textContent = fmtNum(m.stars);
    document.querySelectorAll('[data-dl]').forEach(el => {
      const n = data.counts[el.dataset.dl];
      if (n !== undefined) el.textContent = fmtNum(n);
    });

    // A release newer than anything listed, with files we haven't seen: it's waiting for its scan.
    const known = new Set(m.releases.flatMap(r => r.assets.map(a => a.url)));
    const n = data.newest;
    const listedDate = latest(m) ? latest(m).date : '';
    if (n && n.date.slice(0, 10) >= listedDate && n.urls.length && !n.urls.some(u => known.has(u))) {
      note.innerHTML = `<div class="notice"><strong>${esc(n.tag)} was just released.</strong> It will appear here within a few hours, once its files have been virus-scanned.</div>`;
    }
  }

  // Full-size screenshot viewer: click a thumbnail, arrows or swipe to move, Esc or click outside to close.
  function viewer(m) {
    const dlg = document.createElement('dialog');
    dlg.className = 'viewer';
    dlg.innerHTML = `<img alt="" referrerpolicy="no-referrer">
      <button type="button" class="v-btn v-prev" aria-label="Previous screenshot">‹</button>
      <button type="button" class="v-btn v-next" aria-label="Next screenshot">›</button>
      <button type="button" class="v-btn v-close" aria-label="Close">×</button>
      <div class="v-count"></div>`;
    document.body.appendChild(dlg);
    const img = $('img', dlg);
    let at = 0, list = [], multi = false;
    const show = i => {
      at = (i + list.length) % list.length;
      img.src = list[at];
      $('.v-count', dlg).textContent = `${at + 1} / ${list.length}`;
    };
    img.addEventListener('error', () => {
      list.splice(at, 1);
      if (!list.length) { dlg.close(); return; }
      multi = list.length > 1;
      dlg.querySelectorAll('.v-prev, .v-next, .v-count').forEach(x => { x.hidden = !multi; });
      show(at);
    });
    $('.v-prev', dlg).addEventListener('click', () => show(at - 1));
    $('.v-next', dlg).addEventListener('click', () => show(at + 1));
    $('.v-close', dlg).addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' && multi) show(at - 1);
      if (e.key === 'ArrowRight' && multi) show(at + 1);
    });
    let x0 = null;
    dlg.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener('touchend', e => {
      if (x0 === null || !multi) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    // Build the list when opening, from the thumbnails still on the page (broken images remove themselves).
    document.querySelectorAll('[data-shot]').forEach(b => b.addEventListener('click', () => {
      const shots = [...document.querySelectorAll('[data-shot]')];
      list = shots.map(s => m.images[Number(s.dataset.shot)]);
      multi = list.length > 1;
      dlg.querySelectorAll('.v-prev, .v-next').forEach(x => { x.hidden = !multi; });
      $('.v-count', dlg).hidden = !multi;
      show(shots.indexOf(b));
      dlg.showModal();
    }));
  }

  shell();
  if (page === 'mod') modPage();
  else if (page === 'home') liveLists(home());
  else if (page === 'browse') liveLists(browse());
})();
