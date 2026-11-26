'use strict';
/*
 * 5.0: Komfort & Wohlbefinden – ohne erhobenen Zeigefinger.
 *  - Schlafmodus: Status (z. B. „Ask Me – Schläft 💤“), Chatbox-Rotation aus, Spielzeug stoppen, optional ein Avatar-Parameter
 *    (z. B. „Sleep“ = an) und ein Wecker; beim Aufwachen wird alles zurückgesetzt.
 *  - Pausen-Hinweise: nach X Minuten Spielzeit am Stück eine freundliche Erinnerung (Trinken, Augen, Bewegen).
 *  - Puls-Warnungen: zu hoch / zu niedrig für eine Weile → Hinweis (mit Abklingzeit).
 */
const { str, cut, int, UserError } = require('./util');

const DEF = { sleep_status: 'ask me', sleep_desc: 'Schläft 💤', sleep_param: '', sleep_chatbox: true, sleep_toys: true, sleep_text: '💤 schläft gerade',
    break_on: false, break_min: 90, break_text: 'Zeit für eine kurze Pause: etwas trinken, Augen ausruhen, kurz bewegen 💧',
    hr_on: false, hr_high: 150, hr_low: 45, hr_secs: 60, hr_cooldown: 10 };

class Comfort {
    constructor(app) {
        this.app = app;
        this.sleep = null;             // { since, wake, prev: { status, desc, rot } }
        this.playStart = 0; this.lastBreak = 0;
        this.hrSince = { high: 0, low: 0 }; this.hrWarned = 0;
        this.timer = setInterval(() => this.tick().catch(() => {}), 15000);
        if (this.timer.unref) this.timer.unref();
    }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('comfort_cfg', '{}')) || {}); } catch (e) { return Object.assign({}, DEF); } }
    saveCfg(c) {
        const n = this.cfg(), b = v => v === true || v === '1' || v === 'true';
        for (const k of ['sleep_status']) if (c[k] !== undefined) { const v = str(c[k]).toLowerCase(); n[k] = ['ask me', 'busy', 'active', 'join me'].includes(v) ? v : n[k]; }
        for (const [k, m] of [['sleep_desc', 32], ['sleep_text', 140], ['break_text', 200]]) if (c[k] !== undefined) n[k] = cut(str(c[k]).replace(/\s+/g, ' ').trim(), m);
        if (c.sleep_param !== undefined) { const p = str(c.sleep_param).trim(); if (p && !/^[\w./-]{1,64}$/.test(p)) throw new UserError('Ungültiger Parametername.'); n.sleep_param = p; }
        for (const k of ['sleep_chatbox', 'sleep_toys', 'break_on', 'hr_on']) if (c[k] !== undefined) n[k] = b(c[k]);
        for (const [k, lo, hi] of [['break_min', 15, 600], ['hr_high', 80, 230], ['hr_low', 25, 90], ['hr_secs', 10, 600], ['hr_cooldown', 1, 120]]) if (c[k] !== undefined) n[k] = Math.max(lo, Math.min(hi, int(c[k]) || n[k]));
        this.app.db.setSetting('comfort_cfg', JSON.stringify(n));
        return n;
    }
    status() {
        const c = this.cfg(), now = Date.now();
        return { cfg: c, sleeping: !!this.sleep, sleep_since: this.sleep ? this.sleep.since : 0, wake_at: this.sleep ? this.sleep.wake : 0,
            playing_min: this.playStart ? Math.floor((now - this.playStart) / 60000) : 0, next_break_min: c.break_on && this.playStart ? Math.max(0, c.break_min - Math.floor((now - Math.max(this.playStart, this.lastBreak)) / 60000)) : null };
    }

    // ---------- Schlafmodus ----------
    async sleepOn(wakeMin) {
        if (this.sleep) return this.status();
        const c = this.cfg(), g = this.app.game, done = [];
        this.sleep = { since: Date.now(), wake: wakeMin > 0 ? Date.now() + wakeMin * 60000 : 0, prevRot: g.suppressRotator };
        if (c.sleep_status) { try { await this.app.tools.setStatus(c.sleep_status, c.sleep_desc, 'sleep'); done.push('Status'); } catch (e) { /* ohne Konto */ } }
        if (c.sleep_chatbox) { g.suppressRotator = true; await g.osc.chatbox(c.sleep_text || '', false).catch(() => {}); done.push('Chatbox'); }
        if (c.sleep_toys && this.app.toys) { await this.app.toys.stopAll().catch(() => {}); done.push('Spielzeug gestoppt'); }
        if (c.sleep_param) { await g.osc.sendParam(c.sleep_param, true, 'bool').catch(() => {}); done.push(c.sleep_param); }
        return Object.assign(this.status(), { msg: '💤 Schlafmodus an' + (done.length ? ' (' + done.join(', ') + ')' : '') + (this.sleep.wake ? ' – Wecker in ' + wakeMin + ' min' : '') });
    }
    async sleepOff(byAlarm) {
        if (!this.sleep) return this.status();
        const c = this.cfg(), g = this.app.game, s = this.sleep;
        this.sleep = null;
        g.suppressRotator = !!s.prevRot;
        if (c.sleep_chatbox) await g.osc.chatbox('', false).catch(() => {});
        if (c.sleep_param) await g.osc.sendParam(c.sleep_param, false, 'bool').catch(() => {});
        if (c.sleep_status) { try { await this.app.tools.setStatus('active', '', 'wake'); } catch (e) { /* egal */ } }
        if (byAlarm) this.app.tools.alert('⏰ Guten Morgen!', 'Dein Wecker in VRC Nexus – ' + Math.round((Date.now() - s.since) / 60000) + ' min geschlafen.');
        return Object.assign(this.status(), { msg: '☀️ Schlafmodus aus' });
    }

    // ---------- Pausen & Puls ----------
    async tick(now = Date.now()) {
        const c = this.cfg(), running = !!(this.app.game.state && this.app.game.state.running);
        if (this.sleep && this.sleep.wake && now >= this.sleep.wake) await this.sleepOff(true);
        if (running && !this.playStart) { this.playStart = now; this.lastBreak = now; }
        if (!running) { this.playStart = 0; }
        if (c.break_on && running && !this.sleep && now - Math.max(this.playStart, this.lastBreak) >= c.break_min * 60000) {
            this.lastBreak = now;
            this.app.tools.alert('🌿 Pause?', c.break_text + ' (' + Math.round((now - this.playStart) / 60000) + ' min am Stück)');
        }
        const h = this.app.heart;
        if (c.hr_on && h && h.active) {
            const bpm = h.bpm;
            for (const [k, bad] of [['high', bpm >= c.hr_high], ['low', bpm <= c.hr_low]]) this.hrSince[k] = bad ? (this.hrSince[k] || now) : 0;
            const which = ['high', 'low'].find(k => this.hrSince[k] && now - this.hrSince[k] >= c.hr_secs * 1000);
            if (which && now - this.hrWarned >= c.hr_cooldown * 60000) {
                this.hrWarned = now;
                this.app.tools.alert(which === 'high' ? '❤️‍🔥 Puls hoch' : '💙 Puls niedrig', bpm + ' bpm seit über ' + c.hr_secs + ' s' + (which === 'high' ? ' – vielleicht kurz durchatmen.' : '.'));
            }
        } else this.hrSince = { high: 0, low: 0 };
    }
    async action(act, input) {
        switch (act) {
            case 'comfort_get': return this.status();
            case 'comfort_cfg': this.saveCfg(input); return Object.assign(this.status(), { msg: 'Gespeichert.' });
            case 'comfort_sleep': return input.on === '0' ? this.sleepOff(false) : this.sleepOn(int(input.wake) || 0);
            case 'comfort_break_reset': this.lastBreak = Date.now(); return Object.assign(this.status(), { msg: 'Pausen-Uhr neu gestartet.' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
    stop() { clearInterval(this.timer); }
}

module.exports = { Comfort, DEF };
