'use strict';
/*
 * 8.0.3: 🗣 Lokale App-Sprachbefehle – laufen über die vorhandene Spracherkennung (whisper.cpp lokal, offline; oder der eigene OpenAI-Schlüssel).
 *   • Weckwort (Standard „Nexus“) vorne, damit normale Sätze nie etwas auslösen: „Nexus Panik“, „Nexus Privat an“, „Nexus öffne Freunde“ …
 *   • Panik/Safeword funktionieren immer (auch ohne Weckwort, wenn eingeschaltet) – Sicherheit geht vor.
 *   • Knöpfe aus dem Knopf-Baukasten per Name: „Nexus Knopf Beschäftigt“.
 *   • Kein Mikrofon-Dauerlauschen extra: es gilt die gewählte Aufnahme-Art (Push-to-Talk oder Sprachaktivierung) der Spracherkennung.
 */
const { str, cut, UserError } = require('./util');

const norm = t => str(t).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const DEF = { on: false, wake: 'nexus', panic_any: true, feedback: true };
/** Ziel-Seiten für „öffne …“ (deutsch + englisch) */
const TABS = { freunde: 'friends', friends: 'friends', start: 'home', home: 'home', startseite: 'home', feed: 'feed', verlauf: 'feed', einstellungen: 'settings', settings: 'settings',
    tagebuch: 'diary', diary: 'diary', leistung: 'perf', performance: 'perf', benachrichtigungen: 'notifs', notifications: 'notifs', suche: 'search', search: 'search', kalender: 'calendar', calendar: 'calendar', clubs: 'clubs', galerie: 'gallery', gallery: 'gallery', fotos: 'gallery', photos: 'gallery', 'smart home': 'smarthome', gruppen: 'groups', groups: 'groups', favoriten: 'favs', favorites: 'favs', knöpfe: 'buttons', buttons: 'buttons', welten: 'worlds', worlds: 'worlds', avatare: 'avatars', avatars: 'avatars' };
/** eingebaute Befehle: [Kennung, Sätze nach dem Weckwort, Beschreibung] */
const BUILTIN = [
    ['panic', ['panik', 'panic', 'notaus', 'not aus', 'stopp alles', 'stop everything'], '🚨 Panik (wie der Panik-Knopf)'],
    ['private_on', ['privat an', 'privat modus an', 'private on', 'private mode on'], '🕶 Privat-Modus an'],
    ['private_off', ['privat aus', 'privat modus aus', 'private off', 'private mode off'], 'Privat-Modus aus'],
    ['break', ['pause', 'ich mache pause', 'break', 'taking a break'], '🌿 Pause eintragen (Pausen-Coach)'],
    ['light_off', ['licht aus', 'lights off'], '💡 Smart-Home-Licht aus'],
    ['light_on', ['licht an', 'lights on'], '💡 Smart-Home-Licht an (weiß)'],
    ['status_busy', ['beschäftigt', 'status beschäftigt', 'busy', 'status busy'], '🔴 VRChat-Status „Beschäftigt“'],
    ['status_online', ['online', 'status online', 'status aktiv'], '🟢 VRChat-Status „Online“'],
    ['status_join', ['join me', 'status join me'], '🔵 VRChat-Status „Join Me“'],
    ['obs_scene', ['szene *', 'scene *'], '🎬 OBS-Szene wechseln (Name danach sagen)'],
    ['open', ['öffne *', 'open *', 'zeig *', 'show *'], '📂 Seite öffnen (Freunde, Start, Feed, Tagebuch, Leistung, Einstellungen …)'],
    ['button', ['knopf *', 'button *'], '🔘 Knopf aus dem Knopf-Baukasten (Name danach sagen)'],
    ['help', ['hilfe', 'help', 'was kannst du'], '❔ zeigt alle Befehle'],
];

