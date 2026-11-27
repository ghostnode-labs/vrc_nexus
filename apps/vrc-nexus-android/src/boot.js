'use strict';
/*
 * VRC Nexus für Android: dasselbe Backend wie die Windows-App, aber im WebView.
 * - Anfragen an „nexus.php“ beantwortet das eingebaute Backend (fetch wird umgeleitet).
 * - Anfragen an VRChat gehen über das native HTTP von Android (CapacitorHttp) – mit Cookies, ohne CORS.
 * - Die Datenbank liegt in IndexedDB (privater Speicher der App).
 * Ohne PC-Funktionen: Spiel-Log, OSC, Spielerliste, Stream Deck, Ordner, Registry, config.json …
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import TEMPLATE from '../../vrc-nexus/renderer/page.html';

const fs = require('fs');
const initSqlJs = require('sql.js');
const { Database } = require('../../vrc-nexus/backend/db');
const { NexusApp, handleWebRequest } = require('../../vrc-nexus/backend/app');

const native = Capacitor.isNativePlatform();
const status = t => { const el = document.getElementById('bootMsg'); if (el) el.textContent = t; };

// ---------- Benachrichtigungen (Android) ----------
let notifId = 1;
async function notify(title, body) {
    if (!native) { console.log('[Benachrichtigung]', title, body); return; }
    try { await LocalNotifications.schedule({ notifications: [{ id: notifId++, title: String(title).slice(0, 120), body: String(body || '').slice(0, 300) }] }); } catch (e) { /* keine Berechtigung */ }
}
if (native) {
    // Die Oberfläche benutzt die Browser-Notification-API – auf Android gibt es sie im WebView nicht
    class AndroidNotification {
        constructor(title, opts) { notify(title, opts && opts.body); }
        static get permission() { return AndroidNotification._p || 'default'; }
        static requestPermission() { return LocalNotifications.requestPermissions().then(r => (AndroidNotification._p = r.display === 'granted' ? 'granted' : 'denied')); }
    }
    window.Notification = AndroidNotification;
    LocalNotifications.checkPermissions().then(r => { AndroidNotification._p = r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default'; }).catch(() => {});
}

// ---------- 7.2.1: Start-Diagnose & sicherer Start ----------
// Jeder Startschritt wird sofort gemerkt. Kommt ein Start nicht bis „ok“ (z. B. eingefroren und von Android beendet),
// startet die App beim nächsten Mal sicher: auf der Startseite statt im zuletzt geöffneten Bereich, mit Hinweis und Bericht.
const BOOT_KEY = 'nexus-boot';
const { trimForPhone, BIG } = require('../../vrc-nexus/backend/dbtrim');
const APP_VER = require('../package.json').version;
const bootPrev = (() => { try { return JSON.parse(localStorage.getItem(BOOT_KEY) || 'null'); } catch (e) { return null; } })();
const bootFails = bootPrev && bootPrev.step !== 'ok' ? (bootPrev.fails || 0) + 1 : 0;
const bootSafe = bootFails > 0;
const bootExtra = {};   // 7.3.1: Angaben (z. B. Datenbank-Größe) über alle Schritte mitnehmen
const bootStep = (step, extra) => { Object.assign(bootExtra, extra || {}); try { localStorage.setItem(BOOT_KEY, JSON.stringify(Object.assign({ step, at: Date.now(), v: APP_VER, fails: step === 'ok' ? 0 : bootFails, safe: bootSafe }, bootExtra))); } catch (e) { /* egal */ } };
if (bootSafe) {
    try {
        const lastTab = JSON.parse(localStorage.getItem('vrcx-tab') || '"home"');
        localStorage.setItem('nexus-boot-hang', JSON.stringify({ step: bootPrev.step, tab: lastTab, v: bootPrev.v, at: bootPrev.at, fails: bootFails, db: bootPrev.db || null, ua: navigator.userAgent }));
        localStorage.setItem('vrcx-tab', '"home"'); localStorage.setItem('vrcx-tabSub', '""');
    } catch (e) { /* egal */ }
}
bootStep('start');

// ---------- Start ----------
(async () => {
    status(bootSafe ? 'Sicherer Start …' : 'Lade Datenbank …');
    await fs.__load();
    fs.__files.set('/renderer/page.html', TEMPLATE);
    bootStep('db');
    const SQL = await initSqlJs({ locateFile: f => f });
    // 3.4 Multiaccount: Datenbank des aktuell gewählten Kontos
    const prof = require('../../vrc-nexus/backend/profiles');
    const db = new Database(SQL, prof.currentFile('/data').file);
    prof.applySeed('/data', db);
    // 7.3.1: große Datenbank am Handy (ganz im Speicher, wird ganz gesichert) → Verläufe kürzen und Datei verkleinern
    const dbFile = prof.currentFile('/data').file, dbSize = () => { const f = fs.__files.get(dbFile); return f ? f.length : 0; };
    const mb0 = dbSize();
    let trimmed = null;
    if (mb0 > BIG || bootSafe) {
        status('Räume die Datenbank auf …');
        try { trimmed = trimForPhone(db, { force: mb0 > BIG }); db.save(); } catch (e) { console.error('Aufräumen:', e); }
    }
    const dbInfo = { mb: Math.round(mb0 / 104857.6) / 10, mb_after: Math.round(dbSize() / 104857.6) / 10, files: fs.__files.size, trimmed: trimmed ? trimmed.total : 0 };
    // Android-Sandbox: nur diese App kann ihren Speicher lesen
    const crypt = { encrypt: s => 'plain:' + Buffer.from(s).toString('base64'), decrypt: s => (s.startsWith('plain:') ? Buffer.from(s.slice(6), 'base64').toString() : '{}') };
    const host = {
        userData: '/data', notify,
        openExternal: url => { window.location.href = url; },     // externe Adresse → Capacitor öffnet den System-Browser / Download
        /** Update: APK mit Fortschritt in den App-Cache laden, danach Android-Installationsdialog öffnen */
        downloadApk: async (asset, progress) => {
            if (!native) throw new Error('Nur in der Android-App.');
            const W = registerPlugin('NexusWidget');
            const sub = await Filesystem.addListener('progress', p => { if (p && p.url === asset.url) progress(p.bytes || 0, p.contentLength || asset.size || 0); });
            try {
                await Filesystem.deleteFile({ path: asset.name, directory: Directory.Cache }).catch(() => {});
                const r = await Filesystem.downloadFile({ url: asset.url, path: asset.name, directory: Directory.Cache, progress: true });
                progress(asset.size || 1, asset.size || 1);
                const uri = r.path || (await Filesystem.getUri({ path: asset.name, directory: Directory.Cache })).uri;
                await W.installApk({ path: uri });
            } finally { sub.remove(); }
        },
        restart: async () => { try { db.save(); await fs.__flush(); } catch (e) { /* egal */ } window.location.reload(); },   // 3.4: Konto-Wechsel
        speak: t => { if (window.speechSynthesis) speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(t), { lang: 'de-DE' })); },
    };
    bootStep('app', { db: dbInfo });
    const app = new NexusApp({ db, crypt, host, notify, mobile: true, licenseTimer: true });
    app.game.stop();
    app.game.osc.stopListen();
    app.game.watcher = null;
    app.tools.backupTick = () => {};                       // Sicherungen sind am PC sinnvoll, nicht im Telefon-Speicher
    app.tools.start();
    app.updater.start();
    window.__nexus = app;

    // fetch umleiten: nexus.php → eingebautes Backend, alles andere → (native) Netz
    const upstream = window.__nexusUpstream || window.fetch.bind(window);   // __nexusUpstream nur im Test (ersetzt das native HTTP)
    window.fetch = async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.origin === location.origin && /(^|\/)nexus\.php$/.test(url.pathname)) {
            const req = typeof input === 'string' || input instanceof URL ? new Request(url, init) : input;
            const r = await handleWebRequest(app, req);
            // nach Änderungen sofort sichern – die Oberfläche lädt z. B. nach der Anmeldung die Seite neu
            if (req.method === 'POST') { try { if (db.timer) db.save(); await fs.__flush(); } catch (e) { /* egal */ } }
            return new Response(r.body, { status: r.status, headers: r.headers });
        }
        return upstream(input, init);
    };

    // Datenbank sichern, wenn die App in den Hintergrund geht
    document.addEventListener('visibilitychange', () => { if (document.hidden) { try { db.save(); } catch (e) { /* egal */ } fs.__flush().catch(() => {}); } });
    window.addEventListener('pagehide', () => { try { db.save(); } catch (e) { /* egal */ } });

    // Homescreen-Widget mit einer Zusammenfassung versorgen (beim Start, jede Minute, beim Verlassen der App)
    const NexusWidget = native ? registerPlugin('NexusWidget') : null;
    // Homescreen-Widget: Text in der gewählten Sprache (Übersetzer aus nexus-i18n.js, sobald geladen)
    // 7.0.1: Texte für alle Widgets (Puls & PC, Events, Benachrichtigungen, Schnellzugriff) – Schlüssel = deutsche Originale aus 10.tsv
    const WL = { stand: 'Stand', live: 'läuft gerade', in: 'in', today: 'heute', days: 'Tagen', years: 'Jahre', events: 'Nächste Events', no_events: 'Keine Events geplant.',
        no_data: 'Noch keine Daten – App einmal öffnen.', notifs: 'Benachrichtigungen', no_notifs: 'Alles gelesen 🎉', pc_none: 'Nicht mit dem PC gekoppelt – tippen zum Koppeln',
        pc_old: 'PC gerade nicht erreichbar', vrc_off: 'VRChat aus', private: 'Privat-Modus', sleep: 'Schlafmodus an',
        q_friends: 'Freunde', q_events: 'Events', q_clubs: 'Clubs', q_buttons: 'Knöpfe', q_panic: 'Panik',
        // 7.3.3: Widget-Einstellungen
        q_community: 'Community', q_notifs: 'Meldungen', q_pc: 'PC', q_home: 'Start', q_settings: 'Einstellungen',
        cfg_title: 'Widget-Einstellungen', cfg_look: 'Aussehen', cfg_theme: 'Design', theme_dark: 'Dunkel', theme_light: 'Hell', theme_clear: 'Durchsichtig',
        cfg_size: 'Schriftgröße', size_s: 'Klein', size_m: 'Normal', size_l: 'Groß', cfg_foot: '„Stand“ (Uhrzeit der Daten) zeigen', cfg_content: 'Inhalt',
        cfg_rows: 'Freunde in der Liste', cfg_dot: 'Status-Punkt hinter dem Namen', cfg_bell: 'Ungelesene Benachrichtigungen zeigen',
        cfg_world: 'Welt zeigen (nie im Privat-Modus)', cfg_players: 'Spielerzahl zeigen', cfg_sleep: 'Hinweis „Schlafmodus an“',
        cfg_count: 'Anzahl Events', cfg_star: 'Nur Gruppen, denen ich folge (⭐)', cfg_anniv: 'Jubiläen und Geburtstage',
        cfg_count2: 'Anzahl Einträge', cfg_msg: 'Nachrichtentext zeigen', cfg_badge: 'Zähler oben rechts', cfg_btn: 'Knopf', cfg_panic: '🛑 Panik-Knopf zeigen',
        cfg_tap: 'Beim Tippen öffnen', cfg_unknown: 'Dieses Widget hat keine weiteren Einstellungen.', save: 'Speichern', cancel: 'Abbrechen',
        w_friends: 'Freunde online', w_pulse: 'Puls & PC', w_events: 'Nächste Events', w_notifs: 'Benachrichtigungen', w_quick: 'Schnellzugriff & Panik',
        tab_home: '🏠 Start', tab_friends: '👥 Freunde', tab_community: '🫂 Community', tab_clubs: '🏠 Clubs', tab_calendar: '📅 Kalender', tab_notifs: '🔔 Benachrichtigungen',
        tab_buttons: '🎛 Knöpfe', tab_pc: '🖥 PC', tab_nsfw: '🔞 18+', tab_settings: '⚙ Einstellungen' };
    const widgetData = () => {
        const d = app.home.summary();
        const t = typeof window.t === 'function' ? window.t : s => s;
        d.line = t(d.in_game + ' im Spiel') + ' · ' + t(d.online + ' online');
        d.stand = t('Stand');
        d.L = Object.fromEntries(Object.entries(WL).map(([k, v]) => [k, t(v)]));
        return d;
    };
    let pcAt = 0;
    const pushWidget = async () => {
        if (!NexusWidget) return;
        // Puls & PC: höchstens jede Minute beim gekoppelten PC nachfragen (nur solange die App läuft)
        if (app.pclink && app.pclink.paired() && Date.now() - pcAt > 55000) { pcAt = Date.now(); await app.pclink.state().catch(() => {}); }
        try { NexusWidget.update({ data: JSON.stringify(widgetData()) }).catch(() => {}); } catch (e) { /* egal */ }
    };
    setTimeout(pushWidget, 8000);
    setInterval(pushWidget, 60000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pushWidget(); });

    // 7.0.1: Tippen auf ein Widget → Bereich öffnen oder Aktion ausführen (Android hat das Ziel geprüft und gemerkt)
    const runPending = async () => {
        if (!NexusWidget) return;
        let p = '';
        try { p = (await NexusWidget.takePending()).pending || ''; } catch (e) { return; }
        if (!p) return;
        for (let i = 0; i < 50 && !window.NexusUI; i++) await new Promise(r => setTimeout(r, 200));   // Oberfläche erst fertig laden
        const UI = window.NexusUI; if (!UI) return;
        const t = typeof window.t === 'function' ? window.t : s => s;
        const [kind, what] = p.split(':');
        if (kind === 'open') {
            if (what === 'pc') { if (window.NexusOpenTool) window.NexusOpenTool('pc'); return; }
            UI.tab(what);
            return;
        }
        if (kind === 'act' && what === 'panic') {
            if (!app.pclink || !app.pclink.paired()) { UI.toast(t('Für Panik vom Handy erst mit dem PC koppeln.'), true); if (window.NexusOpenTool) window.NexusOpenTool('pc'); return; }
            try { await app.pclink.act('nsfw_panic', {}); UI.toast('🛑 ' + t('Panik an den PC gesendet – alles gestoppt.')); }
            catch (e) { UI.toast('⚠ ' + e.message, true); }
            pushWidget();
        }
    };
    if (NexusWidget) { try { NexusWidget.addListener('pending', () => { runPending(); }); } catch (e) { /* egal */ } }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) runPending(); });

    window.NexusMobile = { download, imgFix, pushWidget };
    status('Starte …');
    bootStep('page', { tab: (() => { try { return JSON.parse(localStorage.getItem('vrcx-tab') || '"home"'); } catch (e) { return ''; } })() });
    const r = await app.handle({ method: 'GET', query: new URLSearchParams() });
    document.open();
    document.write(r.body);
    document.close();
    document.body.classList.add('mobile');
    const cs = document.getElementById('clientStandalone');
    if (cs) cs.parentNode.removeChild(cs);
    setTimeout(imgFix, 0);
    bootStep('ui');
    // erst wenn die Oberfläche 12 s lang flüssig lief, gilt der Start als gelungen (ein eingefrorener Start kommt nie hierhin)
    setTimeout(() => bootStep('ok'), 12000);
    setTimeout(cleanApks, 20000);   // 7.3.1: heruntergeladene Update-APKs nicht liegen lassen
    if (bootSafe) setTimeout(safeNotice, 1500);
    runPending();   // Start über ein Widget
})().catch(e => { status('⚠ Start fehlgeschlagen: ' + e.message); console.error(e); });

