'use strict';
/*
 * 8.2 (🔞, nur mit Spielzeug-Freigabe): Lokaler Szenen-Begleiter – ohne Cloud, ohne KI-Dienst, alles auf diesem PC.
 * Beobachtet nur, was Nexus ohnehin weiß (Sitzungsdauer, Lust-Meter, Edging, Puls, Pausen, Ampel, Szene) und gibt kurze,
 * feste Hinweise in einem gewählten Stil: Begrüßung, regelmäßiger Check („alles grün?“), Edging-Ansagen, Atem-Hinweis bei hohem Puls,
 * Pause, Szenen-Ende und Aftercare. Ausgabe: Desktop-Hinweis und Uhr; Chatbox nur auf ausdrücklichen Wunsch und nie im Privat-Modus.
 */
const { str, int, cut, UserError } = require('./util');

const STYLES = {
    sanft: {
        start: ['Schön, dass du da bist. Lass dir Zeit 💙', 'Wir fangen ruhig an – du bestimmst das Tempo.'],
        check: ['Kurzer Check: alles grün? 🟢', 'Wie fühlt es sich an? Ampel jederzeit ändern ist okay.'],
        edge: ['Fast da – jetzt kurz halten und atmen.', 'Ganz knapp vor der Grenze. Genieß das Warten.'],
        heart: ['Dein Puls ist hoch – tief einatmen, langsam aus.', 'Kurz durchatmen, du machst das gut.'],
        pause: ['Pause: Wasser trinken, Schultern locker 💧'],
        yellow: ['Gelb ist angekommen – wir machen langsamer.'],
        end: ['Die Szene ist vorbei. Nimm dir einen Moment für dich 💞'],
        aftercare: ['Aftercare: Wasser, etwas Warmes, kurz nachfragen wie es dem anderen geht.'],
    },
    verspielt: {
        start: ['Na, bereit? 😏 Ich passe auf die Zeit auf.', 'Los geht\'s – ich bin gespannt.'],
        check: ['Noch alles grün da drüben? 😉', 'Kleiner Check-in: Daumen hoch oder lieber langsamer?'],
        edge: ['Ah-ah, noch nicht! 😈', 'So knapp … und jetzt schön warten.'],
        heart: ['Wow, dein Herz rast – kurz durchatmen, Tiger 🐯'],
        pause: ['Pausenzeit! Wasser holen, ich warte 😌'],
        yellow: ['Gelb verstanden – ich nehme Tempo raus.'],
        end: ['Das war\'s – gut gemacht 💞'],
        aftercare: ['Aftercare-Zeit: Kuscheln, Wasser, Nachfragen 🫂'],
    },
    knapp: {
        start: ['Session läuft.'], check: ['Check: Ampel?'], edge: ['Grenze – halten.'], heart: ['Puls hoch – atmen.'],
        pause: ['Pause.'], yellow: ['Gelb – langsamer.'], end: ['Szene beendet.'], aftercare: ['Aftercare.'],
    },
};
const DEF = { on: false, style: 'sanft', check_min: 10, heart_max: 140, chat: false };

class Companion {
    constructor(app) { this.app = app; this.s = { session: 0, lastCheck: 0, edge: false, heartAt: 0, paused: false, consent: 'green', scene: false, after: false }; this.log = []; this.timer = null; this.n = 0; }
    allowed() { try { const a = this.app.nsfw && this.app.nsfw.access(); return !!(a && a.unlocked && a.features && a.features.includes('toys')); } catch (e) { return false; } }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('companion_cfg', '{}')) || {}); } catch (e) { return Object.assign({}, DEF); } }
    saveCfg(c) {
        const n = this.cfg();
        if (c.on !== undefined) n.on = c.on === true || c.on === '1';
        if (c.style !== undefined) n.style = STYLES[str(c.style)] ? str(c.style) : 'sanft';
        if (c.check_min !== undefined) n.check_min = Math.max(0, Math.min(60, int(c.check_min)));
        if (c.heart_max !== undefined) n.heart_max = Math.max(90, Math.min(210, int(c.heart_max)));
        if (c.chat !== undefined) n.chat = c.chat === true || c.chat === '1';
        this.app.db.setSetting('companion_cfg', JSON.stringify(n));
        if (n.on) this.start(); else this.stop();
        return n;
    }
    start() { if (!this.timer) { this.timer = setInterval(() => this.tick(), 5000); if (this.timer.unref) this.timer.unref(); } }
    stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
    pick(kind) { const l = STYLES[this.cfg().style][kind] || STYLES.sanft[kind]; return l[this.n++ % l.length]; }
    say(kind) {
        const text = this.pick(kind), a = this.app, priv = !!(a.nsfw && a.nsfw.private);
        this.log = [{ at: Date.now(), kind, text }].concat(this.log).slice(0, 20);
        if (priv) return text;   // Privat-Modus: nur im Verlauf, keine Meldungen
        const t = a.tools;
        if (t && t.host && t.host.notify) t.host.notify('🫶 Begleiter', text, false);
        if (a.watch && a.watch.note) { try { a.watch.note('🫶', text, { kind: 'companion' }); } catch (e) { /* egal */ } }
        if (this.cfg().chat && a.game && a.game.osc && kind !== 'heart') a.game.osc.chatbox('🫶 ' + text, false).catch(() => {});   // Puls nie öffentlich
        return text;
    }
    /** ein Takt: Zustand aus Spielzeug/Puls lesen, bei Übergängen etwas sagen (höchstens eine Meldung je Takt) */
    tick(now = Date.now()) {
        const c = this.cfg();
        if (!c.on || !this.allowed()) return '';
        const t = this.app.toys; if (!t) return '';
        const s = this.s, ses = t.session || {}, paused = !!(t.paused && now < t.paused.until), scene = !!t.scene, edge = !!(t.lust && t.lust.edgeHold), consent = t.consent || 'green';
        const hr = this.app.heart && this.app.heart.active ? this.app.heart.bpm : 0;
        let said = '';
        if (ses.start && !s.session) { s.session = ses.start; s.lastCheck = now; s.after = false; said = this.say('start'); }
        else if (s.scene && !scene) { said = this.say('end'); s.after = true; }
        else if (paused && !s.paused) said = this.say('pause');
        else if (consent === 'yellow' && s.consent !== 'yellow') said = this.say('yellow');
        else if (edge && !s.edge) said = this.say('edge');
        else if (hr >= c.heart_max && now - s.heartAt > 120000) { s.heartAt = now; said = this.say('heart'); }
        else if (s.session && c.check_min && now - s.lastCheck >= c.check_min * 60000) { s.lastCheck = now; said = this.say('check'); }
        else if (ses.due && !s.after) { s.after = true; said = this.say('aftercare'); }
        if (!ses.start && s.session && !scene) s.session = 0;
        s.paused = paused; s.scene = scene; s.edge = edge; s.consent = consent;
        return said;
    }
    status() { return { cfg: this.cfg(), styles: Object.keys(STYLES), log: this.log.slice(0, 8) }; }
    async action(act, input) {
        if (!this.allowed()) throw new UserError('Den Begleiter gibt es mit Spielzeug-Freigabe.');
        const toys = () => (this.app.toys ? this.app.toys.status() : {});
        switch (act) {
            case 'comp_cfg': this.saveCfg(input); return Object.assign(toys(), { msg: this.cfg().on ? '🫶 Begleiter an.' : 'Begleiter aus.' });
            case 'comp_try': return Object.assign(toys(), { msg: '🫶 ' + this.say(STYLES.sanft[str(input.kind)] ? str(input.kind) : 'check') });
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { Companion, STYLES };
