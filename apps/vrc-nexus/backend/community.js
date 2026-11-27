'use strict';
/*
 * Nexus Community (GhostNode, nexuscomm.php) – die App reicht nur durch; alle Rechte prüft der Server:
 *   Konto-Token (account.js) bei jeder Anfrage, NSFW nur mit Verified 18+ + NSFW an, Moderatoren per NXK1 „mod“.
 * Bilder holt die App mit dem Token und gibt sie der Oberfläche über  nexus.php?cimg=<id>  (kleiner Zwischenspeicher).
 */
const { str, int, UserError } = require('./util');

const BASE = () => (process.env.NEXUS_COMM_BASE || process.env.NEXUS_ACCT_BASE || process.env.NEXUS_RELAY_BASE || require('./servers').nexus()).replace(/\/+$/, '');
const ACTS = { comm_me: 'me', comm_feed: 'feed', comm_thread: 'thread', comm_post: 'post', comm_edit: 'edit', comm_delete: 'delete', comm_react: 'react', comm_report: 'report',
    comm_profile: 'profile', comm_profile_save: 'profile_save', comm_mod_queue: 'mod_queue', comm_mod: 'mod', comm_world: 'world', comm_world_note: 'world_note',
    comm_save: 'save', comm_follow: 'follow', comm_follows: 'follows', comm_trends: 'trends', comm_inbox: 'inbox',   // 5.3
    comm_req_list: 'req_list', comm_req_send: 'req_send', comm_req_answer: 'req_answer', comm_req_withdraw: 'req_withdraw', comm_compat: 'compat',   // 6.0 (18+)
    comm_sess_start: 'sess_start', comm_sess_answer: 'sess_answer', comm_sess_end: 'sess_end' };
const CLUB_ACTS = ['list', 'view', 'create', 'update', 'join', 'leave', 'manage', 'post', 'post_mod', 'gallery_add', 'gallery_del', 'event_save', 'event_cancel', 'rsvp', 'calendar'];
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

