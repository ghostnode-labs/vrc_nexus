'use strict';
/*
 * 6.3: Client-Werkzeuge
 *   • App-Schlüssel für die lokale Schnittstelle (HTTP + WebSocket) mit Rechten: nur lesen / Chatbox / Avatar / alles.
 *     Gespeichert wird nur der SHA-256 des Schlüssels; der Hauptschlüssel (Stream Deck) hat weiterhin alle Rechte.
 *   • Freie Tastenkürzel (global, auch wenn VRChat vorne ist) für feste Aktionen.
 *   • Einstellungen sichern / einspielen (ohne Schlüssel und Geheimnisse).
 *   • Leistungs-Anzeige (Speicher, CPU, Ereignis-Schleife, Datenbank, Laufzeit).
 */
const crypto = require('crypto');
const { str, cut, UserError } = require('./util');

const SCOPES = {
    read: ['📖 Nur lesen', 'Zustand abfragen und Ereignisse empfangen – keine Befehle.'],
    chatbox: ['💬 Chatbox & Status', 'Zusätzlich Chatbox, Tippen, Status, Rotator, Vorlesen.'],
    avatar: ['🎚 Avatar & OSC', 'Zusätzlich Parameter, Eingaben, Presets, Kamera, Avatar wechseln.'],
    all: ['🔓 Alles', 'Alle Aktionen wie der Hauptschlüssel (z. B. Makros, Automatik, Instanzen).'],
};
const LEVEL = { read: 0, chatbox: 1, avatar: 2, all: 3 };
/** welche Stufe eine Aktion mindestens braucht (unbekannte Aktionen: „alles“) */
const NEED = {
    chatbox: 1, typing: 1, status: 1, rotator: 1, preset: 1, tts: 1, quicktext: 1, chatmods: 1, media: 1,
    param: 2, toggle: 2, input: 2, camera: 2, avatar: 2, avpreset: 2, param_step: 2, scene: 2, record: 2,
};
const need = action => NEED[action] !== undefined ? NEED[action] : 3;

