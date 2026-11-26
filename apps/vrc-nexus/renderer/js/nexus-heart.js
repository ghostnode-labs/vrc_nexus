/* VRC Nexus – 💓 Puls (Spiel & OSC → Puls): eine Quelle für die ganze App – Pulsoid, HypeRate oder OSC/Smartwatch.
 * Auch die Kurve für die Startseite (NexusHeart.spark). */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = (a, d) => UI.api(a, d), toast = (m, bad) => UI.toast(m, bad);
    const SRC = [['off', '⏸ Aus', 'Kein Puls'], ['pulsoid', '💗 Pulsoid', 'Brustgurt oder Uhr über die Pulsoid-App'], ['hyperate', '💜 HypeRate', 'Uhr oder Gurt über HypeRate'], ['osc', '⌚ OSC / Smartwatch', 'App schickt den Puls schon an VRChat'], ['watch', '⌚ VRC Nexus Watch', 'Wear-OS-Uhr im Heimnetz (z. B. Galaxy Watch)']];
    let w = null;   // 5.2: Uhr-Kopplung
    let box = null, d = null, timer = null;

    /** kleine Kurve: hist = [[sekunden_vor_jetzt (≤0), bpm], …] */
    function spark(hist, w, h) {
        w = w || 260; h = h || 54;
        if (!hist || hist.length < 2) return '<div class="hr-spark empty muted small">' + esc(window.t ? t('Noch keine Kurve') : 'Noch keine Kurve') + '</div>';
        const span = Math.max(20, -hist[0][0]), vs = hist.map(x => x[1]), lo = Math.min(...vs) - 5, hi = Math.max(...vs) + 5;
        const pt = ([s, v]) => ((span + s) / span * w).toFixed(1) + ',' + (h - (v - lo) / (hi - lo) * h).toFixed(1);
        const line = hist.map(pt).join(' ');
        return '<svg class="hr-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + line + '" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
    }

    function render() {
        if (box.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox])')) return;   // nicht beim Tippen neu zeichnen
        const c = d.cfg, s = d.stats, inp = (n, v, ph, type, w) => '<input type="' + (type || 'text') + '" name="' + n + '" value="' + esc(v == null ? '' : v) + '"' + (ph ? ' placeholder="' + esc(t(ph)) + '"' : '') + (w ? ' style="width:' + w + '"' : ' style="flex:1"') + ' autocomplete="off">';
        const row = (label, html) => '<div class="nc-row"><span class="small">' + esc(t(label)) + '</span>' + html + '</div>';
        let src = '';
        if (c.source === 'pulsoid') src = '<form data-f="pulsoid">' + row('Pulsoid-Token', inp('token', '', d.has_pulsoid ? '•••••• gespeichert – neu eingeben zum Ändern' : 'Token von pulsoid.net → Integrationen', 'password') + '<button class="btn btn-sm">' + esc(t('Speichern')) + '</button>') + '</form>';
        if (c.source === 'hyperate') src = '<form data-f="hyperate">' + row('HypeRate-Device-ID', inp('hyperate_id', c.hyperate_id, 'z. B. a1b2c3 – steht in der HypeRate-App auf Uhr/Handy') + '<button class="btn btn-sm">' + esc(t('Speichern')) + '</button>') + '</form>'
            + '<p class="muted small">' + esc(t('HypeRate-App auf der Uhr (z. B. Samsung Galaxy Watch) öffnen, Messung starten und die angezeigte Device-ID hier eintragen. Die Verbindung läuft über den Server von VRC Nexus – du brauchst keinen eigenen API-Schlüssel.')) + '</p>'
            + '<details class="small"><summary>' + esc(t('Eigener API-Schlüssel (nur für Entwickler)')) + '</summary><form data-f="hrkey">' + row('HypeRate-API-Schlüssel', inp('token', '', d.has_hyperate ? '•••••• gespeichert – leer speichern zum Entfernen' : 'leer lassen = über VRC Nexus', 'password') + '<button class="btn btn-sm">' + esc(t('Speichern')) + '</button>') + '</form></details>';
        if (c.source === 'osc') src = '<form data-f="oscin">' + row('Eingehende Parameter', inp('osc_in', c.osc_in) + '<button class="btn btn-sm">' + esc(t('Speichern')) + '</button>') + '</form>'
            + '<p class="small muted">' + esc(t('Für Smartwatch-Apps, die den Puls schon als Avatar-Parameter an VRChat schicken. Groß/Klein und Sonderzeichen sind egal; Float 0…1 wird als 0…255 gelesen.')) + '</p>';
        box.innerHTML = '<div class="nc-grid">'
            // Live
            + '<div class="nc-card"><h4>💓 ' + esc(t('Live')) + '</h4>'
            + '<div class="hr-live' + (d.active ? ' on' : '') + '"><span class="hr-heart">💓</span><b>' + (d.active ? d.bpm : '–') + '</b><small>bpm</small></div>'
            + spark(d.hist)
            + '<div class="vx-kpis sm"><div><b>' + (s.min || '–') + '</b><span>' + esc(t('Minimum')) + '</span></div><div><b>' + (s.avg || '–') + '</b><span>' + esc(t('Durchschnitt')) + '</span></div><div><b>' + (s.max || '–') + '</b><span>' + esc(t('Maximum')) + '</span></div></div>'
            + '<p class="small muted">' + esc(t('letzte 10 Minuten')) + '</p>'
            + (d.error && c.source !== 'off' ? '<p class="small bad">⚠ ' + esc(t(d.error)) + '</p>' : '') + '</div>'
            // Quelle
            + '<div class="nc-card"><h4>📡 ' + esc(t('Quelle')) + '</h4>'
            + '<div class="tts-prov">' + SRC.map(([k, l, sub]) => '<button type="button" data-src="' + k + '" class="' + (c.source === k ? 'on' : '') + '"><b>' + esc(t(l)) + '</b><small>' + esc(t(sub)) + '</small></button>').join('') + '</div>'
            + src + '</div>'
            // Avatar
            + (c.source !== 'off' && c.source !== 'osc' ? '<form class="nc-card" data-f="out"><h4>🎭 ' + esc(t('An den Avatar senden')) + '</h4>'
                + '<label class="check"><input type="checkbox" name="send_osc"' + (c.send_osc ? ' checked' : '') + '> ' + esc(t('Avatar-Parameter senden')) + '</label>'
                + row('Eigener Name', inp('param', c.param, '', 'text', '180px'))
                + row('Bereich (bpm)', inp('min', c.min, '', 'number', '80px') + '–' + inp('max', c.max, '', 'number', '80px'))
                + '<div class="nc-row"><button class="btn btn-sm btn-gold">' + esc(t('Speichern')) + '</button></div>'
                + '<p class="small muted">' + esc(t('Gesendet werden HR, HRPercent, isHRActive, isHRConnected, onesHR, tensHR, hundredsHR und der eigene Name (Int + Float) – passt zu gängigen Puls-Anzeigen auf Avataren.')) + '</p></form>' : '')
            // 5.2: VRC Nexus Watch
            + (w ? '<div class="nc-card"><h4>⌚ ' + esc(t('VRC Nexus Watch')) + '</h4>'
                + '<label class="check"><input type="checkbox" data-wcfg="on"' + (w.cfg.on ? ' checked' : '') + '> ' + esc(t('Uhr-Verbindung im Heimnetz erlauben')) + '</label>'
                + (w.cfg.on ? '<div class="hr-pin"><span class="small">' + esc(t('Kopplungscode')) + '</span><b>' + esc(w.pin.slice(0, 3) + ' ' + w.pin.slice(3)) + '</b><button type="button" class="btn btn-sm" data-wnew title="' + esc(t('Neuer Code')) + '">↻</button></div>'
                    + '<p class="small muted">' + esc(t('In der Uhr-App „Koppeln“ tippen und den Code eingeben – die Uhr findet den PC von selbst. Sonst Adresse eintragen:')) + ' <code>' + esc((w.addresses[0] || '?') + ':' + w.cfg.port) + '</code></p>'
                    + (w.error ? '<p class="small bad">⚠ ' + esc(t(w.error)) + '</p>' : '') : '<p class="small muted">' + esc(t('Puls vom Uhr-Sensor, Panik-Knopf, Consent-Ampel, Spielzeug-Stopp und Schlafmodus direkt am Handgelenk. Die App gibt es bei den Downloads (VRC-Nexus-Watch-…apk).')) + '</p>')
                + (w.devices.length ? '<ul class="hr-watches">' + w.devices.map(x => '<li>⌚ <b>' + esc(x.name) + '</b> <span class="small muted">' + (x.last ? esc(t('zuletzt')) + ' ' + new Date(x.last).toLocaleTimeString(window.nxLoc ? nxLoc() : 'de-DE', { hour: '2-digit', minute: '2-digit' }) : esc(t('noch nicht verbunden'))) + '</span> <button type="button" class="btn btn-sm" data-wdel="' + esc(x.id) + '">✕</button></li>').join('') + '</ul>' : '')
                + '</div>' : '')
            // Nutzen
            + '<div class="nc-card"><h4>🧩 ' + esc(t('Verwenden')) + '</h4>'
            + '<p class="small">' + esc(t('Platzhalter für Chatbox, Rotator, Makros und Stream Deck:')) + '</p><div class="nc-row"><code>{puls}</code><code>{puls_min}</code><code>{puls_max}</code><code>{puls_schnitt}</code></div>'
            + '<div class="tts-help">' + esc(t('SteamVR-HUD: „puls“ unter Einstellungen → VR → Infos.')) + '</div></div>'
            + '</div>';
    }
    function load(refresh) { api('watch_get').then(r => { w = r; }).catch(() => { w = null; }); return api('hr_get', refresh ? { refresh: '1' } : {}).then(r => { d = r; if (box) render(); }).catch(e => { if (box) box.innerHTML = '<div class="vx-error">⚠ ' + esc(e.message) + '</div>'; }); }
    const save = data => api('hr_save', data).then(r => { d = r; render(); if (r.msg) toast(r.msg); }).catch(e => toast('⚠ ' + e.message, true));

    function bind() {
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-src]'); if (b) return save({ source: b.dataset.src });
            if (e.target.closest('[data-wnew]')) return api('watch_newpin').then(r => { w = r; render(); }).catch(er => toast('⚠ ' + er.message, true));
            const x = e.target.closest('[data-wdel]');
            if (x && confirm(t('Diese Uhr entfernen? Sie muss danach neu gekoppelt werden.'))) api('watch_remove', { id: x.dataset.wdel }).then(r => { w = r; render(); toast(r.msg); }).catch(er => toast('⚠ ' + er.message, true));
        });
        box.addEventListener('change', e => { const c = e.target.closest('[data-wcfg]'); if (c) api('watch_cfg', { on: c.checked ? '1' : '0' }).then(r => { w = r; render(); }).catch(er => toast('⚠ ' + er.message, true)); });
        box.addEventListener('submit', e => {
            e.preventDefault();
            const f = e.target, k = f.dataset.f;
            if (k === 'pulsoid' || k === 'hrkey') return api(k === 'pulsoid' ? 'hr_pulsoid_key' : 'hr_hyperate_key', { token: f.token.value }).then(r => { toast(r.msg); d = r; render(); }).catch(er => toast('⚠ ' + er.message, true));
            if (k === 'hyperate') return save({ hyperate_id: f.hyperate_id.value });
            if (k === 'oscin') return save({ osc_in: f.osc_in.value });
            if (k === 'out') return save({ send_osc: f.send_osc.checked ? '1' : '0', param: f.param.value, min: f.min.value, max: f.max.value });
        });
    }
    window.NexusHeart = {
        spark,
        open(el) {
            if (box !== el) { box = el; bind(); }
            if (!d) box.innerHTML = '<div class="muted">' + esc(t('Lade …')) + '</div>';
            load(true);
            clearInterval(timer);
            timer = setInterval(() => { if (!document.hidden && box.offsetParent && !box.contains(document.activeElement)) load(); else if (!box.offsetParent) clearInterval(timer); }, 2000);
        },
    };
})();
