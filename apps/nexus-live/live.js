'use strict';
/*
 * GhostNode Live – Echtzeit-Dienst für VRC Nexus (Node.js ≥ 22, ohne Pakete).
 * Läuft auf dem Root-Server hinter nginx unter https://<domain>/live/ (WebSocket /live/ws).
 *
 * Ersetzt das sekündliche Abfragen des Briefkastens (toyrelay.php) für die Spielzeug-Fernsteuerung:
 *   1. App verbindet sich, schickt {"t":"hello","token":<Nexus-Konto-Token>}
 *   2. Der Dienst fragt die Webseite (toyrelay.php?a=who, nur mit LIVE_SECRET), ob das Konto Verified 18+ mit NSFW an ist,
 *      und bekommt den eigenen Briefkasten (Hash der VRChat-ID). Die ID selbst sieht der Dienst nie.
 *   3. {"t":"send","to":<64 hex>,"msg":<Text>} wird sofort an alle Verbindungen dieses Briefkastens geschickt
 *      ({"t":"msg","msg":…}); ist niemand verbunden, wartet die Nachricht höchstens 90 s (wie beim Briefkasten).
 * Alle 10 min wird die Freigabe neu geprüft (Freigabe entzogen → Verbindung zu).
 * Intern (nur 127.0.0.1 + LIVE_SECRET): POST /notify {"box","kind"} → {"t":"notify","kind"} an den Briefkasten
 * (z. B. „neue Chat-Nachricht“ – die App holt dann sofort ab statt beim nächsten Abfragen).
 *
 * Umgebung: PORT (18093), HOST (127.0.0.1), LIVE_SECRET (gemeinsam mit der Webseite), SITE_BACKEND (http://127.0.0.1:18080),
 *           SITE_HOST (Domain der Webseite, für den Host-Kopf)
 */
const http = require('http');
const crypto = require('crypto');

const TTL = 90 * 1000, MAX_QUEUE = 50, MAX_LEN = 6000, MAX_FRAME = 64 * 1024, REAUTH = 10 * 60 * 1000, PING = 30 * 1000;
const RATE = 20;   // Nachrichten pro Sekunde und Verbindung (Regler schickt höchstens ein paar pro Sekunde)

