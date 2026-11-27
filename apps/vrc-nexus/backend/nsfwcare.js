'use strict';
/*
 * 7.3 (🔞, nur mit NSFW-Freigabe): Vertrauen & Fürsorge – alles lokal und verschlüsselt
 *   • Vertrauensliste: Personen (VRChat-ID) mit Stufe Partner / Vertraut / Bekannt und eigenen Rechten
 *   • Check-in-Timer für Treffen: „Ist alles ok?“ zur geplanten Zeit; ohne Antwort nach der Nachfrist
 *     geht eine Ende-zu-Ende-verschlüsselte Nachricht an die gewählten Vertrauenspersonen
 *   • Aftercare: sanfter Check-in nach einer Session (auch nach dem Safeword), Stimmung nur lokal
 *   • Event-Ampel: 🟢 offen / 🟡 nach Absprache / 🔴 bitte nicht – Chatbox und Avatar-Parameter, geht nach Ablauf aus
 *   • Gruppen-Safeword: ein Safeword stoppt bei allen Vertrauenspersonen mit diesem Recht (über den E2E-Chat)
 */
const { str, int, cut, UserError } = require('./util');

const LEVELS = ['partner', 'trusted', 'known'];
const PERMS = ['remote', 'scenes', 'limits', 'checkin', 'group_sw'];
const LEVEL_PERMS = { partner: { remote: true, scenes: true, limits: true, checkin: true, group_sw: true }, trusted: { remote: false, scenes: false, limits: true, checkin: true, group_sw: true },
    known: { remote: false, scenes: false, limits: false, checkin: false, group_sw: false } };
const AMPEL = { green: ['🟢', 'Offen für Anfragen', 1], yellow: ['🟡', 'Nur nach Absprache', 2], red: ['🔴', 'Bitte keine Anfragen', 3], off: ['', '', 0] };
const MOODS = { good: '💚 Gut', break: '🫖 Brauche eine Pause', talk: '💬 Möchte reden' };
const TIPS = { good: 'Schön! Trink etwas Wasser und gönn dir einen Moment.', break: 'Nimm dir Zeit: Headset ab, Wasser, frische Luft. Alles darf langsam gehen.',
    talk: 'Schreib einer Vertrauensperson – oder bitte dein Gegenüber um ein kurzes Gespräch ohne Rolle.' };
const GSW = '🛑 GRUPPEN-SAFEWORD';
const ID = /^usr_[0-9a-f-]{36}$/;
const DEF = { aftercare: { on: true, delay_min: 10, after_safeword: true }, ampel: { chatbox: true, param: '' }, group: { send: true, recv: true } };

