/* VRC Nexus – 📱 Handy-Oberfläche (3.2.4): schlicht und übersichtlich.
 *   - feste Leiste unten: Start · Freunde · Community · Knöpfe · Menü
 *   - Menü als App-Raster (6.3.2): quadratische Kacheln nach Bereichen, Schnellzugriff mit ⚙ Einstellungen, Suche
 *   - kompakte Kopfzeile, Abgleich-Zeile nur als kleine Zeile, Design/Sprache im Menü statt schwebender Knöpfe
 *   - Filter der Freundesliste hinter „Filter“
 * Nur aktiv mit body.mobile (Android-App). Ändert keine Funktionen, nur die Anordnung. */
(function () {
    const UI = window.NexusUI;
    if (!UI || !document.body.classList.contains('mobile')) return;
    const T = s => (window.t ? window.t(s) : s);
    const menu = document.getElementById('tabs');
    if (!menu) return;   // nicht angemeldet
    const body = document.body;
    body.classList.add('m-ui');

    // ---------- Leiste unten ----------
    const ITEMS = [['home', '🏠', 'Start'], ['friends', '👥', 'Freunde'], ['community', '🫂', 'Community'], ['buttons', '🎛', 'Knöpfe'], ['_menu', '☰', 'Menü']];
    const bar = document.createElement('nav');
    bar.className = 'm-bottom';
    bar.innerHTML = ITEMS.map(([t, i, l]) => '<button type="button" data-mb="' + t + '"><span>' + i + '</span><em>' + UI.esc(T(l)) + '</em></button>').join('');
    document.body.appendChild(bar);
    const shade = document.createElement('div');
    shade.className = 'm-shade';
    menu.parentNode.insertBefore(shade, menu);   // gleiche Ebene wie das Menü, damit es darüber liegt

    // Menü-Kopf mit Schließen + Fuß mit Design/Sprache
    const head = document.createElement('div');
    head.className = 'm-mhead';
    head.innerHTML = '<b>VRC <i>Nexus</i></b><button type="button" class="m-close" aria-label="' + UI.esc(T('Schließen')) + '">✕</button>';
    menu.prepend(head);
    const foot = document.createElement('div');
    foot.className = 'm-mfoot';
    menu.appendChild(foot);
    const park = () => { const c = document.querySelector('.i18n-corner'); if (c && c.parentNode !== foot) foot.appendChild(c); };
    new MutationObserver(() => parkS()).observe(document.body, { childList: true });
    // Einstellungen im Menü immer zeigen (am PC über den Kopf-Knopf)
    const st = menu.querySelector('[data-tab="settings"]');
    if (st) { st.hidden = false; st.classList.add('m-show'); }

    // ---------- 6.3.2: Menü als App-Raster (quadratische Kacheln, sortiert nach Bereichen) ----------
    const SECTIONS = [
        ['🏠', 'Allgemein', ['home', 'notifs', 'search', 'feed']],
        ['👥', 'Freunde', ['friends', 'locations', 'players', 'network', 'netgraph', 'recap', 'moderation']],
        ['🫂', 'Community', ['community', 'clubs', 'groups', 'pulse']],
        ['🎮', 'Spiel & Steuerung', ['client', 'remote', 'buttons', 'osc', 'stream', 'nsfw']],
        ['🎨', 'Inhalte', ['avatars', 'worlds', 'favs', 'coll', 'global', 'gallery', 'shop']],
        ['🧰', 'Werkzeuge & Auswertung', ['tools', 'warn', 'mod', 'calendar', 'stats', 'activity']],
        ['⚙', 'System', ['plugins', 'admin']],
    ];
    const QUICK = ['settings', 'buttons', 'remote', 'osc', 'notifs', 'search'];   // feste Kacheln oben – ⚙ Einstellungen immer zuerst
    const sheet = document.createElement('div');
    sheet.className = 'm-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.innerHTML = '<div class="m-shead"><b>VRC <i>Nexus</i></b><input type="search" class="m-sq" placeholder="' + UI.esc(T('Suchen …')) + '" aria-label="' + UI.esc(T('Menü durchsuchen')) + '"><button type="button" class="m-close" aria-label="' + UI.esc(T('Schließen')) + '">✕</button></div><div class="m-sbody"></div><div class="m-sfoot"></div>';
    document.body.appendChild(sheet);
    const visible = b => !b.hidden && !b.closest('[hidden]') && !b.classList.contains('nc-pc-only');
    function entries() {
        const seen = new Set(), out = [];
        menu.querySelectorAll('.vx-tabbtn').forEach(b => {
            if (!visible(b) && !b.classList.contains('m-show')) return;
            const key = b.dataset.tab + '|' + (b.dataset.msub || '');
            if (seen.has(key)) return; seen.add(key);
            const grp = b.closest('.vx-mgroup'), gname = grp ? (grp.querySelector('.vx-mtop em') || {}).textContent || '' : '';
            out.push({ b, key, tab: b.dataset.tab, sub: b.dataset.msub || '', ic: (b.querySelector('span') || {}).textContent || '•', label: (b.querySelector('em') || {}).textContent || b.textContent.trim(), group: gname,
                badge: (b.querySelector('.vx-badge') || {}).textContent || '', active: b.classList.contains('active') });
        });
        return out;
    }
    const tile = e => '<button type="button" class="m-tile' + (e.active ? ' on' : '') + '" data-k="' + UI.esc(e.key) + '"><span>' + e.ic + '</span><em>' + UI.esc(e.label) + '</em>' + (e.badge ? '<i>' + UI.esc(e.badge) + '</i>' : '') + '</button>';
    let all = [];
    function build() {
        all = entries();
        const q = sheet.querySelector('.m-sq').value.trim().toLowerCase(), body2 = sheet.querySelector('.m-sbody');
        if (q) { const hit = all.filter(e => (e.label + ' ' + e.group).toLowerCase().includes(q)); body2.innerHTML = hit.length ? '<div class="m-grid">' + hit.map(tile).join('') + '</div>' : '<p class="vx-empty">' + UI.esc(T('Nichts gefunden.')) + '</p>'; return; }
        const used = new Set();
        let h = '';
        const quick = QUICK.map(t => all.find(e => e.tab === t && !e.sub) || all.find(e => e.tab === t)).filter(Boolean).slice(0, 4);
        quick.forEach(e => used.add(e.key));
        if (quick.length) h += '<section class="m-sec quick"><h4>⭐ ' + UI.esc(T('Schnellzugriff')) + '</h4><div class="m-grid">' + quick.map(tile).join('') + '</div></section>';
        for (const [ic, name, tabs] of SECTIONS) {
            const list = all.filter(e => tabs.includes(e.tab) && !used.has(e.key));
            list.forEach(e => used.add(e.key));
            if (list.length) h += '<section class="m-sec"><h4>' + ic + ' ' + UI.esc(T(name)) + '</h4><div class="m-grid">' + list.map(tile).join('') + '</div></section>';
        }
        const rest = all.filter(e => !used.has(e.key));
        if (rest.length) h += '<section class="m-sec"><h4>➕ ' + UI.esc(T('Mehr')) + '</h4><div class="m-grid">' + rest.map(tile).join('') + '</div></section>';
        body2.innerHTML = h;
    }
    const sfoot = sheet.querySelector('.m-sfoot');
    const parkS = () => { const c = document.querySelector('.i18n-corner'); if (c && c.parentNode !== sfoot) sfoot.appendChild(c); };
    const open = on => {
        body.classList.toggle('m-menu', on);
        if (on) { sheet.querySelector('.m-sq').value = ''; build(); parkS(); sheet.querySelector('.m-sbody').scrollTop = 0; }
    };
    sheet.addEventListener('click', e => {
        if (e.target.closest('.m-close')) return open(false);
        const t = e.target.closest('.m-tile'); if (!t) return;
        const en = all.find(x => x.key === t.dataset.k); if (!en) return;
        open(false);
        en.b.click();
    });
    sheet.querySelector('.m-sq').addEventListener('input', build);
    parkS();
    bar.addEventListener('click', e => {
        const b = e.target.closest('[data-mb]'); if (!b) return;
        const t = b.dataset.mb;
        if (t === '_menu') return open(!body.classList.contains('m-menu'));
        open(false);
        UI.tab(t);
    });
    shade.addEventListener('click', () => open(false));
    head.querySelector('.m-close').addEventListener('click', () => open(false));
    // Auswahl im Menü schließt es (Gruppen-Köpfe klappen nur auf)
    menu.addEventListener('click', e => {
        const top = e.target.closest('.vx-mtop');
        if (top) { e.preventDefault(); e.stopPropagation(); top.parentNode.classList.toggle('m-open'); return; }
        if (e.target.closest('.vx-tabbtn')) setTimeout(() => open(false), 0);
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
    window.addEventListener('popstate', () => open(false));

    // aktiven Bereich unten markieren
    const GROUP = { feed: 'community', clubs: 'community', groups: 'community', netgraph: 'community', moderation: 'community', locations: 'friends', players: 'friends' };
    const mark = () => {
        const a = menu.querySelector('.vx-tabbtn.active');
        let t = a ? a.dataset.tab : 'home';
        t = GROUP[t] || t;
        bar.querySelectorAll('[data-mb]').forEach(b => b.classList.toggle('on', b.dataset.mb === t || (b.dataset.mb === '_menu' && !ITEMS.some(i => i[0] === t))));
    };
    new MutationObserver(mark).observe(menu, { subtree: true, attributes: true, attributeFilter: ['class'] });
    mark();

    // ---------- 6.5: Offline-Modus – gespeicherte Daten zeigen, beim Wiederverbinden sofort abgleichen ----------
    const off = document.createElement('div');
    off.className = 'm-offline'; off.hidden = navigator.onLine !== false;
    off.textContent = '📴 ' + T('Offline – du siehst die zuletzt gespeicherten Daten. Abgleich, sobald wieder Netz da ist.');
    document.body.appendChild(off);
    window.addEventListener('offline', () => { off.hidden = false; });
    window.addEventListener('online', () => { off.hidden = true; if (UI.load) UI.load(true, true); UI.toast('📶 ' + T('Wieder online – gleiche ab …')); });

    // ---------- Freundesliste: Filter einklappen ----------
    const tools = document.querySelector('[data-pane="friends"] .vx-tools');
    if (tools) {
        tools.classList.add('m-fold');
        const fb = document.createElement('button');
        fb.type = 'button'; fb.className = 'btn btn-sm m-filter'; fb.textContent = '⚙ ' + T('Filter');
        const s = tools.querySelector('#friendSearch');
        if (s) { s.placeholder = T('Freunde suchen …'); s.after(fb); }
        fb.addEventListener('click', () => tools.classList.toggle('m-open'));
    }
})();
