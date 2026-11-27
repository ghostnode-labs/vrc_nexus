'use strict';
/*
 * VRC Nexus Desktop – eigenständige Windows-App (ohne Server).
 * Die Oberfläche läuft unter app://nexus/, alle Anfragen an „nexus.php“ beantwortet das eingebaute Backend (backend/app.js).
 * Läuft im Infobereich weiter (Verlauf, Statistik, Spiel-Log & OSC zeichnen dann weiter auf).
 */
const TITLEBAR_H = 34;   // Höhe der eigenen Titelleiste (Windows)
const { app, BrowserWindow, Menu, Tray, Notification, protocol, shell, safeStorage, nativeImage, dialog, globalShortcut, session, desktopCapturer, clipboard, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { openDatabase } = require('./backend/db');
const { NexusApp, handleWebRequest } = require('./backend/app');

// 5.1.1: Fehler im Hauptprozess nicht als Absturz-Dialog zeigen, sondern protokollieren (userData/crash.log) und einmal kurz melden
let crashNoticeAt = 0;
function logCrash(kind, e) {
    const msg = '[' + new Date().toISOString() + '] ' + kind + ': ' + (e && e.stack || e) + '\n';
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), msg); } catch (x) { /* egal */ }
    console.error(msg);
    if (Date.now() - crashNoticeAt > 600000 && Notification.isSupported()) {
        crashNoticeAt = Date.now();
        try { new Notification({ title: 'VRC Nexus', body: 'Ein interner Fehler wurde abgefangen – Nexus läuft weiter. Details: crash.log im Datenordner.' }).show(); } catch (x) { /* egal */ }
    }
}
process.on('uncaughtException', e => logCrash('uncaughtException', e));
process.on('unhandledRejection', e => logCrash('unhandledRejection', e));

const RENDERER = path.join(__dirname, 'renderer');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('de.ghostnode.vrcnexus');

