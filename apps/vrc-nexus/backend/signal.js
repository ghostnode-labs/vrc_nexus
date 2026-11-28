'use strict';
/*
 * Nexus-Privat-Chat mit der offiziellen Signal-Bibliothek (@signalapp/libsignal-client, Signal Foundation, AGPL-3.0-only).
 * Protokoll „signal-v1“: PQXDH (X25519 + Kyber/ML-KEM) für den Sitzungsaufbau, Double Ratchet (inkl. SPQR) für jede Nachricht –
 * alles in libsignal, hier liegen nur die Speicher (Stores) und die Verbindung zum Nexus-Briefkasten (nexuschat.php).
 *
 * - Die Bibliothek ist ein natives Node-API-Modul. Wo es nicht geladen werden kann (Android-WebView, Web-Nexus),
 *   bleibt available() = false und der Chat nutzt weiter „nexus-v1“ (backend/e2ee.js).
 * - Jedes Gerät hat eine eigene libsignal-Identität. Sie ist an die bisherige Nexus-Geräte-Identität (Ed25519, ergibt die
 *   Geräte-ID) gebunden: bind = Ed25519-Signatur über „nexus-signal-v1“ ‖ libsignal-Identität. Die Gegenseite (und der Server)
 *   prüfen diese Bindung, bevor eine Sitzung aufgebaut oder angenommen wird – so bleibt die bisherige Verifizierung gültig.
 * - Alle privaten Schlüssel, Sitzungen und gemerkten Identitäten liegen nur auf dem Gerät, verschlüsselt in der App-DB
 *   (gleicher Speicher wie e2ee: chat.get/put → safeStorage-verschlüsselte Einstellungen).
 */
const crypto = require('crypto');

const PROTO = 'signal-v1';
const BIND_CTX = Buffer.from('nexus-signal-v1');
const OPK_BATCH = 50, KYBER_BATCH = 10;
const ROTATE_MS = 7 * 86400000, KEEP_OLD_MS = 30 * 86400000;
const b64 = b => Buffer.from(b).toString('base64');
const unb64 = s => Buffer.from(String(s || ''), 'base64');
const RAW_E = Buffer.from('302a300506032b6570032100', 'hex');   // SPKI-Präfix Ed25519

let libP = null;
/** libsignal laden (einmalig, asynchron – das Paket ist ein ES-Modul). null = auf diesem Gerät nicht verfügbar. */
function load() {
    if (process.env.NEXUS_NO_LIBSIGNAL === '1') return Promise.resolve(null);
    if (!libP) libP = import('@signalapp/libsignal-client').then(m => (m && m.PrivateKey ? m : m && m.default && m.default.PrivateKey ? m.default : null)).catch(() => null);
    return libP;
}

/** Bindung der libsignal-Identität an die Nexus-Geräte-Identität (Ed25519) */
function bindSign(idSigPrivDer, sigIkB64) {
    return b64(crypto.sign(null, Buffer.concat([BIND_CTX, unb64(sigIkB64)]), crypto.createPrivateKey({ key: unb64(idSigPrivDer), format: 'der', type: 'pkcs8' })));
}
function bindVerify(ikSigB64, sigIkB64, bindB64) {
    try {
        const raw = unb64(ikSigB64), s = unb64(bindB64), ik = unb64(sigIkB64);
        if (raw.length !== 32 || s.length !== 64 || ik.length !== 33) return false;
        return crypto.verify(null, Buffer.concat([BIND_CTX, ik]), crypto.createPublicKey({ key: Buffer.concat([RAW_E, raw]), format: 'der', type: 'spki' }), s);
    } catch (e) { return false; }
}
/** Gerät der Gegenseite kann signal-v1 (laut veröffentlichter Liste) und die Bindung stimmt */
function remoteCapable(d) {
    return !!(d && Array.isArray(d.protos) && d.protos.includes(PROTO) && d.sig_ik && bindVerify(d.ik_sig, d.sig_ik, d.sig_bind));
}

class SignalProto {
    /** chat: Objekt mit get(k, d) / put(k, v) / key(k) (verschlüsselter Speicher je Nexus-Konto) */
    constructor(chat) { this.chat = chat; this.S = null; this.expect = {}; }
    async ready() { if (this.chat.noSignal) return null; if (!this.S) this.S = await load(); return this.S; }
    available() { return !!this.S && !this.chat.noSignal; }

