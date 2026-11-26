'use strict';
/*
 * GhostNode-Discord-Bot für VRC Nexus – ohne Pakete (Node ≥ 22: eingebauter WebSocket-Client und fetch).
 *  - Gateway (WebSocket) mit Heartbeat, Wiederaufnahme (RESUME) und Neuverbindung mit Wartezeit
 *  - Slash-Befehle: /status, /release, /poster, /marktplatz, /puls, /hilfe
 *  - Neue VRC-Nexus-Releases automatisch in einen Kanal posten
 * Das Token steht nur in der Umgebungsvariable DISCORD_TOKEN (nie im Repo). Siehe README.md.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const env = (k, d = '') => String(process.env[k] || d).trim();
const CFG = {
    token: env('DISCORD_TOKEN'), app: env('DISCORD_APP_ID'), guild: env('DISCORD_GUILD_ID'),
    api: env('DISCORD_API', 'https://discord.com/api/v10').replace(/\/+$/, ''), gateway: env('DISCORD_GATEWAY', 'wss://gateway.discord.gg'),
    nexus: env('NEXUS_BASE', 'https://ghostnode-labs.dev').replace(/\/+$/, ''), relay: env('HYPERATE_RELAY', 'https://hr.ghostnode-labs.dev').replace(/\/+$/, ''),
    repo: env('GITHUB_REPO', 'ghostnode-labs/vrc_nexus'), github: env('GITHUB_API', 'https://api.github.com').replace(/\/+$/, ''),
    releaseChannel: env('RELEASE_CHANNEL_ID'), state: env('BOT_STATE', path.join(__dirname, 'bot-state.json')), port: Number(env('PORT')) || 0,
};
const INTENT_GUILDS = 1 << 0;   // reicht für Slash-Befehle; keine privilegierten Intents nötig
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------- REST ----------------
async function rest(method, route, body, tries = 0) {
    const r = await fetch(CFG.api + route, { method, headers: { Authorization: 'Bot ' + CFG.token, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (ghostnode, 1.0)' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (r.status === 429 && tries < 3) {   // Rate-Limit: warten und erneut
        let wait = 1; try { wait = Number((await r.json()).retry_after) || 1; } catch (e) { /* egal */ }
        await new Promise(res => setTimeout(res, Math.min(30, wait) * 1000));
        return rest(method, route, body, tries + 1);
    }
    if (r.status === 204) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error('Discord ' + method + ' ' + route.split('?')[0] + ': HTTP ' + r.status + (j && j.message ? ' – ' + j.message : ''));
    return j;
}

