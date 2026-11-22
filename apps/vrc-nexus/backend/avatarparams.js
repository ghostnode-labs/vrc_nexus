'use strict';
/*
 * Avatar-Parameter erkennen: VRChat legt für jeden Avatar eine OSC-Konfiguration ab
 *   %LocalLow%\VRChat\VRChat\OSC\usr_…\Avatars\avtr_….json
 * mit allen Parametern (Name, Typ, Ein-/Ausgang). Zusammen mit den per OSC empfangenen Werten ergibt das
 * eine vollständige Liste – auch Parameter, die sich noch nie geändert haben.
 */
const fs = require('fs');
const path = require('path');
const { str, cut, UserError } = require('./util');

/* Von VRChat selbst gesetzte Parameter – nicht steuerbar oder für die Bedienung uninteressant */
const BUILTIN = new Set(['IsLocal', 'PreviewMode', 'Viseme', 'Voice', 'GestureLeft', 'GestureRight', 'GestureLeftWeight', 'GestureRightWeight', 'AngularY', 'VelocityX', 'VelocityY',
    'VelocityZ', 'VelocityMagnitude', 'Upright', 'Grounded', 'Seated', 'AFK', 'TrackingType', 'VRMode', 'MuteSelf', 'InStation', 'Earmuffs', 'IsOnFriendsList', 'AvatarVersion',
    'ScaleModified', 'ScaleFactor', 'ScaleFactorInverse', 'EyeHeightAsMeters', 'EyeHeightAsPercent', 'IsAnimatorEnabled']);

class AvatarParams {
    constructor(app) { this.app = app; this.cache = new Map(); }
    root() { return path.join(this.app.tools.vrchatDir(), 'OSC'); }

