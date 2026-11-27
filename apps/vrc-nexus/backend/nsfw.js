'use strict';
/*
 * 🔞 NSFW-Bereich & Admin:
 *  - Besitzer: nur ein VRChat-Konto (im Code steht nur der SHA-256 der User-ID) bekommt Admin & Dashboard-Funktionen.
 *  - Freischalt-Schlüssel (NXK1): der Besitzer erzeugt sie (Ed25519-unterschrieben), jeder Schlüssel gilt nur für EINE VRChat-User-ID.
 *    Andere Apps prüfen die Unterschrift mit dem öffentlichen Schlüssel des Besitzers (TRUSTED) – fälschen oder weitergeben geht nicht.
 *    Seit 3.0 NUR noch für Rollen (Supporter, Moderator) – NXK1 schaltet KEIN NSFW mehr frei.
 *  - NSFW-Freigabe (seit 3.0): nur mit „Verified 18+“ (VRChat-Altersstatus, serverseitig geprüft über das Nexus-Konto, account.js)
 *    UND bewusst eingeschaltetem NSFW-Schalter. Das gilt für alle, auch für den Besitzer.
 *  - Werkzeuge: Panik-Knopf, Privat-Modus, SFW/NSFW-Avatarpaare, Grenzen-Karte, 18+-Instanz.
 * Inhalte (Bilder/Texte) bringt die App bewusst nicht mit – nur Werkzeuge.
 */
const crypto = require('crypto');
const { str, int, cut, arr, now, UserError } = require('./util');

/** SHA-256 der VRChat-User-ID des Besitzers (die ID selbst steht nicht im Code) */
const OWNER_HASH = '23e799d90cf62600203499e3f4d2712bb1a016e71dac64718b2c7d8267b2789e';
/** öffentliche Schlüssel (Ed25519, SPKI/DER base64), mit denen Freischalt-Schlüssel unterschrieben sein dürfen */
const TRUSTED = [
    'MCowBQYDK2VwAyEAg3Ejm0ec/StudDQryGwNGNr55UKQT3EQYvdPhL3dvo4=',   // Besitzer, erzeugt am 15.11.2026
];
/** Bereiche, die mit der NSFW-Freigabe (Verified 18+ + Schalter) gemeinsam frei werden */
const FEATURES = { nsfw: 'NSFW-Werkzeuge', toys: 'Spielzeug-Steuerung (Intiface)', remote: 'Handy-Fernbedienung' };
/** Rollen, die ein NXK1-Schlüssel vergeben kann (keine Altersfreigabe!) */
const ROLES = { supporter: 'Supporter', mod: 'Moderator', creator: 'Creator', beta: 'Beta-Tester' };   // 5.6: Creator und Beta dazu
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hashId = id => crypto.createHash('sha256').update(str(id)).digest('hex');
const DEF = { safe_avatar: '', pairs: [], yes: '', maybe: '', no: '', panic_avatar: true, panic_chat: true, panic_private: true, panic_toys: true, group: '', panic_we: 'off', panic_we_profile: '', panic_we_back: '', panic_we_path: '' };