// Einstellungen, die vor dem Start gelten müssen (Spiegel der Datenbank-Einstellungen)
const PREFS_FILE = path.join(app.getPath('userData'), 'prefs.json');
let prefs = {};
try { prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')); } catch (e) { prefs = {}; }
if (prefs['sys.hw_accel'] === false) app.disableHardwareAcceleration();

let win = null, tray = null, nexus = null, db = null, quitting = false, vr = null;
let miniWin = null;   // 6.4: Mini-Modus
const { VrOverlay } = require('./vroverlay');

/** Sitzungs-Cookie verschlüsseln: Windows-Schlüsselspeicher (DPAPI) über Electron safeStorage */
const crypt = {
    encrypt: s => (safeStorage.isEncryptionAvailable() ? 'dpapi:' + safeStorage.encryptString(s).toString('base64') : 'plain:' + Buffer.from(s).toString('base64')),
    decrypt: s => {
        if (s.startsWith('dpapi:')) return safeStorage.decryptString(Buffer.from(s.slice(6), 'base64'));
        if (s.startsWith('plain:')) return Buffer.from(s.slice(6), 'base64').toString();
        return '{}';
    },
};

function notify(title, body, silent) {
    if (Notification.isSupported()) new Notification({ title, body, silent: !!silent, icon: path.join(RENDERER, 'icon.png') }).show();
}

/** Hilfsfunktionen für backend/tools.js */
const host = {
    userData: app.getPath('userData'),
    pluginFile: app.isPackaged ? path.join(process.resourcesPath, 'VRC-Nexus.streamDeckPlugin') : path.join(__dirname, 'streamdeck', 'VRC-Nexus.streamDeckPlugin'),
    openPath: p => shell.openPath(p),
    openExternal: url => shell.openExternal(url),
    copy: text => clipboard.writeText(String(text || '')),
    vrFps: () => (vr && vr.fps && Date.now() - vr.fps.at < 5000 ? vr.fps : null),
    // 7.3.4: Leistungsmessung – alle Prozesse von VRC Nexus; VRChat zum Vergleich (tasklist, ohne Konsolenfenster)
    appMetrics: () => app.getAppMetrics(),
    onBattery: () => { try { return powerMonitor.isOnBatteryPower(); } catch (e) { return false; } },   // 8.0.1 Energie-Modus
    execFile: (cmd, args, ms) => new Promise((res, rej) => execFile(cmd, args, { timeout: ms || 3000, windowsHide: true }, (e, out) => (e ? rej(e) : res(out)))),
    setLoginItem: on => { if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on, args: ['--minimized'] }); },
    spawn: (exe, args) => spawn(exe, args, { detached: true, stdio: 'ignore', cwd: path.dirname(exe) }).unref(),
    speak: text => { if (win) win.webContents.executeJavaScript('window.speechSynthesis && speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(' + JSON.stringify(String(text).slice(0, 300)) + '), { lang: "de-DE" }))').catch(() => {}); },
    showUser: id => { if (!win) return; win.show(); win.focus(); win.webContents.executeJavaScript('window.NexusUI && NexusUI.openUser(' + JSON.stringify(id) + ')').catch(() => {}); },
    showTab: tab => { if (!win) return; win.show(); win.focus(); if (tab) win.webContents.executeJavaScript('window.NexusUI && NexusUI.tab(' + JSON.stringify(tab) + ')').catch(() => {}); },
    setTray: text => { if (tray) tray.setToolTip(text); },
    /** Farben der Fensterknöpfe ans Theme anpassen (nur Windows) */
    setTitleBar: o => {
        const hex = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : null;
        if (!win || process.platform !== 'win32' || !win.setTitleBarOverlay || !hex(o && o.color)) return;
        try { win.setTitleBarOverlay({ color: hex(o.color), symbolColor: hex(o.symbol) || '#cbd5e1', height: TITLEBAR_H }); } catch (e) { /* ältere Windows-Versionen */ }
    },
    /** gleichmäßig weißen Rand rundherum abschneiden (Prints) */
    trimWhite: async buf => {
        const im = nativeImage.createFromBuffer(buf);
        const { width: w, height: h } = im.getSize();
        if (!w || !h) return null;
        const px = im.toBitmap();   // BGRA
        const white = (x, y) => { const i = (y * w + x) * 4; return px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235; };
        const rowWhite = y => { for (let x = 0; x < w; x += 2) if (!white(x, y)) return false; return true; };
        const colWhite = (x, y0, y1) => { for (let y = y0; y < y1; y += 2) if (!white(x, y)) return false; return true; };
        let top = 0, bot = h - 1, left = 0, right = w - 1;
        while (top < bot && rowWhite(top)) top++;
        while (bot > top && rowWhite(bot)) bot--;
        while (left < right && colWhite(left, top, bot)) left++;
        while (right > left && colWhite(right, top, bot)) right--;
        if (right - left < w * 0.3 || bot - top < h * 0.3) return null;
        if (!top && !left && bot === h - 1 && right === w - 1) return null;
        return im.crop({ x: left, y: top, width: right - left + 1, height: bot - top + 1 }).toPNG();
    },
    thumbnail: async file => (await nativeImage.createThumbnailFromPath(file, { width: 360, height: 220 })).toJPEG(80),
    /** Update installieren: Installer still ausführen bzw. portable EXE ersetzen, dann neu starten */
    installUpdate: async (assets, progress) => {
        const portable = process.env.PORTABLE_EXECUTABLE_FILE;
        const a = portable ? assets.portable : assets.setup;
        if (!a) throw new Error('Im Release fehlt die passende Datei (' + (portable ? 'portable' : 'Setup') + ').');
        const res = await fetch(a.url, { redirect: 'follow' });
        if (!res.ok || !res.body) throw new Error('Download fehlgeschlagen (HTTP ' + res.status + ').');
        const file = path.join(app.getPath('temp'), a.name);
        const out = fs.createWriteStream(file);
        let got = 0;
        try {
            for await (const chunk of res.body) {
                got += chunk.length;
                if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
                const total = a.size || Number(res.headers.get('content-length')) || 0;
                progress(got, total);
                if (win && total) win.setProgressBar(Math.min(1, got / total));   // Fortschritt auch am Taskleisten-Symbol
            }
        } catch (e) { if (win) win.setProgressBar(-1); out.destroy(); throw e; }
        await new Promise(r => out.end(r));
        if (win) win.setProgressBar(2);   // unbestimmt: wird installiert
        if (a.size && got !== a.size) { if (win) win.setProgressBar(-1); throw new Error('Download unvollständig – bitte erneut versuchen.'); }
        if (portable) {
            // die laufende EXE kann sich nicht selbst ersetzen → kleines Skript wartet, kopiert und startet neu
            const cmd = path.join(app.getPath('temp'), 'vrc-nexus-update.cmd');
            fs.writeFileSync(cmd, ['@echo off', 'set n=0', ':retry', 'ping 127.0.0.1 -n 2 > nul', 'copy /y "' + file + '" "' + portable + '" > nul',
                'if errorlevel 1 (set /a n+=1 & if %n% lss 30 goto retry)', 'start "" "' + portable + '"', 'del "' + file + '"'].join('\r\n'));
            spawn('cmd.exe', ['/c', cmd], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } else {
            spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
        }
        setTimeout(() => { quitting = true; app.quit(); }, 1200);
    },
    /** 5.3: Panik von Uhr/Handy → Oberfläche verlässt NSFW sofort */
    nsfwOffUi: () => { if (win) win.webContents.executeJavaScript('window.NexusNsfw && NexusNsfw.offUi && NexusNsfw.offUi()').catch(() => {}); },
    /** Spracheingabe: Aufnahme in der Oberfläche starten/stoppen */
    speechCmd: op => { if (win) win.webContents.executeJavaScript('window.NexusSpeech && NexusSpeech.cmd(' + JSON.stringify(op) + ')').catch(() => {}); },
    /** globale Taste für die Spracheingabe (auch wenn VRChat im Vordergrund ist) */
    applySpeech: cfg => {
        if (host.speechKey) { try { globalShortcut.unregister(host.speechKey); } catch (e) { /* egal */ } host.speechKey = ''; }
        if (!cfg || !cfg.enabled || !cfg.hotkey) return;
        try { if (globalShortcut.register(cfg.hotkey, () => { try { nexus.speech.ptt('toggle'); } catch (e) { notify('VRC Nexus', e.message); } })) host.speechKey = cfg.hotkey; }
        catch (e) { notify('VRC Nexus', 'Tastenkürzel „' + cfg.hotkey + '“ ungültig: ' + e.message); }
    },
    overlayState: () => (vr ? vr.state() : null),
    /** 3.4 Multiaccount: nach dem Konto-Wechsel neu starten (Datenbank wird beim Beenden gespeichert) */
    restart: () => { quitting = true; app.relaunch(); app.quit(); },
    overlayToggle: async on => { if (!vr) throw new Error('Overlay nicht verfügbar.'); return vr.toggle(on); },
    spaceCmd: op => { if (!vr) throw new Error('SteamVR-Helfer nicht verfügbar.'); return vr.spaceCmd(op); },
    /** 6.3: freie globale Tastenkürzel */
    applyKeys: list => {
        for (const a of host.keyList || []) { try { globalShortcut.unregister(a); } catch (e) { /* egal */ } }
        host.keyList = [];
        for (const h of list || []) {
            try { if (globalShortcut.register(h.accel, () => { nexus.ctools.hotkey(h.key).then(r => { if (r && r.msg) notify('VRC Nexus', r.msg); }).catch(e => notify('VRC Nexus', e.message)); })) host.keyList.push(h.accel); else notify('VRC Nexus', 'Tastenkürzel „' + h.accel + '“ ist schon belegt.'); }
            catch (e) { notify('VRC Nexus', 'Tastenkürzel „' + h.accel + '“ ungültig.'); }
        }
    },
    show: () => { if (win) { win.show(); win.focus(); } },
    /** 6.4: Mini-Modus – kleines, immer sichtbares Fenster mit Puls, Welt und Schnellaktionen */
    miniToggle: on => {
        if (miniWin && !miniWin.isDestroyed()) { if (on === true) { miniWin.show(); return true; } miniWin.close(); miniWin = null; return false; }
        if (on === false) return false;
        const b = prefs.mini_bounds || {};
        miniWin = new BrowserWindow({ width: b.width || 300, height: b.height || 230, x: b.x, y: b.y, minWidth: 220, minHeight: 150, frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: true,
            backgroundColor: '#040609', title: 'VRC Nexus Mini', icon: path.join(RENDERER, 'icon.png'), webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
        miniWin.setAlwaysOnTop(true, 'screen-saver');
        miniWin.loadURL('app://nexus/mini.html');
        miniWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        miniWin.webContents.on('will-navigate', e => e.preventDefault());
        const keep = () => { try { prefs.mini_bounds = miniWin.getBounds(); fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs)); } catch (e) { /* egal */ } };
        miniWin.on('moved', keep); miniWin.on('resized', keep);
        miniWin.on('closed', () => { miniWin = null; });
        return true;
    },
    applySettings: (changed, s) => {
        if (changed.includes('*') || changed.some(k => k.startsWith('keys.'))) host.applyKeys(nexus && nexus.ctools ? nexus.ctools.hotkeys() : []);
        if (vr && (changed.includes('*') || changed.some(k => /^vr\.(overlay|space|fly|turn|walk)/.test(k)))) vr.apply(s);   // inkl. vr.overlay_hud* und 3.3 VR-Bewegung
        prefs = { mini_bounds: prefs.mini_bounds, 'sys.hw_accel': s['sys.hw_accel'], 'sys.close_to_tray': s['sys.close_to_tray'], 'sys.start_minimized': s['sys.start_minimized'], 'adv.devtools': s['adv.devtools'] };
        try { fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs)); } catch (e) { /* egal */ }
        if (tray && changed.includes('sys.autostart')) tray.setContextMenu(trayMenu());
    },
};

