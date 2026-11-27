'use strict';
/*
 * 8.0.19 Uhren-Installer über ADB: Nexus Watch vom PC aus auf die Uhr bringen oder aktualisieren.
 * Die Uhr installiert nichts mehr selbst (Wear OS blockiert Installationen aus dem Hintergrund oft) – sie meldet nur
 * „Update verfügbar“. Hier am PC:
 *   1. adb finden (eigener Ordner, Android-SDK, PATH) – oder auf Klick Googles „Platform-Tools“ laden (nur adb wird entpackt)
 *   2. Uhr koppeln: Entwickleroptionen → „Kabelloses Debugging“ → „Mit Kopplungscode koppeln“ (IP:Port + 6-stelliger Code)
 *   3. verbinden (IP:Port aus „Kabelloses Debugging“) und die neueste VRC-Nexus-Watch-…-wearos.apk aus dem Release installieren
 * Nur Uhren (ro.build.characteristics enthält „watch“), nur Downloads aus dem eigenen GitHub-Release bzw. von dl.google.com.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { UserError } = require('./util');
const { readZip } = require('./nxp');

const REPO = 'ghostnode-labs/vrc_nexus';
const APK = /^VRC-Nexus-Watch-(\d+)\.(\d+)\.(\d+)-wearos\.apk$/;
const FACE = /^VRC-Nexus-WatchFace-(\d+)\.(\d+)\.(\d+)-wearos\.apk$/;   // 8.1.1: Zifferblatt (Watch Face Format)
const FACE_PKG = 'dev.ghostnode.nexuswatch.face';
/** 8.2: Kacheln der Uhr-App (Wear OS Tiles) – per ADB in den Kachel-Karussell legen (Entwickler-Befehl „add-tile“) */
const TILES = { status: 'StatusTile', quick: 'QuickTile', toys: 'ToyTile' };
const TILE_PKG = 'dev.ghostnode.nexuswatch';
const RELEASE_DL = 'https://github.com/' + REPO + '/releases/download/';
const PT_URL = { win32: 'windows', darwin: 'darwin', linux: 'linux' };
const ADB_FILES = /^platform-tools\/(adb(\.exe)?|AdbWinApi\.dll|AdbWinUsbApi\.dll|libwinpthread-1\.dll)$/;
const HOSTPORT = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d):\d{2,5}$/;
const SERIAL = /^[A-Za-z0-9._:-]{1,80}$/;

class WatchInstall {
    /** app: NexusApp; opts: exec/fetch/dir für Tests */
    constructor(app, opts = {}) {
        this.app = app;
        this.exec = opts.exec || ((file, args, ms) => new Promise(res => execFile(file, args, { windowsHide: true, timeout: ms, maxBuffer: 4 * 1024 * 1024 },
            (e, out, err) => res({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out: String(out || '') + String(err || ''), timeout: !!(e && e.killed) }))));
        this.fetch = opts.fetch || ((u, o) => fetch(u, o));
        this.dir = opts.dir || path.join((app && app.tools && app.tools.userData) || path.join(os.tmpdir(), 'vrc-nexus'), 'watch-install');
        this.platform = opts.platform || process.platform;
        this.busy = '';
        this.log = [];
    }
    say(m) { this.log.push(m); if (this.log.length > 30) this.log.shift(); }
    api() { return (process.env.NEXUS_UPDATE_API || 'https://api.github.com').replace(/\/+$/, ''); }
    exe() { return this.platform === 'win32' ? 'adb.exe' : 'adb'; }

