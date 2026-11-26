'use strict';
/*
 * 5.4: Nexus Client-API über WebSocket – ws://127.0.0.1:<API-Port>/ws (gleicher Port und Schlüssel wie die lokale HTTP-API).
 * Eigene, kleine Umsetzung von RFC 6455 (nur Text-Frames, Ping/Pong, Close; keine Erweiterungen), ohne Pakete.
 *
 * Nachrichten sind JSON. Anfrage:  { "id": 1, "op": "…", … }   Antwort: { "id": 1, "ok": true, "result": … } oder { "id": 1, "ok": false, "error": "…" }
 *   op "hello"                         → Version, verfügbare Befehle und Themen (geht auch ohne Anmeldung)
 *   op "auth"      { token }           → anmelden (alternativ ?token=… in der Adresse)
 *   op "state"                         → kompletter Status (wie GET /api/state)
 *   op "action"    { action, … }       → Aktion ausführen (wie POST /api/action: status, chatbox, param, toggle, preset, macro, avatar, …)
 *   op "subscribe" { topics: [...] }   → Ereignisse abonnieren; danach kommen { "event": "<thema>", "data": … } ohne id
 *   op "unsubscribe" { topics: [...] }
 *   op "ping"                          → { pong: Zeit }
 * Themen: game (Welt, Instanz, Spieler), heart (Puls), friends (Zahlen), me (Status), media (läuft gerade), chatbox (letzter Text),
 *         notifs (ungelesene), warn (Warnliste in der Instanz), osc (Avatar-Parameter, gedrosselt)
 * Sicherheit: nur 127.0.0.1, Browser-Seiten (Origin) werden abgewiesen, falscher Schlüssel → Verbindung zu; höchstens 8 Verbindungen,
 * 64 KB je Nachricht, 30 Befehle pro Sekunde. 🔞-Funktionen gibt es über diese Schnittstelle nicht.
 */
const crypto = require('crypto');
const { str } = require('./util');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const TOPICS = ['game', 'heart', 'friends', 'me', 'media', 'chatbox', 'notifs', 'warn', 'osc'];
const MAX = 64 * 1024, MAX_CLIENTS = 8;

/** Frame bauen (Server → Client, unmaskiert) */
function frame(op, payload) {
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
    return Buffer.concat([head, payload]);
}
/** Frames aus dem Puffer lesen → [{op, data}], Rest bleibt im Puffer. Client-Frames müssen maskiert sein. */
function parse(conn) {
    const out = [];
    for (;;) {
        const b = conn.buf;
        if (b.length < 2) break;
        const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
        let len = b[1] & 0x7f, off = 2;
        if (len === 126) { if (b.length < 4) break; len = b.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (b.length < 10) break; const big = b.readBigUInt64BE(2); if (big > BigInt(MAX)) throw new Error('zu groß'); len = Number(big); off = 10; }
        if (!masked) throw new Error('unmaskiert');
        if (len > MAX) throw new Error('zu groß');
        if (b.length < off + 4 + len) break;
        const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
        for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
        conn.buf = b.subarray(off + 4 + len);
        if (op === 0) { conn.frag = Buffer.concat([conn.frag || Buffer.alloc(0), data]); if (conn.frag.length > MAX) throw new Error('zu groß'); if (fin) { out.push({ op: conn.fragOp, data: conn.frag }); conn.frag = null; } continue; }
        if (!fin && (op === 1 || op === 2)) { conn.frag = data; conn.fragOp = op; continue; }
        out.push({ op, data });
    }
    return out;
}