    /** alle Avatar-Konfigurationen: [{ id, name, file, user, mtime }] */
    avatars() {
        const out = [];
        let users = [];
        try { users = fs.readdirSync(this.root()).filter(u => /^usr_[0-9a-f-]{36}$/i.test(u)); } catch (e) { return out; }
        for (const u of users) {
            const dir = path.join(this.root(), u, 'Avatars');
            let files = [];
            try { files = fs.readdirSync(dir).filter(f => /^avtr_[0-9a-f-]{36}\.json$/i.test(f)); } catch (e) { continue; }
            for (const f of files) {
                const file = path.join(dir, f);
                const cfg = this.read(file);
                let mtime = 0;
                try { mtime = Math.floor(fs.statSync(file).mtimeMs / 1000); } catch (e) { /* egal */ }
                if (cfg) out.push({ id: f.slice(0, -5), name: str(cfg.name) || f.slice(0, -5), user: u, file, mtime, count: (cfg.parameters || []).length });
            }
        }
        return out.sort((a, b) => b.mtime - a.mtime);
    }
    read(file) {
        let mtime = 0;
        try { mtime = fs.statSync(file).mtimeMs; } catch (e) { return null; }
        const c = this.cache.get(file);
        if (c && c.mtime === mtime) return c.cfg;
        let cfg = null;
        try { cfg = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { cfg = null; }
        this.cache.set(file, { mtime, cfg });
        return cfg;
    }
    /** 4.2.1: welcher Avatar wird gerade getragen? Quellen der Reihe nach:
     *  OSC (/avatar/change) → OSCQuery (VRChats Parameter-Baum) → Spiel-Log („Switching … to avatar …“, per Name) → VRChat-Konto (currentAvatar). */
    current() {
        const osc = this.app.game.osc, oq = this.app.oq, all = this.avatars();
        const named = id => { const f = this.fileFor(id, all); return f ? f.name : ''; };
        if (/^avtr_/i.test(str(osc.avatarId))) return { id: osc.avatarId, name: named(osc.avatarId), src: osc.avatarSrc || 'osc' };
        if (oq && /^avtr_/i.test(str(oq.avatarId))) return { id: oq.avatarId, name: named(oq.avatarId), src: 'oscquery' };
        const st = this.app.game.state || {}, logName = str(st.avatar);
        if (logName && st.running !== false) {
            const m = all.find(x => x.name === logName);
            if (m) return { id: m.id, name: m.name, src: 'log' };
        }
        try {
            const acc = this.app.vrc && this.app.vrc.account(), id = str(acc && acc.me && acc.me.currentAvatar);
            if (/^avtr_[0-9a-f-]{36}$/i.test(id)) return { id, name: named(id) || (logName && !all.some(x => x.name === logName) ? logName : ''), src: 'api' };
        } catch (e) { /* ohne Konto */ }
        return { id: '', name: logName, src: '' };
    }
    /** OSC-Datei zu einem Avatar – bei mehreren VRChat-Konten die des angemeldeten bzw. die neueste */
    fileFor(id, all) {
        const l = (all || this.avatars()).filter(a => a.id === id);
        if (l.length < 2) return l[0] || null;
        let uid = '';
        try { const acc = this.app.vrc && this.app.vrc.account(); uid = str(acc && (acc.user_id || (acc.me && acc.me.id))); } catch (e) { /* egal */ }
        return l.find(a => a.user === uid) || l[0];
    }
    /** Parameter des gerade getragenen Avatars mit aktuellen Werten (aus OSC bzw. OSCQuery) */
    list() {
        const osc = this.app.game.osc, oq = this.app.oq;
        const cur = this.current();
        const av = cur.id ? this.fileFor(cur.id) : null;
        const favs = this.favs(cur.id);
        const liveSame = cur.id && str(osc.avatarId) === cur.id;
        const values = Object.assign({}, oq && oq.avatarId === cur.id ? Object.fromEntries(Object.entries(oq.params || {}).map(([k, v]) => [k, v.value])) : {}, liveSame ? osc.params : {});
        const params = [];
        const seen = new Set();
        if (av) {
            for (const p of (this.read(av.file) || {}).parameters || []) {
                const name = str(p.name);
                const t = str((p.input || p.output || {}).type).toLowerCase();
                if (!name || seen.has(name)) continue;
                seen.add(name);
                params.push({ name, type: t === 'bool' ? 'bool' : t === 'int' ? 'int' : 'float', input: !!p.input, builtin: BUILTIN.has(name), fav: favs.includes(name),
                    value: values[name] === undefined ? null : values[name] });
            }
        }
        // per OSCQuery/OSC bekannte, aber nicht in der Datei stehende Parameter ergänzen (oder alle, wenn VRChat die Datei noch nicht geschrieben hat)
        const known = Object.assign({}, oq && oq.avatarId === cur.id ? oq.params : {});
        if (liveSame) for (const [k, v] of Object.entries(osc.params)) if (!known[k]) known[k] = { type: typeof v === 'boolean' ? 'bool' : Number.isInteger(v) ? 'int' : 'float', value: v };
        for (const [name, k] of Object.entries(known)) {
            if (seen.has(name) || k.type === 'other') continue;
            seen.add(name);
            params.push({ name, type: k.type, input: true, builtin: BUILTIN.has(name), fav: favs.includes(name), value: values[name] === undefined ? null : values[name], live_only: true });
        }
        params.sort((a, b) => (b.fav - a.fav) || (a.builtin - b.builtin) || a.name.localeCompare(b.name));
        return { avatar: cur.id ? { id: cur.id, name: (av && av.name) || cur.name || '' } : null, current: cur.id, src: cur.src, osc_active: osc.active, live: !!liveSame,
            file: !!av, params, dir: av ? av.file : this.root(), log_name: cur.id ? '' : cur.name };
    }
    favs(avatarId) { try { return (JSON.parse(this.app.db.setting('param_favs', '{}')) || {})[avatarId] || []; } catch (e) { return []; } }
    toggleFav(avatarId, name) {
        if (!/^avtr_[0-9a-f-]{36}$/i.test(str(avatarId))) throw new UserError('Unbekannter Avatar.');
        let all = {};
        try { all = JSON.parse(this.app.db.setting('param_favs', '{}')) || {}; } catch (e) { all = {}; }
        const l = new Set(all[avatarId] || []);
        if (l.has(name)) l.delete(name); else l.add(cut(str(name), 64));
        all[avatarId] = [...l];
        this.app.db.setSetting('param_favs', JSON.stringify(all));
        return all[avatarId];
    }
}

module.exports = { AvatarParams, BUILTIN };
