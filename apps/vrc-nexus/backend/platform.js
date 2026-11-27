'use strict';
/*
 * 8.0.4: Linux / Steam Deck / macOS – wo liegen die VRChat-Daten?
 *   • Windows: %USERPROFILE%\AppData\LocalLow\VRChat\VRChat
 *   • Linux / Steam Deck: VRChat läuft über Proton – die Daten liegen im Proton-Präfix der App 438100
 *     (…/steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat),
 *     in jeder Steam-Bibliothek (auch SD-Karte) und auch bei Steam als Flatpak.
 *   • macOS: VRChat gibt es dort nicht – Nexus läuft ohne Spiel-Log (Freunde, Clubs, Handy, Uhr …).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = '438100';
const TAIL = ['pfx', 'drive_c', 'users', 'steamuser', 'AppData', 'LocalLow', 'VRChat', 'VRChat'];

/** Steam-Wurzeln unter Linux (normal, alter Link, Flatpak, Snap) */
function steamRoots(home) {
    return [path.join(home, '.steam', 'steam'), path.join(home, '.local', 'share', 'Steam'), path.join(home, '.steam', 'root'),
        path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'), path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam')];
}
/** alle Steam-Bibliotheken (libraryfolders.vdf – z. B. SD-Karte am Steam Deck) */
function libraries(home, exists = fs.existsSync, read = f => fs.readFileSync(f, 'utf8')) {
    const out = [];
    for (const r of steamRoots(home)) {
        if (!exists(r)) continue;
        out.push(r);
        const vdf = path.join(r, 'steamapps', 'libraryfolders.vdf');
        if (!exists(vdf)) continue;
        try { for (const m of read(vdf).matchAll(/"path"\s+"([^"]+)"/g)) out.push(m[1].replace(/\\\\/g, '\\')); } catch (e) { /* egal */ }
    }
    return [...new Set(out)];
}
/** VRChat-Datenordner (mit Log-Dateien, config.json, OSC/) */
function vrchatDir(o = {}) {
    const plat = o.platform || process.platform, home = o.home || os.homedir(), env = o.env || process.env, exists = o.exists || fs.existsSync;
    if (env.NEXUS_VRCHAT_DIR) return env.NEXUS_VRCHAT_DIR;
    if (plat === 'win32') return path.join(env.USERPROFILE || home, 'AppData', 'LocalLow', 'VRChat', 'VRChat');
    if (plat === 'linux') {
        const cands = libraries(home, exists, o.read).map(l => path.join(l, 'steamapps', 'compatdata', APP, ...TAIL));
        return cands.find(c => exists(c)) || cands[0] || path.join(home, '.steam', 'steam', 'steamapps', 'compatdata', APP, ...TAIL);
    }
    return path.join(home, 'AppData', 'LocalLow', 'VRChat', 'VRChat');   // macOS: gibt es nicht – bleibt leer, Anzeige erklärt es
}
/** Steam Deck erkennen (SteamOS / Gamescope) */
function isSteamDeck(o = {}) {
    const env = o.env || process.env, read = o.read || (f => fs.readFileSync(f, 'utf8'));
    if ((o.platform || process.platform) !== 'linux') return false;
    if (env.SteamDeck === '1' || env.SteamOS === '1' || /gamescope/i.test(env.XDG_CURRENT_DESKTOP || '')) return true;
    try { return /steamos/i.test(read('/etc/os-release')); } catch (e) { return false; }
}
function info(o = {}) {
    const plat = o.platform || process.platform;
    return { platform: plat, label: plat === 'win32' ? 'Windows' : plat === 'darwin' ? 'macOS' : isSteamDeck(o) ? 'Steam Deck' : 'Linux', vrchat: plat !== 'darwin', deck: isSteamDeck(o), dir: vrchatDir(o) };
}
module.exports = { vrchatDir, libraries, isSteamDeck, info, APP };
