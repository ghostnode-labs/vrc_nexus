'use strict';
/*
 * 8.0.2: 🔄 Verschlüsselter Einstellungs-Abgleich zwischen deinen Geräten (PC, Laptop, Handy).
 *   • Weg: über die bestehende Dashboard-Verbindung (client.php, eigenes GhostNode-Konto) – der Server speichert nur einen
 *     mit deinem Sicherungs-Passwort verschlüsselten Block (AES-256-GCM, Schlüssel per scrypt; gleiche Technik wie die Cloud-Sicherung).
 *   • Inhalt: alle normalen Einstellungen (ohne Geheimnisse, Tokens, Schlüssel und gerätespezifische Adressen) plus Komfort,
 *     Pausen-Coach und Smart-Home-Regeln (ohne Geräte/Tokens). Der Energie-Modus bleibt je Gerät.
 *   • Zusammenführen je Einstellung (3-Wege): was nur hier geändert wurde, bleibt; was dort geändert wurde, kommt her;
 *     beide geändert → die andere Seite gewinnt (sie war zuerst oben). Danach wird der gemeinsame Stand hochgeladen.
 *   • Automatisch alle 10 Minuten (wenn eingeschaltet) oder per Knopf.
 */
const os = require('os');
const crypto = require('crypto');
const { str, UserError } = require('./util');
const { CloudBackup } = require('./cloudbackup');

const EXTRA = ['comfort_cfg', 'coach_cfg', 'smarthome_cfg'];   // Energie-Modus bleibt je Gerät (Laptop ≠ PC)
const EVERY = 10 * 60000;
const stable = o => JSON.stringify(o, Object.keys(o || {}).sort());
const hash = o => crypto.createHash('sha256').update(stable(o)).digest('hex').slice(0, 16);