class NsfwCare {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.cache = null; this.timer = null; this.lastGsw = 0; }
    load() {
        if (this.cache) return this.cache;
        let d = null;
        try { const raw = this.app.db.setting('nsfw_care', ''); d = raw ? JSON.parse(this.crypt.decrypt(raw)) : null; } catch (e) { d = null; }
        this.cache = Object.assign({ trust: [], checkin: null, after: null, moods: [], ampel: null }, d || {});
        this.cache.cfg = this.cache.cfg || {};
        for (const k of Object.keys(DEF)) this.cache.cfg[k] = Object.assign({}, DEF[k], this.cache.cfg[k] || {});
        return this.cache;
    }
    save() { this.app.db.setSetting('nsfw_care', this.crypt.encrypt(JSON.stringify(this.cache))); }
    unlocked() { try { return !!(this.app.nsfw && this.app.nsfw.access().unlocked); } catch (e) { return false; } }
    priv() { return !!(this.app.nsfw && this.app.nsfw.private); }
    notify(title, body, replies, cb) {
        const a = this.app;
        if (a.tools && a.tools.host && a.tools.host.notify) a.tools.host.notify(title, body);
        if (a.watch && a.watch.note) try { a.watch.note(title, body, { replies, onReply: cb }); } catch (e) { /* ohne Uhr */ }
    }
    log(kind, text) { try { if (this.app.nsfwsafe) this.app.nsfwsafe.log(kind, text); } catch (e) { /* egal */ } }
    start() { if (this.timer) return; this.timer = setInterval(() => this.tick().catch(() => {}), 15000); if (this.timer.unref) this.timer.unref(); }
    stop() { clearInterval(this.timer); this.timer = null; }

    // ---------- Vertrauensliste ----------
    saveTrust(input) {
        const d = this.load(), id = str(input.id).trim().toLowerCase();
        if (!ID.test(id)) throw new UserError('Bitte eine VRChat-ID (usr_…) angeben.');
        const level = LEVELS.includes(str(input.level)) ? str(input.level) : 'known';
        let perms = input.perms; if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch (e) { perms = null; } }
        const p = Object.assign({}, LEVEL_PERMS[level]);
        if (perms && typeof perms === 'object') for (const k of PERMS) if (perms[k] !== undefined) p[k] = yes(perms[k]);
        const old = d.trust.find(t => t.id === id);
        if (!old && d.trust.length >= 50) throw new UserError('Höchstens 50 Personen.');
        const e = { id, name: cut(str(input.name).trim(), 40) || (old && old.name) || id.slice(0, 12), level, perms: p, note: cut(str(input.note).trim(), 200), at: old ? old.at : Date.now() };
        d.trust = d.trust.filter(t => t.id !== id).concat([e]);
        this.save(); this.log('vertrauen', e.name + ' → ' + level);
        return e;
    }
    delTrust(id) { const d = this.load(); d.trust = d.trust.filter(t => t.id !== str(id).toLowerCase()); this.save(); }
    /** für andere Module (Fernsteuerung, Szenen, Grenzen teilen) */
    allowed(uid, perm) { if (!this.unlocked()) return false; const t = this.load().trust.find(x => x.id === str(uid).toLowerCase()); return !!(t && t.perms[perm]); }
    trustList() { return this.load().trust.slice().sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.name.localeCompare(b.name)); }

    // ---------- Check-in-Timer ----------
    checkinStart(input, now = Date.now()) {
        const d = this.load();
        const min = int(input.minutes), grace = Math.max(2, Math.min(30, int(input.grace) || 5));
        if (min < 5 || min > 480) throw new UserError('Dauer: 5 bis 480 Minuten.');
        let ids = input.contacts; if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch (e) { ids = str(ids).split(','); } }
        const ok = this.load().trust.filter(t => t.perms.checkin);
        ids = (Array.isArray(ids) && ids.length ? ids.map(x => str(x).trim().toLowerCase()) : ok.map(t => t.id)).filter(x => ok.some(t => t.id === x)).slice(0, 5);
        if (!ids.length) throw new UserError('Lege zuerst eine Vertrauensperson mit dem Recht „Check-in“ an.');
        d.checkin = { label: cut(str(input.label).trim(), 80) || 'Treffen', due: now + min * 60000, grace, contacts: ids, world: yes(input.share_world), state: 'running', started: now, sw: yes(input.safeword_on_miss) };
        this.save(); this.log('check-in', 'gestartet: ' + d.checkin.label + ' (' + min + ' min)');
        return d.checkin;
    }
    checkinOk() { const d = this.load(); if (!d.checkin) throw new UserError('Kein Check-in aktiv.'); const was = d.checkin.state; d.checkin = null; this.save(); this.log('check-in', 'alles ok'); return was === 'missed' ? 'alerted' : 'ok'; }
    checkinExtend(min, now = Date.now()) {
        const d = this.load(), c = d.checkin; if (!c) throw new UserError('Kein Check-in aktiv.');
        const m = Math.max(5, Math.min(240, int(min) || 15));
        c.due = Math.max(c.due, now) + m * 60000; c.state = 'running'; this.save();
        return c;
    }
    worldText() { try { const s = this.app.game && this.app.game.state; return s && s.worldName && !this.priv() ? ' · Welt: ' + cut(str(s.worldName), 60) : ''; } catch (e) { return ''; } }
    async alert(c, help) {
        const until = new Date(c.due).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const text = (help ? '🆘 Ich brauche Hilfe – bitte melde dich bei mir. (' : '🛟 Mein Check-in ist ausgeblieben – bitte melde dich kurz bei mir. (') + c.label + ', geplant bis ' + until + (c.world ? this.worldText() : '') + ')';
        let sent = 0;
        for (const id of c.contacts) { try { if (this.app.chat) { await this.app.chat.send(id, text); sent++; } } catch (e) { this.log('check-in', 'Nachricht an ' + id.slice(0, 12) + ' fehlgeschlagen'); } }
        if (c.sw && this.app.nsfwsafe) await this.app.nsfwsafe.safeword('Check-in').catch(() => {});
        this.log('check-in', (help ? 'Hilfe gerufen' : 'verpasst') + ' – ' + sent + ' Person(en) benachrichtigt');
        return sent;
    }
    async checkinHelp() { const d = this.load(), c = d.checkin; if (!c) throw new UserError('Kein Check-in aktiv.'); const n = await this.alert(c, true); c.state = 'missed'; this.save(); return n; }

    // ---------- Aftercare ----------
    afterSession(source, now = Date.now()) {
        const d = this.load(), c = d.cfg.aftercare;
        if (!c.on || !this.unlocked() || (source === 'safeword' && !c.after_safeword)) return null;
        d.after = { due: now + Math.max(0, Math.min(120, int(c.delay_min))) * 60000, source: cut(str(source), 20) };
        this.save();
        return d.after;
    }
    mood(m, now = Date.now()) {
        if (!MOODS[m]) throw new UserError('Unbekannt.');
        const d = this.load(); d.after = null;
        d.moods = d.moods.filter(x => now - x.t < 90 * 86400000).slice(-199); d.moods.push({ t: now, m });
        this.save();
        return { mood: MOODS[m], tip: TIPS[m] };
    }

    // ---------- Event-Ampel ----------
    async setAmpel(state, hours, now = Date.now()) {
        const d = this.load(), s = AMPEL[str(state)] ? str(state) : 'off', c = d.cfg.ampel, a = this.app;
        d.ampel = s === 'off' ? null : { state: s, until: now + Math.max(1, Math.min(12, int(hours) || 4)) * 3600000 };
        this.save();
        const osc = a.game && a.game.osc;
        if (osc && c.param) await Promise.resolve(osc.sendParam(c.param, AMPEL[s][2], 'int')).catch(() => {});
        if (osc && c.chatbox && !this.priv()) await osc.chatbox(s === 'off' ? '' : AMPEL[s][0] + ' ' + AMPEL[s][1], true).catch(() => {});
        this.log('ampel', s);
        return d.ampel;
    }

    // ---------- Gruppen-Safeword ----------
    async groupSafeword() {
        const d = this.load(); if (!d.cfg.group.send || !this.app.chat) return 0;
        let n = 0;
        for (const t of d.trust.filter(x => x.perms.group_sw)) { try { await this.app.chat.send(t.id, GSW + ' – bitte alles stoppen.'); n++; } catch (e) { /* offline */ } }
        if (n) this.log('safeword', 'an ' + n + ' Vertrauensperson(en) weitergegeben');
        return n;
    }
    /** eingehende 1:1-Nachricht (E2E): Gruppen-Safeword einer Vertrauensperson mit Recht → hier auch stoppen (nicht weiterleiten) */
    onChat(uid, text) {
        if (!str(text).startsWith(GSW) || !this.load().cfg.group.recv || !this.allowed(uid, 'group_sw')) return false;
        if (Date.now() - this.lastGsw < 5000) return true;
        this.lastGsw = Date.now();
        const t = this.load().trust.find(x => x.id === str(uid).toLowerCase());
        if (this.app.nsfwsafe) this.app.nsfwsafe.safeword('Gruppe: ' + cut(t.name, 12), { relayed: true }).catch(() => {});
        return true;
    }

    // ---------- Zeitsteuerung ----------
    async tick(now = Date.now()) {
        const d = this.load(); let changed = false;
        const c = d.checkin;
        if (c && c.state === 'running' && now >= c.due) {
            c.state = 'due'; changed = true;
            this.notify('🛟 Check-in: Ist alles ok?', c.label + ' – bitte bestätigen (' + c.grace + ' min Zeit)', [['ok', '💚 Alles ok'], ['extend', '⏱ +15 min'], ['help', '🆘 Hilfe']],
                r => (r === 'ok' ? this.checkinOk() : r === 'extend' ? this.checkinExtend(15) : this.checkinHelp()));
        } else if (c && c.state === 'due' && now >= c.due + c.grace * 60000) {
            c.state = 'missed'; changed = true; this.save();
            await this.alert(c, false);
        }
        if (d.after && now >= d.after.due) {
            d.after = null; changed = true;
            if (this.unlocked() && !this.priv()) this.notify('💗 Aftercare: Wie geht es dir?', 'Kurz durchatmen – alles darf.', Object.entries(MOODS), r => this.mood(r));
        }
        if (d.ampel && now >= d.ampel.until) { await this.setAmpel('off', 0, now); changed = false; }
        if (changed) this.save();
    }

    state() {
        const d = this.load();
        return { trust: this.trustList(), levels: LEVELS, perms: PERMS, level_perms: LEVEL_PERMS, checkin: d.checkin, after: d.after, ampel: d.ampel, cfg: d.cfg, moods: d.moods.slice(-14).reverse(), mood_labels: MOODS };
    }
    async action(act, input) {
        if (this.app.nsfw) this.app.nsfw.need('');
        const st = extra => Object.assign(this.state(), extra || {});
        switch (act) {
            case 'nsfwc_state': return st();
            case 'nsfwc_trust_save': return st({ saved: this.saveTrust(input), msg: '🤝 Gespeichert.' });
            case 'nsfwc_trust_del': this.delTrust(input.id); return st({ msg: 'Entfernt.' });
            case 'nsfwc_checkin_start': return st({ msg: '🛟 Check-in läuft bis ' + new Date(this.checkinStart(input).due).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + '.' });
            case 'nsfwc_checkin_ok': { const r = this.checkinOk(); return st({ msg: r === 'alerted' ? '💚 Danke! Schreib deinen Vertrauenspersonen kurz, dass alles ok ist.' : '💚 Schön, dass alles ok ist.' }); }
            case 'nsfwc_checkin_extend': this.checkinExtend(input.minutes); return st({ msg: '⏱ Verlängert.' });
            case 'nsfwc_checkin_help': { const n = await this.checkinHelp(); return st({ msg: '🆘 ' + n + ' Person(en) benachrichtigt.' }); }
            case 'nsfwc_session_end': return st({ msg: this.afterSession('session') ? '💗 Aftercare-Check-in kommt in ' + this.load().cfg.aftercare.delay_min + ' min.' : 'Aftercare ist aus.' });
            case 'nsfwc_mood': return st(this.mood(str(input.mood)));
            case 'nsfwc_ampel': { const a = await this.setAmpel(str(input.state), input.hours); return st({ msg: a ? AMPEL[a.state][0] + ' ' + AMPEL[a.state][1] : 'Ampel aus.' }); }
            case 'nsfwc_cfg': {
                const c = this.load().cfg;
                if (input.part === 'aftercare') c.aftercare = { on: yes(input.on), delay_min: Math.max(0, Math.min(120, int(input.delay_min))), after_safeword: yes(input.after_safeword) };
                else if (input.part === 'ampel') { const p = str(input.param).trim(); if (p && !/^[\w./\-]{1,64}$/.test(p)) throw new UserError('Parameter-Name ungültig.'); c.ampel = { chatbox: yes(input.chatbox), param: p }; }
                else if (input.part === 'group') c.group = { send: yes(input.send), recv: yes(input.recv) };
                else throw new UserError('Unbekannt.');
                this.save(); return st({ msg: 'Gespeichert.' });
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
const yes = v => v === true || v === 1 || ['1', 'true', 'on', 'yes'].includes(str(v));

module.exports = { NsfwCare, LEVEL_PERMS, AMPEL, GSW };
