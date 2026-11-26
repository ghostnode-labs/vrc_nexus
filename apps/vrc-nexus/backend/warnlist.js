'use strict';
/*
 * Warnliste: Crasher, Ripper, Troller – gemeinsam über die GhostNode-Webseite (nexuswarn.php).
 *   Lesen & melden nur mit gültigem Freischalt-Schlüssel (NXK1) – die Webseite prüft die Unterschrift selbst.
 *   Sichtbar wird eine Warnung erst ab N unabhängigen Meldern (Standard 2). Beweis ist Pflicht, Meldungen verfallen.
 *   Admins (Besitzerin + von ihr ernannte Moderatoren) sehen und bearbeiten alles im 👑 Admin-Bereich.
 *   Die zuletzt geladene Liste bleibt im Zwischenspeicher → Warnungen funktionieren auch kurz ohne Internet.
 *   Alarm, wenn ein gelisteter Spieler deine Instanz betritt: Desktop-Hinweis, XSOverlay, Stream Deck, Automatik –
 *   absichtlich NIE in die Chatbox (das wäre öffentlich).
 * Eigene Umsetzung.
 */
const { str, int, cut, now, UserError } = require('./util');

const REASONS = { crasher: ['💥', 'Crasher'], ripper: ['🏴‍☠️', 'Ripper'], troll: ['🧌', 'Troll'], other: ['⚠', 'Sonstiges'] };
const UID = /^(?:usr_[0-9a-f-]{36}|[0-9a-z]{10})$/i;   // auch kurze IDs älterer Konten
const BASE = () => (process.env.NEXUS_WARN_BASE || process.env.NEXUS_RELAY_BASE || require('./servers').nexus()).replace(/\/+$/, '');
const REFRESH = 10 * 60000;

