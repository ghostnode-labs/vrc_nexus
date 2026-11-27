'use strict';
/*
 * Spielzeug-Steuerung über Intiface Central (Buttplug-Protokoll v3, WebSocket – Standard ws://127.0.0.1:12345).
 * Eigene, schlanke Umsetzung des offenen Buttplug-Nachrichtenformats (Spezifikation von buttplug.io, kein fremder Code):
 *   RequestServerInfo → StartScanning → DeviceList/DeviceAdded/DeviceRemoved
 *   → ScalarCmd (Vibrate/Oscillate/Constrict/Inflate/Rotate) · RotateCmd · LinearCmd · StopDeviceCmd · StopAllDevices
 *   → SensorReadCmd/SensorSubscribeCmd (Battery, RSSI, Pressure, Button) · BatteryLevelCmd (ältere Server)
 * Quellen für die Stärke: Regler, Regeln (Avatar-Parameter), OGB/SPS, Verknüpfungen, Muster, PCS (Penetration Contact System),
 * Puls, Mikrofon, Fernsteuerung. Jede Quelle setzt einen Zielwert; ein Treiber (alle 50 ms) rechnet pro Gerät
 * Min/Max, Kurve, Glättung, Edging-Bremse und Consent-Ampel ein und sendet unter Beachtung von DeviceMessageTimingGap.
 */
const { str, int, arr, cut, UserError } = require('./util');
const crypto = require('crypto');
/** 8.2: Muster nur verschlüsselt teilen – „NXP1.“ + base64url(Salz 16 | IV 12 | Tag 16 | Daten), Schlüssel aus dem Passwort (scrypt) */
const PAT_CODE = 'NXP1.';
function patEncrypt(obj, pass) {
    const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(String(pass), salt, 32, { N: 16384, r: 8, p: 1 });
    const c = crypto.createCipheriv('aes-256-gcm', key, iv); c.setAAD(Buffer.from(PAT_CODE));
    const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
    return PAT_CODE + Buffer.concat([salt, iv, c.getAuthTag(), ct]).toString('base64url');
}
function patDecrypt(code, pass) {
    code = String(code || '').trim();
    if (!code.startsWith(PAT_CODE) || code.length > 4000) throw new UserError('Das ist kein Muster-Code (beginnt mit NXP1.).');
    const b = Buffer.from(code.slice(PAT_CODE.length), 'base64url');
    if (b.length < 45) throw new UserError('Muster-Code unvollständig.');
    try {
        const key = crypto.scryptSync(String(pass), b.subarray(0, 16), 32, { N: 16384, r: 8, p: 1 });
        const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(16, 28)); d.setAAD(Buffer.from(PAT_CODE)); d.setAuthTag(b.subarray(28, 44));
        return JSON.parse(Buffer.concat([d.update(b.subarray(44)), d.final()]).toString('utf8'));
    } catch (e) { throw new UserError('Falsches Passwort oder beschädigter Code.'); }
}
const H = require('./haptics');

const DEF = { url: 'ws://127.0.0.1:12345', auto: false, max: 100, rules: [], idle_stop: 3, ogb: false, ogb_self: false, ogb_device: 'all', ogb_min: 0.05, links: {}, links_on: false,
    // 4.1
    reconnect: true, auto_scan: true, sps_enable: true, osc_out: true, dev: {}, custom: [], button_action: 'stop', battery_warn: 15,
    pcs: { on: false, device: 'all', w_depth: 60, w_speed: 80, w_lust: 20, impulses: true },
    lust: { source: 'auto', climax: true, climax_pattern: 'hoehepunkt', climax_chat: '', climax_param: '', chat_show: false },
    edge: { on: false, at: 85, cap: 20 },
    heart: { on: false, device: 'all', lo: 75, hi: 150 },
    voice: { on: false, device: 'all', gain: 100 },
    consent: { param: 'NX/Consent', chat: true, yellow: 50 },
    aftercare: { on: true, after_min: 3, chat: '' },
    autopause: { on: false, max_min: 30, pause_min: 5, hr_on: false, hr_max: 150 } };   // 8.2: automatische Pausen nach Zeit oder Puls
const DEV_DEF = { alias: '', on: true, min: 0, max: 100, curve: 1, smooth: 0, rot: 'cw', rot_alt: 8, lin_min: 0, lin_max: 100, types: {} };
const TYPE_DEF = { Vibrate: 100, Oscillate: 100, Rotate: 100, Constrict: 60, Inflate: 60, Position: 100 };
const LINK_TYPES = ['plugs', 'sockets', 'touch', 'constant', 'param', 'pcs', 'heart', 'voice', 'lust'];
/** „berührt von“: Schalter → Wert-Namen */
const SRC = { pen_others: ['penothers'], touch_others: ['touchothers', 'others'], frot_others: ['frotothers'], pen_self: ['penself'], touch_self: ['touchself', 'self'], frot_self: ['frotself'] };
const SRC_DEF = { pen_others: true, touch_others: true, frot_others: true, pen_self: false, touch_self: false, frot_self: false };
/** PCS (Dismay Custom): Zonen-Schalter pcs/select/<zone> */
const PCS_ZONES = ['mouth', 'boobs', 'pussy', 'ass', 'custom1', 'custom2', 'custom3', 'custom4', 'custom5', 'custom6', 'custom7', 'custom8'];
const ERR = { 0: 'unbekannter Fehler', 1: 'Anmeldung fehlgeschlagen', 2: 'Ping verpasst – Verbindung wurde getrennt', 3: 'ungültige Nachricht / nicht erlaubt', 4: 'Gerätefehler' };

/** 🌊 Muster: t = Sekunden seit Start (schon mit Tempo multipliziert), Ergebnis 0…1 */
const PATTERNS = {
    welle: { name: '🌊 Welle', f: t => 0.5 - 0.5 * Math.cos(2 * Math.PI * t / 4) },
    puls: { name: '💥 Puls', f: t => (t % 1.5) < 0.5 ? 1 : 0.12 },
    herz: { name: '💓 Herzschlag', f: t => { const p = t % 1.1; return p < 0.12 || (p > 0.25 && p < 0.37) ? 1 : 0.1; } },
    treppe: { name: '📶 Treppe', f: t => 0.2 + 0.2 * Math.floor((t % 10) / 2) },
    zufall: { name: '🎲 Zufall', f: (t, s) => { const k = Math.floor(t / 1.5); if (s.k !== k) { s.k = k; s.v = 0.2 + Math.random() * 0.8; } return s.v; } },
    gewitter: { name: '⛈ Gewitter', f: (t, s) => { if (t > (s.until || 0) && Math.random() < 0.05) s.until = t + 0.3 + Math.random() * 0.6; return t < (s.until || 0) ? 1 : 0.18; } },
    necken: { name: '😈 Necken', f: t => { const p = t % 25; return p < 20 ? 0.1 + 0.85 * (p / 20) ** 2 : 0; } },
    achterbahn: { name: '🎢 Achterbahn', f: t => Math.max(0, Math.min(1, 0.55 + 0.3 * Math.sin(t * 1.3) + 0.25 * Math.sin(t * 0.37 + 1))) },
    // 4.1
    atem: { name: '🫁 Atem', f: t => { const p = t % 8; return p < 4 ? 0.15 + 0.7 * (p / 4) : p < 5 ? 0.85 : 0.85 - 0.7 * ((p - 5) / 3); } },
    saege: { name: '🪚 Sägezahn', f: t => 0.1 + 0.9 * ((t % 3) / 3) },
    klopfen: { name: '🚪 Klopfen', f: t => { const p = t % 2.4; return p < 0.15 || (p > 0.35 && p < 0.5) || (p > 0.7 && p < 0.85) ? 1 : 0.05; } },
    crescendo: { name: '📈 Crescendo', f: t => Math.min(1, 0.1 + t / 90) },
    sos: { name: '🆘 Morse', f: t => { const seq = [1, 0, 1, 0, 1, 0, 0, 3, 0, 3, 0, 3, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0]; let p = (t * 4) % seq.reduce((a, b) => a + (b || 1), 0); for (const s of seq) { const d = s || 1; if (p < d) return s ? 1 : 0; p -= d; } return 0; } },
    kante: { name: '🎯 Kantenritt', f: t => { const p = t % 30; return p < 24 ? 0.3 + 0.65 * (p / 24) : 0.08; } },
    hoehepunkt: { name: '💥 Höhepunkt', f: t => (t < 8 ? Math.min(1, 0.7 + 0.3 * Math.abs(Math.sin(t * 9))) : Math.max(0, 1 - (t - 8) / 4)) },
};

const clamp = x => Math.max(0, Math.min(1, Number(x) || 0));
const yes = v => v === true || v === '1' || v === 1 || v === 'true';

