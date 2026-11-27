'use strict';
/*
 * GhostNode-Konto in der App (GEMEINSAM für VRC Nexus und D2 Nexus – gleiche Datei in beiden Apps).
 * Anmeldung: OAuth 2.0 mit PKCE über den fest eingebauten Zugang „GhostNode Apps“ der Website.
 *   1. Die App öffnet kurz einen Empfänger auf http://127.0.0.1:<freier Port>/callback (nur dieser PC).
 *   2. Der Browser zeigt die normale GhostNode-Anmeldung (inkl. Zwei-Faktor) und die Zustimmung.
 *   3. Die Website leitet mit einem Einmal-Code zurück; die App tauscht ihn gegen ein Zugangs-Token (gno_…).
 * Das Token wird nur verschlüsselt gespeichert und bleibt gültig, bis man sich abmeldet (oder es auf der Website widerruft).
 * Die App selbst kennt nie das Passwort. Admin-Rechte prüft die Website bei jeder Anfrage neu.
 */
const http = require('http');
const crypto = require('crypto');

const CLIENT_ID = 'gnc_6e6578757361707073303031';
const DEFAULT_BASE = 'https://ghostnode-labs.dev';
/** erlaubte Web-API-Pfade (für Plugins mit Recht „ghostnode“) */
const ALLOWED = /^(me|market|versions|versions\/latest|admin\/(overview|market|market\/review|users|users\/active|audit|d2))$/;
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

class GnAccount {
    /**
     * @param {object} o
     * @param {() => string} [o.base]        Website-Adresse
     * @param {(k:string) => any} o.get       Einstellung lesen
     * @param {(k:string, v:any) => void} o.set
     * @param {{encrypt:(s:string)=>string, decrypt:(s:string)=>string}} o.crypt
     * @param {(url:string) => void} o.openUrl Browser öffnen
     * @param {Function} [o.fetch]
     * @param {string} [o.app]               "vrc" | "d2" (nur für den Namen im Zustimmungs-Dialog)
     */
    constructor(o) {
        this.o = o; this.fetch = o.fetch || globalThis.fetch; this.pending = null; this.me = null;
    }
    base() { return String((this.o.base && this.o.base()) || DEFAULT_BASE).replace(/\/+$/, ''); }
    token() { const v = this.o.get('gn_account'); if (!v) return ''; try { return JSON.parse(this.o.crypt.decrypt(v)).token || ''; } catch (e) { return ''; } }
    saveToken(t, me) { this.o.set('gn_account', t ? this.o.crypt.encrypt(JSON.stringify({ token: t, at: Date.now() })) : null); this.o.set('gn_me', me || null); this.me = me || null; }
    status() {
        const me = this.me || this.o.get('gn_me') || null;
        return { connected: !!this.token(), user: me ? { id: me.id, name: me.name, username: me.username } : null, admin: !!(me && me.admin), scopes: me ? me.scopes || [] : [], base: this.base(), busy: !!this.pending };
    }

