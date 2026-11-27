'use strict';
/*
 * 6.7 (🔞, nur mit NSFW-Freigabe): Grenzen & Sicherheit
 *   • Grenzen-Profil 2.0: Einträge mit Kategorie, Ja / Vielleicht / Nein und eigener Notiz (verschlüsselt, nur auf diesem Gerät)
 *   • Safeword überall gleich: Wort (Spracheingabe), Geste (Avatar-Parameter), Knopf/Tastenkürzel, Uhr, Stream Deck → ein Ablauf
 *   • Privat-Modus 2.0: blendet 18+ in der Oberfläche aus, stummt 18+-Meldungen, optional automatisch wieder aus, übersteht Neustarts
 *   • Protokoll nur lokal und verschlüsselt, löscht sich nach N Tagen selbst
 *   • Geräte-Profile: Spielzeug-Einstellungen unter einem Namen sichern und wechseln
 *   • Fantasie-Baukasten: Titel, Ort, Stimmung, Rollen (2–4) mit Beschreibung, Grenzen, Safeword – als Karte teilen
 */
const crypto = require('crypto');
const { str, int, cut, UserError } = require('./util');

const LEVELS = { yes: '🟢', maybe: '🟡', no: '🔴' };
const CATS = ['Allgemein', 'Berührung', 'Sprache & Rollen', 'Spielzeug', 'Kleidung & Avatar', 'Öffentlichkeit', 'Intensität', 'Tabus'];
const DEF = { safeword: { word: '', param: '', param_value: '1', chat: true, toys: true, consent_red: true, scenes: true, private: false },
    private2: { hide_ui: true, mute_notes: true, auto_off_min: 0, persist: false }, log: { on: true, days: 30 } };

