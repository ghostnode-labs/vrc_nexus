'use strict';
/*
 * 8.2 (🔞, nur mit Spielzeug-Freigabe): Wearables – bHaptics-Westen, -Armbänder, -Maske, -Handschuhe, -Füße (experimentell).
 * Verbindung zur bHaptics-Player-App auf diesem PC (lokaler WebSocket, Standard ws://127.0.0.1:15881/v2/feedbacks), eigene Umsetzung ohne SDK.
 * Die Wearables folgen der aktuellen Spielzeug-Stärke (alle Geräte oder ein bestimmtes) – als Fläche oder als Welle.
 * Alles, was Spielzeug stoppt (Panik, Safeword, Ampel Rot, Pause), stoppt damit auch die Wearables, weil sie nur die Ausgabe spiegeln.
 */
const { str, int, cut, UserError } = require('./util');

const PARTS = {
    vest: { name: 'Weste', pos: [['VestFront', 20], ['VestBack', 20]], rows: 5, cols: 4 },
    arms: { name: 'Armbänder', pos: [['ForearmL', 3], ['ForearmR', 3]], rows: 1, cols: 3 },
    head: { name: 'Maske', pos: [['Head', 6]], rows: 1, cols: 6 },
    hands: { name: 'Handschuhe', pos: [['HandL', 3], ['HandR', 3]], rows: 1, cols: 3 },
    feet: { name: 'Füße', pos: [['FootL', 3], ['FootR', 3]], rows: 1, cols: 3 },
};
const DEF = { on: false, url: 'ws://127.0.0.1:15881/v2/feedbacks', parts: ['vest'], device: 'all', gain: 70, style: 'flat' };
const TICK = 100, DUR = 160;