// ---------------- Befehle ----------------
const COMMANDS = [
    { name: 'status', description: 'Status von VRC Nexus und den GhostNode-Diensten' },
    { name: 'release', description: 'Neueste VRC-Nexus-Version mit Download' },
    { name: 'poster', description: 'Aktuelles Bild eines VRChat-Posters', options: [{ type: 3, name: 'name', description: 'Poster-Adresse (Slug), z. B. club-banner', required: true, max_length: 64 }] },
    { name: 'marktplatz', description: 'Plugins aus dem VRC-Nexus-Marktplatz', options: [{ type: 3, name: 'suche', description: 'Suchbegriff (optional)', required: false, max_length: 60 }] },
    { name: 'puls', description: 'Live-Puls über HypeRate (Device-ID aus der HypeRate-App)', options: [{ type: 3, name: 'id', description: 'HypeRate-Device-ID', required: true, max_length: 40 }] },
    { name: 'hilfe', description: 'Was der Bot kann' },
];
const COLOR = 0x38d5e6;
const getJson = async (url, ms = 8000) => { const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'ghostnode-bot' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const tagVer = t => String(t || '').replace(/^vrc-nexus-/, '').replace(/^v/, '');

async function latestRelease() {
    const j = await getJson(CFG.github + '/repos/' + CFG.repo + '/releases/latest');
    return { tag: String(j.tag_name || ''), version: tagVer(j.tag_name), url: String(j.html_url || ''), date: String(j.published_at || ''), body: String(j.body || '') };
}
async function up(url) { try { const r = await fetch(url, { signal: AbortSignal.timeout(6000) }); return r.status < 500; } catch (e) { return false; } }

const HANDLERS = {
    async status() {
        const [rel, site, hr] = await Promise.all([latestRelease().catch(() => null), up(CFG.nexus + '/'), getJson(CFG.relay + '/health', 6000).catch(() => null)]);
        return { embeds: [{ title: '📡 GhostNode-Status', color: COLOR, fields: [
            { name: 'VRC Nexus', value: rel ? '**' + rel.version + '**' : '–', inline: true },
            { name: 'Website & Dienste', value: site ? '🟢 erreichbar' : '🔴 nicht erreichbar', inline: true },
            { name: 'HypeRate-Weiterleitung', value: hr && hr.ok ? '🟢 läuft (' + (hr.clients || 0) + ' verbunden)' : hr ? '🟡 ohne Schlüssel' : '🔴 nicht erreichbar', inline: true }] }] };
    },
    async release() {
        const rel = await latestRelease();
        const notes = rel.body.replace(/\r/g, '').split('\n').filter(l => l.trim()).slice(0, 12).join('\n').slice(0, 1500);
        return { embeds: [{ title: '🥽 VRC Nexus ' + rel.version, url: rel.url, color: COLOR, description: notes || 'Neue Version verfügbar.', footer: { text: 'Die App aktualisiert sich automatisch.' } }] };
    },
    async poster(o) {
        const slug = String(o.name || '').trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) return { content: '⚠ Ungültiger Poster-Name.', flags: 64 };
        const url = CFG.nexus + '/p.php/' + slug + '.png';
        const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (!r || !r.ok) return { content: '⚠ Poster „' + slug + '“ nicht gefunden oder nicht öffentlich.', flags: 64 };
        return { embeds: [{ title: '🖼 ' + slug, url, color: COLOR, image: { url: url + '?t=' + Math.floor(Date.now() / 60000) } }] };
    },
    async marktplatz(o) {
        const j = await getJson(CFG.nexus + '/market.php?api=index');
        const idx = JSON.parse(j.index), q = String(o.suche || '').toLowerCase();
        const list = idx.plugins.filter(p => !q || (p.name + ' ' + p.description).toLowerCase().includes(q)).slice(0, 10);
        if (!list.length) return { content: q ? 'Kein Plugin zu „' + q + '“ gefunden.' : 'Im Marktplatz sind noch keine Plugins.', flags: 64 };
        return { embeds: [{ title: '🧩 Plugin-Marktplatz', url: CFG.nexus + '/market.php', color: COLOR,
            description: list.map(p => (p.icon || '🧩') + ' **' + p.name + '** ' + p.version + (p.author ? ' – ' + p.author : '') + '\n' + String(p.description || '').slice(0, 120)).join('\n\n').slice(0, 3800),
            footer: { text: 'Installieren in der App: Plugins → Marktplatz' } }] };
    },
    async puls(o) {
        const id = String(o.id || '').trim();
        if (!/^[A-Za-z0-9_-]{2,40}$/.test(id)) return { content: '⚠ Ungültige Device-ID.', flags: 64 };
        const hr = await firstHeartRate(id, 8000);
        return hr ? { content: '💓 **' + hr + ' bpm**' } : { content: 'Kein aktueller Puls – läuft die Messung in der HypeRate-App?', flags: 64 };
    },
    async hilfe() {
        return { embeds: [{ title: '🤖 GhostNode-Bot', color: COLOR, description: COMMANDS.map(c => '`/' + c.name + '` – ' + c.description).join('\n') }], flags: 64 };
    },
};
/** erster Pulswert aus der HypeRate-Weiterleitung (Server-Sent Events) */
async function firstHeartRate(id, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
        const r = await fetch(CFG.relay + '/hr/' + encodeURIComponent(id), { signal: ctl.signal, headers: { Accept: 'text/event-stream' } });
        if (!r.ok || !r.body) return 0;
        const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
        for (;;) {
            const { value, done } = await rd.read(); if (done) return 0;
            buf += dec.decode(value, { stream: true });
            const m = /data:\s*(\{[^\n]*"hr":\s*(\d+)[^\n]*\})/.exec(buf);
            if (m) return Number(m[2]);
        }
    } catch (e) { return 0; } finally { clearTimeout(t); ctl.abort(); }
}

async function onInteraction(it) {
    if (it.type !== 2 || !it.data) return;   // nur Slash-Befehle
    const name = it.data.name, opts = Object.fromEntries((it.data.options || []).map(o => [o.name, o.value]));
    const h = HANDLERS[name];
    const reply = data => rest('POST', '/interactions/' + it.id + '/' + it.token + '/callback', { type: 4, data: Object.assign({ allowed_mentions: { parse: [] } }, data) });
    if (!h) return reply({ content: 'Unbekannter Befehl.', flags: 64 });
    // länger dauernde Befehle: erst „denkt nach …“, dann Antwort nachreichen
    await rest('POST', '/interactions/' + it.id + '/' + it.token + '/callback', { type: 5, data: { flags: ['hilfe'].includes(name) ? 64 : 0 } });
    let data;
    try { data = await h(opts); } catch (e) { log('Befehl', name, 'Fehler:', e.message); data = { content: '⚠ Gerade nicht möglich – bitte später nochmal.' }; }
    await rest('PATCH', '/webhooks/' + CFG.app + '/' + it.token + '/messages/@original', Object.assign({ allowed_mentions: { parse: [] } }, data));
}

// ---------------- Release-Ankündigungen ----------------
const loadState = () => { try { return JSON.parse(fs.readFileSync(CFG.state, 'utf8')) || {}; } catch (e) { return {}; } };
const saveState = s => { try { fs.writeFileSync(CFG.state, JSON.stringify(s)); } catch (e) { log('Status nicht speicherbar:', e.message); } };
async function checkRelease() {
    if (!CFG.releaseChannel) return false;
    const rel = await latestRelease();
    const st = loadState();
    if (!rel.tag || st.lastRelease === rel.tag) return false;
    const first = !st.lastRelease;
    st.lastRelease = rel.tag; saveState(st);
    if (first) return false;   // beim allerersten Start nichts nachholen
    const msg = await HANDLERS.release();
    await rest('POST', '/channels/' + CFG.releaseChannel + '/messages', Object.assign({ content: '🎉 Neue VRC-Nexus-Version!', allowed_mentions: { parse: [] } }, msg));
    return true;
}