class WsApi {
    constructor(tools) { this.tools = tools; this.conns = new Set(); this.timer = null; this.last = {}; }
    get app() { return this.tools.app; }
    tokenOk(t) {
        const want = Buffer.from(str(this.tools.settings.get('int.api_token'))), got = Buffer.from(str(t));
        return want.length > 0 && got.length === want.length && crypto.timingSafeEqual(got, want);
    }
    /** an den HTTP-Server der lokalen API hängen */
    attach(server) { server.on('upgrade', (req, sock) => this.upgrade(req, sock)); }
    upgrade(req, sock) {
        const url = new URL(req.url, 'http://127.0.0.1');
        const no = (code, text) => { try { sock.end('HTTP/1.1 ' + code + ' ' + text + '\r\nConnection: close\r\n\r\n'); } catch (e) { /* zu */ } };
        if (url.pathname !== '/ws') return no(404, 'Not Found');
        if (!this.tools.settings.get('int.api')) return no(403, 'Forbidden');
        if (str(req.headers.origin)) return no(403, 'Forbidden');                     // keine fremden Webseiten im Browser
        if (str(req.headers.upgrade).toLowerCase() !== 'websocket' || str(req.headers['sec-websocket-version']) !== '13') return no(400, 'Bad Request');
        const key = str(req.headers['sec-websocket-key']);
        if (!/^[A-Za-z0-9+/]{22}==$/.test(key)) return no(400, 'Bad Request');
        if (this.conns.size >= MAX_CLIENTS) return no(503, 'Busy');
        const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
        sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
        const conn = { sock, buf: Buffer.alloc(0), authed: this.tokenOk(url.searchParams.get('token')), topics: new Set(), rate: [], frag: null };
        this.conns.add(conn);
        sock.setNoDelay(true);
        sock.on('data', d => {
            conn.buf = Buffer.concat([conn.buf, d]);
            if (conn.buf.length > MAX + 16) return this.close(conn, 1009);
            let frames;
            try { frames = parse(conn); } catch (e) { return this.close(conn, 1002); }
            for (const f of frames) {
                if (f.op === 8) return this.close(conn, 1000);
                if (f.op === 9) { this.raw(conn, 10, f.data); continue; }
                if (f.op === 1) this.message(conn, f.data.toString('utf8'));
            }
        });
        const gone = () => { this.conns.delete(conn); if (!this.conns.size) this.stopTick(); };
        sock.on('close', gone); sock.on('error', gone);
        this.send(conn, { event: 'welcome', data: this.hello(conn) });
    }
    raw(conn, op, buf) { try { conn.sock.write(frame(op, buf)); } catch (e) { /* zu */ } }
    send(conn, obj) { this.raw(conn, 1, Buffer.from(JSON.stringify(obj))); }
    close(conn, code) { const b = Buffer.alloc(2); b.writeUInt16BE(code || 1000); this.raw(conn, 8, b); try { conn.sock.end(); } catch (e) { /* zu */ } this.conns.delete(conn); }
    stop() { for (const c of [...this.conns]) this.close(c, 1001); this.stopTick(); }
    hello(conn) {
        return { api: 'vrc-nexus', version: require('./vrchat').VERSION, protocol: 1, authed: !!conn.authed, topics: TOPICS,
            ops: ['hello', 'auth', 'state', 'action', 'subscribe', 'unsubscribe', 'ping'], docs: 'https://ghostnode-labs.dev/api.php#client' };
    }
    async message(conn, text) {
        const now = Date.now();
        conn.rate = conn.rate.filter(t => now - t < 1000); conn.rate.push(now);
        let m;
        try { m = JSON.parse(text); } catch (e) { return this.send(conn, { ok: false, error: 'Ungültiges JSON.' }); }
        const id = m && (typeof m.id === 'number' || typeof m.id === 'string') ? m.id : null;
        const reply = (ok, x) => this.send(conn, ok ? { id, ok: true, result: x } : { id, ok: false, error: x });
        if (conn.rate.length > 30) return reply(false, 'Zu viele Befehle – kurz warten.');
        const op = str(m && m.op);
        try {
            if (op === 'hello') return reply(true, this.hello(conn));
            if (op === 'ping') return reply(true, { pong: now });
            if (op === 'auth') { conn.authed = this.tokenOk(m.token); if (!conn.authed) { reply(false, 'Falscher Zugangsschlüssel.'); return this.close(conn, 4001); } return reply(true, { authed: true }); }
            if (!conn.authed) return reply(false, 'Erst anmelden: {"op":"auth","token":"…"}');
            if (op === 'state') return reply(true, this.tools.apiState());
            if (op === 'action') { const d = m && typeof m === 'object' ? m : {}; return reply(true, await this.tools.apiAction(str(d.action), d)); }
            if (op === 'subscribe' || op === 'unsubscribe') {
                const list = (Array.isArray(m.topics) ? m.topics : [m.topics]).map(str).filter(t => TOPICS.includes(t));
                for (const t of list) op === 'subscribe' ? conn.topics.add(t) : conn.topics.delete(t);
                if (op === 'subscribe') { this.startTick(); const snap = this.snapshot(); for (const t of list) this.send(conn, { event: t, data: snap[t] }); }
                return reply(true, { topics: [...conn.topics] });
            }
            return reply(false, 'Unbekannter Befehl: ' + op);
        } catch (e) { return reply(false, e.message || 'Fehler'); }
    }
    /** Kleiner Schnappschuss je Thema (für Ereignisse bei Änderungen) */
    snapshot() {
        const a = this.app, g = a.game, st = g.state, out = {};
        let fr = []; try { fr = a.vrc.friendList(); } catch (e) { fr = []; }
        const acc = this.tools.acc();
        out.game = { running: !!st.running, world: st.worldName || '', world_id: st.worldId || '', instance: st.instance || '', players: st.players ? st.players.size : 0, since: st.since || 0 };
        out.friends = { in_game: fr.filter(f => f.state === 'online').length, online: fr.filter(f => f.state === 'active').length, total: fr.length };
        out.me = acc ? { name: acc.display_name, status: str(acc.me && acc.me.status), status_desc: str(acc.me && acc.me.statusDescription) } : null;
        out.heart = a.heart ? (() => { const h = a.heart.status(); return { bpm: h.bpm, active: h.active, source: h.cfg.source }; })() : null;
        out.media = a.media ? (() => { const x = a.media.now(); return x ? { title: x.title, artist: x.artist, app: x.app, status: x.status } : null; })() : null;
        out.chatbox = { text: g.osc.lastText || '', at: g.osc.lastChat || 0 };
        out.notifs = (() => { try { return { unseen: a.x.notifList({ view: 'open' }).unseen }; } catch (e) { return { unseen: 0 }; } })();
        out.warn = a.warn ? { present: a.warn.present().map(x => ({ name: x.name, reason: x.reason || '' })).slice(0, 10) } : null;
        out.osc = { avatar: g.osc.avatarId || '', params: Object.fromEntries(Object.entries(g.osc.params || {}).filter(([k]) => !/^(?:SPS|OGB|TPS|PCS|nsfw)/i.test(k)).slice(0, 64)) };   // intime Parameter nie
        return out;
    }
    startTick() {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), 1000);
        if (this.timer.unref) this.timer.unref();
    }
    stopTick() { if (this.timer) clearInterval(this.timer); this.timer = null; this.last = {}; }
    tick() {
        const want = new Set(); for (const c of this.conns) for (const t of c.topics) want.add(t);
        if (!want.size) return this.stopTick();
        let snap; try { snap = this.snapshot(); } catch (e) { return; }
        if (this.app.nsfw && this.app.nsfw.private) { snap.chatbox = { text: '', at: 0 }; snap.media = null; }   // Privat-Modus: nichts nach außen
        for (const t of want) {
            const j = JSON.stringify(snap[t]);
            if (this.last[t] === j) continue;
            if (t === 'osc' && this.lastOsc && Date.now() - this.lastOsc < 2000) continue;   // Parameter höchstens alle 2 s
            this.last[t] = j; if (t === 'osc') this.lastOsc = Date.now();
            for (const c of this.conns) if (c.authed && c.topics.has(t)) this.send(c, { event: t, data: snap[t] });
        }
    }
}

module.exports = { WsApi, frame, TOPICS };
