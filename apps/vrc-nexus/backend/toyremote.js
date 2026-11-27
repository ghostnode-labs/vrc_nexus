'use strict';
/*
 * 🌐 Spielzeug-Fernsteuerung über die VRChat-User-ID (Nexus ↔ Nexus).
 *
 * Empfangen (Host): Andere dürfen meine Spielzeuge steuern, wenn ihre User-ID auf meiner Freigabeliste steht UND sie
 * einen gültigen Freischalt-Schlüssel mit „toys“ für genau diese ID mitschicken (Besitzer: kurzlebiger, selbst signierter Schlüssel).
 * Steuern (Partner): Befehle an eine User-ID schicken.
 *
 * Nichts einzutragen außer der User-ID – der Weg wird automatisch gewählt:
 *   lan  – Heimnetz: HTTP direkt an den PC des Partners (Suche per UDP-Rundruf nach der User-ID)
 *   web  – sonst über die GhostNode-Webseite (RELAY/toyrelay.php) als Briefkasten; lesen nur mit dem Briefkasten-Schlüssel des Empfängers
 * (Ein öffentlicher Dienst mit Kopplungscode ist noch eingebaut, aber in der Oberfläche aus.)
 *
 * Sicherheit: Höchststärke für Fernsteuerung, Befehle nur 60 s gültig + nur einmal (Nonce), Regler-Stärke fällt nach 15 s ohne
 * Lebenszeichen auf 0, Panik schaltet den Empfang aus.
 */
const crypto = require('crypto');
const http = require('http');
const dgram = require('dgram');
const { str, int, cut, arr, now, UserError } = require('./util');