// ---------------- Gateway ----------------
class Gateway {
    constructor() { this.ws = null; this.seq = null; this.session = ''; this.resumeUrl = ''; this.hb = null; this.acked = true; this.backoff = 1000; this.stopped = false; this.ready = false; }
    connect() {
        if (this.stopped) return;
        const url = (this.session && this.resumeUrl ? this.resumeUrl : CFG.gateway) + '/?v=10&encoding=json';
        const ws = this.ws = new WebSocket(url);
        ws.onmessage = ev => { let m; try { m = JSON.parse(String(ev.data)); } catch (e) { return; } this.onMessage(m).catch(e => log('Gateway-Fehler:', e.message)); };
        ws.onclose = ev => {
            clearInterval(this.hb); this.ready = false;
            if (this.ws !== ws || this.stopped) return;
            if ([4004, 4010, 4011, 4012, 4013, 4014].includes(ev.code)) { log('Gateway abgelehnt (Code ' + ev.code + ') – Token/Intents prüfen. Kein Neustart.'); return; }
            if ([4007, 4009].includes(ev.code)) { this.session = ''; this.seq = null; }
            setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(this.backoff * 2, 60000);
        };
        ws.onerror = () => { /* onclose folgt */ };
    }
    send(op, d) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ op, d })); }
    async onMessage(m) {
        if (m.s !== null && m.s !== undefined) this.seq = m.s;
        switch (m.op) {
            case 10: {   // HELLO
                clearInterval(this.hb); this.acked = true;
                const iv = m.d.heartbeat_interval;
                setTimeout(() => this.send(1, this.seq), Math.floor(Math.random() * iv));
                this.hb = setInterval(() => { if (!this.acked) { try { this.ws.close(4000); } catch (e) { /* egal */ } return; } this.acked = false; this.send(1, this.seq); }, iv);
                if (this.session) this.send(6, { token: CFG.token, session_id: this.session, seq: this.seq });
                else this.send(2, { token: CFG.token, intents: INTENT_GUILDS, properties: { os: process.platform, browser: 'ghostnode', device: 'ghostnode' } });
                return;
            }
            case 11: this.acked = true; return;   // Heartbeat-Antwort
            case 1: this.send(1, this.seq); return;
            case 7: try { this.ws.close(4000); } catch (e) { /* egal */ } return;   // Neu verbinden
            case 9: if (!m.d) { this.session = ''; this.seq = null; } setTimeout(() => { try { this.ws.close(4000); } catch (e) { /* egal */ } }, 1000 + Math.random() * 4000); return;
            case 0:
                if (m.t === 'READY') { this.session = m.d.session_id; this.resumeUrl = m.d.resume_gateway_url || ''; this.ready = true; this.backoff = 1000; log('Bot bereit als', m.d.user && m.d.user.username); }
                else if (m.t === 'RESUMED') { this.ready = true; this.backoff = 1000; log('Verbindung wieder aufgenommen'); }
                else if (m.t === 'INTERACTION_CREATE') await onInteraction(m.d);
        }
    }
    stop() { this.stopped = true; clearInterval(this.hb); try { if (this.ws) this.ws.close(1000); } catch (e) { /* egal */ } }
}

async function registerCommands() {
    const route = CFG.guild ? '/applications/' + CFG.app + '/guilds/' + CFG.guild + '/commands' : '/applications/' + CFG.app + '/commands';
    await rest('PUT', route, COMMANDS);
    log('Befehle registriert (' + (CFG.guild ? 'Server ' + CFG.guild : 'global') + ')');
}

async function start() {
    if (!CFG.token || !CFG.app) { console.error('DISCORD_TOKEN und DISCORD_APP_ID fehlen (Umgebungsvariablen).'); process.exit(1); }
    if (typeof WebSocket === 'undefined') { console.error('Node ≥ 22 nötig.'); process.exit(1); }
    await registerCommands().catch(e => log('Befehle nicht registriert:', e.message));
    const gw = new Gateway(); gw.connect();
    const rel = () => checkRelease().catch(e => log('Release-Prüfung:', e.message));
    setTimeout(rel, 15000); setInterval(rel, 10 * 60000);
    if (CFG.port) http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'application/json' }); s.end(JSON.stringify({ ok: gw.ready, service: 'ghostnode-discord-bot' })); }).listen(CFG.port);
    const bye = () => { gw.stop(); process.exit(0); };
    process.on('SIGTERM', bye); process.on('SIGINT', bye);
    return gw;
}

if (process.env.BOT_NO_AUTOSTART !== '1') start();
module.exports = { CFG, COMMANDS, HANDLERS, Gateway, onInteraction, checkRelease, registerCommands, firstHeartRate, start };
