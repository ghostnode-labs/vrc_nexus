'use strict';
/*
 * 5.2: VRC Nexus Watch – Gegenstelle für die Wear-OS-App (apps/vrc-nexus-watch).
 *  - eigener kleiner HTTP-Server im Heimnetz (Standard-Port 17874), nur wenn eingeschaltet
 *  - Suche per UDP (Port 17873): Uhr fragt „NXW?1“, die App antwortet mit Name + Port
 *  - Kopplung mit 6-stelligem Code (wechselt nach jeder Kopplung, höchstens 5 Fehlversuche je 10 min),
 *    danach eigener Schlüssel je Uhr (nur als SHA-256 gespeichert, einzeln entfernbar)
 *  - Puls vom Uhr-Sensor (Quelle „watch“), Status für die Uhr, Aktionen: Panik/Entwarnung, Consent-Ampel,
 *    Spielzeug stoppen, Schlafmodus, Privat-Modus – 18+-Aktionen nur mit NSFW-Freigabe (prüft das jeweilige Modul)
 */
const http = require('http');
const dgram = require('dgram');
const crypto = require('crypto');
const os = require('os');
const { str, int, cut, UserError } = require('./util');

const DEF = { on: false, port: 17874, devices: [] };
const DISC_PORT = 17873, MAX_DEV = 5, MAX_BODY = 4096;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const newPin = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

