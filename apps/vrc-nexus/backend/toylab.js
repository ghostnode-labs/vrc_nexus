'use strict';
/*
 * 8.2 (🔞, nur mit Spielzeug-Freigabe über toys.action): 🧪 Spielzeug-Labor – baut die Spielzeug-Steuerung aus.
 *   • 📈 Zeitleisten-Muster: Stützpunkte (Zeit, Stärke, Übergang linear/Stufe/weich), laufen als Muster „t:…“ überall mit
 *     (Muster-Knöpfe, Szenen, Fernsteuerung, Uhr/Handy)
 *   • 🧬 Muster-Mixer: zwei Muster verbinden (malnehmen, Maximum, Mittelwert, abwechseln) → Muster „m:…“
 *   • ❤ Puls-Deckel: ab einem Puls wird die Höchststärke sanft gesenkt (bis zur Untergrenze beim Höchstpuls) – kein Stopp, nur Bremse
 *   • 🌅 Sanft an & aus: Sanftanlauf nach einer Ruhepause und Ausklingen-Timer (läuft N Minuten, die letzten Sekunden werden
 *     leiser, dann alles aus)
 *   • 👥 Spielzeug-Gruppen: Geräte unter einem Namen bündeln – Gruppen-Stärke (Anteil), stumm schalten, gemeinsam setzen/stoppen
 *   • 📊 Private Statistik: Sitzungen (Dauer, Spitze, Ø, Höhepunkte, Muster) nur auf diesem Gerät, verschlüsselt, löscht sich
 *     nach N Tagen selbst; aus ab Werk
 * Sicherheit: alles hier kann die Stärke nur SENKEN (Faktor 0…1). Not-Aus, Panik, Safeword und Ampel Rot laufen über
 * toys.stopAll() → halt() beendet auch Ausklingen-Timer und Sanftanlauf sofort.
 */
const { str, int, cut, arr, UserError } = require('./util');

const SHAPES = ['lin', 'step', 'ease'];
const MIX_MODES = ['mul', 'max', 'avg', 'alt'];
const DEF = {
    hrcap: { on: false, soft: 120, hard: 160, floor: 25 },
    soft: { on: false, secs: 15, idle_s: 20 },
    groups: [], timelines: [], mixes: [],
    stats: { on: false, keep_days: 30 },
};
const clamp = x => Math.max(0, Math.min(1, Number(x) || 0));
const yes = v => v === true || v === '1' || v === 1 || v === 'true' || v === 'on';
const parse = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch (e) { return null; } };
const newId = () => Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 36 ** 2).toString(36);
const okId = s => /^[a-z0-9]{1,12}$/.test(str(s));

/** Zeitleiste prüfen: 2–60 Punkte, Zeit 0–600 s aufsteigend, Stärke 0–100 */
function normTimeline(x, i) {
    const pts = arr(x && x.points).map(p => Array.isArray(p) ? { t: p[0], v: p[1], s: p[2] } : p || {})
        .map(p => ({ t: Math.round(Math.max(0, Math.min(600, Number(p.t) || 0)) * 10) / 10, v: Math.max(0, Math.min(100, int(p.v))), s: SHAPES.includes(p.s) ? p.s : 'lin' }))
        .sort((a, b) => a.t - b.t).filter((p, k, all) => k === 0 || p.t > all[k - 1].t).slice(0, 60);
    if (pts.length < 2 || pts[pts.length - 1].t < 0.5) return null;
    return { id: okId(x.id) ? str(x.id) : 't' + (i + 1), name: cut(str(x.name).trim(), 30) || 'Zeitleiste ' + (i + 1), points: pts, loop: x.loop === undefined ? true : yes(x.loop) };
}
/** Stärke einer Zeitleiste zur Zeit t (Sekunden) – 0…1 */
function timelineAt(tl, t) {
    const p = tl.points, dur = p[p.length - 1].t;
    let x = t;
    if (tl.loop) x = ((t % dur) + dur) % dur; else if (t >= dur) return p[p.length - 1].v / 100;
    for (let k = 0; k < p.length - 1; k++) {
        const a = p[k], b = p[k + 1];
        if (x < a.t || x > b.t) continue;
        const f = (x - a.t) / (b.t - a.t);
        const g = a.s === 'step' ? 0 : a.s === 'ease' ? 0.5 - 0.5 * Math.cos(Math.PI * f) : f;
        return (a.v + (b.v - a.v) * g) / 100;
    }
    return p[0].v / 100;
}

