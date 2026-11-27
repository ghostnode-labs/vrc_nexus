'use strict';
/*
 * 8.0: 🌿 VR-Pausen-Coach – freundliche Erinnerungen während VR, mit Statistik.
 *   • erkennt VR über die FPS des SteamVR-Helfers (sonst „VRChat läuft“, wenn so eingestellt)
 *   • Pause nach X Minuten am Stück (mit „⏰ 10 min später“), Augen-Tipp 20-20-20, Trink-Erinnerung
 *   • Antworten auch auf der Nexus Watch; nichts in die Chatbox; im Schlafmodus und im Event-Modus still
 *   • eine echte Pause (≥ 5 min ohne VR) setzt den Zähler zurück und landet im Tagebuch (VR-Minuten, Pausen, längste Strecke)
 * Ersetzt den einfachen Pausen-Hinweis aus 5.0, solange der Coach an ist.
 */
const { str, int, UserError } = require('./util');

const DEF = { on: false, source: 'auto', break_min: 60, snooze_min: 10, eyes: false, eyes_min: 20, drink: true, drink_min: 45, rest_min: 5 };
const TIPS = ['Steh kurz auf und streck dich 🙆', 'Schultern kreisen und tief durchatmen 🌬', 'Headset ab, Augen schließen, 1 Minute Ruhe 😌', 'Ein Glas Wasser und kurz ans Fenster 🪟', 'Nacken sanft dehnen – links, rechts 🧘'];

class Coach {
    constructor(app) { this.app = app; this.timer = null; this.vrSince = 0; this.offSince = 0; this.next = { brk: 0, eyes: 0, drink: 0 }; this.lastMin = 0; this.tip = 0; }
    cfg() { let c = {}; try { c = JSON.parse(this.app.db.setting('coach_cfg', '{}')) || {}; } catch (e) { c = {}; } return Object.assign({}, DEF, c); }
    saveCfg(input) {
        const n = (k, a, b) => Math.max(a, Math.min(b, int(input[k]) || DEF[k]));
        const y = k => input[k] === true || input[k] === 1 || ['1', 'true', 'on'].includes(str(input[k]));
        const c = { on: y('on'), source: ['auto', 'fps', 'game'].includes(str(input.source)) ? str(input.source) : 'auto', break_min: n('break_min', 15, 240), snooze_min: n('snooze_min', 5, 60),
            eyes: y('eyes'), eyes_min: n('eyes_min', 10, 60), drink: y('drink'), drink_min: n('drink_min', 15, 180), rest_min: n('rest_min', 2, 30) };
        this.app.db.setSetting('coach_cfg', JSON.stringify(c));
        return c;
    }
    start() { if (this.timer) return; this.timer = setInterval(() => { if (this.app.energy && this.app.energy.skip('coach', 30000)) return; try { this.tick(); } catch (e) { /* weiter */ } }, 30000); if (this.timer.unref) this.timer.unref(); }
    stop() { clearInterval(this.timer); this.timer = null; }