class Nsfw {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.private = false; this.trusted = TRUSTED.slice(); }
    acc() { return this.app.vrc.account(); }
    myId() { const a = this.acc(); return a ? str(a.vrc_id) : ''; }
    isOwner(id) { const u = id || this.myId(); return !!u && (process.env.NEXUS_OWNER_HASH || OWNER_HASH) === hashId(u); }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('nsfw_cfg', '{}'))); } catch (e) { return Object.assign({}, DEF); } }

    // ---------- Schlüssel des Besitzers ----------
    ownerKey() {
        try { const k = JSON.parse(this.crypt.decrypt(this.app.db.setting('nsfw_owner_key', '')) || 'null'); return k && k.priv ? k : null; } catch (e) { return null; }
    }
    makeOwnerKey() {
        if (!this.isOwner()) throw new UserError('Nur für den Besitzer.');
        if (this.ownerKey()) throw new UserError('Es gibt schon ein Schlüsselpaar.');
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        const k = { pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), priv: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), at: now() };
        this.app.db.setSetting('nsfw_owner_key', this.crypt.encrypt(JSON.stringify(k)));
        return k.pub;
    }
    keys() { const k = this.ownerKey(), l = this.trusted.slice(); if (k && this.isOwner() && !l.includes(k.pub)) l.push(k.pub); return l; }

    // ---------- Freischalt-Schlüssel ----------
    sign(payload) {
        const k = this.ownerKey();
        if (!k) throw new UserError('Erst ein Schlüsselpaar erzeugen.');
        const body = b64u(JSON.stringify(payload));
        const priv = crypto.createPrivateKey({ key: Buffer.from(k.priv, 'base64'), format: 'der', type: 'pkcs8' });
        return 'NXK1.' + body + '.' + b64u(crypto.sign(null, Buffer.from(body), priv));
    }
    /** Schlüssel prüfen → Inhalt oder Fehlertext */
    check(token, uid) {
        const m = /^NXK1\.([\w-]+)\.([\w-]+)$/.exec(str(token).trim());
        if (!m) return { error: 'Das ist kein VRC-Nexus-Freischalt-Schlüssel.' };
        let ok = false;
        for (const pub of this.keys()) {
            try { ok = crypto.verify(null, Buffer.from(m[1]), crypto.createPublicKey({ key: Buffer.from(pub, 'base64'), format: 'der', type: 'spki' }), unb64u(m[2])); } catch (e) { ok = false; }
            if (ok) break;
        }
        if (!ok) return { error: 'Unterschrift ungültig – der Schlüssel stammt nicht vom Besitzer (oder diese App-Version kennt seinen Schlüssel noch nicht).' };
        let p;
        try { p = JSON.parse(unb64u(m[1]).toString('utf8')); } catch (e) { return { error: 'Schlüssel beschädigt.' }; }
        if (!p.uid || str(p.uid).toLowerCase() !== str(uid).toLowerCase()) return { error: 'Dieser Schlüssel gehört zu einem anderen VRChat-Konto.' };   // 3.4.2: je Schlüssel genau ein Konto (Supporter/Moderator)
        if (p.exp && p.exp < now()) return { error: 'Der Schlüssel ist abgelaufen.' };
        if (this.revoked().includes(p.id)) return { error: 'Der Schlüssel wurde gesperrt.' };
        return { payload: p };
    }
    revokedLocal() { try { return JSON.parse(this.app.db.setting('nsfw_revoked', '[]')) || []; } catch (e) { return []; } }
    /** 5.6: eigene Sperren + Sperrliste der Webseite (gilt in jeder App, nicht nur beim Besitzer) */
    revoked() { const l = this.revokedLocal(); return this.app.license ? l.concat(this.app.license.remote().ids) : l; }
    myToken() {
        try { const t = this.crypt.decrypt(this.app.db.setting('nsfw_token', '')) || ''; if (t) return t; } catch (e) { /* weiter */ }
        // 3.4.1 Multiaccount: Schlüssel aus einem anderen Konto dieser App, wenn er (auch) für dieses VRChat-Konto gilt
        const uid = this.myId(), dir = this.app.tools && this.app.tools.userData;
        if (!uid || !dir) return '';
        for (const enc of require('./profiles').sharedKeys(dir)) {
            let t = ''; try { t = this.crypt.decrypt(enc) || ''; } catch (e) { continue; }
            if (t && !this.check(t, uid).error) return t;
        }
        return '';
    }
    /** Was ist für das eingeloggte Konto freigeschaltet? */
    /** Rollen aus dem NXK1-Schlüssel (Supporter/Moderator) */
    roles() {
        const uid = this.myId();
        if (!uid) return { key: false, roles: [], reason: '' };
        if (this.isOwner(uid)) return { key: true, roles: Object.keys(ROLES), exp: 0 };
        const t = this.myToken();
        if (!t) return { key: false, roles: [], reason: '' };
        const r = this.check(t, uid);
        if (r.error) return { key: false, roles: [], reason: r.error };
        return { key: true, roles: arr(r.payload.f).filter(f => ROLES[f]), exp: int(r.payload.exp), note: str(r.payload.n) };
    }
    /** Was ist für das eingeloggte Konto freigeschaltet? NSFW nur mit Verified 18+ + Schalter (account.js) */
    /** 5.1.1: wird bei jeder OSC-Nachricht und 4×/s von der Spielzeug-Schleife gefragt → 1 s zwischenspeichern
     *  (sonst jedes Mal entschlüsseln, Schlüsseldateien lesen und die Signatur prüfen) */
    access() {
        const uid = this.myId(), m = this.accessMemo;
        if (m && m.uid === uid && Date.now() - m.at < 1000) return Object.assign({}, m.v, { features: m.v.features.slice(), roles: m.v.roles.slice() });
        const v = this.accessNow();
        this.accessMemo = { uid, at: Date.now(), v };
        return Object.assign({}, v, { features: v.features.slice(), roles: v.roles.slice() });
    }
    accessNow() {
        const uid = this.myId();
        if (!uid) return { owner: false, unlocked: false, features: [], roles: [], reason: 'Nicht bei VRChat angemeldet.' };
        const owner = this.isOwner(uid), k = this.roles();
        const age = this.app.account ? this.app.account.age() : { connected: false, verified: false, nsfw_on: false, age_until: 0 };
        const unlocked = age.verified && age.nsfw_on;
        const reason = unlocked ? '' : !age.connected ? 'Nexus-Konto nicht verbunden.' : !age.verified ? 'Kein gültiger „Verified 18+“-Status (VRChat-Altersverifizierung 18+ abschließen, dann „18+ neu prüfen“).' : 'NSFW ist ausgeschaltet.';
        return { owner, unlocked, features: unlocked ? Object.keys(FEATURES) : [], roles: k.roles, key: k.key, mod: k.roles.includes('mod'), supporter: k.roles.includes('supporter'),
            verified18: age.verified, nsfw_on: age.nsfw_on, connected: age.connected, exp: age.age_until, reason, key_reason: k.reason || '' };
    }
    /** Schlüssel für Online-Dienste (Warnliste): eigener Freischalt-Schlüssel – die Besitzerin unterschreibt sich einen kurzlebigen selbst */
    serviceToken() {
        const uid = this.myId();
        if (!uid) return '';
        if (this.isOwner(uid)) {
            const k = this.ownerKey();
            if (!k) return '';
            return this.sign({ v: 1, id: 'own' + crypto.randomBytes(4).toString('hex'), uid, f: ['mod'], iat: now(), exp: now() + 900 });
        }
        const t = this.myToken();
        return t && !this.check(t, uid).error ? t : '';
    }
    need(f) { const a = this.access(); if (!a.unlocked || (f && !a.features.includes(f))) throw new UserError('Nicht freigeschaltet.'); return a; }

    // ---------- Admin: Schlüssel erzeugen, Liste, sperren ----------
    /** 3.4: Rechte-Protokoll (nur lokal beim Besitzer, letzte 300 Einträge) */
    permLog() { try { return JSON.parse(this.app.db.setting('nsfw_permlog', '[]')) || []; } catch (e) { return []; } }
    logPerm(what, detail) { const l = this.permLog(); l.unshift({ at: now(), what: cut(str(what), 60), detail: cut(str(detail), 200) }); this.app.db.setSetting('nsfw_permlog', JSON.stringify(l.slice(0, 300))); }
    issued() { try { return JSON.parse(this.app.db.setting('nsfw_issued', '[]')) || []; } catch (e) { return []; } }
    async issue(input) {
        if (!this.isOwner()) throw new UserError('Nur für den Besitzer.');
        const uid = str(input.uid).trim().replace(/^.*\/(usr_[0-9a-f-]{36}).*$/i, '$1');
        if (!/^(?:usr_[0-9a-f-]{36}|[0-9a-z]{10})$/i.test(uid)) throw new UserError('Bitte eine VRChat-User-ID (usr_…) oder einen Profil-Link angeben.');
        let name = cut(str(input.name).trim(), 60);
        if (!name) { try { const u = await this.app.tools.call('GET', '/users/' + encodeURIComponent(uid)); name = str(u && u.displayName); } catch (e) { /* ohne Namen */ } }
        const days = int(input.days);
        const f = arr(String(input.features || 'supporter').split(',')).map(x => x.trim()).filter(x => ROLES[x]);
        if (!f.length) throw new UserError('Mindestens eine Rolle wählen (Supporter, Moderator, Creator oder Beta-Tester).');
        const payload = { v: 1, id: crypto.randomBytes(6).toString('hex'), uid, f, iat: now(), exp: days > 0 ? now() + days * 86400 : 0, n: cut(str(input.note), 80) };
        const token = this.sign(payload);
        const l = this.issued(); l.unshift({ id: payload.id, uid, name, f: payload.f, iat: payload.iat, exp: payload.exp, note: payload.n, revoked: false });
        this.logPerm('Schlüssel erzeugt', (name || uid) + ' · ' + f.join(', '));
        this.app.db.setSetting('nsfw_issued', JSON.stringify(l.slice(0, 500)));
        if (this.app.license) this.app.license.autoSync();   // 5.6: bei der Webseite eintragen
        return { token, entry: l[0], msg: 'Schlüssel für ' + (name || uid) + ' erzeugt.' };
    }
    revoke(id, on) {
        if (!this.isOwner()) throw new UserError('Nur für den Besitzer.');
        const l = this.issued(), e = l.find(x => x.id === str(id));
        if (!e) throw new UserError('Nicht gefunden.');
        e.revoked = on !== false;
        this.app.db.setSetting('nsfw_issued', JSON.stringify(l));
        const r = new Set(this.revokedLocal()); if (e.revoked) r.add(e.id); else r.delete(e.id);
        this.logPerm(e.revoked ? 'Schlüssel gesperrt' : 'Schlüssel entsperrt', (e.name || e.uid) + ' · ' + e.id);
        this.app.db.setSetting('nsfw_revoked', JSON.stringify([...r]));
        this.accessMemo = null;
        if (this.app.license) this.app.license.autoSync();   // 5.6: Sperre gilt dann überall
        return { items: l };
    }
    /** 5.6: Schlüssel verlängern – gleiche ID (Sperren gelten weiter), neues Ablaufdatum, neuer Schlüssel zum Weitergeben */
    extend(id, days) {
        if (!this.isOwner()) throw new UserError('Nur für den Besitzer.');
        const l = this.issued(), e = l.find(x => x.id === str(id));
        if (!e) throw new UserError('Nicht gefunden.');
        if (e.revoked) throw new UserError('Gesperrte Schlüssel erst entsperren.');
        const d = int(days);
        const base = e.exp && e.exp > now() ? e.exp : now();
        const exp = d > 0 ? base + d * 86400 : 0;
        const token = this.sign({ v: 1, id: e.id, uid: e.uid, f: e.f, iat: now(), exp, n: cut(str(e.note), 80) });
        e.exp = exp; e.ext = (e.ext || 0) + 1;
        this.app.db.setSetting('nsfw_issued', JSON.stringify(l));
        this.logPerm('Schlüssel verlängert', (e.name || e.uid) + ' · ' + (exp ? new Date(exp * 1000).toISOString().slice(0, 10) : 'unbegrenzt'));
        if (this.app.license) this.app.license.autoSync();
        return { token, entry: e, items: l, msg: 'Verlängert – neuen Schlüssel an ' + (e.name || e.uid) + ' schicken (der alte gilt bis zu seinem Datum weiter).' };
    }

    // ---------- Werkzeuge ----------
    saveCfg(c) {
        const cur = this.cfg(), av = v => (/^avtr_[0-9a-f-]{36}$/i.test(str(v).trim()) ? str(v).trim() : '');
        const n = Object.assign({}, cur);
        if (c.safe_avatar !== undefined) n.safe_avatar = av(c.safe_avatar);
        if (c.pairs !== undefined) { let p = c.pairs; if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = []; } } n.pairs = arr(p).map(x => ({ name: cut(str(x.name), 40), sfw: av(x.sfw), nsfw: av(x.nsfw) })).filter(x => x.sfw && x.nsfw).slice(0, 20); }
        for (const k of ['yes', 'maybe', 'no']) if (c[k] !== undefined) n[k] = cut(str(c[k]).replace(/\s+/g, ' ').trim(), 200);
        for (const k of ['panic_avatar', 'panic_chat', 'panic_private', 'panic_toys']) if (c[k] !== undefined) n[k] = c[k] === true || c[k] === '1' || c[k] === 'true';
        // 4.3: Wallpaper Engine im Panik-Knopf
        if (c.panic_we !== undefined) n.panic_we = require('./wallpaper').MODES.includes(str(c.panic_we)) ? str(c.panic_we) : 'off';
        for (const k of ['panic_we_profile', 'panic_we_back']) if (c[k] !== undefined) n[k] = cut(str(c[k]).replace(/["\r\n]/g, '').trim(), 60);
        if (c.panic_we_path !== undefined) { const v = cut(str(c.panic_we_path).replace(/["\r\n]/g, '').trim(), 400); if (v && !/\.exe$/i.test(v)) throw new UserError('Bitte den Pfad zu wallpaper64.exe eintragen.'); n.panic_we_path = v; }
        if (c.group !== undefined) n.group = /^grp_[0-9a-f-]{36}$/i.test(str(c.group).trim()) ? str(c.group).trim() : '';
        this.app.db.setSetting('nsfw_cfg', JSON.stringify(n));
        return n;
    }
    async selectAvatar(id) { await this.app.tools.call('PUT', '/avatars/' + encodeURIComponent(id) + '/select'); }
    /** Panik: sicherer Avatar, Chatbox aus, Privat-Modus, Spielzeug stopp */
    async panic() {
        const c = this.cfg(), done = [];
        if (c.panic_toys && this.app.toys) { await this.app.toys.stopAll().catch(() => {}); done.push('Spielzeug gestoppt'); }
        else if (this.app.toys && this.app.toys.scenes && this.app.toys.scenes.run) { this.app.toys.scenes.stop(); await this.app.toys.stopAll().catch(() => {}); done.push('Szene beendet'); }   // 6.2: laufende Szene endet immer
        if (this.app.toyremote && this.app.toyremote.cfg().recv_on) { this.app.toyremote.panic(); done.push('Fernsteuerung aus'); }
        if (c.panic_private) { this.private = true; done.push('Privat-Modus an'); }
        if (c.panic_chat) {
            const g = this.app.game; g.suppressRotator = true;
            if (this.app.chatmods && this.app.chatmods.cfg().on) await this.app.chatmods.action('cm_save', { on: '0', quiet: '1' }).catch(() => {});
            await g.osc.chatbox('', false).catch(() => {}); done.push('Chatbox leer & aus');
        }
        if (c.panic_avatar && c.safe_avatar) { await this.selectAvatar(c.safe_avatar).catch(e => done.push('⚠ Avatar: ' + e.message)); done.push('sicherer Avatar'); }
        if (c.panic_we && c.panic_we !== 'off') { try { const m = await this.we().panic(c); if (m) done.push(m); } catch (e) { done.push('⚠ Wallpaper: ' + e.message); } }
        if (this.app.obs) { const m = await this.app.obs.onPanic(); if (m) done.push(m); }   // 5.0
        if (this.app.tools.rpc) this.app.tools.rpc.setActivity(null);
        return { ok: true, msg: '🚨 Panik: ' + done.join(' · '), private: this.private };
    }
    /** 5.3: Panik wie der Knopf oben im Client – Panik-Aktionen UND NSFW am Nexus-Konto aus (Uhr, Handy, Client gleich).
     *  Ist der Server nicht erreichbar, wird NSFW lokal aus gemerkt, damit die Freischaltung trotzdem sofort weg ist. */
    async panicFull() {
        const r = await this.panic();
        let off = 'NSFW aus';
        try { await this.app.account.action('acct_nsfw', { on: '0' }); }
        catch (e) {
            const c = this.app.account.current && this.app.account.current();
            if (c && c.account) this.app.account.save(Object.assign({}, c.account, { nsfw_on: false }));
            off = 'NSFW lokal aus (Server: ' + e.message + ')';
        }
        this.accessMemo = null;
        if (this.app.tools && this.app.tools.nsfwOffUi) { try { this.app.tools.nsfwOffUi(); } catch (e) { /* Oberfläche zu */ } }
        return Object.assign(r, { msg: r.msg + ' · ' + off, nsfw_off: true });
    }
    we() { if (!this.app.wallpaper) { const { Wallpaper } = require('./wallpaper'); this.app.wallpaper = new Wallpaper(this.app); } return this.app.wallpaper; }
    /** 4.3: Entwarnung – Privat-Modus aus, Chatbox-Rotation wieder frei, Wallpaper zurück */
    async allClear() {
        const c = this.cfg(), done = [];
        if (this.private) { this.private = false; done.push('Privat-Modus aus'); }
        if (this.app.game.suppressRotator) { this.app.game.suppressRotator = false; done.push('Chatbox-Rotation frei'); }
        if (c.panic_we && c.panic_we !== 'off') { try { const m = await this.we().restore(c); if (m) done.push(m); } catch (e) { done.push('⚠ Wallpaper: ' + e.message); } }
        return { ok: true, msg: '✅ Entwarnung' + (done.length ? ': ' + done.join(' · ') : ''), private: this.private };
    }
    async toggleAvatar(i) {
        const c = this.cfg(), p = c.pairs[int(i)];
        if (!p) throw new UserError('Avatar-Paar nicht gefunden.');
        const acc = this.acc(), me = str(acc && acc.me && acc.me.currentAvatar);
        const cur = me === p.sfw || me === p.nsfw ? me : this.curAv || me;   // VRChat-Stand, sonst zuletzt selbst gewählt
        const to = cur === p.nsfw ? p.sfw : p.nsfw;
        await this.selectAvatar(to);
        this.curAv = to;
        if (acc && acc.me) acc.me.currentAvatar = to;
        return { ok: true, msg: (to === p.nsfw ? '🔞 ' : '🙂 ') + (p.name || 'Avatar') + ' – ' + (to === p.nsfw ? 'NSFW' : 'SFW'), nsfw: to === p.nsfw };
    }
    boundariesText() {
        const c = this.cfg();
        const t = [c.yes && '🟢 ' + c.yes, c.maybe && '🟡 ' + c.maybe, c.no && '🔴 ' + c.no].filter(Boolean).join('\n');
        if (!t) throw new UserError('Erst die Grenzen-Karte ausfüllen.');
        return Array.from(t).slice(0, 144).join('');
    }

    state() {
        const a = this.access(), c = this.cfg();
        const out = { access: a, private: this.private, features: FEATURES, roles: ROLES };
        if (a.owner) { const k = this.ownerKey(); Object.assign(out, { owner_key: k ? k.pub : '', key_known: !!(k && TRUSTED.includes(k.pub)), issued: this.issued(), permlog: this.permLog().slice(0, 50), lic_synced: int(this.app.db.setting('lic_synced', '0')) }); }
        if (!a.unlocked) return out;
        Object.assign(out, { cfg: c, current_avatar: str(this.acc() && this.acc().me && this.acc().me.currentAvatar), toys: this.app.toys ? this.app.toys.status() : null, tremote: this.app.toyremote ? this.app.toyremote.status() : null, remote: this.app.remote ? this.app.remote.status() : null });
        return out;
    }
    async action(act, input) {
        this.accessMemo = null;
        switch (act) {
            case 'nsfw_state': return this.state();
            case 'nsfw_unlock': {
                const uid = this.myId();
                if (!uid) throw new UserError('Erst bei VRChat anmelden.');
                const t = str(input.token).trim();
                if (!t) { const old = this.app.db.setting('nsfw_token', ''); if (old) require('./profiles').setSharedKey(this.app.tools && this.app.tools.userData, old, true); this.app.db.setSetting('nsfw_token', ''); return Object.assign(this.state(), { msg: 'Schlüssel entfernt.' }); }
                const r = this.check(t, uid);
                if (r.error) throw new UserError(r.error);
                const enc = this.crypt.encrypt(t);
                this.app.db.setSetting('nsfw_token', enc);
                require('./profiles').setSharedKey(this.app.tools && this.app.tools.userData, enc);   // 3.4.1: gilt auch in den anderen Konten dieser App
                return Object.assign(this.state(), { msg: '🔑 Schlüssel gespeichert: ' + (arr(r.payload.f).filter(f => ROLES[f]).map(f => ROLES[f]).join(', ') || 'keine Rolle') + '.' });
            }
        }
        // ab hier nur freigeschaltet
        if (act.startsWith('nsfw_admin_')) {
            if (!this.isOwner()) throw new UserError('Nur für den Besitzer.');
            switch (act) {
                case 'nsfw_admin_keypair': { const pub = this.makeOwnerKey(); return Object.assign(this.state(), { pub, msg: 'Schlüsselpaar erzeugt.' }); }
                case 'nsfw_admin_issue': return Object.assign(await this.issue(input), { items: this.issued() });
                case 'nsfw_admin_revoke': return this.revoke(input.id, input.on !== '0');
                case 'nsfw_admin_extend': return this.extend(input.id, input.days);
                case 'nsfw_admin_check': { const r = this.check(input.token, str(input.uid)); return r.error ? { ok: false, msg: r.error } : { ok: true, msg: '✔ gültig für ' + r.payload.uid, payload: r.payload }; }
            }
        }
        this.need('nsfw');
        switch (act) {
            case 'nsfw_cfg': return Object.assign(this.state(), { cfg: this.saveCfg(input), msg: 'Gespeichert.' });
            case 'nsfw_panic': return await this.panic();
            case 'nsfw_panic_full': return await this.panicFull();
            case 'nsfw_allclear': return await this.allClear();
            case 'nsfw_private': { this.private = input.on === undefined ? !this.private : input.on === '1' || input.on === true; if (this.private && this.app.tools.rpc) this.app.tools.rpc.setActivity(null); return { ok: true, private: this.private, msg: this.private ? '🕶 Privat-Modus an' : 'Privat-Modus aus' }; }
            case 'nsfw_avatar': return await this.toggleAvatar(input.i);
            case 'nsfw_chat': {
                const t = cut(str(input.text).replace(/\s+/g, ' ').trim(), 144);
                if (!t) throw new UserError('Kein Text.');
                if (this.private) throw new UserError('🕶 Privat-Modus ist an – Chatbox gesperrt.');
                await this.app.game.osc.chatbox(t, input.sound !== '0'); return { ok: true, msg: '💬 In die Chatbox geschickt.', text: t };
            }
            case 'nsfw_consent': { const t = '💬 Alles okay für dich? 🟢 weiter · 🟡 langsamer · 🔴 stopp'; await this.app.game.osc.chatbox(t, true); return { ok: true, msg: '🤝 Nachfrage geschickt.', text: t }; }
            case 'nsfw_boundaries': { const t = this.boundariesText(); await this.app.game.osc.chatbox(t, true); return { ok: true, msg: 'Grenzen-Karte in die Chatbox geschickt.', text: t }; }
            case 'nsfw_instance': {
                const st = this.app.game.state, world = str(input.world) || st.worldId;
                if (!/^wrld_/.test(world)) throw new UserError('Du bist in keiner Welt – Welt-ID angeben.');
                const c = this.cfg(), group = input.kind === 'group';
                if (group && !c.group) throw new UserError('Erst eine 18+-Gruppe (grp_…) eintragen.');
                return await this.app.post({ act: 'instance_create', world, type: group ? 'group' : 'invite', group: c.group, access: 'members', age_gate: group ? '1' : '', invite_me: '1', region: str(input.region || 'eu') }, {});
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Nsfw, OWNER_HASH, TRUSTED, FEATURES, ROLES, hashId };
