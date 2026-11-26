'use strict';
/*
 * 3.6 Plugin-System (nur Windows-/PC-App) – der Client ist nur der Lader:
 *   - Paketformat „.nxp“ (ZIP mit plugin.json, siehe docs/PLUGINS.md), Installation nur aus einer Datei, die du selbst auswählst.
 *   - Vor der Installation zeigt die App Name, Autor:in und die verlangten Rechte; erst nach Bestätigung wird entpackt.
 *   - Jedes Plugin läuft in einem eigenen Prozess mit dem Node-Rechtemodell (nur eigener Ordner lesbar, nur eigener
 *     Datenordner schreibbar, keine Programme, keine Worker, keine Addons; Netz nur mit Recht „net“).
 *   - Alles, was die App betrifft, geht über Nachrichten an diese Klasse und wird gegen die erlaubten Rechte geprüft
 *     und gedrosselt (Chatbox, OSC, Hinweise). Die Oberfläche eines Plugins sind nur Bausteine, die die App selbst zeichnet.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const { readZip } = require('./nxp');
const { str, int, cut, UserError } = require('./util');

const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const PERMS = {
    chatbox: ['💬', 'Text in die VRChat-Chatbox senden'],
    osc: ['📡', 'Avatar-Parameter lesen und setzen (OSC)'],
    notify: ['🔔', 'Windows-Hinweise anzeigen'],
    game: ['🎮', 'Spiel-Ereignisse sehen (Welt betreten, Spieler kommen/gehen)'],
    net: ['🌐', 'Ins Internet verbinden'],
    vrchat: ['🛡', 'VRChat-Gruppe verwalten – nur die genannte(n) Gruppe(n), mit deinem Konto'],   // 3.8
};
const GRP = /^grp_[0-9a-f-]{36}$/;
/** 3.8: erlaubte VRChat-Aufrufe für Gruppen-Plugins (nur Gruppen aus plugin.json; nie Gruppe löschen/übertragen, nie Konto-Daten) */
function vrcAllowed(method, path, groups) {
    let m;
    if (method === 'GET' && /^\/users\/usr_[0-9a-f-]{36}$/.test(path)) return true;
    if (method === 'GET' && /^\/worlds\/wrld_[0-9a-f-]{36}$/.test(path)) return true;
    if (!(m = /^\/groups\/(grp_[0-9a-f-]{36})(?:\/(.*))?$/.exec(path)) || !groups.includes(m[1])) return false;
    const sub = m[2] || '';
    if (method === 'GET') return /^(|instances|requests|posts|members|members\/usr_[0-9a-f-]{36}|bans|auditLogs|roles|invites|announcement)$/.test(sub);
    if (method === 'POST') return /^(posts|bans|invites)$/.test(sub);
    if (method === 'PUT') return /^(requests\/usr_[0-9a-f-]{36}|members\/usr_[0-9a-f-]{36})$/.test(sub);
    if (method === 'DELETE') return /^(posts\/gpst_[0-9a-f-]{36}|members\/usr_[0-9a-f-]{36}|bans\/usr_[0-9a-f-]{36}|invites\/usr_[0-9a-f-]{36})$/.test(sub);
    return false;
}
const UI_TYPES = new Set(['heading', 'text', 'button', 'input', 'toggle', 'list', 'stat', 'divider', 'select']);
const LOG_KEEP = 200, STORE_MAX = 512 * 1024, RESTARTS = 3;

function versionAtLeast(have, need) {
    const a = str(have).split('.').map(Number), b = str(need).replace(/^>=\s*/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((a[i] || 0) > (b[i] || 0)) return true; if ((a[i] || 0) < (b[i] || 0)) return false; }
    return true;
}

