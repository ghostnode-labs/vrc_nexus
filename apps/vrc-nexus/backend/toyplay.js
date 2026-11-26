'use strict';
/*
 * NSFW 3.0 – zusätzliche Quellen und Spiele für die Spielzeug-Steuerung (nur mit 18+-Freigabe, Consent-Ampel gilt immer):
 *  - Funscript-Player (Vibration aus der Bewegungsgeschwindigkeit, Stroker folgen den Positionen)
 *  - Spielmodi: Würfel, Roulette, Edging-Spiel mit Punkten
 *  - Aufnahme & Wiedergabe von Sessions (10 Werte/s je Gerät, max. 10 min, 10 Aufnahmen)
 *  - Profile je Avatar (Verknüpfungen & Quellen werden beim Avatarwechsel automatisch geladen)
 *  - Welt-Brücke: Welten schreiben „[NexusToy] …“ ins VRChat-Log (Udon) → Spielzeug reagiert (nur nach Freigabe, mit Obergrenze)
 *  - Musik: Lautstärke des System-Tons als Quelle (Messung in der Oberfläche)
 */
const { str, int, cut, UserError } = require('./util');

const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));
const PROFILE_KEYS = ['links', 'links_on', 'pcs', 'heart', 'voice', 'ogb', 'ogb_min', 'dev', 'sps_enable', 'osc_out'];
const DEF = { world_bridge: false, world_max: 60, music_on: false, music_gain: 100, music_device: 'all', profiles_auto: true };
const REC_HZ = 10, REC_MAX_S = 600, REC_MAX = 10;

