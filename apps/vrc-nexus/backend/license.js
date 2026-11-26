'use strict';
/*
 * 5.6: Lizenzen 2.0 – Freischalt-Schlüssel (NXK1) mit der GhostNode-Webseite abgleichen.
 *  - Sperrliste online: gesperrte Schlüssel gelten in JEDER App als gesperrt (nicht nur beim Besitzer), alle 6 h aktualisiert.
 *  - Eigene Lizenz: Rollen, Ablauf, Resttage, Status (gültig / läuft bald ab / abgelaufen / gesperrt), Online-Prüfung.
 *  - Erinnerung 14, 7 und 1 Tag vor Ablauf (je einmal).
 *  - Besitzer: ausgestellte Schlüssel an die Webseite melden (Verwaltung im Admin-Bereich der Webseite), Sperren dort wirkt überall.
 * Gesendet wird nur, was zum Prüfen nötig ist: der Schlüssel selbst (enthält nur ID, VRChat-ID, Rollen, Ablauf, Notiz) und die App-Version.
 */
const { str, int, UserError } = require('./util');

const BASE = () => (process.env.NEXUS_LIC_BASE || process.env.NEXUS_ACCT_BASE || require('./servers').nexus()).replace(/\/+$/, '');
const EVERY = 6 * 3600 * 1000;
const WARN_DAYS = [14, 7, 1];