function createLive(opts = {}) {
    const secret = String(opts.secret ?? process.env.LIVE_SECRET ?? '');
    const backend = String(opts.backend ?? process.env.SITE_BACKEND ?? 'http://127.0.0.1:18080').replace(/\/+$/, '');
    const siteHost = String(opts.siteHost ?? process.env.SITE_HOST ?? '');
    const authFn = opts.auth || (async token => {
        const r = await fetch(backend + '/toyrelay.php?a=who', { method: 'POST', signal: AbortSignal.timeout(8000),
            headers: Object.assign({ 'Content-Type': 'application/json', 'X-GhostNode-Live': secret }, siteHost ? { Host: siteHost } : {}),
            body: JSON.stringify({ token, to: '0'.repeat(64) }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !/^[0-9a-f]{64}$/.test(String(d.box || ''))) throw new Error(d.error || 'Anmeldung abgelehnt (' + r.status + ')');
        return d.box;
    });
    const boxes = new Map();     // box → Set(conn)
    const queue = new Map();     // box → [{msg, exp}]
    const stats = { started: Date.now(), conns: 0, sent: 0, queued: 0 };

    // ---------- WebSocket (RFC 6455, nur was wir brauchen) ----------
    function frame(op, payload) {
        const p = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
        let h;
        if (p.length < 126) { h = Buffer.alloc(2); h[1] = p.length; }
        else if (p.length < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(p.length, 2); }
        else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(p.length), 2); }
        h[0] = 0x80 | op;
        return Buffer.concat([h, p]);
    }
    function attach(sock) {
        const c = { sock, box: '', buf: Buffer.alloc(0), frag: null, alive: true, authed: false, token: '', authAt: 0, rate: { s: 0, n: 0 } };
        c.send = o => { if (!sock.destroyed) sock.write(frame(1, JSON.stringify(o))); };
        c.close = (code = 1000, why = '') => { if (sock.destroyed) return; const b = Buffer.alloc(2 + Buffer.byteLength(why)); b.writeUInt16BE(code, 0); b.write(why, 2); sock.write(frame(8, b)); sock.end(); };
        stats.conns++;
        sock.on('data', d => {
            c.buf = Buffer.concat([c.buf, d]);
            if (c.buf.length > MAX_FRAME * 2) return c.close(1009, 'zu groß');
            for (;;) {
                if (c.buf.length < 2) return;
                const b0 = c.buf[0], b1 = c.buf[1], op = b0 & 15, fin = !!(b0 & 0x80), masked = !!(b1 & 0x80);
                let len = b1 & 127, off = 2;
                if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
                else if (len === 127) { if (c.buf.length < 10) return; const big = c.buf.readBigUInt64BE(2); if (big > BigInt(MAX_FRAME)) return c.close(1009, 'zu groß'); len = Number(big); off = 10; }
                if (!masked) return c.close(1002, 'unmaskiert');
                if (len > MAX_FRAME) return c.close(1009, 'zu groß');
                if (c.buf.length < off + 4 + len) return;
                const mask = c.buf.subarray(off, off + 4), p = Buffer.from(c.buf.subarray(off + 4, off + 4 + len));
                for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
                c.buf = c.buf.subarray(off + 4 + len);
                if (op === 8) { c.close(1000); return; }
                if (op === 9) { sock.write(frame(10, p)); continue; }
                if (op === 10) { c.alive = true; continue; }
                if (op === 0 && c.frag) { c.frag.push(p); if (fin) { const all = Buffer.concat(c.frag); c.frag = null; onText(c, all.toString('utf8')); } continue; }
                if (op === 1) { if (fin) onText(c, p.toString('utf8')); else c.frag = [p]; continue; }
                return c.close(1003, 'nur Text');
            }
        });
        const gone = () => { if (c.box && boxes.has(c.box)) { boxes.get(c.box).delete(c); if (!boxes.get(c.box).size) boxes.delete(c.box); } stats.conns--; c.box = ''; c.gone = true; };
        sock.on('close', gone); sock.on('error', () => sock.destroy());
        const hello = setTimeout(() => { if (!c.authed) c.close(4001, 'Anmeldung fehlt'); }, 15000); hello.unref?.();
        return c;
    }
    function deliver(box, msg) {
        const set = boxes.get(box);
        if (set && set.size) { for (const c of set) c.send({ t: 'msg', msg }); stats.sent++; return true; }
        const q = (queue.get(box) || []).filter(x => x.exp > Date.now());
        q.push({ msg, exp: Date.now() + TTL }); while (q.length > MAX_QUEUE) q.shift();
        queue.set(box, q); stats.queued++;
        return false;
    }
    async function onText(c, txt) {
        let m; try { m = JSON.parse(txt); } catch (e) { return c.send({ t: 'error', error: 'JSON erwartet' }); }
        const sec = Math.floor(Date.now() / 1000);
        if (c.rate.s !== sec) c.rate = { s: sec, n: 0 };
        if (++c.rate.n > RATE) return c.send({ t: 'error', error: 'Zu viele Nachrichten' });
        if (m.t === 'ping') return c.send({ t: 'pong', id: m.id });
        if (m.t === 'hello') {
            const token = String(m.token || '');
            if (!/^[0-9a-f]{64}$/.test(token)) return c.close(4003, 'Konto fehlt');
            try {
                const box = await authFn(token);
                if (c.gone) return;
                if (c.box && c.box !== box) { boxes.get(c.box)?.delete(c); }
                c.box = box; c.token = token; c.authed = true; c.authAt = Date.now();
                if (!boxes.has(box)) boxes.set(box, new Set());
                boxes.get(box).add(c);
                c.send({ t: 'ready', box });
                const q = (queue.get(box) || []).filter(x => x.exp > Date.now()); queue.delete(box);
                for (const x of q) c.send({ t: 'msg', msg: x.msg });
            } catch (e) { c.send({ t: 'error', error: String(e.message || e) }); c.close(4003, 'abgelehnt'); }
            return;
        }
        if (!c.authed) return c.send({ t: 'error', error: 'Erst anmelden (hello)' });
        if (m.t === 'send') {
            const to = String(m.to || '').toLowerCase(), msg = String(m.msg ?? '');
            if (!/^[0-9a-f]{64}$/.test(to)) return c.send({ t: 'error', id: m.id, error: 'Empfänger ungültig' });
            if (!msg || msg.length > MAX_LEN) return c.send({ t: 'error', id: m.id, error: 'Nachricht leer oder zu lang' });
            const live = deliver(to, msg);
            return c.send({ t: 'sent', id: m.id, live });
        }
        c.send({ t: 'error', error: 'Unbekannt' });
    }
    // Lebenszeichen + Freigabe regelmäßig neu prüfen
    const timer = setInterval(async () => {
        for (const set of boxes.values()) for (const c of set) {
            if (!c.alive) { c.sock.destroy(); continue; }
            c.alive = false; if (!c.sock.destroyed) c.sock.write(frame(9, ''));
            if (Date.now() - c.authAt > REAUTH) {
                c.authAt = Date.now();
                authFn(c.token).then(b => { if (b !== c.box) c.close(4003, 'Konto geändert'); }).catch(() => c.close(4003, 'Freigabe entzogen'));
            }
        }
        for (const [b, q] of queue) { const k = q.filter(x => x.exp > Date.now()); if (k.length) queue.set(b, k); else queue.delete(b); }
    }, PING);
    timer.unref?.();

    const server = http.createServer((req, res) => {
        const path = req.url.split('?')[0].replace(/^\/live/, '') || '/';
        if (path === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, service: 'ghostnode-live', conns: stats.conns, boxes: boxes.size, sent: stats.sent, queued: stats.queued, uptime_s: Math.round((Date.now() - stats.started) / 1000) })); }
        if (path === '/notify' && req.method === 'POST') {
            const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['x-forwarded-for'];
            const ok = local && secret.length >= 32 && crypto.timingSafeEqual(Buffer.from(sha(String(req.headers['x-ghostnode-live'] || ''))), Buffer.from(sha(secret)));
            if (!ok) { res.writeHead(403); return res.end(); }
            let b = ''; req.on('data', d => { b += d; if (b.length > 4096) req.destroy(); });
            req.on('end', () => {
                let o = {}; try { o = JSON.parse(b); } catch (e) { /* leer */ }
                const box = String(o.box || ''), kind = String(o.kind || '').slice(0, 30);
                if (!/^[0-9a-f]{64}$/.test(box) || !/^[a-z_]+$/.test(kind)) { res.writeHead(400); return res.end(); }
                let n = 0; for (const c of boxes.get(box) || []) { c.send({ t: 'notify', kind }); n++; }
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, delivered: n }));
            });
            return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('GhostNode Live – WebSocket unter /live/ws');
    });
    server.on('upgrade', (req, sock) => {
        const path = req.url.split('?')[0].replace(/^\/live/, '');
        const key = String(req.headers['sec-websocket-key'] || '');
        if (path !== '/ws' || String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
        const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
        sock.setNoDelay(true);
        attach(sock);
    });
    server.on('close', () => clearInterval(timer));
    return { server, stats, boxes, queue, deliver };
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

module.exports = { createLive };

if (require.main === module) {
    const port = Number(process.env.PORT) || 18093, host = process.env.HOST || '127.0.0.1';
    if (String(process.env.LIVE_SECRET || '').length < 32) console.warn('⚠ LIVE_SECRET fehlt oder ist zu kurz – Anmeldung bei der Webseite und /notify gehen nicht.');
    const { server } = createLive();
    server.listen(port, host, () => console.log(new Date().toISOString(), 'GhostNode Live auf', host + ':' + port));
}
