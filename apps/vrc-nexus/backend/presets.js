'use strict';
/*
 * 5.0: Avatar-Presets – Zustände des getragenen Avatars (Outfit, Haare, Farben …) speichern und mit einem Klick laden.
 * Gespeichert werden nur steuerbare Parameter (Eingang laut OSC-Datei/OSCQuery) mit bekanntem Wert, ohne VRChat-eigene.
 * Intime Parameter (OGB/SPS/PCS …) werden nie in Presets übernommen.
 */
const { str, cut, UserError } = require('./util');
const newId = () => 'p' + require('crypto').randomBytes(6).toString('hex');   // eindeutig, auch bei mehreren im selben Millisekunden-Takt
const H = require('./haptics');

const MAX_PER_AVATAR = 30, MAX_PARAMS = 256;

class Presets {
    constructor(app) { this.app = app; }
    all() { try { return JSON.parse(this.app.db.setting('avatar_presets', '{}')) || {}; } catch (e) { return {}; } }
    saveAll(a) { this.app.db.setSetting('avatar_presets', JSON.stringify(a)); }
    current() { const l = this.app.params.list(); return { id: l.current, name: l.avatar ? l.avatar.name : '', params: l.params, live: l.live }; }

    list() {
        const cur = this.current(), a = this.all();
        return { avatar: cur.id ? { id: cur.id, name: cur.name } : null, presets: (a[cur.id] || []).map(p => ({ id: p.id, name: p.name, count: Object.keys(p.values).length, at: p.at })),
            savable: cur.params.filter(p => p.input && !p.builtin && p.value !== null && !H.isNsfw(p.name)).length };
    }
    save(name, only) {
        const cur = this.current();
        if (!cur.id) throw new UserError('Kein getragener Avatar erkannt.');
        const nm = cut(str(name).trim(), 40);
        if (!nm) throw new UserError('Bitte einen Namen angeben.');
        const pick = Array.isArray(only) && only.length ? new Set(only.map(str)) : null;
        const values = {};
        for (const p of cur.params) {
            if (!p.input || p.builtin || p.value === null || H.isNsfw(p.name) || (pick && !pick.has(p.name))) continue;
            values[p.name] = { v: p.value, t: p.type };
            if (Object.keys(values).length >= MAX_PARAMS) break;
        }
        if (!Object.keys(values).length) throw new UserError('Keine Werte bekannt – Avatar einmal neu laden, dann sendet VRChat alle Werte.');
        const a = this.all(), list = a[cur.id] = a[cur.id] || [];
        const old = list.find(p => p.name.toLowerCase() === nm.toLowerCase());
        if (old) { old.values = values; old.at = Date.now(); }
        else { if (list.length >= MAX_PER_AVATAR) throw new UserError('Höchstens ' + MAX_PER_AVATAR + ' Presets pro Avatar.'); list.push({ id: newId(), name: nm, values, at: Date.now() }); }
        this.saveAll(a);
        return Object.assign(this.list(), { msg: '💾 „' + nm + '“ gespeichert (' + Object.keys(values).length + ' Werte).' });
    }
    find(ref, avatarId) {
        const a = this.all(), list = a[avatarId || this.current().id] || [];
        const r = str(ref).trim().toLowerCase();
        return list.find(p => p.id === str(ref)) || list.find(p => p.name.toLowerCase() === r) || null;
    }
    /** Preset an den Avatar senden (typrichtig; schnelle Folgen werden von Osc gebündelt) */
    async apply(ref) {
        const cur = this.current();
        if (!cur.id) throw new UserError('Kein getragener Avatar erkannt.');
        const p = this.find(ref, cur.id);
        if (!p) throw new UserError('Preset „' + str(ref) + '“ gibt es für diesen Avatar nicht.');
        const osc = this.app.game.osc, sent = [];
        for (const [name, { v, t }] of Object.entries(p.values)) {
            if (osc.params[name] === v) continue;   // schon so
            sent.push(osc.sendParam(name, t === 'float' ? Number(v) : v, t).catch(() => {}));
            osc.params[name] = v;
        }
        await Promise.all(sent);
        return { ok: true, sent: sent.length, msg: '🎭 „' + p.name + '“ geladen (' + sent.length + ' geändert).' };
    }
    rename(id, name) {
        const a = this.all(), cur = this.current(), p = (a[cur.id] || []).find(x => x.id === str(id));
        if (!p) throw new UserError('Preset nicht gefunden.');
        p.name = cut(str(name).trim(), 40) || p.name; this.saveAll(a); return this.list();
    }
    remove(id) {
        const a = this.all(), cur = this.current();
        a[cur.id] = (a[cur.id] || []).filter(x => x.id !== str(id));
        if (!a[cur.id].length) delete a[cur.id];
        this.saveAll(a); return Object.assign(this.list(), { msg: 'Preset gelöscht.' });
    }
    exportJson() { const cur = this.current(); return { avatar: cur.id, presets: this.all()[cur.id] || [] }; }
    importJson(txt) {
        let j; try { j = JSON.parse(str(txt)); } catch (e) { throw new UserError('Kein gültiges Preset-JSON.'); }
        const cur = this.current();
        if (!cur.id) throw new UserError('Kein getragener Avatar erkannt.');
        const a = this.all(), list = a[cur.id] = a[cur.id] || [];
        let n = 0;
        for (const p of Array.isArray(j.presets) ? j.presets : []) {
            if (!p || typeof p.values !== 'object' || list.length >= MAX_PER_AVATAR) continue;
            const values = {};
            for (const [k, x] of Object.entries(p.values).slice(0, MAX_PARAMS)) {
                if (!x || !['bool', 'int', 'float'].includes(x.t) || H.isNsfw(k)) continue;
                const v = x.t === 'bool' ? x.v === true : Number(x.v);
                if (x.t !== 'bool' && !Number.isFinite(v)) continue;
                values[cut(str(k), 128)] = { v, t: x.t };
            }
            if (!Object.keys(values).length) continue;
            list.push({ id: newId(), name: cut(str(p.name || 'Import'), 40), values, at: Date.now() }); n++;
        }
        this.saveAll(a);
        return Object.assign(this.list(), { msg: n + ' Preset(s) übernommen.' });
    }
    async action(act, input) {
        switch (act) {
            case 'preset_list': return this.list();
            case 'preset_save': return this.save(input.name, input.only ? JSON.parse(str(input.only) || '[]') : null);
            case 'preset_apply': return this.apply(input.id || input.name);
            case 'preset_rename': return this.rename(input.id, input.name);
            case 'preset_delete': return this.remove(input.id);
            case 'preset_export': return this.exportJson();
            case 'preset_import': return this.importJson(input.json);
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Presets };
