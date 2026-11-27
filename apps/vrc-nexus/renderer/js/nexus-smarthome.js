/* VRC Nexus 8.0.1 – 💡 Smart-Home und 🔋 Energie-Modus (Werkzeuge).
 * Smart-Home: Ziele (Home Assistant, WLED, Webhook), Regeln (Welt, Puls, Panik, Schlafmodus), Welt-Farben, Test.
 * Energie-Modus: aus / bei Akku / immer, Drosselfaktor, weniger Animationen – die Klasse „nx-eco“ am <body> wird jede Minute abgeglichen. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const { api, esc } = UI;
    const T = s => (typeof window.t === 'function' ? window.t(s) : s);
    const toast = (m, bad) => UI.toast(m, bad);
    const fail = e => toast('⚠ ' + (e.message || e), true);
    // Energie-Modus: Animationen sparen (läuft immer, auch ohne geöffnetes Werkzeug)
    const eco = () => api('energy_status').then(s => document.body.classList.toggle('nx-eco', !!(s.active && s.cfg.ui_eco))).catch(() => {});
    setTimeout(eco, 4000); setInterval(eco, 60000);

    const box = document.getElementById('smarthomeBox');
    if (!box) return;
    let H = null, E = null, edit = null;
    const KIND = { ha: '🏠 Home Assistant', wled: '💡 WLED', hook: '🔗 Webhook' };
    const cb = (grp, k, on, l) => '<label class="check small"><input type="checkbox" data-' + grp + '="' + k + '"' + (on ? ' checked' : '') + '> ' + esc(T(l)) + '</label>';

    function energyCard() {
        const c = E.cfg;
        return '<div class="nc-card"><h3>🔋 ' + esc(T('Energie-Modus')) + '</h3><p class="vx-small">' + esc(T('Für Laptops und Akku: Hintergrund-Aufgaben ohne Sicherheitsbezug laufen seltener, die Oberfläche spart Animationen. Spielzeug, Panik, Safeword, Puls und OSC-Empfang werden nie gedrosselt.')) + '</p>'
            + '<p><b>' + (E.active ? '🔋 ' + esc(T('aktiv')) : '⚡ ' + esc(T('aus'))) + '</b> · ' + esc(E.supported ? (E.battery ? T('Akkubetrieb') : T('am Netzteil')) : T('Akkustatus unbekannt')) + (E.skipped ? ' · ' + E.skipped + ' ' + esc(T('Takte gespart')) : '') + '</p>'
            + '<div class="nx-row">' + [['off', 'Aus'], ['auto', 'Automatisch bei Akku'], ['on', 'Immer an']].map(([k, l]) => '<label class="check small"><input type="radio" name="enMode" value="' + k + '"' + (c.mode === k ? ' checked' : '') + '> ' + esc(T(l)) + '</label>').join('') + '</div>'
            + '<div class="nx-row"><label class="small">' + esc(T('Hintergrund seltener um Faktor')) + ' <select id="enFactor">' + [2, 3, 4, 6].map(f => '<option' + (c.factor === f ? ' selected' : '') + '>' + f + '</option>').join('') + '</select></label>'
            + cb('en', 'ui_eco', c.ui_eco, 'weniger Animationen') + '<button type="button" class="btn btn-sm btn-gold" data-sh="ensave">💾 ' + esc(T('Speichern')) + '</button></div></div>';
    }
    function homeCard() {
        const c = H.cfg;
        let h = '<div class="nc-card"><h3>💡 ' + esc(T('Smart-Home')) + '</h3><p class="vx-small">' + esc(T('Licht reagiert auf deine Welt, deinen Puls, die Panik-Taste und den Schlafmodus. Unterstützt Home Assistant, WLED und eigene Webhooks – alles direkt im Heimnetz, ohne Cloud-Konto. Zugangs-Tokens werden verschlüsselt gespeichert.')) + '</p>'
            + '<div class="nx-row">' + cb('hc', 'on', c.on, 'Smart-Home an') + cb('hc', 'world', c.world, '🌐 Farbe je Welt') + cb('hc', 'heart', c.heart, '❤ Puls-Farbe') + cb('hc', 'panic', c.panic, '🚨 Panik-Licht') + cb('hc', 'sleep', c.sleep, '😴 Schlafmodus dimmt') + '</div>'
            + '<div class="nx-row"><label class="small">❤ ' + esc(T('blau bis')) + ' <input type="number" data-hc="hr_low" value="' + c.hr_low + '" style="width:64px"></label><label class="small">' + esc(T('rot ab')) + ' <input type="number" data-hc="hr_high" value="' + c.hr_high + '" style="width:64px"> bpm</label>'
            + '<label class="small">🚨 <input type="color" data-hc="panic_color" value="' + esc(c.panic_color) + '"> <input type="number" data-hc="panic_bri" value="' + c.panic_bri + '" min="0" max="100" style="width:56px"> %</label>'
            + '<label class="small">😴 <input type="number" data-hc="sleep_bri" value="' + c.sleep_bri + '" min="0" max="100" style="width:56px"> %</label>'
            + '<button type="button" class="btn btn-sm btn-gold" data-sh="hsave">💾 ' + esc(T('Speichern')) + '</button></div></div>';
        h += '<div class="nc-card"><h3>🎯 ' + esc(T('Ziele')) + '</h3>' + (H.targets.length ? H.targets.map(t => '<div class="nx-row"><b style="flex:1">' + esc(KIND[t.kind]) + ' · ' + esc(t.name) + '</b><span class="vx-small">' + esc(t.url) + (t.entity ? ' · ' + esc(t.entity) : '') + (t.on ? '' : ' · ' + esc(T('aus'))) + '</span>'
            + '<button type="button" class="btn btn-sm" data-sh="test" data-id="' + esc(t.id) + '">💡 ' + esc(T('Test')) + '</button><button type="button" class="btn btn-sm" data-sh="edit" data-id="' + esc(t.id) + '">✏</button><button type="button" class="btn btn-sm btn-danger" data-sh="del" data-id="' + esc(t.id) + '">✕</button></div>').join('') : '<p class="vx-small">' + esc(T('Noch kein Ziel.')) + '</p>');
        if (edit) h += '<div class="nx5-form"><div class="nx-row"><select id="shKind">' + Object.entries(KIND).map(([k, l]) => '<option value="' + k + '"' + (edit.kind === k ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select><input id="shName" placeholder="' + esc(T('Name')) + '" value="' + esc(edit.name || '') + '" maxlength="40"></div>'
            + '<input id="shUrl" placeholder="' + esc(edit.kind === 'wled' ? 'http://192.168.1.50' : edit.kind === 'ha' ? 'http://homeassistant.local:8123' : 'https://…') + '" value="' + esc(edit.url || '') + '">'
            + (edit.kind === 'ha' ? '<input id="shEntity" placeholder="light.wohnzimmer" value="' + esc(edit.entity || '') + '"><input id="shToken" type="password" autocomplete="off" placeholder="' + esc(edit.has_token ? T('Token gespeichert – leer lassen zum Behalten') : T('Langzeit-Zugangs-Token')) + '">' : '')
            + '<div class="nx-row"><button type="button" class="btn btn-sm btn-gold" data-sh="tsave">💾 ' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm" data-sh="tcancel">' + esc(T('Abbrechen')) + '</button></div></div>';
        else h += '<button type="button" class="btn btn-sm btn-gold" data-sh="new">＋ ' + esc(T('Ziel hinzufügen')) + '</button>';
        h += '</div>';
        const map = Object.entries(c.map || {});
        h += '<div class="nc-card"><h3>🌐 ' + esc(T('Welt-Farben')) + '</h3><p class="vx-small">' + esc(T('Ohne eigene Farbe bekommt jede Welt automatisch eine feste Farbe aus ihrem Namen.')) + '</p>'
            + map.map(([w, col]) => '<div class="nx-row"><span class="sh-dot" style="background:' + esc(col) + '"></span><span style="flex:1">' + esc(w) + '</span><button type="button" class="btn btn-sm" data-sh="unmap" data-w="' + esc(w) + '">✕</button></div>').join('')
            + '<div class="nx-row"><input id="shWorld" placeholder="' + esc(T('Weltname')) + '" style="flex:1"><input type="color" id="shColor" value="#38d5e6"><button type="button" class="btn btn-sm" data-sh="map">＋</button></div></div>';
        if (H.log.length) h += '<div class="nc-card"><h3>📓 ' + esc(T('Protokoll')) + '</h3>' + H.log.map(l => '<div class="vx-small">' + new Date(l.t).toLocaleTimeString() + ' – ' + esc(l.m) + '</div>').join('') + '</div>';
        return h;
    }
    function render() { box.innerHTML = (E ? energyCard() : '') + (H ? homeCard() : ''); }
    function open() { return Promise.all([api('energy_status').then(r => { E = r; }), api('shome_status').then(r => { H = r; })]).then(render).catch(fail); }
    const v = id => (document.getElementById(id) || {}).value || '';
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-sh]'); if (!b) return;
        const a = b.dataset.sh, st = r => { H = r; if (r.msg) toast(r.msg); render(); };
        if (a === 'ensave') { const m = box.querySelector('input[name=enMode]:checked'); api('energy_cfg', { mode: m ? m.value : 'auto', factor: v('enFactor'), ui_eco: box.querySelector('[data-en=ui_eco]').checked ? '1' : '' }).then(r => { E = r; toast(r.msg); render(); eco(); }).catch(fail); }
        if (a === 'hsave') { const d = {}; box.querySelectorAll('[data-hc]').forEach(el => { d[el.dataset.hc] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value; }); api('shome_cfg', d).then(st).catch(fail); }
        if (a === 'new') { edit = { kind: 'wled' }; render(); }
        if (a === 'edit') { edit = Object.assign({}, H.targets.find(t => t.id === b.dataset.id)); render(); }
        if (a === 'tcancel') { edit = null; render(); }
        if (a === 'tsave') api('shome_target_save', { id: edit.id || '', kind: v('shKind'), name: v('shName'), url: v('shUrl'), entity: v('shEntity'), token: v('shToken') }).then(r => { edit = null; st(r); }).catch(fail);
        if (a === 'del' && confirm(T('Ziel entfernen?'))) api('shome_target_del', { id: b.dataset.id }).then(st).catch(fail);
        if (a === 'test') api('shome_test', { id: b.dataset.id, color: '#38d5e6' }).then(st).catch(fail);
        if (a === 'map') api('shome_map', { world: v('shWorld'), color: v('shColor') }).then(st).catch(fail);
        if (a === 'unmap') api('shome_map', { world: b.dataset.w, color: '' }).then(st).catch(fail);
    });
    box.addEventListener('change', e => { if (e.target.id === 'shKind' && edit) { edit.kind = e.target.value; edit.name = v('shName'); edit.url = v('shUrl'); render(); } });
    window.NexusSmartHome = { open };
})();
