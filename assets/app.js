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
    m.activity = m.lastUpdated > m.created ? m.lastUpdated : m.created;
    m.searchText = [m.name, m.summary, m.author, m.authorName || '', m.category, ...m.tags].join(' ').toLowerCase();
  });
  // Mods whose repository turned out to be deleted (from live data) drop out of every list.
  const listed = () => MODS.filter(m => !m.gone);
  const issueUrl = (template, title) =>
    `https://github.com/${SITE.indexRepo}/issues/new?template=${encodeURIComponent(template)}` +
    (title ? '&title=' + encodeURIComponent(title) : '');

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function countBy(mods, fn) {
    const out = {};
    mods.forEach(m => [].concat(fn(m)).forEach(k => { out[k] = (out[k] || 0) + 1; }));
    return out;
  }

  const SORTS = {
    popular: (a, b) => b.totalDownloads - a.totalDownloads,
    updated: (a, b) => b.lastUpdated.localeCompare(a.lastUpdated),
    new: (a, b) => b.created.localeCompare(a.created),
    fresh: (a, b) => b.activity.localeCompare(a.activity),
    stars: (a, b) => b.stars - a.stars,
    name: (a, b) => a.name.localeCompare(b.name)
  };

  // ---------- icons ----------
  const P = {
    dl: '<path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4m0 3h.01"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    heart: '<path d="M12 20s-7.5-4.6-9.4-9.3C1.3 7.4 3.4 4 6.9 4c2 0 3.6 1.1 4.6 2.7h1C13.5 5.1 15.1 4 17.1 4c3.5 0 5.6 3.4 4.3 6.7C19.5 15.4 12 20 12 20z"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/>'
  };
  const svg = (name, s = 14) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;

  // ---------- text formatting: Markdown and Nexus-style BBCode ----------
  // Authors can paste a Nexus description as it is. The text is HTML-escaped first; only the tags
  // below become HTML again, and links and images must be http(s). Used for descriptions,
  // changelogs (GitHub release notes, which are Markdown), credits and permission notes.
  const URL_OK = /^https?:\/\/[^\s"'<>\u0002\u0003]+$/i;
  const COLOR_OK = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\(\d{1,3},\d{1,3},\d{1,3}(,(0|1|0?\.\d+))?\))$/i;
  const SIZES = { 1: '.75em', 2: '.875em', 3: '1em', 4: '1.25em', 5: '1.5em', 6: '1.9em', 7: '2.3em' };
  // A [color=...] or [size=...] value as authors write it, maybe in quotes or with spaces. null if not safe.
  const bare = v => String(v).replace(/&quot;|&#39;|\s/g, '');
  const colorOf = v => (COLOR_OK.test(bare(v)) ? bare(v) : null);
  const sizeOf = v => SIZES[bare(v)] || null;
  const ytId = v => (/^[\w-]{11}$/.test(v) ? v : ((v.match(/(?:[?&]v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1] || null));
  const BLOCK = '\u0001'; // marks a line holding generated block HTML, passed through as it is

  function md(src) {
    const keep = [];
    const hold = h => `\u0002${keep.push(h) - 1}\u0003`;
    const unhold = s => { let t = s; for (let i = 0; i < 3 && t.includes('\u0002'); i++) t = t.replace(/\u0002(\d+)\u0003/g, (_, n) => keep[n]); return t; };
    const linkOpen = u => hold(`<a href="${u}" target="_blank" rel="noopener nofollow ugc">`);
    const img = (u, alt) => hold(`<img class="d-img" src="${u}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`);
    const yt = id => hold(`<button type="button" class="yt" data-yt="${id}"><span class="yt-play" aria-hidden="true">▶</span><span>Play video<small>Loads from YouTube</small></span></button>`);
    const block = h => `\n${BLOCK}${h}\n`;

    let s = esc(String(src || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')).replace(/\r\n?/g, '\n')
      .replace(/^[^\S\n]+$/gm, ''); // a line of only spaces (often non-breaking ones copied from a web page) is a blank line

    // Code is kept exactly as written.
    s = s.replace(/^```[^\n]*\n([\s\S]*?)^```[ \t]*$/gm, (_, c) => block(hold(`<pre><code>${c.replace(/\n$/, '')}</code></pre>`)));
    s = s.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_, c) => block(hold(`<pre><code>${c.replace(/^\n|\n$/g, '')}</code></pre>`)));
    s = s.replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${c}</code>`));

    // Images, videos and links.
    s = s.replace(/\[img(?:=[^\]]*)?\]\s*(\S+?)\s*\[\/img\]/gi, (m, u) => (URL_OK.test(u) ? img(u, '') : m));
    s = s.replace(/!\[([^\]\n]*)\]\((\S+?)\)/g, (m, a, u) => (URL_OK.test(u) ? img(u, a) : m));
    s = s.replace(/\[youtube\]\s*(\S+?)\s*\[\/youtube\]/gi, (m, v) => { const id = ytId(v); return id ? block(yt(id)) : m; });
    s = s.replace(/\[url=(?:&quot;|&#39;)?([^\s\]]+?)(?:&quot;|&#39;)?\]([\s\S]*?)\[\/url\]/gi, (m, u, t) => (URL_OK.test(u) ? linkOpen(u) + t + hold('</a>') : m));
    s = s.replace(/\[url\]\s*(\S+?)\s*\[\/url\]/gi, (m, u) => (URL_OK.test(u) ? linkOpen(u) + u + hold('</a>') : m));
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => (URL_OK.test(u) ? linkOpen(u) + t + hold('</a>') : m));
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<()\u0002\u0003\[\]]*[^\s<().,;:!?'"\u0002\u0003\[\]])/gm, (m, pre, u) => pre + linkOpen(u) + u + hold('</a>'));

    // Block tags, only when every opening tag has its closing tag (otherwise they stay as text).
    const count = re => (s.match(re) || []).length;
    const BLOCKS = {
      center: ['<div class="t-center">', '</div>'], right: ['<div class="t-right">', '</div>'], left: ['<div>', '</div>'],
      quote: ['<blockquote>', '</blockquote>'], spoiler: ['<details class="spoiler"><summary>Spoiler</summary>', '</details>']
    };
    for (const [tag, [a, b]] of Object.entries(BLOCKS)) {
      const open = new RegExp(`\\[${tag}(?:=[^\\]]*)?\\]`, 'gi'), close = new RegExp(`\\[\\/${tag}\\]`, 'gi');
      if (count(open) && count(open) === count(close)) s = s.replace(open, block(a)).replace(close, block(b));
    }
    s = s.replace(/\[\/\*\]/g, ''); // some editors close list items with [/*]; the next item closes it anyway
    if (count(/\[list(?:=[^\]]*)?\]/gi) && count(/\[list(?:=[^\]]*)?\]/gi) === count(/\[\/list\]/gi)) {
      const stack = [];
      s = s.replace(/\[list(=[^\]]*)?\]|\[\/list\]|\[\*\]/gi, (m, num) => {
        if (m === '[*]') return stack.length ? block('<li>') : m; // </li> is implied by the next <li>
        if (/^\[\//.test(m)) return block(stack.pop() || '</ul>');
        stack.push(num ? '</ol>' : '</ul>');
        return block(num ? '<ol>' : '<ul>');
      });
    }
    s = s.replace(/\[line\]|\[hr\]/gi, block('<hr>'));
    // Text styles around several paragraphs, or around a block such as [center] or [list], become a
    // block of their own, so they don't break the paragraphs. Inside one paragraph they stay inline (below).
    const STYLE_OF = {
      b: () => 'font-weight:700', i: () => 'font-style:italic', u: () => 'text-decoration:underline', s: () => 'text-decoration:line-through',
      size: v => (sizeOf(v) ? `font-size:${sizeOf(v)}` : null), color: v => (colorOf(v) ? `color:${colorOf(v)}` : null), font: () => ''
    };
    for (let pass = 0; pass < 4; pass++) {
      const before = s;
      s = s.replace(/\[(b|i|u|s|size|colou?r|font)(?:\s*=\s*([^\]\n]+))?\]((?:(?!\[\1[\]\s=])(?!\[\/\1\])[\s\S])*?(?:\n\n|\n\u0001)(?:(?!\[\1[\]\s=])(?!\[\/\1\])[\s\S])*?)\[\/\1\]/gi, (m, tag, v, body) => {
        const style = STYLE_OF[tag.toLowerCase().replace('colour', 'color')](v || '');
        if (style === null) return body;
        return style ? block(`<div style="${style}">`) + body + block('</div>') : body;
      });
      if (s === before) break;
    }

    // Inline formatting inside one paragraph.
    function inline(t) {
      for (let pass = 0; pass < 4; pass++) {
        const before = t;
        t = t.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
          .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>')
          .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
          .replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<del>$1</del>')
          .replace(/\[font=[^\]]*\]([\s\S]*?)\[\/font\]/gi, '$1')
          .replace(/\[size\s*=\s*([^\]]+)\]([\s\S]*?)\[\/size\]/gi, (m, n, x) => (sizeOf(n) ? `<span style="font-size:${sizeOf(n)}">${x}</span>` : x))
          // innermost colour first, so nested colours each keep their own
          .replace(/\[colou?r\s*=\s*([^\]]+)\]((?:(?!\[colou?r[\s=])[\s\S])*?)\[\/colou?r\]/gi, (m, c, x) => (colorOf(c) ? `<span style="color:${colorOf(c)}">${x}</span>` : x));
        if (t === before) break;
      }
      return t
        .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
        .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
        .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
        .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, '$1<em>$2</em>')
        .replace(/(^|[^_\w])_(?=\S)([^_\n]*?\S)_(?![_\w])/g, '$1<em>$2</em>');
    }

    // Lines into blocks: headings, lists, quotes, dividers, paragraphs.
    const out = [];
    let para = [], list = null, quote = [];
    const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join('\n')).replace(/\n/g, '<br>') + '</p>'); para = []; } };
    const flushL = () => { if (list) { out.push(`<${list.tag}>` + list.items.map(li => '<li>' + inline(li) + '</li>').join('') + `</${list.tag}>`); list = null; } };
    const flushQ = () => { if (quote.length) { out.push('<blockquote><p>' + inline(quote.join('\n')).replace(/\n/g, '<br>') + '</p></blockquote>'); quote = []; } };
    const flush = () => { flushP(); flushL(); flushQ(); };
    s.split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) { flush(); return; }
      if (line.startsWith(BLOCK)) { flush(); out.push(line.slice(1)); return; }
      let m;
      if ((m = line.match(/^(#{1,6})\s+(.+?)\s*#*$/))) { flush(); const h = Math.min(6, Math.max(3, m[1].length + 1)); out.push(`<h${h}>${inline(m[2])}</h${h}>`); return; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flush(); out.push('<hr>'); return; }
      if ((m = line.match(/^&gt;\s?(.*)$/))) { flushP(); flushL(); quote.push(m[1]); return; }
      if ((m = line.match(/^(?:[-*+•]\s+|\[\*\]\s*)(.+)$/)) || (m = line.match(/^\d{1,3}[.)]\s+(.+)$/))) { // [*] without [list] too
        const tag = /^\d/.test(line) ? 'ol' : 'ul';
        flushP(); flushQ();
        if (list && list.tag !== tag) flushL();
        (list = list || { tag, items: [] }).items.push(m[1]);
        return;
      }
      flushL(); flushQ(); para.push(line);
    });
    flush();
    return unhold(out.join('\n'));
  }

  // Videos in descriptions load from YouTube only when the visitor presses play.
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.yt[data-yt]');
    if (!b || !/^[\w-]{11}$/.test(b.dataset.yt)) return;
    const f = document.createElement('iframe');
    f.className = 'yt-frame';
    f.src = `https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1`;
    f.title = 'YouTube video';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    b.replaceWith(f);
  });

  // ---------- shared pieces ----------
  // Line icons per category: drawn inside the waypoint pin on covers, banners and category links.
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
  // AI disclosure and Nexus-style permissions (stored by the Add / Edit forms).
  const AI_LABEL = { none: 'No AI used', assisted: 'AI-assisted', generated: 'AI-generated' };
  const AI_TEXT = {
    none: 'The author says no AI was used to make this mod.',
    assisted: 'The author says AI helped make this mod, but the work is mainly theirs.',
    generated: 'The author says a large part of this mod was made by AI.'
  };
  const AI_PART_LABEL = { audio: 'voices or other audio', images: 'textures or images', models: 'meshes or models', code: 'scripts or code', text: 'text, dialogue or descriptions' };
  const aiTag = m => (m.ai === 'assisted' || m.ai === 'generated') ? `<span class="ai-tag ai-${m.ai}">${AI_LABEL[m.ai]}</span>` : '';
  const PERM_INFO = [
    ['upload', 'Upload to other sites', 'Re-uploading this mod to other websites.'],
    ['modify', 'Modify and re-release', 'Releasing fixes, patches or translations that include its files.'],
    ['convert', 'Convert to other games or versions', 'Porting it, for example to Skyrim VR or LE.'],
    ['assets', 'Use assets in other mods', 'Using its meshes, textures, sounds or scripts in your own mod.'],
    ['commercial', 'Use in paid or commercial mods', 'Using any part of it in something that is sold.']
  ];
  const PERM_ANSWER = {
    yes: ['Allowed', '<path d="M20 6 9 17l-5-5"/>'],
    ask: ['Ask the author first', '<path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14M12 17h.01"/>'],
    no: ['Not allowed', '<path d="M18 6 6 18M6 6l12 12"/>']
  };

  const catIcon = (c, size, width) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CAT_ICON[c] || CAT_ICON.Other}</svg>`;

  // ---------- trail map drawing ----------
  // Topographic contour lines: n irregular closed rings around a peak. The seed shapes them, so each
  // mod keeps the same little map every time.
  function rings(cx, cy, n, base, step, seed) {
    let out = '';
    for (let k = 0; k < n; k++) {
      const r0 = base + k * step;
      let d = '';
      for (let i = 0; i <= 72; i++) {
        const a = i / 72 * Math.PI * 2;
        const r = r0 * (1 + 0.13 * Math.sin(3 * a + seed + k * 0.22) + 0.07 * Math.sin(5 * a + seed * 1.7 - k * 0.15) + 0.05 * Math.sin(2 * a + seed * 0.6));
        d += (i ? 'L' : 'M') + (cx + r * Math.cos(a) * 1.35).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1);
      }
      out += `<path d="${d}Z"/>`;
    }
    return out;
  }
  const contours = (paths, width = 1.2) => `<g fill="none" stroke-width="${width}" style="stroke: var(--contour)">${paths}</g>`;
  const seedOf = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 628) / 100; };
  // The waypoint pin: a 24 x 26 shape whose round head is centred on (12, 10).
  const PIN_PATH = 'M12 25S2 16.6 2 10a10 10 0 0 1 20 0c0 6.6-10 15-10 15z';
  const pin = c => `<span class="pin"><svg viewBox="0 0 24 26" aria-hidden="true"><path d="${PIN_PATH}" fill="currentColor"/></svg>${catIcon(c, 22, 2)}</span>`;
  // A big pin inside an SVG map, its head centred on (x, y).
  const bigPin = (x, y, scale) => `<path d="${PIN_PATH}" transform="translate(${x - 12 * scale} ${y - 10 * scale}) scale(${scale})" style="fill: var(--accent)"/>`;
  // Each mod's little contour map never changes, so it is drawn once and remembered.
  const coverMaps = new Map();
  const coverMap = id => coverMaps.get(id) || coverMaps.set(id, contours(rings(150, 75, 6, 16, 16, seedOf(id)))).get(id);
  const warnPill = m => (unscanned(m) ? `<span class="warn-pill" title="${esc(scanReason(m))}">${svg('alert', 12)} Not virus-scanned</span>` : '');

  // Big background maps for the home page hero and share panel.
  const BACKDROPS = {
    hero: () => `<svg class="topo" viewBox="0 0 1440 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      ${contours(rings(1080, 300, 12, 46, 30, 0.6) + rings(240, 120, 6, 40, 34, 2.4), 1.3)}
      <g class="trail"><path d="M560 690 C 660 610, 720 560, 830 520 S 1010 420, 1080 336" fill="none" stroke-width="3" stroke-dasharray="1 11" stroke-linecap="round" style="stroke: var(--accent)"/>
      <circle cx="830" cy="520" r="7" style="fill: var(--moss)"/>
      <ellipse cx="1080" cy="338" rx="30" ry="9" fill="none" stroke-width="1.5" style="stroke: var(--accent); opacity: .45"/>
      ${bigPin(1080, 280, 4)}<circle cx="1080" cy="280" r="14" style="fill: var(--hero)"/></g></svg>`,
    share: () => `<svg class="topo" viewBox="0 0 1200 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${contours(rings(1000, 300, 9, 40, 34, 1.3))}</svg>`
  };
  function backdrops() {
    document.querySelectorAll('[data-topo]').forEach(el => {
      if (BACKDROPS[el.dataset.topo]) el.insertAdjacentHTML('afterbegin', BACKDROPS[el.dataset.topo]());
    });
  }

  // A screenshot when there is one; if it fails to load it removes itself and the map shows through.
  function cover(m, extra = '') {
    const img = m.images && m.images[0];
    const r = latest(m);
    return `<div class="cover"><svg class="topo" viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${coverMap(m.id)}</svg>
      ${pin(m.category)}
      <span class="cover-tag">${esc(m.category)}</span>${extra}
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      ${r ? `<span class="cover-ver">v${esc(r.version)}</span>` : ''}</div>`;
  }
  function card(m, badge) {
    return `<a class="card" href="mod.html?id=${encodeURIComponent(m.id)}">
      <div class="card-media">${cover(m, badge ? `<span class="cover-badge">${badge}</span>` : '')}${warnPill(m)}</div>
      <div class="card-body">
        <h3>${esc(m.name)}</h3>
        <p class="card-sum">${esc(m.summary)}</p>
        <div class="meta">
          <span>by <strong>${esc(authorLabel(m))}</strong></span>
          <span title="Downloads">${svg('dl', 13)} ${fmtNum(m.totalDownloads)}</span>
          <span title="GitHub stars">${svg('star', 13)} ${fmtNum(m.stars)}</span>
          ${aiTag(m)}
        </div>
      </div>
    </a>`;
  }
  // ---------- theme ----------
  // giscus's own themes closest to Waypoint's dark and light look.
  const giscusTheme = () => (currentTheme() === 'dark' ? 'transparent_dark' : 'light');
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
        // Comments (giscus) follow the site's theme switch.
        const frame = document.querySelector('iframe.giscus-frame');
        if (frame) frame.contentWindow.postMessage({ giscus: { setConfig: { theme: giscusTheme() } } }, 'https://giscus.app');
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
    backdrops();
    document.querySelectorAll('[data-site-name]').forEach(e => { e.textContent = SITE.name; });
    document.querySelectorAll('[data-issue]').forEach(a => { a.href = issueUrl(a.dataset.issue); });
    document.querySelectorAll('[data-index-repo]').forEach(a => { a.href = 'https://github.com/' + SITE.indexRepo; });
    if (page === 'home') document.title = `${SITE.name} | ${SITE.tagline}`;
    else if (page !== 'mod') document.title = `${document.title} | ${SITE.name}`;
  }

  // ---------- pages ----------
  // "Popular on the trail": the five most downloaded mods. It moves on by itself every 5 seconds,
  // but waits while the pointer or keyboard focus is on it, for 9 seconds after someone uses the
  // arrows or dots, while the tab is hidden, and never moves on its own for reduced-motion users.
  const slider = { list: [], at: 0, touched: 0, held: 0, timer: null };
  function showSlide(i, byUser) {
    const n = slider.list.length;
    if (!n) return;
    slider.at = (i + n) % n;
    const m = slider.list[slider.at];
    const href = 'mod.html?id=' + encodeURIComponent(m.id);
    const box = $('#slide');
    box.setAttribute('aria-live', byUser ? 'polite' : 'off');
    box.innerHTML = `<a class="slide" href="${href}">
      <div class="card-media">${cover(m, `<span class="rank">#${slider.at + 1}</span>`)}${warnPill(m)}</div>
      <div class="slide-body">
        <h3>${esc(m.name)}</h3>
        <p>${esc(m.summary)}</p>
        <div class="meta">
          <span>by <strong>${esc(authorLabel(m))}</strong></span>
          <span title="Downloads">${svg('dl', 13)} ${fmtNum(m.totalDownloads)}</span>
          ${aiTag(m)}
        </div>
      </div>
    </a>`;
    $('#slide-count').textContent = n > 1 ? `${slider.at + 1} / ${n}` : '';
    $('#slide-link').href = href;
    document.querySelectorAll('#dots .dot').forEach((d, k) => d.setAttribute('aria-current', k === slider.at));
  }
  function startSlider(list) {
    slider.list = list;
    const many = list.length > 1;
    $('#dots').hidden = !many;
    $('.arrows').hidden = !many;
    $('#dots').innerHTML = list.map((m, i) =>
      `<button class="dot" type="button" data-i="${i}" aria-label="Show ${esc(m.name)}"></button>`).join('');
    showSlide(Math.min(slider.at, list.length - 1));
    if (slider.timer) return; // a redraw with fresh numbers: keep the running slider
    const byUser = i => { slider.touched = Date.now(); showSlide(i, true); };
    $('#slide-prev').addEventListener('click', () => byUser(slider.at - 1));
    $('#slide-next').addEventListener('click', () => byUser(slider.at + 1));
    $('#dots').addEventListener('click', e => { const d = e.target.closest('.dot'); if (d) byUser(Number(d.dataset.i)); });
    const box = $('#slider');
    const hold = d => () => { slider.held = Math.max(0, slider.held + d); };
    box.addEventListener('mouseenter', hold(1));
    box.addEventListener('mouseleave', hold(-1));
    box.addEventListener('focusin', hold(1));
    box.addEventListener('focusout', hold(-1));
    let x0 = null;
    box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40 && slider.list.length > 1) byUser(slider.at + (dx < 0 ? 1 : -1));
    });
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    slider.timer = still ? -1 : setInterval(() => {
      if (slider.held || document.hidden || slider.list.length < 2 || Date.now() - slider.touched < 9000) return;
      showSlide(slider.at + 1);
    }, 5000);
  }

  function home() {
    const mods = listed();
    const authors = new Set(mods.map(m => m.author)).size;
    const total = mods.reduce((a, m) => a + m.totalDownloads, 0);
    $('#hero-stats').innerHTML = mods.length
      ? `<b>${plural(mods.length, 'mod')}</b> left here by <b>${plural(authors, 'author')}</b>, downloaded <b>${total === 1 ? '1 time' : fmtNum(total) + ' times'}</b>`
      : '';
    document.querySelectorAll('[data-needs-mods]').forEach(s => { s.hidden = !mods.length; });
    $('#no-mods').hidden = !!mods.length;
    if (!mods.length) return;
    startSlider(mods.slice().sort(SORTS.popular).slice(0, 5));
    // A mod is "New" until it gets a release after the day it was added, then "Updated".
    $('#fresh').innerHTML = mods.slice().sort(SORTS.fresh).slice(0, 4)
      .map(m => card(m, m.lastUpdated > m.created ? 'Updated' : 'New')).join('');
    const cats = countBy(mods, m => m.category);
    $('#cats').innerHTML = Object.keys(cats).sort().map(c =>
      `<a class="cat" href="browse.html?cat=${encodeURIComponent(c)}"><span class="cat-icon">${catIcon(c, 18, 1.9)}</span>
        <span><b>${esc(c)}</b><small>${plural(cats[c], 'mod')}</small></span></a>`).join('');
    return home;
  }

  const matches = (m, words) => words.every(w => m.searchText.includes(w));

  function browse() {
    const p = new URLSearchParams(location.search);
    const st = { q: p.get('q') || '', cat: p.get('cat') || '', game: p.get('game') || '', ai: p.get('ai') || '', sort: SORTS[p.get('sort')] ? p.get('sort') : 'popular' };
    const aiOf = m => m.ai || 'unset';
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
      const ai = countBy(mods, aiOf);
      $('#f-ai').innerHTML = opt('ai', '', 'All', mods.length) +
        ['none', 'assisted', 'generated'].map(k => opt('ai', k, AI_LABEL[k], ai[k] || 0)).join('') +
        (ai.unset ? opt('ai', 'unset', 'Not stated', ai.unset) : '');
    }

    function render() {
      const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
      const list = listed().filter(m => (!st.cat || m.category === st.cat) && (!st.game || m.games.includes(st.game)) &&
        (!st.ai || aiOf(m) === st.ai) && matches(m, words))
        .sort(SORTS[st.sort]);
      $('#count').textContent = plural(list.length, 'mod');
      $('#results').innerHTML = list.length ? list.map(m => card(m)).join('')
        : '<div class="empty">No mods match these filters. <a href="browse.html">Clear filters</a></div>';

      const u = new URLSearchParams();
      ['q', 'cat', 'game', 'ai'].forEach(k => { if (st[k]) u.set(k, st[k]); });
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
      'input-position': 'top', theme: giscusTheme(), lang: 'en', loading: 'lazy'
    };
    Object.keys(attrs).forEach(k => s.setAttribute('data-' + k, attrs[k]));
    box.appendChild(s);
  }

  // "Support the author": the author's donation links (their own, plus their FUNDING.yml).
  function support(m) {
    const links = (m.funding || []).filter(f => f && /^https:\/\//i.test(f.url));
    if (!links.length) return '';
    return `<div class="side-card support"><h4>Support the author</h4>
      <p class="side-note">This mod is free. If you enjoy it, you can tip ${esc(authorLabel(m))} directly; Waypoint takes nothing.</p>
      <div class="support-links">${links.map(f =>
        `<a class="btn" href="${esc(f.url)}" target="_blank" rel="noopener nofollow">${svg('heart', 16)} ${esc(f.label)}</a>`).join('')}</div>
    </div>`;
  }

  function permissionsPanel(m) {
    const p = m.permissions || {};
    const stated = PERM_INFO.some(([k]) => p[k]);
    const rows = PERM_INFO.map(([k, title, desc]) => {
      const [label, icon] = PERM_ANSWER[p[k]] || ['Not stated, so ask the author', PERM_ANSWER.ask[1]];
      return `<div class="perm">
        <span class="perm-icon perm-${p[k] || 'unset'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg></span>
        <span class="perm-what"><b>${title}</b><small>${desc}</small></span>
        <span class="perm-ans perm-${p[k] || 'unset'}">${label}</span>
      </div>`;
    }).join('');
    const parts = (m.aiParts || []).map(x => AI_PART_LABEL[x]).filter(Boolean);
    return `
      <h3 class="panel-h">Permissions</h3>
      ${stated ? '' : '<div class="notice">The author hasn\'t stated permissions for this mod. Ask them before reusing any of it.</div>'}
      <div class="perms">${rows}</div>
      ${m.permissionNotes ? `<h3 class="panel-h">Notes from the author</h3><div class="prose">${md(m.permissionNotes)}</div>` : ''}
      ${m.credits ? `<h3 class="panel-h">Credits</h3><div class="prose">${md(m.credits)}</div>` : ''}
      <h3 class="panel-h">AI use</h3>
      <div class="ai-box">
        <span class="ai-tag ai-${m.ai || 'unset'}">${AI_LABEL[m.ai] || 'Not stated'}</span>
        <p>${m.ai ? AI_TEXT[m.ai] : 'The author hasn\'t said whether AI was used.'}${parts.length ? ` Used for: ${esc(parts.join(', '))}.` : ''}</p>
      </div>
      <p class="muted small">License: ${esc(m.license || 'not stated')}. Permissions are the author's own statement; Waypoint doesn't check them. If in doubt, ask the author.</p>`;
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

    // Trail banner: a contour map with the dotted trail leading to this mod's waypoint pin.
    // With screenshots, the cover (the first one) fills the banner; if it fails to load, the map shows instead.
    const coverImg = m.images && m.images[0];
    const seed = seedOf(m.id);
    root.innerHTML = `
      <div class="banner${coverImg ? ' has-img' : ''}">
        <svg viewBox="0 0 1440 270" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          ${contours(rings(1110, 130, 10, 30, 26, seed) + rings(300, 60, 5, 40, 32, seed + 2), 1.3)}
          <path d="M700 290 C 780 250, 830 200, 920 200 S 1040 150, 1090 128" fill="none" stroke-width="3" stroke-dasharray="1 11" stroke-linecap="round" style="stroke: var(--accent)"/>
          <circle cx="920" cy="200" r="7" style="fill: var(--moss)"/>
          ${bigPin(1110, 90, 3.3)}
          <g transform="translate(1095 75) scale(1.25)" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke: var(--on-accent)">${CAT_ICON[m.category] || CAT_ICON.Other}</g>
        </svg>
        ${coverImg ? `<img src="${esc(coverImg)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('has-img'); this.remove()">` : ''}
      </div>
      <div class="wrap mod-layout">
        <div class="mod-main">
          <div class="mod-head">
            <div class="head-tags"><span class="kicker">${esc(m.category)}</span>${aiTag(m)}</div>
            <h1 class="mod-title">${esc(m.name)}</h1>
            <div class="byline">left here by ${hasOwnName(m)
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
            <button class="tab" role="tab" data-tab="permissions">Permissions</button>
            <button class="tab" role="tab" data-tab="comments">Comments</button>
          </div>
          <section class="panel prose" role="tabpanel" id="p-description">${md(m.description)}</section>
          <section class="panel" role="tabpanel" id="p-files" hidden>${m.releases.map((x, i) => release(m, x, i === 0)).join('')}</section>
          <section class="panel" role="tabpanel" id="p-changelog" hidden>${m.releases.map(x =>
            `<div class="cl"><h3>v${esc(x.version)}<span class="muted">${esc(fmtDate(x.date))}</span></h3><div class="prose">${md(x.notes)}</div></div>`).join('')}</section>
          <section class="panel" role="tabpanel" id="p-permissions" hidden>${permissionsPanel(m)}</section>
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
          ${support(m)}
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
              : '<p class="side-note">None beyond the base game.</p>'}
          </div>
          ${m.tags.length ? `<div class="side-card"><h4>Tags</h4>
            <div class="chips">${m.tags.map(t => `<a class="tag" href="browse.html?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>
          </div>` : ''}
          <div class="side-links">
            <a class="report" href="add.html?edit=${encodeURIComponent(m.id)}">Your mod? Change its details</a>
            <a class="report" href="${issueUrl('report-mod.yml', 'Report: ' + m.name)}" target="_blank" rel="noopener">Report this mod</a>
          </div>
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

  // Shared with add.js (the guided Add your mod page).
  window.Waypoint = { esc, svg, md, card, catIcon, issueUrl, CATEGORIES: Object.keys(CAT_ICON), GAMES, ARCHIVE_RE, fmtSize };

  if (['home', 'browse', 'mod'].includes(page)) getStats(); // start the request before drawing the page
  shell();
  if (page === 'mod') modPage();
  else if (page === 'home') liveLists(home());
  else if (page === 'browse') liveLists(browse());
})();
