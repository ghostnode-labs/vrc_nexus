'use strict';
/*
 * GhostNode-Bot – Community-Funktionen:
 *  Levels & Rangliste · Willkommen/Abschied & Autorollen · Moderation & Verwarnungen · AutoMod · Rollen-Knöpfe ·
 *  Umfragen · Giveaways · eigene !Befehle · Geburtstage · Tickets · Nachrichten-Logs · /einstellungen
 * core = { rest, log, store, botId() }
 */
const P = { KICK: 1n << 1n, BAN: 1n << 2n, ADMIN: 1n << 3n, MANAGE_CHANNELS: 1n << 4n, MANAGE_GUILD: 1n << 5n, MANAGE_MESSAGES: 1n << 13n, MANAGE_ROLES: 1n << 28n, MODERATE: 1n << 40n };
const COLOR = 0x38d5e6, GOLD = 0xf3c262, RED = 0xef4444;
const O = { SUB: 1, STR: 3, INT: 4, BOOL: 5, USER: 6, CHANNEL: 7, ROLE: 8 };
const opt = (type, name, description, required = false, extra = {}) => Object.assign({ type, name, description, required }, extra);
const sub = (name, description, options = []) => ({ type: O.SUB, name, description, options });
const perm = p => String(p);

const COMMANDS = [
    { name: 'rang', description: 'Level und XP anzeigen', options: [opt(O.USER, 'nutzer', 'Wessen Rang?')] },
    { name: 'rangliste', description: 'Die aktivsten Mitglieder' },
    { name: 'warn', description: 'Mitglied verwarnen', default_member_permissions: perm(P.MODERATE), options: [opt(O.USER, 'nutzer', 'Wer?', true), opt(O.STR, 'grund', 'Warum?', true, { max_length: 300 })] },
    { name: 'verwarnungen', description: 'Verwarnungen eines Mitglieds', default_member_permissions: perm(P.MODERATE), options: [opt(O.USER, 'nutzer', 'Wer?', true), opt(O.BOOL, 'loeschen', 'Alle Verwarnungen löschen')] },
    { name: 'timeout', description: 'Mitglied stummschalten', default_member_permissions: perm(P.MODERATE), options: [opt(O.USER, 'nutzer', 'Wer?', true), opt(O.INT, 'minuten', 'Dauer (1–40320)', true, { min_value: 1, max_value: 40320 }), opt(O.STR, 'grund', 'Warum?', false, { max_length: 300 })] },
    { name: 'kick', description: 'Mitglied entfernen', default_member_permissions: perm(P.KICK), options: [opt(O.USER, 'nutzer', 'Wer?', true), opt(O.STR, 'grund', 'Warum?', false, { max_length: 300 })] },
    { name: 'ban', description: 'Mitglied bannen', default_member_permissions: perm(P.BAN), options: [opt(O.USER, 'nutzer', 'Wer?', true), opt(O.STR, 'grund', 'Warum?', false, { max_length: 300 }), opt(O.INT, 'tage', 'Nachrichten der letzten Tage löschen (0–7)', false, { min_value: 0, max_value: 7 })] },
    { name: 'unban', description: 'Bann aufheben', default_member_permissions: perm(P.BAN), options: [opt(O.STR, 'id', 'Nutzer-ID', true, { max_length: 22 })] },
    { name: 'loeschen', description: 'Letzte Nachrichten im Kanal löschen', default_member_permissions: perm(P.MANAGE_MESSAGES), options: [opt(O.INT, 'anzahl', '2–100', true, { min_value: 2, max_value: 100 }), opt(O.USER, 'nutzer', 'Nur von diesem Mitglied')] },
    { name: 'rollenmenue', description: 'Knöpfe zum Selbst-Vergeben von Rollen', default_member_permissions: perm(P.MANAGE_ROLES), options: [opt(O.STR, 'titel', 'Überschrift', true, { max_length: 100 }),
        ...[1, 2, 3, 4, 5].map(i => opt(O.ROLE, 'rolle' + i, 'Rolle ' + i, i === 1))] },
    { name: 'umfrage', description: 'Umfrage mit Knöpfen', options: [opt(O.STR, 'frage', 'Die Frage', true, { max_length: 200 }), opt(O.STR, 'optionen', 'Antworten mit ; getrennt (2–5), leer = Ja;Nein', false, { max_length: 300 })] },
    { name: 'giveaway', description: 'Gewinnspiel starten', default_member_permissions: perm(P.MANAGE_GUILD), options: [opt(O.STR, 'preis', 'Was gibt es zu gewinnen?', true, { max_length: 150 }),
        opt(O.INT, 'minuten', 'Laufzeit (1–43200)', true, { min_value: 1, max_value: 43200 }), opt(O.INT, 'gewinner', 'Anzahl Gewinner (1–20)', false, { min_value: 1, max_value: 20 })] },
    { name: 'befehl', description: 'Eigene !Befehle verwalten', default_member_permissions: perm(P.MANAGE_GUILD), options: [
        sub('hinzufuegen', 'Befehl anlegen oder ändern', [opt(O.STR, 'name', 'z. B. regeln (ohne !)', true, { max_length: 30 }), opt(O.STR, 'antwort', 'Antworttext ({user} {server} erlaubt)', true, { max_length: 1800 })]),
        sub('entfernen', 'Befehl löschen', [opt(O.STR, 'name', 'Name', true, { max_length: 30 })]), sub('liste', 'Alle eigenen Befehle')] },
    { name: 'geburtstag', description: 'Deinen Geburtstag eintragen (TT.MM)', options: [opt(O.STR, 'datum', 'z. B. 24.12 – leer zum Entfernen', false, { max_length: 5 })] },
    { name: 'ticket-panel', description: 'Knopf „Ticket öffnen“ in diesen Kanal setzen', default_member_permissions: perm(P.MANAGE_CHANNELS) },
    { name: 'wuerfel', description: 'Würfeln', options: [opt(O.INT, 'seiten', 'Seiten (2–1000)', false, { min_value: 2, max_value: 1000 })] },
    { name: 'muenze', description: 'Kopf oder Zahl' },
    { name: 'einstellungen', description: 'Bot einrichten', default_member_permissions: perm(P.MANAGE_GUILD), options: [
        sub('anzeigen', 'Aktuelle Einstellungen'),
        sub('willkommen', 'Begrüßung neuer Mitglieder', [opt(O.CHANNEL, 'kanal', 'Kanal (leer = aus)'), opt(O.STR, 'text', '{user} {name} {server} {count}', false, { max_length: 1000 })]),
        sub('abschied', 'Nachricht beim Verlassen', [opt(O.CHANNEL, 'kanal', 'Kanal (leer = aus)'), opt(O.STR, 'text', '{name} {server} {count}', false, { max_length: 1000 })]),
        sub('autorolle', 'Rolle für neue Mitglieder an/aus', [opt(O.ROLE, 'rolle', 'Rolle', true)]),
        sub('levels', 'Level-System', [opt(O.BOOL, 'an', 'Levels an?'), opt(O.CHANNEL, 'kanal', 'Kanal für Level-Up (leer = gleicher Kanal)'), opt(O.STR, 'text', '{user} {level}', false, { max_length: 500 })]),
        sub('belohnung', 'Rolle ab einem Level (Level 0 = entfernen)', [opt(O.INT, 'level', 'Level', true, { min_value: 0, max_value: 500 }), opt(O.ROLE, 'rolle', 'Rolle', true)]),
        sub('modlog', 'Kanal für Moderations-Protokoll', [opt(O.CHANNEL, 'kanal', 'Kanal (leer = aus)')]),
        sub('logs', 'Kanal für gelöschte/bearbeitete Nachrichten und Beitritte', [opt(O.CHANNEL, 'kanal', 'Kanal (leer = aus)')]),
        sub('automod', 'Automatische Moderation', [opt(O.BOOL, 'einladungen', 'Discord-Einladungen löschen'), opt(O.BOOL, 'links', 'Alle Links löschen'), opt(O.BOOL, 'spam', 'Spam (viele Nachrichten) bremsen'),
            opt(O.BOOL, 'caps', 'Nur-Großbuchstaben löschen'), opt(O.STR, 'woerter', 'Verbotene Wörter, mit Komma getrennt („-“ = leeren)', false, { max_length: 1000 }),
            opt(O.ROLE, 'ausnahme', 'Rolle ausnehmen (an/aus)'), opt(O.INT, 'timeout', 'Timeout-Minuten bei Verstoß (0 = nur löschen)', false, { min_value: 0, max_value: 1440 })]),
        sub('geburtstage', 'Kanal für Geburtstagsgrüße', [opt(O.CHANNEL, 'kanal', 'Kanal (leer = aus)')]),
        sub('tickets', 'Team-Rolle für Tickets (an/aus)', [opt(O.ROLE, 'rolle', 'Rolle, die Tickets sieht', true)])] },
];

