/* VRC Nexus 7.3.4 – 📈 Leistungsmessung (Werkzeuge).
 * Live-Werte aller App-Prozesse mit 10-Minuten-Verlauf, Messung aufnehmen (z. B. eine ganze VR-Sitzung) und auswerten,
 * Bericht zum Kopieren. Daten bleiben auf diesem Gerät (backend/perfmon.js). */
(function () {
    const UI = window.NexusUI;
    const box = document.getElementById('perfBox');
    if (!UI || !box) return;
    const { api, esc } = UI;
    const T = s => (typeof window.t === 'function' ? window.t(s) : s);
    const toast = (m, bad) => UI.toast(m, bad);
    const fail = e => toast('⚠ ' + (e.message || e), true);
    const loc = () => (window.nxLoc ? window.nxLoc() : 'de-DE');
    const PROC = { main: ['🧠', 'Hauptprozess (Backend)'], window: ['🪟', 'Fenster'], gpu: ['🎨', 'Grafik (GPU)'], helper: ['🔧', 'Helfer'] };
    const LV = { ok: 'perf-ok', mid: 'perf-mid', high: 'perf-high' };
    let d = null, timer = null, open = '';

    function spark(vals, max, color) {
        const W = 300, H = 46, n = vals.length;
        if (n < 2) return '<svg class="perf-spark" viewBox="0 0 ' + W + ' ' + H + '"></svg>';
        const m = Math.max(max || 0, ...vals, 1);
        const pts = vals.map((v, i) => (i / (n - 1) * W).toFixed(1) + ',' + (H - 2 - (v || 0) / m * (H - 6)).toFixed(1)).join(' ');
        return '<svg class="perf-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><polyline fill="none" stroke="' + color + '" stroke-width="2" points="' + pts + '"/></svg>';
    }
    const tile = (i, l, v, sub, warn) => '<div class="perf-tile' + (warn ? ' warn' : '') + '"><span>' + i + '</span><b>' + esc(String(v)) + '</b><small>' + esc(T(l)) + (sub ? '<br>' + esc(sub) : '') + '</small></div>';
    const dur = ms => { const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60; return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ':' + String(s).padStart(2, '0') + ' min'; };

    function render() {
        const n = d.now, sys = d.sys, live = d.live;
        const share = sys.mem_mb ? Math.round(n.mem / sys.mem_mb * 1000) / 10 : 0;
        let h = '<div class="nc-card"><h3>📈 ' + esc(T('Leistungsmessung')) + '</h3><p class="vx-small">' + esc(T('Wie viel Arbeitsspeicher und CPU braucht VRC Nexus wirklich – besonders während VR? Miss am besten eine ganze VR-Sitzung und schick uns den Bericht, wenn etwas auffällt.')) + '</p>'
            + (d.electron ? '' : '<p class="nx-hint">' + esc(T('Hier wird nur der App-Prozess gemessen – die vollständige Messung gibt es in der Windows-App.')) + '</p>')
            + '<div class="perf-grid">'
            + tile('🧠', 'VRC Nexus gesamt', n.mem + ' MB', share + ' % ' + T('des RAM'), n.mem > 900)
            + tile('⚙', 'CPU (alle Prozesse)', n.cpu + ' %', '', n.cpu > 25)
            + tile('⏱', 'Verzögerung', n.lag + ' ms', '', n.lag > 200)
            + tile('🥽', 'VR-FPS', n.fps ? n.fps + (n.fps_min ? ' / ' + n.fps_min : '') : '–', n.fps ? T('Schnitt / Tiefstwert') : T('SteamVR-Helfer aus'), false)
            + tile('🎮', 'VRChat', n.vrc_mem ? n.vrc_mem + ' MB' : (n.vrc ? '…' : '–'), n.vrc ? T('zum Vergleich') : T('läuft nicht'), false)
            + tile('🖥', 'System', (n.sys_cpu === null ? '…' : n.sys_cpu + ' %'), Math.round(n.sys_mem / 1024 * 10) / 10 + ' / ' + Math.round(sys.mem_mb / 1024) + ' GB', false)
            + '</div>'
            + '<div class="perf-charts"><div><small>🧠 ' + esc(T('Arbeitsspeicher (10 min)')) + '</small>' + spark(live.map(x => x.mem), 0, '#38d5e6') + '</div>'
            + '<div><small>⚙ ' + esc(T('CPU (10 min)')) + '</small>' + spark(live.map(x => x.cpu), 10, '#f3c262') + '</div></div>'
            + '<table class="perf-procs"><tr><th></th><th>' + esc(T('Arbeitsspeicher')) + '</th><th>CPU</th></tr>'
            + Object.entries(n.procs).map(([k, v]) => '<tr><td>' + (PROC[k] || ['•', k])[0] + ' ' + esc(T((PROC[k] || ['', k])[1])) + (v.n > 1 ? ' ×' + v.n : '') + '</td><td>' + v.mem + ' MB</td><td>' + v.cpu + ' %</td></tr>').join('') + '</table></div>';
        // Aufnahme
        h += '<div class="nc-card"><h3>⏺ ' + esc(T('Messung aufnehmen')) + '</h3>'
            + (d.rec ? '<p><b>' + esc(d.rec.label || T('Messung')) + '</b> · ' + esc(T('läuft seit')) + ' ' + dur(Date.now() - d.rec.start) + ' · ' + d.rec.n + ' ' + esc(T('Messpunkte')) + '</p><button type="button" class="btn btn-gold" data-pf="stop">⏹ ' + esc(T('Messung beenden & auswerten')) + '</button>'
                : '<p class="vx-small">' + esc(T('Starte die Messung, spiele wie immer (am besten mit VR) und beende sie danach. Alle 5 Sekunden ein Messpunkt, höchstens 4 Stunden.')) + '</p>'
                + '<div class="nx-row"><input type="text" id="pfLabel" maxlength="60" placeholder="' + esc(T('z. B. Club-Abend mit Spielzeug')) + '" style="flex:1"><button type="button" class="btn btn-gold" data-pf="start">⏺ ' + esc(T('Messung starten')) + '</button></div>')
            + '</div>';
        // Verlauf
        h += '<div class="nc-card"><h3>📋 ' + esc(T('Letzte Messungen')) + '</h3>' + (d.history.length ? d.history.map(x => {
            const det = open === x.id ? '<div class="perf-det">'
                + '<p>🧠 ' + esc(T('Arbeitsspeicher')) + ': Ø ' + x.mem.avg + ' MB · ' + esc(T('Spitze')) + ' ' + x.mem.max + ' MB · ' + x.mem.share + ' % ' + esc(T('des RAM')) + (x.mem.growth ? ' · ' + esc(T('Zuwachs')) + ' ' + x.mem.growth + ' MB' : '') + '</p>'
                + '<p>⚙ CPU: Ø ' + x.cpu.avg + ' % · 95 %: ' + x.cpu.p95 + ' % · ' + esc(T('Spitze')) + ' ' + x.cpu.max + ' %</p>'
                + '<p>⏱ ' + esc(T('Verzögerung')) + ': Ø ' + x.lag.avg + ' ms · 95 %: ' + x.lag.p95 + ' ms · ' + x.lag.spikes + '× &gt; 100 ms</p>'
                + (x.fps ? '<p>🥽 VR: Ø ' + x.fps.avg + ' FPS · ' + esc(T('5-%-Tief')) + ' ' + x.fps.low + ' FPS · ' + x.vr_share + ' % ' + esc(T('der Zeit in VR')) + '</p>' : '')
                + (x.vrchat_mem ? '<p>🎮 VRChat: Ø ' + x.vrchat_mem + ' MB</p>' : '')
                + '<ul>' + x.verdict.notes.map(k => '<li>' + esc(T(d.texts.note[k] || k)) + '</li>').join('') + '</ul>'
                + '<p class="perf-rust"><b>→ ' + esc(T(d.texts.rust[x.verdict.rust])) + '</b></p>'
                + '<div class="nx-row"><button type="button" class="btn btn-sm" data-pf="copy" data-id="' + esc(x.id) + '">📋 ' + esc(T('Bericht kopieren')) + '</button><button type="button" class="btn btn-sm btn-danger" data-pf="del" data-id="' + esc(x.id) + '">' + esc(T('Löschen')) + '</button></div></div>' : '';
            return '<div class="perf-hist"><button type="button" class="perf-row" data-pf="open" data-id="' + esc(x.id) + '"><span class="perf-lv ' + LV[x.verdict.level] + '">' + esc(T(d.texts.level[x.verdict.level])) + '</span>'
                + '<b>' + esc(x.label || new Date(x.start).toLocaleString(loc())) + '</b><span class="vx-small">' + (x.label ? esc(new Date(x.start).toLocaleString(loc())) + ' · ' : '') + x.minutes + ' min · Ø ' + x.mem.avg + ' MB · Ø ' + x.cpu.avg + ' % CPU' + (x.fps ? ' · 🥽' : '') + '</span></button>' + det + '</div>';
        }).join('') : '<p class="vx-small">' + esc(T('Noch keine Messungen.')) + '</p>') + '</div>';
        box.innerHTML = h;
    }
    function load() {
        clearTimeout(timer);
        return api('perf_state').then(r => { d = r; if (!document.activeElement || document.activeElement.id !== 'pfLabel') render(); })
            .catch(e => { box.innerHTML = '<div class="vx-error">' + esc(e.message) + '</div>'; })
            .finally(() => { if (box.offsetParent !== null) timer = setTimeout(load, 5000); });   // nur solange sichtbar
    }
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-pf]'); if (!b) return;
        const a = b.dataset.pf;
        if (a === 'start') api('perf_start', { label: (document.getElementById('pfLabel') || {}).value || '' }).then(r => { d = r; toast(r.msg); render(); }).catch(fail);
        if (a === 'stop') api('perf_stop').then(r => { d = r; open = r.result.id; toast(r.msg); render(); }).catch(fail);
        if (a === 'open') { open = open === b.dataset.id ? '' : b.dataset.id; render(); }
        if (a === 'copy') api('perf_report', { id: b.dataset.id }).then(r => navigator.clipboard.writeText(r.text)).then(() => toast(T('Kopiert.'))).catch(fail);
        if (a === 'del' && confirm(T('Messung löschen?'))) api('perf_delete', { id: b.dataset.id }).then(r => { d = r; open = ''; render(); }).catch(fail);
    });
    window.NexusPerf = { open: load };
})();