/** plugin.json prüfen → bereinigtes Manifest */
function checkManifest(files, appVersion) {
    if (!files['plugin.json']) throw new UserError('plugin.json fehlt im Paket.');
    let m;
    try { m = JSON.parse(files['plugin.json'].toString('utf8')); } catch (e) { throw new UserError('plugin.json ist kein gültiges JSON.'); }
    if (!m || typeof m !== 'object') throw new UserError('plugin.json ist leer.');
    if (int(m.format) !== 1) throw new UserError('Unbekanntes Plugin-Format (erwartet „format“: 1).');
    if (!ID.test(str(m.id))) throw new UserError('Ungültige Plugin-ID (nur a–z, 0–9 und „-“, 2–40 Zeichen).');
    // zuerst die Mindestversion – sonst meldet eine ältere App bei neuen Rechten nur „Unbekannte Rechte“
    if (m.nexus && !versionAtLeast(appVersion, m.nexus)) throw new UserError('Das Plugin braucht VRC Nexus ' + str(m.nexus).replace(/^>=\s*/, '') + ' oder neuer.');
    const main = str(m.main || 'main.js');
    if (!files[main] || !main.endsWith('.js')) throw new UserError('Die Hauptdatei „' + cut(main, 60) + '“ fehlt.');
    const perms = [...new Set([].concat(m.permissions || []).map(str))];
    const bad = perms.filter(p => !PERMS[p]);
    if (bad.length) throw new UserError('Unbekannte Rechte: ' + bad.join(', '));
    const groups = [...new Set([].concat(m.groups || []).map(str))];
    if (groups.some(g => !GRP.test(g))) throw new UserError('Ungültige Gruppen-ID in plugin.json (grp_…).');
    if (groups.length > 5) throw new UserError('Höchstens 5 Gruppen je Plugin.');
    if (perms.includes('vrchat') && !groups.length) throw new UserError('Recht „vrchat“ braucht „groups“: ["grp_…"] in plugin.json.');
    return {
        id: str(m.id), name: cut(str(m.name).trim(), 60) || str(m.id), version: cut(str(m.version || '0.0.0'), 20), author: cut(str(m.author).trim(), 60),
        description: cut(str(m.description).trim(), 400), icon: cut(str(m.icon || '🧩'), 4), main, nexus: cut(str(m.nexus || ''), 20), permissions: perms,
        homepage: /^https:\/\/\S+$/.test(str(m.homepage)) ? cut(str(m.homepage), 200) : '', groups: perms.includes('vrchat') ? groups : [],
    };
}

/** Bausteine der Plugin-Oberfläche bereinigen (die App zeichnet sie selbst, alles wird escaped) */
function cleanUi(items) {
    if (!Array.isArray(items)) throw new Error('ui.set erwartet eine Liste.');
    return items.slice(0, 100).filter(x => x && UI_TYPES.has(x.type)).map(x => {
        const o = { type: x.type };
        if (x.id !== undefined) o.id = cut(str(x.id).replace(/[^\w-]/g, ''), 40);
        for (const k of ['label', 'placeholder']) if (x[k] !== undefined) o[k] = cut(str(x[k]), 200);
        if (x.text !== undefined) o.text = cut(str(x.text), 2000);
        if (x.value !== undefined) o.value = typeof x.value === 'boolean' ? x.value : cut(str(x.value), 2000);
        if (x.multiline) o.multiline = true;
        if (x.secret) o.secret = true;   // 3.8: Passwort-Feld (Wert wird nie angezeigt)
        if (x.type === 'select' && Array.isArray(x.options)) o.options = x.options.slice(0, 50).map(op => Array.isArray(op) ? [cut(str(op[0]), 100), cut(str(op[1] === undefined ? op[0] : op[1]), 100)] : [cut(str(op), 100), cut(str(op), 100)]);
        if (x.style && ['gold', 'danger', ''].includes(x.style)) o.style = x.style;
        if (Array.isArray(x.items)) o.items = x.items.slice(0, 50).map(i => cut(str(i), 300));
        return o;
    });
}