class Wearables {
    constructor(app) { this.app = app; this.ws = null; this.state = 'aus'; this.error = ''; this.last = -1; this.lastAt = 0; this.phase = 0; this.timer = null; this.sent = 0; }
    allowed() { try { const a = this.app.nsfw && this.app.nsfw.access(); return !!(a && a.unlocked && a.features && a.features.includes('toys')); } catch (e) { return false; } }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('wear_cfg', '{}')) || {}); } catch (e) { return Object.assign({}, DEF); } }
    saveCfg(c) {
        const n = this.cfg();
        if (c.on !== undefined) n.on = c.on === true || c.on === '1';
        if (c.url !== undefined) { const u = str(c.url).trim(); if (!/^ws:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[\w/.-]*$/.test(u)) throw new UserError('Nur die bHaptics-App auf diesem PC (ws://127.0.0.1:15881/…).'); n.url = u; }
        if (c.parts !== undefined) { let p = c.parts; if (typeof p === 'string') p = p.split(','); n.parts = [...new Set((Array.isArray(p) ? p : []).map(str).filter(k => PARTS[k]))]; }
        if (c.device !== undefined) n.device = str(c.device) === 'all' ? 'all' : String(int(c.device));
        if (c.gain !== undefined) n.gain = Math.max(5, Math.min(100, int(c.gain)));
        if (c.style !== undefined) n.style = str(c.style) === 'wave' ? 'wave' : 'flat';
        this.app.db.setSetting('wear_cfg', JSON.stringify(n));
        if (n.on) this.start(); else this.stop();
        return n;
    }
    status() { const c = this.cfg(); return { cfg: c, state: this.state, error: this.error, parts: Object.fromEntries(Object.entries(PARTS).map(([k, v]) => [k, v.name])), level: Math.max(0, this.last) }; }

    start() {
        if (!this.timer) { this.timer = setInterval(() => this.tick(), TICK); if (this.timer.unref) this.timer.unref(); }
        this.connect();
    }
    stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.close(); this.state = 'aus'; this.last = -1; }
    close() { try { if (this.ws) this.ws.close(); } catch (e) { /* egal */ } this.ws = null; }
    connect() {
        if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
        const WS = this.WebSocket || globalThis.WebSocket;
        if (!WS) { this.error = 'WebSocket fehlt in dieser App-Version.'; return; }
        this.state = 'verbindet'; this.error = '';
        let ws;
        try { ws = new WS(this.cfg().url + (this.cfg().url.includes('?') ? '&' : '?') + 'app_id=vrc-nexus&app_name=VRC%20Nexus'); } catch (e) { this.state = 'fehler'; this.error = 'bHaptics Player nicht erreichbar.'; return; }
        this.ws = ws;
        ws.onopen = () => { this.state = 'verbunden'; this.error = ''; };
        ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.state = this.cfg().on ? 'getrennt' : 'aus'; } };
        ws.onerror = () => { this.error = 'bHaptics Player nicht erreichbar – läuft die App?'; };
    }
    /** Ziel-Stärke 0–1 aus der Spielzeug-Ausgabe */
    level() {
        const t = this.app.toys; if (!t || !t.cur) return 0;
        const c = this.cfg();
        const v = c.device === 'all' ? Math.max(0, ...[...t.cur.values()]) : (t.cur.get(int(c.device)) || 0);
        return Math.max(0, Math.min(1, v)) * c.gain / 100;
    }
    /** Nachrichten für einen Rahmen (bHaptics-Player-Format: Submit/frame mit DotPoints) */
    frames(lv) {
        const c = this.cfg(), out = [];
        for (const k of c.parts) {
            const p = PARTS[k];
            for (const [pos, n] of p.pos) {
                const dots = [];
                for (let i = 0; i < n; i++) {
                    let f = 1;
                    if (c.style === 'wave') { const row = Math.floor(i / p.cols) % p.rows, step = p.rows > 1 ? row : i % p.cols, len = p.rows > 1 ? p.rows : p.cols; f = Math.max(0.15, 1 - Math.abs(((this.phase % len) - step)) / 1.5); }
                    const v = Math.round(lv * f * 100);
                    if (v > 0) dots.push({ Index: i, Intensity: v });
                }
                if (dots.length) out.push({ Type: 'frame', Key: 'nexus-' + pos, Frame: { Position: pos, PathPoints: [], DotPoints: dots, DurationMillis: DUR } });
            }
        }
        return out;
    }
    tick() {
        if (!this.cfg().on) return;
        if (!this.ws || this.ws.readyState !== 1) { if (!this.ws) this.connect(); return; }
        const lv = this.allowed() ? this.level() : 0;
        this.phase++;
        if (lv <= 0.01) { this.last = 0; return; }   // Rahmen laufen nach 160 ms von selbst aus → Stopp ohne eigene Nachricht
        const sub = this.frames(lv);
        if (!sub.length) return;
        try { this.ws.send(JSON.stringify({ Register: [], Submit: sub })); this.sent++; this.last = lv; this.lastAt = Date.now(); } catch (e) { /* nächster Takt */ }
    }
    async test() {
        if (!this.ws || this.ws.readyState !== 1) throw new UserError('Erst mit dem bHaptics Player verbinden.');
        this.ws.send(JSON.stringify({ Register: [], Submit: this.frames(0.6).map(f => Object.assign({}, f, { Frame: Object.assign({}, f.Frame, { DurationMillis: 600 }) })) }));
    }
    async action(act, input) {
        if (!this.allowed()) throw new UserError('Wearables gibt es mit Spielzeug-Freigabe.');
        const toys = () => (this.app.toys ? this.app.toys.status() : {});
        switch (act) {
            case 'wear_cfg': this.saveCfg(input); return Object.assign(toys(), { msg: this.cfg().on ? '🦺 Wearables an.' : 'Wearables aus.' });
            case 'wear_connect': this.close(); this.connect(); return Object.assign(toys(), { msg: 'Verbinde mit dem bHaptics Player …' });
            case 'wear_test': await this.test(); return Object.assign(toys(), { msg: '🦺 Test gesendet.' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { Wearables, PARTS };