const UIDRE = /^(?:usr_[0-9a-f-]{36}|[0-9a-z]{10})$/i;
const DEF = { recv_on: false, allow: [], max: 60, limit_min: 0, lan: true, web: true, pub: false, web_url: '', code: '', lan_port: 17872, t_uid: '', t_via: 'auto', t_addr: '', t_url: '', t_code: '' };
const VIAS = ['auto', 'lan', 'web', 'pub'];
const CMDS = ['ping', 'set', 'pattern', 'surprise', 'stop'];
const UDP_PORT = () => int(process.env.NEXUS_TOY_UDP) || 17873;
const RELAY = () => (process.env.NEXUS_RELAY_BASE || require('./servers').nexus()).replace(/\/+$/, '');
const PUB = () => (process.env.NEXUS_NTFY_BASE || 'https://ntfy.sh').replace(/\/+$/, '');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const uidHash = u => sha('vrcnx-toy|' + str(u).toLowerCase());
/** 3.1.1: GhostNode prüft Verified 18+ serverseitig – das Konto-Token geht NUR an die GhostNode-Webseite, nie an eine fremde Relay-Adresse */
function relayBody(app, url, body) {
    const own = str(url).replace(/\/+$/, '') === RELAY();
    const acc = own && app.account ? app.account.current() : null;
    return JSON.stringify(acc ? Object.assign({ token: acc.token }, body) : body);
}
const topic = (u, code) => 'vrcnx_' + sha('topic|' + str(u).toLowerCase() + '|' + code).slice(0, 40);
const keyOf = code => crypto.createHash('sha256').update('key|vrcnx-toy|' + code).digest();
function enc(o, code) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyOf(code), iv);
    const ct = Buffer.concat([c.update(JSON.stringify(o), 'utf8'), c.final()]);
    return 'NXE1.' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function dec(s, code) {
    if (!/^NXE1\./.test(str(s))) return null;
    try {
        const b = Buffer.from(str(s).slice(5), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', keyOf(code), b.subarray(0, 12));
        d.setAuthTag(b.subarray(12, 28));
        return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
    } catch (e) { return null; }
}
const normUrl = u => { u = str(u).trim().replace(/\/+$/, ''); if (!u) return ''; if (!/^https?:\/\/[\w.\-]+(:\d+)?(\/[\w.\-~/]*)?$/.test(u)) throw new UserError('Webseiten-Adresse ungültig (z. B. https://deine-seite.de).'); return u.replace(/\/toyrelay\.php$/, ''); };
const newCode = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789', b = crypto.randomBytes(12); let s = ''; for (let i = 0; i < 12; i++) s += a[b[i] % a.length] + (i % 4 === 3 && i < 11 ? '-' : ''); return s; };

class ToyRemote {
    constructor(app) {
        this.app = app; this.seen = new Map(); this.log = []; this.active = null;
        this.st = { lan: { ok: false, err: '' }, web: { ok: false, err: '', at: 0 }, pub: { ok: false, err: '' } };
        this.remoteLv = 0; this.remoteAt = 0;
        this.ctrl = { lv: 0, sentAt: 0, at: 0, ack: null, err: '', addr: '' };
        this.streams = new Map(); this.selfTok = null;
        this.timer = setInterval(() => this.tick(), 1000); if (this.timer.unref) this.timer.unref();
        setTimeout(() => this.apply(), 1500).unref?.();
    }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('toyremote_cfg', '{}'))); } catch (e) { return Object.assign({}, DEF); } }
    myId() { return this.app.nsfw ? this.app.nsfw.myId() : ''; }
    allowed() { const a = this.app.nsfw && this.app.nsfw.access(); return !!(a && a.unlocked && a.features.includes('toys')); }
    saveCfg(c) {
        const n = this.cfg();
        const b = v => v === true || v === '1' || v === 'true';
        if (c.recv_on !== undefined && b(c.recv_on) && !n.recv_on) this.recvSince = Date.now();   // NSFW 3.0: Zeitlimit zählt ab Einschalten
        for (const k of ['recv_on', 'lan', 'web', 'pub']) if (c[k] !== undefined) n[k] = b(c[k]);
        if (c.limit_min !== undefined) n.limit_min = Math.max(0, Math.min(480, int(c.limit_min)));
        if (c.max !== undefined) n.max = Math.max(5, Math.min(100, int(c.max)));
        if (c.lan_port !== undefined) { const p = int(c.lan_port); if (p < 1024 || p > 65535) throw new UserError('Port 1024–65535.'); n.lan_port = p; }
        if (c.web_url !== undefined) n.web_url = normUrl(c.web_url);
        if (c.t_url !== undefined) n.t_url = normUrl(c.t_url);
        if (c.code !== undefined) n.code = cut(str(c.code).trim(), 60);
        if (c.t_code !== undefined) n.t_code = cut(str(c.t_code).trim(), 60);
        if (c.t_via !== undefined) n.t_via = VIAS.includes(str(c.t_via)) ? str(c.t_via) : 'auto';
        if (c.t_addr !== undefined) { const a = str(c.t_addr).trim(); if (a && !/^[\w.\-]+(:\d+)?$/.test(a)) throw new UserError('Adresse ungültig (z. B. 192.168.2.50 oder 192.168.2.50:17872).'); n.t_addr = a; }
        if (c.t_uid !== undefined) { const u = str(c.t_uid).trim().replace(/^.*\/(usr_[0-9a-f-]{36}).*$/i, '$1'); if (u && !UIDRE.test(u)) throw new UserError('Bitte eine VRChat-User-ID (usr_…) oder einen Profil-Link.'); n.t_uid = u; }
        if (c.allow !== undefined) {
            let l = c.allow;
            if (typeof l === 'string') l = l.trim().startsWith('[') ? JSON.parse(l) : l.split('\n').map(x => { const p = x.split('|').map(y => y.trim()); return { uid: p[0], name: p[1] }; });
            n.allow = arr(l).map(x => ({ uid: str(x.uid).trim().replace(/^.*\/(usr_[0-9a-f-]{36}).*$/i, '$1'), name: cut(str(x.name), 40) })).filter(x => UIDRE.test(x.uid)).slice(0, 30);
        }
        if (n.pub && n.recv_on && n.code.length < 8) n.code = newCode();
        this.app.db.setSetting('toyremote_cfg', JSON.stringify(n));
        this.apply();
        return n;
    }
    inboxKey() {
        const c = this.app.vrc && this.app.vrc.crypt;
        try { const k = c ? c.decrypt(this.app.db.setting('toyremote_inbox', '')) : this.app.db.setting('toyremote_inbox', ''); if (k && k.length >= 32) return k; } catch (e) { /* neu */ }
        const k = crypto.randomBytes(24).toString('hex');
        this.app.db.setSetting('toyremote_inbox', c ? c.encrypt(k) : k);
        return k;
    }
    /** eigener Nachweis: gespeicherter Freischalt-Schlüssel – oder als Besitzer ein selbst signierter für 15 min */
    token() {
        const n = this.app.nsfw, uid = this.myId();
        if (n.isOwner()) {
            if (this.selfTok && this.selfTok.exp > now() + 60 && this.selfTok.uid === uid) return this.selfTok.t;
            if (!n.ownerKey()) return '';
            const p = { v: 1, id: 'self', uid, f: ['toys'], iat: now(), exp: now() + 900, n: 'Fernsteuerung' };
            this.selfTok = { t: n.sign(p), exp: p.exp, uid };
            return this.selfTok.t;
        }
        return n.myToken();
    }
    note(who, txt) { this.log.unshift({ t: now(), who: cut(who, 40), txt: cut(txt, 120) }); this.log.length = Math.min(this.log.length, 25); }

    // ---------- Empfangen ----------
    apply() {
        const c = this.cfg(), on = c.recv_on && this.allowed() && !!this.myId();
        this.lan(on && c.lan ? c.lan_port : 0);
        const codes = new Set();
        if (on && c.pub && c.code) codes.add(c.code);
        if (this.ctrlActive() && this.cfg().t_via === 'pub' && c.t_code) codes.add(c.t_code);
        for (const [code, s] of this.streams) if (!codes.has(code) || s.uid !== this.myId()) { s.abort.abort(); this.streams.delete(code); }
        for (const code of codes) if (!this.streams.has(code)) this.listenPub(code);
        if (!(on && c.pub)) this.st.pub = { ok: false, err: '' };
        if (!(on && c.web)) this.st.web = { ok: false, err: '', at: 0 };
    }
    lan(port) {
        if (this.srv && this.srvPort === port) return;
        if (this.srv) { this.srv.close(); this.srv = null; }
        if (this.udp) { try { this.udp.close(); } catch (e) { /* zu */ } this.udp = null; }
        this.srvPort = port; this.st.lan = { ok: false, err: '' };
        if (!port) return;
        const host = process.env.NEXUS_REMOTE_HOST || '0.0.0.0';
        this.srv = http.createServer(async (req, res) => {
            const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
            if (req.method !== 'POST' || req.url !== '/toy') return out(404, { error: 'nicht hier' });
            let raw = '';
            for await (const ch of req) { raw += ch; if (raw.length > 8000) return out(413, { error: 'zu groß' }); }
            try { out(200, await this.receive(JSON.parse(raw), 'lan')); } catch (e) { out(e instanceof UserError ? 403 : 400, { error: e.message }); }
        });
        this.srv.on('error', e => { this.st.lan = { ok: false, err: e.code === 'EADDRINUSE' ? 'Port ' + port + ' belegt' : e.message }; });
        this.srv.listen(port, host, () => { this.st.lan = { ok: true, err: '' }; });
        // Suche im Heimnetz: „wer hat User-ID X?“ → Antwort mit Port
        try {
            const u = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            u.on('message', (m, ri) => { try { const q = JSON.parse(m.toString()); if (q.q === 'vrcnx-toy' && q.h === uidHash(this.myId())) u.send(JSON.stringify({ a: 'vrcnx-toy', h: q.h, port }), ri.port, ri.address); } catch (e) { /* Müll */ } });
            u.on('error', () => {});
            u.bind(UDP_PORT(), host);
            this.udp = u;
        } catch (e) { /* ohne Suche */ }
    }
    async pollWeb() {
        const c = this.cfg(), host = c.recv_on && c.web && this.allowed(), ctl = this.ctrlActive() && this.ctrl.via === 'web';
        if (!host && !ctl) return;
        const url = (host ? c.web_url : c.t_url) || RELAY();
        if (!url || !this.myId()) { if (host) this.st.web = { ok: false, err: 'Webseiten-Adresse fehlt', at: 0 }; return; }
        if (this.webBusy) return; this.webBusy = true;
        try {
            const r = await fetch(url + '/toyrelay.php?a=poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: relayBody(this.app, url, { to: uidHash(this.myId()), key: this.inboxKey() }), signal: AbortSignal.timeout(8000) });
            const d = await require('./servers').readJson(r, 'toyrelay.php');
            if (d.error) throw new Error(d.error);
            if (host) this.st.web = { ok: true, err: '', at: Date.now() };
            for (const m of arr(d.msgs)) { try { await this.dispatch(JSON.parse(m), 'web'); } catch (e) { /* ungültig */ } }
        } catch (e) { if (host) this.st.web = { ok: false, err: e.message === 'fetch failed' ? 'Webseite nicht erreichbar' : e.message, at: 0 }; } finally { this.webBusy = false; }
    }
    async listenPub(code) {
        const ab = new AbortController(), uid = this.myId(), t = topic(uid, code);
        this.streams.set(code, { abort: ab, uid });
        const run = async () => {
            while (!ab.signal.aborted) {
                try {
                    const r = await fetch(PUB() + '/' + t + '/json', { signal: ab.signal });
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    if (code === this.cfg().code) this.st.pub = { ok: true, err: '' };
                    let buf = '';
                    for await (const ch of r.body) {
                        buf += Buffer.from(ch).toString('utf8');
                        let i;
                        while ((i = buf.indexOf('\n')) >= 0) {
                            const line = buf.slice(0, i); buf = buf.slice(i + 1);
                            try { const ev = JSON.parse(line); if (ev.event === 'message') { const o = dec(ev.message, code); if (o) await this.dispatch(o, 'pub').catch(() => {}); } } catch (e) { /* Zeile kaputt */ }
                        }
                    }
                } catch (e) { if (ab.signal.aborted) return; if (code === this.cfg().code) this.st.pub = { ok: false, err: e.message }; }
                await new Promise(r => setTimeout(r, 3000));
            }
        };
        run();
    }
    async dispatch(o, via) {
        if (o && o.ack) { if (o.to === this.myId()) this.ctrl.ack = { at: Date.now(), ok: !!o.ok, msg: cut(str(o.msg), 160), lv: int(o.lv), via }; return; }
        const r = await this.receive(o, via).catch(e => ({ ok: false, msg: e.message }));
        if (o && UIDRE.test(str(o.from)) && o.to === this.myId()) this.reply(o.from, via, Object.assign({ ack: 1, to: o.from, n: o.n }, r)).catch(() => {});
    }
    async reply(to, via, o) {
        const c = this.cfg();
        if (via === 'web') await fetch((c.web_url || RELAY()) + '/toyrelay.php?a=send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: relayBody(this.app, c.web_url || RELAY(), { to: uidHash(to), msg: JSON.stringify(o) }), signal: AbortSignal.timeout(8000) });
        if (via === 'pub' && c.code) await fetch(PUB() + '/' + topic(to, c.code), { method: 'POST', body: enc(o, c.code), signal: AbortSignal.timeout(8000) });
    }
    /** Befehl prüfen und ausführen */
    async receive(m, via) {
        const c = this.cfg(), me = this.myId();
        if (!c.recv_on || !c[via]) throw new UserError('Fernsteuerung ist hier aus.');
        if (!this.allowed()) throw new UserError('Spielzeug ist hier nicht freigeschaltet.');
        if (!m || m.v !== 1 || !me || str(m.to).toLowerCase() !== me.toLowerCase()) throw new UserError('Falsche Empfänger-ID.');
        const from = str(m.from), self = from.toLowerCase() === me.toLowerCase();
        if (!self && this.app.safety && this.app.safety.isBlocked(from)) { this.note(from, '⛔ auf deiner Sperrliste'); throw new UserError('Du stehst nicht auf der Freigabeliste.'); }   // 8.2: Sperrliste geht immer vor
        const who = self ? { uid: me, name: 'Du (Selbsttest)' } : c.allow.find(a => a.uid.toLowerCase() === from.toLowerCase());
        if (!who) { this.note(from, '⛔ nicht auf der Freigabeliste'); throw new UserError('Du stehst nicht auf der Freigabeliste.'); }
        const age = Date.now() - Number(m.ts);
        if (!(age > -30000 && age < 60000)) throw new UserError('Befehl zu alt (Uhrzeit prüfen).');
        const nonce = str(m.n);
        if (!/^[0-9a-f]{16,40}$/.test(nonce) || this.seen.has(nonce)) throw new UserError('Befehl doppelt.');
        // seit 3.0: Absender muss „Verified 18+“ mit NSFW an sein – geprüft über GhostNode (nicht mehr per NXK1)
        let peerOk = self;
        if (!self) { try { peerOk = await this.app.account.peer(from); } catch (e) { this.note(who.name || from, '⛔ ' + e.message); throw new UserError('Freigabe nicht prüfbar: ' + e.message); } }
        if (!peerOk) { this.note(who.name || from, '⛔ ohne Verified 18+ / NSFW'); throw new UserError('Absender hat keine NSFW-Freigabe (Verified 18+).'); }
        this.seen.set(nonce, Date.now());
        if (this.seen.size > 2000) for (const [k, t] of this.seen) if (Date.now() - t > 120000) this.seen.delete(k);
        const name = who.name || from, cmd = str(m.c), a = m.a || {}, t = this.app.toys, cap = c.max / 100;
        if (!CMDS.includes(cmd)) throw new UserError('Unbekannter Befehl.');
        if (!this.active || this.active.uid !== from || Date.now() - this.active.at > 120000) this.note(name, '🔗 verbunden über ' + via);
        this.active = { uid: from, name, at: Date.now(), via };
        const lvNow = () => Math.round(Math.max(0, ...[...t.level.values(), 0]) * 100);
        if (cmd === 'ping') return { ok: true, msg: '✔ verbunden mit ' + (this.app.vrc.account() || {}).display_name + ' · ' + t.devices.size + ' Gerät(e) · max. ' + c.max + ' %', lv: lvNow() };
        if (!t.ws || !t.devices.size) throw new UserError('Beim Empfänger ist kein Spielzeug verbunden.');
        if (cmd === 'stop') { t.pat = null; this.remoteLv = 0; await t.set('all', 0); this.note(name, '⏹ gestoppt'); return { ok: true, msg: '⏹ gestoppt', lv: 0 }; }
        if (cmd === 'set') {
            const lv = Math.max(0, Math.min(1, Number(a.lv) || 0)) * cap;
            this.remoteLv = lv; this.remoteAt = Date.now();
            await t.set('all', lv);
            return { ok: true, msg: 'Stärke ' + Math.round(lv * 100) + ' %', lv: Math.round(lv * 100) };
        }
        if (cmd === 'pattern') {
            const p = t.startPattern({ id: a.id, speed: a.speed, strength: Math.min(c.max, int(a.strength) || 60), seconds: Math.max(10, Math.min(600, int(a.seconds) || 300)) });
            this.note(name, '🌊 Muster ' + p.id); return { ok: true, msg: 'Muster läuft (max. ' + c.max + ' %)', lv: lvNow() };
        }
        if (cmd === 'surprise') { const s = t.surprise(); t.pat.strength = Math.min(t.pat.strength, cap); this.note(name, '🎁 Überraschung'); return { ok: true, msg: '🎁 Überraschung (' + s + ' s)', lv: lvNow() }; }
        throw new UserError('Unbekannter Befehl.');
    }
    tick() {
        // NSFW 3.0: Zeitlimit für den Empfang
        const lc = this.cfg();
        if (lc.recv_on && !this.recvSince) this.recvSince = Date.now();
        if (lc.recv_on && lc.limit_min > 0 && this.recvSince && Date.now() - this.recvSince > lc.limit_min * 60000) {
            this.saveCfg({ recv_on: '0' }); this.remoteLv = 0; if (this.app.toys) this.app.toys.set('all', 0).catch(() => {});
            this.note('Zeitlimit', '⌛ ' + lc.limit_min + ' min vorbei – Empfang aus');
        }
        // Regler vom Partner ohne Lebenszeichen → aus
        if (this.remoteLv > 0 && Date.now() - this.remoteAt > 15000 && this.app.toys) { this.remoteLv = 0; this.app.toys.set('all', 0).catch(() => {}); this.note(this.active ? this.active.name : '?', '⌛ kein Signal mehr → aus'); }
        // eigener Regler: Lebenszeichen alle 5 s
        if (this.ctrl.lv > 0 && this.ctrlActive() && Date.now() - this.ctrl.sentAt > 5000) this.send('set', { lv: this.ctrl.lv }).catch(e => { this.ctrl.err = e.message; });
        this.pollWeb();
        if (this.pubCheckAt === undefined || Date.now() - this.pubCheckAt > 10000) { this.pubCheckAt = Date.now(); this.apply(); }
    }
    panic() { const c = this.cfg(); this.ctrl.lv = 0; this.remoteLv = 0; if (c.recv_on) { this.saveCfg({ recv_on: false }); this.note('Panik', '🚨 Empfang ausgeschaltet'); } }

    // ---------- Steuern ----------
    ctrlActive() { return Date.now() - this.ctrl.at < 180000; }
    async discover(uid) {
        const sock = dgram.createSocket('udp4');
        const h = uidHash(uid);
        return await new Promise(resolve => {
            const done = v => { clearTimeout(to); try { sock.close(); } catch (e) { /* zu */ } resolve(v); };
            const to = setTimeout(() => done(''), 1500);
            sock.on('message', (m, ri) => { try { const r = JSON.parse(m.toString()); if (r.a === 'vrcnx-toy' && r.h === h) done(ri.address + ':' + int(r.port)); } catch (e) { /* weiter */ } });
            sock.on('error', () => done(''));
            sock.bind(0, () => {
                try { sock.setBroadcast(true); } catch (e) { /* ohne */ }
                const q = Buffer.from(JSON.stringify({ q: 'vrcnx-toy', h }));
                for (const ip of ['255.255.255.255', '127.0.0.1']) sock.send(q, UDP_PORT(), ip, () => {});
            });
        });
    }
    async send(cmd, a) {
        if (!CMDS.includes(cmd)) throw new UserError('Unbekannter Befehl.');
        const c = this.cfg(), me = this.myId();
        if (!me) throw new UserError('Erst bei VRChat anmelden.');
        if (!UIDRE.test(c.t_uid)) throw new UserError('Erst die User-ID des Partners eintragen.');
        const self = c.t_uid.toLowerCase() === me.toLowerCase();   // Selbsttest: immer direkt auf diesem PC
        const tok = this.token() || '';   // nur noch zur Kompatibilität mit älteren Empfängern – geprüft wird über GhostNode (Verified 18+)
        const m = { v: 1, from: me, to: c.t_uid, tok, ts: Date.now(), n: crypto.randomBytes(10).toString('hex'), c: cmd, a: a || {} };
        this.ctrl.at = Date.now(); this.ctrl.sentAt = Date.now(); this.ctrl.err = '';
        if (cmd === 'set') this.ctrl.lv = Math.max(0, Math.min(1, Number(a && a.lv) || 0));
        if (cmd === 'stop') this.ctrl.lv = 0;
        let via = self ? 'lan' : c.t_via;
        if (self) { this.ctrl.via = 'lan'; if (!c.recv_on || !c.lan) throw new UserError('Selbsttest: erst oben „Fernsteuerung empfangen“ einschalten.'); this.ctrl.addr = '127.0.0.1:' + c.lan_port; }
        else if (via === 'auto') {
            if (this.ctrl.uid !== c.t_uid || !this.ctrl.via || Date.now() - (this.ctrl.foundAt || 0) > 120000) {
                this.ctrl.uid = c.t_uid; this.ctrl.foundAt = Date.now();
                this.ctrl.addr = c.t_addr || await this.discover(c.t_uid);
                this.ctrl.via = this.ctrl.addr ? 'lan' : 'web';
            }
            via = this.ctrl.via;
        } else this.ctrl.via = via;
        if (via === 'lan') {
            let addr = c.t_addr || this.ctrl.addr;
            if (!addr) { addr = await this.discover(c.t_uid); if (!addr) throw new UserError('Im Heimnetz nicht gefunden – läuft dort VRC Nexus mit „Fernsteuerung empfangen“?'); this.ctrl.addr = addr; }
            if (!/:\d+$/.test(addr)) addr += ':17872';
            let r;
            try { r = await fetch('http://' + addr + '/toy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m), signal: AbortSignal.timeout(5000) }); }
            catch (e) { this.ctrl.addr = ''; this.ctrl.via = ''; throw new UserError('Nicht erreichbar (' + addr + ') – nochmal versuchen, dann geht es über die Webseite.'); }
            const d = await r.json().catch(() => ({}));
            this.ctrl.ack = { at: Date.now(), ok: !d.error, msg: d.error || d.msg || '', lv: int(d.lv), via: 'lan' };
            if (d.error) throw new UserError(d.error);
            return Object.assign({ sent: true }, d);
        }
        if (via === 'web') {
            const r = await fetch((c.t_url || RELAY()) + '/toyrelay.php?a=send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: relayBody(this.app, c.t_url || RELAY(), { to: uidHash(c.t_uid), msg: JSON.stringify(m) }), signal: AbortSignal.timeout(8000) }).catch(e => { throw new UserError('Webseite nicht erreichbar' + (e.message === 'fetch failed' ? '' : ': ' + e.message) + '.'); });
            const d = await require('./servers').readJson(r, 'toyrelay.php');
            if (d.error) throw new UserError(d.error);
            this.pollWeb();
            return { sent: true, msg: 'gesendet (Internet) – Antwort kommt gleich' };
        }
        if (!c.t_code || c.t_code.length < 8) throw new UserError('Kopplungscode fehlt (bekommst du vom Partner).');
        this.apply();
        const r = await fetch(PUB() + '/' + topic(c.t_uid, c.t_code), { method: 'POST', body: enc(m, c.t_code), signal: AbortSignal.timeout(8000) }).catch(e => { throw new UserError('Dienst nicht erreichbar: ' + e.message); });
        if (!r.ok) throw new UserError('Dienst: HTTP ' + r.status + (r.status === 429 ? ' (zu viele Befehle – kurz warten)' : ''));
        return { sent: true, msg: 'gesendet – Antwort kommt verschlüsselt zurück' };
    }

    status() {
        const c = this.cfg();
        return { cfg: c, my_uid: this.myId(), listen: this.st, active: this.active && Date.now() - this.active.at < 120000 ? this.active : null, log: this.log.slice(0, 15),
            relay: RELAY(), remote_lv: Math.round(this.remoteLv * 100), ctrl: { via: this.ctrl.via || '', lv: Math.round(this.ctrl.lv * 100), active: this.ctrlActive(), ack: this.ctrl.ack, err: this.ctrl.err, addr: this.ctrl.addr } };
    }
    async action(act, input) {
        this.app.nsfw.need('toys');
        switch (act) {
            case 'tremote_state': return this.status();
            case 'tremote_cfg': this.saveCfg(input); return Object.assign(this.status(), { msg: 'Gespeichert.' });
            case 'tremote_new_code': { const c = this.cfg(); c.code = newCode(); this.app.db.setSetting('toyremote_cfg', JSON.stringify(c)); this.apply(); return Object.assign(this.status(), { msg: 'Neuer Kopplungscode – dem Partner geben.' }); }
            case 'tremote_find': { const c = this.cfg(); if (!UIDRE.test(c.t_uid)) throw new UserError('Erst die User-ID eintragen.'); const a = await this.discover(c.t_uid); this.ctrl.addr = a; return Object.assign(this.status(), { msg: a ? '✔ gefunden: ' + a : 'Nicht gefunden.' }); }
            case 'tremote_send': { const r = await this.send(str(input.c), { lv: input.lv, id: input.id, speed: input.speed, strength: input.strength, seconds: input.seconds }).catch(e => { this.ctrl.err = e.message; this.ctrl.ack = null; throw e; }); return Object.assign(this.status(), { msg: r.msg || 'gesendet' }); }
            case 'tremote_safeword': {   // NSFW 3.0: Safeword – sofort alles aus, Empfang aus, Partner wird abgewiesen
                this.saveCfg({ recv_on: '0' }); this.remoteLv = 0; this.ctrl.lv = 0;
                if (this.app.toys) await this.app.toys.stopAll().catch(() => {});
                this.note('Du', '🛑 Safeword – alles gestoppt');
                if (this.app.tools && this.app.tools.alert) this.app.tools.alert('🛑 Safeword', 'Alles gestoppt, Fernsteuerung aus.');
                return Object.assign(this.status(), { msg: '🛑 Safeword – alles gestoppt.' });
            }
            case 'tremote_kick': { this.saveCfg({ recv_on: '0' }); if (this.app.toys) await this.app.toys.set('all', 0); this.remoteLv = 0; this.note('Du', '🚫 Fernsteuerung beendet'); return Object.assign(this.status(), { msg: '🚫 Fernsteuerung aus.' }); }
        }
        throw new UserError('Unbekannte Aktion.');
    }
    stop() { clearInterval(this.timer); this.lan(0); for (const s of this.streams.values()) s.abort.abort(); this.streams.clear(); }
}

module.exports = { ToyRemote, uidHash, topic, enc, dec };