class Watch {
    constructor(app) {
        this.app = app;
        this.server = null; this.udp = null; this.port = 0; this.error = '';
        this.pin = newPin(); this.fails = []; this.seen = {};
        setTimeout(() => this.apply(), 0);
    }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('watch_cfg', '{}')) || {}); } catch (e) { return Object.assign({}, DEF); } }
    saveCfg(c) {
        const n = this.cfg();
        if (c.on !== undefined) n.on = c.on === true || c.on === '1';
        if (c.port !== undefined) n.port = Math.max(1024, Math.min(65535, int(c.port) || DEF.port));
        if (c.devices !== undefined) n.devices = c.devices;
        this.app.db.setSetting('watch_cfg', JSON.stringify(n));
        this.apply();
        return n;
    }
    addresses() {
        const out = [];
        for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
        return out;
    }
    status() {
        const c = this.cfg();
        return { cfg: { on: c.on, port: c.port }, running: !!this.server, error: this.error, pin: c.on ? this.pin : '', addresses: this.addresses(),
            devices: c.devices.map(d => ({ id: d.id, name: d.name, added: d.added, last: this.seen[d.id] || d.last || 0 })) };
    }

    // ---------- Server ----------
    apply() {
        const c = this.cfg();
        if (!c.on) return this.stop();
        if (this.server && this.port === c.port) return;
        this.stop();
        const srv = http.createServer((req, res) => this.handle(req, res).catch(e => this.send(res, e instanceof UserError ? 400 : 500, { error: e.message || 'Fehler' })));
        srv.on('error', e => { this.error = e.code === 'EADDRINUSE' ? 'Port ' + c.port + ' ist schon belegt.' : e.message; this.server = null; this.port = 0; });
        srv.listen(c.port, '0.0.0.0', () => { this.error = ''; });
        this.server = srv; this.port = c.port;
        try {
            const u = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            u.on('message', (m, r) => {
                if (String(m).trim() !== 'NXW?1' || !this.server) return;
                const name = cut(str((this.app.vrc.account() || {}).display_name) || os.hostname(), 40);
                u.send(JSON.stringify({ nexus: 'watch', v: 1, port: this.port, name }), r.port, r.address);
            });
            u.on('error', () => { try { u.close(); } catch (e) { /* egal */ } if (this.udp === u) this.udp = null; });
            u.bind(DISC_PORT);
            this.udp = u;
        } catch (e) { this.udp = null; }
    }
    stop() {
        if (this.server) { try { this.server.close(); } catch (e) { /* egal */ } }
        if (this.udp) { try { this.udp.close(); } catch (e) { /* egal */ } }
        this.server = null; this.udp = null; this.port = 0;
    }
    send(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
    body(req) {
        return new Promise((ok, bad) => {
            let n = 0; const chunks = [];
            req.on('data', c => { n += c.length; if (n > MAX_BODY) { bad(new UserError('Anfrage zu groß.')); req.destroy(); } else chunks.push(c); });
            req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString() || '{}') || {}); } catch (e) { bad(new UserError('Ungültige Anfrage.')); } });
            req.on('error', bad);
        });
    }
    device(req) {
        const tok = str(req.headers['x-nexus-watch']);
        if (!/^[a-f0-9]{64}$/.test(tok)) return null;
        const h = sha(tok);
        const d = this.cfg().devices.find(x => x.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(x.hash), Buffer.from(h)));
        if (d) this.seen[d.id] = Date.now();
        return d || null;
    }
    async handle(req, res) {
        const url = new URL(req.url, 'http://localhost');
        if (req.method !== 'POST' && !(req.method === 'GET' && url.pathname === '/watch/state')) return this.send(res, 405, { error: 'Nur POST.' });
        if (url.pathname === '/watch/pair') return this.send(res, 200, this.pair(await this.body(req), req.socket.remoteAddress));
        const dev = this.device(req);
        if (!dev) return this.send(res, 401, { error: 'Nicht gekoppelt.' });
        if (url.pathname === '/watch/state') return this.send(res, 200, this.state());
        const b = await this.body(req);
        if (url.pathname === '/watch/heart') return this.send(res, 200, this.heart(b));
        if (url.pathname === '/watch/action') return this.send(res, 200, await this.action(str(b.a), b, dev));
        return this.send(res, 404, { error: 'Unbekannt.' });
    }

    // ---------- Kopplung ----------
    pair(b, ip) {
        const t = Date.now();
        this.fails = this.fails.filter(x => t - x < 600000);
        if (this.fails.length >= 5) throw new UserError('Zu viele falsche Codes – in 10 Minuten wieder versuchen.');
        if (!/^\d{6}$/.test(str(b.pin)) || !crypto.timingSafeEqual(Buffer.from(str(b.pin)), Buffer.from(this.pin))) { this.fails.push(t); throw new UserError('Falscher Code.'); }
        const c = this.cfg();
        if (c.devices.length >= MAX_DEV) throw new UserError('Schon ' + MAX_DEV + ' Uhren gekoppelt – erst eine in VRC Nexus entfernen.');
        const token = crypto.randomBytes(32).toString('hex'), id = 'w' + crypto.randomBytes(4).toString('hex');
        const name = cut(str(b.name).replace(/[\r\n]/g, ' ').trim(), 40) || 'Uhr';
        c.devices.push({ id, name, hash: sha(token), added: t, ip: cut(str(ip), 60) });
        this.pin = newPin();
        this.saveCfg({ devices: c.devices });
        const h = this.app.heart;
        if (h && h.cfg().source !== 'watch' && !h.active) h.save({ source: 'watch' });   // Uhr übernimmt, wenn die bisherige Quelle gerade nichts liefert
        if (this.app.tools && this.app.tools.alert) this.app.tools.alert('⌚ Uhr gekoppelt', name);
        return { ok: true, token, id, name: cut(str((this.app.vrc.account() || {}).display_name) || os.hostname(), 40) };
    }
    remove(id) { const c = this.cfg(); this.saveCfg({ devices: c.devices.filter(d => d.id !== str(id)) }); return this.status(); }

    // ---------- Daten ----------
    state() {
        const a = this.app, g = a.game, st = g.state || {}, h = a.heart, n = a.nsfw, acc = n ? n.access() : { unlocked: false };
        const nsfw = !!(acc.unlocked && !(n && n.private)), t = a.toys;
        const ts = nsfw && t ? { connected: t.state === 'verbunden' || !!t.ws, devices: t.devices ? t.devices.size : 0, consent: t.consent || 'green' } : null;
        return { ok: true, t: Date.now(), world: n && n.private ? '' : cut(str(st.worldName), 60), players: st.players ? st.players.size : 0, running: !!st.running,
            bpm: h && h.active ? h.bpm : 0, hr_src: h ? h.cfg().source : 'off', private: !!(n && n.private), nsfw, toys: ts,
            sleeping: !!(a.comfort && a.comfort.sleep) };
    }
    heart(b) {
        const h = this.app.heart;
        if (!h) throw new UserError('Puls gibt es nur in der Windows-App.');
        const src = h.cfg().source;
        if (src !== 'watch') {
            // 5.2.1: liefert die eingestellte Quelle gerade nichts (z. B. HypeRate nicht erreichbar), übernimmt die Uhr automatisch
            if (h.active && h.from !== 'watch') return { ok: false, ignored: true, msg: 'In VRC Nexus liefert gerade eine andere Puls-Quelle (' + src + ').' };
            h.save({ source: 'watch' });
            h.switchedFrom = src;
        }
        return { ok: h.push(int(b.bpm), 'watch'), switched: src !== 'watch' ? src : undefined };
    }
    async action(a, b, dev) {
        const post = (act, x) => this.app.post(Object.assign({ act }, x || {}), {});
        let r;
        switch (a) {
            case 'panic': r = await post('nsfw_panic'); break;
            case 'allclear': r = await post('nsfw_allclear'); break;
            case 'private': r = await post('nsfw_private', { on: b.on === false || b.on === '0' ? '0' : '1' }); break;
            case 'consent': if (!['green', 'yellow', 'red'].includes(str(b.light))) throw new UserError('Ampel: green, yellow oder red.'); r = await post('toys_consent', { light: str(b.light) }); break;
            case 'toys_stop': r = await post('toys_stop', { device: 'all' }); break;
            case 'sleep': r = await post('comfort_sleep', { on: b.on === false || b.on === '0' ? '0' : '1', wake: int(b.wake) || 0 }); break;
            default: throw new UserError('Unbekannte Aktion.');
        }
        return Object.assign({ ok: true, msg: str(r && r.msg) || 'Erledigt.' }, { state: this.state(), by: dev.name });
    }

    async actionUi(act, input) {
        switch (act) {
            case 'watch_get': return this.status();
            case 'watch_cfg': this.saveCfg(input); return Object.assign(this.status(), { msg: 'Gespeichert.' });
            case 'watch_newpin': this.pin = newPin(); return this.status();
            case 'watch_remove': return Object.assign(this.remove(input.id), { msg: 'Uhr entfernt.' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Watch, DISC_PORT };