class ToyLab {
    constructor(app, toys) {
        this.app = app; this.toys = toys;
        this.fade = null; this.rampAt = new Map(); this.lastOn = new Map();
        this.sess = null; this.hr = { bpm: 0, factor: 1 };
        this.timer = setInterval(() => { try { this.tick(); } catch (e) { /* nie die App stören */ } }, 1000);
        if (this.timer.unref) this.timer.unref();
    }
    get crypt() { return (this.app.vrc && this.app.vrc.crypt) || { encrypt: s => s, decrypt: s => s }; }
    cfg() {
        const raw = this.app.db.setting('toylab_cfg', '{}');
        if (this.cache && this.cache.raw === raw) return this.cache.cfg;   // wird je Gerät alle 50 ms gebraucht
        let c; try { c = JSON.parse(raw) || {}; } catch (e) { c = {}; }
        const o = Object.assign({}, DEF, c);
        for (const k of ['hrcap', 'soft', 'stats']) o[k] = Object.assign({}, DEF[k], c[k] || {});
        for (const k of ['groups', 'timelines', 'mixes']) o[k] = arr(c[k]);
        this.cache = { raw, cfg: o };
        return o;
    }
    saveCfg(input) {
        const cur = this.cfg(), n = Object.assign({}, cur);
        const grp = (k, spec) => {
            const v = parse(input[k]); if (!v || typeof v !== 'object') return;
            const o = Object.assign({}, cur[k]);
            for (const [f, t, lo, hi] of spec) if (v[f] !== undefined) o[f] = t === 'b' ? yes(v[f]) : Math.max(lo, Math.min(hi, int(v[f])));
            n[k] = o;
        };
        grp('hrcap', [['on', 'b'], ['soft', 'n', 70, 200], ['hard', 'n', 80, 220], ['floor', 'n', 0, 90]]);
        if (n.hrcap.hard <= n.hrcap.soft) n.hrcap.hard = Math.min(220, n.hrcap.soft + 10);
        grp('soft', [['on', 'b'], ['secs', 'n', 3, 120], ['idle_s', 'n', 5, 600]]);
        grp('stats', [['on', 'b'], ['keep_days', 'n', 1, 365]]);
        if (input.groups !== undefined) {
            n.groups = arr(parse(input.groups)).map((g, i) => ({ id: okId(g && g.id) ? str(g.id) : 'g' + (i + 1), name: cut(str(g && g.name).trim(), 30) || 'Gruppe ' + (i + 1),
                devices: [...new Set(arr(g && g.devices).map(x => cut(str(x), 80)).filter(Boolean))].slice(0, 20), level: Math.max(0, Math.min(100, g && g.level !== undefined ? int(g.level) : 100)), on: !g || g.on === undefined ? true : yes(g.on) }))
                .filter(g => g.devices.length).slice(0, 12);
        }
        if (input.timelines !== undefined) {
            const list = arr(parse(input.timelines)).map(normTimeline).filter(Boolean);
            if (arr(parse(input.timelines)).length && !list.length) throw new UserError('Eine Zeitleiste braucht mindestens 2 Punkte (unterschiedliche Zeiten).');
            n.timelines = list.slice(0, 20);
        }
        if (input.mixes !== undefined) {
            n.mixes = arr(parse(input.mixes)).map((m, i) => ({ id: okId(m && m.id) ? str(m.id) : 'm' + (i + 1), name: cut(str(m && m.name).trim(), 30) || 'Mix ' + (i + 1),
                a: cut(str(m && m.a), 20), b: cut(str(m && m.b), 20), mode: MIX_MODES.includes(m && m.mode) ? m.mode : 'mul', alt_s: Math.max(1, Math.min(60, int(m && m.alt_s) || 5)) }))
                .filter(m => m.a && m.b && !/^m:/.test(m.a) && !/^m:/.test(m.b)).slice(0, 20);
        }
        this.app.db.setSetting('toylab_cfg', JSON.stringify(n));
        return n;
    }

