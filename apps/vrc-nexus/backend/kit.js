'use strict';
/*
 * 8.2: 🧰 Alltag (Werkzeuge) – acht kleine Helfer für PC und Handy, alles lokal auf diesem Gerät:
 *   • ⏰ Status-Timer: Status + Text für N Minuten (oder bis HH:MM), danach automatisch zurück – außer du hast ihn inzwischen selbst geändert
 *   • 🔔 Online-Erinnerung: „Wenn X online kommt, erinnere mich an …“ – einmalig, danach erledigt
 *   • 🕐 Ortszeit von Freunden: Zeitzone je Freund → aktuelle Uhrzeit dort, Hinweis „dort ist Nacht“
 *   • 📝 Notizblock: Notizen mit Checklisten („- [ ] …“), anheften, Farbe, Suche
 *   • 📆 Kalender-Export: Geburtstage (aus den Notizen) und Freundschaftstage als ICS (jährlich wiederkehrend)
 *   • ⏳ Spielzeit-Budget: Tages- und Wochenbudget mit sanftem Hinweis (aus dem Spiel-Log, sonst aus dem eigenen Online-Verlauf)
 *   • 🚦 VRChat-Serverstatus: Störungen von status.vrchat.com, optional Hinweis bei einer neuen Störung
 *   • 💬 Kontakt-Pflege: „bei X mal wieder melden“ – Abstand in Tagen, zuletzt gesehen aus dem Spiel-Log oder „✔ Kontakt gehabt“
 */
const { str, int, cut, arr, now, UserError } = require('./util');
const { BDAY } = require('./insights');

const UIDRE = /^usr_[0-9a-f-]{36}$/i;
const STATUSES = ['join me', 'active', 'ask me', 'busy'];
const STATUS_URL = () => process.env.NEXUS_VRC_STATUS_URL || 'https://status.vrchat.com/api/v2/summary.json';
/** Auswahl gängiger Zeitzonen (IANA) – reicht für die Auswahlliste, eigene Eingabe geht auch */
const ZONES = ['Europe/Berlin', 'Europe/London', 'Europe/Lisbon', 'Europe/Paris', 'Europe/Madrid', 'Europe/Rome', 'Europe/Warsaw', 'Europe/Helsinki', 'Europe/Athens', 'Europe/Istanbul', 'Europe/Moscow',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Buenos_Aires',
    'Pacific/Honolulu', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Manila', 'Asia/Seoul', 'Asia/Tokyo',
    'Australia/Perth', 'Australia/Adelaide', 'Australia/Sydney', 'Pacific/Auckland', 'Africa/Johannesburg', 'Africa/Cairo', 'Africa/Lagos', 'UTC'];
const DEF_BUDGET = { on: false, day_min: 180, week_min: 0, warn_pct: 80 };
const yes = v => v === true || v === '1' || v === 1 || v === 'true' || v === 'on';
const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

