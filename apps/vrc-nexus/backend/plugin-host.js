'use strict';
/*
 * 3.6 Plugin-Prozess: läuft je Plugin in einem eigenen Node-Prozess mit dem Node-Rechtemodell
 * (--permission: nur der eigene Plugin-Ordner lesbar, nur der eigene Datenordner schreibbar, keine Programme/Worker/Addons).
 * Das Plugin bekommt NUR das Objekt `nexus`; alles, was die App betrifft (Chatbox, OSC, Hinweise, Speicher, Oberfläche),
 * läuft als Nachricht an die App und wird dort gegen die bei der Installation erlaubten Rechte geprüft.
 * argv: <Plugin-Ordner> <Hauptdatei> <JSON: { id, name, version, perms, app }>
 *
 * GEMEINSAM für VRC Nexus und D2 Nexus (gleiche Datei in beiden Apps): ein Plugin kann in beiden laufen.
 * nexus.app.id sagt, wo es gerade läuft ("vrc" oder "d2"). Bereiche der anderen App melden „nicht verfügbar“.
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { EventEmitter } = require('events');

const [dir, mainFile, metaJson] = process.argv.slice(2);
const meta = JSON.parse(metaJson || '{}');
const perms = new Set(meta.perms || []);
const send = process.send.bind(process);
process.on('disconnect', () => process.exit(0));                     // App beendet → Plugin auch

// ---------- Netz nur mit Recht „net“; interne Zugänge abklemmen ----------
if (!perms.has('net')) for (const k of ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest']) { try { delete globalThis[k]; } catch (e) { globalThis[k] = undefined; } }
for (const k of ['binding', '_linkedBinding', 'dlopen']) { try { process[k] = () => { throw new Error('Im Plugin nicht erlaubt.'); }; } catch (e) { /* egal */ } }
// Umwege zu eingebauten Modulen schließen (sonst käme ein Plugin z. B. ohne Recht „net“ an https)
const _send = process.send;
try { Object.defineProperty(process, 'getBuiltinModule', { value: undefined, configurable: false, writable: false }); } catch (e) { /* ältere Node-Version */ }
try { Object.defineProperty(process, 'mainModule', { value: undefined, configurable: false, writable: false }); } catch (e) { /* egal */ }
void _send;
const SAFE = new Set(['path', 'util', 'events', 'url', 'buffer', 'string_decoder', 'querystring', 'assert', 'crypto', 'timers', 'zlib']);
if (perms.has('net')) ['http', 'https', 'dns', 'net', 'tls'].forEach(m => SAFE.add(m));

// ---------- Aufrufe an die App ----------
let seq = 0;
const waiting = new Map();
function call(api, ...args) {
    return new Promise((resolve, reject) => {
        const id = ++seq;
        waiting.set(id, { resolve, reject });
        send({ t: 'call', id, api, args });
    });
}
const bus = new EventEmitter();
bus.on('error', () => {});
process.on('message', m => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'res') { const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id); if (m.error) w.reject(new Error(m.error)); else w.resolve(m.value); return; }
    if (m.t === 'event') { try { bus.emit(m.name, m.data); } catch (e) { log('error', 'Fehler im Ereignis „' + m.name + '“: ' + (e && e.stack || e)); } }
});
function log(level, ...a) { try { send({ t: 'log', level, text: a.map(x => (typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch (e) { return String(x); } })())).join(' ').slice(0, 2000) }); } catch (e) { /* egal */ } }
console.log = (...a) => log('info', ...a); console.info = console.log; console.debug = console.log;
console.warn = (...a) => log('warn', ...a); console.error = (...a) => log('error', ...a);
process.on('uncaughtException', e => { log('error', 'Absturz: ' + (e && e.stack || e)); setTimeout(() => process.exit(1), 50); });
process.on('unhandledRejection', e => log('error', 'Unbehandelter Fehler: ' + (e && e.stack || e)));

