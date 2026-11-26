'use strict';
/*
 * „nexus.php“ der App: beantwortet alle Anfragen der Oberfläche (POST act=…), liefert Bilder (img=file_…),
 * Exporte (CSV/ICS) und die Seite selbst. Wird von Electron (Protokoll app://) und vom Test-Server benutzt.
 */
const fs = require('fs');
const path = require('path');
const U = require('./util');
const { VrcAuthError, UserError, now, str, int, cut, arr } = U;
const { Vrc, UID, SYNC_MIN, OFFLINE_SYNC, FEED_KEEP_DAYS, VERSION } = require('./vrchat');
const { Extra, NOTIF_TYPES, NOTIF_RESPONSES } = require('./extra');
const { GameLog, KINDS } = require('./gamelog');
const { OscTools } = require('./osctools');
const { Media } = require('./media');
const { Settings } = require('./settings');
const { Tools } = require('./tools');
const { Translator } = require('./translate');
const { DashLink } = require('./dashlink');
const { Updater } = require('./updater');
const { AvatarParams } = require('./avatarparams');
const { Camera } = require('./camera');
const { Macros } = require('./macros');
const { Automation } = require('./automation');
const { Home } = require('./home');
const { Speech } = require('./speech');
const { Insights } = require('./insights');
const { ModTools } = require('./modtools');
const { Collections } = require('./collections');
const { OscLog } = require('./osclog');
const { StreamBot } = require('./streambot');
const { CloudBackup } = require('./cloudbackup');
const { ChatMods } = require('./chatmods');
const { Tts } = require('./tts');

const RENDERER = path.join(__dirname, '..', 'renderer');
const truthy = v => v !== undefined && v !== null && v !== '' && v !== '0' && v !== false && v !== 'false';
const isLoc = l => /^wrld_[0-9a-f-]{36}:[\w~()\-.:]+$/i.test(str(l));
const json = (data, status = 200) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });
const download = (body, type, name) => ({ status: 200, headers: { 'Content-Type': type, 'Content-Disposition': 'attachment; filename="' + name + '"' }, body });

const OVERLAY_POS = ['vr.overlay_mode', 'vr.overlay_width', 'vr.overlay_distance', 'vr.overlay_tilt', 'vr.overlay_off_x', 'vr.overlay_off_y', 'vr.overlay_off_z', 'vr.overlay_front_y', 'vr.overlay_alpha',
    'vr.overlay_hud_place', 'vr.overlay_hud_width', 'vr.overlay_hud_dist', 'vr.overlay_hud_x', 'vr.overlay_hud_y', 'vr.overlay_hud_tilt', 'vr.overlay_hud_arm', 'vr.overlay_hud_alpha'];
class NexusApp {
    /** @param opts { db, crypt, notify(title, body, silent), host: Hilfsfunktionen von Electron (siehe tools.js) } */
    constructor(opts) {
        this.db = opts.db;
        this.settings = new Settings(opts.db);
        this.vrc = new Vrc(opts.db, opts.crypt);
        this.x = new Extra(this.vrc); this.x.settings = this.settings;
        this.game = new GameLog(opts.db, { onEvent: e => { if (this.tools) this.tools.onGameEvent(e); if (this.auto) this.auto.onGameEvent(e); if (this.plugins) this.plugins.onGameEvent(e); if (this.warn) this.warn.onGameEvent(e); if (this.obs) this.obs.onGameEvent(e); if (this.nsfwcol) this.nsfwcol.onGameEvent(e).catch(() => {}); if (this.toys && e.kind === 'nexus_toy') this.toys.onWorldEvent(e); if (opts.onGameEvent) opts.onGameEvent(e); } });
        this.tr = new Translator(opts.db, opts.crypt, this.settings);
        this.link = new DashLink(this);
        this.updater = new Updater(this);
        this.tools = new Tools(this, Object.assign({ notify: opts.notify }, opts.host || {}));
        this.params = new AvatarParams(this);
        // 4.2: Parameter-Typen des getragenen Avatars (OSC-Datei von VRChat + OSCQuery) → typrichtiges Senden, SPS/PCS-Erkennung
        this.game.osc.taps = this.game.osc.taps || new Set();
        this.game.osc.taps.add(a => { if (a === '/avatar/change') { clearTimeout(this.knownT); this.knownT = setTimeout(() => this.refreshKnown(), 1500); } });
        if (opts.oscquery) { this.game.onApply = c => this.oscSetup(c); this.game.applySettings(); }
        // 4.4: Server-Adressen (Domain-Umzug): erreichbare Adresse wählen – nur wenn es mehrere gibt
        if ((opts.oscquery || opts.mobile) && !process.env.NEXUS_NO_SERVER_CHECK) { const sv = require('./servers'), chk = () => sv.check().catch(() => {}); chk(); const t2 = setInterval(chk, 900000); if (t2.unref) t2.unref(); }
        this.cam = new Camera(this);
        this.macros = new Macros(this);
        this.presets = new (require('./presets').Presets)(this);   // 5.0
        this.comfort = new (require('./comfort').Comfort)(this);   // 5.0: Schlafmodus, Pausen, Puls-Warnungen
        this.obs = opts.mobile ? null : new (require('./obs').Obs)(this, opts.crypt);   // 5.0: OBS-Anbindung
        this.auto = new Automation(this);
        this.home = new Home(this);
        this.speech = opts.mobile ? null : new Speech(this, opts.crypt);
        this.insights = new Insights(this);
        this.mod = new ModTools(this);
        this.coll = new Collections(this);
        this.osclog = new OscLog(this);
        this.stream = opts.mobile ? null : new StreamBot(this, opts.crypt);
        this.backup = new CloudBackup(this, opts.crypt);
        this.account = new (require('./account').Account)(this, opts.crypt);
        this.warn = new (require('./warnlist').WarnList)(this);
        this.pulse = new (require('./pulse').Pulse)(this);   // 3.9 News & Discovery
        this.comm = new (require('./community').Community)(this);
        this.buttons = new (require('./buttons').Buttons)(this);
        this.deco = new (require('./deco').Deco)(this);                    // 3.1: Profil-Dekorationen
        this.netgraph = new (require('./netgraph').NetGraph)(this);        // 3.2.3: Gemeinsames Netzwerk
        this.vrc.onUserData = (id, u) => this.deco.remember(id, u);
        this.chat = new (require('./chat').Chat)(this, opts.crypt);   // 3.5: auch am Handy (Krypto über @noble im Android-Shim)
        this.heart = opts.mobile ? null : new (require('./heart').Heart)(this, opts.crypt);
        this.watch = opts.mobile || opts.noWatch ? null : new (require('./watch').Watch)(this);   // 5.2: Wear-OS-App
        this.pclink = opts.mobile ? new (require('./pclink').PcLink)(this, opts.crypt) : null;   // 5.2.3: Handy ↔ PC
        this.chatmods = new ChatMods(this, opts.crypt);   // 3.2.5: auch am Handy (nur Module ohne PC-Werte)
        this.subs = opts.mobile ? null : new (require('./subtitles').Subtitles)(this);
        this.nsfw = new (require('./nsfw').Nsfw)(this, opts.crypt);
        this.nsfwcol = new (require('./nsfwcol').NsfwCollection)(this, opts.crypt);   // NSFW 3.1: eigene Sammlung
        this.toys = opts.mobile ? null : new (require('./toys').Toys)(this);
        this.remote = opts.mobile ? null : new (require('./remote').Remote)(this);
        this.toyremote = opts.mobile ? null : new (require('./toyremote').ToyRemote)(this);
        this.game.isPrivate = () => this.nsfw.private;
        this.admin = new (require('./admin').Admin)(this);
        this.tts = opts.mobile ? null : new Tts(this, opts.crypt);
        this.media = opts.mobile ? null : new Media(this);
        this.vrspace = new (require('./vrspace').VrSpace)(this);
        this.profiles = new (require('./profiles').Profiles)(this);
        this.osctools = new OscTools(this);               // 3.2.5: auch am Handy (Szenen, Aufnahme über die eigene OSC-Verbindung)
        this.vrc.onWatch = (name, world) => { if (this.settings.get('notify.watch')) this.tools.alert('🟢 ' + name + ' ist online', world ? 'in ' + world : 'gerade ins Spiel gekommen'); };
        this.vrc.onWatchEvent = (name, kind, world) => {
            const s = this.settings;
            if (kind === 'joinme' && s.get('notify.watch_joinme')) this.tools.alert('🔵 ' + name + ' ist jetzt „Join Me“', world ? 'in ' + world : '');
            if (kind === 'public' && s.get('notify.watch_public')) this.tools.alert('🌍 ' + name + ' ist in einer öffentlichen Instanz', world || '');
        };
        this.notify = opts.notify || null;
        this.plugins = opts.mobile ? null : new (require('./plugins').Plugins)(this);
        this.voice = opts.mobile ? null : new (require('./voice').Voice)(this, opts.crypt);   // 3.7 Sprachanrufe 1:1 (Signalisierung über den Chat)   // 3.6 Plugin-Lader (nur PC)
        this.mobile = !!opts.mobile;
        this.vrc.nativeCookies = this.mobile;
    }

