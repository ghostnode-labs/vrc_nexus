/* VRC Nexus – ❤️ NSFW / ERP (erscheint erst mit gültigem Freischalt-Schlüssel bzw. für den Besitzer):
 * Panik-Knopf, Privat-Modus, SFW/NSFW-Avatarpaare, Grenzen-Karte, 18+-Instanz, Spielzeug (Intiface/Buttplug + OGB),
 * Handy-Fernbedienung, und für den Besitzer: Admin mit Schlüssel-Generator. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    let st = null, box = null, lastToken = '', tPoll = null, busy = false;
    const ls = (k, d) => { try { const v = localStorage.getItem('nx_nsfw_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem('nx_nsfw_' + k, JSON.stringify(v)); } catch (e) { /* egal */ } };
    let sub = ls('sub', 'main'), pc = Object.assign({ speed: 1, strength: 60, secs: 0, device: 'all' }, ls('pat', {})), tod = null, dice = null;
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const MOODS = ['🔥 in Stimmung', '🥰 kuschelig drauf', '😈 frech heute', '💤 nur chillen', '🚫 heute nur SFW', '💌 DMs offen', '🙈 schüchtern – sprich mich an', '⏳ gleich weg'];
    const TRUTH = ['Was war dein schönster Moment in VR?', 'Welcher Avatar hier gefällt dir am meisten?', 'Wen würdest du gern mal privat treffen?', 'Was ist dein heimlicher Crush-Typ?', 'Was war das Mutigste, was du in VRChat gemacht hast?',
        'Welches Kompliment hörst du am liebsten?', 'Was macht dich sofort verlegen?', 'Was war dein peinlichster Moment in VR?', 'Welches Detail an Avataren findest du am heißesten?', 'Was würdest du nie öffentlich zugeben?'];
    const DARE = ['Mach jemandem hier ein ehrliches Kompliment.', 'Flüstere der Person links von dir etwas Nettes.', 'Tanz 20 Sekunden lang.', 'Gib jemandem eine Umarmung (wenn er/sie mag).', 'Wechsle für 5 Minuten in einen Avatar, den jemand anderes aussucht.',
        'Sag 30 Sekunden lang nur Flirt-Sprüche.', 'Lass jemanden deinen nächsten Chatbox-Text bestimmen.', 'Setz dich jemandem auf den Schoß (mit Erlaubnis).', 'Mach dein bestes Schnurren.', 'Gib jemandem einen Headpat.'];
    const D_ACT = ['💋 küssen', '🤗 kuscheln', '✋ streicheln', '😬 anknabbern', '🗣 flüstern', '🫂 umarmen', '👃 schnuppern', '🪶 kitzeln'];
    const D_SPOT = ['Hals', 'Ohr', 'Hand', 'Wange', 'Nacken', 'Rücken', 'Stirn', 'Schulter'];
    const btn = () => document.querySelector('#tabs [data-tab="nsfw"]');
    /** 3.3.1: Panik-Knopf oben in der Kopfzeile, solange NSFW an ist – Panik-Aktionen + NSFW wieder aus */
    function headPanic() {
        let p = document.getElementById('hdPanic');
        if (!p) {
            const head = document.querySelector('.vx-head-r');
            if (!head) return null;
            p = document.createElement('button');
            p.type = 'button'; p.id = 'hdPanic'; p.className = 'vx-hbtn vx-hpanic'; p.hidden = true;
            p.title = T('Panik: sicherer Avatar, Chatbox leer, Spielzeug stopp – und NSFW wieder aus');
            p.innerHTML = '<span>🚨</span><em>' + esc(T('Panik')) + '</em>';   // gleiche Form wie Direkt-Zugriff / Einstellungen
            head.insertBefore(p, document.getElementById('me'));
            p.addEventListener('click', () => {
                p.disabled = true;
                api('nsfw_panic').then(d => toast(d.msg)).catch(x => toast(x.message, true))
                    .then(() => api('acct_nsfw', { on: '0' })).then(d => { if (d && d.msg) toast(d.msg); }).catch(x => toast(x.message, true))
                    .finally(() => { p.disabled = false; refreshAccess(); if (window.NexusAccount) window.NexusAccount.refresh(); const a = document.querySelector('#tabs .vx-tabbtn.active'); if (a && a.dataset.tab === 'nsfw') UI.tab('home'); });
            });
        }
        return p;
    }

    /** Menüpunkt zeigen/verstecken – beim Start und nach dem Freischalten */
    function refreshAccess() {
        return api('nsfw_state').then(d => {
            st = d;
            if (window.NexusNsfw2 && d.toys && d.toys.cfg) window.NexusNsfw2.micSync(!!(d.toys.cfg.voice && d.toys.cfg.voice.on) && d.access.unlocked);
            const b = btn();
            if (b) b.hidden = !d.access.unlocked;
            const hp = headPanic(); if (hp) hp.hidden = !d.access.unlocked;
            const ad = document.querySelector('#tabs [data-tab="admin"]'); if (ad) ad.hidden = !d.access.owner;
            if (!d.access.owner) { document.querySelectorAll('#tabs [data-tab="admin"], [data-pane="admin"], [data-tab-go="admin"]').forEach(x => x.remove()); delete window.NexusAdmin; }
            const roleKey = (d.access.owner ? 'o' : '') + (d.access.mod ? 'm' : '');
            document.body.classList.toggle('is-owner', !!d.access.owner);
            document.body.classList.toggle('is-mod', !!d.access.mod && !d.access.owner);
            if (roleKey !== refreshAccess.roles) { refreshAccess.roles = roleKey; if (window.NexusI18n && window.NexusI18n.corner) window.NexusI18n.corner(); }
            if (box && !box.closest('[hidden]')) render();
            return d;
        }).catch(() => {});
    }
    const sec = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '"><h4>' + t + '</h4>' + html + '</div>';
    const chk = (k, on, label) => '<label class="check small"><input type="checkbox" data-nk="' + k + '"' + (on ? ' checked' : '') + '> ' + label + '</label>';

    function render() {
        if (!box || !st) return;
        if (busy || (box.contains(document.activeElement) && document.activeElement.matches('input[type=text], textarea, input[type=number], select'))) return;
        const a = st.access;
        if (!a.unlocked) { box.innerHTML = '<div class="nc-grid"><div class="nc-card"><h4>🔞 NSFW ist gesperrt</h4><p class="small">' + esc(a.reason || '') + '</p><p class="small muted">NSFW gibt es nur mit „Verified 18+“: VRChat-Altersverifizierung (18+) abgeschlossen – Nexus fragt das direkt bei VRChat ab. Danach NSFW bewusst einschalten – jederzeit wieder ausschaltbar.</p><div id="nsAcct"></div></div></div>'; if (window.NexusAccount) window.NexusAccount.render(box.querySelector('#nsAcct')); return; }
        const c = st.cfg || {}, t = st.toys, r = st.remote, has = f => a.features.includes(f);
        let h = '<div class="ns-top"><span class="muted small">🚨 ' + esc(T('Panik-Knopf: oben in der Kopfzeile')) + '</span>'
            + '<button type="button" class="btn ' + (st.private ? 'btn-gold' : '') + '" data-ns="private">🕶 Privat-Modus ' + (st.private ? 'AN' : 'aus') + '</button>'
            + '<span class="muted small">' + (a.owner ? '👑 Besitzer' : '🔓 freigeschaltet' + (a.exp ? ' bis ' + esc(new Date(a.exp * 1000).toLocaleDateString(window.nxLoc ? nxLoc() : 'de-DE')) : '')) + '</span></div>';
        const tabs = [['main', '🏠 Übersicht'], ['toys', '🎮 Spielzeug', has('toys') && t], ['lust', '🔥 Lust & PCS', has('toys') && t && window.NexusNsfw2], ['fun', '🎲 Spielereien'], ['x3', '✨ Extras', has('toys') && t && window.NexusNsfw3], ['net', '🌐 Fernsteuerung', has('toys') && st.tremote], ['phone', '📱 Handy', has('remote') && r]].filter(x => x.length < 3 || x[2]);
        if (!tabs.some(x => x[0] === sub)) sub = 'main';
        h += '<div class="chips ns-sub">' + tabs.map(([k, n]) => '<button type="button" class="chip' + (sub === k ? ' on' : '') + '" data-nsub="' + k + '">' + n + '</button>').join('') + '</div>';
        h += '<div class="nc-grid">';
        if (sub === 'fun') h += funHtml(t, has('toys')) + (has('toys') && t && window.NexusNsfw2 ? window.NexusNsfw2.funHtml(t) : '');
        if (sub === 'lust' && has('toys') && t && window.NexusNsfw2) h += window.NexusNsfw2.lustHtml(t);
        if (sub === 'x3' && has('toys') && t && window.NexusNsfw3) h += window.NexusNsfw3.html(t);
        if (sub === 'net' && st.tremote) h += netHtml(st.tremote, t);
        if (sub === 'main') {
        // Avatar-Paare
        h += sec('🎭 SFW ↔ NSFW-Avatar', '<div class="ns-pairs">' + (c.pairs || []).map((p, i) => '<button type="button" class="btn ' + (st.current_avatar === p.nsfw ? 'btn-gold' : '') + '" data-ns="avatar" data-i="' + i + '">'
            + (st.current_avatar === p.nsfw ? '🔞 ' : '🙂 ') + esc(p.name || 'Avatar ' + (i + 1)) + '</button>').join('') + '</div>'
            + '<details class="ns-edit" open><summary class="small">Paare bearbeiten</summary><textarea id="nsPairs" rows="4" placeholder="Name | avtr_… (SFW) | avtr_… (NSFW)  – eine Zeile pro Paar">' + esc((c.pairs || []).map(p => p.name + ' | ' + p.sfw + ' | ' + p.nsfw).join('\n')) + '</textarea>'
            + '<div class="nc-row"><span class="small">Sicherer Avatar (Panik)</span><input type="text" id="nsSafe" value="' + esc(c.safe_avatar) + '" placeholder="avtr_…" style="flex:1"></div><button type="button" class="btn btn-sm btn-gold" data-ns="save_av">💾 Speichern</button></details>');
        // Panik-Optionen
        h += sec('🚨 Panik-Knopf', '<p class="muted small">Auch auf dem Handy und als Stream-Deck-Befehl. Was passiert:</p>' + chk('panic_avatar', c.panic_avatar, 'sicheren Avatar anziehen') + chk('panic_chat', c.panic_chat, 'Chatbox leeren & Module aus')
            + chk('panic_private', c.panic_private, 'Privat-Modus an (kein Discord-Status, keine Chatbox)') + chk('panic_toys', c.panic_toys, 'Spielzeug sofort stoppen')
            + '<div class="nc-row"><span class="small">🖼 Wallpaper Engine</span><select data-nk="panic_we">' + [['off', 'nicht ändern'], ['profile', 'auf harmloses Profil wechseln'], ['pause', 'anhalten'], ['mute', 'nur Ton aus']].map(([v, l]) => '<option value="' + v + '"' + ((c.panic_we || 'off') === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>'
            + ((c.panic_we || 'off') === 'profile' ? '<div class="nc-row"><span class="small">Profil bei Panik</span><input type="text" data-nk="panic_we_profile" value="' + esc(c.panic_we_profile || '') + '" placeholder="z. B. Brav" maxlength="60"><span class="small">bei Entwarnung</span><input type="text" data-nk="panic_we_back" value="' + esc(c.panic_we_back || '') + '" placeholder="z. B. Normal" maxlength="60"></div>'
                + '<p class="muted small">Profile legst du in Wallpaper Engine an (Monitore einrichten → Profil speichern).</p>' : '')
            + ((c.panic_we || 'off') !== 'off' ? '<div class="nc-row"><span class="small">Pfad (optional)</span><input type="text" data-nk="panic_we_path" value="' + esc(c.panic_we_path || '') + '" placeholder="leer = automatisch über Steam finden" style="flex:1"></div>' : '')
            + '<div class="nc-row"><button type="button" class="btn btn-sm" data-ns="allclear">✅ Entwarnung</button><span class="muted small">Privat-Modus aus, Chatbox-Rotation frei, Wallpaper zurück</span></div>');
        // Grenzen-Karte
        h += sec('🟢🟡🔴 Grenzen-Karte', '<div class="ns-bnd"><label><span class="small">🟢 Ja</span><input type="text" id="nsYes" value="' + esc(c.yes) + '" maxlength="200"></label><label><span class="small">🟡 Vielleicht</span><input type="text" id="nsMaybe" value="' + esc(c.maybe) + '" maxlength="200"></label>'
            + '<label><span class="small">🔴 Nein</span><input type="text" id="nsNo" value="' + esc(c.no) + '" maxlength="200"></label></div><div class="nc-row"><button type="button" class="btn btn-sm" data-ns="save_bnd">💾 Speichern</button><button type="button" class="btn btn-sm btn-gold" data-ns="boundaries">📨 In die Chatbox</button></div>');
        // 18+-Instanz
        h += sec('🔞 18+-Instanz', '<p class="muted small">Neue Instanz in deiner aktuellen Welt + Einladung an dich.</p><div class="nc-row"><button type="button" class="btn btn-sm btn-gold" data-ns="inst_invite">🔒 Invite-Instanz</button><button type="button" class="btn btn-sm" data-ns="inst_group"' + (c.group ? '' : ' disabled') + '>🛡 18+-Gruppen-Instanz</button></div>'
            + '<div class="nc-row"><span class="small">18+-Gruppe</span><input type="text" id="nsGroup" value="' + esc(c.group) + '" placeholder="grp_… (mit Altersschranke)" style="flex:1"><button type="button" class="btn btn-sm" data-ns="save_group">💾</button></div>');
        if (a.owner) h += '<div class="nc-card"><h4>👑 Admin</h4><p class="small">Schlüssel-Generator & Besitzer-Werkzeuge haben jetzt einen eigenen Menüpunkt.</p><button type="button" class="btn btn-sm" data-tab-go="admin">👑 Zum Admin</button></div>';
        }
        // Spielzeug
        if (sub === 'toys' && has('toys') && t) {
            const tc = t.cfg;
            h += sec('🎮 Spielzeug (Intiface / Buttplug.io)', '<p class="small">' + (t.connected ? '✔ ' + esc(t.state) : '⚪ ' + esc(t.state)) + (t.error ? ' <span class="bad">' + esc(t.error) + '</span>' : '') + '</p>'
                + '<div class="nc-row"><input type="text" id="nsUrl" value="' + esc(tc.url) + '" style="flex:1"><button type="button" class="btn btn-sm ' + (t.connected ? '' : 'btn-gold') + '" data-ns="' + (t.connected ? 'tdisc' : 'tconn') + '">' + (t.connected ? 'Trennen' : '🔌 Verbinden') + '</button><button type="button" class="btn btn-sm" data-ns="tscan"' + (t.connected ? '' : ' disabled') + '>🔎 Geräte suchen</button></div>'
                + (t.devices.length ? '<div class="ns-devs"><div class="ns-dev"><b>Alle</b><input type="range" min="0" max="100" value="0" data-dev="all"></div>' + t.devices.map(d => '<div class="ns-dev"><b>' + esc(d.name) + '</b><input type="range" min="0" max="100" value="' + d.level + '" data-dev="' + d.index + '"><span class="small">' + d.level + ' %</span></div>').join('') + '</div>' : t.connected ? '<p class="muted small">Keine Geräte – „Geräte suchen“ und das Spielzeug einschalten.</p>' : '<p class="muted small">Intiface Central starten und dort „Start Server“ drücken. Läuft Intiface auf dem <b>Handy</b>: dort Settings → Server → „Listen on all network interfaces“ an, Server neu starten, dann oben <code>ws://&lt;Handy-IP&gt;:12345</code> eintragen.</p>')
                + '<button type="button" class="btn ns-stop" data-ns="tstop">⏹ Alles stoppen</button>'
                + '<div class="nc-row"><span class="small">Höchststärke</span><input type="range" min="5" max="100" value="' + tc.max + '" data-nk="max"><span class="small">' + tc.max + ' %</span><span class="small">Aus nach</span><input type="number" min="0" max="60" value="' + tc.idle_stop + '" data-nk="idle_stop" style="width:60px"><span class="small">s ohne Signal</span></div>'
                + '<h4 style="margin-top:12px">🔗 Geräte verknüpfen</h4>' + chk('links_on', tc.links_on, '<b>Verknüpfungen aktiv</b> (Not-Aus und Panik schalten das wieder aus)')
                + '<p class="muted small">Pro Gerät eine oder mehrere Quellen: SPS-Plugs, SPS-Sockets, SPS-Touch-Zonen (OSC-Parameter im OGB-/VRCFury-Format), Konstant oder ein beliebiger Avatar-Parameter. Die stärkste Quelle zählt. OSC in VRChat muss an sein.</p>'
                + '<p class="small"><button type="button" class="btn btn-sm" data-od="1">🐞 Avatar-Debugger öffnen</button> – zeigt, ob SPS-Werte ankommen und wie die Zonen heißen.</p>'
                + '<div class="tl-box">' + (window.NexusToyLinks ? window.NexusToyLinks.html(t) : '') + '</div>'
                + '<details class="ns-edit"><summary class="small">Einfacher OGB-Modus (alle Geräte gleich)</summary>' + chk('ogb', tc.ogb, 'OGB-/SPS-Parameter steuern alle Geräte (Nähe = Stärke)') + chk('ogb_self', tc.ogb_self, 'auch eigene Berührungen (Self)')
                + (t.ogb_params && t.ogb_params.length ? '<p class="muted small">Gefunden: ' + t.ogb_params.map(p => '<code>' + esc(p) + '</code>').join(' ') + '</p>' : '') + '</details>'
                + '<details class="ns-edit"><summary class="small">Eigene Regeln (beliebiger Parameter → Stärke)</summary>' + chk('auto', tc.auto, 'Regeln aktiv')
                + '<textarea id="nsRules" rows="3" placeholder="Parameter | Gerät (all oder Nummer) | min | max   – z. B. Tail_Wag | all | 0.1 | 0.8">' + esc((tc.rules || []).map(r => r.param + ' | ' + r.device + ' | ' + r.min + ' | ' + r.max).join('\n')) + '</textarea><button type="button" class="btn btn-sm" data-ns="save_rules">💾 Speichern</button></details>'
                + '<p class="small" style="margin-top:10px">🌊 Muster, 🎁 Überraschung & 📊 Statistik findest du unter <a href="#" data-nsub="fun">🎲 Spielereien</a>.</p>', 'ns-toys ns-wide');
            if (window.NexusNsfw2) h += sec('🧩 Geräte im Detail', window.NexusNsfw2.devicesHtml(t), 'ns-wide');
        }
        // Handy
        if (sub === 'phone' && has('remote') && r) {
            h += sec('📱 Handy-Fernbedienung', chk('remote_on', r.on, 'an (im Heimnetz über die IP dieses PCs)')
                + (r.on ? (r.running ? '<p class="small">Am Handy öffnen (gleiches WLAN):</p>' + r.urls.map(u => '<div class="nc-row"><code class="ns-url">' + esc(u) + '</code><button type="button" class="vx-copy" data-copy="' + esc(u) + '">⧉</button></div>').join('') : '<p class="small bad">⚠ ' + esc(r.error || 'startet …') + '</p>') : '')
                + '<div class="nc-row"><span class="small">Port</span><input type="number" id="nsPort" value="' + r.port + '" min="1024" max="65535" style="width:90px"><button type="button" class="btn btn-sm" data-ns="save_port">💾</button><button type="button" class="btn btn-sm" data-ns="new_token">♻ Neuer Schlüssel</button></div>'
                + '<p class="muted small">Panik, Privat-Modus, Avatar-Paare, Grenzen-Karte und Spielzeug-Regler. Nur mit dem Schlüssel im Link erreichbar – Link nicht teilen. Windows fragt beim ersten Start evtl. nach der Firewall (privates Netz erlauben).</p>');
        }
        box.innerHTML = h + '</div>';
    }
    const fmtDur = s => s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min' : s >= 60 ? Math.floor(s / 60) + ' min ' + (s % 60) + ' s' : s + ' s';
    function funHtml(t, toysOk) {
        let h = '';
        const ready = toysOk && t && t.connected && t.devices.length;
        if (toysOk && t) {
            const p = t.pattern;
            h += sec('🌊 Muster', (ready ? '' : '<p class="muted small">Erst unter 🎮 Spielzeug mit Intiface verbinden und ein Gerät finden.</p>')
                + '<div class="ns-pats">' + (t.patterns || []).map(x => '<button type="button" class="btn btn-sm' + (p && p.id === x.id && !p.name.includes('🎁') ? ' btn-gold' : '') + '" data-pat="' + x.id + '"' + (ready ? '' : ' disabled') + '>' + esc(x.name) + '</button>').join('') + '</div>'
                + (p ? '<div class="ns-patrun"><b>' + esc(p.name) + '</b> <span class="small">' + (p.left ? 'noch ' + fmtDur(p.left) : 'endlos') + '</span><div class="ns-bar"><i style="width:' + p.level + '%"></i></div><button type="button" class="btn btn-sm" data-ns="pat_stop">⏸ Muster aus</button></div>' : '')
                + '<div class="ns-patcfg"><label><span class="small">Tempo <b>' + pc.speed + '×</b></span><input type="range" min="0.25" max="3" step="0.25" value="' + pc.speed + '" data-pc="speed"></label>'
                + '<label><span class="small">Stärke <b>' + pc.strength + ' %</b></span><input type="range" min="5" max="100" step="5" value="' + pc.strength + '" data-pc="strength"></label>'
                + '<label><span class="small">Dauer</span><select data-pc="secs">' + [[0, 'endlos'], [30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min'], [600, '10 min'], [1200, '20 min']].map(([v, n]) => '<option value="' + v + '"' + (+pc.secs === v ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>'
                + '<label><span class="small">Gerät</span><select data-pc="device"><option value="all">alle</option>' + (t.devices || []).map(d => '<option value="' + d.index + '"' + (String(pc.device) === String(d.index) ? ' selected' : '') + '>' + esc(d.name) + '</option>').join('') + '</select></label></div>'
                + '<p class="muted small">Läuft im Hintergrund weiter, auch wenn du die Seite wechselst. Panik und ⏹ stoppen sofort. Verknüpfungen laufen parallel – die stärkere Quelle zählt.</p>');
            h += sec('🎁 Überraschung', '<p class="muted small">Zufälliges Muster, Tempo und Stärke für 20–60 Sekunden – was kommt, verrät die App nicht.</p><button type="button" class="btn btn-gold" data-ns="surprise"' + (ready ? '' : ' disabled') + '>🎁 Überrasch mich!</button><p class="muted small">Geht auch über die 📱 Handy-Fernbedienung.</p>');
            const s = t.stats || {};
            h += sec('📊 Sitzung', '<div class="ns-stats"><div><b>' + fmtDur(s.active || 0) + '</b><span class="small">aktiv</span></div><div><b>' + (s.peak || 0) + ' %</b><span class="small">Spitze</span></div><div><b>' + (s.patterns || 0) + '</b><span class="small">Muster</span></div></div>'
                + '<p class="muted small">seit ' + esc(new Date(s.since || Date.now()).toLocaleTimeString(window.nxLoc ? nxLoc() : 'de-DE', { hour: '2-digit', minute: '2-digit' })) + ' · nur auf diesem PC, wird nicht gespeichert</p><button type="button" class="btn btn-sm" data-ns="stats_reset">♻ Zurücksetzen</button>');
        }
        h += sec('💬 Stimmung', '<p class="muted small">Ein Klick → Chatbox.</p><div class="ns-moods">' + MOODS.map((m, i) => '<button type="button" class="btn btn-sm" data-mood="' + i + '">' + esc(m) + '</button>').join('') + '</div>'
            + '<div class="nc-row"><input type="text" id="nsMood" maxlength="144" placeholder="eigener Text …" style="flex:1"><button type="button" class="btn btn-sm" data-ns="mood_own">📨</button></div>');
        h += sec('🤝 Consent-Check', '<p class="muted small">Fragt in der Chatbox nach: „Alles okay für dich? 🟢 weiter · 🟡 langsamer · 🔴 stopp“. Auch auf dem Handy.</p><div class="nc-row"><button type="button" class="btn btn-gold" data-ns="consent">🤝 Nachfragen</button><button type="button" class="btn btn-sm" data-ns="boundaries">🟢🟡🔴 Grenzen-Karte</button></div>');
        h += sec('🎯 Wahrheit oder Pflicht', '<div class="nc-row"><button type="button" class="btn btn-sm" data-tod="t">💭 Wahrheit</button><button type="button" class="btn btn-sm" data-tod="d">🔥 Pflicht</button></div>'
            + (tod ? '<p class="ns-card-big">' + esc(tod) + '</p><div class="nc-row"><button type="button" class="btn btn-sm btn-gold" data-ns="tod_send">📨 In die Chatbox</button></div>' : '<p class="muted small">Zieh eine Karte – sie wird erst auf Klick in die Chatbox geschickt.</p>'));
        h += sec('🎲 Flirt-Würfel', '<button type="button" class="btn btn-sm" data-ns="dice">🎲 Würfeln</button>' + (dice ? '<p class="ns-card-big">' + esc(dice) + '</p><button type="button" class="btn btn-sm btn-gold" data-ns="dice_send">📨 In die Chatbox</button>' : '<p class="muted small">Würfelt eine Aktion und eine Stelle.</p>'));
        h += sec('⏳ Countdown', '<p class="muted small">Zählt in der Chatbox runter.</p><div class="nc-row">' + [3, 5, 10].map(n => '<button type="button" class="btn btn-sm" data-cd="' + n + '">' + n + '</button>').join('') + '<input type="text" id="nsCdEnd" maxlength="40" value="' + esc(ls('cdend', 'Los! 💋')) + '" style="flex:1"></div>');
        return h;
    }
    const ago = ms => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? 'vor ' + s + ' s' : 'vor ' + Math.round(s / 60) + ' min'; };
    function netHtml(x, t) {
        const c = x.cfg, L = x.listen, a = x.active, k = x.ctrl, ack = k.ack;
        const dot = (o, label) => '<span class="small ' + (o.ok ? 'ok' : o.err ? 'bad' : 'muted') + '">' + (o.ok ? '✔ ' : o.err ? '⚠ ' : '○ ') + label + (o.err ? ' – ' + esc(o.err) : '') + '</span>';
        let h = sec('📥 Mich steuern lassen', chk('tr_recv_on', c.recv_on, '<b>Fernsteuerung empfangen</b>')
            + ' <button type="button" class="btn btn-sm ns-stop" data-ns="tr_safe" title="Sofort alles aus, Empfang aus">🛑 Safeword</button>'
            + '<div class="nc-row"><span class="small">⌛ Zeitlimit (min, 0 = ohne)</span><input type="number" min="0" max="480" value="' + (c.limit_min || 0) + '" data-tr="limit_min" style="width:80px"></div>'
            + (c.recv_on ? '<p class="nc-row">' + dot(L.lan, 'Heimnetz') + dot(L.web, 'Internet (GhostNode)') + '</p>' : '')
            + '<div class="nc-row"><span class="small">Deine User-ID</span><code class="ns-url">' + esc(x.my_uid || '–') + '</code>' + (x.my_uid ? '<button type="button" class="vx-copy" data-copy="' + esc(x.my_uid) + '">⧉</button>' : '') + '</div>'
            + '<p class="muted small">Die gibst du deinem Partner – sonst muss niemand etwas eintragen. Verbindung im selben WLAN direkt, sonst automatisch über deine GhostNode-Seite.</p>'
            + '<label class="small">✅ Wer darf dich steuern? (eine Zeile: <code>usr_… | Name</code>)</label><textarea id="trAllow" rows="3" placeholder="usr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx | Name">' + esc(c.allow.map(z => z.uid + (z.name ? ' | ' + z.name : '')).join('\n')) + '</textarea>'
            + '<div class="nc-row"><button type="button" class="btn btn-sm" data-ns="tr_allow">💾 Speichern</button><span class="small">Höchststärke von außen</span><input type="range" min="5" max="100" step="5" value="' + c.max + '" data-tr="max"><span class="small">' + c.max + ' %</span></div>'
            + (a ? '<div class="ns-patrun"><b>🎮 ' + esc(a.name) + '</b> <span class="small">steuert gerade (' + (a.via === 'lan' ? '🏠 Heimnetz' : '🌐 Internet') + ', ' + ago(a.at) + ')</span><div class="ns-bar"><i style="width:' + x.remote_lv + '%"></i></div><button type="button" class="btn btn-sm ns-stop" data-ns="tr_kick">🚫 Beenden</button></div>' : '')
            + (x.log.length ? '<details class="ns-edit"' + (a ? ' open' : '') + '><summary class="small">Verlauf</summary><ul class="ns-log">' + x.log.map(l => '<li><span class="muted">' + esc(new Date(l.t * 1000).toLocaleTimeString(window.nxLoc ? nxLoc() : 'de-DE')) + '</span> <b>' + esc(l.who) + '</b> ' + esc(l.txt) + '</li>').join('') + '</ul></details>' : '')
            + '<p class="muted small">Geprüft wird: Freigabeliste + gültiger Freischalt-Schlüssel (mit Spielzeug) für genau diese ID. Befehle gelten 60 s und nur einmal; ohne Signal geht der Regler nach 15 s auf 0. 🚨 Panik schaltet den Empfang aus.</p>');
        const via = k.via === 'lan' ? '🏠 Heimnetz' : k.via === 'web' ? '🌐 Internet' : '';
        h += sec('🎮 Partner steuern', '<div class="nc-row"><span class="small">User-ID des Partners</span><input type="text" id="trUid" value="' + esc(c.t_uid) + '" placeholder="usr_… oder Profil-Link" style="flex:1">' + (x.my_uid ? '<button type="button" class="btn btn-sm" data-ns="tr_self" title="Eigene ID zum Testen">🧪 Ich</button>' : '') + '<button type="button" class="btn btn-sm btn-gold" data-ns="tr_ping">📡 Verbinden</button></div>'
            + (ack || k.err ? '<p class="small ' + (k.err || (ack && !ack.ok) ? 'bad' : 'ok') + '">' + (k.err ? '⚠ ' + esc(k.err) : (ack.ok ? '✔ ' : '⚠ ') + esc(ack.msg) + ' <span class="muted">' + ago(ack.at) + (via ? ' · ' + via : '') + '</span>') + '</p>' : '<p class="muted small">Dein Partner muss bei sich „Fernsteuerung empfangen“ anhaben und dich auf seiner Liste haben. 🧪 Zum Testen deine eigene ID eintragen (links „Fernsteuerung empfangen“ an) – dann steuerst du dein eigenes Spielzeug.</p>')
            + '<div class="ns-dev"><b>Stärke</b><input type="range" min="0" max="100" value="' + k.lv + '" data-trlv="1"><span class="small">' + k.lv + ' %</span></div>'
            + '<div class="ns-pats">' + ((t && t.patterns) || []).map(p => '<button type="button" class="btn btn-sm" data-trpat="' + p.id + '">' + esc(p.name) + '</button>').join('') + '</div>'
            + '<div class="nc-row"><button type="button" class="btn btn-sm" data-ns="tr_surprise">🎁 Überraschung</button><button type="button" class="btn ns-stop" data-ns="tr_stop">⏹ Stopp beim Partner</button></div>'
            + '<p class="muted small">Muster laufen beim Partner höchstens 5 min und nie stärker als seine Höchststärke.</p>');
        return h;
    }
    const trSend = (c, extra) => api('tremote_send', Object.assign({ c }, extra || {})).then(d => { st.tremote = d; if (c !== 'set') toast(d.msg); render(); }).catch(x => { toast(x.message, true); refreshAccess(); });
    const trCfg = data => api('tremote_cfg', data).then(d => { st.tremote = d; toast(d.msg); render(); }).catch(x => toast(x.message, true));
    const chat = (text, sound) => api('nsfw_chat', { text, sound: sound === false ? '0' : '1' }).then(d => toast(d.msg)).catch(x => toast(x.message, true));
    let cdRun = false;
    async function countdown(n) {
        if (cdRun) return; cdRun = true;
        const end = $v('#nsCdEnd') || 'Los!'; lsSet('cdend', end);
        try { for (let i = n; i > 0; i--) { await api('nsfw_chat', { text: '⏳ ' + i + ' …', sound: '0' }); await new Promise(r => setTimeout(r, 1600)); } await api('nsfw_chat', { text: end }); toast('⏳ Countdown fertig.'); }
        catch (x) { toast(x.message, true); } finally { cdRun = false; }
    }
    const patStart = (id, extra) => toysDo('toys_pattern', Object.assign({ id, speed: pc.speed, strength: pc.strength, seconds: pc.secs, device: pc.device }, extra || {}));
    const save = data => api('nsfw_cfg', data).then(d => { st = Object.assign(st, d); toast(d.msg); render(); }).catch(x => toast(x.message, true));
    const toysDo = (act, data) => api(act, data).then(d => { if (st) st.toys = d; if (d.msg) toast(d.msg); render(); }).catch(x => toast(x.message, true));
    function onClick(e) {
        if (window.NexusToyLinks && window.NexusToyLinks.onClick(e, render)) return;
        if (window.NexusNsfw2 && window.NexusNsfw2.onClick(e, toysDo, render)) return;
        const g = e.target.closest('[data-tab-go]'); if (g) return UI.tab(g.dataset.tabGo);
        if (e.target.closest('[data-od]')) { UI.tab('client'); setTimeout(() => { const c = document.querySelector('#ncSub [data-sub="debug"]'); if (c) c.click(); }, 400); return; }
        const sb = e.target.closest('[data-nsub]'); if (sb) { e.preventDefault(); sub = sb.dataset.nsub; lsSet('sub', sub); return render(); }
        const pb = e.target.closest('[data-pat]'); if (pb) return patStart(pb.dataset.pat);
        const mb = e.target.closest('[data-mood]'); if (mb) return chat(MOODS[+mb.dataset.mood]);
        const tb = e.target.closest('[data-tod]'); if (tb) { tod = (tb.dataset.tod === 't' ? '💭 Wahrheit: ' : '🔥 Pflicht: ') + pick(tb.dataset.tod === 't' ? TRUTH : DARE); return render(); }
        const cb = e.target.closest('[data-cd]'); if (cb) return countdown(+cb.dataset.cd);
        const tp = e.target.closest('[data-trpat]'); if (tp) return trSend('pattern', { id: tp.dataset.trpat, speed: pc.speed, strength: pc.strength, seconds: 300 });
        const b = e.target.closest('[data-ns]');
        if (!b) return;
        const a = b.dataset.ns;
        if (b.dataset.tabGo) return UI.tab(b.dataset.tabGo);
        const simple = { panic: 'nsfw_panic', allclear: 'nsfw_allclear', private: 'nsfw_private', boundaries: 'nsfw_boundaries' };
        if (simple[a]) return api(simple[a]).then(d => { toast(d.msg); refreshAccess(); }).catch(x => toast(x.message, true));
        if (a === 'avatar') return api('nsfw_avatar', { i: b.dataset.i }).then(d => { toast(d.msg); refreshAccess(); }).catch(x => toast(x.message, true));
        if (a === 'tr_allow') return trCfg({ allow: $v('#trAllow') });
        if (a === 'tr_safe') return api('tremote_safeword').then(d => { st.tremote = d; toast(d.msg); render(); }).catch(x => toast(x.message, true));
        if (a === 'tr_kick') return api('tremote_kick').then(d => { st.tremote = d; toast(d.msg); render(); }).catch(x => toast(x.message, true));
        if (a === 'tr_ping') return api('tremote_cfg', { t_uid: $v('#trUid') }).then(() => trSend('ping')).catch(x => toast(x.message, true));
        if (a === 'tr_self') { const i = box.querySelector('#trUid'); if (i && st.tremote) i.value = st.tremote.my_uid; return; }
        if (a === 'tr_surprise') return trSend('surprise');
        if (a === 'tr_stop') return trSend('stop');
        if (a === 'pat_stop') return toysDo('toys_pattern_stop');
        if (a === 'surprise') return toysDo('toys_surprise');
        if (a === 'stats_reset') return toysDo('toys_stats_reset');
        if (a === 'consent') return api('nsfw_consent').then(d => toast(d.msg)).catch(x => toast(x.message, true));
        if (a === 'mood_own') { const v = $v('#nsMood').trim(); if (v) chat(v); return; }
        if (a === 'tod_send' && tod) return chat(tod);
        if (a === 'dice') { dice = '🎲 ' + pick(D_ACT) + ' · ' + pick(D_SPOT); return render(); }
        if (a === 'dice_send' && dice) return chat(dice);
        if (a === 'save_av') {
            const pairs = $v('#nsPairs').split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p.length >= 3).map(p => ({ name: p[0], sfw: p[1], nsfw: p[2] }));
            return save({ pairs: JSON.stringify(pairs), safe_avatar: $v('#nsSafe') });
        }
        if (a === 'save_bnd') return save({ yes: $v('#nsYes'), maybe: $v('#nsMaybe'), no: $v('#nsNo') });
        if (a === 'save_group') return save({ group: $v('#nsGroup') });
        if (a === 'inst_invite' || a === 'inst_group') return api('nsfw_instance', { kind: a === 'inst_group' ? 'group' : 'invite' }).then(d => toast(d.msg)).catch(x => toast(x.message, true));
        if (a === 'tconn') return api('toys_cfg', { url: $v('#nsUrl') }).then(() => toysDo('toys_connect')).catch(x => toast(x.message, true));
        if (a === 'tdisc') return toysDo('toys_disconnect');
        if (a === 'tscan') { toysDo('toys_scan'); setTimeout(refreshAccess, 4000); setTimeout(refreshAccess, 11000); return; }
        if (a === 'tstop') return toysDo('toys_stop');
        if (a === 'save_rules') {
            const rules = $v('#nsRules').split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0]).map(p => ({ param: p[0], device: p[1] || 'all', min: p[2] || 0, max: p[3] || 1 }));
            return toysDo('toys_cfg', { rules: JSON.stringify(rules) });
        }
        if (a === 'save_port') return api('remote_cfg', { port: $v('#nsPort') }).then(d => { st.remote = d; toast(d.msg); render(); }).catch(x => toast(x.message, true));
        if (a === 'new_token') { if (!confirm('Neuen Schlüssel erzeugen? Alte Handy-Links gehen dann nicht mehr.')) return; return api('remote_cfg', { new_token: '1' }).then(d => { st.remote = d; render(); }); }
        if (a === 'keypair') { if (!confirm('Schlüsselpaar erzeugen? Den öffentlichen Schlüssel danach an Claude geben, damit er in die App eingebaut wird.')) return; return api('nsfw_admin_keypair').then(d => { st = d; toast(d.msg); render(); }).catch(x => toast(x.message, true)); }
        if (a === 'revoke') return api('nsfw_admin_revoke', { id: b.dataset.id, on: b.dataset.on }).then(d => { st.issued = d.items; render(); }).catch(x => toast(x.message, true));
    }
    const $v = s => { const el = box.querySelector(s); return el ? el.value : ''; };
    function onChange(e) {
        if (window.NexusToyLinks && window.NexusToyLinks.onChange(e, render)) return;
        if (window.NexusNsfw2 && window.NexusNsfw2.onChange(e, toysDo)) return;
        const tm = e.target.closest('[data-tr]'); if (tm) return trCfg({ [tm.dataset.tr]: tm.value });
        const pe = e.target.closest('[data-pc]');
        if (pe) {
            pc[pe.dataset.pc] = pe.dataset.pc === 'device' ? pe.value : Number(pe.value); lsSet('pat', pc);
            const p = st && st.toys && st.toys.pattern;
            if (p && !p.name.includes('🎁') && pe.dataset.pc !== 'secs') patStart(p.id, { seconds: p.left || 0 }); else render();
            return;
        }
        const el = e.target.closest('[data-nk]');
        if (!el) return;
        const k = el.dataset.nk, v = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
        if (/^panic_/.test(k)) return save({ [k]: v });
        if (k === 'tr_recv_on') return trCfg({ recv_on: v });
        if (k === 'remote_on') return api('remote_cfg', { on: v }).then(d => { st.remote = d; toast(d.msg); setTimeout(() => refreshAccess(), 600); render(); }).catch(x => toast(x.message, true));
        return toysDo('toys_cfg', { [k]: v });
    }
    let slideT = null, trT = null;
    function onInput(e) {
        if (window.NexusToyLinks && window.NexusToyLinks.onInput(e)) return;
        if (window.NexusNsfw2 && window.NexusNsfw2.onInput(e, toysDo)) return;
        const tl = e.target.closest('input[type=range][data-trlv]');
        if (tl) { const s = tl.parentNode.querySelector('span'); if (s) s.textContent = tl.value + ' %'; clearTimeout(trT); trT = setTimeout(() => trSend('set', { lv: tl.value / 100 }), 350); return; }
        const tr = e.target.closest('input[type=range][data-tr]'); if (tr) { const s = tr.nextElementSibling; if (s) s.textContent = tr.value + ' %'; return; }
        const pe = e.target.closest('input[type=range][data-pc]');
        if (pe) { const b = pe.parentNode.querySelector('b'); if (b) b.textContent = pe.dataset.pc === 'speed' ? pe.value + '×' : pe.value + ' %'; return; }
        const r = e.target.closest('input[type=range][data-dev]');
        if (!r) return;
        const s = r.parentNode.querySelector('span'); if (s) s.textContent = r.value + ' %';
        clearTimeout(slideT);
        slideT = setTimeout(() => api('toys_set', { device: r.dataset.dev, level: r.value / 100 }).catch(x => toast(x.message, true)), 60);
    }
    function open() {
        box = document.getElementById('nsfwBox');
        if (!box) return;
        if (!box.dataset.bound) { box.dataset.bound = '1'; box.addEventListener('click', onClick); box.addEventListener('change', onChange); box.addEventListener('input', onInput); box.addEventListener('submit', onSubmit);
            box.addEventListener('pointerdown', e => { if (e.target.matches('input[type=range]')) busy = true; });
            document.addEventListener('pointerup', () => { if (busy) { busy = false; setTimeout(render, 300); } }); }
        refreshAccess().then(render);
        clearInterval(tPoll); tPoll = setInterval(() => { if (box && !box.closest('[hidden]') && !document.hidden) refreshAccess(); }, 3000);
    }
    function onSubmit() { /* Schlüssel werden im 👑 Admin-Bereich erzeugt */ }
    if (window.NexusToyLinks) window.NexusToyLinks.bind(d => { if (st) st.toys = d; });
    window.NexusNsfw = { open, refresh: refreshAccess };
    setTimeout(refreshAccess, 1500);
})();
