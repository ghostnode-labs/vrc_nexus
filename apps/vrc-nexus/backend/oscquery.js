'use strict';
/*
 * OSCQuery (offenes Protokoll von Vidvox; von VRChat seit 2023 genutzt) – eigene, abhängigkeitsfreie Umsetzung:
 *  - Nexus meldet sich per mDNS (_oscjson._tcp / _osc._udp) und einem kleinen HTTP-Dienst an. VRChat schickt OSC dann
 *    zusätzlich an Nexus' eigenen, freien Port – so laufen VRCFury Haptics, OscGoesBrrr & Co. gleichzeitig (kein „Port 9001 belegt“).
 *  - Nexus findet VRChat selbst („VRChat-Client-…“), liest dessen Eingangs-Port und den Parameter-Baum des aktuellen
 *    Avatars (Name, Typ, Wert) – Grundlage für typrichtiges Senden und die SPS/OGB/PCS-Erkennung.
 * mDNS-Nachrichten werden von Hand kodiert (RFC 6762/1035, nur PTR/SRV/TXT/A).
 */
const dgram = require('dgram');
const os = require('os');
const http = require('http');
const { str, int } = require('./util');

const MDNS = { host: '224.0.0.251', port: 5353 };
const T = { A: 1, PTR: 12, TXT: 16, SRV: 33, ANY: 255 };

// ---------- DNS kodieren / lesen ----------
function encName(name) {
    const parts = str(name).replace(/\.$/, '').split('.');
    return Buffer.concat(parts.map(p => { const b = Buffer.from(p, 'utf8'); return Buffer.concat([Buffer.from([b.length]), b]); }).concat([Buffer.from([0])]));
}
function readName(buf, pos, depth = 0) {
    const labels = [];
    let jumped = false, end = pos;
    while (pos < buf.length && depth < 20) {
        const len = buf[pos];
        if (len === 0) { pos++; break; }
        if ((len & 0xc0) === 0xc0) { const ptr = ((len & 0x3f) << 8) | buf[pos + 1]; if (!jumped) end = pos + 2; jumped = true; pos = ptr; depth++; continue; }
        labels.push(buf.toString('utf8', pos + 1, pos + 1 + len)); pos += 1 + len;
    }
    return [labels.join('.'), jumped ? end : pos];
}
function rr(name, type, data, ttl = 120, cls = 1) {
    const h = Buffer.alloc(10); h.writeUInt16BE(type, 0); h.writeUInt16BE(cls, 2); h.writeUInt32BE(ttl, 4); h.writeUInt16BE(data.length, 8);
    return Buffer.concat([encName(name), h, data]);
}
function encodeMsg({ id = 0, response = false, questions = [], answers = [] }) {
    const head = Buffer.alloc(12);
    head.writeUInt16BE(id, 0); head.writeUInt16BE(response ? 0x8400 : 0, 2); head.writeUInt16BE(questions.length, 4); head.writeUInt16BE(answers.length, 6);
    const qs = questions.map(q => { const t = Buffer.alloc(4); t.writeUInt16BE(q.type, 0); t.writeUInt16BE(1, 2); return Buffer.concat([encName(q.name), t]); });
    const as = answers.map(a => {
        let data;
        if (a.type === T.PTR) data = encName(a.data);
        else if (a.type === T.SRV) { const d = Buffer.alloc(6); d.writeUInt16BE(0, 0); d.writeUInt16BE(0, 2); d.writeUInt16BE(a.port, 4); data = Buffer.concat([d, encName(a.target)]); }
        else if (a.type === T.TXT) data = Buffer.concat((a.txt && a.txt.length ? a.txt : ['']).map(t => { const b = Buffer.from(t); return Buffer.concat([Buffer.from([b.length]), b]); }));
        else if (a.type === T.A) data = Buffer.from(str(a.ip).split('.').map(Number));
        return rr(a.name, a.type, data, a.ttl === undefined ? 120 : a.ttl, a.flush ? 0x8001 : 1);
    });
    return Buffer.concat([head, ...qs, ...as]);
}
function decodeMsg(buf) {
    const flags = buf.readUInt16BE(2), qd = buf.readUInt16BE(4), an = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10);
    let pos = 12;
    const questions = [], answers = [];
    for (let i = 0; i < qd; i++) { let n; [n, pos] = readName(buf, pos); questions.push({ name: n, type: buf.readUInt16BE(pos), qu: !!(buf.readUInt16BE(pos + 2) & 0x8000) }); pos += 4; }
    for (let i = 0; i < an && pos < buf.length; i++) {
        let n; [n, pos] = readName(buf, pos);
        const type = buf.readUInt16BE(pos), len = buf.readUInt16BE(pos + 8); pos += 10;
        const d = buf.subarray(pos, pos + len), a = { name: n, type };
        if (type === T.PTR) a.data = readName(buf, pos)[0];
        else if (type === T.SRV) { a.port = d.readUInt16BE(4); a.target = readName(buf, pos + 6)[0]; }
        else if (type === T.TXT) { a.txt = []; let p = 0; while (p < d.length) { const l = d[p]; a.txt.push(d.toString('utf8', p + 1, p + 1 + l)); p += 1 + l; } }
        else if (type === T.A && len === 4) a.ip = [...d].join('.');
        answers.push(a); pos += len;
    }
    return { id: buf.readUInt16BE(0), response: !!(flags & 0x8000), questions, answers };
}

