'use strict';
/*
 * 4.3: Wallpaper Engine über die Kommandozeile steuern – für den Panik-Knopf (harmloses Profil, Pause oder Ton aus)
 * und die Entwarnung (zurück). Befehle: wallpaper64.exe -control pause|play|mute|unmute|applyProfile -profile <Name>
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { str, UserError } = require('./util');

const MODES = ['off', 'pause', 'mute', 'profile'];

class Wallpaper {
    constructor(app) { this.app = app; this.exec = (exe, args) => new Promise((res, rej) => execFile(exe, args, { windowsHide: true, timeout: 8000 }, e => (e ? rej(e) : res()))); }

    /** Steam-Hauptordner (Registry, sonst Standardpfad) */
    steamRoot() {
        if (process.platform !== 'win32') return Promise.resolve('');
        return new Promise(r => execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true }, (e, out) =>
            r(((e ? '' : (/SteamPath\s+REG_SZ\s+(.+)/.exec(out) || [])[1]) || 'C:\\Program Files (x86)\\Steam').trim().replace(/\//g, '\\'))));
    }
    /** wallpaper64.exe finden: eigener Pfad → alle Steam-Bibliotheken */
    async exe(own) {
        const o = str(own).trim().replace(/^"|"$/g, '');
        if (o) return fs.existsSync(o) ? o : '';
        const root = await this.steamRoot();
        if (!root) return '';
        const libs = [root];
        try {
            const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
            for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.push(m[1].replace(/\\\\/g, '\\'));
        } catch (e) { /* nur Hauptbibliothek */ }
        for (const l of libs) for (const f of ['wallpaper64.exe', 'wallpaper32.exe']) {
            const p = path.join(l, 'steamapps', 'common', 'wallpaper_engine', f);
            if (fs.existsSync(p)) return p;
        }
        return '';
    }
    async run(c, args) {
        const exe = await this.exe(c.panic_we_path);
        if (!exe) throw new UserError('Wallpaper Engine nicht gefunden – Pfad zu wallpaper64.exe eintragen.');
        await this.exec(exe, ['-control', ...args]);
    }
    /** Panik: harmloses Profil laden, anhalten oder Ton aus */
    async panic(c) {
        if (c.panic_we === 'pause') { await this.run(c, ['pause']); return 'Wallpaper angehalten'; }
        if (c.panic_we === 'mute') { await this.run(c, ['mute']); return 'Wallpaper stumm'; }
        if (c.panic_we === 'profile') {
            if (!c.panic_we_profile) throw new UserError('Kein Wallpaper-Profil für die Panik eingetragen.');
            await this.run(c, ['applyProfile', '-profile', c.panic_we_profile]); return 'Wallpaper-Profil „' + c.panic_we_profile + '“';
        }
        return '';
    }
    /** Entwarnung: wieder abspielen / Ton an / vorheriges Profil */
    async restore(c) {
        if (c.panic_we === 'pause') { await this.run(c, ['play']); return 'Wallpaper läuft wieder'; }
        if (c.panic_we === 'mute') { await this.run(c, ['unmute']); return 'Wallpaper-Ton an'; }
        if (c.panic_we === 'profile' && c.panic_we_back) { await this.run(c, ['applyProfile', '-profile', c.panic_we_back]); return 'Wallpaper-Profil „' + c.panic_we_back + '“'; }
        return '';
    }
}

module.exports = { Wallpaper, MODES };
