'use strict';
/*
 * 8.2 (🔞, nur mit NSFW-Freigabe): Sicherheits-Center
 *   • Sicherheits-Check: alles, was im Ernstfall hilft, auf einen Blick (Notfall-Kontakte, Safeword, Panik, Pausen, Gesten, Geräte)
 *   • Eigene Sperrliste: Personen (VRChat-ID) mit Notiz – lokal und verschlüsselt gespeichert
 *     – Warnung, wenn eine gesperrte Person deine Instanz betritt (nie in die Chatbox)
 *     – Fernsteuerung von gesperrten Personen wird immer abgelehnt
 *   • Gemeinsame Sperrliste: mit Vertrauenspersonen über den Ende-zu-Ende-verschlüsselten Chat teilen;
 *     übernommene Einträge sind als „von …“ markiert und lassen sich einzeln entfernen
 */
const { str, int, cut, UserError } = require('./util');

const UID = /^usr_[0-9a-f-]{36}$/i;
const CODE = 'NXB1.';
const MAX = 500;

class Safety {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.cache = null; this.recent = []; }
    allowed() { try { return !!(this.app.nsfw && this.app.nsfw.access().unlocked); } catch (e) { return false; } }
    need() { if (!this.allowed()) throw new UserError('Das Sicherheits-Center gibt es mit 18+-Freigabe.'); }
    load() {
        if (this.cache) return this.cache;
        let d = null;
        try { const raw = this.app.db.setting('nsfw_blocks', ''); d = raw ? JSON.parse(this.crypt.decrypt(raw)) : null; } catch (e) { d = null; }
        this.cache = Array.isArray(d) ? d : [];
        return this.cache;
    }
    save(list) { this.cache = list.slice(0, MAX); this.app.db.setSetting('nsfw_blocks', this.crypt.encrypt(JSON.stringify(this.cache))); }
    isBlocked(uid) { const u = str(uid).toLowerCase(); return !!u && this.load().some(b => b.id === u); }

    add(input, from) {
        const id = str(input.id).trim().toLowerCase();
        if (!UID.test(id)) throw new UserError('VRChat-ID (usr_…) angeben.');
        if (this.app.nsfw && this.app.nsfw.myId && str(this.app.nsfw.myId()).toLowerCase() === id) throw new UserError('Dich selbst kannst du nicht sperren.');
        const list = this.load().filter(b => b.id !== id);
        if (list.length >= MAX) throw new UserError('Höchstens ' + MAX + ' Einträge.');
        const e = { id, name: cut(str(input.name).replace(/[\r\n]/g, ' ').trim(), 60), note: cut(str(input.note).replace(/[\r\n]/g, ' ').trim(), 200), at: Date.now(), from: from || '' };
        list.unshift(e); this.save(list);
        return e;
    }
    remove(id) { const u = str(id).toLowerCase(); this.save(this.load().filter(b => b.id !== u)); }

    /** Teilen: nur eigene Einträge (keine übernommenen weiterreichen), Notizen auf Wunsch weglassen */
    exportCode(withNotes) {
        const items = this.load().filter(b => !b.from).map(b => withNotes ? { id: b.id, name: b.name, note: b.note } : { id: b.id, name: b.name });
        if (!items.length) throw new UserError('Noch keine eigenen Einträge zum Teilen.');
        return CODE + Buffer.from(JSON.stringify({ v: 1, items })).toString('base64url');
    }
    importCode(code, fromName) {
        code = str(code).trim();
        const m = code.match(/NXB1\.([A-Za-z0-9_-]{8,60000})/);
        if (!m) throw new UserError('Kein Sperrlisten-Code (beginnt mit NXB1.).');
        let d; try { d = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch (e) { throw new UserError('Code beschädigt.'); }
        if (!d || d.v !== 1 || !Array.isArray(d.items)) throw new UserError('Code beschädigt.');
        const from = cut(str(fromName).trim(), 40) || 'geteilt';
        let n = 0;
        const have = new Set(this.load().map(b => b.id));
        for (const it of d.items.slice(0, MAX)) {
            const id = str(it && it.id).toLowerCase();
            if (!UID.test(id) || have.has(id)) continue;
            try { this.add({ id, name: it.name, note: it.note }, from); have.add(id); n++; } catch (e) { /* überspringen */ }
        }
        return n;
    }
    async share(to, withNotes) {
        if (!UID.test(str(to))) throw new UserError('Empfänger: VRChat-ID (usr_…).');
        const care = this.app.nsfwcare, t = care && care.load ? (care.load().trust || []).find(x => str(x.id).toLowerCase() === str(to).toLowerCase()) : null;
        if (!t) throw new UserError('Teilen nur mit Personen auf deiner Vertrauensliste (🤝).');
        if (!this.app.chat) throw new UserError('Chat nicht verfügbar.');
        await this.app.chat.send(to, '🛡 Nexus-Sperrliste zum Übernehmen (🔞 → 🛡 Sicherheit → 📥): ' + this.exportCode(withNotes));
        return t.name || to;
    }

    /** Spiel-Log: gesperrte Person betritt die Instanz → stiller Hinweis (nie Chatbox) */
    onGameEvent(e) {
        if (!e || e.kind !== 'player_join' || !e.player_id || int(e.ts) < Math.floor(Date.now() / 1000) - 90) return false;
        if (!this.allowed() || !this.isBlocked(e.player_id)) return false;
        const b = this.load().find(x => x.id === str(e.player_id).toLowerCase());
        const name = str(e.player_name) || b.name || e.player_id;
        this.recent = [{ id: b.id, name, at: Date.now() }].concat(this.recent.filter(x => x.id !== b.id)).slice(0, 10);
        const t = this.app.tools, title = '🛡 Gesperrt: ' + name, body = (b.note ? b.note + ' · ' : '') + 'Betritt gerade ' + (e.world_name || 'deine Instanz') + '.';
        if (t && !(this.app.nsfw && this.app.nsfw.private)) { if (t.host && t.host.notify) t.host.notify(title, body, false); if (this.app.settings && this.app.settings.all()['vr.xsoverlay'] && t.xsoverlay) t.xsoverlay(title, body); }
        return true;
    }

    /** Sicherheits-Check – nur lesen, was die Module ohnehin wissen */
    check() {
        const a = this.app, out = [];
        const add = (id, ok, title, hint, tab) => out.push({ id, ok: !!ok, title, hint, tab: tab || '' });
        let care = null; try { care = a.nsfwcare ? a.nsfwcare.load() : null; } catch (e) { care = null; }
        const trust = (care && care.trust) || [];
        const contacts = trust.filter(x => (x.perms ? x.perms.checkin : x.level !== 'known'));
        add('contacts', contacts.length, contacts.length + ' Notfall-Kontakt' + (contacts.length === 1 ? '' : 'e'), 'Vertrauensperson mit Recht „Check-in“ eintragen – sie bekommt eine Nachricht, wenn du dich beim Treffen nicht meldest.', 'care');
        let sw = null; try { sw = a.nsfwsafe && a.nsfwsafe.cfg ? (a.nsfwsafe.cfg().safeword || null) : null; } catch (e) { sw = null; }
        add('safeword', sw && (sw.word || sw.param), 'Safeword eingerichtet', 'Wort, Geste oder Taste festlegen – ein Ablauf für alle Wege.', 'safe');
        let nc = null; try { nc = a.nsfw.cfg(); } catch (e) { nc = null; }
        add('panic', nc && (nc.panic_toys || nc.panic_private || nc.panic_avatar), 'Panik-Knopf stoppt Spielzeug / sicherer Avatar', 'Unter 🔞 → Einstellungen festlegen, was Panik alles tut.', 'nsfw');
        let tc = null; try { tc = a.toys ? a.toys.cfg() : null; } catch (e) { tc = null; }
        add('breaks', tc && tc.autopause && tc.autopause.on, 'Automatische Pausen', 'Nach X Minuten am Stück oder ab einem Puls kurz pausieren.', 'toys');
        let wc = null; try { wc = a.watch ? a.watch.cfg() : null; } catch (e) { wc = null; }
        const paired = wc ? (wc.devices || []).filter(d => d.kind !== 'pc').length : 0;
        add('device', paired, 'Stopp am Handgelenk oder Handy', 'Uhr oder Handy koppeln – Panik, Safeword und Stopp gehen dann auch ohne Headset.', 'devices');
        add('gesture', wc && wc.shake && wc.shake !== 'off', 'Schüttel-Geste an der Uhr', 'Uhr schütteln = Stopp oder Safeword.', 'devices');
        add('group', care && care.cfg && care.cfg.group && care.cfg.group.send, 'Gruppen-Safeword', 'Ein Safeword stoppt auch bei Vertrauenspersonen mit diesem Recht.', 'care');
        add('blocks', this.load().length, this.load().length + ' Personen auf der Sperrliste', 'Wer hier steht, kann dich nie fernsteuern; du bekommst einen stillen Hinweis, wenn die Person deine Instanz betritt.', 'safety');
        return { items: out, score: out.filter(x => x.ok).length, total: out.length };
    }
    state() { return { check: this.check(), blocks: this.load(), recent: this.recent, trust: ((this.app.nsfwcare && this.app.nsfwcare.load().trust) || []).map(x => ({ id: x.id, name: x.name })) }; }

    async action(act, input) {
        this.need();
        const st = extra => Object.assign(this.state(), extra || {});
        switch (act) {
            case 'safety_state': return st();
            case 'safety_block': { const e = this.add(input, ''); return st({ msg: '🛡 ' + (e.name || e.id) + ' gesperrt.' }); }
            case 'safety_unblock': this.remove(input.id); return st({ msg: 'Entfernt.' });
            case 'safety_export': return st({ code: this.exportCode(input.notes === '1' || input.notes === true) });
            case 'safety_import': { const n = this.importCode(input.code, input.from); return st({ msg: '📥 ' + n + ' Einträge übernommen.' }); }
            case 'safety_share': { const who = await this.share(str(input.to), input.notes === '1' || input.notes === true); return st({ msg: '📤 Sperrliste an ' + who + ' geschickt (Ende-zu-Ende verschlüsselt).' }); }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { Safety };
