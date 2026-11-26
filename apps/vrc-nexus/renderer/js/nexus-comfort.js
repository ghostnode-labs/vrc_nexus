/* VRC Nexus – 🌙 Komfort (5.0): Schlafmodus mit Wecker, Pausen-Hinweise, Puls-Warnungen. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, b) => UI.toast(m, b), T = s => (window.t ? window.t(s) : s);
    let box = null, d = null, timer = null;
    const chk = (k, on, label) => '<label class="check small"><input type="checkbox" data-cf="' + k + '"' + (on ? ' checked' : '') + '> ' + esc(T(label)) + '</label>';
    const num = (k, v, min, max, label) => '<label class="small cf-num">' + esc(T(label)) + ' <input type="number" data-cf="' + k + '" min="' + min + '" max="' + max + '" value="' + v + '"></label>';
    const txt = (k, v, max, label) => '<label class="small cf-txt"><span>' + esc(T(label)) + '</span><input type="text" data-cf="' + k + '" maxlength="' + max + '" value="' + esc(v) + '"></label>';
    function render() {
        if (!box || !d) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input[type=text], input[type=number]')) return;
        const c = d.cfg;
        box.innerHTML = '<div class="nc-card"><h4>💤 ' + esc(T('Schlafmodus')) + '</h4>'
            + (d.sleeping ? '<p>💤 ' + esc(T('Aktiv seit')) + ' ' + new Date(d.sleep_since).toLocaleTimeString(window.nxLoc ? nxLoc() : 'de-DE', { hour: '2-digit', minute: '2-digit' })
                + (d.wake_at ? ' · ⏰ ' + new Date(d.wake_at).toLocaleTimeString(window.nxLoc ? nxLoc() : 'de-DE', { hour: '2-digit', minute: '2-digit' }) : '') + '</p><button type="button" class="btn btn-gold" data-cfa="wake">☀️ ' + esc(T('Aufwachen')) + '</button>'
                : '<div class="nc-row"><button type="button" class="btn btn-gold" data-cfa="sleep">💤 ' + esc(T('Schlafen gehen')) + '</button><select id="cfWake"><option value="0">' + esc(T('ohne Wecker')) + '</option>'
                + [30, 60, 120, 240, 360, 480, 540].map(m => '<option value="' + m + '">⏰ ' + (m < 60 ? m + ' min' : m / 60 + ' h') + '</option>').join('') + '</select></div>')
            + '<div class="cf-grid"><label class="small">' + esc(T('Status')) + ' <select data-cf="sleep_status">' + [['ask me', '🟠 Ask Me'], ['busy', '🔴 Busy'], ['active', '🟢 Online'], ['join me', '🔵 Join Me']].map(([v, l]) => '<option value="' + v + '"' + (c.sleep_status === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>'
            + txt('sleep_desc', c.sleep_desc, 32, 'Status-Text') + txt('sleep_text', c.sleep_text, 140, 'Chatbox-Text') + txt('sleep_param', c.sleep_param, 64, 'Avatar-Parameter (an/aus, optional)') + '</div>'
            + chk('sleep_chatbox', c.sleep_chatbox, 'Chatbox-Text zeigen und Rotation pausieren') + chk('sleep_toys', c.sleep_toys, 'Spielzeug stoppen') + '</div>'
            + '<div class="nc-card"><h4>🌿 ' + esc(T('Pausen-Hinweise')) + '</h4>' + chk('break_on', c.break_on, 'Nach längerer Spielzeit an eine Pause erinnern')
            + '<div class="cf-grid">' + num('break_min', c.break_min, 15, 600, 'nach Minuten') + txt('break_text', c.break_text, 200, 'Text') + '</div>'
            + '<p class="small muted">' + (d.playing_min ? '🎮 ' + d.playing_min + ' min ' + esc(T('am Stück')) + (d.next_break_min !== null ? ' · ' + esc(T('nächster Hinweis in')) + ' ' + d.next_break_min + ' min' : '') : esc(T('VRChat läuft gerade nicht.'))) + ' <button type="button" class="btn btn-sm" data-cfa="breakreset">↺</button></p></div>'
            + '<div class="nc-card"><h4>❤️ ' + esc(T('Puls-Warnungen')) + '</h4>' + chk('hr_on', c.hr_on, 'Warnen, wenn der Puls länger zu hoch oder zu niedrig ist')
            + '<div class="cf-grid">' + num('hr_high', c.hr_high, 80, 230, 'zu hoch ab (bpm)') + num('hr_low', c.hr_low, 25, 90, 'zu niedrig unter (bpm)') + num('hr_secs', c.hr_secs, 10, 600, 'für Sekunden') + num('hr_cooldown', c.hr_cooldown, 1, 120, 'höchstens alle Minuten') + '</div>'
            + '<p class="small muted">' + esc(T('Quelle ist der Puls unter 💓 Puls. Keine medizinische Überwachung.')) + '</p></div>';
    }
    const load = () => api('comfort_get').then(r => { d = r; render(); }).catch(e => toast('⚠ ' + e.message, true));
    function bind() {
        box.addEventListener('change', e => {
            const el = e.target.closest('[data-cf]'); if (!el) return;
            api('comfort_cfg', { [el.dataset.cf]: el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value }).then(r => { d = r; toast(T(r.msg)); render(); }).catch(x => toast('⚠ ' + x.message, true));
        });
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-cfa]'); if (!b) return;
            const a = b.dataset.cfa;
            const p = a === 'sleep' ? api('comfort_sleep', { on: '1', wake: (box.querySelector('#cfWake') || {}).value || '0' }) : a === 'wake' ? api('comfort_sleep', { on: '0' }) : api('comfort_break_reset');
            p.then(r => { d = r; if (r.msg) toast(T(r.msg)); render(); }).catch(x => toast('⚠ ' + x.message, true));
        });
    }
    window.NexusComfort = {
        open(el) {
            if (!el) return;
            if (box !== el) { box = el; bind(); }
            load(); clearInterval(timer);
            timer = setInterval(() => { if (!box || box.closest('[hidden]') || document.hidden) return clearInterval(timer); load(); }, 30000);
        },
    };
})();
