'use strict';
/*
 * 8.0.1: 💡 Smart-Home – Licht reagiert auf Welt, Puls, Panik und Schlafmodus.
 *   Ziele (höchstens 8): Home Assistant (REST, Zugangs-Token verschlüsselt gespeichert), WLED (JSON-API im Heimnetz),
 *   eigener Webhook (HTTP POST mit JSON). Nur http/https; keine Cloud-Konten, keine neuen Pakete.
 *   Regeln: 🌐 Welt → Farbe (eigene Zuordnung je Welt, sonst eine feste Farbe aus dem Weltnamen), ❤ Puls → Farbverlauf blau→rot
 *   (höchstens alle 10 s, nur bei Änderung), 🚨 Panik → Panik-Licht, 😴 Schlafmodus → gedimmt/aus.
 *   Im Privat-Modus wird kein Weltname verschickt (Webhook bekommt dann nur die Farbe).
 */
const crypto = require('crypto');
const { str, int, cut, UserError } = require('./util');

const KINDS = ['ha', 'wled', 'hook'];
const DEF = { on: false, world: true, heart: false, hr_low: 60, hr_high: 140, panic: true, panic_color: '#ffffff', panic_bri: 100, sleep: true, sleep_bri: 5, map: {} };
const hex = c => { const m = /^#?([0-9a-f]{6})$/i.exec(str(c)); return m ? '#' + m[1].toLowerCase() : null; };
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** feste, angenehme Farbe aus einem Namen (gleiche Welt = gleiche Farbe) */
function nameColor(name) {
    const hue = crypto.createHash('sha1').update(str(name).toLowerCase()).digest().readUInt16BE(0) % 360, S = 0.7, L = 0.55;
    const a = S * Math.min(L, 1 - L), f = n => { const k = (n + hue / 30) % 12; return Math.round(255 * (L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}
/** Puls → Farbe: unter low blau, über high rot, dazwischen über Grün/Gelb */
function heartColor(bpm, low, high) {
    const t = Math.max(0, Math.min(1, (bpm - low) / Math.max(1, high - low)));
    const stops = [[0, [56, 120, 255]], [0.4, [56, 213, 130]], [0.7, [243, 194, 98]], [1, [239, 68, 68]]];
    let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [a, ca] = stops[i], [b, cb] = stops[i + 1], k = (t - a) / (b - a || 1);
    return '#' + ca.map((v, j) => Math.round(v + (cb[j] - v) * k).toString(16).padStart(2, '0')).join('');
}

class SmartHome {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.lastHr = { at: 0, color: '' }; this.log = []; this.timer = null; this.state = null; }
    cfg() { let c = {}; try { c = JSON.parse(this.app.db.setting('smarthome_cfg', '{}')) || {}; } catch (e) { c = {}; } return Object.assign({}, DEF, c, { map: Object.assign({}, c.map || {}) }); }
    targets() { try { const raw = this.app.db.setting('smarthome_targets', ''); const l = raw ? JSON.parse(this.crypt.decrypt(raw)) : []; return Array.isArray(l) ? l : []; } catch (e) { return []; } }
    saveTargets(l) { this.app.db.setSetting('smarthome_targets', this.crypt.encrypt(JSON.stringify(l))); }
    pubTargets() { return this.targets().map(t => ({ id: t.id, kind: t.kind, name: t.name, url: t.url, entity: t.entity || '', has_token: !!t.token, on: t.on !== false })); }

    saveTarget(input) {
        const kind = KINDS.includes(str(input.kind)) ? str(input.kind) : null;
        if (!kind) throw new UserError('Art: Home Assistant, WLED oder Webhook.');
        let url = str(input.url).trim().replace(/\/+$/, '');
        if (kind === 'wled' && /^[\w.-]+(:\d+)?$/.test(url)) url = 'http://' + url;   // nur IP/Name eingegeben
        let u; try { u = new URL(url); } catch (e) { throw new UserError('Adresse ungültig (z. B. http://192.168.1.50).'); }
        if (!/^https?:$/.test(u.protocol)) throw new UserError('Nur http:// oder https://');
        const entity = str(input.entity).trim();
        if (kind === 'ha' && !/^light\.[a-z0-9_]{1,64}$/.test(entity)) throw new UserError('Home Assistant: Licht-Entität angeben, z. B. light.wohnzimmer.');
        const l = this.targets(), id = /^t[0-9a-f]{6}$/.test(str(input.id)) ? str(input.id) : 't' + crypto.randomBytes(3).toString('hex');
        const old = l.find(t => t.id === id);
        if (!old && l.length >= 8) throw new UserError('Höchstens 8 Ziele.');
        const token = str(input.token).trim() || (old && old.token) || '';
        if (kind === 'ha' && !token) throw new UserError('Home Assistant braucht ein Langzeit-Zugangs-Token (Profil → Sicherheit).');
        const t = { id, kind, name: cut(str(input.name).trim(), 40) || { ha: 'Home Assistant', wled: 'WLED', hook: 'Webhook' }[kind], url: u.toString().replace(/\/+$/, ''), entity, token: kind === 'ha' ? token : '', on: input.on !== '0' && input.on !== false };
        this.saveTargets(l.filter(x => x.id !== id).concat([t]));
        return this.pubTargets();
    }
    delTarget(id) { this.saveTargets(this.targets().filter(t => t.id !== str(id))); return this.pubTargets(); }
    saveCfg(input) {
        const c = this.cfg(), y = k => input[k] === true || ['1', 'true', 'on'].includes(str(input[k]));
        for (const k of ['on', 'world', 'heart', 'panic', 'sleep']) if (input[k] !== undefined) c[k] = y(k);
        if (input.hr_low !== undefined) c.hr_low = Math.max(30, Math.min(150, int(input.hr_low)));
        if (input.hr_high !== undefined) c.hr_high = Math.max(c.hr_low + 10, Math.min(220, int(input.hr_high)));
        if (input.panic_color !== undefined) c.panic_color = hex(input.panic_color) || DEF.panic_color;
        if (input.panic_bri !== undefined) c.panic_bri = Math.max(0, Math.min(100, int(input.panic_bri)));
        if (input.sleep_bri !== undefined) c.sleep_bri = Math.max(0, Math.min(100, int(input.sleep_bri)));
        this.app.db.setSetting('smarthome_cfg', JSON.stringify(c));
        return c;
    }
    mapWorld(name, color) {
        const c = this.cfg(), k = cut(str(name).trim().toLowerCase(), 80);
        if (!k) throw new UserError('Weltname fehlt.');
        const h = hex(color);
        if (h) c.map[k] = h; else delete c.map[k];
        if (Object.keys(c.map).length > 100) throw new UserError('Höchstens 100 Welt-Farben.');
        this.app.db.setSetting('smarthome_cfg', JSON.stringify(c));
        return c.map;
    }

    // ---------- Senden ----------
    async send(t, s) {
        const [r, g, b] = rgb(s.color || '#ffffff'), bri = Math.max(0, Math.min(100, s.bri === undefined ? 100 : s.bri));
        const ctl = { signal: AbortSignal.timeout(4000) };
        if (t.kind === 'wled') {
            const body = bri === 0 ? { on: false } : { on: true, bri: Math.round(bri * 2.55), seg: [{ col: [[r, g, b]] }] };
            return fetch(t.url + '/json/state', Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, ctl));
        }
        if (t.kind === 'ha') {
            const svc = bri === 0 ? 'turn_off' : 'turn_on', body = bri === 0 ? { entity_id: t.entity } : { entity_id: t.entity, rgb_color: [r, g, b], brightness_pct: bri, transition: 1 };
            return fetch(t.url + '/api/services/light/' + svc, Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t.token }, body: JSON.stringify(body) }, ctl));
        }
        return fetch(t.url, Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'vrc-nexus', event: s.event, color: s.color, rgb: [r, g, b], brightness: bri, world: s.world || undefined, bpm: s.bpm || undefined }) }, ctl));
    }
    async apply(s, only) {
        const list = this.targets().filter(t => t.on !== false && (!only || t.id === only));
        if (!list.length) return { sent: 0, failed: 0 };
        let sent = 0, failed = 0;
        await Promise.all(list.map(t => this.send(t, s).then(r => { if (r && r.ok === false) throw new Error('HTTP ' + r.status); sent++; }).catch(e => { failed++; this.note(t.name + ': ' + (e.message || e)); })));
        this.state = { event: s.event, color: s.color, bri: s.bri, at: Date.now() };
        return { sent, failed };
    }
    note(m) { this.log.unshift({ t: Date.now(), m: cut(str(m), 120) }); this.log = this.log.slice(0, 20); }

    // ---------- Auslöser ----------
    onWorld(name) {
        const c = this.cfg(); if (!c.on || !c.world) return null;
        const priv = !!(this.app.nsfw && this.app.nsfw.private);
        const color = c.map[str(name).trim().toLowerCase()] || nameColor(name);
        return this.apply({ event: 'world', color, bri: 80, world: priv ? '' : cut(str(name), 80) });
    }
    onPanic() { const c = this.cfg(); if (!c.on || !c.panic) return null; return this.apply({ event: 'panic', color: c.panic_color, bri: c.panic_bri }); }
    onSleep(on) { const c = this.cfg(); if (!c.on || !c.sleep) return null; return on ? this.apply({ event: 'sleep', color: '#ff9a3c', bri: c.sleep_bri }) : this.apply({ event: 'wake', color: '#ffffff', bri: 80 }); }
    tickHeart(now = Date.now()) {
        const c = this.cfg(), h = this.app.heart;
        if (!c.on || !c.heart || !h || !h.active || !(h.bpm > 20)) return null;
        if (now - this.lastHr.at < 10000) return null;
        const color = heartColor(h.bpm, c.hr_low, c.hr_high);
        if (color === this.lastHr.color) return null;
        this.lastHr = { at: now, color };
        return this.apply({ event: 'heart', color, bri: 70, bpm: Math.round(h.bpm) });
    }
    start() { if (this.timer) return; this.timer = setInterval(() => { if (this.app.energy && this.app.energy.skip('smarthome', 5000)) return; this.tickHeart(); }, 5000); if (this.timer.unref) this.timer.unref(); }
    stop() { clearInterval(this.timer); this.timer = null; }

    status() { return { cfg: this.cfg(), targets: this.pubTargets(), state: this.state, log: this.log, kinds: KINDS }; }
    async action(act, input) {
        switch (act) {
            case 'shome_status': return this.status();
            case 'shome_cfg': this.saveCfg(input); return Object.assign(this.status(), { msg: 'Gespeichert.' });
            case 'shome_target_save': this.saveTarget(input); return Object.assign(this.status(), { msg: '💡 Ziel gespeichert.' });
            case 'shome_target_del': this.delTarget(input.id); return this.status();
            case 'shome_map': this.mapWorld(input.world, input.color); return Object.assign(this.status(), { msg: 'Welt-Farbe gespeichert.' });
            case 'shome_test': {
                const color = hex(input.color) || '#38d5e6';
                const r = await this.apply({ event: 'test', color, bri: 80 }, str(input.id) || null);
                return Object.assign(this.status(), { msg: r.sent ? '💡 Test gesendet (' + r.sent + ')' + (r.failed ? ' – ' + r.failed + ' Fehler' : '') : (r.failed ? '⚠ Nicht erreichbar – siehe Protokoll.' : 'Kein aktives Ziel.') });
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { SmartHome, nameColor, heartColor };
