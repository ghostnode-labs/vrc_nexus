'use strict';
/*
 * 7.1 „Gemeinsam“ – Treffen mit Freunden planen und erleben (alles lokal, nichts auf fremden Servern):
 *   Freundes-Gruppen (mit Online-Stand und Sammel-Einladung), Event-Planer mit Erinnerung (PC, Uhr, Handy),
 *   Erinnerung an zugesagte Club-Events (7.0), Chatbox-Umfragen, Mini-Spiele für Treffen,
 *   Event-Modus (Status, Chatbox, Meldungen stumm – danach alles wie vorher) und Abzeichen aus echter Spielzeit.
 */
const crypto = require('crypto');
const { str, int, cut, now, UserError } = require('./util');

const MAX_GROUPS = 30, MAX_MEMBERS = 100, MAX_PLANS = 200;
const QUIZ = [
    ['Wie viele Sekunden hat ein Tag?', '86.400'], ['Welcher Planet ist der größte im Sonnensystem?', 'Jupiter'],
    ['Wie viele Beine hat eine Spinne?', 'Acht'], ['Welche Farbe entsteht aus Blau und Gelb?', 'Grün'],
    ['Wie heißt die Hauptstadt von Japan?', 'Tokio'], ['Wie viele Saiten hat eine normale Gitarre?', 'Sechs'],
    ['Was ist H₂O?', 'Wasser'], ['In welchem Jahr landeten Menschen zuerst auf dem Mond?', '1969'],
    ['Wie viele Kontinente gibt es?', 'Sieben'], ['Welches Tier ist das größte der Welt?', 'Blauwal'],
    ['Wie viele Minuten hat eine Stunde?', '60'], ['Welches Metall ist bei Zimmertemperatur flüssig?', 'Quecksilber'],
    ['Wie viele Spieler hat eine Fußballmannschaft auf dem Feld?', 'Elf'], ['Was misst ein Thermometer?', 'Temperatur'],
    ['Welche Zahl ist die kleinste Primzahl?', 'Zwei'], ['Wie heißt der längste Fluss Europas?', 'Wolga'],
];
const TRUTH = ['Welche Welt hat dich zuletzt richtig beeindruckt?', 'Was war dein peinlichster VR-Moment?', 'Welchen Avatar würdest du nie wieder tragen?',
    'Mit wem hier würdest du gern mal eine Welt bauen?', 'Was ist dein liebster Snack beim Spielen?', 'Welches Lied geht dir gerade nicht aus dem Kopf?',
    'Was war dein erster Eindruck von VRChat?', 'Welche Fähigkeit hättest du gern im echten Leben?'];
const DARE = ['Mach 10 Sekunden lang deinen besten Tanz!', 'Sprich die nächste Runde mit Akzent.', 'Erzähl einen Witz – auch wenn er schlecht ist.',
    'Wechsel für eine Runde in einen lustigen Avatar.', 'Mach ein Gruppenfoto mit allen hier.', 'Sing eine Zeile aus deinem Lieblingslied.',
    'Mach das Geräusch deines Lieblingstiers.', 'Mach ein Kompliment an die Person links von dir.'];
const BINGO = ['Jemand ist AFK', 'Mikrofon-Echo', 'Spiegel-Treffen', 'Jemand fällt durch den Boden', 'Avatar zu groß', '„Kannst du mich hören?“', 'Pen-Zeichnung',
    'Jemand lädt noch', 'Neuer Freund', 'Gruppenfoto', 'Tanzende Gruppe', 'Jemand schläft ein', 'Portal-Chaos', 'Musik zu laut', 'Kopfpat', 'Jemand ist ein Fuchs'];

class Together {
    constructor(app) {
        this.app = app;
        this.timer = null;
        this.clubAt = 0;
        this.clubSeen = new Set();
        this.badgeCache = null;
    }
    start() { if (this.timer) return; this.timer = setInterval(() => { this.tick().catch(() => {}); }, 60000); if (this.timer.unref) this.timer.unref(); }
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

    load() {
        let d = {};
        try { d = JSON.parse(this.app.db.setting('together', '{}')) || {}; } catch (e) { d = {}; }
        return Object.assign({ groups: [], plans: [], poll: null, event: null, stats: { events: 0, event_min: 0, polls: 0, games: 0, invites: 0, plans: 0 } }, d);
    }
    save(d) { this.app.db.setSetting('together', JSON.stringify(d)); }
    newId() { return Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }

