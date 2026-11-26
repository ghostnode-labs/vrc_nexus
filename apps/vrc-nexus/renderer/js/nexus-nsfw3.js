/* VRC Nexus – 🔞 NSFW 3.0 „✨ Extras“: Funscript, Spiele, Aufnahme & Wiedergabe, Profile je Avatar, Welt-Brücke, Musik. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, b) => UI.toast(m, b), T = s => (window.t ? window.t(s) : s);
    let d = null, at = 0, busy = false, music = null, musicT = null;
    const sec = (t, html) => '<div class="nc-card"><h4>' + t + '</h4>' + html + '</div>';
    const sw = (k, on, label) => '<label class="check small"><input type="checkbox" data-n3c="' + k + '"' + (on ? ' checked' : '') + '> ' + label + '</label>';
    const btn = (a, label, cls, extra) => '<button type="button" class="btn btn-sm ' + (cls || '') + '" data-n3="' + a + '"' + (extra || '') + '>' + label + '</button>';
    const refresh = () => { const el = document.getElementById('n3Box'); if (el && d) el.innerHTML = inner(); };
    function load(force) {
        if (busy || (!force && Date.now() - at < 2000)) return;
        busy = true;
        api('toys3_get').then(r => { d = r; at = Date.now(); refresh(); }).catch(() => {}).finally(() => { busy = false; });
    }
    const run = (act, data) => api(act, data || {}).then(r => { d = r; at = Date.now(); if (r.msg) toast(T(r.msg)); refresh(); return r; }).catch(x => toast('⚠ ' + x.message, true));

    function inner() {
        const c = d.cfg, f = d.fun, g = d.game, r = d.rec;
        let h = sec('📜 ' + esc(T('Funscript')), '<p class="small muted">' + esc(T('.funscript-Datei laden: Vibration folgt der Bewegungsgeschwindigkeit, Stroker folgen den Positionen.')) + '</p>'
            + '<div class="nc-row"><label class="btn btn-sm">📂 ' + esc(T('Datei wählen')) + '<input type="file" accept=".funscript,.json" data-n3file="1" hidden></label>'
            + (f ? '<b>' + esc(f.name) + '</b> <span class="small muted">' + (f.loaded ? f.seconds + ' s' : f.pos_s + ' / ' + f.seconds + ' s') + '</span>' : '') + '</div>'
            + (f ? '<div class="nc-row">' + (f.loaded ? btn('funstart', '▶ ' + esc(T('Start')), 'btn-gold') + '<label class="check small"><input type="checkbox" id="n3Loop"> ' + esc(T('wiederholen')) + '</label>' : btn('funstop', '⏹ ' + esc(T('Stopp')), 'ns-stop')) + '</div>' : ''));
        h += sec('🎲 ' + esc(T('Spiele')), (g ? '<p><b>' + esc(T({ dice: 'Würfel', roulette: 'Roulette', edge: 'Edging-Spiel' }[g.kind])) + '</b> · ' + esc(T('Runde')) + ' ' + g.round + '/' + g.rounds
                + (g.kind === 'edge' ? ' · ' + g.score + ' ' + esc(T('Punkte')) : ' · ' + g.lv + ' %') + (g.pause ? ' · ⏸' : '') + '</p><div class="nc-row">' + (g.kind === 'edge' ? btn('hold', '✋ ' + esc(T('Halt!')), 'btn-gold') : '') + btn('gamestop', '⏹ ' + esc(T('Beenden')), 'ns-stop') + '</div>'
            : '<div class="nc-row">' + btn('game', '🎲 ' + esc(T('Würfel')), '', ' data-kind="dice"') + btn('game', '🎰 ' + esc(T('Roulette')), '', ' data-kind="roulette"') + btn('game', '🎯 ' + esc(T('Edging-Spiel')), '', ' data-kind="edge"') + '</div>'
                + '<p class="small muted">' + esc(T('Würfel: zufällige Stärke und Dauer je Runde · Roulette: ein zufälliges Gerät · Edging: Stärke steigt – rechtzeitig „Halt!“ drücken gibt Punkte, über die Grenze kostet die Runde.')) + '</p>')
            + (d.last_game && !g ? '<p class="small">🏁 ' + esc(T('Letztes Spiel')) + ': ' + (d.last_game.kind === 'edge' ? d.last_game.score + ' ' + esc(T('Punkte')) : d.last_game.rolls.map(x => x.lv + '%·' + x.secs + 's').join(' ')) + '</p>' : ''));
        h += sec('⏺ ' + esc(T('Aufnahme & Wiedergabe')), '<div class="nc-row">' + (r.recording !== null ? '<b>⏺ ' + r.recording + ' s</b><input type="text" id="n3RecName" maxlength="40" placeholder="' + esc(T('Name')) + '">' + btn('recstop', '💾 ' + esc(T('Speichern')), 'btn-gold')
                : btn('recstart', '⏺ ' + esc(T('Aufnahme starten')))) + (r.playing ? ' <span class="small">▶ ' + esc(r.playing) + '</span>' + btn('playstop', '⏹', 'ns-stop') : '') + '</div>'
            + (r.list.length ? '<ul class="n3-recs">' + r.list.map(x => '<li><b>' + esc(x.name) + '</b> <span class="small muted">' + x.secs + ' s · ' + x.tracks + ' ' + esc(T('Spur(en)')) + '</span> ' + btn('play', '▶', '', ' data-id="' + esc(x.id) + '"') + btn('recdel', '✕', '', ' data-id="' + esc(x.id) + '"') + '</li>').join('') + '</ul>' : '<p class="small muted">' + esc(T('Nimmt auf, was deine Geräte gerade machen (10 Werte pro Sekunde, max. 10 min) – später genauso abspielen.')) + '</p>'));
        h += sec('🧸 ' + esc(T('Profil je Avatar')), '<p class="small">' + (d.profile ? '✔ ' + esc(T('Für den getragenen Avatar ist ein Profil gespeichert.')) : esc(T('Für den getragenen Avatar ist noch kein Profil gespeichert.'))) + '</p>'
            + '<div class="nc-row">' + btn('profsave', '💾 ' + esc(T('Aktuelle Einstellungen für diesen Avatar speichern'))) + (d.profile ? btn('profdel', '✕ ' + esc(T('Profil löschen'))) : '') + '</div>'
            + sw('profiles_auto', c.profiles_auto, esc(T('beim Avatarwechsel automatisch laden (Verknüpfungen, PCS, Puls, Stimme, Geräte)'))));
        h += sec('🌍 ' + esc(T('Welt-Brücke')), sw('world_bridge', c.world_bridge, '<b>' + esc(T('Welten dürfen Spielzeug auslösen')) + '</b>')
            + '<div class="nc-row"><span class="small">' + esc(T('höchstens')) + '</span><input type="range" min="5" max="100" step="5" value="' + c.world_max + '" data-n3c="world_max"><span class="small">' + c.world_max + ' %</span>' + (d.world ? ' <span class="vx-pill">🌍 ' + d.world + ' %</span>' : '') + '</div>'
            + '<p class="small muted">' + esc(T('Welten mit dem VRC-Nexus-Baustein schreiben „[NexusToy] pulse 0.6 2“ ins VRChat-Log. Nur frische Zeilen zählen, Consent-Ampel und Panik gelten immer.')) + '</p>');
        h += sec('🎵 ' + esc(T('Musik')), sw('music_on', c.music_on, '<b>' + esc(T('Musik (System-Ton) steuert Spielzeug')) + '</b>')
            + '<div class="nc-row"><span class="small">' + esc(T('Verstärkung')) + '</span><input type="range" min="10" max="400" step="10" value="' + c.music_gain + '" data-n3c="music_gain"><span class="small">' + c.music_gain + ' %</span>'
            + (c.music_on ? (music ? btn('musicoff', '⏹ ' + esc(T('Ton-Erfassung beenden'))) + ' <span class="vx-pill">🎵 ' + Math.round(music.lv * 100) + ' %</span>' : btn('musicon', '🎧 ' + esc(T('Ton-Erfassung starten')), 'btn-gold')) : '') + '</div>'
            + '<p class="small muted">' + esc(T('Gemessen wird nur die Lautstärke – nichts wird aufgenommen oder gesendet.')) + '</p>');
        return h;
    }
    async function musicStart() {
        if (music) return;
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
            stream.getVideoTracks().forEach(t => t.stop());
            if (!stream.getAudioTracks().length) throw new Error(T('kein Ton freigegeben'));
            const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(stream).connect(an);
            const buf = new Float32Array(an.fftSize);
            music = { stream, ctx, lv: 0, sent: -1, at: 0 };
            musicT = setInterval(() => {
                an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x;
                const lv = Math.min(1, Math.max(0, (Math.sqrt(s / buf.length) - 0.01) * 5));
                music.lv = Math.max(lv, music.lv * 0.8);
                if (Math.abs(music.lv - music.sent) > 0.03 || Date.now() - music.at > 800) { music.sent = music.lv; music.at = Date.now(); api('toys3_music', { lv: music.lv.toFixed(3) }).catch(() => {}); }
            }, 100);
            refresh();
        } catch (e) { toast(T('Keine Ton-Erfassung') + ' (' + (e.message || e.name) + ')', true); }
    }
    function musicStop() { if (!music) return; clearInterval(musicT); music.stream.getTracks().forEach(t => t.stop()); try { music.ctx.close(); } catch (e) { /* egal */ } music = null; refresh(); }

    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('#n3Box [data-n3]');
        if (!b) return;
        const a = b.dataset.n3;
        if (a === 'funstart') return run('toys3_fun_start', { loop: (document.getElementById('n3Loop') || {}).checked ? '1' : '0' });
        if (a === 'funstop') return run('toys3_fun_stop');
        if (a === 'game') return run('toys3_game', { kind: b.dataset.kind });
        if (a === 'hold') return run('toys3_hold');
        if (a === 'gamestop') return run('toys3_game_stop');
        if (a === 'recstart') return run('toys3_rec_start');
        if (a === 'recstop') return run('toys3_rec_stop', { name: (document.getElementById('n3RecName') || {}).value || '' });
        if (a === 'play') return run('toys3_play', { id: b.dataset.id });
        if (a === 'playstop') return run('toys3_play_stop');
        if (a === 'recdel') { if (!confirm(T('Aufnahme löschen?'))) return; return run('toys3_rec_delete', { id: b.dataset.id }); }
        if (a === 'profsave') return run('toys3_profile_save');
        if (a === 'profdel') return run('toys3_profile_delete');
        if (a === 'musicon') return musicStart();
        if (a === 'musicoff') return musicStop();
    });
    document.addEventListener('change', e => {
        const el = e.target;
        if (el.closest && el.closest('#n3Box') && el.matches('[data-n3file]') && el.files && el.files[0]) {
            const file = el.files[0]; el.value = '';
            if (file.size > 20 * 1024 * 1024) return toast(T('Datei zu groß.'), true);
            return file.text().then(txt => run('toys3_fun_load', { name: file.name.replace(/\.(funscript|json)$/i, ''), json: txt }));
        }
        const k = el.dataset && el.dataset.n3c;
        if (!k || !el.closest('#n3Box')) return;
        run('toys3_cfg', { [k]: el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value }).then(() => { if (k === 'music_on' && !el.checked) musicStop(); });
    });
    window.NexusNsfw3 = {
        html() { load(); return '<div id="n3Box">' + (d ? inner() : '<div class="vx-loading">…</div>') + '</div>'; },
    };
})();
