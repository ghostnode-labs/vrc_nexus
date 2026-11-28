'use strict';
/*
 * VRC Nexus 🔞 – zweites Stream-Deck-Plugin (ohne Fremdpakete, nur über die GhostNode-Webseite erhältlich).
 * Gleicher Weg und gleicher Zugangsschlüssel wie das Plugin „VRC Nexus“: lokale Schnittstelle http://127.0.0.1:<Port>/api/adult (Kopf X-Nexus-Token).
 * Die App entscheidet bei JEDER Anfrage, ob 🔞 erlaubt ist (Verified 18+, NSFW an, Recht „🔞 Stream Deck“). Panik, Stopp, Safeword und Ampel-Rot gehen immer.
 * Start durch Stream Deck:  node plugin.js -port 12345 -pluginUUID … -registerEvent registerPlugin -info {…}
 */
const http = require('http');
const crypto = require('crypto');

const PREFIX = 'de.ghostnode.vrcnexus.adult.';
const SAFE = ['panic', 'stop', 'safeword'];
const LIGHT = { green: ['#3ddc84', 'Grün'], yellow: ['#ffb84c', 'Gelb'], red: ['#ff5555', 'Rot'] };
/** Tastentexte: normal / diskret (neutrale Wörter, keine 🔞-Begriffe) */
const LABEL = {
    panic: ['🚨\nPanik', 'Notaus'], stop: ['⏹\nStopp', 'Stopp'], safeword: ['🛑\nSafeword', 'Pause'], surprise: ['🎁\nÜberraschung', 'Zufall'],
    fade: ['🌅\nAusklingen', 'Leiser'], private: ['Privat', 'Privat'], follow: ['Avatar\nfolgt', 'Folgen'], scene: ['Szene', 'Ablauf'], pattern: ['Muster', 'Modus'],
    level: ['Stärke', 'Stufe'], meter: ['Lust', 'Meter'], consent: ['Ampel', 'Ampel'], dial: ['Stärke', 'Stufe'],
};

// ---------------- kleiner WebSocket-Client (RFC 6455, nur Text) – Rückfall, wenn Node keinen globalen WebSocket hat ----------------
class MiniWs {
    constructor(url) {
        this.handlers = {};
        const u = new URL(url);
        const req = http.request({ host: u.hostname, port: u.port, path: u.pathname || '/', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') } });
        req.on('upgrade', (res, sock, head) => {
            this.sock = sock; this.buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
            sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
            sock.on('close', () => this.emit('close')); sock.on('error', () => this.emit('close'));
            this.emit('open');
            if (this.buf.length) this.parse();
        });
        req.on('error', e => this.emit('close', e));
        req.end();
    }
    on(ev, fn) { this.handlers[ev] = fn; }
    emit(ev, x) { if (this.handlers[ev]) this.handlers[ev](x); }
    parse() {
        while (this.buf.length >= 2) {
            const op = this.buf[0] & 0x0f, masked = this.buf[1] & 0x80;
            let len = this.buf[1] & 0x7f, p = 2;
            if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); p = 4; }
            else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); p = 10; }
            const mk = masked ? this.buf.slice(p, p + 4) : null;
            if (masked) p += 4;
            if (this.buf.length < p + len) return;
            let data = this.buf.slice(p, p + len);
            if (mk) data = Buffer.from(data.map((b, i) => b ^ mk[i % 4]));
            this.buf = this.buf.slice(p + len);
            if (op === 1) this.emit('message', data.toString('utf8'));
            else if (op === 9) this.frame(10, data);
            else if (op === 8) { try { this.sock.end(); } catch (e) { /* egal */ } }
        }
    }
    frame(op, payload) {
        const len = payload.length;
        const head = len < 126 ? Buffer.from([0x80 | op, 0x80 | len]) : len < 65536 ? Buffer.from([0x80 | op, 0x80 | 126, len >> 8, len & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 0x80 | 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
        const mask = crypto.randomBytes(4);
        this.sock.write(Buffer.concat([head, mask, Buffer.from(payload.map((b, i) => b ^ mask[i % 4]))]));
    }
    send(text) { if (this.sock) this.frame(1, Buffer.from(text, 'utf8')); }
}

// ---------------- Argumente / Zustand ----------------
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^-+/, '')] = process.argv[i + 1];
const PORT = args.port, UUID = args.pluginUUID, REGISTER = args.registerEvent || 'registerPlugin';