class License {
    constructor(app) {
        this.app = app;
        this.timer = null;
        this.busy = null;
        this.auto = false;
    }
    /** nach Ausstellen/Sperren/Verlängern im Hintergrund abgleichen (nur im echten Programm) */
    autoSync() { if (this.auto) this.sync().catch(() => {}); }
    get nsfw() { return this.app.nsfw; }
    now() { return Math.floor(Date.now() / 1000); }
    remote() { try { const r = JSON.parse(this.app.db.setting('lic_remote', '{}')); return { ids: Array.isArray(r.ids) ? r.ids.map(str) : [], at: int(r.at), err: str(r.err) }; } catch (e) { return { ids: [], at: 0, err: '' }; } }
    async call(a, body) {
        let r;
        try { r = await fetch(BASE() + '/nexuslic.php?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000) }); }
        catch (e) { throw new UserError('GhostNode-Webseite nicht erreichbar.'); }
        let d = {}; try { d = await r.json(); } catch (e) { d = { error: 'Antwort kein JSON – liegt nexuslic.php auf der Webseite?' }; }
        if (!r.ok || d.error) throw new UserError(str(d.error) || 'Fehler ' + r.status + '.');
        return d;
    }
    /** Sperrliste holen (öffentlich) und merken; danach eigene Lizenz prüfen und ggf. erinnern */
    async refresh() {
        if (this.busy) return this.busy;
        this.busy = (async () => {
            try {
                const d = await this.call('revoked', {});
                this.app.db.setSetting('lic_remote', JSON.stringify({ ids: (Array.isArray(d.ids) ? d.ids : []).map(str).filter(x => /^[\w-]{1,40}$/.test(x)).slice(0, 5000), at: Date.now() }));
            } catch (e) {
                const r = this.remote(); this.app.db.setSetting('lic_remote', JSON.stringify(Object.assign(r, { err: e.message })));
            }
            if (this.nsfw) this.nsfw.accessMemo = null;
            this.remind();
            return this.remote();
        })().finally(() => { this.busy = null; });
        return this.busy;
    }
    start() {
        this.auto = true;   // nur im echten Programm: Ausstellen/Sperren gleicht danach automatisch mit der Webseite ab
        if (this.timer) return;
        setTimeout(() => this.refresh().catch(() => {}), 20000).unref?.();
        this.timer = setInterval(() => this.refresh().catch(() => {}), EVERY);
        if (this.timer.unref) this.timer.unref();
    }
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

    /** Eigene Lizenz in Klartext */
    mine() {
        const ns = this.nsfw, uid = ns ? ns.myId() : '';
        const out = { has: false, owner: false, status: 'none', roles: [], role_names: [], id: '', iat: 0, exp: 0, days_left: null, note: '', online: this.online(), remote_at: this.remote().at };
        if (!ns || !uid) return out;
        const ROLES = require('./nsfw').ROLES;
        if (ns.isOwner(uid)) return Object.assign(out, { has: true, owner: true, status: 'ok', roles: Object.keys(ROLES), role_names: Object.values(ROLES) });
        const t = ns.myToken();
        if (!t) return out;
        const r = ns.check(t, uid);
        let p = r.payload;
        if (!p) {   // trotzdem Inhalt zeigen (z. B. abgelaufen oder gesperrt), damit man weiß, was los ist
            const m = /^NXK1\.([\w-]+)\./.exec(t);
            try { p = m ? JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) : null; } catch (e) { p = null; }
        }
        if (p) Object.assign(out, { id: str(p.id), iat: int(p.iat), exp: int(p.exp), note: str(p.n), roles: (p.f || []).filter(f => ROLES[f]) });
        out.role_names = out.roles.map(f => ROLES[f]);
        out.has = true;
        out.reason = r.error || '';
        if (r.error) out.status = /gesperrt/.test(r.error) ? 'revoked' : /abgelaufen/.test(r.error) ? 'expired' : 'invalid';
        else if (out.exp) { out.days_left = Math.max(0, Math.ceil((out.exp - this.now()) / 86400)); out.status = out.days_left <= 14 ? 'expiring' : 'ok'; }
        else out.status = 'ok';
        return out;
    }
    online() { try { return JSON.parse(this.app.db.setting('lic_online', '{}')) || {}; } catch (e) { return {}; } }
    /** Eigenen Schlüssel bei der Webseite prüfen lassen (Unterschrift, Sperre, Ablauf) */
    async verifyOnline() {
        const t = this.nsfw && this.nsfw.myToken();
        if (!t) throw new UserError('Kein Freischalt-Schlüssel eingetragen.');
        let res;
        try { const d = await this.call('check', { token: t, version: require('./vrchat').VERSION }); res = { valid: !!d.valid, reason: str(d.reason), at: Date.now() }; }
        catch (e) { res = { valid: false, reason: e.message, at: Date.now(), offline: /nicht erreichbar|JSON/.test(e.message) }; }
        this.app.db.setSetting('lic_online', JSON.stringify(res));
        if (!res.offline) await this.refresh().catch(() => {});
        return res;
    }
    /** Erinnerung vor Ablauf – je Stufe nur einmal */
    remind() {
        const m = this.mine();
        if (!m.has || m.owner || !m.exp || m.status === 'revoked') return null;
        const left = Math.ceil((m.exp - this.now()) / 86400);
        const step = WARN_DAYS.find(d => left <= d && left > 0);
        if (step === undefined && left > 0) return null;
        const key = 'lic_warned_' + m.id + '_' + (left <= 0 ? 0 : step);
        if (this.app.db.setting(key, '')) return null;
        this.app.db.setSetting(key, '1');
        const msg = left <= 0 ? 'Dein Freischalt-Schlüssel (' + m.role_names.join(', ') + ') ist abgelaufen.' : 'Dein Freischalt-Schlüssel (' + m.role_names.join(', ') + ') läuft in ' + left + (left === 1 ? ' Tag' : ' Tagen') + ' ab.';
        if (this.app.tools && this.app.tools.alert) { try { this.app.tools.alert('🔑 VRC Nexus', msg); } catch (e) { /* ohne Benachrichtigung */ } }
        return msg;
    }
    /** Besitzer: ausgestellte Schlüssel an die Webseite melden */
    async sync() {
        const ns = this.nsfw;
        if (!ns || !ns.isOwner()) throw new UserError('Nur für den Besitzer.');
        const key = ns.serviceToken();
        if (!key) throw new UserError('Erst ein Schlüsselpaar erzeugen.');
        const entries = ns.issued().map(e => ({ id: e.id, uid: e.uid, name: e.name, f: e.f, iat: e.iat, exp: e.exp, note: e.note, revoked: !!e.revoked }));
        const d = await this.call('sync', { key, entries });
        // Sperren aus der Webseite übernehmen (dort gesperrt → hier auch)
        if (Array.isArray(d.revoked)) {
            const set = new Set(d.revoked.map(str)), l = ns.issued();
            let changed = false;
            for (const e of l) if (set.has(e.id) && !e.revoked) { e.revoked = true; changed = true; }
            if (changed) { this.app.db.setSetting('nsfw_issued', JSON.stringify(l)); this.app.db.setSetting('nsfw_revoked', JSON.stringify([...new Set(ns.revokedLocal().concat([...set]))])); }
        }
        this.app.db.setSetting('lic_synced', String(Date.now()));
        await this.refresh().catch(() => {});
        return { synced: entries.length, at: Date.now() };
    }
    async action(act, input) {
        switch (act) {
            case 'lic_get': return { license: this.mine(), remote: this.remote(), synced: int(this.app.db.setting('lic_synced', '0')) };
            case 'lic_check': { const r = await this.verifyOnline(); return { license: this.mine(), online: r, msg: r.valid ? '✔ Online geprüft: gültig.' : '⚠ ' + (r.reason || 'Nicht gültig.') }; }
            case 'lic_refresh': await this.refresh(); return { license: this.mine(), remote: this.remote(), msg: 'Sperrliste aktualisiert.' };
            case 'lic_sync': { const r = await this.sync(); return Object.assign({ msg: '☁ ' + r.synced + ' Schlüssel mit der Webseite abgeglichen.' }, r); }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { License, WARN_DAYS };
