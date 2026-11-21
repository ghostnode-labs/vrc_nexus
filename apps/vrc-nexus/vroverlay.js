'use strict';
/*
 * SteamVR-Overlay (nur Electron/Windows):
 *  - zeichnet renderer/overlay.html unsichtbar (Offscreen-Rendering, 1024 × 640)
 *  - schickt jedes neue Bild an NexusOverlay.exe (OpenVR) → eigener Reiter im SteamVR-Dashboard + Handgelenk/frei im Raum
 *  - Laser-Klicks/Scrollen aus SteamVR kommen als Maus-Ereignisse zurück
 * Startet automatisch, sobald SteamVR (vrserver.exe) läuft und das Overlay eingeschaltet ist.
 * 3.3: derselbe Helfer macht die VR-Bewegung (Space Flight / Turn / Walk) – auch ohne Overlay („nodash“: kein Dashboard-Reiter, kein Fenster).
 */
const { VrSpace } = require('./backend/vrspace');
const { BrowserWindow } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const W = 1024, H = 640;
const HW = 768, HH = 320;   // HUD (Infos & Untertitel)

class VrOverlay {
    constructor(opts) {
        this.exe = opts.exe;             // Pfad zu NexusOverlay.exe
        this.icon = opts.icon;           // Vorschaubild für den Dashboard-Reiter
        this.url = opts.url;             // app://nexus/overlay.html
        this.hudUrl = opts.hudUrl || '';  // app://nexus/hud.html
        this.hudWin = null;
        this.notify = opts.notify || (() => {});
        this.cfg = {};
        this.proc = null;
        this.win = null;
        this.visible = false;
        this.status = 'aus';
        this.lastFrame = 0;
        this.pendingFrame = null;
        this.watch = null;
        this.failures = 0;
        this.saveSetting = opts.saveSetting || (() => {});
        this.space = null; this.spaceErr = ''; this.vrchat = false;
    }
    /** VR-Bewegung gewünscht? (eingeschaltet oder „beim Start von VRChat in VR“ und VRChat läuft) */
    wantSpace() { const s = this.cfg; return !!s['vr.space'] || (!!s['vr.space_autostart'] && this.vrchat); }
    wantHelper() { return !!this.cfg['vr.overlay'] || this.wantSpace(); }
    sendSpace() {
        if (!this.proc) return;
        const c = VrSpace.command(this.cfg);
        c.on = this.wantSpace() ? 1 : 0;
        this.cmd(c);
    }
    spaceState() {
        const sp = this.space || {};
        return { available: true, running: !!this.proc, on: !!this.proc && this.wantSpace(), auto: !this.cfg['vr.space'] && this.wantSpace(), status: this.proc ? (this.spaceErr ? '⚠ ' + this.spaceErr : this.status) : this.status,
            x: sp.x || 0, y: sp.y || 0, z: sp.z || 0, yaw: sp.yaw || 0, pitch: sp.pitch || 0, roll: sp.roll || 0, drag: !!sp.drag, gravity: !!this.cfg['vr.fly_gravity'] };
    }
    spaceCmd(op) {
        if (op === 'reset') { if (!this.proc) throw new Error('Der SteamVR-Helfer läuft nicht.'); this.cmd({ cmd: 'space_reset' }); return; }
        throw new Error('Unbekannter Befehl.');
    }
    state() {
        const li = this.lastInput;
        return { space: this.spaceState(), enabled: !!this.cfg['vr.overlay'], running: !!this.proc, visible: this.visible, mode: this.cfg['vr.overlay_mode'] || 'wrist',
            status: this.status + (this.proc && this.inputMsg ? ' · ⚠ Controller-Taste nicht verfügbar (' + this.inputMsg + ')' : '') + (li ? ' · letzte Laser-Eingabe ' + li.t + ' bei ' + li.x + ',' + li.y + ' (' + Math.round((Date.now() - li.at) / 1000) + ' s her)' : this.proc ? ' · noch keine Laser-Eingabe empfangen' : '') };
    }

