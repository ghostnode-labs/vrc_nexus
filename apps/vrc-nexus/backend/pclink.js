'use strict';
/*
 * 5.2.3: Handy ↔ PC – die Android-App koppelt sich wie die Nexus Watch mit der Windows-App (gleicher Code, Werkzeuge → Nexus Watch)
 * und spricht danach direkt im Heimnetz mit ihr (http://PC:17874, Schlüssel je Gerät, nur erlaubte Aktionen – siehe watch.js PHONE_ACTS).
 * Der Schlüssel wird verschlüsselt gespeichert.
 */
const { str, int, cut, UserError } = require('./util');

const DEF_PORT = 17874;

class PcLink {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.last = null; this.error = ''; }
    cfg() { try { return JSON.parse(this.app.db.setting('pclink', '{}')) || {}; } catch (e) { return {}; } }
    token() { const c = this.cfg(); try { return c.token ? this.crypt.decrypt(c.token) : ''; } catch (e) { return ''; } }
    paired() { const c = this.cfg(); return !!(c.host && this.token()); }
    status() { const c = this.cfg(); return { paired: this.paired(), host: c.host || '', port: c.port || DEF_PORT, pc: c.pc || '', error: this.error, state: this.last }; }

    static parseAddr(s) {
        const m = /^\s*(?:https?:\/\/)?([\w.-]{1,100})(?::(\d{2,5}))?\s*$/.exec(str(s));
        if (!m) throw new UserError('Bitte die PC-Adresse eingeben (z. B. 192.168.2.10 – steht am PC unter Werkzeuge → Nexus Watch).');
        return { host: m[1], port: Math.max(1, Math.min(65535, int(m[2]) || DEF_PORT)) };
    }
    async http(method, host, port, path, body, tok) {
        let r;
        try {
            r = await fetch('http://' + host + ':' + port + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { 'X-Nexus-Watch': tok } : {}),
                body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
        } catch (e) { throw new UserError('PC nicht erreichbar – gleiches WLAN? Läuft VRC Nexus mit eingeschalteter Uhr/Handy-Verbindung?'); }
        let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
        if (r.status === 401) { this.error = 'Nicht mehr gekoppelt – bitte neu koppeln.'; throw new UserError(this.error); }
        if (!r.ok) throw new UserError(str(j.error) || 'Fehler ' + r.status);
        return j;
    }
    async pair(addr, pin) {
        const { host, port } = PcLink.parseAddr(addr);
        if (!/^\d{6}$/.test(str(pin).replace(/\s/g, ''))) throw new UserError('Bitte den 6-stelligen Code vom PC eingeben.');
        const hello = await this.http('GET', host, port, '/watch/hello');
        if (hello.nexus !== 'watch') throw new UserError('Unter dieser Adresse läuft kein VRC Nexus.');
        const r = await this.http('POST', host, port, '/watch/pair', { pin: str(pin).replace(/\s/g, ''), name: 'Handy', kind: 'phone' });
        this.app.db.setSetting('pclink', JSON.stringify({ host, port, pc: cut(str(r.name || hello.name), 40), token: this.crypt.encrypt(str(r.token)) }));
        this.error = '';
        await this.state().catch(() => {});
        return Object.assign(this.status(), { msg: '🖥 Mit „' + (r.name || hello.name || 'PC') + '“ verbunden.' });
    }
    async state() {
        const c = this.cfg();
        if (!this.paired()) throw new UserError('Noch nicht mit dem PC gekoppelt.');
        this.last = await this.http('GET', c.host, c.port, '/watch/state', null, this.token());
        this.error = '';
        return this.status();
    }
    async act(act, data) {
        const c = this.cfg();
        if (!this.paired()) throw new UserError('Noch nicht mit dem PC gekoppelt.');
        const r = await this.http('POST', c.host, c.port, '/watch/act', { act: str(act), data: data && typeof data === 'object' ? data : {} }, this.token());
        if (r.state) this.last = r.state;
        return Object.assign(this.status(), { result: r.result || {}, msg: str(r.result && r.result.msg) });
    }
    async action(act, input) {
        switch (act) {
            case 'pclink_get': return input.refresh === '1' && this.paired() ? this.state().catch(e => Object.assign(this.status(), { error: e.message })) : this.status();
            case 'pclink_pair': return this.pair(input.addr, input.pin);
            case 'pclink_unpair': this.app.db.setSetting('pclink', '{}'); this.last = null; return Object.assign(this.status(), { msg: 'Verbindung zum PC gelöst.' });
            case 'pclink_act': { let d = input.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } } return this.act(input.pc_act, d); }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { PcLink, DEF_PORT };