function createWindow() {
    win = new BrowserWindow({
        width: 1380, height: 900, minWidth: 900, minHeight: 600, backgroundColor: '#040609', title: 'VRC Nexus', icon: path.join(RENDERER, 'icon.png'),
        autoHideMenuBar: true, show: !(process.argv.includes('--minimized') && prefs['sys.start_minimized'] !== false),
        // 3.1.3: Titelleiste im App-Design – Windows zeichnet nur noch die Fensterknöpfe (in den Theme-Farben), den Rest macht die Oberfläche
        ...(process.platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#040609', symbolColor: '#cbd5e1', height: TITLEBAR_H } } : {}),
        webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
    });
    win.loadURL('app://nexus/');
    // Fremde Links im Browser bzw. VRChat öffnen, nie in der App
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?|vrchat):/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://nexus/')) { e.preventDefault(); if (/^(https?|vrchat):/i.test(url)) shell.openExternal(url); } });
    win.on('close', e => { if (!quitting && prefs['sys.close_to_tray'] !== false) { e.preventDefault(); win.hide(); } else { quitting = true; app.quit(); } });
    win.webContents.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && input.key === 'F12' && prefs['adv.devtools']) win.webContents.toggleDevTools(); });
    win.webContents.session.on('will-download', (e, item) => {
        item.setSaveDialogOptions({ title: 'Speichern unter', defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    });
}

function createTray() {
    tray = new Tray(nativeImage.createFromPath(path.join(RENDERER, 'icon.png')).resize({ width: 16, height: 16 }));
    tray.setToolTip('VRC Nexus');
    tray.setContextMenu(trayMenu());
    tray.on('click', () => { if (win.isVisible()) win.focus(); else win.show(); });
}

function trayMenu() {
    return Menu.buildFromTemplate([
        { label: 'VRC Nexus öffnen', click: () => { win.show(); win.focus(); } },
        { type: 'separator' },
        { label: '🪟 Mini-Modus', click: () => host.miniToggle() },
        { label: '👥 Spielerliste', click: () => host.showTab('players') },
        { label: '🧰 Werkzeuge', click: () => host.showTab('tools') },
        { label: '▶ VRChat starten', click: () => nexus && nexus.tools.launch('').catch(e => notify('VRC Nexus', e.message)) },
        { label: '⬆ Nach Updates suchen', click: () => nexus && nexus.updater.check().then(st => notify('VRC Nexus', st.available ? 'Version ' + st.version + ' ist verfügbar – Einstellungen → System → Jetzt aktualisieren.' : 'Du hast die neueste Version (' + st.current + ').')).catch(e => notify('VRC Nexus', e.message)) },
        { type: 'separator' },
        { label: 'Mit Windows starten', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
          click: m => { nexus.settings.save({ 'sys.autostart': m.checked }); } },
        { label: 'Datenordner öffnen', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { label: 'Beenden', click: () => { quitting = true; app.quit(); } },
    ]);
}

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // Übersetzer „VRChat → Text“: getDisplayMedia liefert den Windows-Systemton (Loopback) – das Bild wird in der Seite sofort verworfen
    try {
        session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
            desktopCapturer.getSources({ types: ['screen'] }).then(src => cb(src[0] ? { video: src[0], audio: 'loopback' } : {})).catch(() => cb({}));
        });
    } catch (e) { /* ältere Electron-Version */ }
    try {
        // 3.4 Multiaccount: jedes VRChat-Konto hat seine eigene Datenbank (profiles.json im Datenordner)
        const prof = require('./backend/profiles');
        db = await openDatabase(prof.currentFile(app.getPath('userData')).file);
        prof.applySeed(app.getPath('userData'), db);
    } catch (e) {
        dialog.showErrorBox('VRC Nexus', 'Die Datenbank konnte nicht geöffnet werden:\n' + e.message);
        app.exit(1);
        return;
    }
    nexus = new NexusApp({ db, crypt, notify, host, oscquery: true, licenseTimer: true });
    nexus.game.start(Number(nexus.settings.get('sys.log_poll_ms')) || 1000);
    nexus.tools.start();
    nexus.link.start();
    nexus.updater.start();
    host.applySpeech(nexus.speech.cfg());
    if (db.restored) setTimeout(() => notify('VRC Nexus', '☁ Cloud-Sicherung wurde eingespielt. Die vorherigen Daten liegen als „nexus.sqlite.vor-wiederherstellung“ im Datenordner.'), 3000);
    // SteamVR-Overlay: Vorschaubild muss als echte Datei vorliegen (nicht im asar-Archiv)
    const ovIcon = path.join(app.getPath('userData'), 'overlay-icon.png');
    try { fs.writeFileSync(ovIcon, fs.readFileSync(path.join(RENDERER, 'icon.png'))); } catch (e) { /* egal */ }
    vr = new VrOverlay({ exe: app.isPackaged ? path.join(process.resourcesPath, 'overlay', 'NexusOverlay.exe') : path.join(__dirname, 'overlay', 'bin', 'Release', 'net48', 'NexusOverlay.exe'),
        icon: ovIcon, url: 'app://nexus/overlay.html', hudUrl: 'app://nexus/hud.html', notify,
        saveSetting: (k, v) => { try { nexus.settings.save({ [k]: v }); } catch (e) { /* egal */ } } });
    vr.apply(nexus.settings.all());
    protocol.handle('app', async request => {
        const url = new URL(request.url);
        if (url.pathname === '/' || url.pathname === '/nexus.php' || url.pathname === '/index.html') {
            const r = await handleWebRequest(nexus, request);
            return new Response(r.body, { status: r.status, headers: r.headers });
        }
        const file = path.normalize(path.join(RENDERER, decodeURIComponent(url.pathname)));
        if (!file.startsWith(RENDERER + path.sep) || !fs.existsSync(file) || path.basename(file) === 'page.html') return new Response('Nicht gefunden', { status: 404 });
        return new Response(fs.readFileSync(file), { headers: { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' } });
    });
    createWindow();
    createTray();
    // Weltweite Spielerzahl alle 15 min messen (öffentlich, ohne Anmeldung)
    const sample = () => { if (nexus.settings.get('sys.global_sample')) nexus.x.visitsSample().catch(() => {}); };
    sample();
    setInterval(sample, 15 * 60 * 1000);
});

app.on('before-quit', () => { quitting = true; try { if (vr) vr.stop(); if (nexus) { nexus.game.stop(); nexus.tools.stop(); } if (db) db.close(); } catch (e) { /* egal */ } });
app.on('window-all-closed', () => { /* läuft im Infobereich weiter */ });