    /** Hauptweg: { method, path, query: URLSearchParams, form: Object, files: { file: {buffer,type,name} } } */
    async handle(req) {
        const q = req.query || new URLSearchParams();
        try {
            if (req.method === 'POST') return json(await this.post(req.form || {}, req.files || {}));
            if (q.has('bgimg')) { const b = this.db.setting('ui_bg_file', ''); const m = /^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/.exec(b);
                return m ? { status: 200, headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=31536000' }, body: Buffer.from(m[3], 'base64') } : { status: 404, headers: {}, body: '' }; }
            if (q.has('uifont')) { const f = this.db.setting('ui_font_file', ''); const m = /^data:(font\/(ttf|otf|woff|woff2));base64,(.+)$/.exec(f);
                return m ? { status: 200, headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=31536000' }, body: Buffer.from(m[3], 'base64') } : { status: 404, headers: {}, body: '' }; }
            if (q.has('img')) return await this.image(q.get('img'), int(q.get('v')) || 1, int(q.get('s')));
            if (q.has('cimg')) return await this.comm.image(q.get('cimg'));
            if (q.has('chimg')) { if (!this.chat) return { status: 404, headers: {}, body: '' }; try { return await this.chat.image(q.get('chimg')); } catch (e) { return { status: 404, headers: {}, body: '' }; } }   // 3.4: verschlüsselte Chat-Bilder
            if (q.has('export')) return download(this.vrc.exportCsv(q.get('export') === 'feed' ? 'feed' : 'friends'), 'text/csv; charset=utf-8', 'vrc-nexus_' + (q.get('export') === 'feed' ? 'verlauf' : 'freunde') + '_' + new Date().toISOString().slice(0, 10) + '.csv');
            if (q.has('client_export')) return download(this.game.exportCsv(), 'text/csv; charset=utf-8', 'vrchat-spiellog_' + new Date().toISOString().slice(0, 10) + '.csv');
            if (q.has('shot')) { const r = await this.tools.shotImage(q.get('shot'), q.get('t') === '1'); return { status: 200, headers: { 'Content-Type': r.type, 'Cache-Control': 'private, max-age=3600' }, body: r.body }; }
            if (q.has('tools_export')) return await this.toolsExport(q.get('tools_export'));
            if (q.has('osclog_export')) return download(this.osclog.csv(Object.fromEntries(q)), 'text/csv; charset=utf-8', 'osc-log_' + new Date().toISOString().slice(0, 10) + '.csv');
            if (q.has('mod_export')) return download(await this.mod.exportCsv(str(q.get('mod_export'))), 'text/csv; charset=utf-8', 'moderation_' + new Date().toISOString().slice(0, 10) + '.csv');
            if (q.has('ics')) return download(this.vrc.calendarIcs(), 'text/calendar; charset=utf-8', 'vrchat-events.ics');
            return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, body: this.page() };
        } catch (e) {
            if (e instanceof VrcAuthError) return json({ error: e.message, auth: true }, 401);
            if (!(e instanceof UserError)) console.error('[nexus]', e);
            return json({ error: e.message || 'Fehler' }, 400);
        }
    }

    async image(id, v, size) {
        const acc = this.vrc.account();
        if (!acc || !/^file_[0-9a-f-]{36}$/i.test(str(id))) return { status: 404, headers: {}, body: '' };
        size = [64, 128, 256, 512, 1024, 2048].includes(size) ? size : 0;
        // Zwischenspeicher (max. ~60 MB): Bilder werden sonst bei jedem Neuzeichnen erneut bei VRChat abgefragt
        const key = id + '/' + v + '/' + size;
        this.imgCache = this.imgCache || new Map();
        let r = this.imgCache.get(key);
        if (r) { this.imgCache.delete(key); this.imgCache.set(key, r); }
        else {
            r = await this.vrc.proxyFile(acc, id, v, size);
            if (r) {
                this.imgCache.set(key, r);
                this.imgBytes = (this.imgBytes || 0) + r.body.length;
                while (this.imgBytes > 60e6 && this.imgCache.size > 1) { const [k, o] = this.imgCache.entries().next().value; this.imgCache.delete(k); this.imgBytes -= o.body.length; }
            }
        }
        if (!r) return { status: 404, headers: {}, body: '' };
        return { status: 200, headers: { 'Content-Type': r.type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' }, body: r.body };
    }

    page() {
        const acc = this.vrc.account();
        const p = this.vrc.pending && this.vrc.pending.until > now() ? this.vrc.pending.types : null;
        let html = fs.readFileSync(path.join(RENDERER, 'page.html'), 'utf8');
        const esc = s => str(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const block = (h, open, close, keep) => h.replace(new RegExp(open + '([\\s\\S]*?)' + close, 'g'), (m, inner) => (keep ? inner : ''));
        html = block(html, '\\{\\{IF_LOGIN\\}\\}', '\\{\\{END_LOGIN\\}\\}', !acc);
        html = block(html, '\\{\\{IF_CONNECTED\\}\\}', '\\{\\{END_CONNECTED\\}\\}', !!acc);
        if (!this.nsfw || !this.nsfw.isOwner()) html = html.replace(/^.*(data-tab="admin"|data-pane="admin"|nexus-admin\.js).*\n/gm, '');   // fremdes Konto: Admin gar nicht ausliefern
        const status = ['join me', 'active', 'ask me', 'busy'].map(s => '<label style="--sc: ' + U.VRC_STATUS[s][1] + ';"><input type="radio" name="status" value="' + esc(s) + '"><span>' + esc(U.VRC_STATUS[s][0]) + '</span></label>').join('\n');
        const vrcx = { frame: !this.mobile && !!(this.tools && this.tools.host && this.tools.host.setTitleBar) && process.platform === 'win32', ui: this.settings.ui(), mobile: !!this.mobile, connected: !!acc, status: Object.fromEntries(Object.entries(U.VRC_STATUS).map(([k, v]) => [k, { label: v[0], color: v[1] }])), syncMin: SYNC_MIN, discord: false, app: true, version: VERSION };
        const map = { LOGIN_HIDDEN: p ? 'hidden' : '', TFA_HIDDEN: p ? '' : 'hidden', TFA_TYPES: esc((p || []).join(',')), STATUS_RADIOS: status, SYNC_MIN: SYNC_MIN, OFFLINE_MIN: OFFLINE_SYNC / 60,
            EXPIRED_HIDDEN: !acc && this.db.setting('vrc_logout_reason', '') === 'expired' ? '' : 'hidden', FEED_DAYS: FEED_KEEP_DAYS, UA: esc(this.db.setting('vrc_user_agent', '')), UA_DEFAULT: esc(this.vrc.userAgent()), VRCX_JSON: JSON.stringify(vrcx).replace(/</g, '\\u003c') };
        return html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? String(map[k]) : m));
    }

    overlayPos() { const s = this.settings.all(); return Object.fromEntries(OVERLAY_POS.map(k => [k, s[k]]).concat([['vr.overlay_hud', !!s['vr.overlay_hud']]])); }
    /** 4.2: Darf man intime Parameter (SPS/OGB/PCS) gerade sehen? */
    nsfwVisible() { try { return !!(this.nsfw && this.nsfw.access().unlocked && !this.nsfw.private); } catch (e) { return false; } }
    /** 4.2: bekannte Parameter-Typen (Datei + OSCQuery) */
    refreshKnown() {
        const known = {};
        try { for (const p of this.params.list().params) known[p.name] = p.type; } catch (e) { /* ohne VRChat-Ordner */ }
        if (this.oq) { for (const [k, v] of Object.entries(this.oq.params || {})) if (v.type !== 'other') known[k] = v.type; if (typeof this.oq.refreshParams === 'function') this.oq.refreshParams().then(ps => { for (const [k, v] of Object.entries(ps)) if (v.type !== 'other') this.game.osc.known[k] = v.type; }).catch(() => {}); }
        this.game.osc.known = known;
        return known;
    }
    /** 4.2: Empfang einrichten – klassisch (9001), OSCQuery (freier Port, per mDNS angemeldet) oder automatisch */
    oscSetup(c) {
        const osc = this.game.osc;
        if (!this.oq) { const { OscQuery } = require('./oscquery'); this.oq = new OscQuery(); this.oq.onParams = ps => this.fromQuery(ps); }
        const oq = this.oq;
        this.oscMode = '';
        if (!c.osc_listen) { osc.stopListen(); oq.stop(); return; }
        const viaQuery = () => osc.listen(0, null, '127.0.0.1').then(p => { if (!p) return; this.oscMode = 'oscquery'; return oq.advertise(p); }).catch(e => { this.oscErr = e.message; });
        if (c.osc_mode === 'oscquery') viaQuery();
        else {
            oq.stop();
            this.oscFallback = false;
            osc.listen(c.osc_listen_port, c.osc_mode === 'auto' ? () => { osc.listenError = ''; this.oscFallback = int(c.osc_listen_port) || 9001; viaQuery(); } : null).then(p => { if (p) this.oscMode = 'classic'; });
        }
        // VRChat per OSCQuery suchen (Eingangs-Port + Parameter-Baum)
        const find = () => { try { oq.discover(); } catch (e) { /* egal */ }
            if (oq.vrchat && oq.vrchat.osc_port && /^(127\.|localhost$)/.test(c.osc_host) && int(c.osc_send_port) === 9000 && oq.vrchat.osc_port !== osc.port) osc.configure(c.osc_host, oq.vrchat.osc_port);
            if (oq.vrchat) oq.refreshParams().catch(() => { oq.vrchat = null; }); };   // 4.2.1: Avatar + Werte aktuell halten (VRChat neu gestartet → neu suchen)
        clearInterval(this.oqT); find(); this.oqT = setInterval(find, 10000); if (this.oqT.unref) this.oqT.unref();
    }
    /** 4.2.1: Parameter-Baum von VRChat (OSCQuery) übernehmen: Typen, getragener Avatar und aktuelle Werte – auch ohne dass VRChat schon etwas gesendet hat */
    fromQuery(ps) {
        const osc = this.game.osc, oq = this.oq;
        if (oq && oq.avatarId && oq.avatarId !== osc.avatarId && (!osc.avatarId || osc.avatarSrc !== 'osc' || Date.now() - (osc.avatarAt || 0) > 5000)) {
            osc.avatarId = oq.avatarId; osc.avatarSrc = 'oscquery'; osc.avatarAt = Date.now(); osc.params = {};
        }
        osc.known = osc.known || {};
        for (const [k, v] of Object.entries(ps || {})) {
            if (v.type !== 'other') osc.known[k] = v.type;
            if (osc.params[k] === undefined && v.value !== undefined && v.value !== null) osc.params[k] = typeof v.value === 'number' && !Number.isInteger(v.value) ? Math.round(v.value * 1000) / 1000 : v.value;
        }
    }
    oscStatus() {
        const o = this.game.osc, st = o.stats, secs = Math.max(1, (Date.now() - st.since) / 1000), c = this.game.cfg();
        return { mode: this.oscMode || (o.listener ? 'classic' : 'aus'), setting: c.osc_mode || 'auto', listen_port: o.listenPort || 0, send: { host: o.host, port: o.port }, error: o.listenError || '',
            active: !!o.active, last: o.lastPacket || 0, avatar: o.avatarId || '', fallback: this.oscFallback || 0, known: Object.keys(o.known || {}).length,
            rate: { in: Math.round(st.in / secs * 10) / 10, out: Math.round(st.out / secs * 10) / 10, merged: st.merged }, oscquery: this.oq ? this.oq.status() : null };
    }
    async post(input, files) {
        const act = str(input.act), id = str(input.id), user = str(input.user);
        const valid = U.valid;
        {
            if (act === 'login') {
                const r = await this.vrc.login(str(input.username).trim(), str(input.password));
                if (r.need2fa) { this.vrc.pending = { cookies: r.cookies, types: r.need2fa, until: now() + 600 }; return { need2fa: r.need2fa }; }
                this.vrc.saveAccount(r.user, r.cookies);
                return { ok: true };
            }
            if (act === 'verify') {
                const p = this.vrc.pending;
                if (!p || p.until < now()) throw new UserError('Die Anmeldung ist abgelaufen – bitte noch einmal Benutzername und Passwort eingeben.');
                const u = await this.vrc.verify2fa(p.cookies, str(input.type || 'totp'), str(input.code));
                this.vrc.pending = null;
                this.vrc.saveAccount(u, p.cookies);
                return { ok: true };
            }
            if (act === 'ui_bg_upload') return this.bgUpload(files);
            if (act === 'ui_font_upload') return this.fontUpload(files);   // 5.5
            if (act === 'ui_font_clear') { this.db.setSetting('ui_font_file', ''); return Object.assign(this.settings.save({ 'ui.font_file': '', 'ui.font': this.settings.get('ui.font') === 'custom' ? 'default' : this.settings.get('ui.font') }), { msg: 'Eigene Schrift entfernt.' }); }
            if (act === 'cancel_login') { this.vrc.pending = null; return { ok: true }; }
            if (act.startsWith('client_')) return await this.client(act, input);
            if (act.startsWith('cam_')) return await this.cam.action(act, input);
            if (act.startsWith('cbx_') || act.startsWith('osct_') || act.startsWith('mosc_')) { if (!this.osctools) throw new UserError('Nur in der Windows-App.'); return await this.osctools.action(act, input); }
            if (act === 'media_status') return this.media ? this.media.status() : { available: false };
            if (act === 'media_ctl') { if (!this.media) throw new UserError('Nur in der Windows-App.'); return this.media.control(str(input.cmd), str(input.id)); }
            if (act.startsWith('auto_')) return await this.auto.action(act, input);
            if (act === 'hud_state') return this.hudState();
            if (act.startsWith('nsfw_')) return await this.nsfw.action(act, input);
            if (act.startsWith('nsfwc_')) return await this.nsfwcol.action(act, input);
            if (act.startsWith('admin_')) return await this.admin.action(act, input);
            if (act.startsWith('toys_') || act.startsWith('toys3_')) { if (!this.toys) throw new UserError('Nur in der Windows-App.'); return await this.toys.action(act, input); }
            if (act.startsWith('tremote_')) { if (!this.toyremote) throw new UserError('Nur in der Windows-App.'); return await this.toyremote.action(act, input); }
            if (act.startsWith('remote_')) { if (!this.remote) throw new UserError('Nur in der Windows-App.'); return this.remote.action(act, input); }
            // Dashboard-Verbindung & Cloud-Sicherung: nur für den Besitzer
            if ((act.startsWith('backup_') || /^tools_link/.test(act) || act.startsWith('link_')) && !this.nsfw.isOwner()) throw new UserError('Nur für den Besitzer.');
            if (act === 'clipboard_write') { const h = this.tools && this.tools.host; if (!h || !h.copy) throw new UserError('Nicht verfügbar.'); h.copy(cut(str(input.text), 5000)); return { ok: true }; }
            if (act.startsWith('subs_')) { if (!this.subs) throw new UserError('Übersetzer gibt es nur in der Windows-App.'); return await this.subs.action(act, input); }
            if (act.startsWith('speech_')) { if (!this.speech) throw new UserError('Spracheingabe gibt es nur in der Windows-App.'); return await this.speech.action(act, input); }
            if (act.startsWith('space_')) return await this.vrspace.action(act, input);   // 3.3 VR-Bewegung
            if (act.startsWith('prof_')) return await this.profiles.action(act, input);   // 3.4 Multiaccount (Konten wechseln)
            if (act === 'overlay_act') return await this.tools.apiAction(str(input.action), input);
            if (act === 'overlay_cfg') { const s = this.settings.all(); return { phrases: str(s['vr.overlay_phrases']).split('\n').map(x => x.trim()).filter(Boolean).slice(0, 40), translate: !!s['vr.overlay_translate'], target: str(s['tr.chat_target'] || ''),
                theme: str(s['ui.theme'] || 'neon'), accent: str(s['ui.accent'] || ''), pos: this.overlayPos() }; }   // 3.8.4: Theme + Lage fürs Overlay
            if (act === 'overlay_pos') {   // 3.8.4: Lage live im Overlay verstellen (nur diese Schlüssel)
                const k = str(input.key);
                if (!OVERLAY_POS.includes(k)) throw new UserError('Unbekannte Einstellung.');
                if (input.reset === '1') this.settings.save({ [k]: this.settings.defaults()[k] });
                else if (input.value !== undefined && input.value !== '') this.settings.save({ [k]: /^-?\d+(\.\d+)?$/.test(String(input.value)) ? Number(input.value) : str(input.value) });
                else if (input.value !== undefined) this.settings.save({ [k]: str(input.value) });
                else this.settings.save({ [k]: Number(this.settings.get(k)) + Number(input.delta || 0) });
                return { pos: this.overlayPos() };
            }
            if (act.startsWith('ins_')) return await this.insights.action(act, input);
            if (act.startsWith('mod_')) return await this.mod.action(act, input);
            if (act.startsWith('coll_')) return await this.coll.action(act, input);
            if (act === 'about') return this.about(input);
            if (act === 'about_supporters') return await this.liveSupporters();
            if (act.startsWith('tts_')) { if (!this.tts) throw new UserError('Die Sprachausgabe gibt es nur in der Windows-App.'); return await this.tts.action(act, input); }
            if (act.startsWith('acct_')) return await this.account.action(act, input);
            if (act.startsWith('comm_')) return await this.comm.action(act, input, files);
            if (act.startsWith('btn_')) return await this.buttons.action(act, input);
            if (act.startsWith('deco_')) return await this.deco.action(act, input);
            if (act.startsWith('net_')) { if (!this.vrc.account()) throw new UserError('Erst bei VRChat anmelden.'); return await this.netgraph.action(act, input); }
            if (act === 'win_titlebar') { if (this.tools.host.setTitleBar) this.tools.host.setTitleBar({ color: str(input.color), symbol: str(input.symbol) }); return { ok: true }; }
            if (act.startsWith('voice_')) { if (!this.voice) throw new UserError('Sprachanrufe gibt es vorerst nur in der Windows-App.'); return await this.voice.action(act, input); }
            if (act.startsWith('plug_')) { if (!this.plugins) throw new UserError('Plugins gibt es nur in der Windows-App.'); return await this.plugins.action(act, input, files); }
            if (act.startsWith('chat_')) { if (!this.chat) throw new UserError('Der verschlüsselte Chat kommt für Android später.'); return await this.chat.action(act, input, files); }
            if (act.startsWith('warn_')) return await this.warn.action(act, input);
            if (act.startsWith('pulse_')) return await this.pulse.action(act, input);
            if (act.startsWith('preset_')) return await this.presets.action(act, input);
            if (act.startsWith('comfort_')) return await this.comfort.action(act, input);
            if (act.startsWith('pclink_')) { if (!this.pclink) throw new UserError('Nur in der Handy-App.'); return await this.pclink.action(act, input); }
            if (act.startsWith('watch_')) { if (!this.watch) throw new UserError('Die Uhr-App verbindet sich nur mit der Windows-App.'); return await this.watch.actionUi(act, input); }
            if (act.startsWith('obs_')) { if (!this.obs) throw new UserError('OBS gibt es nur in der Windows-App.'); return await this.obs.action(act, input); }
            if (act.startsWith('hr_')) { if (!this.heart) throw new UserError('Den Puls gibt es nur in der Windows-App.'); return await this.heart.action(act, input); }
            if (act.startsWith('cm_')) { if (!this.chatmods) throw new UserError('Chatbox-Module gibt es nur in der Windows-App.'); return await this.chatmods.action(act, input); }
            if (act.startsWith('backup_')) return await this.backup.action(act, input);
            if (act.startsWith('stream_')) { if (!this.stream) throw new UserError('Der Stream-Bot läuft nur in der Windows-App.'); return await this.stream.action(act, input); }
            if (act === 'osclog' || act === 'osclog_clear') return this.osclog.action(act, input);
            if (act === 'home_data') return this.home.data();
            if (act === 'home_summary') return this.home.summary();
            if (act.startsWith('tools_')) return await this.toolAction(act, input);
            if (['tr_status', 'tr_key', 'tr_prefs', 'translate', 'tr_test'].includes(act)) return await this.trAction(act, input);
            if (act === 'update_status') return this.updater.status();
            if (act === 'update_check') { const st = await this.updater.check(); return Object.assign(this.updater.status(), { msg: st.available ? '⬆ Version ' + st.version + ' ist verfügbar.' : '✔ Du hast die neueste Version (' + st.current + ').' }); }
            if (act === 'update_install') return await this.updater.install();
            const acc = this.vrc.account();
            if (!acc) throw new VrcAuthError('Kein VRChat-Konto verbunden.');
            return await this.action(act, input, files, acc, id, user, valid);
        }
    }

    // ---------------- Desktop-Teil (Spiel-Log & OSC, lokal) ----------------
    async client(act, input) {
        const g = this.game;
        switch (act) {
            case 'client_overview':
                return { tokens: [{ id: 0, name: 'Dieser PC', created: 0, last_seen: now(), ip: '', version: VERSION, platform: process.platform === 'win32' ? 'Windows' : process.platform, online: true }],
                    state: g.stateRow(), stats: g.stats(), osc: g.oscRecent(), presets: g.presets(), kinds: KINDS, api: '', local: true, cfg: g.cfg(), log_dir: g.logDir() };
            case 'client_cfg_save': return { cfg: g.saveCfg(input), msg: 'Gespeichert.' };
            case 'client_import': return { msg: g.importAll() + ' Ereignisse aus allen vorhandenen Logs eingelesen.' };
            case 'client_log': return { events: g.list(input) };
            case 'client_players': return { players: g.players(Math.max(1, Math.min(3650, int(input.days) || 30)), str(input.q).trim()) };
            case 'client_visits': return { visits: g.visits(Math.max(1, Math.min(365, int(input.days) || 7))).slice(0, 200) };
            case 'client_osc': {
                let sent = null;
                if (str(input.kind) === 'chatbox' && truthy(input.translate)) { const c = await this.tr.chat(str(input.text), str(input.target)); input = Object.assign({}, input, { text: c.text }); sent = c.text; }
                const nid = await g.oscSend(str(input.kind), input);
                if (str(input.kind) === 'chatbox' && this.osctools && !truthy(input.clear)) this.osctools.addHist(sent || str(input.text));
                // getippte Chatbox-Nachricht zusätzlich vorlesen (Sprachausgabe → „Chatbox-Nachrichten sprechen“)
                if (str(input.kind) === 'chatbox' && this.tts && !truthy(input.clear)) { const tc = this.tts.cfg(); if (tc.enabled && tc.on_chat) this.tts.say(sent || str(input.text), 'chatbox').catch(() => {}); }
                return { id: nid, osc: g.oscRecent(), sent };
            }
            case 'client_osc_status': return { osc: g.oscRecent(), state: g.stateRow() };
            case 'client_preset_save': g.presetSave(input.label, str(input.kind), input); return { presets: g.presets() };
            case 'client_preset_delete': g.presetDelete(input.preset); return { presets: g.presets() };
            case 'client_rot_preview': return { text: g.rotatorText(str(input.text)) };
            case 'client_log_clear': return { deleted: g.clear() };
            case 'client_params': return this.params.list(str(input.avatar));
            case 'client_oscinfo': return this.oscStatus();
            case 'client_oscrefresh': this.refreshKnown(); if (this.oq) this.oq.discover(); return this.oscStatus();
            case 'client_debug': {   // 4.2: intime Parameter nur bei Freigabe und ohne Privat-Modus
                const o = g.osc, H = require('./haptics'), vis = this.nsfwVisible();
                const params = vis ? (o.params || {}) : Object.fromEntries(Object.entries(o.params || {}).filter(([k]) => !H.isNsfw(k)));
                const hidden = vis ? 0 : Object.keys(o.params || {}).length - Object.keys(params).length;
                const cur = this.params.current();
                return { active: !!o.active, error: str(o.listenError), avatar: str(o.avatarId), avatar_name: cur.name, avatar_src: cur.src, params, changed: o.changedAt || {}, hidden, types: o.known || {},
                    mode: this.oscMode || (o.listener ? 'classic' : 'aus'), listen_port: o.listenPort || 0, oscquery: !!(this.oq && this.oq.vrchat) };
            }
            case 'client_macros': return { macros: this.macros.list() };
            case 'client_macro_save': return { macros: this.macros.save(input.name, input.script, input.id), msg: 'Makro gespeichert.' };
            case 'client_macro_delete': return { macros: this.macros.remove(input.id) };
            case 'client_macro_run': { const r = await this.macros.run(str(input.id) || str(input.script)); return { msg: r.steps + ' Schritte ausgeführt.' }; }
            case 'client_macro_stop': this.macros.stop(); return { msg: 'Gestoppt.' };
            case 'client_auto': { const sub = str(input.sub); if (!/^auto_[a-z]+$/.test(sub)) throw new UserError('Unbekannte Aktion.'); return await this.auto.action(sub, input); }
            case 'client_param_fav': return { favs: this.params.toggleFav(str(input.avatar), str(input.name)) };
        }
        throw new UserError('Unbekannte Aktion.');
    }

    // ---------------- Werkzeuge, Einstellungen, Spielerliste (tools.js) ----------------
    /** eigenes Hintergrundbild – bleibt nur in der App-Datenbank auf diesem Gerät */
    bgUpload(files) {
        const f = files.file;
        if (!f || !f.buffer || !f.buffer.length) throw new UserError('Keine Datei gewählt.');
        if (f.buffer.length > 8 * 1048576) throw new UserError('Bild zu groß (max. 8 MB).');
        const b = f.buffer;
        const mime = b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.subarray(0, 3).toString() === 'GIF' ? 'image/gif'
            : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
        if (!mime) throw new UserError('Bitte ein Bild (PNG, JPG, GIF oder WebP) wählen.');
        this.db.setSetting('ui_bg_file', 'data:' + mime + ';base64,' + b.toString('base64'));
        return Object.assign(this.settings.save({ 'ui.bg_image': 'local:' + Date.now() }), { msg: 'Hintergrundbild gesetzt.' });
    }

    /** 5.5: eigene Schrift – bleibt nur in der App-Datenbank auf diesem Gerät */
    fontUpload(files) {
        const f = files.file;
        if (!f || !f.buffer || !f.buffer.length) throw new UserError('Keine Datei gewählt.');
        if (f.buffer.length > 3 * 1048576) throw new UserError('Schrift zu groß (max. 3 MB).');
        const b = f.buffer, m4 = b.subarray(0, 4).toString('latin1');
        const mime = m4 === 'wOF2' ? 'font/woff2' : m4 === 'wOFF' ? 'font/woff' : m4 === 'OTTO' ? 'font/otf' : (b.readUInt32BE(0) === 0x00010000 || m4 === 'true') ? 'font/ttf' : '';
        if (!mime) throw new UserError('Bitte eine Schrift-Datei (TTF, OTF, WOFF oder WOFF2) wählen.');
        this.db.setSetting('ui_font_file', 'data:' + mime + ';base64,' + b.toString('base64'));
        return Object.assign(this.settings.save({ 'ui.font_file': 'local:' + Date.now(), 'ui.font': 'custom' }), { msg: '🔤 Schrift übernommen.' });
    }

    /** Inhalt für das SteamVR-HUD: gewählte Infos + die letzten Untertitel */
    hudState() {
        const s = this.settings.all(), v = this.game.values();
        let fr = 0; try { fr = this.vrc.friendList().filter(f => f.state === 'online').length; } catch (e) { /* ohne Konto */ }
        const ALL = { zeit: ['🕒', v.zeit, ''], welt: ['🌐', v.welt, ''], spieler: ['👥', v.spieler, 'Spieler'], dauer: ['⏱', v.dauer, ''], musik: ['🎵', v.musik || '', ''],
            freunde: ['🟢', String(fr), 'Freunde online'], avatar: ['🎭', v.avatar, ''], region: ['📍', v.region, ''], puls: ['💓', v.puls ? v.puls : '', 'bpm'] };
        // 4.1 (NSFW): Lust & Spielzeug-Stärke – nur freigeschaltet, nie im Privat-Modus
        if (this.toys && this.nsfw && this.nsfw.access().features.includes('toys') && !this.nsfw.private) {
            const ts = this.toys.status();
            ALL.lust = ['💗', ts.lust.v ? ts.lust.v + ' %' : '', ts.lust.edging ? 'Edging' : ''];
            ALL.toy = ['🎮', ts.devices.length ? Math.max(0, ...ts.devices.map(d => d.out)) + ' %' : '', ''];
        }
        const items = str(s['vr.overlay_hud_items']).split(/[\s,;]+/).filter(k => ALL[k] && ALL[k][1] && ALL[k][1] !== '–').map(k => ({ key: k, icon: ALL[k][0], value: cut(ALL[k][1], 60), label: ALL[k][2] }));
        const subs = this.subs, now = Date.now();
        const lines = s['vr.overlay_hud_subs'] !== false && subs ? subs.recent().filter(l => now - l.t < 30000).slice(-3) : [];
        const c = subs ? subs.cfg() : {};
        return { items, lines, target: subs ? subs.target(c) : 'DE', show_orig: !!c.show_orig, theme: str(s['ui.theme'] || 'neon'), accent: str(s['ui.accent'] || '') };
    }

    async toolsExport(kind) {
        const t = this.tools, day = new Date().toISOString().slice(0, 10);
        if (kind === 'discord') return download(t.csv('discord', t.discordNames()), 'text/csv; charset=utf-8', 'vrchat-discord-namen_' + day + '.csv');
        if (kind === 'memos') return download(t.csv('memos', t.memos()), 'text/csv; charset=utf-8', 'vrc-nexus-memos_' + day + '.csv');
        if (kind === 'avatars') return download(t.csv('avatars', await t.ownAvatars()), 'text/csv; charset=utf-8', 'meine-avatare_' + day + '.csv');
        if (kind === 'settings') return download(JSON.stringify(Object.assign({}, this.settings.all(), { 'int.api_token': undefined }), null, 2), 'application/json', 'vrc-nexus-einstellungen.json');
        throw new UserError('Unbekannter Export.');
    }

    /** Übersetzen – gleiche Aktionen wie im Dashboard (nexus.php), damit eine Oberfläche für beide reicht */
    async trAction(act, input) {
        const tr = this.tr, s = this.settings;
        const status = () => { const st = tr.status(); const all = s.all(); st.prefs = { provider: all['tr.provider'], chat_target: all['tr.chat_target'], chat_mode: all['tr.chat_mode'], ui_target: all['tr.ui_target'], chat_default: all['tr.chat_default'], select_button: all['tr.select_button'] }; return st; };
        if (act === 'tr_status') return status();
        if (act === 'tr_key') { tr.saveKey(str(input.provider), str(input.key)); return Object.assign(status(), { msg: str(input.key).trim() ? 'Schlüssel gespeichert.' : 'Schlüssel entfernt.' }); }
        if (act === 'tr_prefs') {
            const map = {};
            for (const k of ['provider', 'chat_target', 'chat_mode', 'ui_target', 'chat_default', 'select_button']) if (input[k] !== undefined) map['tr.' + k] = input[k];
            s.save(map);
            return Object.assign(status(), { msg: 'Gespeichert.' });
        }
        if (act === 'translate') return await tr.translate(str(input.text), str(input.target), str(input.provider));
        const r = await tr.translate('Hallo, wie geht es dir?', 'EN-US', str(input.provider));
        return { msg: '✔ ' + (r.provider === 'deepl' ? 'DeepL' : 'Google') + ': „' + r.text + '“' };
    }

    async toolAction(act, input) {
        const t = this.tools, s = this.settings;
        const needAcc = () => { if (!this.vrc.account()) throw new VrcAuthError('Kein VRChat-Konto verbunden.'); };
        switch (act) {
            case 'tools_overview': return await t.overview();
            case 'tools_settings': return { schema: s.schema(), settings: s.all(), status: { api: t.api.status(), rpc: s.get('int.rpc') ? t.rpc.status() : 'aus' }, tr: this.tr.status() };
            case 'tools_settings_save': { let data = {}; try { data = JSON.parse(str(input.data) || '{}'); } catch (e) { throw new UserError('Ungültige Daten.'); } return Object.assign(s.save(data), { msg: 'Gespeichert.' }); }
            case 'tools_settings_reset': return { settings: s.reset(), msg: 'Alle Einstellungen zurückgesetzt.' };
            case 'tools_streamdeck_install': {
                const f = t.host.pluginFile;
                if (!f || !fs.existsSync(f)) throw new UserError('Plugin-Datei nicht gefunden – sie liegt im GitHub-Artefakt „VRC-Nexus-Windows“ (VRC-Nexus.streamDeckPlugin).');
                if (t.host.openPath) await t.host.openPath(f);
                return { msg: 'Stream-Deck-App wird geöffnet – Installation dort bestätigen.' };
            }
            case 'tools_translate': return await this.tr.translate(str(input.text), str(input.target), str(input.provider));
            case 'tools_tr_key': return Object.assign(this.tr.saveKey(str(input.provider), str(input.key)), { msg: str(input.key).trim() ? 'Schlüssel gespeichert.' : 'Schlüssel entfernt.' });
            case 'tools_tr_test': { const r = await this.tr.translate('Hallo, wie geht es dir?', 'EN-US', str(input.provider)); return { msg: '✔ ' + (r.provider === 'deepl' ? 'DeepL' : 'Google') + ': „' + r.text + '“' }; }
            case 'tools_link_status': return this.link.info();
            case 'tools_link_token': return Object.assign(this.link.saveToken(str(input.token)), { msg: str(input.token).trim() ? 'Token gespeichert.' : 'Token entfernt.' });
            case 'tools_link_test': return await this.link.test();
            case 'tools_link_sync': { this.link.last = { osc: 0, state: 0, events: 0, notes: 0 }; await this.link.tick(); const n = this.link.s('link.notes') ? await this.link.syncNotes() : { sent: 0, received: 0 }; return Object.assign(this.link.info(), { msg: 'Abgeglichen: ' + this.link.status.sent + ' Spiel-Ereignisse hochgeladen, Notizen ' + n.sent + ' gesendet / ' + n.received + ' empfangen.' }); }
            case 'tools_remote_state': return await this.link.remoteState();
            case 'tools_remote_send': { const d = Object.assign({}, input); delete d.act; return await this.link.remoteSend(str(input.kind), d); }
            case 'tools_token': return { token: s.newToken(), msg: 'Neuer Zugangsschlüssel erstellt – im Stream-Deck-Plugin eintragen.' };
            case 'tools_test_notify': return t.testAlert();
            case 'tools_backup': return t.backupNow();
            case 'tools_cache_clear': this.db.exec('DELETE FROM user_cache; DELETE FROM mutual_cache;'); return { msg: 'Zwischenspeicher geleert.' };
            case 'tools_dbinfo': return this.tools.dbInfo();
            case 'tools_cleanup': return this.tools.cleanup(true);
            case 'tools_vacuum': this.db.exec('VACUUM'); this.db.save(); return { msg: 'Datenbank optimiert.' };
            case 'tools_folder': return await t.openFolder(str(input.which));
            case 'tools_players': return t.playersNow();
            case 'tools_memo': needAcc(); return await t.memoSave(str(input.id), str(input.memo));
            case 'tools_network': needAcc(); return t.network(truthy(input.start));
            case 'tools_activity': return t.activity(str(input.day));
            case 'tools_shots': return t.screenshots(str(input.q));
            case 'tools_shot': { const f = t.shotPath(str(input.rel)); return { meta: t.shotMeta(f), rel: str(input.rel), name: path.basename(f), path: f }; }
            case 'tools_shot_meta': { const f = t.shotPath(str(input.rel)); if (!/\.png$/i.test(f)) throw new UserError('Nur bei PNG möglich.'); t.writeMeta(f, truthy(input.clear) ? undefined : t.metaNow()); return { meta: t.shotMeta(f), msg: 'Aktuelle Welt & Mitspieler eingetragen.' }; }
            case 'tools_shot_open': { const f = t.shotPath(str(input.rel)); if (t.host.openPath) await t.host.openPath(truthy(input.folder) ? path.dirname(f) : f); return { ok: true }; }
            case 'tools_config': return t.configRead();
            case 'tools_config_save': return t.configSave(input);
            case 'tools_launch_save': { const c = t.launchSave(input); return { launch: c, args: t.launchArgs(c).join(' '), msg: 'Gespeichert.' }; }
            case 'tools_launch': return await t.launch(str(input.location));
            case 'tools_reg_list': return { list: t.regList(), windows: process.platform === 'win32' };
            case 'tools_reg_backup': return await t.regBackup(str(input.label));
            case 'tools_reg_restore': return await t.regRestore(str(input.name));
            case 'tools_reg_delete': return t.regDelete(str(input.name));
            case 'tools_auto_save': return { auto: t.autoSave(input), msg: 'Gespeichert.' };
            case 'tools_group_invites': needAcc(); return await t.groupInvites();
            case 'tools_group_blocked': needAcc(); return await t.groupBlocked();
            case 'tools_group_act': needAcc(); return await t.groupAct(str(input.kind), str(input.id));
            case 'tools_messages': needAcc(); return await t.messages(str(input.type) || 'message');
            case 'tools_message_save': needAcc(); return await t.messageSave(str(input.type), input.slot, str(input.message));
            case 'tools_reports': needAcc(); return await t.reports();
            case 'tools_report_delete': needAcc(); return await t.reportDelete(str(input.id));
            case 'tools_user_json': needAcc(); return await t.userJson(str(input.id));
            case 'tools_raw_json': { needAcc(); const k = str(input.kind) === 'avatar' ? 'avatar' : 'world'; const id = U.valid(str(input.id), k === 'avatar' ? 'avtr' : 'wrld'); return { data: await t.call('GET', '/' + k + 's/' + encodeURIComponent(id)) }; }
            case 'tools_user_tab': needAcc(); return await t.userTab(str(input.id), str(input.tab));
            case 'tools_group_instances': return t.groupInstances(str(input.id));
            case 'tools_discord_names': return { rows: t.discordNames() };
            case 'tools_memos_to_vrc': needAcc(); return await t.memosToVrc(truthy(input.overwrite));
        }
        throw new UserError('Unbekannte Aktion.');
    }

    // ---------------- VRChat-Aktionen ----------------
    async action(act, input, files, acc, id, user, valid) {
        const v = this.vrc, x = this.x, db = this.db;
        const call = (m, p, q = {}, b = null) => v.call(acc, m, p, q, b);
        const enc = encodeURIComponent;
        const quiet = async fn => { try { return await fn(); } catch (e) { if (e instanceof VrcAuthError) throw e; return null; } };
        const platforms = list => [...new Set(arr(list).map(p => U.VRC_PLATFORM[p.platform] || str(p.platform)))];
        switch (act) {
            case 'logout': await v.disconnect(true); return { ok: true };
            case 'state': {
                let sync = { synced: false, wait: 0 }, error = '';
                // 3.7.2: alter Fehler „Sitzung abgelaufen“ aus früheren Versionen (Konto blieb hängen) → jetzt einmal echt prüfen
                if (/Sitzung abgelaufen/.test(str(acc.last_error))) {
                    const me = await v.call(acc, 'GET', '/auth/user');   // 401 → meldet automatisch ab (VrcAuthError)
                    if (!me.id) { v.expire(); throw new VrcAuthError('Die VRChat-Sitzung ist abgelaufen – du wurdest abgemeldet. Bitte neu anmelden.'); }
                    db.prepare("UPDATE accounts SET last_error = '' WHERE user_id = ?").run(UID); acc.last_error = '';
                }
                if (truthy(input.refresh)) {
                    try { sync = await v.sync(truthy(input.force)); }
                    catch (e) { if (e instanceof VrcAuthError) throw e; error = e.message; db.prepare('UPDATE accounts SET last_error = ? WHERE user_id = ?').run(error, UID); }
                    acc = v.account();
                }
                const m = acc.me;
                const myloc = U.location(m.location);
                if (myloc.world) myloc.world_name = (v.worlds([myloc.world])[myloc.world] || {}).name || '';
                let favGroups = {};
                try { favGroups = JSON.parse(acc.fav_groups) || {}; } catch (e) { favGroups = {}; }
                return { me: { id: acc.vrc_id, name: acc.display_name, image: acc.avatar, status: str(m.status), status_desc: str(m.statusDescription), trust: U.trust(m.tags),
                    platform: U.VRC_PLATFORM[m.last_platform] || '', pronouns: str(m.pronouns), history: arr(m.statusHistory).slice(0, 6), location: myloc.kind === 'world' ? myloc.location : '',
                    loc: myloc, bio: str(m.bio), links: arr(m.bioLinks), avatar: str(m.currentAvatar) },
                    fav_groups: favGroups, friends: v.friendList(), feed: v.feed({ limit: 30 }), last_sync: int(acc.last_sync), connected_at: int(acc.connected_at),
                    error: error || acc.last_error, sync };
            }
            case 'feed':
                return { items: v.feed({ type: str(input.type).split(',').filter(Boolean), q: cut(str(input.q).trim(), 60), before: int(input.before), friend: str(input.friend),
                    favorites: truthy(input.favorites), limit: 100 }) };
            case 'user': {
                const u = await call('GET', '/users/' + enc(valid(id, 'usr')));
                const loc = U.location(u.location);
                if (loc.world) { await v.fetchWorlds(acc, [loc.world], 1); loc.world_info = v.worlds([loc.world])[loc.world] || null; }
                const groups = (await quiet(() => call('GET', '/users/' + enc(id) + '/groups'))) || [];
                const n = v.note(id);
                const deco = this.deco ? this.deco.resolve(this.deco.remember(u.id, u)) : null;
                if (deco) await this.deco.catalog().catch(() => null);
                return { user: { deco: deco ? this.deco.resolve(this.deco.remember(u.id, u)) : null, nexus_admin: !!(this.nsfw && this.nsfw.isOwner(str(u.id))), id: u.id, name: str(u.displayName), image: U.userImage(u) || ((v.friendList() || []).find(f => f.id === u.id) || {}).image || U.userImage(this.tools.cached(u.id) || {}), status: str(u.status), status_desc: str(u.statusDescription), bio_html: U.formatText(u.bio),
                    links: arr(u.bioLinks).filter(l => /^https?:\/\//.test(str(l))), pronouns: str(u.pronouns), trust: U.trust(u.tags), platform: U.VRC_PLATFORM[u.last_platform] || str(u.last_platform),
                    is_friend: !!u.isFriend, joined: str(u.date_joined), last_login: str(u.last_login), last_activity: str(u.last_activity), loc, note: n.note, favorite: !!n.favorite,
                    stats: v.friendStats(id), lists: str(n.tags), watch: !!n.watch, warn: this.warn ? this.warn.get(id) : null,
                    groups: arr(groups).map(g => ({ id: str(g.groupId), name: str(g.name), icon: str(g.iconUrl), members: int(g.memberCount), rep: !!g.isRepresenting })),
                    // 3.8.3: Profilkarte – Sprachen, Abzeichen, 18+, Banner, aktueller Avatar, Avatar-Klonen
                    languages: arr(u.tags).map(t => (/^language_([a-z]{3})$/.exec(str(t)) || [])[1]).filter(Boolean).slice(0, 6),
                    badges: arr(u.badges).filter(b => b && b.showcased !== false && U.https(b.badgeImageUrl)).slice(0, 12).map(b => ({ img: U.https(b.badgeImageUrl), name: cut(str(b.badgeName), 60), desc: cut(str(b.badgeDescription), 160) })),
                    age18: str(u.ageVerificationStatus) === '18+' || u.ageVerified === true,
                    banner: (deco && deco.banner) || U.https(u.profilePicOverride) || U.https(u.currentAvatarImageUrl) || '',
                    avatar_thumb: U.https(u.currentAvatarThumbnailImageUrl) || '', clone: u.allowAvatarCopying === true ? true : u.allowAvatarCopying === false ? false : null } };
            }
            // 3.9: Info-Karte für Links/IDs im Feed und Chat (Konto, Gruppe, Welt, Instanz, Avatar, Event) – 1 h zwischengespeichert
            case 'card_info': {
                const kind = str(input.kind), key = kind + ':' + id;
                this.cardCache = this.cardCache || new Map();
                const hit = this.cardCache.get(key);
                if (hit && Date.now() - hit.at < 3600000) return hit.card;
                let card;
                try {
                    if (kind === 'user') {
                        const u = await call('GET', '/users/' + enc(valid(id, 'usr')));
                        card = { kind, id: u.id, name: str(u.displayName), image: U.userImage(u), sub: str(u.statusDescription) || str(u.status), trust: U.trust(u.tags), pronouns: str(u.pronouns), friend: !!u.isFriend, status: str(u.status) };
                    } else if (kind === 'group' || kind === 'gshort') {
                        let gid = id;
                        if (kind === 'gshort') {
                            const m = /^([a-z0-9]{3,6})\.(\d{4})$/i.exec(id); if (!m) throw new UserError('Ungültiger Gruppen-Code.');
                            const hits = arr(await call('GET', '/groups', { query: m[1] + '.' + m[2], n: 10 }));
                            const g0 = hits.find(g => str(g.shortCode).toLowerCase() === m[1].toLowerCase() && str(g.discriminator) === m[2]);
                            if (!g0) throw new UserError('Gruppe nicht gefunden.');
                            gid = str(g0.id);
                        }
                        const g = await call('GET', '/groups/' + enc(valid(gid, 'grp')));
                        card = { kind: 'group', id: str(g.id), name: str(g.name), image: U.https(g.iconUrl) || '', banner: U.https(g.bannerUrl) || '', sub: str(g.shortCode) ? str(g.shortCode) + '.' + str(g.discriminator) : '', members: int(g.memberCount), online: int(g.onlineMemberCount), desc: cut(str(g.description), 220), join: str(g.joinState) };
                    } else if (kind === 'world' || kind === 'instance') {
                        const wid = kind === 'instance' ? id.split(':')[0] : id;
                        const w = await call('GET', '/worlds/' + enc(valid(wid, 'wrld')));
                        card = { kind, id, world: str(w.id), name: str(w.name), image: U.https(w.thumbnailImageUrl) || U.https(w.imageUrl) || '', sub: str(w.authorName), occupants: int(w.occupants), capacity: int(w.capacity), favorites: int(w.favorites) };
                        if (kind === 'instance') { const l = U.location(id); card.access = l.access || ''; card.region = l.region || ''; }
                    } else if (kind === 'avatar') {
                        const av = await call('GET', '/avatars/' + enc(valid(id, 'avtr')));
                        card = { kind, id: str(av.id), name: str(av.name), image: U.https(av.thumbnailImageUrl) || U.https(av.imageUrl) || '', sub: str(av.authorName), status: str(av.releaseStatus) };
                    } else if (kind === 'event') {
                        const [g, c] = id.split('/');
                        const e = await call('GET', '/calendar/' + enc(valid(g, 'grp')) + '/' + enc(valid(c, 'cal')));
                        card = { kind, id, group: g, name: str(e.title), image: U.https(e.imageUrl) || '', sub: str(e.category), starts: str(e.startsAt), ends: str(e.endsAt), desc: cut(str(e.description), 220), interested: int(e.interestedUserCount) };
                    } else throw new UserError('Unbekannte Karte.');
                } catch (e) {
                    if (e instanceof VrcAuthError) throw e;
                    card = { kind, id, error: e.message || 'nicht gefunden' };
                }
                if (this.cardCache.size > 500) this.cardCache.clear();
                this.cardCache.set(key, { at: Date.now(), card });
                return card;
            }
            case 'note_save':
                v.noteSave(valid(id, 'usr'), str(input.note), truthy(input.favorite), input.lists !== undefined ? str(input.lists) : null, input.watch !== undefined ? truthy(input.watch) : null);
                if (truthy(input.remote)) { await call('POST', '/userNotes', {}, { targetUserId: id, note: cut(input.note, 256) }); return { msg: 'Notiz gespeichert – auch in VRChat.' }; }
                return { ok: true };
            case 'invite_self':
                if (!isLoc(input.location)) throw new UserError('Diese Instanz kann man nicht betreten.');
                await call('POST', '/invite/myself/to/' + input.location);
                return { msg: 'Einladung an dich selbst gesendet – im Spiel annehmen.' };
            case 'request_invite': await call('POST', '/requestInvite/' + enc(valid(id, 'usr')), {}, {}); return { msg: 'Einladungs-Anfrage gesendet.' };
            case 'friend_request': await call('POST', '/user/' + enc(valid(id, 'usr')) + '/friendRequest'); return { msg: 'Freundschaftsanfrage gesendet.' };
            case 'unfriend': await call('DELETE', '/auth/user/friends/' + enc(valid(id, 'usr'))); return { msg: 'Freundschaft beendet.' };
            case 'search': {
                const s = str(input.q).trim();
                if (Array.from(s).length < 2) throw new UserError('Bitte mindestens 2 Zeichen eingeben.');
                return { users: arr(await call('GET', '/users', { search: s, n: 30 })).map(u => ({ id: u.id, name: str(u.displayName), image: U.userImage(u), trust: U.trust(u.tags),
                    status: str(u.status), status_desc: str(u.statusDescription), is_friend: !!u.isFriend })) };
            }
            case 'notifications': {
                const warn = truthy(input.cached) ? [] : await x.notifSync(acc);
                return Object.assign(x.notifList({ view: str(input.view || 'open'), type: str(input.type), q: str(input.q) }), { labels: NOTIF_TYPES, resp_labels: NOTIF_RESPONSES, warn });
            }
            case 'notif_act': return { msg: await x.notifAction(acc, id, str(input.op), str(input.rtype)) };
            case 'notif_clear': return { msg: x.notifClear() + ' alte Einträge aus dem Verlauf gelöscht.' };
            case 'notif_accept':
                if (!/^(frq|not)_[0-9a-f-]{8,40}$/i.test(id)) throw new UserError('Ungültige Benachrichtigung.');
                await call('PUT', '/auth/user/notifications/' + enc(id) + '/accept');
                return { msg: 'Angenommen.' };
            case 'notif_hide':
                if (!/^(frq|not)_[0-9a-f-]{8,40}$/i.test(id)) throw new UserError('Ungültige Benachrichtigung.');
                await call('PUT', '/auth/user/notifications/' + enc(id) + '/hide');
                return { ok: true };
            case 'shop': return await x.shopOverview(acc);
            case 'shop_store': return await x.shopStore(acc);
            case 'shop_saved': return x.saved();
            case 'shop_save': return x.saveToggle(str(input.kind), typeof input.data === 'string' ? (() => { try { return JSON.parse(input.data); } catch (e) { return {}; } })() : input.data);
            case 'shop_browse': return await x.shopBrowse(acc, str(input.target));
            case 'global_stats': {
                const out = await x.globalStats(Math.max(1, Math.min(365, int(input.days) || 1)));
                out.friends = db.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN state = 'online' THEN 1 ELSE 0 END) AS online FROM friends WHERE user_id = ?").get(UID);
                return out;
            }
            case 'hot_worlds': return { worlds: await x.hotWorlds(acc) };
            case 'status': {
                const status = str(input.status);
                if (!['join me', 'active', 'ask me', 'busy'].includes(status)) throw new UserError('Ungültiger Status.');
                await call('PUT', '/users/' + enc(acc.vrc_id), {}, { status, statusDescription: cut(str(input.desc).trim(), 32) });
                db.prepare('UPDATE accounts SET last_sync = 0 WHERE user_id = ?').run(UID);
                return { msg: 'Status geändert.' };
            }

            // ----- Gruppen -----
            case 'groups': {
                const res = arr(await call('GET', '/users/' + enc(acc.vrc_id) + '/groups'));
                const gp = await v.groupPerms(acc, res);
                return { groups: res.map(g => { const p = g.ownerId === acc.vrc_id ? ['*'] : (gp[g.groupId] || []);
                    return { perms: p, mod: v.canKick(p), staff: v.canModerate(p), id: str(g.groupId), name: str(g.name), short: str(g.shortCode) + '.' + str(g.discriminator), icon: str(g.iconUrl), banner: str(g.bannerUrl),
                        members: int(g.memberCount), rep: !!g.isRepresenting, owner: g.ownerId === acc.vrc_id }; }) };
            }
            case 'group': {
                const g = await call('GET', '/groups/' + enc(valid(id, 'grp')), { includeRoles: 'true' });
                const my = g.myMember || null;
                return { group: { id: g.id, name: str(g.name), short: str(g.shortCode) + '.' + str(g.discriminator), icon: str(g.iconUrl), banner: str(g.bannerUrl),
                    desc_html: U.formatText(g.description), rules_html: U.formatText(g.rules), members: int(g.memberCount), online: int(g.onlineMemberCount), privacy: str(g.privacy),
                    join_state: str(g.joinState), perms: arr(my && my.permissions), owner: g.ownerId === acc.vrc_id, rep: !!(my && my.isRepresenting), member: !!my,
                    roles: arr(g.roles).map(r => ({ id: str(r.id), name: str(r.name) })), links: arr(g.links).filter(l => /^https?:\/\//.test(str(l))) } };
            }
            case 'group_members': case 'group_requests': case 'group_bans': {
                const p = { group_members: 'members', group_requests: 'requests', group_bans: 'bans' }[act];
                const qq = act === 'group_members' ? { n: 50, offset: Math.max(0, int(input.offset)), sort: 'joinedAt:desc' } : { n: 100 };
                return { items: arr(await call('GET', '/groups/' + enc(valid(id, 'grp')) + '/' + p, qq)).map(m => { const u = m.user || {};
                    return { id: str(m.userId || u.id), name: str(u.displayName || '?'), image: U.userImage(u), joined: str(m.joinedAt || m.createdAt), roles: arr(m.roleIds), rep: !!m.isRepresenting, banned: str(m.bannedAt) }; }) };
            }
            case 'group_instances_all': {   // offene Instanzen aller Gruppen, in denen du bist (ein Aufruf)
                const r = await call('GET', '/users/' + enc(acc.vrc_id) + '/instances/groups');
                const list = arr(r && r.instances ? r.instances : r);
                this.groupNames = this.groupNames || new Map();
                const ids = [...new Set(list.map(i => str(i.ownerId)).filter(x => /^grp_/.test(x)))];
                for (const gid of ids) if (!this.groupNames.has(gid)) { const g = await quiet(() => call('GET', '/groups/' + enc(gid))); this.groupNames.set(gid, str(g && g.name) || 'Gruppe'); }
                return { items: list.filter(i => i && i.location).map(i => { const w = i.world || {}, gid = str(i.ownerId);
                    return { group_id: gid, group_name: this.groupNames.get(gid) || 'Gruppe', loc: U.location(str(i.location)), world: str(w.name), thumb: str(w.thumbnailImageUrl || w.imageUrl), users: int(i.n_users || i.userCount || i.memberCount), capacity: int(w.capacity || i.capacity) }; })
                    .sort((a, b) => b.users - a.users) };
            }
            case 'group_instances':
                return { items: arr(await call('GET', '/groups/' + enc(valid(id, 'grp')) + '/instances')).map(i => {
                    const w = i.world || {};
                    return { loc: U.location(i.location || (str(w.id) + ':' + str(i.instanceId))), world: str(w.name), thumb: str(w.thumbnailImageUrl), users: int(i.memberCount || i.n_users), capacity: int(w.capacity) }; }) };
            case 'group_audit': {
                const r = await call('GET', '/groups/' + enc(valid(id, 'grp')) + '/auditLogs', { n: 60 });
                return { items: arr(r.results).map(l => ({ ts: str(l.created_at), actor: str(l.actorDisplayName), type: str(l.eventType), desc: str(l.description) })) };
            }
            case 'group_request': {
                const a = input.decision === 'accept' ? 'accept' : 'reject';
                await call('PUT', '/groups/' + enc(valid(id, 'grp')) + '/requests/' + enc(valid(user, 'usr')), {}, { action: a, block: truthy(input.block) });
                return { msg: a === 'accept' ? 'Aufgenommen.' : 'Abgelehnt.' };
            }
            case 'group_invite': await call('POST', '/groups/' + enc(valid(id, 'grp')) + '/invites', {}, { userId: valid(user, 'usr'), confirmOverrideBlock: true }); return { msg: 'Einladung verschickt.' };
            case 'group_kick': await call('DELETE', '/groups/' + enc(valid(id, 'grp')) + '/members/' + enc(valid(user, 'usr'))); return { msg: 'Mitglied entfernt.' };
            case 'group_ban': await call('POST', '/groups/' + enc(valid(id, 'grp')) + '/bans', {}, { userId: valid(user, 'usr') }); return { msg: 'Gebannt.' };
            case 'group_unban': await call('DELETE', '/groups/' + enc(valid(id, 'grp')) + '/bans/' + enc(valid(user, 'usr'))); return { msg: 'Bann aufgehoben.' };
            case 'group_represent':
                await call('PUT', '/groups/' + enc(valid(id, 'grp')) + '/representation', {}, { isRepresenting: truthy(input.on) });
                return { msg: truthy(input.on) ? 'Du repräsentierst jetzt diese Gruppe.' : 'Repräsentation entfernt.' };
            case 'user_mutuals': {
                const target = valid(id, 'usr');
                const fl = new Map(v.friendList().map(f => [f.id, f]));
                let mf = [], ferr = '';
                try {
                    for (let off = 0; off < 500; off += 100) { const p = arr(await call('GET', '/users/' + enc(target) + '/mutuals/friends', { n: 100, offset: off })); mf = mf.concat(p); if (p.length < 100) break; }
                } catch (e) { if (e instanceof VrcAuthError) throw e; ferr = 'VRChat zeigt die gemeinsamen Freunde gerade nicht'; }
                let groups = await quiet(() => call('GET', '/users/' + enc(target) + '/mutuals/groups', { n: 100 }));
                if (!groups) {
                    const mine = new Set(arr(await quiet(() => call('GET', '/users/' + enc(acc.vrc_id) + '/groups'))).map(g => g.groupId));
                    groups = arr(await quiet(() => call('GET', '/users/' + enc(target) + '/groups'))).filter(g => mine.has(g.groupId));
                }
                return { friends: mf.map(m => { const f = fl.get(m.id); return { id: str(m.id), name: str(m.displayName || (f && f.name)), image: f ? f.image : U.userImage(m), state: f ? f.state : '', status: str(m.status || (f && f.status)) }; }),
                    friends_error: ferr, groups: arr(groups).map(g => ({ id: str(g.groupId || g.id), name: str(g.name), icon: str(g.iconUrl), members: int(g.memberCount) })) };
            }
            case 'group_friends': {
                const gid = valid(id, 'grp');
                let friends = v.friendList();
                const total = friends.length, byId = new Map(friends.map(f => [f.id, f])), found = new Map();
                let complete = false, checked = 0;
                const info = (await quiet(() => call('GET', '/groups/' + enc(gid)))) || {};
                if (int(info.memberCount) > 0 && int(info.memberCount) <= 1000) {
                    try {
                        for (let off = 0; off < 1000; off += 100) {
                            const page = arr(await call('GET', '/groups/' + enc(gid) + '/members', { n: 100, offset: off }));
                            for (const m of page) if (byId.has(m.userId)) found.set(m.userId, !!m.isRepresenting);
                            if (page.length < 100) break;
                        }
                        complete = true; checked = total;
                    } catch (e) { if (e instanceof VrcAuthError) throw e; found.clear(); }
                }
                if (!complete) {
                    friends = friends.slice().sort((a, b) => ((b.state === 'online') - (a.state === 'online')) || (b.favorite - a.favorite));
                    for (const f of friends.slice(0, 25)) {
                        checked++;
                        const m = await quiet(() => call('GET', '/groups/' + enc(gid) + '/members/' + enc(f.id)));
                        if (m && m.userId) found.set(f.id, !!m.isRepresenting);
                    }
                }
                const list = [...found].map(([fid, rep]) => { const f = byId.get(fid); return { id: fid, name: f.name, image: f.image, state: f.state, status: f.status, rep, world: f.state === 'online' ? str(f.loc && f.loc.world_name) : '' }; })
                    .sort((a, b) => ((a.state === 'offline') - (b.state === 'offline')) || a.name.localeCompare(b.name));
                return { friends: list, complete, checked, total };
            }
            case 'user_mod': {
                const target = valid(id, 'usr');
                const groups = arr(await call('GET', '/users/' + enc(acc.vrc_id) + '/groups'));
                const perms = await v.groupPerms(acc, groups);
                const items = [];
                for (const g of groups) {
                    const gid = str(g.groupId);
                    const p = g.ownerId === acc.vrc_id ? ['*'] : (perms[gid] || []);
                    if (!gid || !v.canKick(p) || items.length >= 30) continue;
                    const member = await quiet(() => call('GET', '/groups/' + enc(gid) + '/members/' + enc(target)));
                    const roles = ((await quiet(() => call('GET', '/groups/' + enc(gid) + '/roles'))) || []);
                    items.push({ id: gid, name: str(g.name), icon: str(g.iconUrl), perms: p, roles: arr(roles).map(r => ({ id: str(r.id), name: str(r.name) })),
                        member: member && (member.userId || member.id) ? { roles: arr(member.roleIds), joined: str(member.joinedAt), status: str(member.membershipStatus || 'member'), rep: !!member.isRepresenting } : null });
                }
                return { groups: items };
            }
            case 'group_posts': {
                const res = await call('GET', '/groups/' + enc(valid(id, 'grp')) + '/posts', { n: 20, offset: 0 });
                return { items: arr(res && res.posts ? res.posts : res).map(p => ({ id: str(p.id), title: str(p.title), html: U.formatText(p.text), created: str(p.createdAt || p.created_at), visibility: str(p.visibility), image: str(p.imageUrl) })) };
            }
            case 'group_post': {
                const title = cut(str(input.title).trim(), 120), text = cut(str(input.text).trim(), 2000);
                if (!title || !text) throw new UserError('Bitte Titel und Text eingeben.');
                await call('POST', '/groups/' + enc(valid(id, 'grp')) + '/posts', {}, { title, text, visibility: input.visibility === 'public' ? 'public' : 'group', sendNotification: truthy(input.notify), roleIds: [] });
                return { msg: 'Beitrag veröffentlicht.' };
            }
            case 'group_post_delete': await call('DELETE', '/groups/' + enc(valid(id, 'grp')) + '/posts/' + enc(valid(str(input.post), '[a-z]{3,5}'))); return { msg: 'Beitrag gelöscht.' };
            case 'group_join': await call('POST', '/groups/' + enc(valid(id, 'grp')) + '/join'); return { msg: 'Beitritt angefragt bzw. beigetreten.' };
            case 'group_leave': await call('POST', '/groups/' + enc(valid(id, 'grp')) + '/leave'); return { msg: 'Gruppe verlassen.' };
            case 'group_search': {
                const t = str(input.q).trim();
                if (Array.from(t).length < 2) throw new UserError('Bitte mindestens 2 Zeichen eingeben.');
                return { groups: arr(await call('GET', '/groups', { query: t, n: 30 })).map(g => ({ id: str(g.id), name: str(g.name), short: str(g.shortCode) + '.' + str(g.discriminator), icon: str(g.iconUrl), members: int(g.memberCount) })) };
            }
            case 'group_role': {
                const role = valid(str(input.role), 'grol');
                await call(truthy(input.on) ? 'PUT' : 'DELETE', '/groups/' + enc(valid(id, 'grp')) + '/members/' + enc(valid(user, 'usr')) + '/roles/' + enc(role));
                return { msg: truthy(input.on) ? 'Rolle vergeben.' : 'Rolle entzogen.' };
            }
            case 'group_share': case 'discord_share': throw new UserError('Discord-Teilen gibt es nur im Dashboard (Server-Version).');

            // ----- Kalender -----
            case 'calendar': {
                let err = '';
                if (truthy(input.refresh) || now() - int(db.setting('vrc_cal_refresh', '0')) > 900) {
                    try { await v.calendarRefresh(acc); } catch (e) { if (e instanceof VrcAuthError) throw e; err = e.message; }
                }
                const groups = arr(await call('GET', '/users/' + enc(acc.vrc_id) + '/groups'));
                const perms = await v.groupPerms(acc, groups);
                const can = groups.filter(g => { const p = g.ownerId === acc.vrc_id ? ['*'] : (perms[g.groupId] || []); return p.includes('*') || p.includes('group-calendar-manage'); }).map(g => ({ id: g.groupId, name: str(g.name) }));
                return { events: v.calendarList().map(e => ({ id: e.id, group: e.group_id, group_name: e.group_name, title: e.title, html: U.formatText(e.description), start: int(e.starts), end: int(e.ends),
                    category: e.category, access: e.access, image: e.image, interested: int(e.interested), following: !!e.following, platforms: e.platforms.split(',').filter(Boolean),
                    languages: e.languages.split(',').filter(Boolean), tags: e.tags.split(',').filter(Boolean) })),
                    linked: false, can_link: false, ics: 'nexus.php?ics=1', refreshed: int(db.setting('vrc_cal_refresh', '0')), error: err, can_create: can, app: true };
            }
            case 'calendar_link': case 'ics_reset': throw new UserError('Gibt es nur im Dashboard – in der App kannst du die Events als .ics-Datei speichern.');
            case 'cal_follow':
                await call('POST', '/calendar/' + enc(valid(str(input.group), 'grp')) + '/' + enc(valid(id, 'cal')) + '/follow', {}, { isFollowing: truthy(input.on) });
                db.prepare('UPDATE vrc_events SET following = ? WHERE user_id = ? AND id = ?').run(truthy(input.on) ? 1 : 0, UID, id);
                return { msg: truthy(input.on) ? '⭐ Du bist interessiert.' : 'Nicht mehr interessiert.' };
            case 'cal_create': {
                const g = valid(str(input.group), 'grp');
                const title = cut(str(input.title).trim(), 64);
                const start = U.ts(input.start);
                let end = U.ts(input.end) || start + 7200;
                if (!title || !start || start < now()) throw new UserError('Bitte Titel und einen Beginn in der Zukunft angeben.');
                if (end <= start) end = start + 3600;
                const cats = ['hangout', 'gaming', 'music', 'dance', 'performance', 'arts', 'education', 'exploration', 'film_media', 'avatars', 'wellness', 'roleplaying', 'other'];
                const pf = arr(input.platforms).filter(p => ['standalonewindows', 'android', 'ios'].includes(p));
                await call('POST', '/calendar/' + enc(g) + '/event', {}, { title, description: cut(str(input.description).trim(), 2000), startsAt: new Date(start * 1000).toISOString(),
                    endsAt: new Date(end * 1000).toISOString(), category: cats.includes(input.category) ? input.category : 'hangout', accessType: input.access === 'public' ? 'public' : 'group',
                    sendCreationNotification: truthy(input.notify), platforms: pf, languages: ['deu'], tags: [] });
                await quiet(() => v.calendarRefresh(acc));
                return { msg: 'Event „' + title + '“ im VRChat-Kalender angelegt.' };
            }
            case 'cal_delete':
                await call('DELETE', '/calendar/' + enc(valid(str(input.group), 'grp')) + '/' + enc(valid(id, 'cal')));
                db.prepare('DELETE FROM vrc_events WHERE user_id = ? AND id = ?').run(UID, id);
                return { msg: 'Event gelöscht.' };

            // ----- Galerie -----
            case 'gallery': {
                const res = {};
                for (const [tag, key] of Object.entries({ gallery: 'photos', icon: 'icons', emoji: 'emojis', sticker: 'stickers' })) {
                    try {
                        const files = arr(await call('GET', '/files', { tag, n: 100, offset: 0 })).filter(f => f && /^file_[0-9a-f-]{36}$/i.test(str(f.id)));
                        res[key] = files.map(f => {
                            const ver = Vrc.fileVersion(f);
                            let anim = '';
                            for (const t of arr(f.tags)) if (String(t).startsWith('animationStyle_')) anim = String(t).slice(15);
                            const vv = arr(f.versions);
                            return { id: str(f.id), name: str(f.name), v: ver, img: 'nexus.php?img=' + enc(str(f.id)) + '&v=' + ver, anim, created: str((vv[ver] || {}).created_at || (vv[0] || {}).created_at) };
                        });
                    } catch (e) { if (e instanceof VrcAuthError) throw e; res[key] = { error: e.message }; }
                }
                try {
                    res.prints = arr(await call('GET', '/prints/user/' + enc(acc.vrc_id), { n: 100 })).map(p => ({ id: str(p.id), img: U.imgUrl((p.files || {}).image), note: str(p.note),
                        world: str(p.worldName), world_id: str(p.worldId), author: str(p.authorName), created: str(p.timestamp || p.createdAt) }));
                } catch (e) { if (e instanceof VrcAuthError) throw e; res.prints = { error: e.message }; }
                return { gallery: res, limits: { photos: 64, icons: 18, emojis: 18, stickers: 18, prints: 64 } };
            }
            case 'inventory': {
                const r = await call('GET', '/inventory', { n: 100, offset: Math.max(0, int(input.offset)), order: 'newest' });
                const list = arr(r && r.data ? r.data : r);
                return { total: int(r && r.totalCount) || list.length, items: list.map(i => ({ id: str(i.id), name: str(i.name), desc: cut(i.description, 200), type: str(i.itemType || i.itemTypeLabel),
                    img: U.imgUrl(i.imageUrl), created: str(i.created_at), archived: !!i.isArchived })) };
            }
            case 'file_delete':
                if (!/^file_[0-9a-f-]{36}$/i.test(id)) throw new UserError('Ungültige Datei.');
                await call('DELETE', '/file/' + enc(id));
                return { msg: 'Gelöscht.' };
            case 'print_delete':
                if (!/^prnt_[0-9a-f-]{36}$/i.test(id)) throw new UserError('Ungültiger Print.');
                await call('DELETE', '/prints/' + enc(id));
                return { msg: 'Print gelöscht.' };
            case 'set_icon':
                if (!/^file_[0-9a-f-]{36}$/i.test(id)) throw new UserError('Ungültige Datei.');
                await call('PUT', '/users/' + enc(acc.vrc_id), {}, { userIcon: v.apiBase() + '/file/' + id + '/' + Math.max(1, int(input.v) || 1) });
                db.prepare('UPDATE accounts SET last_sync = 0 WHERE user_id = ?').run(UID);
                return { msg: 'Als Profil-Icon gesetzt.' };
            case 'file_upload': {
                const tag = { photos: 'gallery', icons: 'icon', emojis: 'emoji', stickers: 'sticker', prints: 'print' }[input.kind];
                const f = files.file;
                if (!tag || !f || !f.buffer || !f.buffer.length) throw new UserError('Bitte eine Bilddatei auswählen.');
                if (f.buffer.length > 10 * 1024 * 1024) throw new UserError('Die Datei ist größer als 10 MB.');
                const b = f.buffer;
                const mime = b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.subarray(0, 3).toString() === 'GIF' ? 'image/gif'
                    : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
                if (!mime) throw new UserError('Bitte ein Bild (PNG, JPG, GIF oder WebP) wählen.');
                if (tag === 'print') {   // Prints: eigener Endpunkt, Feld „image“, mit Zeitpunkt, Notiz und – wenn bekannt – der aktuellen Welt (VRC+ nötig)
                    const st = this.game.state, pf = { timestamp: new Date().toISOString(), note: cut(str(input.note).trim(), 32) };
                    if (/^wrld_[0-9a-f-]{36}$/i.test(st.worldId || '')) { pf.worldId = st.worldId; pf.worldName = cut(st.worldName, 100); }
                    await v.upload(acc, '/prints', pf, b, mime, str(f.name).replace(/[^\w.-]/g, '_') || 'print.png', 'image');
                    return { msg: 'Print hochgeladen.' };
                }
                const fields = { tag };
                if (tag === 'emoji') { fields.animationStyle = /^[a-z]{2,20}$/.test(str(input.anim)) ? input.anim : 'none'; fields.maskTag = 'square'; }
                if (tag === 'sticker') fields.maskTag = 'square';
                await v.upload(acc, '/file/image', fields, b, mime, str(f.name).replace(/[^\w.-]/g, '_') || 'bild');
                return { msg: 'Hochgeladen.' };
            }

            // ----- Info-Push -----
            case 'infopush': {
                // „include“ = irgendeiner der Tags muss passen, „require“ = alle; beide als JSON-Liste (sonst Fehler 400), leeres include liefert nichts.
                // Die echten Tags sind nicht offiziell dokumentiert (Community-Doku nennt z. B. „user-all“, „high-priority“) – daher mehrere Gruppen, Ergebnisse zusammengeführt.
                const GROUPS = [
                    ['user-all', 'high-priority', 'medium-priority', 'low-priority', 'priority-high', 'priority-low', 'all', 'user', 'everyone'],
                    ['platform:pc', 'platform:standalonewindows', 'platform:android', 'platform:ios', 'pc', 'android', 'ios', 'quest', 'desktop', 'vr'],
                    ['quickmenu', 'quick-menu', 'quick_menu', 'quickMenu', 'carousel', 'banner', 'launchpad', 'launch-pad', 'home', 'help', 'help-article', 'article', 'loading-screen', 'loadingscreen', 'loading_screen'],
                    ['news', 'announcement', 'event', 'events', 'promo', 'promotion', 'store', 'vrcplus', 'vrc-plus', 'safety', 'system', 'creator', 'groups', 'marketplace']];
                const variants = GROUPS.map(g => ({ require: '[]', include: JSON.stringify(g) }));
                const seen = new Map(), tried = [];
                let lastErr = null;
                for (const q of variants) {
                    try {
                        const got = await call('GET', '/infoPush', q);
                        const l = Array.isArray(got) ? got : arr(got && (got.results || got.items || got.data));
                        tried.push({ q: JSON.parse(q.include).slice(0, 2).join(',') + ' …', n: l.length });
                        for (const i of l) if (i && typeof i === 'object' && i.id && !seen.has(i.id)) seen.set(i.id, i);
                    } catch (e) { if (e instanceof U.VrcAuthError) throw e; lastErr = e; tried.push({ q: JSON.parse(q.include).slice(0, 2).join(',') + ' …', err: cut(e.message, 120) }); }
                }
                if (!seen.size && lastErr && tried.every(t => t.err)) throw lastErr;
                const r = [...seen.values()];
                return { tried, items: r.map(i => {
                    const d = i.data || {}, tags = arr(i.tags).join(' ');
                    const kind = /loading/i.test(tags) ? 'loading' : /banner|quick.?menu|carousel|launch.?pad/i.test(tags) ? 'banner' : (/help|article/i.test(tags) || (d.article && d.article.content)) ? 'help' : d.imageUrl ? 'banner' : 'other';
                    let link = '';
                    for (const p of arr((d.onPressed || {}).parameters)) if (typeof p === 'string' && /^https:\/\//.test(p)) link = p;
                    const art = (d.article || {}).content || {};
                    return { id: str(i.id), kind, title: str(d.name || i.name), desc: str(d.description), img: U.imgUrl(d.imageUrl), date: str(i.createdAt || i.startDate), priority: int(i.priority), link,
                        article: U.formatText(art.text, true), article_img: U.imgUrl(art.imageUrl) }; }) };
            }

            // ----- Avatare -----
            case 'avatar': {
                const a = await call('GET', '/avatars/' + enc(valid(id, 'avtr')));
                x.historyAdd('avatar', a.id, str(a.name), str(a.thumbnailImageUrl), str(a.authorName));
                return { avatar: { id: a.id, name: str(a.name), author: str(a.authorName), author_id: str(a.authorId), image: str(a.imageUrl || a.thumbnailImageUrl), desc_html: U.formatText(a.description),
                    status: str(a.releaseStatus), created: str(a.created_at), updated: str(a.updated_at), version: int(a.version), featured: !!a.featured, current: str(acc.me.currentAvatar) === a.id,
                    tags: arr(a.tags).filter(t => /^(author_tag_|content_)/.test(t)).map(t => t.replace(/^(author_tag_|content_)/, '')), platforms: platforms(a.unityPackages),
                    performance: arr(a.unityPackages).filter(p => p.performanceRating).map(p => (U.VRC_PLATFORM[p.platform] || '') + ': ' + p.performanceRating) } };
            }
            case 'avatars': {
                const kind = str(input.kind || 'mine');
                const res = kind === 'favorites' ? await call('GET', '/avatars/favorites', { n: 100 }) : await call('GET', '/avatars', { user: 'me', releaseStatus: 'all', n: 100, sort: 'updated', order: 'descending' });
                const current = str(acc.me.currentAvatar);
                const fgroup = {}, fnames = {};
                if (kind === 'favorites') {
                    try {
                        for (const f of await v.favoritesAll(acc, 'avatar')) if (f.favoriteId) fgroup[f.favoriteId] = [str(arr(f.tags)[0] || 'avatars1'), str(f.id)];
                        for (const g of arr(await call('GET', '/favorite/groups', { type: 'avatar', n: 50 }))) if (g.name) fnames[g.name] = str(g.displayName || g.name);
                    } catch (e) { if (e instanceof VrcAuthError) throw e; }
                }
                return { current, fav_groups: fnames, avatars: arr(res).filter(a => a && typeof a === 'object').map(a => ({ fav_group: (fgroup[a.id] || [])[0] || '', fav_id: (fgroup[a.id] || [])[1] || '',
                    created: str(a.created_at), id: str(a.id), name: str(a.name), author: str(a.authorName), thumb: str(a.thumbnailImageUrl), status: str(a.releaseStatus), desc: cut(a.description, 300),
                    updated: str(a.updated_at), current: a.id === current, platforms: platforms(a.unityPackages) })) };
            }
            case 'avatar_db': {
                const out = { avatars: await x.avatarDbSearch(int(input.provider), str(input.q)), current: str(acc.me.currentAvatar) };
                out.avatars.forEach(a => { a.current = a.id === out.current; });
                return out;
            }
            case 'avatar_providers':
                if (input.save !== undefined) x.avatarProvidersSave(str(input.list));
                return { providers: x.avatarProviders(), can_edit: true };
            case 'avatar_select': {
                const u = await call('PUT', '/avatars/' + enc(valid(id, 'avtr')) + '/select');
                if (u && u.id) db.prepare('UPDATE accounts SET me_json = ?, avatar = ? WHERE user_id = ?').run(JSON.stringify(U.meSlim(u)), U.userImage(u), UID);
                return { msg: 'Avatar gewechselt.' };
            }
            case 'avatar_fav': {
                if (truthy(input.move)) {
                    const grp = /^avatars\d{1,2}$/.test(str(input.group)) ? input.group : 'avatars1';
                    await quiet(() => call('DELETE', '/favorites/' + enc(input.fav_id ? valid(str(input.fav_id), 'fvrt') : valid(id, 'avtr'))));
                    await call('POST', '/favorites', {}, { type: 'avatar', favoriteId: valid(id, 'avtr'), tags: [grp] });
                    return { msg: 'Verschoben.' };
                }
                if (truthy(input.on)) {
                    await call('POST', '/favorites', {}, { type: 'avatar', favoriteId: valid(id, 'avtr'), tags: [/^avatars\d{1,2}$/.test(str(input.group)) ? input.group : 'avatars1'] });
                    return { msg: 'Avatar favorisiert.' };
                }
                await call('DELETE', '/favorites/' + enc(valid(id, 'avtr')));
                return { msg: 'Aus den Favoriten entfernt.' };
            }

            // ----- Favoriten (VRCX-Stil) -----
            case 'favs': {
                const kind = x.favKind(str(input.kind || 'friend'));
                const groups = await x.favGroups(acc, kind);
                const items = await x.favRemote(acc, kind);
                const count = {};
                for (const it of items) count[it.group] = (count[it.group] || 0) + 1;
                return { kind, limit: (await x.favLimits(acc))[kind], groups: groups.map(g => Object.assign(g, { count: count[g.name] || 0 })), items,
                    local_groups: x.localGroups(kind), local: x.localItems(kind), history: kind === 'friend' ? [] : x.history(kind) };
            }
            case 'fav_status': {
                const kind = x.favKind(str(input.kind));
                const vid = valid(id, { friend: 'usr', world: 'wrld', avatar: 'avtr' }[kind]);
                const groups = await x.favGroups(acc, kind);
                let cur = null;
                for (const f of await v.favoritesAll(acc, kind)) if (f.favoriteId === vid) cur = { group: str(arr(f.tags)[0]), fav_id: str(f.id) };
                return { groups, current: cur, local_groups: x.localGroups(kind), local: x.localOf(kind, vid) };
            }
            case 'fav_set': {
                const kind = x.favKind(str(input.kind));
                const vid = valid(id, { friend: 'usr', world: 'wrld', avatar: 'avtr' }[kind]);
                const target = str(input.target);
                if (target.startsWith('remote:')) {
                    const grp = target.slice(7);
                    if (!/^[\w-]{1,40}$/.test(grp)) throw new UserError('Ungültige Gruppe.');
                    if (input.fav_id) await quiet(() => call('DELETE', '/favorites/' + enc(valid(str(input.fav_id), 'fvrt'))));
                    else if (kind !== 'friend') await quiet(() => call('DELETE', '/favorites/' + enc(vid)));
                    const r = await call('POST', '/favorites', {}, { type: kind, favoriteId: vid, tags: [grp] });
                    if (kind === 'friend') db.prepare('UPDATE friends SET fav_group = ? WHERE user_id = ? AND vrc_id = ?').run(grp, UID, vid);
                    return { msg: 'In VRChat-Favoriten gespeichert.', fav_id: str(r.id) };
                }
                if (target.startsWith('local:')) {
                    x.localAdd(kind, target.slice(6), { id: vid, name: str(input.name), image: str(input.image), sub: str(input.sub) });
                    if (input.from_local && input.from_local !== target.slice(6)) x.localRemove(kind, str(input.from_local), vid);
                    return { msg: 'Lokal gemerkt in „' + target.slice(6) + '“.' };
                }
                throw new UserError('Bitte eine Liste wählen.');
            }
            case 'fav_remove': {
                const kind = x.favKind(str(input.kind));
                const vid = valid(id, { friend: 'usr', world: 'wrld', avatar: 'avtr' }[kind]);
                if (input.local !== undefined) { x.localRemove(kind, str(input.local), vid); return { msg: 'Aus der lokalen Liste entfernt.' }; }
                await call('DELETE', '/favorites/' + enc(input.fav_id ? valid(str(input.fav_id), 'fvrt') : vid));
                if (kind === 'friend') db.prepare("UPDATE friends SET fav_group = '' WHERE user_id = ? AND vrc_id = ?").run(UID, vid);
                return { msg: 'Aus den VRChat-Favoriten entfernt.' };
            }
            case 'local_group': {
                const kind = x.favKind(str(input.kind));
                const name = cut(str(input.name).trim(), 40), old = str(input.old), op = str(input.op || 'create');
                if (op !== 'delete' && !name) throw new UserError('Bitte einen Namen eingeben.');
                if (op === 'create') x.localGroupAdd(kind, name);
                if (op === 'rename') {
                    db.prepare('UPDATE local_fav_groups SET name = ? WHERE user_id = ? AND kind = ? AND name = ?').run(name, UID, kind, old);
                    db.prepare('UPDATE OR IGNORE local_favs SET grp = ? WHERE user_id = ? AND kind = ? AND grp = ?').run(name, UID, kind, old);
                    db.prepare('DELETE FROM local_favs WHERE user_id = ? AND kind = ? AND grp = ?').run(UID, kind, old);
                }
                if (op === 'delete') {
                    db.prepare('DELETE FROM local_fav_groups WHERE user_id = ? AND kind = ? AND name = ?').run(UID, kind, old);
                    db.prepare('DELETE FROM local_favs WHERE user_id = ? AND kind = ? AND grp = ?').run(UID, kind, old);
                }
                return { msg: { create: 'Gruppe angelegt.', rename: 'Umbenannt.', delete: 'Gruppe gelöscht.' }[op] || 'OK' };
            }
            case 'fav_group_rename': {
                const kind = x.favKind(str(input.kind));
                const grp = str(input.group);
                if (!/^[\w-]{1,40}$/.test(grp)) throw new UserError('Ungültige Gruppe.');
                const body = {};
                if (input.name !== undefined) body.displayName = cut(str(input.name).trim(), 30);
                if (['private', 'friends', 'public'].includes(input.visibility)) body.visibility = input.visibility;
                await call('PUT', '/favorite/group/' + kind + '/' + enc(grp) + '/' + enc(acc.vrc_id), {}, body);
                return { msg: 'Gruppe gespeichert.' };
            }
            case 'history_clear': db.prepare('DELETE FROM vrc_history WHERE user_id = ? AND kind = ?').run(UID, x.favKind(str(input.kind))); return { msg: 'Verlauf geleert.' };
            case 'invite_many': {
                const loc = str(input.location) || str(acc.me.location);
                if (!isLoc(loc)) throw new UserError('Du bist gerade in keiner Instanz, in die man einladen kann.');
                const ids = [...new Set(arr(input.ids))].slice(0, 25);
                let ok = 0;
                const failed = [];
                for (let k = 0; k < ids.length; k++) {
                    try { await call('POST', '/invite/' + enc(valid(str(ids[k]), 'usr')), {}, { instanceId: loc, messageSlot: 0 }); ok++; }
                    catch (e) { if (e instanceof VrcAuthError) throw e; failed.push(ids[k]); }
                    if (k < ids.length - 1) await U.sleep(350);
                }
                return { msg: ok + ' Einladung(en) verschickt' + (failed.length ? ', ' + failed.length + ' fehlgeschlagen' : '') + '.' };
            }
            case 'recent_instances': return { items: v.recentInstances() };
            case 'watch': {
                const n = v.note(valid(id, 'usr'));
                v.noteSave(id, str(n.note), !!n.favorite, null, truthy(input.on));
                return { msg: truthy(input.on) ? 'Du bekommst eine Windows-Benachrichtigung, sobald die Person online kommt.' : 'Beobachtung beendet.' };
            }

            // ----- Statistik -----
            case 'stats': return v.stats();
            case 'encounters': return { items: v.encounters(30).slice(0, 40) };
            case 'timeline': return v.timeline(int(input.day));

            // ----- Welten & Instanzen -----
            case 'worlds': {
                const kind = str(input.kind || 'favorites');
                const qq = { n: 60 };
                let p;
                if (kind === 'favorites') p = '/worlds/favorites';
                else if (kind === 'recent') p = '/worlds/recent';
                else if (kind === 'active') p = '/worlds/active';
                else if (kind === 'mine') { p = '/worlds'; Object.assign(qq, { user: 'me', releaseStatus: 'all', sort: 'updated', order: 'descending' }); }
                else if (kind === 'search') {
                    const t = str(input.q).trim();
                    if (Array.from(t).length < 2) throw new UserError('Bitte mindestens 2 Zeichen eingeben.');
                    p = '/worlds'; Object.assign(qq, { search: t, sort: 'relevance' });
                } else throw new UserError('Unbekannte Liste.');
                return { worlds: arr(await call('GET', p, qq)).filter(w => w && typeof w === 'object').map(w => {
                    v.saveWorld(w);
                    return { id: str(w.id), name: str(w.name), author: str(w.authorName), thumb: str(w.thumbnailImageUrl), occupants: int(w.occupants), capacity: int(w.capacity),
                        favorites: int(w.favorites), visits: int(w.visits), fav_id: str(w.favoriteId), status: str(w.releaseStatus), updated: str(w.updated_at) }; }) };
            }
            case 'world': {
                const w = await call('GET', '/worlds/' + enc(valid(id, 'wrld')));
                x.historyAdd('world', w.id, str(w.name), str(w.thumbnailImageUrl), str(w.authorName));
                v.saveWorld(w);
                const instances = arr(w.instances).filter(i => Array.isArray(i) && i[0] !== undefined).map(i => ({ loc: U.location(w.id + ':' + i[0]), users: int(i[1]) }));
                return { world: { id: w.id, name: str(w.name), author: str(w.authorName), author_id: str(w.authorId), image: str(w.imageUrl || w.thumbnailImageUrl), desc_html: U.formatText(w.description),
                    capacity: int(w.capacity), recommended: int(w.recommendedCapacity), visits: int(w.visits), favorites: int(w.favorites), popularity: int(w.popularity), heat: int(w.heat),
                    occupants: int(w.occupants), public: int(w.publicOccupants), private: int(w.privateOccupants), tags: arr(w.tags).filter(t => String(t).startsWith('author_tag_')).map(t => t.slice(11)),
                    created: str(w.created_at), updated: str(w.updated_at), status: str(w.releaseStatus), platforms: platforms(w.unityPackages), instances,
                    version: int(w.version), published: str(w.publicationDate) === 'none' ? '' : str(w.publicationDate), labs: str(w.labsPublicationDate) === 'none' ? '' : str(w.labsPublicationDate),
                    unity: [...new Set(arr(w.unityPackages).map(p => str(p.unityVersion)).filter(Boolean))].slice(0, 4),
                    content: arr(w.tags).filter(t => String(t).startsWith('content_')).map(t => t.slice(8)), system_tags: arr(w.tags).filter(t => /^system_/.test(t)).map(t => t.slice(7)),
                    youtube: /^[\w-]{11}$/.test(str(w.previewYoutubeId)) ? str(w.previewYoutubeId) : '',
                    image_file: (/(file_[0-9a-f-]{36})/i.exec(str(w.imageUrl)) || [])[1] || '' } };
            }
            case 'world_fav':
                if (truthy(input.on)) {
                    const r = await call('POST', '/favorites', {}, { type: 'world', favoriteId: valid(id, 'wrld'), tags: [/^worlds\d{1,2}$/.test(str(input.group)) ? input.group : 'worlds1'] });
                    return { msg: 'Zu den Favoriten hinzugefügt.', fav_id: str(r.id) };
                }
                await call('DELETE', '/favorites/' + enc(input.fav_id ? valid(str(input.fav_id), 'fvrt') : valid(id, 'wrld')));
                return { msg: 'Aus den Favoriten entfernt.' };
            case 'instance': {
                const loc = str(input.location);
                if (!isLoc(loc)) throw new UserError('Ungültige Instanz.');
                const i = await call('GET', '/instances/' + loc);
                const pf = i.platforms || {};
                return { instance: { location: loc, loc: U.location(loc), users: int(i.userCount || i.n_users), capacity: int(i.capacity), pc: int(pf.standalonewindows), quest: int(pf.android), ios: int(pf.ios),
                    full: !!i.full, queue: int(i.queueSize), closed: !!i.closedAt, name: str(i.displayName || i.name),
                    friends: v.friendList().filter(f => f.loc.location === loc).map(f => ({ id: f.id, name: f.name, image: f.image })),
                    seen: (() => { try { return this.game.instancePlayers(loc); } catch (e) { return { visits: 0, players: [] }; } })() } };   // 3.9: wer war dort (Spiel-Log)
            }
            case 'instance_create': {
                const world = valid(str(input.world), 'wrld');
                const type = str(input.type || 'hidden');
                const region = ['us', 'use', 'eu', 'jp'].includes(input.region) ? input.region : 'eu';
                const body = { worldId: world, region };
                if (type === 'public') body.type = 'public';
                else if (type === 'friends+') Object.assign(body, { type: 'hidden', ownerId: acc.vrc_id });
                else if (type === 'friends') Object.assign(body, { type: 'friends', ownerId: acc.vrc_id });
                else if (type === 'invite+') Object.assign(body, { type: 'private', ownerId: acc.vrc_id, canRequestInvite: true });
                else if (type === 'invite') Object.assign(body, { type: 'private', ownerId: acc.vrc_id });
                else if (type === 'group') Object.assign(body, { type: 'group', ownerId: valid(str(input.group), 'grp'), groupAccessType: ['members', 'plus', 'public'].includes(input.access) ? input.access : 'members' }, truthy(input.age_gate) ? { ageGate: true } : {});
                else throw new UserError('Unbekannter Instanz-Typ.');
                const i = await call('POST', '/instances', {}, body);
                let loc = str(i.location || i.id);
                if (!loc && i.instanceId) loc = world + ':' + i.instanceId;
                if (!isLoc(loc)) throw new UserError('VRChat hat keine gültige Instanz zurückgegeben.');
                if (truthy(input.invite_me)) await call('POST', '/invite/myself/to/' + loc);
                return { msg: 'Instanz erstellt' + (truthy(input.invite_me) ? ' – Einladung an dich ist unterwegs.' : '.'), location: loc };
            }
            case 'invite': {
                const loc = str(input.location) || str(acc.me.location);
                if (!isLoc(loc)) throw new UserError('Du bist gerade in keiner Instanz, in die man einladen kann.');
                await call('POST', '/invite/' + enc(valid(id, 'usr')), {}, { instanceId: loc, messageSlot: Math.max(0, Math.min(11, int(input.slot))) });
                return { msg: 'Einladung verschickt.' };
            }

            // ----- Moderation -----
            case 'moderations':
                return { items: arr(await call('GET', '/auth/user/playermoderations')).filter(m => m && typeof m === 'object')
                    .map(m => ({ id: str(m.id), type: str(m.type), user: str(m.targetUserId), name: str(m.targetDisplayName || '?'), created: str(m.created) })) };
            case 'moderate': case 'unmoderate': {
                const type = str(input.type);
                if (!['block', 'mute', 'unmute', 'hideAvatar', 'showAvatar', 'interactOff', 'interactOn', 'muteChat'].includes(type)) throw new UserError('Unbekannte Moderation.');
                const body = { moderated: valid(user, 'usr'), type };
                if (act === 'moderate') await call('POST', '/auth/user/playermoderations', {}, body); else await call('PUT', '/auth/user/unplayermoderate', {}, body);
                return { msg: act === 'moderate' ? 'Erledigt.' : 'Aufgehoben.' };
            }
            case 'profile_get': {   // /auth/user liefert kein bio/bioLinks mehr → aus dem öffentlichen Profil nachladen
                const u = await call('GET', '/users/' + enc(acc.vrc_id));
                const prof = { pronouns: str(u.pronouns), bio: str(u.bio), links: arr(u.bioLinks).map(str).filter(l => /^https?:\/\/\S+$/i.test(l)).slice(0, 3) };
                const me = Object.assign({}, acc.me || {}, { bio: prof.bio, bioLinks: prof.links, pronouns: prof.pronouns || str((acc.me || {}).pronouns) });
                db.prepare('UPDATE accounts SET me_json = ? WHERE user_id = ?').run(JSON.stringify(U.meSlim(me)), UID);
                return prof;
            }
            case 'profile_save': {
                const links = arr(input.links).map(l => str(l).trim()).filter(l => /^https?:\/\/\S+$/i.test(l)).slice(0, 3);
                const u = await call('PUT', '/users/' + enc(acc.vrc_id), {}, { bio: cut(str(input.bio), 512), pronouns: cut(str(input.pronouns).trim(), 32), bioLinks: links });
                if (u && u.id) db.prepare('UPDATE accounts SET me_json = ? WHERE user_id = ?').run(JSON.stringify(U.meSlim(Object.assign({}, acc.me || {}, u, { bio: u.bio !== undefined ? u.bio : cut(str(input.bio), 512), bioLinks: u.bioLinks !== undefined ? u.bioLinks : links }))), UID);
                return { msg: 'Profil gespeichert.' };
            }
            case 'settings': {
                const ua = str(input.user_agent).trim();
                if (ua && !/^[\w.-]+\/[\w.-]+( [\x20-\x7E]{0,120})?$/.test(ua)) throw new UserError('Format: Name/Version Kontakt, z. B. MeinNexus/1.0 kontakt@example.org');
                db.setSetting('vrc_user_agent', ua);
                return { msg: 'Gespeichert.' };
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
    /** 💖 Unterstützer live aus dem Branch supporters-data (alle 12 h von GitHub aktualisiert), 1 h zwischengespeichert; sonst die mitgelieferte Liste */
    async liveSupporters() {
        const c = this._sup;
        if (c && Date.now() - c.at < 3600000) return { supporters: c.list, live: true };
        const url = process.env.NEXUS_SUPPORTERS_URL || 'https://raw.githubusercontent.com/ghostnode-labs/vrc_nexus/supporters-data/supporters.json';
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            if (!Array.isArray(d)) throw new Error('kein Array');
            const list = d.slice(0, 300).map(x => ({ name: str(x && x.name).slice(0, 40), tier: str(x && x.tier).slice(0, 40) })).filter(x => x.name);
            this._sup = { at: Date.now(), list };
            return { supporters: list, live: true };
        } catch (e) { let l = []; try { l = require('./supporters.json'); } catch (x) { l = []; } return { supporters: l, live: false }; }
    }
    /** Seite „Über VRC Nexus“: Version, System, Changelog (aus backend/changelog.json, gebaut aus der README; 🔞 aus changelog-nsfw.json nur freigeschaltet) */
    about(input = {}) {
        let log = [];
        try { log = require('./changelog.json'); } catch (e) { log = []; }
        // 🔞 NSFW-Teil nur, wenn freigeschaltet – sonst bleibt „🔞 ***“ stehen
        let ns = [];
        if (this.nsfw && this.nsfw.access().unlocked) { try { ns = require('./changelog-nsfw.json'); } catch (e) { ns = []; } }
        if (ns.length) {
            const by = new Map(ns.map(e => [e.version, e]));
            log = log.map(e => { const x = by.get(e.version); if (!x) return e; const extra = '**🔞 NSFW' + (x.title ? ' – ' + x.title : '') + '**\n\n' + x.body;
                return Object.assign({}, e, { body: /^.*🔞 \*\*\*.*$/m.test(e.body) ? e.body.replace(/^.*🔞 \*\*\*.*$/m, extra) : e.body + '\n\n' + extra, nsfw: true }); });
        }
        const n = Math.max(1, Math.min(50, int(input.n) || 2));
        const up = (() => { try { return this.updater.status(); } catch (e) { return null; } })();
        const pv = typeof process !== 'undefined' && process.versions ? process.versions : {};
        return { version: VERSION, platform: this.mobile ? 'Android' : process.platform === 'win32' ? 'Windows' : process.platform,
            runtime: { electron: pv.electron || '', chrome: pv.chrome || '', node: pv.node || '' }, data: this.tools && this.tools.userData ? this.tools.userData : '',
            update: up ? { available: !!up.available, version: up.version || '', checked: up.checked || 0, page: up.page || '' } : null,
            changelog: log.slice(0, n), total: log.length, repo: 'https://github.com/ghostnode-labs/vrc_nexus/releases', discord: discordInvite(), patreon: patreonUrl(), supporters: (() => { try { return require('./supporters.json').slice(0, 300); } catch (e) { return []; } })() };
    }
}

/** Discord-Einladung (backend/links.json – beim Build aus dem Secret DISCORD_INVITE gesetzt) */
function discordInvite() {
    let v = '';
    try { v = String(require('./links.json').discord || ''); } catch (e) { v = ''; }
    return /^https:\/\/(discord\.gg|(www\.)?discord\.com\/invite)\/[\w-]{2,40}$/.test(v) ? v : '';
}

/** Patreon-Seite (backend/links.json – beim Build aus PATREON_URL gesetzt) */
function patreonUrl() {
    let v = '';
    try { v = String(require('./links.json').patreon || ''); } catch (e) { v = ''; }
    return /^https:\/\/(www\.)?patreon\.com\/[\w./?=-]{2,80}$/.test(v) ? v : '';
}

/** Formular (application/x-www-form-urlencoded oder multipart) → Objekt; „name[]“ wird zu Arrays */
function formToObject(entries) {
    const out = {};
    for (const [k, val] of entries) {
        if (k.endsWith('[]')) { const kk = k.slice(0, -2); (out[kk] = out[kk] || []).push(val); }
        else out[k] = val;
    }
    return out;
}

/** Für Electron & Test-Server: Request (Web-API) → Antwort { status, headers, body } */
async function handleWebRequest(app, request) {
    const url = new URL(request.url);
    const req = { method: request.method, path: url.pathname, query: url.searchParams, form: {}, files: {} };
    if (request.method === 'POST') {
        const ct = request.headers.get('content-type') || '';
        if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
            const fd = await request.formData();
            const entries = [];
            for (const [k, val] of fd.entries()) {
                if (typeof val === 'object' && val && typeof val.arrayBuffer === 'function') req.files[k] = { buffer: Buffer.from(await val.arrayBuffer()), type: val.type, name: val.name };
                else entries.push([k, val]);
            }
            req.form = formToObject(entries);
        }
    }
    return app.handle(req);
}

module.exports = { NexusApp, handleWebRequest, formToObject };
