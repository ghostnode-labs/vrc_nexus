'use strict';
/*
 * 6.2: Szenen-Baukasten (🔞, nur mit NSFW-Freigabe über toys.action).
 * Eine Szene ist ein gespeicherter Ablauf aus Schritten – Muster mit Stärke, Tempo und Dauer oder eine Pause –,
 * der mehrere Runden laufen kann und dabei pro Runde stärker wird („Steigerung“).
 * Sicherheit: Rot auf der Ampel, Not-Aus, Panik, Safeword oder „Szene beenden“ stoppen sofort; jeder Schritt prüft das neu.
 * Gespeichert lokal in der App (Einstellung „toys_scenes“), nichts geht an den Server.
 */
const crypto = require('crypto');
const { str, int, cut, UserError } = require('./util');

const MAX_STEPS = 30, MAX_SCENES = 50, MAX_TOTAL = 240 * 60;   // s

class Scenes {
    constructor(toys) { this.toys = toys; this.run = null; this.timer = null; }
    get db() { return this.toys.app.db; }
    list() { try { const l = JSON.parse(this.db.setting('toys_scenes', '[]')); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
    write(l) { this.db.setSetting('toys_scenes', JSON.stringify(l.slice(0, MAX_SCENES))); return this.list(); }

    /** Eingabe prüfen und in eine saubere Szene verwandeln */
    clean(input) {
        let steps = input.steps;
        if (typeof steps === 'string') { try { steps = JSON.parse(steps); } catch (e) { steps = null; } }
        if (!Array.isArray(steps) || !steps.length) throw new UserError('Die Szene braucht mindestens einen Schritt.');
        if (steps.length > MAX_STEPS) throw new UserError('Höchstens ' + MAX_STEPS + ' Schritte.');
        const ids = new Set(this.toys.allPatterns().map(p => p.id));
        const out = steps.map((s, i) => {
            const seconds = Math.max(5, Math.min(600, int(s.seconds) || 30));
            if (s.pause || s.pattern === 'pause') return { pause: true, seconds };
            const pattern = str(s.pattern);
            if (!ids.has(pattern)) throw new UserError('Schritt ' + (i + 1) + ': unbekanntes Muster.');
            return { pattern, strength: Math.max(5, Math.min(100, int(s.strength) || 50)), speed: Math.max(0.25, Math.min(3, Math.round((Number(s.speed) || 1) * 100) / 100)), seconds };
        });
        if (!out.some(s => !s.pause)) throw new UserError('Nur Pausen – füge mindestens ein Muster hinzu.');
        const rounds = Math.max(1, Math.min(10, int(input.rounds) || 1)), ramp = Math.max(0, Math.min(30, int(input.ramp)));
        const total = out.reduce((a, s) => a + s.seconds, 0) * rounds;
        if (total > MAX_TOTAL) throw new UserError('Höchstens 4 Stunden pro Szene (jetzt ' + Math.round(total / 60) + ' min).');
        return { id: /^[a-z0-9]{4,24}$/.test(str(input.id)) ? str(input.id) : 's' + crypto.randomBytes(4).toString('hex'), name: cut(str(input.name).trim(), 40) || 'Meine Szene', rounds, ramp, steps: out, total };
    }
    save(input) {
        const s = this.clean(input), l = this.list(), i = l.findIndex(x => x.id === s.id);
        if (i >= 0) l[i] = s; else { if (l.length >= MAX_SCENES) throw new UserError('Höchstens ' + MAX_SCENES + ' Szenen.'); l.push(s); }
        return { scenes: this.write(l), id: s.id };
    }
    remove(id) { if (this.run && this.run.id === str(id)) this.stop(); return this.write(this.list().filter(s => s.id !== str(id))); }

    /** Stärke eines Schritts in Runde r (0-basiert) mit Steigerung, höchstens 100 % */
    static level(step, ramp, r) { return Math.min(100, Math.round(step.strength * (1 + ramp * r / 100))); }

    play(id) {
        const s = this.list().find(x => x.id === str(id));
        if (!s) throw new UserError('Szene nicht gefunden.');
        const t = this.toys;
        if (t.consent === 'red') throw new UserError('Die Ampel steht auf Rot – erst auf Grün oder Gelb stellen.');
        if (t.app.nsfw && t.app.nsfw.private) throw new UserError('Im Privat-Modus starten keine Szenen.');
        if (!t.ws || !t.devices.size) throw new UserError('Erst mit Intiface verbinden und ein Gerät finden.');
        this.stop(true);
        const total = s.steps.reduce((a, x) => a + x.seconds, 0) * s.rounds;
        t.startScene({ name: s.name, minutes: Math.ceil(total / 60) });   // nutzt Laufzeit-Anzeige, Ende und Aftercare der bestehenden Szene
        t.scene.built = true;
        this.run = { id: s.id, scene: t.scene, steps: s.steps, ramp: s.ramp, rounds: s.rounds, i: -1, round: 0, name: s.name };
        this.next();
        return this.state();
    }
    /** nächster Schritt – bricht ab, sobald die Szene anderweitig beendet wurde (Not-Aus/Panik leeren toys.scene) */
    next() {
        clearTimeout(this.timer); this.timer = null;
        const r = this.run, t = this.toys;
        if (!r) return;
        const locked = (() => { try { return !!(t.app.nsfw && t.app.nsfw.access && !t.app.nsfw.access().unlocked); } catch (e) { return true; } })();   // Panik/NSFW aus
        if (t.scene !== r.scene || t.consent === 'red' || locked || (t.app.nsfw && t.app.nsfw.private)) { this.run = null; if (t.scene === r.scene) t.stopAll().catch(() => {}); return; }
        r.i++;
        if (r.i >= r.steps.length) { r.i = 0; r.round++; }
        if (r.round >= r.rounds) { this.run = null; t.scene = null; t.session.due = t.cfg().aftercare.on; t.stopAll().catch(() => {}); return; }
        const st = r.steps[r.i];
        r.stepStart = Date.now(); r.stepEnd = Date.now() + st.seconds * 1000;
        if (st.pause) { const p = t.pat; t.pat = null; if (p && !t.cfg().links_on) t.set(p.device, 0).catch(() => {}); }
        else { try { t.startPattern({ id: st.pattern, strength: Scenes.level(st, r.ramp, r.round), speed: st.speed, seconds: st.seconds }); } catch (e) { this.run = null; t.scene = null; t.stopAll().catch(() => {}); return; } }
        this.timer = setTimeout(() => this.next(), st.seconds * 1000);
        if (this.timer.unref) this.timer.unref();
    }
    stop(quiet) {
        clearTimeout(this.timer); this.timer = null;
        const r = this.run; this.run = null;
        if (r && !quiet && this.toys.scene === r.scene) { this.toys.scene = null; this.toys.session.due = this.toys.cfg().aftercare.on; }
        return !!r;
    }
    skip() { if (!this.run) throw new UserError('Gerade läuft keine Szene.'); this.next(); return this.state(); }
    state() {
        const r = this.run;
        if (!r || this.toys.scene !== r.scene) return null;
        const st = r.steps[r.i];
        return { id: r.id, name: r.name, step: r.i + 1, steps: r.steps.length, round: r.round + 1, rounds: r.rounds, pause: !!st.pause,
            pattern: st.pattern || '', level: st.pause ? 0 : Scenes.level(st, r.ramp, r.round), left: Math.max(0, Math.round((r.stepEnd - Date.now()) / 1000)) };
    }
    async action(act, input) {
        switch (act) {
            case 'toys_scenes': return { scenes: this.list(), running: this.state(), patterns: this.toys.allPatterns() };
            case 'toys_scenes_save': return Object.assign(this.save(input), { msg: '🎬 Szene gespeichert.' });
            case 'toys_scenes_delete': return { scenes: this.remove(input.id), msg: 'Szene gelöscht.' };
            case 'toys_scenes_play': { const s = this.play(input.id); return { running: s, msg: '🎬 ' + s.name + ' läuft – Rot oder ⏹ stoppt sofort.' }; }
            case 'toys_scenes_skip': return { running: this.skip(), msg: '⏭ Nächster Schritt.' };
            case 'toys_scenes_stop': { this.stop(); await this.toys.stopAll(); return { running: null, msg: '🎬 Szene beendet – Zeit für Aftercare 💞' }; }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Scenes, MAX_STEPS };