// 7.3.1: alte Update-APKs aus dem App-Cache entfernen (jedes Update lud ~6 MB nach, gelöscht wurde nie)
async function cleanApks() {
    if (!native) return;
    try {
        const r = await Filesystem.readdir({ path: '', directory: Directory.Cache });
        for (const f of r.files || []) { const n = typeof f === 'string' ? f : f.name; if (/\.apk$/i.test(n)) await Filesystem.deleteFile({ path: n, directory: Directory.Cache }).catch(() => {}); }
    } catch (e) { /* egal */ }
}

// 7.2.1: Hinweis nach einem hängengebliebenen Start (mit Bericht zum Kopieren)
function safeNotice() {
    let info = {};
    try { info = JSON.parse(localStorage.getItem('nexus-boot-hang') || '{}'); } catch (e) { info = {}; }
    const t = typeof window.t === 'function' ? window.t : x => x;
    const box = document.createElement('div');
    box.className = 'nx-safe';
    box.setAttribute('style', 'position:fixed;left:10px;right:10px;bottom:84px;z-index:99999;background:#1c2433;border:1px solid #f3c262;border-radius:10px;padding:12px;color:#e2e8f0;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.5)');
    const p = document.createElement('div');
    p.textContent = '⚠ ' + t('Der letzte Start ist hängen geblieben – die App ist deshalb auf der Startseite gestartet.') + ' (' + (info.step || '?') + (info.tab ? ' · ' + info.tab : '') + ')';
    const row = document.createElement('div');
    row.setAttribute('style', 'display:flex;gap:8px;margin-top:10px;justify-content:flex-end');
    const copy = document.createElement('button'); copy.className = 'btn btn-sm'; copy.textContent = '📋 ' + t('Bericht kopieren');
    copy.onclick = () => { const txt = 'VRC Nexus Start-Bericht ' + JSON.stringify(info); try { navigator.clipboard.writeText(txt); copy.textContent = '✔'; } catch (e) { window.prompt('', txt); } };
    const ok = document.createElement('button'); ok.className = 'btn btn-sm btn-gold'; ok.textContent = 'OK';
    ok.onclick = () => box.remove();
    row.append(copy, ok); box.append(p, row); document.body.appendChild(box);
}

