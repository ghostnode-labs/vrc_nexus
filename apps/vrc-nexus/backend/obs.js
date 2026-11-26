'use strict';
/*
 * 5.0: OBS-Anbindung über obs-websocket 5 (in OBS 28+ eingebaut: Werkzeuge → WebSocket-Server-Einstellungen).
 * Eigene, abhängigkeitsfreie Umsetzung (eingebauter WebSocket-Client, Anmeldung per SHA-256-Challenge).
 *  - Szene je Welt (Regeln: Teil des Weltnamens → Szene), Panik-Szene
 *  - Textquelle mit Platzhaltern ({puls}, {welt}, {spieler} …), alle paar Sekunden aktualisiert
 * Das OBS-Passwort wird verschlüsselt gespeichert.
 */
const crypto = require('crypto');
const { str, cut, int, UserError } = require('./util');

const DEF = { on: false, host: '127.0.0.1', port: 4455, rules: [], panic_scene: '', text_source: '', text_tpl: '❤ {puls} bpm · 🌐 {welt}', text_every: 5 };
const sha = s => crypto.createHash('sha256').update(s).digest('base64');

class Obs {
    constructor(app, crypt) {
        this.app = app; this.crypt = crypt;
        this.ws = null; this.ready = false; this.error = ''; this.pending = new Map(); this.reqId = 0; this.retry = null; this.backoff = 2000;
        this.scenes = []; this.lastText = ''; this.lastScene = '';
        this.textTimer = setInterval(() => this.updateText().catch(() => {}), 1000); if (this.textTimer.unref) this.textTimer.unref();
        this.textAt = 0;
        if (this.cfg().on) setTimeout(() => this.connect().catch(() => {}), 3000).unref?.();
    }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('obs_cfg', '{}')) || {}); } catch (e) { return Object.assign({}, DEF); } }
    password() { const v = this.app.db.setting('obs_pw', ''); try { return v ? this.crypt.decrypt(v) : ''; } catch (e) { return ''; } }
    saveCfg(c) {
        const n = this.cfg();
        if (c.on !== undefined) n.on = c.on === true || c.on === '1';
        if (c.host !== undefined) { const h = str(c.host).trim(); if (!/^[\w.-]{1,100}$/.test(h)) throw new UserError('Ungültiger Rechnername.'); n.host = h; }
        if (c.port !== undefined) n.port = Math.max(1, Math.min(65535, int(c.port) || 4455));
        if (c.password !== undefined) this.app.db.setSetting('obs_pw', str(c.password) ? this.crypt.encrypt(cut(str(c.password), 200)) : '');
        if (c.rules !== undefined) {
            let r = c.rules; if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = []; } }
            n.rules = (Array.isArray(r) ? r : []).map(x => ({ match: cut(str(x.match).trim(), 80), scene: cut(str(x.scene).trim(), 100) })).filter(x => x.match && x.scene).slice(0, 30);
        }
        for (const [k, m] of [['panic_scene', 100], ['text_source', 100], ['text_tpl', 300]]) if (c[k] !== undefined) n[k] = cut(str(c[k]), m);
        if (c.text_every !== undefined) n.text_every = Math.max(2, Math.min(60, int(c.text_every) || 5));
        this.app.db.setSetting('obs_cfg', JSON.stringify(n));
        if (!n.on) this.disconnect(); else if (c.host !== undefined || c.port !== undefined || c.password !== undefined || c.on !== undefined) { this.disconnect(); this.connect().catch(() => {}); }
        return n;
    }
    status() { const c = this.cfg(); return { cfg: c, has_password: !!this.password(), connected: this.ready, error: this.error, scenes: this.scenes, last_scene: this.lastScene }; }

    connect() {
        const c = this.cfg();
        if (!c.on) return Promise.resolve(this.status());
        if (this.ws) return Promise.resolve(this.status());
        clearTimeout(this.retry); this.retry = null;
        return new Promise(resolve => {
            let ws;
            try { ws = new globalThis.WebSocket('ws://' + c.host + ':' + c.port); } catch (e) { this.error = 'OBS nicht erreichbar'; return resolve(this.status()); }
            this.ws = ws; this.ready = false;
            const done = () => { resolve(this.status()); };
            const to = setTimeout(done, 5000);
            ws.onmessage = ev => {
                let m; try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
                if (m.op === 0) {   // Hello → Identify
                    const d = { rpcVersion: 1, eventSubscriptions: 0 }, a = m.d && m.d.authentication;
                    if (a) { const pw = this.password(); if (!pw) { this.error = 'OBS verlangt ein Passwort'; ws.close(); return; } d.authentication = sha(sha(pw + a.salt) + a.challenge); }
                    ws.send(JSON.stringify({ op: 1, d }));
                } else if (m.op === 2) {   // Identified
                    this.ready = true; this.error = ''; this.backoff = 2000; clearTimeout(to);
                    this.request('GetSceneList').then(r => { this.scenes = (r.scenes || []).map(s => s.sceneName).reverse(); }).catch(() => {}).finally(done);
                } else if (m.op === 7) {
                    const p = this.pending.get(m.d.requestId); if (!p) return;
                    this.pending.delete(m.d.requestId);
                    if (m.d.requestStatus && m.d.requestStatus.result) p.ok(m.d.responseData || {}); else p.bad(new UserError('OBS: ' + ((m.d.requestStatus && m.d.requestStatus.comment) || 'Anfrage abgelehnt')));
                }
            };
            ws.onerror = () => { if (!this.error) this.error = 'OBS nicht erreichbar (läuft OBS, ist der WebSocket-Server an?)'; };
            ws.onclose = ev => {
                if (this.ws !== ws) return;
                this.ws = null; this.ready = false; clearTimeout(to);
                if (ev && ev.code === 4009) this.error = 'OBS: Passwort falsch';
                for (const p of this.pending.values()) p.bad(new UserError('OBS getrennt'));
                this.pending.clear(); done();
                if (this.cfg().on && ev.code !== 4009) { this.retry = setTimeout(() => this.connect().catch(() => {}), this.backoff); if (this.retry.unref) this.retry.unref(); this.backoff = Math.min(this.backoff * 2, 60000); }
            };
        });
    }
    disconnect() { clearTimeout(this.retry); this.retry = null; const w = this.ws; this.ws = null; this.ready = false; if (w) { try { w.close(); } catch (e) { /* egal */ } } }
    request(type, data) {
        if (!this.ready || !this.ws) return Promise.reject(new UserError('OBS ist nicht verbunden.'));
        const id = 'nx' + (++this.reqId);
        return new Promise((ok, bad) => {
            this.pending.set(id, { ok, bad });
            setTimeout(() => { if (this.pending.delete(id)) bad(new UserError('OBS antwortet nicht.')); }, 5000).unref?.();
            this.ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
        });
    }
    async scene(name) { if (!name || name === this.lastScene) return; await this.request('SetCurrentProgramScene', { sceneName: name }); this.lastScene = name; }

    /** Welt betreten → passende Szene */
    onGameEvent(e) {
        if (e.kind !== 'world_join' || !this.ready) return;
        const w = str(e.world_name).toLowerCase(), r = this.cfg().rules.find(x => w.includes(x.match.toLowerCase()) || x.match === '*');
        if (r) this.scene(r.scene).catch(err => { this.error = err.message; });
    }
    onPanic() { const c = this.cfg(); if (this.ready && c.panic_scene) return this.scene(c.panic_scene).then(() => 'OBS-Szene „' + c.panic_scene + '“').catch(() => ''); return Promise.resolve(''); }
    async updateText(force) {
        const c = this.cfg();
        if (!this.ready || !c.text_source || (!force && Date.now() - this.textAt < c.text_every * 1000)) return;
        this.textAt = Date.now();
        if (this.app.nsfw && this.app.nsfw.private) return;   // Privat-Modus: nichts nach außen
        const text = cut(this.app.game.fill(c.text_tpl), 500);
        if (text === this.lastText && !force) return;
        this.lastText = text;
        await this.request('SetInputSettings', { inputName: c.text_source, inputSettings: { text } });
    }
    async action(act, input) {
        switch (act) {
            case 'obs_get': return this.status();
            case 'obs_cfg': this.saveCfg(input); return Object.assign(this.status(), { msg: 'Gespeichert.' });
            case 'obs_connect': this.disconnect(); return Object.assign(await this.connect(), {});
            case 'obs_scene': await this.scene(str(input.scene)); return Object.assign(this.status(), { msg: '🎬 ' + str(input.scene) });
            case 'obs_text': await this.updateText(true); return Object.assign(this.status(), { msg: 'Text aktualisiert.' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
    stop() { clearInterval(this.textTimer); this.disconnect(); }
}

module.exports = { Obs, DEF, sha };
