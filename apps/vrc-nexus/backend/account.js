'use strict';
/*
 * Nexus-Konto (GhostNode, nexusacct.php): ein zentrales Konto an der VRChat-User-ID – ohne eigenes Passwort.
 *   Verbinden (seit 3.0.2): direkt mit der VRChat-ID des angemeldeten Kontos (ohne Code, ohne Prüfung – Entscheidung der Besitzerin)
 *   → Geräte-Token.
 *   Altersfreigabe „Verified 18+“ (seit 3.0.1, Entscheidung der Besitzerin): die App fragt mit der EIGENEN VRChat-Sitzung
 *   GET /ageVerification/status ab und meldet das Ergebnis an GhostNode (gültig 7 Tage; neu beim Start, alle 6 h, 1 Tag vor Ablauf).
 *   Ist VRChat nicht erreichbar, wird nichts gemeldet (keine falsche Sperre).
 *   NSFW: standardmäßig aus, nur mit gültiger Freigabe einschaltbar, jederzeit ausschaltbar.
 * Online-Dienst = opt-in: ohne Verbinden passiert nichts.
 */
const { str, int, now, UserError } = require('./util');

const BASE = () => (process.env.NEXUS_ACCT_BASE || process.env.NEXUS_RELAY_BASE || require('./servers').nexus()).replace(/\/+$/, '');
const REFRESH = 3 * 3600 * 1000;

class Account {
    constructor(app, crypt) {
        this.app = app; this.crypt = crypt;
        this.error = ''; this.at = 0; this.busy = null;
    }
    // ---------- Speicher (Token verschlüsselt) ----------
    load() {
        const raw = this.app.db.setting('nexus_acct', '');
        // 5.1.1: nicht bei jedem Aufruf neu entschlüsseln (Spielzeug-Schleife fragt 4×/s); Kopie zurückgeben, damit niemand den Zwischenspeicher verändert
        if (!this.memo || this.memo.raw !== raw) { let j = '{}'; try { j = this.crypt.decrypt(raw) || '{}'; JSON.parse(j); } catch (e) { j = '{}'; } this.memo = { raw, j }; }
        try { return JSON.parse(this.memo.j) || {}; } catch (e) { return {}; }
    }
    store(o) { this.app.db.setSetting('nexus_acct', o && o.token ? this.crypt.encrypt(JSON.stringify(o)) : ''); if (this.app.nsfw) this.app.nsfw.accessMemo = null; }
    myId() { const a = this.app.vrc.account(); return a ? str(a.vrc_id).toLowerCase() : ''; }
    /** gespeichertes Konto – nur wenn es zum angemeldeten VRChat-Konto gehört */
    current() { const o = this.load(); return o.token && o.account && o.account.vrc_id === this.myId() ? o : null; }
    /** Freigabe-Stand (zwischengespeichert vom Server; läuft lokal mit age_until ab) */
    age() {
        const o = this.current(), a = o ? o.account : null;
        const verified = !!(a && a.verified18 && int(a.age_until) > now());
        return { connected: !!a, verified, nsfw_on: verified && !!a.nsfw_on, age_until: a ? int(a.age_until) : 0, age_status: a ? str(a.age_status) : '', name: a ? str(a.name) : '' };
    }

