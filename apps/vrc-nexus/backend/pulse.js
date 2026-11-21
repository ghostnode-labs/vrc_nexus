'use strict';
/* VRC Nexus – 📰 Nexus Pulse (3.9): News & Discovery.
 * Quellen: offizielle VRChat-Ankündigungen und Patchnotes (Steam-News der App 438100), r/VRChat (Reddit-RSS, neu/beliebt + Kommentare),
 * optional r/VRchatERP – nur mit 18+-Freischaltung UND eigenem Schalter. Online-Abruf erst nach Opt-in (pulse.on).
 * Favoriten bleiben lokal in der Datenbank. Keine Anmeldung bei Reddit/Steam, nur öffentliche Feeds. */
const { UID } = require('./vrchat');
const { UserError } = require('./util');

const base = (env, def) => (process.env[env] || def).replace(/\/+$/, '');
const UA = () => 'VRC-Nexus/' + require('./vrchat').VERSION + ' (mail@xxloonaxx.de)';
const TTL = 15 * 60 * 1000;
const str = v => (v == null ? '' : String(v));
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const unent = s => str(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m));
const plain = s => unent(str(s).replace(/<[^>]*>/g, ' ').replace(/\[\/?[a-z0-9*]+(=[^\]]*)?\]/gi, ' ')).replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const httpsOnly = u => (/^https:\/\//i.test(str(u)) ? str(u) : '');

// Kategorie aus dem Titel (Steam-News): Patchnotes, Developer-Update, Sicherheit, Creator-Economy, sonst News
function kindOf(title) {
    const t = str(title);
    if (/security|sicherheit|scam|phishing|exploit|malware|vulnerab|account (theft|safety)/i.test(t)) return 'security';
    if (/dev(eloper)? update|developer update|dev blog/i.test(t)) return 'dev';
    if (/creator|economy|marketplace|vrchat\+|credits|store/i.test(t)) return 'creator';
    if (/patch|release|hotfix|build \d|^\d{4}\.\d|open beta|update \d/i.test(t)) return 'patch';
    return 'news';
}

function parseSteam(j) {
    const items = (j && j.appnews && j.appnews.newsitems) || [];
    return items.map(n => {
        const raw = str(n.contents);
        let img = (/\[img\](.*?)\[\/img\]/i.exec(raw) || /<img[^>]+src="([^"]+)"/i.exec(raw) || [])[1] || '';
        img = img.replace('{STEAM_CLAN_IMAGE}', 'https://clan.akamai.steamstatic.com/images');
        return { id: 'steam:' + str(n.gid), src: 'vrchat', kind: kindOf(n.title), title: cut(plain(n.title), 200), url: httpsOnly(n.url), author: cut(plain(n.author) || 'VRChat', 60),
            ts: Number(n.date) || 0, text: cut(plain(raw.replace(/\[img\][\s\S]*?\[\/img\]/gi, ' ')), 400), img: httpsOnly(img), comments: 0 };
    }).filter(x => x.url && x.title);
}

