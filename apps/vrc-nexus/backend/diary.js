'use strict';
/*
 * 8.0: 📔 Tages-Tagebuch – jeder Tag fasst sich selbst zusammen, dazu deine eigene Notiz.
 *   Automatisch (aus dem Spiel-Log): Welten mit Zeit, Leute, denen du begegnet bist, Fotos, Avatar-Wechsel, Videos, Spielzeit.
 *   Dazu: Puls des Tages (Min/Ø/Max, minütlich gesammelt, solange eine Pulsquelle läuft) und die VR-Pausen des Pausen-Coachs.
 *   Eigene Notiz + Stimmung + Favoriten-Markierung. Alles nur auf diesem Gerät; Export als Text/Markdown.
 */
const { str, int, cut, UserError } = require('./util');

const UID = 1;
const MOODS = ['😄', '🙂', '😐', '😕', '😢', '🥳', '😴', '🤯'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = n => String(n).padStart(2, '0');
/** lokales Datum „JJJJ-MM-TT“ */
const dayOf = (ms = Date.now()) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
/** Grenzen des lokalen Tages in Sekunden */
const bounds = day => { const [y, m, d] = day.split('-').map(Number); const a = new Date(y, m - 1, d).getTime(); return [Math.floor(a / 1000), Math.floor(new Date(y, m - 1, d + 1).getTime() / 1000)]; };

class Diary {
    constructor(app) {
        this.app = app;
        this.db.exec(`CREATE TABLE IF NOT EXISTS diary (user_id INTEGER NOT NULL, day TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT '', star INTEGER NOT NULL DEFAULT 0,
            hr_min INTEGER NOT NULL DEFAULT 0, hr_max INTEGER NOT NULL DEFAULT 0, hr_sum INTEGER NOT NULL DEFAULT 0, hr_n INTEGER NOT NULL DEFAULT 0,
            vr_min INTEGER NOT NULL DEFAULT 0, breaks INTEGER NOT NULL DEFAULT 0, longest INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day))`);
        this.timer = null;
    }
    get db() { return this.app.db; }
    start() { if (this.timer) return; this.timer = setInterval(() => { if (this.app.energy && this.app.energy.skip('diary', 60000)) return; try { this.tick(); } catch (e) { /* weiter */ } }, 60000); if (this.timer.unref) this.timer.unref(); }
    stop() { clearInterval(this.timer); this.timer = null; }

    row(day) {
        const r = this.db.prepare('SELECT * FROM diary WHERE user_id = ? AND day = ?').get(UID, day);
        if (r) return r;
        this.db.prepare('INSERT OR IGNORE INTO diary (user_id, day, updated) VALUES (?, ?, ?)').run(UID, day, Date.now());
        return this.db.prepare('SELECT * FROM diary WHERE user_id = ? AND day = ?').get(UID, day);
    }
    /** minütlich: Puls des Tages sammeln */
    tick(now = Date.now()) {
        const h = this.app.heart;
        if (!h || !h.active || !(h.bpm > 20 && h.bpm < 250)) return;
        const day = dayOf(now), r = this.row(day), b = Math.round(h.bpm);
        this.db.prepare('UPDATE diary SET hr_min = ?, hr_max = ?, hr_sum = hr_sum + ?, hr_n = hr_n + 1, updated = ? WHERE user_id = ? AND day = ?')
            .run(r.hr_n ? Math.min(r.hr_min, b) : b, Math.max(r.hr_max, b), b, now, UID, day);
    }
    /** vom Pausen-Coach: VR-Minuten, Pausen, längste Strecke */
    addVr(minutes, now = Date.now()) { const day = dayOf(now); this.row(day); this.db.prepare('UPDATE diary SET vr_min = vr_min + ?, updated = ? WHERE user_id = ? AND day = ?').run(Math.max(0, int(minutes)), now, UID, day); }
    addBreak(stretchMin, now = Date.now()) {
        const day = dayOf(now), r = this.row(day);
        this.db.prepare('UPDATE diary SET breaks = breaks + 1, longest = ?, updated = ? WHERE user_id = ? AND day = ?').run(Math.max(r.longest, int(stretchMin)), now, UID, day);
    }
    stretch(stretchMin, now = Date.now()) { const day = dayOf(now), r = this.row(day); if (int(stretchMin) > r.longest) this.db.prepare('UPDATE diary SET longest = ? WHERE user_id = ? AND day = ?').run(int(stretchMin), UID, day); }

    /** automatische Zusammenfassung eines Tages aus dem Spiel-Log */
    auto(day) {
        const [a, b] = bounds(day);
        const ev = this.db.prepare("SELECT ts, kind, world_id, world_name, player_id, player_name, detail FROM game_log WHERE user_id = ? AND ts >= ? AND ts < ? ORDER BY ts, id").all(UID, a, b);
        const me = (() => { try { const acc = this.app.vrc.account(); return acc && acc.me ? str(acc.me.displayName) : ''; } catch (e) { return ''; } })();
        const worlds = [], people = new Map(); let cur = null, shots = [], avatars = 0, videos = 0;
        const close = t => { if (cur) { cur.min = Math.max(0, Math.round((t - cur.t) / 60)); worlds.push(cur); cur = null; } };
        for (const e of ev) {
            if (e.kind === 'world_join') { close(e.ts); cur = { t: e.ts, id: e.world_id, name: e.world_name || e.world_id || '?' }; }
            else if (e.kind === 'world_leave' || e.kind === 'vrc_quit') close(e.ts);
            else if (e.kind === 'player_join' && e.player_name && e.player_name !== me) { const p = people.get(e.player_name) || { name: e.player_name, id: e.player_id, n: 0, first: e.ts }; p.n++; people.set(e.player_name, p); }
            else if (e.kind === 'screenshot') shots.push(e.detail);
            else if (e.kind === 'avatar') avatars++;
            else if (e.kind === 'video') videos++;
        }
        if (cur) close(Math.min(b, Math.floor(Date.now() / 1000)));
        // gleiche Welten zusammenfassen
        const byW = new Map();
        for (const w of worlds) { const k = w.id || w.name; const x = byW.get(k) || { id: w.id, name: w.name, min: 0, visits: 0, first: w.t }; x.min += w.min; x.visits++; byW.set(k, x); }
        return {
            worlds: [...byW.values()].sort((x, y) => y.min - x.min).slice(0, 30), people: [...people.values()].sort((x, y) => y.n - x.n || x.first - y.first).slice(0, 60),
            people_total: people.size, photos: shots.length, photo_files: shots.slice(-12), avatars, videos, play_min: worlds.reduce((s, w) => s + w.min, 0), events: ev.length,
        };
    }
    day(day) {
        if (!DAY_RE.test(str(day))) throw new UserError('Ungültiges Datum.');
        const r = this.db.prepare('SELECT * FROM diary WHERE user_id = ? AND day = ?').get(UID, day) || {};
        const priv = !!(this.app.nsfw && this.app.nsfw.private);
        const au = this.auto(day);
        if (priv) { au.photo_files = []; }   // Privat-Modus: keine Dateipfade anzeigen
        return { day, today: day === dayOf(), auto: au, note: str(r.note), mood: str(r.mood), star: !!r.star,
            hr: r.hr_n ? { min: r.hr_min, max: r.hr_max, avg: Math.round(r.hr_sum / r.hr_n), minutes: r.hr_n } : null,
            vr: { min: int(r.vr_min), breaks: int(r.breaks), longest: int(r.longest) }, moods: MOODS };
    }
    save(day, input) {
        if (!DAY_RE.test(str(day))) throw new UserError('Ungültiges Datum.');
        this.row(day);
        const mood = MOODS.includes(str(input.mood)) ? str(input.mood) : '';
        this.db.prepare('UPDATE diary SET note = ?, mood = ?, star = ?, updated = ? WHERE user_id = ? AND day = ?')
            .run(cut(str(input.note), 5000), mood, input.star === '1' || input.star === true || input.star === 1 ? 1 : 0, Date.now(), UID, day);
        return this.day(day);
    }
    /** Monatsübersicht: Tage mit Spiel-Log oder Notiz */
    month(ym) {
        const m = /^(\d{4})-(\d{2})$/.exec(str(ym)) || /^(\d{4})-(\d{2})/.exec(dayOf());
        const y = +m[1], mo = +m[2], first = dayOf(new Date(y, mo - 1, 1).getTime()), days = new Date(y, mo, 0).getDate();
        const [a] = bounds(first), b = Math.floor(new Date(y, mo, 1).getTime() / 1000);
        const act = {};
        for (const e of this.db.prepare("SELECT ts, kind FROM game_log WHERE user_id = ? AND ts >= ? AND ts < ? AND kind IN ('world_join', 'player_join', 'screenshot')").all(UID, a, b)) {
            const d = dayOf(e.ts * 1000), x = act[d] = act[d] || { worlds: 0, people: 0, photos: 0 };
            if (e.kind === 'world_join') x.worlds++; else if (e.kind === 'player_join') x.people++; else x.photos++;
        }
        const notes = {};
        for (const r of this.db.prepare("SELECT day, mood, star, note FROM diary WHERE user_id = ? AND day >= ? AND day <= ?").all(UID, first, first.slice(0, 8) + pad(days)))
            notes[r.day] = { mood: r.mood, star: !!r.star, note: !!str(r.note).trim() };
        const out = [];
        for (let d = 1; d <= days; d++) { const k = first.slice(0, 8) + pad(d); out.push(Object.assign({ day: k }, act[k] || { worlds: 0, people: 0, photos: 0 }, notes[k] || {})); }
        return { month: first.slice(0, 7), days: out, today: dayOf() };
    }
    text(day) {
        const d = this.day(day), a = d.auto;
        const L = ['# 📔 ' + new Date(day + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (d.mood ? ' ' + d.mood : '') + (d.star ? ' ⭐' : '')];
        if (d.note) L.push('', d.note);
        L.push('', '⏱ Spielzeit: ' + Math.floor(a.play_min / 60) + ' h ' + (a.play_min % 60) + ' min' + (d.vr.min ? ' · 🥽 VR ' + d.vr.min + ' min, ' + d.vr.breaks + ' Pausen' : ''));
        if (a.worlds.length) L.push('', '## 🌐 Welten', ...a.worlds.map(w => '- ' + w.name + ' (' + w.min + ' min' + (w.visits > 1 ? ', ' + w.visits + '×' : '') + ')'));
        if (a.people.length) L.push('', '## 👥 Begegnungen (' + a.people_total + ')', a.people.slice(0, 30).map(p => p.name).join(', '));
        const ex = [a.photos && '📸 ' + a.photos + ' Fotos', a.avatars && '🎭 ' + a.avatars + ' Avatar-Wechsel', a.videos && '🎬 ' + a.videos + ' Videos'].filter(Boolean);
        if (ex.length) L.push('', ex.join(' · '));
        if (d.hr) L.push('', '❤ Puls: Ø ' + d.hr.avg + ' · ' + d.hr.min + '–' + d.hr.max + ' bpm');
        return L.join('\n');
    }
    async action(act, input) {
        switch (act) {
            case 'diary_day': return this.day(str(input.day) || dayOf());
            case 'diary_save': return Object.assign(this.save(str(input.day) || dayOf(), input), { msg: '📔 Gespeichert.' });
            case 'diary_month': return this.month(input.month);
            case 'diary_text': return { text: this.text(str(input.day) || dayOf()) };
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { Diary, dayOf, bounds, MOODS };
