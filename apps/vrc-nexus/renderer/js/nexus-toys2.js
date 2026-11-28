/* VRC Nexus 8.3 – 🔞 Reiter „Spielzeug“ neu: klarer Kopf (Verbindung, ALLES STOPPEN, Höchststärke), Gerätekarten mit
 * Live-Anzeige, Quellen aus dem getragenen Avatar (SPS / OGB / TPS) statt Rohfeldern, Einfach („folgt meinem Avatar“) & Experte,
 * Stroker folgt der Tiefe, Vorlagen, Teilen als Text. Eigene Umsetzung im Nexus-Stil.
 * Wird von nexus-nsfw.js eingebunden (html / onClick / onChange / onInput / busy). */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    const ls = (k, d) => { try { const v = localStorage.getItem('nx_t2_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem('nx_t2_' + k, JSON.stringify(v)); } catch (e) { /* egal */ } };

    // ---------- Quellenarten ----------
    const TYPES = {
        plugs: { icon: '🍆', name: 'SPS-Plugs', desc: 'Penis-Zonen deines Avatars', grp: 'Avatar', zone: true },
        sockets: { icon: '🍑', name: 'SPS-Sockets', desc: 'Öffnungen deines Avatars', grp: 'Avatar', zone: true },
        touch: { icon: '✋', name: 'SPS-Touch-Zonen', desc: 'Berührungs-Zonen (Brust, Po, Ohren …)', grp: 'Avatar', zone: true },
        param: { icon: '🎚', name: 'Eigener Parameter', desc: 'beliebiger Avatar-Parameter (0–1)', grp: 'Avatar' },
        pcs: { icon: '🫦', name: 'PCS', desc: 'Penetration Contact System (Tiefe, Tempo, Lust)', grp: 'Körper & Puls' },
        heart: { icon: '💓', name: 'Puls', desc: 'Herzfrequenz (HypeRate & Co.)', grp: 'Körper & Puls' },
        voice: { icon: '🎙', name: 'Stimme', desc: 'Lautstärke am Mikrofon', grp: 'Körper & Puls' },
        lust: { icon: '💗', name: 'Lust-Meter', desc: 'steigt mit der Zeit und Stärke', grp: 'Körper & Puls' },
        constant: { icon: '♾', name: 'Konstant', desc: 'gleichbleibende Grundstärke', grp: 'Sonstiges' },
    };
    const SYS = { sps: 'SPS', ogb: 'OGB', tps: 'TPS', vfh: 'VFH' };
    /** „berührt von“ je Zonen-Art (Schlüssel wie im Backend) */
    const BY = {
        plugs: [['pen_others', '🍑 fremde Sockets'], ['touch_others', '✋ fremde Hände'], ['frot_others', '🍆 fremde Plugs'], ['pen_self', '🍑 meine Sockets'], ['touch_self', '✋ meine Hände']],
        sockets: [['pen_others', '🍆 fremde Plugs'], ['touch_others', '✋ fremde Hände'], ['frot_others', '🍑 fremde Sockets'], ['pen_self', '🍆 meine Plugs'], ['touch_self', '✋ meine Hände']],
        touch: [['touch_others', '✋ fremde Hände'], ['touch_self', '✋ meine Hände']],
    };
    const SRC_DEF = { pen_others: true, touch_others: true, frot_others: true, pen_self: false, touch_self: false, frot_self: false };
    const MODES = [['depth', '📏 Tiefe', 'je tiefer bzw. näher, desto stärker'], ['motion', '🌊 Bewegung', 'nur Bewegung zählt – je schneller, desto stärker'], ['mix', '✨ Beides', 'das Stärkere von Tiefe und Bewegung']];
    const TYPE_ICON = { Vibrate: '〰 Vibration', Oscillate: '↔ Oszillation', Rotate: '🔄 Rotation', Constrict: '🫸 Enge', Inflate: '🎈 Aufpumpen', Position: '📍 Position' };
    const MUT = { scale: 'Skalieren', dead: 'Totzone', motion: 'Bewegung' };
    const LDEF = { mode: 'depth', lo: 0, hi: 100, idle: 0, curve: 1, smooth: 0, sens: 1 };

    let links = null, dirty = 0, saveT = null, last = null, reRender = null, openDev = ls('open', {}), openLink = {}, fine = {}, menu = null, shareCode = '', liveT = null, shown = '';

    // ---------- kleine Bausteine ----------
    const swi = (attrs, on, label, tip) => '<label class="switch-row t2-sw"' + (tip ? ' title="' + esc(T(tip)) + '"' : '') + '><span class="switch"><input type="checkbox" ' + attrs + (on ? ' checked' : '') + '><i></i></span> ' + label + '</label>';
    const seg = (attrs, cur, opts) => '<div class="t2-seg" role="group">' + opts.map(([v, l, tip]) => '<button type="button" ' + attrs + ' data-v="' + esc(v) + '" class="' + (String(cur) === String(v) ? 'on' : '') + '"' + (tip ? ' title="' + esc(T(tip)) + '"' : '') + ' aria-pressed="' + (String(cur) === String(v)) + '">' + esc(T(l)) + '</button>').join('') + '</div>';
    const rng = (attrs, v, lo, hi, step, unit, fmt) => '<span class="t2-rng"><input type="range" ' + attrs + ' value="' + v + '" min="' + lo + '" max="' + hi + '" step="' + (step || 1) + '" data-unit="' + esc(unit || '') + '"' + (fmt ? ' data-fmt="' + fmt + '"' : '') + '><b>' + lab(v, unit, fmt) + '</b></span>';
    const lab = (v, unit, fmt) => fmt === 'curve' ? (v < 0.95 ? T('früh stark') : v > 1.05 ? T('sanfter Anfang') : T('gleichmäßig')) + ' (' + v + ')' : fmt === 'ms' ? (+v === 0 ? T('aus') : (v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + ' s' : v + ' ms')) : v + (unit || '');
    const dual = (attrs, k1, v1, k2, v2, lo, hi, unit) => '<div class="t2-dual" data-unit="' + esc(unit || '') + '"><div class="t2-dtrack"><i style="left:' + pct(v1, lo, hi) + '%;width:' + (pct(v2, lo, hi) - pct(v1, lo, hi)) + '%"></i></div>'
        + '<input type="range" class="lo" ' + attrs + ' data-f="' + k1 + '" min="' + lo + '" max="' + hi + '" value="' + v1 + '" aria-label="' + esc(T('von')) + '">'
        + '<input type="range" class="hi" ' + attrs + ' data-f="' + k2 + '" min="' + lo + '" max="' + hi + '" value="' + v2 + '" aria-label="' + esc(T('bis')) + '"><b class="t2-dval">' + v1 + ' – ' + v2 + (unit || '') + '</b></div>';
    const pct = (v, lo, hi) => Math.round((v - lo) / (hi - lo) * 100);
    const bar = (v, live, cls) => '<span class="t2-bar ' + (cls || '') + '"><i ' + live + ' style="width:' + Math.max(0, Math.min(100, v || 0)) + '%"></i></span>';
    const help = txt => '<span class="t2-q" tabindex="0" role="note" title="' + esc(T(txt)) + '" aria-label="' + esc(T(txt)) + '">?</span>';
    const card = (title, body, cls) => '<div class="nc-card ns-wide t2-card ' + (cls || '') + '"><h4>' + title + '</h4>' + body + '</div>';
    const linkDef = type => Object.assign({ type, include: [], exclude: [], src: Object.assign({}, SRC_DEF), value: type === 'constant' ? 20 : 100, param: '', mut: [] }, LDEF);
    const lv = l => Object.assign({}, LDEF, l);

    function save() {
        dirty = Date.now(); clearTimeout(saveT);
        saveT = setTimeout(() => api('toys_cfg', { links: JSON.stringify(links) }).then(d => { dirty = 0; if (last) Object.assign(last, d); }).catch(x => { dirty = 0; toast(x.message, true); }), 350);
    }
    const devCfg = (name, data) => api('toys_dev', { name, data: JSON.stringify(data) }).then(d => { if (last) Object.assign(last, d); if (reRender) reRender(); }).catch(x => toast(x.message, true));

    // ---------- Kopf ----------
    function headHtml(t) {
        const c = t.cfg, n = t.devices.length, on = t.connected;
        const sub = on ? (t.server && t.server.name ? esc(t.server.name) + ' · ' : '') + (n ? n + ' ' + esc(T(n === 1 ? 'Gerät' : 'Geräte')) : esc(T('noch kein Gerät'))) : esc(T('nicht verbunden'));
        let h = '<div class="t2-hrow"><div class="t2-conn ' + (on ? 'on' : t.state === 'verbindet …' ? 'wait' : 'off') + '"><i class="t2-led"></i><div><b>' + esc(T(on ? 'Intiface verbunden' : t.state === 'verbindet …' ? 'verbindet …' : 'Intiface aus')) + '</b><span class="small muted" data-live="sub">' + sub + (t.scanning ? ' · 🔎 ' + esc(T('sucht …')) : '') + '</span></div></div>'
            + '<div class="t2-hbtns"><button type="button" class="btn btn-sm ' + (on ? '' : 'btn-gold') + '" data-ns="' + (on ? 'tdisc' : 'tconn') + '">' + (on ? esc(T('Trennen')) : '🔌 ' + esc(T('Verbinden'))) + '</button>'
            + '<button type="button" class="btn btn-sm" data-ns="tscan"' + (on ? '' : ' disabled') + '>🔎 ' + esc(T('Geräte suchen')) + '</button></div>'
            + '<button type="button" class="t2-stop" data-ns="tstop" title="' + esc(T('Stoppt sofort alle Geräte, Muster, Szenen und schaltet die Avatar-Steuerung aus.')) + '">⏹ ' + esc(T('ALLES STOPPEN')) + '</button></div>';
        if (t.error) h += '<p class="t2-err small">⚠ ' + esc(t.error) + '</p>';
        if (t.consent && t.consent !== 'green') h += '<p class="t2-banner ' + t.consent + ' small">' + (t.consent === 'red' ? '🔴 ' + esc(T('Ampel rot – alles gestoppt, bis du sie unter „Lust & PCS“ wieder auf Grün stellst.')) : '🟡 ' + esc(T('Ampel gelb – Stärke gedämpft.'))) + '</p>';
        if (t.paused) h += '<p class="t2-banner yellow small">⏸ ' + esc(t.paused.msg || T('Pause')) + ' · ' + t.paused.left + ' s</p>';
        h += '<div class="t2-hrow2"><label class="t2-max">💪 ' + esc(T('Höchststärke')) + help('Deckelt jede Quelle, jedes Muster und jede Fernsteuerung.') + rng('data-nk="max"', c.max, 5, 100, 1, ' %') + '</label>'
            + '<label class="t2-idle small">⏱ ' + esc(T('Aus nach')) + ' <input type="number" min="0" max="60" value="' + c.idle_stop + '" data-nk="idle_stop"> ' + esc(T('s ohne Signal')) + help('Kommen so lange keine Avatar-Werte mehr an (VRChat hängt, Avatar gewechselt), wird die Quelle als still gewertet.') + '</label>'
            + swi('data-nk="links_on"', c.links_on, '<b>🎭 ' + esc(T('Avatar-Steuerung')) + '</b>', 'Hauptschalter für alle Avatar-Quellen. ALLES STOPPEN und Panik schalten ihn aus – danach bewusst wieder einschalten.') + '</div>'
            + '<details class="t2-more"><summary>🔌 ' + esc(T('Verbindung')) + ' <span class="muted small">' + esc(c.url) + '</span></summary>'
            + '<div class="nc-row"><input type="text" id="nsUrl" value="' + esc(c.url) + '" style="flex:1" aria-label="' + esc(T('Adresse von Intiface')) + '">' + help('Läuft Intiface auf diesem PC: ws://127.0.0.1:12345. Auf dem Handy: in Intiface „Listen on all network interfaces“ einschalten und ws://<Handy-IP>:12345 eintragen.') + '</div>'
            + (window.NexusNsfw2 && window.NexusNsfw2.connHtml ? window.NexusNsfw2.connHtml(t) : '')
            + (t.server && t.server.name ? '<p class="muted small">🖥 ' + esc(t.server.name) + ' · ' + esc(T('Protokoll')) + ' v' + (t.server.version || 3) + (t.server.ping ? ' · Ping ' + t.server.ping + ' ms' : '') + '</p>' : '')
            + '</details>';
        return card('🎮 ' + esc(T('Spielzeug')) + ' <span class="muted small">Intiface / Buttplug.io</span>', h, 't2-head');
    }

    // ---------- Geräte ----------
    function caps(d) {
        const ty = [...new Set(d.scalars.map(s => s.type))];
        return ty.map(x => '<span class="vx-pill">' + esc(T(TYPE_ICON[x] || x)) + '</span>').join('') + (d.linear ? '<span class="vx-pill">↕ ' + esc(T('Stroker')) + '</span>' : '') + (d.rotate ? '<span class="vx-pill">🔄 ' + esc(T('Rotation')) + '</span>' : '');
    }
    const batt = (d, warn) => d.battery !== null && d.battery !== undefined ? '<span class="vx-pill t2-bat' + (d.battery <= (warn || 0) ? ' bad' : '') + '" data-live-bat="' + d.index + '">🔋 ' + d.battery + ' %</span>' : '';
    function devHtml(d, t, di) {
        const c = t.cfg, dc = d.cfg, mode = d.src_mode || 'off', info = (t.link_info || {})[d.name], isOpen = openDev[d.name] !== false;
        let h = '<div class="t2-dev' + (d.on ? '' : ' muted') + '" data-t2dev="' + esc(d.name) + '"><div class="t2-dtop">'
            + '<button type="button" class="t2-dname" data-t2="dopen" data-d="' + di + '" aria-expanded="' + isOpen + '"><b>' + esc(d.label) + '</b>' + (d.alias ? '<span class="muted small">' + esc(d.name) + '</span>' : '') + '</button>'
            + '<span class="t2-caps">' + caps(d) + batt(d, c.battery_warn) + '</span>'
            + '<span class="t2-meter" title="' + esc(T('aktuelle Ausgabe')) + '">' + bar(d.out, 'data-live-out="' + d.index + '"', 'big') + '<b data-live-outn="' + d.index + '">' + d.out + ' %</b></span>'
            + '<span class="t2-dbtns"><button type="button" class="btn btn-sm" data-t2="tap" data-dev="' + d.index + '" title="' + esc(T('Test: kurzer Puls – welches Gerät ist das?')) + '">👆 ' + esc(T('Test')) + '</button>'
            + '<button type="button" class="btn btn-sm' + (d.on ? '' : ' btn-gold') + '" data-t2="mute" data-d="' + di + '" title="' + esc(T(d.on ? 'Stummschalten – Gerät bekommt nichts mehr' : 'Stummschaltung aufheben')) + '">' + (d.on ? '🔈' : '🔇 ' + esc(T('stumm'))) + '</button>'
            + '<button type="button" class="btn btn-sm" data-t2="stopdev" data-dev="' + d.index + '" title="' + esc(T('Nur dieses Gerät stoppen')) + '">⏹</button></span></div>';
        if (!isOpen) return h + '</div>';
        h += '<div class="t2-modes">' + seg('data-t2="mode" data-d="' + di + '"', mode, [['off', '⚪ Aus', 'Avatar steuert dieses Gerät nicht (Muster, Regler & Fernsteuerung gehen weiter)'], ['simple', '🎭 Folgt meinem Avatar', 'Einfach: alle Zonen deines Avatars, passende Einstellungen per Vorlage'], ['expert', '🛠 Experte', 'Quellen einzeln wählen und fein einstellen']])
            + (mode !== 'off' && !c.links_on ? '<span class="t2-warn small">⚠ ' + esc(T('Avatar-Steuerung ist aus')) + ' <button type="button" class="nc-link" data-t2="linkson">' + esc(T('einschalten')) + '</button></span>' : '') + '</div>';
        if (mode === 'simple') {
            h += '<div class="t2-presets">' + (t.presets || []).map(p => '<button type="button" class="t2-preset' + (dc.preset === p.id ? ' on' : '') + '" data-t2="preset" data-d="' + di + '" data-v="' + esc(p.id) + '"><b>' + esc(T(p.name)) + '</b><span class="small">' + esc(T(p.desc)) + '</span></button>').join('') + '</div>'
                + '<p class="muted small">🎭 ' + esc(T('Folgt automatisch allen Plugs, Sockets und Touch-Zonen deines aktuellen Avatars – nur Berührungen von anderen.')) + (info ? ' · ' + esc(T('gerade')) + ' <b data-live-dev="' + esc(d.name) + '">' + info.lv + ' %</b>' : '') + ' <button type="button" class="nc-link" data-t2="toexpert" data-d="' + di + '">' + esc(T('als Experte anpassen')) + ' →</button></p>';
        }
        if (mode === 'expert') h += expertHtml(d, t, di, info);
        if (d.linear) h += linHtml(d, di);
        if (d.rotate) h += '<div class="t2-sub"><span class="small">🔄 ' + esc(T('Drehrichtung')) + '</span>' + seg('data-t2="dv" data-k="rot" data-d="' + di + '"', dc.rot, [['cw', '↻ rechts'], ['ccw', '↺ links'], ['alt', '⇄ wechselnd', 'Richtung wechselt in festem Abstand'], ['move', '⇅ folgt Bewegung', 'rein = rechts, raus = links']]) + (dc.rot === 'alt' ? '<span class="small">' + esc(T('alle')) + ' <input type="number" data-t2="dv" data-k="rot_alt" data-d="' + di + '" value="' + dc.rot_alt + '" min="1" max="120" style="width:60px"> s</span>' : '') + '</div>';
        h += '<details class="t2-fine"' + (fine[d.name] ? ' open' : '') + ' data-t2fine="' + esc(d.name) + '"><summary class="small">⚙ ' + esc(T('Feineinstellungen')) + ' <span class="muted">' + esc(T('Name, Min/Max, Kurve, Motoren, Reaktionszeit')) + '</span></summary>'
            + (fine[d.name] && window.NexusNsfw2 && window.NexusNsfw2.devBody ? window.NexusNsfw2.devBody(d, t) : '') + '</details>';
        return h + '</div>';
    }
    function linHtml(d, di) {
        const dc = d.cfg, follow = dc.lin_mode === 'follow';
        return '<div class="t2-sub t2-lin"><span class="small">↕ ' + esc(T('Stroker')) + help('„Folgt der Tiefe“: der Stroker fährt so tief, wie gerade eingedrungen wird (Positionsbefehle). „Stärke = Tempo“: je stärker, desto schneller pumpt er – gut für Muster.') + '</span>'
            + seg('data-t2="dv" data-k="lin_mode" data-d="' + di + '"', dc.lin_mode, [['follow', '📏 folgt der Tiefe'], ['tempo', '⏩ Stärke = Tempo']])
            + '<span class="t2-linpos" title="' + esc(T('aktuelle Position')) + '"><i data-live-lin="' + d.index + '" style="left:' + (d.lin_pos === null || d.lin_pos === undefined ? dc.lin_max : d.lin_pos) + '%"></i></span></div>'
            + '<div class="t2-grid"><label class="small">' + esc(T('Grenzen unten / oben')) + dual('data-t2="dvd" data-d="' + di + '"', 'lin_min', dc.lin_min, 'lin_max', dc.lin_max, 0, 100, ' %') + '</label>'
            + (follow ? '<label class="small"><span class="t2-lt">' + esc(T('Höchsttempo')) + help('So viele volle Hübe pro Sekunde höchstens – schont Gerät und Haut. Höchststärke und Ampel bremsen zusätzlich.') + '</span>' + rng('data-t2="dv" data-k="lin_speed" data-d="' + di + '"', dc.lin_speed, 0.5, 5, 0.1, ' /s') + '</label>'
                + '<label class="small"><span class="t2-lt">' + esc(T('Ruhestellung')) + help('Wohin der Stroker fährt, wenn eine Weile nichts passiert (0 = unten, 100 = oben).') + '</span>' + rng('data-t2="dv" data-k="lin_rest" data-d="' + di + '"', dc.lin_rest, 0, 100, 5, ' %') + '</label>' : '') + '</div>';
    }

    // ---------- Experte: Quellen ----------
    function linkSummary(l) {
        const ty = TYPES[l.type] || {};
        if (ty.zone) {
            const who = (BY[l.type] || []).filter(([k]) => l.src[k]).length;
            const zones = l.include.length ? l.include.join(', ') : T('alle');
            return esc(zones) + (l.exclude.length ? ' · ' + esc(T('ohne')) + ' ' + esc(l.exclude.join(', ')) : '') + ' · ' + esc(T((MODES.find(m => m[0] === lv(l).mode) || MODES[0])[1])) + (who ? '' : ' · ⚠ ' + esc(T('niemand gewählt')));
        }
        if (l.type === 'constant') return l.value + ' %';
        if (l.type === 'param') return l.param ? esc(l.param) : '⚠ ' + esc(T('Parameter fehlt'));
        if (l.type === 'pcs') return l.include.length ? esc(l.include.join(', ')) : esc(T('alle Zonen'));
        return esc(T(ty.desc || ''));
    }
    function expertHtml(d, t, di, info) {
        const list = (links && links[d.name]) || [];
        let h = '<div class="t2-links">';
        if (!list.length) h += '<p class="muted small">' + esc(T('Noch keine Quelle – unten hinzufügen oder eine Vorlage wählen.')) + '</p>';
        h += list.map((l, li) => {
            const ty = TYPES[l.type] || { icon: '?', name: l.type }, key = d.name + '|' + li, op = !!openLink[key];
            const val = info && info.vals ? info.vals[li] || 0 : 0, win = info && info.win === li && val > 0;
            return '<div class="t2-link' + (win ? ' win' : '') + '" data-live-lrow="' + esc(key) + '"><div class="t2-lhead"><button type="button" class="t2-lname" data-t2="lopen" data-d="' + di + '" data-l="' + li + '" aria-expanded="' + op + '"><span class="t2-licon">' + ty.icon + '</span><b>' + esc(T(ty.name)) + '</b><span class="small muted">' + linkSummary(l) + '</span></button>'
                + '<span class="t2-lval">' + bar(val, 'data-live-lv="' + esc(key) + '"') + '<b data-live-lvn="' + esc(key) + '">' + val + ' %</b></span><span class="t2-crown" title="' + esc(T('Diese Quelle ist gerade die stärkste und bestimmt die Ausgabe.')) + '">★ ' + esc(T('zählt')) + '</span>'
                + '<button type="button" class="nc-x" data-t2="ldel" data-d="' + di + '" data-l="' + li + '" title="' + esc(T('Quelle entfernen')) + '">✕</button></div>'
                + (op ? linkEdit(l, d, di, li, t) : '') + '</div>';
        }).join('');
        h += '<div class="t2-addrow"><button type="button" class="btn btn-sm" data-t2="addmenu" data-d="' + di + '" aria-haspopup="listbox">＋ ' + esc(T('Quelle hinzufügen')) + '</button>'
            + '<button type="button" class="nc-link small" data-t2="tplmenu" data-d="' + di + '" aria-haspopup="listbox">📋 ' + esc(T('Vorlage anwenden')) + '</button>'
            + '<span class="muted small">' + esc(T('Mehrere Quellen: die stärkste zählt (★).')) + '</span></div>';
        return h + '</div>';
    }
    function linkEdit(l, d, di, li, t) {
        const x = lv(l), a = 'data-d="' + di + '" data-l="' + li + '"', ty = TYPES[l.type] || {};
        let h = '<div class="t2-ledit">';
        if (ty.zone) {
            h += '<div class="t2-row"><span class="small t2-k">' + esc(T('Zonen')) + help('Ohne Auswahl zählen alle Zonen dieser Art. Klick auf eine Zone: „nur“ → „ohne“ → entfernen.') + '</span><span class="t2-chips">'
                + (l.include.length ? '' : '<span class="t2-chip all">' + esc(T('alle')) + '</span>')
                + l.include.map(n => '<button type="button" class="t2-chip in" data-t2="zcycle" ' + a + ' data-n="' + esc(n) + '">' + esc(T('nur')) + ' ' + esc(n) + '</button>').join('')
                + l.exclude.map(n => '<button type="button" class="t2-chip ex" data-t2="zcycle" ' + a + ' data-n="' + esc(n) + '">' + esc(T('ohne')) + ' ' + esc(n) + '</button>').join('')
                + '<button type="button" class="t2-chip add" data-t2="zonemenu" ' + a + ' aria-haspopup="listbox">＋ ' + esc(T('Zone')) + '</button></span></div>';
            h += '<div class="t2-row"><span class="small t2-k">' + esc(T('berührt von')) + '</span><span class="t2-chips">' + (BY[l.type] || []).map(([k, lbl]) => '<button type="button" class="t2-chip tog' + (l.src[k] ? ' on' : '') + '" data-t2="src" data-k="' + k + '" ' + a + ' aria-pressed="' + !!l.src[k] + '">' + esc(T(lbl)) + '</button>').join('') + '</span>'
                + swi('data-t2="noself" ' + a, !l.src.pen_self && !l.src.touch_self && !l.src.frot_self, esc(T('Eigene Berührungen ignorieren')), 'Was du selbst mit deinen Händen oder deinem eigenen Avatar berührst, zählt nicht.') + '</div>';
        }
        if (l.type === 'pcs') {
            const zs = (t.zones && t.zones.pcs) || [];
            h += '<div class="t2-row"><span class="small t2-k">' + esc(T('PCS-Zonen')) + '</span><span class="t2-chips">' + zs.map(z => '<button type="button" class="t2-chip tog' + (l.include.includes(z) ? ' on' : '') + '" data-t2="pcsz" data-n="' + esc(z) + '" ' + a + '>' + esc(z) + '</button>').join('') + '</span><span class="muted small">' + esc(T('nichts gewählt = alle')) + '</span></div>';
        }
        if (l.type === 'constant') h += '<div class="t2-row"><span class="small t2-k">' + esc(T('Stärke')) + '</span>' + rng('data-t2="lf" data-f="value" ' + a, l.value, 0, 100, 1, ' %') + '</div>';
        if (l.type === 'param') h += '<div class="t2-row"><span class="small t2-k">' + esc(T('Parameter')) + '</span><input type="text" data-t2="lparam" ' + a + ' value="' + esc(l.param) + '" placeholder="' + esc(T('z. B. Tail_Wag')) + '" style="flex:1" maxlength="80"></div>';
        if (ty.zone || l.type === 'param') h += '<div class="t2-row"><span class="small t2-k">' + esc(T('Modus')) + '</span>' + seg('data-t2="lmode" ' + a, x.mode, MODES) + '</div>';
        if (l.type !== 'constant') {
            h += '<div class="t2-grid"><label class="small"><span class="t2-lt">' + esc(T('Bereich')) + help('Min = Stärke bei der leisesten Berührung, Max = Stärke bei voller Tiefe bzw. Bewegung.') + '</span>' + dual('data-t2="ld" ' + a, 'lo', x.lo, 'hi', x.hi, 0, 100, ' %') + '</label>'
                + '<label class="small"><span class="t2-lt">' + esc(T('Kurve')) + help('Links: reagiert schon bei wenig kräftig. Rechts: fängt sanft an und wird erst spät stark.') + '</span>' + rng('data-t2="lf" data-f="curve" ' + a, x.curve, 0.3, 3, 0.1, '', 'curve') + '</label>'
                + '<label class="small"><span class="t2-lt">' + esc(T('Glättung')) + help('Weicher Übergang statt Zappeln – je höher, desto ruhiger (aber träger).') + '</span>' + rng('data-t2="lf" data-f="smooth" ' + a, x.smooth, 0, 2000, 50, '', 'ms') + '</label>'
                + (ty.zone ? '<label class="small"><span class="t2-lt">' + esc(T('Leerlauf')) + help('Leichtes Grundsummen, solange dein Avatar Werte sendet, aber gerade niemand berührt.') + '</span>' + rng('data-t2="lf" data-f="idle" ' + a, x.idle, 0, 50, 1, ' %') + '</label>' : '')
                + ((ty.zone || l.type === 'param') && x.mode !== 'depth' ? '<label class="small"><span class="t2-lt">' + esc(T('Bewegungs-Empfindlichkeit')) + help('Wie schnell die Bewegung sein muss, bis 100 % erreicht sind.') + '</span>' + rng('data-t2="lf" data-f="sens" ' + a, x.sens, 0.2, 5, 0.1, '×') + '</label>' : '') + '</div>';
        }
        if (l.mut && l.mut.length) h += '<div class="t2-row"><span class="small t2-k">' + esc(T('Alte Mutatoren')) + help('Aus früheren Versionen übernommen und weiter wirksam. Neu besser über Bereich, Kurve und Modus.') + '</span><span class="t2-chips">' + l.mut.map((m, mi) => '<button type="button" class="t2-chip ex" data-t2="mutdel" ' + a + ' data-m="' + mi + '">' + esc(T(MUT[m.t] || m.t)) + ' ' + m.v + ' ✕</button>').join('') + '</span></div>';
        return h + '</div>';
    }

    // ---------- Avatar-Zonen (live) ----------
    function sourcesHtml(t) {
        const src = t.sources || [];
        shown = src.map(s => s.id).join(',');
        const body = src.length ? '<div class="t2-srcs">' + src.map(s => '<div class="t2-src' + (s.live ? ' live' : '') + '" data-live-src="' + esc(s.id) + '"><span class="t2-licon">' + TYPES[s.type].icon + '</span><b>' + esc(s.name) + '</b>'
            + (s.sys ? '<span class="vx-pill">' + esc(SYS[s.sys] || s.sys) + '</span>' : '')
            + '<span class="t2-sv" title="' + esc(T('von anderen')) + '">👥 ' + bar(s.others, 'data-live-so="' + esc(s.id) + '"') + '</span><span class="t2-sv" title="' + esc(T('von mir selbst')) + '">🙋 ' + bar(s.self, 'data-live-ss="' + esc(s.id) + '"', 'self') + '</span></div>').join('') + '</div>'
            : '<p class="muted small">' + esc(T('Noch keine Zonen erkannt. Trage einen Avatar mit SPS (VRCFury), OGB oder TPS, OSC in VRChat an – die Zonen erscheinen dann hier automatisch.')) + '</p>';
        return card('🎯 ' + esc(T('Zonen deines Avatars')) + ' <span class="muted small">' + esc(T('live')) + '</span>', body
            + '<p class="small"><button type="button" class="btn btn-sm" data-od="1">🐞 ' + esc(T('Avatar-Debugger öffnen')) + '</button> <span class="muted">' + esc(T('zeigt alle ankommenden Werte')) + '</span></p>', 't2-srccard');
    }

    // ---------- Teilen & ältere Wege ----------
    function shareHtml(t) {
        const tc = t.cfg;
        return card('📤 ' + esc(T('Zuordnung teilen')), '<p class="muted small">' + esc(T('Als Text kopieren und bei dir oder einer anderen Person wieder einfügen – enthält nur Einstellungen.')) + '</p>'
            + '<div class="nc-row"><button type="button" class="btn btn-sm" data-t2="export">📤 ' + esc(T('Alles exportieren')) + '</button></div>'
            + (shareCode ? '<div class="nc-row"><input type="text" readonly value="' + esc(shareCode) + '" style="flex:1" aria-label="' + esc(T('Zuordnungs-Code')) + '"><button type="button" class="vx-copy" data-copy="' + esc(shareCode) + '">⧉</button></div>' : '')
            + '<div class="nc-row"><input type="text" id="t2Import" placeholder="NXTL1.…" style="flex:1" aria-label="' + esc(T('Code einfügen')) + '"><select id="t2ImportTo" aria-label="' + esc(T('für Gerät')) + '"><option value="">' + esc(T('wie im Code')) + '</option>' + t.devices.map(d => '<option value="' + esc(d.name) + '">→ ' + esc(d.label) + '</option>').join('') + '</select><button type="button" class="btn btn-sm" data-t2="import">📥 ' + esc(T('Übernehmen')) + '</button></div>')
            + card('🗃 ' + esc(T('Ältere Wege')) + ' <span class="muted small">' + esc(T('weiter verfügbar')) + '</span>',
                '<details class="ns-edit"><summary class="small">' + esc(T('Einfacher OGB-Modus (alle Geräte gleich)')) + '</summary><label class="check small"><input type="checkbox" data-nk="ogb"' + (tc.ogb ? ' checked' : '') + '> ' + esc(T('OGB-/SPS-Parameter steuern alle Geräte (Nähe = Stärke)')) + '</label><label class="check small"><input type="checkbox" data-nk="ogb_self"' + (tc.ogb_self ? ' checked' : '') + '> ' + esc(T('auch eigene Berührungen (Self)')) + '</label></details>'
                + '<details class="ns-edit"><summary class="small">' + esc(T('Eigene Regeln (beliebiger Parameter → Stärke)')) + '</summary><label class="check small"><input type="checkbox" data-nk="auto"' + (tc.auto ? ' checked' : '') + '> ' + esc(T('Regeln aktiv')) + '</label>'
                + '<textarea id="nsRules" rows="3" placeholder="Parameter | Gerät (all oder Nummer) | min | max   – z. B. Tail_Wag | all | 0.1 | 0.8">' + esc((tc.rules || []).map(r => r.param + ' | ' + r.device + ' | ' + r.min + ' | ' + r.max).join('\n')) + '</textarea><button type="button" class="btn btn-sm" data-ns="save_rules">💾 ' + esc(T('Speichern')) + '</button></details>'
                + '<p class="small">🌊 ' + esc(T('Muster, Überraschung & Statistik findest du unter')) + ' <a href="#" data-nsub="fun">🎲 ' + esc(T('Spielereien')) + '</a>.</p>', 't2-old');
    }

    function html(t, render) {
        last = t; reRender = render;
        if (!dirty) links = JSON.parse(JSON.stringify(t.cfg.links || {}));
        const devs = t.devices;
        let h = '<div class="t2-root ns-wide">' + headHtml(t);
        const orphan = Object.keys(links || {}).filter(n => !devs.some(d => d.name === n));
        h += card('🧸 ' + esc(T('Geräte')), devs.length ? devs.map((d, i) => devHtml(d, t, i)).join('')
            : '<p class="muted small">' + esc(T(t.connected ? 'Keine Geräte – „Geräte suchen“ drücken und das Spielzeug einschalten.' : 'Intiface Central starten, dort „Start Server“ drücken und oben verbinden.')) + '</p>')
            + (orphan.length ? '<p class="muted small t2-orphan">💤 ' + esc(T('Gespeichert, gerade nicht verbunden:')) + ' ' + orphan.map(n => esc(n) + ' <button type="button" class="nc-x" data-t2="orphdel" data-n="' + esc(n) + '" title="' + esc(T('Zuordnung löschen')) + '">✕</button>').join(' · ') + '</p>' : '');
        h += sourcesHtml(t) + shareHtml(t) + '</div>';
        startLive();
        return h;
    }

    // ---------- eigenes Auswahl-Menü (statt nativem <select>) ----------
    function addItems(t) {
        const src = t.sources || [], items = [];
        for (const [k, ty] of Object.entries(TYPES)) {
            const n = ty.zone ? src.filter(s => s.type === k).length : 0;
            items.push({ grp: ty.grp, icon: ty.icon, name: T(ty.name) + (ty.zone ? ' · ' + T('alle') : ''), desc: T(ty.desc) + (ty.zone ? ' (' + n + ' ' + T('erkannt') + ')' : ''), act: { type: k } });
            if (ty.zone) for (const s of src.filter(x => x.type === k)) items.push({ grp: ty.grp, icon: '　' + ty.icon, name: s.name, desc: T(ty.name) + (s.sys ? ' · ' + (SYS[s.sys] || s.sys) : ''), live: 'data-live-mo="' + esc(s.id) + '"', val: s.others, act: { type: k, zone: s.name } });
        }
        return items;
    }
    function zoneItems(t, type, l) {
        return (t.sources || []).filter(s => s.type === type && !l.include.includes(s.name) && !l.exclude.includes(s.name))
            .map(s => ({ grp: T((TYPES[type] || {}).name || ''), icon: TYPES[type].icon, name: s.name, desc: s.sys ? SYS[s.sys] || s.sys : '', live: 'data-live-mo="' + esc(s.id) + '"', val: s.others, act: { zone: s.name } }));
    }
    function tplItems(t) { return (t.presets || []).map(p => ({ grp: T('Vorlagen'), icon: '', name: T(p.name), desc: T(p.desc), act: { preset: p.id } })); }
    function openMenu(anchor, items, onPick, emptyText) {
        closeMenu();
        const el = document.createElement('div');
        el.className = 't2-menu'; el.setAttribute('role', 'dialog');
        menu = { el, items, onPick, q: '', sel: 0, anchor, emptyText };
        document.body.appendChild(el);
        drawMenu();
        const r = anchor.getBoundingClientRect(), w = Math.min(360, window.innerWidth - 16);
        el.style.width = w + 'px';
        el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
        const below = window.innerHeight - r.bottom;
        if (below < 260 && r.top > below) { el.style.bottom = (window.innerHeight - r.top + 4) + 'px'; el.style.maxHeight = Math.max(160, r.top - 16) + 'px'; }
        else { el.style.top = (r.bottom + 4) + 'px'; el.style.maxHeight = Math.max(160, below - 16) + 'px'; }
        const inp = el.querySelector('input'); (inp || el.querySelector('[role=option]') || el).focus();
        setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    }
    const outside = e => { if (menu && !menu.el.contains(e.target)) closeMenu(); };
    function closeMenu(refocus) {
        if (!menu) return;
        document.removeEventListener('pointerdown', outside, true);
        const a = menu.anchor; menu.el.remove(); menu = null;
        if (refocus && a && document.contains(a)) a.focus();
    }
    const filtered = () => { const q = menu.q.trim().toLowerCase(); return q ? menu.items.filter(i => (i.name + ' ' + i.desc + ' ' + i.grp).toLowerCase().includes(q)) : menu.items; };
    function drawMenu() {
        const list = filtered(), search = menu.items.length > 8;
        if (menu.sel >= list.length) menu.sel = Math.max(0, list.length - 1);
        let grp = '', h = search ? '<input type="search" class="t2-msearch" placeholder="' + esc(T('Suchen …')) + '" value="' + esc(menu.q) + '" aria-label="' + esc(T('Suchen')) + '">' : '';
        h += '<div class="t2-mlist" role="listbox">';
        list.forEach((it, i) => {
            if (it.grp !== grp) { grp = it.grp; h += '<div class="t2-mgrp" role="presentation">' + esc(T(grp)) + '</div>'; }
            h += '<button type="button" role="option" class="t2-mitem' + (i === menu.sel ? ' sel' : '') + '" data-mi="' + i + '" aria-selected="' + (i === menu.sel) + '" tabindex="-1"><span class="t2-micon">' + it.icon + '</span><span class="t2-mtxt"><b>' + esc(it.name) + '</b><span class="small muted">' + esc(it.desc) + '</span></span>'
                + (it.live ? '<span class="t2-mval">' + bar(it.val, it.live) + '</span>' : '') + '</button>';
        });
        if (!list.length) h += '<p class="muted small t2-mempty">' + esc(T(menu.emptyText || 'Nichts gefunden.')) + '</p>';
        menu.el.innerHTML = h + '</div>';
        const inp = menu.el.querySelector('input');
        if (inp) { inp.addEventListener('input', () => { menu.q = inp.value; menu.sel = 0; const pos = inp.selectionStart; drawMenu(); const n = menu.el.querySelector('input'); n.focus(); n.setSelectionRange(pos, pos); }); }
        menu.el.onkeydown = menuKey;
        menu.el.onclick = e => { const b = e.target.closest('[data-mi]'); if (b) pick(+b.dataset.mi); };
        const s = menu.el.querySelector('.t2-mitem.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
    }
    function menuKey(e) {
        if (!menu) return;
        const n = filtered().length;
        if (e.key === 'Escape') { e.preventDefault(); return closeMenu(true); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!n) return; menu.sel = (menu.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; const q = menu.el.querySelector('input'); const hadFocus = q && document.activeElement === q; drawMenu(); if (hadFocus) menu.el.querySelector('input').focus(); else { const s = menu.el.querySelector('.t2-mitem.sel'); if (s) s.focus(); } return; }
        if (e.key === 'Enter') { e.preventDefault(); if (n) pick(menu.sel); return; }
        if (e.key === 'Tab') closeMenu();
    }
    function pick(i) { const it = filtered()[i]; if (!it || !menu) return; const fn = menu.onPick; closeMenu(true); fn(it.act); }

    // ---------- Live-Anzeige ----------
    function startLive() {
        if (liveT) return;
        liveT = setInterval(() => {
            const root = document.querySelector('.t2-root');
            if (!root || root.closest('[hidden]') || document.hidden) { if (!root) { clearInterval(liveT); liveT = null; } return; }
            api('toys_live').then(applyLive).catch(() => {});
        }, 400);
    }
    const q = sel => document.querySelectorAll(sel);
    const setW = (sel, v) => q(sel).forEach(el => { el.style.width = Math.max(0, Math.min(100, v)) + '%'; });
    const setT = (sel, txt) => q(sel).forEach(el => { el.textContent = txt; });
    function applyLive(L) {
        if (!last) return;
        // Struktur geändert (Verbindung, Geräte, neue Zonen) → neu zeichnen
        const ids = (L.sources || []).map(s => s.id).join(',');
        if (L.connected !== last.connected || L.devices.length !== last.devices.length || ids !== shown || L.links_on !== last.cfg.links_on || L.consent !== last.consent) {
            last.connected = L.connected; last.sources = L.sources; last.consent = L.consent; shown = ids;
            if (window.NexusNsfw && window.NexusNsfw.refresh) window.NexusNsfw.refresh();
            return;
        }
        for (const d of L.devices) {
            setW('[data-live-out="' + d.index + '"]', d.out); setT('[data-live-outn="' + d.index + '"]', d.out + ' %');
            if (d.battery !== null) setT('[data-live-bat="' + d.index + '"]', '🔋 ' + d.battery + ' %');
            if (d.lin_pos !== null) q('[data-live-lin="' + d.index + '"]').forEach(el => { el.style.left = d.lin_pos + '%'; });
        }
        for (const s of L.sources || []) { setW('[data-live-so="' + CSS.escape(s.id) + '"]', s.others); setW('[data-live-ss="' + CSS.escape(s.id) + '"]', s.self); setW('[data-live-mo="' + CSS.escape(s.id) + '"]', s.others);
            q('[data-live-src="' + CSS.escape(s.id) + '"]').forEach(el => el.classList.toggle('live', s.live)); }
        const info = L.link_info || {};
        q('[data-live-lrow]').forEach(row => {
            const k = row.dataset.liveLrow, i = k.lastIndexOf('|'), name = k.slice(0, i), li = +k.slice(i + 1), x = info[name];
            const v = x && x.vals ? x.vals[li] || 0 : 0;
            row.classList.toggle('win', !!(x && x.win === li && v > 0));
            const b = row.querySelector('[data-live-lv]'); if (b) b.style.width = v + '%';
            const n = row.querySelector('[data-live-lvn]'); if (n) n.textContent = v + ' %';
        });
        q('[data-live-dev]').forEach(el => { const x = info[el.dataset.liveDev]; el.textContent = (x ? x.lv : 0) + ' %'; });
        last.link_info = info;
    }

    // ---------- Ereignisse ----------
    const devOf = el => last && last.devices[+el.dataset.d];
    const linkOf = el => { const d = devOf(el); if (!d || !links) return {}; const list = links[d.name] = links[d.name] || []; return { d, list, l: list[+el.dataset.l] }; };
    function onClick(e, toysDo, render) {
        const el = e.target.closest('[data-t2]');
        if (!el || !last) return false;
        const k = el.dataset.t2, d = devOf(el);
        if (k === 'dopen' && d) { openDev[d.name] = openDev[d.name] === false; lsSet('open', openDev); render(); return true; }
        if (k === 'tap') { toysDo('toys_tap', { device: el.dataset.dev }); return true; }
        if (k === 'stopdev') { toysDo('toys_stop_dev', { device: el.dataset.dev }); return true; }
        if (k === 'mute' && d) { devCfg(d.name, { on: d.on ? '0' : '1' }); return true; }
        if (k === 'mode' && d) { const m = el.dataset.v; if (m === 'expert' && !(links[d.name] || []).length) dirty = 0; toysDo('toys_follow', { name: d.name, mode: m }); return true; }
        if (k === 'preset' && d) { toysDo('toys_follow', { name: d.name, mode: 'simple', preset: el.dataset.v }); return true; }
        if (k === 'toexpert' && d) { dirty = 0; toysDo('toys_follow', { name: d.name, mode: 'expert', preset: d.cfg.preset, reset: '1' }); return true; }
        if (k === 'linkson') { toysDo('toys_cfg', { links_on: '1' }); return true; }
        if (k === 'dv' && d && el.tagName === 'BUTTON') { devCfg(d.name, { [el.dataset.k]: el.dataset.v }); return true; }
        if (k === 'tplmenu' && d) {
            openMenu(el, tplItems(last), act => { if ((links[d.name] || []).length && !confirm(T('Die Quellen dieses Geräts durch die Vorlage ersetzen?'))) return; dirty = 0; toysDo('toys_follow', { name: d.name, mode: 'expert', preset: act.preset, reset: '1' }); });
            return true;
        }
        if (k === 'addmenu' && d) {
            openMenu(el, addItems(last), act => {
                const l = linkDef(act.type); if (act.zone) l.include = [act.zone];
                (links[d.name] = links[d.name] || []).push(l);
                if (links[d.name].length > 10) { links[d.name].pop(); toast(T('Höchstens 10 Quellen je Gerät.'), true); return; }
                openLink[d.name + '|' + (links[d.name].length - 1)] = true; save(); render();
            });
            return true;
        }
        if (k === 'zonemenu') {
            const x = linkOf(el); if (!x.l) return true;
            openMenu(el, zoneItems(last, x.l.type, x.l), act => { if (!x.l.include.includes(act.zone)) x.l.include.push(act.zone); save(); render(); }, 'Keine weiteren Zonen erkannt – Avatar tragen und berühren lassen.');
            return true;
        }
        if (k === 'export') { api('toys_links_export').then(r => { shareCode = r.code; toast(r.msg); render(); }).catch(x => toast(x.message, true)); return true; }
        if (k === 'import') {
            const c = document.getElementById('t2Import'), to = document.getElementById('t2ImportTo');
            if (!c || !c.value.trim()) return true;
            dirty = 0; toysDo('toys_links_import', { code: c.value.trim(), name: to ? to.value : '' }); return true;
        }
        if (k === 'orphdel') { if (!confirm(T('Gespeicherte Zuordnung löschen?'))) return true; delete links[el.dataset.n]; save(); render(); return true; }
        // Quellen bearbeiten
        const x = linkOf(el);
        if (!x.l && k !== 'lopen') return k.startsWith('l') || ['zcycle', 'src', 'pcsz', 'mutdel'].includes(k);
        if (k === 'lopen' && x.d) { const key = x.d.name + '|' + el.dataset.l; openLink[key] = !openLink[key]; render(); return true; }
        if (k === 'ldel') { x.list.splice(+el.dataset.l, 1); openLink = {}; }
        else if (k === 'zcycle') { const n = el.dataset.n; if (x.l.include.includes(n)) { x.l.include = x.l.include.filter(z => z !== n); x.l.exclude.push(n); } else x.l.exclude = x.l.exclude.filter(z => z !== n); }
        else if (k === 'src') x.l.src[el.dataset.k] = !x.l.src[el.dataset.k];
        else if (k === 'pcsz') { const n = el.dataset.n; x.l.include = x.l.include.includes(n) ? x.l.include.filter(z => z !== n) : x.l.include.concat(n); }
        else if (k === 'lmode') x.l.mode = el.dataset.v;
        else if (k === 'mutdel') x.l.mut.splice(+el.dataset.m, 1);
        else return false;
        save(); render(); return true;
    }
    function onChange(e, toysDo, render) {
        const fd = e.target.closest('details[data-t2fine]');
        if (fd && e.target === fd) return false;
        const el = e.target.closest('[data-t2]');
        if (!el || !last) return false;
        const k = el.dataset.t2, d = devOf(el);
        if (k === 'dv' && d) { devCfg(d.name, { [el.dataset.k]: el.value }); return true; }
        if (k === 'dvd' && d) { const box = el.closest('.t2-dual'), [a, b] = box.querySelectorAll('input'); devCfg(d.name, { [a.dataset.f]: a.value, [b.dataset.f]: b.value }); return true; }
        const x = linkOf(el); if (!x.l) return true;
        if (k === 'noself') { for (const s of ['pen_self', 'touch_self', 'frot_self']) x.l.src[s] = !el.checked ? s !== 'frot_self' : false; }
        else if (k === 'lf') x.l[el.dataset.f] = Number(el.value);
        else if (k === 'ld') { const box = el.closest('.t2-dual'); box.querySelectorAll('input').forEach(i => { x.l[i.dataset.f] = Number(i.value); }); }
        else if (k === 'lparam') x.l.param = el.value.trim().replace(/^\/avatar\/parameters\//, '');
        else return false;
        save(); render(); return true;
    }
    function onInput(e) {
        const r = e.target.closest('.t2-root input[type=range]');
        if (!r) return false;
        const du = r.closest('.t2-dual');
        if (du) {
            const lo = du.querySelector('.lo'), hi = du.querySelector('.hi'), min = +lo.min, max = +lo.max;
            if (+lo.value > +hi.value - 5) { if (r === lo) lo.value = Math.max(min, +hi.value - 5); else hi.value = Math.min(max, +lo.value + 5); }
            const fill = du.querySelector('.t2-dtrack i'), p1 = pct(+lo.value, min, max), p2 = pct(+hi.value, min, max);
            fill.style.left = p1 + '%'; fill.style.width = (p2 - p1) + '%';
            du.querySelector('.t2-dval').textContent = lo.value + ' – ' + hi.value + (du.dataset.unit || '');
            return true;
        }
        const b = r.parentNode.querySelector('b'); if (b) b.textContent = lab(+r.value, r.dataset.unit, r.dataset.fmt);
        return r.dataset.nk === undefined;   // Höchststärke speichert nexus-nsfw.js beim Loslassen
    }
    /** Fein-Einstellungen erst beim Aufklappen zeichnen */
    document.addEventListener('toggle', e => { const d = e.target; if (!d.matches || !d.matches('details[data-t2fine]')) return; fine[d.dataset.t2fine] = d.open; if (d.open && !d.querySelector('.n2-dbody') && reRender) reRender(); }, true);
    window.NexusToys2 = { html, onClick, onChange, onInput, busy: () => !!menu || (dirty && Date.now() - dirty < 1500) };
})();
