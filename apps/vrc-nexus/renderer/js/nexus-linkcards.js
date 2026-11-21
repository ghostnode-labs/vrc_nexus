/* VRC Nexus – 🔗 Info-Karten (3.9): Links und IDs zu VRChat-Konten, Gruppen, Welten, Instanzen, Avatare und Events in Feed und Chat
 * werden unter dem Text als Karte mit Infos gezeigt (höchstens 3 je Beitrag). Daten kommen über die eigene VRChat-Sitzung
 * (Backend „card_info“, 1 h Zwischenspeicher); Klick öffnet die passende Ansicht in der App. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, T = s => (window.t ? window.t(s) : s);
    const U36 = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const RX = [   // Reihenfolge wichtig: spezifische Muster (Event, Instanz) vor den allgemeinen IDs
        ['event', new RegExp('(grp_' + U36 + ')/calendar/(cal_' + U36 + ')', 'gi'), m => m[1].toLowerCase() + '/' + m[2].toLowerCase()],
        ['instance', new RegExp('worldId=(wrld_' + U36 + ')&(?:amp;)?instanceId=([^\\s&"<]+)', 'gi'), m => m[1].toLowerCase() + ':' + decodeURIComponent(m[2])],
        ['gshort', /vrc\.group\/([a-z0-9]{3,6}\.\d{4})/gi, m => m[1].toUpperCase()],
        ['user', new RegExp('(usr_' + U36 + ')', 'gi'), m => m[1].toLowerCase()],
        ['group', new RegExp('(grp_' + U36 + ')', 'gi'), m => m[1].toLowerCase()],
        ['world', new RegExp('(wrld_' + U36 + ')', 'gi'), m => m[1].toLowerCase()],
        ['avatar', new RegExp('(avtr_' + U36 + ')', 'gi'), m => m[1].toLowerCase()],
    ];
    const cache = new Map(), pending = new Map();

    /** alle Verweise im Text (ohne Doppelte; IDs, die schon Teil eines Events/einer Instanz sind, zählen nicht extra) */
    function scan(text) {
        text = String(text || '');
        const out = [], seen = new Set(), used = [];
        for (const [kind, rx, idOf] of RX) {
            rx.lastIndex = 0;
            let m;
            while ((m = rx.exec(text))) {
                const s0 = m.index, e0 = s0 + m[0].length;
                if (used.some(([a, b]) => s0 < b && e0 > a)) continue;
                used.push([s0, e0]);
                const id = idOf(m), key = kind + ':' + id;
                if (seen.has(key)) continue;
                seen.add(key); out.push({ kind, id, at: s0 });
            }
        }
        return out.sort((a, b) => a.at - b.at).slice(0, 3);
    }
    const fmtDate = s => { try { return new Date(s).toLocaleString(window.nxLoc ? nxLoc() : 'de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    const num = n => Number(n || 0).toLocaleString(window.nxLoc ? nxLoc() : 'de-DE');
    const ICON = { user: '👤', group: '🛡', gshort: '🛡', world: '🌐', instance: '📍', avatar: '🎭', event: '📅' };
    const LABEL = { user: 'Konto', group: 'Gruppe', gshort: 'Gruppe', world: 'Welt', instance: 'Instanz', avatar: 'Avatar', event: 'Event' };

    /** Karte als HTML (aus dem Zwischenspeicher oder als Platzhalter, der später gefüllt wird) */
    function card(ref) {
        const key = ref.kind + ':' + ref.id, c = cache.get(key);
        const attrs = ' data-lc="' + esc(key) + '"';
        if (!c) return '<div class="lc lc-load"' + attrs + '><span class="lc-ic">' + ICON[ref.kind] + '</span><span class="small muted">' + esc(T(LABEL[ref.kind])) + ' · ' + esc(T('lädt …')) + '</span></div>';
        if (c.error) return '<div class="lc lc-err"' + attrs + '><span class="lc-ic">' + ICON[ref.kind] + '</span><span class="small muted">' + esc(T(LABEL[ref.kind])) + ': ' + esc(T(c.error)) + '</span></div>';
        let open = '', meta = '';
        if (c.kind === 'user') { open = ' data-user="' + esc(c.id) + '"'; meta = (c.trust ? '<span class="vx-pill" style="--pc:' + esc(c.trust[1] || '#888') + '">' + esc(c.trust[0] || '') + '</span>' : '') + (c.friend ? '<span class="vx-pill" style="--pc:#51e57e">' + esc(T('Freund')) + '</span>' : '') + (c.pronouns ? '<small>' + esc(c.pronouns) + '</small>' : ''); }
        if (c.kind === 'group') { open = ' data-opengroup="' + esc(c.id) + '"'; meta = '<small>👥 ' + num(c.members) + (c.online ? ' · 🟢 ' + num(c.online) : '') + (c.sub ? ' · ' + esc(c.sub) : '') + '</small>'; }
        if (c.kind === 'world') { open = ' data-world="' + esc(c.world) + '"'; meta = '<small>' + (c.sub ? esc(T('von')) + ' ' + esc(c.sub) + ' · ' : '') + '👥 ' + num(c.occupants) + ' · ⭐ ' + num(c.favorites) + '</small>'; }
        if (c.kind === 'instance') { open = ' data-inst="' + esc(c.id) + '"'; meta = '<small>' + (c.access ? esc(c.access) + ' · ' : '') + (c.region ? esc(c.region.toUpperCase()) + ' · ' : '') + (c.sub ? esc(T('von')) + ' ' + esc(c.sub) : '') + '</small>'; }
        if (c.kind === 'avatar') { open = ' data-lcavatar="' + esc(c.id) + '"'; meta = '<small>' + (c.sub ? esc(T('von')) + ' ' + esc(c.sub) : '') + (c.status ? ' · ' + esc(c.status) : '') + '</small>'; }
        if (c.kind === 'event') { open = ' data-opengroup="' + esc(c.group) + '"'; meta = '<small>🕒 ' + esc(fmtDate(c.starts)) + (c.ends ? ' – ' + esc(fmtDate(c.ends).split(', ').pop()) : '') + (c.interested ? ' · ⭐ ' + num(c.interested) : '') + '</small>'; }
        const pic = c.image && (UI.pic ? UI.pic(c.image) : c.image);
        return '<a href="#" class="lc lc-' + esc(c.kind) + '"' + attrs + open + '>'
            + (pic ? '<img class="lc-img' + (c.kind === 'user' || c.kind === 'group' ? ' round' : '') + '" src="' + esc(pic) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="lc-ic">' + ICON[c.kind] + '</span>')
            + '<span class="lc-txt"><span class="lc-kind">' + ICON[c.kind] + ' ' + esc(T(LABEL[c.kind])) + '</span><b data-no-i18n>' + esc(c.name || '–') + '</b>'
            + (c.kind === 'user' && c.sub ? '<small>' + esc(c.sub) + '</small>' : '') + meta
            + (c.desc ? '<span class="lc-desc">' + esc(c.desc) + '</span>' : '') + '</span></a>';
    }
    /** Karten-Block für einen Text (leer, wenn nichts erkannt wurde) */
    function html(text) {
        const refs = scan(text);
        return refs.length ? '<div class="lc-wrap">' + refs.map(card).join('') + '</div>' : '';
    }
    /** Platzhalter im Bereich root nachladen und ersetzen */
    function hydrate(root) {
        (root || document).querySelectorAll('.lc-load[data-lc]').forEach(el => {
            const key = el.dataset.lc, i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1);
            let p = pending.get(key);
            if (!p) {
                p = UI.api('card_info', { kind, id }).catch(e => ({ kind, id, error: e.message })).then(c => { cache.set(key, c); pending.delete(key); return c; });
                pending.set(key, p);
            }
            p.then(() => { document.querySelectorAll('.lc-load[data-lc="' + CSS.escape(key) + '"]').forEach(x => { x.outerHTML = card({ kind, id }); }); });
        });
    }
    // Avatar-Karten öffnen (Welt/Konto/Gruppe/Instanz laufen über die vorhandenen data-Attribute)
    document.addEventListener('click', e => {
        const a = e.target.closest('[data-lcavatar]'); if (a) { e.preventDefault(); if (UI.openAvatar) UI.openAvatar(a.dataset.lcavatar); return; }
        const l = e.target.closest('a.lc'); if (l) e.preventDefault();
    });
    // neu gezeichnete Bereiche automatisch füllen
    new MutationObserver(ms => { if (ms.some(m => m.addedNodes.length)) { clearTimeout(window.__lcT); window.__lcT = setTimeout(() => hydrate(document), 60); } }).observe(document.body, { childList: true, subtree: true });

    window.NexusCards = { scan, html, hydrate };
})();