class Plugins {
    constructor(app) {
        this.app = app;
        this.run = {};            // id → { child, ready, ui, logs, restarts, last }
        this.pending = {};        // Prüf-Token → { files, manifest, at }
        this.flag = null;         // funktionierende Rechtemodell-Option
    }
    get base() { return path.join((this.app.tools && this.app.tools.userData) || require('os').tmpdir(), 'plugins'); }
    codeDir(id) { return path.join(this.base, 'installed', id); }
    dataDir(id) { return path.join(this.base, 'data', id); }
    state() { try { return JSON.parse(this.app.db.setting('plugins_state', '') || '{}') || {}; } catch (e) { return {}; } }
    saveState(s) { this.app.db.setSetting('plugins_state', JSON.stringify(s)); }
    manifest(id) { try { return JSON.parse(fs.readFileSync(path.join(this.codeDir(id), '.manifest.json'), 'utf8')); } catch (e) { return null; } }
    version() { return require('./vrchat').VERSION; }
    mk() { if (!this.market) { const { Market } = require('./market'); this.market = new Market(this.app); } return this.market; }

    // ---------------- Installieren ----------------
    inspect(buf) {
        const files = readZip(buf), m = checkManifest(files, this.version());
        for (const k of Object.keys(this.pending)) if (Date.now() - this.pending[k].at > 600000) delete this.pending[k];
        const token = crypto.randomBytes(12).toString('hex');
        this.pending[token] = { files, manifest: m, at: Date.now() };
        const old = this.manifest(m.id);
        return { token, manifest: m, files: Object.keys(files).length, size: Object.values(files).reduce((a, b) => a + b.length, 0),
            update: old ? old.version : '', perms: m.permissions.map(p => ({ id: p, icon: PERMS[p][0], label: PERMS[p][1] + (p === 'vrchat' ? ': ' + m.groups.join(', ') : '') })) };
    }
    async install(token) {
        const p = this.pending[str(token)];
        if (!p) throw new UserError('Die Prüfung ist abgelaufen – bitte die Datei noch einmal auswählen.');
        delete this.pending[str(token)];
        const m = p.manifest, dest = this.codeDir(m.id), tmp = dest + '.tmp-' + Date.now();
        await this.stopOne(m.id);
        fs.mkdirSync(tmp, { recursive: true });
        try {
            for (const [name, data] of Object.entries(p.files)) {
                const f = path.join(tmp, ...name.split('/'));
                if (!f.startsWith(tmp + path.sep)) throw new UserError('Unerlaubter Pfad.');
                fs.mkdirSync(path.dirname(f), { recursive: true });
                fs.writeFileSync(f, data);
            }
            fs.writeFileSync(path.join(tmp, '.manifest.json'), JSON.stringify(m));
            fs.rmSync(dest, { recursive: true, force: true });
            fs.renameSync(tmp, dest);
        } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
        fs.mkdirSync(this.dataDir(m.id), { recursive: true });
        const s = this.state();
        s[m.id] = { enabled: true, perms: m.permissions, groups: m.groups || [], installed: Date.now() };   // Rechte = genau die bestätigten
        this.saveState(s);
        await this.startOne(m.id);
        return m;
    }
    async remove(id) {
        if (!ID.test(str(id))) throw new UserError('Unbekanntes Plugin.');
        await this.stopOne(id);
        fs.rmSync(this.codeDir(id), { recursive: true, force: true });
        fs.rmSync(this.dataDir(id), { recursive: true, force: true });
        const s = this.state(); delete s[id]; this.saveState(s);
        delete this.run[id];
    }
    list() {
        const s = this.state();
        return Object.keys(s).map(id => {
            const m = this.manifest(id), r = this.run[id] || {};
            if (!m) return null;
            return Object.assign({}, m, { enabled: !!s[id].enabled, perms: (s[id].perms || []).map(p => ({ id: p, icon: (PERMS[p] || ['?'])[0], label: (PERMS[p] || ['', p])[1] + (p === 'vrchat' ? ': ' + (s[id].groups || []).join(', ') : '') })),
                status: r.child && r.ready ? 'running' : r.child ? 'starting' : r.error ? 'error' : 'stopped', error: r.error || '', ui: r.ui || [] });
        }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    }

    // ---------------- Starten / Stoppen ----------------
    start() { for (const [id, s] of Object.entries(this.state())) if (s.enabled) this.startOne(id).catch(() => {}); this.hookOsc(); }
    stop() { for (const id of Object.keys(this.run)) this.stopOne(id); }
    hookOsc() {
        const osc = this.app.game && this.app.game.osc;
        if (!osc || osc.__plugins) return;
        const prev = osc.onMessage;
        osc.onMessage = (a, args) => { if (prev) prev(a, args); this.onOsc(a, args); };
        osc.__plugins = true;
    }
    /** eigene Kopie des Prozess-Skripts (in der fertigen App liegt das Original im app.asar-Archiv) */
    hostFile() {
        const f = path.join(this.base, 'host', 'plugin-host.js'), src = fs.readFileSync(path.join(__dirname, 'plugin-host.js'), 'utf8');
        fs.mkdirSync(path.dirname(f), { recursive: true });
        let cur = ''; try { cur = fs.readFileSync(f, 'utf8'); } catch (e) { /* neu */ }
        if (cur !== src) fs.writeFileSync(f, src);
        return f;
    }
    async startOne(id) {
        const s = this.state()[id], m = this.manifest(id);
        if (!s || !m) throw new UserError('Plugin nicht gefunden.');
        if (this.run[id] && this.run[id].child) return;
        const r = this.run[id] = Object.assign(this.run[id] || { logs: [], restarts: [] }, { error: '', ready: false, ui: (this.run[id] || {}).ui || [] });
        const host = this.hostFile(), code = this.codeDir(id), data = this.dataDir(id);
        fs.mkdirSync(data, { recursive: true });
        const flags = this.flag ? [this.flag] : ['--permission', '--experimental-permission'];
        for (const flag of flags) {
            const ok = await this.spawn(id, r, flag, host, code, data, m, s);
            if (ok === 'bad-flag') continue;
            if (ok) this.flag = flag;
            return;
        }
        r.error = 'Diese App-Version kann Plugins nicht abgeschottet starten – Plugin bleibt aus.';
        this.addLog(id, 'error', r.error);
    }
    spawn(id, r, flag, host, code, data, m, s) {
        return new Promise(resolve => {
            const env = { NODE_ENV: 'production' };
            for (const k of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[k]) env[k] = process.env[k];
            if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
            let child;
            try {
                child = cp.fork(host, [code, m.main, JSON.stringify({ id, name: m.name, version: m.version, perms: s.perms || [] })], {
                    execPath: process.execPath, env, cwd: data, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true, serialization: 'json',
                    execArgv: [flag, '--allow-fs-read=' + code, '--allow-fs-read=' + host, '--allow-fs-write=' + data, '--max-old-space-size=128', '--disallow-code-generation-from-strings'],
                });
            } catch (e) { r.error = e.message; return resolve(false); }
            r.child = child;
            let err = '', settled = false;
            const done = v => { if (!settled) { settled = true; resolve(v); } };
            child.stderr.on('data', d => { err = (err + d).slice(-2000); });
            child.on('message', msg => this.onMessage(id, child, msg).then(() => { if (msg && msg.t === 'ready') done(true); }));
            child.on('error', e => { r.error = e.message; done(false); });
            child.on('exit', code_ => {
                if (r.child === child) { r.child = null; r.ready = false; }
                if (!settled && /bad option|unknown option|not allowed in NODE_OPTIONS/i.test(err)) return done('bad-flag');
                if (r.stopping) { r.stopping = false; return done(false); }
                if (code_ !== 0) {
                    r.error = 'Plugin beendet (Code ' + code_ + ')' + (err ? ': ' + err.trim().split('\n').slice(-2).join(' ') : '');
                    this.addLog(id, 'error', r.error);
                    const now = Date.now(); r.restarts = (r.restarts || []).filter(t => now - t < 300000);
                    if (settled && r.restarts.length < RESTARTS && (this.state()[id] || {}).enabled) { r.restarts.push(now); setTimeout(() => this.startOne(id).catch(() => {}), 2000); }
                }
                done(false);
            });
            const t = setTimeout(() => done(!!r.ready), 15000); if (t.unref) t.unref();
        });
    }
    stopOne(id) {
        const r = this.run[id];
        if (!r || !r.child) return Promise.resolve();
        const c = r.child;
        r.stopping = true;
        return new Promise(res => {
            const t = setTimeout(() => { try { c.kill(); } catch (e) { /* egal */ } res(); }, 1500);
            c.once('exit', () => { clearTimeout(t); res(); });
            try { c.send({ t: 'event', name: 'stop' }); setTimeout(() => { try { c.disconnect(); } catch (e) { /* egal */ } }, 300); } catch (e) { try { c.kill(); } catch (x) { /* egal */ } }
        }).then(() => { r.child = null; r.ready = false; });
    }
    emit(id, name, data) { const r = this.run[id]; if (r && r.child && r.ready) { try { r.child.send({ t: 'event', name, data }); } catch (e) { /* egal */ } } }
    has(id, perm) { const s = this.state()[id]; return !!(s && (s.perms || []).includes(perm)); }
    addLog(id, level, text) { const r = this.run[id] = this.run[id] || { logs: [], restarts: [] }; r.logs.push({ at: Date.now(), level, text: cut(str(text), 2000) }); if (r.logs.length > LOG_KEEP) r.logs.splice(0, r.logs.length - LOG_KEEP); }

    // ---------------- Ereignisse aus der App ----------------
    onGameEvent(e) { for (const id of Object.keys(this.run)) if (this.has(id, 'game')) this.emit(id, 'game', { kind: e.kind, ts: e.ts, world: e.world || e.world_name || '', player: e.player || e.name || '' }); }
    onOsc(a, args) {
        if (!/^\/avatar\/parameters\//.test(a)) return;
        for (const id of Object.keys(this.run)) if (this.has(id, 'osc')) this.emit(id, 'param', { name: a.slice(19), value: args && args[0] });
    }

    // ---------------- Nachrichten vom Plugin ----------------
    async onMessage(id, child, msg) {
        if (!msg || typeof msg !== 'object') return;
        const r = this.run[id];
        if (!r || r.child !== child) return;
        if (msg.t === 'ready') { r.ready = true; r.error = ''; this.emit(id, 'start', {}); return; }
        if (msg.t === 'log') return this.addLog(id, ['info', 'warn', 'error'].includes(msg.level) ? msg.level : 'info', msg.text);
        if (msg.t !== 'call') return;
        let value, error;
        try { value = await this.api(id, r, str(msg.api), Array.isArray(msg.args) ? msg.args : []); } catch (e) { error = e.message || String(e); }
        try { child.send({ t: 'res', id: msg.id, value, error }); } catch (e) { /* Plugin schon weg */ }
    }
    need(id, perm) { if (!this.has(id, perm)) throw new Error('Recht „' + perm + '“ fehlt (in plugin.json unter „permissions“ eintragen).'); }
    throttle(r, key, ms) { const now = Date.now(); r.t = r.t || {}; if (now - (r.t[key] || 0) < ms) throw new Error('Zu schnell – bitte etwas warten.'); r.t[key] = now; }
    async api(id, r, name, a) {
        const g = this.app.game;
        switch (name) {
            case 'chatbox.send': {
                this.need(id, 'chatbox'); this.throttle(r, 'chat', 1500);
                if (g.isPrivate && g.isPrivate()) throw new Error('Privatmodus aktiv – Chatbox gesperrt.');
                await g.oscSend('chatbox', { text: cut(str(a[0]), 400), sound: a[1] && a[1].sound === false ? '' : '1', split: '1' });
                return true;
            }
            case 'chatbox.typing': this.need(id, 'chatbox'); await g.oscSend('typing', { on: a[0] ? '1' : '' }); return true;
            case 'osc.set': {
                this.need(id, 'osc');
                r.oscN = (r.oscW === Math.floor(Date.now() / 1000) ? r.oscN : 0) + 1; r.oscW = Math.floor(Date.now() / 1000);
                if (r.oscN > 30) throw new Error('Zu viele OSC-Nachrichten (höchstens 30 pro Sekunde).');
                const pn = str(a[0]).replace(/^\/?(avatar\/parameters\/)?/, '');
                if (!/^[\w./ -]{1,100}$/.test(pn)) throw new Error('Ungültiger Parametername.');
                const type = ['bool', 'int', 'float'].includes(a[2]) ? a[2] : 'float';
                await g.oscSend('param', { name: pn, type, value: type === 'bool' ? (a[1] ? '1' : '') : String(Number(a[1]) || 0) });
                return true;
            }
            case 'osc.params': this.need(id, 'osc'); return Object.fromEntries(Object.entries((g.osc && g.osc.params) || {}).slice(0, 500));
            case 'notify': {
                this.need(id, 'notify'); this.throttle(r, 'notify', 5000);
                const host = this.app.tools && this.app.tools.host;
                if (host && host.notify) host.notify(cut((this.manifest(id) || {}).name + ': ' + str(a[0]), 120), cut(str(a[1]), 300), false);
                return true;
            }
            case 'storage.get': return this.store(id)[str(a[0])];
            case 'storage.all': return this.store(id);
            case 'storage.set': {
                const st = this.store(id), k = cut(str(a[0]), 100);
                if (a[1] === undefined || a[1] === null) delete st[k]; else st[k] = a[1];
                const json = JSON.stringify(st);
                if (json.length > STORE_MAX) throw new Error('Plugin-Speicher voll (höchstens 512 KB).');
                fs.writeFileSync(path.join(this.dataDir(id), 'storage.json'), json);
                r.store = st;
                return true;
            }
            case 'ui.set': r.ui = cleanUi(a[0]); return true;
            // ---- 3.8: VRChat-Gruppe (nur erlaubte Pfade der eigenen Gruppen) ----
            case 'vrchat': {
                this.need(id, 'vrchat');
                const method = str(a[0]).toUpperCase(), p = str(a[1]).split('?')[0];
                const groups = (this.state()[id] || {}).groups || [];
                if (!vrcAllowed(method, p, groups)) throw new Error('VRChat-Aufruf nicht erlaubt: ' + method + ' ' + cut(p, 80));
                const now = Date.now(); r.vq = (r.vq || []).filter(t => now - t < 10000);
                if (r.vq.length >= 20) throw new Error('Zu viele VRChat-Anfragen – höchstens 20 in 10 Sekunden.');
                r.vq.push(now);
                const acc = this.app.vrc && this.app.vrc.account();
                if (!acc) throw new Error('Nicht mit VRChat angemeldet.');
                const q = a[2] && typeof a[2] === 'object' ? Object.fromEntries(Object.entries(a[2]).slice(0, 10).map(([k, v]) => [cut(str(k), 30), cut(str(v), 200)])) : {};
                const body = a[3] && typeof a[3] === 'object' ? a[3] : null;
                if (body && JSON.stringify(body).length > 20000) throw new Error('Anfrage zu groß.');
                return await this.app.vrc.call(acc, method, p, q, body);
            }
            // ---- 3.8: verschlüsselter Speicher für Zugangsdaten (Bot-Tokens) – nie in der Oberfläche sichtbar ----
            case 'secrets.get': return this.secrets(id)[cut(str(a[0]), 60)];
            case 'secrets.has': return this.secrets(id)[cut(str(a[0]), 60)] !== undefined;
            case 'secrets.set': {
                const sec = this.secrets(id), k = cut(str(a[0]), 60);
                if (a[1] === null || a[1] === undefined || a[1] === '') delete sec[k]; else sec[k] = cut(str(a[1]), 2000);
                if (Object.keys(sec).length > 30) throw new Error('Höchstens 30 Zugangsdaten je Plugin.');
                fs.writeFileSync(path.join(this.dataDir(id), 'secrets.enc'), this.crypt().encrypt(JSON.stringify(sec)));
                return true;
            }
            case 'game.state': { this.need(id, 'game'); const st = g.state || {}; return { running: !!st.running, world: str(st.world_name || st.world || ''), players: Array.isArray(st.players) ? st.players.length : int(st.players) }; }
            case 'app.version': return this.version();
            default: throw new Error('Unbekannte Funktion: ' + name);
        }
    }
    crypt() { const c = this.app.vrc && this.app.vrc.crypt; if (!c) throw new Error('Verschlüsselung nicht verfügbar.'); return c; }
    secrets(id) {
        const r = this.run[id] = this.run[id] || { logs: [], restarts: [] };
        if (!r.sec) { try { r.sec = JSON.parse(this.crypt().decrypt(fs.readFileSync(path.join(this.dataDir(id), 'secrets.enc'), 'utf8'))) || {}; } catch (e) { r.sec = {}; } }
        return r.sec;
    }
    store(id) {
        const r = this.run[id] = this.run[id] || { logs: [], restarts: [] };
        if (!r.store) { try { r.store = JSON.parse(fs.readFileSync(path.join(this.dataDir(id), 'storage.json'), 'utf8')); } catch (e) { r.store = {}; } }
        return r.store;
    }

    // ---------------- Oberfläche ----------------
    example() { return path.join(__dirname, '..', 'plugins', 'text-plugin.nxp'); }
    async action(act, input, files) {
        switch (act) {
            case 'plug_open': {   // 3.8: Plugin-Ordner im Explorer öffnen
                const host = this.app.tools && this.app.tools.host, dir = str(input.id) && ID.test(str(input.id)) ? this.codeDir(str(input.id)) : this.base;
                fs.mkdirSync(dir, { recursive: true });
                if (host && host.openPath) host.openPath(dir);
                return { ok: true, path: dir };
            }
            case 'plug_list': return { items: this.list(), perms: PERMS, example: fs.existsSync(this.example()), dir: this.base };
            case 'plug_inspect': {
                let buf = files && files.file && files.file.buffer;
                if (input.example === '1') buf = fs.readFileSync(this.example());
                if (!buf) throw new UserError('Bitte eine .nxp-Datei auswählen.');
                return this.inspect(buf);
            }
            // 4.4: Marktplatz
            case 'plug_market': return await this.mk().list(input.refresh === '1');
            case 'plug_market_get': return await this.mk().get(str(input.id));
            case 'plug_market_relearn': return this.mk().relearn();
            case 'plug_install': { const m = await this.install(input.token); return { items: this.list(), msg: m.name + ' ' + m.version + ' installiert.' }; }
            case 'plug_toggle': {
                const id = str(input.id), s = this.state();
                if (!s[id]) throw new UserError('Plugin nicht gefunden.');
                s[id].enabled = input.on === '1'; this.saveState(s);
                if (s[id].enabled) { if (this.run[id]) this.run[id].restarts = []; await this.startOne(id); } else await this.stopOne(id);
                return { items: this.list() };
            }
            case 'plug_restart': { const id = str(input.id); await this.stopOne(id); if (this.run[id]) this.run[id].restarts = []; await this.startOne(id); return { items: this.list() }; }
            case 'plug_remove': await this.remove(str(input.id)); return { items: this.list(), msg: 'Plugin entfernt.' };
            case 'plug_log': { const r = this.run[str(input.id)] || {}; return { logs: (r.logs || []).slice(-LOG_KEEP) }; }
            case 'plug_ui': {   // Klick / Eingabe in der Plugin-Oberfläche
                const id = str(input.id);
                if (!this.state()[id]) throw new UserError('Plugin nicht gefunden.');
                let values = {};
                try { values = JSON.parse(str(input.values) || '{}'); } catch (e) { values = {}; }
                const v = {}; for (const [k, x] of Object.entries(values).slice(0, 100)) v[cut(str(k), 40)] = typeof x === 'boolean' ? x : cut(str(x), 2000);
                this.emit(id, 'ui', { type: str(input.type) === 'change' ? 'change' : 'click', id: cut(str(input.el), 40), value: typeof values[str(input.el)] === 'boolean' ? values[str(input.el)] : v[str(input.el)], values: v });
                await new Promise(res => setTimeout(res, 250));   // dem Plugin kurz Zeit für ui.set geben
                return { items: this.list() };
            }
            default: throw new UserError('Unbekannte Plugin-Aktion.');
        }
    }
}

module.exports = { Plugins, checkManifest, cleanUi, PERMS, vrcAllowed };
