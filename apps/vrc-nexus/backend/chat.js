'use strict';
/*
 * Nexus-Privat-Chat (1:1) – Ende-zu-Ende-verschlüsselt (e2ee.js: X3DH + Double Ratchet), GhostNode ist nur Briefkasten (nexuschat.php).
 *   - Geräte-Schlüssel, Sitzungen und Nachrichtenverlauf liegen NUR auf diesem Gerät, verschlüsselt gespeichert.
 *   - Jede Nachricht geht an alle Geräte der Gegenseite und (zum Abgleich) an die eigenen anderen Geräte.
 *   - Sicherheitsnummer je Kontakt; ändern sich die Geräte-Schlüssel der Gegenseite, wird das deutlich angezeigt.
 *   - Chat ist freiwillig: erst beim ersten Öffnen wird ein Geräte-Schlüssel erzeugt und veröffentlicht.
 * 8.3: Protokoll-Aushandlung – jedes Gerät veröffentlicht „protos“. Können beide Geräte „signal-v1“ (offizielle Signal-Bibliothek
 *   libsignal, PQXDH + Double Ratchet, backend/signal.js – nur Desktop), wird jede NEUE Sitzung damit aufgebaut; sonst und für
 *   bestehende Sitzungen bleibt „nexus-v1“ (e2ee.js). Der Verlauf liegt entschlüsselt (lokal verschlüsselt) vor und bleibt lesbar.
 * Seit 3.5 auch in der Android-App (X25519/Ed25519/AES-GCM über @noble im Krypto-Shim, gleiches Schlüsselformat wie am PC).
 * 3.4: Reaktionen, Antworten, Bearbeiten/Löschen, Gelesen-Häkchen, 💓 Puls teilen, Bilder/GIFs (auf dem Gerät mit AES-256-GCM
 *   verschlüsselt, als Chiffretext auf der Webseite – Schlüssel nur in der E2E-Nachricht), Anheften, Merken, Geräte-Übersicht.
 *   Alles läuft als verschlüsselte Steuer-Nachricht über denselben Briefkasten – die Webseite sieht davon nichts.
 * 3.5: private Gruppenchats nach dem Megolm-Prinzip (eigene Umsetzung):
 *   - Jedes Mitglied (je Gerät) hat eine Sender-Sitzung: Kettenschlüssel ck + Zähler + Ed25519-Signaturschlüssel.
 *     Nachrichtenschlüssel = HMAC(ck, 0x01), danach ck = HMAC(ck, 0x02) → alte Schlüssel lassen sich nicht zurückrechnen.
 *   - Die Sender-Schlüssel gehen NUR über die vorhandenen 1:1-Sitzungen (X3DH + Double Ratchet) an die Mitglieder.
 *   - Jede Gruppennachricht: AES-256-GCM + Signatur des Absenders; der Briefkasten sieht nur Chiffretext.
 *   - Ändert sich die Mitgliederliste (oder nach 100 Nachrichten / 7 Tagen), baut jedes Mitglied vor der nächsten
 *     Nachricht eine NEUE Sender-Sitzung und verteilt sie nur an die aktuellen Mitglieder – Entfernte lesen nichts Neues mit.
 *   - Mitglieder verwaltet die Person, die die Gruppe erstellt hat (Admin der Gruppe); verlassen kann jede/r.
 */
const crypto = require('crypto');
const E = require('./e2ee');
const { SignalProto, PROTO: SIGNAL, remoteCapable } = require('./signal');
const NEXUS = 'nexus-v1';
const { str, int, cut, now, UserError } = require('./util');

const BASE = () => (process.env.NEXUS_CHAT_BASE || process.env.NEXUS_ACCT_BASE || process.env.NEXUS_RELAY_BASE || require('./servers').nexus()).replace(/\/+$/, '');
const UID = /^(?:usr_[0-9a-f-]{36}|[0-9a-z]{10})$/;   // auch kurze IDs älterer Konten
const KEEP = 500;   // Nachrichten je Unterhaltung auf dem Gerät
const EMOJI = ['❤️', '😂', '👍', '😮', '😢', '🔥', '🦊', '🐾'];
const IMG_MAX = 4 * 1048576;   // Bilder bis 4 MB (verschlüsselt ≈ gleich groß, passt sicher durch PHP-Upload-Grenzen)
const MIME = b => b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.slice(0, 3).toString() === 'GIF' ? 'image/gif'
    : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
const rid = () => crypto.randomBytes(8).toString('hex');
const CONV = /^(?:usr_[0-9a-f-]{36}|[0-9a-z]{10}|g:[0-9a-f]{16})$/;   // 1:1 (VRChat-ID) oder Gruppe (g:…)
const isGroup = c => /^g:[0-9a-f]{16}$/.test(str(c));
const GMAX = 50;              // Mitglieder je Gruppe
const G_ROTATE_N = 100, G_ROTATE_MS = 7 * 86400000;
const RAW_E = Buffer.from('302a300506032b6570032100', 'hex');
const ghmac = (k, b) => crypto.createHmac('sha256', k).update(Buffer.from([b])).digest();
function gKeys(mk) { const o = Buffer.from(crypto.hkdfSync('sha256', mk, Buffer.alloc(32), Buffer.from('NexusGroupMsg-v1'), 44)); return [o.subarray(0, 32), o.subarray(32)]; }
function gNewSession() {
    const k = crypto.generateKeyPairSync('ed25519');
    return { sid: rid(), ck: crypto.randomBytes(32).toString('base64'), idx: 0, count: 0, created: Date.now(),
        sigPriv: k.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), sigPub: Buffer.from(k.publicKey.export({ type: 'spki', format: 'der' }).subarray(12)).toString('base64') };
}
const gSign = (privB64, data) => crypto.sign(null, data, crypto.createPrivateKey({ key: Buffer.from(privB64, 'base64'), format: 'der', type: 'pkcs8' })).toString('base64');
const gVerify = (pubB64, data, sig) => { try { const raw = Buffer.from(str(pubB64), 'base64'); if (raw.length !== 32) return false; return crypto.verify(null, data, crypto.createPublicKey({ key: Buffer.concat([RAW_E, raw]), format: 'der', type: 'spki' }), Buffer.from(str(sig), 'base64')); } catch (e) { return false; } };