    // ---------- Speicher ----------
    keys() { return this.chat.get(this.chat.key('chat_sig'), null); }
    saveKeys(k) { this.chat.put(this.chat.key('chat_sig'), k); }
    sess() { return this.chat.get(this.chat.key('chat_sigsess'), { sessions: {}, idents: {} }); }
    saveSess(s) { this.chat.put(this.chat.key('chat_sigsess'), s); }

    /** libsignal-Schlüssel dieses Geräts (beim ersten Mal erzeugen) – braucht das Nexus-Gerät für die Bindung */
    async device(nexusDev) {
        const S = await this.ready();
        if (!S) return null;
        let k = this.keys();
        if (!k) {
            const ik = S.IdentityKeyPair.generate();
            k = { v: 1, reg: 1 + crypto.randomInt(16380), ik: b64(ik.serialize()), pub: b64(ik.publicKey.serialize()),
                spks: {}, spk: 0, kybers: {}, lr: 0, oneTime: {}, opks: {}, next: { opk: 1, spk: 1, kyber: 1 }, usedLR: {}, pending: { opks: [], kybers: [] }, published: false };
            k.bind = bindSign(nexusDev.idSig.priv, k.pub);
            this.rotate(k, true);
            this.addOpks(k, OPK_BATCH);
            this.addKybers(k, KYBER_BATCH);
            this.saveKeys(k);
        }
        if (Date.now() - (k.spkAt || 0) > ROTATE_MS) { this.rotate(k, false); this.saveKeys(k); }
        return k;
    }
    identity(k) { return this.S.IdentityKeyPair.deserialize(unb64(k.ik)); }
    /** neuer signierter Pre-Key + neuer Kyber-„Last-Resort“-Schlüssel; alte bleiben 30 Tage für Nachrichten unterwegs */
    rotate(k, first) {
        const S = this.S, ik = this.identity(k), now = Date.now();
        const sid = k.next.spk++, sp = S.PrivateKey.generate();
        k.spks[sid] = { r: b64(S.SignedPreKeyRecord.new(sid, now, sp.getPublicKey(), sp, ik.privateKey.sign(sp.getPublicKey().serialize())).serialize()), at: now };
        k.spk = sid; k.spkAt = now;
        const kid = k.next.kyber++, kp = S.KEMKeyPair.generate();
        k.kybers[kid] = { r: b64(S.KyberPreKeyRecord.new(kid, now, kp, ik.privateKey.sign(kp.getPublicKey().serialize())).serialize()), at: now };
        k.lr = kid;
        if (!first) for (const m of [k.spks, k.kybers]) for (const [id, o] of Object.entries(m)) if (+id !== k.spk && +id !== k.lr && !k.oneTime[id] && now - o.at > KEEP_OLD_MS) delete m[id];
        k.published = false;
    }
    addOpks(k, n) {
        const S = this.S;
        for (let i = 0; i < n; i++) { const id = k.next.opk++, p = S.PrivateKey.generate(); k.opks[id] = b64(S.PreKeyRecord.new(id, p.getPublicKey(), p).serialize()); k.pending.opks.push({ id, pub: b64(p.getPublicKey().serialize()) }); }
    }
    addKybers(k, n) {
        const S = this.S, ik = this.identity(k), now = Date.now();
        for (let i = 0; i < n; i++) {
            const id = k.next.kyber++, kp = S.KEMKeyPair.generate(), sig = ik.privateKey.sign(kp.getPublicKey().serialize());
            k.kybers[id] = { r: b64(S.KyberPreKeyRecord.new(id, now, kp, sig).serialize()), at: now };
            k.oneTime[id] = 1;
            k.pending.kybers.push({ id, pub: b64(kp.getPublicKey().serialize()), sig: b64(sig) });
        }
    }
    /** Teil für nexuschat.php?a=publish (zusätzlich zum nexus-v1-Paket) */
    publishPart(k) {
        const rec = this.S.SignedPreKeyRecord.deserialize(unb64(k.spks[k.spk].r)), lr = this.S.KyberPreKeyRecord.deserialize(unb64(k.kybers[k.lr].r));
        return { reg: k.reg, ik: k.pub, bind: k.bind,
            spk: { id: k.spk, pub: b64(rec.publicKey().serialize()), sig: b64(rec.signature()) },
            kyber: { id: k.lr, pub: b64(lr.publicKey().serialize()), sig: b64(lr.signature()) },
            opks: k.pending.opks.slice(0, 100), kybers: k.pending.kybers.slice(0, 40) };
    }
    needsPublish(k) { return !!k && (!k.published || k.pending.opks.length > 0 || k.pending.kybers.length > 0); }
    published(k, part) {
        const o = new Set(part.opks.map(x => x.id)), y = new Set(part.kybers.map(x => x.id));
        k.pending.opks = k.pending.opks.filter(x => !o.has(x.id)); k.pending.kybers = k.pending.kybers.filter(x => !y.has(x.id));
        k.published = true;
    }
    /** Server meldet wenige übrige Einmal-Schlüssel → nachlegen */
    refill(k, counts) {
        let ch = false;
        if (counts && Number.isInteger(counts.opks) && counts.opks < 15 && k.pending.opks.length === 0) { this.addOpks(k, 40); ch = true; }
        if (counts && Number.isInteger(counts.kybers) && counts.kybers < 4 && k.pending.kybers.length === 0) { this.addKybers(k, 10); ch = true; }
        return ch;
    }

