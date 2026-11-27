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

const DEF = { on: false, port: 17874, devices: [], theme: 'cyber', theme_at: 0, bg: 'none', bg_dim: 55, bg_rev: '' };
/** 5.2.3: Themen der Uhr (Farben als #RRGGBB: Hintergrund, Akzent, Highlight, Gefahr, Text gedämpft) */
const THEMES = {
    cyber:  { name: 'Cyber',            bg: '#0B1016', accent: '#38D5E6', hi: '#F3C262', danger: '#FF5555', muted: '#8A93A6', grad: ['#0B1016', '#0E2A33'] },
    neon:   { name: 'Neon',             bg: '#16061F', accent: '#FF3DCB', hi: '#B57BFF', danger: '#FF4D6D', muted: '#A08AB0', grad: ['#16061F', '#3A0B4A'] },
    ocean:  { name: 'Ozean',            bg: '#061320', accent: '#3AA0FF', hi: '#5FF2E0', danger: '#FF6B6B', muted: '#86A0B8', grad: ['#061320', '#0B3B5C'] },
    forest: { name: 'Wald',             bg: '#08140C', accent: '#4ADE80', hi: '#E9D57A', danger: '#F87171', muted: '#8FA597', grad: ['#08140C', '#173A22'] },
    sunset: { name: 'Sonnenuntergang',  bg: '#1A0B0B', accent: '#FF8A4C', hi: '#FFD166', danger: '#FF4D4D', muted: '#B89A8F', grad: ['#1A0B0B', '#4A1A2C'] },
    amoled: { name: 'AMOLED',           bg: '#000000', accent: '#FFFFFF', hi: '#D0D0D0', danger: '#FF5555', muted: '#808080', grad: ['#000000', '#111111'] },
};
/** 8.0.8: harmlose VRChat-Eingaben fürs Handy (Taste kurz drücken) */
const PHONE_INPUTS = ['Jump', 'Voice', 'QuickMenuToggleLeft', 'Run'];
const BG_KINDS = ['none', 'gradient', 'image'], BG_MAX = 3 * 1024 * 1024;
/** 8.0.5: Uhr-App 2.0 – Zifferblätter für den Startbildschirm der Uhr */
const FACES = { classic: 'Klassisch (Puls + Kacheln)', big: 'Große Uhrzeit', analog: 'Analog mit Puls-Ring', minimal: 'Minimal (nur Zeit & Puls)', stats: 'Gesundheit (VR-Zeit, Pausen, Schritte)', friends: 'Freunde & Welt' };
/** 5.2.3: was ein gekoppeltes Handy am PC auslösen darf (feste Liste, 🔞-Aktionen prüfen ihre Freigabe selbst) */
const PHONE_ACTS = new Set(['nsfw_panic', 'nsfw_panic_full', 'nsfwx_safeword', 'nsfw_allclear', 'nsfw_private', 'nsfw_avatar', 'nsfw_boundaries', 'nsfw_consent', 'toys_set', 'toys_stop', 'toys_status', 'toys_surprise',
    'toys_pattern', 'toys_pattern_stop', 'toys_consent', 'toys_edge_release', 'toys_climax', 'toys_scene_stop', 'toys3_get', 'toys3_game', 'toys3_hold', 'toys3_game_stop',
    'comfort_get', 'comfort_sleep', 'preset_list', 'preset_apply', 'client_macros', 'client_macro_run', 'client_osc', 'hr_get']);
/** 8.2: Sicherheits-Aktionen gehen immer – auch wenn 18+ auf dem Gerät ausgeblendet ist */
const SAFETY_ACTS = new Set(['nsfw_panic', 'nsfw_panic_full', 'nsfwx_safeword', 'toys_stop']);
const NSFW_WATCH = new Set(['allclear', 'private', 'consent']);   // Uhr-Aktionen, die 🔞 sind (Panik, Safeword, Stopp gehören nicht dazu)
const DISC_PORT = 17873, MAX_DEV = 5, MAX_BODY = 4096;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const newPin = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

