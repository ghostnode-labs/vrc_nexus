/* VRC Nexus 8.0 – 📔 Tages-Tagebuch und 🌿 VR-Pausen-Coach (Werkzeuge).
 * Monatskalender mit aktiven Tagen, Tagesansicht (Welten, Begegnungen, Fotos, Puls, VR-Pausen) mit eigener Notiz und Stimmung,
 * Export als Text; Coach-Einstellungen mit heutiger Statistik. Alles bleibt auf diesem Gerät. */
(function () {
    const UI = window.NexusUI;
    const box = document.getElementById('diaryBox');
    if (!UI || !box) return;
    const { api, esc } = UI;
    const T = s => (typeof window.t === 'function' ? window.t(s) : s);
    const toast = (m, bad) => UI.toast(m, bad);
    const fail = e => toast('⚠ ' + (e.message || e), true);
    const loc = () => (window.nxLoc ? window.nxLoc() : 'de-DE');
    let sub = 'day', month = '', day = '', cur = null, mon = null, coach = null;
    const hm = m => (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min');

    function shell(inner) {
        box.innerHTML = '<div class="nx-row" style="margin-bottom:10px">' + [['day', '📔 ' + T('Tagebuch')], ['coach', '🌿 ' + T('Pausen-Coach')]]
            .map(([k, l]) => '<button type="button" class="btn btn-sm' + (sub === k ? ' btn-gold' : '') + '" data-dsub="' + k + '">' + esc(l) + '</button>').join('') + '</div>' + inner;
    }
    function calendar() {
        const first = new Date(mon.month + '-01T12:00:00'), lead = (first.getDay() + 6) % 7;
        const wd = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc(), { weekday: 'short' }));
        let cells = wd.map(w => '<div class="dy-wd">' + esc(w) + '</div>').join('') + '<div></div>'.repeat(lead);
        for (const x of mon.days) {
            const act = x.worlds + x.people + x.photos, lvl = act === 0 ? 0 : act < 10 ? 1 : act < 40 ? 2 : 3;
            cells += '<button type="button" class="dy-cell dy-l' + lvl + (x.day === day ? ' on' : '') + (x.day === mon.today ? ' today' : '') + '" data-day="' + x.day + '" title="' + esc(x.worlds + ' 🌐 · ' + x.people + ' 👥 · ' + x.photos + ' 📸') + '">'
                + '<b>' + Number(x.day.slice(8)) + '</b><span>' + (x.mood || '') + (x.star ? '⭐' : '') + (x.note ? '✎' : '') + '</span></button>';
        }
        const title = first.toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
        return '<div class="nc-card"><div class="nx-row"><button type="button" class="btn btn-sm" data-mon="-1">◀</button><h3 style="flex:1;text-align:center;margin:0">' + esc(title) + '</h3><button type="button" class="btn btn-sm" data-mon="1">▶</button></div>'
            + '<div class="dy-grid">' + cells + '</div></div>';
    }
    function dayView() {
        const d = cur, a = d.auto;
        const date = new Date(d.day + 'T12:00:00').toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        let h = '<div class="nc-card"><div class="nx-row"><h3 style="flex:1;margin:0">' + esc(date) + '</h3><button type="button" class="btn btn-sm" data-dcopy>📋 ' + esc(T('Als Text kopieren')) + '</button></div>'
            + '<div class="perf-grid" style="margin-top:8px">'
            + '<div class="perf-tile"><span>⏱</span><b>' + esc(hm(a.play_min)) + '</b><small>' + esc(T('Spielzeit')) + '</small></div>'
            + '<div class="perf-tile"><span>🌐</span><b>' + a.worlds.length + '</b><small>' + esc(T('Welten')) + '</small></div>'
            + '<div class="perf-tile"><span>👥</span><b>' + a.people_total + '</b><small>' + esc(T('Begegnungen')) + '</small></div>'
            + '<div class="perf-tile"><span>📸</span><b>' + a.photos + '</b><small>' + esc(T('Fotos')) + '</small></div>'
            + '<div class="perf-tile"><span>❤</span><b>' + (d.hr ? d.hr.avg : '–') + '</b><small>' + esc(d.hr ? 'Ø bpm · ' + d.hr.min + '–' + d.hr.max : T('kein Puls')) + '</small></div>'
            + '<div class="perf-tile"><span>🥽</span><b>' + (d.vr.min ? esc(hm(d.vr.min)) : '–') + '</b><small>' + esc(d.vr.min ? d.vr.breaks + ' ' + T('Pausen') + ' · ' + T('längste') + ' ' + d.vr.longest + ' min' : T('VR (Pausen-Coach)')) + '</small></div></div></div>';
        h += '<div class="nc-card"><h3>✎ ' + esc(T('Meine Notiz')) + '</h3><div class="nx-row dy-moods">' + d.moods.map(m => '<button type="button" class="chip' + (d.mood === m ? ' on' : '') + '" data-mood="' + m + '">' + m + '</button>').join('')
            + '<label class="check small" style="margin-left:auto"><input type="checkbox" id="dyStar"' + (d.star ? ' checked' : '') + '> ⭐ ' + esc(T('besonderer Tag')) + '</label></div>'
            + '<textarea id="dyNote" rows="4" maxlength="5000" placeholder="' + esc(T('Was war heute schön, lustig oder wichtig?')) + '" style="width:100%">' + esc(d.note) + '</textarea>'
            + '<div class="nx-row"><span class="vx-small" style="flex:1">' + esc(T('Nur auf diesem Gerät gespeichert.')) + '</span><button type="button" class="btn btn-sm btn-gold" data-dsave>💾 ' + esc(T('Speichern')) + '</button></div></div>';
        if (a.worlds.length) h += '<div class="nc-card"><h3>🌐 ' + esc(T('Welten')) + '</h3>' + a.worlds.map(w => '<div class="nx-row"><span style="flex:1">' + esc(w.name) + (w.visits > 1 ? ' <span class="vx-small">×' + w.visits + '</span>' : '') + '</span><span class="vx-small">' + esc(hm(w.min)) + '</span></div>').join('') + '</div>';
        if (a.people.length) h += '<div class="nc-card"><h3>👥 ' + esc(T('Begegnungen')) + ' (' + a.people_total + ')</h3><div class="dy-people">' + a.people.map(p => '<span class="chip"' + (p.id ? ' data-user="' + esc(p.id) + '"' : '') + '>' + esc(p.name) + '</span>').join('') + '</div></div>';
        if (a.photo_files.length) h += '<div class="nc-card"><h3>📸 ' + esc(T('Fotos')) + '</h3>' + a.photo_files.map(f => '<div class="vx-small">' + esc(String(f).split(/[\\/]/).pop()) + '</div>').join('') + '</div>';
        if (!a.events && !d.note) h += '<p class="vx-small">' + esc(T('An diesem Tag gibt es keine Einträge im Spiel-Log.')) + '</p>';
        return h;
    }
    function coachView() {
        const c = coach.cfg, t = coach.today || { min: 0, breaks: 0, longest: 0 };
        const cb = (k, l) => '<label class="check small"><input type="checkbox" data-cc="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + esc(T(l)) + '</label>';
        const num = (k, l, a, b) => '<label class="small">' + esc(T(l)) + ' <input type="number" data-cc="' + k + '" value="' + c[k] + '" min="' + a + '" max="' + b + '" style="width:70px"> min</label>';
        return '<div class="nc-card"><h3>🌿 ' + esc(T('VR-Pausen-Coach')) + '</h3><p class="vx-small">' + esc(T('Freundliche Erinnerungen während VR – auch auf der Nexus Watch, nie in der Chatbox. Im Schlafmodus und im Event-Modus bleibt der Coach still. Eine echte Pause (Headset ab) setzt den Zähler zurück.')) + '</p>'
            + '<div class="perf-grid"><div class="perf-tile"><span>🥽</span><b>' + (coach.vr ? esc(hm(coach.minutes)) : '–') + '</b><small>' + esc(coach.vr ? T('am Stück') : T('gerade nicht in VR')) + '</small></div>'
            + '<div class="perf-tile"><span>⏳</span><b>' + (coach.next_break === null ? '–' : coach.next_break + ' min') + '</b><small>' + esc(T('bis zur nächsten Pause')) + '</small></div>'
            + '<div class="perf-tile"><span>📅</span><b>' + esc(hm(t.min)) + '</b><small>' + esc(T('VR heute')) + '</small></div>'
            + '<div class="perf-tile"><span>🌿</span><b>' + t.breaks + '</b><small>' + esc(T('Pausen heute')) + ' · ' + esc(T('längste Strecke')) + ' ' + t.longest + ' min</small></div></div>'
            + '<div class="nx-row" style="margin-top:8px">' + cb('on', 'Coach an') + '<select data-cc="source"><option value="auto"' + (c.source === 'auto' ? ' selected' : '') + '>' + esc(T('VR automatisch erkennen')) + '</option><option value="fps"' + (c.source === 'fps' ? ' selected' : '') + '>' + esc(T('nur mit SteamVR-Helfer')) + '</option><option value="game"' + (c.source === 'game' ? ' selected' : '') + '>' + esc(T('immer, wenn VRChat läuft')) + '</option></select></div>'
            + '<div class="nx-row">' + num('break_min', 'Pause nach', 15, 240) + num('snooze_min', '„Später“ =', 5, 60) + num('rest_min', 'Als Pause zählt ab', 2, 30) + '</div>'
            + '<div class="nx-row">' + cb('drink', 'Trink-Erinnerung') + num('drink_min', 'alle', 15, 180) + cb('eyes', 'Augen-Tipp 20-20-20') + num('eyes_min', 'alle', 10, 60) + '</div>'
            + '<div class="nx-row"><button type="button" class="btn btn-sm btn-gold" data-csave>💾 ' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm" data-cbreak>🌿 ' + esc(T('Ich habe gerade Pause gemacht')) + '</button></div></div>';
    }
    function render() {
        if (sub === 'coach') { shell(coach ? coachView() : '<div class="vx-loading">…</div>'); return; }
        shell((mon ? calendar() : '') + (cur ? dayView() : '<div class="vx-loading">…</div>'));
    }
    function loadDay(dd) { return api('diary_day', { day: dd }).then(r => { cur = r; day = r.day; render(); }).catch(fail); }
    function loadMonth(m) { return api('diary_month', { month: m }).then(r => { mon = r; month = r.month; render(); }).catch(fail); }
    function open() {
        if (sub === 'coach') return api('coach_status').then(r => { coach = r; render(); }).catch(fail);
        return Promise.all([loadMonth(month), loadDay(day || '')]);
    }
    box.addEventListener('click', e => {
        const b = e.target.closest('button, [data-user]'); if (!b) return;
        if (b.dataset.dsub) { sub = b.dataset.dsub; render(); open(); return; }
        if (b.dataset.mon) { const d = new Date(month + '-15T12:00:00'); d.setMonth(d.getMonth() + Number(b.dataset.mon)); loadMonth(d.toISOString().slice(0, 7)); return; }
        if (b.dataset.day) { loadDay(b.dataset.day); return; }
        if (b.dataset.mood) { cur.mood = cur.mood === b.dataset.mood ? '' : b.dataset.mood; cur.note = (document.getElementById('dyNote') || {}).value || cur.note; cur.star = !!(document.getElementById('dyStar') || {}).checked; render(); return; }
        if (b.hasAttribute('data-dsave')) { api('diary_save', { day: cur.day, note: document.getElementById('dyNote').value, mood: cur.mood, star: document.getElementById('dyStar').checked ? '1' : '' }).then(r => { cur = r; toast(r.msg); loadMonth(month); }).catch(fail); return; }
        if (b.hasAttribute('data-dcopy')) { api('diary_text', { day: cur.day }).then(r => navigator.clipboard.writeText(r.text)).then(() => toast(T('Kopiert.'))).catch(fail); return; }
        if (b.dataset.user && UI.openUser) { UI.openUser(b.dataset.user); return; }
        if (b.hasAttribute('data-csave')) {
            const data = {}; box.querySelectorAll('[data-cc]').forEach(el => { data[el.dataset.cc] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value; });
            api('coach_cfg', data).then(r => { coach = r; toast(r.msg); render(); }).catch(fail); return;
        }
        if (b.hasAttribute('data-cbreak')) { api('coach_break').then(r => { coach = r; toast(r.msg); render(); }).catch(fail); }
    });
    window.NexusDiary = { open };
})();