// ---------- mDNS-Transport (austauschbar für Tests) ----------
class MdnsSocket {
    constructor() { this.handlers = new Set(); this.sock = null; this.error = ''; }
    /** alle IPv4-Adressen dieses Rechners (inkl. 127.0.0.1) */
    static addrs() {
        const out = [];
        try { for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if (a.family === 'IPv4' || a.family === 4) out.push(a.address); } catch (e) { /* egal */ }
        return out.length ? out : ['127.0.0.1'];
    }
    start() {
        if (this.sock) return;
        const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        s.on('error', e => { this.error = 'mDNS: ' + e.message; });
        s.on('message', (msg, rinfo) => { let m; try { m = decodeMsg(msg); } catch (e) { return; } for (const h of this.handlers) { try { h(m, rinfo); } catch (e) { /* egal */ } } });
        s.bind(MDNS.port, () => {
            // 4.2.1: der Gruppe auf jedem Netz beitreten – sonst sieht man VRChat (und VRChat Nexus) nur auf dem Standard-Netz
            let joined = 0;
            for (const a of MdnsSocket.addrs()) { try { s.addMembership(MDNS.host, a); joined++; } catch (e) { /* schon beigetreten o. Ä. */ } }
            if (!joined) { try { s.addMembership(MDNS.host); joined++; } catch (e) { this.error = 'mDNS: ' + e.message; } }
            try { s.setMulticastTTL(255); s.setMulticastLoopback(true); } catch (e) { /* egal */ }
            if (this.onReady) this.onReady();
        });
        s.unref();
        this.sock = s;
    }
    /** an die Gruppe senden – oder direkt an den Fragenden (Unicast), wenn to angegeben ist */
    send(msg, to) {
        if (!this.sock) return;
        const b = encodeMsg(msg);
        try { if (to) this.sock.send(b, to.port, to.address, () => {}); else this.sock.send(b, MDNS.port, MDNS.host, () => {}); } catch (e) { /* Socket noch nicht bereit */ }
    }
    on(h) { this.handlers.add(h); }
    stop() { try { if (this.sock) this.sock.close(); } catch (e) { /* egal */ } this.sock = null; }
}

const svc = (type) => type + '.local';
const OSCJSON = '_oscjson._tcp', OSCUDP = '_osc._udp';