// ---------- die Schnittstelle fürs Plugin ----------
const nexus = Object.freeze({
    plugin: Object.freeze({ id: meta.id, name: meta.name, version: meta.version, permissions: [...perms] }),
    /** in welcher App läuft das Plugin? */
    app: Object.freeze({ id: String(meta.app || 'vrc'), name: meta.app === 'd2' ? 'D2 Nexus' : 'VRC Nexus', version: () => call('app.version') }),
    log: (...a) => log('info', ...a),
    /** Ereignisse: start, stop, ui (Klick/Eingabe), param (OSC-Wert, Recht „osc“), game (Spiel-Log, Recht „game“) */
    on: (name, fn) => { bus.on(String(name), fn); return nexus; },
    off: (name, fn) => { bus.off(String(name), fn); return nexus; },
    chatbox: Object.freeze({
        send: (text, opts) => call('chatbox.send', String(text), opts && typeof opts === 'object' ? { sound: opts.sound !== false } : {}),
        typing: on => call('chatbox.typing', !!on),
    }),
    osc: Object.freeze({
        /** Avatar-Parameter setzen: type „bool“ | „int“ | „float“ */
        set: (name, value, type) => call('osc.set', String(name), value, type || (typeof value === 'boolean' ? 'bool' : Number.isInteger(value) ? 'int' : 'float')),
        params: () => call('osc.params'),
    }),
    notify: (title, body) => call('notify', String(title), String(body || '')),
    storage: Object.freeze({
        get: (key, def) => call('storage.get', String(key)).then(v => (v === undefined ? def : v)),
        set: (key, value) => call('storage.set', String(key), value),
        all: () => call('storage.all'),
    }),
    /** Oberfläche: Liste von Bausteinen, die die App selbst zeichnet (kein eigenes HTML) */
    ui: Object.freeze({ set: items => call('ui.set', items) }),
    game: Object.freeze({ state: () => call('game.state') }),
    /** 3.8: VRChat-API für Gruppen-Plugins (Recht „vrchat“, nur Gruppen aus plugin.json, nur erlaubte Pfade) */
    vrchat: Object.freeze({
        get: (p, query) => call('vrchat', 'GET', String(p), query || {}),
        post: (p, body) => call('vrchat', 'POST', String(p), {}, body || {}),
        put: (p, body) => call('vrchat', 'PUT', String(p), {}, body || {}),
        delete: p => call('vrchat', 'DELETE', String(p), {}),
    }),
    /** 3.8: verschlüsselte Zugangsdaten (z. B. Bot-Tokens) – nur dieses Plugin kann sie lesen */
    secrets: Object.freeze({ get: k => call('secrets.get', String(k)), set: (k, v) => call('secrets.set', String(k), v), has: k => call('secrets.has', String(k)) }),
    /** nur D2 Nexus: Destiny-2-Daten lesen (Recht „destiny“) */
    destiny: Object.freeze({
        characters: () => call('destiny.characters'),
        inventory: () => call('destiny.inventory'),
        milestones: () => call('destiny.milestones'),
        vendors: characterId => call('destiny.vendors', characterId ? String(characterId) : ''),
        clan: () => call('destiny.clan'),
        activity: (membershipType, membershipId) => call('destiny.activity', Number(membershipType) || 0, String(membershipId || '')),
    }),
    /** beide Apps: GhostNode-Konto (Recht „ghostnode“) – Web-API mit der Anmeldung aus den App-Einstellungen; die Website prüft die Rechte */
    ghostnode: Object.freeze({
        status: () => call('ghostnode.status'),
        login: () => call('ghostnode.login'),
        get: (p, query) => call('ghostnode.get', String(p), query && typeof query === 'object' ? query : {}),
        post: (p, body) => call('ghostnode.post', String(p), body && typeof body === 'object' ? body : {}),
    }),
});

// ---------- Plugin laden ----------
const root = path.resolve(dir);
const cache = new Map();
function load(file) {
    const full = path.resolve(file);
    if (!full.startsWith(root + path.sep)) throw new Error('Datei außerhalb des Plugins: ' + file);
    if (cache.has(full)) return cache.get(full).exports;
    const module = { exports: {} };
    cache.set(full, module);
    const code = fs.readFileSync(full, 'utf8');
    const req = name => {
        name = String(name);
        if (name.startsWith('./') || name.startsWith('../')) { let f = path.resolve(path.dirname(full), name); if (!f.endsWith('.js') && !f.endsWith('.json')) f += '.js'; if (f.endsWith('.json')) { if (!f.startsWith(root + path.sep)) throw new Error('Datei außerhalb des Plugins.'); return JSON.parse(fs.readFileSync(f, 'utf8')); } return load(f); }
        const b = name.replace(/^node:/, '');
        if (SAFE.has(b)) return require(b);
        throw new Error('Modul „' + name + '“ ist im Plugin nicht erlaubt' + (['http', 'https', 'net', 'tls', 'dns'].includes(b) ? ' (Recht „net“ fehlt).' : '.'));
    };
    const fn = vm.compileFunction(code, ['require', 'module', 'exports', 'nexus', '__dirname', '__filename'], { filename: full });
    fn(req, module, module.exports, nexus, path.dirname(full), full);
    return module.exports;
}
try {
    const ex = load(path.join(root, mainFile));
    if (typeof ex === 'function') ex(nexus);
    else if (ex && typeof ex.start === 'function') nexus.on('start', () => ex.start(nexus));
    if (ex && typeof ex.stop === 'function') nexus.on('stop', () => ex.stop(nexus));
    send({ t: 'ready' });
} catch (e) {
    log('error', 'Plugin konnte nicht geladen werden: ' + (e && e.stack || e));
    setTimeout(() => process.exit(2), 50);
}
