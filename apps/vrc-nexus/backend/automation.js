'use strict';
/*
 * Automatik („Chat-Widgets“): Regeln „wenn … dann Makro“.
 *   Auslöser: Spieler kommt/geht, Welt betreten, Avatar gewechselt, AFK an/aus, Parameter = Wert, Uhrzeit, alle N Minuten,
 *             VRChat gestartet/beendet, Screenshot
 *   Aktion:   Makro-Skript (siehe macros.js) – mit zusätzlichen Platzhaltern {spieler_name} {welt_name} {param_name} {param_wert}
 * Dazu „Spielt gerade“ ({musik}) über die Windows-Mediensteuerung (media.js), sonst aus dem Fenstertitel gängiger Musik-Programme.
 */
const { execFile } = require('child_process');
const { str, int, cut, UserError } = require('./util');
const { parse } = require('./macros');

const TRIGGERS = {
    player_join: ['👋 Spieler kommt', 'all|friends|others'], player_leave: ['🚪 Spieler geht', 'all|friends|others'], world_join: ['🌐 Welt betreten', ''],
    avatar_change: ['🎭 Avatar gewechselt', ''], afk_on: ['💤 AFK an', ''], afk_off: ['☀️ AFK aus', ''], param: ['🎚 Parameter = Wert', 'Name=Wert'],
    time: ['🕒 Uhrzeit', 'HH:MM'], interval: ['🔁 Alle N Minuten', 'Minuten'], vrc_start: ['▶️ VRChat gestartet', ''], vrc_quit: ['⏹️ VRChat beendet', ''], screenshot: ['📸 Screenshot', ''],
    warn_join: ['⚠ Gewarnter Spieler kommt', ''],
    // 6.1: neue Auslöser
    heart_high: ['💓 Puls über', 'BPM'], heart_low: ['💙 Puls unter', 'BPM'], friend_online: ['🟢 Freund kommt online', 'Name (leer = alle)'], friend_offline: ['⚫ Freund geht offline', 'Name (leer = alle)'],
    sleep_on: ['💤 Schlafmodus an', ''], sleep_off: ['⏰ Schlafmodus aus', ''], music_change: ['🎵 Neuer Song', ''], manual: ['🎛 Stream Deck / Knopf', ''],
};
const HM = /^([01]?\d|2[0-3]):[0-5]\d$/;
/** Zeitfenster „HH:MM-HH:MM“ (auch über Mitternacht, z. B. 22:00-06:00); leer = immer */
function inWindow(w, d = new Date()) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(str(w).replace(/\s/g, ''));
    if (!m) return true;
    const now = d.getHours() * 60 + d.getMinutes(), a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
    return a <= b ? now >= a && now < b : now >= a || now < b;
}
const PLAYERS = ['Spotify.exe', 'foobar2000.exe', 'AIMP.exe', 'MusicBee.exe', 'vlc.exe', 'TIDAL.exe', 'Deezer.exe', 'Amazon Music.exe'];
const IDLE_TITLES = /^(spotify( free| premium)?|foobar2000|aimp|musicbee|vlc media player|tidal|deezer|amazon music|n\/a|)$/i;

