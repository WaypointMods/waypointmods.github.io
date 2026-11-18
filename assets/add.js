// Guided "Add your mod" / "Change your mod" page (add.html, and add.html?edit=<id> for changes).
// Adding: checks the repository with GitHub's public API and collects the answers in four short steps.
// Changing: starts from the mod's current details and sends only what changed.
// Either way it then opens a short GitHub form with the answers filled in, so the author only adds
// screenshots and presses Create. The bot (scripts/submission.mjs) reads it like the full forms.
(function () {
  'use strict';

  const W = window.Waypoint;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const form = $('#wizard');
  const steps = $$('.wstep');
  const params = new URLSearchParams(location.search);
  const EDIT = params.has('edit');
  const DRAFT = 'waypoint-add-draft';

  // Exact option texts of the GitHub forms, which the bot (scripts/lib.mjs) expects.
  const AI_OPTION = {
    none: 'No AI used',
    assisted: 'AI-assisted: AI helped, but the work is mainly mine',
    generated: 'AI-generated: a large part was made by AI'
  };
  const SCAN_OPTION = {
    private: 'Private scan: ClamAV + VirusTotal fingerprint (recommended)',
    full: 'Full scan with VirusTotal',
    off: 'No scan'
  };
  // [field name, question shown here, default when adding, hint, question in the GitHub form, stored key]
  const PERMS = [
    ['perm-upload', 'Upload it to other sites', 'Ask me first', '', 'Upload to other sites', 'upload'],
    ['perm-modify', 'Modify and re-release it', 'Ask me first', 'For example fixes, patches or translations that include your files', 'Modify and re-release', 'modify'],
    ['perm-convert', 'Convert it to other games or versions', 'Ask me first', 'For example to Skyrim VR or LE', 'Convert to other games or versions', 'convert'],
    ['perm-assets', 'Use its assets in their own mods', 'Ask me first', 'Meshes, textures, sounds or scripts', 'Use assets in other mods', 'assets'],
    ['perm-commercial', 'Use it in paid or commercial mods', 'No', '', 'Use in paid or commercial mods', 'commercial']
  ];
  const ANSWERS = ['Yes', 'Ask me first', 'No'];
  const ANSWER_OF = { yes: 'Yes', ask: 'Ask me first', no: 'No' };
  const GAMES = { se: 'Skyrim SE/AE', vr: 'Skyrim VR', le: 'Skyrim LE' };
  const AI_PART_OF = { audio: 'Voices or other audio', images: 'Textures or images', models: 'Meshes or models', code: 'Scripts or code', text: 'Text, dialogue or descriptions' };
  // Fields an author may empty when changing a mod; the bot takes "none" as "remove it".
  const CLEARABLE = ['Display name', 'Requirements', 'Tags', 'Credits', 'Permission notes'];
  // Longer links than this risk GitHub's "414 URI Too Long"; the description is then copied by hand.
  const MAX_URL = 7500;

  let at = 0;
  let reached = 0;
  let repo = null;    // adding: { full, owner, org, version } once the check passed
  let mod = null;     // changing: the listed mod being changed
  let base = null;    // changing: its answers before any change, to compare against

  // ---------- page mode ----------
  $$('[data-mode]').forEach(el => { el.hidden = el.dataset.mode !== (EDIT ? 'edit' : 'add'); });
  if (EDIT) {
    document.title = document.title.replace('Add your mod', 'Change your mod');
    $('#hero-eyebrow').textContent = 'Keep your waypoint up to date';
    $('#hero-title').textContent = 'Change your mod';
    $('#hero-lead').textContent = 'Pick your mod, change what you want, and send. Everything you leave alone stays as it is.';
  }

  // ---------- build the pickers ----------
  $('#f-category').innerHTML = W.CATEGORIES.map(c =>
    `<label class="tile"><input type="radio" name="category" value="${W.esc(c)}">${W.catIcon(c, 22, 1.8)}<span>${W.esc(c)}</span></label>`).join('');
  $('#perm-pick').innerHTML = PERMS.map(([id, label, def, hint]) =>
    `<div class="perm-row" role="radiogroup" aria-label="${W.esc(label)}">
      <span class="perm-q"><b>${W.esc(label)}</b>${hint ? `<small>${W.esc(hint)}</small>` : ''}</span>
      <span class="seg">${ANSWERS.map(a =>
        `<label><input type="radio" name="${id}" value="${a}"${a === def && !EDIT ? ' checked' : ''}><span>${a === 'Ask me first' ? 'Ask first' : a}</span></label>`).join('')}</span>
    </div>`).join('');

  function addReq(name = '', url = '') {
    const row = document.createElement('div');
    row.className = 'req-row';
    row.innerHTML = `<input class="input" data-req="name" placeholder="Name, e.g. SKSE" aria-label="Requirement name" value="${W.esc(name)}">
      <input class="input" data-req="url" placeholder="https://..." aria-label="Requirement link" value="${W.esc(url)}">
      <button type="button" class="icon-btn" aria-label="Remove this requirement">×</button>`;
    row.querySelector('button').addEventListener('click', () => { row.remove(); save(); });
    $('#reqs').appendChild(row);
    return row;
  }
  $('#add-req').addEventListener('click', () => { addReq().querySelector('input').focus(); });

  // ---------- reading the answers ----------
  const val = name => { const el = form.elements[name]; return el && !(el instanceof RadioNodeList) ? String(el.value || '').trim() : ''; };
  const picked = name => $$(`input[name="${name}"]:checked`, form).map(i => i.value);
  const setPicked = (name, values) => $$(`input[name="${name}"]`, form).forEach(i => { i.checked = values.includes(i.value); });
  const reqs = () => $$('.req-row').map(r => ({ name: $('[data-req="name"]', r).value.trim(), url: $('[data-req="url"]', r).value.trim() }))
    .filter(q => q.name || q.url);

  // ---------- draft kept in this browser (adding only) ----------
  function save() {
    if (EDIT) return;
    const data = { repo: val('repo'), reqs: reqs(), checked: {}, values: {} };
    $$('input, textarea', form).forEach(el => {
      if (!el.name) return;
      if (el.type === 'radio' || el.type === 'checkbox') { if (el.checked) (data.checked[el.name] = data.checked[el.name] || []).push(el.value); }
      else data.values[el.name] = el.value;
    });
    try { localStorage.setItem(DRAFT, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }
  function restore() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) { /* ignore */ }
    if (!data) return false;
    Object.entries(data.values || {}).forEach(([k, v]) => { const el = form.elements[k]; if (el && 'value' in el && !(el instanceof RadioNodeList)) el.value = v; });
    Object.entries(data.checked || {}).forEach(([k, vs]) => setPicked(k, vs));
    (data.reqs || []).forEach(q => addReq(q.name, q.url));
    if (reqs().length) $('#more-about').open = true;
    return !!data.repo;
  }
  form.addEventListener('input', e => { save(); counts(); aiParts(); if (e.target.name === 'description') descPreview(); });

  // Description preview: exactly how it will look on the mod page.
  function descPreview() {
    const box = $('#desc-preview');
    if (box.hidden) return;
    box.innerHTML = val('description') ? W.md(form.elements.description.value) : '<p class="muted">Nothing to preview yet.</p>';
  }
  $('#desc-preview-btn').addEventListener('click', e => {
    const box = $('#desc-preview');
    box.hidden = !box.hidden;
    e.currentTarget.textContent = box.hidden ? 'Preview' : 'Hide preview';
    e.currentTarget.setAttribute('aria-expanded', String(!box.hidden));
    descPreview();
  });
  form.addEventListener('change', () => { save(); aiParts(); });

  function counts() {
    $$('.count-of').forEach(c => {
      const el = $('#' + c.dataset.for);
      c.textContent = `${el.value.length} / ${el.maxLength}`;
    });
  }
  function aiParts() {
    const ai = picked('ai')[0];
    $('#ai-parts').hidden = !(ai === 'assisted' || ai === 'generated');
  }

  // ---------- step 1 (adding): check the repository ----------
  function parseRepo(s) {
    s = s.trim().replace(/\.git$/, '').replace(/\/+$/, '');
    const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/);
    return m ? `${m[1]}/${m[2]}` : null;
  }
  const ok = t => `<li class="ok">${W.svg('check', 16)}<span>${t}</span></li>`;
  const bad = t => `<li class="bad">${W.svg('alert', 16)}<span>${t}</span></li>`;
  const result = html => { $('#repo-result').innerHTML = html; };
  const listedMods = () => (window.MODS || []).filter(m => !m.gone);

  async function checkRepo() {
    repo = null;
    const full = parseRepo(val('repo'));
    if (!full) {
      result(`<ul class="checks">${bad('That doesn\'t look like a GitHub repository link. It should look like <code>https://github.com/your-name/your-mod</code>.')}</ul>`);
      return false;
    }
    const listed = (window.MODS_ARE_EXAMPLES ? [] : listedMods()).find(m => m.repo.toLowerCase() === full.toLowerCase());
    if (listed) {
      result(`<ul class="checks">${ok(`<b>${W.esc(listed.name)}</b> is already on Waypoint. <a href="mod.html?id=${encodeURIComponent(listed.id)}">See its page</a>, or <a href="add.html?edit=${encodeURIComponent(listed.id)}">change it</a>. New releases show up on their own.`)}</ul>`);
      return false;
    }
    const btn = $('#check-repo');
    btn.disabled = true;
    btn.textContent = 'Checking...';
    try {
      const api = p => fetch('https://api.github.com/repos/' + full + p, { headers: { Accept: 'application/vnd.github+json' } });
      const [r1, r2] = await Promise.all([api(''), api('/releases?per_page=20')]);
      if (r1.status === 404) {
        result(`<ul class="checks">${bad('We can\'t find <b>' + W.esc(full) + '</b>. Check the link, and make sure the repository is <b>public</b>.')}</ul>`);
        return false;
      }
      if (!r1.ok || !r2.ok) {
        // Rate limit or network trouble: let them carry on; the bot checks everything again anyway.
        repo = { full, owner: full.split('/')[0], org: false };
        result(`<ul class="checks">${ok('GitHub didn\'t answer just now, so we couldn\'t check <b>' + W.esc(full) + '</b>. You can carry on: the automatic checks look at it again after you send.')}</ul>`);
        return true;
      }
      const info = await r1.json();
      const rels = (await r2.json()).filter(r => !r.draft && !r.prerelease);
      const rel = rels.find(r => r.assets.some(a => W.ARCHIVE_RE.test(a.name)));
      const owner = info.owner.login;
      const org = info.owner.type === 'Organization';
      const lines = [ok(`Found <b>${W.esc(info.full_name)}</b>.`)];
      if (!rel) {
        lines.push(bad(rels.length
          ? 'Its releases have no .7z, .zip or .rar attached. Edit the release and attach your mod archive.'
          : 'It has no published release yet. See <b>How to get ready</b> below: step 3 onwards.'));
        result(`<ul class="checks">${lines.join('')}</ul>`);
        $('.help').open = !rels.length;
        return false;
      }
      const file = rel.assets.find(a => W.ARCHIVE_RE.test(a.name));
      lines.push(ok(`Latest release <b>${W.esc(rel.tag_name)}</b> with <b>${W.esc(file.name)}</b> (${W.fmtSize(file.size)}).`));
      lines.push(ok(org
        ? `It belongs to the organization <b>${W.esc(owner)}</b>. Make your membership of it <a href="https://github.com/orgs/${W.esc(owner)}/people" target="_blank" rel="noopener">public</a> before you send.`
        : `It belongs to <b>${W.esc(owner)}</b>. You'll send it while signed in to GitHub as ${W.esc(owner)}.`));
      result(`<ul class="checks">${lines.join('')}</ul>`);
      repo = { full: info.full_name, owner, org, version: rel.tag_name.replace(/^v(?=\d)/i, '') };
      // Helpful starting values, only where the author hasn't typed anything yet.
      if (!val('name')) form.elements.name.value = info.name.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
      if (!val('summary') && info.description) form.elements.summary.value = info.description.slice(0, 160);
      form.elements.repo.value = 'https://github.com/' + info.full_name;
      save();
      counts();
      return true;
    } catch (e) {
      repo = { full, owner: full.split('/')[0], org: false };
      result(`<ul class="checks">${ok('We couldn\'t reach GitHub to check it. You can carry on: the automatic checks look at it again after you send.')}</ul>`);
      return true;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Check';
    }
  }

  // ---------- step 1 (changing): pick the mod ----------
  const ownerOf = m => m.repo.split('/')[0];
  function thumb(m) {
    const img = m.images && m.images[0];
    return `<span class="pick-thumb">${W.catIcon(m.category, 20, 1.8)}${img ? `<img src="${W.esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
  }
  function renderPicker() {
    const words = val('find').toLowerCase().split(/\s+/).filter(Boolean);
    const list = listedMods().filter(m => words.every(w => [m.name, m.author, m.authorName, m.repo].join(' ').toLowerCase().includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name));
    $('#mod-pick').innerHTML = list.length ? list.slice(0, 30).map(m =>
      `<button type="button" class="pick${mod && mod.id === m.id ? ' on' : ''}" role="option" aria-selected="${!!(mod && mod.id === m.id)}" data-id="${W.esc(m.id)}">
        ${thumb(m)}<span><b>${W.esc(m.name)}</b><small>${W.esc(m.authorName || m.author)} · github.com/${W.esc(m.repo)}</small></span></button>`).join('')
      : '<div class="empty">No listed mod matches. To list a new one, <a href="add.html">add your mod</a>.</div>';
  }
  function chooseMod(m) {
    mod = m;
    renderPicker();
    $('#mod-chosen').innerHTML = `<ul class="checks">${ok(`Changing <b>${W.esc(m.name)}</b>. <a href="mod.html?id=${encodeURIComponent(m.id)}" target="_blank" rel="noopener">See its page</a>`)}
      ${ok(`It belongs to <b>${W.esc(ownerOf(m))}</b> on GitHub. You'll send the changes while signed in as ${W.esc(ownerOf(m))}.`)}</ul>`;
    load(m);
    $('#remove-box').hidden = false;
    $('#rm-name').textContent = m.name;
    $('#rm-ok').checked = false;
    $('#rm-error').textContent = '';
    try { history.replaceState(null, '', 'add.html?edit=' + encodeURIComponent(m.id)); } catch (e) { /* file:// */ }
  }

  // "Remove this mod from Waypoint instead": the bot takes the entry off the site after the usual owner
  // check. The author's repository is never touched.
  function removalUrl() {
    const q = new URLSearchParams();
    q.set('template', 'edit-mod-guided.yml');
    q.set('title', 'Remove: ' + mod.name);
    q.set('answers', block([['Mod ID', mod.id], ['Remove from Waypoint', 'Yes, remove it']]));
    return `https://github.com/${SITE.indexRepo}/issues/new?` + q.toString().replace(/\+/g, '%20');
  }
  $('#rm-send').addEventListener('click', e => {
    if (!mod || !$('#rm-ok').checked) { e.preventDefault(); $('#rm-error').textContent = 'Tick the box first to confirm.'; return; }
    e.currentTarget.href = removalUrl();
  });
  $('#rm-ok').addEventListener('change', () => { $('#rm-error').textContent = ''; });

  // Fill every question with the mod's current details.
  function load(m) {
    form.elements.name.value = m.name;
    form.elements.summary.value = m.summary;
    form.elements['author-name'].value = m.authorName && m.authorName.toLowerCase() !== m.author.toLowerCase() ? m.authorName : '';
    setPicked('category', [m.category]);
    setPicked('games', (m.games || []).map(g => GAMES[g]));
    form.elements.description.value = m.description || '';
    $('#reqs').innerHTML = '';
    (m.requirements || []).forEach(q => addReq(q.name, q.url));
    form.elements.tags.value = (m.tags || []).join(', ');
    if (m.authorName || (m.requirements || []).length || (m.tags || []).length) $('#more-about').open = true;
    setPicked('ai', m.ai ? [m.ai] : []);
    setPicked('ai-parts', (m.aiParts || []).map(k => AI_PART_OF[k]));
    PERMS.forEach(([id, , , , , key]) => setPicked(id, m.permissions && m.permissions[key] ? [ANSWER_OF[m.permissions[key]]] : []));
    form.elements.credits.value = m.credits || '';
    form.elements['permission-notes'].value = m.permissionNotes || '';
    setPicked('scan', [m.scanMode || 'full']);
    const shots = m.images || [];
    $('#shots').innerHTML = shots.map((u, i) =>
      `<label class="shot"><input type="radio" name="cover" value="${i}"${i === 0 ? ' checked' : ''}><img src="${W.esc(u)}" alt="Screenshot ${i + 1}" loading="lazy" referrerpolicy="no-referrer"><span>${i === 0 ? 'Cover' : 'Make cover'}</span></label>`).join('');
    $('#shots-hint').textContent = shots.length
      ? 'Click a screenshot to make it the cover. To add new ones, drag them into the Screenshots box on GitHub at the end; new screenshots replace all of these.'
      : 'No screenshots yet. Drag some into the Screenshots box on GitHub at the end.';
    $('.shots-remove').hidden = !shots.length;
    setPicked('shots-remove', []);
    counts();
    aiParts();
    base = fields(true);
  }
  $('#shots').addEventListener('change', () => {
    $$('.shot', $('#shots')).forEach(l => { $('span', l).textContent = $('input', l).checked ? 'Cover' : 'Make cover'; });
  });
  $('#mod-pick').addEventListener('click', e => {
    const b = e.target.closest('.pick');
    if (b) chooseMod(listedMods().find(m => m.id === b.dataset.id));
  });

  // ---------- validation per step ----------
  function problem(i) {
    if (i === 0) return EDIT ? (mod ? '' : 'Pick the mod you want to change.') : (repo ? '' : 'Check your repository first.');
    if (i === 1) {
      if (!val('name')) return 'Give your mod a name.';
      if (!val('summary')) return 'Write a one-line summary.';
      if (!picked('category').length) return 'Pick a category.';
      if (!picked('games').length) return 'Tick at least one game it works on.';
      if (!val('description')) return 'Write a description.';
      const half = reqs().find(q => !q.name || !/^https?:\/\//.test(q.url));
      if (half) return 'Each requirement needs a name and a link starting with https://.';
      if (val('tags').split(',').filter(t => t.trim()).length > 8) return 'Use 8 tags at most.';
    }
    if (i === 2 && !picked('ai').length && !(EDIT && base && !base['AI use'])) return 'Say whether you used AI.';
    if (i === 3) {
      if (EDIT) return changes().length ? '' : 'Nothing has changed yet. Go back and change something first.';
      if (picked('rules').length < 3) return 'Tick all three boxes to confirm the rules.';
    }
    return '';
  }

  // ---------- the answers, as the GitHub forms write them ----------
  // GitHub fills in text boxes from a link, but not dropdowns or tick boxes. So the page opens a small
  // form (add-mod-guided.yml / edit-mod-guided.yml) with one box holding every answer in the same
  // "### Question" layout GitHub writes for the full forms. The bot reads both the same way.
  // A "###" line typed by the author would start a new question, so it becomes "##".
  const safe = t => String(t).replace(/^#{3,}[ \t]/gm, '## ');
  const ticks = (all, on) => all.map(x => `- [${on.includes(x) ? 'X' : ' '}] ${x}`).join('\n');
  const aiPartLabels = () => $$('input[name="ai-parts"]').map(i => i.value);

  // Every answer by question, in the full form's order.
  function fields(withDescription) {
    const ai = picked('ai')[0];
    const out = {
      'Repository': repo ? repo.full : parseRepo(val('repo')) || val('repo'),
      'Mod name': val('name'),
      'Display name': val('author-name'),
      'Summary': val('summary'),
      'Category': picked('category')[0] || '',
      'Games': ticks(Object.values(GAMES), picked('games')),
      'Description': withDescription ? val('description') : 'PASTE YOUR DESCRIPTION HERE (it is on your clipboard)',
      'Requirements': reqs().map(r => `${r.name} | ${r.url}`).join('\n'),
      'Tags': val('tags').split(',').map(t => t.trim()).filter(Boolean).join(', '),
      'AI use': AI_OPTION[ai] || '',
      'Which parts used AI?': ai && ai !== 'none' ? ticks(aiPartLabels(), picked('ai-parts')) : ''
    };
    PERMS.forEach(([id, , , , label]) => { out[label] = picked(id)[0] || ''; });
    out['Credits'] = val('credits');
    out['Permission notes'] = val('permission-notes');
    out['Virus scan'] = SCAN_OPTION[picked('scan')[0] || 'private'];
    return out;
  }

  // Changing: only the questions whose answer differs from the mod's current details.
  function changes(withDescription = true) {
    if (!base) return [];
    const now = fields(true);
    const out = [];
    Object.keys(now).forEach(q => {
      if (q === 'Repository' || now[q] === base[q]) return;
      if (q === 'Which parts used AI?' && !picked('ai-parts').length) return; // empty means "keep"
      if (q === 'Description' && !withDescription) { out.push([q, 'PASTE YOUR DESCRIPTION HERE (it is on your clipboard)']); return; }
      out.push([q, now[q] || (CLEARABLE.includes(q) ? 'none' : '')]);
    });
    if (picked('shots-remove').length) out.push(['Screenshots', 'none']);
    else if (Number(picked('cover')[0] || 0) > 0) out.push(['Cover picture', String(Number(picked('cover')[0]) + 1)]);
    return out.filter(([, v]) => v);
  }

  const block = pairs => pairs.map(([q, v]) => `### ${q}\n\n${v ? safe(v) : '_No response_'}`).join('\n\n');

  function buildUrl(withDescription) {
    const q = new URLSearchParams();
    if (EDIT) {
      q.set('template', 'edit-mod-guided.yml');
      q.set('title', 'Edit: ' + mod.name);
      q.set('answers', block([['Mod ID', mod.id], ...changes(withDescription)]));
    } else {
      q.set('template', 'add-mod-guided.yml');
      q.set('title', 'Add: ' + val('name'));
      q.set('answers', block(Object.entries(fields(withDescription))));
    }
    return `https://github.com/${SITE.indexRepo}/issues/new?` + q.toString().replace(/\+/g, '%20');
  }

  const CHANGE_NAMES = { 'Which parts used AI?': 'AI parts', 'Screenshots': 'Screenshots' };
  function preview() {
    const scan = picked('scan')[0] || 'private';
    const ai = picked('ai')[0];
    const images = mod && !picked('shots-remove').length ? (() => {
      const imgs = (mod.images || []).slice();
      const c = Number(picked('cover')[0] || 0);
      return c > 0 ? [imgs[c], ...imgs.filter((_, i) => i !== c)] : imgs;
    })() : [];
    const m = {
      id: 'preview', name: val('name') || 'Your mod', summary: val('summary') || 'Your one-line summary.',
      author: mod ? mod.author : repo ? repo.owner : 'you', authorName: val('author-name'), category: picked('category')[0] || 'Other',
      images, tags: [], stars: mod ? mod.stars : 0, totalDownloads: mod ? mod.totalDownloads : 0, ai, scanMode: scan,
      releases: mod ? mod.releases : [{ version: repo && repo.version ? repo.version : '1.0.0', date: '', assets: [{ scan: scan === 'off' ? 'unscanned' : scan, downloads: 0 }] }]
    };
    $('#preview').innerHTML = W.card(m).replace(/^<a /, '<div ').replace(/<\/a>$/, '</div>').replace(/href="[^"]*"/, '');
    if (EDIT) {
      const list = changes();
      $('#changes').innerHTML = list.length
        ? list.map(([q, v]) => `<li>${W.svg('check', 14)} <span><b>${W.esc(CHANGE_NAMES[q] || q)}</b>${v === 'none' ? ' (removed)' : ''}</span></li>`).join('')
        : '<li class="muted">Nothing yet. Go back and change something.</li>';
    }
    const long = buildUrl(true).length > MAX_URL;
    $('#send').href = (EDIT && !mod) ? '#' : buildUrl(!long);
    $('#send-note').innerHTML = long
      ? `<div class="notice"><strong>Your description is long</strong>, too long to carry over in the link. Copy it now and on GitHub, replace the line <strong>PASTE YOUR DESCRIPTION HERE</strong> with it.
          <p><button class="btn btn-sm" type="button" id="copy-desc">Copy description</button></p></div>`
      : '';
    const copy = $('#copy-desc');
    if (copy) copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(val('description')); copy.textContent = 'Copied'; }
      catch (e) { form.elements.description.select(); copy.textContent = 'Press Ctrl + C to copy'; go(1); }
    });
  }

  // ---------- moving between steps ----------
  function go(i) {
    at = Math.max(0, Math.min(steps.length - 1, i));
    reached = Math.max(reached, at);
    steps.forEach((s, k) => { s.hidden = k !== at; });
    $$('#stepper button').forEach((b, k) => {
      b.disabled = k > reached;
      if (k === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.parentNode.classList.toggle('done', k < reached && k !== at);
    });
    $('#back').hidden = at === 0;
    $('#next').hidden = at === steps.length - 1;
    $('#send').hidden = at !== steps.length - 1;
    $('#werror').textContent = '';
    if (at === steps.length - 1) preview();
  }
  async function next() {
    if (at === 0 && !EDIT && !repo) await checkRepo();
    const p = problem(at);
    $('#werror').textContent = p;
    if (p) return;
    go(at + 1);
    $('#stepper').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const first = $('input:not([type=radio]):not([type=checkbox]), textarea', steps[at]);
    if (first && at === 1) first.focus({ preventScroll: true });
  }
  $('#next').addEventListener('click', next);
  $('#back').addEventListener('click', () => { go(at - 1); });
  $$('#stepper button').forEach(b => b.addEventListener('click', () => {
    const to = Number(b.dataset.go);
    for (let k = 0; k < to; k++) if (problem(k)) { go(k); $('#werror').textContent = problem(k); return; }
    go(to);
  }));
  $('#send').addEventListener('click', e => {
    const p = problem(3);
    if (p) { e.preventDefault(); $('#werror').textContent = p; return; }
    preview(); // make sure the link carries the very latest answers
  });
  form.addEventListener('change', e => { if (at === 3) preview(); if (e.target.name === 'rules') $('#werror').textContent = ''; });
  form.addEventListener('submit', e => e.preventDefault());

  // ---------- start ----------
  counts();
  aiParts();
  if (EDIT) {
    form.elements.find.addEventListener('input', renderPicker);
    const want = listedMods().find(m => m.id === params.get('edit'));
    if (want) chooseMod(want); else renderPicker();
    go(0);
  } else {
    $('#check-repo').addEventListener('click', checkRepo);
    form.elements.repo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkRepo(); } });
    form.elements.repo.addEventListener('input', () => { repo = null; });
    const hadRepo = restore();
    counts();
    aiParts();
    go(0);
    if (hadRepo) checkRepo();
  }
})();
