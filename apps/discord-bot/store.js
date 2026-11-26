'use strict';
/* Einfacher Speicher je Discord-Server: data/<guildId>.json, verzögert und atomar geschrieben (ohne Datenbank). */
const fs = require('fs');
const path = require('path');

const DEF_CFG = {
    welcome_channel: '', welcome_text: 'Willkommen {user} auf **{server}**! Du bist Mitglied Nr. {count}. 👋',
    goodbye_channel: '', goodbye_text: '**{name}** hat den Server verlassen.',
    autoroles: [],
    levels: true, level_channel: '', level_text: 'GG {user}, du bist jetzt **Level {level}**! 🎉', level_rewards: {}, xp_min: 15, xp_max: 25, xp_cooldown: 60, xp_ignore_channels: [],
    modlog_channel: '', log_channel: '',
    automod: { words: [], invites: false, links: false, spam: false, caps: false, exempt_roles: [], timeout_min: 0 },
    birthday_channel: '', ticket_channel: '', ticket_roles: [],
};

class Store {
    constructor(dir) { this.dir = dir; this.cache = new Map(); this.timers = new Map(); fs.mkdirSync(dir, { recursive: true }); }
    file(g) { return path.join(this.dir, String(g).replace(/\D/g, '') + '.json'); }
    get(g) {
        if (!this.cache.has(g)) {
            let d = {};
            try { d = JSON.parse(fs.readFileSync(this.file(g), 'utf8')) || {}; } catch (e) { d = {}; }
            d.cfg = Object.assign({}, DEF_CFG, d.cfg || {}); d.cfg.automod = Object.assign({}, DEF_CFG.automod, d.cfg.automod || {});
            for (const k of ['xp', 'warns', 'cmds', 'bdays', 'polls', 'giveaways', 'tickets', 'meta']) d[k] = d[k] || {};
            this.cache.set(g, d);
        }
        return this.cache.get(g);
    }
    save(g) {
        clearTimeout(this.timers.get(g));
        const t = setTimeout(() => this.flush(g), 1500);
        if (t.unref) t.unref();
        this.timers.set(g, t);
    }
    flush(g) {
        const d = this.cache.get(g);
        if (!d) return;
        const f = this.file(g), tmp = f + '.tmp';
        try { fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, f); } catch (e) { console.error('Speichern fehlgeschlagen:', e.message); }
    }
    flushAll() { for (const g of this.cache.keys()) { clearTimeout(this.timers.get(g)); this.flush(g); } }
    guilds() { const s = new Set(this.cache.keys()); try { for (const f of fs.readdirSync(this.dir)) if (/^\d+\.json$/.test(f)) s.add(f.slice(0, -5)); } catch (e) { /* leer */ } return [...s]; }
}

module.exports = { Store, DEF_CFG };