    // ---------- libsignal-Stores ----------
    stores() {
        const S = this.S, self = this;
        class Ident extends S.IdentityKeyStore {
            async getIdentityKey() { return self.identity(self.keys()).privateKey; }
            async getLocalRegistrationId() { return self.keys().reg; }
            async saveIdentity(addr, key) {
                const s = self.sess(), n = addr.name(), was = s.idents[n], now = b64(key.serialize());
                s.idents[n] = now; self.saveSess(s);
                return was && was !== now ? S.IdentityChange.ReplacedExisting : S.IdentityChange.NewOrUnchanged;
            }
            async isTrustedIdentity(addr, key) {
                // nur die an das Nexus-Gerät gebundene Identität ist vertrauenswürdig
                const n = addr.name(), want = self.expect[n] || self.sess().idents[n];
                return !!want && want === b64(key.serialize());
            }
            async getIdentity(addr) { const v = self.sess().idents[addr.name()]; return v ? S.PublicKey.deserialize(unb64(v)) : null; }
        }
        class Sess extends S.SessionStore {
            async saveSession(addr, rec) { const s = self.sess(); s.sessions[addr.name()] = b64(rec.serialize()); self.saveSess(s); }
            async getSession(addr) { const v = self.sess().sessions[addr.name()]; return v ? S.SessionRecord.deserialize(unb64(v)) : null; }
            async getExistingSessions(list) { const s = self.sess(); return list.map(a => s.sessions[a.name()]).filter(Boolean).map(v => S.SessionRecord.deserialize(unb64(v))); }
        }
        class Pre extends S.PreKeyStore {
            async savePreKey(id, rec) { const k = self.keys(); k.opks[id] = b64(rec.serialize()); self.saveKeys(k); }
            async getPreKey(id) { const v = self.keys().opks[id]; if (!v) throw new Error('Einmal-Pre-Key schon verbraucht (Wiederholung?).'); return S.PreKeyRecord.deserialize(unb64(v)); }
            async removePreKey(id) { const k = self.keys(); delete k.opks[id]; self.saveKeys(k); }
        }
        class Signed extends S.SignedPreKeyStore {
            async saveSignedPreKey(id, rec) { const k = self.keys(); k.spks[id] = { r: b64(rec.serialize()), at: Date.now() }; self.saveKeys(k); }
            async getSignedPreKey(id) { const v = self.keys().spks[id]; if (!v) throw new Error('Unbekannter signierter Pre-Key.'); return S.SignedPreKeyRecord.deserialize(unb64(v.r)); }
        }
        class Kyber extends S.KyberPreKeyStore {
            async saveKyberPreKey(id, rec) { const k = self.keys(); k.kybers[id] = { r: b64(rec.serialize()), at: Date.now() }; self.saveKeys(k); }
            async getKyberPreKey(id) { const v = self.keys().kybers[id]; if (!v) throw new Error('Kyber-Pre-Key unbekannt oder schon verbraucht.'); return S.KyberPreKeyRecord.deserialize(unb64(v.r)); }
            async markKyberPreKeyUsed(id, spkId, baseKey) {
                const k = self.keys();
                if (k.oneTime[id]) { delete k.kybers[id]; delete k.oneTime[id]; }
                else {   // Last-Resort-Schlüssel bleibt, aber dieselbe Kombination darf nicht noch einmal angenommen werden
                    const tag = id + ':' + spkId + ':' + b64(baseKey.serialize());
                    if (k.usedLR[tag]) throw new Error('Pre-Key-Nachricht wurde wiederholt.');
                    k.usedLR[tag] = Date.now();
                    for (const [t, at] of Object.entries(k.usedLR)) if (Date.now() - at > KEEP_OLD_MS + ROTATE_MS) delete k.usedLR[t];
                }
                self.saveKeys(k);
            }
        }
        return { ident: new Ident(), sess: new Sess(), pre: new Pre(), signed: new Signed(), kyber: new Kyber() };
    }
    addr(name) { return this.S.ProtocolAddress.new(name, 1); }