    apply(s) {
        this.cfg = s;
        clearInterval(this.watch);
        if (!s['vr.overlay'] && !s['vr.space'] && !s['vr.space_autostart']) { this.stop(); this.status = 'aus'; return; }
        if (!fs.existsSync(this.exe)) { this.status = 'NexusOverlay.exe fehlt (nur im Windows-Build enthalten)'; return; }
        // alle 15 s schauen, ob SteamVR läuft (und für „beim Start von VRChat“: ob VRChat läuft)
        const check = () => Promise.all([this.steamVrRunning(), s['vr.space_autostart'] ? this.vrchatRunning() : Promise.resolve(false)]).then(([on, vrc]) => {
            const was = this.wantSpace();
            this.vrchat = vrc;
            if (this.proc && this.dash !== !!this.cfg['vr.overlay']) this.stop();          // Overlay an/aus → Helfer mit/ohne Dashboard neu starten
            if (on && !this.proc && this.wantHelper()) this.start();
            if (this.proc && (!on || !this.wantHelper())) this.stop();
            if (!on) this.status = 'wartet auf SteamVR';
            else if (!this.wantHelper()) this.status = 'wartet auf VRChat';
            if (this.proc && was !== this.wantSpace()) this.sendSpace();
        });
        check();
        this.watch = setInterval(check, 15000);
        if (this.proc) { this.sendLayout(); this.syncHud(); this.sendSpace(); }
        if (this.win) this.win.webContents.setFrameRate(Math.max(1, Math.min(30, Number(s['vr.overlay_fps']) || 10)));
    }
    vrchatRunning() {
        if (process.platform !== 'win32') return Promise.resolve(false);
        return new Promise(r => execFile('tasklist', ['/fi', 'imagename eq VRChat.exe', '/fo', 'csv', '/nh'], { windowsHide: true, timeout: 8000 }, (e, out) => r(!e && /vrchat\.exe/i.test(String(out)))));
    }
    steamVrRunning() {
        if (process.platform !== 'win32') return Promise.resolve(false);
        return new Promise(r => execFile('tasklist', ['/fi', 'imagename eq vrserver.exe', '/fo', 'csv', '/nh'], { windowsHide: true, timeout: 8000 }, (e, out) => r(!e && /vrserver\.exe/i.test(String(out)))));
    }

