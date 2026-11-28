/* VRC Nexus – Inhalt des SteamVR-Overlays (läuft unsichtbar in Electron, das Bild geht über NexusOverlay.exe nach SteamVR). */
(function () {
    const $ = s => document.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function api(act, data) {
        const body = new URLSearchParams();
        body.append('act', act);
        Object.entries(data || {}).forEach(([k, v]) => body.append(k, v ?? ''));
        return fetch('nexus.php', { method: 'POST', body }).then(async r => { const d = await r.json().catch(() => ({ error: 'HTTP ' + r.status })); if (!r.ok || d.error) throw new Error(d.error || 'Fehler'); return d; });
    }
    const act = (action, extra) => api('overlay_act', Object.assign({ action }, extra || {}));
    let toastT = null;
    function toast(m) { const t = $('#ovToast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200); }
    const run = p => p.then(d => { toast(d.msg || '✔'); setTimeout(load, 500); }).catch(e => toast('⚠ ' + e.message));

    // 3.8.4: Theme + Akzentfarbe wie in der App (themes.css)
    function applyTheme(theme, accent) {
        const h = document.documentElement, ok = ['neon', 'midnight', 'snow', 'sakura', 'beach'];
        h.dataset.theme = ok.includes(theme) ? theme : 'neon';
        const a = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent.toLowerCase() : '';
        if (a && a !== '#38d5e6') { h.style.setProperty('--accent-cyan', a); h.style.setProperty('--accent-rgb', [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)).join(', ')); }
        else { h.style.removeProperty('--accent-cyan'); h.style.removeProperty('--accent-rgb'); }
    }
    let space = null;   // 3.3 VR-Bewegung
    let pos = null;     // 3.8.4 Lage
    let tab = 'friends', data = null, cfg = { phrases: [] }, text = '';
    const EMOJI = ['👋', '😊', '😂', '❤️', '👍', '🎉', '😴', '🦊', '✨', '🙏', '😭', '🔥'];

    let armed = 0;   // 8.0.5: Panik im Handmenü = zweimal tippen (Laser rutscht leicht ab)
    const V = {
        // 8.0.5: ✋ Handmenü – große Knöpfe, auch per eigener Controller-Taste (SteamVR → Controller-Belegung → „Handmenü öffnen“)
        hand: () => {
            const big = (a, l, cls, extra) => '<button class="btn hm-big ' + (cls || '') + '" data-a="' + a + '"' + (extra || '') + '>' + l + '</button>';
            const priv = !!data.priv;
            return '<div class="hm-grid">'
                + big('hm_panic', Date.now() - armed < 3000 ? '🚨 NOCHMAL = PANIK' : '🚨 Panik', 'danger')
                + big('hm_vc', priv ? '✅ Privat aus' : '🕶 Privat', '', ' data-v="' + (priv ? 'private_off' : 'private_on') + '"')
                + big('hm_vc', '🌿 Pause', '', ' data-v="break"')
                + big('input', '🎙 Mikro', '', ' data-v="Voice"')
                + big('cam', '📸 Foto', '', ' data-v="Capture"')
                + big('hm_vc', '💡 Licht aus', '', ' data-v="light_off"')
                + big('status', '🔴 Beschäftigt', (data.me && data.me.status === 'busy' ? 'on' : ''), ' data-v="busy"')
                + big('status', '🟢 Online', (data.me && data.me.status === 'active' ? 'on' : ''), ' data-v="active"')
                + big('hide', '✕ Ausblenden')
                + '</div>' + ((data.macros || []).length ? '<h3>⚡ Makros</h3><div class="ov-grid">' + data.macros.slice(0, 6).map(m => '<button class="btn gold" data-a="macro" data-id="' + esc(m.id) + '">⚡ ' + esc(m.name) + '</button>').join('') + '</div>' : '');
        },
        friends: () => (data.friends && data.friends.list || []).length ? '<div class="ov-list">' + data.friends.list.map(f => '<div class="ov-item"><i class="ov-dot ' + esc((f.status || '').replace(' ', '-')) + '"></i><div><b>' + (f.fav ? '⭐ ' : '') + esc(f.name) + '</b><small>' + esc(f.world || '–') + '</small></div>'
            + '<button class="btn sm" data-a="friend" data-id="' + esc(f.id) + '" data-op="join">Beitreten</button><button class="btn sm" data-a="friend" data-id="' + esc(f.id) + '" data-op="invite">Einladen</button></div>').join('') + '</div>'
            : '<div class="ov-empty">Gerade ist kein Freund im Spiel.</div>',
        players: () => { const g = data.game; if (!g || !g.world || !Array.isArray(g.players)) return '<div class="ov-empty">Du bist in keiner Instanz.</div>'; return '<h3>🌐 ' + esc(g.world) + ' · ' + g.players.length + ' Spieler</h3><div class="ov-list">' + g.players.map(p => '<div class="ov-item"><div><b>' + esc(p.name) + '</b><small>seit ' + Math.max(0, Math.round((Date.now() / 1000 - p.since) / 60)) + ' min</small></div></div>').join('') + '</div>'; },
        notifs: () => data.notifs && (data.notifs.items || []).length ? data.notifs.items.map(n => '<div class="ov-item"><div><b>' + esc(n.title) + '</b><small>' + esc(n.message) + '</small></div></div>').join('') + '<p class="ov-note">Annehmen/Ablehnen bitte in VRC Nexus am PC oder im VRChat-Menü.</p>' : '<div class="ov-empty">Keine offenen Benachrichtigungen.</div>',
        chat: () => '<div class="ov-chatbox"><div class="ov-text">' + (text ? esc(text) : '<span style="color:var(--o-muted)">Sätze und Emojis antippen …</span>') + '</div><button class="btn gold" data-a="send">Senden</button><button class="btn" data-a="del">⌫</button></div>'
            + '<div class="ov-emojis">' + EMOJI.map(e => '<button data-add="' + e + '">' + e + '</button>').join('') + '</div>'
            + '<h3>Sätze</h3><div class="ov-grid">' + (cfg.phrases || []).map(p => '<button class="btn sm" data-add="' + esc(p) + ' ">' + esc(p) + '</button>').join('') + '</div>'
            + '<h3>Mehr</h3><div class="ov-grid">' + (data.speech ? '<button class="btn gold' + (data.speech.recording ? ' on' : '') + '" data-a="speech">🎙 ' + (data.speech.recording ? 'Stopp' : 'Sprechen') + '</button>' : '')
            + '<button class="btn" data-a="clear">🧹 Chatbox leeren</button><button class="btn" data-a="typing">⌨️ tippt …</button><button class="btn' + (data.rotator && data.rotator.on ? ' on' : '') + '" data-a="rotator">🔁 Rotator</button></div>',
        quick: () => '<h3>Status</h3><div class="ov-grid">' + [['join me', '🔵 Join Me'], ['active', '🟢 Online'], ['ask me', '🟠 Ask Me'], ['busy', '🔴 Beschäftigt']].map(([k, l]) => '<button class="btn' + (data.me && data.me.status === k ? ' on' : '') + '" data-a="status" data-v="' + k + '">' + l + '</button>').join('') + '</div>'
            + '<h3>Makros</h3><div class="ov-grid">' + ((data.macros || []).length ? data.macros.map(m => '<button class="btn gold" data-a="macro" data-id="' + esc(m.id) + '">⚡ ' + esc(m.name) + '</button>').join('') : '<span class="ov-note">Keine Makros.</span>') + '</div>'
            + ((data.params || []).length ? '<h3>Parameter</h3><div class="ov-grid">' + data.params.filter(p => p.type === 'bool').map(p => '<button class="btn' + (p.value === true ? ' on' : '') + '" data-a="toggle" data-v="' + esc(p.name) + '">' + esc(p.name) + '</button>').join('') + '</div>' : '')
            + '<h3>VRChat</h3><div class="ov-grid"><button class="btn" data-a="rejoin">🔄 Neu beitreten</button><button class="btn" data-a="input" data-v="Voice">🎙 Mikro</button><button class="btn" data-a="input" data-v="Jump">⤒ Springen</button><button class="btn" data-a="hide">🙈 Overlay aus</button></div>',
        space: () => {
            if (!space) return '<div class="ov-empty">Lade …</div>';
            const c = space.cfg, s = Object.assign({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 }, space.state || {});
            const on = k => (c[k] ? ' on' : '');
            const step = (k, v, l) => '<button class="btn sm" data-a="sp_step" data-k="' + k + '" data-v="' + v + '">' + l + '</button>';
            return '<h3>' + (s.on ? '🟢 Verbunden' : '🔴 Nicht verbunden') + ' · X ' + s.x.toFixed(2) + ' · Y ' + s.y.toFixed(2) + ' · Z ' + s.z.toFixed(2) + ' m · Yaw ' + s.yaw + '° · Pitch ' + s.pitch + '° · Roll ' + s.roll + '°</h3>'
                + '<div class="ov-grid"><button class="btn' + on('vr.space') + '" data-a="sp_tog" data-k="vr.space">🔌 ' + (c['vr.space'] ? 'Trennen' : 'Verbinden') + '</button><button class="btn gold" data-a="sp_reset">↺ Zurücksetzen</button></div>'
                + '<h3>Funktionen</h3><div class="ov-grid"><button class="btn' + on('vr.fly_on') + '" data-a="sp_tog" data-k="vr.fly_on">🚀 Space Flight</button><button class="btn' + on('vr.turn_on') + '" data-a="sp_tog" data-k="vr.turn_on">🔄 Space Turn</button>'
                + '<button class="btn' + on('vr.walk_on') + '" data-a="sp_tog" data-k="vr.walk_on">🧭 Space Walk</button><button class="btn' + on('vr.fly_gravity') + '" data-a="sp_tog" data-k="vr.fly_gravity">🪂 Gravitation</button></div>'
                + '<h3>Drag ' + (c['vr.fly_mul'] / 100).toFixed(1) + '× · Drehen ' + (c['vr.turn_mul'] / 100).toFixed(1) + '× · Walk ' + (c['vr.walk_mul'] / 100).toFixed(1) + '×</h3><div class="ov-grid">'
                + step('vr.fly_mul', -25, '➖ Drag') + step('vr.fly_mul', 25, '➕ Drag') + step('vr.turn_mul', -25, '➖ Drehen') + step('vr.turn_mul', 25, '➕ Drehen') + step('vr.walk_mul', -25, '➖ Walk') + step('vr.walk_mul', 25, '➕ Walk') + '</div>'
                + '<h3>Sperren</h3><div class="ov-grid">' + ['x', 'y', 'z'].map(a => '<button class="btn sm' + on('vr.fly_lock_' + a) + '" data-a="sp_tog" data-k="vr.fly_lock_' + a + '">' + a.toUpperCase() + '</button>').join('')
                + ['pitch', 'roll', 'yaw'].map(a => '<button class="btn sm' + on('vr.walk_lock_' + a) + '" data-a="sp_tog" data-k="vr.walk_lock_' + a + '">' + a[0].toUpperCase() + a.slice(1) + '</button>').join('') + '</div>';
        },
        cam: () => { const cm = data.cam || { mode: 0, presets: [] }; return '<div class="ov-grid"><button class="btn gold" data-a="cam" data-v="Capture">📸 Foto</button><button class="btn" data-a="cam" data-v="CaptureDelayed">⏱ Timer</button><button class="btn" data-a="burst">🎞 Serie (5)</button><button class="btn" data-a="cam" data-v="Close">✖ Kamera zu</button></div>'
            + '<h3>Modus</h3><div class="ov-grid">' + [[1, 'Foto'], [2, 'Stream'], [3, 'Emoji'], [6, 'Drohne']].map(([m, l]) => '<button class="btn' + (cm.mode === m ? ' on' : '') + '" data-a="mode" data-v="' + m + '">' + l + '</button>').join('') + '</div>'
            + '<h3>Zoom</h3><div class="ov-grid"><button class="btn" data-a="zoom" data-v="-10">➖ Zoom</button><button class="btn" data-a="zoom" data-v="10">➕ Zoom</button></div>'
            + ((cm.presets || []).length ? '<h3>Vorlagen</h3><div class="ov-grid">' + cm.presets.map(p => '<button class="btn" data-a="campreset" data-v="' + esc(p) + '">' + esc(p) + '</button>').join('') + '</div>' : ''); },
        pos: () => {   // 3.8.4: Lage von Fenster und HUD direkt in VR verstellen
            if (!pos) return '<div class="ov-empty">Lade …</div>';
            const sel = (k, opts) => opts.map(([v, l]) => '<button class="btn sm' + (pos[k] === v ? ' on' : '') + '" data-a="pos_set" data-k="' + k + '" data-v="' + v + '">' + l + '</button>').join('');
            const row = (k, l, st, u) => '<div class="ov-pv"><span>' + l + '</span><button class="btn" data-a="pos_step" data-k="' + k + '" data-v="' + (-st) + '">−</button><b>' + esc(pos[k]) + ' ' + u + '</b><button class="btn" data-a="pos_step" data-k="' + k + '" data-v="' + st + '">+</button><button class="btn sm" data-a="pos_reset" data-k="' + k + '" title="Standard">↺</button></div>';
            const head = pos['vr.overlay_hud_place'] === 'head';
            return '<h3>Fenster</h3><div class="ov-grid">' + sel('vr.overlay_mode', [['wrist', '⌚ Handgelenk'], ['front', '🪟 Vor mir'], ['off', '🧩 Dashboard']]) + '</div>'
                + '<div class="ov-pos" style="margin-top:10px">' + row('vr.overlay_width', 'Breite', 2, 'cm') + row('vr.overlay_alpha', 'Deckkraft', 5, '%')
                + (pos['vr.overlay_mode'] === 'front' ? row('vr.overlay_distance', 'Abstand', 10, 'cm') + row('vr.overlay_front_y', 'Höhe', 5, 'cm')
                    : row('vr.overlay_tilt', 'Neigung', 5, '°') + row('vr.overlay_off_x', 'Versatz X', 1, 'cm') + row('vr.overlay_off_y', 'Versatz Y', 1, 'cm') + row('vr.overlay_off_z', 'Versatz Z', 1, 'cm')) + '</div>'
                + '<h3>HUD' + (pos['vr.overlay_hud'] ? '' : ' (aus – in den Einstellungen einschalten)') + '</h3><div class="ov-grid">' + sel('vr.overlay_hud_place', [['wrist', '⌚ Am Arm'], ['head', '🥽 Im Blickfeld']]) + '</div>'
                + '<div class="ov-pos" style="margin-top:10px">' + row('vr.overlay_hud_width', 'Breite', 2, 'cm') + row('vr.overlay_hud_alpha', 'Deckkraft', 5, '%')
                + (head ? row('vr.overlay_hud_dist', 'Weite', 10, 'cm') + row('vr.overlay_hud_x', 'X (seitlich)', 2, 'cm') + row('vr.overlay_hud_y', 'Y (Höhe)', 2, 'cm') + row('vr.overlay_hud_tilt', 'Neigung', 5, '°')
                    : row('vr.overlay_hud_arm', 'Abstand zum Fenster', 1, 'cm')) + '</div>'
                + '<p class="ov-note">Änderungen wirken sofort. ↺ setzt einen Wert zurück.</p>';
        },
    };
    function render() {
        if (!data) return;
        document.querySelectorAll('#ovTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
        $('#ovNf').textContent = data.notifs && data.notifs.unseen ? data.notifs.unseen : '';
        $('#ovInfo').textContent = (data.game && data.game.world ? '🌐 ' + data.game.world + ' · ' + (data.game.players || []).length + ' 👥 · ' : '') + '🟢 ' + ((data.friends && data.friends.in_game) || 0) + ' Freunde' + (data.music ? ' · 🎵 ' + data.music : '');
        const m = $('#ovMain'), top = m.scrollTop;
        try { m.innerHTML = V[tab](); } catch (e) { m.innerHTML = '<div class="ov-empty">⚠ ' + esc(e.message) + '</div>'; }
        m.scrollTop = top;
    }
    function load() { if (tab === 'pos') api('overlay_cfg').then(c => { cfg = c; pos = c.pos; applyTheme(c.theme, c.accent); render(); }).catch(() => {}); if (tab === 'space') api('space_get').then(r => { space = r; render(); }).catch(() => {}); return api('home_data').then(d => { data = d; render(); }).catch(e => { $('#ovMain').innerHTML = '<div class="ov-empty">⚠ ' + esc(e.message) + '</div>'; }); }

    $('#ovTabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; $('#ovMain').scrollTop = 0; render(); if (tab === 'space' || tab === 'pos') load(); } });
    $('#ovMain').addEventListener('click', e => {
        const add = e.target.closest('[data-add]');
        if (add) { text = (text + add.dataset.add).slice(0, 500); render(); return; }
        const b = e.target.closest('[data-a]');
        if (!b) return;
        const a = b.dataset.a, v = b.dataset.v;
        if (a === 'hm_panic') { if (Date.now() - armed > 3000) { armed = Date.now(); render(); setTimeout(render, 3100); return; } armed = 0; return run(api('nsfw_panic_full')); }
        if (a === 'hm_vc') return run(api('vcmd_run', { id: v }));
        if (a === 'friend') return run(act('friend', { id: b.dataset.id, op: b.dataset.op === 'invite' ? 'invite' : 'join' }));
        if (a === 'send') { if (!text.trim()) return; const t = text; text = ''; render(); return run(act('chatbox', { text: t, sound: '1', translate: cfg.translate ? '1' : '', target: cfg.target || '' }).then(d => Object.assign(d, { msg: '💬 ' + (d.text || t) }))); }
        if (a === 'del') { text = Array.from(text).slice(0, -1).join(''); render(); return; }
        if (a === 'clear') return run(api('client_osc', { kind: 'chatbox', clear: '1' }));
        if (a === 'typing') return run(act('typing', { on: '1' }));
        if (a === 'rotator') return run(act('rotator'));
        if (a === 'speech') return run(act('speech', { op: 'toggle' }));
        if (a === 'status') return run(act('status', { status: v, desc: data.me ? data.me.desc : '' }));
        if (a === 'macro') return run(act('macro', { id: b.dataset.id }));
        if (a === 'toggle') return run(act('toggle', { name: v }));
        if (a === 'rejoin') return run(act('rejoin'));
        if (a === 'input') return run(act('input', { name: v }));
        if (a === 'hide') return run(act('overlay', { on: '' }));
        if (a === 'sp_tog') return api('space_save', { [b.dataset.k]: space.cfg[b.dataset.k] ? '0' : '1', quiet: '1' }).then(r => { space = r; render(); }).catch(x => toast('⚠ ' + x.message));
        if (a === 'sp_step') return api('space_save', { [b.dataset.k]: Math.max(10, (space.cfg[b.dataset.k] || 100) + Number(v)), quiet: '1' }).then(r => { space = r; render(); }).catch(x => toast('⚠ ' + x.message));
        if (a === 'sp_reset') return api('space_reset').then(r => { space = r; toast(r.msg); render(); }).catch(x => toast('⚠ ' + x.message));
        if (a === 'pos_step' || a === 'pos_set' || a === 'pos_reset') {
            const d = { key: b.dataset.k };
            if (a === 'pos_step') d.delta = v; else if (a === 'pos_set') d.value = v; else d.reset = '1';
            return api('overlay_pos', d).then(r => { pos = r.pos; render(); }).catch(x => toast('⚠ ' + x.message));
        }
        if (a === 'cam') return run(act('camera', { cmd: v }));
        if (a === 'burst') return run(act('camera', { cmd: 'burst', count: 5, seconds: 2 }));
        if (a === 'mode') return run(act('camera', { cmd: 'Mode', value: v }));
        if (a === 'zoom') return run(act('camera', { cmd: 'step', name: 'Zoom', step: v, base: 45 }));
        if (a === 'campreset') return run(act('camera', { cmd: 'preset', preset: v }));
    });
    window.NexusOverlay = { tab(t) { if (!V[t]) return; tab = t; $('#ovMain').scrollTop = 0; render(); load(); } };   // 8.0.5: Controller-Taste „Handmenü“
    setInterval(() => { $('#ovClock').textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }, 1000);
    const cfgLoad = () => api('overlay_cfg').then(c => { cfg = c; pos = c.pos; applyTheme(c.theme, c.accent); }).catch(() => {});
    cfgLoad().finally(load);
    setInterval(cfgLoad, 15000);   // Theme-Wechsel in der App übernehmen
    setInterval(load, 5000);
})();