/** feste Aktionen für Tastenkürzel: [Einstellung, Beschriftung, Aktion der Client-API, Daten] */
const HOTKEYS = [
    ['keys.panic', '🚨 Panik (NSFW ganz aus)', 'nsfw_panic_full'],
    ['keys.safeword', '🛑 Safeword (18+)', 'safeword'],
    ['keys.rotator', '🔄 Chatbox-Rotator an/aus', 'rotator'],
    ['keys.sleep', '💤 Schlafmodus an/aus', 'sleep'],
    ['keys.mute', '🔇 Stummschalten (VRChat)', 'input', { name: 'Voice' }],   // kurzer Druck wie die Taste in VRChat
    ['keys.chatbox_clear', '🧹 Chatbox leeren', 'chatbox', { text: '' }],
    ['keys.overlay', '🥽 VR-Overlay ein/aus', 'overlay'],
    ['keys.show', '🪟 VRC Nexus nach vorne holen', 'show'],
    ['keys.mini', '🪟 Mini-Modus ein/aus', 'mini'],
];
/** nie aus einer Datei übernehmen: Server-Adressen und Webhooks (eine fremde Sicherung könnte sonst Daten umleiten) */
const IMPORT_DENY = /(api_base|webhook|_url$|relay|server|endpoint|\.host$)/i;
const ACCEL = /^((Ctrl|Control|Alt|Shift|Super|CommandOrControl|CmdOrCtrl)\+){1,3}([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Insert|Delete|Home|End|PageUp|PageDown|num[0-9]|Up|Down|Left|Right)$/i;

class ClientTools {
    constructor(app) { this.app = app; this.lagMs = 0; this.lagAt = 0; this.cpuPrev = null; }
    get settings() { return this.app.settings; }

    // ---------- App-Schlüssel ----------
    apps() { try { const l = JSON.parse(this.app.db.setting('api_apps', '[]')); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
    writeApps(l) { this.app.db.setSetting('api_apps', JSON.stringify(l.slice(0, 30))); }
    createApp(name, scope) {
        if (!SCOPES[scope]) throw new UserError('Unbekannte Rechte-Stufe.');
        const n = cut(str(name).trim(), 40);
        if (!n) throw new UserError('Bitte einen Namen für die App angeben.');
        const l = this.apps();
        if (l.length >= 30) throw new UserError('Höchstens 30 App-Schlüssel.');
        const key = 'nxa_' + crypto.randomBytes(20).toString('hex');
        l.push({ id: crypto.randomBytes(4).toString('hex'), name: n, scope, hash: sha(key), created: Date.now(), last: 0, uses: 0 });
        this.writeApps(l);
        return { key, apps: this.publicApps() };
    }
    revokeApp(id) { this.writeApps(this.apps().filter(a => a.id !== str(id))); return this.publicApps(); }
    setScope(id, scope) { if (!SCOPES[scope]) throw new UserError('Unbekannte Rechte-Stufe.'); const l = this.apps(); const a = l.find(x => x.id === str(id)); if (!a) throw new UserError('App nicht gefunden.'); a.scope = scope; this.writeApps(l); return this.publicApps(); }
    publicApps() { return this.apps().map(({ hash, ...a }) => a); }
    /** Schlüssel prüfen → null (falsch) oder { scope, app } – zeitkonstant verglichen */
    resolve(token) {
        const t = str(token);
        if (!t) return null;
        const master = Buffer.from(str(this.settings.get('int.api_token'))), got = Buffer.from(t);
        if (master.length && got.length === master.length && crypto.timingSafeEqual(got, master)) return { scope: 'all', app: 'Hauptschlüssel' };
        if (!t.startsWith('nxa_')) return null;
        const h = Buffer.from(sha(t), 'hex'), l = this.apps();
        const a = l.find(x => { const b = Buffer.from(str(x.hash), 'hex'); return b.length === h.length && crypto.timingSafeEqual(b, h); });
        if (!a) return null;
        if (Date.now() - (a.last || 0) > 60000) { a.last = Date.now(); a.uses = (a.uses || 0) + 1; this.writeApps(l); }
        return { scope: a.scope, app: a.name };
    }
    /** darf diese Stufe die Aktion ausführen? */
    allowed(scope, action) { return (LEVEL[scope] !== undefined ? LEVEL[scope] : -1) >= need(str(action)); }
    check(scope, action) { if (!this.allowed(scope, action)) throw new UserError('Dieser App-Schlüssel darf „' + str(action) + '“ nicht (Rechte: ' + SCOPES[scope][0] + ').'); }

    // ---------- Tastenkürzel ----------
    hotkeys() {
        const s = this.settings.all(), out = [];
        for (const [k, label, action, data] of HOTKEYS) { const a = str(s[k]).trim(); if (a && ACCEL.test(a)) out.push({ key: k, accel: a, label, action, data: data || {} }); }
        return out;
    }
    async hotkey(settingKey) {
        const h = HOTKEYS.find(x => x[0] === settingKey);
        if (!h) throw new UserError('Unbekanntes Tastenkürzel.');
        const [, label, action, data] = h, host = this.app.tools.host || {};
        if (action === 'nsfw_panic_full') return await this.app.post({ act: 'nsfw_panic_full' }, {});
        if (action === 'safeword') return await this.app.post({ act: 'nsfwx_safeword', source: 'Tastenkürzel' }, {});
        if (action === 'overlay') { if (!host.overlayToggle) throw new UserError('Overlay nur in der Windows-App.'); return { msg: label, on: await host.overlayToggle() }; }
        if (action === 'show') { if (host.show) host.show(); return { msg: label }; }
        if (action === 'mini') { if (!host.miniToggle) throw new UserError('Mini-Modus nur in der Windows-App.'); return { msg: host.miniToggle() ? '🪟 Mini-Modus an' : '🪟 Mini-Modus aus' }; }
        return await this.app.tools.apiAction(action, Object.assign({}, data || {}));
    }

    // ---------- Einstellungen sichern / einspielen ----------
    exportSettings() {
        const schema = this.settings.schema().fields, s = this.settings.all(), out = {};
        for (const f of schema) if (f.type !== 'secret' && f.type !== 'apikey' && f.key !== 'int.api_token' && !IMPORT_DENY.test(f.key)) out[f.key] = s[f.key];
        return { app: 'VRC Nexus', kind: 'settings', version: require('./vrchat').VERSION, exported: new Date().toISOString(), settings: out };
    }
    importSettings(data) {
        let d = data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { throw new UserError('Keine gültige Sicherung (JSON).'); } }
        const src = d && typeof d === 'object' ? (d.settings && typeof d.settings === 'object' ? d.settings : d) : null;
        if (!src || Array.isArray(src)) throw new UserError('Keine gültige Sicherung.');
        const fields = new Map(this.settings.schema().fields.map(f => [f.key, f])), take = {};
        let skipped = 0;
        for (const [k, v] of Object.entries(src)) {
            const f = fields.get(k);
            if (!f || f.type === 'secret' || f.type === 'apikey' || k === 'int.api_token' || IMPORT_DENY.test(k)) { skipped++; continue; }
            take[k] = v;
        }
        if (!Object.keys(take).length) throw new UserError('In der Datei sind keine passenden Einstellungen.');
        const res = this.settings.save(take);
        return Object.assign(res || {}, { imported: Object.keys(take).length, skipped, msg: Object.keys(take).length + ' Einstellungen übernommen' + (skipped ? ', ' + skipped + ' übersprungen (unbekannt oder geheim)' : '') + '.' });
    }

    // ---------- 6.4: Mini-Modus (Daten für das kleine Fenster) ----------
    miniState() {
        const a = this.app, g = a.game, st = g.state, h = a.heart && a.heart.active ? a.heart.bpm : 0;
        let fr = []; try { fr = a.vrc.friendList(); } catch (e) { fr = []; }
        const m = a.media ? a.media.now() : null;
        return { running: !!st.running, world: st.worldName || '', players: st.players ? st.players.size : 0, since: st.since || 0, bpm: h, friends: fr.filter(f => f.state === 'online').length,
            music: m && m.status === 'playing' ? (m.title + (m.artist ? ' – ' + m.artist : '')) : '', sleep: !!(a.comfort && a.comfort.sleep), rotator: !!(g.cfg && g.cfg().rotator_enabled),
            nsfw: !!(a.nsfw && a.nsfw.access().unlocked), theme: a.settings.get('ui.theme'), accent: a.settings.get('ui.accent') };
    }

    // ---------- Leistung ----------
    startLag() {
        if (this.lagTimer) return;
        let t = Date.now();
        this.lagTimer = setInterval(() => { const n = Date.now(); this.lagMs = Math.max(0, n - t - 1000); t = n; this.lagAt = n; }, 1000);
        if (this.lagTimer.unref) this.lagTimer.unref();
    }
    stop() { clearInterval(this.lagTimer); this.lagTimer = null; }
    perf() {
        this.startLag();
        const m = process.memoryUsage(), c = process.cpuUsage(), t = process.hrtime.bigint();
        let cpu = null;
        if (this.cpuPrev) { const dt = Number(t - this.cpuPrev.t) / 1000; cpu = dt > 0 ? Math.min(100, Math.round(((c.user - this.cpuPrev.c.user) + (c.system - this.cpuPrev.c.system)) / dt * 1000) / 10) : null; }
        this.cpuPrev = { c, t };
        let db = 0; try { db = this.app.db.size ? this.app.db.size() : 0; } catch (e) { db = 0; }
        return { mem_mb: Math.round(m.rss / 1048576), heap_mb: Math.round(m.heapUsed / 1048576), cpu, lag_ms: this.lagMs, uptime_s: Math.round(process.uptime()), db_kb: Math.round(db / 1024),
            conns: this.app.tools && this.app.tools.ws ? this.app.tools.ws.conns.size : 0, node: process.version };
    }

    async action(act, input) {
        switch (act) {
            case 'ctools_apps': return { apps: this.publicApps(), scopes: SCOPES };
            case 'ctools_app_create': { const r = this.createApp(input.name, str(input.scope) || 'read'); return Object.assign(r, { msg: '🔑 Schlüssel erzeugt – jetzt kopieren, er wird nur einmal angezeigt.' }); }
            case 'ctools_app_scope': return { apps: this.setScope(input.id, str(input.scope)), msg: 'Rechte geändert.' };
            case 'ctools_app_revoke': return { apps: this.revokeApp(input.id), msg: 'Schlüssel gesperrt.' };
            case 'ctools_hotkeys': return { hotkeys: this.hotkeys(), all: HOTKEYS.map(([key, label]) => ({ key, label, accel: str(this.settings.get(key)) })) };
            case 'ctools_hotkey': return await this.hotkey(str(input.key));
            case 'ctools_export': return this.exportSettings();
            case 'ctools_import': return this.importSettings(input.data);
            case 'ctools_perf': return this.perf();
            case 'ctools_mini': return await this.hotkey('keys.mini');
            case 'ctools_mini_state': return this.miniState();
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

module.exports = { ClientTools, SCOPES, HOTKEYS, ACCEL, need };
