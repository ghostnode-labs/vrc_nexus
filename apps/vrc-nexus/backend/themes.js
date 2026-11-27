'use strict';
/*
 * 8.0.5: 🎨 Eigene Themes + Themes-Marktplatz (GhostNode-Website, themes.php).
 *   • Ein Theme ist reine Farbdaten: 13 Farben als #rrggbb, hell/dunkel – kein CSS, kein Code (gleiche Prüfung wie die Website).
 *   • Selbst bauen (Editor in den Einstellungen), als Code „NXT1.…“ oder .json teilen und importieren.
 *   • Katalog von der Website ist mit Ed25519 signiert – gleicher Schlüssel wie der Plugin-Marktplatz (beim ersten Abruf gemerkt).
 */
const crypto = require('crypto');
const { str, cut, UserError } = require('./util');

const KEYS = ['bg', 'panel', 'panel2', 'accent', 'gold', 'green', 'purple', 'red', 'text', 'muted', 'strong', 'surface', 'line'];
const REQUIRED = ['bg', 'panel', 'accent', 'text', 'muted'];
const MAX = 30;
const base = () => String(process.env.NEXUS_MARKET_BASE || require('./servers').nexus()).replace(/\/+$/, '');

function lum(hex) {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const clean = s => str(s).replace(/[\x00-\x1f<>]/g, '').trim();

/** Theme prüfen und säubern (wirft UserError) */
function validate(t) {
    if (typeof t === 'string') { try { t = JSON.parse(t); } catch (e) { throw new UserError('Kein gültiges Theme (JSON erwartet).'); } }
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new UserError('Kein gültiges Theme.');
    const id = str(t.id).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(id)) throw new UserError('Theme-ID: 3–40 Zeichen a–z, 0–9 und Bindestrich.');
    const name = clean(t.name);
    if (name.length < 2 || name.length > 40) throw new UserError('Name: 2–40 Zeichen.');
    const c = t.colors && typeof t.colors === 'object' && !Array.isArray(t.colors) ? t.colors : {}, colors = {};
    for (const k of Object.keys(c)) if (!KEYS.includes(k)) throw new UserError('Unbekannter Farbwert „' + cut(k, 20) + '“.');
    for (const k of KEYS) {
        if (c[k] === undefined || c[k] === '') continue;
        const v = str(c[k]).trim().toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(v)) throw new UserError('Farbe „' + k + '“ muss #rrggbb sein.');
        colors[k] = v;
    }
    for (const k of REQUIRED) if (!colors[k]) throw new UserError('Farbe „' + k + '“ fehlt.');
    if (contrast(colors.text, colors.bg) < 4.5) throw new UserError('Text und Hintergrund haben zu wenig Kontrast (mind. 4,5 : 1).');
    return { format: 1, id, name, author: cut(clean(t.author), 40), scheme: t.scheme === 'light' ? 'light' : 'dark', colors };
}