class SettingSync {
    /** opts (8.0.4): key = eigener Zustand, link = () => Transport mit base()/token()/req() (Standard: Dashboard-Verbindung), name = Timer-Name */
    constructor(app, crypt, opts = {}) { this.app = app; this.crypt = crypt; this.timer = null; this.busy = false; this.key = opts.key || 'sync_state'; this.linkFn = opts.link || (() => this.app.link); this.name = opts.name || 'settingsync'; this.noLink = opts.noLink || 'Erst die Dashboard-Verbindung einrichten (Einstellungen → Verbindung).'; }
    link() { return this.linkFn(); }
    state() { try { return Object.assign({ on: false, rev: 0, snap: null, last: 0, err: '', applied: 0, pushed: 0 }, JSON.parse(this.app.db.setting(this.key, '{}'))); } catch (e) { return { on: false, rev: 0, snap: null, last: 0, err: '' }; } }
    save(st) { this.app.db.setSetting(this.key, JSON.stringify(st)); return st; }
    pass() { return this.app.backup ? this.app.backup.pass() : ''; }
    device() { return str(os.hostname()).replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 40) || (this.app.mobile ? 'Handy' : 'PC'); }

    /** lokaler Stand als flaches Objekt: „s:<einstellung>“ und „x:<bereich>“ */
    local() {
        const out = {};
        const ex = this.app.ctools ? this.app.ctools.exportSettings().settings : {};
        for (const [k, v] of Object.entries(ex)) out['s:' + k] = v;
        for (const k of EXTRA) {
            let v = null; try { v = JSON.parse(this.app.db.setting(k, 'null')); } catch (e) { v = null; }
            if (v && typeof v === 'object') out['x:' + k] = v;
        }
        return out;
    }
    /** Stand übernehmen (nur geänderte Schlüssel) */
    apply(flat, before) {
        const s = {};
        let n = 0;
        for (const [k, v] of Object.entries(flat)) {
            if (stable({ v }) === stable({ v: before[k] })) continue;
            if (k.startsWith('s:')) { s[k.slice(2)] = v; n++; }
            else if (k.startsWith('x:') && EXTRA.includes(k.slice(2)) && v && typeof v === 'object') { this.app.db.setSetting(k.slice(2), JSON.stringify(v)); n++; }
        }
        if (Object.keys(s).length && this.app.ctools) { try { this.app.ctools.importSettings({ settings: s }); } catch (e) { /* nichts Passendes */ } }
        return n;
    }
    static merge(base, mine, theirs) {
        const out = {}, keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
        const eq = (a, b) => stable({ v: a }) === stable({ v: b });
        for (const k of keys) {
            const b = base ? base[k] : undefined, m = mine[k], t = theirs[k];
            if (!(k in theirs)) { out[k] = m; continue; }
            if (!(k in mine)) { out[k] = t; continue; }
            out[k] = eq(m, t) ? m : base && eq(t, base[k]) ? m : base && eq(m, base[k]) ? t : t;   // nur hier geändert → meins; nur dort → deins; beide/ohne Stand → die andere Seite
        }
        return out;
    }
    seal(obj, pass) { return CloudBackup.seal(Buffer.from(JSON.stringify(obj)), pass).toString('base64'); }
    open(b64, pass) { return JSON.parse(CloudBackup.open(Buffer.from(b64, 'base64'), pass).toString('utf8')); }

    async sync(now = Date.now()) {
        const pass = this.pass(), link = this.link();
        if (!pass) throw new UserError('Erst unter „Cloud-Sicherung“ ein Sicherungs-Passwort festlegen – damit wird auch der Abgleich verschlüsselt (auf allen Geräten das gleiche).');
        if (!link || !link.base() || !link.token()) throw new UserError(this.noLink);
        if (this.busy) throw new UserError('Abgleich läuft schon.');
        this.busy = true;
        const st = this.state();
        try {
            for (let tries = 0; tries < 3; tries++) {
                const remote = await link.req('GET', 'sync_get');
                const theirs = remote.rev > 0 && remote.data ? (this.open(remote.data, pass).data || {}) : null;
                const mine = this.local();
                let merged = mine, pulled = 0;
                if (theirs && remote.rev !== st.rev) { merged = SettingSync.merge(st.snap, mine, theirs); pulled = this.apply(merged, mine); }
                if (theirs && hash(merged) === hash(theirs)) {   // gleicher Stand wie oben → nichts hochzuladen
                    Object.assign(st, { rev: remote.rev, snap: merged, last: now, err: '', applied: (st.applied || 0) + pulled }); this.save(st);
                    return { pulled, pushed: false, rev: st.rev, msg: pulled ? '⬇ ' + pulled + ' Einstellung(en) von „' + remote.device + '“ übernommen.' : '✔ Alles ist abgeglichen.' };
                }
                try {
                    const r = await link.req('POST', 'sync_put', { base: remote.rev, device: this.device(), data: this.seal({ v: 1, at: now, device: this.device(), data: merged }, pass) });
                    Object.assign(st, { rev: r.rev, snap: merged, last: now, err: '', applied: (st.applied || 0) + pulled, pushed: (st.pushed || 0) + 1 }); this.save(st);
                    return { pulled, pushed: true, rev: r.rev, msg: (pulled ? '⬇ ' + pulled + ' übernommen, ' : '') + '⬆ Stand hochgeladen.' };
                } catch (e) { if (!/409/.test(e.message)) throw e; }   // jemand war schneller → neu holen und zusammenführen
            }
            throw new UserError('Abgleich gerade nicht möglich (viele gleichzeitige Änderungen) – gleich noch einmal.');
        } catch (e) { st.err = e.message; this.save(st); throw e; }
        finally { this.busy = false; }
    }
    start() {
        if (this.timer) return;
        this.timer = setInterval(() => {
            if (!this.state().on || (this.app.energy && this.app.energy.skip(this.name, EVERY))) return;
            this.sync().catch(() => {});
        }, EVERY);
        if (this.timer.unref) this.timer.unref();
    }
    stop() { clearInterval(this.timer); this.timer = null; }
    status() { const st = this.state(); return { on: st.on, rev: st.rev, last: st.last, err: st.err, applied: st.applied || 0, pushed: st.pushed || 0, has_pass: !!this.pass(), linked: (l => !!(l && l.base() && l.token()))(this.link()), device: this.device() }; }
    async action(act, input) {
        switch (act) {
            case 'sync_status': return this.status();
            case 'sync_on': { const st = this.state(); st.on = input.on === '1' || input.on === true; this.save(st); if (st.on) { try { const r = await this.sync(); return Object.assign(this.status(), r); } catch (e) { return Object.assign(this.status(), { msg: '⚠ ' + e.message }); } } return Object.assign(this.status(), { msg: 'Abgleich aus.' }); }
            case 'sync_now': return Object.assign(await this.sync(), this.status());
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { SettingSync, EXTRA };