let ws = null, pollTimer = null, lastState = null, lastError = '';
let globals = { port: 17865, token: '', discreet: false };
const contexts = new Map();                   // context → { action, settings, controller, img, fb }

function send(event, context, payload) { if (ws) ws.send(JSON.stringify(Object.assign({ event, context }, payload !== undefined ? { payload } : {}))); }
const setTitle = (ctx, t) => { const c = contexts.get(ctx); if (c && c.title === t) return; if (c) c.title = t; send('setTitle', ctx, { title: String(t), target: 0 }); };
const setState = (ctx, st) => { const c = contexts.get(ctx); if (c && c.state === st) return; if (c) c.state = st; send('setState', ctx, { state: st }); };
const kindOf = action => String(action || '').slice(PREFIX.length);
const lbl = k => (LABEL[k] || [k, k])[globals.discreet ? 1 : 0];

/** Anfrage an VRC Nexus (gleicher Schlüssel wie das erste Plugin) */
async function nexus(method, path, body) {
    if (!globals.token) throw new Error('Kein Zugangsschlüssel – in den Tasten-Einstellungen eintragen (derselbe wie im Plugin „VRC Nexus“).');
    const res = await fetch('http://127.0.0.1:' + (Number(globals.port) || 17865) + '/api/' + path, {
        method, headers: { 'X-Nexus-Token': globals.token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
    }).catch(() => { throw new Error('VRC Nexus läuft nicht oder die lokale Schnittstelle ist aus (Werkzeuge → Stream Deck).'); });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Fehler ' + res.status); e.status = res.status; e.locked = !!data.locked; throw e; }
    return data;
}
const op = (o, extra) => nexus('POST', 'adult', Object.assign({ op: o }, extra || {}));

// ---------------- Anzeige ----------------
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
/** Ampel-Taste: aktuelle Farbe groß (SVG) */
function consentSvg(light, locked) {
    const [col] = LIGHT[light] || ['#6b7280'];
    const dot = (y, k) => '<circle cx="72" cy="' + y + '" r="' + (k === light ? 19 : 13) + '" fill="' + (LIGHT[k][0]) + '" opacity="' + (locked ? 0.25 : k === light ? 1 : 0.22) + '"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="#0c0812"/>'
        + '<rect x="46" y="10" width="52" height="124" rx="24" fill="none" stroke="' + (locked ? '#555' : col) + '" stroke-width="5"/>' + dot(36, 'red') + dot(72, 'yellow') + dot(108, 'green') + '</svg>';
}
function setSvg(ctx, svg) {
    const c = contexts.get(ctx);
    if (!c || c.img === svg) return;
    c.img = svg;
    send('setImage', ctx, { image: svg ? 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') : null, target: 0 });
}
function lockedTitle(k) { return SAFE.includes(k) ? lbl(k) : globals.discreet ? '🔒' : '🔒\ngesperrt'; }

function render(ctx) {
    const c = contexts.get(ctx);
    if (!c) return;
    const k = kindOf(c.action), s = c.settings || {}, st = lastState;
    if (k === 'infobar') return infobar(ctx, s, st);
    if (k === 'dial') return dialFeedback(ctx, st);
    if (!st) { setTitle(ctx, SAFE.includes(k) ? lbl(k) : '–'); if (k === 'consent') setSvg(ctx, consentSvg('', true)); return; }
    if (st.locked) {                           // 18+ aus / nicht erlaubt: keine 🔞-Daten, nur „gesperrt“ (Sicherheits-Tasten bleiben benutzbar)
        if (k === 'consent') { setSvg(ctx, consentSvg('red', true)); setTitle(ctx, globals.discreet ? '' : 'nur Rot'); return; }
        setState(ctx, 0); setTitle(ctx, lockedTitle(k)); return;
    }
    const title = t => { if (!s.title) setTitle(ctx, t); };
    switch (k) {
        case 'panic': case 'stop': case 'safeword': case 'surprise': case 'fade': title(lbl(k)); break;
        case 'consent': setSvg(ctx, consentSvg(st.consent, false)); title(globals.discreet ? '' : LIGHT[st.consent] ? LIGHT[st.consent][1] : ''); break;
        case 'level': {
            const m = s.mode || 'set';
            title(m === 'up' ? '＋' + (Number(s.step) || 10) + '\n' + st.set_level + ' %' : m === 'down' ? '－' + (Number(s.step) || 10) + '\n' + st.set_level + ' %' : lbl('level') + '\n' + levelOf(s) + ' %');
            break;
        }
        case 'meter': {
            const show = s.show || 'lust';
            const lust = st.lust ? st.lust.v : 0;
            title(show === 'level' ? lbl('level') + '\n' + st.level + ' %' : show === 'both' ? lust + ' % / ' + st.level + ' %' + (globals.discreet ? '' : '\nLust / Stärke') : lbl('meter') + '\n' + lust + ' %' + (st.lust && st.lust.edging && !globals.discreet ? '\nEdging' : ''));
            break;
        }
        case 'pattern': {
            const on = !!(st.pattern && st.pattern.id === s.id);
            setState(ctx, on ? 1 : 0);
            const p = (st.patterns || []).find(x => x.id === s.id);
            title(globals.discreet ? lbl('pattern') + (on ? '\n▶' : '') : (p ? wrapKey(p.name.replace(/^\W+\s*/u, ''), 9, 2) : s.id ? 'Muster\nfehlt' : 'Muster') + (on && st.pattern.left ? '\n' + st.pattern.left + ' s' : ''));
            break;
        }
        case 'private': setState(ctx, st.private ? 1 : 0); title(lbl('private') + '\n' + (st.private ? 'an' : 'aus')); break;
        case 'follow': setState(ctx, st.follow ? 1 : 0); title(lbl('follow') + '\n' + (st.follow ? 'an' : 'aus')); break;
        case 'scene': {
            setState(ctx, st.scene ? 1 : 0);
            const sc = (st.scenes || []).find(x => x.id === s.id);
            title(st.scene ? (globals.discreet ? lbl('scene') : wrapKey(st.scene.name, 9, 1)) + '\n' + Math.ceil(st.scene.left / 60) + ' min' : (s.mode === 'stop' ? '⏹ ' : '') + (globals.discreet ? lbl('scene') : sc ? wrapKey(sc.name, 9, 2) : s.name ? wrapKey(s.name, 9, 2) : lbl('scene')));
            break;
        }
    }
}
/** Stream Deck +: Regler-Anzeige (Layout $B1) */
function dialFeedback(ctx, st) {
    const c = contexts.get(ctx);
    if (!c || c.controller !== 'Encoder') return;
    const locked = !st || st.locked, v = locked ? 0 : st.level;
    const key = locked + '|' + v + '|' + globals.discreet;
    if (c.fb === key) return;
    c.fb = key;
    send('setFeedback', ctx, { title: lbl('dial'), value: locked ? (st ? '🔒' : '–') : v + ' %', indicator: { value: v } });
}
/** 1.0: Stream Deck Neo – Infoleiste (232 × 50 px, nur Anzeige): Stärke-Balken, Ampel-Punkt, optional Lust-Meter */
function infobarView(s, st, discreet) {
    if (!st) return { line1: 'VRC Nexus', line2: lastError ? lastError.slice(0, 60) : 'verbindet …', lvl: 0, light: '' };
    if (st.locked) return { line1: discreet ? 'VRC Nexus' : 'VRC Nexus 🔞', line2: discreet ? '🔒' : '🔒 gesperrt', lvl: 0, light: '' };
    const lust = st.lust ? st.lust.v : 0;
    const l1 = (discreet ? 'Stufe ' : 'Stärke ') + st.level + ' %' + (st.pattern && !discreet ? ' · ' + st.pattern.name.replace(/^\W+\s*/u, '') : '');
    const parts = [];
    if (s.lust !== false && st.lust) parts.push((discreet ? 'Meter ' : 'Lust ') + lust + ' %');
    if (st.scene) parts.push((discreet ? 'Ablauf ' : 'Szene ') + Math.ceil(st.scene.left / 60) + ' min');
    if (st.private) parts.push(discreet ? 'P' : 'Privat');
    if (!st.connected) parts.push(discreet ? 'offline' : 'Intiface getrennt');
    return { line1: l1, line2: parts.join(' · '), lvl: st.level, light: st.consent };
}
function infobar(ctx, s, st) {
    const c = contexts.get(ctx);
    if (!c || c.controller !== 'Neo') return;
    const v = infobarView(s, st, globals.discreet), key = JSON.stringify(v);
    if (c.fb === key) return;
    c.fb = key;
    const dot = v.light ? '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20" viewBox="0 0 30 20"><circle cx="15" cy="10" r="8" fill="' + LIGHT[v.light][0] + '"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20" viewBox="0 0 30 20"/>';
    send('setFeedback', ctx, { line1: v.line1, line2: v.line2, lvl: { value: v.lvl }, light: 'data:image/svg+xml;base64,' + Buffer.from(dot).toString('base64') });
}
// Text für die kleine Taste: Wörter umbrechen, höchstens `lines` Zeilen à `w` Zeichen
function wrapKey(text, w = 9, lines = 3) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
        let cur = '';
        for (let word of para.split(/\s+/).filter(Boolean)) {
            while (Array.from(word).length > w) { if (cur) { out.push(cur); cur = ''; } out.push(Array.from(word).slice(0, w).join('')); word = Array.from(word).slice(w).join(''); }
            if (!cur) cur = word; else if (Array.from(cur + ' ' + word).length <= w) cur += ' ' + word; else { out.push(cur); cur = word; }
        }
        out.push(cur);
    }
    const l = out.filter((x, i) => x || i === 0);
    if (l.length > lines) { l.length = lines; l[lines - 1] = Array.from(l[lines - 1]).slice(0, w - 1).join('') + '…'; }
    return l.join('\n');
}

async function poll() {
    if (!contexts.size) return;
    try { lastState = await nexus('GET', 'adult/state'); lastError = ''; }
    catch (e) { lastState = null; lastError = e.message; }
    for (const ctx of contexts.keys()) render(ctx);
}
function schedule() { clearInterval(pollTimer); pollTimer = setInterval(poll, 2000); poll(); }

// ---------------- Tasten ----------------
const levelOf = s => s.value === undefined || s.value === '' ? 30 : Math.max(0, Math.min(100, Number(s.value) || 0));
const onOff = m => m === 'on' ? '1' : m === 'off' ? '0' : undefined;
async function keyDown(ctx, action, s) {
    const k = kindOf(action);
    switch (k) {
        case 'panic': return op('panic');
        case 'stop': return op('stop');
        case 'safeword': return op('safeword');
        case 'consent': { const l = s.light || 'next'; return op('consent', { light: lastState && lastState.locked && l === 'next' ? 'red' : l }); }   // gesperrt: Rot geht immer
        case 'level': {
            const m = s.mode || 'set', step = Math.max(1, Math.min(100, Number(s.step) || 10));
            if (m === 'up') return op('level_step', { step });
            if (m === 'down') return op('level_step', { step: -step });
            return op('level', { level: levelOf(s) });
        }
        case 'dial': return op('stop');
        case 'pattern': if (!s.id) throw new Error('Kein Muster gewählt.'); return op('pattern', { id: s.id, strength: s.strength || 60, speed: s.speed || 1, seconds: s.seconds || 0, toggle: s.toggle === false ? '' : '1' });
        case 'surprise': return op('surprise');
        case 'private': return op('private', { on: onOff(s.mode) });
        case 'follow': return op('follow', { on: onOff(s.mode), device: s.device || '' });
        case 'scene': {
            const running = !!(lastState && lastState.scene);
            if (s.mode === 'stop' || ((s.mode || 'toggle') === 'toggle' && running)) return op('scene_stop');
            return op('scene', s.id ? { id: s.id } : { name: s.name || '', minutes: s.minutes || 20 });
        }
        case 'fade': return op('fade', { seconds: s.seconds || 15 });
        case 'meter': return null;
    }
    return null;
}
async function dialRotate(ctx, s, ticks) { return op('level_step', { step: ticks * Math.max(1, Math.min(50, Number(s.step) || 5)) }); }

function feedback(ctx, p) {
    Promise.resolve(p).then(r => { if (r) send('showOk', ctx); setTimeout(poll, 300); })
        .catch(e => { lastError = e.message; send('showAlert', ctx); send('logMessage', undefined, { message: 'VRC Nexus 🔞: ' + e.message }); setTimeout(poll, 300); });
}

function onMessage(raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const { event, context, action, payload } = m;
    const settings = (payload && payload.settings) || {};
    switch (event) {
        case 'willAppear':
            contexts.set(context, { action, settings, controller: (payload && payload.controller) || 'Keypad' });
            if (payload && payload.controller === 'Neo') send('setFeedbackLayout', context, { layout: 'layouts/infobar.json' });
            render(context); if (contexts.size === 1) schedule(); break;
        case 'willDisappear': contexts.delete(context); if (!contexts.size) clearInterval(pollTimer); break;
        case 'didReceiveSettings': if (contexts.has(context)) { Object.assign(contexts.get(context), { settings, img: '', fb: '', title: undefined }); render(context); } break;
        case 'didReceiveGlobalSettings':
            globals = Object.assign({ port: 17865, token: '', discreet: false }, settings);
            for (const c of contexts.values()) { c.fb = ''; c.title = undefined; }
            poll(); break;
        case 'keyDown': feedback(context, keyDown(context, action, settings)); break;
        case 'dialRotate': dialRotate(context, settings, (payload && payload.ticks) || 0).then(() => setTimeout(poll, 200)).catch(e => { send('showAlert', context); send('logMessage', undefined, { message: 'VRC Nexus 🔞: ' + e.message }); }); break;
        case 'dialDown': case 'touchTap': feedback(context, op('stop')); break;
        case 'sendToPlugin':
            if (payload && payload.cmd === 'test') {
                nexus('GET', 'adult/state').then(st => send('sendToPropertyInspector', context, { cmd: 'test', ok: true, state: st }))
                    .catch(e => send('sendToPropertyInspector', context, { cmd: 'test', ok: false, error: e.message }));
            }
            break;
        case 'systemDidWakeUp': poll(); break;
    }
}

function connect() {
    const W = globalThis.WebSocket && !process.env.NEXUS_MINIWS ? globalThis.WebSocket : null;
    const sock = W ? new W('ws://127.0.0.1:' + PORT) : new MiniWs('ws://127.0.0.1:' + PORT);
    const onOpen = () => { ws = sock; sock.send(JSON.stringify({ event: REGISTER, uuid: UUID })); send('getGlobalSettings', UUID); };
    if (W) { sock.onopen = onOpen; sock.onmessage = e => onMessage(e.data); sock.onclose = () => process.exit(0); }
    else { sock.on('open', onOpen); sock.on('message', onMessage); sock.on('close', () => process.exit(0)); }
}

if (require.main === module) connect();
module.exports = { MiniWs, onMessage, keyDown, render, infobarView, consentSvg, wrapKey, LABEL, _test: { contexts, setGlobals: g => { globals = g; }, get state() { return lastState; }, poll } };