    /** Anmeldung im Browser; löst auf, sobald der Browser zurückkommt (höchstens 5 Minuten) */
    async login({ admin = true, timeoutMs = 300000 } = {}) {
        if (this.pending) { this.o.openUrl(this.pending.url); return this.pending.promise; }
        const verifier = b64url(crypto.randomBytes(48));
        const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
        const state = b64url(crypto.randomBytes(18));
        const server = http.createServer();
        await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
        const redirect = 'http://127.0.0.1:' + server.address().port + '/callback';
        const url = this.base() + '/oauth.php?r=authorize&response_type=code&client_id=' + CLIENT_ID + '&redirect_uri=' + encodeURIComponent(redirect)
            + '&scope=' + encodeURIComponent(admin ? 'read admin' : 'read') + '&state=' + state + '&code_challenge=' + challenge + '&code_challenge_method=S256';
        const page = (title, text) => '<!doctype html><meta charset="utf-8"><title>' + title + '</title><body style="font:16px system-ui;background:#0a0d14;color:#dce6f2;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h2>' + title + '</h2><p>' + text + '</p></div>';
        const promise = new Promise((resolve, reject) => {
            const t = setTimeout(() => finish(new Error('Anmeldung abgelaufen – bitte erneut versuchen.')), timeoutMs);
            if (t.unref) t.unref();
            const finish = (err, val) => { clearTimeout(t); try { server.close(); } catch (e) { /* egal */ } this.pending = null; if (err) reject(err); else resolve(val); };
            server.on('request', async (req, res) => {
                const u = new URL(req.url, 'http://127.0.0.1');
                if (u.pathname !== '/callback') { res.writeHead(404); return res.end(); }
                const code = u.searchParams.get('code') || '', st = u.searchParams.get('state') || '', err = u.searchParams.get('error');
                if (err || st !== state || !/^[0-9a-f]{20,200}$/.test(code)) {
                    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('Abgebrochen', 'Die Anmeldung wurde nicht abgeschlossen. Du kannst dieses Fenster schließen.'));
                    return finish(new Error(err === 'access_denied' ? 'Anmeldung abgelehnt.' : 'Anmeldung ungültig – bitte erneut versuchen.'));
                }
                try {
                    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: CLIENT_ID, code_verifier: verifier });
                    const r = await this.fetch(this.base() + '/oauth.php?r=token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
                    const j = await r.json().catch(() => null);
                    if (!r.ok || !j || !/^gno_[0-9a-f]{40}$/.test(String(j.access_token))) throw new Error((j && (j.error_description || j.error)) || 'Token-Tausch fehlgeschlagen (HTTP ' + r.status + ').');
                    this.saveToken(j.access_token, null);
                    const me = await this.refresh();
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('✔ Angemeldet', 'Du bist jetzt als <b>' + String(me && me.name || '').replace(/[<>&"]/g, '') + '</b> verbunden. Dieses Fenster kannst du schließen.'));
                    finish(null, this.status());
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('Fehler', 'Anmeldung fehlgeschlagen. Bitte in der App erneut versuchen.'));
                    finish(e);
                }
            });
        });
        this.pending = { url, promise };
        this.o.openUrl(url);
        return promise;
    }

    /** Profil neu laden (Name, Admin?) */
    async refresh() {
        const me = await this.api('GET', 'me');
        this.o.set('gn_me', me); this.me = me;
        return me;
    }
    async logout() {
        const t = this.token();
        if (t) { try { await this.fetch(this.base() + '/oauth.php?r=revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=' + encodeURIComponent(t) }); } catch (e) { /* offline: lokal trotzdem abmelden */ } }
        this.saveToken(null, null);
        return this.status();
    }

    /** Web-API-Aufruf mit dem gespeicherten Token (nur freigegebene Pfade) */
    async api(method, path, data = {}) {
        method = String(method).toUpperCase(); path = String(path).replace(/^\/+/, '');
        if (!['GET', 'POST'].includes(method) || !ALLOWED.test(path)) throw new Error('GhostNode-API: Pfad nicht erlaubt (' + path.slice(0, 60) + ').');
        const t = this.token();
        if (!t) throw new Error('Nicht mit GhostNode verbunden – in den Einstellungen anmelden.');
        let url = this.base() + '/api.php?r=' + encodeURIComponent(path);
        const opt = { method, headers: { Authorization: 'Bearer ' + t, Accept: 'application/json' } };
        if (method === 'GET') { for (const [k, v] of Object.entries(data || {}).slice(0, 10)) if (/^[a-z_]{1,20}$/.test(k)) url += '&' + k + '=' + encodeURIComponent(String(v).slice(0, 200)); }
        else { const s = JSON.stringify(data || {}); if (s.length > 20000) throw new Error('Anfrage zu groß.'); opt.headers['Content-Type'] = 'application/json'; opt.body = s; }
        let r;
        try { r = await this.fetch(url, opt); } catch (e) { throw new Error('GhostNode nicht erreichbar.'); }
        const j = await r.json().catch(() => null);
        if (r.status === 401) { this.saveToken(null, null); throw new Error('GhostNode-Anmeldung abgelaufen oder widerrufen – bitte neu anmelden.'); }
        if (!r.ok || !j) throw new Error((j && j.error) || 'GhostNode: HTTP ' + r.status);
        return j;
    }
}

module.exports = { GnAccount, CLIENT_ID, ALLOWED };