class OscQuery {
    /** opts: { name, transport, fetch, host } */
    constructor(opts = {}) {
        this.name = opts.name || 'VRC-Nexus-' + Math.random().toString(36).slice(2, 7).toUpperCase();
        this.mdns = opts.transport || new MdnsSocket();
        this.fetch = opts.fetch || ((u) => fetch(u, { signal: AbortSignal.timeout(3000) }).then(r => r.json()));
        this.ip = opts.host || '127.0.0.1';
        this.udpPort = 0; this.httpPort = 0; this.server = null; this.advertising = false;
        this.vrchat = null;            // { name, ip, http, osc_port, at }
        this.tree = null; this.params = {}; this.treeAt = 0; this.avatarId = '';
        this.onParams = null;
        this.mdns.on((m, rinfo) => this.onMdns(m, rinfo));
        this.found = {};               // Instanzname → { http, target, ip }
    }
    hostName() { return this.name.toLowerCase() + '.local'; }
    records() {
        const inst = n => this.name + '.' + svc(n);
        return [
            { name: svc(OSCJSON), type: T.PTR, data: inst(OSCJSON) }, { name: inst(OSCJSON), type: T.SRV, port: this.httpPort, target: this.hostName(), flush: true },
            { name: inst(OSCJSON), type: T.TXT, txt: ['txtvers=1'], flush: true },
            { name: svc(OSCUDP), type: T.PTR, data: inst(OSCUDP) }, { name: inst(OSCUDP), type: T.SRV, port: this.udpPort, target: this.hostName(), flush: true },
            { name: inst(OSCUDP), type: T.TXT, txt: ['txtvers=1'], flush: true },
            { name: this.hostName(), type: T.A, ip: this.ip, flush: true },
        ];
    }
    /** OSCQuery-Baum: Nexus möchte alles unter /avatar und /tracking empfangen */
    treeJson() {
        const node = (p, c, extra) => Object.assign({ FULL_PATH: p, ACCESS: 2, DESCRIPTION: '' }, extra || {}, c ? { CONTENTS: c } : {});
        return node('/', { avatar: node('/avatar', { change: node('/avatar/change', null, { TYPE: 's' }), parameters: node('/avatar/parameters') }), tracking: node('/tracking') }, { ACCESS: 0, DESCRIPTION: 'VRC Nexus' });
    }
    hostInfo() { return { NAME: this.name, EXTENSIONS: { ACCESS: true, CLIPMODE: false, RANGE: true, TYPE: true, VALUE: true }, OSC_IP: this.ip, OSC_PORT: this.udpPort, OSC_TRANSPORT: 'UDP' }; }
    /** Dienst starten: HTTP auf freiem Port, dann per mDNS anmelden */
    async advertise(udpPort) {
        this.udpPort = udpPort;
        if (!this.server) {
            this.server = http.createServer((req, res) => {
                const u = new URL(req.url, 'http://x');
                const body = u.search.includes('HOST_INFO') ? this.hostInfo() : this.subtree(u.pathname);
                if (!body) { res.writeHead(404); return res.end(); }
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
            });
            await new Promise((res, rej) => { this.server.once('error', rej); this.server.listen(0, this.ip, res); });
            this.server.unref();
            this.httpPort = this.server.address().port;
        }
        this.mdns.onReady = () => { this.announce(); this.discover(); };
        this.mdns.start();
        this.advertising = true;
        this.announce();
        [1000, 3000, 8000].forEach(ms => { const t = setTimeout(() => this.announce(), ms); if (t.unref) t.unref(); });
        clearInterval(this.annT); this.annT = setInterval(() => this.announce(), 60000); if (this.annT.unref) this.annT.unref();
        return { http: this.httpPort, udp: this.udpPort };
    }
    subtree(p) {
        let n = this.treeJson();
        for (const part of p.split('/').filter(Boolean)) { n = n.CONTENTS && n.CONTENTS[part]; if (!n) return null; }
        return n;
    }
    announce() { if (this.advertising) this.mdns.send({ response: true, answers: this.records() }); }
    /** VRChat suchen */
    discover() { this.mdns.start(); this.mdns.send({ questions: [{ name: svc(OSCJSON), type: T.PTR }, { name: svc(OSCUDP), type: T.PTR }] }); }
    onMdns(m, rinfo) {
        // Fragen beantworten
        if (!m.response && this.advertising) {
            const mine = this.records(), ans = [];
            for (const q of m.questions) for (const r of mine) if (r.name.toLowerCase() === q.name.toLowerCase() && (q.type === r.type || q.type === T.ANY)) ans.push(r);
            if (ans.length) {   // zur PTR-Antwort die Details dazu (spart Rückfragen)
                const extra = mine.filter(r => !ans.includes(r) && ans.some(a => a.type === T.PTR && (r.name === a.data || r.name === this.hostName())));
                const all = ans.concat(extra), legacy = !!(rinfo && rinfo.port && rinfo.port !== MDNS.port);
                if (legacy) this.mdns.send({ id: m.id || 0, response: true, questions: m.questions, answers: all }, rinfo);
                else { if (rinfo && m.questions.some(q => q.qu)) this.mdns.send({ response: true, answers: all }, rinfo); this.mdns.send({ response: true, answers: all }); }
            }
            return;
        }
        if (!m.response) return;
        // Antworten auswerten: VRChat-Client finden
        const recs = m.answers;
        for (const a of recs) {
            if (a.type === T.PTR && /_oscjson\._tcp\.local$/i.test(a.name)) { const inst = a.data; if (!/^vrchat-client/i.test(inst)) continue; this.found[inst] = this.found[inst] || {}; }
            if (a.type === T.SRV && /^vrchat-client.*_oscjson\._tcp\.local$/i.test(a.name)) { const f = this.found[a.name] = this.found[a.name] || {}; f.http = a.port; f.target = a.target; }
        }
        for (const a of recs) if (a.type === T.A) for (const f of Object.values(this.found)) if (f.target && f.target.toLowerCase() === a.name.toLowerCase()) f.ip = a.ip;
        for (const [inst, f] of Object.entries(this.found)) if (f.http && (!this.vrchat || this.vrchat.http !== f.http)) this.connectVrchat(inst, f.ip || (rinfo && rinfo.address) || '127.0.0.1', f.http).catch(() => {});
    }
    /** VRChat-Dienst gefunden: Eingangs-Port und Avatar-Parameter lesen */
    async connectVrchat(inst, ip, httpPort) {
        const base = 'http://' + ip + ':' + httpPort;
        const info = await this.fetch(base + '/?HOST_INFO');
        this.vrchat = { name: str(info.NAME || inst.split('.')[0]), ip: str(info.OSC_IP || ip), http: httpPort, osc_port: int(info.OSC_PORT), at: Date.now(), base };
        await this.refreshParams();
        return this.vrchat;
    }
    /** Parameter-Baum des aktuellen Avatars holen → { Name: { type: 'bool'|'int'|'float', value } } */
    async refreshParams() {
        if (!this.vrchat) return {};
        // 4.2.1: ganzen /avatar-Zweig holen – darin steht unter /avatar/change auch die ID des getragenen Avatars
        const t = await this.fetch(this.vrchat.base + '/avatar');
        const out = {};
        const ch = t && t.CONTENTS && t.CONTENTS.change;
        const cid = ch ? str(Array.isArray(ch.VALUE) ? ch.VALUE[0] : ch.VALUE) : '';
        if (/^avtr_[0-9a-f-]{36}$/i.test(cid)) this.avatarId = cid;
        const walk = n => {
            if (!n || typeof n !== 'object') return;
            if (n.TYPE && n.FULL_PATH && n.FULL_PATH.startsWith('/avatar/parameters/')) {
                const ty = String(n.TYPE)[0];
                out[n.FULL_PATH.slice(19)] = { type: ty === 'T' || ty === 'F' ? 'bool' : ty === 'i' ? 'int' : ty === 'f' ? 'float' : 'other', value: Array.isArray(n.VALUE) ? n.VALUE[0] : n.VALUE };
            }
            for (const c of Object.values(n.CONTENTS || {})) walk(c);
        };
        walk(t);
        this.params = out; this.treeAt = Date.now();
        if (this.onParams) this.onParams(out);
        return out;
    }
    status() {
        return { name: this.name, advertising: this.advertising, http: this.httpPort, udp: this.udpPort, mdns_error: this.mdns.error || '',
            vrchat: this.vrchat ? { name: this.vrchat.name, osc_port: this.vrchat.osc_port, ip: this.vrchat.ip, http: this.vrchat.http, params: Object.keys(this.params).length, at: this.treeAt, avatar: this.avatarId } : null };
    }
    stop() { clearInterval(this.annT); this.advertising = false; try { if (this.server) this.server.close(); } catch (e) { /* egal */ } this.server = null; this.mdns.stop(); }
}

module.exports = { OscQuery, MdnsSocket, encodeMsg, decodeMsg, T };