class Watch {
    constructor(app) {
        this.app = app;
        this.server = null; this.udp = null; this.port = 0; this.error = '';
        this.pin = newPin(); this.fails = []; this.seen = {}; this.ver = {}; this.buzz = {}; this.batt = {};
        setTimeout(() => this.apply(), 0);
    }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('watch_cfg', '{}')) || {}); } catch (e) { return Object.assign({}, DEF); } }
    saveCfg(c) {
        const n = this.cfg();
        if (c.on !== undefined) n.on = c.on === true || c.on === '1';
        if (c.port !== undefined) n.port = Math.max(1024, Math.min(65535, int(c.port) || DEF.port));
        if (c.devices !== undefined) n.devices = c.devices;
        if (c.theme !== undefined) { if (!THEMES[str(c.theme)]) throw new UserError('Unbekanntes Thema.'); n.theme = str(c.theme); n.theme_at = Date.now(); }
        if (c.bg !== undefined) { if (!BG_KINDS.includes(str(c.bg))) throw new UserError('Unbekannter Hintergrund.'); if (c.bg === 'image' && !this.bgFile()) throw new UserError('Erst ein Bild hochladen.'); n.bg = str(c.bg); n.theme_at = Date.now(); }
        if (c.bg_dim !== undefined) { n.bg_dim = Math.max(0, Math.min(85, int(c.bg_dim))); n.theme_at = Date.now(); }
        if (c.bg_rev !== undefined) n.bg_rev = str(c.bg_rev);
        if (c.face !== undefined) { if (!FACES[str(c.face)]) throw new UserError('Unbekanntes Zifferblatt.'); n.face = str(c.face); n.theme_at = Date.now(); }
        this.app.db.setSetting('watch_cfg', JSON.stringify(n));
        this.apply();
        return n;
    }
    addresses() {
        const out = [];
        for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
        return out;
    }
    // ---------- 5.2.3: Design (Thema & Hintergrund) ----------
    bgPath() { return require('path').join((this.app.tools && this.app.tools.userData) || os.tmpdir(), 'watch-bg.bin'); }
    bgFile() { try { const b = require('fs').readFileSync(this.bgPath()); return b.length ? b : null; } catch (e) { return null; } }
    setBg(dataUrl) {
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(str(dataUrl));
        if (!m) throw new UserError('Bitte ein JPG-, PNG- oder WebP-Bild wählen.');
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > BG_MAX) throw new UserError('Bild zu groß (max. 3 MB).');
        const sig = buf.subarray(0, 12).toString('hex');
        if (!/^ffd8ff|^89504e47|^52494646.{8}57454250/.test(sig)) throw new UserError('Keine gültige Bilddatei.');
        require('fs').writeFileSync(this.bgPath(), buf);
        return this.saveCfg({ bg: 'image', bg_rev: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16) });
    }
    clearBg() { try { require('fs').unlinkSync(this.bgPath()); } catch (e) { /* schon weg */ } return this.saveCfg({ bg: 'none', bg_rev: '' }); }
    look() { const c = this.cfg(); return { theme: c.theme, face: FACES[c.face] ? c.face : 'classic', colors: THEMES[c.theme] || THEMES.cyber, at: c.theme_at, bg: c.bg === 'image' && !c.bg_rev ? 'none' : c.bg, bg_dim: c.bg_dim, bg_rev: c.bg_rev }; }
    online(id) { return Date.now() - (this.seen[id] || 0) < 20000; }

    status() {
        const c = this.cfg();
        return { cfg: { on: c.on, port: c.port }, look: this.look(), faces: FACES, themes: Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v])), has_bg: !!this.bgFile(),
            heart: this.app.heart ? { bpm: this.app.heart.active ? this.app.heart.bpm : 0, from: this.app.heart.from || '', source: this.app.heart.cfg().source } : null, running: !!this.server, error: this.error, pin: c.on ? this.pin : '', addresses: this.addresses(),
            devices: c.devices.map(d => ({ id: d.id, name: d.name, kind: d.kind || 'watch', added: d.added, last: this.seen[d.id] || d.last || 0, online: this.online(d.id), ver: this.ver[d.id] || '', battery: this.batt[d.id] === undefined ? null : this.batt[d.id], nsfw: d.nsfw !== false })) };
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
    body(req, max = MAX_BODY) {
        return new Promise((ok, bad) => {
            let n = 0; const chunks = [];
            req.on('data', c => { n += c.length; if (n > max) { bad(new UserError('Anfrage zu groß.')); req.destroy(); } else chunks.push(c); });
            req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString() || '{}') || {}); } catch (e) { bad(new UserError('Ungültige Anfrage.')); } });
            req.on('error', bad);
        });
    }
    device(req) {
        const tok = str(req.headers['x-nexus-watch']);
        if (!/^[a-f0-9]{64}$/.test(tok)) return null;
        const h = sha(tok);
        const d = this.cfg().devices.find(x => x.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(x.hash), Buffer.from(h)));
        if (d) { this.seen[d.id] = Date.now(); const v = str(req.headers['x-nexus-watch-version']); if (/^\d+\.\d+\.\d+$/.test(v)) this.ver[d.id] = v; const b = str(req.headers['x-nexus-battery']); if (/^\d{1,3}$/.test(b) && +b <= 100) this.batt[d.id] = +b; }   // 8.2: Akkustand für den Geräte-Hub
        return d || null;
    }
    async handle(req, res) {
        const url = new URL(req.url, 'http://localhost');
        if (req.method !== 'POST' && !(req.method === 'GET' && ['/watch/state', '/watch/bg', '/watch/hello'].includes(url.pathname))) return this.send(res, 405, { error: 'Nur POST.' });
        if (url.pathname === '/watch/hello') return this.send(res, 200, { nexus: 'watch', v: 1, port: this.port, name: cut(str((this.app.vrc.account() || {}).display_name) || os.hostname(), 40) });
        if (url.pathname === '/watch/pair') return this.send(res, 200, this.pair(await this.body(req), req.socket.remoteAddress));
        const dev = this.device(req);
        if (!dev) return this.send(res, 401, { error: 'Nicht gekoppelt.' });
        if (url.pathname === '/watch/sync') {   // 8.0.4: Heimnetz-Abgleich – nur gekoppelte PCs
            if (dev.kind !== 'pc' || !this.app.lansync) return this.send(res, 403, { error: 'Nur für gekoppelte PCs.' });
            try { return this.send(res, 200, this.app.lansync.serve(await this.body(req, 800000))); } catch (e) { if (e.status === 409) return this.send(res, 409, { ok: false, conflict: true, rev: e.rev }); throw e; }
        }
        if (url.pathname === '/watch/panic' && req.method === 'POST') {   // 8.2: Notfall-Stopp über alle gekoppelten PCs (nur abschalten, nie einschalten)
            if (dev.kind !== 'pc' || !this.app.lansync) return this.send(res, 403, { error: 'Nur für gekoppelte PCs.' });
            return this.send(res, 200, this.app.lansync.panicServe(await this.body(req, 2000)));
        }
        if (dev.kind === 'pc') return this.send(res, 403, { error: 'Ein gekoppelter PC darf nur abgleichen.' });
        if (url.pathname === '/watch/state') { const st = this.state(dev); const bz = this.buzz[dev.id]; if (bz && Date.now() < bz) { st.buzz = bz; delete this.buzz[dev.id]; } return this.send(res, 200, st); }
        if (url.pathname === '/watch/bg' && req.method === 'POST') {   // 5.2.4: Bild aus der Galerie der Uhr
            const b = await this.body(req, Math.ceil(BG_MAX * 1.4) + 200);
            this.setBg(b.data);
            return this.send(res, 200, { ok: true, msg: '🖼 Hintergrund gespeichert.', state: this.state() });
        }
        if (url.pathname === '/watch/bg') {
            const b = this.bgFile();
            if (!b) return this.send(res, 404, { error: 'Kein Bild.' });
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': b.length, 'Cache-Control': 'no-store' });
            return res.end(b);
        }
        const b = await this.body(req);
        if (url.pathname === '/watch/heart') return this.send(res, 200, this.heart(b));
        if (url.pathname === '/watch/action') return this.send(res, 200, await this.action(str(b.a), b, dev));
        if (url.pathname === '/watch/act') return this.send(res, 200, await this.phoneAct(b, dev));
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
        const kind = b.kind === 'phone' ? 'phone' : b.kind === 'pc' ? 'pc' : 'watch';   // 8.0.4: „pc“ = anderer PC/Laptop, darf nur den Heimnetz-Abgleich
        const name = cut(str(b.name).replace(/[\r\n]/g, ' ').trim(), 40) || (kind === 'phone' ? 'Handy' : kind === 'pc' ? 'Laptop' : 'Uhr');
        c.devices.push({ id, name, kind, hash: sha(token), added: t, ip: cut(str(ip), 60) });
        this.pin = newPin();
        this.saveCfg({ devices: c.devices });
        const h = this.app.heart;
        if (kind === 'watch' && h && h.cfg().source !== 'watch' && !h.active) h.save({ source: 'watch' });   // Uhr übernimmt, wenn die bisherige Quelle gerade nichts liefert
        if (this.app.tools && this.app.tools.alert) this.app.tools.alert(kind === 'phone' ? '📱 Handy gekoppelt' : kind === 'pc' ? '🏠 PC gekoppelt (Abgleich)' : '⌚ Uhr gekoppelt', name);
        return { ok: true, token, id, name: cut(str((this.app.vrc.account() || {}).display_name) || os.hostname(), 40) };
    }
    remove(id) { const c = this.cfg(); this.saveCfg({ devices: c.devices.filter(d => d.id !== str(id)) }); return this.status(); }

    // ---------- Daten ----------
    state(dev) {
        const a = this.app, g = a.game, st = g.state || {}, h = a.heart, n = a.nsfw;
        const acc = dev && dev.nsfw === false ? { unlocked: false, reason: '🔞 ist auf diesem Gerät ausgeblendet (PC: Werkzeuge → Geräte).' } : n ? n.access() : { unlocked: false, reason: '' };   // 8.2
        // 5.2.2: 🔞-Knöpfe auch im Privat-Modus (Panik muss immer erreichbar sein) – nur Inhalte (Welt) werden im Privat-Modus ausgeblendet
        const nsfw = !!acc.unlocked, t = a.toys;
        const ts = nsfw && t ? { connected: t.state === 'verbunden' || !!t.ws, devices: t.devices ? t.devices.size : 0, consent: t.consent || 'green' } : null;
        return { ok: true, t: Date.now(), world: n && n.private ? '' : cut(str(st.worldName), 60), players: st.players ? st.players.size : 0, running: !!st.running,
            bpm: h && h.active ? h.bpm : 0, hr_src: h ? h.cfg().source : 'off', private: !!(n && n.private), nsfw, nsfw_reason: nsfw ? '' : cut(str(acc.reason), 160), toys: ts,
            sleeping: !!(a.comfort && a.comfort.sleep), look: this.look(),
            health: a.health ? (() => { try { return a.health.today(); } catch (e) { return null; } })() : null,   // 8.0.5: für das Zifferblatt „Gesundheit“
            coach_next: a.coach && a.coach.next ? Math.max(0, Math.round((a.coach.next.brk - Date.now()) / 60000)) : null,
            // 6.5: Zifferblatt-Daten und Benachrichtigungen (im Privat-Modus keine)
            friends: (() => { try { return a.vrc.friendList().filter(f => f.state === 'online').length; } catch (e) { return 0; } })(),
            notes: this.notesSafe() };
    }
    /** 6.5: Benachrichtigung für die Uhr merken (höchstens 8, 10 Minuten lang abrufbar) */
    note(title, body, meta) {
        const c = this.cfg(); if (!c.on || !(c.devices || []).length) return;   // nur mit gekoppelter Uhr
        this.notes = (this.notes || []).filter(x => Date.now() - x.t < 600000).slice(-7);
        const m = meta || {}, uid = /^usr_[\w-]+$/.test(str(m.uid)) ? str(m.uid) : '', loc = str(m.loc);
        const joinable = /^wrld_[^:]+:[^~]+(~region\([a-z]+\))?$/.test(loc) || /~(friends|hidden)\(/.test(loc) && loc.startsWith('wrld_');
        const custom = Array.isArray(m.replies) && m.replies.length ? m.replies.slice(0, 3).map(r => [cut(str(r[0]), 12), cut(str(r[1]), 24)]) : null;
        const replies = custom || (uid ? [...(joinable ? [['join', '🚪 Hin']] : []), ['request', '🙋 Einladen lassen'], ['ok', '👍']] : [['ok', '👍']]);
        this.noteSeq = (this.noteSeq || 0) + 1;
        this.notes.push({ id: this.noteSeq, t: Date.now(), title: cut(str(title), 80), body: cut(str(body), 120), replies, uid, loc, done: '', cb: typeof m.onReply === 'function' ? m.onReply : null });
    }
    notesSafe() { return this.app.nsfw && this.app.nsfw.private ? [] : this.notesFor(); }
    notesFor() { return (this.notes || []).filter(x => Date.now() - x.t < 600000 && !x.done).map(x => ({ id: x.id, t: x.t, title: x.title, body: x.body, replies: x.replies })); }
    async noteReply(id, reply) {
        const x = (this.notes || []).find(n => n.id === int(id));
        if (!x) throw new UserError('Benachrichtigung nicht mehr da.');
        if (!x.replies.some(r => r[0] === reply)) throw new UserError('Unbekannte Antwort.');
        x.done = reply;
        if (x.cb) { const r = await x.cb(reply); return { msg: (r && r.tip) || '👍' }; }   // 7.3: eigene Antworten (Check-in, Aftercare)
        if (reply === 'join') return Object.assign({ msg: '🚪 Einladung an dich – im Spiel annehmen' }, await this.app.post({ act: 'invite_self', location: x.loc }, {}));
        if (reply === 'request') return Object.assign({ msg: '🙋 Anfrage gesendet' }, await this.app.post({ act: 'request_invite', id: x.uid }, {}));
        return { msg: '👍' };
    }
    heart(b) {
        const h = this.app.heart;
        if (!h) throw new UserError('Puls gibt es nur in der Windows-App.');
        const src = h.cfg().source;
        if (src !== 'watch') {
            // 5.2.1: liefert die eingestellte Quelle gerade nichts (z. B. HypeRate nicht erreichbar), übernimmt die Uhr automatisch
            if (h.active && h.from !== 'watch') return { ok: false, ignored: true, msg: 'In VRC Nexus liefert gerade eine andere Puls-Quelle (' + src + ').', notes: this.notesSafe() };
            h.save({ source: 'watch' });
            h.switchedFrom = src;
        }
        if (b.steps !== undefined && this.app.diary) this.app.diary.setSteps(b.steps);   // 8.0.5: Schritte des Tages
        return { ok: h.push(int(b.bpm), 'watch'), switched: src !== 'watch' ? src : undefined, notes: this.notesSafe() };   // 6.5: Meldungen auch beim Puls-Senden
    }
    async action(a, b, dev) {
        const post = (act, x) => this.app.post(Object.assign({ act }, x || {}), {});
        let r;
        if (dev && dev.nsfw === false && NSFW_WATCH.has(a)) throw new UserError('🔞 ist auf diesem Gerät ausgeblendet – nur Panik, Safeword und Stopp.');   // 8.2
        switch (a) {
            case 'panic': {
                // 5.2.2: Panik nicht von langsamen Teilen (VRChat-Avatar, Wallpaper Engine, OBS) aufhalten lassen – nach 2,5 s antworten, der Rest läuft weiter
                const run = post('nsfw_panic_full');   // 5.3: wie der Panik-Knopf im Client – NSFW danach ganz aus
                run.catch(e => { this.lastError = e.message; });
                r = await Promise.race([run, new Promise(ok => setTimeout(() => ok({ msg: '🚨 Panik ausgelöst' }), 2500))]);
                break;
            }
            case 'allclear': r = await post('nsfw_allclear'); break;
            case 'private': r = await post('nsfw_private', { on: b.on === false || b.on === '0' ? '0' : '1' }); break;
            case 'consent': if (!['green', 'yellow', 'red'].includes(str(b.light))) throw new UserError('Ampel: green, yellow oder red.'); r = await post('toys_consent', { light: str(b.light) }); break;
            case 'toys_stop': r = await post('toys_stop', { device: 'all' }); break;
            case 'note_reply': r = await this.noteReply(b.id, str(b.reply)); break;   // 6.5
            case 'safeword': r = await post('nsfwx_safeword', { source: 'Uhr' }); break;   // 6.7
            case 'theme': this.saveCfg({ theme: str(b.theme) }); r = { msg: '🎨 ' + THEMES[str(b.theme)].name }; break;
            case 'face': this.saveCfg({ face: str(b.face) }); r = { msg: '⌚ ' + FACES[str(b.face)] }; break;   // 8.0.5
            case 'steps': if (this.app.diary) this.app.diary.setSteps(b.steps); r = { msg: '🚶 ' + int(b.steps) }; break;
            case 'sleep': r = await post('comfort_sleep', { on: b.on === false || b.on === '0' ? '0' : '1', wake: int(b.wake) || 0 }); break;
            default: throw new UserError('Unbekannte Aktion.');
        }
        return Object.assign({ ok: true, msg: str(r && r.msg) || 'Erledigt.' }, { state: this.state(dev), by: dev.name });
    }

    /** 5.2.3: Handy → PC: nur Aktionen aus PHONE_ACTS; Chatbox nur als Text/Tippen */
    async phoneAct(b, dev) {
        if (dev.kind !== 'phone') throw new UserError('Nur für gekoppelte Handys.');
        const act = str(b.act), input = b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : {};
        if (!PHONE_ACTS.has(act)) throw new UserError('Diese Aktion ist vom Handy aus nicht erlaubt.');
        if (dev.nsfw === false && /^(nsfw|nsfwx|toys|toys3)_/.test(act) && !SAFETY_ACTS.has(act)) throw new UserError('🔞 ist auf diesem Gerät ausgeblendet – nur Panik, Safeword und Stopp.');   // 8.2
        if (act === 'client_osc' && !['chatbox', 'typing', 'input'].includes(str(input.kind))) throw new UserError('Vom Handy nur Chatbox-Text und einfache Eingaben.');
        if (act === 'client_osc' && str(input.kind) === 'input' && !PHONE_INPUTS.includes(str(input.name))) throw new UserError('Diese Eingabe ist vom Handy aus nicht erlaubt.');   // 8.0.8
        const clean = {};
        for (const [k, v] of Object.entries(input)) if (/^[a-z_]{1,32}$/.test(k) && ['string', 'number', 'boolean'].includes(typeof v)) clean[k] = typeof v === 'string' ? cut(v, 2000) : v;
        const r = await this.app.post(Object.assign(clean, { act }), {});
        return { ok: true, result: r, state: this.state(dev) };
    }

    async actionUi(act, input) {
        switch (act) {
            case 'watch_get': return this.status();
            case 'watch_cfg': this.saveCfg(input); return Object.assign(this.status(), { msg: 'Gespeichert.' });
            case 'watch_newpin': this.pin = newPin(); return this.status();
            case 'watch_dev_nsfw': {   // 8.2: 🔞 je Gerät ein/aus
                const c = this.cfg(), d = c.devices.find(x => x.id === str(input.id));
                if (!d) throw new UserError('Gerät nicht gefunden.');
                d.nsfw = !(input.on === false || input.on === '0' || input.on === 0);
                this.saveCfg({ devices: c.devices });
                return Object.assign(this.status(), { msg: d.nsfw ? '🔞 auf „' + d.name + '“ sichtbar.' : '🙈 🔞 auf „' + d.name + '“ ausgeblendet (Panik & Safeword gehen weiter).' });
            }
            case 'watch_remove': return Object.assign(this.remove(input.id), { msg: 'Uhr entfernt.' });
            case 'watch_bg': this.setBg(input.data); return Object.assign(this.status(), { msg: '🖼 Hintergrund gespeichert – die Uhr holt ihn gleich.' });
            case 'watch_bg_get': { const b = this.bgFile(); return { data: b ? 'data:image/jpeg;base64,' + b.toString('base64') : '' }; }
            case 'watch_bg_clear': this.clearBg(); return Object.assign(this.status(), { msg: 'Hintergrund entfernt.' });
            case 'watch_find': {
                const c = this.cfg(), ids = input.id ? [str(input.id)] : c.devices.map(d => d.id);
                for (const id of ids) this.buzz[id] = Date.now() + 30000;
                return Object.assign(this.status(), { msg: '🔔 Die Uhr vibriert beim nächsten Abruf (bis zu 5 s).' });
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Watch, DISC_PORT, THEMES, FACES, PHONE_ACTS };
