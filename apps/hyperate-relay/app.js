'use strict';
/*
 * VRC Nexus – HypeRate-Weiterleitung (läuft auf dem eigenen Server, z. B. Plesk → Node.js).
 *
 * HypeRate verlangt, dass der API-Schlüssel beim Projekt bleibt. Darum spricht die App nicht selbst mit HypeRate:
 *   App  ──GET /hr/<Device-ID> (Server-Sent Events)──▶  dieser Dienst  ──WebSocket mit Schlüssel──▶  HypeRate
 * Der Schlüssel steht nur in der Umgebungsvariable HYPERATE_API_KEY auf dem Server – nie im Repo, nie in der App.
 *
 * Ohne Abhängigkeiten (Node ≥ 22: eingebauter WebSocket-Client). Start: node app.js (Plesk/Passenger setzt PORT).
 * Umgebungsvariablen:
 *   HYPERATE_API_KEY    Pflicht – Schlüssel von HypeRate
 *   RELAY_PER_IP        gleichzeitige Verbindungen je IP (Standard 4)
 *   RELAY_MAX_CHANNELS  verschiedene Device-IDs gleichzeitig (Standard 300)
 *   HYPERATE_WS         nur für Tests: anderer HypeRate-Server
 */
const http = require('http');

const KEY = String(process.env.HYPERATE_API_KEY || '').trim();
const UP = String(process.env.HYPERATE_WS || 'wss://app.hyperate.io').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || process.env.SERVER_PORT) || 3000;   // SERVER_PORT = Pterodactyl
const HOST = process.env.HOST || undefined;   // z. B. 127.0.0.1 hinter einem Reverse-Proxy (ghostnode-root.sh); leer = alle Adressen (Plesk/Passenger)
const LIM = { perIp: Number(process.env.RELAY_PER_IP) || 4, channels: Number(process.env.RELAY_MAX_CHANNELS) || 300 };
const ID = /^[A-Za-z0-9_-]{2,40}$/;
const GRACE = 30000;          // Kanal nach dem letzten Zuhörer noch so lange offen halten (App-Neustart, Wechsel)

const chans = new Map();      // Device-ID → { clients: Set<res>, last: { hr, at } | null, joined: bool, error: '', leaveT }
const perIp = new Map();      // IP → Anzahl offener Verbindungen
let ws = null, ref = 0, hbT = null, retryT = null, backoff = 1000, state = KEY ? 'down' : 'no_key';

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------- Verbindung zu HypeRate (ein WebSocket, ein Phoenix-Kanal je Device-ID) ----------------
function upSend(topic, event) {
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ topic, event, payload: {}, ref: String(++ref) })); return true; } catch (e) { /* zu */ } }
    return false;
}
function upstream() {
    if (ws || !KEY || !chans.size) return;
    clearTimeout(retryT); retryT = null;
    state = 'connecting';
    let sock;
    try { sock = new WebSocket(UP + '/socket/websocket?token=' + encodeURIComponent(KEY)); } catch (e) { return retry(); }
    ws = sock;
    sock.onopen = () => {
        state = 'up'; backoff = 1000;
        for (const [id, c] of chans) { c.joined = upSend('hr:' + id, 'phx_join'); c.error = ''; }
        clearInterval(hbT); hbT = setInterval(() => upSend('phoenix', 'heartbeat'), 25000);
        log('HypeRate verbunden,', chans.size, 'Kanal/Kanäle');
    };
    sock.onmessage = ev => {
        let m; try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
        const id = typeof m.topic === 'string' && m.topic.startsWith('hr:') ? m.topic.slice(3) : '';
        const c = id && chans.get(id);
        if (!c) return;
        if (m.event === 'hr_update' && m.payload && Number.isFinite(Number(m.payload.hr))) {
            c.last = { hr: Math.round(Number(m.payload.hr)), at: Date.now() };
            emit(c, { hr: c.last.hr, at: c.last.at });
        } else if (m.event === 'phx_reply' && m.payload && m.payload.status === 'error') {
            c.error = 'join_rejected'; emit(c, { error: c.error });
        }
    };
    sock.onerror = () => { /* onclose folgt */ };
    sock.onclose = () => {
        if (ws !== sock) return;
        ws = null; clearInterval(hbT); hbT = null;
        for (const c of chans.values()) c.joined = false;
        state = 'down';
        retry();
    };
}
function retry() {
    ws = null;
    if (!chans.size || retryT) return;
    retryT = setTimeout(() => { retryT = null; upstream(); }, backoff);
    backoff = Math.min(backoff * 2, 60000);
}
function emit(c, obj) { const line = 'data: ' + JSON.stringify(obj) + '\n\n'; for (const r of c.clients) { try { r.write(line); } catch (e) { /* weg */ } } }