class Automation {
    constructor(app) {
        this.app = app;
        this.last = new Map();           // Regel → letzte Ausführung (ms)
        this.afkSince = 0;
        this.music = '';
        this.musicAt = 0;
        this.lastPlayer = '';
        this.timer = null;
        this.firedMinute = '';
        this.seen = { heart: 0, sleep: null, music: null, friends: null };   // 6.1: letzter Stand für Flanken-Auslöser
    }
    rules() { try { return JSON.parse(this.app.db.setting('auto_rules', '[]')) || []; } catch (e) { return []; } }
    write(l) { this.app.db.setSetting('auto_rules', JSON.stringify(l.slice(0, 100))); return this.rules(); }
    save(r) {
        const type = str(r.trigger);
        if (!TRIGGERS[type]) throw new UserError('Unbekannter Auslöser.');
        parse(r.script);
        if (!str(r.script).trim()) throw new UserError('Die Aktion ist leer.');
        if (type === 'time' && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(str(r.arg).trim())) throw new UserError('Uhrzeit als HH:MM angeben.');
        if (type === 'interval' && !(int(r.arg) >= 1)) throw new UserError('Mindestens 1 Minute.');
        if (type === 'param' && !/^[\w/\-. ]{1,64}=.+$/u.test(str(r.arg).trim())) throw new UserError('Parameter als Name=Wert angeben.');
        if ((type === 'heart_high' || type === 'heart_low') && !(int(r.arg) >= 30 && int(r.arg) <= 230)) throw new UserError('Puls zwischen 30 und 230 BPM angeben.');
        const win = str(r.window).replace(/\s/g, '');
        if (win && !(win.includes('-') && win.split('-').length === 2 && win.split('-').every(x => HM.test(x)))) throw new UserError('Zeitfenster als HH:MM-HH:MM angeben (z. B. 18:00-23:00).');
        const l = this.rules();
        const rule = { id: str(r.id) || 'r' + Date.now().toString(36) + require('crypto').randomBytes(2).toString('hex'), name: cut(str(r.name).trim(), 50) || TRIGGERS[type][0], trigger: type, arg: cut(str(r.arg).trim(), 80),
            script: cut(str(r.script), 4000), cooldown: Math.max(0, Math.min(86400, int(r.cooldown))), window: win, only_game: !!r.only_game && r.only_game !== '0', on: r.on === undefined ? true : !!r.on && r.on !== '0' };
        const i = l.findIndex(x => x.id === rule.id);
        if (i >= 0) l[i] = rule; else l.push(rule);
        return this.write(l);
    }
    remove(id) { return this.write(this.rules().filter(r => r.id !== str(id))); }
    toggle(id) { const l = this.rules(); const r = l.find(x => x.id === str(id)); if (r) r.on = !r.on; return this.write(l); }

