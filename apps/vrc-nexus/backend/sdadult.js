'use strict';
/*
 * 🔞 Stream Deck – Schnittstelle für das zweite Stream-Deck-Plugin („VRC Nexus 🔞“, nur über die Webseite erhältlich).
 * Gleicher Weg und gleicher Schlüssel wie das erste Plugin (lokale Schnittstelle, Kopf „X-Nexus-Token“):
 *   GET  /api/adult/state      → Anzeige für die Tasten (gesperrt: nur „locked“ + Grund, keine 🔞-Daten)
 *   POST /api/adult  {op, …}   → Aktion
 * Freigabe nur, wenn ALLES stimmt: gültiger Schlüssel mit Stufe „alles“ (Hauptschlüssel oder App-Schlüssel „🔓 Alles“),
 * Recht „🔞 Stream Deck“ in der App bewusst erlaubt (Standard: aus) und 18+ freigeschaltet (Verified 18+ + NSFW-Schalter, nsfw.need('toys')).
 * Panik, Stopp, Safeword und Ampel-Rot gehen IMMER (mit gültigem Schlüssel) – auch gesperrt; sie schalten nur ab, nie etwas an.
 * Die Aktionen rufen nur die bestehenden App-Aktionen auf (toys_*, nsfw_*, nsfwx_*), es gibt hier keine eigene Spielzeug-Logik.
 */
const { str, int, cut, UserError } = require('./util');

const RIGHT_KEY = 'sd_adult';
/** Sicherheits-Aktionen: gehen immer (nur abschalten) */
const SAFE = new Set(['panic', 'stop', 'safeword']);
const OPS = ['panic', 'stop', 'safeword', 'consent', 'level', 'level_step', 'pattern', 'pattern_stop', 'surprise', 'private', 'follow', 'scene', 'scene_stop', 'fade'];
const LIGHTS = ['green', 'yellow', 'red'];
const clamp01 = v => Math.max(0, Math.min(1, v));
const onOff = v => v === undefined || v === '' || v === null ? undefined : (v === true || v === 1 || v === '1' || v === 'on' || v === 'true');

class SdAdult {
    constructor(app) { this.app = app; }

    // ---------- Recht „🔞 Stream Deck“ (nur in der App, nicht über die Schnittstelle, nicht in Sicherungen) ----------
    allowed() { try { return this.app.db.setting(RIGHT_KEY, '0') === '1'; } catch (e) { return false; } }
    setAllowed(on) {
        if (on) this.app.nsfw.need('toys');   // einschalten nur mit 18+-Freigabe
        this.app.db.setSetting(RIGHT_KEY, on ? '1' : '0');
        return this.ui();
    }
    unlocked() { try { const a = this.app.nsfw.access(); return { ok: !!(a.unlocked && a.features.includes('toys')), reason: a.reason || '' }; } catch (e) { return { ok: false, reason: '' }; } }
    /** Oberfläche (Werkzeuge → Stream Deck): Schalter nur sichtbar, wenn 18+ freigeschaltet und nicht im Privat-Modus */
    ui() { const u = this.unlocked(); return { visible: u.ok && !(this.app.nsfw && this.app.nsfw.private), on: this.allowed() }; }

    /** Darf dieser Schlüssel (resolve() aus clienttools) 🔞-Aktionen? → { ok, why, text } */
    gate(who) {
        if (!who) return { ok: false, why: 'key', text: 'Falscher Zugangsschlüssel.' };
        if (who.scope !== 'all') return { ok: false, why: 'scope', text: 'Dieser App-Schlüssel hat nicht die Stufe „🔓 Alles“ – nimm den Zugangsschlüssel aus Werkzeuge → Stream Deck.' };
        if (!this.allowed()) return { ok: false, why: 'right', text: 'In VRC Nexus ist „🔞 Stream Deck“ nicht erlaubt (Werkzeuge → Stream Deck).' };
        const u = this.unlocked();
        if (!u.ok) return { ok: false, why: 'nsfw', text: '18+ ist in VRC Nexus nicht freigeschaltet' + (u.reason ? ' – ' + u.reason : '.') };
        return { ok: true, why: '', text: '' };
    }
    isSafe(op, d) { return SAFE.has(op) || (op === 'consent' && str(d && d.light) === 'red'); }

