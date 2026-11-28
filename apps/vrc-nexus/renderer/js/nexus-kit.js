/* VRC Nexus 8.2 – 🧰 Alltag (Werkzeuge, PC und Handy): Status-Timer, Online-Erinnerung, Ortszeit von Freunden, Notizblock mit Checklisten,
 * Kalender-Export (Geburtstage & Freundschaftstage), Spielzeit-Budget, VRChat-Serverstatus, Kontakt-Pflege. Daten bleiben auf diesem Gerät. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const { api, esc } = UI;
    const T = s => (typeof window.t === 'function' ? window.t(s) : s);
    const toast = (m, bad) => UI.toast(m, bad);
    const fail = e => toast('⚠ ' + (e.message || e), true);
    const loc = () => (window.nxLoc ? window.nxLoc() : 'de-DE');
    const card = (title, inner, wide) => '<div class="nc-card"' + (wide ? ' style="grid-column:1/-1"' : '') + '><h4>' + title + '</h4>' + inner + '</div>';
    const btn = (k, label, cls, extra) => '<button type="button" class="btn btn-sm' + (cls ? ' ' + cls : '') + '" data-k="' + k + '"' + (extra || '') + '>' + label + '</button>';
    const hm = m => (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min');
    const STATUS = { 'join me': '🔵 Join Me', active: '🟢 Online', 'ask me': '🟠 Ask Me', busy: '🔴 Busy' };
    const TEMPL = ['🍕 Essen – zurück um {zeit}', '🚿 Kurz weg – bis {zeit}', '😴 Schlafe bis {zeit}', '🎬 Film – frei ab {zeit}'];
    const COLORS = [['', '–'], ['gold', '🟡'], ['green', '🟢'], ['blue', '🔵'], ['pink', '🩷'], ['red', '🔴']];
    let box = null, view = '', friends = null, timer = null, editNote = null, q = '';

    const field = id => { const e = box && box.querySelector('#' + id); return e ? e.value : ''; };
    function loadFriends() { if (friends) return Promise.resolve(friends); return api('kit_friends').then(d => (friends = d.friends)).catch(() => (friends = [])); }
    /** Freund wählen: Eingabe mit Vorschlägen (Name), erlaubt auch usr_… */
    const pick = id => '<input type="text" id="' + id + '" list="' + id + 'L" placeholder="' + esc(T('Freund (Name oder usr_…)')) + '" style="flex:1;min-width:180px">'
        + '<datalist id="' + id + 'L">' + (friends || []).map(f => '<option value="' + esc(f.name) + '">').join('') + '</datalist>';
    const resolve = id => { const v = field(id).trim(); if (/^usr_/.test(v)) return v; const f = (friends || []).find(x => x.name === v) || (friends || []).find(x => x.name.toLowerCase() === v.toLowerCase()); return f ? f.id : v; };
    const dot = s => '<span class="nw-dot' + (s && s !== 'offline' ? ' on' : '') + '"></span>';

    function go(id, el) {
        box = el; view = id; clearInterval(timer); timer = null; editNote = null;
        box.innerHTML = '<div class="vx-loading">' + esc(T('Lade …')) + '</div>';
        if (!box.dataset.kit) { box.dataset.kit = '1'; box.addEventListener('click', onClick); box.addEventListener('change', onChange); }
        draw();
    }
    function draw() {
        if (!box || !document.body.contains(box)) { clearInterval(timer); return; }
        const f = { status: vStatus, remind: vRemind, tz: vTz, notes: vNotes, calendar: vCalendar, budget: vBudget, vrcstatus: vVrcStatus, care: vCare }[view];
        if (f) f().catch(e => { box.innerHTML = '<div class="vx-error">⚠ ' + esc(e.message || e) + '</div>'; });
    }
    const set = h => { box.innerHTML = '<div class="nc-grid">' + h + '</div>'; };

    // ---------- ⏰ Status-Timer ----------
    async function vStatus() {
        const d = await api('kit_status');
        let h = '';
        if (d.status) h += card('⏰ ' + esc(T('Läuft')), '<p>' + esc(STATUS[d.status.set.status] || d.status.set.status) + (d.status.set.desc ? ' · „' + esc(d.status.set.desc) + '“' : '') + '</p>'
            + '<p class="small muted">' + esc(T('Danach zurück zu')) + ' ' + esc(STATUS[d.status.prev.status] || d.status.prev.status) + (d.status.prev.desc ? ' · „' + esc(d.status.prev.desc) + '“' : '') + ' · ' + esc(T('noch')) + ' ' + esc(hm(d.status.left_min)) + '</p>'
            + '<div class="nc-row">' + btn('st_restore', '↩ ' + esc(T('Jetzt zurücksetzen')), 'btn-gold') + btn('st_cancel', '✕ ' + esc(T('Timer aus, Status behalten'))) + '</div>');
        h += card('⏰ ' + esc(T('Status-Timer')), '<p class="small muted">' + esc(T('Setzt Status und Text für eine Weile und stellt danach den vorherigen wieder her – außer du hast ihn inzwischen selbst geändert.')) + '</p>'
            + '<div class="nc-row"><select id="kStatus">' + d.statuses.map(s => '<option value="' + esc(s) + '"' + (s === 'busy' ? ' selected' : '') + '>' + esc(STATUS[s] || s) + '</option>').join('') + '</select>'
            + '<input type="text" id="kDesc" maxlength="40" placeholder="' + esc(T('Text, {zeit} = Endzeit')) + '" style="flex:1;min-width:180px"></div>'
            + '<div class="chips">' + TEMPL.map(x => '<button type="button" class="chip" data-k="st_tpl" data-v="' + esc(x) + '">' + esc(T(x)) + '</button>').join('') + '</div>'
            + '<div class="nc-row"><span class="small">' + esc(T('Dauer')) + '</span><select id="kMin">' + [15, 30, 45, 60, 90, 120, 180, 240].map(m => '<option value="' + m + '"' + (m === 30 ? ' selected' : '') + '>' + esc(hm(m)) + '</option>').join('') + '</select>'
            + '<span class="small">' + esc(T('oder bis')) + '</span><input type="time" id="kUntil"></div>'
            + '<div class="nc-row">' + btn('st_start', '▶ ' + esc(T('Starten')), 'btn-gold') + '</div>');
        set(h);
    }
    // ---------- 🔔 Online-Erinnerung ----------
    async function vRemind() {
        await loadFriends();
        const d = await api('kit_remind_list');
        const rows = d.reminders.length ? d.reminders.map(r => '<div class="nc-mrow"><b>' + esc(r.name) + '</b><span class="small" style="flex:2">' + esc(r.text) + (r.wait_offline ? ' <span class="muted">· ' + esc(T('ab dem nächsten Online-Gehen')) + '</span>' : '') + '</span>'
            + '<button type="button" class="nc-x" data-k="rm_del" data-id="' + esc(r.id) + '" title="' + esc(T('Entfernen')) + '">✕</button></div>').join('') : '<p class="small muted">' + esc(T('Keine offenen Erinnerungen.')) + '</p>';
        set(card('🔔 ' + esc(T('Online-Erinnerung')), '<p class="small muted">' + esc(T('Einmalig: sobald die Person online kommt, bekommst du einen Hinweis mit deinem Text.')) + '</p>'
            + '<div class="nc-row">' + pick('kFr') + '</div><div class="nc-row"><input type="text" id="kTxt" maxlength="200" placeholder="' + esc(T('Woran soll ich dich erinnern?')) + '" style="flex:1">'
            + '<label class="check small"><input type="checkbox" id="kNow"> ' + esc(T('auch wenn schon online')) + '</label>' + btn('rm_add', '＋ ' + esc(T('Merken')), 'btn-gold') + '</div>')
            + card('📋 ' + esc(T('Offen')) + ' (' + d.reminders.length + ')', rows)
            + (d.done.length ? card('✔ ' + esc(T('Erledigt')), d.done.map(r => '<div class="nc-mrow off"><b>' + esc(r.name) + '</b><span class="small" style="flex:2">' + esc(r.text) + '</span><span class="small muted">' + esc(new Date(r.fired * 1000).toLocaleString(loc(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</span></div>').join('')) : ''));
    }
    // ---------- 🕐 Ortszeit ----------
    async function vTz() {
        await loadFriends();
        const d = await api('kit_tz_list');
        const rows = d.list.length ? '<table class="nx-list"><tbody>' + d.list.map(x => '<tr><td>' + dot(x.state) + ' <b>' + esc(x.name) + '</b><div class="vx-small">' + esc(x.tz) + '</div></td><td style="font-size:1.3rem">' + esc(x.time) + (x.night ? ' 🌙' : '') + '</td>'
            + '<td class="vx-small">' + esc(x.weekday) + ' · ' + (x.diff_h === 0 ? esc(T('wie hier')) : (x.diff_h > 0 ? '+' : '') + x.diff_h + ' h') + '</td><td style="text-align:right"><button type="button" class="nc-x" data-k="tz_del" data-id="' + esc(x.uid) + '" title="' + esc(T('Entfernen')) + '">✕</button></td></tr>').join('') + '</tbody></table>'
            : '<p class="small muted">' + esc(T('Noch keine Zeitzonen eingetragen.')) + '</p>';
        set(card('🕐 ' + esc(T('Ortszeit von Freunden')), '<p class="small muted">' + esc(T('Trag ein, wo deine Freunde wohnen – dann siehst du, wie spät es dort gerade ist. 🌙 = dort ist Nacht.')) + '</p>'
            + '<div class="nc-row">' + pick('kFr') + '<input type="text" id="kTz" list="kTzL" placeholder="Europe/Berlin" style="width:180px"><datalist id="kTzL">' + d.zones.map(z => '<option value="' + esc(z) + '">').join('') + '</datalist>'
            + btn('tz_set', '💾 ' + esc(T('Speichern')), 'btn-gold') + '</div>') + card('🌍 ' + esc(T('Jetzt bei deinen Freunden')), rows, true));
        if (!timer) timer = setInterval(() => { if (view === 'tz' && !box.contains(document.activeElement)) draw(); }, 30000);
    }
    // ---------- 📝 Notizblock ----------
    function noteHtml(n) {
        const body = n.text.split('\n').map((l, i) => { const m = /^\s*[-*] \[([ xX])\]\s?(.*)$/.exec(l);
            return m ? '<label class="check small kit-box' + (m[1] !== ' ' ? ' done' : '') + '"><input type="checkbox" data-k="nt_box" data-id="' + esc(n.id) + '" data-line="' + i + '"' + (m[1] !== ' ' ? ' checked' : '') + '> ' + esc(m[2]) + '</label>' : '<div class="small">' + (esc(l) || '&nbsp;') + '</div>'; }).join('');
        return '<div class="nc-card kit-note' + (n.color ? ' kit-' + n.color : '') + '"><div class="nc-row"><h4 style="flex:1">' + (n.pin ? '📌 ' : '') + esc(n.title || T('Notiz')) + '</h4>'
            + (n.todo ? '<span class="small muted">' + n.done + '/' + n.todo + ' ✔</span>' : '') + btn('nt_edit', '✎', '', ' data-id="' + esc(n.id) + '" title="' + esc(T('Bearbeiten')) + '"') + btn('nt_del', '🗑', '', ' data-id="' + esc(n.id) + '" title="' + esc(T('Löschen')) + '"') + '</div>' + body + '</div>';
    }
    async function vNotes() {
        const d = await api('kit_notes', { q });
        const e = editNote || {};
        set(card('📝 ' + esc(editNote && editNote.id ? T('Notiz bearbeiten') : T('Neue Notiz')), '<input type="text" id="kNT" maxlength="80" value="' + esc(e.title || '') + '" placeholder="' + esc(T('Titel')) + '">'
            + '<textarea id="kNX" rows="5" maxlength="10000" placeholder="' + esc(T('Text … Kästchen: eine Zeile mit „- [ ] “ beginnen')) + '">' + esc(e.text || '') + '</textarea>'
            + '<div class="nc-row"><select id="kNC" aria-label="' + esc(T('Farbe')) + '">' + COLORS.map(([k, l]) => '<option value="' + k + '"' + ((e.color || '') === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
            + '<label class="check small"><input type="checkbox" id="kNP"' + (e.pin ? ' checked' : '') + '> 📌 ' + esc(T('anheften')) + '</label>' + btn('nt_box_add', '☐ ' + esc(T('Kästchen'))) + '<span style="flex:1"></span>'
            + (editNote ? btn('nt_new', esc(T('Abbrechen'))) : '') + btn('nt_save', '💾 ' + esc(T('Speichern')), 'btn-gold') + '</div>')
            + '<div class="nc-card"><div class="nc-row"><input type="search" id="kNQ" value="' + esc(q) + '" placeholder="' + esc(T('Notizen durchsuchen …')) + '" style="flex:1"><span class="small muted">' + d.notes.length + ' ' + esc(T('Notizen')) + '</span></div></div>'
            + d.notes.map(noteHtml).join(''));
    }
    // ---------- 📆 Kalender ----------
    async function vCalendar() {
        const d = await api('kit_calendar');
        const mon = m => new Date(2024, m - 1, 1).toLocaleDateString(loc(), { month: 'short' });
        set(card('📆 ' + esc(T('Geburtstage & Freundschaftstage')), '<p class="small muted">' + esc(T('Geburtstage kommen aus deinen Notizen zu Freunden („Geburtstag 24.12.“ oder „🎂 24.12.“), Freundschaftstage aus dem Datum, seit dem ihr befreundet seid.')) + '</p>'
            + '<div class="nc-row"><a class="btn btn-sm btn-gold" href="nexus.php?kit_ics=1" download="vrc-nexus-geburtstage.ics">⬇ ' + esc(T('Als Kalender (ICS)')) + '</a><span class="small muted">' + esc(T('jährlich wiederkehrend – in Google, Outlook oder Apple Kalender importieren')) + '</span></div>')
            + card('🎂 ' + d.events.length + ' ' + esc(T('Einträge')), d.events.length ? d.events.map(x => '<div class="nc-mrow"><span style="width:64px">' + x.day + '. ' + esc(mon(x.month)) + '</span><b>' + (x.kind === 'birthday' ? '🎂 ' : '💛 ') + esc(x.name) + '</b>'
                + '<span class="small muted">' + esc(x.kind === 'birthday' ? T('Geburtstag') : T('Freunde seit') + ' ' + x.year) + '</span></div>').join('') : '<p class="small muted">' + esc(T('Noch keine Einträge.')) + '</p>', true));
    }
    // ---------- ⏳ Spielzeit-Budget ----------
    const bar = (p, label) => '<div class="kit-bar' + (p >= 100 ? ' full' : p >= 80 ? ' warn' : '') + '"><i style="width:' + Math.min(100, p) + '%"></i><span>' + esc(label) + '</span></div>';
    async function vBudget() {
        const d = await api('kit_budget'), c = d.cfg;
        const src = { log: T('aus dem Spiel-Log'), feed: T('aus deinem Online-Verlauf'), none: T('noch keine Daten') }[d.src];
        set(card('⏳ ' + esc(T('Spielzeit-Budget')), '<label class="check"><input type="checkbox" data-kc="on"' + (c.on ? ' checked' : '') + '> ' + esc(T('Hinweis, wenn das Budget fast oder ganz erreicht ist')) + '</label>'
            + '<div class="nc-row"><span class="small">' + esc(T('pro Tag (min)')) + '</span><input type="number" min="0" max="1440" step="15" value="' + c.day_min + '" data-kc="day_min" style="width:90px">'
            + '<span class="small">' + esc(T('pro Woche (min)')) + '</span><input type="number" min="0" max="10080" step="30" value="' + c.week_min + '" data-kc="week_min" style="width:100px">'
            + '<span class="small">' + esc(T('Vorwarnung bei')) + '</span><select data-kc="warn_pct">' + [70, 80, 90].map(p => '<option value="' + p + '"' + (c.warn_pct === p ? ' selected' : '') + '>' + p + ' %</option>').join('') + '</select></div>'
            + '<p class="small muted">' + esc(T('0 = ohne Grenze. Kein Sperren, nur ein freundlicher Hinweis.')) + '</p>')
            + card('📊 ' + esc(T('Heute & diese Woche')), (c.day_min ? bar(d.day_pct, T('Heute') + ': ' + hm(d.today) + ' / ' + hm(c.day_min)) : '<p>' + esc(T('Heute')) + ': <b>' + esc(hm(d.today)) + '</b></p>')
                + (c.week_min ? bar(d.week_pct, T('Woche') + ': ' + hm(d.week) + ' / ' + hm(c.week_min)) : '<p>' + esc(T('Woche')) + ': <b>' + esc(hm(d.week)) + '</b></p>') + '<p class="small muted">' + esc(T('Quelle')) + ': ' + esc(src) + '</p>'));
    }
    // ---------- 🚦 VRChat-Serverstatus ----------
    async function vVrcStatus(force) {
        let d;
        try { d = await api('kit_vrcstatus', { force: force ? '1' : '' }); } catch (e) { set(card('🚦 ' + esc(T('VRChat-Serverstatus')), '<p class="bad">⚠ ' + esc(e.message) + '</p>' + btn('vs_reload', '⟳ ' + esc(T('Erneut versuchen'))))); return; }
        const ic = { none: '🟢', minor: '🟡', major: '🟠', critical: '🔴', maintenance: '🔧' }[d.indicator] || '⚪';
        const comp = s => ({ operational: '🟢', degraded_performance: '🟡', partial_outage: '🟠', major_outage: '🔴', under_maintenance: '🔧' }[s] || '⚪');
        set(card('🚦 ' + esc(T('VRChat-Serverstatus')), '<p style="font-size:1.2rem">' + ic + ' ' + esc(d.text || '') + '</p>'
            + '<div class="nc-row">' + btn('vs_reload', '⟳ ' + esc(T('Neu laden'))) + '<label class="check small"><input type="checkbox" data-k="vs_notify"' + (d.cfg.notify ? ' checked' : '') + '> ' + esc(T('Hinweis bei neuen Störungen')) + '</label></div>'
            + '<p class="small muted">' + esc(T('Quelle')) + ': status.vrchat.com</p>')
            + card('🧩 ' + esc(T('Dienste')), d.components.map(x => '<div class="nc-mrow"><span>' + comp(x.status) + '</span><b>' + esc(x.name) + '</b></div>').join('') || '<p class="small muted">–</p>')
            + card('📰 ' + esc(T('Aktuelle Meldungen')), d.incidents.length ? d.incidents.map(i => '<div class="nc-mrow"><b>' + esc(i.name) + '</b><span class="small muted">' + esc(i.status) + '</span>'
                + (i.link ? '<a class="nc-link" href="' + esc(i.link) + '" target="_blank" rel="noopener">↗</a>' : '') + '</div>').join('') : '<p class="small muted">' + esc(T('Keine Störungen gemeldet.')) + '</p>', true));
    }
    // ---------- 💬 Kontakt-Pflege ----------
    async function vCare() {
        await loadFriends();
        const d = await api('kit_care');
        const ago = s => (s ? new Date(s * 1000).toLocaleDateString(loc(), { day: '2-digit', month: '2-digit', year: '2-digit' }) : T('noch nie'));
        const rows = d.list.length ? d.list.map(x => '<div class="nc-mrow' + (x.due ? '' : ' off') + '">' + dot(x.state) + '<b>' + esc(x.name) + '</b><span class="small">' + (x.due ? '⏰ ' + esc(T('fällig')) : esc(T('in')) + ' ' + x.due_in + ' ' + esc(T('Tagen'))) + '</span>'
            + '<span class="small muted">' + esc(T('zuletzt')) + ' ' + esc(ago(x.last)) + (x.via === 'game' ? ' 🎮' : '') + ' · ' + esc(T('alle')) + ' ' + x.days + ' ' + esc(T('Tage')) + '</span>'
            + btn('cr_done', '✔', '', ' data-id="' + esc(x.uid) + '" title="' + esc(T('Kontakt gehabt')) + '"') + '<button type="button" class="nc-x" data-k="cr_del" data-id="' + esc(x.uid) + '" title="' + esc(T('Entfernen')) + '">✕</button></div>').join('')
            : '<p class="small muted">' + esc(T('Noch niemand in der Kontakt-Pflege.')) + '</p>';
        set(card('💬 ' + esc(T('Kontakt-Pflege')), '<p class="small muted">' + esc(T('Für Menschen, die dir wichtig sind: Nexus erinnert dich einmal am Tag, wenn ihr euch länger nicht gesehen habt (Spiel-Log) oder du keinen Kontakt vermerkt hast.')) + '</p>'
            + '<div class="nc-row">' + pick('kFr') + '<select id="kDays">' + [7, 14, 30, 60, 90].map(n => '<option value="' + n + '"' + (n === 14 ? ' selected' : '') + '>' + esc(T('alle')) + ' ' + n + ' ' + esc(T('Tage')) + '</option>').join('') + '</select>'
            + btn('cr_add', '＋ ' + esc(T('Hinzufügen')), 'btn-gold') + '</div>') + card('📋 ' + d.list.filter(x => x.due).length + ' ' + esc(T('fällig')), rows, true));
    }

    const after = d => { if (d && d.msg) toast(d.msg); draw(); };
    function onClick(e) {
        const b = e.target.closest('[data-k]'); if (!b || !box.contains(b)) return;
        const k = b.dataset.k, id = b.dataset.id;
        if (b.tagName === 'INPUT' && b.type === 'checkbox' && k !== 'nt_box') return;   // Schalter laufen über „change“
        if (k === 'st_tpl') { const i = box.querySelector('#kDesc'); if (i) i.value = T(b.dataset.v); return; }
        if (k === 'st_start') return api('kit_status_start', { status: field('kStatus'), desc: field('kDesc'), minutes: field('kMin'), until: field('kUntil') }).then(after).catch(fail);
        if (k === 'st_restore') return api('kit_status_cancel', { restore: '1' }).then(after).catch(fail);
        if (k === 'st_cancel') return api('kit_status_cancel', {}).then(after).catch(fail);
        if (k === 'rm_add') return api('kit_remind_add', { uid: resolve('kFr'), name: field('kFr'), text: field('kTxt'), now: box.querySelector('#kNow').checked ? '1' : '' }).then(after).catch(fail);
        if (k === 'rm_del') return api('kit_remind_del', { id }).then(after).catch(fail);
        if (k === 'tz_set') return api('kit_tz_set', { uid: resolve('kFr'), tz: field('kTz') }).then(after).catch(fail);
        if (k === 'tz_del') return api('kit_tz_set', { uid: id, tz: '' }).then(after).catch(fail);
        if (k === 'nt_box') return api('kit_note_toggle', { id, line: b.dataset.line, q }).then(after).catch(fail);
        if (k === 'nt_box_add') { const t = box.querySelector('#kNX'); if (t) { t.value += (t.value && !t.value.endsWith('\n') ? '\n' : '') + '- [ ] '; t.focus(); } return; }
        if (k === 'nt_new') { editNote = null; return draw(); }
        if (k === 'nt_edit') return api('kit_notes', { q: '' }).then(d => { editNote = d.notes.find(n => n.id === id) || null; draw(); box.scrollTop = 0; }).catch(fail);
        if (k === 'nt_del') { if (confirm(T('Notiz löschen?'))) api('kit_note_del', { id, q }).then(after).catch(fail); return; }
        if (k === 'nt_save') return api('kit_note_save', { id: editNote ? editNote.id : '', title: field('kNT'), text: field('kNX'), color: field('kNC'), pin: box.querySelector('#kNP').checked ? '1' : '0' }).then(d => { editNote = null; after(d); }).catch(fail);
        if (k === 'vs_reload') return vVrcStatus(true);
        if (k === 'cr_add') return api('kit_care_set', { uid: resolve('kFr'), days: field('kDays') }).then(after).catch(fail);
        if (k === 'cr_done') return api('kit_care_done', { uid: id }).then(after).catch(fail);
        if (k === 'cr_del') return api('kit_care_set', { uid: id, days: '0' }).then(after).catch(fail);
    }
    function onChange(e) {
        const el = e.target;
        if (el.id === 'kNQ') { q = el.value; return draw(); }
        if (el.dataset.k === 'vs_notify') return api('kit_vrcstatus_cfg', { notify: el.checked ? '1' : '' }).then(d => toast(d.msg)).catch(fail);
        if (el.dataset.kc) { const v = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value; return api('kit_budget_cfg', { [el.dataset.kc]: v }).then(after).catch(fail); }
    }
    window.NexusKit = { render: go };
})();