    // ---------- Muster (Zeitleiste & Mixer) ----------
    patterns() {
        const c = this.cfg();
        return c.timelines.map(t => ({ id: 't:' + t.id, name: '📈 ' + t.name, custom: true })).concat(c.mixes.map(m => ({ id: 'm:' + m.id, name: '🧬 ' + m.name, custom: true })));
    }
    /** Muster-Funktion für „t:…“ (Zeitleiste) und „m:…“ (Mixer) – null, wenn unbekannt */
    patternFn(id) {
        id = str(id); const c = this.cfg();
        if (id.startsWith('t:')) { const tl = c.timelines.find(x => x.id === id.slice(2)); return tl ? t => timelineAt(tl, t) : null; }
        if (id.startsWith('m:')) {
            const m = c.mixes.find(x => x.id === id.slice(2)); if (!m) return null;
            const fa = this.toys.patternFn(m.a), fb = this.toys.patternFn(m.b);
            if (!fa || !fb || /^m:/.test(m.a) || /^m:/.test(m.b)) return null;
            const sa = {}, sb = {};
            return t => {
                const a = clamp(fa(t, sa)), b = clamp(fb(t, sb));
                if (m.mode === 'max') return Math.max(a, b);
                if (m.mode === 'avg') return (a + b) / 2;
                if (m.mode === 'alt') return Math.floor(t / m.alt_s) % 2 ? b : a;
                return a * b;
            };
        }
        return null;
    }

    // ---------- Faktor je Gerät (nur senken) ----------
    groupFactor(name) {
        let f = 1;
        for (const g of this.cfg().groups) if (g.devices.includes(name)) f = Math.min(f, g.on ? g.level / 100 : 0);
        return f;
    }
    hrFactor() {
        const c = this.cfg().hrcap, h = this.app.heart;
        const bpm = h && h.active ? int(h.bpm) : 0;
        let f = 1;
        if (c.on && bpm > c.soft) f = 1 - (1 - c.floor / 100) * Math.min(1, (bpm - c.soft) / Math.max(1, c.hard - c.soft));
        this.hr = { bpm, factor: Math.round(f * 100) / 100 };
        return f;
    }
    softFactor(d, x, t) {
        const c = this.cfg().soft, k = d.index;
        if (x <= 0.001) return 1;
        const last = this.lastOn.get(k) || 0;
        if (!last || t - last > c.idle_s * 1000) this.rampAt.set(k, t);
        this.lastOn.set(k, t);
        if (!c.on) return 1;
        const s = this.rampAt.get(k) || t;
        return Math.max(0.05, Math.min(1, (t - s) / (c.secs * 1000)));
    }
    fadeFactor(t) {
        const f = this.fade; if (!f) return 1;
        if (t >= f.until) return 0;
        return t < f.until - f.fade_ms ? 1 : Math.max(0, (f.until - t) / f.fade_ms);
    }
    /** wird von toys.shaped() für jedes Gerät gerufen: x = Stärke vor Ampel/Edging, Ergebnis 0…1 */
    factor(d, x, t = Date.now()) {
        return Math.max(0, Math.min(1, this.groupFactor(d.name) * this.hrFactor() * this.softFactor(d, x, t) * this.fadeFactor(t)));
    }

    // ---------- Ausklingen-Timer ----------
    startFade(input) {
        const min = Math.max(1, Math.min(240, Number(input.minutes) || 10)), fade = Math.max(5, Math.min(300, int(input.fade_s) || 30));
        const t = Date.now();
        this.fade = { start: t, until: t + min * 60000, fade_ms: Math.min(fade * 1000, min * 60000) };
        return this.fade;
    }
    /** Not-Aus / Panik / Safeword / Ampel Rot: alles hier sofort beenden */
    halt() { this.fade = null; this.rampAt.clear(); this.lastOn.clear(); }