    /** Zustand für die Tasten. Gesperrt → keine 🔞-Daten, nur der Grund */
    state(who) {
        const g = this.gate(who);
        if (!g.ok) return { ok: true, locked: true, why: g.why, reason: g.text };
        const t = this.app.toys;
        if (!t) return { ok: true, locked: false, toys: false, reason: 'Spielzeug gibt es nur in der Windows-App.' };
        const s = t.status(), devs = s.devices || [];
        let scenes = [];
        try { scenes = t.scenes ? t.scenes.list().map(x => ({ id: x.id, name: x.name })) : JSON.parse(this.app.db.setting('toys_scenes', '[]')).map(x => ({ id: x.id, name: x.name })); } catch (e) { scenes = []; }
        const lab = t.lab && t.lab.fade ? Math.max(0, Math.round((t.lab.fade.until - Date.now()) / 1000)) : 0;
        return { ok: true, locked: false, toys: true, connected: !!s.connected, devices: devs.length,
            level: devs.length ? Math.max(...devs.map(d => int(d.out))) : 0,
            set_level: devs.length ? Math.max(...devs.map(d => int(d.level))) : 0,
            lust: s.lust ? { v: int(s.lust.v), edging: !!s.lust.edging } : null, consent: LIGHTS.includes(s.consent) ? s.consent : 'green',
            private: !!(this.app.nsfw && this.app.nsfw.private), follow: devs.some(d => d.src_mode && d.src_mode !== 'off'),
            pattern: s.pattern ? { id: s.pattern.id, name: s.pattern.name, left: s.pattern.left } : null,
            patterns: (s.patterns || []).map(p => ({ id: p.id, name: p.name })),
            scenes, scene: s.scene ? { name: s.scene.name, left: s.scene.left } : null, fade: lab, paused: !!s.paused };
    }

