/* VRC Nexus 4.1 – ❤️ NSFW-Erweiterung: Geräte-Details (Buttplug: Aktoren, Rotation, Stroker, Sensoren, Akku …),
 * „🔥 Lust & PCS“ (PCS-Anbindung, Lust-Meter, Höhepunkt, Edging, Puls, Stimme, Consent-Ampel, Szene, Aftercare),
 * eigene Muster und Szenen-Ideen. Wird von nexus-nsfw.js eingebunden (gleiches Muster wie nexus-toylinks.js). */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    const sec = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '"><h4>' + t + '</h4>' + html + '</div>';
    const sw = (k, on, label, extra) => '<label class="check small"><input type="checkbox" data-n2="' + k + '"' + (on ? ' checked' : '') + (extra || '') + '> ' + label + '</label>';
    const num = (k, v, lo, hi, step, w) => '<input type="number" data-n2="' + k + '" value="' + v + '" min="' + lo + '" max="' + hi + '" step="' + (step || 1) + '" style="width:' + (w || 70) + 'px">';
    const rng = (k, v, lo, hi, step, unit) => '<span class="n2-rng"><input type="range" data-n2="' + k + '" value="' + v + '" min="' + lo + '" max="' + hi + '" step="' + (step || 1) + '"><b>' + v + (unit || '') + '</b></span>';
    const devSel = (k, cur, devs) => '<select data-n2="' + k + '"><option value="all">' + esc(T('alle Geräte')) + '</option>' + devs.map(d => '<option value="' + d.index + '"' + (String(cur) === String(d.index) ? ' selected' : '') + '>' + esc(d.label || d.name) + '</option>').join('') + '</select>';
    const bar = (v, cls) => '<div class="ns-bar ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i></div>';
    const TYPE_ICON = { Vibrate: '〰 Vibration', Oscillate: '↔ Oszillation', Rotate: '🔄 Rotation', Constrict: '🫸 Enge', Inflate: '🎈 Aufpumpen', Position: '📍 Position' };
    const SCENE = {
        ort: ['im Club nach Feierabend', 'in einer Onsen-Welt', 'im Hotelzimmer', 'auf dem Dach bei Nacht', 'im Wald am Lagerfeuer', 'auf einer Raumstation', 'in der Bibliothek', 'im Fotostudio'],
        rolle: ['Fremde, die sich zum ersten Mal treffen', 'Chef·in und neue·r Mitarbeiter·in', 'zwei Rivalen', 'Bodyguard und VIP', 'Barkeeper·in und Gast', 'Fotograf·in und Model', 'Vampir·in und Opfer', 'Lehrer·in für einen Tanzkurs'],
        stimmung: ['langsam & neckend', 'verspielt', 'leidenschaftlich', 'dominant / devot', 'romantisch', 'heimlich – niemand darf es merken', 'wettbewerbsorientiert'],
        twist: ['Wer zuerst lacht, verliert.', 'Nur flüstern erlaubt.', 'Einer gibt das Tempo vor, der andere darf nicht anfassen.', 'Alle 5 Minuten wird gewechselt.', 'Die Ampel entscheidet alles.', 'Der Zufall (🎁) steuert das Spielzeug.'],
    };
    const AFTER = ['💧 Wasser trinken', '🫂 Kuscheln / Nähe', '💬 Nachfragen: Wie war es für dich?', '🍫 Snack', '🧘 Kurz durchatmen', '📝 Grenzen für nächstes Mal besprechen'];
    let check = null, checking = false;
    let scene = null, mic = null, micT = null, devOpen = {}, after = {}, patEd = null, lastT = null;
    const pick = a => a[Math.floor(Math.random() * a.length)];
    // 6.2: Szenen-Baukasten – gespeicherte Abläufe (Muster/Pause, Stärke, Tempo, Dauer, Runden, Steigerung)
    let built = null, builtLoading = false, sEd = null, reRender = null;
    const newStep = pause => pause ? { pause: true, seconds: 20 } : { pattern: 'welle', strength: 50, speed: 1, seconds: 60 };
    function loadBuilt() {
        if (builtLoading) return; builtLoading = true;
        api('toys_scenes').then(d => { built = d; }).catch(() => { built = { scenes: [], patterns: [], running: null }; }).finally(() => { builtLoading = false; if (reRender) reRender(); });
    }
    const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    function builderHtml(t) {
        if (!built) { loadBuilt(); return '<p class="muted small">' + esc(T('Lade …')) + '</p>'; }
        const pats = built.patterns.length ? built.patterns : ((t && t.patterns) || []), pname = id => ((pats.find(x => x.id === id) || {}).name || id);
        let h = '';
        if (!sEd) {
            h += built.scenes.length ? built.scenes.map(x => '<div class="nc-mrow"><b>' + esc(x.name) + '</b><span class="muted small">' + x.steps.length + ' ' + esc(T('Schritte')) + ' · ' + x.rounds + '× · ' + (x.ramp ? '+' + x.ramp + ' %/' + esc(T('Runde')) + ' · ' : '') + Math.round(x.total / 60) + ' min</span>'
                + '<button type="button" class="btn btn-sm btn-gold" data-n2a="bplay" data-id="' + esc(x.id) + '">▶</button><button type="button" class="nc-link" data-n2a="bedit" data-id="' + esc(x.id) + '">' + esc(T('bearbeiten')) + '</button>'
                + '<button type="button" class="nc-link" data-n2a="bshare" data-id="' + esc(x.id) + '">📤 ' + esc(T('Teilen')) + '</button><button type="button" class="nc-x" data-n2a="bdel" data-id="' + esc(x.id) + '">✕</button></div>').join('') : '<p class="muted small">' + esc(T('Noch keine eigenen Szenen.')) + '</p>';
            return h + '<button type="button" class="btn btn-sm" data-n2a="bnew">＋ ' + esc(T('Neue Szene bauen')) + '</button>';
        }
        const total = sEd.steps.reduce((a, x) => a + (+x.seconds || 0), 0) * (+sEd.rounds || 1);
        h += '<div class="n2-build"><div class="nc-row"><input type="text" data-se="name" maxlength="40" value="' + esc(sEd.name) + '" placeholder="' + esc(T('Name der Szene')) + '" style="flex:1">'
            + '<label class="small">' + esc(T('Runden')) + ' <input type="number" data-se="rounds" value="' + sEd.rounds + '" min="1" max="10" style="width:56px"></label>'
            + '<label class="small">' + esc(T('Steigerung')) + ' <input type="number" data-se="ramp" value="' + sEd.ramp + '" min="0" max="30" style="width:56px"> %</label></div>'
            + sEd.steps.map((x, i) => '<div class="nc-row n2-bstep" data-si="' + i + '"><b class="small">' + (i + 1) + '.</b>'
                + (x.pause ? '<span class="small" style="flex:1">⏸ ' + esc(T('Pause')) + '</span>'
                    : '<select data-ss="pattern" style="flex:1">' + pats.map(p => '<option value="' + esc(p.id) + '"' + (p.id === x.pattern ? ' selected' : '') + '>' + esc(T(p.name)) + '</option>').join('') + '</select>'
                    + '<label class="small">💪 <input type="number" data-ss="strength" value="' + x.strength + '" min="5" max="100" style="width:56px"> %</label>'
                    + '<label class="small">⚡ <input type="number" data-ss="speed" value="' + x.speed + '" min="0.25" max="3" step="0.25" style="width:60px">×</label>')
                + '<label class="small">⏱ <input type="number" data-ss="seconds" value="' + x.seconds + '" min="5" max="600" style="width:64px"> s</label>'
                + '<button type="button" class="nc-link" data-n2a="bup" data-i="' + i + '"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="nc-x" data-n2a="bsdel" data-i="' + i + '">✕</button></div>').join('')
            + '<div class="nc-row"><button type="button" class="btn btn-sm" data-n2a="badd">＋ ' + esc(T('Muster')) + '</button><button type="button" class="btn btn-sm" data-n2a="baddp">＋ ⏸ ' + esc(T('Pause')) + '</button>'
            + '<span class="muted small" style="flex:1">≈ ' + mmss(total) + ' min</span>'
            + '<button type="button" class="btn btn-sm btn-gold" data-n2a="bsave">💾 ' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm" data-n2a="bcancel">' + esc(T('Abbrechen')) + '</button></div>'
            + '<p class="muted small">' + esc(T('Steigerung: jede Runde wird um so viel Prozent stärker (höchstens 100 %). Rot auf der Ampel, ⏹ oder Panik beenden sofort.')) + '</p></div>';
        return h;
    }
    function builderClick(a, b, toysDo, render) {
        reRender = render;
        const done = d => { if (d.msg) toast(d.msg); if (d.scenes) built.scenes = d.scenes; if (d.running !== undefined) built.running = d.running; render(); };
        const fail = x => toast(x.message, true);
        if (a === 'bnew') { sEd = { id: '', name: '', rounds: 1, ramp: 0, steps: [newStep(), newStep(true), Object.assign(newStep(), { strength: 70 })] }; render(); return true; }
        if (a === 'bedit') { const x = built.scenes.find(y => y.id === b.dataset.id); if (x) sEd = JSON.parse(JSON.stringify(x)); render(); return true; }
        if (a === 'bcancel') { sEd = null; render(); return true; }
        if (a === 'badd' || a === 'baddp') { if (sEd.steps.length >= 30) { toast(T('Höchstens 30 Schritte.'), true); return true; } sEd.steps.push(newStep(a === 'baddp')); render(); return true; }
        if (a === 'bsdel') { sEd.steps.splice(+b.dataset.i, 1); render(); return true; }
        if (a === 'bup') { const i = +b.dataset.i; if (i > 0) { const x = sEd.steps[i]; sEd.steps[i] = sEd.steps[i - 1]; sEd.steps[i - 1] = x; } render(); return true; }
        if (a === 'bsave') { api('toys_scenes_save', { id: sEd.id, name: sEd.name, rounds: sEd.rounds, ramp: sEd.ramp, steps: JSON.stringify(sEd.steps) }).then(d => { sEd = null; done(d); }).catch(fail); return true; }
        if (a === 'bshare') { const x = built.scenes.find(y => y.id === b.dataset.id); if (!x || !window.NexusAdult) return true; const d0 = prompt(T('Kurze Beschreibung für die Vorlagen-Bibliothek (optional):'), ''); if (d0 === null) return true;
            window.NexusAdult.share('scene', x.name, { steps: x.steps, rounds: x.rounds, ramp: x.ramp }, d0).then(d => toast(d.msg)).catch(fail); return true; }   // 7.3.2
        if (a === 'bdel') { if (!confirm(T('Szene löschen?'))) return true; api('toys_scenes_delete', { id: b.dataset.id }).then(done).catch(fail); return true; }
        if (a === 'bplay') { api('toys_scenes_play', { id: b.dataset.id }).then(d => { done(d); toysDo('toys_status'); }).catch(fail); return true; }
        if (a === 'bskip') { api('toys_scenes_skip').then(done).catch(fail); return true; }
        return false;
    }
    function builderChange(e) {
        const g = e.target.closest('[data-se]'), st = e.target.closest('[data-ss]');
        if (!sEd || !(g || st)) return false;
        if (g) sEd[g.dataset.se] = g.type === 'number' ? Number(g.value) : g.value;
        else { const i = +st.closest('[data-si]').dataset.si; sEd.steps[i][st.dataset.ss] = st.type === 'number' ? Number(st.value) : st.value; }
        return true;
    }

    // ---------- 🎙 Stimm-Kopplung (Mikrofon → Stärke, nur Pegel – nichts wird aufgenommen oder gesendet) ----------
    async function micSync(on) {
        if (on && !mic) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false });
                const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(stream).connect(an);
                const buf = new Float32Array(an.fftSize);
                mic = { stream, ctx, an, buf, lv: 0, sent: -1, at: 0 };
                micT = setInterval(() => {
                    an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x;
                    const rms = Math.sqrt(s / buf.length), lv = Math.min(1, Math.max(0, (rms - 0.01) * 8));
                    mic.lv = Math.max(lv, mic.lv * 0.85);
                    if (Math.abs(mic.lv - mic.sent) > 0.03 || Date.now() - mic.at > 800) { mic.sent = mic.lv; mic.at = Date.now(); api('toys_voice', { lv: mic.lv.toFixed(3) }).catch(() => {}); }
                }, 120);
            } catch (e) { toast(T('Kein Zugriff aufs Mikrofon') + ' (' + e.name + ')', true); }
        }
        if (!on && mic) { clearInterval(micT); mic.stream.getTracks().forEach(t => t.stop()); try { mic.ctx.close(); } catch (e) { /* egal */ } mic = null; }
    }

    // ---------- Geräte-Details (unter 🎮 Spielzeug) ----------
    function devicesHtml(t) {
        lastT = t;
        const c = t.cfg;
        let h = '<div class="n2-conn small">' + (t.server && t.server.name ? '🖥 ' + esc(t.server.name) + ' · Protokoll v' + (t.server.version || 3) + (t.server.ping ? ' · Ping ' + t.server.ping + ' ms' : '') : '') + (t.scanning ? ' · 🔎 ' + esc(T('sucht …')) : '') + '</div>'
            + '<div class="nc-row">' + sw('reconnect', c.reconnect, T('automatisch neu verbinden')) + sw('auto_scan', c.auto_scan, T('nach dem Verbinden Geräte suchen')) + '</div>'
            + '<div class="nc-row small">' + esc(T('Knopf am Gerät')) + ' <select data-n2="button_action">' + [['stop', '⏹ alles stoppen'], ['surprise', '🎁 Überraschung'], ['next', '⏭ nächstes Muster'], ['none', '– nichts']].map(([k, l]) => '<option value="' + k + '"' + (c.button_action === k ? ' selected' : '') + '>' + esc(T(l)) + '</option>').join('') + '</select>'
            + ' · 🪫 ' + esc(T('Warnung ab')) + ' ' + num('battery_warn', c.battery_warn, 0, 50) + ' %</div>';
        if (!t.devices.length) return h;
        return h + t.devices.map(d => {
            const dc = d.cfg, open = !!devOpen[d.name], types = [...new Set(d.scalars.map(s => s.type))];
            return '<div class="n2-dev' + (d.on ? '' : ' off') + '"><div class="n2-dh"><b>' + esc(d.label) + '</b>' + (d.alias ? ' <span class="muted small">(' + esc(d.name) + ')</span>' : '')
                + '<span class="n2-tags">' + types.map(x => '<span class="vx-pill">' + esc(T(TYPE_ICON[x] || x)) + '</span>').join('') + (d.rotate ? '<span class="vx-pill">🔄 ' + esc(T('Rotation')) + '</span>' : '') + (d.linear ? '<span class="vx-pill">↕ ' + esc(T('Stroker')) + '</span>' : '')
                + (d.battery !== null && d.battery !== undefined ? '<span class="vx-pill' + (d.battery <= (c.battery_warn || 0) ? ' bad' : '') + '">🔋 ' + d.battery + ' %</span>' : '') + (d.rssi !== null && d.rssi !== undefined ? '<span class="vx-pill">📶 ' + d.rssi + ' dBm</span>' : '')
                + (d.pressure !== null && d.pressure !== undefined ? '<span class="vx-pill">🫳 ' + d.pressure + '</span>' : '') + '</span>'
                + '<span class="n2-out">' + bar(d.out) + '<span class="small">' + d.out + ' %</span></span>'
                + '<button type="button" class="btn btn-sm" data-n2a="tap" data-dev="' + d.index + '" title="' + esc(T('kurz antippen – welches Gerät ist das?')) + '">👆</button><button type="button" class="btn btn-sm" data-n2a="stopdev" data-dev="' + d.index + '">⏹</button>'
                + '<button type="button" class="btn btn-sm" data-n2a="devopen" data-name="' + esc(d.name) + '">' + (open ? '▴' : '⚙') + '</button></div>'
                + (open ? '<div class="n2-dbody" data-devname="' + esc(d.name) + '">'
                    + '<div class="nc-row"><span class="small">' + esc(T('Eigener Name')) + '</span><input type="text" data-dv="alias" value="' + esc(dc.alias) + '" maxlength="40" placeholder="' + esc(d.name) + '" style="flex:1">' + sw('dv_on', dc.on, T('verwenden'), ' data-dv="on"') + '</div>'
                    + '<div class="n2-grid"><label class="small">' + esc(T('Mindeststärke')) + rng('dv_min', dc.min, 0, 90, 1, ' %').replace('data-n2="dv_min"', 'data-dv="min"') + '</label>'
                    + '<label class="small">' + esc(T('Höchststärke')) + rng('dv_max', dc.max, 5, 100, 1, ' %').replace('data-n2="dv_max"', 'data-dv="max"') + '</label>'
                    + '<label class="small">' + esc(T('Kurve')) + ' <span class="muted">(&lt;1 ' + esc(T('früher stark')) + ', &gt;1 ' + esc(T('sanfter Anfang')) + ')</span>' + rng('dv_curve', dc.curve, 0.3, 3, 0.1, '').replace('data-n2="dv_curve"', 'data-dv="curve"') + '</label>'
                    + '<label class="small">' + esc(T('Sanftanlauf')) + rng('dv_smooth', dc.smooth, 0, 3000, 100, ' ms').replace('data-n2="dv_smooth"', 'data-dv="smooth"') + '</label></div>'
                    + (types.length > 1 || types.some(x => x !== 'Vibrate') ? '<div class="small">' + esc(T('Anteil je Aktor-Art')) + '</div><div class="n2-grid">' + types.map(x => '<label class="small">' + esc(T(TYPE_ICON[x] || x)) + rng('dt', dc.types[x] !== undefined ? dc.types[x] : 100, 0, 100, 5, ' %').replace('data-n2="dt"', 'data-dt="' + esc(x) + '"') + '</label>').join('') + '</div>' : '')
                    + (d.scalars.length > 1 ? '<div class="small">' + esc(T('Motoren einzeln')) + ' <span class="muted">(' + esc(T('leer = folgt der Gesamtstärke')) + ')</span></div>' + d.scalars.map(s => '<div class="ns-dev"><b>#' + (s.index + 1) + ' ' + esc(s.desc || T(TYPE_ICON[s.type] || s.type)) + '</b><input type="range" min="0" max="100" value="' + (s.override === null ? 0 : s.override) + '" data-motor="' + s.index + '" data-dev="' + d.index + '"><span class="small">' + (s.override === null ? 'auto' : s.override + ' %') + '</span>' + (s.override === null ? '' : '<button type="button" class="btn btn-sm" data-n2a="motorauto" data-dev="' + d.index + '" data-motor="' + s.index + '">auto</button>') + '</div>').join('') : '')
                    + (d.rotate ? '<div class="nc-row small">🔄 ' + esc(T('Drehrichtung')) + ' <select data-dv="rot">' + [['cw', '↻ ' + T('rechts')], ['ccw', '↺ ' + T('links')], ['alt', '⇄ ' + T('wechselnd')]].map(([k, l]) => '<option value="' + k + '"' + (dc.rot === k ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>'
                        + (dc.rot === 'alt' ? ' ' + esc(T('alle')) + ' <input type="number" data-dv="rot_alt" value="' + dc.rot_alt + '" min="1" max="120" style="width:60px"> s' : '') + '</div>' : '')
                    + (d.linear ? '<div class="n2-grid"><label class="small">↕ ' + esc(T('Hub von')) + rng('l1', dc.lin_min, 0, 95, 1, ' %').replace('data-n2="l1"', 'data-dv="lin_min"') + '</label><label class="small">' + esc(T('bis')) + rng('l2', dc.lin_max, 5, 100, 1, ' %').replace('data-n2="l2"', 'data-dv="lin_max"') + '</label></div><p class="muted small">' + esc(T('Stärke = Hubtempo (langsam 1,6 s … schnell 0,25 s pro Hub).')) + '</p>' : '')
                    + '<p class="muted small">⏱ ' + esc(T('Laufzeit')) + ' ' + Math.floor(d.secs / 60) + ' min ' + (d.secs % 60) + ' s' + (d.gap ? ' · ' + esc(T('Mindestabstand')) + ' ' + d.gap + ' ms' : '') + ' · ' + d.scalars.map(s => s.steps).join('/') + ' ' + esc(T('Stufen')) + (d.sensors.length ? ' · ' + esc(T('Sensoren')) + ': ' + esc(d.sensors.join(', ')) : '') + '</p>'
                    + '</div>' : '') + '</div>';
        }).join('') + '<div class="nc-row"><button type="button" class="btn btn-sm" data-n2a="sensors">🔋 ' + esc(T('Akku & Sensoren lesen')) + '</button></div>';
    }

    // ---------- 🔥 Lust & PCS ----------
    const spark = hist => { if (!hist || hist.length < 2) return ''; const w = 260, hgt = 40, pts = hist.map((v, i) => (i / (hist.length - 1) * w).toFixed(1) + ',' + (hgt - v / 100 * hgt).toFixed(1)).join(' '); return '<svg class="n2-spark" viewBox="0 0 ' + w + ' ' + hgt + '" preserveAspectRatio="none"><polyline points="' + pts + '"/></svg>'; };
    function lustHtml(t) {
        lastT = t;
        const c = t.cfg, p = t.pcs, L = t.lust, devs = t.devices;
        micSync(!!c.voice.on);
        let h = '';
        // N8 Consent-Ampel (ganz oben)
        h += sec('🚦 ' + T('Consent-Ampel'), '<div class="n2-amp">' + [['green', '🟢', 'Weiter'], ['yellow', '🟡', 'Langsamer'], ['red', '🔴', 'Stopp']].map(([k, i, l]) => '<button type="button" class="btn n2-' + k + (t.consent === k ? ' on' : '') + '" data-n2a="consent" data-light="' + k + '">' + i + ' ' + esc(T(l)) + '</button>').join('') + '</div>'
            + '<p class="muted small">' + esc(T('🔴 stoppt sofort alles und blockiert bis Grün, 🟡 dämpft auf den eingestellten Anteil. Setzt den Avatar-Parameter (0 = grün, 1 = gelb, 2 = rot) – damit kann dein Avatar z. B. ein Lämpchen zeigen.')) + '</p>'
            + '<div class="nc-row small">' + esc(T('Parameter')) + ' <input type="text" data-n2="consent.param" value="' + esc(c.consent.param) + '" style="width:140px"> · 🟡 ' + num('consent.yellow', c.consent.yellow, 10, 90) + ' % ' + sw('consent.chat', c.consent.chat, T('auch in die Chatbox')) + '</div>');
        // N3 Lust-Meter
        h += sec('💗 ' + T('Lust-Meter'), '<div class="n2-lust"><b>' + L.v + ' %</b>' + bar(L.v, 'lust') + (L.edging ? '<span class="vx-pill bad">🎯 ' + esc(T('Edging-Bremse')) + '</span>' : '') + '</div>' + spark(L.hist)
            + '<p class="muted small">' + esc(L.ext ? T('Quelle: PCS (pcs/satisfaction/lust).') : T('Quelle: eigene Berechnung aus der Spielzeug-Stärke – steigt mit der Zeit, sinkt in Pausen.')) + ' · 💥 ' + L.climaxes + '×</p>'
            + '<div class="nc-row small">' + esc(T('Quelle')) + ' <select data-n2="lust.source">' + [['auto', 'automatisch'], ['pcs', 'nur PCS'], ['own', 'eigene Berechnung']].map(([k, l]) => '<option value="' + k + '"' + (c.lust.source === k ? ' selected' : '') + '>' + esc(T(l)) + '</option>').join('') + '</select>'
            + sw('lust.chat_show', c.lust.chat_show, T('in der Chatbox zeigen')) + '<button type="button" class="btn btn-sm" data-n2a="lustreset">♻</button></div>'
            + '<p class="muted small">' + esc(T('Im SteamVR-HUD: unter Einstellungen → VR → HUD-Infos „lust“ und „toy“ eintragen.')) + '</p>');
        // N4 Höhepunkt
        h += sec('💥 ' + T('Höhepunkt'), sw('lust.climax', c.lust.climax, T('bei 100 % (oder PCS-Ereignis 10) auslösen'))
            + '<div class="nc-row small">' + esc(T('Muster')) + ' <select data-n2="lust.climax_pattern">' + (t.patterns || []).map(x => '<option value="' + esc(x.id) + '"' + (c.lust.climax_pattern === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>'
            + '<div class="nc-row small">' + esc(T('Chatbox')) + ' <input type="text" data-n2="lust.climax_chat" value="' + esc(c.lust.climax_chat) + '" maxlength="144" placeholder="' + esc(T('leer = nichts senden')) + '" style="flex:1"></div>'
            + '<div class="nc-row small">' + esc(T('Avatar-Parameter (Bool, 3 s an)')) + ' <input type="text" data-n2="lust.climax_param" value="' + esc(c.lust.climax_param) + '" placeholder="z. B. Climax" style="flex:1"></div>'
            + '<button type="button" class="btn btn-sm btn-gold" data-n2a="climax">💥 ' + esc(T('Jetzt auslösen')) + '</button>');
        // N5 Edging
        h += sec('🎯 ' + T('Edging-Modus'), sw('edge.on', c.edge.on, T('ab Schwelle bremsen, bis die Lust wieder sinkt'))
            + '<div class="n2-grid"><label class="small">' + esc(T('Schwelle')) + rng('edge.at', c.edge.at, 30, 99, 1, ' %') + '</label><label class="small">' + esc(T('gebremst auf')) + rng('edge.cap', c.edge.cap, 0, 80, 5, ' %') + '</label></div>'
            + (L.release_left ? '<p class="small">🔓 ' + esc(T('erlöst – noch')) + ' ' + L.release_left + ' s</p>' : '<button type="button" class="btn btn-sm" data-n2a="release">🔓 ' + esc(T('Erlösen (2 min ohne Bremse)')) + '</button>'));
        // 4.2: Avatar-Check – welche Systeme hat der getragene Avatar?
        const ck = check, li = (ok, txt) => '<li>' + (ok ? '✔' : '✖') + ' ' + txt + '</li>';
        h += sec('🔍 ' + T('Avatar-Check: SPS · OGB · PCS'), '<button type="button" class="btn btn-sm btn-gold" data-n2a="check">' + esc(checking ? T('prüft …') : T('Avatar prüfen')) + '</button>'
            + (ck ? '<ul class="n2-check">'
                + li(ck.sps.found, '<b>SPS (VRCFury)</b>' + (ck.sps.version ? ' v' + ck.sps.version : '') + (ck.sps.found ? ' · ' + esc(T('Plugs')) + ': ' + (esc(ck.sps.plugs.join(', ')) || '–') + ' · ' + esc(T('Sockets')) + ': ' + (esc(ck.sps.sockets.join(', ')) || '–') + (ck.sps.touch.length ? ' · Touch: ' + esc(ck.sps.touch.join(', ')) : '') : ''))
                + (ck.ogb_legacy.found ? li(true, '<b>OGB (alt)</b> · ' + esc([...ck.ogb_legacy.plugs, ...ck.ogb_legacy.sockets].join(', '))) : '')
                + (ck.vfh.found ? li(true, '<b>VRCFury Haptics (alt)</b> · ' + esc(ck.vfh.zones.join(', '))) : '')
                + li(ck.pcs.found, '<b>PCS</b>' + (ck.pcs.found ? ' · ' + ck.pcs.outputs.length + ' ' + esc(T('Ausgaben')) + (ck.pcs.zones.length ? ' · ' + esc(T('Zonen')) + ': ' + esc(ck.pcs.zones.join(', ')) : '') + (ck.pcs.lust ? ' · 💗' : '') : ''))
                + li(ck.extras.consent, '<code>NX/Consent</code> ' + esc(T('(Ampel-Lämpchen)'))) + li(ck.extras.toy || ck.extras.lust, '<code>NX/Toy</code> / <code>NX/Lust</code> ' + esc(T('(Rückkanal: Stärke & Lust als Float 0–1)')))
                + '</ul>' + ck.hints.map(x => '<p class="small">' + esc(T(x)) + '</p>').join('') + '<p class="muted small">' + ck.params + ' ' + esc(T('Parameter geprüft')) + (ck.ogb_enabled_sent ? ' · OGB/Enabled ✔' : '') + '</p>'
                : '<p class="muted small">' + esc(T('Liest die Parameter des getragenen Avatars (OSCQuery bzw. VRChat-OSC-Datei) und zeigt, welche Systeme er hat.')) + '</p>')
            + '<div class="nc-row">' + sw('sps_enable', c.sps_enable !== false, T('OGB/Enabled automatisch setzen (sonst liefern VRCFury-SPS-Kontakte nichts)')) + '</div>'
            + '<div class="nc-row">' + sw('osc_out', c.osc_out !== false, T('Rückkanal: Stärke & Lust an den Avatar senden (NX/Toy, NX/Lust)')) + '</div>');
        // N1/N2 PCS
        h += sec('🫦 PCS – Penetration Contact System', sw('pcs.on', c.pcs.on, '<b>' + esc(T('PCS steuert Spielzeug')) + '</b>') + ' ' + devSel('pcs.device', c.pcs.device, devs)
            + '<p class="small">' + (p.active ? '🟢 ' + esc(T('PCS-Werte kommen an')) + ' · ' + esc(T('Tiefe')) + ' ' + p.depth + ' % · ' + esc(T('Tempo')) + ' ' + p.vel + ' % · → ' + p.level + ' %' + (p.zones.length ? ' · ' + esc(T('Zone')) + ': ' + esc(p.zones.join(', ')) : '') : '⚪ ' + esc(T('Noch keine pcs/…-Werte – Avatar mit PCS tragen, OSC an. Die PCS-Parameter müssen in den Expression Parameters des Avatars stehen.'))) + '</p>'
            + '<div class="n2-grid"><label class="small">' + esc(T('Tiefe')) + rng('pcs.w_depth', c.pcs.w_depth, 0, 100, 5, ' %') + '</label><label class="small">' + esc(T('Tempo / Gleiten')) + rng('pcs.w_speed', c.pcs.w_speed, 0, 100, 5, ' %') + '</label>'
            + '<label class="small">' + esc(T('Lust als Grundlast')) + rng('pcs.w_lust', c.pcs.w_lust, 0, 100, 5, ' %') + '</label></div>' + sw('pcs.impulses', c.pcs.impulses, T('Stoß-Impulse (smash-hit, move-in, deep-throat)'))
            + '<p class="muted small">' + esc(T('Pro Zone ein eigenes Gerät: unter 🎮 Spielzeug → Geräte verknüpfen → „PCS“ und die Zonen (mouth, boobs, pussy, ass, custom1–8) wählen.')) + (p.seen.length ? '<br>' + esc(T('Gesehen')) + ': ' + p.seen.map(x => '<code>' + esc(x) + '</code>').join(' ') : '') + '</p>', 'ns-wide');
        // N6 Puls
        h += sec('💓 ' + T('Puls-Kopplung'), sw('heart.on', c.heart.on, T('Herzfrequenz steuert Spielzeug')) + ' ' + devSel('heart.device', c.heart.device, devs)
            + '<p class="small">' + (t.heart ? '💓 ' + t.heart + ' bpm' : '<span class="muted">' + esc(T('kein Puls – Quelle unter Spiel & OSC → 💓 Puls einrichten')) + '</span>') + '</p>'
            + '<div class="nc-row small">' + num('heart.lo', c.heart.lo, 40, 180) + ' bpm = 0 % · ' + num('heart.hi', c.heart.hi, 60, 220) + ' bpm = 100 %</div>');
        // N7 Stimme
        h += sec('🎙 ' + T('Stimm-Kopplung'), sw('voice.on', c.voice.on, T('Lautstärke am Mikrofon steuert Spielzeug')) + ' ' + devSel('voice.device', c.voice.device, devs)
            + '<div class="nc-row small">' + esc(T('Empfindlichkeit')) + rng('voice.gain', c.voice.gain, 10, 400, 10, ' %') + '</div>' + bar(t.voice)
            + '<p class="muted small">' + esc(T('Nur der Pegel wird gemessen – nichts wird aufgenommen oder verschickt. Läuft, solange VRC Nexus offen ist.')) + '</p>');
        // N9 Szene + N10 Aftercare
        const sc = t.scene, ss = t.session;
        const bs = sc && sc.built;
        h += sec('🎬 ' + T('Szenen-Timer'), (sc ? '<p><b>' + esc(sc.name) + '</b> · ' + esc(T('noch')) + ' ' + Math.floor(sc.left / 60) + ':' + String(sc.left % 60).padStart(2, '0') + '</p>' + bar(100 - sc.left / sc.total * 100)
            + (bs ? '<p class="small">' + esc(T('Schritt')) + ' ' + bs.step + '/' + bs.steps + ' · ' + esc(T('Runde')) + ' ' + bs.round + '/' + bs.rounds + ' · ' + (bs.pause ? '⏸ ' + esc(T('Pause')) : '💪 ' + bs.level + ' %') + ' · ' + mmss(bs.left) + '</p>' : '')
            + '<div class="nc-row">' + (bs ? '<button type="button" class="btn btn-sm" data-n2a="bskip">⏭ ' + esc(T('Nächster Schritt')) + '</button>' : '') + '<button type="button" class="btn btn-sm ns-stop" data-n2a="scenestop">⏹ ' + esc(T('Szene beenden')) + '</button></div>'
            : '<div class="nc-row"><input type="text" id="n2Scene" maxlength="40" placeholder="' + esc(T('Name der Szene')) + '" value="' + esc(scene ? scene.title : '') + '" style="flex:1"><input type="number" id="n2SceneMin" value="20" min="1" max="240" style="width:64px"> min<button type="button" class="btn btn-sm btn-gold" data-n2a="scene">▶</button></div><p class="muted small">' + esc(T('Am Ende fährt das Spielzeug herunter und die Aftercare-Erinnerung kommt.')) + '</p>')
            + (ss.running ? '<p class="small">⏱ ' + esc(T('Sitzung läuft seit')) + ' ' + Math.floor(ss.secs / 60) + ' min</p>' : ''));
        h += sec('🧱 ' + T('Szenen-Baukasten'), builderHtml(t), 'ns-wide');   // 6.2
        h += sec('💞 Aftercare', (ss.aftercare_due ? '<p class="ns-card-big">💞 ' + esc(T('Zeit für Aftercare!')) + '</p>' : '')
            + '<div class="n2-after">' + AFTER.map((a, i) => '<label class="check small"><input type="checkbox" data-after="' + i + '"' + (after[i] ? ' checked' : '') + '> ' + esc(T(a)) + '</label>').join('') + '</div>'
            + sw('aftercare.on', c.aftercare.on, T('nach jeder Sitzung erinnern')) + ' ' + esc(T('nach')) + ' ' + num('aftercare.after_min', c.aftercare.after_min, 1, 60, 1, 56) + ' min ' + esc(T('Pause'))
            + '<div class="nc-row small">' + esc(T('Chatbox-Text')) + ' <input type="text" data-n2="aftercare.chat" value="' + esc(c.aftercare.chat) + '" maxlength="144" placeholder="💞 ' + esc(T('Danke dir – alles gut bei dir?')) + '" style="flex:1"></div>'
            + (ss.aftercare_due ? '<button type="button" class="btn btn-sm btn-gold" data-n2a="afterdone">✔ ' + esc(T('Erledigt')) + '</button>' : ''));
        const ap = c.autopause || {}, pz = t.paused;   // 8.2: automatische Pausen
        h += sec('⏸ ' + T('Automatische Pausen'), (pz ? '<p class="ns-card-big">⏸ ' + esc(pz.msg || T('Pause')) + ' · ' + Math.ceil(pz.left / 60) + ' min</p><button type="button" class="btn btn-sm" data-n2a="pauseend">▶ ' + esc(T('Pause beenden')) + '</button>' : '')
            + '<div class="nc-row small">' + sw('autopause.on', ap.on, T('nach')) + ' ' + num('autopause.max_min', ap.max_min, 5, 180, 5, 56) + ' ' + esc(T('min am Stück')) + ' → ' + num('autopause.pause_min', ap.pause_min, 1, 60, 1, 56) + ' ' + esc(T('min Pause')) + '</div>'
            + '<div class="nc-row small">' + sw('autopause.hr_on', ap.hr_on, T('auch ab Puls')) + ' ' + num('autopause.hr_max', ap.hr_max, 90, 210, 5, 60) + ' bpm</div>'
            + '<p class="muted small">' + esc(T('Während der Pause ist die Stärke 0; Muster und Szenen laufen danach weiter. Puls braucht die Puls-Verbindung (HypeRate, Uhr …).')) + '</p>');
        return h;
    }

    // ---------- 🎲 Spielereien: eigene Muster & Szenen-Ideen ----------
    function funHtml(t) {
        const cus = (t && t.cfg && t.cfg.custom) || [];
        let h = sec('✏️ ' + T('Eigene Muster'), '<p class="muted small">' + esc(T('Werte 0–100, getrennt mit Komma; dazwischen wird weich übergeblendet.')) + '</p>'
            + cus.map((c, i) => '<div class="nc-row small"><b>' + esc(c.name) + '</b><span class="muted">' + c.steps.length + ' × ' + c.step_ms + ' ms</span><span class="n2-sp"></span><button type="button" class="btn btn-sm" data-n2a="patedit" data-i="' + i + '">✎</button><button type="button" class="btn btn-sm" data-n2a="patdel" data-i="' + i + '">✕</button></div>').join('')
            + '<div class="n2-ped"><input type="text" id="n2PatName" maxlength="30" placeholder="' + esc(T('Name')) + '" value="' + esc(patEd ? patEd.name : '') + '"><input type="text" id="n2PatSteps" placeholder="0, 20, 60, 100, 60, 20" value="' + esc(patEd ? patEd.steps.join(', ') : '') + '" style="flex:1">'
            + '<input type="number" id="n2PatMs" min="50" max="5000" step="50" value="' + (patEd ? patEd.step_ms : 400) + '" style="width:80px"> ms<button type="button" class="btn btn-sm btn-gold" data-n2a="patsave">💾</button></div>');
        h += sec('🎭 ' + T('Szenen-Ideen'), '<button type="button" class="btn btn-sm" data-n2a="scenegen">🎲 ' + esc(T('Neue Idee')) + '</button>'
            + (scene ? '<p class="ns-card-big">🎭 ' + esc(T(scene.rolle)) + ' – ' + esc(T(scene.ort)) + '<br>✨ ' + esc(T(scene.stimmung)) + '<br>🃏 ' + esc(T(scene.twist)) + '</p><div class="nc-row"><button type="button" class="btn btn-sm btn-gold" data-n2a="scenechat">📨 ' + esc(T('In die Chatbox')) + '</button><button type="button" class="btn btn-sm" data-n2a="scenesend">🎬 ' + esc(T('Als Szene starten')) + '</button></div>' : '<p class="muted small">' + esc(T('Ort, Rollen, Stimmung und ein Twist – nur als Anregung, alles nur mit Zustimmung.')) + '</p>'));
        return h;
    }

    // ---------- Ereignisse ----------
    const setCfg = (data, toysDo) => toysDo('toys_cfg', data);
    function grpVal(path, v) { const [g, k] = path.split('.'); return { [g]: JSON.stringify({ [k]: v }) }; }
    function onClick(e, toysDo, render) {
        const b = e.target.closest('[data-n2a]');
        if (!b) return false;
        const a = b.dataset.n2a, t = lastT;
        if (a[0] === 'b' && builderClick(a, b, toysDo, render)) return true;   // 6.2
        if (a === 'check') { checking = true; render(); api('toys_check').then(d => { check = d.check; }).catch(x => toast(x.message, true)).finally(() => { checking = false; render(); }); return true; }
        if (a === 'devopen') { devOpen[b.dataset.name] = !devOpen[b.dataset.name]; render(); return true; }
        if (a === 'tap') { toysDo('toys_tap', { device: b.dataset.dev }); return true; }
        if (a === 'stopdev') { toysDo('toys_stop_dev', { device: b.dataset.dev }); return true; }
        if (a === 'motorauto') { toysDo('toys_motor', { device: b.dataset.dev, motor: b.dataset.motor, level: '' }); return true; }
        if (a === 'sensors') { toysDo('toys_sensors'); return true; }
        if (a === 'consent') { toysDo('toys_consent', { light: b.dataset.light }); return true; }
        if (a === 'lustreset') { toysDo('toys_lust_reset'); return true; }
        if (a === 'climax') { toysDo('toys_climax'); return true; }
        if (a === 'release') { toysDo('toys_edge_release'); return true; }
        if (a === 'scene') { const n = document.getElementById('n2Scene'), m = document.getElementById('n2SceneMin'); toysDo('toys_scene', { name: n ? n.value : '', minutes: m ? m.value : 20 }); return true; }
        if (a === 'scenestop') { toysDo('toys_scene_stop'); if (built) built.running = null; return true; }
        if (a === 'afterdone') { after = {}; toysDo('toys_aftercare_done'); return true; }
        if (a === 'pauseend') { toysDo('toys_pause_end'); return true; }
        if (a === 'scenegen') { scene = { ort: pick(SCENE.ort), rolle: pick(SCENE.rolle), stimmung: pick(SCENE.stimmung), twist: pick(SCENE.twist) }; scene.title = T(scene.rolle).slice(0, 40); render(); return true; }
        if (a === 'scenechat' && scene) { api('nsfw_chat', { text: '🎭 ' + T(scene.rolle) + ' – ' + T(scene.ort) + ' · ' + T(scene.stimmung) }).then(d => toast(d.msg)).catch(x => toast(x.message, true)); return true; }
        if (a === 'scenesend' && scene) { toysDo('toys_scene', { name: scene.title, minutes: 20 }); return true; }
        if (a === 'patsave') {
            const name = (document.getElementById('n2PatName') || {}).value || '', steps = ((document.getElementById('n2PatSteps') || {}).value || '').split(/[\s,;]+/).filter(Boolean).map(Number).filter(n => !isNaN(n));
            const ms = Number((document.getElementById('n2PatMs') || {}).value) || 400;
            if (steps.length < 2) { toast(T('Mindestens zwei Werte.'), true); return true; }
            const list = ((t && t.cfg.custom) || []).slice(), id = patEd && patEd.id ? patEd.id : 'c' + Date.now().toString(36).slice(-6);
            const i = list.findIndex(x => x.id === id), item = { id, name: name || T('Eigenes Muster'), steps, step_ms: ms };
            if (i >= 0) list[i] = item; else list.push(item);
            patEd = null; setCfg({ custom: JSON.stringify(list) }, toysDo); return true;
        }
        if (a === 'patedit') { patEd = Object.assign({}, t.cfg.custom[+b.dataset.i]); render(); return true; }
        if (a === 'patdel') { if (!confirm(T('Muster löschen?'))) return true; const list = t.cfg.custom.filter((_, i) => i !== +b.dataset.i); setCfg({ custom: JSON.stringify(list) }, toysDo); return true; }
        return false;
    }
    const devData = el => { const box = el.closest('[data-devname]'); return box ? box.dataset.devname : null; };
    function onChange(e, toysDo) {
        const af = e.target.closest('[data-after]'); if (af) { after[af.dataset.after] = af.checked; return true; }
        if (builderChange(e)) return true;
        const dv = e.target.closest('[data-dv]'), dt = e.target.closest('[data-dt]');
        if (dv || dt) {
            const name = devData(e.target); if (!name) return true;
            const data = dt ? { types: { [dt.dataset.dt]: dt.value } } : { [dv.dataset.dv]: dv.type === 'checkbox' ? (dv.checked ? '1' : '0') : dv.value };
            toysDo('toys_dev', { name, data: JSON.stringify(data) }); return true;
        }
        const el = e.target.closest('[data-n2]');
        if (!el) return false;
        const k = el.dataset.n2, v = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
        toysDo('toys_cfg', k.includes('.') ? grpVal(k, v) : { [k]: v });
        return true;
    }
    let motT = null;
    function onInput(e, toysDo) {
        const r = e.target.closest('input[type=range]');
        if (!r) return false;
        if (r.dataset.motor !== undefined) { const s = r.parentNode.querySelector('span'); if (s) s.textContent = r.value + ' %'; clearTimeout(motT); motT = setTimeout(() => api('toys_motor', { device: r.dataset.dev, motor: r.dataset.motor, level: r.value / 100 }).catch(x => toast(x.message, true)), 80); return true; }
        if (r.closest('.n2-rng')) { const b = r.parentNode.querySelector('b'); if (b) b.textContent = r.value + (b.textContent.replace(/^[\d.]+/, '')); return true; }
        return false;
    }
    window.NexusNsfw2 = { devicesHtml, lustHtml, funHtml, onClick, onChange, onInput, micSync };
})();
