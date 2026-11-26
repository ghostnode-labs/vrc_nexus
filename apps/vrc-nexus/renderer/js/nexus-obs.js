/* VRC Nexus – 🎥 OBS (5.0): Szene je Welt, Panik-Szene, Textquelle mit Puls/Welt (obs-websocket 5). */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, b) => UI.toast(m, b), T = s => (window.t ? window.t(s) : s);
    let box = null, d = null;
    const sceneOpts = (v, none) => '<option value="">' + esc(T(none)) + '</option>' + (d.scenes || []).map(s => '<option' + (s === v ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + (v && !(d.scenes || []).includes(v) ? '<option selected>' + esc(v) + '</option>' : '');
    function render() {
        if (!box || !d) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input')) return;
        const c = d.cfg;
        box.innerHTML = '<div class="nc-card"><h4>🎥 OBS Studio</h4>'
            + '<p class="small muted">' + esc(T('In OBS: Werkzeuge → WebSocket-Server-Einstellungen → Server aktivieren (Port 4455) und ein Passwort setzen.')) + '</p>'
            + '<label class="check"><input type="checkbox" data-ob="on"' + (c.on ? ' checked' : '') + '> ' + esc(T('Mit OBS verbinden')) + '</label>'
            + '<div class="cf-grid"><label class="small cf-txt"><span>' + esc(T('Rechner')) + '</span><input type="text" data-ob="host" value="' + esc(c.host) + '"></label>'
            + '<label class="small cf-num">' + esc(T('Port')) + ' <input type="number" data-ob="port" value="' + c.port + '"></label>'
            + '<label class="small cf-txt"><span>' + esc(T('Passwort')) + '</span><input type="password" data-ob="password" placeholder="' + esc(d.has_password ? '•••••• ' + T('gespeichert') : T('aus OBS kopieren')) + '"></label></div>'
            + '<p>' + (d.connected ? '🟢 ' + esc(T('verbunden')) + ' · ' + (d.scenes || []).length + ' ' + esc(T('Szenen')) : '⚪ ' + esc(T('nicht verbunden')) + (d.error ? ' – <span class="bad">' + esc(T(d.error)) + '</span>' : '')) + ' <button type="button" class="btn btn-sm" data-oba="connect">↻ ' + esc(T('Verbinden')) + '</button></p></div>'
            + '<div class="nc-card"><h4>🌐 ' + esc(T('Szene je Welt')) + '</h4><p class="small muted">' + esc(T('Teil des Weltnamens → Szene. „*“ passt auf jede Welt.')) + '</p><table class="ob-rules">'
            + c.rules.map((r, i) => '<tr><td><input type="text" data-rule="' + i + '" data-f="match" value="' + esc(r.match) + '"></td><td><select data-rule="' + i + '" data-f="scene">' + sceneOpts(r.scene, '– Szene –') + '</select></td><td><button type="button" class="btn btn-sm" data-delrule="' + i + '">✕</button></td></tr>').join('')
            + '</table><button type="button" class="btn btn-sm" data-oba="addrule">＋ ' + esc(T('Regel')) + '</button></div>'
            + '<div class="nc-card"><h4>🚨 ' + esc(T('Panik-Szene')) + '</h4><select data-ob="panic_scene">' + sceneOpts(c.panic_scene, '– keine –') + '</select><p class="small muted">' + esc(T('Beim Panik-Knopf wechselt OBS sofort auf diese Szene.')) + '</p></div>'
            + '<div class="nc-card"><h4>📝 ' + esc(T('Textquelle')) + '</h4><div class="cf-grid"><label class="small cf-txt"><span>' + esc(T('Name der Textquelle in OBS')) + '</span><input type="text" data-ob="text_source" value="' + esc(c.text_source) + '"></label>'
            + '<label class="small cf-txt"><span>' + esc(T('Text')) + '</span><input type="text" data-ob="text_tpl" value="' + esc(c.text_tpl) + '"></label>'
            + '<label class="small cf-num">' + esc(T('alle Sekunden')) + ' <input type="number" data-ob="text_every" min="2" max="60" value="' + c.text_every + '"></label></div>'
            + '<p class="small muted">' + esc(T('Platzhalter wie in der Chatbox: {puls}, {welt}, {spieler}, {zeit} … Im Privat-Modus wird nichts gesendet.')) + ' <button type="button" class="btn btn-sm" data-oba="text">' + esc(T('Jetzt senden')) + '</button></p></div>';
    }
    const load = () => api('obs_get').then(r => { d = r; render(); }).catch(e => toast('⚠ ' + e.message, true));
    const save = data => api('obs_cfg', data).then(r => { d = r; toast(T(r.msg)); render(); }).catch(x => toast('⚠ ' + x.message, true));
    const rules = () => [...box.querySelectorAll('.ob-rules tr')].map(tr => ({ match: tr.querySelector('[data-f=match]').value, scene: tr.querySelector('[data-f=scene]').value }));
    function bind() {
        box.addEventListener('change', e => {
            const el = e.target;
            if (el.closest('[data-rule]')) return save({ rules: JSON.stringify(rules()) });
            const k = el.dataset && el.dataset.ob; if (!k) return;
            save({ [k]: el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value });
        });
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-oba]'), dr = e.target.closest('[data-delrule]');
            if (dr) { const r = rules(); r.splice(+dr.dataset.delrule, 1); return save({ rules: JSON.stringify(r) }); }
            if (!b) return;
            if (b.dataset.oba === 'addrule') { d.cfg.rules.push({ match: '', scene: '' }); return render(); }
            if (b.dataset.oba === 'connect') return api('obs_connect').then(r => { d = r; render(); toast(r.connected ? '🟢 OBS' : '⚠ ' + T(r.error || 'nicht verbunden'), !r.connected); }).catch(x => toast('⚠ ' + x.message, true));
            if (b.dataset.oba === 'text') return api('obs_text').then(r => { d = r; toast(T(r.msg)); }).catch(x => toast('⚠ ' + x.message, true));
        });
    }
    window.NexusObs = { open(el) { if (!el) return; if (box !== el) { box = el; bind(); } load(); } };
})();
