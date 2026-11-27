/* VRC Nexus Web 7.0 – 🏠 Clubs & 📅 Events (gleiches Nexus-Konto wie App und Community).
 * Clubs mit Rollen, Feed, Regeln, Bewerbung/Einlass-Fragen, Galerie; Events mit Anmeldung, Warteliste, iCal und Archiv; Kalender mit Filter.
 * Alle Nutzertexte werden maskiert; Rechte prüft der Server bei jeder Anfrage. */
(function () {
    // gleiche Datei in der Webseite (NexusWebKit) und in der VRC-Nexus-App (NexusUI; dort reicht backend/community.js an nexusclubs.php durch)
    const APP = !window.NexusWebKit;
    const K = window.NexusWebKit || (window.NexusUI && { api: window.NexusUI.api, toast: (m, k) => window.NexusUI.toast(m, k === 'error'), esc: window.NexusUI.esc });
    const box = document.getElementById('nwClubs');
    if (!K || !box) return;
    const { api, toast, esc } = K;
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
    let site = '';   // App: Adresse der Webseite für iCal- und Kalender-Links
    const call = (a, data) => api((APP ? 'club_' : 'nw_club_') + a, { data: JSON.stringify(data || {}) }).then(d => { if (d && d._site) site = d._site.replace(/\/+$/, '') + '/'; return d; });
    const dt = ts => new Date(ts * 1000).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const dIn = ts => { const d = new Date(ts * 1000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
    const ROLE = { owner: '👑 Leitung', mod: '🛡 Moderation', member: 'Mitglied', site_mod: '🛡 Seiten-Moderation', pending: '⏳ Bewerbung offen', banned: '🚫 ausgeschlossen' };
    const fail = e => toast(e.message || String(e), 'error');
    let meta = { topics: {}, langs: {}, join: {} }, view = 'browse', cur = '';

    function shell(inner) {
        box.innerHTML = '<div class="nw-row" style="margin-bottom:12px">'
            + [['browse', '🏠 Clubs entdecken'], ['mine', '⭐ Meine Clubs'], ['cal', '📅 Event-Kalender'], ['new', '➕ Club gründen']]
                .map(([k, t]) => '<button type="button" class="btn btn-sm' + (view === k ? ' btn-gold' : '') + '" data-v="' + k + '">' + t + '</button>').join('')
            + '</div><div data-body>' + inner + '</div>';
        $$('[data-v]', box).forEach(b => b.onclick = () => go(b.dataset.v));
        return $('[data-body]', box);
    }
    const opts = (o, sel, any) => (any ? '<option value="">' + any + '</option>' : '') + Object.entries(o).map(([k, v]) => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
    function card(c) {
        return '<div class="nw-card cl-card" data-club="' + esc(c.slug) + '" style="cursor:pointer' + (c.color ? ';border-left:4px solid ' + c.color : '') + '">'
            + (c.banner ? '<div class="cl-ban" style="background-image:url(\'' + encodeURI(c.banner) + '\')"></div>' : '')
            + '<b>' + esc(c.name) + '</b> <span class="nw-muted">/' + esc(c.slug) + '</span>'
            + '<div class="nw-muted">' + esc(meta.topics[c.topic] || c.topic) + ' · ' + esc(meta.langs[c.lang] || c.lang) + ' · 👥 ' + c.members + ' · 📅 ' + c.upcoming + ' · ' + esc(meta.join[c.join_mode] || '') + '</div>'
            + '<div class="nw-text" style="margin-top:6px">' + esc(c.descr.slice(0, 180)) + '</div>'
            + (c.my_role ? '<div class="nw-muted" style="margin-top:4px">' + (ROLE[c.my_role] || '') + '</div>' : '') + '</div>';
    }
    function evCard(e, withClub) {
        const full = e.capacity && e.going >= e.capacity;
        const st = { going: '✅ angemeldet', wait: '⏳ Warteliste', maybe: '🤔 vielleicht' }[e.mine] || '';
        return '<div class="nw-card cl-ev" data-ev="' + e.id + '"><div class="nw-row"><b>' + esc(e.title) + '</b>' + (e.status === 'cancelled' ? ' <span class="nw-muted">❌ abgesagt</span>' : '')
            + (e.members_only ? ' <span class="nw-muted">🔒 nur Mitglieder</span>' : '') + '<span class="sp"></span><span class="nw-muted">' + dt(e.starts) + ' – ' + new Date(e.ends * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + '</span></div>'
            + (withClub && e.club ? '<div class="nw-muted">🏠 <a href="#" data-goclub="' + esc(e.club.slug) + '">' + esc(e.club.name) + '</a> · ' + esc(meta.topics[e.club.topic] || '') + ' · ' + esc(meta.langs[e.club.lang] || '') + '</div>' : '')
            + (e.place ? '<div class="nw-muted">📍 ' + esc(e.place) + '</div>' : '') + (e.descr ? '<div class="nw-text">' + esc(e.descr) + '</div>' : '')
            + '<div class="nw-row" style="margin-top:6px"><span class="nw-muted">👥 ' + e.going + (e.capacity ? ' / ' + e.capacity : '') + (e.wait ? ' · ⏳ ' + e.wait : '') + (e.maybe ? ' · 🤔 ' + e.maybe : '') + '</span><span class="sp"></span>'
            + (st ? '<span class="nw-muted">' + st + '</span>' : '')
            + (e.status === 'active' && e.ends > Date.now() / 1000 ? (e.mine === 'going' || e.mine === 'wait' ? '' : '<button type="button" class="btn btn-sm" data-rsvp="going">' + (full ? '⏳ Auf Warteliste' : '✅ Dabei') + '</button>') + (e.mine === 'maybe' ? '' : '<button type="button" class="btn btn-sm" data-rsvp="maybe" title="Vielleicht">🤔</button>')
                + (e.mine ? '<button type="button" class="btn btn-sm" data-rsvp="no">Abmelden</button>' : '') : '') + '</div></div>';
    }
    function bindEv(root) {
        $$('[data-ev]', root).forEach(el => $$('[data-rsvp]', el).forEach(b => b.onclick = () => call('rsvp', { id: +el.dataset.ev, status: b.dataset.rsvp })
            .then(d => { toast(d.msg); el.outerHTML = evCard(d.event, false); bindEv(root); }).catch(fail)));
        $$('[data-goclub]', root).forEach(a => a.onclick = ev => { ev.preventDefault(); openClub(a.dataset.goclub); });
    }

    function browse(mine) {
        const body = shell('<div class="nw-row" style="margin-bottom:10px"><input type="search" placeholder="Clubs suchen …" data-q style="flex:1;min-width:160px"><select data-topic></select><select data-lang></select></div><div class="nw-grid" data-list><span class="nw-muted">Lädt …</span></div>');
        const load = () => call('list', { mine: mine ? '1' : '', q: $('[data-q]', body).value, topic: $('[data-topic]', body).value, lang: $('[data-lang]', body).value }).then(d => {
            meta = { topics: d.topics, langs: d.langs, join: d.join };
            const t = $('[data-topic]', body), l = $('[data-lang]', body);
            if (!t.options.length) { t.innerHTML = opts(d.topics, '', 'Alle Themen'); l.innerHTML = opts(d.langs, '', 'Alle Sprachen'); }
            const list = $('[data-list]', body);
            list.innerHTML = d.items.length ? d.items.map(card).join('') : '<span class="nw-muted">' + (mine ? 'Du bist noch in keinem Club.' : 'Keine Clubs gefunden – gründe den ersten!') + '</span>';
            $$('[data-club]', list).forEach(c => c.onclick = () => openClub(c.dataset.club));
        }).catch(e => { $('[data-list]', body).innerHTML = '<div class="vx-error">' + esc(e.message) + '</div>'; });
        let tm; $('[data-q]', body).oninput = () => { clearTimeout(tm); tm = setTimeout(load, 300); };
        $('[data-topic]', body).onchange = load; $('[data-lang]', body).onchange = load;
        load();
    }
    function calendar() {
        const body = shell('<div class="nw-row" style="margin-bottom:10px"><select data-topic></select><select data-lang></select><select data-tod><option value="">Jede Uhrzeit</option><option value="morning">🌅 vormittags</option><option value="afternoon">☀ nachmittags</option><option value="evening">🌙 abends</option></select>'
            + '<select data-days><option value="7">7 Tage</option><option value="30" selected>30 Tage</option><option value="90">90 Tage</option></select><span class="sp"></span><a class="btn btn-sm" data-pubcal href="events.php" target="_blank" rel="noopener">🌐 Öffentlicher Kalender</a></div><div data-list><span class="nw-muted">Lädt …</span></div>');
        const load = () => call('calendar', { topic: $('[data-topic]', body).value, lang: $('[data-lang]', body).value, tod: $('[data-tod]', body).value, days: $('[data-days]', body).value }).then(d => {
            meta.topics = d.topics; meta.langs = d.langs; $('[data-pubcal]', body).href = site + 'events.php';
            const t = $('[data-topic]', body); if (!t.options.length) { t.innerHTML = opts(d.topics, '', 'Alle Themen'); $('[data-lang]', body).innerHTML = opts(d.langs, '', 'Alle Sprachen'); }
            const list = $('[data-list]', body); let day = '';
            list.innerHTML = d.items.length ? d.items.map(e => { const k = new Date(e.starts * 1000).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }); const h = k !== day ? '<h3 class="cl-day">' + esc(k) + '</h3>' : ''; day = k; return h + evCard(e, true); }).join('')
                : '<span class="nw-muted">Keine Events in diesem Zeitraum.</span>';
            bindEv(list);
        }).catch(e => { $('[data-list]', body).innerHTML = '<div class="vx-error">' + esc(e.message) + '</div>'; });
        $$('select', body).forEach(s => s.onchange = load);
        load();
    }
    function clubForm(c) {
        c = c || { name: '', slug: '', descr: '', rules: '', lang: 'de', topic: 'allgemein', join_mode: 'open', questions: [], banner: '', color: '', listed: true };
        const go2 = () => {
            const html = '<div class="nw-card"><h3>' + (c.id ? '⚙ Club bearbeiten' : '➕ Neuen Club gründen') + '</h3><div class="cl-form">'
                + '<label>Name<input data-f="name" maxlength="60" value="' + esc(c.name) + '"></label>'
                + (c.id ? '' : '<label>Adresse (a–z, 0–9, -)<input data-f="slug" maxlength="32" placeholder="mein-club" value="' + esc(c.slug) + '"></label>')
                + '<label>Thema<select data-f="topic">' + opts(meta.topics, c.topic) + '</select></label><label>Sprache<select data-f="lang">' + opts(meta.langs, c.lang) + '</select></label>'
                + '<label>Beitritt<select data-f="join_mode">' + opts(meta.join, c.join_mode) + '</select></label>'
                + '<label>Farbe<input type="color" data-f="color" value="' + esc(c.color || '#00e5ff') + '"></label>'
                + '<label class="cl-wide">Beschreibung<textarea data-f="descr" maxlength="2000" rows="3">' + esc(c.descr) + '</textarea></label>'
                + '<label class="cl-wide">Regeln<textarea data-f="rules" maxlength="3000" rows="4" placeholder="1. Respekt …">' + esc(c.rules) + '</textarea></label>'
                + '<label class="cl-wide">Einlass-Fragen bei Bewerbung (eine pro Zeile, höchstens 5)<textarea data-f="questions" rows="3">' + esc((c.questions || []).join('\n')) + '</textarea></label>'
                + '<label class="cl-wide">Banner (https-Bildadresse, optional)<input data-f="banner" value="' + esc(c.banner) + '"></label>'
                + '<label><input type="checkbox" data-f="listed"' + (c.listed ? ' checked' : '') + '> im Verzeichnis und Kalender zeigen</label></div>'
                + '<div class="nw-row" style="margin-top:10px"><span class="sp"></span>' + (c.id ? '<button type="button" class="btn btn-sm" data-back>Zurück</button>' : '') + '<button type="button" class="btn btn-sm btn-gold" data-save>Speichern</button></div></div>';
            const body = c.id ? $('[data-body]', box) : shell('');
            body.innerHTML = html;
            const v = k => { const el = $('[data-f="' + k + '"]', body); return !el ? undefined : el.type === 'checkbox' ? el.checked : el.value; };
            $('[data-save]', body).onclick = () => {
                const d = { club: c.slug, name: v('name'), slug: v('slug'), topic: v('topic'), lang: v('lang'), join_mode: v('join_mode'), color: v('color'), descr: v('descr'), rules: v('rules'), banner: v('banner').trim(), listed: v('listed') ? 1 : 0,
                    questions: v('questions').split('\n').map(s => s.trim()).filter(Boolean) };
                call(c.id ? 'update' : 'create', d).then(r => { toast(r.msg); openClub(r.club.slug); }).catch(fail);
            };
            const bk = $('[data-back]', body); if (bk) bk.onclick = () => openClub(c.slug);
        };
        if (!Object.keys(meta.join).length) call('list', {}).then(d => { meta = { topics: d.topics, langs: d.langs, join: d.join }; go2(); }).catch(fail); else go2();
    }

    function openClub(slug) {
        cur = slug; view = 'club';
        const body = shell('<span class="nw-muted">Lädt …</span>');
        const reload = () => openClub(slug);
        call('view', { club: slug }).then(d => {
            const c = d.club, staff = d.is_staff;
            if (!Object.keys(meta.join).length) call('list', {}).then(x => { meta = { topics: x.topics, langs: x.langs, join: x.join }; }).catch(() => {});
            let tab = 'feed';
            const head = (c.banner ? '<div class="cl-ban cl-ban-big" style="background-image:url(\'' + encodeURI(c.banner) + '\')"></div>' : '')
                + '<div class="nw-card"' + (c.color ? ' style="border-left:4px solid ' + c.color + '"' : '') + '><div class="nw-row"><h3 style="margin:0">' + esc(c.name) + '</h3><span class="nw-muted">/' + esc(c.slug) + '</span><span class="sp"></span>'
                + '<span class="nw-muted">' + (ROLE[c.my_role] || '') + '</span>'
                + (!d.is_member && c.my_role !== 'pending' && c.my_role !== 'banned' && c.join_mode !== 'invite' ? '<button type="button" class="btn btn-sm btn-gold" data-join>' + (c.join_mode === 'apply' ? '📨 Bewerben' : '➕ Beitreten') + '</button>' : '')
                + (d.is_member && c.my_role !== 'owner' && c.my_role !== 'site_mod' ? '<button type="button" class="btn btn-sm" data-leave>Verlassen</button>' : '')
                + (staff ? '<button type="button" class="btn btn-sm" data-edit>⚙</button>' : '')
                + (c.listed ? '<a class="btn btn-sm" target="_blank" rel="noopener" href="' + site + 'nexusclubs.php?ics=' + encodeURIComponent(c.slug) + '" title="Kalender abonnieren (iCal)">📆 iCal</a>' : '') + '</div>'
                + '<div class="nw-muted">' + esc(meta.topics[c.topic] || c.topic) + ' · ' + esc(meta.langs[c.lang] || c.lang) + ' · 👥 ' + c.members + ' · ' + esc(meta.join[c.join_mode] || '') + '</div>'
                + (c.descr ? '<div class="nw-text" style="margin-top:6px">' + esc(c.descr) + '</div>' : '') + '<div data-joinbox></div></div>';
            const tabs = [['feed', '📰 Feed'], ['events', '📅 Events'], ['gallery', '🖼 Galerie'], ['rules', '📜 Regeln']];
            if (d.is_member) tabs.push(['members', '👥 Mitglieder'], ['archive', '🗄 Archiv']);
            if (staff) tabs.push(['apps', '📨 Bewerbungen' + (d.applications && d.applications.length ? ' (' + d.applications.length + ')' : '')]);
            body.innerHTML = head + '<div class="nw-row" style="margin:10px 0" data-tabs>' + tabs.map(([k, t]) => '<button type="button" class="btn btn-sm" data-t="' + k + '">' + t + '</button>').join('') + '</div><div data-pane></div>';
            const pane = $('[data-pane]', body);
            const show = t => {
                tab = t; $$('[data-t]', body).forEach(b => b.classList.toggle('btn-gold', b.dataset.t === t));
                if (t === 'rules') pane.innerHTML = '<div class="nw-card"><div class="nw-text">' + (c.rules ? esc(c.rules) : '<span class="nw-muted">Keine Regeln eingetragen.</span>') + '</div></div>';
                if (t === 'feed') {
                    if (!d.posts) { pane.innerHTML = '<div class="nw-card nw-muted">Der Feed ist nur für Mitglieder sichtbar.</div>'; return; }
                    pane.innerHTML = (d.is_member ? '<div class="nw-card"><textarea maxlength="2000" rows="2" placeholder="Etwas mit dem Club teilen …" data-ptext style="width:100%"></textarea><div class="nw-row"><span class="sp"></span><button type="button" class="btn btn-sm btn-gold" data-psend>Posten</button></div></div>' : '')
                        + (d.posts.length ? d.posts.map(p => '<div class="nw-card" data-post="' + p.id + '">' + (p.pinned ? '📌 ' : '') + '<b>' + esc(p.name || p.author) + '</b> <span class="nw-muted">' + dt(p.created) + '</span><div class="nw-text">' + esc(p.text) + '</div>'
                            + (staff || p.author === (window.NexusWebMe || '') ? '<div class="nw-row"><span class="sp"></span>' + (staff ? '<button type="button" class="btn btn-sm" data-pin>📌</button>' : '') + '<button type="button" class="btn btn-sm" data-pdel>🗑</button></div>' : '') + '</div>').join('')
                            : '<div class="nw-muted">Noch keine Beiträge.</div>');
                    const s = $('[data-psend]', pane); if (s) s.onclick = () => call('post', { club: slug, text: $('[data-ptext]', pane).value }).then(r => { toast(r.msg); reload(); }).catch(fail);
                    $$('[data-post]', pane).forEach(el => { const id = +el.dataset.post;
                        const pin = $('[data-pin]', el); if (pin) pin.onclick = () => call('post_mod', { club: slug, id, do: 'pin' }).then(reload).catch(fail);
                        const del = $('[data-pdel]', el); if (del) del.onclick = () => confirm('Beitrag löschen?') && call('post_mod', { club: slug, id, do: 'delete' }).then(reload).catch(fail); });
                }
                if (t === 'events' || t === 'archive') {
                    const list = t === 'events' ? d.events : d.archive || [];
                    pane.innerHTML = (staff && t === 'events' ? '<details class="nw-card"><summary>➕ Neues Event</summary><div class="cl-form" data-evf>'
                        + '<label class="cl-wide">Titel<input data-e="title" maxlength="80"></label><label>Beginn<input type="datetime-local" data-e="starts" value="' + dIn(Math.ceil(Date.now() / 3600000 + 24) * 3600) + '"></label>'
                        + '<label>Ende<input type="datetime-local" data-e="ends"></label><label class="cl-wide">Ort (Welt / Instanz)<input data-e="place" maxlength="160"></label><label>Plätze (0 = offen)<input type="number" min="0" max="500" data-e="capacity" value="0"></label>'
                        + '<label><input type="checkbox" data-e="members_only"> nur für Mitglieder</label><label class="cl-wide">Beschreibung<textarea data-e="descr" rows="2" maxlength="2000"></textarea></label></div>'
                        + '<div class="nw-row"><span class="sp"></span><button type="button" class="btn btn-sm btn-gold" data-evsave>Event anlegen</button></div></details>' : '')
                        + (list.length ? list.map(e => evCard(e, false) + (staff && t === 'events' ? '<div class="nw-row" style="margin:-6px 0 8px"><span class="sp"></span><button type="button" class="btn btn-sm" data-evcancel="' + e.id + '">❌ Absagen</button></div>' : '')).join('')
                            : '<div class="nw-muted">' + (t === 'events' ? 'Keine kommenden Events.' : 'Noch keine vergangenen Events.') + '</div>');
                    bindEv(pane);
                    const sv = $('[data-evsave]', pane);
                    if (sv) sv.onclick = () => { const g = k => $('[data-e="' + k + '"]', pane); const ts = s => s ? Math.floor(new Date(s).getTime() / 1000) : 0;
                        call('event_save', { club: slug, title: g('title').value, starts: ts(g('starts').value), ends: ts(g('ends').value), place: g('place').value, capacity: +g('capacity').value || 0, members_only: g('members_only').checked ? 1 : 0, descr: g('descr').value })
                            .then(r => { toast(r.msg); reload(); }).catch(fail); };
                    $$('[data-evcancel]', pane).forEach(b => b.onclick = () => confirm('Event absagen?') && call('event_cancel', { id: +b.dataset.evcancel }).then(r => { toast(r.msg); reload(); }).catch(fail));
                }
                if (t === 'gallery') {
                    if (!d.gallery) { pane.innerHTML = '<div class="nw-card nw-muted">Die Galerie ist nur für Mitglieder sichtbar.</div>'; return; }
                    pane.innerHTML = (d.is_member ? '<div class="nw-card nw-row"><input data-gurl placeholder="https://…/bild.png" style="flex:2;min-width:180px"><input data-gcap maxlength="140" placeholder="Bildunterschrift" style="flex:1"><button type="button" class="btn btn-sm btn-gold" data-gadd>🖼 Hinzufügen</button></div>' : '')
                        + '<div class="cl-gal">' + (d.gallery.length ? d.gallery.map(g => '<figure data-g="' + g.id + '"><a href="' + encodeURI(g.url) + '" target="_blank" rel="noopener noreferrer"><img src="' + encodeURI(g.url) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></a><figcaption>' + esc(g.caption) + ' <span class="nw-muted">' + esc(g.name) + '</span>'
                            + (staff ? ' <button type="button" class="btn btn-sm" data-gdel>🗑</button>' : '') + '</figcaption></figure>').join('') : '<span class="nw-muted">Noch keine Bilder.</span>') + '</div>';
                    const add = $('[data-gadd]', pane); if (add) add.onclick = () => call('gallery_add', { club: slug, url: $('[data-gurl]', pane).value.trim(), caption: $('[data-gcap]', pane).value }).then(r => { toast(r.msg); reload(); }).catch(fail);
                    $$('[data-g]', pane).forEach(f => { const b = $('[data-gdel]', f); if (b) b.onclick = () => call('gallery_del', { club: slug, id: +f.dataset.g }).then(reload).catch(fail); });
                }
                if (t === 'members') {
                    pane.innerHTML = '<div class="nw-card">' + (staff ? '<div class="nw-row" style="margin-bottom:8px"><input data-inv placeholder="usr_… einladen" style="flex:1"><button type="button" class="btn btn-sm" data-invgo>➕ Einladen</button></div>' : '')
                        + d.members.map(m => '<div class="nw-row cl-mem" data-m="' + esc(m.vrc_id) + '"><b>' + esc(m.name || m.vrc_id) + '</b><span class="nw-muted">' + (ROLE[m.role] || m.role) + '</span><span class="sp"></span>'
                            + (staff && m.role !== 'owner' ? (c.my_role === 'owner' || c.my_role === 'site_mod' ? (m.role === 'mod' ? '<button type="button" class="btn btn-sm" data-do="demote">⬇</button>' : '<button type="button" class="btn btn-sm" data-do="promote" title="Zur Moderation">🛡</button>')
                                + (c.my_role === 'owner' ? '<button type="button" class="btn btn-sm" data-do="transfer" title="Leitung übergeben">👑</button>' : '') : '')
                                + '<button type="button" class="btn btn-sm" data-do="kick">Entfernen</button><button type="button" class="btn btn-sm" data-do="ban">🚫</button>' : '') + '</div>').join('') + '</div>';
                    const ig = $('[data-invgo]', pane); if (ig) ig.onclick = () => call('manage', { club: slug, do: 'invite', target: $('[data-inv]', pane).value.trim() }).then(r => { toast(r.msg); reload(); }).catch(fail);
                    $$('[data-m]', pane).forEach(el => $$('[data-do]', el).forEach(b => b.onclick = () => {
                        if (['ban', 'transfer', 'kick'].includes(b.dataset.do) && !confirm({ ban: 'Ausschließen?', transfer: 'Leitung wirklich übergeben?', kick: 'Entfernen?' }[b.dataset.do])) return;
                        call('manage', { club: slug, do: b.dataset.do, target: el.dataset.m }).then(r => { toast(r.msg); reload(); }).catch(fail); }));
                }
                if (t === 'apps') {
                    const a = d.applications || [];
                    pane.innerHTML = a.length ? a.map(x => '<div class="nw-card" data-m="' + esc(x.vrc_id) + '"><div class="nw-row"><b>' + esc(x.name || x.vrc_id) + '</b><span class="nw-muted">' + dt(x.at) + '</span><span class="sp"></span>'
                        + '<button type="button" class="btn btn-sm btn-gold" data-do="accept">✅ Aufnehmen</button><button type="button" class="btn btn-sm" data-do="decline">Ablehnen</button></div>'
                        + x.answers.map(q => '<div class="nw-muted" style="margin-top:4px">' + esc(q.q) + '</div><div class="nw-text">' + esc(q.a) + '</div>').join('') + '</div>').join('') : '<div class="nw-muted">Keine offenen Bewerbungen.</div>';
                    $$('[data-m]', pane).forEach(el => $$('[data-do]', el).forEach(b => b.onclick = () => call('manage', { club: slug, do: b.dataset.do, target: el.dataset.m }).then(r => { toast(r.msg); reload(); }).catch(fail)));
                }
            };
            $$('[data-t]', body).forEach(b => b.onclick = () => show(b.dataset.t));
            show(tab);
            const j = $('[data-join]', body);
            if (j) j.onclick = () => {
                if (c.join_mode !== 'apply' || !c.questions.length) return call('join', { club: slug }).then(r => { toast(r.msg); reload(); }).catch(fail);
                const jb = $('[data-joinbox]', body);
                jb.innerHTML = '<div class="cl-form" style="margin-top:10px">' + c.questions.map((q, i) => '<label class="cl-wide">' + esc(q) + '<textarea rows="2" maxlength="500" data-ans="' + i + '"></textarea></label>').join('')
                    + '</div><div class="nw-row"><span class="nw-muted">Mit der Bewerbung akzeptierst du die Regeln des Clubs.</span><span class="sp"></span><button type="button" class="btn btn-sm btn-gold" data-apply>📨 Bewerbung senden</button></div>';
                $('[data-apply]', jb).onclick = () => call('join', { club: slug, answers: $$('[data-ans]', jb).map(t => t.value) }).then(r => { toast(r.msg); reload(); }).catch(fail);
            };
            const lv = $('[data-leave]', body); if (lv) lv.onclick = () => confirm('Club verlassen?') && call('leave', { club: slug }).then(r => { toast(r.msg); go('mine'); }).catch(fail);
            const ed = $('[data-edit]', body); if (ed) ed.onclick = () => clubForm(c);
        }).catch(e => { body.innerHTML = '<div class="vx-error">' + esc(e.message) + '</div>'; });
    }
    function go(v) { view = v; if (v === 'browse') browse(false); if (v === 'mine') browse(true); if (v === 'cal') calendar(); if (v === 'new') clubForm(null); }

    window.NexusClubs = { open(name, sub) { if (name !== 'clubs') return; if (sub === 'cal') go('cal'); else if (sub === 'mine') go('mine'); else if (cur && view === 'club') openClub(cur); else go('browse'); } };
    const p = new URLSearchParams(location.search).get('club');
    if (p) { const b = document.querySelector('#tabs [data-tab="clubs"]'); if (b) b.click(); openClub(p); }
    else { const curPane = document.querySelector('.vx-tab:not([hidden])'); if (curPane && curPane.dataset.pane === 'clubs') go('browse'); }
})();