// ---------- Bilder: „nexus.php?img=…“ gibt es nicht als Datei → über fetch holen ----------
const imgCache = new Map();
function blobUrl(src) {
    if (!imgCache.has(src)) imgCache.set(src, window.fetch(src).then(r => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then(b => URL.createObjectURL(b)).catch(() => ''));
    return imgCache.get(src);
}
function fixEl(el) {
    if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (/^nexus\.php\?/.test(src)) { el.removeAttribute('src'); el.dataset.nxsrc = src; blobUrl(src).then(u => { if (u) el.src = u; }); }
    }
    const st = el.getAttribute && el.getAttribute('style');
    if (st && st.includes('nexus.php?')) {
        const m = /url\(['"]?(nexus\.php\?[^'")]+)['"]?\)/.exec(st);
        if (m) { const orig = m[1]; el.setAttribute('style', st.replace(m[0], 'none')); blobUrl(orig.replace(/&amp;/g, '&')).then(u => { if (u) el.style.backgroundImage = 'url("' + u + '")'; }); }
    }
}
function imgFix() {
    document.querySelectorAll('img[src^="nexus.php?"], [style*="nexus.php?"]').forEach(fixEl);
    if (imgFix.obs) return;
    imgFix.obs = new MutationObserver(list => {
        for (const m of list) {
            if (m.type === 'attributes') { fixEl(m.target); continue; }
            m.addedNodes.forEach(n => { if (n.nodeType === 1) { fixEl(n); n.querySelectorAll && n.querySelectorAll('img[src^="nexus.php?"], [style*="nexus.php?"]').forEach(fixEl); } });
        }
    });
    imgFix.obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'style'] });
    // Downloads (CSV, ICS, JSON) abfangen
    document.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('a[href^="nexus.php?"]');
        if (!a) return;
        e.preventDefault();
        download(a.getAttribute('href'));
    }, true);
}

// ---------- Downloads: auf Android speichern + teilen ----------
async function download(href) {
    const r = await window.fetch(href);
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'Download fehlgeschlagen.'); return; }
    const name = (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || 'vrc-nexus.txt';
    const blob = await r.blob();
    if (!native) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); return; }
    const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    const w = await Filesystem.writeFile({ path: name, data: b64, directory: Directory.Cache });
    await Share.share({ title: name, files: [w.uri] }).catch(() => {});
}
