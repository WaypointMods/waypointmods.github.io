(function () {
  'use strict';

  const SITE = window.SITE || { name: 'Waypoint', tagline: '', indexRepo: '', giscus: {} };
  const MODS = window.MODS || [];
  const GAMES = { se: 'Skyrim SE/AE', vr: 'Skyrim VR', le: 'Skyrim LE' };
  const ARCHIVE_RE = /\.(7z|zip|rar)$/i;
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
  // How a file was checked: 'virustotal' (full scan), 'private' (ClamAV + VirusTotal fingerprint) or
  // 'unscanned' (the author chose no scan, or VirusTotal couldn't take the file). Older data has no value.
  const scanOf = a => a.scan || 'virustotal';
  const unscanned = m => !!latest(m) && latest(m).assets.some(a => scanOf(a) === 'unscanned');
  const noScanChosen = m => m.scanMode === 'off';
  const scanReason = m => noScanChosen(m)
    ? 'The author chose not to have these files virus-scanned.'
    : 'These files are too large for VirusTotal, or the scanner was unavailable.';
  const SCAN_LABEL = {
    virustotal: 'Checked by VirusTotal (70+ antivirus engines)',
    private: 'Private scan: checked by ClamAV, plus a VirusTotal fingerprint check'
  };
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
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4m0 3h.01"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
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
  // Line drawings of a tool per category: the blueprint cover when a mod has no screenshot.
  const CAT_ICON = {
    'Animation': '<circle cx="13" cy="4" r="2"/><path d="m7 21 3-7 3 3v5M7 12l3-4 4 1 3 3M10 8l-1 6"/>',
    'Armour and Weapons': '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/><path d="M12 8v8M9 11h6"/>',
    'Audio': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    'Bug Fixes': '<path d="M8 2l1.9 1.9M16 2l-1.9 1.9M9 7.1V6a3 3 0 0 1 6 0v1.1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6zM12 20v-9M6.5 13H3M21 13h-3.5M6 9l-3-2M18 9l3-2M6 17l-3 2M18 17l3 2"/>',
    'Combat': '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>',
    'Followers': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    'Gameplay': '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/><circle cx="12" cy="12" r="7"/>',
    'Immersion': '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
    'Patches': '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    'Quests': '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    'UI': '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>',
    'Utilities': '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4z"/>',
    'Visuals': '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 15 5-5 4 4 3-3 6 6M15 9h.01"/>',
    'Other': '<path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="m3 8 9 5 9-5M12 13v8"/>'
  };
  const catIcon = (c, size, width) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CAT_ICON[c] || CAT_ICON.Other}</svg>`;

  function cover(m) {
    const img = m.images && m.images[0];
    const r = latest(m);
    // A screenshot when there is one; if it fails to load it removes itself and the drawing shows through.
    return `<div class="cover bp-fine">${catIcon(m.category, 76, 1.1)}
      <span class="cover-tag">${esc(m.category)}</span>
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      ${r ? `<span class="cover-ver">v${esc(r.version)}</span>` : ''}</div>`;
  }
  function card(m) {
    return `<a class="card" href="mod.html?id=${encodeURIComponent(m.id)}">
      <div class="card-media">${cover(m)}${unscanned(m) ? `<span class="warn-pill" title="${esc(scanReason(m))}">${svg('alert', 12)} Not virus-scanned</span>` : ''}</div>
      <div class="card-body">
        <h3>${esc(m.name)}</h3>
        <p class="card-sum">${esc(m.summary)}</p>
        <div class="meta">
          <span>by <strong>${esc(authorLabel(m))}</strong></span>
          <span title="Downloads">${svg('dl', 13)} ${fmtNum(m.totalDownloads)}</span>
          <span title="GitHub stars">${svg('star', 13)} ${fmtNum(m.stars)}</span>
        </div>
      </div>
    </a>`;
  }
  function row(m) {
    const r = latest(m);
    return `<a class="row" href="mod.html?id=${encodeURIComponent(m.id)}">
      <span class="cat-icon">${catIcon(m.category, 20, 1.8)}</span>
      <span class="row-main"><b>${esc(m.name)}</b><small>${esc(m.category)} · by ${esc(authorLabel(m))}</small></span>
      ${r ? `<span class="ver">v${esc(r.version)}</span>` : ''}
      <span class="row-when">${ago(m.lastUpdated)}</span>
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
    const nav = [['browse', 'browse.html', 'Browse'], ['about', 'about.html', 'About']];
    const h = $('#site-header');
    if (h) {
      h.innerHTML = `<div class="wrap hdr">
        <a class="logo" href="index.html"><span class="logo-mark">${svg('pin', 18)}</span>${esc(SITE.name)}</a>
        <nav class="nav" aria-label="Main">${nav.map(([k, href, label]) =>
          `<a href="${href}"${k === page ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
        <div class="hdr-tools">
          ${page === 'browse' || page === 'home' ? '' : `<form class="search hdr-search" action="browse.html" role="search">
            ${svg('search', 16)}<input class="input" name="q" type="search" placeholder="Search mods" aria-label="Search mods"></form>`}
          <button class="icon-btn" id="theme-btn" type="button"></button>
          ${page === 'add' ? '' : '<a class="btn btn-primary hdr-add" href="add.html">Add your mod</a>'}
        </div>
      </div>`;
      const btn = $('#theme-btn');
      const paint = () => {
        const dark = currentTheme() === 'dark';
        btn.innerHTML = svg(dark ? 'sun' : 'moon', 18);
        btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      };
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
          <a href="add.html">Add your mod</a>
          <a href="add.html#rules">Rules</a>
          <a href="helper.html">Mod manager helper</a>
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
    $('#updated').innerHTML = mods.slice().sort(SORTS.updated).slice(0, 5).map(row).join('');
    const cats = countBy(mods, m => m.category);
    $('#cats').innerHTML = Object.keys(cats).sort().map(c =>
      `<a class="cat" href="browse.html?cat=${encodeURIComponent(c)}"><span class="cat-icon">${catIcon(c, 20, 1.8)}</span>
        <span><b>${esc(c)}</b><small>${cats[c]} mod${cats[c] === 1 ? '' : 's'}</small></span></a>`).join('');
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

  // waypoint:// links are opened by the Waypoint helper (helper.html), which fetches the file from
  // GitHub, checks its SHA-256 against Waypoint's list and drops it in the mod manager's downloads.
  const managerLink = (m, a) => `waypoint://download?mod=${encodeURIComponent(m.id)}&file=${encodeURIComponent(a.name)}`;

  function release(m, r, isLatest) {
    return `<article class="release">
      <div class="release-head"><h3>v${esc(r.version)}</h3>${isLatest ? '<span class="badge">Latest</span>' : ''}<span class="muted">${esc(fmtDate(r.date))}</span></div>
      ${r.assets.map(a => `<div class="asset">
        <div>
          <div class="asset-name">${esc(a.name)}</div>
          <div class="asset-meta">
            <span>${fmtSize(a.size)}</span>
            <span>${svg('dl', 12)} <span data-dl="${esc(a.url)}">${fmtNum(a.downloads)}</span></span>
            <span class="hash" title="SHA-256 ${esc(a.sha256)}">SHA-256 ${esc(String(a.sha256).slice(0, 12))}…</span>
            ${scanOf(a) === 'unscanned' ? `<span class="warn-text">${svg('alert', 12)} Not virus-scanned</span>`
              : `<span title="${esc(SCAN_LABEL[scanOf(a)])}">${svg('shield', 12)} ${scanOf(a) === 'private' ? 'Private scan' : 'VirusTotal'}</span>`}
          </div>
        </div>
        <div class="asset-actions">
          <a class="btn btn-sm${isLatest ? ' btn-primary' : ''}" href="${esc(a.url)}">${svg('dl')} Download</a>
          <a class="btn btn-sm" href="${esc(managerLink(m, a))}" title="Needs the Waypoint helper">${svg('box')} MO2 / Vortex</a>
        </div>
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

    // Blueprint banner: the category's tool drawn large, a measurement line and the dotted route.
    const size = main ? fmtSize(main.size).toUpperCase() : '';
    root.innerHTML = `
      <div class="banner bp">
        <svg viewBox="0 0 1440 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g transform="translate(1010 40) scale(7.5)" fill="none" stroke-width="0.28" stroke-linecap="round" stroke-linejoin="round" style="stroke: var(--line)">${CAT_ICON[m.category] || CAT_ICON.Other}</g>
          <path d="M1010 230 L1190 230 M1010 222 L1010 238 M1190 222 L1190 238" stroke-width="1.5" style="stroke: var(--line)"/>
          <text x="1100" y="252" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="12" style="fill: var(--line-text)">${esc(m.category.toUpperCase())}${size ? ' · ' + esc(size) : ''}</text>
          <path d="M700 210 C 780 190, 820 120, 900 130 S 960 60, 990 70" fill="none" stroke-width="2.5" stroke-dasharray="2 10" stroke-linecap="round" style="stroke: var(--accent)"/>
          <circle cx="700" cy="210" r="6" style="fill: var(--accent)"/>
        </svg>
      </div>
      <div class="wrap mod-layout">
        <div class="mod-main">
          <div class="mod-head">
            <span class="kicker">${esc(m.category)}</span>
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
          </div>
          ${unscanned(m) ? `<div class="notice notice-warn scan-warn">${svg('alert', 16)}<div><strong>Not virus-scanned.</strong> ${esc(scanReason(m))}
            Only download it if you trust the author, and scan the file with your own antivirus before opening it.
            <a href="about.html#scans">About virus scans</a></div></div>` : ''}
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
          <section class="panel" role="tabpanel" id="p-files" hidden>${m.releases.map((x, i) => release(m, x, i === 0)).join('')}</section>
          <section class="panel" role="tabpanel" id="p-changelog" hidden>${m.releases.map(x =>
            `<div class="cl"><h3>v${esc(x.version)}<span class="muted">${esc(fmtDate(x.date))}</span></h3><div class="prose">${md(x.notes)}</div></div>`).join('')}</section>
          <section class="panel" role="tabpanel" id="p-comments" hidden><div id="giscus"></div></section>
        </div>
        <aside class="mod-side">
          <div class="side-card dl-box">
            ${main
              ? `<a class="btn btn-primary btn-lg" href="${esc(main.url)}">${svg('dl', 20)} Download v${esc(r.version)}</a>
                 <a class="btn" href="${esc(managerLink(m, main))}">${svg('box', 18)} Download with MO2 / Vortex</a>
                 <a class="dl-note center" href="helper.html">Needs the free Waypoint helper (one-time setup)</a>`
              : '<div class="dl-note">No files released yet.</div>'}
            ${main ? `<div class="dl-sep">
              <div class="dl-note file">${esc(main.name)} · ${fmtSize(main.size)}</div>
              ${r.assets.length > 1 ? `<a class="dl-note" href="#files" data-goto="files">+ ${r.assets.length - 1} more file${r.assets.length > 2 ? 's' : ''} in this release</a>` : ''}
              ${scanOf(main) === 'unscanned'
                ? `<div class="dl-note warn-text">${svg('alert', 16)} Not virus-scanned${noScanChosen(m) ? ' (author\'s choice)' : ''}. File hash recorded.</div>`
                : `<div class="dl-note good">${svg('shield', 16)} ${esc(SCAN_LABEL[scanOf(main)])}. File hash recorded.</div>`}
              <a class="dl-note" href="about.html#scans">What do the scan types mean?</a>
            </div>` : ''}
            <a class="btn" href="https://github.com/${esc(m.repo)}" target="_blank" rel="noopener">Star or view on GitHub</a>
          </div>
          ${main ? `<details class="side-card install-tip">
            <summary>How to install</summary>
            <p><strong>Mod Organizer 2:</strong> drag the downloaded archive into MO2's <em>Downloads</em> tab (or use the archive icon, <em>Install a new mod from an archive</em>), then double-click it to install.</p>
            <p><strong>Vortex:</strong> drag the archive onto Vortex's <em>Mods</em> page, then click <em>Install</em> and enable it.</p>
            <p>If the mod has install options, your mod manager shows them during the install. With the <a href="helper.html">Waypoint helper</a>, the file lands in your downloads automatically.</p>
          </details>` : ''}
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
  // The site is rebuilt when something changes. In between, pages show fresh download counts and stars,
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

  // One shared request per page, however many parts of the page ask for it.
  let statsRequest = null;
  const getStats = () => statsRequest || (statsRequest = !SITE.statsUrl || window.MODS_ARE_EXAMPLES
    ? Promise.resolve(null)
    : remembered('stats', async () => {
      try {
        const res = await fetch(SITE.statsUrl);
        return res.ok ? (await res.json()).repos : null;
      } catch (e) { return null; }
    }));

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
        urls: rels[0].assets.filter(a => ARCHIVE_RE.test(a.name)).map(a => a.browser_download_url)
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
      note.innerHTML = `<div class="notice"><strong>${esc(n.tag)} was just released.</strong> ${noScanChosen(m)
        ? 'It will appear here in a minute or two.'
        : 'It will appear here in a few minutes, once its files have been virus-scanned.'}</div>`;
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

  if (['home', 'browse', 'mod'].includes(page)) getStats(); // start the request before drawing the page
  shell();
  if (page === 'mod') modPage();
  else if (page === 'home') liveLists(home());
  else if (page === 'browse') liveLists(browse());
})();