class Chat {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.timer = null; this.error = ''; this.busy = null; this.unread = 0; this.imgs = new Map(); this.sig = new SignalProto(this); }
    // ---------- verschlüsselter Speicher ----------
    get(k, d) { try { const v = this.app.db.setting(k, ''); return v ? JSON.parse(this.crypt.decrypt(v)) : d; } catch (e) { return d; } }
    put(k, v) { this.app.db.setSetting(k, this.crypt.encrypt(JSON.stringify(v))); }
    me() { const o = this.app.account && this.app.account.current(); if (!o) throw new UserError('Für den Chat erst das Nexus-Konto verbinden (Einstellungen → Erweitert).'); return o; }
    key(k) { return k + ':' + this.me().account.vrc_id; }   // alles getrennt je Nexus-Konto
    async call(a, body) {
        const o = this.me();
        let r;
        try { r = await fetch(BASE() + '/nexuschat.php?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: o.token }, body || {})), signal: AbortSignal.timeout(20000) }); }
        catch (e) { throw new UserError('GhostNode-Webseite nicht erreichbar.'); }
        const d = await require('./servers').readJson(r, 'nexuschat.php');
        if (r.status === 401 && this.app.account && this.app.account.expired) this.app.account.expired();   // 3.7.1 Zugang abgelaufen → abmelden
        if (!r.ok || d.error) throw new UserError(str(d.error) || 'Fehler ' + r.status + '.');
        return d;
    }

    // ---------- Gerät ----------
    async device() {
        let dev = this.get(this.key('chat_dev'), null);
        if (!dev) { dev = E.newDevice(50); this.put(this.key('chat_dev'), dev); }
        // 8.3 signal-v1 (libsignal) zusätzlich, wenn die Bibliothek auf diesem Gerät läuft – sonst nur nexus-v1
        const sk = await this.sig.device(dev);
        let rotated = false;
        if (Date.now() - (dev.spk.at || 0) > 7 * 86400000) { E.rotateSpk(dev); this.put(this.key('chat_dev'), dev); rotated = true; }
        const sigWant = !!sk && dev.sigProtos !== 0 && (dev.sigProtos === undefined || this.sig.needsPublish(sk));
        if (!dev.published || rotated || (dev.pendingOpks || []).length || sigWant) {
            const body = E.bundle(dev);
            let part = null;
            if (sk) { part = this.sig.publishPart(sk); body.protos = [NEXUS, SIGNAL]; body.sig = part; }
            const d = await this.call('publish', body);
            dev.id = d.device; dev.published = Date.now(); dev.pendingOpks = [];
            // Server ohne signal-v1-Felder (noch nicht aktualisiert) → nichts als veröffentlicht merken, später erneut versuchen
            if (sk && Array.isArray(d.protos) && d.protos.includes(SIGNAL)) { this.sig.published(sk, part); this.sig.saveKeys(sk); dev.sigProtos = 1; }
            else if (sk) { dev.sigProtos = 0; dev.sigRetry = Date.now(); }
            this.put(this.key('chat_dev'), dev);
        }
        return dev;
    }
    /** Protokoll für ein Gerät der Gegenseite: bestehende Sitzung behalten, neue Sitzung = signal-v1, wenn beide es können */
    protoFor(target, d, sess) {
        const name = target + '.' + d.device;
        if (this.sig.available() && this.sig.hasSession(name)) return SIGNAL;
        if (sess[target + '|' + d.device]) return NEXUS;
        return this.sig.available() && this.get(this.key('chat_dev'), {}).sigProtos && remoteCapable(d) ? SIGNAL : NEXUS;
    }
    sessions() { return this.get(this.key('chat_sess'), {}); }
    convs() { return this.get(this.key('chat_msgs'), {}); }
    known() { return this.get(this.key('chat_known'), {}); }

    // ---------- Senden ----------
    async send(uid, text, extra) {
        uid = str(uid).toLowerCase();
        text = cut(str(text).replace(/\r/g, ''), 4000).trim();
        extra = extra || {};
        if (!text && !extra.img && !extra.hr) throw new UserError('Leere Nachricht.');
        const msg = Object.assign({ t: extra.hr ? 'hr' : 'msg', id: rid(), text, at: Date.now(), conv: uid }, extra.reply ? { reply: extra.reply } : {}, extra.img ? { img: extra.img } : {}, extra.hr ? { hr: extra.hr } : {});
        await this.sendPayload(uid, msg);
        this.apply(uid, msg, true);
        return msg;
    }
    /** Steuer-Nachricht (Reaktion, Bearbeiten, Löschen, Gelesen) – geht verschlüsselt an beide Seiten und wird hier sofort angewendet */
    async control(uid, p) {
        uid = str(uid).toLowerCase();
        const msg = Object.assign({ id: rid(), at: Date.now(), conv: uid }, p);
        await this.sendPayload(uid, msg);
        this.apply(uid, msg, true);
        return msg;
    }
    async sendPayload(uid, msg) {
        if (isGroup(uid)) return this.groupSend(uid.slice(2), msg);
        if (!UID.test(uid)) throw new UserError('Ungültige VRChat-User-ID.');
        const dev = await this.device(), mine = this.me().account.vrc_id;
        if (uid === mine) throw new UserError('An dich selbst geht nicht.');
        const sess = this.sessions();
        const out = [];
        for (const target of [uid, mine]) {
            const devs = (await this.call('devices', { uid: target })).devices.filter(d => d.device !== dev.id);
            if (target === uid) { if (!devs.length) throw new UserError('Diese Person hat den Chat noch nicht eingerichtet (muss Nexus-Community → Chat einmal öffnen).'); this.checkKeys(uid, devs); }
            const proto = {};
            for (const d of devs) proto[d.device] = this.protoFor(target, d, sess);
            const need = devs.filter(d => proto[d.device] === SIGNAL ? !this.sig.hasSession(target + '.' + d.device) : !sess[target + '|' + d.device]).map(d => d.device);
            if (need.length) {
                const b = await this.call('bundles', { uid: target, skip: devs.map(d => d.device).filter(x => !need.includes(x)), sig: this.sig.available() ? 1 : 0 });
                for (const x of b.bundles) {
                    if (!need.includes(x.device)) continue;
                    if (proto[x.device] === SIGNAL && x.sig) {
                        try { await this.sig.start(target + '.' + x.device, mine + '.' + dev.id, devs.find(d => d.device === x.device), x.sig); continue; }
                        catch (e) { proto[x.device] = NEXUS; }   // Paket unbrauchbar → auf nexus-v1 zurückfallen
                    } else proto[x.device] = NEXUS;
                    sess[target + '|' + x.device] = E.initiate(dev, x);
                }
            }
            for (const d of devs) {
                const plain = JSON.stringify(Object.assign({}, msg, target === mine ? { sync: 1 } : {}));
                if (proto[d.device] === SIGNAL && this.sig.hasSession(target + '.' + d.device)) {
                    out.push({ to: target, dev: d.device, body: JSON.stringify(await this.sig.encrypt(target + '.' + d.device, mine + '.' + dev.id, plain)) });
                    continue;
                }
                const st = sess[target + '|' + d.device];
                if (!st) continue;
                out.push({ to: target, dev: d.device, body: JSON.stringify(E.encrypt(st, plain)) });
            }
        }
        this.put(this.key('chat_sess'), sess);
        if (out.length) await this.call('send', { device: dev.id, msgs: out });
        return msg;
    }
    /** eine (empfangene oder eigene) Nachricht auf den Verlauf anwenden */
    apply(conv, p, fromMe, from) {
        const grp = isGroup(conv);
        const c = this.convs(), l = c[conv] = c[conv] || [];
        const find = id => l.find(x => x.id === str(id));
        const at = Math.min(Date.now(), int(p.at) || Date.now());
        if (p.t === 'msg' || p.t === 'hr') {
            if (find(p.id)) return false;
            const m = { id: str(p.id), me: fromMe, text: cut(str(p.text), 4000), at };
            if (grp && !fromMe) m.from = str(from);
            if (p.reply && typeof p.reply === 'object') m.reply = { id: str(p.reply.id), text: cut(str(p.reply.text), 140), me: !!p.reply.me };
            if (p.img && typeof p.img === 'object' && /^[0-9a-f]{32}$/.test(str(p.img.b))) m.img = { b: str(p.img.b), k: str(p.img.k), n: str(p.img.n), m: /^image\/(png|jpeg|gif|webp)$/.test(str(p.img.m)) ? str(p.img.m) : 'image/png', s: int(p.img.s) };
            if (p.t === 'hr') m.hr = Math.max(0, Math.min(300, int(p.hr)));
            l.push(m); l.sort((a, b) => a.at - b.at);
            if (!fromMe && !grp && p.t === 'msg' && this.app.nsfwcare) try { this.app.nsfwcare.onChat(conv, m.text); } catch (e) { /* egal */ }   // 7.3 Gruppen-Safeword
            if (l.length > KEEP) l.splice(0, l.length - KEEP);
        } else if (p.t === 'react') {
            const m = find(p.ref); if (!m || m.deleted || !EMOJI.includes(str(p.emoji))) return false;
            const who = fromMe ? 'me' : grp ? str(from) : 'them', r = m.reacts = m.reacts || {}, list = r[p.emoji] = (r[p.emoji] || []).filter(x => x !== who);
            if (p.on !== false) list.push(who);
            if (!list.length) delete r[p.emoji];
        } else if (p.t === 'edit') {
            const m = find(p.ref); if (!m || m.me !== fromMe || m.deleted || (grp && !fromMe && m.from !== str(from))) return false;
            m.text = cut(str(p.text), 4000); m.edited = at;
        } else if (p.t === 'del') {
            const m = find(p.ref); if (!m || m.me !== fromMe || (grp && !fromMe && m.from !== str(from))) return false;
            Object.assign(m, { deleted: true, text: '', reacts: {} }); delete m.img; delete m.hr; delete m.reply;
        } else if (p.t === 'read') {
            if (fromMe || grp) return false;   // eigene andere Geräte: nichts zu tun
            for (const m of l) if (m.me && m.at <= int(p.upto)) m.read = true;
        } else return false;
        this.put(this.key('chat_msgs'), c);
        return true;
    }
    /** Geräte-Schlüssel der Gegenseite merken – Änderung = Warnung (möglicher Mitleser) */
    checkKeys(uid, devs) {
        const k = this.known(), now_ = devs.map(d => d.ik_sig).sort();
        const was = k[uid];
        if (!was) k[uid] = { keys: now_, verified: false, changed: false };
        else if (JSON.stringify(was.keys) !== JSON.stringify(now_)) { const added = now_.some(x => !was.keys.includes(x)); k[uid] = { keys: now_, verified: added ? false : was.verified, changed: added || was.changed }; }
        this.put(this.key('chat_known'), k);
        return k[uid];
    }
    store(uid, m) {
        const c = this.convs();
        const l = c[uid] = c[uid] || [];
        if (l.some(x => x.id === m.id)) return;
        l.push(m); l.sort((a, b) => a.at - b.at);
        if (l.length > KEEP) l.splice(0, l.length - KEEP);
        this.put(this.key('chat_msgs'), c);
    }

    // ---------- Empfangen ----------
    async poll() {
        if (this.busy) return this.busy;
        this.busy = (async () => {
            const dev = await this.device(), mine = this.me().account.vrc_id;
            const d = await this.call('fetch', { device: dev.id });
            const sess = this.sessions(), ids = [], devCache = {};
            let got = 0, devChanged = false;
            for (const m of d.msgs) {
                ids.push(m.id);
                let env; try { env = JSON.parse(m.body); } catch (e) { continue; }
                if (env && env.g) {   // 3.5 Gruppennachricht (Sender-Schlüssel)
                    try { const r = this.groupRecv(m, env, mine); if (r && r.counted) { got++; this.unreadMark(r.conv); } }
                    catch (e) { this.store('g:' + str(env.g), { id: 'err' + m.id, sys: true, text: '⚠ Gruppennachricht konnte nicht entschlüsselt werden (' + e.message + ').', at: m.at * 1000 }); }
                    continue;
                }
                const sk = m.from + '|' + m.from_dev;
                try {
                    if (env && env.p === SIGNAL) {   // 8.3 signal-v1 (libsignal)
                        if (!(await this.sig.ready())) throw new Error('Nachricht nutzt signal-v1 – auf diesem Gerät nicht verfügbar.');
                        const name = m.from + '.' + m.from_dev;
                        let expect = null;
                        if (!this.sig.hasSession(name) || env.t === 3) {
                            const list = devCache[m.from] = devCache[m.from] || (await this.call('devices', { uid: m.from })).devices;
                            const rd = list.find(x => x.device === m.from_dev);
                            if (!rd || !remoteCapable(rd)) throw new Error('Signal-Schlüssel des Absender-Geräts nicht bestätigt.');
                            expect = rd.sig_ik;
                        }
                        const text = await this.sig.decrypt(name, mine + '.' + dev.id, env, expect);
                        if (this.handle(m, JSON.parse(text), mine)) { got++; }
                        continue;
                    }
                    let st = sess[sk];
                    // neue Sitzung, wenn die Gegenseite (neu) mit Pre-Key-Kopf beginnt
                    if (env.pre && (!st || st.preEk !== env.pre.ek)) {
                        if (env.pre.ik_sig && E.deviceId(env.pre.ik_sig) !== m.from_dev) throw new Error('Gerät passt nicht zum Schlüssel.');
                        const a = E.accept(dev, env.pre);
                        if (a.opk) { delete dev.opks[a.opk]; devChanged = true; }
                        st = a.st; st.preEk = env.pre.ek;
                    }
                    if (!st) throw new Error('Keine Sitzung.');
                    const r = E.decrypt(st, env);
                    sess[sk] = r.st;
                    if (this.handle(m, JSON.parse(r.text), mine)) got++;
                } catch (e) { this.store(m.from === mine ? 'system' : m.from, { id: 'err' + m.id, sys: true, text: '⚠ Nachricht konnte nicht entschlüsselt werden (' + e.message + ').', at: m.at * 1000 }); }
            }
            this.put(this.key('chat_sess'), sess);
            if (devChanged) this.put(this.key('chat_dev'), dev);
            got += this.groupRetry(mine);   // Gruppennachrichten, deren Schlüssel erst jetzt angekommen ist
            if (ids.length) await this.call('ack', { device: dev.id, ids });
            const sk2 = this.sig.available() ? this.sig.keys() : null;
            if (sk2 && this.sig.refill(sk2, { opks: d.sig_opks, kybers: d.sig_kybers })) this.sig.saveKeys(sk2);
            if (d.opks < 15) { E.addOpks(dev, 40); this.put(this.key('chat_dev'), dev); }
            if (sk2 && dev.sigProtos === 0 && Date.now() - (dev.sigRetry || 0) > 6 * 3600000) { delete dev.sigProtos; this.put(this.key('chat_dev'), dev); }   // Server inzwischen aktualisiert?
            if (d.opks < 15 || (sk2 && dev.sigProtos !== 0 && this.sig.needsPublish(sk2)) || (sk2 && dev.sigProtos === undefined)) await this.device();
            this.error = '';
            if (got && this.app.tools && this.app.tools.host && this.app.tools.host.notify && !this.focus) this.app.tools.host.notify('💬 Neue Nachricht', got + ' neue verschlüsselte Nachricht' + (got === 1 ? '' : 'en'), false);
            return got;
        })().catch(e => { this.error = e.message; throw e; }).finally(() => { this.busy = null; });
        return this.busy;
    }
    /** entschlüsselte 1:1-Nutzlast anwenden (gleich für nexus-v1 und signal-v1) → true = neue Nachricht für den Zähler */
    handle(m, p, mine) {
        if (p.t === 'gctl') { this.groupCtl(m.from, p, mine); return false; }   // 3.5 Gruppen-Verwaltung und Sender-Schlüssel (nur über 1:1-E2E)
        if (p.t === 'call') { if (this.app.voice) this.app.voice.signal(m.from, p, mine); return false; }   // 3.7 Sprachanruf-Signalisierung
        const conv = m.from === mine ? str(p.conv).toLowerCase() : m.from;   // Abgleich von eigenen Geräten
        if (!UID.test(conv)) return false;
        if (!p.at) p.at = m.at * 1000;
        const added = this.apply(conv, p, m.from === mine);
        if (added && m.from !== mine && (p.t === 'msg' || p.t === 'hr')) { this.unreadMark(conv); return true; }
        return false;
    }
    unreadMark(uid) { const u = this.get(this.key('chat_unread'), {}); u[uid] = (u[uid] || 0) + 1; this.put(this.key('chat_unread'), u); }
    start() {
        clearInterval(this.timer);
        this.timer = setInterval(() => { try { if (this.get(this.key('chat_dev'), null)) this.poll().catch(() => {}); } catch (e) { /* kein Konto */ } }, 20000);
        if (this.timer.unref) this.timer.unref();
    }
    stop() { clearInterval(this.timer); }

    list() {
        const c = this.convs(), u = this.get(this.key('chat_unread'), {}), k = this.known();
        const names = {};
        try { for (const f of this.app.vrc.friendList()) names[f.id] = f.name; } catch (e) { /* ohne Freunde */ }
        const groups = this.groups();
        for (const g of Object.values(groups)) if (!g.left && !c['g:' + g.id]) c['g:' + g.id] = [];
        return Object.entries(c).filter(([id]) => CONV.test(id)).map(([id, l]) => {
            const g = isGroup(id) ? groups[id.slice(2)] : null;
            return { uid: id, group: !!g, left: !!(g && g.left), members: g ? g.members.length : 0, name: g ? g.name : names[id] || '', last: l[l.length - 1], unread: u[id] || 0, changed: !!(k[id] && k[id].changed), verified: !!(k[id] && k[id].verified) };
        }).filter(x => !isGroup(x.uid) || groups[x.uid.slice(2)]).sort((a, b) => (b.last ? b.last.at : 0) - (a.last ? a.last.at : 0));
    }
    async open(uid) {
        uid = str(uid).toLowerCase();
        if (isGroup(uid)) return this.groupOpen(uid);
        if (!UID.test(uid)) throw new UserError('Ungültige VRChat-User-ID.');
        const dev = await this.device();
        const u = this.get(this.key('chat_unread'), {}); delete u[uid]; this.put(this.key('chat_unread'), u);
        let safety = '', devices = [], info = null;
        const signal = [];
        try {
            const theirs = (await this.call('devices', { uid })).devices, mine = (await this.call('devices', { uid: this.me().account.vrc_id })).devices;
            devices = theirs.map(d => ({ device: d.device, created: d.created }));
            info = theirs.length ? this.checkKeys(uid, theirs) : null;
            if (theirs.length) safety = E.safetyNumber(mine.map(d => d.ik_sig).concat(mine.some(d => d.device === dev.id) ? [] : [dev.idSig.pub]), theirs.map(d => d.ik_sig));
            // 8.3 Signal-Sicherheitsnummer (libsignal-Fingerprint) je Gerätepaar: dieses Gerät ↔ Gerät der Gegenseite
            const sk = this.sig.available() ? this.sig.keys() : null, myId = this.me().account.vrc_id;
            if (sk) for (const d of theirs) if (remoteCapable(d)) signal.push({ device: d.device, number: this.sig.safetyNumber(myId, sk.pub, uid, d.sig_ik), active: this.sig.hasSession(uid + '.' + d.device) });
            for (const d of devices) { const t = theirs.find(x => x.device === d.device); d.proto = this.protoFor(uid, t, this.sessions()); }
        } catch (e) { this.error = e.message; }
        const k = this.known()[uid] || {};
        // Gelesen-Häkchen: einmal je neuem Stand, abschaltbar
        const msgs = this.convs()[uid] || [], last = msgs.filter(m => !m.me && !m.deleted).pop(), meta = this.meta(), cm = meta[uid] = meta[uid] || {};
        if (this.prefs().receipts && last && last.at > (cm.readSent || 0) && devices.length) {
            cm.readSent = last.at; this.put(this.key('chat_meta'), meta);
            await this.control(uid, { t: 'read', upto: last.at }).catch(() => {});
        }
        const favs = this.favs().filter(f => f.conv === uid).map(f => f.id);
        return { uid, messages: this.convs()[uid] || [], pins: cm.pins || [], favs, emoji: EMOJI, prefs: this.prefs(), safety, signal, devices, ready: devices.length > 0, verified: !!k.verified, changed: !!k.changed, error: this.error };
    }
    meta() { return this.get(this.key('chat_meta'), {}); }
    favs() { return this.get(this.key('chat_favs'), []); }
    prefs() { return Object.assign({ receipts: true }, this.get(this.key('chat_prefs'), {})); }
    msgOf(uid, id) { const m = (this.convs()[str(uid).toLowerCase()] || []).find(x => x.id === str(id)); if (!m) throw new UserError('Nachricht nicht gefunden.'); return m; }
    /** Bild verschlüsseln und als Chiffretext hochladen – der Schlüssel geht nur in der E2E-Nachricht mit */
    async sendImage(uid, file, caption) {
        const buf = file && file.buffer ? Buffer.from(file.buffer) : null;
        if (!buf || !buf.length) throw new UserError('Kein Bild gewählt.');
        if (buf.length > IMG_MAX) throw new UserError('Bild zu groß (max. 4 MB).');
        const mime = MIME(buf);
        if (!mime) throw new UserError('Nur PNG, JPEG, GIF oder WebP.');
        const key = crypto.randomBytes(32), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
        const ct = Buffer.concat([c.update(buf), c.final(), c.getAuthTag()]);
        const g = isGroup(uid) ? this.groups()[str(uid).slice(2)] : null;
        const up = await this.call('blob_put', { data: ct.toString('base64'), allow: g ? g.members : [str(uid).toLowerCase()] });
        return this.send(uid, caption, { img: { b: str(up.id), k: key.toString('base64'), n: iv.toString('base64'), m: mime, s: buf.length } });
    }
    /** Bild für die Oberfläche: nexus.php?chimg=<uid>:<msgid> – laden, entschlüsseln, kurz im Speicher halten */
    async image(ref) {
        const r0 = str(ref).toLowerCase(), cut0 = r0.lastIndexOf(':'), uid = r0.slice(0, cut0), id = r0.slice(cut0 + 1);
        const m = CONV.test(uid || '') && /^[0-9a-f]{16}$/.test(id || '') ? (this.convs()[uid] || []).find(x => x.id === id) : null;
        if (!m || !m.img) return { status: 404, headers: {}, body: '' };
        let body = this.imgs.get(m.img.b);
        if (!body) {
            const o = this.me();
            let r;
            try { r = await fetch(BASE() + '/nexuschat.php?a=blob_get', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: o.token, id: m.img.b }), signal: AbortSignal.timeout(30000) }); }
            catch (e) { return { status: 502, headers: {}, body: '' }; }
            if (!r.ok || !/octet-stream/.test(r.headers.get('content-type') || '')) return { status: 404, headers: {}, body: '' };
            const ct = Buffer.from(await r.arrayBuffer());
            try {
                const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(m.img.k, 'base64'), Buffer.from(m.img.n, 'base64'));
                d.setAuthTag(ct.subarray(ct.length - 16));
                body = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
            } catch (e) { return { status: 422, headers: {}, body: '' }; }
            this.imgs.set(m.img.b, body);
            if (this.imgs.size > 40) this.imgs.delete(this.imgs.keys().next().value);
        }
        return { status: 200, headers: { 'Content-Type': m.img.m, 'Cache-Control': 'no-store' }, body };
    }
    // ================= 3.5 Gruppen (Megolm-Prinzip) =================
    groups() { return this.get(this.key('chat_groups'), {}); }
    saveGroups(g) { this.put(this.key('chat_groups'), g); }
    names() { const n = {}; try { for (const f of this.app.vrc.friendList()) n[f.id] = f.name; } catch (e) { /* egal */ } return n; }
    sysNote(gid, text) { this.store('g:' + gid, { id: 's' + rid(), sys: true, text, at: Date.now() }); }
    /** Gruppen-Steuerung an alle Mitglieder (je 1:1-E2E); wer den Chat nicht eingerichtet hat, wird übersprungen */
    async groupTell(members, payload) {
        const mine = this.me().account.vrc_id, failed = [];
        for (const u of members) { if (u === mine) continue; try { await this.sendPayload(u, Object.assign({ t: 'gctl', id: rid(), at: Date.now() }, payload)); } catch (e) { failed.push(u); } }
        return failed;
    }
    /** eigene Sender-Sitzung (neu bei Mitgliederwechsel, nach 100 Nachrichten oder 7 Tagen) – an alle Mitglieder verteilen */
    async ensureSender(gid) {
        const all = this.groups(), g = all[gid];
        if (g.my && !g.rotate && g.my.count < G_ROTATE_N && Date.now() - g.my.created < G_ROTATE_MS) return g;
        g.my = gNewSession(); g.rotate = false;
        all[gid] = g; this.saveGroups(all);
        await this.groupTell(g.members, { op: 'key', gid, sid: g.my.sid, ck: g.my.ck, idx: g.my.idx, sigPub: g.my.sigPub });
        return g;
    }
    async groupSend(gid, msg) {
        const mine = this.me().account.vrc_id, dev = await this.device();
        let all = this.groups(), g = all[gid];
        if (!g || g.left) throw new UserError('Gruppe nicht gefunden oder verlassen.');
        if (!g.members.includes(mine)) throw new UserError('Du bist nicht (mehr) Mitglied dieser Gruppe.');
        await this.ensureSender(gid);
        all = this.groups(); g = all[gid];
        const s = g.my, ck = Buffer.from(s.ck, 'base64'), mk = ghmac(ck, 1), [key, iv] = gKeys(mk);
        const aad = Buffer.from(gid + '|' + s.sid + '|' + s.idx);
        const c = crypto.createCipheriv('aes-256-gcm', key, iv); c.setAAD(aad);
        const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(Object.assign({}, msg, { conv: 'g:' + gid })), 'utf8')), c.final(), c.getAuthTag()]);
        const env = { g: gid, s: s.sid, i: s.idx, c: ct.toString('base64'), sig: gSign(s.sigPriv, Buffer.concat([aad, ct])) };
        s.ck = ghmac(ck, 2).toString('base64'); s.idx++; s.count++;
        all[gid] = g; this.saveGroups(all);
        const body = JSON.stringify(env), out = [];
        for (const u of g.members) {
            let devs = [];
            try { devs = (await this.call('devices', { uid: u })).devices; } catch (e) { devs = []; }
            for (const d of devs) if (d.device !== dev.id) out.push({ to: u, dev: d.device, body });
        }
        for (let i = 0; i < out.length; i += 50) await this.call('send', { device: dev.id, msgs: out.slice(i, i + 50) });
        return msg;
    }
    /** eingehende Gruppennachricht prüfen (Mitglied? Signatur?), Kette vorspulen, entschlüsseln, anwenden */
    groupRecv(m, env, mine, retry) {
        const all = this.groups(), g = all[str(env.g)];
        if (!g || g.left || !g.members.includes(m.from)) return null;
        const pk = m.from + '|' + str(env.s), peer = g.peers && g.peers[pk];
        if (!peer) {   // Schlüssel noch nicht da – kurz aufheben und nach dem nächsten Abholen erneut versuchen
            if (!retry) { const pend = this.get(this.key('chat_gpend'), []); pend.push({ from: m.from, at: m.at, env, id: m.id }); this.put(this.key('chat_gpend'), pend.slice(-300)); }
            return { pending: true };
        }
        const i = int(env.i), ct = Buffer.from(str(env.c), 'base64'), aad = Buffer.from(g.id + '|' + str(env.s) + '|' + i);
        if (ct.length < 17 || !gVerify(peer.sigPub, Buffer.concat([aad, ct]), env.sig)) throw new Error('Signatur ungültig.');
        let mk;
        if (i < peer.idx) { mk = peer.skipped && peer.skipped[i]; if (!mk) throw new Error('Nachricht bereits gelesen oder zu alt.'); delete peer.skipped[i]; mk = Buffer.from(mk, 'base64'); }
        else {
            if (i - peer.idx > 1000) throw new Error('Zu viele Nachrichten übersprungen.');
            let ck = Buffer.from(peer.ck, 'base64');
            peer.skipped = peer.skipped || {};
            for (let k = peer.idx; k < i; k++) { peer.skipped[k] = ghmac(ck, 1).toString('base64'); ck = ghmac(ck, 2); }
            mk = ghmac(ck, 1); peer.ck = ghmac(ck, 2).toString('base64'); peer.idx = i + 1;
            const ks = Object.keys(peer.skipped); if (ks.length > 2000) for (const k of ks.slice(0, ks.length - 2000)) delete peer.skipped[k];
        }
        const [key, iv] = gKeys(mk), d = crypto.createDecipheriv('aes-256-gcm', key, iv);
        d.setAAD(aad); d.setAuthTag(ct.subarray(ct.length - 16));
        const p = JSON.parse(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8'));
        this.saveGroups(all);
        if (!p.at) p.at = m.at * 1000;
        const conv = 'g:' + g.id;
        const added = this.apply(conv, p, m.from === mine, m.from);
        return { conv, counted: added && m.from !== mine && (p.t === 'msg' || p.t === 'hr') };
    }
    groupRetry(mine) {
        const pend = this.get(this.key('chat_gpend'), []);
        if (!pend.length) return 0;
        let got = 0; const keep = [];
        for (const x of pend) {
            if (Date.now() - x.at * 1000 > 7 * 86400000) continue;
            try { const r = this.groupRecv({ from: x.from, at: x.at, id: x.id }, x.env, mine, true); if (r && r.pending) keep.push(x); else if (r && r.counted) { got++; this.unreadMark(r.conv); } } catch (e) { /* verwerfen */ }
        }
        this.put(this.key('chat_gpend'), keep);
        return got;
    }
    /** Gruppen-Steuerung (kommt nur über 1:1-E2E): sync = Name/Mitglieder (nur vom Admin), key = Sender-Schlüssel, leave */
    groupCtl(from, p, mine) {
        const gid = str(p.gid);
        if (!/^[0-9a-f]{16}$/.test(gid)) return;
        const all = this.groups(), names = this.names(), nm = u => names[u] || (u === mine ? 'Du' : u.slice(0, 12) + '…');
        let g = all[gid];
        if (p.op === 'sync') {
            const members = [...new Set([].concat(p.members || []).map(x => str(x).toLowerCase()).filter(x => UID.test(x)))].slice(0, GMAX);
            if (!members.includes(str(from))) return;
            if (!g) {
                if (!members.includes(mine) || str(p.admin) !== from) return;
                g = all[gid] = { id: gid, name: cut(str(p.name), 40) || 'Gruppe', admin: from, members, created: Date.now(), peers: {}, my: null, rotate: true };
                this.saveGroups(all);
                this.sysNote(gid, '👥 ' + nm(from) + ' hat dich zur Gruppe „' + g.name + '“ hinzugefügt.');
                return;
            }
            if (g.admin !== from) return;
            const removed = g.members.filter(x => !members.includes(x)), added = members.filter(x => !g.members.includes(x));
            g.name = cut(str(p.name), 40) || g.name; g.members = members;
            for (const k of Object.keys(g.peers || {})) if (!members.includes(k.split('|')[0])) delete g.peers[k];
            if (removed.length || added.length) g.rotate = true;
            if (!members.includes(mine)) { g.left = true; this.sysNote(gid, '🚪 Du wurdest aus der Gruppe entfernt.'); }
            else { if (added.length) this.sysNote(gid, '➕ ' + added.map(nm).join(', ') + ' hinzugefügt.'); if (removed.length) this.sysNote(gid, '➖ ' + removed.map(nm).join(', ') + ' entfernt – neue Schlüssel.'); }
            this.saveGroups(all);
        } else if (p.op === 'key') {
            if (!g || !g.members.includes(from) || !/^[0-9a-f]{16}$/.test(str(p.sid))) return;
            if (Buffer.from(str(p.ck), 'base64').length !== 32 || Buffer.from(str(p.sigPub), 'base64').length !== 32) return;
            g.peers = g.peers || {};
            const k = from + '|' + str(p.sid);
            if (!g.peers[k]) g.peers[k] = { ck: str(p.ck), idx: Math.max(0, int(p.idx)), sigPub: str(p.sigPub), skipped: {} };
            this.saveGroups(all);
        } else if (p.op === 'leave') {
            if (!g || !g.members.includes(from)) return;
            if (from === mine) { g.left = true; } else { g.members = g.members.filter(x => x !== from); g.rotate = true; this.sysNote(gid, '🚪 ' + nm(from) + ' hat die Gruppe verlassen.'); }
            for (const k of Object.keys(g.peers || {})) if (k.split('|')[0] === from) delete g.peers[k];
            this.saveGroups(all);
        }
    }
    groupOpen(uid) {
        const g = this.groups()[uid.slice(2)];
        if (!g) throw new UserError('Gruppe nicht gefunden.');
        const u = this.get(this.key('chat_unread'), {}); delete u[uid]; this.put(this.key('chat_unread'), u);
        const names = this.names(), mine = this.me().account.vrc_id, cm = this.meta()[uid] || {};
        return { uid, group: { id: g.id, name: g.name, admin: g.admin, is_admin: g.admin === mine, left: !!g.left, members: g.members.map(x => ({ uid: x, name: names[x] || (x === mine ? '' : ''), me: x === mine, admin: x === g.admin })) },
            messages: this.convs()[uid] || [], pins: cm.pins || [], favs: this.favs().filter(f => f.conv === uid).map(f => f.id), emoji: EMOJI, prefs: this.prefs(), names,
            safety: '', devices: [], ready: !g.left, verified: false, changed: false, error: this.error };
    }
    parseMembers(v) { return [...new Set(str(v).split(/[\s,;]+/).map(x => x.trim().replace(/^.*\/(usr_[0-9a-f-]{36}).*$/i, '$1').toLowerCase()).filter(Boolean))]; }
    async action(act, input, files) {
        switch (act) {
            case 'chat_list': { await this.device(); if (input.poll === '1') await this.poll().catch(() => {}); return { items: this.list(), error: this.error, device: (this.get(this.key('chat_dev'), null) || {}).id || '' }; }
            case 'chat_open': { this.focus = true; await this.poll().catch(() => {}); return await this.open(input.uid); }
            case 'chat_send': { const m = await this.send(input.uid, input.text); return Object.assign(await this.open(input.uid), { sent: m.id }); }
            case 'chat_verify': { const uid = str(input.uid).toLowerCase(); const k = this.known(); if (!k[uid]) throw new UserError('Noch keine Schlüssel bekannt.'); k[uid].verified = input.on !== '0'; k[uid].changed = false; this.put(this.key('chat_known'), k); return await this.open(uid); }
            case 'chat_blur': this.focus = false; return { ok: true };
            // ---- 3.5 Gruppen ----
            case 'chat_group_create': {
                const mine = this.me().account.vrc_id; await this.device();
                const name = cut(str(input.name).trim(), 40);
                if (!name) throw new UserError('Bitte einen Gruppennamen angeben.');
                const others = this.parseMembers(input.members).filter(x => x !== mine);
                for (const x of others) if (!UID.test(x)) throw new UserError('„' + cut(x, 40) + '“ ist keine VRChat-User-ID.');
                if (!others.length) throw new UserError('Mindestens eine weitere Person auswählen.');
                if (others.length + 1 > GMAX) throw new UserError('Höchstens ' + GMAX + ' Mitglieder.');
                const gid = crypto.randomBytes(8).toString('hex'), members = [mine].concat(others);
                const all = this.groups(); all[gid] = { id: gid, name, admin: mine, members, created: Date.now(), peers: {}, my: null, rotate: true }; this.saveGroups(all);
                const failed = await this.groupTell(members, { op: 'sync', gid, name, admin: mine, members });
                this.sysNote(gid, '👥 Gruppe „' + name + '“ erstellt.' + (failed.length ? ' ⚠ Nicht erreicht (Chat nicht eingerichtet): ' + failed.length : ''));
                return Object.assign(await this.groupOpen('g:' + gid), { msg: failed.length ? failed.length + ' Person(en) haben den Chat noch nicht eingerichtet.' : 'Gruppe erstellt.' });
            }
            case 'chat_group_members': {
                const uid = str(input.uid).toLowerCase(), all = this.groups(), g = all[uid.slice(2)], mine = this.me().account.vrc_id;
                if (!g || g.left) throw new UserError('Gruppe nicht gefunden.');
                if (g.admin !== mine) throw new UserError('Nur wer die Gruppe erstellt hat, kann Mitglieder ändern.');
                const add = this.parseMembers(input.add).filter(x => UID.test(x) && !g.members.includes(x)), rm = this.parseMembers(input.remove).filter(x => x !== mine);
                const before = g.members.slice();
                g.members = g.members.filter(x => !rm.includes(x)).concat(add).slice(0, GMAX);
                if (input.name !== undefined && str(input.name).trim()) g.name = cut(str(input.name).trim(), 40);
                g.rotate = true;
                for (const k of Object.keys(g.peers || {})) if (!g.members.includes(k.split('|')[0])) delete g.peers[k];
                this.saveGroups(all);
                await this.groupTell([...new Set(before.concat(g.members))], { op: 'sync', gid: g.id, name: g.name, admin: g.admin, members: g.members });
                if (add.length) this.sysNote(g.id, '➕ ' + add.length + ' hinzugefügt.');
                if (rm.length) this.sysNote(g.id, '➖ ' + rm.length + ' entfernt – neue Schlüssel.');
                return await this.groupOpen(uid);
            }
            case 'chat_group_leave': {
                const uid = str(input.uid).toLowerCase(), all = this.groups(), g = all[uid.slice(2)];
                if (!g) throw new UserError('Gruppe nicht gefunden.');
                if (!g.left) await this.groupTell(g.members, { op: 'leave', gid: g.id });
                delete all[g.id]; this.saveGroups(all);
                const c = this.convs(); delete c[uid]; this.put(this.key('chat_msgs'), c);
                return { items: this.list(), msg: 'Gruppe verlassen.' };
            }
            // ---- 3.4 ----
            case 'chat_react': { const m = this.msgOf(input.uid, input.ref), on = !((m.reacts || {})[input.emoji] || []).includes('me'); await this.control(input.uid, { t: 'react', ref: m.id, emoji: str(input.emoji), on }); return await this.open(input.uid); }
            case 'chat_edit': { const m = this.msgOf(input.uid, input.ref); if (!m.me || m.deleted) throw new UserError('Nur eigene Nachrichten.'); const t = cut(str(input.text).replace(/\r/g, ''), 4000).trim(); if (!t) throw new UserError('Leere Nachricht.'); await this.control(input.uid, { t: 'edit', ref: m.id, text: t }); return await this.open(input.uid); }
            case 'chat_delete': { const m = this.msgOf(input.uid, input.ref); if (!m.me) throw new UserError('Nur eigene Nachrichten.'); await this.control(input.uid, { t: 'del', ref: m.id }); return await this.open(input.uid); }
            case 'chat_reply': {   // Antworten: zitiert einen Ausschnitt der Nachricht
                const m = this.msgOf(input.uid, input.ref);
                const sent = await this.send(input.uid, input.text, { reply: { id: m.id, text: cut(m.deleted ? '' : (m.text || (m.img ? '🖼 Bild' : m.hr ? '💓 ' + m.hr + ' bpm' : '')), 140), me: !m.me } });
                return Object.assign(await this.open(input.uid), { sent: sent.id });
            }
            case 'chat_img': { const sent = await this.sendImage(input.uid, files && files.file, input.text); return Object.assign(await this.open(input.uid), { sent: sent.id }); }
            case 'chat_hr': {
                const h = this.app.heart && this.app.heart.status();
                if (!h || !h.active || !h.bpm) throw new UserError('Gerade kein Puls – Quelle unter Spiel & OSC → 💓 Puls einrichten.');
                await this.send(input.uid, '', { hr: h.bpm });
                return await this.open(input.uid);
            }
            case 'chat_pin': {
                const uid = str(input.uid).toLowerCase(), m = this.msgOf(uid, input.ref), meta = this.meta(), cm = meta[uid] = meta[uid] || {};
                const had = (cm.pins || []).includes(m.id);
                cm.pins = (cm.pins || []).filter(x => x !== m.id);
                if (!had) cm.pins.unshift(m.id);
                cm.pins = cm.pins.slice(0, 10);
                this.put(this.key('chat_meta'), meta);
                return await this.open(uid);
            }
            case 'chat_fav': { const uid = str(input.uid).toLowerCase(), m = this.msgOf(uid, input.ref); let f = this.favs(); const had = f.some(x => x.conv === uid && x.id === m.id); f = f.filter(x => !(x.conv === uid && x.id === m.id)); if (!had) f.unshift({ conv: uid, id: m.id, at: Date.now() }); this.put(this.key('chat_favs'), f.slice(0, 300)); return await this.open(uid); }
            case 'chat_favs': {
                const c = this.convs(), names = {};
                try { for (const f of this.app.vrc.friendList()) names[f.id] = f.name; } catch (e) { /* egal */ }
                return { items: this.favs().map(f => { const m = (c[f.conv] || []).find(x => x.id === f.id); return m ? { conv: f.conv, name: names[f.conv] || '', msg: m } : null; }).filter(Boolean) };
            }
            case 'chat_prefs': { const p = this.prefs(); if (input.receipts !== undefined) p.receipts = input.receipts === '1' || input.receipts === true; this.put(this.key('chat_prefs'), p); return { prefs: p, msg: 'Gespeichert.' }; }
            case 'chat_devices': {
                const dev = await this.device(), mine = (await this.call('devices', { uid: this.me().account.vrc_id })).devices;
                return { device: dev.id, items: mine.map(d => ({ device: d.device, created: int(d.created), last_seen: int(d.last_seen), current: d.device === dev.id })) };
            }
            case 'chat_device_remove': {
                const dev = await this.device();
                if (str(input.device) === dev.id) throw new UserError('Dieses Gerät kann sich nicht selbst entfernen.');
                await this.call('remove', { device: str(input.device) });
                return Object.assign(await this.action('chat_devices', {}), { msg: 'Gerät entfernt – es bekommt keine Nachrichten mehr.' });
            }
            case 'chat_clear': { const c = this.convs(); delete c[str(input.uid).toLowerCase()]; this.put(this.key('chat_msgs'), c); return { items: this.list() }; }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Chat };
