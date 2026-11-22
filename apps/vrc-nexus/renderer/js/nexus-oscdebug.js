/* VRC Nexus – 🐞 Avatar-Debugger (Spiel & OSC): alle Avatar-Parameter live, true grün / false rot, frisch geänderte leuchten kurz auf.
 * Zum Prüfen, ob OSC ankommt und wie SPS-/OGB-Parameter heißen (für die Spielzeug-Verknüpfungen). */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api;
    let box = null, timer = null, q = '', only = 'all', paused = false, last = null;
    function val(v) {
        if (v === true) return '<b class="od-t">true</b>';
        if (v === false) return '<b class="od-f">false</b>';
        return '<b class="od-n">' + esc(typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v) + '</b>';
    }
    function render(d) {
        if (!box) return;
        last = d;
        const now = Date.now(), names = Object.keys(d.params).sort((a, b) => a.localeCompare(b));
        const sps = n => /^(OGB|VFH|pcs)\//i.test(n) || /(Pen|Touch|Frot|Depth)(Self|Others)$/i.test(n);
        const list = names.filter(n => (!q || n.toLowerCase().includes(q)) && (only === 'all' || (only === 'sps' && sps(n)) || (only === 'recent' && now - (d.changed[n] || 0) < 10000)));
        const head = box.querySelector('.od-head .od-info');
        if (head) head.innerHTML = (d.active ? '<span class="nc-badge ok">OSC aktiv</span>' : '<span class="nc-badge">⚠ nichts von VRChat</span>') + (d.error ? ' <span class="bad small">' + esc(d.error) + '</span>' : '')
            + ' <span class="muted small">' + names.length + ' Parameter' + (d.avatar ? ' · ' + esc(d.avatar) : '') + (names.some(sps) ? ' · ' + names.filter(sps).length + ' SPS/PCS' : '') + (d.hidden ? ' · 🔒 ' + d.hidden + ' ' + (window.t ? window.t('intime Parameter ausgeblendet (NSFW gesperrt oder Privat-Modus)') : 'intime Parameter ausgeblendet (NSFW gesperrt oder Privat-Modus)') : '') + '</span>';
        const el = box.querySelector('.od-list');
        if (el) el.innerHTML = list.length ? list.map(n => '<div class="od-p' + (now - (d.changed[n] || 0) < 1500 ? ' hot' : '') + (sps(n) ? ' sps' : '') + '" title="' + esc(n) + '">' + esc(n) + '=' + val(d.params[n]) + '</div>').join('')
            : '<div class="muted small">' + (names.length ? 'Kein Treffer.' : 'Noch keine Parameter – in VRChat OSC einschalten (Action-Menü → Optionen → OSC) und Avatar wechseln/neu laden.') + '</div>';
    }
    function tick() {
        clearTimeout(timer);
        if (!box || box.closest('[hidden]') || document.hidden) return;
        if (paused) { timer = setTimeout(tick, 500); return; }
        api('client_debug').then(render).catch(() => {}).finally(() => { timer = setTimeout(tick, 400); });
    }
    function open(el) {
        box = el;
        if (!box.dataset.bound) {
            box.dataset.bound = '1';
            box.innerHTML = '<div class="od-head"><input type="search" class="od-q" placeholder="Parameter suchen …"><select class="od-only"><option value="all">alle</option><option value="sps">nur SPS / OGB</option><option value="recent">zuletzt geändert (10 s)</option></select>'
                + '<button type="button" class="btn btn-sm od-pause">⏸ Anhalten</button><button type="button" class="btn btn-sm od-copy">⧉ Als JSON kopieren</button><span class="od-info"></span></div><div class="od-list"></div>';
            box.querySelector('.od-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); if (last) render(last); });
            box.querySelector('.od-only').addEventListener('change', e => { only = e.target.value; if (last) render(last); });
            box.querySelector('.od-pause').addEventListener('click', e => { paused = !paused; e.target.textContent = paused ? '▶ Weiter' : '⏸ Anhalten'; });
            box.querySelector('.od-copy').addEventListener('click', () => { if (last) UI.copy(JSON.stringify(last.params, null, 2)); });
        }
        tick();
    }
    window.NexusOscDebug = { open };
})();