class Themes {
    constructor(app) { this.app = app; this.index = null; this.at = 0; this.fetch = (u, o) => globalThis.fetch(u, o); }
    list() { try { const l = JSON.parse(this.app.db.setting('ui_themes', '[]')); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
    saveList(l) { this.app.db.setSetting('ui_themes', JSON.stringify(l.slice(0, MAX))); }
    activeId() { return str(this.app.db.setting('ui_theme_custom', '')); }
    active() { const id = this.activeId(); return id ? this.list().find(t => t.id === id) || null : null; }
    save(t, from) {
        const v = Object.assign(validate(t), from ? { from } : {});
        const l = this.list().filter(x => x.id !== v.id);
        if (l.length >= MAX) throw new UserError('Höchstens ' + MAX + ' eigene Themes – erst eins löschen.');
        l.unshift(v); this.saveList(l);
        return v;
    }
    use(id) {
        id = str(id);
        if (id && !this.list().some(t => t.id === id)) throw new UserError('Theme nicht gefunden.');
        this.app.db.setSetting('ui_theme_custom', id);
        return this.active();
    }
    del(id) { const l = this.list().filter(t => t.id !== str(id)); this.saveList(l); if (this.activeId() === str(id)) this.app.db.setSetting('ui_theme_custom', ''); }
    /** Teilen: kurzer Code „NXT1.<base64url(JSON)>“ */
    code(id) { const t = this.list().find(x => x.id === str(id)); if (!t) throw new UserError('Theme nicht gefunden.'); const { from, ...pure } = t; return { code: 'NXT1.' + Buffer.from(JSON.stringify(pure)).toString('base64url'), json: JSON.stringify(pure, null, 2) }; }
    parse(input) {
        const s = str(input).trim();
        if (s.startsWith('NXT1.')) { try { return JSON.parse(Buffer.from(s.slice(5), 'base64url').toString('utf8')); } catch (e) { throw new UserError('Theme-Code ist beschädigt.'); } }
        return s;
    }
    // ---------- Marktplatz ----------
    verify(j) {
        if (!j || typeof j.index !== 'string' || typeof j.sig !== 'string' || typeof j.key !== 'string') throw new UserError('Themes: Antwort unvollständig.');
        const raw = Buffer.from(j.key, 'base64');
        if (raw.length !== 32) throw new UserError('Themes: ungültiger Schlüssel.');
        const pin = str(this.app.db.setting('market_key', ''));   // gleicher Schlüssel wie der Plugin-Marktplatz
        if (pin && pin !== j.key) throw new UserError('Themes: Der Signaturschlüssel hat sich geändert – Katalog abgelehnt (Plugins → „Schlüssel neu lernen“, falls angekündigt).');
        const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
        if (!crypto.verify(null, Buffer.from(j.index, 'utf8'), key, Buffer.from(j.sig, 'base64'))) throw new UserError('Themes: Signatur ungültig – Katalog abgelehnt.');
        if (!pin) this.app.db.setSetting('market_key', j.key);
        const idx = JSON.parse(j.index);
        if (!idx || idx.format !== 1 || idx.kind !== 'themes' || !Array.isArray(idx.themes)) throw new UserError('Themes: unbekanntes Katalog-Format.');
        return idx;
    }
    async market(force) {
        if (!force && this.index && Date.now() - this.at < 120000) return this.index;
        let r;
        try { r = await this.fetch(base() + '/themes.php?api=index', { signal: AbortSignal.timeout(10000), cache: 'no-store' }); } catch (e) { throw new UserError('Themes-Marktplatz nicht erreichbar.'); }
        if (!r.ok) throw new UserError('Themes-Marktplatz: HTTP ' + r.status);
        const idx = this.verify(await r.json());
        const items = [];
        for (const t of idx.themes.slice(0, 500)) { try { items.push(Object.assign(validate(t), { installs: Number(t.installs) || 0 })); } catch (e) { /* ungültige still überspringen */ } }
        this.index = items; this.at = Date.now();
        return items;
    }
    async install(id) {
        const items = await this.market(false);
        const t = items.find(x => x.id === str(id));
        if (!t) throw new UserError('Theme nicht im Katalog.');
        const v = this.save(t, 'market');
        this.use(v.id);
        this.fetch(base() + '/themes.php?api=got&id=' + encodeURIComponent(v.id), { signal: AbortSignal.timeout(5000) }).catch(() => {});   // nur Zähler, ohne Konto
        return v;
    }
    state() { return { items: this.list(), active: this.activeId(), keys: KEYS, required: REQUIRED }; }
    async action(act, input) {
        switch (act) {
            case 'theme_list': return this.state();
            case 'theme_active': return { theme: this.active() };
            case 'theme_save': { const t = this.save(input.theme); if (input.use === '1') this.use(t.id); return Object.assign(this.state(), { msg: '🎨 „' + t.name + '“ gespeichert.' }); }
            case 'theme_use': { const t = this.use(input.id); return Object.assign(this.state(), { theme: t, msg: t ? '🎨 ' + t.name : 'Eingebautes Theme.' }); }
            case 'theme_del': this.del(input.id); return Object.assign(this.state(), { msg: 'Gelöscht.' });
            case 'theme_code': return this.code(input.id);
            case 'theme_import': { const t = this.save(this.parse(input.code), 'import'); this.use(t.id); return Object.assign(this.state(), { theme: t, msg: '🎨 „' + t.name + '“ übernommen.' }); }
            case 'theme_market': return { items: await this.market(input.refresh === '1'), have: this.list().map(t => t.id) };
            case 'theme_install': { const t = await this.install(input.id); return Object.assign(this.state(), { theme: t, msg: '🎨 „' + t.name + '“ installiert.' }); }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { Themes, validate, contrast, KEYS };