class Toys {
    constructor(app) {
        this.play3 = new (require('./toyplay').ToyPlay)(app, this);   // NSFW 3.0
        this.app = app; this.ws = null; this.id = 1; this.wait = new Map(); this.devices = new Map(); this.state = 'aus'; this.error = '';
        this.level = new Map(); this.sentAt = 0; this.pending = null; this.lastParam = 0;
        this.zones = { plugs: {}, sockets: {}, touch: {} }; this.pvals = {}; this.linkSent = new Map(); this.linkLevel = new Map();
        this.target = new Map(); this.cur = new Map(); this.manual = new Map(); this.motorOv = new Map();
        this.pcs = { at: 0, depth: 0, vel: 0, slide_in: 0, slide_out: 0, lust: -1, event: 0, quick: false, zones: new Set(), imp: null, seen: new Set() };
        this.lust = { v: 0, at: Date.now(), hist: [], ext: false, climaxAt: 0, climaxes: 0, edgeHold: false, releaseUntil: 0 };
        this.voiceLv = 0; this.voiceAt = 0; this.consent = 'green'; this.scene = null; this.session = { start: 0, last: 0, due: false, total: 0 };
        this.server = { name: '', ping: 0, version: 3 }; this.scanning = false; this.retry = 0;
        this.linkTimer = setInterval(() => this.safeCompute(), 250); if (this.linkTimer.unref) this.linkTimer.unref();
        this.driveTimer = setInterval(() => this.driveAll(), 50); if (this.driveTimer.unref) this.driveTimer.unref();
        if (app.game && app.game.osc) { app.game.osc.taps = app.game.osc.taps || new Set(); app.game.osc.taps.add((a, v) => this.onOsc(a, v)); }
        this.timer = setInterval(() => this.idle(), 1000); if (this.timer.unref) this.timer.unref();
        this.pat = null; this.stats = { since: Date.now(), active: 0, peak: 0, patterns: 0 };
    }
    cfg() {
        let c; try { c = JSON.parse(this.app.db.setting('toys_cfg', '{}')); } catch (e) { c = {}; }
        const o = Object.assign({}, DEF, c);
        for (const k of ['pcs', 'lust', 'edge', 'heart', 'voice', 'consent', 'aftercare', 'autopause']) o[k] = Object.assign({}, DEF[k], c[k] || {});
        return o;
    }
    /** Geräte-Objekt vervollständigen (auch für von außen/Tests gesetzte Geräte) */
    norm(d) { if (!d.rot) Object.assign(d, { rot: [], lin: [], sensors: [], motors: d.motors || [], gap: d.gap || 0, lastSend: 0, battery: null, rssi: null, pressure: null, secs: 0, rotCw: true, rotAt: Date.now(), linPos: 0, linNext: 0, sentKey: '' }); return d; }
    devCfg(name) { const c = this.cfg().dev[name] || {}; return Object.assign({}, DEV_DEF, c, { types: Object.assign({}, TYPE_DEF, c.types || {}) }); }
    saveCfg(c) {
        const cur = this.cfg(), n = Object.assign({}, cur);
        if (c.url !== undefined) { let u = str(c.url).trim(); if (!/^wss?:\/\/[\w.\-]+(:\d+)?\/?$/.test(u)) throw new UserError('Adresse ungültig (z. B. ws://127.0.0.1:12345).');
            if (/^wss?:\/\/0\.0\.0\.0/.test(u)) u = u.replace('0.0.0.0', '127.0.0.1');   // 0.0.0.0 = Intiface hört überall → auf diesem PC über 127.0.0.1
            if (u !== cur.url) { this.error = ''; this.state = 'aus'; }
            n.url = u; }
        for (const k of ['auto', 'links_on', 'ogb', 'ogb_self', 'reconnect', 'auto_scan', 'sps_enable', 'osc_out']) if (c[k] !== undefined) n[k] = yes(c[k]);
        if (c.max !== undefined) n.max = Math.max(5, Math.min(100, int(c.max)));
        if (c.idle_stop !== undefined) n.idle_stop = Math.max(0, Math.min(60, int(c.idle_stop)));
        if (c.battery_warn !== undefined) n.battery_warn = Math.max(0, Math.min(50, int(c.battery_warn)));
        if (c.button_action !== undefined) n.button_action = ['stop', 'surprise', 'next', 'none'].includes(c.button_action) ? c.button_action : 'stop';
        if (c.links !== undefined) {
            let l = c.links; if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { l = {}; } }
            const names = v => arr(v).map(x => cut(str(x), 60)).filter(Boolean).slice(0, 30);
            n.links = {};
            for (const [dev, arrL] of Object.entries(l || {}).slice(0, 20)) {
                const list = arr(arrL).map(x => ({ type: LINK_TYPES.includes(x.type) ? x.type : '', include: names(x.include), exclude: names(x.exclude),
                    src: Object.fromEntries(Object.keys(SRC).map(k => [k, x.src && x.src[k] !== undefined ? !!x.src[k] : SRC_DEF[k]])),
                    value: Math.max(0, Math.min(100, int(x.value === undefined ? 100 : x.value))), param: cut(str(x.param).replace(/^\/avatar\/parameters\//, ''), 80),
                    mut: arr(x.mut).map(m => ({ t: ['scale', 'dead', 'motion'].includes(m.t) ? m.t : '', v: Math.max(0, Math.min(10, Number(m.v) || 0)) })).filter(m => m.t).slice(0, 6) })).filter(x => x.type).slice(0, 10);
                if (list.length) n.links[cut(str(dev), 80)] = list;
            }
        }
        if (c.ogb_device !== undefined) n.ogb_device = str(c.ogb_device || 'all');
        if (c.ogb_min !== undefined) n.ogb_min = Math.max(0, Math.min(0.9, Number(c.ogb_min) || 0));
        if (c.rules !== undefined) {
            let r = c.rules; if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = []; } }
            n.rules = arr(r).map(x => ({ param: cut(str(x.param).replace(/^\/avatar\/parameters\//, '').trim(), 80), device: str(x.device || 'all'), min: Math.max(0, Math.min(1, Number(x.min) || 0)),
                max: Math.max(0, Math.min(1, x.max === undefined ? 1 : Number(x.max))), invert: !!x.invert })).filter(x => /^[\w./\-]+$/.test(x.param)).slice(0, 30);
        }
        // 4.1: Einstellungen je Gerät (nach Name), eigene Muster, PCS/Lust/Edging/Puls/Stimme/Consent/Aftercare
        if (c.dev !== undefined) {
            let d = c.dev; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
            n.dev = Object.assign({}, cur.dev);
            for (const [name, x] of Object.entries(d || {}).slice(0, 30)) {
                if (x === null) { delete n.dev[name]; continue; }
                const o = Object.assign({}, DEV_DEF, cur.dev[name] || {});
                if (x.alias !== undefined) o.alias = cut(str(x.alias), 40);
                if (x.on !== undefined) o.on = yes(x.on);
                for (const [k, lo, hi] of [['min', 0, 90], ['max', 5, 100], ['lin_min', 0, 95], ['lin_max', 5, 100], ['smooth', 0, 3000], ['rot_alt', 0, 120]]) if (x[k] !== undefined) o[k] = Math.max(lo, Math.min(hi, int(x[k])));
                if (x.curve !== undefined) o.curve = Math.max(0.3, Math.min(3, Number(x.curve) || 1));
                if (x.rot !== undefined) o.rot = ['cw', 'ccw', 'alt'].includes(x.rot) ? x.rot : 'cw';
                if (x.types !== undefined) o.types = Object.fromEntries(Object.keys(TYPE_DEF).map(k => [k, Math.max(0, Math.min(100, int((x.types || {})[k] !== undefined ? x.types[k] : (o.types || {})[k] !== undefined ? o.types[k] : TYPE_DEF[k])))]));
                if (o.min >= o.max) o.min = Math.max(0, o.max - 5);
                if (o.lin_min >= o.lin_max) o.lin_min = Math.max(0, o.lin_max - 5);
                n.dev[cut(str(name), 80)] = o;
            }
        }
        if (c.custom !== undefined) {
            let p = c.custom; if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = []; } }
            n.custom = arr(p).map((x, i) => ({ id: /^[a-z0-9]{1,12}$/.test(str(x.id)) ? str(x.id) : 'c' + (i + 1), name: cut(str(x.name) || 'Eigenes Muster ' + (i + 1), 30),
                steps: arr(typeof x.steps === 'string' ? x.steps.split(/[\s,;]+/) : x.steps).map(v => Math.max(0, Math.min(100, int(v)))).slice(0, 120), step_ms: Math.max(50, Math.min(5000, int(x.step_ms) || 500)) }))
                .filter(x => x.steps.length >= 2).slice(0, 20);
        }
        const grp = (k, spec) => { if (c[k] === undefined) return; let v = c[k]; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } } const o = Object.assign({}, cur[k]);
            for (const [f, t, lo, hi] of spec) { if (v[f] === undefined) continue; o[f] = t === 'b' ? yes(v[f]) : t === 'n' ? Math.max(lo, Math.min(hi, Number(v[f]) || 0)) : t === 'd' ? str(v[f] || 'all') : cut(str(v[f]), hi || 144); }
            n[k] = o; };
        grp('pcs', [['on', 'b'], ['device', 'd'], ['w_depth', 'n', 0, 100], ['w_speed', 'n', 0, 100], ['w_lust', 'n', 0, 100], ['impulses', 'b']]);
        grp('lust', [['source', 's', 0, 8], ['climax', 'b'], ['climax_pattern', 's', 0, 20], ['climax_chat', 's', 0, 144], ['climax_param', 's', 0, 80], ['chat_show', 'b']]);
        grp('edge', [['on', 'b'], ['at', 'n', 30, 99], ['cap', 'n', 0, 80]]);
        grp('heart', [['on', 'b'], ['device', 'd'], ['lo', 'n', 40, 180], ['hi', 'n', 60, 220]]);
        grp('voice', [['on', 'b'], ['device', 'd'], ['gain', 'n', 10, 400]]);
        grp('consent', [['param', 's', 0, 80], ['chat', 'b'], ['yellow', 'n', 10, 90]]);
        grp('aftercare', [['on', 'b'], ['after_min', 'n', 1, 60], ['chat', 's', 0, 144]]);
        grp('autopause', [['on', 'b'], ['max_min', 'n', 5, 180], ['pause_min', 'n', 1, 60], ['hr_on', 'b'], ['hr_max', 'n', 90, 210]]);
        if (n.lust.source && !['auto', 'pcs', 'own'].includes(n.lust.source)) n.lust.source = 'auto';
        if (n.lust.climax_param && !/^[\w./\-]+$/.test(n.lust.climax_param)) n.lust.climax_param = '';
        if (n.consent.param && !/^[\w./\-]+$/.test(n.consent.param)) n.consent.param = 'NX/Consent';
        if (n.heart.hi <= n.heart.lo) n.heart.hi = n.heart.lo + 20;
        this.app.db.setSetting('toys_cfg', JSON.stringify(n));
        return n;
    }
    allPatterns() {
        const p = Object.entries(PATTERNS).map(([id, x]) => ({ id, name: x.name }));
        for (const c of this.cfg().custom) p.push({ id: 'u:' + c.id, name: '✏️ ' + c.name, custom: true });
        return p;
    }
    /** 8.2: Vorschau eines Musters – 48 Werte (0–100) über 24 s, je Abschnitt der Höchstwert (kurze Spitzen bleiben sichtbar) */
    patternPreview(id, secs = 24, n = 48) {
        const f = this.patternFn(id); if (!f) return null;
        const st = {}, out = [];
        for (let i = 0; i < n; i++) { let m = 0; for (let k = 0; k < 8; k++) m = Math.max(m, clamp(f((i + k / 8) * secs / n, st))); out.push(Math.round(m * 100)); }
        return out;
    }
    patternFn(id) {
        if (PATTERNS[id]) return PATTERNS[id].f;
        const c = id.startsWith('u:') ? this.cfg().custom.find(x => x.id === id.slice(2)) : null;
        if (!c) return null;
        return t => { const pos = (t * 1000 / c.step_ms) % c.steps.length, i = Math.floor(pos), f = pos - i; return (c.steps[i] * (1 - f) + c.steps[(i + 1) % c.steps.length] * f) / 100; };
    }
    status() {
        const c = this.cfg();
        return { state: this.state, error: this.error, connected: !!(this.ws && this.ws.readyState === 1), cfg: c, server: this.server, scanning: this.scanning,
            ogb_params: [...(this.ogbSeen || [])].slice(0, 30),
            zones: Object.assign(Object.fromEntries(Object.entries(this.zones).map(([k, m]) => [k, Object.keys(m).sort()])), { pcs: PCS_ZONES }), link_levels: Object.fromEntries(this.linkLevel || []),
            pattern: this.pat ? { id: this.pat.id, name: this.pat.surprise ? '🎁 Überraschung' : (this.allPatterns().find(x => x.id === this.pat.id) || { name: '?' }).name, speed: this.pat.speed, strength: Math.round(this.pat.strength * 100), device: this.pat.device,
                left: this.pat.until ? Math.max(0, Math.round((this.pat.until - Date.now()) / 1000)) : 0, level: Math.round((this.pat.last || 0) * 100) } : null,
            patterns: this.allPatterns(),
            stats: { active: Math.round(this.stats.active), peak: Math.round(this.stats.peak * 100), patterns: this.stats.patterns, since: this.stats.since },
            pcs: { active: Date.now() - this.pcs.at < 3000, seen: [...this.pcs.seen].slice(0, 30), depth: Math.round(this.pcs.depth * 100), vel: Math.round(this.pcs.vel * 100), zones: [...this.pcs.zones], event: this.pcs.event, level: Math.round(this.pcsLevel() * 100) },
            lust: { v: Math.round(this.lust.v * 100), ext: this.lust.ext, hist: this.lust.hist.slice(-60), climaxes: this.lust.climaxes, edging: this.lust.edgeHold, release_left: Math.max(0, Math.round((this.lust.releaseUntil - Date.now()) / 1000)) },
            heart: this.app.heart && this.app.heart.active ? this.app.heart.bpm : 0, voice: Math.round(this.voiceLv * 100), consent: this.consent,
            scene: this.scene ? { built: this.scenes ? this.scenes.state() : null, name: this.scene.name, left: Math.max(0, Math.round((this.scene.until - Date.now()) / 1000)), total: Math.round((this.scene.until - this.scene.start) / 1000) } : null,
            session: { running: !!this.session.start, secs: this.session.start ? Math.round((Date.now() - this.session.start) / 1000) : 0, aftercare_due: this.session.due },
            paused: this.paused && Date.now() < this.paused.until ? { left: Math.round((this.paused.until - Date.now()) / 1000), why: this.paused.why, msg: this.pauseMsg || '' } : null,
            devices: [...this.devices.values()].map(d => this.norm(d)).map(d => { const dc = this.devCfg(d.name); return { index: d.index, name: d.name, alias: dc.alias, label: dc.alias || d.name, on: dc.on, motors: d.motors.length,
                level: Math.round((this.level.get(d.index) || 0) * 100), out: Math.round((this.cur.get(d.index) || 0) * 100),
                scalars: d.motors.map(m => ({ index: m.index, type: m.type, steps: m.steps, desc: m.desc, override: this.motorOv.has(d.index + ':' + m.index) ? Math.round(this.motorOv.get(d.index + ':' + m.index) * 100) : null })),
                rotate: d.rot.length, linear: d.lin.length, sensors: d.sensors.map(s => s.type), battery: d.battery, rssi: d.rssi, pressure: d.pressure, gap: d.gap, secs: Math.round(d.secs), cfg: dc }; }) };
    }

    // ---------- Verbindung ----------
    /** Ist überhaupt etwas auf host:port? (unterscheidet „Server aus“ von „lehnt ab“) */
    probe(host, port) {
        if (this.probeHook) return Promise.resolve(this.probeHook(host, port));
        return new Promise(res => {
            const sock = require('net').connect({ host, port, timeout: 2000 });
            const done = ok => { try { sock.destroy(); } catch (e) { /* egal */ } res(ok); };
            sock.once('connect', () => done(true)); sock.once('error', () => done(false)); sock.once('timeout', () => done(false));
        });
    }
    async connect() {
        if (this.ws && this.ws.readyState <= 1) return this.status();
        clearTimeout(this.retryT); this.wantOnline = true;
        let url = this.cfg().url;
        const WS = this.WebSocket || globalThis.WebSocket;
        if (!WS) throw new UserError('WebSocket wird in dieser App-Version nicht unterstützt.');
        this.state = 'verbindet …'; this.error = '';
        let u; try { u = new URL(url); } catch (e) { throw new UserError('Adresse ungültig.'); }
        const port = int(u.port) || 12345, local = /^(127\.0\.0\.1|localhost|\[::1\])$/i.test(u.hostname);
        let open = await this.probe(u.hostname, port);
        if (!open && !local && await this.probe('127.0.0.1', port)) {
            // Intiface hört standardmäßig nur auf diesem PC → automatisch auf 127.0.0.1 umstellen
            url = 'ws://127.0.0.1:' + port; this.saveCfg({ url }); open = true;
            this.note = 'Adresse auf ' + url + ' umgestellt – Intiface hört nur auf diesem PC.';
        }
        if (!open) {
            this.state = 'getrennt';
            this.error = local ? 'Auf Port ' + port + ' läuft nichts – in Intiface Central „Start Server“ drücken und den Port prüfen (Einstellungen → Server Port).'
                : 'Unter ' + u.hostname + ':' + port + ' antwortet nichts. Läuft Intiface auf dem Handy oder einem anderen PC: dort in Intiface unter Settings → Server „Listen on all network interfaces“ einschalten, Server neu starten, gleiches WLAN, Handy wach lassen (Akku-Optimierung für Intiface aus). Läuft es auf diesem PC: ws://127.0.0.1:' + port + ' nehmen.';
            throw new UserError(this.error);
        }
        return new Promise((resolve, reject) => {
            let opened = false;
            const ws = new WS(url);
            this.ws = ws;
            const t = setTimeout(() => fail(), 6000);
            const fail = () => {
                clearTimeout(t);
                if (this.ws === ws) this.ws = null;
                try { ws.close(); } catch (e) { /* egal */ }
                this.state = 'getrennt';
                this.error = opened ? 'Intiface hat die Anmeldung abgelehnt (Protokoll-Version?) – Intiface Central aktualisieren.'
                    : 'Intiface ist erreichbar, lehnt die Verbindung aber ab. Meist ist schon ein anderes Programm verbunden (z. B. VRCFury Haptics, OscGoesBrrr) – Intiface erlaubt nur eine Verbindung: das andere Programm trennen oder beenden.';
                reject(new UserError(this.error));
            };
            ws.onerror = () => { if (!opened || this.state === 'verbindet …') fail(); };
            ws.onclose = () => {
                if (!opened) return fail();
                if (this.ws === ws) { this.ws = null; this.state = 'getrennt'; this.error = 'Verbindung zu Intiface beendet.'; this.devices.clear(); clearInterval(this.ping); this.scheduleRetry(); }
            };
            ws.onmessage = ev => this.onMessage(String(ev.data));
            ws.onopen = async () => {
                opened = true;
                try {
                    const info = await this.req({ RequestServerInfo: { ClientName: 'VRC Nexus', MessageVersion: 3 } });
                    const si = info.ServerInfo || {};
                    this.server = { name: str(si.ServerName || 'Intiface'), ping: int(si.MaxPingTime), version: int(si.MessageVersion) || 3 };
                    clearInterval(this.ping);
                    if (si.MaxPingTime) this.ping = setInterval(() => this.req({ Ping: {} }).catch(() => {}), Math.max(500, si.MaxPingTime / 2));
                    this.state = 'verbunden · ' + this.server.name;
                    const dl = await this.req({ RequestDeviceList: {} });
                    for (const d of arr((dl.DeviceList || {}).Devices)) this.addDevice(d);
                    clearTimeout(t); this.retry = 0;
                    if (this.cfg().auto_scan && !this.devices.size) this.scan().catch(() => {});
                    resolve(Object.assign(this.status(), this.note ? { msg: this.note } : {}));
                    this.note = '';
                } catch (e) { fail(); }
            };
        });
    }
    /** T12: nach Abbruch automatisch neu verbinden (2 s, 4 s, 8 s … max. 60 s) */
    scheduleRetry() {
        if (!this.wantOnline || !this.cfg().reconnect || this.stopped) return;
        clearTimeout(this.retryT);
        const wait = Math.min(60000, 2000 * 2 ** Math.min(5, this.retry++));
        this.state = 'getrennt – neuer Versuch in ' + Math.round(wait / 1000) + ' s';
        this.retryT = setTimeout(() => this.connect().catch(() => this.scheduleRetry()), wait);
        if (this.retryT.unref) this.retryT.unref();
    }
    /** T21: beim Trennen erst alles stoppen */
    disconnect() {
        this.wantOnline = false; clearTimeout(this.retryT); clearInterval(this.ping);
        try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify([{ StopAllDevices: { Id: this.id++ } }])); } catch (e) { /* egal */ }
        try { if (this.ws) this.ws.close(); } catch (e) { /* egal */ }
        this.ws = null; this.devices.clear(); this.state = 'aus';
    }
    req(msg) {
        if (!this.ws || this.ws.readyState !== 1) return Promise.reject(new UserError('Nicht mit Intiface verbunden.'));
        const id = this.id++, type = Object.keys(msg)[0];
        msg[type].Id = id;
        return new Promise((res, rej) => {
            const t = setTimeout(() => { this.wait.delete(id); rej(new UserError('Intiface antwortet nicht.')); }, 5000);
            this.wait.set(id, { res: m => { clearTimeout(t); res(m); }, rej: e => { clearTimeout(t); rej(e); } });
            this.ws.send(JSON.stringify([msg]));
        });
    }
    onMessage(text) {
        let list; try { list = JSON.parse(text); } catch (e) { return; }
        for (const m of arr(list)) {
            const type = Object.keys(m)[0], body = m[type] || {};
            if (type === 'DeviceAdded') this.addDevice(body);
            if (type === 'DeviceRemoved') { this.devices.delete(body.DeviceIndex); this.target.delete(body.DeviceIndex); this.cur.delete(body.DeviceIndex); }
            if (type === 'ScanningFinished') this.scanning = false;
            if (type === 'SensorReading') this.onSensor(body);
            if (type === 'Error' && !body.Id) this.error = 'Intiface: ' + (ERR[body.ErrorCode] || '') + ' – ' + str(body.ErrorMessage);
            const w = this.wait.get(body.Id);
            if (w) { this.wait.delete(body.Id); if (type === 'Error') w.rej(new UserError('Intiface: ' + (ERR[body.ErrorCode] ? ERR[body.ErrorCode] + ' – ' : '') + str(body.ErrorMessage))); else w.res(m); }
        }
    }
    addDevice(d) {
        const dm = d.DeviceMessages || {};
        const motors = arr(dm.ScalarCmd).map((s, i) => ({ index: i, type: str(s.ActuatorType || 'Vibrate'), steps: int(s.StepCount) || 20, desc: str(s.FeatureDescriptor) }));
        const rot = arr(dm.RotateCmd).map((s, i) => ({ index: i, steps: int(s.StepCount) || 20 }));
        const lin = arr(dm.LinearCmd).map((s, i) => ({ index: i, steps: int(s.StepCount) || 100 }));
        const sub = new Set(arr(dm.SensorSubscribeCmd).map(s => str(s.SensorType)));
        const sensors = arr(dm.SensorReadCmd).map((s, i) => ({ index: i, type: str(s.SensorType), range: arr(s.SensorRange) }))
            .concat(arr(dm.SensorSubscribeCmd).map((s, i) => ({ index: i, type: str(s.SensorType), range: arr(s.SensorRange), sub: true })).filter(s => !arr(dm.SensorReadCmd).some(r => str(r.SensorType) === s.type)));
        const old = this.devices.get(d.DeviceIndex);
        const dev = { index: d.DeviceIndex, name: str(d.DeviceDisplayName || d.DeviceName || 'Gerät'), motors, rot, lin, sensors, legacyBattery: !!dm.BatteryLevelCmd,
            gap: int(d.DeviceMessageTimingGap), lastSend: 0, battery: old ? old.battery : null, rssi: old ? old.rssi : null, pressure: null, secs: old ? old.secs : 0,
            rotCw: true, rotAt: Date.now(), linPos: 0, linNext: 0, sentKey: '' };
        this.devices.set(d.DeviceIndex, dev);
        // T8: Druck-/Knopf-Sensoren abonnieren (keine Rohdaten)
        for (const s of sensors) if (sub.has(s.type) && /^(Button|Pressure)$/.test(s.type)) this.req({ SensorSubscribeCmd: { DeviceIndex: dev.index, SensorIndex: s.index, SensorType: s.type } }).catch(() => {});
        setTimeout(() => this.readSensors(dev).catch(() => {}), 300);
    }
    /** T6/T7: Akku & Signalstärke lesen */
    async readSensors(dev) {
        if (!this.devices.has(dev.index)) return;
        for (const s of dev.sensors) {
            if (!/^(Battery|RSSI)$/.test(s.type) || s.sub) continue;
            const r = await this.req({ SensorReadCmd: { DeviceIndex: dev.index, SensorIndex: s.index, SensorType: s.type } }).catch(() => null);
            if (r && r.SensorReading) this.onSensor(r.SensorReading);
        }
        if (dev.legacyBattery && !dev.sensors.some(s => s.type === 'Battery')) {
            const r = await this.req({ BatteryLevelCmd: { DeviceIndex: dev.index } }).catch(() => null);
            if (r && r.BatteryLevelReading) dev.battery = Math.round(Number(r.BatteryLevelReading.BatteryLevel) * 100);
        }
        const warn = this.cfg().battery_warn;
        if (warn && dev.battery !== null && dev.battery <= warn && !dev.warned) { dev.warned = true; if (this.app.tools && this.app.tools.host && this.app.tools.host.notify) this.app.tools.host.notify('🪫 ' + (this.devCfg(dev.name).alias || dev.name), 'Akku nur noch ' + dev.battery + ' %'); }
    }
    onSensor(b) {
        const dev = this.devices.get(b.DeviceIndex); if (!dev) return;
        const v = arr(b.Data).map(Number), t = str(b.SensorType);
        if (t === 'Battery') dev.battery = Math.max(0, Math.min(100, v[0]));
        else if (t === 'RSSI') dev.rssi = v[0];
        else if (t === 'Pressure') dev.pressure = v[0];
        else if (t === 'Button' && v[0] === 1 && Date.now() - (dev.btnAt || 0) > 800) { dev.btnAt = Date.now(); this.onButton(); }
    }
    onButton() {
        const a = this.cfg().button_action;
        if (a === 'stop') this.stopAll().catch(() => {});
        else if (a === 'surprise' && this.devices.size) this.surprise();
        else if (a === 'next' && this.devices.size) { const ids = this.allPatterns().map(p => p.id), i = this.pat ? ids.indexOf(this.pat.id) : -1; this.startPattern({ id: ids[(i + 1) % ids.length], speed: 1, strength: 60 }); }
    }
    async scan(sec = 10) {
        if (!this.ws) await this.connect();
        await this.req({ StartScanning: {} }); this.scanning = true;
        clearTimeout(this.scanT);
        this.scanT = setTimeout(() => { this.scanning = false; this.req({ StopScanning: {} }).catch(() => {}); }, sec * 1000);
        return this.status();
    }

    // ---------- Stärke ----------
    /** level 0…1 für ein Gerät (oder 'all'): Zielwert setzen, der Treiber sendet */
    async set(device, level) {
        const max = this.cfg().max / 100;
        const lv = clamp(level) * max;
        const targets = device === 'all' || device === undefined || device === '' ? [...this.devices.keys()] : [int(device)];
        for (const i of targets) {
            const d = this.devices.get(i);
            if (!d || !(this.norm(d).motors.length || d.rot.length || d.lin.length)) continue;
            this.level.set(i, lv); if (lv > this.stats.peak) this.stats.peak = lv;
            await this.drive(d, true);
        }
        return this.status();
    }
    /** Ausgabe je Gerät: Gerät an? → Edging/Consent → Min/Max/Kurve → Glättung → senden (mit Mindestabstand) */
    shaped(d) {
        const dc = this.devCfg(d.name);
        let x = this.level.get(d.index) || 0;
        if (!dc.on) return 0;
        if (this.paused && Date.now() < this.paused.until) return 0;   // 8.2: automatische Pause
        x *= this.consentFactor() * this.edgeFactor(x);
        if (x <= 0.001) return 0;
        x = Math.pow(x, dc.curve);
        return dc.min / 100 + (dc.max - dc.min) / 100 * x;
    }
    async drive(d, now) {
        if (!this.ws || this.ws.readyState !== 1) return;
        this.norm(d);
        const dc = this.devCfg(d.name), want = this.shaped(d), t = Date.now();
        let cur = this.cur.has(d.index) ? this.cur.get(d.index) : 0;
        if (dc.smooth > 0 && !now) { const step = 50 / dc.smooth; cur = Math.abs(want - cur) <= step ? want : cur + Math.sign(want - cur) * step; }
        else cur = want;
        if (want === 0 && this.level.get(d.index) === 0) cur = dc.smooth > 0 && !now ? cur : 0;
        this.cur.set(d.index, cur);
        if (d.gap && t - d.lastSend < d.gap && !now) return;   // T10: DeviceMessageTimingGap
        const msgs = [];
        if (d.motors.length) {
            const sc = d.motors.map(m => { const ov = this.motorOv.get(d.index + ':' + m.index); const v = ov !== undefined ? ov : cur * (dc.types[m.type] !== undefined ? dc.types[m.type] : 100) / 100;
                return { Index: m.index, Scalar: Math.round(clamp(v) * m.steps) / m.steps, ActuatorType: m.type }; });
            const key = JSON.stringify(sc.map(s => s.Scalar));
            if (key !== d.sentKey || now) { d.sentKey = key; msgs.push({ ScalarCmd: { DeviceIndex: d.index, Scalars: sc } }); }
        }
        if (d.rot.length) {   // T2/T3
            if (dc.rot === 'alt' && dc.rot_alt && t - d.rotAt > dc.rot_alt * 1000) { d.rotCw = !d.rotCw; d.rotAt = t; }
            const cw = dc.rot === 'ccw' ? false : dc.rot === 'cw' ? true : d.rotCw;
            const rv = Math.round(cur * d.rot[0].steps) / d.rot[0].steps, key = rv + '|' + cw;
            if (key !== d.rotKey || now) { d.rotKey = key; msgs.push({ RotateCmd: { DeviceIndex: d.index, Rotations: d.rot.map(r => ({ Index: r.index, Speed: rv, Clockwise: cw })) } }); }
        }
        const fl = d.lin.length && this.play3.fun ? this.play3.funLinear(t) : null;   // NSFW 3.0: Stroker folgen dem Funscript
        if (fl) { if (fl.key !== d.funKey && this.consent !== 'red') { d.funKey = fl.key; d.linOn = true; msgs.push({ LinearCmd: { DeviceIndex: d.index, Vectors: d.lin.map(l => ({ Index: l.index, Duration: fl.duration, Position: Math.round(fl.position * 100) / 100 })) } }); } }
        else if (d.lin.length && cur <= 0.02 && d.linOn) { d.linOn = false; msgs.push({ StopDeviceCmd: { DeviceIndex: d.index } }); }
        if (!fl && d.lin.length && cur > 0.02 && t >= d.linNext) {
            d.linOn = true;   // T4/T5: Stärke → Hubtempo, im eingestellten Bereich
            const dur = Math.round(1600 - 1350 * cur);
            d.linPos = d.linPos > 0.5 ? 0 : 1;
            const pos = (dc.lin_min + (dc.lin_max - dc.lin_min) * d.linPos) / 100;
            d.linNext = t + dur;
            msgs.push({ LinearCmd: { DeviceIndex: d.index, Vectors: d.lin.map(l => ({ Index: l.index, Duration: dur, Position: Math.round(pos * 100) / 100 })) } });
        }
        if (!msgs.length) return;
        d.lastSend = t;
        for (const m of msgs) await this.req(m).catch(() => {});
    }
    driveAll() {
        if (!this.ws || this.ws.readyState !== 1 || !this.devices.size) return;
        for (const d of this.devices.values()) { this.drive(d, false).catch(() => {}); if ((this.cur.get(d.index) || 0) > 0.01) d.secs += 0.05; }
    }
    async stopDevice(index) {   // T11
        const d = this.devices.get(int(index)); if (!d) throw new UserError('Gerät nicht gefunden.');
        this.level.set(d.index, 0); this.cur.set(d.index, 0); this.manual.delete(d.index); d.sentKey = ''; d.rotKey = '';
        for (const k of [...this.motorOv.keys()]) if (k.startsWith(d.index + ':')) this.motorOv.delete(k);
        if (this.ws && this.ws.readyState === 1) await this.req({ StopDeviceCmd: { DeviceIndex: d.index } }).catch(() => {});
        return this.status();
    }
    async stopAll() {
        this.level.clear(); this.cur.clear(); this.rule = {}; this.linkSent.clear(); this.pat = null; this.motorOv.clear(); this.manual.clear(); this.scene = null;
        if (this.play3) this.play3.stopAll();   // NSFW 3.0: Funscript/Spiel/Wiedergabe/Welt aus
        for (const d of this.devices.values()) { d.sentKey = ''; d.rotKey = ''; }
        if (this.cfg().links_on) this.saveCfg({ links_on: false });   // Not-Aus: Verknüpfungen erst wieder von Hand einschalten
        if (this.ws && this.ws.readyState === 1) await this.req({ StopAllDevices: {} }).catch(() => {});
        return this.status();
    }
    /** T17: Gerät kurz antippen (zum Erkennen) */
    async tap(index) {
        const d = this.devices.get(int(index)); if (!d) throw new UserError('Gerät nicht gefunden.');
        const before = this.level.get(d.index) || 0;
        this.level.set(d.index, 0.6); await this.drive(d, true);
        setTimeout(() => { this.level.set(d.index, before); this.drive(d, true).catch(() => {}); }, 600);
        return this.status();
    }

    // ---------- Avatar-Parameter (OSC) ----------
    onOsc(address, args) {
        if (address === '/avatar/change' && args && args.length) this.play3.onAvatar(String(args[0]));   // NSFW 3.0: Profil je Avatar
        const c = this.cfg();
        if (!address.startsWith('/avatar/parameters/')) return;
        const name = address.slice(19), v = args[0];
        if (/^pcs\//i.test(name)) this.onPcs(name, v);
        if (c.links_on) this.track(name, v);
        if (!(c.auto && c.rules.length) && !c.ogb) return;
        if (!this.devices.size) return;
        if (this.app.nsfw && !this.app.nsfw.access().features.includes('toys')) return;
        const val = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
        if (!Number.isFinite(val)) return;
        this.rule = this.rule || {};
        // OGB/SPS: stärkste Berührung zählt (Self optional) – 4.2: SPS (OGB/Plug|Socket|Touch), altes OGB (Pen/Orf) und VFH
        const hp = c.ogb ? H.parse(name) : null;
        if (hp && hp.kind && !hp.meta) {
            this.ogbSeen = this.ogbSeen || new Set(); this.ogbSeen.add(name);
            if (/self/.test(hp.key) && !c.ogb_self) return;
            const x = clamp(val);
            this.rule['ogb|' + name] = { device: c.ogb_device || 'all', lv: x < 0.01 ? 0 : c.ogb_min + (1 - c.ogb_min) * x };
            this.lastParam = Date.now();
            return this.flush();
        }
        if (!c.auto) return;
        for (const r of c.rules) {
            if (r.param !== name) continue;
            let x = clamp(val); if (r.invert) x = 1 - x;
            this.rule[r.device + '|' + r.param] = { device: r.device, lv: x <= 0.001 ? 0 : r.min + (r.max - r.min) * x };
            this.lastParam = Date.now();
        }
        this.flush();
    }
    /** N1/N2: PCS (Penetration Contact System, Dismay Custom) – Ausgabe-Parameter lesen */
    onPcs(name, v) {
        const p = this.pcs, n = name.toLowerCase(), num = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v), on = typeof v === 'boolean' ? v : num > 0.5;
        if (!Number.isFinite(num)) return;
        p.seen.add(name); p.at = Date.now();
        const imp = (lv, ms) => { if (this.cfg().pcs.impulses) p.imp = { lv: Math.max(lv, p.imp && p.imp.until > Date.now() ? p.imp.lv : 0), until: Date.now() + ms }; };
        switch (n) {
            case 'pcs/output/depth-value': p.depth = clamp(num); break;
            case 'pcs/output/velocity': p.vel = clamp(num); break;
            case 'pcs/output/slide-in': p.slide_in = clamp(num); break;
            case 'pcs/output/slide-out': p.slide_out = clamp(num); break;
            case 'pcs/output/quicken': p.quick = on; break;
            case 'pcs/output/smash-intensity': p.smash = Math.max(1, Math.min(4, int(num))); break;
            case 'pcs/output/smash-hit': if (on) imp(0.55 + 0.11 * (p.smash || 2), 350); break;
            case 'pcs/output/move-in': if (on) imp(0.5, 180); break;
            case 'pcs/output/deep-throat': if (on) imp(1, 600); break;
            case 'pcs/output/hole-exit': if (on) { p.depth = 0; p.vel = 0; p.slide_in = 0; p.slide_out = 0; } break;
            case 'pcs/satisfaction/lust': p.lust = clamp(num); this.lust.ext = true; break;
            case 'pcs/satisfaction/lust-int': p.lust = clamp(num / 100); this.lust.ext = true; break;
            case 'pcs/satisfaction/event': { const ev = int(num); if (ev >= 10 && p.event < 10) this.climax('pcs'); p.event = ev; break; }
            default: { const z = /^pcs\/select\/(\w+)$/.exec(n); if (z) { if (on) p.zones.add(z[1]); else p.zones.delete(z[1]); } }
        }
        this.lastParam = Date.now();
    }
    pcsLevel(zoneFilter) {
        const p = this.pcs, c = this.cfg().pcs, t = Date.now();
        if (t - p.at > Math.max(1, this.cfg().idle_stop || 3) * 1000) return 0;
        if (zoneFilter && zoneFilter.length && ![...p.zones].some(z => zoneFilter.includes(z))) return 0;
        const move = Math.max(p.vel, p.slide_in, p.slide_out);
        let x = p.depth * c.w_depth / 100 + move * c.w_speed / 100;
        if (p.quick) x *= 1.2;
        if (p.lust >= 0 && (p.depth > 0 || move > 0)) x = Math.max(x, p.lust * c.w_lust / 100);
        if (p.imp && p.imp.until > t) x = Math.max(x, p.imp.lv);
        return clamp(x);
    }
    /** SPS-Zonen und Parameter für die Geräte-Verknüpfungen merken (inkl. Bewegung = Änderung pro Sekunde) */
    track(name, v) {
        const val = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
        if (!Number.isFinite(val)) return;
        const x = clamp(val), t = Date.now();
        const z = H.parse(name);
        if (z && z.kind && !z.meta) {
            const kind = z.kind, zone = this.zones[kind][z.id] = this.zones[kind][z.id] || {};
            const key = z.key, old = zone[key];
            const speed = old ? Math.abs(x - old.v) / Math.max(0.02, (t - old.at) / 1000) : 0;
            zone[key] = { v: x, at: t, speed: old ? Math.max(speed, old.speed * 0.6) : 0 };
        }
        const o = this.pvals[name];
        this.pvals[name] = { v: x, at: t, speed: o ? Math.abs(x - o.v) / Math.max(0.02, (t - o.at) / 1000) : 0 };
    }
    /** Mutatoren: Totzone → Bewegung → Skalieren */
    mutate(raw, speed, mut) {
        let x = raw;
        for (const m of mut) {
            if (m.t === 'dead') x = x <= m.v / 10 ? 0 : (x - m.v / 10) / (1 - m.v / 10);
            if (m.t === 'motion') x = Math.min(1, speed * (m.v || 1) * 0.5);
            if (m.t === 'scale') x = Math.min(1, x * (m.v || 1));
        }
        return clamp(x);
    }
    heartLevel() {
        const h = this.app.heart, c = this.cfg().heart;
        if (!h || !h.active) return 0;
        return clamp((h.bpm - c.lo) / Math.max(1, c.hi - c.lo));
    }
    voiceLevel() { return Date.now() - this.voiceAt < 1500 ? clamp(this.voiceLv * this.cfg().voice.gain / 100) : 0; }
    linkValue(l, fresh) {
        const motion = l.mut.some(m => m.t === 'motion');
        if (l.type === 'constant') return this.mutate(l.value / 100, 0, l.mut);
        if (l.type === 'param') { const p = this.pvals[l.param]; return p && p.at > fresh ? this.mutate(p.v, p.speed, l.mut) : 0; }
        if (l.type === 'pcs') return this.mutate(this.pcsLevel(l.include.filter(z => PCS_ZONES.includes(z))), this.pcs.vel * 2, l.mut);
        if (l.type === 'heart') return this.mutate(this.heartLevel(), 0, l.mut);
        if (l.type === 'voice') return this.mutate(this.voiceLevel(), 0, l.mut);
        if (l.type === 'lust') return this.mutate(this.lust.v, 0, l.mut);
        let best = 0;
        for (const [name, zone] of Object.entries(this.zones[l.type] || {})) {
            if ((l.include.length && !l.include.includes(name)) || l.exclude.includes(name)) continue;
            for (const [s, keys] of Object.entries(SRC)) {
                if (!l.src[s]) continue;
                for (const k of keys) {
                    const e = zone[k];
                    if (!e || e.at < fresh) continue;
                    best = Math.max(best, this.mutate(e.v, motion ? e.speed * Math.max(0, 1 - (Date.now() - e.at) / 600) : 0, l.mut));
                }
            }
        }
        return best;
    }
    /** aktueller Muster-Wert (null = kein Muster); abgelaufen → aus */
    patternLevel() {
        const p = this.pat;
        if (!p) return null;
        if (p.until && Date.now() > p.until) {
            this.pat = null;
            if (!this.cfg().links_on) for (const d of this.devices.values()) if (p.device === 'all' || String(d.index) === String(p.device)) { this.linkSent.delete(d.index); this.set(String(d.index), 0).catch(() => {}); }
            return null;
        }
        const f = this.patternFn(p.id);
        if (!f) { this.pat = null; return null; }
        const t = (Date.now() - p.start) / 1000 * p.speed;
        p.last = clamp(f(t, p.s)) * p.strength;
        return p.last;
    }
    startPattern(input) {
        const id = str(input.id || input.name);
        if (!this.patternFn(id)) throw new UserError('Unbekanntes Muster.');
        if (!this.ws || !this.devices.size) throw new UserError('Erst mit Intiface verbinden und ein Gerät finden.');
        const sec = Math.max(0, Math.min(3600, int(input.seconds !== undefined ? input.seconds : int(input.minutes) * 60)));
        this.pat = { id, speed: Math.max(0.25, Math.min(3, Number(input.speed) || 1)), strength: Math.max(0.05, Math.min(1, (Number(input.strength) || 60) / 100)),
            device: str(input.device || 'all') || 'all', start: Date.now(), until: sec ? Date.now() + sec * 1000 : 0, s: {}, surprise: !!input.surprise };
        this.stats.patterns++;
        return this.pat;
    }
    surprise() {
        const ids = Object.keys(PATTERNS).filter(x => x !== 'hoehepunkt'), sec = 20 + Math.floor(Math.random() * 41);
        this.startPattern({ id: ids[Math.floor(Math.random() * ids.length)], speed: (0.6 + Math.random()).toFixed(2), strength: 40 + Math.floor(Math.random() * 50), seconds: sec, surprise: true });
        return sec;
    }
    /** Quellen, die einem Gerät dauerhaft zugeordnet sind (PCS, Puls, Stimme – „einfacher Modus“) */
    simpleSources(d) {
        const c = this.cfg(), hit = dev => dev === 'all' || dev === String(d.index);
        let x = 0;
        if (c.pcs.on && hit(c.pcs.device)) x = Math.max(x, this.pcsLevel());
        if (c.heart.on && hit(c.heart.device)) x = Math.max(x, this.heartLevel());
        if (c.voice.on && hit(c.voice.device)) x = Math.max(x, this.voiceLevel());
        return x;
    }
    /** 5.1.1: ein Fehler in der Schleife darf die App nicht abstürzen lassen – melden, 30 s Pause, weiter */
    safeCompute() {
        if (this.pauseUntil && Date.now() < this.pauseUntil) return;
        try { this.compute(); this.loopErrors = 0; }
        catch (e) {
            this.loopErrors = (this.loopErrors || 0) + 1;
            this.pauseUntil = Date.now() + (this.loopErrors > 3 ? 30000 : 2000);
            this.error = 'Interner Fehler in der Spielzeug-Schleife: ' + (e && e.message || e);
            console.error('[toys] compute:', e);
            if (this.loopErrors === 4 && this.app.tools && this.app.tools.alert) this.app.tools.alert('⚠ Spielzeug-Steuerung pausiert', 'Ein interner Fehler ist aufgetreten – Nexus versucht es in 30 s erneut. Details im Protokoll.');
        }
    }
    compute() {
        const c = this.cfg();
        this.tickLust(c);
        if (!this.devices.size || !this.ws) return;
        if (this.app.nsfw && !this.app.nsfw.access().features.includes('toys')) { this.pat = null; return; }
        const pl = this.patternLevel();
        const simple = c.pcs.on || c.heart.on || c.voice.on;
        if (!c.links_on && pl === null && !simple && !this.sceneLevel() && !this.play3.active()) return;
        const fresh = Date.now() - Math.max(1, c.idle_stop || 3) * 1000;
        for (const d of this.devices.values()) {
            const links = c.links_on ? c.links[d.name] : null, byPat = pl !== null && (this.pat.device === 'all' || this.pat.device === String(d.index));
            let lv = links ? links.reduce((m, l) => Math.max(m, this.linkValue(l, fresh)), 0) : 0;
            if (links) this.linkLevel.set(d.name, Math.round(lv * 100));
            if (byPat) lv = Math.max(lv, pl);
            if (simple) lv = Math.max(lv, this.simpleSources(d));
            const x3 = this.play3.level(d);   // NSFW 3.0: Funscript, Spiele, Aufnahme, Welt, Musik
            if (x3 !== null) lv = Math.max(lv, x3);
            if (!links && !byPat && !simple && x3 === null) continue;
            if (this.manual.has(d.index) && Date.now() - this.manual.get(d.index).at < 1500) lv = Math.max(lv, this.manual.get(d.index).lv);
            const last = this.linkSent.get(d.index);
            if (last !== undefined && Math.abs(last - lv) < 0.02) continue;
            this.linkSent.set(d.index, lv);
            this.set(String(d.index), lv).catch(() => {});
        }
        if (this.play3.rec && Date.now() - (this.recAt || 0) >= 100) { this.recAt = Date.now(); this.play3.sample(Object.fromEntries([...this.devices.values()].map(d => [d.name, this.linkSent.get(d.index) || 0]))); }
    }
    sceneLevel() { return this.scene && Date.now() < this.scene.until; }
    flush() {
        if (Date.now() - this.sentAt < 100) { if (!this.pending) this.pending = setTimeout(() => { this.pending = null; this.flush(); }, 110); return; }
        this.sentAt = Date.now();
        const per = {};
        for (const k of Object.keys(this.rule || {})) { const r = this.rule[k]; per[r.device] = Math.max(per[r.device] || 0, r.lv); }
        for (const [dev, lv] of Object.entries(per)) this.set(dev, lv).catch(() => {});
    }

    // ---------- 4.1: Lust, Höhepunkt, Edging, Consent, Szene, Aftercare ----------
    /** N3: Lust-Meter – aus PCS (pcs/satisfaction/lust) oder selbst aus der Stärke der letzten Minuten berechnet */
    tickLust(c) {
        const t = Date.now(), dt = Math.min(2, (t - this.lust.at) / 1000); this.lust.at = t;
        const L = this.lust, pcsLive = this.pcs.lust >= 0 && t - this.pcs.at < 10000;
        const usePcs = c.lust.source === 'pcs' || (c.lust.source === 'auto' && pcsLive);
        const out = Math.max(0, ...[...this.cur.values()]);
        if (usePcs) { L.v = Math.max(0, this.pcs.lust); L.ext = true; }
        else {
            L.ext = false;
            L.v = out > 0.08 ? Math.min(1, L.v + dt * out / 150) : Math.max(0, L.v - dt / 240);   // ca. 2,5 min bei voller Stärke bis zum Höhepunkt
            if (L.v >= 1 && t - L.climaxAt > 20000) { this.climax('own'); L.v = 0.35; }
        }
        // N5: Edging – ab Schwelle bremsen, bis die Lust deutlich gesunken ist
        if (c.edge.on && t > L.releaseUntil) { if (L.v * 100 >= c.edge.at) L.edgeHold = true; else if (L.v * 100 < c.edge.at - 15) L.edgeHold = false; } else L.edgeHold = false;
        if (!L.histAt || t - L.histAt >= 5000) { L.histAt = t; L.hist.push(Math.round(L.v * 100)); if (L.hist.length > 120) L.hist.shift(); }
        // N12: Lust in der Chatbox (höchstens alle 15 s, nie im Privat-Modus)
        if (c.lust.chat_show && !(this.app.nsfw && this.app.nsfw.private) && t - (L.chatAt || 0) > 15000 && Math.abs((L.chatV || 0) - L.v) > 0.05 && this.app.game) {
            L.chatAt = t; L.chatV = L.v;
            this.app.game.osc.chatbox('💗 ' + Math.round(L.v * 100) + ' %' + (L.edgeHold ? ' · 🎯 Edging' : ''), false).catch(() => {});
        }
        this.oscOut(L.v, out);
        // N9/N10: Szene & Aftercare
        if (this.scene && t >= this.scene.until) { this.scene = null; this.stopAll().catch(() => {}); this.session.due = c.aftercare.on; this.session.start = 0; return; }
        this.checkAutoPause(c, t, out);   // 8.2
        if (out > 0.02) { if (!this.session.start) this.session.start = t; this.session.last = t; this.session.due = false; }
        else if (this.session.start && t - this.session.last > c.aftercare.after_min * 60000) {
            this.session.total += Math.round((this.session.last - this.session.start) / 1000);
            const long = this.session.last - this.session.start > 60000;
            this.session.start = 0;
            if (c.aftercare.on && long) {
                this.session.due = true;
                if (this.app.tools && this.app.tools.host && this.app.tools.host.notify) this.app.tools.host.notify('💞 Aftercare', 'Kurz nachspüren: Wasser, kuscheln, nachfragen wie es dem anderen geht.');
                if (c.aftercare.chat && !(this.app.nsfw && this.app.nsfw.private) && this.app.game) this.app.game.osc.chatbox(c.aftercare.chat, true).catch(() => {});
            }
        }
    }
    /** 4.2: Rückkanal – Spielzeug-Stärke und Lust als Avatar-Parameter (nur wenn der Avatar NX/Toy bzw. NX/Lust hat, nie im Privat-Modus) */
    oscOut(lust, toy) {
        const g = this.app.game; if (!g || !g.osc || this.cfg().osc_out === false) return;
        const osc = g.osc, known = osc.known || {}, priv = this.app.nsfw && this.app.nsfw.private;
        if (this.app.nsfw && !this.app.nsfw.access().features.includes('toys')) return;
        this.outSent = this.outSent || {};
        for (const [name, v] of [['NX/Toy', toy], ['NX/Lust', lust]]) {
            if (!known[name]) continue;
            const x = priv ? 0 : Math.round(v * 50) / 50;
            if (this.outSent[name] === x) continue;
            this.outSent[name] = x; osc.sendParam(name, x, 'float').catch(() => {});
        }
    }
    /** N4: Höhepunkt – Muster, Chatbox, Avatar-Parameter */
    climax(from) {
        const c = this.cfg(), L = this.lust, t = Date.now();
        if (!c.lust.climax || t - L.climaxAt < 20000) return;
        L.climaxAt = t; L.climaxes++;
        if (this.devices.size && this.ws && this.patternFn(c.lust.climax_pattern)) { try { this.startPattern({ id: c.lust.climax_pattern, speed: 1, strength: 100, seconds: 14 }); } catch (e) { /* ohne Gerät */ } }
        const priv = this.app.nsfw && this.app.nsfw.private;
        if (c.lust.climax_chat && !priv && this.app.game) this.app.game.osc.chatbox(c.lust.climax_chat, true).catch(() => {});
        if (c.lust.climax_param && this.app.game) {
            const osc = this.app.game.osc, a = c.lust.climax_param;
            osc.sendParam(a, true, 'bool').catch(() => {}); setTimeout(() => osc.sendParam(a, false, 'bool').catch(() => {}), 3000);
        }
        this.lastClimax = { from, at: t };
    }
    edgeFactor(x) {
        const c = this.cfg().edge;
        if (!c.on || !this.lust.edgeHold) return 1;
        return x > 0 ? Math.min(1, (c.cap / 100) / x) : 1;
    }
    /** N8: Consent-Ampel – 🔴 stoppt alles, 🟡 halbiert (einstellbar), 🟢 normal */
    consentFactor() { return this.consent === 'red' ? 0 : this.consent === 'yellow' ? this.cfg().consent.yellow / 100 : 1; }
    /** 8.2: Pause nach X Minuten am Stück oder ab einem Puls – Ausgabe 0, Muster/Szenen laufen danach weiter */
    checkAutoPause(c, t, out) {
        if (this.paused && t >= this.paused.until) { this.paused = null; this.pauseMsg = '▶ Pause vorbei'; }
        const ap = c.autopause;
        if (!ap || !ap.on || this.paused || out <= 0.02) return '';
        const hr = this.app.heart && this.app.heart.active ? this.app.heart.bpm : 0;
        const why = this.session.start && t - this.session.start >= ap.max_min * 60000 ? 'time' : ap.hr_on && hr >= ap.hr_max ? 'heart' : '';
        if (!why) return '';
        this.paused = { until: t + ap.pause_min * 60000, why, at: t };
        this.session.start = 0;   // nach der Pause zählt die Zeit neu
        for (const d of this.devices.values()) this.drive(d, true).catch(() => {});
        const msg = why === 'time' ? '⏸ ' + ap.max_min + ' min am Stück – ' + ap.pause_min + ' min Pause' : '⏸ Puls ' + hr + ' – ' + ap.pause_min + ' min Pause';
        this.pauseMsg = msg;
        if (this.app.tools && this.app.tools.host && this.app.tools.host.notify) this.app.tools.host.notify('⏸ Pause', msg + '. Wasser trinken, durchatmen 💙');
        return why;
    }
    async setConsent(light) {
        if (!['green', 'yellow', 'red'].includes(light)) throw new UserError('Ampel: green, yellow oder red.');
        if (this.consent !== light && this.app.nsfwsafe) this.app.nsfwsafe.log('ampel', { green: '🟢', yellow: '🟡', red: '🔴' }[light]);   // 6.7
        this.consent = light;
        const c = this.cfg().consent, g = this.app.game;
        if (light === 'red') await this.stopAll();
        if (g && c.param) await g.osc.sendParam(c.param, { green: 0, yellow: 1, red: 2 }[light], 'int').catch(() => {});
        if (g && c.chat && !(this.app.nsfw && this.app.nsfw.private)) await g.osc.chatbox({ green: '🟢 alles gut – weiter so', yellow: '🟡 bitte langsamer / sanfter', red: '🔴 STOPP – Pause bitte' }[light], true).catch(() => {});
        return light;
    }
    startScene(input) {
        const min = Math.max(1, Math.min(240, int(input.minutes) || 20));
        this.scene = { name: cut(str(input.name) || 'Szene', 40), start: Date.now(), until: Date.now() + min * 60000 };
        this.session.due = false;
        return this.scene;
    }
    /** keine Parameter mehr → nach x s aus (falls VRChat hängt) */
    idle() {
        const c = this.cfg();
        if ([...this.level.values()].some(v => v > 0)) this.stats.active++;
        if ((c.auto || c.ogb) && c.idle_stop && this.lastParam && Date.now() - this.lastParam > c.idle_stop * 1000 && [...this.level.values()].some(v => v > 0) && !this.pat && !(c.pcs.on || c.heart.on || c.voice.on || c.links_on)) { this.lastParam = 0; this.stopAll().catch(() => {}); }
        this.ogbEnable(c);
        if (!this.batAt || Date.now() - this.batAt > 60000) { this.batAt = Date.now(); for (const d of this.devices.values()) this.readSensors(d).catch(() => {}); }
    }

    /** 4.2: VRCFury-Haptik braucht OGB/Enabled = true, sonst liefern die SPS-Kontakte nichts (sonst macht das OscGoesBrrr) */
    ogbEnable(c) {
        const g = this.app.game; if (!g || !g.osc) return;
        const osc = g.osc, hasParam = !!((osc.known || {})['OGB/Enabled'] || Object.keys(osc.params || {}).some(k => /^OGB\/(Version\/|Plug\/|Socket\/|Touch\/|Enabled$)/.test(k)));
        const allowed = !this.app.nsfw || this.app.nsfw.access().features.includes('toys');
        const want = allowed && c.sps_enable !== false && (c.ogb || c.links_on) && hasParam;
        const t = Date.now();
        if (want && (!this.ogbOn || t - this.ogbAt > 10000 || osc.avatarId !== this.ogbAv)) { this.ogbOn = true; this.ogbAt = t; this.ogbAv = osc.avatarId; osc.sendParam('OGB/Enabled', true, 'bool').catch(() => {}); }
        else if (!want && this.ogbOn) { this.ogbOn = false; osc.sendParam('OGB/Enabled', false, 'bool').catch(() => {}); }
    }
    /** 4.2: Avatar-Check – welche Haptik-/PCS-Systeme hat der getragene Avatar? */
    avatarCheck() {
        const osc = this.app.game.osc, names = new Set([...Object.keys(osc.known || {}), ...Object.keys(osc.params || {})]);
        let file = null; try { file = this.app.params.list(); } catch (e) { file = null; }
        if (file) for (const p of file.params) names.add(p.name);
        return Object.assign(H.detect([...names], osc.params || {}), { avatar: (file && file.current) || osc.avatarId || '', params: names.size, ogb_enabled_sent: !!this.ogbOn });
    }
    /** NSFW 3.0: Welt-Brücke – nur frische Zeilen (kein Nachspielen alter Logs), Consent und Freigabe gelten */
    onWorldEvent(e) {
        if (Math.abs(Date.now() / 1000 - Number(e.ts)) > 15) return false;
        if (this.app.nsfw && !this.app.nsfw.access().features.includes('toys')) return false;
        const [cmd, a, b] = String(e.detail || '').split(' ');
        return this.play3.onWorld(cmd, a, b);
    }
    async action(act, input) {
        if (this.app.nsfw) this.app.nsfw.need('toys');
        if (act.startsWith('toys3_')) return await this.play3.action(act, input);
        if (act.startsWith('toys_scenes')) { if (!this.scenes) { const { Scenes } = require('./scenes'); this.scenes = new Scenes(this); } return await this.scenes.action(act, input); }   // 6.2: Szenen-Baukasten
        switch (act) {
            case 'toys_status': return this.status();
            case 'toys_check': return Object.assign(this.status(), { check: this.avatarCheck() });
            case 'toys_cfg': { const c = this.saveCfg(input); return Object.assign(this.status(), { cfg: c, msg: 'Gespeichert.' }); }
            case 'toys_connect': { const r = await this.connect(); return Object.assign({ msg: 'Mit Intiface verbunden.' }, r); }
            case 'toys_disconnect': this.disconnect(); return this.status();
            case 'toys_scan': return Object.assign(await this.scan(), { msg: 'Suche Geräte (10 s) …' });
            case 'toys_set': {
                const dev = str(input.device || 'all'), lv = Number(input.level);
                for (const i of dev === 'all' ? [...this.devices.keys()] : [int(dev)]) this.manual.set(i, { lv: clamp(lv), at: Date.now() });
                return await this.set(dev, lv);
            }
            case 'toys_motor': {   // T9: einzelner Motor (leer = wieder automatisch)
                const d = this.devices.get(int(input.device)); if (!d) throw new UserError('Gerät nicht gefunden.');
                const k = d.index + ':' + int(input.motor);
                if (input.level === '' || input.level === undefined) this.motorOv.delete(k); else this.motorOv.set(k, clamp(input.level));
                d.sentKey = ''; await this.drive(d, true); return this.status();
            }
            case 'toys_dev': { this.saveCfg({ dev: { [str(input.name)]: typeof input.data === 'string' ? JSON.parse(input.data) : input.data } }); return Object.assign(this.status(), { msg: 'Gerät gespeichert.' }); }
            case 'toys_stop_dev': return Object.assign(await this.stopDevice(input.device), { msg: '⏹ Gerät gestoppt.' });
            case 'toys_tap': return await this.tap(input.device);
            case 'toys_sensors': { for (const d of this.devices.values()) await this.readSensors(d).catch(() => {}); return this.status(); }
            case 'toys_pattern_share': {   // 8.2: nur verschlüsselt teilen
                const c = this.cfg().custom[int(input.i)];
                if (!c) throw new UserError('Muster nicht gefunden.');
                const pass = str(input.pass);
                if (pass.length < 6) throw new UserError('Passwort: mindestens 6 Zeichen – und auf anderem Weg weitergeben.');
                const code = patEncrypt({ name: c.name, steps: c.steps, step_ms: c.step_ms }, pass);
                const to = str(input.to).trim();
                if (to) {
                    if (!/^usr_[0-9a-f-]{36}$/.test(to)) throw new UserError('Empfänger: VRChat-ID (usr_…).');
                    if (!this.app.chat) throw new UserError('Chat nicht verfügbar.');
                    await this.app.chat.send(to, '〰 Nexus-Muster „' + c.name + '“ (in Nexus unter Eigene Muster → 📥 importieren, Passwort bekommst du extra): ' + code);
                    return { ok: true, code, msg: '📤 Über den verschlüsselten Chat geschickt.' };
                }
                return { ok: true, code, msg: '📤 Code erstellt – Passwort getrennt weitergeben.' };
            }
            case 'toys_pattern_import': {
                const p = patDecrypt(input.code, str(input.pass));
                const list = this.cfg().custom.slice();
                if (list.length >= 20) throw new UserError('Höchstens 20 eigene Muster – erst eins löschen.');
                list.push({ id: 'c' + Date.now().toString(36).slice(-6), name: cut(str(p.name), 30) || 'Geteiltes Muster', steps: arr(p.steps), step_ms: p.step_ms });
                this.saveCfg({ custom: list });
                const got = this.cfg().custom[this.cfg().custom.length - 1];
                if (!got || got.name !== (cut(str(p.name), 30) || 'Geteiltes Muster')) throw new UserError('Muster ungültig.');
                return Object.assign(this.status(), { msg: '📥 „' + got.name + '“ übernommen.' });
            }
            case 'toys_pattern_preview': return { previews: Object.fromEntries(this.allPatterns().map(p => [p.id, this.patternPreview(p.id)])) };   // 8.2
            case 'toys_pattern': { const p = this.startPattern(input); return Object.assign(this.status(), { msg: (this.allPatterns().find(x => x.id === p.id) || {}).name + ' läuft' + (p.until ? ' (' + Math.round((p.until - p.start) / 1000) + ' s)' : '') + '.' }); }
            case 'toys_pattern_stop': {
                const p = this.pat; this.pat = null;
                if (p && !this.cfg().links_on) await this.set(p.device, 0);
                return Object.assign(this.status(), { msg: 'Muster aus.' });
            }
            case 'toys_surprise': { const s = this.surprise(); return Object.assign(this.status(), { msg: '🎁 Überraschung! (' + s + ' s)' }); }
            case 'toys_stats_reset': this.stats = { since: Date.now(), active: 0, peak: 0, patterns: 0 }; for (const d of this.devices.values()) d.secs = 0; return Object.assign(this.status(), { msg: 'Statistik zurückgesetzt.' });
            case 'toys_stop': return Object.assign(await this.stopAll(), { msg: '⏹ Alles gestoppt.' });
            // 4.1
            case 'toys_voice': this.voiceLv = clamp(input.lv); this.voiceAt = Date.now(); return { ok: true };
            case 'toys_consent': { const l = await this.setConsent(str(input.light)); return Object.assign(this.status(), { msg: { green: '🟢 Grün', yellow: '🟡 Gelb – sanfter', red: '🔴 Rot – alles gestoppt' }[l] }); }
            case 'toys_edge_release': this.lust.releaseUntil = Date.now() + 120000; this.lust.edgeHold = false; return Object.assign(this.status(), { msg: '🔓 Erlöst – 2 Minuten ohne Bremse.' });
            case 'toys_lust_reset': this.lust.v = 0; this.lust.hist = []; return Object.assign(this.status(), { msg: 'Lust-Meter zurückgesetzt.' });
            case 'toys_climax': this.climax('hand'); return Object.assign(this.status(), { msg: '💥 Höhepunkt!' });
            case 'toys_scene': { const s = this.startScene(input); return Object.assign(this.status(), { msg: '🎬 ' + s.name + ' – ' + Math.round((s.until - s.start) / 60000) + ' min' }); }
            case 'toys_scene_stop': if (this.scenes) this.scenes.stop(true); this.scene = null; this.session.due = this.cfg().aftercare.on; return Object.assign(await this.stopAll(), { msg: '🎬 Szene beendet – Zeit für Aftercare 💞' });
            case 'toys_pause_end': if (this.paused) { this.paused = null; this.pauseMsg = '▶ Pause beendet'; } for (const d of this.devices.values()) this.drive(d, true).catch(() => {}); return Object.assign(this.status(), { msg: '▶ Weiter geht\'s.' });
            case 'toys_aftercare_done': this.session.due = false; return Object.assign(this.status(), { msg: '💞 Danke fürs Kümmern!' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
    stop() { this.stopped = true; clearInterval(this.timer); clearInterval(this.linkTimer); clearInterval(this.driveTimer); clearTimeout(this.retryT); this.disconnect(); }
}

module.exports = { Toys, SRC, SRC_DEF, PATTERNS, PCS_ZONES };