class NsfwSafe {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.cache = null; this.privOffT = null; this.lastSw = 0; }
    load() {
        if (this.cache) return this.cache;
        let d = null;
        try { const raw = this.app.db.setting('nsfw_safe', ''); d = raw ? JSON.parse(this.crypt.decrypt(raw)) : null; } catch (e) { d = null; }
        this.cache = Object.assign({ limits: [], fantasies: [], devprofiles: [], log: [] }, d || {});
        this.cache.cfg = Object.assign({}, DEF, this.cache.cfg || {});
        for (const k of Object.keys(DEF)) this.cache.cfg[k] = Object.assign({}, DEF[k], this.cache.cfg[k] || {});
        return this.cache;
    }
    save() { this.app.db.setSetting('nsfw_safe', this.crypt.encrypt(JSON.stringify(this.cache))); }
    cfg() { return this.load().cfg; }
    need() { if (this.app.nsfw) this.app.nsfw.need(''); }

    // ---------- Protokoll (lokal, verschlüsselt, Auto-Löschen) ----------
    log(kind, text) {
        const d = this.load(), c = d.cfg.log;
        if (!c.on) return;
        const cut0 = Date.now() - Math.max(1, int(c.days) || 30) * 86400000;
        d.log = d.log.filter(x => x.t >= cut0).slice(-499);
        d.log.push({ t: Date.now(), kind: cut(str(kind), 20), text: cut(str(text), 200) });
        this.save();
    }
    purge() { const d = this.load(), cut0 = Date.now() - Math.max(1, int(d.cfg.log.days) || 30) * 86400000, n = d.log.length; d.log = d.log.filter(x => x.t >= cut0); if (d.log.length !== n) this.save(); return n - d.log.length; }

    // ---------- Grenzen-Profil 2.0 ----------
    saveLimits(list) {
        let l = list; if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { l = null; } }
        if (!Array.isArray(l)) throw new UserError('Ungültige Liste.');
        const out = l.slice(0, 200).map(x => ({ cat: CATS.includes(str(x.cat)) ? str(x.cat) : 'Allgemein', label: cut(str(x.label).trim(), 60), level: LEVELS[str(x.level)] ? str(x.level) : 'maybe', note: cut(str(x.note).trim(), 200) })).filter(x => x.label);
        this.load().limits = out; this.save();
        this.syncCard();
        return out;
    }
    /** die alte Grenzen-Karte (Chatbox) aus dem Profil füllen – Ja / Vielleicht / Nein */
    syncCard() {
        const l = this.load().limits; if (!l.length || !this.app.nsfw) return;
        const by = k => l.filter(x => x.level === k).map(x => x.label).join(', ');
        this.app.nsfw.saveCfg({ yes: cut(by('yes'), 200), maybe: cut(by('maybe'), 200), no: cut(by('no'), 200) });
    }
    limitsText() {
        const l = this.load().limits;
        if (!l.length) throw new UserError('Das Grenzen-Profil ist noch leer.');
        return CATS.map(c => { const it = l.filter(x => x.cat === c); return it.length ? c + ':\n' + it.map(x => '  ' + LEVELS[x.level] + ' ' + x.label + (x.note ? ' – ' + x.note : '')).join('\n') : ''; }).filter(Boolean).join('\n');
    }

    // ---------- Safeword überall gleich ----------
    saveCfg(part, input) {
        const c = this.cfg();
        if (part === 'safeword') {
            const w = cut(str(input.word).trim(), 40);
            if (w && w.length < 3) throw new UserError('Das Safeword braucht mindestens 3 Zeichen.');
            const p = str(input.param).trim();
            if (p && !/^[\w./\-]{1,64}$/.test(p)) throw new UserError('Parameter-Name ungültig.');
            c.safeword = { word: w, param: p, param_value: cut(str(input.param_value || '1'), 10), chat: yes(input.chat), toys: yes(input.toys), consent_red: yes(input.consent_red), scenes: yes(input.scenes), private: yes(input.private) };
        } else if (part === 'private2') {
            c.private2 = { hide_ui: yes(input.hide_ui), mute_notes: yes(input.mute_notes), auto_off_min: Math.max(0, Math.min(480, int(input.auto_off_min))), persist: yes(input.persist) };
            this.app.db.setSetting('nsfw_private_persist', c.private2.persist && this.app.nsfw && this.app.nsfw.private ? '1' : '');
        } else if (part === 'log') {
            c.log = { on: yes(input.on), days: Math.max(1, Math.min(365, int(input.days) || 30)) };
            this.purge();
        } else throw new UserError('Unbekannt.');
        this.save();
        return c;
    }
    /** ein Ablauf für alle Wege (Wort, Geste, Knopf, Uhr, Stream Deck, Tastenkürzel) */
    async safeword(source, opt) {
        if (Date.now() - this.lastSw < 3000) return { ok: true, msg: '🛑 Safeword läuft schon', dup: true };   // doppelte Auslöser (Geste + Wort) zusammenfassen
        this.lastSw = Date.now();
        const c = this.cfg().safeword, a = this.app, done = [];
        if (c.toys && a.toys) { if (a.toys.scenes) a.toys.scenes.stop(); await a.toys.stopAll().catch(() => {}); done.push('Spielzeug aus'); }
        if (c.consent_red && a.toys) { await a.toys.setConsent('red').catch(() => {}); done.push('Ampel rot'); }
        if (c.scenes && a.toys && a.toys.scene) { a.toys.scene = null; done.push('Szene beendet'); }
        if (c.private && a.nsfw) { a.nsfw.private = true; done.push('Privat-Modus'); }
        if (c.chat && a.game && !(a.nsfw && a.nsfw.private && !c.private)) await a.game.osc.chatbox('🛑 SAFEWORD – Pause bitte. Alles gut, wir reden kurz.', true).catch(() => {});
        if (a.tools && a.tools.host && a.tools.host.notify) a.tools.host.notify('🛑 Safeword', 'Ausgelöst über ' + source + (done.length ? ' – ' + done.join(', ') : ''));
        this.log('safeword', 'über ' + source + (done.length ? ': ' + done.join(', ') : ''));
        // 7.3: an die Gruppe weitergeben (nicht zurück, wenn es von dort kam) und Aftercare vormerken
        if (a.nsfwcare) { if (!(opt && opt.relayed)) { const n = await a.nsfwcare.groupSafeword().catch(() => 0); if (n) done.push('Gruppe (' + n + ')'); } a.nsfwcare.afterSession('safeword'); }
        return { ok: true, msg: '🛑 Safeword (' + source + ')' + (done.length ? ' – ' + done.join(', ') : ''), done };
    }
    /** Spracheingabe: enthält der erkannte Text das Safeword? */
    onSpeech(text) {
        const w = str(this.cfg().safeword.word).trim().toLowerCase();
        if (!w || !this.unlocked()) return false;
        const t = ' ' + str(text).toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ') + ' ';
        if (!t.includes(' ' + w.replace(/[^\p{L}\p{N} ]+/gu, ' ').trim() + ' ')) return false;
        this.safeword('Sprache').catch(() => {});
        return true;
    }
    /** Geste: Avatar-Parameter (z. B. aus dem Action-Menü) */
    onOsc(address, args) {
        const c = this.cfg().safeword;
        if (!c.param || address !== '/avatar/parameters/' + c.param || !this.unlocked()) return;
        const v = args[0], want = str(c.param_value || '1').toLowerCase();
        const hit = typeof v === 'boolean' ? v === (want === '1' || want === 'true') : Math.abs(Number(v) - Number(want)) < 0.01;
        if (hit) this.safeword('Geste').catch(() => {});
    }
    unlocked() { try { return !!(this.app.nsfw && this.app.nsfw.access().unlocked); } catch (e) { return false; } }

    // ---------- Privat-Modus 2.0 ----------
    setPrivate(on) {
        const n = this.app.nsfw; if (!n) return false;
        n.private = !!on;
        const c = this.cfg().private2;
        clearTimeout(this.privOffT); this.privOffT = null;
        if (on && c.auto_off_min > 0) { this.privOffT = setTimeout(() => { n.private = false; this.log('privat', 'automatisch aus'); }, c.auto_off_min * 60000); if (this.privOffT.unref) this.privOffT.unref(); }
        this.app.db.setSetting('nsfw_private_persist', on && c.persist ? '1' : '');
        this.log('privat', on ? 'an' : 'aus');
        return n.private;
    }
    restorePrivate() { if (this.app.db.setting('nsfw_private_persist', '') === '1' && this.app.nsfw) this.app.nsfw.private = true; }

    // ---------- Geräte-Profile ----------
    saveDevProfile(name) {
        const t = this.app.toys; if (!t) throw new UserError('Spielzeug gibt es nur in der Windows-App.');
        const n = cut(str(name).trim(), 40); if (!n) throw new UserError('Namen angeben.');
        const c = t.cfg(), d = this.load();
        const snap = { dev: c.dev || {}, links: c.links || [], consent: c.consent, edge: c.edge, lust: c.lust, heart: c.heart, voice: c.voice };
        d.devprofiles = d.devprofiles.filter(p => p.name !== n).concat([{ name: n, at: Date.now(), snap }]).slice(-20);
        this.save(); this.log('gerät', 'Profil „' + n + '“ gespeichert');
        return d.devprofiles.map(p => ({ name: p.name, at: p.at }));
    }
    loadDevProfile(name) {
        const t = this.app.toys; if (!t) throw new UserError('Spielzeug gibt es nur in der Windows-App.');
        const p = this.load().devprofiles.find(x => x.name === str(name)); if (!p) throw new UserError('Profil nicht gefunden.');
        const s = p.snap, data = {};
        for (const k of Object.keys(s)) if (s[k] !== undefined) data[k] = typeof s[k] === 'object' ? JSON.stringify(s[k]) : s[k];
        t.saveCfg(data);
        this.log('gerät', 'Profil „' + p.name + '“ geladen');
        return p.name;
    }

    // ---------- Fantasie-Baukasten ----------
    saveFantasy(input) {
        const d = this.load();
        let roles = input.roles; if (typeof roles === 'string') { try { roles = JSON.parse(roles); } catch (e) { roles = []; } }
        roles = (Array.isArray(roles) ? roles : []).slice(0, 4).map(r => ({ name: cut(str(r.name).trim(), 40), desc: cut(str(r.desc).trim(), 200) })).filter(r => r.name);
        if (roles.length < 2) throw new UserError('Mindestens zwei Rollen.');
        const f = { id: /^f[0-9a-f]{8}$/.test(str(input.id)) ? str(input.id) : 'f' + crypto.randomBytes(4).toString('hex'), title: cut(str(input.title).trim(), 60) || 'Meine Fantasie',
            place: cut(str(input.place).trim(), 80), mood: cut(str(input.mood).trim(), 80), roles, limits: cut(str(input.limits).trim(), 300), safeword: cut(str(input.safeword).trim(), 40), at: Date.now() };
        d.fantasies = d.fantasies.filter(x => x.id !== f.id).concat([f]).slice(-50);
        this.save();
        return f;
    }
    fantasyText(id) {
        const f = this.load().fantasies.find(x => x.id === str(id)); if (!f) throw new UserError('Nicht gefunden.');
        return ['🎭 ' + f.title, f.place && '📍 ' + f.place, f.mood && '✨ ' + f.mood, ...f.roles.map(r => '👤 ' + r.name + (r.desc ? ': ' + r.desc : '')), f.limits && '🚫 ' + f.limits, f.safeword && '🛑 Safeword: ' + f.safeword].filter(Boolean).join('\n');
    }

    state() {
        const d = this.load();
        return { cats: CATS, limits: d.limits, cfg: d.cfg, fantasies: d.fantasies, devprofiles: d.devprofiles.map(p => ({ name: p.name, at: p.at })), log_count: d.log.length,
            private: !!(this.app.nsfw && this.app.nsfw.private) };
    }
    async action(act, input) {
        this.need();
        switch (act) {
            case 'nsfwx_state': return this.state();
            case 'nsfwx_limits_save': return Object.assign(this.state(), { limits: this.saveLimits(input.list), msg: 'Grenzen gespeichert – die Grenzen-Karte ist mit aktualisiert.' });
            case 'nsfwx_limits_text': return { text: this.limitsText() };
            case 'nsfwx_cfg': return Object.assign(this.state(), { cfg: this.saveCfg(str(input.part), input), msg: 'Gespeichert.' });
            case 'nsfwx_safeword': return await this.safeword(cut(str(input.source) || 'Knopf', 20));
            case 'nsfwx_private': return Object.assign(this.state(), { private: this.setPrivate(input.on === undefined ? !(this.app.nsfw && this.app.nsfw.private) : yes(input.on)) });
            case 'nsfwx_log': { this.purge(); return { items: this.load().log.slice().reverse().slice(0, 300), cfg: this.cfg().log }; }
            case 'nsfwx_log_clear': this.load().log = []; this.save(); return { items: [], msg: 'Protokoll gelöscht.' };
            case 'nsfwx_dev_save': return { devprofiles: this.saveDevProfile(input.name), msg: 'Geräte-Profil gespeichert.' };
            case 'nsfwx_dev_load': return { msg: '🎮 Profil „' + this.loadDevProfile(input.name) + '“ geladen.' };
            case 'nsfwx_dev_del': { const d = this.load(); d.devprofiles = d.devprofiles.filter(p => p.name !== str(input.name)); this.save(); return { devprofiles: d.devprofiles.map(p => ({ name: p.name, at: p.at })) }; }
            case 'nsfwx_fantasy_save': return Object.assign(this.state(), { saved: this.saveFantasy(input), msg: '🎭 Fantasie gespeichert.' });
            case 'nsfwx_fantasy_del': { const d = this.load(); d.fantasies = d.fantasies.filter(f => f.id !== str(input.id)); this.save(); return this.state(); }
            case 'nsfwx_fantasy_text': return { text: this.fantasyText(input.id) };
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
const yes = v => v === true || v === 1 || ['1', 'true', 'on', 'yes'].includes(str(v));

module.exports = { NsfwSafe, CATS, LEVELS };
