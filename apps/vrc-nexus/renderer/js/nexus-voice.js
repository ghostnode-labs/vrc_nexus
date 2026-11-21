/* VRC Nexus – 📞 Sprachanrufe 1:1 (3.7, nur PC-App): WebRTC (Opus, DTLS-SRTP), Signalisierung E2E über den Chat-Briefkasten.
 * Anruf-Leiste unten rechts: Klingeln (annehmen/ablehnen), Dauer, Mikro aus, Push-to-Talk, Lautstärke, Auflegen.
 * Einstellungen (Mikrofon, Rausch-/Echo-Unterdrückung, PTT-Taste, eigener STUN/TURN-Server) im Chat unter „📞 Anrufe“. */
(function () {
    const UI = window.NexusUI;
    if (!UI || !window.RTCPeerConnection || (window.VRCX && window.VRCX.mobile)) return;
    const esc = UI.esc, api = (a, d) => UI.api(a, d), toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    const ls = { get(k, d) { try { const v = localStorage.getItem('nxv:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('nxv:' + k, JSON.stringify(v)); } catch (e) { /* egal */ } } };
    let st = null;            // { call, uid, name, dir: 'out'|'in', phase: 'calling'|'ringing'|'connecting'|'connected', pc, stream, audio, since, muted, ptt, pttDown }
    let ring = null, bar = null, pollT = null, ringT = null, tick = null, ringAudio = null;

    const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
    const nameOf = (uid, n) => n || (((UI.state && UI.state() && UI.state().friends) || []).find(f => f.id === uid) || {}).name || uid.slice(0, 13) + '…';
    const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

    // ---------- Klingelton (selbst erzeugt, kein Audio-Datei) ----------
    function ringtone(on) {
        if (!on) { if (ringAudio) { clearInterval(ringAudio.t); try { ringAudio.ctx.close(); } catch (e) { /* egal */ } ringAudio = null; } return; }
        if (ringAudio) return;
        try {
            const ctx = new AudioContext(), beep = () => { [0, 0.25].forEach(d => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 660; g.gain.value = 0.08; o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.18); }); };
            beep(); ringAudio = { ctx, t: setInterval(beep, 2000) };
        } catch (e) { /* ohne Ton */ }
    }

    // ---------- Anruf-Leiste ----------
    function draw() {
        if (!bar) { bar = document.createElement('div'); bar.className = 'nv-bar'; document.body.appendChild(bar); bind(); }
        if (!st && !ring) { bar.hidden = true; bar.innerHTML = ''; return; }
        bar.hidden = false;
        if (ring && !st) {
            bar.innerHTML = '<div class="nv-who">📞 <b>' + esc(nameOf(ring.from, ring.name)) + '</b><small>' + esc(T('ruft dich an …')) + '</small></div>'
                + '<div class="nv-btns"><button type="button" class="btn btn-gold" data-nv="accept">✔ ' + esc(T('Annehmen')) + '</button><button type="button" class="btn btn-danger" data-nv="decline">✕ ' + esc(T('Ablehnen')) + '</button></div>';
            return;
        }
        const ph = { calling: 'klingelt …', connecting: 'verbindet …', connected: '', ringing: '' }[st.phase] || '';
        const secs = st.since ? Math.floor((Date.now() - st.since) / 1000) : 0;
        bar.innerHTML = '<div class="nv-who">📞 <b>' + esc(nameOf(st.uid, st.name)) + '</b><small class="nv-time">' + (ph ? esc(T(ph)) : fmt(secs)) + '</small></div>'
            + (st.phase === 'connected' ? '<div class="nv-lv"><span class="nv-sp" data-who="them">🗣 ' + esc(nameOf(st.uid, st.name)) + '<i><u></u></i></span><span class="nv-sp" data-who="me">🎙 ' + esc(T('Du')) + '<i><u></u></i></span></div>' : '')
            + '<div class="nv-btns">'
            + '<button type="button" class="btn btn-sm' + (st.muted ? ' btn-danger' : '') + '" data-nv="mute" title="' + esc(T('Mikro an/aus')) + '">' + (st.muted ? '🔇' : '🎙') + '</button>'
            + '<button type="button" class="btn btn-sm' + (st.ptt ? ' btn-gold' : '') + '" data-nv="ptt" title="' + esc(T('Push-to-Talk: nur sprechen, solange die Taste gedrückt ist')) + '">PTT</button>'
            + (st.ptt ? '<button type="button" class="btn btn-sm nv-talk' + (st.pttDown ? ' on' : '') + '" data-nv="talk">' + esc(T('Halten zum Sprechen')) + ' (' + esc(keyName(ls.get('ptt_key', 'KeyV'))) + ')</button>' : '')
            + '<label class="nv-vol" title="' + esc(T('Lautstärke')) + '">🔊<input type="range" min="0" max="100" value="' + Math.round(ls.get('volume', 1) * 100) + '" data-nv="vol"></label>'
            + '<button type="button" class="btn btn-sm btn-danger" data-nv="hangup">✆ ' + esc(T('Auflegen')) + '</button></div>';
    }
    const keyName = c => c.replace(/^Key/, '').replace(/^Digit/, '').replace('Space', T('Leertaste'));
    function micOn() { if (!st || !st.stream) return; const on = !st.muted && (!st.ptt || st.pttDown); st.stream.getAudioTracks().forEach(t => { t.enabled = on; }); }
    function bind() {
        bar.addEventListener('click', e => {
            const b = e.target.closest('[data-nv]'); if (!b) return;
            const a = b.dataset.nv;
            if (a === 'accept') return accept();
            if (a === 'decline') { const r = ring; ring = null; ringtone(false); draw(); return api('voice_decline', { call: r.call }).catch(() => {}); }
            if (a === 'hangup') return hangup(true);
            if (a === 'mute') { st.muted = !st.muted; micOn(); return draw(); }
            if (a === 'ptt') { st.ptt = !st.ptt; ls.set('ptt', st.ptt); st.pttDown = false; micOn(); return draw(); }
        });
        bar.addEventListener('input', e => { if (e.target.dataset.nv === 'vol') { const v = e.target.value / 100; ls.set('volume', v); if (st && st.audio) st.audio.volume = v; } });
        const talk = down => { if (!st || !st.ptt) return; st.pttDown = down; micOn(); const b = bar.querySelector('.nv-talk'); if (b) b.classList.toggle('on', down); };
        bar.addEventListener('pointerdown', e => { if (e.target.closest('[data-nv="talk"]')) talk(true); });
        window.addEventListener('pointerup', () => { if (st && st.pttDown) talk(false); });
        const typing = () => document.activeElement && document.activeElement.matches('input, textarea, select, [contenteditable]');
        window.addEventListener('keydown', e => { if (st && st.ptt && !e.repeat && e.code === ls.get('ptt_key', 'KeyV') && !typing()) { e.preventDefault(); talk(true); } });
        window.addEventListener('keyup', e => { if (st && st.ptt && e.code === ls.get('ptt_key', 'KeyV')) talk(false); });
        window.addEventListener('blur', () => { if (st && st.pttDown) talk(false); });
    }

    // ---------- 4.0: aktiven Sprecher anzeigen (Pegel beider Seiten, nur lokal gemessen) ----------
    let meter = null;
    function meterAdd(who, stream) {
        try {
            if (!meter) {
                meter = { ctx: new AudioContext(), an: {}, lv: { me: 0, them: 0 }, t: setInterval(meterTick, 100) };
            }
            const src = meter.ctx.createMediaStreamSource(stream), an = meter.ctx.createAnalyser();
            an.fftSize = 512; src.connect(an);
            meter.an[who] = { an, buf: new Float32Array(an.fftSize) };
        } catch (e) { /* ohne Anzeige */ }
    }
    function meterTick() {
        if (!meter || !bar) return;
        for (const who of ['me', 'them']) {
            const m = meter.an[who];
            let v = 0;
            if (m && !(who === 'me' && st && (st.muted || (st.ptt && !st.pttDown)))) { m.an.getFloatTimeDomainData(m.buf); let sum = 0; for (const x of m.buf) sum += x * x; v = Math.sqrt(sum / m.buf.length); }
            meter.lv[who] = Math.max(v, meter.lv[who] * 0.8);   // sanft abklingen
            const el = bar.querySelector('.nv-sp[data-who="' + who + '"]');
            if (el) { el.classList.toggle('on', meter.lv[who] > 0.02); const u = el.querySelector('u'); if (u) u.style.width = Math.min(100, Math.round(meter.lv[who] * 400)) + '%'; }
        }
    }
    function meterStop() { if (!meter) return; clearInterval(meter.t); try { meter.ctx.close(); } catch (e) { /* egal */ } meter = null; }

    // ---------- WebRTC ----------
    async function media() {
        const dev = ls.get('mic', '');
        return navigator.mediaDevices.getUserMedia({ audio: { deviceId: dev ? { exact: dev } : undefined, echoCancellation: ls.get('echo', true), noiseSuppression: ls.get('noise', true), autoGainControl: ls.get('agc', true), channelCount: 1 }, video: false })
            .catch(e => { throw new Error(T('Kein Zugriff aufs Mikrofon') + ' (' + e.name + ') – ' + T('Windows: Einstellungen → Datenschutz → Mikrofon → Desktop-Apps erlauben.')); });
    }
    async function peer(stream) {
        const ice = await api('voice_ice').then(r => r.ice || []).catch(() => []);
        if (!ice.length) toast(T('Kein STUN/TURN-Server eingerichtet – Anrufe klappen so nur im selben Netz.'), true);
        const pc = new RTCPeerConnection({ iceServers: ice, bundlePolicy: 'max-bundle' });
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        meterAdd('me', stream);
        const audio = new Audio(); audio.autoplay = true; audio.volume = ls.get('volume', 1);
        const out = ls.get('speaker', ''); if (out && audio.setSinkId) audio.setSinkId(out).catch(() => {});
        pc.ontrack = e => { audio.srcObject = e.streams[0]; audio.play().catch(() => {}); meterAdd('them', e.streams[0]); };
        pc.onconnectionstatechange = () => {
            if (!st || st.pc !== pc) return;
            if (pc.connectionState === 'connected' && st.phase !== 'connected') { st.phase = 'connected'; st.since = Date.now(); draw(); }
            if (pc.connectionState === 'failed') { toast(T('Verbindung fehlgeschlagen – STUN/TURN-Server prüfen (Chat → 📞 Anrufe).'), true); hangup(true); }
        };
        return { pc, audio };
    }
    const gathered = pc => new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 4000); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
    function cleanup() {
        if (st) { try { st.pc && st.pc.close(); } catch (e) { /* egal */ } if (st.stream) st.stream.getTracks().forEach(t => t.stop()); if (st.audio) { st.audio.srcObject = null; } }
        meterStop();
        st = null; clearTimeout(ringT); clearInterval(tick); tick = null; draw(); schedule();
    }
    async function hangup(send) {
        if (!st) return;
        const s = st, secs = s.since ? Math.floor((Date.now() - s.since) / 1000) : 0;
        cleanup();
        if (send) await api('voice_hangup', { call: s.call, secs }).catch(() => {});
        if (window.NexusCommunity && window.NexusCommunity.refreshChat) window.NexusCommunity.refreshChat();
    }
    async function call(uid, name) {
        if (st || ring) return toast(T('Es läuft schon ein Anruf.'), true);
        let stream;
        try { stream = await media(); } catch (e) { return toast('⚠ ' + e.message, true); }
        st = { call: hex(8), uid, name, dir: 'out', phase: 'calling', stream, muted: false, ptt: ls.get('ptt', false), pttDown: false };
        micOn(); draw();
        try {
            const { pc, audio } = await peer(stream);
            Object.assign(st, { pc, audio });
            await pc.setLocalDescription(await pc.createOffer());
            await gathered(pc);
            if (!st) return;
            await api('voice_offer', { uid, call: st.call, sdp: pc.localDescription.sdp });
            ringT = setTimeout(() => { if (st && st.phase === 'calling') { toast(T('Niemand hat abgenommen.')); hangup(true); } }, 60000);
            tick = setInterval(draw, 1000);
            schedule();
        } catch (e) { toast('⚠ ' + e.message, true); const s = st; cleanup(); if (s) api('voice_hangup', { call: s.call, secs: 0 }).catch(() => {}); }
    }
    async function accept() {
        const r = ring; if (!r) return;
        ring = null; ringtone(false);
        let stream;
        try { stream = await media(); } catch (e) { toast('⚠ ' + e.message, true); api('voice_decline', { call: r.call }).catch(() => {}); return draw(); }
        st = { call: r.call, uid: r.from, name: r.name, dir: 'in', phase: 'connecting', stream, muted: false, ptt: ls.get('ptt', false), pttDown: false };
        micOn(); draw();
        try {
            const inc = (await api('voice_incoming')).ring;
            if (!inc || inc.call !== r.call) throw new Error(T('Der Anruf ist nicht mehr da.'));
            const { pc, audio } = await peer(stream);
            Object.assign(st, { pc, audio });
            await pc.setRemoteDescription({ type: 'offer', sdp: inc.sdp });
            await pc.setLocalDescription(await pc.createAnswer());
            await gathered(pc);
            if (!st) return;
            await api('voice_accept', { call: r.call, sdp: pc.localDescription.sdp });
            tick = setInterval(draw, 1000);
        } catch (e) { toast('⚠ ' + e.message, true); cleanup(); }
    }

    // ---------- Abholen (schnell, solange es klingelt oder ein Anruf läuft) ----------
    function schedule() { clearTimeout(pollT); pollT = setTimeout(poll, st || ring ? 1500 : 4000); }
    function poll() {
        api('voice_poll', st || ring ? { fast: '1' } : {}).then(async d => {
            for (const ev of d.events || []) {
                if (ev.op === 'answer' && st && st.call === ev.call && st.dir === 'out' && st.pc) {
                    st.phase = 'connecting'; clearTimeout(ringT); draw();
                    try { await st.pc.setRemoteDescription({ type: 'answer', sdp: ev.sdp }); } catch (e) { toast('⚠ ' + e.message, true); hangup(true); }
                }
                if (['hangup', 'decline', 'busy'].includes(ev.op) && st && (st.call === ev.call)) {
                    toast(ev.op === 'busy' ? T('Besetzt.') : ev.op === 'decline' ? T('Anruf abgelehnt.') : T('Anruf beendet.'));
                    hangup(false);
                }
                if ((ev.op === 'elsewhere' || ev.op === 'hangup') && ring && (ring.call === ev.call || !ev.call)) { ring = null; ringtone(false); draw(); }
            }
            if (d.ring && !st && (!ring || ring.call !== d.ring.call)) { ring = d.ring; ringtone(true); draw(); }
            if (!d.ring && ring) { ring = null; ringtone(false); draw(); }
        }).catch(() => {}).finally(schedule);
    }

    // ---------- Einstellungen (im Chat unter „📞 Anrufe“) ----------
    async function settings(el) {
        let devs = [];
        try { devs = await navigator.mediaDevices.enumerateDevices(); } catch (e) { devs = []; }
        const ice = await api('voice_ice').catch(() => ({ ice: [], custom: {} }));
        const opt = (kind, cur) => '<option value="">' + esc(T('Standard')) + '</option>' + devs.filter(d => d.kind === kind && d.deviceId && d.deviceId !== 'default').map(d => '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === cur ? ' selected' : '') + '>' + esc(d.label || d.deviceId.slice(0, 8)) + '</option>').join('');
        const c = ice.custom || {};
        el.innerHTML = '<div class="nv-set">'
            + '<label>🎙 ' + esc(T('Mikrofon')) + '<select data-nvs="mic">' + opt('audioinput', ls.get('mic', '')) + '</select></label>'
            + '<label>🔈 ' + esc(T('Lautsprecher')) + '<select data-nvs="speaker">' + opt('audiooutput', ls.get('speaker', '')) + '</select></label>'
            + '<label class="check small"><input type="checkbox" data-nvs="noise"' + (ls.get('noise', true) ? ' checked' : '') + '> ' + esc(T('Geräuschunterdrückung')) + '</label>'
            + '<label class="check small"><input type="checkbox" data-nvs="echo"' + (ls.get('echo', true) ? ' checked' : '') + '> ' + esc(T('Echo-Unterdrückung')) + '</label>'
            + '<label class="check small"><input type="checkbox" data-nvs="agc"' + (ls.get('agc', true) ? ' checked' : '') + '> ' + esc(T('Automatische Lautstärke')) + '</label>'
            + '<label class="check small"><input type="checkbox" data-nvs="ptt"' + (ls.get('ptt', false) ? ' checked' : '') + '> ' + esc(T('Push-to-Talk standardmäßig an')) + '</label>'
            + '<label>' + esc(T('Push-to-Talk-Taste')) + ' <button type="button" class="btn btn-sm" data-nvs="key">' + esc(keyName(ls.get('ptt_key', 'KeyV'))) + '</button> <small class="muted">' + esc(T('wirkt, solange VRC Nexus im Vordergrund ist')) + '</small></label>'
            + '<h4>🛰 ' + esc(T('STUN/TURN-Server')) + '</h4>'
            + '<p class="small muted">' + esc(ice.ice && ice.ice.length ? T('Aktiv:') + ' ' + ice.ice.map(x => [].concat(x.urls).join(', ')).join(' · ') : T('Noch kein Server – Anrufe klappen so nur im selben Netz. Die Webseite liefert den Server, sobald er dort eingerichtet ist; oder hier einen eigenen eintragen.')) + '</p>'
            + '<form class="nv-ice"><input type="text" name="urls" value="' + esc(c.urls || '') + '" placeholder="turn:mein-server.de:3478 stun:mein-server.de:3478">'
            + '<input type="text" name="user" value="' + esc(c.user || '') + '" placeholder="' + esc(T('Benutzername (optional)')) + '" autocomplete="off">'
            + '<input type="password" name="pass" placeholder="' + esc(c.has_pass ? T('•••• gespeichert – neu eintragen') : T('Passwort (optional)')) + '" autocomplete="new-password">'
            + '<button class="btn btn-sm">' + esc(T('Speichern')) + '</button></form>'
            + '<p class="small muted">🔒 ' + esc(T('Anrufe sind Ende-zu-Ende-verschlüsselt (DTLS-SRTP). Der Verbindungsaufbau läuft verschlüsselt über den Chat – auch der TURN-Server sieht nur verschlüsselte Sprachdaten.')) + '</p></div>';
        el.onchange = e => { const k = e.target.dataset.nvs; if (!k) return; ls.set(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value); toast(T('Gespeichert.')); };
        el.onclick = e => {
            if (!e.target.closest('[data-nvs="key"]')) return;
            const b = e.target.closest('[data-nvs="key"]'); b.textContent = T('Taste drücken …');
            const h = ev => { ev.preventDefault(); window.removeEventListener('keydown', h, true); ls.set('ptt_key', ev.code); b.textContent = keyName(ev.code); };
            window.addEventListener('keydown', h, true);
        };
        el.onsubmit = e => { e.preventDefault(); const f = e.target; api('voice_cfg', { urls: f.urls.value, user: f.user.value, pass: f.pass.value }).then(r => { toast(T(r.msg)); settings(el); }).catch(x => toast(x.message, true)); };
    }

    window.NexusVoice = { call, settings, busy: () => !!(st || ring) };
    if (window.VRCX && window.VRCX.connected) schedule();
})();