class WarnList {
    constructor(app) {
        this.app = app;
        this.recent = [];          // gelistete Spieler, die gerade gekommen sind (Stream Deck, Startseite)
        this.at = 0; this.error = ''; this.busy = null;
        let c = {};
        try { c = JSON.parse(app.db.setting('warnlist_cache', '{}')) || {}; } catch (e) { c = {}; }
        this.data = { items: Array.isArray(c.items) ? c.items : [], mine: Array.isArray(c.mine) ? c.mine : [], me: c.me || null, min: int(c.min) || 2, admin: !!c.admin };
    }
    token() { return this.app.nsfw ? this.app.nsfw.serviceToken() : ''; }
    async call(a, body) {
        const token = this.token();
        if (!token) throw new UserError('Die Warnliste gibt es nur mit Freischalt-Schlüssel (Einstellungen → 🔞 NSFW / Schlüssel).');
        let r;
        try { r = await fetch(BASE() + '/nexuswarn.php?a=' + encodeURIComponent(a), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token }, body || {})), signal: AbortSignal.timeout(12000) }); }
        catch (e) { throw new UserError('GhostNode-Webseite nicht erreichbar.'); }
        const d = await r.json().catch(() => ({ error: 'Antwort kein JSON – liegt nexuswarn.php auf der Webseite?' }));
        if (!r.ok || d.error) throw new UserError(str(d.error) || 'Fehler ' + r.status + '.');
        return d;
    }
    /** Liste vom Server holen (höchstens alle 10 Minuten, außer force) */
    async refresh(force) {
        if (!force && Date.now() - this.at < REFRESH) return this.data;
        if (this.busy) return this.busy;
        this.busy = (async () => {
            try {
                const d = await this.call('list');
                this.data = { items: (d.items || []).filter(e => e && UID.test(e.id)), mine: d.mine || [], me: d.me || null, min: int(d.min) || 2, admin: !!d.admin };
                this.at = Date.now(); this.error = '';
                this.app.db.setSetting('warnlist_cache', JSON.stringify(this.data));
            } catch (e) { this.error = e.message; this.at = Date.now() - REFRESH + 60000; }   // Fehler: in 1 Minute wieder versuchen
            finally { this.busy = null; }
            return this.data;
        })();
        return this.busy;
    }
    all() { return this.data.items; }
    get(id) {
        id = str(id).toLowerCase();
        const e = this.data.items.find(x => x.id === id);
        const mine = this.data.mine.find(x => x.target === id) || null;
        return e || mine ? Object.assign({ id, count: 0, reason: mine ? mine.reason : 'other' }, e || {}, { mine }) : null;
    }
    /** kleine Zusammenfassung für Abzeichen: id → { reason, icon, label, count } (nur sichtbare Warnungen) */
    badges() { return Object.fromEntries(this.data.items.map(e => { const r = REASONS[e.reason] || REASONS.other; return [e.id, { reason: e.reason, icon: r[0], label: r[1], count: e.count }]; })); }

    /** Vorschläge für den Beweis: die letzten Spiel-Log-Zeilen mit diesem Spieler */
    evidence(id, name) {
        let rows = [];
        try { rows = UID.test(str(id)) ? this.app.game.list({ player: id }) : name ? this.app.game.list({ q: name }) : []; } catch (e) { rows = []; }
        return (rows || []).slice(0, 15).map(r => new Date(int(r.ts) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC · ' + str(r.kind) + ' · ' + str(r.player_name) + (r.world_name ? ' · ' + str(r.world_name) : ''));
    }
    async report(input) {
        const id = str(input.id).trim().toLowerCase();
        if (!UID.test(id)) throw new UserError('Ungültige VRChat-User-ID (usr_…).');
        if (!REASONS[str(input.reason)]) throw new UserError('Bitte einen Grund wählen.');
        const evidence = cut(str(input.evidence).replace(/\r/g, '').trim(), 1000);
        if (!evidence) throw new UserError('Ein Beweis ist Pflicht (Screenshot-Pfad oder Spiel-Log-Zeile).');
        const acc = this.app.vrc.account();
        const d = await this.call('report', { target: id, name: cut(str(input.name).trim(), 60), reason: str(input.reason), note: cut(str(input.note).trim(), 500), evidence,
            days: Math.max(1, Math.min(365, int(input.days) || 182)), reporter_name: acc ? str(acc.display_name) : '' });
        await this.refresh(true);
        return d;
    }
    /** Spiel-Log-Ereignis: gelisteter Spieler kommt */
    onGameEvent(e) {
        if (e.kind === 'world_join') this.refresh().catch(() => {});
        if (e.kind !== 'player_join' || !e.player_id || int(e.ts) < now() - 90) return;
        const w = this.data.items.find(x => x.id === str(e.player_id).toLowerCase());
        if (!w) return;
        const r = REASONS[w.reason] || REASONS.other;
        this.recent = [{ id: w.id, name: str(e.player_name) || w.name, reason: w.reason, at: Date.now() }].concat(this.recent.filter(x => x.id !== w.id)).slice(0, 10);
        const title = '⚠ ' + r[1] + ': ' + (str(e.player_name) || w.name), body = w.count + ' Meldung' + (w.count === 1 ? '' : 'en') + ' auf der Warnliste. Betritt gerade ' + (e.world_name || 'deine Instanz') + '.';
        const t = this.app.tools;
        if (t) {
            t.log.unshift({ ts: now(), title, body }); t.log = t.log.slice(0, 50);
            const s = this.app.settings.all();
            if (t.host && t.host.notify) t.host.notify(title, body, false);
            if (s['vr.xsoverlay']) t.xsoverlay(title, body);
        }
        if (this.app.auto) this.app.auto.fire('warn_join', () => true, { spieler_name: str(e.player_name) || w.name, warn_grund: r[1] });
    }
    /** gelistete Spieler, die jetzt in der Instanz sind */
    present() {
        const st = this.app.game.state, b = this.badges();
        return [...st.players.values()].filter(p => p.id && b[p.id.toLowerCase()]).map(p => ({ id: p.id, name: p.name, reason: b[p.id.toLowerCase()].reason }));
    }
    status() { return Object.assign({ reasons: REASONS, present: this.present(), recent: this.recent, error: this.error, updated: this.at, can: !!this.token(), server: BASE() }, this.data); }

    async action(act, input) {
        switch (act) {
            case 'warn_list': await this.refresh(input.refresh === '1'); return this.status();
            case 'warn_badges': this.refresh().catch(() => {}); return { badges: this.badges() };
            case 'warn_get': return { item: this.get(input.id), evidence: this.evidence(str(input.id), str(input.name)), reasons: REASONS, can: !!this.token() };
            case 'warn_save': { await this.report(input); return Object.assign(this.status(), { item: this.get(input.id), msg: (REASONS[str(input.reason)] || REASONS.other)[0] + ' Meldung gespeichert.' }); }
            case 'warn_delete': { await this.call('withdraw', { target: str(input.id) }); await this.refresh(true); return Object.assign(this.status(), { msg: 'Meldung zurückgezogen.' }); }
            case 'warn_appeal': { const d = await this.call('appeal', { text: str(input.text) }); await this.refresh(true); return Object.assign(this.status(), { msg: d.msg }); }
        }
        // Admin: Besitzerin oder Moderator (die Webseite prüft das selbst noch einmal)
        if (act.startsWith('warn_admin_')) {
            const a = 'admin_' + act.slice(11);
            if (!/^admin_(list|update|delete|clear|appeal|settings)$/.test(a)) throw new UserError('Unbekannte Aktion.');
            const body = {};
            for (const k of ['id', 'reason', 'note', 'evidence', 'name', 'days', 'target', 'answer', 'accept', 'min', 'revoked']) if (input[k] !== undefined) body[k] = str(input[k]);
            if (body.accept === '0' || body.accept === '') delete body.accept;
            const d = await this.call(a, body);
            if (a !== 'admin_list') this.refresh(true).catch(() => {});
            return d;
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { WarnList, REASONS };