    fire(type, test, vars = {}) {
        if (this.app.mobile) return;
        const st = this.app.game.state;
        for (const r of this.rules()) {
            if (!r.on || r.trigger !== type || !test(r)) continue;
            if (r.only_game && !st.running) continue;
            if (r.window && !inWindow(r.window)) continue;   // 6.1: nur im Zeitfenster
            const t = Date.now();
            if (r.cooldown && t - (this.last.get(r.id) || 0) < r.cooldown * 1000) continue;
            this.last.set(r.id, t);
            this.app.macros.run(r.script, Object.assign({ welt_name: st.worldName || '' }, vars))
                .then(() => this.app.tools.debug && this.app.tools.debug('auto', new Error('Regel „' + r.name + '“ ausgeführt')))
                .catch(e => this.app.tools.debug && this.app.tools.debug('auto', e));
        }
    }
    /** Spiel-Log-Ereignis (nur frische) */
    onGameEvent(e) {
        if (int(e.ts) < Math.floor(Date.now() / 1000) - 90) return;
        const self = this.app.game.state.userId;
        if (e.kind === 'player_join' || e.kind === 'player_leave') {
            if (e.player_id && e.player_id === self) return;
            if (e.kind === 'player_join') this.lastPlayer = str(e.player_name);
            const friend = (() => { try { return this.app.tools.friendMap().has(e.player_id); } catch (x) { return false; } })();
            this.fire(e.kind, r => !r.arg || r.arg === 'all' || (r.arg === 'friends') === friend, { spieler_name: str(e.player_name) });
            return;
        }
        if (['world_join', 'vrc_start', 'vrc_quit', 'screenshot'].includes(e.kind)) this.fire(e.kind, () => true, { welt_name: str(e.world_name) });
    }
    /** OSC von VRChat */
    onOsc(address, args) {
        if (address === '/avatar/change') { this.fire('avatar_change', () => true, { avatar_id: str(args[0]) }); return; }
        if (!address.startsWith('/avatar/parameters/')) return;
        const name = address.slice(19), v = args[0];
        if (name === 'AFK') {
            const on = v === true || v === 1;
            if (on && !this.afkSince) { this.afkSince = Date.now(); this.fire('afk_on', () => true); }
            if (!on && this.afkSince) { const m = Math.round((Date.now() - this.afkSince) / 60000); this.afkSince = 0; this.fire('afk_off', () => true, { afk_dauer: m + ' min' }); }
        }
        this.fire('param', r => {
            const [n, want] = r.arg.split('=');
            if (n.trim() !== name) return false;
            const w = want.trim().toLowerCase();
            if (typeof v === 'boolean') return (w === 'true' || w === '1' || w === 'an') === v;
            return Math.abs(Number(w.replace(',', '.')) - Number(v)) < 0.001;
        }, { param_name: name, param_wert: String(v) });
    }
    tick() {
        const d = new Date();
        const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        if (hm !== this.firedMinute) {
            this.firedMinute = hm;
            this.fire('time', r => r.arg.padStart(5, '0') === hm);
            const mins = Math.floor(d.getTime() / 60000);
            this.fire('interval', r => mins % Math.max(1, int(r.arg)) === 0);
        }
        if (Date.now() - this.musicAt > 10000) this.refreshMusic();
        this.poll();
    }
    /** 6.1: Flanken-Auslöser aus dem App-Zustand (Puls, Schlafmodus, Musik, Freunde) – nur beim Wechsel, nie beim ersten Blick */
    poll() {
        const s = this.seen, a = this.app;
        const h = a.heart && a.heart.active ? a.heart.bpm : 0;
        if (h) {
            const p = s.heart;
            if (p) {
                this.fire('heart_high', r => p <= int(r.arg) && h > int(r.arg), { puls: String(h) });
                this.fire('heart_low', r => p >= int(r.arg) && h < int(r.arg), { puls: String(h) });
            }
        }
        s.heart = h;
        const sl = !!(a.comfort && a.comfort.sleep);
        if (s.sleep !== null && sl !== s.sleep) this.fire(sl ? 'sleep_on' : 'sleep_off', () => true);
        s.sleep = sl;
        const mu = this.music || '';
        if (s.music !== null && mu && mu !== s.music) this.fire('music_change', () => true, { musik: mu });
        s.music = mu;
        let fr = null; try { fr = a.vrc && a.vrc.friendList ? a.vrc.friendList() : null; } catch (e) { fr = null; }
        if (!fr || !fr.length) return;
        const now = new Map(fr.map(f => [f.id, f]));
        if (s.friends) {
            const match = (r, f) => !r.arg || str(f.name).toLowerCase().includes(r.arg.toLowerCase());
            for (const f of fr) {
                const was = s.friends.get(f.id);
                if (was === undefined) continue;
                if (was === 'offline' && f.state !== 'offline') this.fire('friend_online', r => match(r, f), { spieler_name: str(f.name) });
                if (was !== 'offline' && f.state === 'offline') this.fire('friend_offline', r => match(r, f), { spieler_name: str(f.name) });
            }
        }
        s.friends = new Map([...now].map(([id, f]) => [id, f.state]));
    }
    /** 6.1: Regel per Name oder ID von Hand / Stream Deck auslösen (Abklingzeit gilt, Zeitfenster nicht) */
    find(key) { const k = str(key).trim().toLowerCase(); return this.rules().find(r => r.id === str(key).trim()) || this.rules().find(r => r.name.toLowerCase() === k); }
    async runRule(key) {
        const r = this.find(key);
        if (!r) throw new UserError('Regel „' + str(key) + '“ nicht gefunden.');
        if (!r.on) throw new UserError('Regel „' + r.name + '“ ist ausgeschaltet.');
        const t = Date.now();
        if (r.cooldown && t - (this.last.get(r.id) || 0) < r.cooldown * 1000) throw new UserError('Regel „' + r.name + '“ wartet noch (Abklingzeit).');
        this.last.set(r.id, t);
        const res = await this.app.macros.run(r.script, Object.assign({ welt_name: this.app.game.state.worldName || '' }, this.vars()));
        return { msg: '▶ ' + r.name + ' (' + res.steps + ' Schritte)', rule: r.id };
    }
    start() {
        this.app.game.osc.onMessage = (a, args) => this.onOsc(a, args);
        this.timer = setInterval(() => { try { this.tick(); } catch (e) { /* egal */ } }, 5000);
        if (this.timer.unref) this.timer.unref();
    }
    stop() { clearInterval(this.timer); }

