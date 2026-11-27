'use strict';
/*
 * 8.0: 🩺 Automatische Fehlerdiagnose mit Bericht zum Mitschicken.
 *   Prüft: Version & System, VRChat-Anmeldung (nur ja/nein), OSC-Empfang, VRChat läuft, SteamVR-Helfer, Puls-Quelle, Datenbank,
 *   Erreichbarkeit von VRChat-API und GhostNode, letzte Fehler der App, Leistung. Jede Prüfung: ✅ / ⚠ / ❌ mit Tipp.
 *   Der Bericht enthält KEINE Schlüssel, Tokens, Passwörter, Namen oder IDs – Einstellungen nur ohne geheime Werte.
 *   Er wird nie automatisch verschickt: Du kopierst ihn selbst.
 */
const os = require('os');
const { str, UserError } = require('./util');

const SECRET = /token|key|secret|pass|cookie|auth|webhook|sid|session|otp|code|mail/i;
const ID = /\b(usr|wrld|avtr|grp|file)_[0-9a-f-]{8,}\b/gi;

class Diag {
    constructor(app) { this.app = app; this.errors = []; }
    /** von tools.debug: die letzten 30 Fehler merken (ohne IDs) */
    note(where, e) {
        const msg = String(e && e.message || e || '').replace(ID, '$1_…').slice(0, 200);
        this.errors.unshift({ t: Date.now(), where: String(where).slice(0, 40), msg });
        this.errors = this.errors.slice(0, 30);
    }
    async reach(url, ms = 5000) {
        const t = Date.now();
        try { const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'VRC-Nexus-Diagnose' } }); return { ok: r.status < 500, status: r.status, ms: Date.now() - t }; }
        catch (e) { return { ok: false, status: 0, ms: Date.now() - t, err: String(e && (e.cause && e.cause.code || e.name) || e).slice(0, 60) }; }
    }
    async run(opts = {}) {
        const a = this.app, checks = [], add = (k, st, text, tip) => checks.push({ k, st, text, tip: tip || '' });
        const ver = (() => { try { return require('../package.json').version; } catch (e) { return '?'; } })();
        // Konto
        let logged = false; try { logged = !!(a.vrc && a.vrc.account && a.vrc.account()); } catch (e) { logged = false; }
        add('login', logged ? 'ok' : 'warn', logged ? 'Mit VRChat angemeldet' : 'Nicht mit VRChat angemeldet', logged ? '' : 'Unter Konto anmelden – ohne Anmeldung fehlen Freunde, Gruppen und Benachrichtigungen.');
        // Spiel & OSC
        const st = (a.game && a.game.state) || {};
        add('vrc', st.running ? 'ok' : 'info', st.running ? 'VRChat läuft' : 'VRChat läuft gerade nicht', '');
        let osc = null; try { osc = a.oscStatus ? a.oscStatus() : null; } catch (e) { osc = null; }
        if (osc) {
            const recent = (() => { try { return a.game.oscRecent ? a.game.oscRecent().length : 0; } catch (e) { return 0; } })();
            if (osc.mode === 'aus') add('osc', 'warn', 'OSC-Empfang ist aus', 'Einstellungen → Spiel & OSC → OSC-Empfang einschalten, sonst gehen Avatar-Funktionen nicht.');
            else if (st.running && !recent) add('osc', 'warn', 'OSC an (' + osc.mode + ', Port ' + (osc.listen_port || '?') + '), aber nichts von VRChat empfangen', 'In VRChat: Action-Menü → Optionen → OSC → Enabled; bei Problemen „Reset Config“.');
            else add('osc', 'ok', 'OSC ' + osc.mode + ' (Port ' + (osc.listen_port || '?') + ')' + (recent ? ', Daten kommen an' : ''), '');
        }
        // SteamVR-Helfer / FPS
        const h = a.tools && a.tools.host, fps = h && h.vrFps ? h.vrFps() : null;
        if (h && h.vrFps) add('vr', fps ? 'ok' : 'info', fps ? 'SteamVR-Helfer liefert ' + Math.round(fps.app) + ' FPS' : 'Keine VR-Daten (SteamVR aus oder Helfer nicht gestartet)', '');
        // Puls
        const hr = a.heart; if (hr) { const src = hr.cfg ? hr.cfg().source : 'off'; add('heart', src === 'off' ? 'info' : hr.active ? 'ok' : 'warn', src === 'off' ? 'Puls aus' : hr.active ? 'Puls (' + src + '): ' + hr.bpm + ' bpm' : 'Puls-Quelle „' + src + '“ liefert gerade nichts' + (hr.error ? ' – ' + str(hr.error).replace(ID, '$1_…').slice(0, 80) : ''), src !== 'off' && !hr.active ? 'Quelle in Einstellungen → Puls prüfen (Uhr gekoppelt? HypeRate-ID richtig?).' : ''); }
        // Datenbank
        let db = 0; try { db = a.db.size ? a.db.size() : 0; } catch (e) { db = 0; }
        add('db', db > 300 * 1048576 ? 'warn' : 'ok', 'Datenbank ' + (db > 1048576 ? (db / 1048576).toFixed(1) + ' MB' : Math.round(db / 1024) + ' KB'), db > 300 * 1048576 ? 'Einstellungen → System → Aufräumen: kürzere Aufbewahrung wählen.' : '');
        // Netz (kann im Test abgeschaltet werden)
        if (opts.net !== false) {
            const [v, g] = await Promise.all([this.reach('https://api.vrchat.cloud/api/1/config'), this.reach('https://ghostnode-labs.dev/')]);
            add('net_vrc', v.ok ? 'ok' : 'bad', v.ok ? 'VRChat-API erreichbar (' + v.ms + ' ms)' : 'VRChat-API nicht erreichbar' + (v.status ? ' (HTTP ' + v.status + ')' : v.err ? ' (' + v.err + ')' : ''), v.ok ? '' : 'Internet, Firewall oder VPN prüfen; bei HTTP 429 kurz warten.');
            add('net_gn', g.ok ? 'ok' : 'warn', g.ok ? 'GhostNode erreichbar (' + g.ms + ' ms)' : 'GhostNode nicht erreichbar', g.ok ? '' : 'Community, Clubs und Updates gehen gerade nicht – später erneut versuchen.');
        }
        // Leistung
        if (a.perf) { try { const p = a.perf.sample(); add('perf', p.mem > 900 || p.cpu > 25 ? 'warn' : 'ok', 'VRC Nexus: ' + p.mem + ' MB, ' + p.cpu + ' % CPU', p.mem > 900 || p.cpu > 25 ? 'Werkzeuge → 📈 Leistungsmessung: eine Messung aufnehmen und mitschicken.' : ''); } catch (e) { /* egal */ } }
        // Fehler
        const errs = this.errors.filter(x => Date.now() - x.t < 24 * 3600000);
        add('errors', errs.length > 10 ? 'warn' : 'ok', errs.length ? errs.length + ' Fehler in den letzten 24 h' : 'Keine Fehler in den letzten 24 h', '');
        const settings = this.safeSettings();
        const sys = { version: ver, os: os.type() + ' ' + os.release(), arch: process.arch, node: process.version, electron: process.versions.electron || '', cores: os.cpus().length, ram_gb: Math.round(os.totalmem() / 1073741824), lang: str(a.settings && a.settings.get && a.settings.get('ui.lang')) };
        return { at: Date.now(), sys, checks, errors: errs.slice(0, 15), settings, summary: { bad: checks.filter(c => c.st === 'bad').length, warn: checks.filter(c => c.st === 'warn').length } };
    }
    /** Einstellungen ohne geheime Werte (nur Schlüssel mit harmlosen Werten; Texte gekürzt) */
    safeSettings() {
        let all = {}; try { all = this.app.settings.all(); } catch (e) { all = {}; }
        const out = {};
        for (const [k, v] of Object.entries(all)) {
            if (SECRET.test(k)) { out[k] = v ? '•••' : ''; continue; }
            if (typeof v === 'boolean' || typeof v === 'number') out[k] = v;
            else if (typeof v === 'string') out[k] = v.length > 40 ? v.slice(0, 20).replace(ID, '$1_…') + '…' : v.replace(ID, '$1_…');
        }
        return out;
    }
    text(r) {
        const I = { ok: '✅', warn: '⚠', bad: '❌', info: 'ℹ' };
        const L = ['🩺 VRC Nexus – Diagnose ' + new Date(r.at).toLocaleString('de-DE'), 'Version ' + r.sys.version + ' · ' + r.sys.os + ' (' + r.sys.arch + ') · Electron ' + (r.sys.electron || '–') + ' · ' + r.sys.cores + ' Kerne · ' + r.sys.ram_gb + ' GB',
            '', ...r.checks.map(c => I[c.st] + ' ' + c.text + (c.tip ? '\n   → ' + c.tip : ''))];
        if (r.errors.length) L.push('', 'Letzte Fehler:', ...r.errors.map(e => '• ' + new Date(e.t).toLocaleTimeString('de-DE') + ' [' + e.where + '] ' + e.msg));
        L.push('', 'Einstellungen (ohne geheime Werte):', Object.entries(r.settings).filter(([, v]) => v !== '' && v !== false).map(([k, v]) => k + '=' + v).join(', ').slice(0, 3000));
        return L.join('\n');
    }
    async action(act, input) {
        switch (act) {
            case 'diag_run': { const r = await this.run(); return Object.assign(r, { text: this.text(r) }); }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { Diag, SECRET };