/** Ortszeit in einer Zeitzone (wirft bei unbekannter Zone) */
function zoneTime(tz, at = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
        .formatToParts(at).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
    const hour = int(p.hour) % 24, local = Date.UTC(int(p.year), int(p.month) - 1, int(p.day), hour, int(p.minute));
    const offset = Math.round((local - Math.floor(at.getTime() / 60000) * 60000) / 60000);   // Minuten gegenüber UTC
    return { time: pad(hour) + ':' + p.minute, hour, weekday: p.weekday, offset, night: hour < 7 || hour >= 23 };
}
function validZone(tz) { tz = str(tz).trim(); if (!tz) return ''; if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){0,2}$/.test(tz)) throw new UserError('Unbekannte Zeitzone.'); try { zoneTime(tz); } catch (e) { throw new UserError('Unbekannte Zeitzone.'); } return tz; }
/** Minuten-Text */
const hm = m => (m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') : m + ' min');
/** ICS-Text maskieren */
const icsEsc = s => str(s).replace(/[\\;,]/g, c => '\\' + c).replace(/\r?\n/g, '\\n');

class Kit {
    constructor(app) {
        this.app = app; this.statusCache = null; this.fetch = (...a) => fetch(...a);
        this.timer = null;
    }
    start() { if (this.timer) return; this.timer = setInterval(() => this.tick().catch(() => {}), 30000); if (this.timer.unref) this.timer.unref(); }
    stop() { clearInterval(this.timer); this.timer = null; }
    get db() { return this.app.db; }
    load(k, def) { try { const v = JSON.parse(this.db.setting('kit_' + k, '')); return v === null || v === undefined ? def : v; } catch (e) { return def; } }
    store(k, v) { this.db.setSetting('kit_' + k, JSON.stringify(v)); }
    alert(title, body, meta) { if (this.app.tools && this.app.tools.alert) this.app.tools.alert(title, body, '', meta || null); }
    friend(uid) { try { return this.db.prepare('SELECT vrc_id, display_name, state FROM friends WHERE user_id = 1 AND vrc_id = ?').get(uid) || null; } catch (e) { return null; } }
    friends() { try { return this.db.prepare('SELECT vrc_id, display_name, state FROM friends WHERE user_id = 1').all(); } catch (e) { return []; } }
    me() { const a = this.app.vrc && this.app.vrc.account(); return a ? a.me || {} : null; }

    // ---------- ⏰ Status-Timer ----------
    statusState() {
        const s = this.load('status', null);
        return s && s.until > now() ? Object.assign({}, s, { left_min: Math.max(1, Math.ceil((s.until - now()) / 60)) }) : null;
    }
    async statusStart(input) {
        const me = this.me(); if (!me) throw new UserError('Erst bei VRChat anmelden.');
        const status = str(input.status); if (!STATUSES.includes(status)) throw new UserError('Ungültiger Status.');
        let until;
        const m = /^(\d{1,2}):(\d{2})$/.exec(str(input.until).trim());
        if (m) { const d = new Date(); d.setHours(int(m[1]) % 24, int(m[2]) % 60, 0, 0); if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); until = Math.floor(d.getTime() / 1000); }
        else { const min = Math.max(5, Math.min(720, int(input.minutes) || 30)); until = now() + min * 60; }
        if (until - now() > 24 * 3600) throw new UserError('Höchstens 24 Stunden.');
        const end = new Date(until * 1000), zeit = pad(end.getHours()) + ':' + pad(end.getMinutes());
        const desc = cut(str(input.desc).replace(/\{zeit\}/g, zeit).trim(), 32);
        const old = this.load('status', null);
        const prev = old && old.until > now() ? old.prev : { status: STATUSES.includes(str(me.status)) ? str(me.status) : 'active', desc: cut(str(me.statusDescription), 32) };
        await this.app.post({ act: 'status', status, desc }, {});
        const s = { until, prev, set: { status, desc } };
        this.store('status', s);
        return s;
    }
    async statusRestore(force) {
        const s = this.load('status', null); if (!s) return null;
        this.store('status', null);
        const me = this.me() || {};
        // selbst geändert? → nicht überschreiben (Nexus hat den Status nach dem Setzen noch nicht abgeglichen = gilt als unverändert)
        const changed = me.status && (str(me.status) !== s.set.status || cut(str(me.statusDescription), 32) !== s.set.desc) && (str(me.status) !== s.prev.status || cut(str(me.statusDescription), 32) !== s.prev.desc);
        if (changed && !force) return { skipped: true };
        await this.app.post({ act: 'status', status: s.prev.status, desc: s.prev.desc }, {});
        return { restored: s.prev };
    }

    // ---------- 🔔 Online-Erinnerung ----------
    reminders() { return arr(this.load('remind', [])); }
    remindAdd(input) {
        const uid = str(input.uid).trim().replace(/^.*\/(usr_[0-9a-f-]{36}).*$/i, '$1');
        if (!UIDRE.test(uid)) throw new UserError('Bitte einen Freund auswählen (usr_…).');
        const text = cut(str(input.text).trim(), 200);
        if (!text) throw new UserError('Woran soll ich dich erinnern?');
        const f = this.friend(uid), list = this.reminders();
        if (list.length >= 50) throw new UserError('Höchstens 50 Erinnerungen.');
        list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), uid, name: cut(str(input.name) || (f && f.display_name) || uid.slice(0, 12), 40), text, created: now(), wait_offline: !!(f && f.state !== 'offline') && !yes(input.now) });
        this.store('remind', list);
        return list;
    }
    checkReminders() {
        const list = this.reminders(); if (!list.length) return [];
        const fired = [], keep = [];
        let changed = false;
        for (const r of list) {
            const f = this.friend(r.uid), on = !!(f && f.state && f.state !== 'offline');
            if (r.wait_offline) { if (!on) { r.wait_offline = false; changed = true; } keep.push(r); continue; }   // war beim Anlegen schon online → erst beim nächsten Mal
            if (on) { fired.push(r); this.alert('🔔 ' + ((f && f.display_name) || r.name) + ' ist online', r.text, { uid: r.uid }); } else keep.push(r);
        }
        if (fired.length) { this.store('remind', keep); const done = arr(this.load('remind_done', [])); this.store('remind_done', fired.map(r => Object.assign(r, { fired: now() })).concat(done).slice(0, 20)); }
        else if (changed) this.store('remind', keep);
        return fired;
    }

    // ---------- 🕐 Ortszeit ----------
    zones() { return Object.assign({}, this.load('tz', {})); }
    tzSet(input) {
        const uid = str(input.uid).trim(); if (!UIDRE.test(uid)) throw new UserError('Bitte einen Freund auswählen (usr_…).');
        const tz = validZone(input.tz), z = this.zones();
        if (tz) z[uid] = tz; else delete z[uid];
        if (Object.keys(z).length > 500) throw new UserError('Höchstens 500 Einträge.');
        this.store('tz', z);
        return z;
    }
    tzList(at = new Date()) {
        const z = this.zones(), names = Object.fromEntries(this.friends().map(f => [f.vrc_id, f]));
        let mine = 0; try { mine = -at.getTimezoneOffset(); } catch (e) { /* egal */ }
        return Object.entries(z).map(([uid, tz]) => { let t = null; try { t = zoneTime(tz, at); } catch (e) { return null; }
            const f = names[uid]; return Object.assign({ uid, tz, name: f ? f.display_name : uid.slice(0, 12) + '…', state: f ? f.state : 'offline', diff_h: Math.round((t.offset - mine) / 6) / 10 }, t); })
            .filter(Boolean).sort((a, b) => a.offset - b.offset || a.name.localeCompare(b.name));
    }

    // ---------- 📝 Notizblock ----------
    notes() { return arr(this.load('notes', [])); }
    noteSave(input) {
        const list = this.notes(), id = str(input.id);
        const text = cut(str(input.text), 10000), title = cut(str(input.title).trim(), 80);
        if (!text.trim() && !title) throw new UserError('Die Notiz ist leer.');
        const color = ['', 'gold', 'green', 'blue', 'pink', 'red'].includes(str(input.color)) ? str(input.color) : '';
        let n = list.find(x => x.id === id);
        if (!n) { if (list.length >= 200) throw new UserError('Höchstens 200 Notizen.'); n = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), created: now(), pin: false }; list.push(n); }
        Object.assign(n, { title, text, color, updated: now() });
        if (input.pin !== undefined) n.pin = yes(input.pin);
        this.store('notes', list);
        return n;
    }
    noteToggle(id, line) {
        const list = this.notes(), n = list.find(x => x.id === str(id)); if (!n) throw new UserError('Notiz nicht gefunden.');
        const lines = n.text.split('\n'), i = int(line);
        if (!/^\s*[-*] \[[ xX]\]/.test(lines[i] || '')) throw new UserError('Diese Zeile ist kein Kästchen.');
        lines[i] = lines[i].replace(/\[([ xX])\]/, (m, c) => (c === ' ' ? '[x]' : '[ ]'));
        n.text = lines.join('\n'); n.updated = now();
        this.store('notes', list);
        return n;
    }
    noteView(q) {
        q = str(q).trim().toLowerCase();
        return this.notes().filter(n => !q || (n.title + '\n' + n.text).toLowerCase().includes(q)).map(n => {
            const boxes = n.text.split('\n').filter(l => /^\s*[-*] \[[ xX]\]/.test(l));
            return Object.assign({}, n, { todo: boxes.length, done: boxes.filter(l => /\[[xX]\]/.test(l)).length });
        }).sort((a, b) => (b.pin - a.pin) || b.updated - a.updated);
    }

    // ---------- 📆 Kalender-Export ----------
    calendarEvents() {
        let fr = [];
        try { fr = this.app.vrc.friendList(); } catch (e) { fr = []; }
        const out = [];
        for (const f of fr) {
            const b = BDAY.exec(f.note || '');
            if (b && int(b[2]) >= 1 && int(b[2]) <= 12 && int(b[1]) >= 1 && int(b[1]) <= 31) out.push({ uid: f.id, kind: 'birthday', month: int(b[2]), day: int(b[1]), name: f.name });
            if (f.friend_since > 0) { const s = new Date(f.friend_since * 1000); out.push({ uid: f.id, kind: 'friend', month: s.getMonth() + 1, day: s.getDate(), year: s.getFullYear(), name: f.name }); }
        }
        return out.sort((a, b) => a.month - b.month || a.day - b.day);
    }
    ics(stamp = new Date()) {
        const ds = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GhostNode//VRC Nexus//DE', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:VRC Nexus – Geburtstage & Freundschaftstage'];
        for (const e of this.calendarEvents()) {
            const y = e.kind === 'friend' ? e.year + 1 : stamp.getFullYear(), start = y + pad(e.month) + pad(e.day);
            const nd = new Date(Date.UTC(y, e.month - 1, e.day + 1)), end = nd.getUTCFullYear() + pad(nd.getUTCMonth() + 1) + pad(nd.getUTCDate());
            lines.push('BEGIN:VEVENT', 'UID:' + e.kind + '-' + e.uid + '@vrc-nexus', 'DTSTAMP:' + ds, 'DTSTART;VALUE=DATE:' + start, 'DTEND;VALUE=DATE:' + end, 'RRULE:FREQ=YEARLY',
                'SUMMARY:' + icsEsc(e.kind === 'birthday' ? '🎂 ' + e.name + ' hat Geburtstag' : '💛 Freundschaftstag mit ' + e.name + ' (seit ' + e.year + ')'), 'TRANSP:TRANSPARENT', 'END:VEVENT');
        }
        lines.push('END:VCALENDAR');
        return lines.map(l => { let o = ''; while (l.length > 74) { o += l.slice(0, 74) + '\r\n '; l = l.slice(74); } return o + l; }).join('\r\n') + '\r\n';
    }

    // ---------- ⏳ Spielzeit-Budget ----------
    budgetCfg() { return Object.assign({}, DEF_BUDGET, this.load('budget', {})); }
    budgetSave(input) {
        const c = this.budgetCfg();
        if (input.on !== undefined) c.on = yes(input.on);
        if (input.day_min !== undefined) c.day_min = Math.max(0, Math.min(1440, int(input.day_min)));
        if (input.week_min !== undefined) c.week_min = Math.max(0, Math.min(10080, int(input.week_min)));
        if (input.warn_pct !== undefined) c.warn_pct = Math.max(50, Math.min(95, int(input.warn_pct)));
        this.store('budget', c);
        return c;
    }
    /** gespielte Minuten seit „from“ (Sekunden) – Spiel-Log (PC) oder eigener Online-Verlauf (Handy) */
    playedSince(from, t = now()) {
        let sec = 0, src = 'none';
        try {
            const g = this.app.game, days = Math.ceil((t - from) / 86400) + 1;
            const v = g && g.visits ? g.visits(days) : [];
            if (v.length) { src = 'log'; for (const x of v) { const s = Math.max(from, x.start), e = Math.min(t, x.end || t); if (e > s) sec += e - s; } }
        } catch (e) { /* ohne Spiel-Log */ }
        if (src === 'none') {
            try {
                const rows = this.db.prepare("SELECT ts, new FROM feed WHERE user_id = 1 AND type = 'self' AND ts >= ? ORDER BY ts, id").all(from);
                const before = this.db.prepare("SELECT new FROM feed WHERE user_id = 1 AND type = 'self' AND ts < ? ORDER BY ts DESC, id DESC LIMIT 1").value(from);
                if (rows.length || before != null) {
                    src = 'feed';
                    let on = before != null && before !== 'offline', at = from;
                    for (const r of rows) { if (on) sec += r.ts - at; on = r.new !== 'offline'; at = r.ts; }
                    if (on) sec += t - at;
                }
            } catch (e) { /* egal */ }
        }
        return { min: Math.round(sec / 60), src };
    }
    budgetState(at = new Date()) {
        const c = this.budgetCfg(), d0 = new Date(at); d0.setHours(0, 0, 0, 0);
        const w0 = new Date(d0); w0.setDate(w0.getDate() - ((w0.getDay() + 6) % 7));
        const t = Math.floor(at.getTime() / 1000), day = this.playedSince(Math.floor(d0.getTime() / 1000), t), week = this.playedSince(Math.floor(w0.getTime() / 1000), t);
        const pct = (m, lim) => (lim ? Math.round(m / lim * 100) : 0);
        return { cfg: c, today: day.min, week: week.min, src: day.src, day_pct: pct(day.min, c.day_min), week_pct: pct(week.min, c.week_min) };
    }
    checkBudget(at = new Date()) {
        const c = this.budgetCfg(); if (!c.on) return '';
        const s = this.budgetState(at), seen = this.load('budget_seen', {}), k = dayKey(at);
        const lvl = p => (p >= 100 ? 2 : p >= c.warn_pct ? 1 : 0);
        const dl = c.day_min ? lvl(s.day_pct) : 0, wl = c.week_min ? lvl(s.week_pct) : 0, best = Math.max(dl, wl);
        if (!best || (seen.day === k && seen.lvl >= best)) return '';
        this.store('budget_seen', { day: k, lvl: best });
        const what = dl >= wl ? 'Heute ' + hm(s.today) + ' von ' + hm(c.day_min) : 'Diese Woche ' + hm(s.week) + ' von ' + hm(c.week_min);
        this.alert(best === 2 ? '⏳ Spielzeit-Budget erreicht' : '⏳ Spielzeit-Budget fast erreicht', what + (best === 2 ? ' – vielleicht Zeit für eine Pause 💙' : '.'));
        return best === 2 ? 'full' : 'warn';
    }

    // ---------- 🚦 VRChat-Serverstatus ----------
    statusCfg() { return Object.assign({ notify: false }, this.load('vrcstatus', {})); }
    async vrcStatus(force) {
        if (!force && this.statusCache && Date.now() - this.statusCache.at < 120000) return this.statusCache.data;
        let r;
        try { r = await this.fetch(STATUS_URL(), { headers: { Accept: 'application/json' }, signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined }); }
        catch (e) { throw new UserError('VRChat-Status nicht erreichbar.'); }
        if (!r.ok) throw new UserError('VRChat-Status nicht erreichbar (HTTP ' + r.status + ').');
        let j; try { j = await r.json(); } catch (e) { throw new UserError('VRChat-Status: unerwartete Antwort.'); }
        const ind = ['none', 'minor', 'major', 'critical', 'maintenance'].includes(str(j.status && j.status.indicator)) ? j.status.indicator : 'none';
        const data = { indicator: ind, text: cut(str(j.status && j.status.description), 120), updated: cut(str(j.page && j.page.updated_at), 40),
            components: arr(j.components).filter(c => c && !c.group && c.name).slice(0, 30).map(c => ({ name: cut(str(c.name), 60), status: cut(str(c.status), 30) })),
            incidents: arr(j.incidents).slice(0, 5).map(i => ({ name: cut(str(i.name), 140), status: cut(str(i.status), 30), impact: cut(str(i.impact), 20), updated: cut(str(i.updated_at), 40),
                link: /^https:\/\/(stspg\.io|status\.vrchat\.com)\//.test(str(i.shortlink)) ? str(i.shortlink) : '' })) };
        this.statusCache = { at: Date.now(), data };
        return data;
    }
    async checkVrcStatus() {
        if (!this.statusCfg().notify) return '';
        const d = await this.vrcStatus(true), last = this.load('vrcstatus_last', 'none');
        if (d.indicator !== last) {
            this.store('vrcstatus_last', d.indicator);
            if (d.indicator !== 'none' && d.indicator !== 'maintenance') { this.alert('🚦 VRChat-Störung', d.incidents[0] ? d.incidents[0].name : d.text); return 'alert'; }
            if (last !== 'none' && d.indicator === 'none') { this.alert('🚦 VRChat läuft wieder', d.text); return 'ok'; }
        }
        return '';
    }

    // ---------- 💬 Kontakt-Pflege ----------
    care() { return Object.assign({}, this.load('care', {})); }
    careSet(input) {
        const uid = str(input.uid).trim(); if (!UIDRE.test(uid)) throw new UserError('Bitte einen Freund auswählen (usr_…).');
        const c = this.care(), days = int(input.days);
        if (days <= 0) delete c[uid];
        else { if (!c[uid] && Object.keys(c).length >= 200) throw new UserError('Höchstens 200 Kontakte.'); c[uid] = Object.assign({ done: 0 }, c[uid] || {}, { days: Math.min(365, days) }); }
        this.store('care', c);
        return c;
    }
    careDone(uid) { const c = this.care(); if (!c[str(uid)]) throw new UserError('Nicht in der Kontakt-Pflege.'); c[str(uid)].done = now(); this.store('care', c); return c; }
    careList(t = now()) {
        const c = this.care(), names = Object.fromEntries(this.friends().map(f => [f.vrc_id, f]));
        let met = () => 0;
        try { const q = this.db.prepare("SELECT MAX(ts) FROM game_log WHERE user_id = 1 AND kind = 'player_join' AND player_id = ?"); met = uid => int(q.value(uid)); } catch (e) { /* ohne Spiel-Log */ }
        return Object.entries(c).map(([uid, x]) => {
            const seen = met(uid), last = Math.max(int(x.done), seen), due = last ? last + x.days * 86400 : 0;
            return { uid, name: names[uid] ? names[uid].display_name : uid.slice(0, 12) + '…', state: names[uid] ? names[uid].state : 'offline', days: x.days, last, via: seen >= int(x.done) && seen ? 'game' : x.done ? 'manual' : '',
                due_in: due ? Math.ceil((due - t) / 86400) : 0, due: !last || due <= t };
        }).sort((a, b) => (b.due - a.due) || a.due_in - b.due_in);
    }
    checkCare(at = new Date()) {
        const k = dayKey(at);
        if (this.load('care_day', '') === k || at.getHours() < 10) return 0;
        const due = this.careList(Math.floor(at.getTime() / 1000)).filter(x => x.due);
        this.store('care_day', k);
        if (due.length) this.alert('💬 Kontakt-Pflege', due.length === 1 ? 'Melde dich mal wieder bei ' + due[0].name + '.' : 'Melde dich mal wieder bei ' + due.slice(0, 3).map(x => x.name).join(', ') + (due.length > 3 ? ' und ' + (due.length - 3) + ' weiteren' : '') + '.');
        return due.length;
    }

    async tick() {
        const s = this.load('status', null);
        if (s && s.until <= now()) await this.statusRestore(false).catch(() => {});
        this.checkReminders();
        this.checkBudget();
        this.checkCare();
        if (!this.lastNet || Date.now() - this.lastNet > 600000) { this.lastNet = Date.now(); await this.checkVrcStatus().catch(() => {}); }
    }
    friendPick() { return this.friends().map(f => ({ id: f.vrc_id, name: f.display_name, state: f.state })).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 3000); }

    async action(act, input) {
        switch (act) {
            case 'kit_overview': {   // alles für die Werkzeug-Kacheln auf einen Blick (ohne Netz)
                const b = this.budgetState();
                return { status: this.statusState(), reminders: this.reminders().length, tz: Object.keys(this.zones()).length, notes: this.notes().length,
                    budget: b.cfg.on ? { today: b.today, day_pct: b.day_pct } : null, care_due: this.careList().filter(x => x.due).length, events: this.calendarEvents().length };
            }
            case 'kit_friends': return { friends: this.friendPick() };
            case 'kit_status': return { status: this.statusState(), statuses: STATUSES };
            case 'kit_status_start': { const s = await this.statusStart(input); return { status: this.statusState(), msg: '⏰ Bis ' + new Date(s.until * 1000).toTimeString().slice(0, 5) + ' – danach geht der Status zurück.' }; }
            case 'kit_status_cancel': { const r = yes(input.restore) ? await this.statusRestore(true) : (this.store('status', null), null); return { status: null, msg: r ? '↩ Status zurückgesetzt.' : 'Status-Timer aus.' }; }
            case 'kit_remind_list': return { reminders: this.reminders(), done: arr(this.load('remind_done', [])) };
            case 'kit_remind_add': return { reminders: this.remindAdd(input), done: arr(this.load('remind_done', [])), msg: '🔔 Erinnerung gespeichert.' };
            case 'kit_remind_del': { this.store('remind', this.reminders().filter(r => r.id !== str(input.id))); return { reminders: this.reminders(), done: arr(this.load('remind_done', [])) }; }
            case 'kit_tz_list': return { list: this.tzList(), zones: ZONES };
            case 'kit_tz_set': this.tzSet(input); return { list: this.tzList(), zones: ZONES, msg: '🕐 Gespeichert.' };
            case 'kit_notes': return { notes: this.noteView(input.q) };
            case 'kit_note_save': { const n = this.noteSave(input); return { note: n, notes: this.noteView(''), msg: '📝 Gespeichert.' }; }
            case 'kit_note_toggle': this.noteToggle(input.id, input.line); return { notes: this.noteView(input.q) };
            case 'kit_note_del': this.store('notes', this.notes().filter(n => n.id !== str(input.id))); return { notes: this.noteView(input.q) };
            case 'kit_calendar': return { events: this.calendarEvents() };
            case 'kit_ics': return { ics: this.ics(), name: 'vrc-nexus-geburtstage.ics' };
            case 'kit_budget': return this.budgetState();
            case 'kit_budget_cfg': this.budgetSave(input); return Object.assign(this.budgetState(), { msg: '⏳ Gespeichert.' });
            case 'kit_vrcstatus': return Object.assign({ cfg: this.statusCfg() }, await this.vrcStatus(yes(input.force)));
            case 'kit_vrcstatus_cfg': { const c = { notify: yes(input.notify) }; this.store('vrcstatus', c); return { cfg: c, msg: c.notify ? '🚦 Du bekommst einen Hinweis bei Störungen.' : '🚦 Keine Hinweise.' }; }
            case 'kit_care': return { list: this.careList() };
            case 'kit_care_set': this.careSet(input); return { list: this.careList(), msg: '💬 Gespeichert.' };
            case 'kit_care_done': this.careDone(input.uid); return { list: this.careList(), msg: '✔ Vermerkt.' };
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Kit, zoneTime, validZone, ZONES };