// Reddit-Atom (…/.rss): Einträge mit Titel, Link, Autor, Zeit und HTML-Inhalt (Vorschaubild)
function parseAtom(xml, src) {
    const out = [];
    for (const m of str(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const e = m[1], tag = t => (new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>').exec(e) || [])[1] || '';
        const id = plain(tag('id')), link = (/<link[^>]*href="([^"]+)"/.exec(e) || [])[1] || '';
        const html = unent(tag('content'));
        const img = (/<img[^>]+src="([^"]+)"/i.exec(html) || [])[1] || '';
        const author = plain(tag('name')).replace(/^\/?u\//, '');
        const ts = Math.floor(Date.parse(plain(tag('updated')) || plain(tag('published'))) / 1000) || 0;
        const body = plain(html.replace(/submitted by[\s\S]*$/i, '').replace(/<table[\s\S]*?<\/table>/i, ''));
        out.push({ id: 'reddit:' + id, src, kind: src, title: cut(plain(tag('title')), 300), url: httpsOnly(unent(link)), author: cut(author, 60), ts, text: cut(body, 400), img: httpsOnly(unent(img)), comments: 1 });
    }
    return out.filter(x => x.url && x.title);
}

class Pulse {
    constructor(app) {
        this.app = app;
        this.cache = new Map();
        app.db.prepare('CREATE TABLE IF NOT EXISTS pulse_favs (user_id INTEGER NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (user_id, id))').run();
    }
    get db() { return this.app.db; }
    erpAllowed() { const s = this.app.settings.all(); return !!s['pulse.erp'] && !!(this.app.nsfw && this.app.nsfw.access().unlocked); }
    async get(url, kind) {
        const c = this.cache.get(url);
        if (c && Date.now() - c.t < TTL) return c.v;
        let r;
        try { r = await fetch(url, { headers: { 'User-Agent': UA(), Accept: kind === 'json' ? 'application/json' : 'application/atom+xml, application/xml, text/xml' }, redirect: 'follow', signal: AbortSignal.timeout(15000) }); }
        catch (e) { throw new UserError('Quelle nicht erreichbar.'); }
        if (!r.ok) throw new UserError('Quelle antwortet mit HTTP ' + r.status + '.');
        const v = kind === 'json' ? await r.json() : await r.text();
        this.cache.set(url, { t: Date.now(), v });
        return v;
    }
    async source(src, sort) {
        const RD = base('NEXUS_REDDIT_BASE', 'https://www.reddit.com'), ST = base('NEXUS_STEAMNEWS_BASE', 'https://api.steampowered.com');
        const so = sort === 'top' ? 'top/.rss?t=week&limit=30' : sort === 'hot' ? 'hot/.rss?limit=30' : 'new/.rss?limit=30';
        if (src === 'vrchat') return parseSteam(await this.get(ST + '/ISteamNews/GetNewsForApp/v2/?appid=438100&count=30&maxlength=1200&format=json', 'json'));
        if (src === 'reddit') return parseAtom(await this.get(RD + '/r/VRChat/' + so, 'xml'), 'reddit');
        if (src === 'erp') { if (!this.erpAllowed()) throw new UserError('r/VRchatERP braucht die 18+-Freischaltung und den Schalter in den Einstellungen.'); return parseAtom(await this.get(RD + '/r/VRchatERP/' + so, 'xml'), 'erp'); }
        throw new UserError('Unbekannte Quelle.');
    }
    favIds() { return new Set(this.db.prepare('SELECT id FROM pulse_favs WHERE user_id = ?').column(UID)); }
    async action(act, input) {
        const s = this.app.settings.all();
        if (act === 'pulse_state') return { on: !!s['pulse.on'], erp: this.erpAllowed(), erp_possible: !!(this.app.nsfw && this.app.nsfw.access().unlocked) };
        if (act === 'pulse_enable') { this.app.settings.save({ 'pulse.on': input.on === '1' }); return { on: input.on === '1' }; }
        if (act === 'pulse_favs') return { items: this.db.prepare('SELECT data FROM pulse_favs WHERE user_id = ? ORDER BY ts DESC LIMIT 300').column(UID).map(d => Object.assign(JSON.parse(d), { fav: true })) };
        if (act === 'pulse_fav') {
            const id = str(input.id).slice(0, 200);
            if (!id) throw new UserError('Fehlende ID.');
            if (input.on !== '1') { this.db.prepare('DELETE FROM pulse_favs WHERE user_id = ? AND id = ?').run(UID, id); return { fav: false }; }
            let it; try { it = JSON.parse(str(input.item)); } catch (e) { throw new UserError('Ungültiger Eintrag.'); }
            const clean = { id, src: str(it.src).slice(0, 20), kind: str(it.kind).slice(0, 20), title: cut(str(it.title), 300), url: httpsOnly(it.url), author: cut(str(it.author), 60), ts: Number(it.ts) || 0, text: cut(str(it.text), 400), img: httpsOnly(it.img), comments: it.comments ? 1 : 0 };
            if (!clean.url) throw new UserError('Ungültiger Link.');
            if (clean.src === 'erp' && !this.erpAllowed()) throw new UserError('Nicht freigeschaltet.');
            this.db.prepare('INSERT OR REPLACE INTO pulse_favs (user_id, id, data, ts) VALUES (?, ?, ?, ?)').run(UID, id, JSON.stringify(clean), Math.floor(Date.now() / 1000));
            return { fav: true };
        }
        if (!s['pulse.on']) throw new UserError('Nexus Pulse ist aus. Bitte zuerst einschalten.');
        if (act === 'pulse_feed') {
            const src = ['vrchat', 'reddit', 'erp'].includes(input.src) ? input.src : 'vrchat';
            if (input.force === '1') for (const [k, c] of this.cache) if (Date.now() - c.t > 60000) this.cache.delete(k);   // ↻ höchstens 1×/min neu
            let items = await this.source(src, str(input.sort));
            if (src === 'vrchat' && input.kind && input.kind !== 'all') items = items.filter(x => x.kind === input.kind);
            const fav = this.favIds();
            return { items: items.map(x => Object.assign(x, { fav: fav.has(x.id) })), fetched: Date.now() };
        }
        if (act === 'pulse_comments') {   // Kommentare eines Reddit-Beitrags (öffentlicher RSS des Beitrags)
            const url = str(input.url);
            const m = /^https:\/\/(?:www\.|old\.)?reddit\.com\/r\/(VRChat|VRchatERP)\/comments\/([a-z0-9]{2,12})\//i.exec(url);
            if (!m) throw new UserError('Kein Reddit-Beitrag.');
            if (/erp/i.test(m[1]) && !this.erpAllowed()) throw new UserError('Nicht freigeschaltet.');
            const list = parseAtom(await this.get(base('NEXUS_REDDIT_BASE', 'https://www.reddit.com') + '/r/' + m[1] + '/comments/' + m[2] + '/.rss?limit=40', 'xml'), 'comment');
            return { items: list.slice(1, 41).map(c => ({ author: c.author, ts: c.ts, text: c.text, url: c.url })) };   // erster Eintrag = Beitrag selbst
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Pulse, parseSteam, parseAtom, kindOf };
