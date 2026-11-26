'use strict';
/*
 * Herzschlag: EINE gemeinsame Puls-Quelle für die ganze App.
 *   Quellen: Pulsoid (REST, eigenes Token), HypeRate (WebSocket, Widget-ID + API-Schlüssel), OSC (Smartwatch-Apps,
 *   die einen Avatar-Parameter schicken – z. B. „HR“ oder „HeartRate“).
 *   Ausgabe: Platzhalter {puls}/{puls_min}/{puls_max}/{puls_schnitt} (Chatbox-Module, Rotator, Makros, Stream Deck, HUD),
 *   Avatar-Parameter per OSC (HR, HRPercent, isHRActive, isHRConnected, onesHR/tensHR/hundredsHR + eigener Name),
 *   Verlauf der letzten 10 Minuten für die Kurve auf der Startseite.
 * Eigene Umsetzung. Schlüssel werden verschlüsselt gespeichert. Läuft nur in der Windows-App.
 */
const { str, int, cut, UserError } = require('./util');

const SOURCES = ['off', 'pulsoid', 'hyperate', 'osc', 'watch'];   // 5.2: watch = VRC Nexus Watch (Wear OS, Heimnetz)
const DEF = { source: '', send_osc: true, param: 'HeartRate', min: 50, max: 180, osc_in: 'HR, HeartRate, Heartrate, HeartRateInt, BPM', hyperate_id: '' };
const STALE = 20000;          // ohne neuen Wert nach 20 s gilt der Puls als weg
const KEEP = 10 * 60000;      // Verlauf: 10 Minuten
const base = (env, def) => ((typeof process !== 'undefined' && process.env && process.env[env]) || def).replace(/\/+$/, '');
/* 4.2.3: HypeRate läuft über die Weiterleitung des Projekts (Schlüssel bleibt auf dem Server, siehe apps/hyperate-relay) */
const RELAY = () => require('./servers').hyperate();
const RELAY_ERR = { bad_id: 'HypeRate: Device-ID ungültig', join_rejected: 'HypeRate: Device-ID unbekannt – ID in der HypeRate-App prüfen', relay_no_key: 'HypeRate-Weiterleitung noch nicht eingerichtet',
    too_many_connections: 'HypeRate-Weiterleitung: zu viele Verbindungen von dieser Adresse', relay_full: 'HypeRate-Weiterleitung ausgelastet – gleich nochmal' };