    // ---------- Gruppen ----------
    groupDevices(gid) {
        const g = this.cfg().groups.find(x => x.id === str(gid));
        if (!g) throw new UserError('Gruppe nicht gefunden.');
        return { g, devs: [...this.toys.devices.values()].filter(d => g.devices.includes(d.name)) };
    }

    // ---------- Private Statistik ----------
    loadStats() { try { const raw = this.app.db.setting('toylab_stats', ''); return raw ? arr(JSON.parse(this.crypt.decrypt(raw))) : []; } catch (e) { return []; } }
    saveStats(list) { this.app.db.setSetting('toylab_stats', list.length ? this.crypt.encrypt(JSON.stringify(list)) : ''); }
    /** jede Sekunde: Sitzung mitzählen (nur wenn eingeschaltet), Ausklingen-Ende */
    tick(t = Date.now()) {
        if (this.fade && t >= this.fade.until) { this.fade = null; this.toys.stopAll().catch(() => {}); this.toys.pauseMsg = '🌅 Ausgeklungen – alles aus'; }
        const c = this.cfg().stats;
        const out = Math.max(0, ...[...this.toys.cur.values()]);
        if (!c.on) { this.sess = null; return; }
        if (out > 0.02) {
            if (!this.sess) this.sess = { start: t, last: t, active: 0, sum: 0, peak: 0, cl0: this.toys.lust.climaxes, pat0: this.toys.stats.patterns };
            const s = this.sess; s.active++; s.sum += out; s.peak = Math.max(s.peak, out); s.last = t;
        } else if (this.sess && t - this.sess.last > 120000) this.endSession(t);
    }
    endSession(t = Date.now()) {
        const s = this.sess; this.sess = null;
        if (!s || s.active < 30) return null;
        const keep = this.cfg().stats.keep_days, d = new Date(s.start);
        const rec = { start: Math.round(s.start / 1000), day: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
            min: Math.max(1, Math.round((s.last - s.start) / 60000)), active_s: s.active, peak: Math.round(s.peak * 100), avg: Math.round(s.sum / s.active * 100),
            climaxes: Math.max(0, this.toys.lust.climaxes - s.cl0), patterns: Math.max(0, this.toys.stats.patterns - s.pat0) };
        const list = this.loadStats().filter(r => r.start * 1000 > t - keep * 86400000).concat([rec]).slice(-500);
        this.saveStats(list);
        return rec;
    }
    statsSummary(days = 30) {
        const since = Date.now() / 1000 - Math.max(1, Math.min(365, int(days) || 30)) * 86400, keep = this.cfg().stats.keep_days;
        const all = this.loadStats(), list = all.filter(r => r.start >= since && r.start * 1000 > Date.now() - keep * 86400000);
        const wd = [0, 0, 0, 0, 0, 0, 0];
        for (const r of list) wd[(new Date(r.start * 1000).getDay() + 6) % 7]++;
        const sum = k => list.reduce((a, r) => a + (r[k] || 0), 0);
        return { sessions: list.length, minutes: sum('min'), avg_min: list.length ? Math.round(sum('min') / list.length) : 0, longest: list.reduce((a, r) => Math.max(a, r.min), 0),
            avg_peak: list.length ? Math.round(sum('peak') / list.length) : 0, climaxes: sum('climaxes'), patterns: sum('patterns'), weekdays: wd, recent: list.slice(-10).reverse(), stored: all.length };
    }