    /** Aktion ausführen. who = Ergebnis von ctools.resolve (bzw. { scope: 'all' }) */
    async run(op, d, who) {
        op = str(op);
        d = d && typeof d === 'object' ? d : {};
        if (!OPS.includes(op)) throw new UserError('Unbekannte Aktion.');
        if (!who) throw new UserError('Falscher Zugangsschlüssel.');
        const g = this.gate(who);
        if (!g.ok && !this.isSafe(op, d)) { const e = new UserError('🔒 ' + g.text); e.locked = true; throw e; }
        const app = this.app, post = (act, x) => app.post(Object.assign({ act }, x || {}), {});
        const t = app.toys;
        const needToys = () => { if (!t) throw new UserError('Spielzeug gibt es nur in der Windows-App.'); return t; };
        switch (op) {
            // ----- immer erlaubt -----
            case 'panic':
                if (g.ok || this.unlocked().ok) return Object.assign({ ok: true }, await post('nsfw_panic_full'));
                if (t) await t.stopAll().catch(() => {});
                return { ok: true, msg: '🚨 18+ ist schon aus – Spielzeug gestoppt.' };
            case 'stop': { needToys(); if (t.scenes) t.scenes.stop(true); await t.stopAll(); return { ok: true, msg: '⏹ Alles gestoppt.' }; }
            case 'safeword':
                if (this.unlocked().ok) return Object.assign({ ok: true }, await post('nsfwx_safeword', { source: 'Stream Deck' }));
                if (t) { if (t.scenes) t.scenes.stop(true); await t.stopAll().catch(() => {}); await t.setConsent('red').catch(() => {}); }
                return { ok: true, msg: '🛑 Safeword – alles gestoppt.' };
            case 'consent': {
                let light = str(d.light);
                if (light === 'next') light = LIGHTS[(LIGHTS.indexOf(t ? t.consent : 'green') + 1) % 3];
                if (!LIGHTS.includes(light)) throw new UserError('Ampel: green, yellow, red oder next.');
                if (light === 'red' && !g.ok) { needToys(); await t.setConsent('red'); return { ok: true, consent: 'red', msg: '🔴 Rot – alles gestoppt' }; }
                if (!g.ok) { const e = new UserError('🔒 ' + g.text); e.locked = true; throw e; }   // „next“ landete nicht auf Rot
                const r = await post('toys_consent', { light });
                return { ok: true, consent: light, msg: r.msg };
            }
            // ----- nur mit Freigabe -----
            case 'level': {
                const lv = clamp01(Number(d.level) / 100);
                if (!Number.isFinite(lv)) throw new UserError('Stärke 0–100.');
                await post('toys_set', { device: 'all', level: lv });
                return { ok: true, level: Math.round(lv * 100), msg: '🎚 ' + Math.round(lv * 100) + ' %' };
            }
            case 'level_step': {
                const devs = needToys().status().devices || [];
                const cur = devs.length ? Math.max(...devs.map(x => int(x.level))) : 0;
                const step = Math.max(-100, Math.min(100, Number(d.step) || 0));
                const lv = Math.max(0, Math.min(100, Math.round(cur + step)));
                await post('toys_set', { device: 'all', level: lv / 100 });
                return { ok: true, level: lv, msg: '🎚 ' + lv + ' %' };
            }
            case 'pattern': {
                const id = cut(str(d.id), 60);
                if (!id) throw new UserError('Kein Muster gewählt.');
                if (str(d.toggle) === '1' && t && t.pat && t.pat.id === id) { const r = await post('toys_pattern_stop'); return { ok: true, running: false, msg: r.msg || '⏹ Muster aus' }; }
                const r = await post('toys_pattern', { id, strength: Math.max(5, Math.min(100, int(d.strength) || 60)), speed: Math.max(0.25, Math.min(3, Number(d.speed) || 1)), seconds: Math.max(0, Math.min(3600, int(d.seconds))) });
                return { ok: true, running: true, msg: r.msg };
            }
            case 'pattern_stop': { const r = await post('toys_pattern_stop'); return { ok: true, msg: r.msg || '⏹ Muster aus' }; }
            case 'surprise': { const r = await post('toys_surprise'); return { ok: true, msg: r.msg }; }
            case 'private': { const want = onOff(d.on); const r = await post('nsfw_private', want === undefined ? {} : { on: want ? '1' : '0' }); return { ok: true, value: !!r.private, msg: r.msg }; }
            case 'follow': {
                const s = needToys().status(), devs = (s.devices || []).filter(x => !str(d.device) || x.name === str(d.device) || x.label === str(d.device));
                if (!devs.length) throw new UserError(str(d.device) ? 'Gerät „' + cut(str(d.device), 40) + '“ ist nicht verbunden.' : 'Kein Gerät verbunden.');
                let want = onOff(d.on);
                if (want === undefined) want = !devs.some(x => x.src_mode && x.src_mode !== 'off');
                for (const x of devs) await post('toys_follow', { name: x.name, mode: want ? 'simple' : 'off' });
                return { ok: true, value: want, msg: want ? '🎭 Folgt deinem Avatar (' + devs.length + ')' : '⚪ Avatar-Steuerung aus' };
            }
            case 'scene': {
                if (str(d.id)) { const r = await post('toys_scenes_play', { id: cut(str(d.id), 40) }); return { ok: true, msg: r.msg }; }
                const r = await post('toys_scene', { name: cut(str(d.name), 40) || 'Szene', minutes: Math.max(1, Math.min(240, int(d.minutes) || 20)) });
                return { ok: true, msg: r.msg };
            }
            case 'scene_stop': { const r = await post('toys_scene_stop'); return { ok: true, msg: r.msg }; }
            case 'fade': { const r = await post('toys_lab_fade_now', { fade_s: Math.max(5, Math.min(120, int(d.seconds) || 15)) }); return { ok: true, msg: r.msg }; }
        }
        throw new UserError('Unbekannte Aktion.');
    }

    /** App-Oberfläche: sdadult_get / sdadult_set */
    async action(act, input) {
        switch (act) {
            case 'sdadult_get': return this.ui();
            case 'sdadult_set': { const on = input.on === true || input.on === '1' || input.on === 1; return Object.assign(this.setAllowed(on), { msg: on ? '🔞 Stream Deck erlaubt.' : '🔞 Stream Deck nicht mehr erlaubt.' }); }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { SdAdult, SAFE, OPS, RIGHT_KEY };