    friends() { try { return this.app.vrc.friendList(); } catch (e) { return []; } }

    // ---------- Freundes-Gruppen ----------
    groups() {
        const fl = new Map(this.friends().map(f => [f.id, f]));
        return this.load().groups.map(g => {
            const members = g.ids.map(id => { const f = fl.get(id); return { id, name: f ? f.name : id, state: f ? f.state : 'offline', world: f && f.loc && f.loc.kind === 'world' ? str(f.loc.world_name) : '' }; });
            return Object.assign({}, g, { members, in_game: members.filter(m => m.state === 'online').length, online: members.filter(m => m.state !== 'offline').length });
        });
    }
    groupSave(input) {
        const d = this.load();
        const name = cut(str(input.name).trim(), 40);
        if (name.length < 2) throw new UserError('Name der Gruppe: mindestens 2 Zeichen.');
        let ids = input.ids;
        if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch (e) { ids = ids.split(','); } }
        ids = [...new Set((Array.isArray(ids) ? ids : []).map(x => str(x).trim()).filter(x => /^usr_[0-9a-f-]{8,40}$/i.test(x)))].slice(0, MAX_MEMBERS);
        const g = { id: str(input.id) || this.newId(), name, emoji: cut(str(input.emoji) || '👥', 4), ids };
        const i = d.groups.findIndex(x => x.id === g.id);
        if (i >= 0) d.groups[i] = g; else { if (d.groups.length >= MAX_GROUPS) throw new UserError('Höchstens ' + MAX_GROUPS + ' Gruppen.'); d.groups.push(g); }
        this.save(d);
        return { msg: 'Gruppe gespeichert.', groups: this.groups() };
    }
    groupDelete(id) { const d = this.load(); d.groups = d.groups.filter(g => g.id !== str(id)); this.save(d); return { msg: 'Gruppe gelöscht.', groups: this.groups() }; }
    /** alle Mitglieder einladen, die gerade im Spiel sind (Sammel-Einladung in deine Instanz) */
    async groupInvite(id, onlyInGame = true) {
        const g = this.groups().find(x => x.id === str(id));
        if (!g) throw new UserError('Gruppe nicht gefunden.');
        const ids = g.members.filter(m => (onlyInGame ? m.state === 'online' : m.state !== 'offline')).map(m => m.id).slice(0, 25);
        if (!ids.length) throw new UserError('Gerade ist niemand aus „' + g.name + '“ im Spiel.');
        const r = await this.app.post({ act: 'invite_many', ids }, {});
        const d = this.load(); d.stats.invites += ids.length; this.save(d);
        return r;
    }

    // ---------- Event-Planer ----------
    plans() {
        const t = now(), gs = new Map(this.load().groups.map(g => [g.id, g]));
        return this.load().plans.filter(p => p.when > t - 7 * 86400).sort((a, b) => a.when - b.when)
            .map(p => Object.assign({}, p, { group_name: gs.get(p.group) ? gs.get(p.group).emoji + ' ' + gs.get(p.group).name : '', past: p.when + 3 * 3600 < t }));
    }
    planSave(input) {
        const d = this.load();
        const title = cut(str(input.title).trim(), 80);
        if (title.length < 2) throw new UserError('Titel: mindestens 2 Zeichen.');
        const when = int(input.when) || Math.floor(Date.parse(str(input.when)) / 1000) || 0;
        if (!when || when < now() - 3600) throw new UserError('Bitte einen Zeitpunkt in der Zukunft wählen.');
        const remind = [0, 5, 15, 30, 60, 1440].includes(int(input.remind)) ? int(input.remind) : 15;
        const p = { id: str(input.id) || this.newId(), title, when, place: cut(str(input.place), 120), note: cut(str(input.note), 500), group: str(input.group), remind, reminded: false };
        const i = d.plans.findIndex(x => x.id === p.id);
        if (i >= 0) d.plans[i] = p; else { d.plans.push(p); d.stats.plans++; }
        d.plans = d.plans.filter(x => x.when > now() - 30 * 86400).slice(-MAX_PLANS);
        this.save(d);
        return { msg: '🗓 Treffen gespeichert.', plans: this.plans() };
    }
    planDelete(id) { const d = this.load(); d.plans = d.plans.filter(p => p.id !== str(id)); this.save(d); return { msg: 'Treffen gelöscht.', plans: this.plans() }; }
    /** Treffen als Text (zum Teilen im Chat/Discord) */
    planText(id) {
        const p = this.plans().find(x => x.id === str(id));
        if (!p) throw new UserError('Treffen nicht gefunden.');
        const dt = new Date(p.when * 1000);
        return { text: '🗓 ' + p.title + '\n🕒 ' + dt.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (p.place ? '\n📍 ' + p.place : '') + (p.note ? '\n📝 ' + p.note : '') };
    }

    /** jede Minute: eigene Treffen und zugesagte Club-Events erinnern */
    async tick(t = now()) {
        const d = this.load();
        let changed = false;
        for (const p of d.plans) {
            if (p.reminded || !p.remind) continue;
            if (t >= p.when - p.remind * 60 && t < p.when + 1800) {
                p.reminded = true; changed = true;
                const left = Math.max(0, Math.round((p.when - t) / 60));
                this.alert('⏰ ' + p.title, (left ? 'in ' + left + ' min' : 'jetzt') + (p.place ? ' · ' + p.place : ''));
            }
        }
        if (d.event && d.event.on) { d.stats.event_min++; changed = true; }
        if (changed) this.save(d);
        // 7.0-Nachtrag: zugesagte Club-Events (alle 10 Minuten nachsehen, 15 Minuten vorher melden)
        if (this.app.comm && t - this.clubAt >= 600 && this.app.account && this.app.account.current && this.app.account.current()) {
            this.clubAt = t;
            try {
                const cal = await this.app.comm.club('calendar', { data: JSON.stringify({ days: 1 }) });
                for (const e of (cal.items || [])) {
                    if (e.mine !== 'going' || this.clubSeen.has(e.id)) continue;
                    if (e.starts - t <= 15 * 60 + 600 && e.starts > t - 300) {
                        this.clubSeen.add(e.id);
                        this.alert('🏠 ' + str(e.title), 'Club-Event ' + (e.starts > t ? 'in ' + Math.max(1, Math.round((e.starts - t) / 60)) + ' min' : 'beginnt jetzt') + (e.club ? ' · ' + str(e.club.name) : '') + (e.place ? ' · ' + str(e.place) : ''));
                    }
                }
            } catch (e) { /* offline oder kein Konto – nächstes Mal */ }
        }
    }
    alert(title, body) { if (this.app.tools && this.app.tools.alert) this.app.tools.alert(title, body); }

    // ---------- Chatbox-Umfrage ----------
    async chat(text) {
        const g = this.app.game;
        if (!g || !g.oscSend) throw new UserError('Chatbox ist hier nicht verfügbar.');
        await g.oscSend('chatbox', { text: cut(text, 144), sound: '', split: '' });
    }
    pollText(p) { return '📊 ' + p.q + ' ' + p.options.map((o, i) => (i + 1) + ') ' + o).join(' '); }
    async pollStart(input) {
        const q = cut(str(input.q).trim(), 80);
        let opts = input.options;
        if (typeof opts === 'string') opts = opts.split(/\n|\|/);
        opts = (Array.isArray(opts) ? opts : []).map(o => cut(str(o).trim(), 30)).filter(Boolean).slice(0, 6);
        if (q.length < 3 || opts.length < 2) throw new UserError('Frage und mindestens zwei Antworten nötig.');
        const d = this.load();
        d.poll = { q, options: opts, votes: opts.map(() => 0), started: now() };
        d.stats.polls++;
        this.save(d);
        let sent = true;
        try { await this.chat(this.pollText(d.poll)); } catch (e) { sent = false; }
        return { msg: sent ? '📊 Umfrage in der Chatbox.' : '📊 Umfrage gestartet (Chatbox gerade nicht erreichbar).', poll: d.poll };
    }
    pollVote(i, delta) {
        const d = this.load();
        if (!d.poll) throw new UserError('Keine Umfrage aktiv.');
        const k = int(i);
        if (k < 0 || k >= d.poll.options.length) throw new UserError('Unbekannte Antwort.');
        d.poll.votes[k] = Math.max(0, d.poll.votes[k] + (int(delta) < 0 ? -1 : 1));
        this.save(d);
        return { poll: d.poll };
    }
    async pollEnd(announce) {
        const d = this.load();
        if (!d.poll) throw new UserError('Keine Umfrage aktiv.');
        const p = d.poll; d.poll = null; this.save(d);
        const order = p.options.map((o, i) => [o, p.votes[i]]).sort((a, b) => b[1] - a[1]);
        const text = '📊 Ergebnis: ' + order.map(([o, n]) => o + ' (' + n + ')').join(' · ');
        if (announce) { try { await this.chat(text); } catch (e) { /* egal */ } }
        return { msg: text, result: order };
    }

    // ---------- Mini-Spiele ----------
    rnd(n) { return crypto.randomInt(0, n); }
    async game(kind, input) {
        let text = '', extra = {};
        switch (kind) {
            case 'dice': {
                const m = /^(\d{1,2})?d(\d{1,3})$/i.exec(str(input.arg).trim() || '1d6');
                if (!m) throw new UserError('Würfel als z. B. „2d6“ angeben.');
                const n = Math.min(10, Math.max(1, int(m[1]) || 1)), sides = Math.min(100, Math.max(2, int(m[2])));
                const rolls = Array.from({ length: n }, () => 1 + this.rnd(sides));
                text = '🎲 ' + n + 'd' + sides + ': ' + rolls.join(' + ') + (n > 1 ? ' = ' + rolls.reduce((a, b) => a + b, 0) : '');
                extra.rolls = rolls; break;
            }
            case 'coin': text = '🪙 ' + (this.rnd(2) ? 'Kopf' : 'Zahl'); break;
            case 'pick': {
                let names = str(input.arg).split(/\n|,/).map(x => x.trim()).filter(Boolean);
                if (!names.length && this.app.game && this.app.game.state && this.app.game.state.players) names = [...this.app.game.state.players.values()].map(p => p.name).filter(Boolean);
                if (!names.length) throw new UserError('Niemand zum Auswählen – Namen eintragen oder in eine Instanz gehen.');
                text = '👉 Ausgewählt: ' + names[this.rnd(names.length)] + ' (aus ' + names.length + ')'; break;
            }
            case 'wheel': {
                const opts = str(input.arg).split(/\n|,/).map(x => x.trim()).filter(Boolean);
                if (opts.length < 2) throw new UserError('Mindestens zwei Felder fürs Glücksrad.');
                text = '🎡 Das Glücksrad sagt: ' + opts[this.rnd(opts.length)]; break;
            }
            case 'quiz': { const q = QUIZ[this.rnd(QUIZ.length)]; text = '❓ ' + q[0]; extra.answer = q[1]; break; }
            case 'truth': text = '💬 Wahrheit: ' + TRUTH[this.rnd(TRUTH.length)]; break;
            case 'dare': text = '🎯 Pflicht: ' + DARE[this.rnd(DARE.length)]; break;
            case 'bingo': {
                const pool = BINGO.slice(); const card = [];
                for (let i = 0; i < 9; i++) card.push(pool.splice(this.rnd(pool.length), 1)[0]);
                card[4] = '⭐ Frei';
                return { card, msg: '🎱 Neue Bingo-Karte' };
            }
            default: throw new UserError('Unbekanntes Spiel.');
        }
        const d = this.load(); d.stats.games++; this.save(d);
        let sent = false;
        if (input.chatbox === '1' || input.chatbox === true) { try { await this.chat(text); sent = true; } catch (e) { sent = false; } }
        return Object.assign({ msg: text, text, sent }, extra);
    }

    // ---------- Event-Modus ----------
    eventState() { const e = this.load().event; return e && e.on ? e : { on: false }; }
    /** während des Event-Modus nur VIP-Meldungen (tools.alert fragt hier nach) */
    muted() { const e = this.load().event; return !!(e && e.on && e.mute); }
    async eventOn(input) {
        const title = cut(str(input.title).trim() || 'Event', 32);
        const status = ['join me', 'active', 'ask me', 'busy'].includes(str(input.status)) ? str(input.status) : 'busy';
        const acc = this.app.tools && this.app.tools.acc ? this.app.tools.acc() : null;
        const d = this.load();
        d.event = { on: true, title, status, mute: input.mute !== '0' && input.mute !== false, since: now(),
            prev_status: acc && acc.me ? str(acc.me.status) : '', prev_desc: acc && acc.me ? str(acc.me.statusDescription) : '' };
        d.stats.events++;
        this.save(d);
        const done = [];
        try { if (acc && await this.app.tools.setStatus(status, '🎉 ' + title, 'manual')) done.push('Status'); } catch (e) { /* egal */ }
        if (input.chatbox !== '0' && input.chatbox !== false) { try { await this.chat('🎉 ' + title); done.push('Chatbox'); } catch (e) { /* egal */ } }
        return { msg: '🎉 Event-Modus an' + (done.length ? ' (' + done.join(', ') + ')' : '') + (d.event.mute ? ' – Meldungen nur noch von VIPs.' : '.'), event: d.event };
    }
    async eventOff() {
        const d = this.load();
        const e = d.event;
        if (!e || !e.on) return { msg: 'Event-Modus ist aus.', event: { on: false } };
        d.event = null; this.save(d);
        try { if (e.prev_status) await this.app.tools.setStatus(e.prev_status, e.prev_desc || '', 'manual'); } catch (x) { /* egal */ }
        const min = Math.round((now() - e.since) / 60);
        return { msg: '👋 Event-Modus aus – ' + min + ' min „' + e.title + '“. Status wieder wie vorher.', event: { on: false } };
    }

    // ---------- Abzeichen ----------
    badges() {
        if (this.badgeCache && Date.now() - this.badgeCache.at < 600000) return this.badgeCache.d;
        let hours = 0, worlds = 0, people = 0, shots = 0;
        try { const r = this.app.insights.recap(3650); hours = Math.floor(r.playtime / 3600); worlds = int(r.worlds_count); people = int(r.people_count); shots = int(r.shots); } catch (e) { /* Handy: keine Spielzeit */ }
        const s = this.load().stats, friends = this.friends().length;
        const def = [
            ['play10', '⏱', 'Angekommen', '10 Stunden VRChat', hours, 10], ['play100', '🕰', 'Stammgast', '100 Stunden VRChat', hours, 100], ['play1000', '🏛', 'Urgestein', '1000 Stunden VRChat', hours, 1000],
            ['worlds25', '🌍', 'Weltenbummler', '25 verschiedene Welten', worlds, 25], ['worlds200', '🚀', 'Entdecker', '200 verschiedene Welten', worlds, 200],
            ['people100', '🤝', 'Gesellig', '100 Leute getroffen', people, 100], ['people1000', '🎪', 'Bekannt wie ein bunter Hund', '1000 Leute getroffen', people, 1000],
            ['friends50', '💛', 'Freundeskreis', '50 Freunde', friends, 50], ['shots100', '📸', 'Fotograf', '100 Fotos', shots, 100],
            ['events1', '🎉', 'Erstes Event', 'Event-Modus zum ersten Mal', s.events, 1], ['events25', '🎊', 'Partygänger', '25 Events', s.events, 25],
            ['plans5', '🗓', 'Organisator', '5 Treffen geplant', s.plans, 5], ['polls10', '📊', 'Demokrat', '10 Umfragen', s.polls, 10],
            ['games50', '🎲', 'Spielleitung', '50 Mini-Spiele', s.games, 50], ['invites50', '📨', 'Gastgeber', '50 Sammel-Einladungen verschickt', s.invites, 50],
        ];
        const d = def.map(([id, icon, name, desc, v, goal]) => ({ id, icon, name, desc, got: v >= goal, progress: Math.min(1, v / goal), value: Math.min(v, goal), goal }));
        this.badgeCache = { at: Date.now(), d };
        return d;
    }

    async action(act, input) {
        switch (act) {
            case 'tg_get': return { groups: this.groups(), plans: this.plans(), poll: this.load().poll, event: this.eventState(), badges: this.badges(), stats: this.load().stats,
                friends: this.friends().map(f => ({ id: f.id, name: f.name, state: f.state })).sort((a, b) => a.name.localeCompare(b.name)) };
            case 'tg_group_save': return this.groupSave(input);
            case 'tg_group_delete': return this.groupDelete(input.id);
            case 'tg_group_invite': return this.groupInvite(input.id, input.all !== '1');
            case 'tg_plan_save': return this.planSave(input);
            case 'tg_plan_delete': return this.planDelete(input.id);
            case 'tg_plan_text': return this.planText(input.id);
            case 'tg_poll_start': return this.pollStart(input);
            case 'tg_poll_vote': return this.pollVote(input.i, input.delta);
            case 'tg_poll_end': return this.pollEnd(input.announce === '1');
            case 'tg_game': return this.game(str(input.kind), input);
            case 'tg_event_on': return this.eventOn(input);
            case 'tg_event_off': return this.eventOff();
            case 'tg_badges': this.badgeCache = null; return { badges: this.badges() };
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Together, QUIZ, BINGO };