function subscribe(id, res) {
    let c = chans.get(id);
    if (!c) { c = { clients: new Set(), last: null, joined: false, error: '', leaveT: null }; chans.set(id, c); if (ws && ws.readyState === 1) c.joined = upSend('hr:' + id, 'phx_join'); else upstream(); }
    clearTimeout(c.leaveT); c.leaveT = null;
    c.clients.add(res);
    if (c.last && Date.now() - c.last.at < 60000) res.write('data: ' + JSON.stringify({ hr: c.last.hr, at: c.last.at }) + '\n\n');
    if (c.error) res.write('data: ' + JSON.stringify({ error: c.error }) + '\n\n');
    return c;
}
function unsubscribe(id, res) {
    const c = chans.get(id);
    if (!c) return;
    c.clients.delete(res);
    if (c.clients.size) return;
    c.leaveT = setTimeout(() => {
        if (c.clients.size) return;
        chans.delete(id);
        upSend('hr:' + id, 'phx_leave');
        if (!chans.size && ws) { const w = ws; ws = null; clearInterval(hbT); hbT = null; state = 'idle'; try { w.close(); } catch (e) { /* egal */ } }
    }, GRACE);
    if (c.leaveT.unref) c.leaveT.unref();
}

// ---------------- HTTP: /hr/<ID> (Server-Sent Events) und /health ----------------
const clientIp = req => String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');                       // Android-App (WebView) braucht das
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Cache-Control');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    const path = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '');
    if (path === '' || path === '/health') {
        let clients = 0; for (const c of chans.values()) clients += c.clients.size;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ ok: !!KEY, service: 'vrc-nexus-hyperate-relay', upstream: state, channels: chans.size, clients }));
    }
    const m = /^\/hr\/([^/]+)$/.exec(path);
    if (!m) { res.writeHead(404); return res.end(); }
    const id = decodeURIComponent(m[1]).replace(/^.*hyperate\.io\//i, '');
    const fail = (code, error) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error })); };
    if (!ID.test(id)) return fail(400, 'bad_id');
    if (!KEY) return fail(503, 'relay_no_key');
    const ip = clientIp(req);
    if ((perIp.get(ip) || 0) >= LIM.perIp) return fail(429, 'too_many_connections');
    if (!chans.has(id) && chans.size >= LIM.channels) return fail(503, 'relay_full');

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 5000\n: ok\n\n');
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    subscribe(id, res);
    const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch (e) { /* weg */ } }, 20000);
    let done = false;
    const end = () => {
        if (done) return; done = true;
        clearInterval(ka);
        const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
        unsubscribe(id, res);
    };
    req.on('close', end); res.on('close', end); res.on('error', end);
});
server.requestTimeout = 0;            // Streams laufen lange
server.headersTimeout = 15000;
server.keepAliveTimeout = 65000;

// Plesk/Passenger lädt app.js über einen eigenen Lader (require.main ist dann nicht dieses Modul) – darum immer starten, außer im Test
if (process.env.RELAY_NO_AUTOSTART !== '1') {
    if (typeof WebSocket === 'undefined') { console.error('Node ≥ 22 nötig (eingebauter WebSocket).'); process.exit(1); }
    const onUp = () => log('HypeRate-Weiterleitung auf', (HOST || '*') + ':' + PORT, KEY ? '' : '– ⚠ HYPERATE_API_KEY fehlt');
    if (HOST) server.listen(PORT, HOST, onUp); else server.listen(PORT, onUp);   // ohne HOST genau wie bisher (Passenger)
}
module.exports = { server, chans, state: () => state };
