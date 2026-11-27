'use strict';
/*
 * 7.3.4: 📈 Leistungsmessung (Werkzeuge).
 *   • Live: alle Prozesse von VRC Nexus (Hauptprozess/Backend, Fenster, GPU, Helfer – über Electron app.getAppMetrics),
 *     Verzögerung der Ereignis-Schleife, System-Speicher und -CPU, VR-FPS vom SteamVR-Helfer und (Windows) VRChat selbst zum Vergleich.
 *   • Messung aufnehmen: Start/Stopp (höchstens 4 h, alle 5 s ein Messpunkt), danach Auswertung mit Durchschnitt, Spitze,
 *     Anteil an deinem Arbeitsspeicher und einer Einschätzung, ob sich Optimierungen (z. B. ein Rust-Helfer) lohnen würden.
 *   • Die letzten 10 Messungen bleiben gespeichert (nur Zahlen, keine Welten oder Namen); Bericht zum Kopieren.
 * Misst nichts außerhalb des eigenen Rechners und schickt nichts weg.
 */
const os = require('os');
const { str, int, UserError } = require('./util');

const STEP = 5000, MAX_SAMPLES = 4 * 3600 * 1000 / STEP, KEEP = 10, LIVE = 120;   // 120 × 5 s = 10 min Verlauf
const TYPES = { Browser: 'main', Tab: 'window', GPU: 'gpu', Utility: 'helper', Zygote: 'helper', 'Pepper Plugin': 'helper', Unknown: 'helper' };

class PerfMon {
    constructor(app) { this.app = app; this.timer = null; this.live = []; this.rec = null; this.cpuPrev = null; this.sysPrev = null; this.vrcAt = 0; this.vrc = null; this.lag = 0; this.lagT = null; }
    get host() { return (this.app.tools && this.app.tools.host) || {}; }