    status() {
        const c = this.cfg(), t = Date.now();
        this.hrFactor();
        const names = new Set([...this.toys.devices.values()].map(d => d.name));
        return { cfg: c, shapes: SHAPES, mix_modes: MIX_MODES, hr: this.hr,
            fade: this.fade ? { left: Math.max(0, Math.round((this.fade.until - t) / 1000)), fade_s: Math.round(this.fade.fade_ms / 1000), fading: t >= this.fade.until - this.fade.fade_ms, factor: Math.round(this.fadeFactor(t) * 100) } : null,
            groups: c.groups.map(g => Object.assign({}, g, { present: g.devices.filter(n => names.has(n)).length })),
            devices: [...this.toys.devices.values()].map(d => ({ index: d.index, name: d.name })),
            patterns: this.toys.allPatterns().filter(p => !/^m:/.test(p.id)),
            stats: c.stats.on || this.loadStats().length ? this.statsSummary(30) : null, recording: !!this.sess };
    }
    async action(act, input) {
        switch (act) {
            case 'toys_lab_state': return this.status();
            case 'toys_lab_cfg': this.saveCfg(input); return Object.assign(this.status(), { msg: '🧪 Gespeichert.' });
            case 'toys_lab_preview': {   // Vorschau wie bei den Mustern: 48 Werte über die Länge der Zeitleiste (Mixer: 24 s)
                const id = str(input.id), f = this.patternFn(id); if (!f) throw new UserError('Unbekanntes Muster.');
                const tl = id.startsWith('t:') ? this.cfg().timelines.find(x => x.id === id.slice(2)) : null, secs = tl ? tl.points[tl.points.length - 1].t : 24;
                return { id, secs, preview: [...Array(48)].map((_, i) => Math.round(clamp(f(i * secs / 48, {})) * 100)) };
            }
            case 'toys_lab_fade': {
                if (!this.toys.ws || !this.toys.devices.size) throw new UserError('Erst mit Intiface verbinden und ein Gerät finden.');
                const f = this.startFade(input);
                return Object.assign(this.status(), { msg: '🌅 Läuft noch ' + Math.round((f.until - f.start) / 60000) + ' min, klingt dann ' + Math.round(f.fade_ms / 1000) + ' s lang aus.' });
            }
            case 'toys_lab_fade_now': {   // sofort sanft ausklingen lassen
                const fade = Math.max(5, Math.min(120, int(input.fade_s) || 15)), t = Date.now();
                this.fade = { start: t, until: t + fade * 1000, fade_ms: fade * 1000 };
                return Object.assign(this.status(), { msg: '🌅 Klingt ' + fade + ' s lang aus.' });
            }
            case 'toys_lab_fade_stop': this.fade = null; return Object.assign(this.status(), { msg: 'Ausklingen-Timer aus.' });
            case 'toys_lab_group_set': {
                const { g, devs } = this.groupDevices(input.group);
                if (!devs.length) throw new UserError('Kein Gerät dieser Gruppe ist verbunden.');
                const lv = clamp(input.level);
                for (const d of devs) { this.toys.manual.set(d.index, { lv, at: Date.now() }); await this.toys.set(String(d.index), lv); }
                return Object.assign(this.status(), { msg: '👥 ' + g.name + ': ' + Math.round(lv * 100) + ' %' });
            }
            case 'toys_lab_group_stop': {
                const { g, devs } = this.groupDevices(input.group);
                for (const d of devs) await this.toys.stopDevice(d.index).catch(() => {});
                return Object.assign(this.status(), { msg: '⏹ ' + g.name + ' gestoppt.' });
            }
            case 'toys_lab_group_mute': {
                const groups = this.cfg().groups.map(x => Object.assign({}, x)), g = groups.find(x => x.id === str(input.group));
                if (!g) throw new UserError('Gruppe nicht gefunden.');
                g.on = !yes(input.mute);
                this.saveCfg({ groups });
                return Object.assign(this.status(), { msg: '👥 ' + g.name + (g.on ? ' wieder an.' : ' stumm.') });
            }
            case 'toys_lab_stats': return { stats: this.statsSummary(input.days), on: this.cfg().stats.on };
            case 'toys_lab_stats_clear': this.sess = null; this.saveStats([]); return Object.assign(this.status(), { msg: '🗑 Statistik gelöscht.' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
    stop() { clearInterval(this.timer); }
}

module.exports = { ToyLab, timelineAt, normTimeline, DEF: DEF };