    // ---------- Sitzungen ----------
    hasSession(name) {
        const v = this.sess().sessions[name];
        if (!v || !this.S) return false;
        try { return this.S.SessionRecord.deserialize(unb64(v)).hasCurrentState(); } catch (e) { return false; }
    }
    /** Sitzung aus einem Paket vom Server aufbauen (prüft Bindung an das Nexus-Gerät) */
    async start(name, local, remoteDev, b) {
        const S = this.S;
        if (!b || !remoteCapable(Object.assign({}, remoteDev, { sig_ik: b.ik, sig_bind: b.bind }))) throw new Error('Signal-Schlüssel nicht an das Gerät gebunden – Sitzung abgebrochen.');
        this.expect[name] = b.ik;
        const st = this.stores();
        const bundle = S.PreKeyBundle.new(b.reg, 1, b.opk ? b.opk.id : null, b.opk ? S.PublicKey.deserialize(unb64(b.opk.pub)) : null,
            b.spk.id, S.PublicKey.deserialize(unb64(b.spk.pub)), unb64(b.spk.sig), S.PublicKey.deserialize(unb64(b.ik)),
            b.kyber.id, S.KEMPublicKey.deserialize(unb64(b.kyber.pub)), unb64(b.kyber.sig));
        await S.processPreKeyBundle(bundle, this.addr(name), this.addr(local), st.sess, st.ident);
    }
    async encrypt(name, local, text) {
        const S = this.S, st = this.stores();
        const c = await S.signalEncrypt(Buffer.from(String(text), 'utf8'), this.addr(name), this.addr(local), st.sess, st.ident);
        return { p: PROTO, t: c.type(), m: b64(c.serialize()) };
    }
    /** entschlüsseln; expectIk = an das Absender-Gerät gebundene Identität (nur nötig für die erste Pre-Key-Nachricht) */
    async decrypt(name, local, env, expectIk) {
        const S = this.S, st = this.stores();
        if (expectIk) this.expect[name] = expectIk;
        const raw = unb64(env.m);
        let out;
        if (env.t === S.CiphertextMessageType.PreKey) out = await S.signalDecryptPreKey(S.PreKeySignalMessage.deserialize(raw), this.addr(name), this.addr(local), st.sess, st.ident, st.pre, st.signed, st.kyber);
        else if (env.t === S.CiphertextMessageType.Whisper) out = await S.signalDecrypt(S.SignalMessage.deserialize(raw), this.addr(name), this.addr(local), st.sess, st.ident);
        else throw new Error('Unbekannter Nachrichtentyp.');
        return Buffer.from(out).toString('utf8');
    }
    /** Signal-Sicherheitsnummer (60 Ziffern) zwischen diesem Gerät und einem Gerät der Gegenseite */
    safetyNumber(myUid, myIk, theirUid, theirIk) {
        const S = this.S;
        const f = S.Fingerprint.new(5200, 2, Buffer.from(String(myUid), 'utf8'), S.PublicKey.deserialize(unb64(myIk)), Buffer.from(String(theirUid), 'utf8'), S.PublicKey.deserialize(unb64(theirIk)));
        return f.displayableFingerprint().toString().match(/.{5}/g).join(' ');
    }
}

module.exports = { SignalProto, PROTO, load, bindSign, bindVerify, remoteCapable };