    // ---------- Messpunkt ----------
    startLag() {
        if (this.lagT) return;
        let t = Date.now();
        this.lagT = setInterval(() => { const n = Date.now(); this.lag = Math.max(this.lag, Math.max(0, n - t - 500)); t = n; }, 500);
        if (this.lagT.unref) this.lagT.unref();
    }
    sysCpu() {
        const c = os.cpus() || []; let idle = 0, total = 0;
        for (const x of c) { const t = x.times || {}; idle += t.idle || 0; total += (t.user || 0) + (t.nice || 0) + (t.sys || 0) + (t.irq || 0) + (t.idle || 0); }
        const p = this.sysPrev; this.sysPrev = { idle, total };
        if (!p || total <= p.total) return null;
        return Math.round((1 - (idle - p.idle) / (total - p.total)) * 1000) / 10;
    }
    /** Prozesse von VRC Nexus: Electron-Metriken, sonst nur der eigene Prozess */
    procs() {
        const m = this.host.appMetrics ? this.host.appMetrics() : null;
        if (Array.isArray(m) && m.length) {
            const by = {};
            for (const p of m) {
                const k = TYPES[p.type] || 'helper', mem = p.memory ? (p.memory.workingSetSize || 0) / 1024 : 0;   // KB → MB
                const cpu = p.cpu ? Number(p.cpu.percentCPUUsage) || 0 : 0;
                const b = by[k] = by[k] || { mem: 0, cpu: 0, n: 0 };
                b.mem += mem; b.cpu += cpu; b.n++;
            }
            for (const b of Object.values(by)) { b.mem = Math.round(b.mem); b.cpu = Math.round(b.cpu * 10) / 10; }
            return by;
        }
        // ohne Electron (Handy, Tests): nur dieser Prozess
        const u = process.memoryUsage(), c = process.cpuUsage(), t = process.hrtime.bigint();
        let cpu = 0;
        if (this.cpuPrev) { const dt = Number(t - this.cpuPrev.t) / 1000; cpu = dt > 0 ? Math.round(((c.user - this.cpuPrev.c.user) + (c.system - this.cpuPrev.c.system)) / dt * 1000) / 10 : 0; }
        this.cpuPrev = { c, t };
        return { main: { mem: Math.round(u.rss / 1048576), cpu: Math.min(100 * os.cpus().length, cpu), n: 1 } };
    }
    /** VRChat zum Vergleich (nur Windows, höchstens alle 30 s, ohne Konsolenfenster) */
    vrchat(now) {
        if (process.platform !== 'win32' || !this.host.execFile || now - this.vrcAt < 30000) return;
        this.vrcAt = now;
        this.host.execFile('tasklist', ['/FI', 'IMAGENAME eq VRChat.exe', '/FO', 'CSV', '/NH'], 3000).then(out => {
            const m = /"VRChat\.exe","\d+","[^"]*","\d+","([\d.,\s ]+)/i.exec(String(out || ''));
            this.vrc = m ? { mem: Math.round(parseInt(m[1].replace(/[^\d]/g, ''), 10) / 1024), at: Date.now() } : null;
        }).catch(() => { this.vrc = null; });
    }
    sample(now = Date.now()) {
        this.startLag();
        const procs = this.procs();
        const mem = Object.values(procs).reduce((a, b) => a + b.mem, 0), cpu = Math.round(Object.values(procs).reduce((a, b) => a + b.cpu, 0) * 10) / 10;
        const fps = this.host.vrFps ? this.host.vrFps() : null;
        this.vrchat(now);
        let db = 0; try { db = this.app.db.size ? this.app.db.size() : 0; } catch (e) { db = 0; }
        const st = (this.app.game && this.app.game.state) || {};
        const s = { t: now, mem, cpu, lag: this.lag, procs, sys_mem: Math.round((os.totalmem() - os.freemem()) / 1048576), sys_cpu: this.sysCpu(),
            fps: fps && fps.app > 0 ? Math.round(fps.app * 10) / 10 : null, fps_min: fps && fps.min > 0 ? Math.round(fps.min * 10) / 10 : null,
            vrc_mem: this.vrc && now - this.vrc.at < 90000 ? this.vrc.mem : null, vrc: !!st.running, db_kb: Math.round(db / 1024) };
        this.lag = 0;
        return s;
    }
    tick(now = Date.now()) {
        const s = this.sample(now);
        this.live.push(s); if (this.live.length > LIVE) this.live.shift();
        if (this.rec) {
            this.rec.samples.push(s);
            if (this.rec.samples.length >= MAX_SAMPLES) this.stopRec('Höchstdauer (4 h) erreicht');
        }
        return s;
    }
    /** läuft nur, solange jemand zuschaut (Werkzeug offen) oder eine Messung aufnimmt */
    ensure() {
        this.watchAt = Date.now();
        if (this.timer) return;
        this.timer = setInterval(() => {
            if (!this.rec && Date.now() - this.watchAt > 60000) { clearInterval(this.timer); this.timer = null; return; }   // niemand schaut zu → aus
            try { this.tick(); } catch (e) { /* weiter */ }
        }, STEP);
        if (this.timer.unref) this.timer.unref();
        if (!this.live.length) this.tick();
    }
    stop() { clearInterval(this.timer); this.timer = null; clearInterval(this.lagT); this.lagT = null; }

    // ---------- Aufnahme ----------
    startRec(label) {
        if (this.rec) throw new UserError('Es läuft schon eine Messung.');
        this.rec = { label: String(label || '').trim().slice(0, 60), start: Date.now(), samples: [] };
        this.ensure();
        this.tick();
        return this.rec;
    }
    stopRec(reason) {
        const r = this.rec; if (!r) throw new UserError('Es läuft keine Messung.');
        this.rec = null;
        const sum = summarize(r.samples, os.totalmem() / 1048576, os.cpus().length);
        const item = Object.assign({ id: 'p' + r.start.toString(36), label: r.label, start: r.start, end: Date.now(), reason: reason || '', version: this.version() }, sum);
        const list = this.history().filter(x => x.id !== item.id);
        list.unshift(item);
        this.app.db.setSetting('perf_history', JSON.stringify(list.slice(0, KEEP)));
        return item;
    }
    history() { try { const l = JSON.parse(this.app.db.setting('perf_history', '[]')); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
    version() { try { return require('../package.json').version; } catch (e) { return ''; } }

    state() {
        this.ensure();
        const last = this.live[this.live.length - 1] || this.tick();
        return { now: last, live: this.live.map(s => ({ t: s.t, mem: s.mem, cpu: s.cpu, lag: s.lag, fps: s.fps })), rec: this.rec ? { label: this.rec.label, start: this.rec.start, n: this.rec.samples.length } : null,
            history: this.history(), sys: { mem_mb: Math.round(os.totalmem() / 1048576), cores: os.cpus().length, model: (os.cpus()[0] || {}).model || '', platform: process.platform }, electron: !!this.host.appMetrics, texts: { note: NOTE, rust: RUST, level: LEVEL } };
    }
    report(id) {
        const h = this.history().find(x => x.id === str(id)); if (!h) throw new UserError('Messung nicht gefunden.');
        return reportText(h, this.state().sys);
    }
    async action(act, input) {
        switch (act) {
            case 'perf_state': return this.state();
            case 'perf_start': this.startRec(input.label); return Object.assign(this.state(), { msg: '⏺ Messung läuft – nutze VRC Nexus und VRChat wie immer.' });
            case 'perf_stop': { const it = this.stopRec(); return Object.assign(this.state(), { result: it, msg: '⏹ Messung gespeichert.' }); }
            case 'perf_report': return { text: this.report(input.id) };
            case 'perf_delete': { this.app.db.setSetting('perf_history', JSON.stringify(this.history().filter(x => x.id !== str(input.id)))); return this.state(); }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

// ---------- Auswertung ----------
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const r1 = v => Math.round(v * 10) / 10;

function summarize(samples, totalMb, cores) {
    const S = samples.filter(Boolean);
    const mem = S.map(s => s.mem), cpu = S.map(s => s.cpu), lag = S.map(s => s.lag), fps = S.map(s => s.fps).filter(v => v > 0), vrc = S.map(s => s.vrc_mem).filter(v => v > 0);
    const kinds = {};
    for (const s of S) for (const [k, v] of Object.entries(s.procs || {})) { const b = kinds[k] = kinds[k] || { mem: [], cpu: [] }; b.mem.push(v.mem); b.cpu.push(v.cpu); }
    const procs = Object.fromEntries(Object.entries(kinds).map(([k, b]) => [k, { mem: Math.round(avg(b.mem)), cpu: r1(avg(b.cpu)) }]));
    const out = {
        samples: S.length, minutes: S.length ? Math.round((S[S.length - 1].t - S[0].t) / 6000) / 10 : 0, vr_share: S.length ? Math.round(S.filter(s => s.fps > 0).length / S.length * 100) : 0,
        mem: { avg: Math.round(avg(mem)), max: Math.max(0, ...mem), share: totalMb ? r1(avg(mem) / totalMb * 100) : 0, growth: S.length > 24 ? Math.round(avg(mem.slice(-12)) - avg(mem.slice(0, 12))) : 0 },
        cpu: { avg: r1(avg(cpu)), p95: r1(pct(cpu, 95)), max: r1(Math.max(0, ...cpu)), per_core: cores ? r1(avg(cpu) / cores) : 0 },
        lag: { avg: Math.round(avg(lag)), p95: Math.round(pct(lag, 95)), max: Math.max(0, ...lag), spikes: lag.filter(v => v > 100).length },
        fps: fps.length ? { avg: r1(avg(fps)), low: r1(pct(fps, 5)) } : null,
        vrchat_mem: vrc.length ? Math.round(avg(vrc)) : null, procs,
    };
    out.verdict = verdict(out);
    return out;
}
/** Einschätzung in Klartext: Stufe ok / mittel / hoch + Hinweise */
function verdict(o) {
    const notes = [];
    let level = 'ok';
    const up = l => { if (l === 'high' || (l === 'mid' && level === 'ok')) level = l; };
    if (o.mem.avg > 900 || o.mem.share > 8) { up('high'); notes.push('mem_high'); } else if (o.mem.avg > 500 || o.mem.share > 4) { up('mid'); notes.push('mem_mid'); }
    if (o.cpu.per_core > 3 || o.cpu.p95 > 40) { up('high'); notes.push('cpu_high'); } else if (o.cpu.per_core > 1 || o.cpu.p95 > 15) { up('mid'); notes.push('cpu_mid'); }
    if (o.lag.p95 > 250 || o.lag.spikes > o.samples / 10) { up('high'); notes.push('lag_high'); } else if (o.lag.p95 > 80) { up('mid'); notes.push('lag_mid'); }
    if (o.mem.growth > 150) { up('mid'); notes.push('mem_growth'); }
    if (o.vrchat_mem && o.mem.avg > o.vrchat_mem * 0.5) notes.push('vs_vrchat');
    if (o.samples < 24) notes.push('short');
    return { level, notes, rust: level === 'high' ? 'helper' : level === 'mid' ? 'tune' : 'no' };
}
const NOTE = {
    mem_high: 'Hoher Arbeitsspeicher – viele offene Bereiche/Fenster oder ein Leck möglich.', mem_mid: 'Arbeitsspeicher spürbar, aber im üblichen Rahmen einer Electron-App.',
    cpu_high: 'Hohe CPU-Last im Hintergrund – das kann in VR Frames kosten.', cpu_mid: 'Leichte CPU-Last im Hintergrund.',
    lag_high: 'Häufige Hänger im Backend (Verzögerung) – Aktionen reagieren dann träge.', lag_mid: 'Gelegentliche kurze Verzögerungen.',
    mem_growth: 'Der Speicher ist während der Messung deutlich gewachsen – bitte länger messen und Bericht schicken.',
    vs_vrchat: 'VRC Nexus braucht mehr als halb so viel Arbeitsspeicher wie VRChat.', short: 'Kurze Messung – für eine sichere Aussage mindestens 2 Minuten, besser eine ganze VR-Sitzung messen.',
};
const RUST = { no: 'Kein Handlungsbedarf – ein Umbau (z. B. auf Rust) würde hier kaum etwas bringen.', tune: 'Optimierungen in der App lohnen sich zuerst (Fenster schlafen legen, weniger Abfragen) – Rust erst danach prüfen.',
    helper: 'Deutlicher Bedarf: zeitkritische Teile in einen schlanken Helfer auslagern (z. B. Rust) und die App entlasten – Bericht bitte schicken.' };
const LEVEL = { ok: '🟢 unkritisch', mid: '🟡 merklich', high: '🔴 hoch' };

function reportText(h, sys) {
    const d = t => new Date(t).toLocaleString('de-DE');
    const L = ['📈 VRC Nexus – Leistungsmessung' + (h.label ? ' „' + h.label + '“' : ''), d(h.start) + ' – ' + d(h.end) + ' (' + h.minutes + ' min, ' + h.samples + ' Messpunkte, Version ' + h.version + ')',
        'System: ' + sys.cores + ' Kerne, ' + Math.round(sys.mem_mb / 1024) + ' GB RAM, ' + sys.platform + (sys.model ? ' · ' + sys.model.trim() : ''),
        '', 'Bewertung: ' + LEVEL[h.verdict.level],
        'Arbeitsspeicher: Ø ' + h.mem.avg + ' MB, Spitze ' + h.mem.max + ' MB (' + h.mem.share + ' % des RAM)' + (h.mem.growth ? ', Zuwachs ' + h.mem.growth + ' MB' : ''),
        'CPU: Ø ' + h.cpu.avg + ' % (≈ ' + h.cpu.per_core + ' % je Kern), 95 %: ' + h.cpu.p95 + ' %, Spitze ' + h.cpu.max + ' %',
        'Verzögerung: Ø ' + h.lag.avg + ' ms, 95 %: ' + h.lag.p95 + ' ms, Spitze ' + h.lag.max + ' ms, ' + h.lag.spikes + '× über 100 ms',
        h.fps ? 'VR: Ø ' + h.fps.avg + ' FPS, 5-%-Tief ' + h.fps.low + ' FPS (' + h.vr_share + ' % der Zeit in VR)' : 'VR: keine FPS-Daten (SteamVR-Helfer aus oder Desktop)',
        h.vrchat_mem ? 'VRChat zum Vergleich: Ø ' + h.vrchat_mem + ' MB' : '',
        'Prozesse: ' + Object.entries(h.procs).map(([k, v]) => k + ' ' + v.mem + ' MB / ' + v.cpu + ' %').join(' · '),
        '', ...h.verdict.notes.map(n => '• ' + NOTE[n]), '→ ' + RUST[h.verdict.rust]];
    return L.filter(x => x !== '').join('\n').replace(/\n\n+/g, '\n\n');
}

module.exports = { PerfMon, summarize, verdict, reportText, NOTE, RUST, LEVEL };