    /** Ist gerade VR an? */
    inVr(c) {
        const h = this.app.tools && this.app.tools.host, fps = h && h.vrFps ? h.vrFps() : null;
        const game = !!(this.app.game && this.app.game.state && this.app.game.state.running);
        if (c.source === 'fps') return !!fps;
        if (c.source === 'game') return game;
        return !!fps || (game && !(h && h.vrFps));   // auto: FPS, wenn der Helfer verfügbar ist, sonst „VRChat läuft“
    }
    quiet() { return !!(this.app.comfort && this.app.comfort.sleep) || !!(this.app.together && this.app.together.eventState && this.app.together.eventState().on); }
    say(title, body, replies) {
        const a = this.app;
        if (a.tools && a.tools.alert) a.tools.alert(title, body, '', { replies, onReply: r => this.reply(r) });   // geht auch auf die Uhr (mit Antwort-Knöpfen)
    }
    reply(r, now = Date.now()) {
        const c = this.cfg();
        if (r === 'later') { this.next.brk = now + c.snooze_min * 60000; return { tip: '⏰ ' + c.snooze_min + ' min' }; }
        if (r === 'done') { this.breakTaken(now); return { tip: '🌿 Danke – gute Pause!' }; }
        return { tip: '👍' };
    }
    breakTaken(now = Date.now()) {
        const stretch = this.vrSince ? Math.round((now - this.vrSince) / 60000) : 0;
        if (this.app.diary) this.app.diary.addBreak(stretch, now);
        this.vrSince = this.vrSince ? now : 0;
        const c = this.cfg(); this.next = { brk: now + c.break_min * 60000, eyes: now + c.eyes_min * 60000, drink: now + c.drink_min * 60000 };
    }
    tick(now = Date.now()) {
        const c = this.cfg();
        if (!c.on) { this.vrSince = 0; return null; }
        const vr = this.inVr(c);
        // VR-Minuten fürs Tagebuch (je volle Minute)
        if (vr && this.app.diary && now - this.lastMin >= 60000) { if (this.lastMin) this.app.diary.addVr(Math.round((now - this.lastMin) / 60000), now); this.lastMin = now; }
        if (!vr) {
            this.lastMin = 0;
            if (this.vrSince && !this.offSince) this.offSince = now;
            if (this.vrSince && now - this.offSince >= c.rest_min * 60000) {   // echte Pause
                const stretch = Math.round((this.offSince - this.vrSince) / 60000);
                if (this.app.diary && stretch >= 5) this.app.diary.addBreak(stretch, now);
                this.vrSince = 0; this.offSince = 0;
            }
            return null;
        }
        this.offSince = 0;
        if (!this.vrSince) { this.vrSince = now; this.next = { brk: now + c.break_min * 60000, eyes: now + c.eyes_min * 60000, drink: now + c.drink_min * 60000 }; }
        if (this.app.diary) this.app.diary.stretch(Math.round((now - this.vrSince) / 60000), now);
        if (this.quiet()) return null;
        const mins = Math.round((now - this.vrSince) / 60000);
        if (now >= this.next.brk) {
            this.next.brk = now + c.snooze_min * 60000;   // ohne Antwort: in der Schlummerzeit noch einmal
            const tip = TIPS[this.tip++ % TIPS.length];
            this.say('🌿 Zeit für eine Pause', mins + ' min VR am Stück. ' + tip, [['done', '✅ Pause gemacht'], ['later', '⏰ später']]);
            return 'break';
        }
        if (c.drink && now >= this.next.drink) { this.next.drink = now + c.drink_min * 60000; this.say('💧 Trinken nicht vergessen', 'Ein paar Schlucke Wasser – dein Kopf dankt es dir.', [['ok', '👍']]); return 'drink'; }
        if (c.eyes && now >= this.next.eyes) { this.next.eyes = now + c.eyes_min * 60000; this.say('👀 20-20-20', 'Schau 20 Sekunden auf etwas weit Entferntes (oder schließ kurz die Augen).', [['ok', '👍']]); return 'eyes'; }
        return null;
    }
    status(now = Date.now()) {
        const c = this.cfg();
        return { cfg: c, vr: c.on ? this.inVr(c) : false, since: this.vrSince, minutes: this.vrSince ? Math.round((now - this.vrSince) / 60000) : 0,
            next_break: this.vrSince ? Math.max(0, Math.round((this.next.brk - now) / 60000)) : null, today: this.app.diary ? this.app.diary.day(require('./diary').dayOf(now)).vr : null };
    }
    async action(act, input) {
        switch (act) {
            case 'coach_status': return this.status();
            case 'coach_cfg': return Object.assign({}, this.status(), { cfg: this.saveCfg(input), msg: 'Gespeichert.' });
            case 'coach_break': this.breakTaken(); return Object.assign(this.status(), { msg: '🌿 Pause eingetragen – der Zähler startet neu.' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { Coach, DEF };