    start() {
        if (this.proc || this.failures > 5) return;
        this.status = 'startet …';
        this.dash = !!this.cfg['vr.overlay'];
        this.space = null; this.spaceErr = '';
        const p = spawn(this.exe, this.dash ? [this.icon] : [this.icon, 'nodash'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, cwd: path.dirname(this.exe) });
        this.proc = p;
        let buf = '';
        p.stdout.setEncoding('utf8');
        p.stdout.on('data', d => {
            buf += d;
            let i;
            while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this.onEvent(line); }
        });
        p.stdin.on('error', () => {});
        p.on('exit', code => {
            if (this.proc === p) this.proc = null;
            this.visible = false;
            if (code && code !== 0) { this.failures++; this.status = this.status.startsWith('⚠') ? this.status : '⚠ beendet (Code ' + code + ')'; }
            else this.status = 'SteamVR beendet';
            this.closeWindow();
        });
        if (this.dash) this.openWindow();
    }
    stop() {
        if (this.proc) { try { this.cmd({ cmd: 'quit' }); this.proc.stdin.end(); } catch (e) { /* egal */ } const p = this.proc; setTimeout(() => { try { p.kill(); } catch (e) { /* egal */ } }, 1500); this.proc = null; }
        this.visible = false;
        this.closeWindow();
    }
    openWindow() {
        if (this.win) return;
        this.win = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
            webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
        this.win.webContents.setFrameRate(Math.max(1, Math.min(30, Number(this.cfg['vr.overlay_fps']) || 10)));
        this.win.webContents.on('paint', (e, dirty, image) => this.frame(image));
        this.win.loadURL(this.url);
    }
    closeWindow() { if (this.win) { try { this.win.destroy(); } catch (e) { /* egal */ } this.win = null; } this.closeHud(); }
    // ---------- HUD: zweites, nicht bedienbares Fenster (Infos & Untertitel) ----------
    syncHud() {
        const on = !!this.cfg['vr.overlay_hud'] && !!this.proc && !!this.hudUrl;
        if (on && !this.hudWin) {
            this.hudWin = new BrowserWindow({ width: HW, height: HH, show: false, frame: false, transparent: true, useContentSize: true,
                webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
            this.hudWin.webContents.setFrameRate(4);
            this.hudWin.webContents.on('paint', (e, dirty, image) => this.hudFrame(image));
            this.hudWin.loadURL(this.hudUrl);
        }
        if (!on && this.hudWin) this.closeHud();
        const s = this.cfg;
        const n = (k, d) => (s[k] === undefined || s[k] === '' || isNaN(Number(s[k])) ? d : Number(s[k]));
        this.cmd({ cmd: 'info', show: on ? 1 : 0, place: s['vr.overlay_hud_place'] || 'wrist', hand: s['vr.overlay_hand'] || 'left', width: (Number(s['vr.overlay_hud_width']) || 28) / 100, alpha: (Number(s['vr.overlay_hud_alpha']) || 90) / 100,
            hx: n('vr.overlay_hud_x', 0) / 100, hy: n('vr.overlay_hud_y', -32) / 100, hz: n('vr.overlay_hud_dist', 110) / 100, htilt: n('vr.overlay_hud_tilt', 0), harm: n('vr.overlay_hud_arm', 27) / 100 });
    }
    closeHud() { if (this.hudWin) { try { this.hudWin.destroy(); } catch (e) { /* egal */ } this.hudWin = null; } }
    /** HUD-Bild: Typ 3, sonst wie frame() – höchstens 4× pro Sekunde */
    hudFrame(image) {
        if (!this.proc || Date.now() - (this.lastHud || 0) < 250) return;
        this.lastHud = Date.now();
        const { width, height } = image.getSize();
        const px = image.toBitmap();
        if (!width || px.length !== width * height * 4 || this.proc.stdin.writableLength > 8 * 1024 * 1024) return;
        const head = Buffer.alloc(13);
        head[0] = 3; head.writeUInt32LE(px.length + 8, 1); head.writeUInt32LE(width, 5); head.writeUInt32LE(height, 9);
        this.proc.stdin.write(head); this.proc.stdin.write(px);
    }

    /** Bild an den Helfer: [1][Länge][Breite][Höhe][BGRA …] – höchstens so oft wie eingestellt */
    frame(image) {
        if (!this.proc) return;
        const minGap = 1000 / Math.max(1, Math.min(30, Number(this.cfg['vr.overlay_fps']) || 10));
        const now = Date.now();
        if (now - this.lastFrame < minGap) { this.pendingFrame = image; if (!this.frameTimer) this.frameTimer = setTimeout(() => { this.frameTimer = null; const im = this.pendingFrame; this.pendingFrame = null; if (im) this.frame(im); }, minGap); return; }
        this.lastFrame = now;
        const { width, height } = image.getSize();
        const px = image.toBitmap();
        if (!width || px.length !== width * height * 4) return;
        const head = Buffer.alloc(13);
        head[0] = 1;
        head.writeUInt32LE(px.length + 8, 1);
        head.writeUInt32LE(width, 5);
        head.writeUInt32LE(height, 9);
        if (this.proc.stdin.writableLength > 8 * 1024 * 1024) return;   // Helfer kommt nicht hinterher → Bild auslassen
        this.proc.stdin.write(head);
        this.proc.stdin.write(px);
    }
    cmd(obj) {
        if (!this.proc) return;
        const b = Buffer.from(JSON.stringify(obj), 'utf8');
        const head = Buffer.alloc(5);
        head[0] = 2;
        head.writeUInt32LE(b.length, 1);
        this.proc.stdin.write(Buffer.concat([head, b]));
    }
    sendLayout() {
        const s = this.cfg;
        const n = (k, d) => (s[k] === undefined || s[k] === '' || isNaN(Number(s[k])) ? d : Number(s[k]));
        this.cmd({ cmd: 'mode', mode: s['vr.overlay_mode'] || 'wrist', hand: s['vr.overlay_hand'] || 'left', width: (Number(s['vr.overlay_width']) || 30) / 100,
            alpha: (Number(s['vr.overlay_alpha']) || 95) / 100, distance: (Number(s['vr.overlay_distance']) || 120) / 100, gaze: s['vr.overlay_gaze'] === false ? 0 : 1,
            tilt: n('vr.overlay_tilt', 60), ox: n('vr.overlay_off_x', 2) / 100, oy: n('vr.overlay_off_y', 3) / 100, oz: n('vr.overlay_off_z', 12) / 100, fy: n('vr.overlay_front_y', -10) / 100 });
    }
    onEvent(line) {
        let m;
        try { m = JSON.parse(line); } catch (e) { return; }
        const wc = this.win && this.win.webContents;
        switch (m.ev) {
            case 'ready':
                this.status = 'läuft';
                this.failures = 0;
                this.sendSpace();
                if (!this.dash) break;
                this.sendLayout();
                this.syncHud();
                if (this.cfg['vr.overlay_show'] !== false && (this.cfg['vr.overlay_mode'] || 'wrist') !== 'off') this.cmd({ cmd: 'show' });
                if (wc) wc.invalidate();
                break;
            case 'error': this.status = '⚠ ' + m.msg; break;
            // ---- 3.3 VR-Bewegung ----
            case 'space': this.space = m; break;
            case 'space_orig': if (/^[-0-9.,eE]+$/.test(String(m.m || ''))) this.saveSetting('vr.space_orig', String(m.m)); break;   // Ursprung merken (falls der Helfer abstürzt)
            case 'space_reset': this.space = Object.assign({}, this.space, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 }); this.saveSetting('vr.space_orig', ''); break;
            case 'gravity': this.saveSetting('vr.fly_gravity', m.v ? '1' : '0'); break;
            case 'space_error': this.spaceErr = String(m.msg || 'Fehler'); break;
            case 'fps': this.fps = { app: Number(m.app) || 0, min: Number(m.min) || 0, at: Date.now() }; break;
            case 'visible': this.visible = !!m.v; break;
            case 'toggled': this.visible = !!m.v; break;
            case 'input': this.inputMsg = m.ok ? '' : String(m.msg || ''); break;
            case 'quit': this.status = 'SteamVR beendet'; break;
            case 'mouse':
                if (m.t !== 'move' || !this.lastInput || Date.now() - this.lastInput.at > 1000) this.lastInput = { t: m.t === 'move' ? 'Bewegung' : m.t === 'down' ? 'Klick' : 'Loslassen', x: m.x, y: m.y, at: Date.now() };
                if (!wc) return;
                // Koordinaten auf die Seite begrenzen (falls SteamVR doch 0…1 liefert: hochrechnen)
                if (m.x <= 1 && m.y <= 1 && m.x >= 0 && m.y >= 0 && (m.x % 1 || m.y % 1)) { m.x = Math.round(m.x * W); m.y = Math.round(m.y * H); }
                m.x = Math.max(0, Math.min(W - 1, Math.round(m.x))); m.y = Math.max(0, Math.min(H - 1, Math.round(m.y)));
                if (m.t === 'move') wc.sendInputEvent({ type: 'mouseMove', x: m.x, y: m.y });
                else {
                    if (m.t === 'down') { try { wc.focus(); } catch (e) { /* egal */ } wc.sendInputEvent({ type: 'mouseMove', x: m.x, y: m.y }); }
                    wc.sendInputEvent({ type: m.t === 'down' ? 'mouseDown' : 'mouseUp', x: m.x, y: m.y, button: 'left', clickCount: 1 });
                }
                break;
            case 'scroll': if (wc) wc.sendInputEvent({ type: 'mouseWheel', x: W / 2, y: H / 2, deltaX: 0, deltaY: Math.round(m.dy * 120), canScroll: true }); break;
        }
    }
    /** an/aus (on undefined = umschalten) – für Stream Deck, Startseite, Overlay selbst */
    toggle(on) {
        if (!this.proc) throw new Error(this.cfg['vr.overlay'] ? 'Das Overlay läuft noch nicht (' + this.status + ').' : 'Das SteamVR-Overlay ist aus (Einstellungen → VR).');
        const show = on === undefined || on === null ? !this.visible : !!on && on !== '0';
        this.cmd({ cmd: show ? 'show' : 'hide' });
        this.visible = show;
        return { msg: show ? 'Overlay eingeblendet.' : 'Overlay ausgeblendet.', visible: show };
    }
}

module.exports = { VrOverlay };