const normName = s => str(s).toLowerCase().replace(/^\/?avatar\/parameters\//, '').replace(/[^a-z0-9]/g, '');

class Heart {
    constructor(app, crypt) {
        this.app = app;
        this.crypt = crypt;
        this.bpm = 0; this.at = 0; this.error = ''; this.hist = [];
        this.lastPoll = 0; this.lastSend = 0; this.wasActive = false;
        this.ws = null; this.wsKey = ''; this.wsTimer = null;
        this.timer = null;
        const osc = app.game.osc;
        (osc.taps = osc.taps || new Set()).add((address, args) => this.onOsc(address, args));
        const prev = app.game.vars;
        app.game.vars = () => Object.assign({}, prev ? prev() : {}, this.vars());
    }

    // ---------- Einstellungen ----------
    cfg() {
        let c = {};
        try { c = JSON.parse(this.app.db.setting('heart', '{}')) || {}; } catch (e) { c = {}; }
        const out = Object.assign({}, DEF, c);
        if (!c.param) {   // aus den alten Chatbox-Modul-Einstellungen übernehmen
            try { const cm = JSON.parse(this.app.db.setting('chatmods', '{}')) || {}; if (cm.hr_param) out.param = cm.hr_param; if (cm.hr_osc === false) out.send_osc = false; } catch (e) { /* egal */ }
        }
        if (!SOURCES.includes(out.source)) out.source = this.pulsoidToken() ? 'pulsoid' : 'off';
        return out;
    }
    save(input) {
        const c = this.cfg(), b = v => v === true || v === '1' || v === 'true' || v === 'on';
        if (input.source !== undefined) { if (!SOURCES.includes(str(input.source))) throw new UserError('Unbekannte Puls-Quelle.'); c.source = str(input.source); }
        if (input.send_osc !== undefined) c.send_osc = b(input.send_osc);
        if (input.param !== undefined) c.param = str(input.param).replace(/[^\w/\-.]/g, '').slice(0, 64);
        if (input.min !== undefined) c.min = Math.max(20, Math.min(150, int(input.min) || DEF.min));
        if (input.max !== undefined) c.max = Math.max(c.min + 10, Math.min(250, int(input.max) || DEF.max));
        if (input.osc_in !== undefined) c.osc_in = cut(str(input.osc_in).replace(/[^\w/\-., ]/g, ''), 200);
        if (input.hyperate_id !== undefined) {
            const id = str(input.hyperate_id).trim().replace(/^.*hyperate\.io\//i, '');
            if (id && !/^[\w-]{2,40}$/.test(id)) throw new UserError('Die HypeRate-ID besteht nur aus Buchstaben und Ziffern (z. B. „a1b2c3“).');
            c.hyperate_id = id;
        }
        this.app.db.setSetting('heart', JSON.stringify(c));
        this.reset();
        this.apply();
        return c;
    }
    // ---------- Schlüssel (verschlüsselt) ----------
    secret(k) { try { return this.crypt.decrypt(this.app.db.setting(k, '')) || ''; } catch (e) { return ''; } }
    pulsoidToken() { return this.secret('chatmods_hr'); }
    setPulsoidToken(t) {
        t = str(t).trim();
        if (t && !/^[\w-]{20,200}$/.test(t)) throw new UserError('Das sieht nicht wie ein Pulsoid-Token aus.');
        this.app.db.setSetting('chatmods_hr', t ? this.crypt.encrypt(t) : '');
        this.reset();
    }
    hyperateKey() { return this.secret('heart_hyperate'); }
    setHyperateKey(t) {
        t = str(t).trim();
        if (t && !/^[\w.-]{8,300}$/.test(t)) throw new UserError('Das sieht nicht wie ein HypeRate-API-Schlüssel aus.');
        this.app.db.setSetting('heart_hyperate', t ? this.crypt.encrypt(t) : '');
        this.reset();
    }

    // ---------- Zustand ----------
    get active() { return this.bpm > 0 && Date.now() - this.at < STALE; }
    reset() { this.bpm = 0; this.at = 0; this.error = ''; this.lastPoll = 0; this.closeWs(); }
    /** neuer Messwert aus irgendeiner Quelle */
    push(bpm, from) {
        bpm = Math.round(Number(bpm));
        if (!(bpm >= 25 && bpm <= 250)) return false;
        const t = Date.now();
        this.bpm = bpm; this.at = t; this.error = ''; this.from = from || '';
        const last = this.hist[this.hist.length - 1];
        if (last && t - last.t < 1000) last.v = bpm; else this.hist.push({ t, v: bpm });
        while (this.hist.length && t - this.hist[0].t > KEEP) this.hist.shift();
        this.sendOsc();
        return true;
    }
    stats() {
        const t = Date.now(), l = this.hist.filter(h => t - h.t <= KEEP).map(h => h.v);
        return l.length ? { min: Math.min(...l), max: Math.max(...l), avg: Math.round(l.reduce((a, b) => a + b, 0) / l.length) } : { min: 0, max: 0, avg: 0 };
    }
    vars() {
        const s = this.stats(), on = this.active;
        return { puls: on ? String(this.bpm) : '', puls_min: s.min ? String(s.min) : '', puls_max: s.max ? String(s.max) : '', puls_schnitt: s.avg ? String(s.avg) : '' };
    }
    /** Avatar-Parameter – auch HRtoVRChat-kompatible Namen, damit vorhandene Avatar-Anzeigen funktionieren */
    sendOsc(force) {
        const c = this.cfg();
        if (!c.send_osc || c.source === 'osc' || c.source === 'off') return;   // bei OSC-Quelle nicht zurückschicken (Schleife)
        const t = Date.now();
        if (!force && t - this.lastSend < 900) return;
        this.lastSend = t;
        const osc = this.app.game.osc, p = n => '/avatar/parameters/' + n, on = this.active, bpm = on ? this.bpm : 0;
        const pct = on ? Math.max(0, Math.min(1, (bpm - c.min) / (c.max - c.min))) : 0;
        const out = [[p('HR'), bpm], [p('HRPercent'), { float: Math.round(pct * 1000) / 1000 }], [p('isHRActive'), on], [p('isHRConnected'), on],
            [p('onesHR'), bpm % 10], [p('tensHR'), Math.floor(bpm / 10) % 10], [p('hundredsHR'), Math.floor(bpm / 100) % 10]];
        if (c.param && c.param !== 'HR') out.push([p(c.param), bpm], [p(c.param + 'Float'), { float: Math.min(1, bpm / 255) }]);
        for (const [a, v] of out) osc.send(a, v).catch(() => {});
    }

    // ---------- Quellen ----------
    onOsc(address, args) {
        if (!args || !args.length || !address.startsWith('/avatar/parameters/')) return;
        const c = this.cfg();
        if (c.source !== 'osc') return;
        const n = normName(address), want = str(c.osc_in).split(/[,\s]+/).map(normName).filter(Boolean);
        if (!want.includes(n)) return;
        let v = args[0];
        if (typeof v === 'boolean') return;
        v = Number(v);
        if (v > 0 && v <= 1 && !Number.isInteger(v)) v = v * 255;     // Float-Variante (0…1 = 0…255)
        this.push(v, 'osc');
    }
    async pollPulsoid() {
        const tok = this.pulsoidToken();
        if (!tok) { this.error = 'Kein Pulsoid-Token'; return; }
        try {
            const r = await fetch(base('NEXUS_PULSOID_BASE', 'https://dev.pulsoid.net') + '/api/v1/data/heart_rate/latest', { headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(8000) });
            if (r.status === 412 || r.status === 204) { this.error = 'Pulsoid: noch kein Messwert'; return; }
            if (!r.ok) { this.error = r.status === 401 || r.status === 403 ? 'Pulsoid-Token ungültig – neues Token eintragen oder HypeRate als Quelle wählen' : 'Pulsoid: HTTP ' + r.status; return; }
            const j = await r.json();
            const at = int(j.measured_at);
            if (at && Date.now() - at > 60000) { this.error = 'Pulsoid: kein aktueller Messwert'; return; }
            this.push(int((j.data || {}).heart_rate), 'pulsoid');
        } catch (e) { this.error = 'Pulsoid nicht erreichbar'; }
    }
    /** HypeRate: Phoenix-Kanal „hr:<ID>“ über WebSocket */
    openHyperate(c) {
        const key = this.hyperateKey();
        if (!c.hyperate_id) { this.error = 'HypeRate-Device-ID fehlt'; return; }
        // Normalfall: über die Weiterleitung des Projekts; 4.2.4: klappt ein eigener (z. B. alter) Schlüssel nicht, 10 min lang auch die Weiterleitung nutzen
        if (!key || Date.now() < (this.ownKeyFailedUntil || 0)) return this.openRelay(c);
        const sig = c.hyperate_id + '|' + key;
        if (this.ws && this.wsKey === sig) return;
        this.closeWs();
        const WS = globalThis.WebSocket;
        if (!WS) { this.error = 'WebSocket nicht verfügbar'; return; }
        let ws;
        try { ws = new WS(base('NEXUS_HYPERATE_WS', 'wss://app.hyperate.io') + '/socket/websocket?token=' + encodeURIComponent(key)); } catch (e) { this.error = 'HypeRate nicht erreichbar'; return; }
        this.ws = ws; this.wsKey = sig;
        let ref = 0;
        const send = (topic, event) => { try { ws.send(JSON.stringify({ topic, event, payload: {}, ref: ++ref })); } catch (e) { /* zu */ } };
        ws.onopen = () => {
            send('hr:' + c.hyperate_id, 'phx_join');
            this.wsTimer = setInterval(() => send('phoenix', 'heartbeat'), 25000);
            if (this.wsTimer.unref) this.wsTimer.unref();
        };
        ws.onmessage = ev => {
            let m; try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
            if (m.event === 'hr_update' && m.payload) { got = true; this.push(m.payload.hr, 'hyperate'); }
            else if (m.event === 'phx_reply' && m.payload && m.payload.status === 'error') this.error = 'HypeRate: Beitritt abgelehnt (ID/Schlüssel prüfen)';
        };
        let got = false;
        ws.onerror = () => { this.error = 'HypeRate nicht erreichbar'; if (!got && this.ws === ws) { this.ownKeyFailedUntil = Date.now() + 600000; this.closeWs(); } };   // nicht auf close warten
        ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.wsKey = ''; clearInterval(this.wsTimer); if (!got) { this.ownKeyFailedUntil = Date.now() + 600000; this.error = ''; } } };
    }
    /** 4.2.3: HypeRate über die Weiterleitung (Server-Sent Events: „data: {hr}“) – ohne Schlüssel in der App */
    openRelay(c) {
        const sig = 'relay|' + c.hyperate_id;
        if (this.relay && this.relayKey === sig) return;
        if (this.ws) this.closeWs();
        if (this.relay) this.closeRelay();
        if (Date.now() < (this.relayRetryAt || 0)) return;
        const ctl = new AbortController();
        this.relay = ctl; this.relayKey = sig;
        const url = base('NEXUS_HYPERATE_RELAY', RELAY()) + '/hr/' + encodeURIComponent(c.hyperate_id);
        (async () => {
            let got = false;
            try {
                const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'text/event-stream' }, cache: 'no-store' });
                if (!r.ok || !r.body) {
                    let code = ''; try { code = (await r.json()).error || ''; } catch (e) { /* kein JSON */ }
                    this.error = RELAY_ERR[code] || 'HypeRate-Weiterleitung: HTTP ' + r.status;
                    this.relayWait = code === 'bad_id' ? 60000 : 15000;
                    return;
                }
                this.relayWait = 5000;
                const rd = r.body.getReader(), dec = new TextDecoder();
                let buf = '';
                for (;;) {
                    const { value, done } = await rd.read();
                    if (done) break;
                    buf += dec.decode(value, { stream: true }).replace(/\r/g, '');
                    let i;
                    while ((i = buf.indexOf('\n\n')) >= 0) {
                        const block = buf.slice(0, i); buf = buf.slice(i + 2);
                        const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
                        if (!data) continue;
                        let m; try { m = JSON.parse(data); } catch (e) { continue; }
                        if (m.hr !== undefined) { got = true; this.push(m.hr, 'hyperate'); }
                        else if (m.error) this.error = RELAY_ERR[m.error] || 'HypeRate: ' + m.error;
                    }
                }
            } catch (e) {
                if (!ctl.signal.aborted) this.error = 'HypeRate-Weiterleitung nicht erreichbar';
            } finally {
                if (this.relay === ctl) {
                    this.relay = null; this.relayKey = '';
                    this.relayRetryAt = Date.now() + (got ? 2000 : this.relayWait || 5000);
                    this.relayWait = Math.min(60000, (this.relayWait || 5000) * (got ? 1 : 2));
                }
            }
        })();
    }
    closeRelay() { if (this.relay) { const r = this.relay; this.relay = null; this.relayKey = ''; try { r.abort(); } catch (e) { /* egal */ } } }
    closeWs() { this.closeRelay(); clearInterval(this.wsTimer); this.wsTimer = null; if (this.ws) { const w = this.ws; this.ws = null; this.wsKey = ''; try { w.close(); } catch (e) { /* egal */ } } }

    /** wird von den Chatbox-Modulen und vom eigenen Takt aufgerufen */
    async refresh(force) {
        const c = this.cfg(), t = Date.now();
        if (c.source === 'pulsoid' && (force || t - this.lastPoll >= 3000)) { this.lastPoll = t; await this.pollPulsoid(); }
        if (c.source === 'hyperate') this.openHyperate(c); else if (this.ws || this.relay) this.closeWs();
        if (c.source === 'osc' && !this.active && !this.error) this.error = '';
        // Puls weg → Avatar einmal „aus“ melden
        const on = this.active;
        if (this.wasActive && !on) this.sendOsc(true);
        this.wasActive = on;
    }
    start() { this.apply(); }
    apply() {
        const on = this.cfg().source !== 'off';
        if (on && !this.timer) { this.timer = setInterval(() => this.refresh().catch(() => {}), 1000); if (this.timer.unref) this.timer.unref(); }
        if (!on && this.timer) { clearInterval(this.timer); this.timer = null; this.closeWs(); }
    }
    stop() { clearInterval(this.timer); this.timer = null; this.closeWs(); }

    status() {
        const c = this.cfg(), t = Date.now();
        return { cfg: c, bpm: this.active ? this.bpm : 0, active: this.active, from: this.from || '', error: this.active ? '' : this.error, stats: this.stats(),
            hist: this.hist.filter(h => t - h.t <= KEEP).map(h => [Math.round((h.t - t) / 1000), h.v]),
            has_pulsoid: !!this.pulsoidToken(), has_hyperate: !!this.hyperateKey(), hyperate_via: this.hyperateKey() && Date.now() >= (this.ownKeyFailedUntil || 0) ? 'own_key' : 'relay' };
    }
    async action(act, input) {
        switch (act) {
            case 'hr_get': if (input.refresh === '1') await this.refresh(true); return this.status();
            case 'hr_save': { this.save(input); await this.refresh(true).catch(() => {}); return Object.assign(this.status(), { msg: input.quiet ? '' : 'Gespeichert.' }); }
            case 'hr_pulsoid_key': this.setPulsoidToken(input.token); return Object.assign(this.status(), { msg: input.token ? 'Pulsoid-Token gespeichert (verschlüsselt).' : 'Entfernt.' });
            case 'hr_hyperate_key': this.setHyperateKey(input.token); return Object.assign(this.status(), { msg: input.token ? 'HypeRate-Schlüssel gespeichert (verschlüsselt).' : 'Entfernt.' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Heart, normName };
