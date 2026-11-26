'use strict';
/*
 * 🔞 NSFW 3.1 – eigene NSFW-Sammlung (lokal, verschlüsselt gespeichert, getrennt von den normalen Favoriten):
 *  - Welten und Avatare in eigenen Listen, mit Tags, Notiz, Bewertung (1–5), Besuchen/Tragen und „zuletzt“
 *  - Vorschläge: betretene Welten / getragene Avatare mit 18+-Inhalts-Tags (content_sex, content_adult …) – nur Vorschlag, nie automatisch
 *  - Zufall (Welt/Avatar aus Filter), Beitreten (Einladungs- oder 18+-Gruppeninstanz), Avatar tragen
 *  - Ausgewählte Avatare/Welten im eigenen 18+-Profil zeigen (nur für Verified 18+ mit NSFW an sichtbar)
 *  - Privat-Modus/Panik: Liste ist verborgen, bis sie bewusst eingeblendet wird; nichts geht in Chatbox, Discord oder OBS
 * Nur mit NSFW-Freigabe (Verified 18+ + Schalter).
 */
const { str, int, cut, arr, UserError } = require('./util');

const KINDS = { world: 'wrld', avatar: 'avtr' };
const IDRE = { world: /^wrld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, avatar: /^avtr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i };
const ADULT_TAGS = ['content_sex', 'content_adult', 'admin_content_adult', 'author_tag_nsfw', 'author_tag_18+', 'author_tag_erp', 'author_tag_adult', 'author_tag_lewd'];
const MAX_ITEMS = 2000, MAX_LISTS = 40, MAX_SUGGEST = 40, MAX_PROFILE = 12;
const DEF_LIST = 'Sammlung';
const now = () => Date.now();