    /** adb suchen: eigener Ordner → ADB-Variable → Android-SDK → PATH */
    findAdb() {
        const home = os.homedir(), x = this.exe(), c = [path.join(this.dir, 'platform-tools', x)];
        if (process.env.ADB) c.push(process.env.ADB);
        if (process.env.ANDROID_HOME) c.push(path.join(process.env.ANDROID_HOME, 'platform-tools', x));
        if (process.env.ANDROID_SDK_ROOT) c.push(path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', x));
        if (this.platform === 'win32' && process.env.LOCALAPPDATA) c.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', x));
        if (this.platform === 'darwin') c.push(path.join(home, 'Library', 'Android', 'sdk', 'platform-tools', x));
        if (this.platform === 'linux') c.push(path.join(home, 'Android', 'Sdk', 'platform-tools', x), '/usr/bin/adb', '/usr/local/bin/adb');
        for (const d of String(process.env.PATH || '').split(path.delimiter)) if (d) c.push(path.join(d, x));
        for (const f of c) { try { if (fs.statSync(f).isFile()) return f; } catch (e) { /* weiter */ } }
        return '';
    }
    async adb(args, ms = 20000) {
        const a = this.findAdb();
        if (!a) throw new UserError('adb fehlt – zuerst „ADB laden“ tippen.');
        const r = await this.exec(a, args, ms);
        if (r.timeout) throw new UserError('adb antwortet nicht (Zeitüberschreitung).');
        return r;
    }

    /** Googles Platform-Tools laden und nur adb (+ DLLs unter Windows) entpacken */
    async getAdb() {
        const k = PT_URL[this.platform];
        if (!k) throw new UserError('Für dieses System gibt es keine Platform-Tools.');
        const url = 'https://dl.google.com/android/repository/platform-tools-latest-' + k + '.zip';
        this.say('Lade Platform-Tools von Google …');
        let r;
        try { r = await this.fetch(url, { signal: AbortSignal.timeout(120000) }); } catch (e) { throw new UserError('Download der Platform-Tools fehlgeschlagen.'); }
        if (!r.ok) throw new UserError('Download der Platform-Tools: HTTP ' + r.status + '.');
        const buf = Buffer.from(await r.arrayBuffer());
        const files = readZip(buf, { limits: { files: 5000, total: 80 * 1048576, file: 40 * 1048576, packed: 80 * 1048576 }, only: n => ADB_FILES.test(n) });
        if (!files['platform-tools/' + this.exe()]) throw new UserError('adb nicht im Paket gefunden.');
        const out = path.join(this.dir, 'platform-tools');
        fs.mkdirSync(out, { recursive: true });
        for (const [n, data] of Object.entries(files)) {
            const f = path.join(out, path.basename(n));
            fs.writeFileSync(f, data);
            if (this.platform !== 'win32') fs.chmodSync(f, 0o755);
        }
        this.say('✔ adb bereit.');
        return path.join(out, this.exe());
    }

    /** verbundene Geräte: [{ serial, state, model }] */
    async devices() {
        if (!this.findAdb()) return [];
        const r = await this.adb(['devices', '-l'], 15000);
        return r.out.split(/\r?\n/).slice(1).map(l => l.trim()).filter(Boolean).map(l => {
            const p = l.split(/\s+/), m = /model:(\S+)/.exec(l);
            return { serial: p[0], state: p[1] || '', model: m ? m[1].replace(/_/g, ' ') : '' };
        }).filter(d => SERIAL.test(d.serial));
    }
    async pair(hp, code) {
        hp = String(hp || '').trim(); code = String(code || '').replace(/\s+/g, '');
        if (!HOSTPORT.test(hp)) throw new UserError('Adresse wie 192.168.1.50:37123 eingeben (aus „Mit Kopplungscode koppeln“).');
        if (!/^\d{6}$/.test(code)) throw new UserError('Der Kopplungscode hat 6 Ziffern.');
        const r = await this.adb(['pair', hp, code], 25000);
        if (!/success/i.test(r.out)) throw new UserError('Koppeln fehlgeschlagen: ' + (r.out.trim().split(/\r?\n/).pop() || 'keine Antwort').slice(0, 160));
        this.say('✔ Gekoppelt mit ' + hp);
        return true;
    }
    async connect(hp) {
        hp = String(hp || '').trim();
        if (!HOSTPORT.test(hp)) throw new UserError('Adresse wie 192.168.1.50:41234 eingeben (oben in „Kabelloses Debugging“).');
        const r = await this.adb(['connect', hp], 20000);
        if (!/connected to|already connected/i.test(r.out)) throw new UserError('Verbinden fehlgeschlagen: ' + (r.out.trim() || 'keine Antwort').slice(0, 160));
        this.say('✔ Verbunden mit ' + hp);
        return hp;
    }

    /** neueste Uhr-APK aus den Releases: { version, code, url, size, name } */
    async latest(rx = APK) {
        let best = null;
        for (let page = 1; page <= 3; page++) {
            let r;
            try { r = await this.fetch(this.api() + '/repos/' + REPO + '/releases?per_page=100&page=' + page, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'VRC-Nexus-WatchInstall' }, signal: AbortSignal.timeout(20000) }); }
            catch (e) { throw new UserError('GitHub nicht erreichbar.'); }
            if (r.status === 403 || r.status === 429) throw new UserError('GitHub hat die Anfrage gerade begrenzt – später noch einmal versuchen.');
            if (!r.ok) throw new UserError('GitHub antwortet mit HTTP ' + r.status + '.');
            const list = await r.json();
            if (!Array.isArray(list)) break;
            for (const rel of list) {
                if (!rel || rel.draft || rel.prerelease) continue;
                for (const a of rel.assets || []) {
                    const m = rx.exec(String(a.name || ''));
                    if (!m || (a.state && a.state !== 'uploaded')) continue;
                    const code = +m[1] * 10000 + +m[2] * 100 + +m[3];
                    if (!best || code > best.code) best = { version: m[1] + '.' + m[2] + '.' + m[3], code, url: String(a.browser_download_url || ''), size: a.size || 0, name: a.name };
                }
            }
            if (list.length < 100) break;
        }
        if (!best) throw new UserError(rx === FACE ? 'Im Release ist noch kein Zifferblatt.' : 'Im Release ist noch keine Uhr-App (VRC-Nexus-Watch-…-wearos.apk).');
        return best;
    }
    /** installierte Version auf der Uhr (versionCode) oder 0 */
    async installedCode(serial) {
        const r = await this.adb(['-s', serial, 'shell', 'dumpsys', 'package', 'dev.ghostnode.nexuswatch'], 20000);
        const m = /versionCode=(\d+)/.exec(r.out);
        return m ? +m[1] : 0;
    }

    async install(serial) {
        serial = String(serial || '');
        if (!SERIAL.test(serial)) throw new UserError('Gerät wählen.');
        const ch = await this.adb(['-s', serial, 'shell', 'getprop', 'ro.build.characteristics'], 15000);
        if (ch.code !== 0) throw new UserError('Gerät antwortet nicht – ist es verbunden und das Debugging erlaubt?');
        if (!/watch/i.test(ch.out)) throw new UserError('Das ist keine Wear-OS-Uhr.');
        const l = await this.latest();
        await this.push(serial, l, 'nexus-watch.apk', 'Uhr-App');
        this.say('✔ Nexus Watch ' + l.version + ' installiert.');
        // 8.1.1: Zifferblatt mitinstallieren (Wear OS 4+) und als aktives Zifferblatt setzen – beides „wenn möglich“, die Uhr-App ist schon drauf
        try {
            const sdk = Number(((await this.adb(['-s', serial, 'shell', 'getprop', 'ro.build.version.sdk'], 15000)).out || '').trim()) || 0;
            if (sdk && sdk < 33) this.say('ℹ Zifferblatt braucht Wear OS 4 – diese Uhr hat es noch nicht.');
            else {
                const fc = await this.latest(FACE);
                await this.push(serial, fc, 'nexus-face.apk', 'Zifferblatt');
                const set = await this.adb(['-s', serial, 'shell', 'am', 'broadcast', '-a', 'com.google.android.wearable.app.DEBUG_SURFACE', '--es', 'operation', 'set-watchface', '--es', 'watchFaceId', FACE_PKG], 20000);
                this.say(/result=0|completed/i.test(set.out) && !/error|unknown/i.test(set.out) ? '✔ Zifferblatt „VRC Nexus“ ist aktiv.' : '✔ Zifferblatt installiert – auf der Uhr lange aufs Zifferblatt drücken und „VRC Nexus“ wählen.');
            }
        } catch (e) { this.say('ℹ Zifferblatt nicht installiert: ' + (e.message || e)); }
        return l.version;
    }
    /** 8.2: Kacheln hinzufügen (nur bekannte Kacheln der eigenen App, nur Uhren) – 🔞-Kachel nur, wenn ausdrücklich gewählt */
    async addTiles(serial, which) {
        serial = String(serial || '');
        if (!SERIAL.test(serial)) throw new UserError('Gerät wählen.');
        const keys = String(which || 'status,quick').split(',').map(x => x.trim()).filter(Boolean);
        if (!keys.length || keys.some(k => !TILES[k])) throw new UserError('Unbekannte Kachel.');
        const ch = await this.adb(['-s', serial, 'shell', 'getprop', 'ro.build.characteristics'], 15000);
        if (ch.code !== 0) throw new UserError('Gerät antwortet nicht – ist es verbunden und das Debugging erlaubt?');
        if (!/watch/i.test(ch.out)) throw new UserError('Das ist keine Wear-OS-Uhr.');
        let ok = 0;
        for (const k of keys) {
            const r = await this.adb(['-s', serial, 'shell', 'am', 'broadcast', '-a', 'com.google.android.wearable.app.DEBUG_SURFACE', '--es', 'operation', 'add-tile', '--ecn', 'component', TILE_PKG + '/' + TILE_PKG + '.' + TILES[k]], 20000);
            if (r.code === 0 && !/error|exception|unknown/i.test(r.out)) ok++;
        }
        this.say(ok === keys.length ? '✔ ' + ok + ' Kachel(n) hinzugefügt – auf dem Zifferblatt nach links/rechts wischen.' : 'ℹ ' + ok + ' von ' + keys.length + ' Kacheln hinzugefügt – sonst auf der Uhr lange auf eine Kachel drücken und „+“ wählen.');
        return ok;
    }
    /** eine APK aus dem Release laden, prüfen und per adb installieren */
    async push(serial, l, file, what) {
        if (!l.url.startsWith(RELEASE_DL) && !(process.env.NEXUS_UPDATE_API && /^http:\/\/127\.0\.0\.1:/.test(l.url))) throw new UserError('Unerwartete Download-Adresse.');
        if (l.size > 60 * 1048576) throw new UserError(what + ' zu groß.');
        this.say('Lade ' + l.name + ' …');
        let r;
        try { r = await this.fetch(l.url, { redirect: 'follow', signal: AbortSignal.timeout(180000) }); } catch (e) { throw new UserError('Download (' + what + ') fehlgeschlagen.'); }
        if (!r.ok) throw new UserError('Download (' + what + '): HTTP ' + r.status + '.');
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 60 * 1048576 || buf.length < 1000 || buf.readUInt32LE(0) !== 0x04034b50) throw new UserError('Die geladene Datei ist keine APK.');
        fs.mkdirSync(this.dir, { recursive: true });
        const f = path.join(this.dir, file);
        fs.writeFileSync(f, buf);
        this.say('Installiere auf der Uhr …');
        const res = await this.adb(['-s', serial, 'install', '-r', f], 240000);
        if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i.test(res.out))
            throw new UserError('Auf der Uhr ist eine Nexus Watch mit anderer Signatur. Bitte dort deinstallieren und erneut installieren (die Uhr muss danach neu gekoppelt werden).');
        if (/INSTALL_FAILED_VERSION_DOWNGRADE/i.test(res.out)) throw new UserError('Auf der Uhr ist schon eine neuere Version.');
        if (!/Success/.test(res.out)) throw new UserError(what + ': Installation fehlgeschlagen: ' + (res.out.trim().split(/\r?\n/).pop() || '').slice(0, 160));
    }

    async status() {
        const adb = this.findAdb();
        let devices = [];
        try { devices = adb ? await this.devices() : []; } catch (e) { devices = []; }
        return { adb: adb ? (path.resolve(adb) === path.resolve(this.dir, 'platform-tools', this.exe()) ? 'eigene' : adb) : '', devices, busy: this.busy, log: this.log.slice(-8), platform: this.platform };
    }
    async run(what, fn) {
        if (this.busy) throw new UserError('Läuft gerade: ' + this.busy);
        this.busy = what;
        try { return await fn(); } finally { this.busy = ''; }
    }
    async action(act, input = {}) {
        if (act === 'watch_adb_status') return this.status();
        if (act === 'watch_adb_get') { await this.run('ADB laden', () => this.getAdb()); return Object.assign(await this.status(), { msg: '✔ adb ist bereit.' }); }
        if (act === 'watch_adb_pair') { await this.run('Koppeln', () => this.pair(input.addr, input.code)); return Object.assign(await this.status(), { msg: '✔ Uhr gekoppelt – jetzt verbinden.' }); }
        if (act === 'watch_adb_connect') { await this.run('Verbinden', () => this.connect(input.addr)); return Object.assign(await this.status(), { msg: '✔ Uhr verbunden.' }); }
        if (act === 'watch_adb_tiles') { const n = await this.run('Kacheln', () => this.addTiles(input.serial, input.tiles)); return Object.assign(await this.status(), { msg: '🧩 ' + n + ' Kachel(n) hinzugefügt.' }); }   // 8.2
        if (act === 'watch_adb_install') { const v = await this.run('Installieren', () => this.install(input.serial)); return Object.assign(await this.status(), { msg: '✔ Nexus Watch ' + v + ' ist auf der Uhr.' }); }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { WatchInstall, APK, HOSTPORT, TILES };