class ToyPlay {
    constructor(app, toys) {
        this.app = app; this.toys = toys;
        this.fun = null;      // { name, actions: [{at, pos}], start, dur, loop }
        this.game = null;     // { kind, ... }
        this.rec = null;      // { start, data: {devName: number[]} }
        this.play = null;     // { name, start, data, len }
        this.world = null;    // { lv, until }
        this.musicLv = 0; this.musicAt = 0;
        this.lastAvatar = '';
    }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('toyplay_cfg', '{}')) || {}); } catch (e) { return Object.assign({}, DEF); } }
    saveCfg(c) {
        const n = this.cfg(), b = v => v === true || v === '1' || v === 'true';
        for (const k of ['world_bridge', 'music_on', 'profiles_auto']) if (c[k] !== undefined) n[k] = b(c[k]);
        if (c.world_max !== undefined) n.world_max = Math.max(5, Math.min(100, int(c.world_max) || 60));
        if (c.music_gain !== undefined) n.music_gain = Math.max(10, Math.min(400, int(c.music_gain) || 100));
        if (c.music_device !== undefined) n.music_device = /^(all|\d{1,3})$/.test(str(c.music_device)) ? str(c.music_device) : 'all';
        this.app.db.setSetting('toyplay_cfg', JSON.stringify(n));
        return n;
    }
    active() { return !!(this.fun || this.game || this.play || (this.world && Date.now() < this.world.until) || this.musicActive()); }
    musicActive() { return this.cfg().music_on && Date.now() - this.musicAt < 1500; }

    /** Stärke für ein Gerät aus allen 3.0-Quellen (null = keine Quelle aktiv) */
    level(d, t = Date.now()) {
        let lv = null;
        const max = v => { lv = Math.max(lv === null ? 0 : lv, clamp(v)); };
        if (this.fun) { const v = this.funLevel(t); if (v !== null) max(v); }
        if (this.game) { const v = this.gameLevel(d, t); if (v !== null) max(v); }
        if (this.play) { const v = this.playLevel(d, t); if (v !== null) max(v); }
        if (this.world && t < this.world.until) max(this.world.lv);
        const c = this.cfg();
        if (this.musicActive() && (c.music_device === 'all' || c.music_device === String(d.index))) max(this.musicLv * c.music_gain / 100);
        return lv;
    }

    // ---------- Funscript ----------
    loadFunscript(name, json) {
        let j; try { j = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { throw new UserError('Keine gültige .funscript-Datei.'); }
        const acts = (j && Array.isArray(j.actions) ? j.actions : []).map(a => ({ at: Math.max(0, int(a.at)), pos: Math.max(0, Math.min(100, Number(a.pos) || 0)) })).filter(a => Number.isFinite(a.at)).sort((a, b) => a.at - b.at);
        if (acts.length < 2) throw new UserError('Das Funscript enthält zu wenige Bewegungen.');
        if (acts.length > 200000) throw new UserError('Funscript zu groß.');
        if (j.inverted) for (const a of acts) a.pos = 100 - a.pos;
        this.funData = { name: cut(str(name) || 'Funscript', 80), actions: acts, dur: acts[acts.length - 1].at };
        return { name: this.funData.name, actions: acts.length, seconds: Math.round(this.funData.dur / 1000) };
    }
    funStart(offsetS = 0, loop = false) {
        if (!this.funData) throw new UserError('Erst ein Funscript laden.');
        this.fun = Object.assign({}, this.funData, { start: Date.now() - Math.max(0, Number(offsetS) || 0) * 1000, loop: !!loop, idx: 0, linAt: 0 });
        return this.funStatus();
    }
    funStop() { this.fun = null; return this.funStatus(); }
    funPos(t) {
        const f = this.fun; let ms = t - f.start;
        if (ms > f.dur) { if (!f.loop) { this.fun = null; return null; } ms %= f.dur; f.idx = 0; }
        const a = f.actions;
        while (f.idx < a.length - 2 && a[f.idx + 1].at <= ms) f.idx++;
        while (f.idx > 0 && a[f.idx].at > ms) f.idx--;
        return { ms, i: f.idx, a: a[f.idx], b: a[f.idx + 1] };
    }
    /** Vibration = Geschwindigkeit der Bewegung (volle Länge in 0,25 s = 100 %) */
    funLevel(t) {
        if (!this.fun) return null;
        const p = this.funPos(t);
        if (!p || !p.b) return 0;
        const dt = Math.max(1, p.b.at - p.a.at), speed = Math.abs(p.b.pos - p.a.pos) / dt * 1000 / 400;
        return clamp(speed);
    }
    /** Stroker: nächste Zielposition (Buttplug LinearCmd: Dauer + Position) */
    funLinear(t = Date.now()) {
        if (!this.fun) return null;
        const p = this.funPos(t);
        if (!p || !p.b) return null;
        return { duration: Math.max(50, p.b.at - Math.max(p.a.at, p.ms)), position: p.b.pos / 100, key: p.i };
    }
    funStatus() { return this.fun ? { name: this.fun.name, pos_s: Math.round((Date.now() - this.fun.start) / 1000), seconds: Math.round(this.fun.dur / 1000), loop: this.fun.loop } : (this.funData ? { name: this.funData.name, loaded: true, seconds: Math.round(this.funData.dur / 1000) } : null); }

    // ---------- Spiele ----------
    startGame(kind, opts = {}) {
        const t = Date.now(), rnd = (a, b) => a + Math.random() * (b - a);
        if (kind === 'dice') this.game = { kind, rounds: Math.max(1, Math.min(20, int(opts.rounds) || 5)), round: 0, next: t, lv: 0, until: 0, rolls: [] };
        else if (kind === 'roulette') this.game = { kind, rounds: Math.max(1, Math.min(20, int(opts.rounds) || 6)), round: 0, next: t, lv: 0, until: 0, dev: null };
        else if (kind === 'edge') this.game = { kind, rounds: Math.max(1, Math.min(10, int(opts.rounds) || 5)), round: 1, start: t, ramp: Math.max(20, Math.min(300, int(opts.ramp) || 60)) * 1000, score: 0, pauseUntil: 0, log: [] };
        else throw new UserError('Unbekanntes Spiel.');
        this.game.started = t; this.game.rnd = rnd;
        return this.gameStatus();
    }
    gameLevel(d, t) {
        const g = this.game; if (!g) return null;
        if (g.kind === 'dice' || g.kind === 'roulette') {
            if (t >= g.next) {
                if (g.round >= g.rounds) { this.endGame(); return 0; }
                g.round++;
                const secs = Math.round(g.rnd(5, 20)), lv = Math.round(g.rnd(0.15, 1) * 20) / 20;
                g.lv = lv; g.until = t + secs * 1000; g.next = g.until + 2000;
                if (g.kind === 'dice') g.rolls.push({ lv: Math.round(lv * 100), secs });
                else { const list = [...this.toys.devices.values()]; g.dev = list.length ? list[Math.floor(Math.random() * list.length)].index : null; }
            }
            if (t > g.until) return 0;
            if (g.kind === 'roulette' && g.dev !== d.index) return 0;
            return g.lv;
        }
        if (g.kind === 'edge') {
            if (t < g.pauseUntil) return 0;
            if (g.round > g.rounds) { this.endGame(); return 0; }
            const lust = this.toys.lust ? this.toys.lust.v : 0;
            if (lust >= 0.97) { g.log.push({ round: g.round, pts: 0, lost: true }); this.nextEdge(t, 15000); return 0; }   // zu weit → Runde verloren
            return clamp(0.2 + 0.8 * Math.min(1, (t - g.start) / g.ramp));
        }
        return null;
    }
    nextEdge(t, pause) { const g = this.game; g.round++; g.start = t + pause; g.pauseUntil = t + pause; }
    /** Edging-Spiel: „Halt!“ – je höher die Stärke, desto mehr Punkte (aber nicht drüber!) */
    gameHold() {
        const g = this.game, t = Date.now();
        if (!g || g.kind !== 'edge' || t < g.pauseUntil) throw new UserError('Gerade läuft keine Edging-Runde.');
        const lv = clamp(0.2 + 0.8 * Math.min(1, (t - g.start) / g.ramp)), pts = Math.round(lv * 100);
        g.score += pts; g.log.push({ round: g.round, pts });
        this.nextEdge(t, 10000);
        return Object.assign(this.gameStatus(), { msg: '✋ Gehalten bei ' + pts + ' % → +' + pts + ' Punkte' });
    }
    endGame() { const g = this.game; this.game = null; if (g) this.lastGame = { kind: g.kind, score: g.score || 0, rolls: g.rolls || [], log: g.log || [], ended: Date.now() }; }
    gameStatus() { const g = this.game; return g ? { kind: g.kind, round: Math.min(g.round, g.rounds), rounds: g.rounds, score: g.score || 0, lv: Math.round((g.lv || 0) * 100), pause: g.pauseUntil > Date.now() } : null; }

    // ---------- Aufnahme & Wiedergabe ----------
    recStart() { if (this.rec) throw new UserError('Aufnahme läuft schon.'); this.rec = { start: Date.now(), data: {}, n: 0 }; return this.recStatus(); }
    /** wird 10× pro Sekunde mit den gesendeten Stärken aufgerufen */
    sample(levels) {
        if (!this.rec) return;
        const r = this.rec;
        if (r.n >= REC_HZ * REC_MAX_S) return;
        for (const [name, lv] of Object.entries(levels)) { const arr = r.data[name] = r.data[name] || new Array(r.n).fill(0); arr.push(Math.round(clamp(lv) * 255)); }
        for (const arr of Object.values(r.data)) while (arr.length < r.n + 1) arr.push(0);
        r.n++;
    }
    recStop(name) {
        const r = this.rec; this.rec = null;
        if (!r || r.n < REC_HZ) throw new UserError('Aufnahme zu kurz.');
        const all = this.recordings();
        if (all.length >= REC_MAX) all.shift();
        const nm = cut(str(name).trim(), 40) || 'Aufnahme ' + new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        all.push({ id: 'r' + Date.now().toString(36), name: nm, secs: Math.round(r.n / REC_HZ), data: Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, Buffer.from(v).toString('base64')])) });
        this.app.db.setSetting('toy_recordings', JSON.stringify(all));
        return Object.assign(this.recStatus(), { msg: '⏺ „' + nm + '“ gespeichert (' + Math.round(r.n / REC_HZ) + ' s).' });
    }
    recordings() { try { return JSON.parse(this.app.db.setting('toy_recordings', '[]')) || []; } catch (e) { return []; } }
    playStart(id) {
        const r = this.recordings().find(x => x.id === str(id));
        if (!r) throw new UserError('Aufnahme nicht gefunden.');
        const data = Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, [...Buffer.from(v, 'base64')]]));
        this.play = { name: r.name, start: Date.now(), data, len: Math.max(0, ...Object.values(data).map(a => a.length)) };
        return this.recStatus();
    }
    playLevel(d, t) {
        const p = this.play, i = Math.floor((t - p.start) / 1000 * REC_HZ);
        if (i >= p.len) { this.play = null; return 0; }
        const arr = p.data[d.name] || Object.values(p.data)[0];   // anderes Gerät: erste Spur
        return arr ? (arr[i] || 0) / 255 : 0;
    }
    recDelete(id) { this.app.db.setSetting('toy_recordings', JSON.stringify(this.recordings().filter(x => x.id !== str(id)))); return this.recStatus(); }
    recStatus() { return { recording: this.rec ? Math.round(this.rec.n / REC_HZ) : null, playing: this.play ? this.play.name : null, list: this.recordings().map(r => ({ id: r.id, name: r.name, secs: r.secs, tracks: Object.keys(r.data).length })) }; }

    // ---------- Profile je Avatar ----------
    profiles() { try { return JSON.parse(this.app.db.setting('toy_profiles', '{}')) || {}; } catch (e) { return {}; } }
    profileSave(avatarId) {
        const id = str(avatarId) || str(this.app.game.osc.avatarId);
        if (!/^avtr_[0-9a-f-]{36}$/i.test(id)) throw new UserError('Kein getragener Avatar erkannt.');
        const c = this.toys.cfg(), p = this.profiles();
        p[id] = Object.fromEntries(PROFILE_KEYS.filter(k => c[k] !== undefined).map(k => [k, c[k]]));
        this.app.db.setSetting('toy_profiles', JSON.stringify(p));
        return { ok: true, msg: '💾 Spielzeug-Profil für diesen Avatar gespeichert.', profiles: Object.keys(p).length };
    }
    profileDelete(avatarId) { const p = this.profiles(); delete p[str(avatarId) || str(this.app.game.osc.avatarId)]; this.app.db.setSetting('toy_profiles', JSON.stringify(p)); return { ok: true, profiles: Object.keys(p).length }; }
    /** beim Avatarwechsel: passendes Profil laden */
    onAvatar(id) {
        if (!id || id === this.lastAvatar) return false;
        this.lastAvatar = id;
        if (!this.cfg().profiles_auto) return false;
        const p = this.profiles()[id];
        if (!p) return false;
        this.toys.saveCfg(p);
        if (this.app.tools && this.app.tools.alert && this.toys.cfg().notify_profile !== false) this.app.tools.alert('🧸 Spielzeug-Profil', 'Für diesen Avatar geladen.');
        return true;
    }

    // ---------- Welt-Brücke ----------
    /** Log-Zeile aus einer Welt: „[NexusToy] pulse 0.6 3“ | „[NexusToy] set 0.4“ | „[NexusToy] stop“ */
    onWorld(cmd, a, b) {
        const c = this.cfg();
        if (!c.world_bridge) return false;
        const cap = c.world_max / 100, t = Date.now();
        if (cmd === 'stop') { this.world = null; return true; }
        const lv = Math.min(cap, clamp(a)), secs = Math.max(0.2, Math.min(30, Number(b) || (cmd === 'set' ? 30 : 2)));
        if (cmd === 'pulse' || cmd === 'set') { this.world = { lv, until: t + secs * 1000 }; return true; }
        return false;
    }
    music(lv) { this.musicLv = clamp(lv); this.musicAt = Date.now(); }
    stopAll() { this.fun = null; this.game = null; this.play = null; this.world = null; this.musicAt = 0; }
    status() { return { cfg: this.cfg(), fun: this.funStatus(), game: this.gameStatus(), last_game: this.lastGame || null, rec: this.recStatus(), world: this.world && Date.now() < this.world.until ? Math.round(this.world.lv * 100) : 0,
        music: this.musicActive() ? Math.round(this.musicLv * 100) : 0, profile: !!this.profiles()[str(this.app.game.osc.avatarId)] }; }

    async action(act, input) {
        switch (act) {
            case 'toys3_get': return this.status();
            case 'toys3_cfg': this.saveCfg(input); return Object.assign(this.status(), { msg: 'Gespeichert.' });
            case 'toys3_fun_load': { const f = this.loadFunscript(input.name, input.json); return Object.assign(this.status(), { msg: '📜 ' + f.name + ' geladen.' }); }
            case 'toys3_fun_start': this.funStart(input.offset, input.loop === '1'); return Object.assign(this.status(), { msg: '▶ Funscript läuft.' });
            case 'toys3_fun_stop': this.funStop(); await this.toys.stopAll().catch(() => {}); return this.status();
            case 'toys3_game': this.startGame(str(input.kind), input); return Object.assign(this.status(), { msg: '🎲 Spiel gestartet.' });
            case 'toys3_hold': { const h = this.gameHold(); return Object.assign(this.status(), h); }
            case 'toys3_game_stop': this.endGame(); await this.toys.stopAll().catch(() => {}); return this.status();
            case 'toys3_rec_start': this.recStart(); return Object.assign(this.status(), { msg: '⏺ Aufnahme läuft.' });
            case 'toys3_rec_stop': { const h = this.recStop(input.name); return Object.assign(this.status(), h); }
            case 'toys3_play': this.playStart(input.id); return Object.assign(this.status(), { msg: '▶ Wiedergabe.' });
            case 'toys3_play_stop': this.play = null; await this.toys.stopAll().catch(() => {}); return this.status();
            case 'toys3_rec_delete': this.recDelete(input.id); return this.status();
            case 'toys3_profile_save': { const h = this.profileSave(input.avatar); return Object.assign(this.status(), h); }
            case 'toys3_profile_delete': this.profileDelete(input.avatar); return Object.assign(this.status(), { msg: 'Profil gelöscht.' });
            case 'toys3_music': this.music(input.lv); return { ok: true };
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { ToyPlay, PROFILE_KEYS };