class Community {
    constructor(app) { this.app = app; this.cache = new Map(); }
    auth() {
        const o = this.app.account && this.app.account.current();
        if (!o) throw new UserError('Für die Community erst das Nexus-Konto verbinden (Einstellungen → Erweitert).');
        const key = this.app.nsfw ? this.app.nsfw.serviceToken() : '';
        return { token: o.token, key: key && this.app.nsfw.roles().roles.includes('mod') ? key : '' };
    }
    async raw(a, body) {
        let r;
        try { r = await fetch(BASE() + '/nexuscomm.php?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign(this.auth(), body || {})), signal: AbortSignal.timeout(20000) }); }
        catch (e) { if (e instanceof UserError) throw e; throw new UserError('GhostNode-Webseite nicht erreichbar.'); }
        if (r.status === 401) { if (this.app.account.expired) this.app.account.expired(); else this.app.account.refresh(true).catch(() => {}); }
        return r;
    }
    async call(a, body) {
        const r = await this.raw(a, body);
        const d = await r.json().catch(() => ({ error: 'Antwort kein JSON – liegt nexuscomm.php auf der Webseite?' }));
        if (!r.ok || d.error) throw new UserError(str(d.error) || 'Fehler ' + r.status + '.');
        return d;
    }
    /** Bild für die Oberfläche (Zugriff prüft der Server bei jedem Abruf; Zwischenspeicher nur im Arbeitsspeicher) */
    async image(id) {
        id = str(id);
        if (!/^[0-9a-f]{24}$/.test(id)) return { status: 404, headers: {}, body: '' };
        const c = this.cache.get(id);
        if (c && Date.now() - c.at < 600000 && this.app.nsfw.access().unlocked === c.nsfw) return { status: 200, headers: { 'Content-Type': c.type, 'Cache-Control': 'no-store' }, body: c.body };
        const r = await this.raw('media', { id });
        const type = r.headers.get('content-type') || '';
        if (!r.ok || !MIMES.includes(type)) return { status: 404, headers: {}, body: '' };
        const body = Buffer.from(await r.arrayBuffer());
        this.cache.set(id, { type, body, at: Date.now(), nsfw: this.app.nsfw.access().unlocked });
        if (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value);
        return { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-store' }, body };
    }
    async upload(files, rating) {
        const f = files && files.file;
        if (!f || !f.buffer || !f.buffer.length) throw new UserError('Kein Bild gewählt.');
        if (f.buffer.length > 5 * 1048576) throw new UserError('Bild zu groß (max. 5 MB).');
        return this.call('upload', { data: Buffer.from(f.buffer).toString('base64'), rating: rating === 'nsfw' ? 'nsfw' : 'sfw' });
    }
    /** 7.0 Clubs & Events (nexusclubs.php): die Oberfläche schickt alles als JSON in „data“, der Server prüft Rollen und Rechte */
    async club(a, input) {
        if (!CLUB_ACTS.includes(a)) throw new UserError('Unbekannte Aktion.');
        let d = {};
        try { d = JSON.parse(str((input || {}).data) || '{}'); } catch (e) { d = {}; }
        if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
        delete d.token; delete d.key;
        let r;
        try { r = await fetch(BASE() + '/nexusclubs.php?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, d, this.auth())), signal: AbortSignal.timeout(20000) }); }
        catch (e) { if (e instanceof UserError) throw e; throw new UserError('GhostNode-Webseite nicht erreichbar.'); }
        if (r.status === 401) { if (this.app.account.expired) this.app.account.expired(); else this.app.account.refresh(true).catch(() => {}); }
        const out = await r.json().catch(() => ({ error: 'Antwort kein JSON – liegt nexusclubs.php auf der Webseite?' }));
        if (!r.ok || out.error) throw new UserError(str(out.error) || 'Fehler ' + r.status + '.');
        out._site = BASE();
        return out;
    }
    async action(act, input, files) {
        if (act === 'comm_upload') return this.upload(files, str(input.rating));
        const a = ACTS[act];
        if (!a) throw new UserError('Unbekannte Aktion.');
        const body = {};
        for (const [k, v] of Object.entries(input || {})) {
            if (k === 'act' || k === 'token' || k === 'key') continue;
            if (k === 'media' || k === 'links') body[k] = Array.isArray(v) ? v.map(str) : str(v) ? str(v).split(',').map(x => x.trim()).filter(Boolean) : [];
            else if (k === 'facts' || k === 'nsfw_facts') { let o = v; if (typeof v === 'string') { try { o = JSON.parse(v); } catch (e) { o = null; } } if (o && typeof o === 'object' && !Array.isArray(o)) body[k] = o; }   // 3.1.1: Steckbrief (prüft der Server)
            else if (k === 'id' && ['profile', 'follow', 'req_send', 'compat', 'sess_start'].includes(a)) { if (str(v).trim()) body.id = str(v).trim(); }   // VRChat-ID (Profil leer = eigenes), keine Zahl
            else if (k === 'terms') { let o = v; if (typeof v === 'string') { try { o = JSON.parse(v); } catch (e) { o = null; } } if (o && typeof o === 'object' && !Array.isArray(o)) body.terms = o; }   // 6.0: Consent-Check
            else if (['id', 'before', 'parent', 'hours', 'report'].includes(k)) body[k] = int(v);
            else body[k] = str(v);
        }
        if (a === 'feed' && body.rating === 'nsfw' && !this.app.nsfw.access().unlocked) throw new UserError('NSFW ist nicht freigegeben.');
        if (/^(req_|sess_|compat)/.test(a) && !this.app.nsfw.access().unlocked) throw new UserError('NSFW ist nicht freigegeben.');   // 6.0: 18+-Anfragen nur mit NSFW
        return this.call(a, body);
    }
}

module.exports = { Community };