// ---------------- Hilfen ----------------
const has = (it, p) => { try { const x = BigInt(it.member && it.member.permissions || 0); return (x & P.ADMIN) === P.ADMIN || (x & p) === p; } catch (e) { return false; } };
const fill = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? String(v[k]) : m));
const lvlNeed = l => 5 * l * l + 50 * l + 100;   // XP für den Schritt von Level l auf l+1
function levelOf(xp) { let l = 0, rest = xp; while (rest >= lvlNeed(l)) { rest -= lvlNeed(l); l++; } return { level: l, into: rest, need: lvlNeed(l) }; }
const bar = (a, b, n = 12) => { const f = Math.max(0, Math.min(n, Math.round(a / b * n))); return '▰'.repeat(f) + '▱'.repeat(n - f); };
const mention = id => '<@' + id + '>';
const eph = (content, extra) => Object.assign({ content, flags: 64 }, extra || {});
const nowIso = ms => new Date(Date.now() + ms).toISOString();
const audit = r => (r ? { 'X-Audit-Log-Reason': encodeURIComponent(String(r).slice(0, 400)) } : undefined);

function create(core) {
    const { rest, log, store } = core;
    const spam = new Map();     // guild:user → Zeitstempel
    const send = (ch, data) => rest('POST', '/channels/' + ch + '/messages', Object.assign({ allowed_mentions: { parse: ['users'] } }, data));
    const modlog = (g, title, fields, color = GOLD) => { const c = store.get(g).cfg.modlog_channel; if (c) send(c, { embeds: [{ title, color, fields, timestamp: new Date().toISOString() }] }).catch(e => log('Modlog:', e.message)); };
    const evlog = (g, data) => { const c = store.get(g).cfg.log_channel; if (c) send(c, data).catch(e => log('Log:', e.message)); };
    const dm = async (uid, content) => { try { const ch = await rest('POST', '/users/@me/channels', { recipient_id: uid }); await send(ch.id, { content }); } catch (e) { /* DMs zu */ } };

    // ---------- Levels ----------
    async function giveXp(m) {
        const g = m.guild_id, d = store.get(g), c = d.cfg;
        if (!c.levels || c.xp_ignore_channels.includes(m.channel_id)) return;
        const u = d.xp[m.author.id] = d.xp[m.author.id] || { xp: 0, last: 0, msgs: 0 };
        u.msgs++;
        if (Date.now() - u.last < c.xp_cooldown * 1000) { store.save(g); return; }
        const before = levelOf(u.xp).level;
        u.xp += c.xp_min + Math.floor(Math.random() * (c.xp_max - c.xp_min + 1)); u.last = Date.now();
        const after = levelOf(u.xp).level;
        store.save(g);
        if (after <= before) return;
        await send(c.level_channel || m.channel_id, { content: fill(c.level_text, { user: mention(m.author.id), name: m.author.username, level: after }) }).catch(e => log('Level-Up:', e.message));
        for (const [lv, role] of Object.entries(c.level_rewards)) if (after >= Number(lv)) await rest('PUT', '/guilds/' + g + '/members/' + m.author.id + '/roles/' + role, undefined, 0, audit('Level ' + lv)).catch(e => log('Belohnung:', e.message));
    }

    // ---------- AutoMod ----------
    async function automod(m) {
        const g = m.guild_id, a = store.get(g).cfg.automod, roles = (m.member && m.member.roles) || [];
        if (roles.some(r => a.exempt_roles.includes(r))) return false;
        const t = String(m.content || ''), low = t.toLowerCase();
        let why = '';
        if (a.words.length && a.words.some(w => w && new RegExp('(^|[^\\p{L}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}])', 'iu').test(low))) why = 'verbotenes Wort';
        else if (a.invites && /(discord\.gg|discord(app)?\.com\/invite)\/\S+/i.test(t)) why = 'Discord-Einladung';
        else if (a.links && /https?:\/\/\S+/i.test(t)) why = 'Link';
        else if (a.caps && t.replace(/[^A-Za-zÄÖÜäöü]/g, '').length >= 12 && t === t.toUpperCase() && /[A-ZÄÖÜ]/.test(t)) why = 'nur Großbuchstaben';
        else if (a.spam) {
            const k = g + ':' + m.author.id, list = (spam.get(k) || []).filter(x => Date.now() - x < 5000); list.push(Date.now()); spam.set(k, list);
            if (list.length >= 6) why = 'Spam';
        }
        if (!why) return false;
        await rest('DELETE', '/channels/' + m.channel_id + '/messages/' + m.id, undefined, 0, audit('AutoMod: ' + why)).catch(() => {});
        if (a.timeout_min > 0) await rest('PATCH', '/guilds/' + g + '/members/' + m.author.id, { communication_disabled_until: nowIso(a.timeout_min * 60000) }, 0, audit('AutoMod: ' + why)).catch(() => {});
        modlog(g, '🛡 AutoMod: ' + why, [{ name: 'Mitglied', value: mention(m.author.id), inline: true }, { name: 'Kanal', value: '<#' + m.channel_id + '>', inline: true }, { name: 'Nachricht', value: t.slice(0, 900) || '–' }], RED);
        await dm(m.author.id, '🛡 Deine Nachricht wurde automatisch entfernt (' + why + ').');
        return true;
    }

    // ---------- Ereignisse ----------
    async function onMessage(m) {
        if (!m.guild_id || !m.author || m.author.bot || m.webhook_id) return;
        if (await automod(m)) return;
        const t = String(m.content || '').trim(), d = store.get(m.guild_id);
        const cm = /^!([a-z0-9_-]{1,30})\b/i.exec(t);
        if (cm && d.cmds[cm[1].toLowerCase()]) await send(m.channel_id, { content: fill(d.cmds[cm[1].toLowerCase()], { user: mention(m.author.id), name: m.author.username, server: d.meta.name || '' }), allowed_mentions: { parse: [] } }).catch(e => log('!Befehl:', e.message));
        await giveXp(m);
    }
    async function onMemberAdd(mb) {
        const g = mb.guild_id, d = store.get(g), c = d.cfg;
        d.meta.count = (d.meta.count || 0) + 1; store.save(g);
        for (const r of c.autoroles) await rest('PUT', '/guilds/' + g + '/members/' + mb.user.id + '/roles/' + r, undefined, 0, audit('Autorolle')).catch(e => log('Autorolle:', e.message));
        if (c.welcome_channel) await send(c.welcome_channel, { content: fill(c.welcome_text, { user: mention(mb.user.id), name: mb.user.username, server: d.meta.name || '', count: d.meta.count || '' }) }).catch(e => log('Willkommen:', e.message));
        evlog(g, { embeds: [{ description: '📥 ' + mention(mb.user.id) + ' ist beigetreten', color: COLOR }] });
    }
    async function onMemberRemove(ev) {
        const g = ev.guild_id, d = store.get(g), c = d.cfg;
        d.meta.count = Math.max(0, (d.meta.count || 1) - 1); store.save(g);
        if (c.goodbye_channel) await send(c.goodbye_channel, { content: fill(c.goodbye_text, { name: ev.user.username, server: d.meta.name || '', count: d.meta.count || '' }), allowed_mentions: { parse: [] } }).catch(e => log('Abschied:', e.message));
        evlog(g, { embeds: [{ description: '📤 **' + ev.user.username + '** hat den Server verlassen', color: COLOR }] });
    }
    function onGuild(gd) { const d = store.get(gd.id); d.meta.name = gd.name; d.meta.count = gd.member_count || d.meta.count || 0; store.save(gd.id); }
    function onMessageDelete(ev) { if (ev.guild_id) evlog(ev.guild_id, { embeds: [{ description: '🗑 Nachricht in <#' + ev.channel_id + '> gelöscht', color: RED }] }); }
    function onMessageUpdate(m) {
        if (!m.guild_id || !m.author || m.author.bot || m.content === undefined) return;
        evlog(m.guild_id, { embeds: [{ description: '✏️ ' + mention(m.author.id) + ' hat eine Nachricht in <#' + m.channel_id + '> bearbeitet', color: COLOR, fields: [{ name: 'Neu', value: String(m.content).slice(0, 1000) || '–' }] }], allowed_mentions: { parse: [] } });
    }

    // ---------- Befehle ----------
    const H = {
        async rang(it, o) {
            const g = it.guild_id, uid = o.nutzer || it.member.user.id, d = store.get(g), u = d.xp[uid] || { xp: 0, msgs: 0 };
            const L = levelOf(u.xp), rank = Object.entries(d.xp).sort((a, b) => b[1].xp - a[1].xp).findIndex(e => e[0] === uid) + 1;
            return { embeds: [{ title: '📈 Rang', color: COLOR, description: mention(uid) + '\n**Level ' + L.level + '** · Platz ' + (rank || '–') + '\n' + bar(L.into, L.need) + ' ' + L.into + '/' + L.need + ' XP\nGesamt: ' + u.xp + ' XP · ' + (u.msgs || 0) + ' Nachrichten' }], allowed_mentions: { parse: [] } };
        },
        async rangliste(it) {
            const top = Object.entries(store.get(it.guild_id).xp).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
            if (!top.length) return eph('Noch keine XP gesammelt.');
            const medal = ['🥇', '🥈', '🥉'];
            return { embeds: [{ title: '🏆 Rangliste', color: GOLD, description: top.map(([id, u], i) => (medal[i] || '**' + (i + 1) + '.**') + ' ' + mention(id) + ' – Level ' + levelOf(u.xp).level + ' (' + u.xp + ' XP)').join('\n') }], allowed_mentions: { parse: [] } };
        },
        async warn(it, o) {
            if (!has(it, P.MODERATE)) return eph('Keine Berechtigung.');
            const d = store.get(it.guild_id), list = d.warns[o.nutzer] = d.warns[o.nutzer] || [];
            list.push({ by: it.member.user.id, reason: String(o.grund).slice(0, 300), at: Date.now() }); store.save(it.guild_id);
            await dm(o.nutzer, '⚠️ Du wurdest auf **' + (d.meta.name || 'dem Server') + '** verwarnt: ' + o.grund);
            modlog(it.guild_id, '⚠️ Verwarnung #' + list.length, [{ name: 'Mitglied', value: mention(o.nutzer), inline: true }, { name: 'Von', value: mention(it.member.user.id), inline: true }, { name: 'Grund', value: String(o.grund) }]);
            return eph('⚠️ ' + mention(o.nutzer) + ' verwarnt (' + list.length + '. Verwarnung).');
        },
        async verwarnungen(it, o) {
            if (!has(it, P.MODERATE)) return eph('Keine Berechtigung.');
            const d = store.get(it.guild_id), list = d.warns[o.nutzer] || [];
            if (o.loeschen) { delete d.warns[o.nutzer]; store.save(it.guild_id); modlog(it.guild_id, '🧹 Verwarnungen gelöscht', [{ name: 'Mitglied', value: mention(o.nutzer) }]); return eph('Verwarnungen von ' + mention(o.nutzer) + ' gelöscht.'); }
            return eph(list.length ? list.map((w, i) => (i + 1) + '. ' + new Date(w.at).toLocaleDateString('de-DE') + ' – ' + w.reason + ' (von ' + mention(w.by) + ')').join('\n') : 'Keine Verwarnungen.');
        },
        async timeout(it, o) {
            if (!has(it, P.MODERATE)) return eph('Keine Berechtigung.');
            await rest('PATCH', '/guilds/' + it.guild_id + '/members/' + o.nutzer, { communication_disabled_until: nowIso(o.minuten * 60000) }, 0, audit(o.grund));
            modlog(it.guild_id, '🔇 Timeout ' + o.minuten + ' min', [{ name: 'Mitglied', value: mention(o.nutzer), inline: true }, { name: 'Von', value: mention(it.member.user.id), inline: true }, { name: 'Grund', value: o.grund || '–' }]);
            return eph('🔇 ' + mention(o.nutzer) + ' für ' + o.minuten + ' Minuten stummgeschaltet.');
        },
        async kick(it, o) {
            if (!has(it, P.KICK)) return eph('Keine Berechtigung.');
            await dm(o.nutzer, '👢 Du wurdest von **' + (store.get(it.guild_id).meta.name || 'dem Server') + '** entfernt' + (o.grund ? ': ' + o.grund : '.'));
            await rest('DELETE', '/guilds/' + it.guild_id + '/members/' + o.nutzer, undefined, 0, audit(o.grund));
            modlog(it.guild_id, '👢 Kick', [{ name: 'Mitglied', value: mention(o.nutzer), inline: true }, { name: 'Von', value: mention(it.member.user.id), inline: true }, { name: 'Grund', value: o.grund || '–' }], RED);
            return eph('👢 ' + mention(o.nutzer) + ' wurde entfernt.');
        },
        async ban(it, o) {
            if (!has(it, P.BAN)) return eph('Keine Berechtigung.');
            await rest('PUT', '/guilds/' + it.guild_id + '/bans/' + o.nutzer, { delete_message_seconds: (o.tage || 0) * 86400 }, 0, audit(o.grund));
            modlog(it.guild_id, '🔨 Bann', [{ name: 'Mitglied', value: mention(o.nutzer), inline: true }, { name: 'Von', value: mention(it.member.user.id), inline: true }, { name: 'Grund', value: o.grund || '–' }], RED);
            return eph('🔨 ' + mention(o.nutzer) + ' wurde gebannt.');
        },
        async unban(it, o) {
            if (!has(it, P.BAN)) return eph('Keine Berechtigung.');
            if (!/^\d{15,22}$/.test(String(o.id))) return eph('Ungültige Nutzer-ID.');
            await rest('DELETE', '/guilds/' + it.guild_id + '/bans/' + o.id);
            modlog(it.guild_id, '✅ Bann aufgehoben', [{ name: 'Nutzer', value: mention(o.id) }, { name: 'Von', value: mention(it.member.user.id) }]);
            return eph('✅ Bann für ' + mention(o.id) + ' aufgehoben.');
        },
        async loeschen(it, o) {
            if (!has(it, P.MANAGE_MESSAGES)) return eph('Keine Berechtigung.');
            let msgs = await rest('GET', '/channels/' + it.channel_id + '/messages?limit=100');
            const twoWeeks = Date.now() - 13.9 * 86400000;
            msgs = msgs.filter(m => (!o.nutzer || (m.author && m.author.id === o.nutzer)) && Date.parse(m.timestamp) > twoWeeks && m.interaction_metadata === undefined).slice(0, o.anzahl);
            if (msgs.length >= 2) await rest('POST', '/channels/' + it.channel_id + '/messages/bulk-delete', { messages: msgs.map(m => m.id) });
            else if (msgs.length === 1) await rest('DELETE', '/channels/' + it.channel_id + '/messages/' + msgs[0].id);
            modlog(it.guild_id, '🧹 ' + msgs.length + ' Nachrichten gelöscht', [{ name: 'Kanal', value: '<#' + it.channel_id + '>', inline: true }, { name: 'Von', value: mention(it.member.user.id), inline: true }]);
            return eph('🧹 ' + msgs.length + ' Nachrichten gelöscht' + (msgs.length < o.anzahl ? ' (ältere als 14 Tage kann Discord nicht sammeln-löschen)' : '') + '.');
        },
        async rollenmenue(it, o, res) {
            if (!has(it, P.MANAGE_ROLES)) return eph('Keine Berechtigung.');
            const roles = [1, 2, 3, 4, 5].map(i => o['rolle' + i]).filter(Boolean);
            const rmap = (res && res.roles) || {};
            const buttons = roles.map(r => ({ type: 2, style: 2, label: ((rmap[r] && rmap[r].name) || 'Rolle').slice(0, 80), custom_id: 'gn:role:' + r }));
            await send(it.channel_id, { embeds: [{ title: String(o.titel), color: COLOR, description: 'Klick auf einen Knopf, um dir die Rolle zu geben – nochmal klicken nimmt sie wieder weg.' }], components: [{ type: 1, components: buttons }] });
            return eph('Rollenmenü erstellt. Achte darauf, dass die Bot-Rolle über diesen Rollen steht.');
        },
        async umfrage(it, o) {
            const opts = String(o.optionen || 'Ja;Nein').split(';').map(s => s.trim()).filter(Boolean).slice(0, 5);
            if (opts.length < 2) return eph('Mindestens zwei Antworten (mit ; getrennt).');
            const msg = await send(it.channel_id, { embeds: [pollEmbed(String(o.frage), opts, {}, it.member.user.id)], components: [{ type: 1, components: opts.map((x, i) => ({ type: 2, style: 1, label: x.slice(0, 80), custom_id: 'gn:poll:' + i })) }], allowed_mentions: { parse: [] } });
            const d = store.get(it.guild_id); d.polls[msg.id] = { q: String(o.frage), opts, votes: {}, by: it.member.user.id, at: Date.now() }; store.save(it.guild_id);
            return eph('📊 Umfrage gestartet.');
        },
        async giveaway(it, o) {
            if (!has(it, P.MANAGE_GUILD)) return eph('Keine Berechtigung.');
            const end = Date.now() + o.minuten * 60000, n = o.gewinner || 1;
            const msg = await send(it.channel_id, { embeds: [{ title: '🎁 ' + String(o.preis), color: GOLD, description: 'Klick auf **Teilnehmen**!\nEndet <t:' + Math.floor(end / 1000) + ':R> · ' + n + ' Gewinner' }], components: [{ type: 1, components: [{ type: 2, style: 3, label: 'Teilnehmen', emoji: { name: '🎉' }, custom_id: 'gn:gw' }] }] });
            const d = store.get(it.guild_id); d.giveaways[msg.id] = { prize: String(o.preis), end, winners: n, channel: it.channel_id, entrants: [], by: it.member.user.id }; store.save(it.guild_id);
            return eph('🎁 Giveaway gestartet.');
        },
        async befehl(it, o, res, subName) {
            if (!has(it, P.MANAGE_GUILD)) return eph('Keine Berechtigung.');
            const d = store.get(it.guild_id), name = String(o.name || '').toLowerCase().replace(/^!/, '');
            if (subName === 'liste') { const k = Object.keys(d.cmds); return eph(k.length ? k.sort().map(x => '`!' + x + '`').join(' ') : 'Noch keine eigenen Befehle.'); }
            if (!/^[a-z0-9_-]{1,30}$/.test(name)) return eph('Name: a–z, 0–9, - und _ (max. 30).');
            if (subName === 'entfernen') { delete d.cmds[name]; store.save(it.guild_id); return eph('`!' + name + '` entfernt.'); }
            if (Object.keys(d.cmds).length >= 100 && !d.cmds[name]) return eph('Maximal 100 eigene Befehle.');
            d.cmds[name] = String(o.antwort); store.save(it.guild_id); return eph('`!' + name + '` gespeichert.');
        },
        async geburtstag(it, o) {
            const d = store.get(it.guild_id), uid = it.member.user.id;
            if (!o.datum) { delete d.bdays[uid]; store.save(it.guild_id); return eph('Geburtstag entfernt.'); }
            const m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(String(o.datum).trim());
            if (!m || +m[1] < 1 || +m[1] > 31 || +m[2] < 1 || +m[2] > 12) return eph('Bitte als TT.MM angeben, z. B. 24.12');
            d.bdays[uid] = String(+m[1]).padStart(2, '0') + '.' + String(+m[2]).padStart(2, '0'); store.save(it.guild_id);
            return eph('🎂 Gespeichert: ' + d.bdays[uid] + (d.cfg.birthday_channel ? '' : ' (Geburtstagsgrüße sind auf diesem Server noch aus)'));
        },
        async 'ticket-panel'(it) {
            if (!has(it, P.MANAGE_CHANNELS)) return eph('Keine Berechtigung.');
            await send(it.channel_id, { embeds: [{ title: '🎫 Support-Ticket', color: COLOR, description: 'Du brauchst Hilfe vom Team? Klick auf den Knopf – es öffnet sich ein privater Thread nur für dich und das Team.' }], components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Ticket öffnen', emoji: { name: '🎫' }, custom_id: 'gn:ticket' }] }] });
            const d = store.get(it.guild_id); d.cfg.ticket_channel = it.channel_id; store.save(it.guild_id);
            return eph('Ticket-Knopf gesetzt. Team-Rollen: /einstellungen tickets');
        },
        async wuerfel(it, o) { const s = o.seiten || 6; return { content: '🎲 ' + (1 + Math.floor(Math.random() * s)) + ' (W' + s + ')' }; },
        async muenze() { return { content: Math.random() < 0.5 ? '🪙 Kopf' : '🪙 Zahl' }; },
        async einstellungen(it, o, res, s) {
            if (!has(it, P.MANAGE_GUILD)) return eph('Keine Berechtigung.');
            const g = it.guild_id, d = store.get(g), c = d.cfg, ch = x => (x ? '<#' + x + '>' : 'aus');
            const done = m => { store.save(g); return eph('✅ ' + m); };
            switch (s) {
                case 'willkommen': c.welcome_channel = o.kanal || ''; if (o.text) c.welcome_text = String(o.text); return done('Begrüßung: ' + ch(c.welcome_channel));
                case 'abschied': c.goodbye_channel = o.kanal || ''; if (o.text) c.goodbye_text = String(o.text); return done('Abschied: ' + ch(c.goodbye_channel));
                case 'autorolle': { const i = c.autoroles.indexOf(o.rolle); if (i >= 0) c.autoroles.splice(i, 1); else c.autoroles.push(o.rolle); return done('Autorollen: ' + (c.autoroles.map(r => '<@&' + r + '>').join(' ') || 'keine')); }
                case 'levels': if (o.an !== undefined) c.levels = !!o.an; if (o.kanal !== undefined) c.level_channel = o.kanal || ''; if (o.text) c.level_text = String(o.text); return done('Levels ' + (c.levels ? 'an' : 'aus') + ', Level-Up: ' + (c.level_channel ? ch(c.level_channel) : 'gleicher Kanal'));
                case 'belohnung': if (o.level === 0) { for (const [k, v] of Object.entries(c.level_rewards)) if (v === o.rolle) delete c.level_rewards[k]; } else c.level_rewards[String(o.level)] = o.rolle;
                    return done('Belohnungen: ' + (Object.entries(c.level_rewards).map(([k, v]) => 'L' + k + ' → <@&' + v + '>').join(', ') || 'keine'));
                case 'modlog': c.modlog_channel = o.kanal || ''; return done('Moderations-Protokoll: ' + ch(c.modlog_channel));
                case 'logs': c.log_channel = o.kanal || ''; return done('Logs: ' + ch(c.log_channel));
                case 'geburtstage': c.birthday_channel = o.kanal || ''; return done('Geburtstage: ' + ch(c.birthday_channel));
                case 'tickets': { const i = c.ticket_roles.indexOf(o.rolle); if (i >= 0) c.ticket_roles.splice(i, 1); else c.ticket_roles.push(o.rolle); return done('Ticket-Team: ' + (c.ticket_roles.map(r => '<@&' + r + '>').join(' ') || 'nur Admins')); }
                case 'automod': {
                    const a = c.automod;
                    for (const k of ['einladungen', 'links', 'spam', 'caps']) if (o[k] !== undefined) a[{ einladungen: 'invites', links: 'links', spam: 'spam', caps: 'caps' }[k]] = !!o[k];
                    if (o.woerter !== undefined) a.words = o.woerter.trim() === '-' ? [] : String(o.woerter).split(',').map(w => w.trim().toLowerCase()).filter(Boolean).slice(0, 200);
                    if (o.ausnahme) { const i = a.exempt_roles.indexOf(o.ausnahme); if (i >= 0) a.exempt_roles.splice(i, 1); else a.exempt_roles.push(o.ausnahme); }
                    if (o.timeout !== undefined) a.timeout_min = o.timeout;
                    return done('AutoMod: Einladungen ' + (a.invites ? 'an' : 'aus') + ' · Links ' + (a.links ? 'an' : 'aus') + ' · Spam ' + (a.spam ? 'an' : 'aus') + ' · Caps ' + (a.caps ? 'an' : 'aus') + ' · ' + a.words.length + ' Wörter · Timeout ' + a.timeout_min + ' min');
                }
                default: {
                    const a = c.automod;
                    return eph(['**Begrüßung:** ' + ch(c.welcome_channel), '**Abschied:** ' + ch(c.goodbye_channel), '**Autorollen:** ' + (c.autoroles.map(r => '<@&' + r + '>').join(' ') || 'keine'),
                        '**Levels:** ' + (c.levels ? 'an' : 'aus') + (c.level_channel ? ' → ' + ch(c.level_channel) : ''), '**Belohnungen:** ' + (Object.entries(c.level_rewards).map(([k, v]) => 'L' + k + ' → <@&' + v + '>').join(', ') || 'keine'),
                        '**Modlog:** ' + ch(c.modlog_channel), '**Logs:** ' + ch(c.log_channel), '**Geburtstage:** ' + ch(c.birthday_channel), '**Tickets:** ' + ch(c.ticket_channel),
                        '**AutoMod:** Einladungen ' + (a.invites ? 'an' : 'aus') + ', Links ' + (a.links ? 'an' : 'aus') + ', Spam ' + (a.spam ? 'an' : 'aus') + ', Caps ' + (a.caps ? 'an' : 'aus') + ', ' + a.words.length + ' Wörter',
                        '**Eigene Befehle:** ' + Object.keys(d.cmds).length].join('\n'));
                }
            }
        },
    };
    const EPH = new Set(['warn', 'verwarnungen', 'timeout', 'kick', 'ban', 'unban', 'loeschen', 'rollenmenue', 'umfrage', 'giveaway', 'befehl', 'geburtstag', 'ticket-panel', 'einstellungen']);

    function pollEmbed(q, opts, votes, by) {
        const counts = opts.map((x, i) => Object.values(votes).filter(v => v === i).length), total = counts.reduce((a, b) => a + b, 0);
        return { title: '📊 ' + q, color: COLOR, description: opts.map((x, i) => '**' + x + '**\n' + bar(counts[i], Math.max(1, total), 14) + ' ' + counts[i] + (total ? ' (' + Math.round(counts[i] / total * 100) + ' %)' : '')).join('\n\n'), footer: { text: total + ' Stimme(n) · erneut klicken ändert die Stimme' } };
    }

    // ---------- Knöpfe ----------
    async function onComponent(it) {
        const id = String(it.data.custom_id || ''), g = it.guild_id, uid = it.member && it.member.user.id;
        if (!g || !uid) return { type: 4, data: eph('Nur auf Servern.') };
        if (id.startsWith('gn:role:')) {
            const role = id.slice(8), hasRole = (it.member.roles || []).includes(role);
            await rest(hasRole ? 'DELETE' : 'PUT', '/guilds/' + g + '/members/' + uid + '/roles/' + role, undefined, 0, audit('Rollenmenü'));
            return { type: 4, data: eph((hasRole ? '➖ Rolle entfernt: ' : '➕ Rolle bekommen: ') + '<@&' + role + '>') };
        }
        if (id.startsWith('gn:poll:')) {
            const d = store.get(g), p = d.polls[it.message.id];
            if (!p) return { type: 4, data: eph('Diese Umfrage ist beendet.') };
            p.votes[uid] = Number(id.slice(8)); store.save(g);
            return { type: 7, data: { embeds: [pollEmbed(p.q, p.opts, p.votes, p.by)] } };
        }
        if (id === 'gn:gw') {
            const d = store.get(g), w = d.giveaways[it.message.id];
            if (!w || w.done) return { type: 4, data: eph('Dieses Giveaway ist vorbei.') };
            const i = w.entrants.indexOf(uid);
            if (i >= 0) w.entrants.splice(i, 1); else w.entrants.push(uid);
            store.save(g);
            return { type: 4, data: eph(i >= 0 ? 'Du nimmst nicht mehr teil.' : '🎉 Du bist dabei! (' + w.entrants.length + ' Teilnehmende)') };
        }
        if (id === 'gn:ticket') {
            const d = store.get(g), open = Object.values(d.tickets).find(t => t.user === uid && !t.closed);
            if (open) return { type: 4, data: eph('Du hast schon ein offenes Ticket: <#' + open.thread + '>') };
            const th = await rest('POST', '/channels/' + it.channel_id + '/threads', { name: '🎫 ' + (it.member.user.username || 'ticket').slice(0, 80), type: 12, invitable: false, auto_archive_duration: 10080 });
            await rest('PUT', '/channels/' + th.id + '/thread-members/' + uid);
            d.tickets[th.id] = { thread: th.id, user: uid, at: Date.now() }; store.save(g);
            const team = d.cfg.ticket_roles.map(r => '<@&' + r + '>').join(' ');
            await send(th.id, { content: '🎫 Ticket von ' + mention(uid) + (team ? '\n' + team : '') + '\nBeschreib bitte kurz dein Anliegen. Zum Schließen: Knopf unten.', allowed_mentions: { users: [uid], roles: d.cfg.ticket_roles },
                components: [{ type: 1, components: [{ type: 2, style: 4, label: 'Ticket schließen', custom_id: 'gn:ticket:close' }] }] });
            return { type: 4, data: eph('🎫 Dein Ticket: <#' + th.id + '>') };
        }
        if (id === 'gn:ticket:close') {
            const d = store.get(g), t = d.tickets[it.channel_id];
            if (!t) return { type: 4, data: eph('Kein Ticket.') };
            if (t.user !== uid && !has(it, P.MANAGE_CHANNELS) && !(it.member.roles || []).some(r => d.cfg.ticket_roles.includes(r))) return { type: 4, data: eph('Nur das Team oder du selbst kannst schließen.') };
            t.closed = Date.now(); store.save(g);
            setTimeout(() => rest('PATCH', '/channels/' + it.channel_id, { archived: true, locked: true }).catch(() => {}), 1500);
            return { type: 4, data: { content: '🔒 Ticket geschlossen von ' + mention(uid) + '.', allowed_mentions: { parse: [] } } };
        }
        return { type: 4, data: eph('Unbekannter Knopf.') };
    }

    // ---------- Zeitgesteuert: Giveaways, Geburtstage ----------
    async function tick(now = Date.now()) {
        for (const g of store.guilds()) {
            const d = store.get(g);
            for (const [mid, w] of Object.entries(d.giveaways)) {
                if (w.done || w.end > now) continue;
                w.done = true; store.save(g);
                const pool = [...w.entrants], win = [];
                while (pool.length && win.length < w.winners) win.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
                await rest('PATCH', '/channels/' + w.channel + '/messages/' + mid, { embeds: [{ title: '🎁 ' + w.prize, color: GOLD, description: 'Beendet · ' + w.entrants.length + ' Teilnehmende' }], components: [] }).catch(() => {});
                await send(w.channel, { content: win.length ? '🎉 Glückwunsch ' + win.map(mention).join(', ') + ' – ihr habt **' + w.prize + '** gewonnen!' : 'Niemand hat am Giveaway **' + w.prize + '** teilgenommen.', allowed_mentions: { users: win } }).catch(e => log('Giveaway:', e.message));
            }
            // alte Einträge aufräumen
            for (const [mid, w] of Object.entries(d.giveaways)) if (w.done && now - w.end > 30 * 86400000) delete d.giveaways[mid];
            for (const [mid, p] of Object.entries(d.polls)) if (now - p.at > 60 * 86400000) delete d.polls[mid];
            // Geburtstage (einmal am Tag ab 9 Uhr Ortszeit des Servers)
            const c = d.cfg, dt = new Date(now), today = String(dt.getDate()).padStart(2, '0') + '.' + String(dt.getMonth() + 1).padStart(2, '0'), stamp = dt.toISOString().slice(0, 10);
            if (c.birthday_channel && dt.getHours() >= 9 && d.meta.bday_done !== stamp) {
                d.meta.bday_done = stamp; store.save(g);
                const kids = Object.entries(d.bdays).filter(([, v]) => v === today).map(([u]) => u);
                if (kids.length) await send(c.birthday_channel, { content: '🎂 Alles Gute zum Geburtstag ' + kids.map(mention).join(', ') + '! 🎉', allowed_mentions: { users: kids } }).catch(e => log('Geburtstag:', e.message));
            }
        }
    }

    return { COMMANDS, H, EPH, onMessage, onMemberAdd, onMemberRemove, onGuild, onMessageDelete, onMessageUpdate, onComponent, tick, levelOf, automod };
}

module.exports = { create, COMMANDS, levelOf, lvlNeed, P };