    /** „Spielt gerade“: Fenstertitel der Musik-Programme (Windows) – z. B. „Künstler - Titel“ */
    refreshMusic() {
        this.musicAt = Date.now();
        if (process.env.NEXUS_MUSIC !== undefined) { this.music = process.env.NEXUS_MUSIC; return; }
        const m = this.app.media;
        if (m && m.proc) {   // Windows-Mediensteuerung: alles, was Windows als „wird abgespielt“ kennt (auch Browser)
            if (m.at && Date.now() - m.at < 15000 && m.text()) { this.music = m.text(); return; }   // sonst: Fenstertitel (ältere Player ohne Mediensteuerung)
        } else if (m && m.available() && this.app.settings.get('media.smtc') !== false) m.start();
        if (process.platform !== 'win32') return;
        execFile('tasklist', ['/v', '/fo', 'csv', '/nh'], { windowsHide: true, timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (e, out) => {
            if (e) return;
            let found = '';
            for (const line of String(out).split(/\r?\n/)) {
                const cols = line.match(/"([^"]*)"/g);
                if (!cols || cols.length < 9) continue;
                const exe = cols[0].slice(1, -1), title = cols[cols.length - 1].slice(1, -1).trim();
                if (!PLAYERS.some(p => p.toLowerCase() === exe.toLowerCase()) || IDLE_TITLES.test(title)) continue;
                found = title.replace(/ - (VLC media player|foobar2000|AIMP|MusicBee)$/i, '');
                break;
            }
            this.music = found;
        });
    }
    vars() {
        const afk = this.afkSince ? Math.round((Date.now() - this.afkSince) / 60000) : 0;
        const s = this.app.media ? this.app.media.now() : null, on = s && s.status === 'playing';
        const { fmt } = require('./media');
        const bar = (f, n) => { const k = Math.max(0, Math.min(n, Math.round(f * n))); return '▰'.repeat(k) + '▱'.repeat(n - k); };
        return { musik: this.music || '–', musik_titel: on ? s.title : '–', musik_kuenstler: on ? s.artist || '–' : '–', musik_app: on ? s.app : '–',
            musik_zeit: on && s.dur ? fmt(s.pos) + '/' + fmt(s.dur) : '', musik_balken: on && s.dur ? bar(s.pos / s.dur, 10) : '', afk: this.afkSince ? 'AFK' : '', afk_zeit: afk + ' min', spieler_neu: this.lastPlayer || '–' };
    }
    async action(act, input) {
        switch (act) {
            case 'auto_list': return { rules: this.rules(), triggers: TRIGGERS, music: this.music, afk: !!this.afkSince };
            case 'auto_save': return { rules: this.save(input), msg: 'Regel gespeichert.' };
            case 'auto_delete': return { rules: this.remove(input.id) };
            case 'auto_toggle': { const r = this.find(input.id); return { rules: this.toggle(r ? r.id : input.id) }; }
            case 'auto_export': {   // 6.3: Regeln teilen (Datei)
                const ids = str(input.ids).split(',').filter(Boolean), l = this.rules().filter(r => !ids.length || ids.includes(r.id));
                return { app: 'VRC Nexus', kind: 'automation', version: require('./vrchat').VERSION, rules: l.map(({ id, ...r }) => r) };
            }
            case 'auto_import': {
                let d = input.data;
                if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { throw new UserError('Keine gültige Regel-Datei (JSON).'); } }
                const list = Array.isArray(d) ? d : d && Array.isArray(d.rules) ? d.rules : null;
                if (!list || !list.length) throw new UserError('In der Datei sind keine Regeln.');
                if (str(input.mode) === 'replace') this.write([]);
                let ok = 0; const bad = [];
                for (const r of list.slice(0, 100)) { try { this.save(Object.assign({}, r, { id: '', on: false })); ok++; } catch (e) { bad.push(str(r && r.name) + ': ' + e.message); } }   // importierte Regeln starten AUS
                return { rules: this.rules(), msg: ok + ' Regel(n) importiert – zur Sicherheit ausgeschaltet, bitte prüfen und einschalten.' + (bad.length ? ' Übersprungen: ' + bad.slice(0, 3).join('; ') : '') };
            }
            case 'auto_run': return Object.assign({ rules: this.rules() }, await this.runRule(input.id || input.name));
            case 'auto_test': {
                const r = this.rules().find(x => x.id === str(input.id));
                if (!r) throw new UserError('Regel nicht gefunden.');
                const res = await this.app.macros.run(r.script, { spieler_name: 'Testperson', welt_name: this.app.game.state.worldName || 'Testwelt', param_name: 'Test', param_wert: '1', afk_dauer: '5 min' });
                return { msg: 'Test: ' + res.steps + ' Schritte ausgeführt.' };
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Automation, TRIGGERS, inWindow };
