/* VRC Nexus – 🏠 Startseite mit Widgets (Windows + Android). Widgets ein-/ausblenden, verschieben, Größe; Anordnung je Gerät gespeichert. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const box = document.getElementById('homeBox');
    if (!box) return;
    const MOBILE = document.body.classList.contains('mobile');
    const $ = (s, r) => (r || document).querySelector(s);
    const esc = UI.esc;
    const api = (act, data) => UI.api(act, data);
    const toast = (m, bad) => UI.toast(m, bad);
    const STATUS = { 'join me': ['🔵', 'Join Me'], active: ['🟢', 'Online'], 'ask me': ['🟠', 'Ask Me'], busy: ['🔴', 'Beschäftigt'] };

    /* [schlüssel, titel, nur PC, Standardgröße, erlaubte Größen (s m l x=extrem), Beschreibung] */
    const W = [
        ['clock', '🕒 Uhr & Countdown', false, 's', 'sm', 'Uhrzeit, Datum und eigener Countdown'],
        ['me', '👤 Mein Status', false, 's', 'sm', 'Status mit einem Klick wechseln'],
        ['friends', '🟢 Freunde im Spiel', false, 'm', 'smlx', 'Wer gerade wo ist'],
        ['instance', '🌐 Meine Instanz', true, 's', 'smlx', 'Aktuelle Welt und Spieler'],
        ['notifs', '🔔 Benachrichtigungen', false, 's', 'sml', 'Offene Einladungen & Anfragen'],
        ['feed', '📰 Letzte Ereignisse', false, 's', 'smlx', 'Online, Weltwechsel, Status …'],
        ['chat', '💬 Chatbox', true, 'm', 'sml', 'Text in die VRChat-Chatbox senden'],
        ['macros', '⚡ Makros', true, 's', 'sml', 'Makros starten'],
        ['params', '🎚 Lieblings-Parameter', true, 's', 'sml', 'Mit ★ markierte Avatar-Parameter'],
        ['camera', '📷 Kamera', true, 's', 'sm', 'Foto, Timer, Kamera-Vorlagen'],
        ['music', '🎵 Spielt gerade', true, 's', 'sm', 'Erkannte Musik'],
        ['rotator', '🔁 Chatbox-Rotator', true, 's', 'sm', 'Rotator an/aus und aktueller Text'],
        ['today', '📊 Heute', true, 's', 'sm', 'Spielzeit, Welten, Begegnungen'],
        ['speech', '🎙 Sprache → Chatbox', true, 's', 'sm', 'Spracheingabe starten'],
        ['overlay', '🥽 SteamVR-Overlay', true, 's', 'sm', 'Overlay ein-/ausblenden'],
        ['notes', '📝 Notizzettel', false, 's', 'sml', 'Notizen auf diesem Gerät'],
        ['update', '⬆ Version', false, 's', 's', 'Installierte Version & Updates'],
        // neu
        ['launch', '🚀 Schnellstart', true, 's', 'sm', 'VRChat starten, neu beitreten, Selbst-Einladung'],
        ['week', '📈 Letzte 7 Tage', true, 'm', 'smlx', 'Spielzeit je Tag und Uhrzeit'],
        ['events', '📅 Gruppen-Events', false, 's', 'sml', 'Die nächsten Termine deiner Gruppen'],
        ['anniv', '🎂 Jahrestage', false, 's', 'sm', 'Geburtstage & Freundschafts-Jubiläen (30 Tage)'],
        ['coll', '🗂 Sammlung', false, 's', 'smlx', 'Zuletzt gesammelte Welten & Avatare'],
        ['stream', '📺 Stream-Bot', true, 'm', 'smlx', 'Twitch/YouTube: Status, Chat, Punkte, Umfrage'],
        ['osclog', '📜 OSC-Live', true, 's', 'sml', 'Die letzten Parameter-Änderungen'],
        ['rules', '🤖 Automatik', true, 's', 'sm', 'Regeln an/aus schalten'],
        ['heart', '💓 Puls', true, 's', 'sml', 'Live-Puls mit Kurve der letzten 10 Minuten'],
        // 4.0
        ['links', '🔗 Verknüpfungen', false, 'm', 'smlx', 'Schnellzugriff auf Bereiche der App und eigene Links'],
        ['groups', '🛡 Meine Gruppen', false, 'm', 'smlx', 'Deine VRChat-Gruppen, vertretene zuerst'],
        ['market', '🛒 Marktplatz', false, 's', 'sml', 'Guthaben, gemerkte Artikel und Shops'],
        ['pulse', '📡 Pulse-News', false, 'm', 'smlx', 'Neueste VRChat-News und Patchnotes'],
    ].filter(w => !(MOBILE && w[2]));
    const SIZES = { s: ['S', 'Klein'], m: ['M', 'Mittel'], l: ['L', 'Groß'], x: ['XL', 'Extrem – ganze Breite'] };
    // 4.0: Startseite in thematischen Tabs – jeder Tab hat seine eigene Anordnung
    const TABS = [['overview', '🏠', 'Übersicht'], ['media', '🎬', 'Medien'], ['links', '🔗', 'Verknüpfungen'], ['group', '🛡', 'Gruppe'], ['system', '🧰', 'Systemwerkzeuge'], ['market', '🛒', 'Marktplatz'], ['misc', '✨', 'Sonstiges']];
    const TAB_DEF = {
        overview: ['me', 'friends', 'launch', 'instance', 'notifs', 'today', 'feed', 'clock'],
        media: ['camera', 'music', 'pulse', 'coll', 'stream'],
        links: ['links'],
        group: ['groups', 'events'],
        system: ['chat', 'macros', 'params', 'rotator', 'speech', 'overlay', 'heart', 'osclog', 'rules'],
        market: ['market'],
        misc: ['week', 'anniv', 'notes', 'update'],
    };
    const tabOf = k => (Object.entries(TAB_DEF).find(([, l]) => l.includes(k)) || ['misc'])[0];
    let tab = 'overview';
    const DEF = TAB_DEF.overview;
    const meta = k => W.find(x => x[0] === k);
    const fit = (k, z) => { const w = meta(k); return w[4].includes(z) ? z : w[4].includes('m') && z !== 's' ? (w[4].includes('l') ? 'l' : 'm') : w[4][0]; };
    const key = 'home' + (MOBILE ? 'M' : '');
    const defLayout = t => (TAB_DEF[t || tab] || DEF).filter(meta).map(k => ({ k, s: meta(k)[3] }));
    const clean = l => (Array.isArray(l) ? l : []).filter(x => x && meta(x.k)).map(x => ({ k: x.k, s: fit(x.k, x.s || (x.w === 2 ? 'm' : 's')), min: !!x.min }));
    let all = UI.store.get(key + '4', null);
    if (!all || typeof all !== 'object' || Array.isArray(all)) {   // erste 4.0-Startseite: bisherige Widgets auf ihre Tabs verteilen
        const old = clean(UI.store.get(key, null));
        all = {};
        for (const [t] of TABS) { const mine = old.filter(x => tabOf(x.k) === t); all[t] = mine.length ? mine : defLayout(t); }
    }
    for (const [t] of TABS) all[t] = Array.isArray(all[t]) ? clean(all[t]) : defLayout(t);
    const remember = () => UI.store.get('homeTabRemember', true) !== false;
    if (remember()) { const lt = UI.store.get('homeTab', 'overview'); if (all[lt]) tab = lt; }
    let layout = all[tab];
    let data = null, editing = false, timer = null, clockTimer = null, dragging = null;
    const save = () => { all[tab] = layout; UI.store.set(key + '4', all); };
    function setTab(t) { if (!all[t] || t === tab) return; tab = t; layout = all[t]; UI.store.set('homeTab', t); render(); }

    function shell() {
        box.innerHTML = '<div class="hm-bar"><b class="hm-hi" id="hmHi"></b><span class="hm-sp"></span>'
            + '<button type="button" class="btn btn-sm" id="hmRef" title="Aktualisieren">⟳</button><button type="button" class="btn btn-sm" id="hmEdit">✏️ Anpassen</button></div>'
            + '<nav class="hm-tabs" id="hmTabs" role="tablist"></nav><div class="hm-add" id="hmAdd" hidden></div><div class="hm-grid" id="hmGrid"></div>';
        $('#hmTabs').addEventListener('click', e => { const b = e.target.closest('[data-htab]'); if (b) setTab(b.dataset.htab); });
        $('#hmTabs').addEventListener('keydown', e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const i = TABS.findIndex(x => x[0] === tab), n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
            setTab(n); const b = $('#hmTabs [data-htab="' + n + '"]'); if (b) b.focus();
        });
        $('#hmEdit').addEventListener('click', () => { editing = !editing; render(); });
        $('#hmRef').addEventListener('click', load);
        $('#hmAdd').addEventListener('click', e => {
            if (e.target.closest('#hmReset')) { if (confirm('Standard-Anordnung wiederherstellen?')) { layout = defLayout(); save(); render(); } return; }
            const rm = e.target.closest('#hmRemember');
            if (rm) { UI.store.set('homeTabRemember', rm.checked); return; }
            const b = e.target.closest('[data-add]'); if (!b) return;
            layout.push({ k: b.dataset.add, s: meta(b.dataset.add)[3] }); save(); render();
            const n = $('#hmGrid [data-w="' + b.dataset.add + '"]'); if (n) n.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        const g = $('#hmGrid');
        g.addEventListener('click', onClick);
        g.addEventListener('submit', onSubmit);
        g.addEventListener('change', e => {
            const r = e.target.closest('[data-hparam]');
            if (r) api('client_osc', { kind: 'param', name: r.dataset.hparam, type: r.dataset.t, value: r.value }).catch(err => toast('⚠ ' + err.message, true));
            const lt = e.target.closest('[data-lktab]');
            if (lt) {
                const cfg = UI.store.get('homeLinks', { tabs: LINK_DEF, own: [] });
                cfg.tabs = (cfg.tabs || []).filter(x => x !== lt.dataset.lktab).concat(lt.checked ? [lt.dataset.lktab] : []);
                UI.store.set('homeLinks', cfg); render(); const d = $('.hm-lkedit'); if (d) d.open = true;
            }
        });
        g.addEventListener('input', e => { const n = e.target.closest('#hmNotes'); if (n) UI.store.set('homeNotes', n.value); });
        // Ziehen & Ablegen (nur im Bearbeiten-Modus)
        g.addEventListener('dragstart', e => {
            const w = e.target.closest('.hm-w'); if (!editing || !w) return;
            dragging = w; w.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', w.dataset.w); } catch (x) { /* egal */ }
        });
        g.addEventListener('dragend', () => { if (dragging) dragging.classList.remove('dragging'); dragging = null; clearDrop(); });
        g.addEventListener('dragover', e => {
            if (!dragging) return;
            e.preventDefault();
            const t = e.target.closest('.hm-w'); clearDrop();
            if (!t || t === dragging) return;
            const r = t.getBoundingClientRect();
            t.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
        });
        g.addEventListener('drop', e => {
            if (!dragging) return;
            e.preventDefault();
            const t = g.querySelector('.drop-before, .drop-after');
            const from = layout.findIndex(l => l.k === dragging.dataset.w);
            if (t && from >= 0) {
                const item = layout.splice(from, 1)[0];
                let to = layout.findIndex(l => l.k === t.dataset.w);
                if (t.classList.contains('drop-after')) to++;
                layout.splice(to, 0, item); save();
            }
            dragging = null; render();
        });
        window.addEventListener('resize', relayout);
        if ('ResizeObserver' in window) ro = new ResizeObserver(relayout);
    }
    const clearDrop = () => box.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));

    // ---------- Mauerwerk: Höhe → Zeilen-Span (wie die Dashboard-Startseite) ----------
    let ro = null, queued = false;
    function masonry() {
        const g = $('#hmGrid');
        if (!g || !g.offsetParent) return;
        const cs = getComputedStyle(g), row = parseFloat(cs.gridAutoRows) || 4, gap = parseFloat(cs.columnGap) || 14;
        const ws = [...g.querySelectorAll('.hm-w')];
        g.classList.add('ready');
        ws.forEach(el => { el.classList.remove('fill'); el.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((el.offsetHeight + gap) / row)); });
        // Lücken schließen: jedes Widget bis zum nächsten darunter strecken
        const rects = ws.map(el => ({ el, r: el.getBoundingClientRect() }));
        const bottom = Math.max(0, ...rects.map(x => x.r.bottom));
        rects.forEach(({ el, r }) => {
            if (el.classList.contains('min')) return;
            const below = rects.filter(o => o.el !== el && o.r.top >= r.bottom - 2 && o.r.left < r.right - 5 && o.r.right > r.left + 5).map(o => o.r.top - gap);
            const extra = (below.length ? Math.min(...below) : bottom) - r.bottom;
            if (extra > 2) { el.style.gridRowEnd = 'span ' + Math.max(1, Math.round((r.height + extra + gap) / row)); el.classList.add('fill'); }
        });
        const cols = cs.gridTemplateColumns.split(' ').filter(Boolean);
        g.style.setProperty('--colw', (parseFloat(cols[0]) || 0) + 'px');
        g.dataset.cols = cols.length + (cols.length === 1 ? ' Spalte' : ' Spalten') + ' · Widgets ziehen zum Sortieren · S/M/L/XL = Größe';
    }
    function relayout() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; masonry(); }); }

    function onClick(e) {
        const ed = e.target.closest('[data-hed]');
        if (ed) {
            const i = layout.findIndex(l => l.k === ed.closest('.hm-w').dataset.w), op = ed.dataset.hed;
            if (i < 0) return;
            if (op === 'del') layout.splice(i, 1);
            if (op === 'up' && i > 0) [layout[i - 1], layout[i]] = [layout[i], layout[i - 1]];
            if (op === 'down' && i < layout.length - 1) [layout[i + 1], layout[i]] = [layout[i], layout[i + 1]];
            if (op === 'size') layout[i].s = ed.dataset.z;
            if (op === 'min') layout[i].min = !layout[i].min;
            save(); render(); return;
        }
        const gp = e.target.closest('.hm-grp[data-group]');
        if (gp) { e.preventDefault(); if (UI.openGroup) UI.openGroup(gp.dataset.group); return; }
        const ld = e.target.closest('[data-lkdel]');
        if (ld) { const cfg = UI.store.get('homeLinks', { tabs: LINK_DEF, own: [] }); (cfg.own || []).splice(Number(ld.dataset.lkdel), 1); UI.store.set('homeLinks', cfg); render(); const d = $('.hm-lkedit'); if (d) d.open = true; return; }
        const b = e.target.closest('[data-h]');
        if (!b) return;
        const a = b.dataset.h, v = b.dataset.v;
        const done = p => p.then(d => { if (d && d.msg) toast(d.msg); setTimeout(load, 400); }).catch(err => toast('⚠ ' + err.message, true));
        if (a === 'status') return done(api('status', { status: v, desc: data.me ? data.me.desc : '' }));
        if (a === 'macro') return done(api('client_macro_run', { id: v }));
        if (a === 'cam') return done(api('cam_cmd', { cmd: v }));
        if (a === 'campreset') return done(api('cam_preset_load', { name: v }));
        if (a === 'rotator') return done(api('client_cfg_save', { rotator_enabled: data.rotator && data.rotator.on ? '0' : '1' }));
        if (a === 'toggle') return done(api('client_osc', { kind: 'param', name: v, type: 'bool', value: b.dataset.on === '1' ? '' : '1' }));
        if (a === 'speech') return done(api('speech_ptt', { op: 'toggle' }));
        if (a === 'overlay') return done(api('overlay_act', { action: 'overlay' }));
        if (a === 'act') return done(api('overlay_act', { action: v }).then(d => Object.assign({ msg: b.dataset.ok || '✔ erledigt' }, d)));
        if (a === 'rule') return done(api('auto_toggle', { id: v }));
        if (a === 'media') { b.disabled = true; return api('media_ctl', { cmd: v, id: b.dataset.id || '' }).then(() => setTimeout(load, 700)).catch(err => toast('⚠ ' + err.message, true)).finally(() => { b.disabled = false; }); }
        if (a === 'tab') return UI.tab(v, b.dataset.sub || '');
    }
    function onSubmit(e) {
        const f = e.target.closest('form');
        if (!f) return;
        e.preventDefault();
        if (f.id === 'hmChat') api('client_osc', { kind: 'chatbox', text: f.text.value, sound: '1', split: '1' }).then(() => { f.text.value = ''; toast('💬 gesendet'); }).catch(err => toast('⚠ ' + err.message, true));
        if (f.id === 'hmCd') { UI.store.set('homeCd', { t: f.t.value, l: f.l.value }); render(); }
        if (f.id === 'hmLkAdd') {
            const url = f.url.value.trim();
            if (!/^https:\/\//i.test(url)) return toast(T('Nur https-Links.'), true);
            const cfg = UI.store.get('homeLinks', { tabs: LINK_DEF, own: [] });
            cfg.own = (cfg.own || []).concat([{ icon: f.icon.value.trim().slice(0, 4), name: f.name.value.trim().slice(0, 40), url }]).slice(0, 24);
            UI.store.set('homeLinks', cfg); render();
            const d = $('.hm-lkedit'); if (d) d.open = true;
        }
    }

    // ---------- Widgets ----------
    const empty = t => '<div class="muted small">' + t + '</div>';
    const fmtDur = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + ' h ' + m + ' min' : m + ' min'; };
    function countdown() {
        const cd = UI.store.get('homeCd', { t: '', l: '' });
        if (!cd.t) return '';
        let r = Math.floor((new Date(cd.t).getTime() - Date.now()) / 1000);
        if (isNaN(r)) return '';
        const past = r < 0; r = Math.abs(r);
        return '<div class="hm-cd"><small>' + esc(cd.l || 'Countdown') + '</small><b>' + (past ? 'seit ' : '') + (Math.floor(r / 86400) ? Math.floor(r / 86400) + ' T ' : '') + String(Math.floor(r % 86400 / 3600)).padStart(2, '0') + ':' + String(Math.floor(r % 3600 / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0') + '</b></div>';
    }
    const N = (z, a, b, c, d) => ({ s: a, m: b, l: c, x: d })[z] || a;
    const R = {
        clock: () => { const d = new Date(), cd = UI.store.get('homeCd', { t: '', l: '' }); return '<div class="hm-clock" id="hmClock"><b>' + d.toLocaleTimeString(nxLoc()) + '</b><small>' + d.toLocaleDateString(nxLoc(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '</small></div><div id="hmCdBox">' + countdown() + '</div>'
            + '<details class="small"><summary>Countdown einstellen</summary><form id="hmCd" class="nx-row"><input type="text" name="l" placeholder="Name" value="' + esc(cd.l) + '" style="width:110px"><input type="datetime-local" name="t" value="' + esc(cd.t) + '"><button class="btn btn-sm">OK</button></form></details>'; },
        me: () => !data.me ? empty('Nicht angemeldet.') : '<div class="hm-me"><b>' + esc(data.me.name) + '</b><span>' + (STATUS[data.me.status] || ['⚪', data.me.status]).join(' ') + (data.me.desc ? ' · ' + esc(data.me.desc) : '') + '</span></div>'
            + '<div class="hm-btns">' + Object.entries(STATUS).map(([k, v]) => '<button type="button" class="chip' + (data.me.status === k ? ' on' : '') + '" data-h="status" data-v="' + k + '">' + v[0] + ' ' + v[1] + '</button>').join('') + '</div>',
        friends: z => '<div class="hm-kpis"><span><b>' + data.friends.in_game + '</b> im Spiel</span><span><b>' + data.friends.online + '</b> online</span><span><b>' + data.friends.total + '</b> gesamt</span></div>'
            + (data.friends.list.length ? '<div class="hm-flist' + (z === 'x' ? ' big' : '') + '">' + data.friends.list.slice(0, N(z, 8, 16, 30, 40)).map(f => '<div class="hm-f' + (z === 'l' || z === 'x' ? ' pic' : '') + '" data-user="' + esc(f.id) + '">' + (z === 'l' || z === 'x' ? UI.img(f.image, 'hm-fav', f.name) : '') + '<i class="hm-dot s-' + esc((f.status || '').replace(' ', '-')) + '"></i>' + (f.fav ? '⭐' : '') + '<b>' + esc(f.name) + '</b><span class="muted small">' + esc(f.world || '') + '</span></div>').join('') + '</div>' : empty('Gerade ist niemand im Spiel.'))
            + '<button type="button" class="nc-link" data-h="tab" data-v="locations">Alle Freunde-Orte →</button>',
        instance: z => { const g = data.game; if (!g || !g.running || !g.world) return empty(g && g.running ? 'VRChat läuft – noch in keiner Welt.' : 'VRChat läuft nicht.'); return '<div class="hm-me"><b>🌐 ' + esc(g.world) + '</b><span>seit ' + fmtDur(Date.now() / 1000 - g.since) + ' · ' + g.players.length + ' Spieler</span></div><div class="hm-pl">' + g.players.slice(0, N(z, 20, 40, 60, 80)).map(p => '<span' + (p.id ? ' data-user="' + esc(p.id) + '"' : '') + '>' + esc(p.name) + '</span>').join('') + '</div><button type="button" class="nc-link" data-h="tab" data-v="players">Spielerliste →</button>'; },
        notifs: () => !data.notifs ? empty('–') : '<div class="hm-kpis"><span><b>' + data.notifs.unseen + '</b> ungelesen</span></div>' + (data.notifs.items.length ? data.notifs.items.map(n => '<div class="hm-row"><b>' + esc(n.title) + '</b> <span class="muted small">' + esc(n.message) + '</span></div>').join('') : empty('Keine offenen Benachrichtigungen.')) + '<button type="button" class="nc-link" data-h="tab" data-v="notifs">Öffnen →</button>',
        feed: z => data.feed.length ? data.feed.slice(0, N(z, 6, 8, 10, 10)).map(f => '<div class="hm-row"><span class="muted small">' + UI.ago(f.ts) + '</span> <b data-user="' + esc(f.vrc_id) + '">' + esc(f.name) + '</b> <span class="small">' + esc(FEED[f.type] || f.type) + (f.new_loc && f.new_loc.world_name ? ' → ' + esc(f.new_loc.world_name) : f.type === 'status' || f.type === 'bio' ? ' ' + esc(String(f.new).slice(0, 40)) : '') + '</span></div>').join('') + '<button type="button" class="nc-link" data-h="tab" data-v="feed">Verlauf →</button>' : empty('Noch keine Ereignisse.'),
        chat: () => '<form id="hmChat" class="nx-row"><input type="text" name="text" maxlength="500" placeholder="Text für die Chatbox (/n = neue Zeile)" style="flex:1" required><button class="btn btn-sm btn-gold">Senden</button></form>',
        macros: () => data.macros.length ? '<div class="hm-btns">' + data.macros.map(m => '<button type="button" class="btn btn-sm" data-h="macro" data-v="' + esc(m.id) + '">⚡ ' + esc(m.name) + '</button>').join('') + '</div>' : empty('Noch keine Makros.') + '<button type="button" class="nc-link" data-h="tab" data-v="client" data-sub="macros">Makros anlegen →</button>',
        params: () => data.params.length ? data.params.map(p => '<div class="hm-row hm-prm"><span>' + esc(p.name) + '</span>' + (p.type === 'bool' ? '<button type="button" class="chip' + (p.value === true ? ' on' : '') + '" data-h="toggle" data-v="' + esc(p.name) + '" data-on="' + (p.value === true ? 1 : 0) + '">' + (p.value === true ? 'an' : 'aus') + '</button>'
            : '<input type="range" min="' + (p.type === 'int' ? 0 : -1) + '" max="' + (p.type === 'int' ? 255 : 1) + '" step="' + (p.type === 'int' ? 1 : 0.01) + '" value="' + (p.value ?? 0) + '" data-hparam="' + esc(p.name) + '" data-t="' + p.type + '">') + '</div>').join('')
            : empty('Markiere Parameter mit ★ unter Spiel & OSC → Parameter.') + '<button type="button" class="nc-link" data-h="tab" data-v="client" data-sub="params">Parameter →</button>',
        camera: () => '<div class="hm-btns"><button type="button" class="btn btn-sm btn-gold" data-h="cam" data-v="Capture">📸 Foto</button><button type="button" class="btn btn-sm" data-h="cam" data-v="CaptureDelayed">⏱ Timer</button><button type="button" class="btn btn-sm" data-h="tab" data-v="client" data-sub="cam">Mehr →</button></div>'
            + (data.cam.presets.length ? '<div class="hm-btns">' + data.cam.presets.map(p => '<button type="button" class="chip" data-h="campreset" data-v="' + esc(p) + '">' + esc(p) + '</button>').join('') + '</div>' : ''),
        music: () => {
            const m = data.media, mm = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
            if (m) return '<div class="hm-media' + (m.status === 'playing' ? ' on' : '') + '"><div class="hm-mt" data-no-i18n><b title="' + esc(m.title) + '">' + esc(m.title) + '</b><span>' + esc(m.artist || m.album || '') + '</span></div>'
                + '<div class="hm-mapp"><span class="hm-mst">' + (m.status === 'playing' ? '▶ läuft' : '⏸ pausiert') + '</span> · ' + esc(m.app) + (m.dur ? ' · <span class="mono">' + mm(m.pos) + ' / ' + mm(m.dur) + '</span>' : '') + '</div>'
                + (m.dur ? '<div class="hm-mbar"><i style="width:' + Math.min(100, Math.round(m.pos / m.dur * 100)) + '%"></i></div>' : '')
                + '<div class="hm-btns hm-mctl"><button type="button" class="btn btn-sm" data-h="media" data-v="prev" data-id="' + esc(m.id) + '" title="Zurück">⏮</button><button type="button" class="btn btn-sm btn-gold" data-h="media" data-v="toggle" data-id="' + esc(m.id) + '" title="Wiedergabe/Pause">' + (m.status === 'playing' ? '⏸' : '▶') + '</button><button type="button" class="btn btn-sm" data-h="media" data-v="next" data-id="' + esc(m.id) + '" title="Weiter">⏭</button></div></div>'
                + '<span class="muted small">Platzhalter <code>{musik}</code> <code>{musik_titel}</code> <code>{musik_kuenstler}</code> <code>{musik_app}</code> <code>{musik_zeit}</code></span>';
            return '<div class="hm-big">' + (data.music ? '🎵 ' + esc(data.music) : '<span class="muted">' + (data.media_wait ? 'Windows-Mediensteuerung startet …' : 'Gerade läuft nichts' + (data.media_on ? '' : ' (Spotify, Browser, foobar2000, VLC …)')) + '</span>') + '</div>'
                + (data.media_err ? '<div class="vx-error small">⚠ ' + esc(data.media_err) + '</div>' : '')
                + (data.media_on ? '<div class="hm-btns hm-mctl"><button type="button" class="btn btn-sm" data-h="media" data-v="prev" title="Zurück">⏮</button><button type="button" class="btn btn-sm btn-gold" data-h="media" data-v="toggle" title="Wiedergabe/Pause">⏯</button><button type="button" class="btn btn-sm" data-h="media" data-v="next" title="Weiter">⏭</button></div>' : '')
                + '<span class="muted small">Erkennt alles aus der Windows-Mediensteuerung. Platzhalter <code>{musik}</code> für Rotator & Automatik.</span>';
        },
        rotator: () => !data.rotator ? empty('–') : '<div class="hm-row"><button type="button" class="btn btn-sm' + (data.rotator.on ? ' btn-gold' : '') + '" data-h="rotator">' + (data.rotator.on ? '● läuft' : '○ aus') + '</button></div><div class="hm-pre">' + esc(data.rotator.text) + '</div>',
        today: () => !data.stats ? empty('–') : '<div class="hm-kpis"><span><b>' + fmtDur(data.stats.playtime) + '</b> Spielzeit</span><span><b>' + data.stats.worlds + '</b> Welten</span><span><b>' + data.stats.players + '</b> Begegnungen</span><span><b>' + data.stats.screenshots + '</b> Fotos</span></div>',
        speech: () => !data.speech ? empty('Spracheingabe nicht verfügbar.') : '<div class="hm-row"><button type="button" class="btn btn-sm' + (data.speech.recording ? ' btn-gold' : '') + '" data-h="speech">' + (data.speech.recording ? '⏹ Stopp' : '🎙 Sprechen') + '</button> <span class="muted small">' + esc(data.speech.engine_label || '') + '</span></div>' + (data.speech.last ? '<div class="hm-pre">„' + esc(data.speech.last) + '“</div>' : ''),
        overlay: () => !data.overlay ? empty('Nur in der Windows-App mit SteamVR.') : '<div class="hm-row"><button type="button" class="btn btn-sm' + (data.overlay.visible ? ' btn-gold' : '') + '" data-h="overlay">' + (data.overlay.visible ? '👁 sichtbar' : '🙈 versteckt') + '</button> <span class="muted small">' + esc(data.overlay.status || '') + '</span></div>',
        notes: () => '<textarea id="hmNotes" rows="5" placeholder="Notizen (bleiben auf diesem Gerät)">' + esc(UI.store.get('homeNotes', '')) + '</textarea>',
        update: () => !data.update ? empty('–') : '<div class="hm-me"><b>VRC Nexus ' + esc(data.update.current) + '</b><span>' + (data.update.available ? '⬆ ' + esc(data.update.version) + ' verfügbar' : '✔ aktuell') + '</span></div>' + (data.update.available ? '<button type="button" class="nc-link" data-h="tab" data-v="settings">Aktualisieren →</button>' : ''),
        // ---- neue Widgets ----
        launch: () => '<div class="hm-btns hm-tiles">'
            + '<button type="button" class="btn btn-sm btn-gold" data-h="act" data-v="launch" data-ok="🚀 VRChat wird gestartet">🚀 VRChat starten</button>'
            + '<button type="button" class="btn btn-sm" data-h="act" data-v="rejoin" data-ok="↻ Neu beitreten …"' + (data.game && data.game.world_id ? '' : ' disabled') + '>↻ Instanz neu beitreten</button>'
            + '<button type="button" class="btn btn-sm" data-h="act" data-v="invite_self" data-ok="📨 Einladung geschickt"' + (data.game && data.game.world_id ? '' : ' disabled') + '>📨 Selbst-Einladung</button>'
            + '<button type="button" class="btn btn-sm" data-h="tab" data-v="tools">⚙ Startoptionen</button></div>',
        week: z => {
            const w = data.week;
            if (!w || !w.playtime) return empty('In den letzten 7 Tagen noch nicht gespielt.') + '<button type="button" class="nc-link" data-h="tab" data-v="recap">Rückblick →</button>';
            const days = [1, 2, 3, 4, 5, 6, 0], dn = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
            const bars = (vals, labels, cls) => { const mx = Math.max(1, ...vals); return '<div class="hm-bars ' + cls + '">' + vals.map((v, i) => '<span title="' + labels[i] + ': ' + fmtDur(v) + '"><i style="height:' + Math.round(v / mx * 100) + '%"></i><small>' + labels[i] + '</small></span>').join('') + '</div>'; };
            return '<div class="hm-kpis"><span><b>' + fmtDur(w.playtime) + '</b> Spielzeit</span><span><b>' + w.sessions + '</b> Sitzungen</span>' + (z !== 's' ? '<span><b>' + w.worlds + '</b> Welten</span><span><b>' + w.people + '</b> Leute</span><span><b>' + w.shots + '</b> Fotos</span>' : '') + '</div>'
                + bars(days.map(d => w.by_day[d] || 0), days.map(d => dn[d]), 'd')
                + (z === 'l' || z === 'x' ? '<div class="muted small">Nach Uhrzeit (Start der Sitzung)</div>' + bars(w.by_hour, w.by_hour.map((_, h) => String(h)), 'h') : '')
                + (z !== 's' && (w.top_world || w.top_person) ? '<div class="small">' + (w.top_world ? '🏆 Lieblingswelt: <b>' + esc(w.top_world) + '</b> ' : '') + (w.top_person ? '· 🤝 meist getroffen: <b>' + esc(w.top_person) + '</b>' : '') + '</div>' : '')
                + '<button type="button" class="nc-link" data-h="tab" data-v="recap">Ganzer Rückblick →</button>';
        },
        events: z => {
            const l = (data.events || []).slice(0, N(z, 3, 5, 8, 8));
            if (!l.length) return empty('Keine anstehenden Gruppen-Events.') + '<button type="button" class="nc-link" data-h="tab" data-v="calendar">Kalender →</button>';
            const nowS = Date.now() / 1000;
            return l.map(e => '<div class="hm-ev' + (e.start <= nowS && e.end > nowS ? ' live' : '') + '"><span class="hm-evd"><b>' + new Date(e.start * 1000).toLocaleDateString(nxLoc(), { day: '2-digit', month: '2-digit' }) + '</b><small>' + new Date(e.start * 1000).toLocaleTimeString(nxLoc(), { hour: '2-digit', minute: '2-digit' }) + '</small></span>'
                + '<span class="hm-evt"><b>' + (e.following ? '⭐ ' : '') + esc(e.title) + '</b><small class="muted">' + (e.start <= nowS && e.end > nowS ? '🔴 läuft gerade · ' : '') + esc(e.group || '') + '</small></span></div>').join('')
                + '<button type="button" class="nc-link" data-h="tab" data-v="calendar">Kalender →</button>';
        },
        anniv: z => {
            const l = (data.anniv || []).slice(0, N(z, 5, 10, 10, 10));
            if (!l.length) return empty('In den nächsten 30 Tagen nichts. Tipp: „Geburtstag 24.12.“ in die Freundes-Notiz schreiben.');
            return l.map(a => '<div class="hm-row"><b data-user="' + esc(a.id) + '">' + esc(a.name) + '</b> <span class="small">' + (a.kind === 'birthday' ? '🎂 Geburtstag' : '🤝 ' + a.years + ' ' + (a.years === 1 ? 'Jahr' : 'Jahre') + ' befreundet') + '</span> <span class="muted small">' + (a.in_days === 0 ? '<b class="hm-today">heute!</b>' : a.in_days === 1 ? 'morgen' : 'in ' + a.in_days + ' Tagen') + ' · ' + esc(a.date) + '</span></div>').join('');
        },
        coll: z => {
            const c = data.coll;
            if (!c || !c.items.length) return empty('Noch nichts gesammelt.') + '<button type="button" class="nc-link" data-h="tab" data-v="coll">Sammlung →</button>';
            return '<div class="hm-thumbs">' + c.items.slice(0, N(z, 4, 6, 9, 12)).map(x => '<span class="hm-th" title="' + esc(x.name + (x.tags.length ? ' · #' + x.tags.join(' #') : '')) + '">' + (UI.pic(x.thumb) ? '<img src="' + esc(UI.pic(x.thumb)) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<i>' + (x.kind === 'world' ? '🌐' : '🧍') + '</i>') + '<small>' + esc(x.name) + '</small></span>').join('') + '</div>'
                + '<button type="button" class="nc-link" data-h="tab" data-v="coll">Alle ' + c.total + ' →</button>';
        },
        stream: z => {
            const s = data.stream;
            if (!s) return empty('–');
            if (!s.on.twitch && !s.on.youtube) return empty('Stream-Bot ist aus.') + '<button type="button" class="nc-link" data-h="tab" data-v="stream">Einrichten →</button>';
            const st = (n, o, x) => o ? '<span class="chip' + (/verbunden|live/i.test(x.state) ? ' on' : '') + '">' + n + ' ' + esc(x.state || '–') + '</span>' : '';
            let h = '<div class="hm-btns">' + st('🟣 Twitch', s.on.twitch, s.twitch) + st('🔴 YouTube', s.on.youtube, s.youtube) + '<span class="muted small">' + s.users + ' Zuschauer bekannt</span></div>';
            if (s.poll) h += '<div class="hm-poll"><b>📊 ' + esc(s.poll.q) + '</b>' + s.poll.options.map(o => '<div class="hm-pbar"><i style="width:' + (s.poll.total ? Math.round(o.votes / s.poll.total * 100) : 0) + '%"></i><span>' + esc(o.text) + ' · ' + o.votes + '</span></div>').join('') + '</div>';
            const chat = s.chat.slice(-N(z, 3, 5, 6, 6));
            const top = s.top.slice(0, N(z, 0, 3, 5, 5));
            h += '<div class="hm-split">' + (chat.length ? '<div>' + chat.map(c => '<div class="hm-row"><b>' + esc(c.user) + ':</b> <span class="small">' + esc(c.text) + '</span></div>').join('') + '</div>' : '<div>' + empty('Noch kein Chat.') + '</div>')
                + (top.length ? '<div class="hm-top">' + top.map((t, i) => '<div class="hm-row"><span class="muted">' + (i + 1) + '.</span> ' + esc(t.name) + ' <b>' + t.p + '</b></div>').join('') + '</div>' : '') + '</div>';
            return h + '<button type="button" class="nc-link" data-h="tab" data-v="stream">Stream-Bot →</button>';
        },
        osclog: z => {
            const l = (data.osclog || []).slice(0, N(z, 6, 8, 12, 12));
            if (!l.length) return empty(data.osc && data.osc.active ? 'Noch keine Änderungen.' : 'OSC ist nicht aktiv.') + '<button type="button" class="nc-link" data-h="tab" data-v="client" data-sub="osclog">OSC-Log →</button>';
            return '<div class="hm-log">' + l.map(e => '<div><span class="muted">' + new Date(e.t).toLocaleTimeString(nxLoc()) + '</span> ' + (e.d === 'out' ? '↗' : '↘') + ' <code>' + esc(e.a.replace(/^\/avatar\/parameters\//, '')) + '</code> = <b>' + esc(JSON.stringify(e.v).slice(0, 40)) + '</b></div>').join('') + '</div>'
                + '<button type="button" class="nc-link" data-h="tab" data-v="client" data-sub="osclog">OSC-Log →</button>';
        },
        heart: z => {
            const h = data.heart;
            if (!h || !h.on) return empty('Noch keine Puls-Quelle eingerichtet.') + '<button type="button" class="nc-link" data-h="tab" data-v="client" data-sub="heart">💓 Puls einrichten →</button>';
            return '<div class="hr-live' + (h.active ? ' on' : '') + '"><span class="hr-heart">💓</span><b>' + (h.active ? h.bpm : '–') + '</b><small>bpm</small></div>'
                + (h.stats && h.stats.max ? '<div class="hm-kpis"><span><b>' + h.stats.min + '</b> min</span><span><b>' + h.stats.avg + '</b> ⌀</span><span><b>' + h.stats.max + '</b> max</span></div>' : '')
                + (window.NexusHeart ? window.NexusHeart.spark(h.hist, z === 'l' ? 520 : 260, z === 's' ? 40 : 60) : '')
                + (h.error && !h.active ? '<div class="vx-error small">⚠ ' + esc(h.error) + '</div>' : '')
                + '<button type="button" class="nc-link" data-h="tab" data-v="client" data-sub="heart">Puls →</button>';
        },
        rules: () => (data.rules || []).length ? '<div class="hm-btns">' + data.rules.map(r => '<button type="button" class="chip' + (r.on ? ' on' : '') + '" data-h="rule" data-v="' + esc(r.id) + '" title="' + (r.on ? 'aktiv – klicken zum Ausschalten' : 'aus – klicken zum Einschalten') + '">' + (r.on ? '●' : '○') + ' ' + esc(r.name) + '</button>').join('') + '</div>'
            : empty('Noch keine Regeln.') + '<button type="button" class="nc-link" data-h="tab" data-v="client" data-sub="auto">Automatik →</button>',
    };
    // ---- 4.0: Widgets mit eigenem Nachladen (nur wenn sie im aktuellen Tab stehen) ----
    const LZ = {}, LZ_TTL = { groups: 300000, market: 300000, pulse: 900000 };
    const LZ_API = { groups: () => api('groups'), market: () => Promise.all([api('shop_saved'), api('shop').catch(() => null)]).then(([s, o]) => ({ saved: s, ov: o })), pulse: () => api('pulse_state').then(st => (st.on ? api('pulse_feed', { src: 'vrchat' }).then(r => ({ on: true, items: r.items })) : { on: false, items: [] })) };
    function lazyKick() {
        for (const l of layout) {
            const k = l.k, fn = LZ_API[k];
            if (!fn) continue;
            const c = LZ[k];
            if (c && (c.loading || Date.now() - c.t < LZ_TTL[k])) continue;
            LZ[k] = Object.assign(c || {}, { loading: true });
            fn().then(v => { LZ[k] = { t: Date.now(), v }; }).catch(e => { LZ[k] = { t: Date.now(), err: e.message }; }).finally(() => { if (layout.some(x => x.k === k)) render(); });
        }
    }
    const lzBody = (k, fn) => { const c = LZ[k]; if (!c || (!c.v && !c.err)) return '<div class="vx-loading">' + esc(T('Lade …')) + '</div>'; if (c.err) return empty('⚠ ' + esc(c.err)); return fn(c.v); };
    const T = s => (window.t ? window.t(s) : s);
    const LINK_DEF = ['friends', 'search', 'community|chat', 'pulse', 'calendar', 'gallery', 'shop', 'tools'];
    function appTabs() {
        const seen = new Set(), out = [];
        document.querySelectorAll('#tabs .vx-tabbtn[data-tab]').forEach(b => {
            if (b.hidden || b.closest('[hidden]')) return;
            if (MOBILE && b.classList.contains('nc-pc-only')) return;
            const id = b.dataset.tab + (b.dataset.msub ? '|' + b.dataset.msub : '');
            if (seen.has(id)) return; seen.add(id);
            out.push({ id, icon: (b.querySelector('span') || {}).textContent || '•', label: (b.querySelector('em') || b).textContent.trim() });
        });
        return out;
    }
    Object.assign(R, {
        links: z => {
            const cfg = UI.store.get('homeLinks', { tabs: LINK_DEF, own: [] }), tabs = appTabs();
            const pick = (cfg.tabs || []).map(id => tabs.find(t => t.id === id)).filter(Boolean);
            const own = (cfg.own || []).filter(o => /^https:\/\//i.test(o.url));
            return '<div class="hm-links' + (z === 's' ? ' sm' : '') + '">' + pick.map(t => { const [tb, sub] = t.id.split('|'); return '<button type="button" class="hm-lk" data-h="tab" data-v="' + esc(tb) + '" data-sub="' + esc(sub || '') + '"><span>' + esc(t.icon) + '</span><em>' + esc(t.label) + '</em></button>'; }).join('')
                + own.map(o => '<a class="hm-lk own" href="' + esc(o.url) + '" target="_blank" rel="noopener"><span>' + esc(o.icon || '🔗') + '</span><em>' + esc(o.name || o.url) + '</em></a>').join('') + '</div>'
                + '<details class="hm-lkedit small"><summary>' + esc(T('Verknüpfungen bearbeiten')) + '</summary><div class="hm-lkpick">' + tabs.map(t => '<label><input type="checkbox" data-lktab="' + esc(t.id) + '"' + ((cfg.tabs || []).includes(t.id) ? ' checked' : '') + '> ' + esc(t.icon + ' ' + t.label) + '</label>').join('') + '</div>'
                + '<form id="hmLkAdd" class="nx-row"><input type="text" name="icon" placeholder="🔗" maxlength="4" style="width:46px"><input type="text" name="name" placeholder="' + esc(T('Name')) + '" maxlength="40" style="width:120px"><input type="url" name="url" placeholder="https://…" required style="flex:1"><button class="btn btn-sm">＋</button></form>'
                + (own.length ? '<div class="hm-btns">' + own.map((o, i) => '<button type="button" class="chip" data-lkdel="' + i + '" title="' + esc(T('entfernen')) + '">✕ ' + esc(o.name || o.url) + '</button>').join('') + '</div>' : '') + '</details>';
        },
        groups: z => lzBody('groups', v => {
            const l = (v.groups || []).slice().sort((a, b) => (b.rep - a.rep) || (b.owner - a.owner) || (b.staff - a.staff) || b.members - a.members);
            if (!l.length) return empty(T('Du bist in keiner Gruppe.'));
            return '<div class="hm-groups' + (z === 'x' ? ' big' : '') + '">' + l.slice(0, N(z, 4, 8, 14, 24)).map(g => '<a href="#" class="hm-grp" data-group="' + esc(g.id) + '">' + (UI.pic(g.icon) ? '<img src="' + esc(UI.pic(g.icon)) + '" alt="" loading="lazy">' : '<i>🛡</i>')
                + '<span><b>' + (g.rep ? '⭐ ' : '') + esc(g.name) + '</b><small>' + (g.short && g.short !== '.' ? esc(g.short) + ' · ' : '') + UI.num(g.members) + ' ' + esc(T('Mitglieder')) + (g.owner ? ' · 👑' : g.staff ? ' · 🛡' : '') + '</small></span></a>').join('') + '</div>'
                + '<div class="hm-btns"><button type="button" class="nc-link" data-h="tab" data-v="groups">' + esc(T('Alle Gruppen')) + ' (' + l.length + ') →</button>' + (l.some(g => g.mod) ? '<button type="button" class="nc-link" data-h="tab" data-v="mod">🛡 ' + esc(T('Mod-Zentrale')) + ' →</button>' : '') + '</div>';
        }),
        market: z => lzBody('market', v => {
            const ov = v.ov || {}, it = (v.saved && v.saved.items) || [], sh = (v.saved && v.saved.shops) || [];
            return '<div class="hm-kpis">' + (ov.balance != null ? '<span><b>' + UI.num(ov.balance) + '</b> ' + esc(T('Credits')) + '</span>' : '') + '<span><b>' + it.length + '</b> ' + esc(T('gemerkt')) + '</span><span><b>' + sh.length + '</b> ' + esc(T('Shops')) + '</span>' + (ov.subs && ov.subs.length ? '<span>💎 VRC+</span>' : '') + '</div>'
                + (it.length ? '<div class="hm-thumbs">' + it.slice(0, N(z, 4, 6, 9, 9)).map(x => '<span class="hm-th" title="' + esc(x.name || '') + '">' + (UI.pic(x.image || x.thumb) ? '<img src="' + esc(UI.pic(x.image || x.thumb)) + '" alt="" loading="lazy">' : '🛍') + '</span>').join('') + '</div>' : empty(T('Noch nichts gemerkt.')))
                + '<button type="button" class="nc-link" data-h="tab" data-v="shop">' + esc(T('Shop & Käufe')) + ' →</button>';
        }),
        pulse: z => lzBody('pulse', v => {
            if (!v.on) return empty(T('Nexus Pulse ist aus.')) + '<button type="button" class="nc-link" data-h="tab" data-v="pulse">📡 ' + esc(T('Einschalten')) + ' →</button>';
            const K = { news: '📢', patch: '🛠', dev: '🧪', security: '🔐', creator: '💰' };
            return (v.items || []).slice(0, N(z, 3, 5, 8, 10)).map(x => '<div class="hm-row"><span title="' + esc(x.kind) + '">' + (K[x.kind] || '📰') + '</span> <a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a> <span class="muted small">' + UI.ago(x.ts) + '</span></div>').join('') || empty(T('Keine Beiträge.'));
        }) + '<button type="button" class="nc-link" data-h="tab" data-v="pulse">Nexus Pulse →</button>',
    });
    const FEED = { online: 'ist online', offline: 'ist offline', location: 'ist jetzt', status: 'Status:', avatar: 'neuer Avatar', bio: 'Bio geändert', friend_add: 'neuer Freund', friend_remove: 'entfreundet', gps: 'ist jetzt' };

    function render() {
        if (!data) return;
        const h = new Date().getHours();
        $('#hmHi').textContent = (h < 5 ? '🌙 Gute Nacht' : h < 11 ? '☀️ Guten Morgen' : h < 18 ? '👋 Hallo' : '🌆 Guten Abend') + (data.me ? ', ' + data.me.name : '') + '!';
        $('#hmEdit').textContent = editing ? '✔ Fertig' : '✏️ Anpassen';
        const add = $('#hmAdd');
        add.hidden = !editing;
        $('#hmTabs').innerHTML = TABS.map(([k, ic, l]) => '<button type="button" role="tab" class="hm-tab' + (k === tab ? ' on' : '') + '" aria-selected="' + (k === tab) + '" tabindex="' + (k === tab ? 0 : -1) + '" data-htab="' + k + '"><span>' + ic + '</span><em>' + esc(T(l)) + '</em><small>' + all[k].length + '</small></button>').join('');
        const free = W.filter(w => !layout.some(l => l.k === w[0]));
        add.innerHTML = '<div class="hm-addh"><b>＋ Widget hinzufügen</b><span class="muted small">' + (free.length ? free.length + ' verfügbar' : 'alle sind schon auf der Startseite') + '</span><span class="hm-sp"></span><label class="small"><input type="checkbox" id="hmRemember"' + (remember() ? ' checked' : '') + '> ' + esc(T('Zuletzt geöffneten Tab merken')) + '</label><button type="button" class="nc-link" id="hmReset">↺ Standard</button></div>'
            + '<div class="hm-picks">' + free.map(w => '<button type="button" class="hm-pick" data-add="' + w[0] + '"><b>' + esc(w[1]) + '</b><small>' + esc(w[5]) + '</small><em>' + [...w[4]].map(z => SIZES[z][0]).join(' · ') + '</em></button>').join('') + '</div>';
        const g = $('#hmGrid');
        g.classList.toggle('editing', editing);
        g.classList.remove('ready');
        if (ro) ro.disconnect();
        g.innerHTML = layout.map(l => {
            const w = meta(l.k);
            let body;
            try { body = R[l.k](l.s); } catch (e) { body = empty('⚠ ' + esc(e.message)); }
            return '<section class="hm-w hm-' + l.s + (l.min ? ' min' : '') + '" data-w="' + l.k + '"' + (editing ? ' draggable="true"' : '') + '><header>' + (editing ? '<span class="hm-drag" title="Ziehen zum Verschieben">⠿</span>' : '') + '<b>' + esc(w[1]) + '</b>'
                + (editing ? '<span class="hm-ed"><span class="hm-sz">' + [...w[4]].map(z => '<button type="button" data-hed="size" data-z="' + z + '" class="' + (l.s === z ? 'on' : '') + '" title="' + SIZES[z][1] + '">' + SIZES[z][0] + '</button>').join('') + '</span>'
                    + '<button type="button" data-hed="up" title="nach vorne">◀</button><button type="button" data-hed="down" title="nach hinten">▶</button><button type="button" data-hed="del" title="entfernen">✕</button></span>'
                    : '<button type="button" class="hm-min" data-hed="min" title="' + (l.min ? 'aufklappen' : 'einklappen') + '">▾</button>')
                + '</header><div class="hm-body">' + body + '</div></section>';
        }).join('') || '<div class="hm-empty">' + esc(T('Keine Widgets in diesem Tab – oben auf „✏️ Anpassen“ drücken und welche hinzufügen.')) + '</div>';
        lazyKick();
        if (ro) g.querySelectorAll('.hm-body > *').forEach(c => ro.observe(c));
        g.querySelectorAll('img').forEach(i => { i.addEventListener('load', relayout, { once: true }); i.addEventListener('error', () => { const x = document.createElement('i'); x.textContent = '🖼'; i.replaceWith(x); relayout(); }, { once: true }); });
        relayout();
    }
    function load() {
        return api('home_data').then(d => {
            data = d;
            const a = document.activeElement;
            if (dragging || (a && a.closest && a.closest('#homeBox') && a.matches('input, textarea'))) return;   // nicht beim Tippen neu zeichnen
            render();
        }).catch(e => { box.querySelector('#hmGrid').innerHTML = '<div class="vx-error">⚠ ' + esc(e.message) + '</div>'; });
    }
    window.NexusHome = {
        open() {
            if (!box.firstChild) shell();
            load();
            clearInterval(timer); timer = setInterval(() => { if (!document.hidden) load(); }, 10000);
            clearInterval(clockTimer); clockTimer = setInterval(() => { const c = $('#hmClock b'); if (c) c.textContent = new Date().toLocaleTimeString(nxLoc()); const cd = $('#hmCdBox'); if (cd) cd.innerHTML = countdown(); }, 1000);
        },
        close() { clearInterval(timer); clearInterval(clockTimer); },
    };
    // Startseite war schon beim Laden gewählt (nexus.js läuft vorher)
    const pane = document.querySelector('[data-pane=home]');
    if (pane && !pane.hidden) window.NexusHome.open();
})();