class VoiceCmd {
    constructor(app) { this.app = app; this.last = null; }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('voicecmd_cfg', '{}'))); } catch (e) { return Object.assign({}, DEF); } }
    saveCfg(i) {
        const c = this.cfg(), b = v => v === true || v === '1' || v === 'true';
        for (const k of ['on', 'panic_any', 'feedback']) if (i[k] !== undefined) c[k] = b(i[k]);
        if (i.wake !== undefined) { const w = norm(i.wake); if (w.length < 2 || w.split(' ').length > 2) throw new UserError('Weckwort: ein oder zwei Wörter.'); c.wake = cut(w, 30); }
        this.app.db.setSetting('voicecmd_cfg', JSON.stringify(c));
        return c;
    }
    /** Text → { id, arg } oder null */
    parse(text) {
        const c = this.cfg(), t = norm(text);
        if (!t) return null;
        const words = t.split(' '), wake = c.wake.split(' ');
        let rest = null;
        for (let i = 0; i + wake.length <= words.length && i < 3; i++) if (wake.every((w, k) => words[i + k] === w)) { rest = words.slice(i + wake.length).join(' '); break; }   // Weckwort darf ein, zwei Füllwörter danach haben („hey nexus …“)
        if (rest === null) {
            if (!c.panic_any) return null;
            const p = BUILTIN[0][1].find(x => (' ' + t + ' ').includes(' ' + x + ' '));
            return p && words.length <= 4 ? { id: 'panic', arg: '' } : null;   // kurzer Satz, der Panik enthält – auch ohne Weckwort
        }
        rest = rest.replace(/^(bitte|please|mal) /, '').replace(/ (bitte|please)$/, '');
        for (const [id, phrases] of BUILTIN) for (const p of phrases) {
            if (p.endsWith(' *')) { const h = p.slice(0, -2); if (rest.startsWith(h + ' ') && rest.length > h.length + 1) return { id, arg: rest.slice(h.length + 1).trim() }; }
            else if (rest === p) return { id, arg: '' };
        }
        return { id: 'unknown', arg: rest };
    }
    /** erkannten Text prüfen und ausführen → null (kein Befehl) oder { id, msg, tab? } */
    async handle(text) {
        const c = this.cfg();
        if (!c.on) return null;
        const hit = this.parse(text);
        if (!hit) return null;
        let r;
        try { r = await this.run(hit.id, hit.arg); } catch (e) { r = { msg: '⚠ ' + e.message }; }
        this.last = Object.assign({ at: Date.now(), id: hit.id, text: cut(str(text), 120) }, r);
        if (c.feedback && this.app.game && this.app.game.osc && r.ok !== false && hit.id !== 'unknown' && !(this.app.nsfw && this.app.nsfw.private)) this.app.game.oscSend('typing', { on: '' }).catch(() => {});
        return Object.assign({ id: hit.id }, r);
    }
    async run(id, arg) {
        const a = this.app;
        switch (id) {
            case 'panic': {
                if (a.nsfw) await a.nsfw.panic();
                return { msg: '🚨 Panik ausgelöst.' };
            }
            case 'private_on': case 'private_off': {
                const on = id === 'private_on';
                if (a.nsfwsafe && a.nsfwsafe.setPrivate) a.nsfwsafe.setPrivate(on); else if (a.nsfw) a.nsfw.private = on;
                return { msg: on ? '🕶 Privat-Modus an' : 'Privat-Modus aus' };
            }
            case 'break': if (!a.coach) throw new UserError('Pausen-Coach fehlt.'); a.coach.breakTaken(); return { msg: '🌿 Pause eingetragen.' };
            case 'light_off': case 'light_on': {
                if (!a.smarthome) throw new UserError('Smart-Home fehlt.');
                const r = await a.smarthome.apply(id === 'light_off' ? { event: 'voice', color: '#000000', bri: 0 } : { event: 'voice', color: '#ffffff', bri: 80 });
                if (!r.sent && !r.failed) throw new UserError('Kein Smart-Home-Ziel eingerichtet.');
                return { msg: '💡 Licht ' + (id === 'light_off' ? 'aus' : 'an') + (r.failed ? ' (' + r.failed + ' Fehler)' : '') };
            }
            case 'status_busy': case 'status_online': case 'status_join': {
                const status = { status_busy: 'busy', status_online: 'active', status_join: 'join me' }[id];
                await a.post({ act: 'status', status, desc: '' }, {});
                return { msg: '✔ Status: ' + status };
            }
            case 'obs_scene': {
                if (!a.obs) throw new UserError('OBS fehlt.');
                const list = (a.obs.status().scenes || []).map(s => str(s.name || s));
                const want = norm(arg), pick = list.find(s => norm(s) === want) || list.find(s => norm(s).includes(want)) || '';
                if (!pick) throw new UserError('OBS-Szene „' + arg + '“ nicht gefunden.');
                await a.obs.scene(pick);
                return { msg: '🎬 ' + pick };
            }
            case 'open': {
                const w = norm(arg).replace(/^(die|den|das|the|meine|my) /, ''), tab = TABS[w];
                if (!tab) throw new UserError('Seite „' + arg + '“ kenne ich nicht.');
                return { msg: '📂 ' + arg, tab };
            }
            case 'button': {
                if (!a.buttons) throw new UserError('Knöpfe fehlen.');
                const want = norm(arg);
                let pick = null;
                for (const p of a.buttons.cfg().pages) for (const b of p.buttons) { const l = norm(b.label); if (l && (l === want || (!pick && l.includes(want)))) pick = b; }
                if (!pick) throw new UserError('Knopf „' + arg + '“ nicht gefunden.');
                const r = await a.buttons.run(pick.id);
                return Object.assign({ msg: '🔘 ' + pick.label }, r && r.tab ? { tab: r.tab } : {});
            }
            case 'help': return { msg: '🗣 ' + this.cfg().wake + ' + ' + BUILTIN.map(b => b[1][0].replace(' *', ' …')).join(', ') };
            default: return { ok: false, msg: '🤔 Befehl „' + arg + '“ nicht erkannt – sag „' + this.cfg().wake + ' Hilfe“.' };
        }
    }
    status() { return { cfg: this.cfg(), commands: BUILTIN.map(b => ({ id: b[0], say: b[1].slice(0, 2), label: b[2] })), tabs: Object.keys(TABS), last: this.last, speech: !!this.app.speech }; }
    async action(act, input) {
        switch (act) {
            case 'vcmd_status': return this.status();
            case 'vcmd_cfg': this.saveCfg(input); return Object.assign(this.status(), { msg: 'Gespeichert.' });
            case 'vcmd_run': { const id = str(input.id); if (!BUILTIN.some(b => b[0] === id) || ['open', 'button', 'obs_scene', 'help'].includes(id)) throw new UserError('Unbekannter Befehl.'); return Object.assign({ id }, await this.run(id, '')); }   // 8.0.5 Handmenü
            case 'vcmd_try': { const r = this.parse(input.text); return { hit: r, msg: r ? (r.id === 'unknown' ? '🤔 kein Befehl: „' + r.arg + '“' : '✔ ' + (BUILTIN.find(b => b[0] === r.id) || ['', '', r.id])[2] + (r.arg ? ': ' + r.arg : '')) : 'Kein Befehl (Weckwort fehlt).' }; }   // nur prüfen, nichts auslösen
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { VoiceCmd, BUILTIN, norm };