    async call(a, body, token, retry = 1) {
        let r;
        try { r = await fetch(BASE() + '/nexusacct.php?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign(token ? { token } : {}, body || {})), signal: AbortSignal.timeout(15000) }); }
        catch (e) { throw new UserError('GhostNode-Webseite nicht erreichbar.'); }
        const d = await require('./servers').readJson(r, 'nexusacct.php');
        // 8.0.18: kurzer Aussetzer der Webseite (z. B. gerade aktualisiert) → einmal nach 1,5 s wiederholen
        if (d._nonjson && retry > 0 && (r.status >= 500 || r.status === 0 || r.status === 200)) { await new Promise(res => setTimeout(res, 1500)); return this.call(a, body, token, retry - 1); }
        if (r.status === 401 && token) this.expired();
        if (!r.ok || d.error) throw new UserError(str(d.error) || 'Fehler ' + r.status + '.');
        return d;
    }
    save(account) {
        const o = this.current();
        if (!o) return;
        o.account = account; o.at = Date.now();
        this.store(o);
        if (this.app.nsfw) this.app.nsfw.accessMemo = null;   // 8.3.3: Freischaltung sofort neu bewerten (sonst blieb der 🔞-Reiter nach dem Wiedereinschalten bis zu 1 s – also beim Neuzeichnen – versteckt)
        this.notifyAccess();
    }
    /** NSFW-Bereich neu bewerten (z. B. Freigabe entzogen → Spielzeuge stoppen) */
    /** 3.7.1: Zugang ungültig (auf der Webseite abgemeldet, Gerät entfernt) → hier automatisch abmelden und Grund merken */
    expired() {
        if (!this.load().token) return;
        this.store(null);
        this.app.db.setSetting('nexus_logout_reason', 'expired');
        this.notifyAccess();
    }
    notifyAccess() {
        const nsfw = this.app.nsfw;
        if (nsfw && !nsfw.access().unlocked) {
            if (this.app.toys && this.app.toys.stopAll) Promise.resolve().then(() => this.app.toys.stopAll()).catch(() => {});
        }
    }
    /** Stand vom Server holen (beim Start und alle 6 h) */
    async refresh(force) {
        const o = this.current();
        if (!o) return null;
        if (!force && Date.now() - this.at < REFRESH) return o.account;
        if (this.busy) return this.busy;
        this.busy = (async () => {
            const before = this.age().verified;
            try {
                let d = await this.call('me', {}, o.token);
                // Vorwarnung: weniger als 1 Tag gültig → jetzt schon neu prüfen lassen (statt am Ablauftag plötzlich gesperrt)
                // 18+ direkt bei VRChat prüfen: wenn noch nie, älter als 6 h oder weniger als 1 Tag gültig (Vorwarnung)
                const a = d.account;
                if (!a.verified18 || now() - int(a.age_checked) > 6 * 3600 || int(a.age_until) - now() < 86400) {
                    const r = await this.checkAge(o).catch(() => null);
                    if (r) d = Object.assign({}, d, { account: r });
                }
                this.save(d.account); this.devices = d.devices || this.devices || []; this.error = '';
                if (before && !d.account.verified18) this.warnLost(d.account);
            }
            catch (e) { this.error = e.message; }
            finally { this.at = Date.now(); this.busy = null; }
            const c = this.current(); return c ? c.account : null;
        })();
        return this.busy;
    }
    /** nur bei Problemen melden: Freigabe ist weg */
    warnLost(a) {
        const title = '🔞 „Verified 18+“ ist abgelaufen', body = 'VRChat meldet für dein Konto keine Altersverifizierung (18+) mehr (' + (str(a.age_status) || 'unbekannt') + '). NSFW ist gesperrt – in VRChat prüfen und „18+ neu prüfen“.';
        this.lost = { at: Date.now(), title, body };
        const t = this.app.tools;
        if (t) { t.log.unshift({ ts: now(), title, body }); t.log = t.log.slice(0, 50); if (t.host && t.host.notify) t.host.notify(title, body, false); }
    }
    start() {
        this.refresh(true).catch(() => {});
        this.timer = setInterval(() => this.refresh().catch(() => {}), 15 * 60000);
        if (this.timer.unref) this.timer.unref();
    }
    stop() { clearInterval(this.timer); }

    // ---------- Verbinden per Bio-Code ----------
    /** Verbinden (seit 3.0.2): direkt mit der VRChat-ID des angemeldeten Kontos – ohne Code, ohne Bio (Entscheidung der Besitzerin) */
    async connect(auto, device) {
        const id = this.myId();
        if (!id) throw new UserError('Erst bei VRChat anmelden.');
        const acc = this.app.vrc.account() || {};
        const d = await this.call('register', { vrc_id: id, name: str(acc.display_name), device: str(device) || (process.platform === 'win32' ? 'Windows-PC' : this.app.mobile ? 'Handy' : 'Gerät') });
        this.store({ token: d.token, account: d.account, at: Date.now() });
        this.app.db.setSetting('nexus_logout_reason', '');
        this.pending = null; this.at = Date.now();
        try { const a = await this.checkAge(); if (a) this.save(a); } catch (e) { /* später erneut */ }
        this.notifyAccess();
        return { account: (this.current() || {}).account || d.account, msg: '🪪 Nexus-Konto verbunden.' };
    }
    /** Altersstatus des EIGENEN Kontos bei VRChat (seit 3.0.4 zuerst /auth/user):
     *  ageVerified = true oder ageVerificationStatus „18+“/„verified“ → „18+“ (VRChat prüft das Alter nur ab 18; „verified“ = bestätigt, Abzeichen ausgeblendet).
     *  Zusätzlich /ageVerification/status, falls /auth/user nichts sagt. null = VRChat nicht erreichbar */
    async vrcAgeStatus() {
        const t = this.app.tools, ok = s => ['18+', 'verified', 'plus18', '18plus'].includes(str(s).toLowerCase().trim());
        let seen = null;
        try {
            const me = await t.call('GET', '/auth/user');
            if (me && me.id) {
                seen = str(me.ageVerificationStatus);
                if (me.ageVerified === true || ok(me.ageVerificationStatus)) return '18+';
            }
        } catch (e) { /* weiter mit /ageVerification/status */ }
        try {
            const r = await t.call('GET', '/ageVerification/status');
            const s = r && typeof r === 'object' ? (r.status !== undefined ? r.status : r.ageVerificationStatus !== undefined ? r.ageVerificationStatus : r.verified === true || r.ageVerified === true ? '18+' : undefined) : r;
            if (s !== undefined && s !== null) return ok(s) || s === true ? '18+' : str(s) || (seen === null ? '' : seen);
        } catch (e) { /* nicht erreichbar */ }
        return seen;
    }
    /** prüfen und an GhostNode melden → Konto (oder null, wenn VRChat nicht erreichbar war) */
    async checkAge(o) {
        o = o || this.current();
        if (!o) return null;
        const status = await this.vrcAgeStatus();
        if (status === null) return null;
        const d = await this.call('age', { status }, o.token);
        return d.account;
    }
    async finish(device) {
        const id = this.myId();
        const d = await this.call('verify', { vrc_id: id, device: str(device) || (process.platform === 'win32' ? 'Windows-PC' : this.app.mobile ? 'Handy' : 'Gerät') });
        this.store({ token: d.token, account: d.account, at: Date.now() });
        try { const a = await this.checkAge(); if (a) this.save(a); } catch (e) { /* später erneut */ }
        this.pending = null; this.at = Date.now();
        this.notifyAccess();
        return { account: d.account, msg: '🪪 Nexus-Konto verbunden.' };
    }

    /** Ist die andere Person Verified 18+ mit NSFW an? (Server-Abfrage, 5 min zwischengespeichert) */
    async peer(uid) {
        uid = str(uid).toLowerCase();
        this.peers = this.peers || new Map();
        const c = this.peers.get(uid);
        if (c && Date.now() - c.at < 300000) return c.ok;
        const o = this.current();
        if (!o) throw new UserError('Erst das Nexus-Konto verbinden.');
        const d = await this.call('peer', { uid }, o.token);
        this.peers.set(uid, { ok: !!d.nsfw, at: Date.now() });
        return !!d.nsfw;
    }
    status() {
        const o = this.current();
        return { connected: !!o, expired: !o && this.app.db.setting('nexus_logout_reason', '') === 'expired', account: o ? o.account : null, age: this.age(), devices: this.devices || [], error: this.error, pending: this.pending || null, lost: this.lost || null, server: BASE() };
    }
    async action(act, input) {
        const o = () => { const c = this.current(); if (!c) throw new UserError('Erst das Nexus-Konto verbinden.'); return c; };
        switch (act) {
            case 'acct_get': if (input.refresh === '1') await this.refresh(true); return this.status();
            case 'acct_connect': { const r = await this.connect(input.auto === '1', input.device); return Object.assign(this.status(), r); }
            case 'acct_verify': { const r = await this.finish(input.device); return Object.assign(this.status(), r); }
            case 'acct_nsfw': {
                const on = input.on === '1' || input.on === true;
                const d = await this.call('nsfw', { on }, o().token);
                this.save(d.account);
                // 8.3.3: Wer NSFW bewusst wieder einschaltet, will den 🔞-Bereich sehen – den Privat-Modus einer vorherigen Panik beenden
                let extra = '';
                const n = this.app.nsfw;
                if (on && n && n.private) { if (this.app.nsfwsafe) this.app.nsfwsafe.setPrivate(false); else n.private = false; if (!n.private) extra = ' Privat-Modus der Panik beendet.'; }
                return Object.assign(this.status(), { msg: (on ? '🔞 NSFW eingeschaltet.' : 'NSFW ausgeschaltet.') + extra });
            }
            case 'acct_recheck': {
                const before = this.age().verified;
                const a = await this.checkAge(o());
                if (!a) throw new UserError('VRChat ist gerade nicht erreichbar – bitte später noch einmal.');
                this.save(a);
                if (before && !a.verified18) this.warnLost(a);
                return Object.assign(this.status(), { msg: a.verified18 ? '✔ Verified 18+' : '✖ VRChat meldet keine Altersverifizierung (18+) für dein Konto.' });
            }
            case 'acct_logout': {
                const c = this.current();
                if (c) await this.call('logout', { device: str(input.device) }, c.token).catch(() => {});
                if (!input.device) { this.store(null); this.notifyAccess(); }
                return Object.assign(this.status(), { msg: input.device ? 'Gerät abgemeldet.' : 'Nexus-Konto auf diesem Gerät abgemeldet.' });
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Account };