const isAdult = tags => arr(tags).map(t => str(t).toLowerCase()).some(t => ADULT_TAGS.includes(t));
const cleanTags = t => [...new Set((Array.isArray(t) ? t : str(t).split(','))
    .map(x => cut(str(x).trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-'), 24)).filter(x => /^[\p{L}\p{N}_+\-]{1,24}$/u.test(x)))].slice(0, 12);

class NsfwCollection {
    constructor(app, crypt) {
        this.app = app; this.crypt = crypt;
        this.reveal = false;             // im Privat-Modus bewusst eingeblendet
        this.checked = new Set();        // schon auf 18+-Tags geprüfte IDs (diese Sitzung)
        this.lastAvatar = '';
        const osc = app.game && app.game.osc;
        if (osc) { osc.taps = osc.taps || new Set(); osc.taps.add((a, v) => { if (a === '/avatar/change' && v && v.length) this.onAvatar(String(v[0])).catch(() => {}); }); }
    }
    // ---------- Speicher (verschlüsselt) ----------
    load() {
        if (this.cache) return this.cache;
        let d = null;
        try { const raw = this.app.db.setting('nsfw_collection', ''); d = raw ? JSON.parse(this.crypt.decrypt(raw)) : null; } catch (e) { d = null; }
        d = d && typeof d === 'object' ? d : {};
        d.items = arr(d.items); d.lists = Object.assign({ world: [DEF_LIST], avatar: [DEF_LIST] }, d.lists || {});
        d.suggest = arr(d.suggest); d.dismissed = arr(d.dismissed);
        d.cfg = Object.assign({ suggest: true, auto_count: true, hide_private: true }, d.cfg || {});
        this.cache = d;
        return d;
    }
    save() { this.app.db.setSetting('nsfw_collection', this.crypt.encrypt(JSON.stringify(this.cache))); }
    need() { if (this.app.nsfw) this.app.nsfw.need('nsfw'); }
    hidden() { const d = this.load(); return !!(this.app.nsfw && this.app.nsfw.private && d.cfg.hide_private && !this.reveal); }
    kind(k) { const v = str(k); if (!KINDS[v]) throw new UserError('Art: world oder avatar.'); return v; }
    find(kind, id) { return this.load().items.find(x => x.kind === kind && x.id === str(id).toLowerCase()); }

    // ---------- Liste ----------
    list(input = {}) {
        const d = this.load();
        if (this.hidden()) return { hidden: true, cfg: d.cfg, counts: { world: 0, avatar: 0 }, items: [], lists: d.lists, suggest: [] };
        const kind = KINDS[str(input.kind)] ? str(input.kind) : '';
        const q = str(input.q).trim().toLowerCase(), tag = str(input.tag).trim().toLowerCase(), grp = str(input.list), minR = int(input.min_rating);
        let items = d.items.filter(x => (!kind || x.kind === kind) && (!grp || x.list === grp) && (!tag || x.tags.includes(tag)) && (!minR || x.rating >= minR)
            && (!q || (x.name + ' ' + x.sub + ' ' + x.note + ' ' + x.tags.join(' ')).toLowerCase().includes(q)));
        const sort = str(input.sort) || 'added';
        const by = { added: (a, b) => b.added - a.added, name: (a, b) => a.name.localeCompare(b.name), rating: (a, b) => b.rating - a.rating || b.added - a.added,
            used: (a, b) => b.count - a.count || b.last - a.last, last: (a, b) => (b.last || 0) - (a.last || 0) }[sort] || ((a, b) => b.added - a.added);
        items = items.slice().sort(by);
        const tags = {};
        for (const x of d.items) if (!kind || x.kind === kind) for (const t of x.tags) tags[t] = (tags[t] || 0) + 1;
        return { hidden: false, revealed: this.reveal, cfg: d.cfg, lists: d.lists, items, tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([t, n]) => ({ t, n })),
            counts: { world: d.items.filter(x => x.kind === 'world').length, avatar: d.items.filter(x => x.kind === 'avatar').length },
            suggest: d.suggest.filter(s => !kind || s.kind === kind), profile: d.items.filter(x => x.profile).length };
    }
    /** Infos bei VRChat holen (Name, Bild, Ersteller, Tags) – ohne Konto nur das Mitgegebene */
    async info(kind, id) {
        try {
            const r = await this.app.tools.call('GET', (kind === 'world' ? '/worlds/' : '/avatars/') + encodeURIComponent(id));
            return { name: str(r.name), image: str(r.thumbnailImageUrl || r.imageUrl), sub: str(r.authorName), adult: isAdult(r.tags), tags: arr(r.tags) };
        } catch (e) { return null; }
    }
    async add(input) {
        const kind = this.kind(input.kind), id = str(input.id).trim().toLowerCase();
        if (!IDRE[kind].test(id)) throw new UserError(kind === 'world' ? 'Ungültige Welt-ID (wrld_…).' : 'Ungültige Avatar-ID (avtr_…).');
        const d = this.load();
        let it = this.find(kind, id);
        if (!it) {
            if (d.items.length >= MAX_ITEMS) throw new UserError('Die Sammlung ist voll (' + MAX_ITEMS + ').');
            const inf = (!input.name || !input.image) ? await this.info(kind, id) : null;
            it = { kind, id, name: cut(str(input.name) || (inf && inf.name) || id, 80), image: cut(str(input.image) || (inf && inf.image) || '', 400), sub: cut(str(input.sub) || (inf && inf.sub) || '', 60),
                list: DEF_LIST, tags: [], note: '', rating: 0, added: now(), count: 0, last: 0, profile: false };
            d.items.push(it);
        }
        this.patch(it, input);
        d.suggest = d.suggest.filter(s => !(s.kind === kind && s.id === id));
        this.save();
        return Object.assign(this.list({ kind }), { item: it, msg: '🔞 In der Sammlung: „' + it.name + '“' });
    }
    patch(it, input) {
        const d = this.load();
        if (input.list !== undefined) {
            const l = cut(str(input.list).trim(), 40) || DEF_LIST;
            if (!d.lists[it.kind].includes(l)) { if (d.lists[it.kind].length >= MAX_LISTS) throw new UserError('Höchstens ' + MAX_LISTS + ' Listen.'); d.lists[it.kind].push(l); }
            it.list = l;
        }
        if (input.tags !== undefined) it.tags = cleanTags(input.tags);
        if (input.note !== undefined) it.note = cut(str(input.note).trim(), 500);
        if (input.rating !== undefined) it.rating = Math.max(0, Math.min(5, int(input.rating)));
        if (input.profile !== undefined) {
            const on = input.profile === true || input.profile === '1';
            if (on && !it.profile && d.items.filter(x => x.profile && x.kind === it.kind).length >= MAX_PROFILE) throw new UserError('Höchstens ' + MAX_PROFILE + ' im 18+-Profil.');
            it.profile = on;
        }
    }
    update(input) {
        const kind = this.kind(input.kind), it = this.find(kind, input.id);
        if (!it) throw new UserError('Nicht in der Sammlung.');
        this.patch(it, input); this.save();
        return Object.assign(this.list({ kind }), { item: it, msg: 'Gespeichert.' });
    }
    remove(input) {
        const kind = this.kind(input.kind), d = this.load(), id = str(input.id).toLowerCase();
        d.items = d.items.filter(x => !(x.kind === kind && x.id === id)); this.save();
        return Object.assign(this.list({ kind }), { msg: 'Aus der Sammlung entfernt.' });
    }
    listOp(input) {
        const kind = this.kind(input.kind), d = this.load(), L = d.lists[kind], name = cut(str(input.name).trim(), 40), op = str(input.op);
        if (!name) throw new UserError('Bitte einen Namen angeben.');
        if (op === 'create') { if (!L.includes(name)) { if (L.length >= MAX_LISTS) throw new UserError('Höchstens ' + MAX_LISTS + ' Listen.'); L.push(name); } }
        else if (op === 'rename') {
            const to = cut(str(input.to).trim(), 40); if (!to || !L.includes(name)) throw new UserError('Liste nicht gefunden.');
            if (L.includes(to)) throw new UserError('Diesen Namen gibt es schon.');
            L[L.indexOf(name)] = to; for (const x of d.items) if (x.kind === kind && x.list === name) x.list = to;
        } else if (op === 'delete') {
            if (L.length <= 1) throw new UserError('Die letzte Liste bleibt.');
            d.lists[kind] = L.filter(x => x !== name);
            const to = d.lists[kind][0];
            for (const x of d.items) if (x.kind === kind && x.list === name) x.list = to;   // Einträge wandern, nichts geht verloren
        } else throw new UserError('Unbekannte Listen-Aktion.');
        this.save();
        return this.list({ kind });
    }

    // ---------- Automatik ----------
    /** Welt betreten: Besuche zählen, 18+-Welten vorschlagen */
    async onGameEvent(e) {
        if (!e || e.kind !== 'world_join' || !/^wrld_/.test(str(e.world_id))) return;
        if (this.app.nsfw && !this.app.nsfw.access().unlocked) return;
        await this.seen('world', str(e.world_id).toLowerCase(), str(e.world_name));
    }
    async onAvatar(id) {
        id = str(id).toLowerCase();
        if (!/^avtr_/.test(id) || id === this.lastAvatar) return;
        this.lastAvatar = id;
        if (this.app.nsfw && !this.app.nsfw.access().unlocked) return;
        await this.seen('avatar', id, '');
    }
    async seen(kind, id, name) {
        const d = this.load(), it = this.find(kind, id);
        if (it) { if (d.cfg.auto_count) { it.count++; it.last = now(); this.save(); } return 'count'; }
        if (!d.cfg.suggest || this.checked.has(id) || d.dismissed.includes(id) || d.suggest.some(s => s.id === id)) return null;
        this.checked.add(id);
        const inf = await this.info(kind, id);
        if (!inf || !inf.adult) return null;
        d.suggest.unshift({ kind, id, name: cut(inf.name || name || id, 80), image: cut(inf.image, 400), sub: cut(inf.sub, 60), at: now() });
        d.suggest = d.suggest.slice(0, MAX_SUGGEST);
        this.save();
        return 'suggest';
    }
    dismiss(input) {
        const d = this.load(), id = str(input.id).toLowerCase();
        d.suggest = d.suggest.filter(s => s.id !== id);
        if (input.forever !== '0' && !d.dismissed.includes(id)) d.dismissed = [id].concat(d.dismissed).slice(0, 500);
        this.save();
        return this.list({});
    }

    // ---------- Aktionen ----------
    random(input) {
        const kind = this.kind(input.kind || 'world'), l = this.list(Object.assign({}, input, { kind }));
        if (l.hidden) throw new UserError('🕶 Privat-Modus – Sammlung verborgen.');
        if (!l.items.length) throw new UserError('Nichts passt zum Filter.');
        // leicht gewichtet: gut bewertete und lange nicht besuchte kommen öfter
        const w = l.items.map(x => 1 + x.rating + Math.min(3, (now() - (x.last || x.added)) / 86400000 / 7));
        let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
        while (r > w[i] && i < w.length - 1) { r -= w[i]; i++; }
        return { item: l.items[i], msg: '🎲 ' + l.items[i].name };
    }
    async join(input) {
        const id = str(input.id).toLowerCase();
        if (!IDRE.world.test(id)) throw new UserError('Ungültige Welt-ID (wrld_…).');
        const r = await this.app.nsfw.action('nsfw_instance', { world: id, kind: input.type === 'group' ? 'group' : 'invite', region: input.region });
        const it = this.find('world', id); if (it) { it.count++; it.last = now(); this.save(); }
        return Object.assign({}, r, { msg: r.msg || '🔞 Instanz erstellt – Einladung kommt.' });
    }
    async wear(input) {
        const id = str(input.id).toLowerCase();
        if (!IDRE.avatar.test(id)) throw new UserError('Ungültige Avatar-ID (avtr_…).');
        await this.app.nsfw.selectAvatar(id);
        this.lastAvatar = id;
        const it = this.find('avatar', id); if (it) { it.count++; it.last = now(); this.save(); }
        return { ok: true, msg: '🎭 ' + (it ? it.name : 'Avatar') + ' angezogen.' };
    }
    /** ausgewählte Einträge ins eigene 18+-Profil (GhostNode-Community) */
    async pushProfile() {
        const d = this.load(), pick = k => d.items.filter(x => x.kind === k && x.profile).slice(0, MAX_PROFILE).map(x => ({ id: x.id, name: x.name, note: cut(x.note, 120) }));
        const r = await this.app.comm.call('profile_items', { avatars: pick('avatar'), worlds: pick('world') });
        return { ok: true, avatars: arr(r.avatars).length, worlds: arr(r.worlds).length, msg: '🔞 18+-Profil aktualisiert (' + arr(r.avatars).length + ' Avatare, ' + arr(r.worlds).length + ' Welten).' };
    }
    exportJson() {
        const d = this.load();
        return { format: 'vrc-nexus-nsfw-collection', version: 1, lists: d.lists, items: d.items.map(x => ({ kind: x.kind, id: x.id, name: x.name, sub: x.sub, image: x.image, list: x.list, tags: x.tags, note: x.note, rating: x.rating, added: x.added })) };
    }
    importJson(txt) {
        let j; try { j = typeof txt === 'string' ? JSON.parse(txt) : txt; } catch (e) { throw new UserError('Keine gültige Sammlungs-Datei.'); }
        if (!j || j.format !== 'vrc-nexus-nsfw-collection') throw new UserError('Keine gültige Sammlungs-Datei.');
        const d = this.load(); let n = 0;
        for (const x of arr(j.items)) {
            const kind = str(x && x.kind), id = str(x && x.id).toLowerCase();
            if (!KINDS[kind] || !IDRE[kind].test(id) || this.find(kind, id) || d.items.length >= MAX_ITEMS) continue;
            const it = { kind, id, name: cut(str(x.name) || id, 80), image: /^https:\/\//.test(str(x.image)) ? cut(str(x.image), 400) : '', sub: cut(str(x.sub), 60), list: DEF_LIST, tags: [], note: '', rating: 0, added: int(x.added) || now(), count: 0, last: 0, profile: false };
            d.items.push(it); this.patch(it, { list: x.list, tags: x.tags, note: x.note, rating: x.rating }); n++;
        }
        this.save();
        return Object.assign(this.list({}), { msg: n + ' Einträge übernommen.' });
    }
    saveCfg(c) {
        const d = this.load(), b = v => v === true || v === '1' || v === 'true';
        for (const k of ['suggest', 'auto_count', 'hide_private']) if (c[k] !== undefined) d.cfg[k] = b(c[k]);
        if (c.clear_dismissed === '1') d.dismissed = [];
        this.save(); return d.cfg;
    }
    status(input) { const kind = this.kind(input.kind), it = this.find(kind, str(input.id).toLowerCase()); return { item: it || null, lists: this.load().lists[kind] }; }

    async action(act, input) {
        this.need();
        switch (act) {
            case 'nsfwc_list': return this.list(input);
            case 'nsfwc_status': return this.status(input);
            case 'nsfwc_add': return this.add(input);
            case 'nsfwc_update': return this.update(input);
            case 'nsfwc_remove': return this.remove(input);
            case 'nsfwc_list_op': return this.listOp(input);
            case 'nsfwc_dismiss': return this.dismiss(input);
            case 'nsfwc_random': return this.random(input);
            case 'nsfwc_join': return this.join(input);
            case 'nsfwc_wear': return this.wear(input);
            case 'nsfwc_profile': return this.pushProfile();
            case 'nsfwc_export': return this.exportJson();
            case 'nsfwc_import': return this.importJson(input.json);
            case 'nsfwc_cfg': this.saveCfg(input); return Object.assign(this.list({}), { msg: 'Gespeichert.' });
            case 'nsfwc_reveal': this.reveal = input.on !== '0'; return this.list(input);
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { NsfwCollection, isAdult, cleanTags, ADULT_TAGS };
