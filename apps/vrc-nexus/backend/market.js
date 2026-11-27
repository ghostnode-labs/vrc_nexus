'use strict';
/*
 * 4.4: Plugin-Marktplatz – Katalog von der GhostNode-Website (market.php?api=index).
 *  - Der Katalog ist mit Ed25519 signiert. Den öffentlichen Schlüssel merkt sich die App beim ersten Abruf;
 *    ändert er sich später, wird der Katalog abgelehnt (Schutz vor untergeschobenen Katalogen).
 *  - Jedes Paket wird nur von der Marktplatz-Adresse geladen, auf Größe und SHA-256 geprüft und läuft danach durch
 *    die normale Plugin-Prüfung (plugin.json, Pfade, Rechte) – die Rechte bestätigt der Nutzer wie bei einer .nxp-Datei.
 */
const crypto = require('crypto');
const { str, UserError } = require('./util');

const MAX_PACK = 6 * 1024 * 1024;
const base = () => String(process.env.NEXUS_MARKET_BASE || require('./servers').nexus()).replace(/\/+$/, '');
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
/** „>=3.6.0“ o. Ä. gegen die eigene Version prüfen */
const fits = (req, mine) => { const m = /^\s*>=?\s*(\d+\.\d+\.\d+)/.exec(str(req)); return !m || cmpVer(mine, m[1]) >= 0; };

class Market {
    constructor(app) { this.app = app; this.index = null; this.at = 0; this.fetch = (u, o) => globalThis.fetch(u, o); }
    plugins() { return this.app.plugins; }
    pinned() { return str(this.app.db.setting('market_key', '')); }

    verify(j) {
        if (!j || typeof j.index !== 'string' || typeof j.sig !== 'string' || typeof j.key !== 'string') throw new UserError('Marktplatz: Antwort unvollständig.');
        const raw = Buffer.from(j.key, 'base64');
        if (raw.length !== 32) throw new UserError('Marktplatz: ungültiger Schlüssel.');
        const pin = this.pinned();
        if (pin && pin !== j.key) throw new UserError('Marktplatz: Der Signaturschlüssel hat sich geändert – Katalog abgelehnt. Wenn der Wechsel angekündigt war: in den Plugin-Einstellungen „Schlüssel neu lernen“.');
        const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
        if (!crypto.verify(null, Buffer.from(j.index, 'utf8'), key, Buffer.from(j.sig, 'base64'))) throw new UserError('Marktplatz: Signatur ungültig – Katalog abgelehnt.');
        if (!pin) this.app.db.setSetting('market_key', j.key);   // beim ersten Mal merken
        const idx = JSON.parse(j.index);
        if (!idx || idx.format !== 1 || !Array.isArray(idx.plugins)) throw new UserError('Marktplatz: unbekanntes Katalog-Format.');
        return idx;
    }
    async load(force) {
        if (!force && this.index && Date.now() - this.at < 120000) return this.index;
        let r;
        try { r = await this.fetch(base() + '/market.php?api=index', { signal: AbortSignal.timeout(10000), cache: 'no-store' }); } catch (e) { throw new UserError('Marktplatz nicht erreichbar.'); }
        if (!r.ok) throw new UserError('Marktplatz: HTTP ' + r.status);
        this.index = this.verify(await r.json());
        this.at = Date.now();
        return this.index;
    }
    /** Katalog mit Installations- und Update-Status */
    async list(force) {
        const idx = await this.load(force), mine = require('./vrchat').VERSION, pl = this.plugins();
        const items = idx.plugins.filter(p => /^[a-z0-9][a-z0-9-]{1,39}$/.test(str(p.id)) && [].concat(p.apps || ['vrc']).includes('vrc')).map(p => {   // 8.1: gemeinsamer Marktplatz, nur Plugins für VRC Nexus
            const m = pl && pl.manifest(p.id);
            return { id: p.id, name: str(p.name), version: str(p.version), author: str(p.author), description: str(p.description), icon: str(p.icon) || '🧩', category: str(p.category),
                permissions: Array.isArray(p.permissions) ? p.permissions.map(str) : [], size: Number(p.size) || 0, downloads: Number(p.downloads) || 0, updated: Number(p.updated) || 0,
                changelog: str(p.changelog), homepage: /^https:\/\//.test(str(p.homepage)) ? str(p.homepage) : '', fits: fits(p.nexus, mine), nexus: str(p.nexus), apps: [].concat(p.apps || ['vrc']).map(str), tags: [].concat(p.tags || []).map(str).slice(0, 8),
                installed: m ? m.version : '', update: !!(m && cmpVer(p.version, m.version) > 0) };
        });
        return { items, updates: items.filter(i => i.update).length, generated: idx.generated, key: this.pinned().slice(0, 12) };
    }
    /** Paket laden + prüfen → Ergebnis wie plug_inspect (Rechte-Dialog in der Oberfläche) */
    async get(id) {
        const idx = await this.load();
        const p = idx.plugins.find(x => x.id === str(id));
        if (!p || ![].concat(p.apps || ['vrc']).includes('vrc')) throw new UserError('Plugin nicht im Marktplatz gefunden (oder nur für D2 Nexus).');
        if (!fits(p.nexus, require('./vrchat').VERSION)) throw new UserError('Dieses Plugin braucht VRC Nexus ' + str(p.nexus) + ' – bitte zuerst die App aktualisieren.');
        const url = str(p.url);
        if (!url.startsWith(base() + '/market.php?dl=')) throw new UserError('Marktplatz: Paket-Adresse nicht erlaubt.');
        if (!(Number(p.size) > 0 && Number(p.size) <= MAX_PACK)) throw new UserError('Marktplatz: Paketgröße unzulässig.');
        let r;
        try { r = await this.fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' }); } catch (e) { throw new UserError('Paket konnte nicht geladen werden.'); }
        if (!r.ok) throw new UserError('Paket: HTTP ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > MAX_PACK || buf.length !== Number(p.size)) throw new UserError('Paket: Größe stimmt nicht mit dem Katalog überein.');
        if (crypto.createHash('sha256').update(buf).digest('hex') !== str(p.sha256).toLowerCase()) throw new UserError('Paket: Prüfsumme stimmt nicht – Installation abgebrochen.');
        const res = this.plugins().inspect(buf);
        if (res.manifest.id !== p.id || res.manifest.version !== p.version) throw new UserError('Paket passt nicht zum Katalog-Eintrag.');
        return Object.assign(res, { market: true });
    }
    relearn() { this.app.db.setSetting('market_key', ''); this.index = null; return { ok: true, msg: 'Der Marktplatz-Schlüssel wird beim nächsten Abruf neu gelernt.' }; }
}

module.exports = { Market, fits, cmpVer };
