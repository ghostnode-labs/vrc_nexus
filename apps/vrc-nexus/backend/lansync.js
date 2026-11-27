'use strict';
/*
 * 8.0.4: 🏠 Cloud-freier Abgleich PC ↔ Laptop im Heimnetz.
 *   • Ein PC ist die „Zentrale“ (läuft mit eingeschalteter Uhr/Handy-Verbindung, Werkzeuge → Nexus Watch, Port 17874).
 *   • Der Laptop koppelt sich mit dem 6-stelligen Code wie Uhr und Handy – als Gerät „PC“, das NUR den Abgleich darf (keine Aktionen).
 *   • Inhalt und Zusammenführen wie beim Einstellungs-Abgleich über das Dashboard (settingsync.js): Ende-zu-Ende-verschlüsselt mit dem
 *     Sicherungs-Passwort – auch im WLAN sieht niemand die Einstellungen, und die Zentrale speichert nur den verschlüsselten Block.
 *   • Die Zentrale gleicht sich selbst mit ab (direkt, ohne Netz).
 */
const os = require('os');
const { str, int, cut, UserError } = require('./util');
const { SettingSync } = require('./settingsync');

const DEF_PORT = 17874;
const MAX = 700000;

class LanSync {
    constructor(app, crypt) {
        this.app = app; this.crypt = crypt;
        this.sync = new SettingSync(app, crypt, { key: 'lansync_state', name: 'lansync', link: () => this.transport(), noLink: 'Erst mit einem PC koppeln – oder diesen PC als Zentrale nutzen (Uhr/Handy-Verbindung an).' });
    }
    cfg() { try { return JSON.parse(this.app.db.setting('lansync', '{}')) || {}; } catch (e) { return {}; } }
    token() { const c = this.cfg(); try { return c.token ? this.crypt.decrypt(c.token) : ''; } catch (e) { return ''; } }
    /** Rolle: 'peer' (mit einer Zentrale gekoppelt) oder 'hub' (dieser PC ist die Zentrale) */
    role() { return this.cfg().host && this.token() ? 'peer' : this.app.watch && this.app.watch.server ? 'hub' : 'off'; }

    // ---------- Zentrale: verschlüsselten Block halten (wie client.php sync_get/sync_put) ----------
    blob() { try { return Object.assign({ rev: 0, device: '', updated: 0, data: '' }, JSON.parse(this.app.db.setting('lansync_blob', '{}'))); } catch (e) { return { rev: 0, device: '', updated: 0, data: '' }; } }
    serve(b) {
        const m = this.blob();
        if (str(b.op) === 'get') return Object.assign({ ok: true }, m);
        if (str(b.op) !== 'put') throw new UserError('Unbekannt.');
        const data = str(b.data);
        if (data.length < 20 || data.length > MAX || !/^[A-Za-z0-9+/=]+$/.test(data)) throw new UserError('Ungültige Daten.');
        if (int(b.base) !== m.rev) { const e = new UserError('Konflikt – erst holen.'); e.status = 409; e.rev = m.rev; throw e; }
        const n = { rev: m.rev + 1, device: cut(str(b.device).replace(/[^\p{L}\p{N} ._-]/gu, ''), 40), updated: Math.floor(Date.now() / 1000), data };
        this.app.db.setSetting('lansync_blob', JSON.stringify(n));
        return { ok: true, rev: n.rev };
    }

    // ---------- Transport für SettingSync ----------
    transport() {
        const c = this.cfg(), role = this.role();
        if (role === 'off') return null;
        const local = role === 'hub';
        return {
            base: () => local ? 'local' : c.host,
            token: () => local ? 'local' : this.token(),
            req: async (method, act, body) => {
                const b = Object.assign({ op: act === 'sync_get' ? 'get' : 'put' }, body || {});
                if (local) { try { return this.serve(b); } catch (e) { if (e.status === 409) throw new Error('HTTP 409'); throw e; } }
                return this.http('/watch/sync', b);
            },
        };
    }
    async http(path, body, c = this.cfg(), tok = this.token()) {
        let r;
        try {
            r = await fetch('http://' + c.host + ':' + (c.port || DEF_PORT) + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { 'X-Nexus-Watch': tok } : {}), body: JSON.stringify(body || {}), signal: AbortSignal.timeout(10000) });
        } catch (e) { throw new UserError('PC „' + (c.pc || c.host) + '“ nicht erreichbar – gleiches Netz? Läuft dort VRC Nexus mit Uhr/Handy-Verbindung?'); }
        let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
        if (r.status === 409) throw new Error('HTTP 409');
        if (r.status === 401) throw new UserError('Nicht mehr gekoppelt – bitte neu koppeln.');
        if (!r.ok) throw new UserError(str(j.error) || 'Fehler ' + r.status);
        return j;
    }
    async pair(addr, pin) {
        const m = /^\s*(?:https?:\/\/)?([\w.-]{1,100})(?::(\d{2,5}))?\s*$/.exec(str(addr));
        if (!m) throw new UserError('Bitte die Adresse des anderen PCs eingeben (z. B. 192.168.2.10 – steht dort unter Werkzeuge → Nexus Watch).');
        const c = { host: m[1], port: Math.max(1, Math.min(65535, int(m[2]) || DEF_PORT)) };
        if (!/^\d{6}$/.test(str(pin).replace(/\s/g, ''))) throw new UserError('Bitte den 6-stelligen Code vom anderen PC eingeben.');
        let hello;
        try { const r = await fetch('http://' + c.host + ':' + c.port + '/watch/hello', { signal: AbortSignal.timeout(8000) }); hello = await r.json(); } catch (e) { throw new UserError('Unter dieser Adresse antwortet kein VRC Nexus.'); }
        if (!hello || hello.nexus !== 'watch') throw new UserError('Unter dieser Adresse läuft kein VRC Nexus.');
        const r = await this.http('/watch/pair', { pin: str(pin).replace(/\s/g, ''), name: cut(os.hostname(), 40) || 'Laptop', kind: 'pc' }, c, '');
        this.app.db.setSetting('lansync', JSON.stringify(Object.assign(c, { pc: cut(str(r.name || hello.name), 40), token: this.crypt.encrypt(str(r.token)) })));
        this.app.db.setSetting('lansync_state', '{}');   // neuer Partner → frisch zusammenführen
        return Object.assign(this.status(), { msg: '🏠 Mit „' + (r.name || c.host) + '“ gekoppelt.' });
    }
    status() {
        const c = this.cfg(), b = this.blob(), w = this.app.watch;
        return Object.assign(this.sync.status(), { role: this.role(), pc: c.pc || '', host: c.host || '', hub: { on: !!(w && w.server), rev: b.rev, device: b.device, updated: b.updated, peers: w ? w.cfg().devices.filter(d => d.kind === 'pc').map(d => ({ id: d.id, name: d.name })) : [] } });
    }
    start() { this.sync.start(); }
    stop() { this.sync.stop(); }
    async action(act, input) {
        switch (act) {
            case 'lsync_status': return this.status();
            case 'lsync_pair': return await this.pair(input.addr, input.pin);
            case 'lsync_unpair': this.app.db.setSetting('lansync', '{}'); this.app.db.setSetting('lansync_state', '{}'); return Object.assign(this.status(), { msg: 'Kopplung gelöst.' });
            case 'lsync_on': { const r = await this.sync.action('sync_on', input); return Object.assign(this.status(), { msg: r.msg }); }
            case 'lsync_now': { const r = await this.sync.sync(); return Object.assign(this.status(), { msg: r.msg }); }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { LanSync };
