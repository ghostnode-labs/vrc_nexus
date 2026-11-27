/* VRC Nexus 7.3 – 🔞 Vertrauen & Fürsorge (nur sichtbar mit NSFW-Freigabe).
 * Vertrauensliste mit Stufen und Rechten, Check-in-Timer für Treffen, Aftercare nach einer Session, Event-Ampel, Gruppen-Safeword.
 * Alles bleibt verschlüsselt auf diesem Gerät; Nachrichten an Vertrauenspersonen gehen nur Ende-zu-Ende-verschlüsselt über den Nexus-Chat. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    const sec = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '"><h4>' + t + '</h4>' + html + '</div>';
    const LVL = { partner: '💞 Partner', trusted: '🤝 Vertraut', known: '👋 Bekannt' };
    const PERM = { remote: 'Fernsteuerung', scenes: 'Gemeinsame Szenen', limits: 'Grenzen sehen', checkin: 'Check-in-Kontakt', group_sw: 'Gruppen-Safeword' };
    const AMP = [['green', '🟢', 'Offen für Anfragen'], ['yellow', '🟡', 'Nur nach Absprache'], ['red', '🔴', 'Bitte keine Anfragen'], ['off', '⚪', 'Aus']];
    let x = null, loading = false, tEd = null, reRender = null;
    const load = () => { if (loading) return; loading = true; api('nsfwc_state').then(d => { x = d; }).catch(() => {}).finally(() => { loading = false; if (reRender) reRender(); }); };
    const fail = e => toast(e.message, true);
    const hm = t => new Date(t).toLocaleTimeString(window.nxLoc ? nxLoc() : 'de-DE', { hour: '2-digit', minute: '2-digit' });
    const cb = (grp, k, on, label) => '<label class="check small"><input type="checkbox" data-x5c="' + grp + '" data-k="' + k + '"' + (on ? ' checked' : '') + '> ' + esc(T(label)) + '</label>';

    function trustHtml() {
        const rows = x.trust.length ? x.trust.map(t => '<div class="nc-mrow"><b>' + esc(LVL[t.level].split(' ')[0]) + ' ' + esc(t.name) + '</b><span class="muted small">'
            + esc(Object.keys(PERM).filter(k => t.perms[k]).map(k => T(PERM[k])).join(' · ') || T('keine Rechte')) + '</span>'
            + '<button type="button" class="nc-link" data-x5="tedit" data-id="' + esc(t.id) + '">' + esc(T('bearbeiten')) + '</button><button type="button" class="nc-x" data-x5="tdel" data-id="' + esc(t.id) + '">✕</button></div>').join('')
            : '<p class="muted small">' + esc(T('Noch niemand auf deiner Vertrauensliste.')) + '</p>';
        let form = '<button type="button" class="btn btn-sm btn-gold" data-x5="tnew">＋ ' + esc(T('Person hinzufügen')) + '</button>';
        if (tEd) form = '<div class="nx5-form"><div class="nc-row"><input type="text" data-t="name" value="' + esc(tEd.name) + '" maxlength="40" placeholder="' + esc(T('Name')) + '">'
            + '<input type="text" data-t="id" value="' + esc(tEd.id) + '" placeholder="usr_…"' + (tEd.old ? ' readonly' : '') + '></div>'
            + '<div class="nc-row">' + Object.entries(LVL).map(([k, n]) => '<button type="button" class="chip' + (tEd.level === k ? ' on' : '') + '" data-x5="tlvl" data-v="' + k + '">' + esc(T(n)) + '</button>').join('') + '</div>'
            + '<div class="nc-row">' + Object.entries(PERM).map(([k, n]) => '<label class="check small"><input type="checkbox" data-tp="' + k + '"' + (tEd.perms[k] ? ' checked' : '') + '> ' + esc(T(n)) + '</label>').join('') + '</div>'
            + '<input type="text" data-t="note" value="' + esc(tEd.note) + '" maxlength="200" placeholder="' + esc(T('Notiz (optional)')) + '">'
            + '<div class="nc-row"><button type="button" class="btn btn-sm btn-gold" data-x5="tsave">💾 ' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm" data-x5="tcancel">' + esc(T('Abbrechen')) + '</button></div></div>';
        return sec('🤝 ' + esc(T('Vertrauensliste')), '<p class="muted small">' + esc(T('Wer darf was? Die Stufe setzt passende Rechte vor – du kannst jedes Recht einzeln ändern. Nur auf diesem Gerät, verschlüsselt.')) + '</p>' + rows + form, 'ns-wide');
    }
    function checkinHtml() {
        const c = x.checkin, contacts = x.trust.filter(t => t.perms.checkin);
        if (c) return sec('🛟 ' + esc(T('Check-in-Timer')), '<p><b>' + esc(c.label) + '</b> · ' + esc(T('bis')) + ' ' + hm(c.due) + '</p>'
            + (c.state === 'due' ? '<p class="nx5-due">' + esc(T('Ist alles ok? Bitte bestätigen.')) + '</p>' : c.state === 'missed' ? '<p class="nx5-miss">' + esc(T('Deine Vertrauenspersonen wurden benachrichtigt.')) + '</p>' : '')
            + '<div class="nc-row"><button type="button" class="btn btn-gold" data-x5="cok">💚 ' + esc(T('Alles ok')) + '</button><button type="button" class="btn btn-sm" data-x5="cext">⏱ +15 min</button>'
            + '<button type="button" class="btn btn-sm btn-danger" data-x5="chelp">🆘 ' + esc(T('Hilfe')) + '</button></div>');
        return sec('🛟 ' + esc(T('Check-in-Timer')), '<p class="muted small">' + esc(T('Für Treffen mit neuen Leuten: Zur geplanten Zeit fragt VRC Nexus „Ist alles ok?“ (auch auf der Uhr). Kommt keine Antwort, bekommen deine Check-in-Kontakte eine verschlüsselte Nachricht.')) + '</p>'
            + (contacts.length ? '<div class="nc-row"><input type="text" id="nx5Lbl" maxlength="80" placeholder="' + esc(T('Mit wem / was?')) + '"><input type="number" id="nx5Min" value="60" min="5" max="480" style="width:80px"><span class="small">min</span>'
                + '<span class="small">' + esc(T('Nachfrist')) + '</span><input type="number" id="nx5Gr" value="5" min="2" max="30" style="width:64px"></div>'
                + '<div class="nc-row">' + contacts.map(t => '<label class="check small"><input type="checkbox" data-cc="' + esc(t.id) + '" checked> ' + esc(t.name) + '</label>').join('') + '</div>'
                + '<div class="nc-row"><label class="check small"><input type="checkbox" id="nx5W"> ' + esc(T('Welt mitschicken')) + '</label><label class="check small"><input type="checkbox" id="nx5Sw"> ' + esc(T('ohne Antwort auch Safeword auslösen')) + '</label></div>'
                + '<button type="button" class="btn btn-sm btn-gold" data-x5="cstart">▶ ' + esc(T('Starten')) + '</button>'
                : '<p class="small">' + esc(T('Lege zuerst eine Vertrauensperson mit dem Recht „Check-in“ an.')) + '</p>'));
    }
    function careHtml() {
        const a = x.cfg.aftercare, g = x.cfg.group;
        const moods = x.moods.length ? '<div class="nc-row">' + x.moods.slice(0, 7).map(m => '<span class="chip" title="' + esc(new Date(m.t).toLocaleString()) + '">' + esc(x.mood_labels[m.m].split(' ')[0]) + '</span>').join('') + '</div>' : '';
        return sec('💗 ' + esc(T('Aftercare')), '<p class="muted small">' + esc(T('Nach einer Session (oder nach dem Safeword) fragt VRC Nexus sanft nach, wie es dir geht. Deine Antwort bleibt hier.')) + '</p>'
            + (x.after ? '<p class="small">💗 ' + esc(T('Nächster Check-in um')) + ' ' + hm(x.after.due) + '</p>' : '')
            + '<div class="nc-row">' + Object.entries(x.mood_labels).map(([k, n]) => '<button type="button" class="btn btn-sm" data-x5="mood" data-v="' + k + '">' + esc(T(n)) + '</button>').join('') + '</div>' + moods
            + '<div class="nc-row">' + cb('aftercare', 'on', a.on, 'an') + cb('aftercare', 'after_safeword', a.after_safeword, 'auch nach dem Safeword') + '<span class="small">' + esc(T('nach')) + '</span><input type="number" data-x5c="aftercare" data-k="delay_min" value="' + a.delay_min + '" min="0" max="120" style="width:64px"><span class="small">min</span>'
            + '<button type="button" class="btn btn-sm" data-x5="save" data-part="aftercare">💾</button><button type="button" class="btn btn-sm btn-gold" data-x5="send">💗 ' + esc(T('Session beendet')) + '</button></div>')
            + sec('🚦 ' + esc(T('Event-Ampel')), '<p class="muted small">' + esc(T('Zeig auf Events, ob du gerade offen für Anfragen bist – in der Chatbox und als Avatar-Parameter (0 aus, 1 grün, 2 gelb, 3 rot). Geht nach der gewählten Zeit von selbst aus.')) + '</p>'
            + '<div class="nc-row">' + AMP.map(([k, ic, n]) => '<button type="button" class="chip' + ((x.ampel ? x.ampel.state : 'off') === k ? ' on' : '') + '" data-x5="amp" data-v="' + k + '" title="' + esc(T(n)) + '">' + ic + ' ' + esc(T(n)) + '</button>').join('') + '</div>'
            + '<div class="nc-row"><span class="small">' + esc(T('für')) + '</span><input type="number" id="nx5Ah" value="4" min="1" max="12" style="width:64px"><span class="small">' + esc(T('Std.')) + '</span>'
            + (x.ampel ? '<span class="small muted">' + esc(T('bis')) + ' ' + hm(x.ampel.until) + '</span>' : '') + '</div>'
            + '<div class="nc-row">' + cb('ampel', 'chatbox', x.cfg.ampel.chatbox, 'in die Chatbox') + '<input type="text" data-x5c="ampel" data-k="param" value="' + esc(x.cfg.ampel.param) + '" placeholder="NX/Ampel"><button type="button" class="btn btn-sm" data-x5="save" data-part="ampel">💾</button></div>')
            + sec('🛑 ' + esc(T('Gruppen-Safeword')), '<p class="muted small">' + esc(T('Dein Safeword stoppt auch bei allen Vertrauenspersonen mit dem Recht „Gruppen-Safeword“ – und ihr Safeword bei dir. Läuft verschlüsselt über den Nexus-Chat.')) + '</p>'
            + '<div class="nc-row">' + cb('group', 'send', g.send, 'mein Safeword weitergeben') + cb('group', 'recv', g.recv, 'Safeword der Gruppe annehmen') + '<button type="button" class="btn btn-sm" data-x5="save" data-part="group">💾</button></div>');
    }
    function html(sub, render) {
        reRender = render;
        if (!x) { load(); return '<div class="nc-card"><p class="muted">' + esc(T('Lade …')) + '</p></div>'; }
        return trustHtml() + checkinHtml() + careHtml();
    }
    function onClick(e, render) {
        const b = e.target.closest('[data-x5]'); if (!b || !x) return false;
        reRender = render;
        const a = b.dataset.x5, st = d => { x = Object.assign(x, d); if (d.msg) toast(d.msg); if (d.tip) toast(d.mood + ' – ' + d.tip); render(); };
        const val = id => (document.getElementById(id) || {}).value || '';
        if (a === 'tnew') { tEd = { id: '', name: '', level: 'trusted', perms: Object.assign({}, x.level_perms.trusted), note: '' }; render(); return true; }
        if (a === 'tedit') { const t = x.trust.find(z => z.id === b.dataset.id); tEd = Object.assign(JSON.parse(JSON.stringify(t)), { old: true }); render(); return true; }
        if (a === 'tcancel') { tEd = null; render(); return true; }
        if (a === 'tlvl') { tEd.level = b.dataset.v; tEd.perms = Object.assign({}, x.level_perms[tEd.level]); render(); return true; }
        if (a === 'tsave') { api('nsfwc_trust_save', { id: tEd.id, name: tEd.name, level: tEd.level, note: tEd.note, perms: JSON.stringify(tEd.perms) }).then(d => { tEd = null; st(d); }).catch(fail); return true; }
        if (a === 'tdel') { if (!confirm(T('Von der Vertrauensliste entfernen?'))) return true; api('nsfwc_trust_del', { id: b.dataset.id }).then(st).catch(fail); return true; }
        if (a === 'cstart') {
            const contacts = [...document.querySelectorAll('[data-cc]')].filter(c => c.checked).map(c => c.dataset.cc);
            api('nsfwc_checkin_start', { label: val('nx5Lbl'), minutes: val('nx5Min'), grace: val('nx5Gr'), contacts: JSON.stringify(contacts), share_world: document.getElementById('nx5W').checked ? '1' : '', safeword_on_miss: document.getElementById('nx5Sw').checked ? '1' : '' }).then(st).catch(fail);
            return true;
        }
        if (a === 'cok') { api('nsfwc_checkin_ok').then(st).catch(fail); return true; }
        if (a === 'cext') { api('nsfwc_checkin_extend', { minutes: 15 }).then(st).catch(fail); return true; }
        if (a === 'chelp') { if (!confirm(T('Jetzt deine Check-in-Kontakte um Hilfe bitten?'))) return true; api('nsfwc_checkin_help').then(st).catch(fail); return true; }
        if (a === 'mood') { api('nsfwc_mood', { mood: b.dataset.v }).then(st).catch(fail); return true; }
        if (a === 'send') { api('nsfwc_session_end').then(st).catch(fail); return true; }
        if (a === 'amp') { api('nsfwc_ampel', { state: b.dataset.v, hours: val('nx5Ah') }).then(st).catch(fail); return true; }
        if (a === 'save') {
            const part = b.dataset.part, data = { part };
            document.querySelectorAll('[data-x5c="' + part + '"]').forEach(el => { data[el.dataset.k] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value; });
            api('nsfwc_cfg', data).then(st).catch(fail); return true;
        }
        return false;
    }
    function onInput(e) {
        const t = e.target.closest('[data-t]'), p = e.target.closest('[data-tp]');
        if (t && tEd) { tEd[t.dataset.t] = t.value; return true; }
        if (p && tEd) { tEd.perms[p.dataset.tp] = p.checked; return true; }
        return false;
    }
    window.NexusNsfw5 = { html, onClick, onInput, reload: () => { x = null; } };
})();
