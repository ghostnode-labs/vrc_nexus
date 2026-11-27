/* VRC Nexus 7.3.2 – 🔞 Paar-Profile und Vorlagen-Bibliothek (nur mit Verified 18+ und NSFW; der Server prüft jede Anfrage).
 * Gleiche Datei in Nexus Web (NexusWebKit, Aktionen nw_club_*) und in der App (NexusUI, Aktionen club_* → nexusclubs.php).
 * In der App lassen sich Vorlagen direkt als eigene Fantasie bzw. Szene übernehmen und eigene teilen. Alle Nutzertexte werden maskiert. */
(function () {
    const APP = !window.NexusWebKit;
    const K = window.NexusWebKit || (window.NexusUI && { api: window.NexusUI.api, toast: (m, k) => window.NexusUI.toast(m, k === 'error'), esc: window.NexusUI.esc });
    if (!K) return;
    const { api, toast, esc } = K;
    const $ = (s, r) => r.querySelector(s), $$ = (s, r) => [...r.querySelectorAll(s)];
    const call = (a, data) => api((APP ? 'club_' : 'nw_club_') + a, { data: JSON.stringify(data || {}) });
    const fail = e => toast(e.message || String(e), 'error');
    const stars = (n, pick) => [1, 2, 3, 4, 5].map(i => pick ? '<button type="button" class="ad-star' + (i <= n ? ' on' : '') + '" data-star="' + i + '">★</button>' : (i <= Math.round(n) ? '★' : '☆')).join('');
    const KIND = { fantasy: '🎭 Fantasie', scene: '🧱 Szene' };
    let filt = { kind: '', sort: 'top', q: '', mine: false };

    // ---------------- Paar-Profil ----------------
    function couple(box) {
        box.innerHTML = '<div class="nw-muted">Lade …</div>';
        call('couple_list', {}).then(d => {
            const m = d.mine, form = (x, btn) => '<div class="cl-form"><label class="cl-wide">Name des Paares<input data-c="name" maxlength="60" value="' + esc(x.name || '') + '"></label>'
                + '<label class="cl-wide">Über uns<textarea data-c="bio" rows="3" maxlength="1500">' + esc(x.bio || '') + '</textarea></label>'
                + '<label class="cl-wide">Wir suchen / mögen<textarea data-c="looking" rows="2" maxlength="500">' + esc(x.looking || '') + '</textarea></label></div>' + btn;
            let mine = '';
            if (!m) mine = '<div class="nw-card"><h3>💞 Paar-Profil anlegen</h3><p class="nw-muted">Ein gemeinsames 18+-Profil für euch zwei. Es geht nur mit einer Person, mit der du über eine 18+-Anfrage verbunden bist – und erscheint erst, wenn ihr beide bestätigt habt. Jede spätere Änderung bestätigt ebenfalls die andere Seite.</p>'
                + '<div class="cl-form"><label class="cl-wide">VRChat-ID deines Gegenübers<input data-c="partner" placeholder="usr_…"></label></div>' + form({}, '<div class="nw-row"><span class="sp"></span><button type="button" class="btn btn-sm btn-gold" data-cinv>💌 Einladen</button></div>') + '</div>';
            else {
                const who = m.members.map(p => esc(p.name || p.vrc_id)).join(' & ');
                mine = '<div class="nw-card"><div class="nw-row"><h3 style="margin:0">💞 ' + esc(m.name) + '</h3><span class="sp"></span><span class="nw-muted">' + who + '</span></div>'
                    + (m.status === 'pending' ? '<p>' + (m.waiting_for_me ? '📨 Du wurdest zu diesem Paar-Profil eingeladen.' : '⏳ Wartet auf die Bestätigung deines Gegenübers.') + '</p>' : '')
                    + '<div class="nw-text">' + esc(m.bio) + '</div>' + (m.looking ? '<div class="nw-muted">🔎 ' + esc(m.looking) + '</div>' : '')
                    + (m.draft ? '<div class="nw-card ad-draft"><b>📝 Vorgeschlagene Änderung</b><div><b>' + esc(m.draft.name) + '</b></div><div class="nw-text">' + esc(m.draft.bio) + '</div>' + (m.draft.looking ? '<div class="nw-muted">🔎 ' + esc(m.draft.looking) + '</div>' : '') + '</div>' : '')
                    + '<div class="nw-row" style="margin-top:8px"><span class="sp"></span>'
                    + (m.waiting_for_me ? '<button type="button" class="btn btn-sm btn-gold" data-cyes>✅ Bestätigen</button><button type="button" class="btn btn-sm" data-cno>Ablehnen</button>' : '')
                    + (m.status === 'active' ? '<button type="button" class="btn btn-sm" data-cedit>✏ Ändern</button>' : '')
                    + '<button type="button" class="btn btn-sm btn-danger" data-cend>' + (m.status === 'pending' ? 'Zurückziehen' : 'Löschen') + '</button></div><div data-cform></div></div>';
            }
            const list = d.items.filter(x => !x.mine);
            box.innerHTML = mine + '<div class="nw-card"><div class="nw-row"><h3 style="margin:0">💑 Paare</h3><span class="sp"></span><input data-cq placeholder="Suchen …" style="max-width:200px"></div>'
                + (list.length ? list.map(x => '<div class="ad-couple"><b>💞 ' + esc(x.name) + '</b> <span class="nw-muted">' + x.members.map(p => esc(p.name || '?')).join(' & ') + '</span><div class="nw-text">' + esc(x.bio) + '</div>' + (x.looking ? '<div class="nw-muted">🔎 ' + esc(x.looking) + '</div>' : '') + '</div>').join('') : '<div class="nw-muted">Noch keine Paar-Profile.</div>') + '</div>';
            const v = (k, r) => { const el = $('[data-c="' + k + '"]', r || box); return el ? el.value : ''; };
            const inv = $('[data-cinv]', box); if (inv) inv.onclick = () => call('couple_invite', { partner: v('partner').trim(), name: v('name'), bio: v('bio'), looking: v('looking') }).then(r => { toast(r.msg); couple(box); }).catch(fail);
            const y = $('[data-cyes]', box); if (y) y.onclick = () => call('couple_answer', { yes: 1 }).then(r => { toast(r.msg); couple(box); }).catch(fail);
            const n = $('[data-cno]', box); if (n) n.onclick = () => call('couple_answer', { yes: 0 }).then(r => { toast(r.msg); couple(box); }).catch(fail);
            const e = $('[data-cend]', box); if (e) e.onclick = () => confirm('Paar-Profil wirklich ' + (m.status === 'pending' ? 'zurückziehen' : 'löschen') + '?') && call('couple_end', {}).then(r => { toast(r.msg); couple(box); }).catch(fail);
            const ed = $('[data-cedit]', box); if (ed) ed.onclick = () => { const f = $('[data-cform]', box); f.innerHTML = form(m, '<div class="nw-row"><span class="nw-muted">Dein Gegenüber bestätigt die Änderung.</span><span class="sp"></span><button type="button" class="btn btn-sm btn-gold" data-csave>Vorschlagen</button></div>');
                $('[data-csave]', f).onclick = () => call('couple_edit', { name: v('name', f), bio: v('bio', f), looking: v('looking', f) }).then(r => { toast(r.msg); couple(box); }).catch(fail); };
            const q = $('[data-cq]', box); q.onkeydown = ev => { if (ev.key === 'Enter') call('couple_list', { q: q.value }).then(r => { d.items = r.items; const l = r.items.filter(x => !x.mine); q.closest('.nw-card').querySelectorAll('.ad-couple').forEach(x => x.remove());
                q.closest('.nw-card').insertAdjacentHTML('beforeend', l.map(x => '<div class="ad-couple"><b>💞 ' + esc(x.name) + '</b> <span class="nw-muted">' + x.members.map(p => esc(p.name || '?')).join(' & ') + '</span><div class="nw-text">' + esc(x.bio) + '</div></div>').join('')); }).catch(fail); };
        }).catch(e => { box.innerHTML = '<div class="vx-error">' + esc(e.message) + '</div>'; });
    }

    // ---------------- Vorlagen-Bibliothek ----------------
    function bodyText(t) {
        const b = t.body || {};
        if (t.kind === 'fantasy') return [b.place && '📍 ' + b.place, b.mood && '✨ ' + b.mood, ...(b.roles || []).map(r => '👤 ' + r.name + (r.desc ? ': ' + r.desc : '')), b.limits && '🚫 ' + b.limits, b.safeword && '🛑 Safeword: ' + b.safeword].filter(Boolean).join('\n');
        const steps = b.steps || [];
        return steps.map((s, i) => (i + 1) + '. ' + (s.pause ? '⏸ Pause' : '〰 ' + s.pattern + ' · ' + s.strength + ' % · ×' + s.speed) + ' · ' + s.seconds + ' s').join('\n') + '\n🔁 ' + (b.rounds || 1) + ' Runde(n)' + (b.ramp ? ' · +' + b.ramp + ' % je Runde' : '');
    }
    function library(box) {
        box.innerHTML = '<div class="nw-card"><div class="nw-row"><h3 style="margin:0">📚 Vorlagen-Bibliothek</h3><span class="sp"></span>'
            + '<select data-k><option value="">Alle</option>' + Object.entries(KIND).map(([k, l]) => '<option value="' + k + '"' + (filt.kind === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
            + '<select data-s>' + [['top', '⭐ Beste'], ['used', '📥 Meist übernommen'], ['new', '🆕 Neueste']].map(([k, l]) => '<option value="' + k + '"' + (filt.sort === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
            + '<input data-q placeholder="Suchen …" value="' + esc(filt.q) + '" style="max-width:160px"><label class="cl-chk"><input type="checkbox" data-mine' + (filt.mine ? ' checked' : '') + '> nur meine</label></div>'
            + '<p class="nw-muted">Fantasien und Szenen aus der Community – vor dem Spielen immer mit dem Gegenüber absprechen. ' + (APP ? 'Eigene teilst du in „🛡 Grenzen &amp; Sicherheit → 🎭 Fantasien“ bzw. im Szenen-Baukasten mit „📤 Teilen“.' : 'Teilen geht aus der Desktop-App (Fantasien und Szenen-Baukasten).') + '</p><div data-list class="nw-muted">Lade …</div></div>';
        const rd = () => call('tpl_list', filt).then(d => {
            $('[data-list]', box).innerHTML = d.items.length ? d.items.map(t => '<div class="nw-card ad-tpl" data-t="' + t.id + '" style="cursor:pointer"><div class="nw-row"><b>' + esc(KIND[t.kind] || '') + ' · ' + esc(t.title) + '</b>'
                + (t.status !== 'ok' ? ' <span class="nw-muted">⏳ wird geprüft</span>' : '') + '<span class="sp"></span><span class="ad-stars">' + stars(t.avg) + '</span> <span class="nw-muted">(' + t.count + ') · 📥 ' + t.uses + '</span></div>'
                + (t.descr ? '<div class="nw-text">' + esc(t.descr) + '</div>' : '') + '<div class="nw-muted">von ' + esc(t.author || '?') + '</div></div>').join('') : 'Nichts gefunden.';
            $$('[data-t]', box).forEach(el => el.onclick = () => one(box, +el.dataset.t));
        }).catch(e => { $('[data-list]', box).innerHTML = '<div class="vx-error">' + esc(e.message) + '</div>'; });
        $('[data-k]', box).onchange = e => { filt.kind = e.target.value; rd(); };
        $('[data-s]', box).onchange = e => { filt.sort = e.target.value; rd(); };
        $('[data-mine]', box).onchange = e => { filt.mine = e.target.checked; rd(); };
        $('[data-q]', box).onkeydown = e => { if (e.key === 'Enter') { filt.q = e.target.value; rd(); } };
        rd();
    }
    function one(box, id) {
        call('tpl_get', { id }).then(d => {
            const t = d.item;
            box.innerHTML = '<div class="nw-card"><div class="nw-row"><button type="button" class="btn btn-sm" data-back>← Zurück</button><span class="sp"></span><span class="ad-stars">' + stars(t.avg) + '</span> <span class="nw-muted">(' + t.count + ') · 📥 ' + t.uses + '</span></div>'
                + '<h3>' + esc(KIND[t.kind] || '') + ' · ' + esc(t.title) + '</h3>' + (t.descr ? '<div class="nw-text">' + esc(t.descr) + '</div>' : '')
                + '<pre class="ad-body">' + esc(bodyText(t)) + '</pre><div class="nw-muted">von ' + esc(t.author || '?') + '</div>'
                + '<div class="nw-row" style="margin-top:8px">' + (t.own ? '' : '<span>Deine Bewertung:</span> <span data-rate>' + stars(t.my_stars, true) + '</span>') + '<span class="sp"></span>'
                + (APP ? '<button type="button" class="btn btn-sm btn-gold" data-use>📥 Übernehmen</button>' : '') + (t.own ? '<button type="button" class="btn btn-sm btn-danger" data-del>Löschen</button>' : '') + '</div></div>';
            $('[data-back]', box).onclick = () => library(box);
            $$('[data-star]', box).forEach(b => b.onclick = () => call('tpl_rate', { id, stars: +b.dataset.star }).then(r => { toast(r.msg); one(box, id); }).catch(fail));
            const del = $('[data-del]', box); if (del) del.onclick = () => confirm('Vorlage löschen?') && call('tpl_del', { id }).then(r => { toast(r.msg); library(box); }).catch(fail);
            const use = $('[data-use]', box); if (use) use.onclick = () => call('tpl_get', { id, use: 1 }).then(r => {
                const b = r.item.body || {};
                if (t.kind === 'fantasy') return api('nsfwx_fantasy_save', { title: t.title, place: b.place, mood: b.mood, roles: JSON.stringify(b.roles || []), limits: b.limits, safeword: b.safeword });
                return api('toys_scenes_save', { name: t.title, steps: JSON.stringify(b.steps || []), rounds: b.rounds, ramp: b.ramp });
            }).then(r => toast((r && r.msg) || '📥 Übernommen.')).catch(fail);
        }).catch(fail);
    }

    /** eigene Fantasie / Szene teilen (App) */
    function share(kind, title, body, descr) { return call('tpl_save', { kind, title, descr: descr || '', body }); }

    window.NexusAdult = {
        render(box, sub) { if (!box) return; if (sub === 'couple') couple(box); else library(box); },
        share,
    };
})();
