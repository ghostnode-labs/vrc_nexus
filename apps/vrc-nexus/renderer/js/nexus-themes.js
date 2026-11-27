/* VRC Nexus – 8.0.5 🎨 Eigene Themes & Themes-Marktplatz (Einstellungen → Aussehen).
 * Ein Theme sind nur 13 Hex-Farben; hier werden daraus die CSS-Variablen gebaut (inline am <html>, überschreibt das eingebaute Theme). */
(function () {
    const T = s => (window.t ? window.t(s) : s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const api = (a, d) => window.NexusUI.api(a, d);
    const toast = (m, bad) => window.NexusUI && window.NexusUI.toast(m, bad);
    const KEYS = ['bg', 'panel', 'panel2', 'accent', 'gold', 'green', 'purple', 'red', 'text', 'muted', 'strong', 'surface', 'line'];
    const LABEL = { bg: 'Hintergrund', panel: 'Karten', panel2: 'Karten (2)', accent: 'Akzent', gold: 'Hervorhebung', green: 'Grün', purple: 'Lila', red: 'Rot', text: 'Text', muted: 'Nebentext', strong: 'Überschriften', surface: 'Menüs', line: 'Linien' };
    const VARS = ['--bg-color', '--bg-rgb', '--panel-rgb', '--panel2-rgb', '--panel-bg', '--panel-hover', '--accent-cyan', '--accent-rgb', '--accent-glow', '--border-color', '--grid-line', '--accent-gold', '--gold-rgb',
        '--accent-green', '--accent-purple', '--accent-red', '--text-main', '--text-muted', '--text-strong', '--surface', '--line', '--scheme', '--ink-rgb', '--shade-rgb', '--shade-k'];
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ');
    let active = null, state = null, market = null, edit = null;

    /** Farben → CSS-Variablen (nur geprüfte #rrggbb-Werte) */
    function vars(t) {
        const c = Object.assign({}, t.colors), v = {};
        const ok = h => /^#[0-9a-f]{6}$/i.test(h || '');
        c.panel2 = ok(c.panel2) ? c.panel2 : c.panel; c.gold = ok(c.gold) ? c.gold : c.accent; c.strong = ok(c.strong) ? c.strong : c.text; c.surface = ok(c.surface) ? c.surface : c.panel; c.line = ok(c.line) ? c.line : c.muted;
        v['--bg-color'] = c.bg; v['--bg-rgb'] = rgb(c.bg);
        v['--panel-rgb'] = rgb(c.panel); v['--panel-bg'] = 'rgba(' + rgb(c.panel) + ', 0.88)';
        v['--panel2-rgb'] = rgb(c.panel2); v['--panel-hover'] = 'rgba(' + rgb(c.panel2) + ', 0.95)';
        v['--accent-cyan'] = c.accent; v['--accent-rgb'] = rgb(c.accent); v['--accent-glow'] = 'rgba(' + rgb(c.accent) + ', 0.3)'; v['--border-color'] = 'rgba(' + rgb(c.accent) + ', 0.28)'; v['--grid-line'] = 'rgba(' + rgb(c.accent) + ', 0.05)';
        v['--accent-gold'] = c.gold; v['--gold-rgb'] = rgb(c.gold);
        if (ok(c.green)) v['--accent-green'] = c.green; if (ok(c.purple)) v['--accent-purple'] = c.purple; if (ok(c.red)) v['--accent-red'] = c.red;
        v['--text-main'] = c.text; v['--text-muted'] = c.muted; v['--text-strong'] = c.strong; v['--surface'] = c.surface; v['--line'] = c.line;
        if (t.scheme === 'light') { v['--scheme'] = 'light'; v['--ink-rgb'] = rgb(c.text); v['--shade-rgb'] = rgb(c.text); v['--shade-k'] = '0.18'; }
        return v;
    }
    /** aktives eigenes Theme anwenden (nach jedem applyUi aufgerufen) */
    function apply() {
        const h = document.documentElement, st = h.style;
        if (!active) { if (h.dataset.custom) { VARS.forEach(k => st.removeProperty(k)); delete h.dataset.custom; } return; }
        const ua = String(((window.VRCX || {}).ui || {})['ui.accent'] || '').toLowerCase(), userAccent = /^#[0-9a-f]{6}$/.test(ua) && ua !== '#38d5e6';   // eigene Akzentfarbe hat Vorrang
        Object.entries(vars(active)).forEach(([k, val]) => { if (!(userAccent && /accent-(cyan|rgb|glow)|border-color/.test(k))) st.setProperty(k, val); });
        h.dataset.custom = active.id;
        h.dataset.scheme = active.scheme === 'light' ? 'light' : 'dark';
    }
    function setActive(t) { if (!t && active) { const st = document.documentElement.style; VARS.forEach(k => st.removeProperty(k)); delete document.documentElement.dataset.custom; } active = t || null; apply(); if (!t && window.NexusApplyUi && window.VRCX && window.VRCX.ui) window.NexusApplyUi(window.VRCX.ui); }
    function boot() { if (!window.NexusUI) return; api('theme_active').then(r => setActive(r.theme)).catch(() => {}); }

    // ---------- Einstellungen: Karte ----------
    const swatch = t => '<span class="th-sw" style="background:' + t.colors.bg + ';border-color:' + (t.colors.line || t.colors.muted) + '"><i style="background:' + t.colors.panel + '"></i><i style="background:' + t.colors.accent + '"></i><i style="background:' + (t.colors.gold || t.colors.accent) + '"></i><i style="background:' + t.colors.text + '"></i></span>';
    function render(box) {
        if (!state) { box.innerHTML = '<div class="vx-loading">…</div>'; return; }
        let h = '<p class="nx-hint">' + esc(T('Eigene Farbschemata: selbst bauen, als Code teilen oder aus dem Themes-Marktplatz der GhostNode-Website holen. Ein Theme besteht nur aus Farben – kein Code.')) + '</p>'
            + '<div class="th-list"><button type="button" class="th-item' + (!state.active ? ' on' : '') + '" data-thuse="">' + esc(T('Eingebautes Theme (oben gewählt)')) + '</button>'
            + state.items.map(t => '<div class="th-item' + (state.active === t.id ? ' on' : '') + '">' + swatch(t) + '<button type="button" class="th-name" data-thuse="' + esc(t.id) + '">' + esc(t.name) + (t.author ? ' <small>· ' + esc(t.author) + '</small>' : '') + (t.from === 'market' ? ' <small>🛒</small>' : '') + '</button>'
                + '<button type="button" class="btn btn-sm" data-thedit="' + esc(t.id) + '" title="' + esc(T('Bearbeiten')) + '">✏️</button><button type="button" class="btn btn-sm" data-thcode="' + esc(t.id) + '" title="' + esc(T('Teilen')) + '">🔗</button><button type="button" class="btn btn-sm" data-thdel="' + esc(t.id) + '" title="' + esc(T('Löschen')) + '">🗑</button></div>').join('') + '</div>'
            + '<div class="nx-row"><button type="button" class="btn btn-sm btn-gold" data-thnew>➕ ' + esc(T('Neues Theme aus den aktuellen Farben')) + '</button><button type="button" class="btn btn-sm" data-thmarket>🛒 ' + esc(T('Themes-Marktplatz')) + '</button></div>'
            + '<div class="nx-row"><input type="text" id="thImport" placeholder="NXT1.… ' + esc(T('oder JSON einfügen')) + '" style="flex:1"><button type="button" class="btn btn-sm" data-thimport>⬇ ' + esc(T('Importieren')) + '</button></div>';
        if (edit) {
            h += '<div class="th-edit"><div class="nx-row"><input type="text" id="thName" value="' + esc(edit.name) + '" maxlength="40" placeholder="Name" style="flex:1"><input type="text" id="thId" value="' + esc(edit.id) + '" maxlength="40" placeholder="id" style="width:160px">'
                + '<select id="thScheme"><option value="dark"' + (edit.scheme !== 'light' ? ' selected' : '') + '>🌙 ' + esc(T('dunkel')) + '</option><option value="light"' + (edit.scheme === 'light' ? ' selected' : '') + '>☀️ ' + esc(T('hell')) + '</option></select></div>'
                + '<div class="th-colors">' + KEYS.map(k => '<label><input type="color" data-thc="' + k + '" value="' + esc(edit.colors[k] || '#888888') + '"> ' + esc(T(LABEL[k])) + '</label>').join('') + '</div>'
                + '<div class="nx-row"><input type="text" id="thAuthor" value="' + esc(edit.author || '') + '" maxlength="40" placeholder="' + esc(T('Autor (optional)')) + '" style="flex:1"><button type="button" class="btn btn-sm btn-gold" data-thsave>💾 ' + esc(T('Speichern & benutzen')) + '</button><button type="button" class="btn btn-sm" data-thcancel>' + esc(T('Abbrechen')) + '</button></div>'
                + '<p class="vx-small">' + esc(T('Vorschau läuft live. Text und Hintergrund brauchen genug Kontrast (mind. 4,5 : 1).')) + '</p></div>';
        }
        if (market) h += '<div class="th-market"><h4>🛒 ' + esc(T('Themes-Marktplatz')) + '</h4>' + (market.items.length ? '<div class="th-grid">' + market.items.map(t => '<div class="th-card">' + swatch(t) + '<b>' + esc(t.name) + '</b><small>' + (t.scheme === 'light' ? '☀️' : '🌙') + (t.author ? ' · ' + esc(t.author) : '') + ' · ⬇ ' + t.installs + '</small>'
            + (market.have.includes(t.id) ? '<button type="button" class="btn btn-sm" data-thuse="' + esc(t.id) + '">✔ ' + esc(T('Benutzen')) + '</button>' : '<button type="button" class="btn btn-sm btn-gold" data-thinst="' + esc(t.id) + '">⬇ ' + esc(T('Installieren')) + '</button>') + '</div>').join('') + '</div>' : '<p class="vx-small">' + esc(T('Noch keine Themes im Katalog – reich auf der Website das erste ein!')) + '</p>') + '</div>';
        box.innerHTML = h;
    }
    function current() {
        const cs = getComputedStyle(document.documentElement), g = k => { const v = cs.getPropertyValue(k).trim(); if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase(); const m = /(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v); return m ? '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('') : ''; };
        const c = { bg: g('--bg-color') || g('--bg-rgb') || '#040609', panel: g('--panel-rgb') || '#0a1018', panel2: g('--panel2-rgb') || '#121c2a', accent: g('--accent-cyan') || '#38d5e6', gold: g('--accent-gold') || '#f3c262', green: g('--accent-green') || '#4ade80',
            purple: g('--accent-purple') || '#a78bfa', red: g('--accent-red') || '#ff5555', text: g('--text-main') || '#e2e8f0', muted: g('--text-muted') || '#8a93a6', strong: g('--text-strong') || '#ffffff', surface: g('--surface') || '#0b121b', line: g('--line') || '#3a4456' };
        return { id: 'mein-theme-' + Math.random().toString(36).slice(2, 6), name: T('Mein Theme'), author: '', scheme: document.documentElement.dataset.scheme === 'light' ? 'light' : 'dark', colors: c };
    }
    function card(box) {
        if (!box) return;
        const load = () => api('theme_list').then(r => { state = r; render(box); }).catch(e => { box.innerHTML = '<p class="vx-small">⚠ ' + esc(e.message) + '</p>'; });
        load();
        if (box.dataset.thBound) return;
        box.dataset.thBound = '1';
        const done = r => { if (r.msg) toast(r.msg); state = r; if (r.theme !== undefined) setActive(r.theme); render(box); };
        const bad = e => toast(e.message, true);
        box.addEventListener('input', e => {
            const c = e.target.closest('[data-thc]'); if (!c || !edit) return;
            edit.colors[c.dataset.thc] = c.value; setActive(Object.assign({}, edit, { id: '__preview' }));
        });
        box.addEventListener('change', e => { if (e.target.id === 'thScheme' && edit) { edit.scheme = e.target.value; setActive(Object.assign({}, edit, { id: '__preview' })); } });
        box.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.thuse !== undefined) return api('theme_use', { id: b.dataset.thuse }).then(r => { done(r); setActive(r.theme); }).catch(bad);
            if (b.dataset.thdel) return confirm(T('Theme löschen?')) && api('theme_del', { id: b.dataset.thdel }).then(r => { done(r); if (!r.active) setActive(null); }).catch(bad);
            if (b.dataset.thcode) return api('theme_code', { id: b.dataset.thcode }).then(r => navigator.clipboard.writeText(r.code)).then(() => toast('🔗 ' + T('Theme-Code kopiert – zum Einreichen auf der Website das JSON aus „Bearbeiten“ nehmen oder den Code teilen.'))).catch(bad);
            if (b.hasAttribute('data-thnew')) { edit = current(); render(box); return; }
            if (b.dataset.thedit) { const t = state.items.find(x => x.id === b.dataset.thedit); edit = JSON.parse(JSON.stringify(t)); KEYS.forEach(k => { if (!edit.colors[k]) edit.colors[k] = current().colors[k]; }); render(box); return; }
            if (b.hasAttribute('data-thcancel')) { edit = null; api('theme_active').then(r => setActive(r.theme)); render(box); return; }
            if (b.hasAttribute('data-thsave')) {
                const g = id => document.getElementById(id).value;
                const t = { id: g('thId'), name: g('thName'), author: g('thAuthor'), scheme: g('thScheme'), colors: edit.colors };
                return api('theme_save', { theme: JSON.stringify(t), use: '1' }).then(r => { edit = null; done(r); return api('theme_active'); }).then(r => setActive(r.theme)).catch(bad);
            }
            if (b.hasAttribute('data-thimport')) return api('theme_import', { code: document.getElementById('thImport').value }).then(done).catch(bad);
            if (b.hasAttribute('data-thmarket')) return api('theme_market', { refresh: '1' }).then(r => { market = r; render(box); }).catch(bad);
            if (b.dataset.thinst) return api('theme_install', { id: b.dataset.thinst }).then(r => { done(r); market.have.push(b.dataset.thinst); render(box); }).catch(bad);
        });
    }
    window.NexusThemes = { boot, apply, card, vars, setActive };
    setTimeout(boot, 0);
})();
