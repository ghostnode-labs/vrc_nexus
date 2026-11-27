/* 7.1 🎉 Gemeinsam: Freundes-Gruppen, Treffen planen, Chatbox-Umfrage, Mini-Spiele, Event-Modus, Abzeichen.
 * Alles lokal in der App (backend/together.js). Texte werden über das Wörterbuch übersetzt. */
(function () {
    const UI = window.NexusUI;
    const box = document.getElementById('tgBox');
    if (!UI || !box) return;
    const { api, esc } = UI;
    const T = s => (typeof window.t === 'function' ? window.t(s) : s);
    const toast = (m, bad) => UI.toast(m, bad);
    const $ = (s, r) => (r || box).querySelector(s);
    const $$ = (s, r) => [...(r || box).querySelectorAll(s)];
    const fail = e => toast('⚠ ' + (e.message || e), true);
    let d = null, sub = 'groups', editGroup = null;
    const SUBS = [['groups', '👥 Freundes-Gruppen'], ['plans', '🗓 Treffen planen'], ['poll', '📊 Umfrage'], ['games', '🎲 Mini-Spiele'], ['event', '🎉 Event-Modus'], ['badges', '🏅 Abzeichen']];
    const dt = ts => new Date(ts * 1000).toLocaleString(window.nxLoc ? window.nxLoc() : 'de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const dIn = ts => { const x = new Date(ts * 1000); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
    const dot = s => s === 'online' ? '🟢' : s === 'active' ? '🟡' : '⚫';

    function load() { return api('tg_get').then(r => { d = r; render(); }).catch(e => { box.innerHTML = '<div class="vx-error">' + esc(e.message) + '</div>'; }); }

    function render() {
        if (!d) return;
        box.innerHTML = '<nav class="tg-sub">' + SUBS.map(([k, t]) => '<button type="button" class="chip' + (sub === k ? ' on' : '') + '" data-sub="' + k + '">' + t + '</button>').join('') + '</nav><div class="tg-body"></div>';
        $$('[data-sub]').forEach(b => b.onclick = () => { sub = b.dataset.sub; editGroup = null; render(); });
        const body = $('.tg-body');
        ({ groups, plans, poll, games, event, badges })[sub](body);
    }

    // ---------- Freundes-Gruppen ----------
    function groups(body) {
        if (editGroup) return groupForm(body);
        body.innerHTML = '<p class="nw-muted">Feste Runden für Treffen: sieh, wer online ist, und lade alle im Spiel mit einem Klick in deine Instanz ein.</p>'
            + '<div class="nw-row" style="margin-bottom:10px"><span class="sp"></span><button type="button" class="btn btn-sm btn-gold" data-new>➕ Neue Gruppe</button></div>'
            + (d.groups.length ? '<div class="nw-grid">' + d.groups.map(g => '<div class="nw-card" data-g="' + esc(g.id) + '"><div class="nw-row"><b>' + esc(g.emoji + ' ' + g.name) + '</b><span class="sp"></span>'
                + '<span class="nw-muted">🟢 ' + g.in_game + ' · ' + g.members.length + '</span></div>'
                + '<div class="tg-mem">' + g.members.slice().sort((a, b) => (a.state === 'offline') - (b.state === 'offline')).slice(0, 12).map(m => '<span title="' + esc(m.world) + '">' + dot(m.state) + ' ' + esc(m.name) + '</span>').join('') + '</div>'
                + '<div class="nw-row" style="margin-top:8px"><button type="button" class="btn btn-sm btn-gold" data-inv' + (g.in_game ? '' : ' disabled') + '>📨 Alle im Spiel einladen</button><span class="sp"></span>'
                + '<button type="button" class="btn btn-sm" data-edit>✏</button><button type="button" class="btn btn-sm" data-del>🗑</button></div></div>').join('') + '</div>'
                : '<div class="nw-card nw-muted">Noch keine Gruppen – z. B. „Freitagsrunde“ oder „Club-Team“.</div>');
        $('[data-new]', body).onclick = () => { editGroup = { id: '', name: '', emoji: '👥', ids: [] }; render(); };
        $$('[data-g]', body).forEach(el => {
            const g = d.groups.find(x => x.id === el.dataset.g);
            $('[data-inv]', el).onclick = () => api('tg_group_invite', { id: g.id }).then(r => toast(r.msg)).catch(fail);
            $('[data-edit]', el).onclick = () => { editGroup = { id: g.id, name: g.name, emoji: g.emoji, ids: g.ids.slice() }; render(); };
            $('[data-del]', el).onclick = () => confirm(T('Gruppe löschen?')) && api('tg_group_delete', { id: g.id }).then(r => { d.groups = r.groups; toast(r.msg); render(); }).catch(fail);
        });
    }
    function groupForm(body) {
        const g = editGroup, sel = new Set(g.ids);
        body.innerHTML = '<div class="nw-card"><div class="nw-row"><input data-emo maxlength="4" value="' + esc(g.emoji) + '" style="width:56px"><input data-name maxlength="40" placeholder="' + esc(T('Name der Gruppe')) + '" value="' + esc(g.name) + '" style="flex:1"></div>'
            + '<input type="search" data-q placeholder="' + esc(T('Freunde filtern …')) + '" style="width:100%;margin:8px 0">'
            + '<div class="tg-pick">' + d.friends.map(f => '<label data-n="' + esc(f.name.toLowerCase()) + '"><input type="checkbox" value="' + esc(f.id) + '"' + (sel.has(f.id) ? ' checked' : '') + '> ' + dot(f.state) + ' ' + esc(f.name) + '</label>').join('') + '</div>'
            + '<div class="nw-row" style="margin-top:10px"><span class="nw-muted" data-cnt></span><span class="sp"></span><button type="button" class="btn btn-sm" data-back>Abbrechen</button><button type="button" class="btn btn-sm btn-gold" data-save>Speichern</button></div></div>';
        const cnt = () => { $('[data-cnt]', body).textContent = $$('.tg-pick input:checked', body).length + ' ' + T('ausgewählt'); };
        cnt();
        $$('.tg-pick input', body).forEach(i => i.onchange = cnt);
        $('[data-q]', body).oninput = e => { const q = e.target.value.toLowerCase(); $$('.tg-pick label', body).forEach(l => { l.hidden = q && !l.dataset.n.includes(q); }); };
        $('[data-back]', body).onclick = () => { editGroup = null; render(); };
        $('[data-save]', body).onclick = () => api('tg_group_save', { id: g.id, name: $('[data-name]', body).value, emoji: $('[data-emo]', body).value, ids: JSON.stringify($$('.tg-pick input:checked', body).map(i => i.value)) })
            .then(r => { d.groups = r.groups; editGroup = null; toast(r.msg); render(); }).catch(fail);
    }

    // ---------- Treffen planen ----------
    function plans(body) {
        const next = Math.ceil(Date.now() / 3600000 + 2) * 3600;
        body.innerHTML = '<details class="nw-card"' + (d.plans.length ? '' : ' open') + '><summary>➕ ' + esc(T('Neues Treffen')) + '</summary><div class="cl-form">'
            + '<label class="cl-wide">' + esc(T('Titel')) + '<input data-f="title" maxlength="80" placeholder="' + esc(T('z. B. Filmabend')) + '"></label>'
            + '<label>' + esc(T('Wann')) + '<input type="datetime-local" data-f="when" value="' + dIn(next) + '"></label>'
            + '<label>' + esc(T('Erinnern')) + '<select data-f="remind">' + [[0, 'nicht'], [5, '5 min vorher'], [15, '15 min vorher'], [30, '30 min vorher'], [60, '1 h vorher'], [1440, '1 Tag vorher']].map(([v, t]) => '<option value="' + v + '"' + (v === 15 ? ' selected' : '') + '>' + esc(T(t)) + '</option>').join('') + '</select></label>'
            + '<label class="cl-wide">' + esc(T('Ort (Welt / Instanz)')) + '<input data-f="place" maxlength="120"></label>'
            + '<label>' + esc(T('Gruppe')) + '<select data-f="group"><option value="">–</option>' + d.groups.map(g => '<option value="' + esc(g.id) + '">' + esc(g.emoji + ' ' + g.name) + '</option>').join('') + '</select></label>'
            + '<label class="cl-wide">' + esc(T('Notiz')) + '<textarea data-f="note" rows="2" maxlength="500"></textarea></label></div>'
            + '<div class="nw-row"><span class="nw-muted">' + esc(T('Erinnerung kommt am PC, auf der Nexus Watch und im Handy-Widget.')) + '</span><span class="sp"></span><button type="button" class="btn btn-sm btn-gold" data-add>Speichern</button></div></details>'
            + (d.plans.length ? d.plans.map(p => '<div class="nw-card' + (p.past ? ' tg-past' : '') + '" data-p="' + esc(p.id) + '"><div class="nw-row"><b>🗓 ' + esc(p.title) + '</b><span class="sp"></span><span class="nw-muted">' + esc(dt(p.when)) + '</span></div>'
                + (p.place ? '<div class="nw-muted">📍 ' + esc(p.place) + '</div>' : '') + (p.group_name ? '<div class="nw-muted">' + esc(p.group_name) + '</div>' : '') + (p.note ? '<div class="nw-text">' + esc(p.note) + '</div>' : '')
                + '<div class="nw-row" style="margin-top:6px"><span class="nw-muted">' + (p.remind ? '⏰ ' + p.remind + ' min' : '') + '</span><span class="sp"></span>'
                + (p.group ? '<button type="button" class="btn btn-sm" data-ginv>📨 ' + esc(T('Gruppe einladen')) + '</button>' : '') + '<button type="button" class="btn btn-sm" data-copy>📋</button><button type="button" class="btn btn-sm" data-del>🗑</button></div></div>').join('')
                : '<div class="nw-muted">' + esc(T('Noch keine Treffen geplant.')) + '</div>');
        const f = k => $('[data-f="' + k + '"]', body);
        $('[data-add]', body).onclick = () => api('tg_plan_save', { title: f('title').value, when: Math.floor(new Date(f('when').value).getTime() / 1000), remind: f('remind').value, place: f('place').value, group: f('group').value, note: f('note').value })
            .then(r => { d.plans = r.plans; toast(r.msg); render(); }).catch(fail);
        $$('[data-p]', body).forEach(el => {
            const p = d.plans.find(x => x.id === el.dataset.p);
            $('[data-del]', el).onclick = () => api('tg_plan_delete', { id: p.id }).then(r => { d.plans = r.plans; render(); }).catch(fail);
            $('[data-copy]', el).onclick = () => api('tg_plan_text', { id: p.id }).then(r => { UI.copy(r.text); }).catch(fail);
            const gi = $('[data-ginv]', el); if (gi) gi.onclick = () => api('tg_group_invite', { id: p.group }).then(r => toast(r.msg)).catch(fail);
        });
    }

    // ---------- Umfrage ----------
    function poll(body) {
        const p = d.poll;
        if (!p) {
            body.innerHTML = '<div class="nw-card"><p class="nw-muted">' + esc(T('Frage in die Chatbox – alle antworten mit der Nummer, du zählst hier mit und schickst das Ergebnis zurück.')) + '</p>'
                + '<input data-q maxlength="80" placeholder="' + esc(T('Frage, z. B. Welche Welt als Nächstes?')) + '" style="width:100%">'
                + '<textarea data-o rows="4" placeholder="' + esc(T('Antworten – eine pro Zeile (2 bis 6)')) + '" style="width:100%;margin-top:8px"></textarea>'
                + '<div class="nw-row" style="margin-top:8px"><span class="sp"></span><button type="button" class="btn btn-sm btn-gold" data-go>📊 ' + esc(T('Umfrage starten')) + '</button></div></div>';
            $('[data-go]', body).onclick = () => api('tg_poll_start', { q: $('[data-q]', body).value, options: $('[data-o]', body).value }).then(r => { d.poll = r.poll; toast(r.msg); render(); }).catch(fail);
            return;
        }
        const total = p.votes.reduce((a, b) => a + b, 0) || 1;
        body.innerHTML = '<div class="nw-card"><h3>📊 ' + esc(p.q) + '</h3>' + p.options.map((o, i) => '<div class="tg-vote"><b>' + (i + 1) + ') ' + esc(o) + '</b><i style="width:' + Math.round(p.votes[i] / total * 100) + '%"></i>'
            + '<span>' + p.votes[i] + '</span><button type="button" class="btn btn-sm" data-v="' + i + '" data-d="-1">−</button><button type="button" class="btn btn-sm btn-gold" data-v="' + i + '" data-d="1">＋</button></div>').join('')
            + '<div class="nw-row" style="margin-top:10px"><span class="sp"></span><button type="button" class="btn btn-sm" data-end="0">' + esc(T('Beenden')) + '</button><button type="button" class="btn btn-sm btn-gold" data-end="1">📣 ' + esc(T('Ergebnis in die Chatbox')) + '</button></div></div>';
        $$('[data-v]', body).forEach(b => b.onclick = () => api('tg_poll_vote', { i: b.dataset.v, delta: b.dataset.d }).then(r => { d.poll = r.poll; render(); }).catch(fail));
        $$('[data-end]', body).forEach(b => b.onclick = () => api('tg_poll_end', { announce: b.dataset.end }).then(r => { d.poll = null; toast(r.msg); render(); }).catch(fail));
    }

    // ---------- Mini-Spiele ----------
    function games(body) {
        const G = [['dice', '🎲', 'Würfeln', '2d6'], ['coin', '🪙', 'Münzwurf', ''], ['pick', '👉', 'Wer ist dran?', ''], ['wheel', '🎡', 'Glücksrad', ''], ['quiz', '❓', 'Quizfrage', ''], ['truth', '💬', 'Wahrheit', ''], ['dare', '🎯', 'Pflicht', ''], ['bingo', '🎱', 'VRChat-Bingo', '']];
        body.innerHTML = '<div class="nw-card"><div class="nw-row"><label><input type="checkbox" data-cb checked> ' + esc(T('Ergebnis in die Chatbox')) + '</label><span class="sp"></span></div>'
            + '<textarea data-arg rows="2" placeholder="' + esc(T('Für „Wer ist dran?“ und Glücksrad: Namen/Felder, mit Komma oder pro Zeile (leer = alle in der Instanz)')) + '" style="width:100%;margin-top:6px"></textarea></div>'
            + '<div class="tg-games">' + G.map(([k, i, t]) => '<button type="button" class="nw-card tg-game" data-k="' + k + '"><span>' + i + '</span><b>' + esc(T(t)) + '</b></button>').join('') + '</div><div data-out></div>';
        const out = $('[data-out]', body);
        $$('[data-k]', body).forEach(b => b.onclick = () => {
            const k = b.dataset.k, arg = k === 'dice' ? (prompt(T('Würfel, z. B. 1d6, 2d6, 1d20'), '2d6') || '') : $('[data-arg]', body).value;
            if (k === 'dice' && !arg) return;
            api('tg_game', { kind: k, arg, chatbox: $('[data-cb]', body).checked ? '1' : '0' }).then(r => {
                if (r.card) { out.innerHTML = '<div class="nw-card"><h3>🎱 Bingo</h3><div class="tg-bingo">' + r.card.map(c => '<button type="button">' + esc(c) + '</button>').join('') + '</div></div>'; $$('.tg-bingo button', out).forEach(x => x.onclick = () => x.classList.toggle('on')); return; }
                out.innerHTML = '<div class="nw-card tg-res"><b>' + esc(r.text) + '</b>' + (r.answer ? '<button type="button" class="btn btn-sm" data-ans>' + esc(T('Antwort zeigen')) + '</button><span data-a hidden> → ' + esc(r.answer) + '</span>' : '') + (r.sent ? '<span class="nw-muted"> · 💬</span>' : '') + '</div>';
                const a = $('[data-ans]', out); if (a) a.onclick = () => { $('[data-a]', out).hidden = false; a.remove(); };
            }).catch(fail);
        });
    }

    // ---------- Event-Modus ----------
    function event(body) {
        const e = d.event;
        if (e.on) {
            body.innerHTML = '<div class="nw-card tg-live"><h3>🎉 ' + esc(e.title) + '</h3><p class="nw-muted">' + esc(T('läuft seit')) + ' ' + esc(dt(e.since)) + (e.mute ? ' · 🔕 ' + esc(T('nur VIP-Meldungen')) : '') + '</p>'
                + '<button type="button" class="btn btn-gold" data-off>👋 ' + esc(T('Event-Modus beenden')) + '</button></div>';
            $('[data-off]', body).onclick = () => api('tg_event_off').then(r => { d.event = r.event; toast(r.msg); render(); }).catch(fail);
            return;
        }
        body.innerHTML = '<div class="nw-card"><p class="nw-muted">' + esc(T('Ein Schalter fürs Event: VRChat-Status mit Titel, Ansage in der Chatbox und Meldungen stumm (außer VIPs und deinen Erinnerungen). Beim Beenden kommt der alte Status zurück.')) + '</p>'
            + '<div class="cl-form"><label class="cl-wide">' + esc(T('Titel')) + '<input data-t maxlength="32" placeholder="' + esc(T('z. B. Clubnacht')) + '"></label>'
            + '<label>' + esc(T('Status')) + '<select data-s><option value="busy">🔴 busy</option><option value="ask me">🟠 ask me</option><option value="active">🟢 active</option><option value="join me">🔵 join me</option></select></label>'
            + '<label><input type="checkbox" data-c checked> ' + esc(T('Ansage in der Chatbox')) + '</label><label><input type="checkbox" data-m checked> ' + esc(T('Meldungen stumm')) + '</label></div>'
            + '<div class="nw-row" style="margin-top:10px"><span class="sp"></span><button type="button" class="btn btn-gold" data-on>🎉 ' + esc(T('Event-Modus starten')) + '</button></div></div>';
        $('[data-on]', body).onclick = () => api('tg_event_on', { title: $('[data-t]', body).value, status: $('[data-s]', body).value, chatbox: $('[data-c]', body).checked ? '1' : '0', mute: $('[data-m]', body).checked ? '1' : '0' })
            .then(r => { d.event = r.event; toast(r.msg); render(); }).catch(fail);
    }

    // ---------- Abzeichen ----------
    function badges(body) {
        const got = d.badges.filter(b => b.got).length;
        body.innerHTML = '<p class="nw-muted">' + got + ' / ' + d.badges.length + ' ' + esc(T('Abzeichen – aus deiner echten Spielzeit, nur auf diesem Gerät.')) + '</p><div class="tg-badges">'
            + d.badges.map(b => '<div class="nw-card tg-badge' + (b.got ? ' got' : '') + '"><span>' + b.icon + '</span><b>' + esc(T(b.name)) + '</b><small>' + esc(T(b.desc)) + '</small>'
                + '<i><em style="width:' + Math.round(b.progress * 100) + '%"></em></i><small>' + b.value + ' / ' + b.goal + '</small></div>').join('') + '</div>';
    }

    window.NexusTogether = { open() { load(); } };
})();
