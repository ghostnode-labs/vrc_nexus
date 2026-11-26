'use strict';
process.env.NEXUS_NO_SERVER_CHECK = '1';   // Tests: keine echten Server-Prüfungen
/* Tests ohne Netzwerk und ohne Electron:  npm test */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dgram = require('dgram');
const U = require('../backend/util');
const { openDatabase } = require('../backend/db');
const { LogParser, LogWatcher, oscEncode, oscDecode, GameLog } = require('../backend/gamelog');
const { formToObject } = require('../backend/app');

const tests = [];
/** Test: Nexus-Konto mit „Verified 18+“ und NSFW-Schalter (wie vom Server bestätigt) */
const grant18 = (app, on = true) => app.account.store({ token: 'a'.repeat(64), at: Date.now(), account: { vrc_id: app.account.myId(), name: 'Test', verified18: true, age_status: '18+', age_until: Math.floor(Date.now() / 1000) + 86400, nsfw_on: on } });
const test = (name, fn) => tests.push([name, fn]);

test('Ort zerlegen', () => {
    const l = U.location('wrld_1:123~hidden(usr_x)~region(eu)');
    assert.strictEqual(l.access, 'Friends+');
    assert.strictEqual(l.region, 'EU');
    assert.strictEqual(l.name, '123');
    assert.strictEqual(U.location('wrld_1:9~private(usr_x)~canRequestInvite').access, 'Invite+');
    assert.strictEqual(U.location('wrld_1:9~group(grp_a)~groupAccessType(plus)').access, 'Group+');
    assert.strictEqual(U.location('offline').kind, 'offline');
    assert.strictEqual(U.location('traveling:wrld_2:1').kind, 'traveling');
});

test('Vertrauensstufe & Text', () => {
    assert.strictEqual(U.trust(['system_trust_basic', 'system_trust_known'])[0], 'User');
    assert.strictEqual(U.trust(['admin_moderator'])[0], 'VRChat-Team');
    const h = U.formatText('<b>hi</b>\nhttps://vrchat.com/x.');
    assert.ok(h.includes('&lt;b&gt;') && h.includes('<br>') && h.includes('href="https://vrchat.com/x"'));
    assert.strictEqual(U.cut('🦊🦊🦊', 2), '🦊🦊');
    assert.strictEqual(U.imgUrl('https://api.vrchat.cloud/api/1/file/file_00000001-1111-2222-3333-444444444444/3/file'), 'nexus.php?img=file_00000001-1111-2222-3333-444444444444&v=3');
    assert.throws(() => U.valid('evil', 'usr'));
});

test('Formular mit Listen', () => {
    assert.deepStrictEqual(formToObject([['act', 'x'], ['ids[]', 'a'], ['ids[]', 'b']]), { act: 'x', ids: ['a', 'b'] });
});

test('Datenbank: Schema, Einstellungen, Speichern', async () => {
    const f = path.join(os.tmpdir(), 'nexus-test-' + process.pid + '.sqlite');
    let db = await openDatabase(f);
    db.setSetting('x', 'y');
    db.prepare('INSERT INTO worlds (world_id, name) VALUES (?, ?)').run('wrld_1', 'Testwelt 🦊');
    db.close();
    db = await openDatabase(f);
    assert.strictEqual(db.setting('x'), 'y');
    assert.strictEqual(db.prepare('SELECT name FROM worlds WHERE world_id = ?').value('wrld_1'), 'Testwelt 🦊');
    assert.strictEqual(db.prepare('PRAGMA user_version').value(), 8);
    db.close();
    fs.unlinkSync(f);
});

const SAMPLE = `2026.11.12 20:00:02 Log        -  User Authenticated: Luna Fox (usr_11111111-2222-3333-4444-555555555555)
2026.11.12 20:00:10 Log        -  [Behaviour] Joining wrld_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:12345~friends(usr_11111111-2222-3333-4444-555555555555)~region(eu)
2026.11.12 20:00:11 Log        -  [Behaviour] Joining or Creating Room: The Great Pug
2026.11.12 20:00:16 Log        -  [Behaviour] OnPlayerJoined Wolf Byte (usr_99999999-2222-3333-4444-555555555555)
2026.11.12 20:00:17 Log        -  [Behaviour] OnPlayerJoined OldName
2026.11.12 20:01:00 Log        -  [Behaviour] Switching Luna Fox to avatar Novabeast Deluxe
2026.11.12 20:02:00 Log        -  [Video Playback] Attempting to resolve URL 'https://www.youtube.com/watch?v=abc'
2026.11.12 20:04:00 Log        -  [API] Received Notification: <Notification from username:Wolf Byte, sender user id:usr_99999999-2222-3333-4444-555555555555 to of type: friendRequest, id: not_1> received
2026.11.12 20:05:01 Log        -  [Behaviour] OnPlayerLeft Wolf Byte (usr_99999999-2222-3333-4444-555555555555)
2026.11.12 20:06:00 Log        -  [Behaviour] OnLeftRoom
2026.11.12 20:07:00 Log        -  VRCApplication: OnApplicationQuit at 1234.5`;

test('Log-Parser', () => {
    const p = new LogParser();
    const ev = [];
    for (const l of SAMPLE.split('\n')) ev.push(...p.feed(l + '\r'));
    assert.deepStrictEqual(ev.map(e => e.kind), ['world_join', 'player_join', 'player_join', 'avatar', 'video', 'notification', 'player_leave', 'world_leave', 'vrc_quit']);
    assert.strictEqual(ev[0].world_name, 'The Great Pug');
    assert.ok(ev[0].instance.startsWith('12345~friends'));
    assert.strictEqual(ev[1].player_id, 'usr_99999999-2222-3333-4444-555555555555');
    assert.strictEqual(ev[3].detail, 'Novabeast Deluxe');
    assert.strictEqual(ev[5].detail, 'Freundschaftsanfrage');
    assert.strictEqual(p.state.running, false);
});

test('Log-Watcher (mitlesen, halbe Zeilen, neue Datei)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nxlog-'));
    const f1 = path.join(dir, 'output_log_2026-11-12_19-59-00.txt');
    const lines = SAMPLE.split('\n').map(l => l + '\r\n');
    fs.writeFileSync(f1, lines.slice(0, 3).join('') + lines[3].slice(0, 25));
    const w = new LogWatcher(dir, new LogParser());
    assert.deepStrictEqual(w.poll().map(e => e.kind), ['vrc_start', 'world_join']);
    fs.appendFileSync(f1, lines[3].slice(25) + lines[4]);
    assert.deepStrictEqual(w.poll().map(e => e.kind), ['player_join', 'player_join']);
    assert.deepStrictEqual(w.poll(), []);
    const f2 = path.join(dir, 'output_log_2026-11-12_21-00-00.txt');
    fs.writeFileSync(f2, '2026.11.12 21:00:05 Log        -  [Behaviour] Joining or Creating Room: Zweite Welt\n');
    const t = Date.now() / 1000 + 5;
    fs.utimesSync(f2, t, t);
    assert.deepStrictEqual(w.poll().map(e => e.kind), ['vrc_start', 'world_join']);
    assert.strictEqual(w.parser.state.worldName, 'Zweite Welt');
    fs.rmSync(dir, { recursive: true });
});

test('OSC kodieren/dekodieren', () => {
    const pkt = oscEncode('/chatbox/input', 'Hallo 🦊', true, false);
    assert.strictEqual(pkt.length % 4, 0);
    assert.deepStrictEqual(oscDecode(pkt), [['/chatbox/input', ['Hallo 🦊', true, false]]]);
    assert.deepStrictEqual(oscEncode('/avatar/parameters/Ears', { float: 0.5 }), Buffer.concat([Buffer.from('/avatar/parameters/Ears\0,f\0\0'), Buffer.from([0x3f, 0, 0, 0])]));
    assert.deepStrictEqual(oscDecode(oscEncode('/input/Jump', 1)), [['/input/Jump', [1]]]);
    const m1 = oscEncode('/avatar/parameters/A', true), m2 = oscEncode('/avatar/parameters/B', 3);
    const len = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
    assert.deepStrictEqual(oscDecode(Buffer.concat([Buffer.from('#bundle\0'), Buffer.alloc(8), len(m1.length), m1, len(m2.length), m2])), [['/avatar/parameters/A', [true]], ['/avatar/parameters/B', [3]]]);
});

test('Spiel-Log: speichern, doppelt erkennen, OSC senden', async () => {
    const db = await openDatabase(null);
    const g = new GameLog(db);
    g.osc.stopListen();
    const p = new LogParser();
    const ev = [];
    for (const l of SAMPLE.split('\n')) ev.push(...p.feed(l));
    assert.strictEqual(g.store(ev), ev.length);
    assert.strictEqual(g.store(ev), 0);
    assert.strictEqual(g.players(3650).length, 2);
    assert.strictEqual(g.visits(3650).length, 1);
    // 3.9: wer war in einer (auch geschlossenen) Instanz
    const seen = g.instancePlayers('wrld_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:12345~friends(usr_11111111-2222-3333-4444-555555555555)~region(eu)');
    assert.strictEqual(seen.visits, 1);
    const wolf = seen.players.find(x => x.name === 'Wolf Byte');
    assert.ok(wolf && wolf.id === 'usr_99999999-2222-3333-4444-555555555555' && wolf.seconds >= 280 && wolf.seconds <= 300, JSON.stringify(seen));
    assert.ok(seen.players.some(x => x.name === 'OldName'));
    assert.deepStrictEqual(g.instancePlayers('wrld_x:999').players, []);
    const sock = dgram.createSocket('udp4');
    const got = [];
    sock.on('message', m => got.push(oscDecode(m)[0]));
    await new Promise(r => sock.bind(0, '127.0.0.1', r));
    g.osc.configure('127.0.0.1', sock.address().port);
    await g.oscSend('param', { name: 'Tail', type: 'float', value: '0,25' });
    await g.oscSend('chatbox', { text: 'Hi', sound: '1' });
    await U.sleep(200);
    sock.close();
    assert.deepStrictEqual(got[0], ['/avatar/parameters/Tail', [0.25]]);
    assert.deepStrictEqual(got[1], ['/chatbox/input', ['Hi', true, true]]);
    assert.strictEqual(g.oscRecent()[0].status, 'done');
    assert.throws(() => g.presetSave('', 'chatbox', {}));
    g.presetSave('Hallo', 'chatbox', { text: 'Hi' });
    assert.strictEqual(g.presets().length, 1);
    assert.ok(g.exportCsv().split('\n').length >= ev.length);
});


test('PNG-Text lesen/schreiben (Screenshot-Infos)', () => {
    const { pngText, pngSetText, crc32 } = require('../backend/tools');
    assert.strictEqual(crc32(Buffer.from('IEND')), 0xae426082);
    const zlib = require('zlib');
    const chunk = (t, d) => { const h = Buffer.alloc(8); h.writeUInt32BE(d.length); h.write(t, 4, 'latin1'); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t, 'latin1'), d]))); return Buffer.concat([h, d, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(3, 4); ihdr[8] = 8; ihdr[9] = 2;
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(3 * 13))), chunk('IEND', Buffer.alloc(0))]);
    const meta = JSON.stringify({ application: 'VRC Nexus', world: { name: 'Welt 🦊' }, players: [{ displayName: 'A' }] });
    const out = pngSetText(png, 'Description', meta);
    const t = pngText(out);
    assert.strictEqual(t.width, 4);
    assert.strictEqual(JSON.parse(t.text.Description).world.name, 'Welt 🦊');
    const again = pngText(pngSetText(out, 'Description', '{"x":1}'));
    assert.strictEqual(again.text.Description, '{"x":1}');           // ersetzt, nicht doppelt
    assert.strictEqual(pngText(Buffer.from('kein png')), null);
});

test('Einstellungen: Standard, Prüfung, Token', async () => {
    const { Settings } = require('../backend/settings');
    const db = await openDatabase(null);
    const s = new Settings(db);
    assert.strictEqual(s.get('notify.desktop'), true);
    assert.ok(s.get('int.api_token').length >= 20);
    let seen = null;
    s.onChange(c => { seen = c; });
    s.save({ 'ui.zoom': '999', 'ui.accent': 'rot', 'notify.player_join': 'quatsch', 'sys.backup_keep': '3', 'unbekannt': 1, 'int.api_token': 'x', 'notify.quiet_from': '22:00' });
    assert.strictEqual(s.get('ui.zoom'), 150);
    assert.strictEqual(s.get('ui.accent'), '#38d5e6');
    assert.strictEqual(s.get('notify.player_join'), 'friends');
    assert.strictEqual(s.get('sys.backup_keep'), 3);
    assert.notStrictEqual(s.get('int.api_token'), 'x');
    assert.ok(seen.includes('ui.zoom') && seen.includes('notify.quiet_from'));
    assert.throws(() => s.save({ 'int.webhook': 'https://example.org/hook' }));
    assert.throws(() => s.save({ 'int.rpc_client': 'abc' }));
    s.save({ 'adv.user_agent': 'Test/1.0' });
    assert.strictEqual(db.setting('vrc_user_agent'), 'Test/1.0');
    const tok = s.get('int.api_token');
    assert.notStrictEqual(s.newToken(), tok);
});

test('Discord Rich Presence (über nachgebaute Discord-IPC)', async () => {
    if (process.platform === 'win32') return;
    const net = require('net');
    const { DiscordRpc, frame } = require('../backend/discordrpc');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dipc-'));
    process.env.DISCORD_IPC_DIR = dir;
    const got = [];
    const srv = net.createServer(sock => {
        let buf = Buffer.alloc(0);
        sock.on('data', d => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 8 && buf.length >= 8 + buf.readInt32LE(4)) {
                const op = buf.readInt32LE(0), len = buf.readInt32LE(4), msg = JSON.parse(buf.slice(8, 8 + len));
                buf = buf.slice(8 + len);
                got.push([op, msg]);
                if (op === 0) sock.write(frame(1, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } }));
            }
        });
    });
    await new Promise(r => srv.listen(path.join(dir, 'discord-ipc-0'), r));
    const rpc = new DiscordRpc();
    await rpc.connect('123456789012345678');
    rpc.setActivity({ details: 'The Great Pug', state: 'Public · 5 Spieler' });
    await U.sleep(300);
    assert.strictEqual(got[0][1].client_id, '123456789012345678');
    assert.strictEqual(got[1][1].cmd, 'SET_ACTIVITY');
    assert.strictEqual(got[1][1].args.activity.details, 'The Great Pug');
    assert.strictEqual(rpc.status(), 'verbunden');
    rpc.close(); srv.close();
    delete process.env.DISCORD_IPC_DIR;
});

test('Werkzeuge: Benachrichtigung an XSOverlay, Startoptionen, Spielerliste', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const opened = [];
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir(), openExternal: u => opened.push(u), notify: () => {} } });
    app.game.osc.stopListen();
    const sock = dgram.createSocket('udp4');
    const got = [];
    sock.on('message', m => got.push(JSON.parse(m)));
    await new Promise(r => sock.bind(0, '127.0.0.1', r));
    app.settings.save({ 'vr.xsoverlay': true, 'vr.only_in_game': false, 'vr.xs_port': sock.address().port, 'notify.desktop': false });
    app.tools.alert('➡ Wolf', 'hat die Instanz betreten');
    await U.sleep(200);
    sock.close();
    assert.strictEqual(got[0].title, '➡ Wolf');
    assert.strictEqual(got[0].sourceApp, 'VRC Nexus');
    const c = app.tools.launchSave({ no_vr: '1', fps: '144', profile: '1', extra: 'x"; rm & y', osc: 'quatsch' });
    assert.strictEqual(c.osc, '');
    assert.ok(!/["&;]/.test(c.extra));
    const r = await app.tools.launch('');
    assert.ok(r.url.startsWith('steam://run/438100//') && opened.length === 1);
    await assert.rejects(app.tools.launch('evil'));
    const p = new LogParser(app.game.state);
    for (const l of SAMPLE.split('\n').slice(0, 5)) p.feed(l);
    const pl = app.tools.playersNow();
    assert.strictEqual(pl.world_name, 'The Great Pug');
    assert.strictEqual(pl.players.length, 2);
    assert.ok(pl.players.some(x => x.name === 'Wolf Byte' && x.id.startsWith('usr_')));
    assert.strictEqual(pl.loc.access, 'Friends');
    assert.deepStrictEqual(app.tools.activity('2000-01-01').segments, []);
    app.tools.stop();
});


// Nachbau von DeepL und Google Translate für die Tests
function trMock() {
    const http = require('http');
    const seen = [];
    const srv = http.createServer((req, res) => {
        let b = '';
        req.on('data', d => { b += d; });
        req.on('end', () => {
            const j = JSON.parse(b || '{}');
            seen.push({ url: req.url, auth: req.headers.authorization || '', body: j });
            res.setHeader('Content-Type', 'application/json');
            if (req.url.startsWith('/v2/translate')) {
                if (req.headers.authorization !== 'DeepL-Auth-Key deepl-test-key-1234567890:fx') { res.statusCode = 403; return res.end('{"message":"Wrong key"}'); }
                return res.end(JSON.stringify({ translations: [{ detected_source_language: 'DE', text: '[' + j.target_lang + '] ' + j.text[0] }] }));
            }
            if (req.url.startsWith('/language/translate/v2')) return res.end(JSON.stringify({ data: { translations: [{ translatedText: '<' + j.target + '> ' + j.q[0], detectedSourceLanguage: 'de' }] } }));
            res.statusCode = 404; res.end('{}');
        });
    });
    return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, seen, base: 'http://127.0.0.1:' + srv.address().port })));
}

test('Übersetzen: DeepL, Google, Chatbox-Modus, Schlüssel verschlüsselt', async () => {
    const m = await trMock();
    process.env.NEXUS_DEEPL_BASE = m.base; process.env.NEXUS_GOOGLE_BASE = m.base;
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const crypt = { encrypt: s => 'enc:' + Buffer.from(s).toString('base64'), decrypt: s => Buffer.from(s.slice(4), 'base64').toString() };
    const app = new NexusApp({ db, crypt, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    await assert.rejects(app.tr.translate('Hallo', 'EN-US'), /Kein Übersetzungs-Schlüssel/);
    app.tr.saveKey('deepl', 'deepl-test-key-1234567890:fx');
    app.tr.saveKey('google', 'google-test-key-ABCDEFGHIJKLMNOP');
    assert.ok(db.setting('tr_keys').startsWith('enc:'));
    assert.ok(!JSON.stringify(app.tr.status()).includes('deepl-test-key-1234567890'));
    const r = await app.tr.translate('Hallo Welt', 'JA');
    assert.deepStrictEqual([r.text, r.provider, r.detected], ['[JA] Hallo Welt', 'deepl', 'DE']);
    const g = await app.tr.translate('Hallo', 'JA', 'google');
    assert.strictEqual(g.text, '<ja> Hallo');
    app.settings.save({ 'tr.chat_mode': 'both', 'tr.chat_target': 'EN-US' });
    assert.strictEqual((await app.tr.chat('Hi du')).text, 'Hi du / [EN-US] Hi du');
    app.settings.save({ 'tr.chat_mode': 'both_nl' });
    assert.strictEqual((await app.tr.chat('Hi du')).text, 'Hi du\n[EN-US] Hi du');
    app.tr.saveKey('deepl', 'deepl-falscher-schluessel-0000000:fx');
    app.tr.cache.clear();
    await assert.rejects(app.tr.translate('Neu', 'EN-US', 'deepl'), /DeepL: Schlüssel ungültig/);
    const st = await app.trAction('tr_prefs', { provider: 'google', ui_target: 'FR' });
    assert.strictEqual(st.provider, 'google');
    assert.strictEqual(st.prefs.ui_target, 'FR');
    m.srv.close(); app.tools.stop();
    delete process.env.NEXUS_DEEPL_BASE; delete process.env.NEXUS_GOOGLE_BASE;
});

test('Chatbox: /n, Aufteilen, Platzhalter, Rotator mit mehreren Texten', async () => {
    const { chatNewlines, splitChat } = require('../backend/gamelog');
    assert.strictEqual(chatNewlines('Hallo/nWelt\\nzwei https://x.de/n ok'), 'Hallo\nWelt\nzwei https://x.de/n ok');
    const parts = splitChat('Wort '.repeat(80).trim(), 144);
    assert.ok(parts.length === 3 && parts.every(p => [...p].length <= 144) && parts[2].endsWith('(3/3)'));
    const db = await openDatabase(null);
    const g = new GameLog(db);
    g.osc.stopListen();
    g.vars = () => ({ freunde: '7', status: 'Online' });
    g.state.worldName = 'Pug'; g.state.players.set('a', { id: 'a', name: 'A', since: 0 });
    assert.strictEqual(g.rotatorText('🌐 {welt}/n👥 {spieler} · {freunde} Freunde · {status} · {gibtsnicht}'), '🌐 Pug\n👥 1 · 7 Freunde · Online · {gibtsnicht}');
    assert.ok(/^\d+ h \d\d min$|^\d+ T \d+ h \d\d min$/.test(g.rotatorText('{countdown:2099-01-01 00:00}')));
    assert.ok(['a', 'b'].includes(g.rotatorText('{zufall:a|b}')));
    const c = g.saveCfg({ rotator_texts: 'eins\n\nzwei\ndrei', rotator_mode: 'seq' });
    assert.deepStrictEqual([g.rotatorNext(c), g.rotatorNext(c), g.rotatorNext(c), g.rotatorNext(c)], ['eins', 'zwei', 'drei', 'eins']);
    // senden: aufteilen + Platzhalter + Zeilenumbruch
    const sock = dgram.createSocket('udp4');
    const got = [];
    sock.on('message', m => got.push(oscDecode(m)[0][1][0]));
    await new Promise(r => sock.bind(0, '127.0.0.1', r));
    g.osc.configure('127.0.0.1', sock.address().port);
    g.osc.lastChat = 0;
    await g.oscSend('chatbox', { text: 'In {welt}/nhallo', sound: '1' });
    await g.oscSend('chatbox', { clear: '1' });
    await U.sleep(3600);
    sock.close();
    assert.deepStrictEqual(got.slice(0, 2), ['In Pug\nhallo', '']);
});


test('Auto-Update: neueste Version finden, Windows installieren, Android öffnen', async () => {
    const { newer } = require('../backend/updater');
    assert.ok(newer('1.2.10', '1.2.9') && newer('2.0.0', '1.9.9') && !newer('1.2.1', '1.2.1') && !newer('1.2.0', '1.2.1'));
    const http = require('http');
    const asset = (n, sz) => ({ name: n, size: sz, browser_download_url: 'https://github.com/x/releases/download/t/' + n });
    const releases = [
        { tag_name: 'vrc-nexus-v99.0.1', draft: false, prerelease: true, assets: [] },                       // Vorabversion → ignorieren
        { tag_name: 'vrc-nexus-v9.2.0', draft: false, prerelease: false, assets: [asset('VRC-Nexus-9.2.0-android.apk', 13)] },     // Windows-Setup noch nicht hochgeladen
        { tag_name: 'anderes-v100.0.0', draft: false, prerelease: false, assets: [] },                         // anderes Projekt → ignorieren
        { tag_name: 'vrc-nexus-v9.1.0', draft: false, prerelease: false, body: '## Neu\n**Mehr**', html_url: 'https://github.com/x/releases/tag/vrc-nexus-v9.1.0',
          published_at: '2026-11-13T10:00:00Z', assets: [asset('VRC-Nexus-9.1.0-Setup.exe', 10), asset('VRC-Nexus-9.1.0-portable.exe', 11), asset('VRC-Nexus-9.1.0-android.apk', 12)] },
        { tag_name: 'vrc-nexus-v9.0.9', draft: false, prerelease: false, assets: [] },
    ];
    const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.url.startsWith('/repos/ghostnode-labs/vrc_nexus/releases') ? releases : [])); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.NEXUS_UPDATE_API = 'http://127.0.0.1:' + srv.address().port;
    const { NexusApp } = require('../backend/app');
    const calls = [];
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir(), installUpdate: async (a, p) => { p('50 %'); calls.push(a.setup.name); } } });
    app.game.osc.stopListen();
    const st = await app.updater.check();
    assert.strictEqual(st.version, '9.1.0');           // 9.2.0 hat noch kein Setup → Windows bekommt 9.1.0 (kein „Datei fehlt“)
    assert.ok(st.available && st.assets.setup && st.assets.apk && st.assets.portable);
    assert.ok((await app.post({ act: 'update_check' }, {})).msg.includes('9.1.0'));
    const r = await app.post({ act: 'update_install' }, {});
    assert.ok(r.msg.includes('9.1.0') && calls[0] === 'VRC-Nexus-9.1.0-Setup.exe');
    // Android: Download öffnen statt installieren
    const opened = [];
    const db2 = await openDatabase(null);
    const mob = new NexusApp({ db: db2, crypt: { encrypt: s => s, decrypt: s => s }, mobile: true, host: { userData: os.tmpdir(), openExternal: u => opened.push(u) } });
    mob.game.osc.stopListen();
    await mob.updater.check();
    assert.strictEqual(mob.updater.status().platform, 'android');
    assert.strictEqual(mob.updater.status().version, '9.2.0');     // Android hat seine APK schon
    await mob.updater.install();
    assert.ok(opened[0].endsWith('VRC-Nexus-9.2.0-android.apk'));
    srv.close(); app.tools.stop(); mob.tools.stop();
    delete process.env.NEXUS_UPDATE_API;
});

test('1.3: Parameter-Erkennung, Makros, Kamera, Automatik, Sprache, Rückblick', async () => {
    const { NexusApp } = require('../backend/app');
    const { parse } = require('../backend/macros');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx13-'));
    const U1 = 'usr_11111111-2222-3333-4444-555555555555', A = 'avtr_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    fs.mkdirSync(path.join(dir, 'OSC', U1, 'Avatars'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'OSC', U1, 'Avatars', A + '.json'), '﻿' + JSON.stringify({ id: A, name: 'Fuchs', parameters: [
        { name: 'Ears', input: { type: 'Bool' }, output: { type: 'Bool' } }, { name: 'Outfit', input: { type: 'Int' }, output: { type: 'Int' } }, { name: 'VelocityX', output: { type: 'Float' } }] }));
    process.env.NEXUS_VRCHAT_DIR = dir;
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: dir } });
    app.game.osc.stopListen();
    const sent = [];
    app.game.osc.send = async (a, ...x) => { sent.push(a + ' ' + JSON.stringify(x)); };
    app.game.osc.chatbox = async t => { sent.push('/chatbox/input ' + t); };
    app.game.osc.avatarId = A;
    app.game.osc.params = { Ears: true };
    // Parameter
    const pl = await app.post({ act: 'client_params' }, {});
    assert.strictEqual(pl.avatar.name, 'Fuchs');
    assert.deepStrictEqual(pl.params.map(p => p.name + ':' + p.type + ':' + p.builtin), ['Ears:bool:false', 'Outfit:int:false', 'VelocityX:float:true']);
    await app.post({ act: 'client_param_fav', avatar: A, name: 'Outfit' }, {});
    assert.strictEqual((await app.post({ act: 'client_params' }, {})).params[0].name, 'Outfit');
    // Makros
    assert.throws(() => parse('blub 1'), /Unbekannter Schritt/);
    assert.strictEqual(parse('param Hue = 0,5\nwait 1,5')[1].s, 1.5);
    await app.macros.run('param Ears = 0\ncam Zoom 80\ncam Capture\nchatbox Hallo {name}');
    assert.ok(sent.includes('/avatar/parameters/Ears [false]') && sent.includes('/usercamera/Zoom [{"float":80}]') && sent.includes('/usercamera/Capture [true]'), sent.join(' | '));
    // Kamera-Vorlage
    app.game.osc.cam = { Zoom: 60, Pose: [1, 2, 3, 0, 90, 0] };
    await app.post({ act: 'cam_preset_save', name: 'Porträt' }, {});
    sent.length = 0;
    await app.post({ act: 'cam_preset_load', name: 'Porträt' }, {});
    assert.ok(sent.some(x => x.startsWith('/usercamera/Pose')), sent.join(' | '));
    // Automatik: Begrüßung bei neuem Spieler
    await app.post({ act: 'auto_save', name: 'Hallo', trigger: 'player_join', arg: 'all', script: 'chatbox Hi {spieler_name}!', cooldown: 0 }, {});
    app.game.state.running = true;
    sent.length = 0;
    app.auto.onGameEvent({ ts: Math.floor(Date.now() / 1000), kind: 'player_join', player_id: 'usr_x', player_name: 'Neko' });
    await U.sleep(50);
    assert.ok(sent.includes('/chatbox/input Hi Neko!'), sent.join(' | '));
    // AFK an/aus über OSC
    await app.post({ act: 'auto_save', name: 'AFK', trigger: 'afk_on', script: 'chatbox AFK', cooldown: 0 }, {});
    sent.length = 0;
    app.auto.onOsc('/avatar/parameters/AFK', [true]);
    await U.sleep(50);
    assert.ok(sent.includes('/chatbox/input AFK'));
    // Sprache: Ersatz-Programm statt whisper.cpp
    const fake = path.join(dir, 'fakewhisper.js');
    fs.writeFileSync(fake, '#!/usr/bin/env node\nconsole.log("[00:00:00.000 --> 00:00:01.000]  Hallo Welt");\n');
    fs.chmodSync(fake, 0o755);
    if (process.platform !== 'win32') {
        process.env.NEXUS_WHISPER_BIN = fake;
        app.speech.saveCfg({ enabled: '1', prefix: '' });
        sent.length = 0;
        const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(3000)]);
        const r = await app.post({ act: 'speech_transcribe', audio: wav.toString('base64') }, {});
        assert.strictEqual(r.text, 'Hallo Welt');
        assert.ok(sent.includes('/chatbox/input Hallo Welt'), sent.join(' | '));
        delete process.env.NEXUS_WHISPER_BIN;
        // 1.7.5: Paket mit veraltetem „main“ + „whisper-cli“ → whisper-cli wird genommen; nur „main“ → verständliche Meldung
        const rel = path.join(app.speech.dir(), 'bin', 'Release');
        fs.mkdirSync(rel, { recursive: true });
        fs.writeFileSync(path.join(rel, 'main'), '#!/usr/bin/env node\nconsole.error("WARNING: The binary main is deprecated. Please use whisper-cli instead.");process.exit(1);\n', { mode: 0o755 });
        fs.writeFileSync(path.join(rel, 'whisper-cli'), '#!/usr/bin/env node\nconsole.log("Hallo aus whisper-cli");\n', { mode: 0o755 });
        fs.writeFileSync(app.speech.modelPath('tiny'), 'x');
        app.speech.saveCfg({ enabled: '1', prefix: '', model: 'tiny' });
        assert.strictEqual(path.basename(app.speech.binPath()), 'whisper-cli');
        const r2 = await app.post({ act: 'speech_transcribe', audio: wav.toString('base64') }, {});
        assert.strictEqual(r2.text, 'Hallo aus whisper-cli');
        fs.rmSync(path.join(rel, 'whisper-cli'));
        assert.strictEqual(path.basename(app.speech.binPath()), 'main');
        await assert.rejects(app.post({ act: 'speech_transcribe', audio: wav.toString('base64') }, {}), /veraltet/);
        fs.rmSync(path.join(app.speech.dir(), 'bin'), { recursive: true, force: true });
    }
    // Rückblick & Startseite
    const now = Math.floor(Date.now() / 1000);
    app.game.store([{ ts: now - 3600, kind: 'world_join', world_id: 'wrld_1', world_name: 'Testwelt' }, { ts: now - 3000, kind: 'player_join', player_id: 'usr_y', player_name: 'Luna' }, { ts: now - 600, kind: 'world_leave' }]);
    const rc = await app.post({ act: 'ins_recap', days: 7 }, {});
    assert.strictEqual(rc.top_worlds[0].name, 'Testwelt');
    assert.ok(rc.playtime >= 2900 && rc.top_people[0].name === 'Luna');
    const home = await app.post({ act: 'home_data' }, {});
    assert.ok(Array.isArray(home.macros) && home.friends && home.cam);
    // 1.6: Daten der neuen Widgets
    assert.ok(Array.isArray(home.events) && Array.isArray(home.anniv) && Array.isArray(home.rules) && Array.isArray(home.osclog) && home.coll && 'week' in home && 'stream' in home);
    // OSC-Log: Kategorien, nur Änderungen, Drosselung, Gesendetes
    const { category } = require('../backend/osclog');
    assert.deepStrictEqual(['/avatar/change', '/avatar/parameters/Ears', '/avatar/parameters/Outfit', '/avatar/parameters/Hue', '/avatar/parameters/VelocityX', '/avatar/parameters/GestureLeft', '/avatar/parameters/AFK', '/usercamera/Zoom', '/chatbox/input', '/input/Jump', '/foo']
        .map((a, i) => category(a, [[A, true, 3, 0.5, 0.1, 2, true, 50, 'x', 1, 1][i]])), ['avatar', 'toggle', 'int', 'float', 'motion', 'gesture', 'state', 'camera', 'chatbox', 'input', 'other']);
    const L = app.osclog;
    L.buf = [];
    L.add('in', '/avatar/parameters/Ears', [true]); L.add('in', '/avatar/parameters/Ears', [true]); L.add('in', '/avatar/parameters/Ears', [false]);
    for (let i = 0; i < 5; i++) L.add('in', '/avatar/parameters/VelocityX', [i / 10]);
    L.add('out', '/chatbox/input', ['Hi', true, false]);
    const ql = L.query({ range: 'live' });
    assert.strictEqual(ql.counts.toggle, 2);
    assert.strictEqual(ql.counts.motion, 1);
    assert.strictEqual(ql.items[0].d, 'out');
    assert.deepStrictEqual(ql.items.find(e => e.c === 'toggle').p, true);
    L.flush();
    assert.ok(L.query({ range: 'today' }).total >= 4);
    app.tools.stop();
    delete process.env.NEXUS_VRCHAT_DIR;
});

test('1.4: Stream-Bot (Twitch-Zeilen, Punkte, Befehle, Belohnungen), Cloud-Sicherung, OBS-Zugriff', async () => {
    const { NexusApp } = require('../backend/app');
    const { CloudBackup } = require('../backend/cloudbackup');
    const http = require('http');
    const db = await openDatabase(null);
    const crypt = { encrypt: s => 'x' + Buffer.from(s).toString('base64'), decrypt: s => Buffer.from(s.slice(1), 'base64').toString() };
    const app = new NexusApp({ db, crypt, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const sent = [];
    app.game.osc.send = async (a, ...x) => { sent.push(a + ' ' + JSON.stringify(x)); };
    const sb = app.stream;
    const said = [];
    sb.twSend = t => { said.push(t); return true; };
    sb.saveCfg({ greet: '1', p_per_msg: 2, p_msg_cooldown: 0 });
    // echte Twitch-IRC-Zeile mit Tags
    sb.twLine('@badges=moderator/1;display-name=ModKatze;mod=1;user-id=42 :modkatze!m@m.tmi.twitch.tv PRIVMSG #luna :Hallo!');
    sb.twLine('@badges=;display-name=FoxFan;mod=0;user-id=7 :foxfan!f@f.tmi.twitch.tv PRIVMSG #luna :!punkte');
    await U.sleep(20);
    assert.ok(said.includes('Willkommen ModKatze! 👋'), said.join(' | '));
    assert.ok(said.some(t => /^FoxFan hat 2 Punkte\./.test(t)), said.join(' | '));
    sb.twLine('@badges=moderator/1;display-name=ModKatze;mod=1;user-id=42 :modkatze!m@m.tmi.twitch.tv PRIVMSG #luna :!addpunkte foxfan 100');
    await U.sleep(20);
    assert.strictEqual(sb.findUser('foxfan').a.p, 102);       // 2 (eine Nachricht) + 100
    // Belohnung → Makro → OSC
    const c = sb.cfg();
    c.rewards = [{ name: 'ohren', cost: 50, script: 'param Ears = 1', cooldown: 0, response: '{user} löst ein ({kosten})' }];
    sb.writeCfg(c);
    sb.twLine('@badges=;display-name=FoxFan;mod=0;user-id=7 :foxfan!f@f.tmi.twitch.tv PRIVMSG #luna :!ohren');
    await U.sleep(50);
    assert.ok(sent.includes('/avatar/parameters/Ears [1]'), sent.join(' | '));
    assert.strictEqual(sb.findUser('foxfan').a.p, 102 + 2 - 50);
    assert.ok(said.includes('FoxFan löst ein (50)'), said.join(' | '));
    // zu wenig Punkte → nichts passiert
    sent.length = 0;
    sb.twLine('@badges=;display-name=Arm;mod=0;user-id=9 :arm!a@a.tmi.twitch.tv PRIVMSG #luna :!ohren');
    await U.sleep(30);
    assert.ok(!sent.length && said.some(t => /kostet 50/.test(t)));
    // nicht-Mod darf keine Punkte vergeben
    sb.twLine('@badges=;display-name=Arm;mod=0;user-id=9 :arm!a@a.tmi.twitch.tv PRIVMSG #luna :!addpunkte arm 9999');
    await U.sleep(20);
    assert.ok(sb.findUser('arm').a.p < 100);
    // Befehls-Baukasten: nur Abonnenten, Wert aus dem Chat → Avatar-Parameter, Hilfe ohne Wert, keine eingeschleusten Schritte
    const c2 = sb.cfg();
    c2.commands.push({ name: 'farbe', aliases: 'color', perm: 'sub', cost: 0, cooldown: 0, user_cooldown: 0, script: 'param Color = {1}', response: 'Farbe {1}', usage: '<0–7>' });
    sb.writeCfg(c2);
    sent.length = 0; said.length = 0;
    sb.twLine('@badges=;display-name=Normalo;mod=0;user-id=11 :normalo!n@n.tmi.twitch.tv PRIVMSG #luna :!farbe 3');
    await U.sleep(30);
    assert.ok(!sent.length, 'ohne Abo darf nichts passieren');
    sb.twLine('@badges=subscriber/3;display-name=Abo;mod=0;user-id=12 :abo!a@a.tmi.twitch.tv PRIVMSG #luna :!color 4');
    await U.sleep(30);
    assert.ok(sent.includes('/avatar/parameters/Color [4]'), sent.join(' | '));
    sb.twLine('@badges=subscriber/3;display-name=Abo;mod=0;user-id=12 :abo!a@a.tmi.twitch.tv PRIVMSG #luna :!farbe');
    await U.sleep(30);
    assert.ok(said.some(t => /So geht's: !farbe <0–7>/.test(t)), said.join(' | '));
    assert.ok(!/[\r\n;]/.test(sb.fillScript('param Color = {1}', { 1: '5;\nwebhook http://x' })));
    const plain = Buffer.from('SQLite format 3\0' + 'x'.repeat(5000));
    const blob = CloudBackup.seal(plain, 'Passwort123');
    assert.ok(!blob.includes(Buffer.from('xxxxxxxx')));
    assert.ok(CloudBackup.open(blob, 'Passwort123').equals(plain));
    assert.throws(() => CloudBackup.open(blob, 'falsch!!'), /Falsches/);
    blob[blob.length - 3] ^= 1;
    assert.throws(() => CloudBackup.open(blob, 'Passwort123'), /Falsches/);
    // OBS-Seiten: ohne Stream-Deck-Schnittstelle erreichbar, fremde Webseiten nicht
    app.settings.save({ 'int.api': false, 'int.obs': true, 'int.api_port': 17991 });
    app.tools.api.apply();
    await U.sleep(100);
    const tok = app.settings.get('int.api_token');
    const get = (p, origin) => new Promise(res => http.get({ host: '127.0.0.1', port: 17991, path: p, headers: origin ? { Origin: origin } : {} }, r => { r.resume(); res(r.statusCode); }));
    assert.strictEqual(await get('/obs.json?token=' + tok), 200);
    assert.strictEqual(await get('/chat.json?token=' + tok, 'http://127.0.0.1:17991'), 200);
    assert.strictEqual(await get('/obs.json?token=' + tok, 'https://boese.example'), 403);
    assert.strictEqual(await get('/api/state?token=' + tok), 403);       // Stream-Deck-Teil bleibt aus
    assert.strictEqual(await get('/obs.json?token=falsch'), 401);
    app.tools.api.stop(); sb.stop(); app.tools.stop();
});

test('1.8: Chatbox-Module (Status, Zeit, Wetter, Rechner, Netzwerk, Twitch, Puls, VR/Desktop)', async () => {
    const http = require('http');
    // Nachbildungen: Open-Meteo (Wetter + Orte), decapi.me (Twitch), Pulsoid
    const srv = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        const j = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
        if (u.pathname === '/v1/search') return j({ results: [{ name: 'Leipzig', admin1: 'Sachsen', country_code: 'DE', latitude: 51.34, longitude: 12.37 }] });
        if (u.pathname === '/v1/forecast') return j({ current: { temperature_2m: 7.4, apparent_temperature: 4.1, relative_humidity_2m: 81, wind_speed_10m: 13.2, weather_code: 61 } });
        if (u.pathname === '/twitch/uptime/luna') return res.end('2 hours, 5 minutes');
        if (u.pathname === '/twitch/viewercount/luna') return res.end('42');
        if (u.pathname === '/twitch/game/luna') return res.end('VRChat');
        if (u.pathname === '/api/v1/data/heart_rate/latest') return req.headers.authorization === 'Bearer pulsoid-token-1234567890abcdef' ? j({ measured_at: Date.now(), data: { heart_rate: 88 } }) : (res.statusCode = 403, j({}));
        res.statusCode = 404; res.end('');
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const B = 'http://127.0.0.1:' + srv.address().port;
    Object.assign(process.env, { NEXUS_OPENMETEO_BASE: B, NEXUS_GEO_BASE: B, NEXUS_DECAPI_BASE: B, NEXUS_PULSOID_BASE: B, NEXUS_FAKE_VR: '0' });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nxcm-'));
    // nvidia-smi + Netzwerkzähler nachbilden
    const smi = path.join(dir, 'nvidia-smi.js');
    fs.writeFileSync(smi, 'console.log("57, 63, 6144, 12288, 180.5, NVIDIA GeForce RTX 4070");\n');
    process.env.NEXUS_NVIDIA_SMI = smi;
    const netdev = path.join(dir, 'netdev');
    const net = (rx, tx) => fs.writeFileSync(netdev, 'Inter-|   Receive\n face |bytes\n    lo: 999 0 0 0 0 0 0 0 999 0 0 0 0 0 0 0\n  eth0: ' + rx + ' 0 0 0 0 0 0 0 ' + tx + ' 0 0 0 0 0 0 0\n');
    net(1000000, 500000);
    process.env.NEXUS_NETDEV = netdev;
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => 'enc:' + s, decrypt: s => s.replace(/^enc:/, '') }, host: { userData: dir } });
    app.game.osc.stopListen();
    const sent = [];
    app.game.osc.send = async (a, ...x) => { sent.push(a + ' ' + JSON.stringify(x)); };
    app.game.osc.chatbox = async t => { sent.push('/chatbox/input ' + t); };
    app.game.saveCfg({ rotator_enabled: '1', rotator_texts: 'Hallo Welt 🦊\nBin am Basteln', rotator_seconds: 5 });
    const post = (act, d) => app.post(Object.assign({ act }, d || {}), {});
    let r = await post('cm_get');
    assert.ok(r.modules.weather && r.cfg.mods.status.on && !r.cfg.on);
    await post('cm_place', { city: 'Leipzig' });
    for (const k of ['weather', 'system', 'network', 'twitch', 'heart', 'vrchat']) await post('cm_save', { mod: k, mod_on: '1' });
    await post('cm_save', { twitch: 'https://twitch.tv/luna', sep: 'line', on: '1', seconds: 3, only_game: '0' });
    await assert.rejects(post('cm_hr_key', { token: 'kurz' }), /Pulsoid/);
    await post('cm_hr_key', { token: 'pulsoid-token-1234567890abcdef' });
    assert.ok(db.setting('chatmods_hr', '').startsWith('enc:'), 'Token nicht verschlüsselt');
    app.game.state.worldName = 'Testwelt';
    await post('cm_get', { refresh: '1' });
    net(3000000, 1500000);
    await U.sleep(2100);
    r = await post('cm_get', { refresh: '1' });
    const v = r.values;
    assert.strictEqual(v.temp, '7'); assert.strictEqual(v.wetter_symbol, '🌧'); assert.strictEqual(v.gpu, '57'); assert.strictEqual(v.gpu_temp, '63');
    assert.strictEqual(v.twitch_zuschauer, '42'); assert.strictEqual(v.twitch_spiel, 'VRChat'); assert.strictEqual(v.puls, '88');
    assert.ok(/MB\/s|KB\/s/.test(v.netz_down) && v.cpu !== undefined, JSON.stringify(v));
    assert.ok(sent.some(x => x.startsWith('/avatar/parameters/HeartRate [88]')), 'Puls nicht als Avatar-Parameter gesendet');
    let p = r.preview.text;
    // zu lang für 144 Zeichen → ganze Module am Ende fallen weg (hier der Puls), nichts wird mitten im Text abgeschnitten
    assert.ok(Array.from(p).length <= 144 && r.preview.dropped.includes('heart') && !p.includes('💓'), JSON.stringify(r.preview));
    await post('cm_save', { mod: 'system', mod_on: '0' }); await post('cm_save', { mod: 'vrchat', mod_on: '0' });
    r = await post('cm_get'); p = r.preview.text;
    for (const part of ['🌧 7°C', '🔴 LIVE · 👀 42 · VRChat', '💓 88 bpm', '📶 ↓']) assert.ok(p.includes(part), 'fehlt: ' + part + ' in ' + p);
    assert.ok(!r.preview.dropped.length && Array.from(p).length <= 144);
    // Reihenfolge ändern: Puls nach vorn
    await post('cm_save', { order: 'heart,status' });
    r = await post('cm_get');
    assert.ok(r.preview.text.startsWith('💓 88 bpm'), r.preview.text);
    // nur-Desktop-Module verschwinden in VR, Fenster zeigt „In VR“
    await post('cm_save', { mod: 'window', mod_on: '1', where: 'both' });
    process.env.NEXUS_FAKE_VR = '1'; app.chatmods.last.vr = 0;
    r = await post('cm_get');
    assert.ok(!r.preview.text.includes('📶') && r.preview.text.includes('🥽 In VR'), r.preview.text);
    // Senden + Rotator pausiert, solange Module an sind
    sent.length = 0;
    await post('cm_send');
    assert.ok(sent.some(x => x.startsWith('/chatbox/input ') && x.includes('💓 88 bpm')));
    assert.ok(app.game.suppressRotator);
    app.game.lastRot = 0; sent.length = 0; app.game.tick();
    assert.ok(!sent.some(x => x.includes('Hallo Welt')), 'Rotator lief trotz Modulen');
    // AFK ersetzt den Status-Text
    app.auto.afkSince = Date.now() - 5 * 60000;
    r = await post('cm_get');
    assert.ok(r.preview.text.includes('💤 AFK seit 5 min'), r.preview.text);
    // Platzhalter auch im Rotator/Makros nutzbar
    assert.ok(app.game.fill('{temp}°C {puls}').includes('7°C 88'));
    await post('cm_save', { on: '0' });
    assert.ok(!app.game.suppressRotator);
    app.chatmods.stop(); app.tools.stop(); srv.close();
    for (const k of ['NEXUS_OPENMETEO_BASE', 'NEXUS_GEO_BASE', 'NEXUS_DECAPI_BASE', 'NEXUS_PULSOID_BASE', 'NEXUS_FAKE_VR', 'NEXUS_NVIDIA_SMI', 'NEXUS_NETDEV']) delete process.env[k];
});

test('1.9: Sprachausgabe (Windows, Piper, Google, Azure, ElevenLabs, OpenAI) + nach Spracheingabe sprechen', async () => {
    const http = require('http');
    const seen = [];
    const srv = http.createServer(async (req, res) => {
        let body = ''; for await (const c of req) body += c;
        const u = new URL(req.url, 'http://x');
        seen.push(req.method + ' ' + u.pathname);
        const mp3 = () => { res.setHeader('Content-Type', 'audio/mpeg'); res.end(Buffer.from('ID3fakeaudio')); };
        res.setHeader('Content-Type', 'application/json');
        if (u.pathname === '/v1/voices' && u.searchParams.get('key') === 'gkey-1234567890abcdef') return res.end(JSON.stringify({ voices: [{ name: 'de-DE-Neural2-B', ssmlGender: 'MALE', languageCodes: ['de-DE'] }] }));
        if (u.pathname === '/v1/text:synthesize') { const j = JSON.parse(body); return res.end(JSON.stringify({ audioContent: Buffer.from('G:' + j.input.text).toString('base64') })); }
        if (u.pathname === '/cognitiveservices/voices/list') return req.headers['ocp-apim-subscription-key'] === 'azkey-1234567890abcdef' ? res.end(JSON.stringify([{ ShortName: 'de-DE-KatjaNeural', LocalName: 'Katja', Gender: 'Female', Locale: 'de-DE' }])) : (res.statusCode = 401, res.end('{}'));
        if (u.pathname === '/cognitiveservices/v1') { assert.ok(body.includes('<voice name="de-DE-KatjaNeural">') && body.includes('&lt;3')); return mp3(); }
        if (u.pathname === '/v1/voices') return res.end(JSON.stringify({ voices: [{ voice_id: 'v123', name: 'Rachel', labels: { gender: 'female' } }] }));
        if (u.pathname === '/v1/text-to-speech/v123') { assert.strictEqual(req.headers['xi-api-key'], 'elkey-1234567890abcdef'); return mp3(); }
        if (u.pathname === '/audio/speech') { const j = JSON.parse(body); assert.strictEqual(j.voice, 'nova'); return mp3(); }
        res.statusCode = 404; res.end('{}');
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const B = 'http://127.0.0.1:' + srv.address().port;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nxtts-'));
    const piper = path.join(dir, 'piper.js');
    fs.writeFileSync(piper, "let t='';process.stdin.on('data',d=>t+=d);process.stdin.on('end',()=>{const a=process.argv;require('fs').writeFileSync(a[a.indexOf('--output_file')+1],Buffer.concat([Buffer.from('RIFF'),Buffer.from(t)]))});");
    Object.assign(process.env, { NEXUS_GTTS_BASE: B, NEXUS_AZURE_BASE: B, NEXUS_EL_BASE: B, NEXUS_OPENAI_BASE: B, NEXUS_FAKE_SAPI: '1', NEXUS_PIPER_BIN: piper });
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => 'enc:' + s, decrypt: s => s.replace(/^enc:/, '') }, host: { userData: dir } });
    app.game.osc.stopListen();
    const sent = [];
    app.game.osc.chatbox = async t => { sent.push(t); };
    const post = (act, d) => app.post(Object.assign({ act }, d || {}), {});
    await assert.rejects(post('tts_say', { text: 'Hallo' }), /aus/);
    await post('tts_cfg', { enabled: '1', provider: 'windows' });
    let v = await post('tts_voices', { provider: 'windows' });
    assert.ok(v.voices.some(x => x.id === 'Microsoft Hedda Desktop'));
    let r = await post('tts_say', { text: 'Hallo Welt', chatbox: '1' });
    assert.strictEqual(r.item.mime, 'audio/wav');
    assert.ok(sent.includes('Hallo Welt'), 'nicht in die Chatbox');
    // Piper: Text kommt per stdin an, WAV zurück
    await post('tts_cfg', { provider: 'piper', voice: 'de_DE-thorsten-medium' });
    r = await post('tts_say', { text: 'Guten Abend' });
    assert.strictEqual(Buffer.from(r.item.b64, 'base64').toString(), 'RIFFGuten Abend');
    // Anbieter mit Schlüssel (verschlüsselt gespeichert)
    await post('tts_cfg', { provider: 'google' });
    await assert.rejects(post('tts_say', { text: 'x' }), /Schlüssel fehlt/);
    await post('tts_key', { provider: 'google', key: 'gkey-1234567890abcdef' });
    assert.ok(db.setting('tts_keys', '').startsWith('enc:'));
    v = await post('tts_voices', { provider: 'google' });
    assert.strictEqual(v.voices[0].id, 'de-DE-Neural2-B');
    r = await post('tts_say', { text: 'Google spricht' });
    assert.strictEqual(Buffer.from(r.item.b64, 'base64').toString(), 'G:Google spricht');
    await post('tts_key', { provider: 'azure', key: 'azkey-1234567890abcdef' });
    await post('tts_cfg', { provider: 'azure', voice: 'de-DE-KatjaNeural' });
    assert.strictEqual((await post('tts_voices', { provider: 'azure' })).voices[0].id, 'de-DE-KatjaNeural');
    r = await post('tts_say', { text: 'Ich hab euch <3 lieb' });
    assert.strictEqual(r.item.mime, 'audio/mpeg');
    await post('tts_key', { provider: 'elevenlabs', key: 'elkey-1234567890abcdef' });
    await post('tts_cfg', { provider: 'elevenlabs' });
    assert.strictEqual((await post('tts_voices', { provider: 'elevenlabs' })).voices[0].id, 'v123');
    await post('tts_cfg', { voice: 'v123' });
    await post('tts_say', { text: 'Eleven' });
    await post('tts_key', { provider: 'openai', key: 'sk-test1234567890abcdef' });
    await post('tts_cfg', { provider: 'openai', voice: 'nova' });
    await post('tts_say', { text: 'OpenAI' });
    // Oberfläche holt fertige Audios ab
    const q = await post('tts_poll', { since: 0 });
    assert.ok(q.items.length >= 6 && q.items[q.items.length - 1].text === 'OpenAI');
    // nach der Spracheingabe: Übersetzung sprechen
    await post('tts_cfg', { provider: 'piper', on_speech: '1', speak: 'sent' });
    const fakeW = path.join(dir, 'w.js');
    fs.writeFileSync(fakeW, 'console.log("[00:00:00.000 --> 00:00:01.000]  Guten Morgen");');
    if (process.platform !== 'win32') {
        fs.writeFileSync(path.join(dir, 'w.sh'), '#!/bin/sh\nexec "' + process.execPath + '" "' + fakeW + '"\n', { mode: 0o755 });
        process.env.NEXUS_WHISPER_BIN = path.join(dir, 'w.sh');
        app.speech.saveCfg({ enabled: '1', prefix: '' });
        const before = (await post('tts_poll', { since: 0 })).seq;
        await app.speech.transcribe(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(3000)]));
        await U.sleep(300);
        const n = await post('tts_poll', { since: before });
        assert.ok(n.items.some(x => x.text === 'Guten Morgen' && x.via === 'sprache'), JSON.stringify(n.items.map(x => x.text)));
        delete process.env.NEXUS_WHISPER_BIN;
    }
    // Makro-Schritt „speak“ nutzt die Sprachausgabe
    const before2 = (await post('tts_poll', { since: 0 })).seq;
    await app.macros.run('speak Makro spricht');
    await U.sleep(300);
    assert.ok((await post('tts_poll', { since: before2 })).items.some(x => x.text === 'Makro spricht'));
    app.tools.stop(); srv.close();
    for (const k of ['NEXUS_GTTS_BASE', 'NEXUS_AZURE_BASE', 'NEXUS_EL_BASE', 'NEXUS_OPENAI_BASE', 'NEXUS_FAKE_SAPI', 'NEXUS_PIPER_BIN']) delete process.env[k];
});

test('Versionsschema: x.0–9.0–9 (keine x.10.x, kein x.y.10) und überall gleich', () => {
    const v = require('../backend/vrchat').VERSION;
    assert.match(v, /^\d+\.\d\.\d$/, 'Version ' + v + ' – nach x.y.9 kommt x.(y+1).0, nach x.9.9 kommt (x+1).0.0');
    const pk = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version;
    const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '../package-lock.json'), 'utf8'));
    assert.strictEqual(pk, v, 'package.json'); assert.strictEqual(lock.version, v, 'package-lock.json'); assert.strictEqual(lock.packages[''].version, v, 'package-lock.json (packages)');
    const andr = path.join(__dirname, '../../vrc-nexus-android/package.json');
    if (fs.existsSync(andr)) assert.strictEqual(JSON.parse(fs.readFileSync(andr, 'utf8')).version, v, 'Android-App');
});

test('1.9.1: Über-Seite – Changelog aktuell (aus der README gebaut) und letzte 2 Versionen', async () => {
    const { build } = require('../scripts/changelog-build');
    const fresh = build(), saved = require('../backend/changelog.json');
    assert.deepStrictEqual(saved, fresh, 'backend/changelog.json ist veraltet – node scripts/changelog-build.js ausführen');
    const { VERSION } = require('../backend/vrchat');
    assert.strictEqual(fresh[0].version, VERSION, 'README hat keinen Abschnitt „### Neu in ' + VERSION + '“');
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const r = await app.post({ act: 'about' }, {});
    assert.strictEqual(r.changelog.length, 2); assert.strictEqual(r.version, VERSION); assert.ok(r.changelog[0].body.length > 20);
    app.tools.stop();
});

test('1.10: VRChat-Store (Store-ID aus /config, Regale, Restzeit, Artikelart), Meldungen mit Beschreibung, Artikel-Markdown', async () => {
    const U = require('../backend/util');
    const h = U.formatText('# Titel\n**fett** [Hilfe](https://help.vrchat.com/a) <b>x</b>\n- Punkt', true);
    assert.ok(h.includes('<b class="md-h">Titel</b>') && h.includes('<b>fett</b>') && h.includes('href="https://help.vrchat.com/a"') && h.includes('&lt;b&gt;') && h.includes('• Punkt'), h);
    assert.ok(!U.formatText('**a**').includes('<b>'), 'ohne md bleibt Text unverändert');
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const SID = 'esto_11111111-2222-3333-4444-555555555555', end = new Date(Date.now() + 35.5 * 86400000).toISOString(), calls = [];
    app.x.vrc.call = async (acc, m, p, q) => {
        calls.push(p);
        if (p === '/config') return { a: { vrchatStoreId: SID }, junk: 'esto_kaputt' };
        if (p === '/economy/store') { assert.strictEqual(q.storeId, SID); return { displayName: 'VRChat Store', listings: [] }; }
        if (p === '/economy/store/shelves') return [{ shelfTitle: 'Spookality', shelfBannerImageUrl: 'https://assets.vrchat.com/b.png', listings: [
            { id: 'prod_1', displayName: 'Paket', priceTokens: 1000, vrcPlusDiscountPrice: 900, endDate: end, hydratedProducts: [{ inventoryItem: { itemType: 'portal' } }, { inventoryItem: { itemType: 'prop' } }] },
            { id: 'prod_2', displayName: 'Hut', priceTokens: 300, hydratedProducts: [{ itemType: 'Accessory' }] }] }];
        throw new Error('unerwartet ' + p);
    };
    const r = await app.x.shopStore({ vrc_id: 'usr_x' });
    assert.ok(r.found && r.id === SID && r.title === 'VRChat Store');
    const [a, b] = r.shelves[0].listings;
    assert.strictEqual(r.shelves[0].banner, 'https://assets.vrchat.com/b.png');
    assert.deepStrictEqual(a.items, ['bundle', 'portal', 'prop']); assert.strictEqual(a.ends, end); assert.strictEqual(a.vrcplus_price, 900);
    assert.deepStrictEqual(b.items, ['accessory']); assert.strictEqual(b.ends, '');
    await app.x.shopStore({ vrc_id: 'usr_x' });
    assert.strictEqual(calls.filter(c => c === '/config').length, 1, '/config wird zwischengespeichert');
    app.settings.save({ 'social.store_id': 'https://vrchat.com/home/store/esto_99999999-2222-3333-4444-555555555555' });
    app.x.vrc.call = async (acc, m, p, q) => { if (p === '/config') throw new Error('nicht fragen'); return p === '/economy/store' ? { displayName: q.storeId } : []; };
    assert.strictEqual((await app.x.shopStore({})).id, 'esto_99999999-2222-3333-4444-555555555555', 'Store-ID aus Einstellung');
    // Merken (Artikel & Shops)
    const P = 'prod_00000001-1111-2222-3333-444444444444', S = 'usr_00000001-1111-2222-3333-444444444444';
    let sv = app.x.saveToggle('item', { id: P, name: 'Hut', price: 300, vrcplus_price: 270, image: 'https://assets.vrchat.com/h.png', evil: '<script>' });
    assert.ok(sv.saved && sv.items.length === 1 && sv.items[0].name === 'Hut' && sv.items[0].evil === undefined, 'Artikel gemerkt (nur bekannte Felder)');
    sv = app.x.saveToggle('shop', { target: S, title: 'Shop von Fuchs' });
    assert.strictEqual(sv.shops[0].target, S);
    assert.deepStrictEqual(app.x.saved().items.map(x => x.id), [P], 'bleibt gespeichert');
    sv = app.x.saveToggle('item', { id: P });
    assert.ok(!sv.saved && !sv.items.length, 'zweites Mal = entfernen');
    assert.throws(() => app.x.saveToggle('item', { id: '../x' }));
    assert.throws(() => app.x.saveToggle('shop', { target: 'javascript:1' }));
    // Meldungen
    app.tools.call = async (m, p) => ({ hasNext: false, totalCount: 1, results: [{ id: 'modr_1', type: 'avatar', category: 'inappropriate', reason: 'sexual', contentId: 'avtr_1', contentName: 'A', created: '2026-11-01', status: 'open', description: 'Text  der Meldung' }] });
    app.tools.acc = () => ({ vrc_id: 'usr_x' });
    const rep = (await app.tools.reports()).reports[0];
    assert.strictEqual(rep.description, 'Text  der Meldung'); assert.strictEqual(rep.type, 'avatar'); assert.strictEqual(rep.image, '');
    app.tools.stop();
});

test('1.10.2: Spielt gerade über die Windows-Mediensteuerung (Sitzungen, Platzhalter, ⏯ ⏭, Fallback)', async () => {
    const path = require('path');
    const { appName, PS } = require('../backend/media');
    assert.strictEqual(appName('308046B0AF4A39CB'), 'Firefox'); assert.strictEqual(appName('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'), 'Medienwiedergabe');
    assert.ok(PS.includes("IAsyncOperation`1") && PS.includes('TryTogglePlayPauseAsync'), 'PowerShell-Skript vollständig');
    process.env.NEXUS_MEDIA_PS = path.join(__dirname, 'fixtures', 'fake-media.js');
    delete process.env.NEXUS_MUSIC;
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    try {
        app.media.start();
        const wait = async f => { for (let i = 0; i < 60 && !f(); i++) await new Promise(r => setTimeout(r, 100)); assert.ok(f(), 'Zeitüberschreitung bei ' + f.toString().slice(0, 90)); };
        await wait(() => app.media.now());
        const n = app.media.now();
        assert.strictEqual(n.app, 'Spotify'); assert.strictEqual(n.status, 'playing'); assert.strictEqual(n.title, 'Harder, Better, Faster, Stronger');
        assert.strictEqual(app.media.sessions.length, 2, 'auch pausierter Browser wird gelistet');
        app.auto.refreshMusic();
        assert.strictEqual(app.auto.music, 'Daft Punk – Harder, Better, Faster, Stronger');
        const v = app.auto.vars();
        assert.strictEqual(v.musik_kuenstler, 'Daft Punk'); assert.strictEqual(v.musik_app, 'Spotify'); assert.ok(/^\d+:\d\d\/3:44$/.test(v.musik_zeit), v.musik_zeit);
        await app.post({ act: 'media_ctl', cmd: 'next', id: 'Spotify.exe' }, {});
        await wait(() => app.media.now() && app.media.now().title === 'Snowfall');
        await app.post({ act: 'media_ctl', cmd: 'toggle' }, {});
        await wait(() => app.media.sessions[0] && app.media.sessions[0].status === 'paused');
        assert.strictEqual(app.media.text(), '', 'pausiert = nichts „spielt gerade“');
        assert.strictEqual(app.auto.vars().musik_titel, '–');
        const st = await app.post({ act: 'media_status' }, {});
        assert.ok(st.available && st.running && st.now.status === 'paused');
        await assert.rejects(app.post({ act: 'media_ctl', cmd: 'rm -rf' }, {}));
        const h = await app.post({ act: 'home_data' }, {}).catch(() => null);
        if (h && h.media !== undefined) assert.ok(h.media_on);
    } finally {
        app.media.stop(); app.tools.stop();
        delete process.env.NEXUS_MEDIA_PS;
    }
});

test('1.10.3: echtes PowerShell-Skript der Mediensteuerung antwortet (nur Windows)', async () => {
    if (process.platform !== 'win32') return;
    const { Media } = require('../backend/media');
    const m = new Media({ mobile: false });
    try {
        m.start();
        for (let i = 0; i < 400 && !m.at && !m.error; i++) await new Promise(r => setTimeout(r, 100));
        console.log('   Mediensteuerung:', m.at ? 'antwortet, ' + m.sessions.length + ' Sitzung(en)' : 'Fehler: ' + m.error, m.stderr ? '| stderr: ' + m.stderr.slice(-200) : '');
        assert.ok(m.at || m.error, 'Das PowerShell-Skript hat in 40 s nichts gemeldet (hängt es?)');
        if (m.at) {   // Befehlsdatei wird abgeholt (blockiert nicht)
            m.control('pause');
            for (let i = 0; i < 50 && require('fs').existsSync(m.cmdFile); i++) await new Promise(r => setTimeout(r, 100));
            assert.ok(!require('fs').existsSync(m.cmdFile), 'Befehlsdatei wurde nicht abgeholt');
            const at = m.at;
            for (let i = 0; i < 60 && m.at === at; i++) await new Promise(r => setTimeout(r, 100));
            assert.ok(m.at > at, 'nach einem Befehl kommen weiter Meldungen');
        }
    } finally { m.stop(); }
});

test('2.1.0: Datenbank aufräumen – „für immer“ löscht nichts, Zeiträume greifen, offene Benachrichtigungen bleiben', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const old = Math.floor(Date.now() / 1000) - 400 * 86400, fresh = Math.floor(Date.now() / 1000) - 3600;
    for (const ts of [old, fresh]) {
        db.prepare("INSERT INTO feed (user_id, ts, type, vrc_id) VALUES (1, ?, 'online', 'usr_x')").run(ts);
        db.prepare('INSERT INTO stats (user_id, ts, online, active, total) VALUES (1, ?, 1, 1, 1)').run(ts);
        db.prepare("INSERT INTO user_cache (vrc_id, data, fetched) VALUES (?, '{}', ?)").run('usr_' + ts, ts);
    }
    db.prepare("INSERT INTO notif_log (user_id, id, type, created, active) VALUES (1, 'not_a', 'invite', ?, 1)").run(old);
    db.prepare("INSERT INTO notif_log (user_id, id, type, created, active) VALUES (1, 'not_b', 'invite', ?, 0)").run(old);
    const rows = k => app.tools.dbInfo().tables.find(t => t.key === k).rows;
    app.settings.save({ 'sys.keep_feed': '0', 'sys.keep_stats': '0' });
    let r = app.tools.cleanup(false);
    assert.strictEqual(rows('feed'), 2, '„für immer“ löscht keinen Verlauf');
    assert.strictEqual(rows('stats'), 2);
    assert.strictEqual(rows('cache'), 1, 'nur Zwischenspeicher älter als 30 Tage weg');
    app.settings.save({ 'sys.keep_feed': '365', 'sys.keep_stats': '365', 'sys.keep_notifs': '365' });
    r = app.tools.cleanup(true);
    assert.strictEqual(rows('feed'), 1); assert.strictEqual(rows('stats'), 1);
    assert.strictEqual(rows('notifs'), 1, 'offene Benachrichtigung bleibt');
    assert.ok(r.total >= 3 && /gelöscht/.test(r.msg));
    app.tools.stop();
});

test('2.0.0: Updater findet 1.10.x, obwohl GitHub die Releases als Text sortiert (Seitenweise)', async () => {
    const http = require('http');
    const { Updater, newer } = require('../backend/updater');
    assert.ok(newer('1.10.0', '1.9.2') && newer('1.10.10', '1.10.9') && !newer('1.9.9', '1.10.0'));
    // wie GitHub: Textsortierung absteigend → 1.9.x, 1.8.x … zuerst, 1.10.x hinten
    const vers = []; for (let mi = 4; mi <= 9; mi++) for (let pa = 0; pa <= 4; pa++) vers.push('1.' + mi + '.' + pa); for (let pa = 0; pa <= 8; pa++) vers.push('1.10.' + pa);
    const all = vers.sort().reverse().map(v => ({ tag_name: 'vrc-nexus-v' + v, draft: false, prerelease: false, body: v, html_url: 'https://github.com/x/' + v,
        assets: [{ name: 'VRC-Nexus-' + v + '-Setup.exe', size: 1, browser_download_url: 'https://github.com/x/' + v + '/s.exe', state: 'uploaded' }, { name: 'VRC-Nexus-' + v + '-android.apk', size: 1, browser_download_url: 'https://github.com/x/' + v + '/a.apk', state: 'uploaded' }] }));
    assert.ok(all.findIndex(r => r.tag_name.endsWith('1.10.8')) >= 20, 'Testaufbau: 1.10.x liegt hinter den ersten 20');
    const pages = [];
    const srv = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x'), per = Math.min(100, +u.searchParams.get('per_page') || 30), pg = +u.searchParams.get('page') || 1;
        pages.push(per + '/' + pg);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(all.slice((pg - 1) * per, pg * per)));
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.NEXUS_UPDATE_API = 'http://127.0.0.1:' + srv.address().port;
    try {
        const db = await openDatabase(null);
        const fake = { mobile: false, settings: { get: () => true }, db, tools: { host: {} } };
        const st = await new Updater(fake).check();
        assert.strictEqual(st.version, '1.10.8', 'höchste Version gefunden (nicht 1.9.4)');
        const mob = await new Updater(Object.assign({}, fake, { mobile: true })).check();
        assert.strictEqual(mob.version, '1.10.8', 'auch auf Android');
    } finally { delete process.env.NEXUS_UPDATE_API; srv.close(); }
});

test('2.1: Chatbox-Extras (Schnelltexte, Verlauf, Planen, Vorschau) & OSC-Werkzeuge (Port-Test, Weiterleitung, Szenen, Aufnahme)', async () => {
    const dgram = require('dgram');
    const { oscEncode, oscDecode } = require('../backend/gamelog');
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    const g = app.game, o = g.osc, t = app.osctools;
    // „VRChat“ = UDP-Empfänger für das, was VRC Nexus sendet
    const vr = dgram.createSocket('udp4'), got = [];
    vr.on('message', m => { try { for (const [a, args] of oscDecode(m)) got.push([a, args[0]]); } catch (e) { /* egal */ } });
    await new Promise(r => vr.bind(0, '127.0.0.1', r));
    const lp = 39000 + Math.floor(Math.random() * 2000);
    g.saveCfg({ osc_listen_port: lp, osc_listen: false });   // Empfangsport für den Port-Test; danach Ziel auf den Test-Empfänger
    o.configure('127.0.0.1', vr.address().port);
    o.listen(lp);
    t.start();
    const wait = async f => { for (let i = 0; i < 50 && !f(); i++) await new Promise(r => setTimeout(r, 50)); assert.ok(f(), 'Zeitüberschreitung bei ' + f.toString().slice(0, 90)); };
    const toNexus = (a, v) => new Promise(r => { const s = dgram.createSocket('udp4'); s.send(oscEncode(a, v), lp, '127.0.0.1', () => { s.close(); r(); }); });
    try {
        // Chatbox: Vorschau mit Platzhalter, Senden → Verlauf, Schnelltexte, Planen
        const pv = await app.post({ act: 'cbx_preview', text: 'Hallo /n {zufall:x|x}' }, {});
        assert.ok(pv.text.includes('x') && pv.len > 5, JSON.stringify(pv));
        let d = await app.post({ act: 'cbx_quick_save', text: 'Bin AFK {uhr}', label: 'AFK' }, {});
        assert.strictEqual(d.quick[0].label, 'AFK');
        d = await app.post({ act: 'cbx_send', text: 'Hallo Welt' }, {});
        await wait(() => got.some(x => x[0] === '/chatbox/input' && x[1] === 'Hallo Welt'));
        assert.strictEqual(d.hist[0].text, 'Hallo Welt');
        d = await app.post({ act: 'cbx_sched_add', text: 'Gleich gehts los', mins: '5' }, {});
        assert.strictEqual(d.sched.length, 1); assert.ok(d.sched[0].at > Date.now() + 4 * 60000);
        await assert.rejects(app.post({ act: 'cbx_sched_add', text: 'x', at: '25:99' }, {}));
        db.setSetting('cbx_sched', JSON.stringify([{ id: 'a', text: 'Jetzt fällig', at: Date.now() - 1000 }]));
        t.tick();
        await wait(() => got.some(x => x[1] === 'Jetzt fällig'));
        assert.strictEqual(t.cbx().sched.length, 0, 'fällige Nachricht gesendet und entfernt');
        // Port-Test: Selbsttest über den Empfangsport
        const pt = await app.post({ act: 'osct_test' }, {});
        assert.ok(pt.listen.open && pt.listen.self && pt.send.ok, JSON.stringify(pt));
        // Szenen: empfangene Parameter (ohne VRChat-eigene) speichern und wieder setzen
        await toNexus('/avatar/parameters/Ears', true); await toNexus('/avatar/parameters/Hue', 0.25); await toNexus('/avatar/parameters/VelocityX', 1.5);
        await wait(() => o.params.Ears === true && o.params.Hue === 0.25);
        d = await app.post({ act: 'osct_scene_save', name: 'Test' }, {});
        assert.strictEqual(d.scenes[0].n, 2, 'VelocityX (VRChat-eigen) nicht gespeichert');
        got.length = 0;
        await app.post({ act: 'osct_scene_apply', id: d.scenes[0].id }, {});
        await wait(() => got.some(x => x[0] === '/avatar/parameters/Ears' && x[1] === true) && got.some(x => x[0] === '/avatar/parameters/Hue' && Math.abs(x[1] - 0.25) < 1e-6));
        // Weiterleitung: eingehende Pakete gehen zusätzlich an ein anderes Programm
        const other = dgram.createSocket('udp4'), fwd = [];
        other.on('message', m => { for (const [a] of oscDecode(m)) fwd.push(a); });
        await new Promise(r => other.bind(0, '127.0.0.1', r));
        await assert.rejects(app.post({ act: 'osct_fwd', on: '1', targets: '8.8.8.8:9000' }, {}), /eigenen Netz/);
        await assert.rejects(app.post({ act: 'osct_fwd', on: '1', targets: '127.0.0.1:' + lp }, {}), /Schleife/);
        await app.post({ act: 'osct_fwd', on: '1', targets: '127.0.0.1:' + other.address().port }, {});
        await toNexus('/avatar/parameters/Tail', 3);
        await wait(() => fwd.includes('/avatar/parameters/Tail'));
        other.close();
        // Aufnahme & Wiedergabe
        await app.post({ act: 'osct_rec_start', name: 'Wedeln', max: 10 }, {});
        await toNexus('/avatar/parameters/Wag', 1); await new Promise(r => setTimeout(r, 120)); await toNexus('/avatar/parameters/Wag', 0);
        await new Promise(r => setTimeout(r, 100));
        d = await app.post({ act: 'osct_rec_stop' }, {});
        assert.ok(d.recs[0].n >= 2, JSON.stringify(d.recs));
        got.length = 0;
        await app.post({ act: 'osct_rec_play', id: d.recs[0].id, speed: 4 }, {});
        await wait(() => got.filter(x => x[0] === '/avatar/parameters/Wag').length >= 2);
    } finally { t.stop(); o.stopListen(); vr.close(); app.tools.stop(); }
});

test('2.2: neue Chatbox-Module (Countdown, Freunde, Laufschrift, Animation, Akku, Ping) + GPU ohne NVIDIA', async () => {
    const net = require('net');
    const srv = net.createServer(c => c.end());
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    Object.assign(process.env, { NEXUS_BATTERY: '15,0', NEXUS_GPU_WIN: '37|2147483648|AMD Radeon RX 7800 XT', NEXUS_PING_HOST: '127.0.0.1:' + srv.address().port });
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    try {
        const cm = app.chatmods;
        const soon = new Date(Date.now() + (2 * 86400 + 5 * 3600) * 1000 + 30000);
        const loc = soon.getFullYear() + '-' + String(soon.getMonth() + 1).padStart(2, '0') + '-' + String(soon.getDate()).padStart(2, '0') + 'T' + String(soon.getHours()).padStart(2, '0') + ':' + String(soon.getMinutes()).padStart(2, '0');
        cm.save({ cd_name: 'Stream', cd_at: loc, mq_text: 'Willkommen in meiner Welt, schön dass du da bist', mq_width: 12, an_frames: 'A\nB\nC' });
        assert.throws(() => cm.save({ cd_at: 'morgen irgendwann' }), /ungültig/);
        app.vrc.friendList = () => [{ state: 'online' }, { state: 'online' }, { state: 'active' }, { state: 'offline' }];
        for (const k of ['status', 'time', 'media']) cm.save({ mod: k, mod_on: '0' });
        for (const k of ['countdown', 'friends', 'marquee', 'anim', 'battery', 'ping', 'system']) cm.save({ mod: k, mod_on: '1' });
        cm.readCpu();   // CPU-Auslastung braucht zwei Messungen mit etwas Abstand
        await new Promise(r => setTimeout(r, 300));
        cm.readCpu(); cm.last.sys = Date.now(); await cm.readGpu();
        if (!cm.v.cpu) cm.v.cpu = '0';   // sehr ruhige Maschine: Zähler hat sich nicht bewegt
        await cm.refresh(cm.cfg(), true);
        const r1 = cm.compose(cm.cfg(), true), r2 = cm.compose(cm.cfg(), true);
        assert.ok(/⏳ Stream in 2 T 5 h/.test(r1.per.countdown), r1.per.countdown);
        assert.strictEqual(r1.per.friends, '👥 2 im Spiel · 1 online');
        assert.ok(r1.per.marquee !== r2.per.marquee && Array.from(r1.per.marquee.replace('📜 ', '')).length <= 12, 'Laufschrift läuft weiter: ' + r1.per.marquee + ' / ' + r2.per.marquee);
        assert.ok(r1.per.anim !== r2.per.anim && ['A', 'B', 'C'].includes(r2.per.anim), 'Animation wechselt');
        assert.strictEqual(r1.per.battery, '🪫 15%');
        assert.ok(/^📡 \d+ ms$/.test(r1.per.ping), r1.per.ping);
        assert.ok(/GPU 37%/.test(r1.per.system), 'GPU ohne NVIDIA: ' + r1.per.system);
        assert.strictEqual(cm.vars().gpu_name, 'AMD Radeon RX 7800 XT');
        assert.strictEqual(app.game.vars().countdown_name, 'Stream', 'Countdown auch als Platzhalter für Rotator & Co.');
        const g = await app.post({ act: 'cm_get' }, {});
        assert.ok(g.gpu && g.gpu_win && g.battery && g.modules.countdown);
        // ohne Akku / Ping-Ziel nicht erreichbar → Modul fällt weg
        process.env.NEXUS_BATTERY = ','; process.env.NEXUS_PING_HOST = '127.0.0.1:1';
        await cm.readBattery(); await cm.readPing();
        const r3 = cm.compose(cm.cfg(), false);
        assert.ok(!r3.per.battery && !r3.per.ping, JSON.stringify(r3.per));
    } finally {
        for (const k of ['NEXUS_BATTERY', 'NEXUS_GPU_WIN', 'NEXUS_PING_HOST']) delete process.env[k];
        srv.close(); app.tools.stop();
    }
});

test('2.3: Stream-Deck-Schnittstelle – Schnelltext, Chatbox-Module, Aufnahme, Vorlesen, Werte für die Info-Taste', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const sent = [];
    app.game.osc.send = async (a, ...args) => { sent.push([a, args[0]]); };
    app.game.osc.lastChat = 0;
    const t = app.tools;
    try {
        app.osctools.quickSave('Hallo {zeit}', 'Gruß');
        const st = t.apiState();
        assert.strictEqual(st.quick.list[0].name, 'Gruß');
        assert.ok(/^\d\d:\d\d$/.test(st.vars.zeit) && st.vars.uhr, 'Uhrzeit-Platzhalter für die Info-Taste');
        let r = await t.apiAction('quicktext', { id: st.quick.list[0].id });
        assert.ok(/^Hallo/.test(r.text));
        r = await t.apiAction('quicktext', { mode: 'last' });
        assert.ok(/^Hallo/.test(r.text), 'letzte Nachricht erneut');
        r = await t.apiAction('chatmods', { mod: 'countdown' });
        assert.strictEqual(r.value, true); assert.strictEqual(t.apiState().chatmods.mods.countdown, true);
        r = await t.apiAction('chatmods', {});
        assert.strictEqual(r.value, true); assert.strictEqual(app.chatmods.cfg().on, true);
        await t.apiAction('chatmods', { on: false });
        await assert.rejects(t.apiAction('chatmods', { mod: 'gibtsnicht' }));
        // Aufnahme: Start → Parameter kommt rein → Stopp → Abspielen
        app.game.osc.params = { Ears: true };
        r = await t.apiAction('record', { name: 'SD' }); assert.strictEqual(r.value, true);
        assert.ok(t.apiState().recs.recording);
        r = await t.apiAction('record', {}); assert.strictEqual(r.value, false);
        const rec = t.apiState().recs.list[0];
        assert.strictEqual(rec.name, 'SD');
        sent.length = 0;
        r = await t.apiAction('record', { op: 'play', id: rec.id, speed: 4 }); assert.strictEqual(r.value, true);
        for (let i = 0; i < 20 && !sent.some(x => x[0] === '/avatar/parameters/Ears'); i++) await new Promise(res => setTimeout(res, 25));
        assert.ok(sent.some(x => x[0] === '/avatar/parameters/Ears'), 'Wiedergabe sendet');
        // Vorlesen: TTS aus → verständlicher Fehler
        await assert.rejects(t.apiAction('tts', { text: '' }), /Text fehlt/);
        await assert.rejects(t.apiAction('scene', { id: 'x' }), /nicht gefunden/);
        await assert.rejects(t.apiAction('media', { cmd: 'toggle' }));
    } finally { app.osctools.stopPlay(); app.tools.stop(); }
});

test('2.3.1: GPU-Abfrage ohne NVIDIA wählt keinen virtuellen Adapter (echt nur auf Windows)', async () => {
    const { GPU_PS } = require('../backend/chatmods');
    assert.ok(GPU_PS.includes("PNPDeviceID -like 'PCI\\*'") && /Virtual\|/.test(GPU_PS), 'Filter für echte Grafikkarten');
    if (process.platform !== 'win32') return;
    const out = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', GPU_PS], { encoding: 'utf8', timeout: 30000 }).trim();
    console.log('   GPU-Abfrage:', JSON.stringify(out));
    const m = /^(\d+)\|(\d*)\|(.*)$/m.exec(out);
    assert.ok(m, 'Ausgabeformat Auslastung|VRAM|Name: ' + out);
    assert.ok(!/Virtual|Hyper-V|Basic|Remote/i.test(m[3]), 'virtueller Adapter gewählt: ' + m[3]);
});

test('2.7.1: Discord-Status (Video/Musik, Privat, Plattform, Bilder) & VRChat-Wächter (Absturz → Neustart, hart beenden, Cache)', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-vrc-'));
    const launched = [];
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: tmp, openExternal: async u => launched.push(u) } });
    app.game.osc.stopListen();
    const t = app.tools, st = app.game.state;
    t.call = async (m, p) => (/^\/worlds\//.test(p) ? { thumbnailImageUrl: 'https://api.vrchat.cloud/file/w.png' } : {});
    t.fetchJson = async () => ({ title: 'Never Gonna Give You Up', thumbnail_url: '' });
    t.alert = () => {};
    const W = 'wrld_' + '1'.repeat(8) + '-1111-2222-3333-444444444444';
    st.running = true; st.worldId = W; st.instance = '123~region(eu)'; st.worldName = 'Popcorn Palace'; st.since = 1; st.players.set('a', { name: 'a' }); st.players.set('b', { name: 'b' });
    app.settings.save({ 'int.rpc_join': true });
    let a = await t.rpcActivity();
    assert.strictEqual(a.details, 'Popcorn Palace'); assert.ok(/2 Spieler/.test(a.state)); assert.strictEqual(a.assets.large_image, 'https://api.vrchat.cloud/file/w.png');
    assert.ok(a.buttons && /launch\?worldId=/.test(a.buttons[0].url), 'Beitreten-Knopf bei öffentlich');
    st.video = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', at: Math.floor(Date.now() / 1000) };
    a = await t.rpcActivity();
    assert.strictEqual(a.type, 3); assert.ok(/Never Gonna/.test(a.state)); assert.ok(/i\.ytimg\.com\/vi\/dQw4w9WgXcQ/.test(a.assets.large_image), 'Medienbild');
    st.video = { url: 'https://soundcloud.com/x/y', at: Math.floor(Date.now() / 1000) };
    assert.strictEqual((await t.rpcActivity()).type, 2, 'Musik = Hört');
    st.instance = '123~private(usr_x)~region(eu)';
    a = await t.rpcActivity();
    assert.strictEqual(a.details, 'In VRChat'); assert.ok(!a.buttons); assert.strictEqual(a.assets.large_image, 'vrchat'); assert.ok(!a.type, 'privat: kein Video');
    app.settings.save({ 'int.rpc_private': false, 'int.rpc_world_activity': true });
    a = await t.rpcActivity();
    assert.strictEqual(a.name, 'Popcorn Palace'); assert.ok(!a.buttons, 'privat: kein Beitreten');
    // Absturz: Prozess zweimal weg → Neustart in die letzte Instanz
    app.settings.save({ 'vrc.relaunch': true });
    let alive = true; t.procCheck = () => alive;
    await t.vrcWatch(); assert.ok(t.lastLoc.startsWith(W));
    alive = false; t.lastAliveCheck = 0; await t.vrcWatch(); assert.strictEqual(launched.length, 0, 'einmal weg reicht nicht');
    t.lastAliveCheck = 0; await t.vrcWatch();
    assert.strictEqual(st.running, false);
    assert.ok(launched.length === 1 && /steam:\/\/run\/438100\/\/.*vrchat%3A%2F%2Flaunch/.test(launched[0]), 'Neustart über Steam mit letzter Instanz');
    // Cache aufräumen: ältestes zuerst, bis unter der Grenze
    const cache = path.join(tmp, 'Cache-WindowsPlayer'); process.env.NEXUS_VRC_CACHE = cache;
    for (const [n, age] of [['alt', 3], ['mittel', 2], ['neu', 1]]) { const d = path.join(cache, n); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'data'), Buffer.alloc(600 * 1024 * 1024 / 1024)); const tt = Date.now() / 1000 - age * 86400; fs.utimesSync(d, tt, tt); }
    const r = t.cacheTrim(0.0012);   // ≈ 1,2 MB → zwei der drei (je 0,6 MB) bleiben übrig? nein: Grenze 1,29 MB → eins muss weg
    assert.strictEqual(r.deleted, 1); assert.ok(!fs.existsSync(path.join(cache, 'alt')) && fs.existsSync(path.join(cache, 'neu')));
    delete process.env.NEXUS_VRC_CACHE;
    t.stop();
});

test('2.7.2: Prints/Sticker/Emoji aus dem Log erkennen und als Datei speichern', async () => {
    const { LogParser } = require('../backend/gamelog');
    const { NexusApp } = require('../backend/app');
    const P = 'prnt_' + 'a'.repeat(8) + '-1111-2222-3333-444444444444', F = 'file_' + 'b'.repeat(8) + '-1111-2222-3333-444444444444', U = 'usr_' + 'c'.repeat(8) + '-1111-2222-3333-444444444444';
    const lp = new LogParser();
    const L = m => '2026.11.14 21:30:00 Debug      -  ' + m;
    assert.strictEqual(lp.feed(L('[API] Requesting Get prints/' + P + ' {{}}'))[0].kind, 'print');
    assert.strictEqual(lp.feed(L('[API] Requesting Get prints/' + P + ' {{}}')).length, 0, 'gleicher Print nur einmal');
    const st = lp.feed(L('[StickersManager] User ' + U + ' (Foxy) spawned sticker ' + F));
    assert.strictEqual(st[0].kind, 'sticker'); assert.strictEqual(st[0].detail, F); assert.strictEqual(st[0].player_name, 'Foxy');
    assert.strictEqual(lp.feed(L('[EmojiManager] Spawning emoji ' + F.replace('b', 'd')))[0].kind, 'emoji');
    assert.strictEqual(lp.feed(L('[Behaviour] Something with ' + F)).length, 0, 'Datei-ID ohne Stichwort zählt nicht');
    // Speichern
    const db = await openDatabase(null);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-pr-'));
    process.env.NEXUS_PHOTO_DIR = tmp;
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: tmp } });
    app.game.osc.stopListen();
    const t = app.tools;
    t.acc = () => ({ vrc_id: 'usr_me', me: {} });
    t.call = async (m, p) => (/^\/prints\//.test(p) ? { authorName: 'Luna', files: { image: 'https://api.vrchat.cloud/api/1/file/' + F + '/3/file' } } : { versions: [{ version: 0 }, { version: 1, status: 'complete', file: {} }] });
    const got = []; t.fetchFile = async (fid, v) => { got.push(fid + '/' + v); return { type: 'image/png', body: Buffer.from('PNG') }; };
    const ev = { ts: Math.floor(Date.now() / 1000), kind: 'print', detail: P, player_name: '' };
    assert.strictEqual(await t.saveInstanceFile(ev), null, 'aus = nichts speichern');
    app.settings.save({ 'media.save_prints': true, 'media.save_stickers': true });
    const f1 = await t.saveInstanceFile(ev);
    assert.ok(f1 && fs.existsSync(f1) && /Prints/.test(f1) && /VRChat_Print_.*_Luna_/.test(path.basename(f1)), f1);
    const f2 = await t.saveInstanceFile({ ts: ev.ts, kind: 'sticker', detail: F, player_name: 'Foxy' });
    assert.ok(f2 && /Stickers/.test(f2) && /_Foxy_/.test(f2));
    assert.deepStrictEqual(got, [F + '/3', F + '/1']);
    assert.strictEqual(await t.saveInstanceFile({ ts: ev.ts, kind: 'emoji', detail: F }), null, 'Emoji aus');
    delete process.env.NEXUS_PHOTO_DIR;
    t.stop();
});

test('2.8.0: Sprache automatisch erkennen (whisper-Ausgabe), Sprachbefehle → OSC, Übersetzer „VRChat → Text“', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-sp-'));
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: tmp } });
    app.game.osc.stopListen();
    const sent = []; app.game.osc.send = async (a, ...v) => { sent.push([a, ...v]); };
    app.game.oscSend = async (k, d) => { if (k === 'chatbox') sent.push(['chatbox', d.text]); };
    app.tr.translate = async (text, target) => ({ text: '[' + target + '] ' + text });
    app.tr.chat = async (text, target) => ({ text: '[' + target + '] ' + text });
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(3000)]);
    if (process.platform !== 'win32') {
        // echtes Ausgabeformat von whisper-cli mit -l auto (Sprache steht in stderr)
        const fake = path.join(tmp, 'w.js');
        fs.writeFileSync(fake, '#!/usr/bin/env node\nconst a=process.argv.join(" ");console.error("whisper_full_with_state: auto-detected language: en (p = 0.973218)");console.log("[00:00:00.000 --> 00:00:02.000]  Hello, how are you?");if(!/-l auto/.test(a))process.exit(3);\n', { mode: 0o755 });
        process.env.NEXUS_WHISPER_BIN = fake;
        const r = await app.speech.recognize(wav, { lang: 'auto' });
        assert.deepStrictEqual([r.text, r.lang, r.prob], ['Hello, how are you?', 'en', 0.973218]);
        delete process.env.NEXUS_WHISPER_BIN;
    }
    assert.strictEqual(app.speech.cfg().lang, 'auto', 'Mikro-Sprache standardmäßig automatisch');
    // Sprachbefehle
    await assert.rejects(app.post({ act: 'speech_cmd_add', phrase: 'Ohren', addr: 'kein/slash', type: 'bool', value: 'true' }, {}), /Adresse/);
    await app.post({ act: 'speech_cmd_add', phrase: 'Ohren hoch', addr: '/avatar/parameters/Ears', type: 'bool', value: 'toggle' }, {});
    await app.post({ act: 'speech_cmd_add', phrase: 'Outfit zwei', addr: '/avatar/parameters/Outfit', type: 'int', value: '2' }, {});
    const imp = await app.post({ act: 'speech_cmd_import', data: JSON.stringify([{ Phrase: 'tail wag', Address: '/avatar/parameters/Tail', Type: 'Float', Value: '0.5' }, { phrase: '', addr: '/x' }]) }, {});
    assert.strictEqual(imp.items.length, 3, 'ungültiger Eintrag übersprungen');
    process.env.NEXUS_FAKE_WHISPER = JSON.stringify({ text: 'Okay, Ohren hoch bitte!', lang: 'de', prob: 0.99 });
    app.speech.saveCfg({ enabled: '1', prefix: '', translate: false });
    sent.length = 0;
    let r = await app.post({ act: 'speech_transcribe', audio: wav.toString('base64') }, {});
    assert.ok(r.command && r.command.addr === '/avatar/parameters/Ears');
    assert.deepStrictEqual(sent, [['/avatar/parameters/Ears', true]], 'Befehl gesendet, nichts in die Chatbox');
    sent.length = 0; await app.post({ act: 'speech_transcribe', audio: wav.toString('base64') }, {});
    assert.deepStrictEqual(sent, [['/avatar/parameters/Ears', false]], 'Umschalten');
    // eigene Sprache: schon Zielsprache → nicht übersetzen; Untertitel „ich“
    process.env.NEXUS_FAKE_WHISPER = JSON.stringify({ text: 'Hallo zusammen', lang: 'de', prob: 0.95 });
    app.speech.saveCfg({ translate: true, target: 'DE' });
    sent.length = 0; r = await app.post({ act: 'speech_transcribe', audio: wav.toString('base64') }, {});
    assert.deepStrictEqual(sent, [['chatbox', 'Hallo zusammen']]);
    process.env.NEXUS_FAKE_WHISPER = JSON.stringify({ text: 'Bonjour', lang: 'fr', prob: 0.95 });
    sent.length = 0; await app.post({ act: 'speech_transcribe', audio: wav.toString('base64') }, {});
    assert.deepStrictEqual(sent, [['chatbox', '[DE] Bonjour']]);
    // Übersetzer: Spielton
    await assert.rejects(app.post({ act: 'subs_listen', audio: wav.toString('base64') }, {}), /aus/);
    await app.post({ act: 'subs_cfg', enabled: '1', src: 'auto', target: '', min_prob: '60', ignore: 'ru, xx' }, {});
    assert.strictEqual(app.subs.cfg().ignore, 'ru');
    process.env.NEXUS_FAKE_WHISPER = JSON.stringify({ text: 'Where are you from?', lang: 'en', prob: 0.9 });
    r = await app.post({ act: 'subs_listen', audio: wav.toString('base64') }, {});
    assert.strictEqual(r.line.tr, '[DE] Where are you from?'); assert.strictEqual(r.line.flag, '🇬🇧');
    process.env.NEXUS_FAKE_WHISPER = JSON.stringify({ text: 'Ich komme aus Leipzig', lang: 'de', prob: 0.9 });
    r = await app.post({ act: 'subs_listen', audio: wav.toString('base64') }, {});
    assert.strictEqual(r.line.tr, '', 'Zielsprache → keine Übersetzung');
    process.env.NEXUS_FAKE_WHISPER = JSON.stringify({ text: 'привет', lang: 'ru', prob: 0.9 });
    r = await app.post({ act: 'subs_listen', audio: wav.toString('base64') }, {});
    assert.ok(r.ignored, 'ignorierte Sprache');
    process.env.NEXUS_FAKE_WHISPER = JSON.stringify({ text: 'mmh ja', lang: 'nl', prob: 0.3 });
    r = await app.post({ act: 'subs_listen', audio: wav.toString('base64') }, {});
    assert.ok(r.line.unsure && !r.line.tr, 'unsicher → nicht übersetzen, markieren');
    app.settings.save({ 'ui.lang': 'en' });
    assert.strictEqual(app.subs.target(app.subs.cfg()), 'EN-GB', 'Ziel folgt der App-Sprache');
    const hud = await app.post({ act: 'hud_state' }, {});
    assert.ok(hud.items.some(i => i.key === 'zeit') && hud.lines.length === 3 && hud.lines[2].unsure, 'HUD: Infos + letzte 3 Untertitel');
    app.settings.save({ 'vr.overlay_hud_subs': false, 'vr.overlay_hud_items': 'freunde' });
    const hud2 = await app.post({ act: 'hud_state' }, {});
    assert.strictEqual(hud2.lines.length, 0); assert.deepStrictEqual(hud2.items.map(i => i.key), ['freunde']);
    const st = await app.post({ act: 'subs_state' }, {});
    assert.ok(st.lines.some(l => l.who === 'me' && l.tr === '[DE] Bonjour'), 'eigene Untertitel');
    delete process.env.NEXUS_FAKE_WHISPER;
    app.tools.stop();
});

test('2.8.4: Kopieren über die App, Avatarbild für Stream Deck, Instanz-Taste, FPS-Modul', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-284-'));
    let copied = '';
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: tmp, copy: t => { copied = t; } } });
    app.game.osc.stopListen();
    await app.post({ act: 'clipboard_write', text: 'avtr_123' }, {});
    assert.strictEqual(copied, 'avtr_123');
    const t = app.tools;
    const A = 'avtr_' + 'a'.repeat(8) + '-1111-2222-3333-444444444444', F = 'file_' + 'b'.repeat(8) + '-1111-2222-3333-444444444444';
    let calls = 0;
    t.call = async (m, p) => { calls++; return { thumbnailImageUrl: 'https://api.vrchat.cloud/api/1/file/' + F + '/2/file' }; };
    app.image = async (id, v, size) => ({ status: 200, headers: { 'Content-Type': 'image/png' }, body: Buffer.from(id + '/' + v + '/' + size) });
    const im = await t.avatarImage(A);
    assert.strictEqual(Buffer.from(im.b64, 'base64').toString(), F + '/2/256'); await t.avatarImage(A);
    assert.strictEqual(calls, 1, 'Bildadresse wird gemerkt');
    await assert.rejects(t.avatarImage('avtr_x'), /Ungültige/);
    t.thumbCache = new Map();
    t.call = async () => ({ name: 'Japan Shrine', thumbnailImageUrl: 'https://api.vrchat.cloud/api/1/file/' + F + '/5/file' });
    const wi = await t.worldImage('wrld_' + 'd'.repeat(8) + '-1111-2222-3333-444444444444');
    assert.strictEqual(Buffer.from(wi.b64, 'base64').toString(), F + '/5/256'); assert.strictEqual(wi.name, 'Japan Shrine');
    // Instanz-Taste: „current“ ohne Welt → verständlicher Fehler; mit Welt → instance_create mit Einladung
    await assert.rejects(t.apiAction('instance_create', { world: 'current' }), /keine Welt|in keiner Instanz/i);
    const W = 'wrld_' + 'c'.repeat(8) + '-1111-2222-3333-444444444444';
    app.game.state.worldId = W;
    let got = null; const orig = app.post.bind(app);
    app.post = async (input, files) => { if (input.act === 'instance_create') { got = input; return { msg: 'Instanz erstellt – Einladung an dich ist unterwegs.', location: W + ':1~hidden(usr_x)' }; } return orig(input, files); };
    const r = await t.apiAction('instance_create', { world: 'current', type: 'friends+', region: 'eu', invite_me: '1' });
    assert.ok(r.ok && got.world === W && got.invite_me === '1' && got.type === 'friends+');
    await t.apiAction('instance_create', { world: 'https://vrchat.com/home/world/' + W + '/info', type: 'invite+' });
    assert.strictEqual(got.world, W, 'Welt-ID aus vrchat.com-Link');
    // FPS-Modul
    process.env.NEXUS_FAKE_FPS = '72.4';
    app.chatmods.readFps();
    assert.strictEqual(app.chatmods.vars().fps, '72');
    delete process.env.NEXUS_FAKE_FPS; app.chatmods.readFps();
    assert.strictEqual(app.chatmods.vars().fps, undefined, 'ohne SteamVR kein Wert → Modul fällt weg');
    t.stop();
});

test('2.8.7: Stream-Deck-Plugin – Version melden und Update starten', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-287-'));
    const file = path.join(tmp, 'VRC-Nexus.streamDeckPlugin'); fs.writeFileSync(file, 'PK');
    const opened = [];
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: tmp, pluginFile: file, openPath: async f => opened.push(f) } });
    app.game.osc.stopListen();
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'streamdeck', 'de.ghostnode.vrcnexus.sdPlugin', 'manifest.json'), 'utf8'));
    const st = app.tools.apiState();
    assert.strictEqual(st.plugin.version, manifest.Version, 'Version stimmt mit dem Plugin-Manifest überein (npm run streamdeck schreibt sie)');
    assert.strictEqual(st.plugin.file, true);
    const r = await app.tools.apiAction('plugin_update', {});
    assert.ok(r.ok && opened[0] === file && /installiert/.test(r.msg));
    fs.rmSync(file);
    await assert.rejects(app.tools.apiAction('plugin_update', {}), /nicht gefunden/);
    // Discord-Status: ohne eigene Client-ID die von VRC Nexus
    const ids = []; app.tools.rpc.connect = async id => { ids.push(id); }; app.tools.rpc.setActivity = () => {};
    await app.tools.updateRpc();
    app.settings.save({ 'int.rpc_client': '123456789012345678' }); await app.tools.updateRpc();
    assert.deepStrictEqual(ids, ['1571341160172232884', '123456789012345678']);
    app.tools.stop();
});

test('2.9.0: Besitzer-Sperre, Freischalt-Schlüssel (an User-ID gebunden), NSFW-Werkzeuge, Intiface + OGB, Handy-Fernbedienung', async () => {
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const OWNER = 'usr_' + 'a'.repeat(8) + '-1111-2222-3333-444444444444', FRIEND = 'usr_' + 'b'.repeat(8) + '-1111-2222-3333-444444444444', OTHER = 'usr_' + 'c'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const mk = async uid => {
        const db = await openDatabase(null);
        const app = new NexusApp({ db, crypt: { encrypt: s => 'E:' + s, decrypt: s => String(s).replace(/^E:/, '') }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-290-')) } });
        app.game.osc.stopListen();
        app.vrc.account = () => (uid ? { vrc_id: uid, me: { currentAvatar: '' } } : null);
        return app;
    };
    const own = await mk(OWNER), fr = await mk(FRIEND), ot = await mk(OTHER);
    // Besitzer
    let st = await own.post({ act: 'nsfw_state' }, {});
    assert.ok(st.access.owner && !st.access.unlocked, 'seit 3.0: auch der Besitzer braucht Verified 18+');
    grant18(own);
    st = await own.post({ act: 'nsfw_state' }, {});
    assert.ok(st.access.owner && st.access.unlocked);
    assert.strictEqual((await fr.post({ act: 'nsfw_state' }, {})).access.unlocked, false);
    await assert.rejects(fr.post({ act: 'nsfw_admin_keypair' }, {}), /Besitzer/);
    await assert.rejects(fr.post({ act: 'backup_status' }, {}), /Besitzer/, 'Dashboard/Cloud nur für den Besitzer');
    const kp = await own.post({ act: 'nsfw_admin_keypair' }, {});
    assert.ok(kp.pub && kp.owner_key === kp.pub);
    const iss = await own.post({ act: 'nsfw_admin_issue', uid: 'https://vrchat.com/home/user/' + FRIEND, name: 'Foxy', days: '30', features: 'supporter,mod' }, {});
    assert.ok(/^NXK1\./.test(iss.token) && iss.items[0].uid === FRIEND);
    // andere Apps kennen den öffentlichen Schlüssel (kommt in TRUSTED)
    fr.nsfw.trusted.push(kp.pub); ot.nsfw.trusted.push(kp.pub);
    await assert.rejects(ot.post({ act: 'nsfw_unlock', token: iss.token }, {}), /anderen VRChat-Konto/, 'weitergeben bringt nichts');
    const forged = iss.token.replace(/\.([\w-]+)\./, (m, b) => '.' + Buffer.from(JSON.stringify(Object.assign(JSON.parse(Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64')), { uid: OTHER }))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.');
    await assert.rejects(ot.post({ act: 'nsfw_unlock', token: forged }, {}), /Unterschrift/, 'umschreiben geht nicht');
    await assert.rejects(fr.post({ act: 'nsfw_panic' }, {}), /Nicht freigeschaltet/);
    st = await fr.post({ act: 'nsfw_unlock', token: iss.token }, {});
    assert.ok(st.access.key && st.access.mod && !st.access.unlocked, 'NXK1 schaltet kein NSFW mehr frei');
    grant18(fr, false);
    assert.ok(!(await fr.post({ act: 'nsfw_state' }, {})).access.unlocked, 'Verified 18+ ohne Schalter: gesperrt');
    grant18(fr);
    st = await fr.post({ act: 'nsfw_state' }, {});
    assert.ok(st.access.unlocked && st.access.features.includes('toys'));
    // Werkzeuge
    const A1 = 'avtr_' + '1'.repeat(8) + '-1111-2222-3333-444444444444', A2 = 'avtr_' + '2'.repeat(8) + '-1111-2222-3333-444444444444', SAFE = 'avtr_' + '3'.repeat(8) + '-1111-2222-3333-444444444444';
    const sel = []; fr.tools.call = async (m, p) => { if (/select$/.test(p)) sel.push(p.split('/')[2]); return {}; };
    const chat = []; fr.game.osc.chatbox = async t => { chat.push(t); };
    await fr.post({ act: 'nsfw_cfg', safe_avatar: SAFE, pairs: JSON.stringify([{ name: 'Fuchs', sfw: A1, nsfw: A2 }, { name: 'kaputt', sfw: 'x', nsfw: A2 }]), yes: 'Kuscheln', no: 'Fotos' }, {});
    assert.strictEqual(fr.nsfw.cfg().pairs.length, 1);
    let r = await fr.post({ act: 'nsfw_avatar', i: '0' }, {}); assert.ok(r.nsfw && sel.pop() === A2);
    r = await fr.post({ act: 'nsfw_avatar', i: '0' }, {}); assert.ok(!r.nsfw && sel.pop() === A1);
    r = await fr.post({ act: 'nsfw_boundaries' }, {}); assert.ok(/🟢 Kuscheln/.test(chat.pop()) && /🔴 Fotos/.test(r.text));
    // Intiface (nachgebaut) + OGB
    const sent = [];
    class FakeWS { constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen(); }, 5); }
        send(t) { const m = JSON.parse(t)[0], k = Object.keys(m)[0], id = m[k].Id; sent.push(m);
            const reply = k === 'RequestServerInfo' ? { ServerInfo: { Id: id, ServerName: 'Fake Intiface', MaxPingTime: 0 } }
                : k === 'RequestDeviceList' ? { DeviceList: { Id: id, Devices: [{ DeviceIndex: 0, DeviceName: 'Testgerät', DeviceMessages: { ScalarCmd: [{ StepCount: 20, ActuatorType: 'Vibrate' }] } }] } } : { Ok: { Id: id } };
            setTimeout(() => this.onmessage({ data: JSON.stringify([reply]) }), 1); }
        close() { this.readyState = 3; } }
    fr.toys.WebSocket = FakeWS;
    fr.toys.probeHook = (h) => h === '127.0.0.1';
    await fr.post({ act: 'toys_cfg', url: 'ws://192.168.2.119:12345/' }, {});
    st = await fr.post({ act: 'toys_connect' }, {});
    assert.ok(st.connected && st.devices[0].name === 'Testgerät');
    assert.strictEqual(fr.toys.cfg().url, 'ws://127.0.0.1:12345', 'LAN-IP ohne Antwort → automatisch 127.0.0.1');
    await fr.post({ act: 'toys_cfg', url: 'ws://0.0.0.0:12345' }, {});
    assert.strictEqual(fr.toys.cfg().url, 'ws://127.0.0.1:12345', '0.0.0.0 aus Intiface → 127.0.0.1');
    assert.ok(/umgestellt/.test(st.msg));
    // anderer Client schon verbunden: TCP offen, WebSocket wird sofort geschlossen
    const fr2 = await mk(FRIEND); fr2.nsfw.trusted.push(kp.pub); await fr2.post({ act: 'nsfw_unlock', token: iss.token }, {}); grant18(fr2);
    fr2.toys.probeHook = () => true;
    fr2.toys.WebSocket = class { constructor() { setTimeout(() => this.onclose && this.onclose({}), 5); } close() {} };
    await assert.rejects(fr2.post({ act: 'toys_connect' }, {}), /anderes Programm/);
    fr2.toys.probeHook = () => false;
    await assert.rejects(fr2.post({ act: 'toys_connect' }, {}), /Start Server/);
    fr2.toys.stop(); fr2.tools.stop();
    await fr.post({ act: 'toys_set', device: '0', level: '0.5' }, {});
    assert.strictEqual(sent.filter(m => m.ScalarCmd).pop().ScalarCmd.Scalars[0].Scalar, 0.5);
    await fr.post({ act: 'toys_cfg', ogb: '1', ogb_self: '0', ogb_min: '0' }, {});
    fr.toys.onOsc('/avatar/parameters/OGB/Orf/Vag/PenOthers', [0.8]); await U.sleep(150);
    assert.strictEqual(sent.filter(m => m.ScalarCmd).pop().ScalarCmd.Scalars[0].Scalar, 0.8, 'OGB: Nähe → Stärke');
    const n0 = sent.length; fr.toys.onOsc('/avatar/parameters/OGB/Pen/Dick/TouchSelf', [1]); await U.sleep(150);
    assert.strictEqual(sent.length, n0, 'Self ignoriert');
    r = await fr.post({ act: 'nsfw_panic' }, {});
    assert.ok(fr.nsfw.private && sent.some(m => m.StopAllDevices) && sel.pop() === SAFE && /Panik/.test(r.msg));
    assert.strictEqual(await fr.tools.rpcActivity(), null, 'Privat-Modus: kein Discord-Status');
    // Handy-Fernbedienung (nur 127.0.0.1 im Test)
    process.env.NEXUS_REMOTE_HOST = '127.0.0.1';
    const port = 17000 + Math.floor(Math.random() * 2000);
    const rs = await fr.post({ act: 'remote_cfg', on: '1', port: String(port) }, {});
    await U.sleep(100);
    assert.ok(rs.urls.length >= 0 && rs.token.length > 10);
    const base = 'http://127.0.0.1:' + port;
    assert.strictEqual((await fetch(base + '/?t=falsch')).status, 401);
    const page = await (await fetch(base + '/?t=' + rs.token)).text();
    assert.ok(/PANIK/.test(page));
    const rst = await (await fetch(base + '/state?t=' + rs.token)).json();
    assert.ok(rst.private === true && rst.pairs.length === 1 && rst.toys.connected);
    const bad = await fetch(base + '/act?t=' + rs.token, { method: 'POST', body: JSON.stringify({ act: 'nsfw_admin_issue' }) });
    assert.strictEqual(bad.status, 400, 'nur erlaubte Befehle');
    const okr = await (await fetch(base + '/act?t=' + rs.token, { method: 'POST', body: JSON.stringify({ act: 'nsfw_private', on: '0' }) })).json();
    assert.strictEqual(okr.private, false);
    // Sperren beim Besitzer
    const rv = await own.post({ act: 'nsfw_admin_revoke', id: iss.items[0].id }, {});
    assert.ok(rv.items[0].revoked);
    fr.remote.stopServer(); fr.toys.stop();
    for (const a of [own, fr, ot]) a.tools.stop();
    delete process.env.NEXUS_OWNER_HASH; delete process.env.NEXUS_REMOTE_HOST;
});

test('2.9.1: Admin (nur Besitzer) – Systeminfo, API-Konsole nur lesen, Ereignis simulieren, Spielereien', async () => {
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const OWNER = 'usr_' + 'a'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-291-')) } });
    app.game.osc.stopListen();
    let uid = 'usr_' + 'b'.repeat(8) + '-1111-2222-3333-444444444444';
    app.vrc.account = () => ({ vrc_id: uid, me: {} });
    await assert.rejects(app.post({ act: 'admin_sys' }, {}), /Besitzer/);
    uid = OWNER;
    const s = await app.post({ act: 'admin_sys' }, {});
    assert.ok(s.version && s.mem > 0);
    const calls = []; app.tools.call = async (m, p, q) => { calls.push([m, p, q]); return { ok: 1 }; };
    const r = await app.post({ act: 'admin_api', path: '/worlds?search=pug&n=5' }, {});
    assert.deepStrictEqual(calls[0], ['GET', '/worlds', { search: 'pug', n: '5' }]); assert.strictEqual(r.data.ok, 1);
    await assert.rejects(app.post({ act: 'admin_api', path: 'https://evil' }, {}), /ungültig/);
    await assert.rejects(app.post({ act: 'admin_api', path: '/a/../b' }, {}), /ungültig/);
    const seen = []; app.tools.onGameEvent = e => seen.push(e.kind);
    await app.post({ act: 'admin_sim', kind: 'player_join', name: 'Neko' }, {});
    assert.ok(seen.includes('player_join') && [...app.game.state.players.values()].some(p => p.name === 'Neko'));
    const chat = []; app.game.osc.chatbox = async t => { chat.push(t); };
    const d = await app.post({ act: 'admin_fun', kind: 'dice' }, {});
    assert.ok(/^🎲 [1-6]$/.test(chat[0]) && d.msg === chat[0]);
    delete process.env.NEXUS_OWNER_HASH;
    app.tools.stop();
});

test('2.9.2: Spielzeug-Verknüpfungen (SPS-Plugs/Sockets/Touch, Ein-/Ausschließen, berührt von, Mutatoren) + Admin nur für Besitzer ausgeliefert', async () => {
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const OWNER = 'usr_' + 'a'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-292-')) } });
    app.game.osc.stopListen();
    let uid = OWNER;
    app.vrc.account = () => ({ vrc_id: uid, me: {}, display_name: 'X' });
    grant18(app);
    assert.ok(/data-tab="admin"/.test(app.page()) && /nexus-admin\.js/.test(app.page()), 'Besitzer bekommt Admin');
    uid = 'usr_' + 'b'.repeat(8) + '-1111-2222-3333-444444444444';
    const pg = app.page();
    assert.ok(!/data-tab="admin"/.test(pg) && !/data-pane="admin"/.test(pg) && !/nexus-admin\.js/.test(pg), 'fremdes Konto: Admin gar nicht in der Seite');
    uid = OWNER;
    const t = app.toys, sent = [];
    t.ws = { readyState: 1 }; t.req = async m => { sent.push(m); return {}; };
    t.devices.set(0, { index: 0, name: 'Power Masturbator', motors: [{ index: 0, type: 'Vibrate', steps: 100 }] });
    t.devices.set(1, { index: 1, name: 'Deep Diver', motors: [{ index: 0, type: 'Vibrate', steps: 100 }] });
    const last = i => { const l = sent.filter(m => m.ScalarCmd && m.ScalarCmd.DeviceIndex === i); return l.length ? l[l.length - 1].ScalarCmd.Scalars[0].Scalar : null; };
    app.toys.saveCfg({ links_on: '1', idle_stop: '5', links: JSON.stringify({
        'Power Masturbator': [{ type: 'plugs', include: [], exclude: ['Finger'], src: { pen_others: true, touch_others: false } }],
        'Deep Diver': [{ type: 'sockets', include: ['Vag'], src: { pen_others: true }, mut: [{ t: 'dead', v: 2 }, { t: 'scale', v: 2 }] }, { type: 'constant', value: 10 }] }) });
    const osc = (n, v) => t.onOsc('/avatar/parameters/' + n, [v]);
    osc('OGB/Pen/Dick/PenOthers', 0.6); osc('OGB/Pen/Finger/PenOthers', 0.9); osc('OGB/Pen/Dick/TouchOthers', 0.95);
    osc('OGB/Orf/Vag/PenOthers', 0.4); osc('OGB/Orf/Anal/PenOthers', 1);
    t.compute(); await U.sleep(20);
    assert.strictEqual(last(0), 0.6, 'Plug „Dick“ von fremdem Socket; Finger ausgeschlossen; Hände aus');
    assert.strictEqual(last(1), 0.5, 'Socket „Vag“: Totzone 20 % → 0,25, ×2 = 0,5 (Anal nicht eingeschlossen)');
    osc('OGB/Orf/Vag/PenOthers', 0);
    t.compute(); await U.sleep(20);
    assert.strictEqual(last(1), 0.1, 'nichts drin → Konstant 10 % bleibt');
    assert.ok(t.status().zones.plugs.includes('Dick') && t.status().zones.sockets.includes('Anal'), 'gefundene Zonen für die Auswahl');
    await app.post({ act: 'toys_stop' }, {});
    assert.strictEqual(app.toys.cfg().links_on, false, 'Not-Aus schaltet Verknüpfungen aus');
    delete process.env.NEXUS_OWNER_HASH;
    app.toys.stop(); app.tools.stop();
});

test('2.11.0: NSFW-Spielereien – Muster (alle 8), Dauer läuft ab, Überraschung, Statistik, Chatbox (Privat sperrt), Consent, Handy erlaubt', async () => {
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const { PATTERNS } = require('../backend/toys');
    const { ALLOWED } = require('../backend/remote');
    const OWNER = 'usr_' + 'c'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-211-')) } });
    app.game.osc.stopListen();
    app.vrc.account = () => ({ vrc_id: OWNER, me: {}, display_name: 'X' });
    grant18(app);
    const t = app.toys, sent = [], chat = [];
    app.game.osc.chatbox = async (x) => { chat.push(x); };
    await assert.rejects(app.post({ act: 'toys_pattern', id: 'welle' }, {}), /verbinden/);
    t.ws = { readyState: 1 }; t.req = async m => { sent.push(m); return {}; };
    t.devices.set(0, { index: 0, name: 'Testgerät', motors: [{ index: 0, type: 'Vibrate', steps: 100 }] });
    const last = () => { const l = sent.filter(m => m.ScalarCmd); return l.length ? l[l.length - 1].ScalarCmd.Scalars[0].Scalar : null; };
    // jedes Muster liefert Werte 0…1
    for (const [id, p] of Object.entries(PATTERNS)) { const s = {}; for (let x = 0; x < 30; x += 0.37) { const v = p.f(x, s); assert.ok(v >= 0 && v <= 1, id + ' @' + x + ' = ' + v); } }
    await assert.rejects(app.post({ act: 'toys_pattern', id: 'quatsch' }, {}), /Unbekannt/);
    let st = await app.post({ act: 'toys_pattern', id: 'puls', speed: '1', strength: '50', seconds: '0' }, {});
    assert.ok(/Puls/.test(st.msg) && st.pattern.id === 'puls' && st.pattern.left === 0, 'endlos');
    t.compute(); await U.sleep(10);
    assert.strictEqual(last(), 0.5, 'Puls-Spitze × 50 %');
    // Dauer abgelaufen → aus
    await app.post({ act: 'toys_pattern', id: 'welle', seconds: '1' }, {});
    t.pat.until = Date.now() - 1; t.compute(); await U.sleep(10);
    assert.strictEqual(t.pat, null); assert.strictEqual(last(), 0, 'nach Ablauf aus');
    st = await app.post({ act: 'toys_surprise' }, {});
    assert.ok(st.pattern && st.pattern.name.includes('Überraschung') && st.pattern.left >= 19 && st.pattern.left <= 60, 'Überraschung 20–60 s, Muster geheim');
    st = await app.post({ act: 'toys_stop' }, {});
    assert.strictEqual(st.pattern, null, 'Not-Aus beendet Muster');
    t.idle();
    assert.ok(st.stats.peak >= 50 && st.stats.patterns === 3, 'Statistik: Spitze & Anzahl');
    st = await app.post({ act: 'toys_stats_reset' }, {});
    assert.strictEqual(st.stats.patterns, 0);
    // Chatbox-Spielereien
    await app.post({ act: 'nsfw_chat', text: '  🔥   in Stimmung ' }, {});
    assert.strictEqual(chat.pop(), '🔥 in Stimmung');
    await app.post({ act: 'nsfw_consent' }, {});
    assert.ok(/Alles okay/.test(chat.pop()));
    await app.post({ act: 'nsfw_private', on: '1' }, {});
    await assert.rejects(app.post({ act: 'nsfw_chat', text: 'x' }, {}), /Privat/);
    await app.post({ act: 'nsfw_chat', text: 'x'.repeat(300) }, {}).catch(() => {});
    await app.post({ act: 'nsfw_private', on: '0' }, {});
    await app.post({ act: 'nsfw_chat', text: 'y'.repeat(300) }, {});
    assert.strictEqual(chat.pop().length, 144, 'auf 144 Zeichen gekürzt');
    for (const a of ['toys_surprise', 'toys_pattern', 'toys_pattern_stop', 'nsfw_consent']) assert.ok(ALLOWED.includes(a), 'Handy darf ' + a);
    assert.ok(!ALLOWED.includes('nsfw_chat'), 'freier Chatbox-Text nicht übers Handy');
    // Fremde ohne Schlüssel: gesperrt
    app.vrc.account = () => ({ vrc_id: 'usr_' + 'd'.repeat(8) + '-1111-2222-3333-444444444444', me: {}, display_name: 'Y' });
    await assert.rejects(app.post({ act: 'toys_surprise' }, {}), /freigeschaltet/);
    await assert.rejects(app.post({ act: 'nsfw_chat', text: 'x' }, {}), /freigeschaltet/);
    delete process.env.NEXUS_OWNER_HASH;
    app.toys.stop(); app.tools.stop();
});

test('2.12.0: Spielzeug-Fernsteuerung über User-ID – Heimnetz (Suche per UDP) und Internet-Briefkasten, Freigabeliste, Schlüssel, Doppelt, Höchststärke, Panik', async () => {
    const http = require('http');
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const OWN = 'usr_' + 'e'.repeat(8) + '-1111-2222-3333-444444444444', PART = 'usr_' + 'f'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWN); process.env.NEXUS_REMOTE_HOST = '127.0.0.1'; process.env.NEXUS_TOY_UDP = '17991';
    // Briefkasten wie toyrelay.php
    const boxes = {};
    const relay = http.createServer(async (req, res) => {
        let raw = ''; for await (const c of req) raw += c; const d = JSON.parse(raw), a = new URL(req.url, 'http://x').searchParams.get('a'), out = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
        if (a === 'send') { if (!boxes[d.to]) return out({ error: 'Empfänger hat die Fernsteuerung über diese Webseite nicht an.' }); boxes[d.to].m.push(d.msg); return out({ ok: true }); }
        const b = boxes[d.to] = boxes[d.to] || { k: d.key, m: [] }; if (b.k !== d.key) return out({ error: 'fremd' }); const m = b.m; b.m = []; out({ msgs: m });
    });
    await new Promise(r => relay.listen(0, '127.0.0.1', r));
    process.env.NEXUS_RELAY_BASE = process.env.NEXUS_TEST_RELAY || 'http://127.0.0.1:' + relay.address().port;   // NEXUS_TEST_RELAY = echtes toyrelay.php (php -S)
    const mk = async uid => { const db = await openDatabase(null); const a = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-212-')) } }); a.game.osc.stopListen(); a.vrc.account = () => ({ vrc_id: uid, me: {}, display_name: uid === OWN ? 'Besitzer' : 'Partner' }); return a; };
    const O = await mk(OWN), P = await mk(PART);
    const pub = O.nsfw.makeOwnerKey(); P.nsfw.trusted.push(pub);
    grant18(O); grant18(P);
    const peers = new Set([PART, OWN]);   // GhostNode-Abfrage „ist Verified 18+ mit NSFW an?“ (Mock)
    O.account.peer = P.account.peer = async uid => peers.has(uid);
    const t = O.toys, sent = []; t.ws = { readyState: 1 }; t.req = async m => { sent.push(m); return {}; };
    t.devices.set(0, { index: 0, name: 'Testgerät', motors: [{ index: 0, type: 'Vibrate', steps: 100 }] });
    const last = () => { const l = sent.filter(m => m.ScalarCmd); return l.length ? l[l.length - 1].ScalarCmd.Scalars[0].Scalar : null; };
    // nicht auf der Liste
    await O.post({ act: 'tremote_cfg', recv_on: '1', lan_port: '17990', max: '60', allow: '' }, {});
    await U.sleep(150);
    await P.post({ act: 'tremote_cfg', t_uid: 'https://vrchat.com/home/user/' + OWN }, {});
    await assert.rejects(P.post({ act: 'tremote_send', c: 'ping' }, {}), /Freigabeliste/);
    assert.strictEqual(P.toyremote.status().ctrl.via, 'lan', 'im Heimnetz per UDP gefunden');
    await O.post({ act: 'tremote_cfg', allow: PART + ' | Partner' }, {});
    let st = await P.post({ act: 'tremote_send', c: 'ping' }, {});
    assert.ok(st.ctrl.ack.ok && /verbunden mit Besitzer/.test(st.ctrl.ack.msg), st.ctrl.ack.msg);
    await P.post({ act: 'tremote_send', c: 'set', lv: '1' }, {});
    assert.strictEqual(last(), 0.6, 'Höchststärke 60 %');
    assert.strictEqual(O.toyremote.status().active.name, 'Partner');
    // Doppelt, falsche ID, kaputter Schlüssel
    const m = { v: 1, from: PART, to: OWN, tok: '', ts: Date.now(), n: 'ab'.repeat(10), c: 'stop', a: {} };
    await O.toyremote.receive(m, 'lan');
    await assert.rejects(O.toyremote.receive(m, 'lan'), /doppelt/);
    // Absender ohne Verified 18+ / NSFW (GhostNode sagt nein) → abgelehnt, egal welcher Schlüssel mitkommt
    peers.delete(PART);
    await assert.rejects(O.toyremote.receive(Object.assign({}, m, { n: 'cd'.repeat(10), tok: 'NXK1.x.y' }), 'lan'), /keine NSFW-Freigabe/);
    peers.add(PART);
    await assert.rejects(O.toyremote.receive(Object.assign({}, m, { n: 'ef'.repeat(10), ts: Date.now() - 120000 }), 'lan'), /zu alt/);
    // ohne Lebenszeichen → aus
    await P.post({ act: 'tremote_send', c: 'set', lv: '0.5' }, {});
    assert.strictEqual(last(), 0.3);
    P.toyremote.ctrl.lv = 0; O.toyremote.remoteAt = Date.now() - 16000; O.toyremote.tick();
    await U.sleep(20); assert.strictEqual(last(), 0, 'nach 15 s ohne Signal aus');
    // Internet: Heimnetz beim Besitzer aus → Weg über den Briefkasten
    await O.post({ act: 'tremote_cfg', lan: '0' }, {});
    await O.toyremote.pollWeb();
    P.toyremote.ctrl.via = ''; P.toyremote.ctrl.addr = '';
    st = await P.post({ act: 'tremote_send', c: 'pattern', id: 'welle', strength: '100' }, {});
    assert.strictEqual(st.ctrl.via, 'web', 'nicht im Heimnetz → Internet');
    await U.sleep(50); await O.toyremote.pollWeb(); await U.sleep(50);
    assert.ok(t.pat && t.pat.id === 'welle' && t.pat.strength <= 0.6 && t.pat.until - t.pat.start <= 600000, 'Muster gedeckelt');
    await P.toyremote.pollWeb();
    assert.ok(P.toyremote.status().ctrl.ack && P.toyremote.status().ctrl.ack.via === 'web' && P.toyremote.status().ctrl.ack.ok, 'Antwort über den Briefkasten');
    // fremder Briefkasten-Schlüssel kann nicht mitlesen
    const { uidHash } = require('../backend/toyremote');
    const r = await fetch(process.env.NEXUS_RELAY_BASE + '/toyrelay.php?a=poll', { method: 'POST', body: JSON.stringify({ to: uidHash(OWN), key: 'x'.repeat(48) }) }).then(x => x.json());
    assert.ok(r.error, 'Briefkasten nur mit Schlüssel');
    // Selbsttest mit der eigenen ID (ohne Freigabeliste, direkt auf diesem PC)
    await O.post({ act: 'tremote_cfg', lan: '1', allow: '', t_uid: OWN }, {});
    await U.sleep(150);
    st = await O.post({ act: 'tremote_send', c: 'ping' }, {});
    assert.ok(st.ctrl.ack.ok && st.ctrl.via === 'lan', 'Selbsttest: ' + JSON.stringify(st.ctrl));
    await O.post({ act: 'tremote_send', c: 'set', lv: '1' }, {});
    assert.strictEqual(last(), 0.6, 'Selbsttest steuert eigenes Spielzeug (gedeckelt)');
    assert.strictEqual(O.toyremote.status().active.name, 'Du (Selbsttest)');
    // Panik
    await O.post({ act: 'nsfw_panic' }, {});
    assert.strictEqual(O.toyremote.cfg().recv_on, false, 'Panik schaltet Empfang aus');
    await assert.rejects(O.toyremote.receive(Object.assign({}, m, { n: '12'.repeat(10), ts: Date.now() }), 'lan'), /aus/);
    for (const a of [O, P]) { a.toyremote.stop(); a.toys.stop(); a.tools.stop(); }
    relay.close();
    for (const k of ['NEXUS_OWNER_HASH', 'NEXUS_REMOTE_HOST', 'NEXUS_TOY_UDP', 'NEXUS_RELAY_BASE']) delete process.env[k];
});

test('2.13.0: 🔞 NSFW-Changelog getrennt – öffentlich „***“, in der App nur freigeschaltet; Release-Notizen & Discord', async () => {
    const http = require('http');
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const { buildNsfw } = require('../scripts/changelog-build');
    assert.deepStrictEqual(require('../backend/changelog-nsfw.json'), buildNsfw(), 'changelog-nsfw.json ist veraltet');
    const cl = require.resolve('../backend/changelog.json'), cn = require.resolve('../backend/changelog-nsfw.json');
    const keep = [require.cache[cl].exports, require.cache[cn].exports];
    require.cache[cl].exports = [{ version: '9.9.9', title: 'Test', body: '- 🎉 Öffentlich\n- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)' }];
    require.cache[cn].exports = [{ version: '9.9.9', title: 'Geheim', body: '- 💋 Geheime Neuerung' }];
    const OWN = 'usr_' + '1'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWN);
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-213-')) } });
    app.game.osc.stopListen();
    let uid = 'usr_' + '2'.repeat(8) + '-1111-2222-3333-444444444444';
    app.vrc.account = () => ({ vrc_id: uid, me: {}, display_name: 'X' });
    let b = app.about({ n: 5 }).changelog[0].body;
    assert.ok(/🔞 \*\*\*/.test(b) && !/Geheim/.test(b), 'gesperrt: nur ***');
    uid = OWN;
    b = app.about({ n: 5 }).changelog[0].body;
    assert.ok(/🔞 \*\*\*/.test(b), 'auch Besitzer ohne Verified 18+: nur ***');
    grant18(app);
    b = app.about({ n: 5 }).changelog[0].body;
    assert.ok(/Geheime Neuerung/.test(b) && /🔞 NSFW – Geheim/.test(b) && !/\*\*\* \(nur/.test(b) && /Öffentlich/.test(b), 'freigeschaltet: NSFW statt ***');
    require.cache[cl].exports = keep[0]; require.cache[cn].exports = keep[1];
    // Release-Notizen & Discord-Nachricht aus der README (öffentlicher Teil)
    const { section, discord } = require('../scripts/release-notes');
    const { VERSION } = require('../backend/vrchat');
    assert.ok(section(VERSION), 'aktuelle Version steht in der README');
    const d = discord(VERSION, 'https://github.com/x/releases/tag/v');
    assert.ok(d.embeds[0].title.includes(VERSION) && d.embeds[0].description.length <= 4096 && d.allowed_mentions.parse.length === 0);
    const { discordNsfw } = require('../scripts/release-notes');
    assert.strictEqual(discordNsfw('0.0.1'), null, 'ohne NSFW-Teil kein Post im NSFW-Kanal');
    // 💬 Discord-Einladung unter „Über“ und in der News
    assert.strictEqual(app.about().discord, require('../backend/links.json').discord);
    assert.ok(/^https:\/\/discord\.gg\//.test(app.about().discord));
    assert.strictEqual(app.about().patreon, 'https://www.patreon.com/cw/VRCNexusTools'); assert.ok(Array.isArray(app.about().supporters));
    { const srv = http.createServer((q, r) => r.end(JSON.stringify([{ name: 'Foxy', tier: 'Gold' }, { name: '', tier: 'x' }]))); await new Promise(r => srv.listen(0, '127.0.0.1', r));
      process.env.NEXUS_SUPPORTERS_URL = 'http://127.0.0.1:' + srv.address().port + '/s.json';
      const ls = await app.post({ act: 'about_supporters' }, {}); assert.ok(ls.live && ls.supporters.length === 1 && ls.supporters[0].name === 'Foxy', 'live Unterstützer');
      app._sup = null; srv.close(); process.env.NEXUS_SUPPORTERS_URL = 'http://127.0.0.1:9/x';
      const off = await app.post({ act: 'about_supporters' }, {}); assert.ok(!off.live && Array.isArray(off.supporters), 'offline → mitgelieferte Liste');
      delete process.env.NEXUS_SUPPORTERS_URL; }
    assert.ok(d.embeds[0].fields.some(f => f.name === '💬 Discord'), 'Discord-Link in der News');
    delete process.env.NEXUS_OWNER_HASH;
    app.tools.stop(); if (app.toys) app.toys.stop(); if (app.toyremote) app.toyremote.stop();
});

test('1.7: Wörterbuch (EN/FR/JA) vollständig und Platzhalter stimmen', () => {
    const fs = require('fs'), path = require('path'), vm = require('vm');
    const file = path.join(__dirname, '..', 'renderer', 'js', 'i18n-dict.js');
    const box = { window: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), box);
    const d = box.window.NexusDict;
    assert.ok(d && d.en && d.fr && d.ja, 'Wörterbuch fehlt');
    const keys = Object.keys(d.en);
    assert.ok(keys.length > 1000, 'zu wenige Einträge: ' + keys.length);
    for (const l of ['fr', 'ja']) assert.deepStrictEqual(Object.keys(d[l]).sort(), keys.slice().sort(), l + ': Einträge fehlen');
    const n = s => (s.match(/#/g) || []).length;
    for (const k of keys) for (const l of ['en', 'fr', 'ja']) assert.strictEqual(n(d[l][k]), n(k), l + ': Platzhalter in „' + k + '“');
    // Datei ist aktuell gebaut (tsv neuer als js → vergessen zu bauen)
    const tsv = fs.readdirSync(path.join(__dirname, '..', 'renderer', 'i18n')).map(f => fs.statSync(path.join(__dirname, '..', 'renderer', 'i18n', f)).mtimeMs);
    if (!process.env.CI) assert.ok(Math.max(...tsv) <= fs.statSync(file).mtimeMs + 1000, 'i18n-dict.js ist veraltet – node scripts/i18n-build.js ausführen');
});

test('2.10.2 Handy-crypto kann alle Hashes, die das Backend nutzt', () => {
    const shim = path.join(__dirname, '..', '..', 'vrc-nexus-android', 'src', 'shims', 'crypto.js');
    if (!fs.existsSync(shim)) return;
    const sc = require(shim), nc = require('crypto'), dir = path.join(__dirname, '..', 'backend'), algs = new Set();
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/createHash\('([a-z0-9]+)'\)/g)) algs.add(m[1]);
    assert.ok(algs.has('sha256'));
    for (const a of algs) for (const n of [0, 3, 55, 56, 64, 200]) { const b = nc.randomBytes(n); assert.strictEqual(sc.createHash(a).update(b).digest('hex'), nc.createHash(a).update(b).digest('hex'), a + ' / ' + n); }
});

test('3.0.0: Puls – gemeinsame Quelle (OSC, HypeRate-Mock), Avatar-Parameter, Verlauf, Platzhalter, Stream Deck, HUD', async () => {
    const { NexusApp } = require('../backend/app');
    const { WebSocketServer } = require('ws');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => 'enc:' + s, decrypt: s => s.replace(/^enc:/, '') }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const sent = [];
    app.game.osc.send = async (a, v) => { sent.push([a, v]); };
    const post = (act, d) => app.post(Object.assign({ act }, d || {}), {});
    let r = await post('hr_get');
    assert.strictEqual(r.cfg.source, 'off'); assert.strictEqual(r.bpm, 0);
    await assert.rejects(post('hr_save', { source: 'quatsch' }), /Quelle/);
    // OSC/Smartwatch: Parameter „HR“ kommt herein (Name tolerant), nichts wird zurückgeschickt (Schleife)
    await post('hr_save', { source: 'osc', osc_in: 'hr, HeartRate' });
    for (const f of app.game.osc.taps) f('/avatar/parameters/Heart_Rate', [77]);
    for (const f of app.game.osc.taps) f('/avatar/parameters/HR', [81]);
    r = await post('hr_get');
    assert.strictEqual(r.bpm, 81); assert.ok(r.active); assert.strictEqual(r.from, 'osc');
    assert.ok(!sent.length, 'bei OSC-Quelle darf nichts zurückgehen');
    assert.strictEqual(app.game.fill('{puls} bpm'), '81 bpm');
    for (const f of app.game.osc.taps) f('/avatar/parameters/HR', [0.4]);   // Float-Variante 0…1
    assert.strictEqual(app.heart.bpm, 102);
    // HypeRate-Mock (Phoenix-Kanal)
    const wss = new WebSocketServer({ port: 0 });
    let joined = '', token = '';
    wss.on('connection', (ws, req) => {
        token = new URL(req.url, 'http://x').searchParams.get('token');
        ws.on('message', m => { const j = JSON.parse(String(m)); if (j.event === 'phx_join') { joined = j.topic; ws.send(JSON.stringify({ topic: j.topic, event: 'phx_reply', payload: { status: 'ok' }, ref: j.ref })); setTimeout(() => ws.send(JSON.stringify({ topic: j.topic, event: 'hr_update', payload: { hr: 95 } })), 30); } });
    });
    await new Promise(res => wss.on('listening', res));
    process.env.NEXUS_HYPERATE_WS = 'ws://127.0.0.1:' + wss.address().port;
    await assert.rejects(post('hr_save', { hyperate_id: 'nicht gültig!' }), /HypeRate/);
    await assert.rejects(post('hr_hyperate_key', { token: 'x' }), /HypeRate/);
    await post('hr_hyperate_key', { token: 'test-hyperate-key-123' });
    assert.ok(db.setting('heart_hyperate', '').startsWith('enc:'), 'Schlüssel nicht verschlüsselt');
    await post('hr_save', { source: 'hyperate', hyperate_id: 'https://app.hyperate.io/ab12', min: 60, max: 160, param: 'HeartRate' });
    for (let i = 0; i < 50 && app.heart.bpm !== 95; i++) await U.sleep(20);
    assert.strictEqual(joined, 'hr:ab12'); assert.strictEqual(token, 'test-hyperate-key-123');
    assert.strictEqual(app.heart.bpm, 95);
    const got = Object.fromEntries(sent.map(([a, v]) => [a.replace('/avatar/parameters/', ''), v]));
    assert.strictEqual(got.HR, 95); assert.strictEqual(got.isHRActive, true); assert.strictEqual(got.tensHR, 9); assert.strictEqual(got.onesHR, 5);
    assert.strictEqual(got.HRPercent.float, 0.35); assert.strictEqual(got.HeartRate, 95);
    // Verlauf, Werte für Startseite, Stream Deck und SteamVR-HUD
    r = await post('hr_get');
    assert.ok(r.hist.length >= 1 && r.stats.max >= 95);
    assert.strictEqual(app.home.data().heart.bpm, 95);
    assert.strictEqual(app.tools.apiState().heart.bpm, 95);
    app.settings.save({ 'vr.overlay_hud_items': 'puls,zeit' });
    assert.ok(app.hudState().items.some(i => i.key === 'puls' && i.value === '95'));
    // Chatbox-Modul nutzt dieselbe Quelle
    await post('cm_save', { mod: 'heart', mod_on: '1' });
    r = await post('cm_get', { refresh: '1' });
    assert.strictEqual(r.values.puls, '95'); assert.strictEqual(r.hr_source, 'hyperate');
    // weg → „aus“ an den Avatar
    app.heart.at = Date.now() - 60000; sent.length = 0; await app.heart.refresh();
    assert.ok(sent.some(([a, v]) => a.endsWith('/isHRActive') && v === false));
    assert.strictEqual(app.game.fill('[{puls}]'), '[]');
    await post('hr_save', { source: 'off' });
    app.heart.stop(); app.chatmods.stop(); app.tools.stop(); wss.close();
    delete process.env.NEXUS_HYPERATE_WS;
});

test('3.0.0: Warnliste über GhostNode (Mock) – Schlüssel nötig, Kennzeichen, Alarm nie in Chatbox, Moderator schaltet kein NSFW frei', async () => {
    const crypto = require('crypto');
    const { NexusApp } = require('../backend/app');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tok = (uid, f) => { const body = b64u(JSON.stringify({ v: 1, id: 'k1', uid, f, iat: 1, exp: 0 })); return 'NXK1.' + body + '.' + b64u(crypto.sign(null, Buffer.from(body), privateKey)); };
    const ME = 'usr_00000000-0000-4000-8000-000000000001', BAD = 'usr_00000000-0000-4000-8000-000000000009';
    // Mock von nexuswarn.php
    const seen = [];
    const items = [{ id: BAD, name: 'Bad Guy', count: 2, reasons: { crasher: 2 }, reason: 'crasher', first: 1, last: 2, mine: false }];
    const srv = require('http').createServer((req, res) => {
        let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
            const a = new URL(req.url, 'http://x').searchParams.get('a'), j = JSON.parse(b);
            seen.push([a, j]);
            res.setHeader('Content-Type', 'application/json');
            if (!/^NXK1\./.test(j.token || '')) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Kein Schlüssel' })); }
            if (a === 'list') return res.end(JSON.stringify({ items, mine: [], me: { listed: false }, min: 2, admin: true }));
            if (a === 'report') return res.end(JSON.stringify({ ok: true }));
            if (a === 'admin_list') return res.end(JSON.stringify({ min: 2, revoked: [], reports: [], appeals: [], log: [] }));
            res.end(JSON.stringify({ ok: true }));
        });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.NEXUS_WARN_BASE = 'http://127.0.0.1:' + srv.address().port;
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir(), notify: (t, b) => notes.push(t + ' ' + b) } });
    const notes = [], chat = [];
    app.game.osc.stopListen();
    app.game.osc.chatbox = async t => { chat.push(t); };
    app.nsfw.myId = () => ME;
    app.nsfw.trusted.push(pub);
    const post = (act, d) => app.post(Object.assign({ act }, d || {}), {});
    // ohne Schlüssel: verständlicher Fehler, nichts geht raus
    await assert.rejects(post('warn_list', { refresh: '1' }).then(r => { if (r.error) throw new Error(r.error); }), /Freischalt-Schlüssel/);
    // Moderator-Schlüssel: Warnliste ja, NSFW nein
    db.setSetting('nsfw_token', tok(ME, ['mod']));
    const acc = app.nsfw.access();
    assert.strictEqual(acc.unlocked, false); assert.strictEqual(acc.mod, true);
    let r = await post('warn_list', { refresh: '1' });
    assert.strictEqual(r.items.length, 1); assert.strictEqual(r.admin, true);
    assert.ok(seen.some(([a, j]) => a === 'list' && j.token.startsWith('NXK1.')));
    r = await post('warn_badges');
    assert.strictEqual(r.badges[BAD].label, 'Crasher');
    // melden: Beweis Pflicht
    await assert.rejects(post('warn_save', { id: BAD, reason: 'troll', evidence: '' }), /Beweis/);
    await post('warn_save', { id: BAD, name: 'Bad Guy', reason: 'troll', evidence: 'log 20:01', days: 30 });
    assert.ok(seen.some(([a, j]) => a === 'report' && j.target === BAD && j.evidence === 'log 20:01' && j.days === 30));
    // Admin durchreichen (nur erlaubte Aktionen)
    r = await post('warn_admin_list');
    assert.deepStrictEqual(r.reports, []);
    await assert.rejects(post('warn_admin_hack'), /Unbekannte/);
    // gelisteter Spieler kommt → Hinweis + Automatik, aber NIE in die Chatbox
    app.settings.save({ 'vr.chatbox': true });
    app.warn.onGameEvent({ kind: 'player_join', player_id: BAD, player_name: 'Bad Guy', ts: Math.floor(Date.now() / 1000), world_name: 'Testwelt' });
    assert.ok(notes.some(n => n.includes('Crasher') && n.includes('Bad Guy')), JSON.stringify(notes));
    assert.ok(!chat.some(t => /Bad Guy|Crasher/.test(t)), 'Warnung landete in der Chatbox');
    assert.strictEqual(app.warn.recent[0].id, BAD);
    // Zwischenspeicher übersteht einen Neustart (offline)
    srv.close();
    const app2 = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app2.game.osc.stopListen();
    assert.ok(app2.warn.badges()[BAD]);
    app.tools.stop(); app2.tools.stop();
    delete process.env.NEXUS_WARN_BASE;
});

test('3.0.2: Nexus-Konto – direkt mit der VRChat-ID (ohne Code, Bio bleibt unberührt), 18+ direkt bei VRChat, NSFW-Schalter, Entzug sperrt NSFW', async () => {
    const http = require('http');
    const { NexusApp } = require('../backend/app');
    const ME = 'usr_00000000-0000-4000-8000-0000000000aa';
    // Mock von nexusacct.php + VRChat-Bio
    let bio = 'Meine Bio', code = '', age = '', vrcAge = '', nsfw = false, tokenOk = true, vrcDown = false;
    const reported = [], registered = [];
    const acc = () => ({ vrc_id: ME, name: 'Tester', verified18: age === '18+', age_status: age || 'hidden', age_until: age === '18+' ? Math.floor(Date.now() / 1000) + 7 * 86400 : 0, nsfw_on: age === '18+' && nsfw });
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
        const a = new URL(req.url, 'http://x').searchParams.get('a'), j = JSON.parse(b || '{}'), out = (o, c) => { res.writeHead(c || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
        if (a === 'register') { registered.push(j); return out({ token: 'f'.repeat(64), account: acc() }); }
        if (!tokenOk || j.token !== 'f'.repeat(64)) return out({ error: 'Nicht angemeldet.' }, 401);
        if (a === 'age') { reported.push(j.status); age = j.status === '18+' ? '18+' : ''; return out({ account: acc() }); }
        if (a === 'me' || a === 'recheck') return out({ account: acc(), devices: [] });
        if (a === 'nsfw') { if (j.on && age !== '18+') return out({ error: 'NSFW lässt sich nur mit „Verified 18+“ einschalten.' }, 400); nsfw = !!j.on; return out({ account: acc() }); }
        out({ ok: true });
    }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.NEXUS_ACCT_BASE = 'http://127.0.0.1:' + srv.address().port;
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => 'E:' + s, decrypt: s => String(s).replace(/^E:/, '') }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    app.vrc.account = () => ({ vrc_id: ME, me: {}, display_name: 'Tester' });
    const bios = [];   // darf leer bleiben: seit 3.0.2 wird die Bio nicht mehr angefasst
    app.tools.call = async (m, p, q, b) => {
        if (p === '/ageVerification/status') { if (vrcDown) throw new Error('offline'); return { status: vrcAge }; }
        if (p === '/auth/user') { if (vrcDown) throw new Error('offline'); return { id: ME }; }
        if (m === 'GET') return { bio }; if (m === 'PUT') { bio = b.bio; bios.push(bio); } return {};
    };
    const post = (act, d) => app.post(Object.assign({ act }, d || {}), {});
    assert.strictEqual(app.nsfw.access().unlocked, false);
    assert.strictEqual(app.nsfw.access().reason, 'Nexus-Konto nicht verbunden.');
    let r = await post('acct_connect', { auto: '1' });
    assert.ok(r.connected && r.account.vrc_id === ME);
    assert.deepStrictEqual(bios, [], 'Bio bleibt unberührt');
    assert.strictEqual(registered[0].vrc_id, ME); assert.strictEqual(registered[0].name, 'Tester');
    assert.ok(db.setting('nexus_acct', '').startsWith('E:'), 'Token verschlüsselt gespeichert');
    // ohne 18+: NSFW nicht einschaltbar
    await assert.rejects(post('acct_nsfw', { on: '1' }), /Verified 18\+/);
    assert.strictEqual(app.nsfw.access().unlocked, false);
    assert.deepStrictEqual(reported, [''], 'nach dem Verbinden direkt bei VRChat geprüft und gemeldet');
    // VRChat meldet 18+ (eigene Sitzung, /ageVerification/status) → neu prüfen → einschalten
    vrcAge = '18+';
    r = await post('acct_recheck');
    assert.strictEqual(reported[reported.length - 1], '18+');
    assert.ok(r.age.verified && !r.age.nsfw_on);
    assert.strictEqual(app.nsfw.access().unlocked, false, 'NSFW bleibt aus, bis man es bewusst einschaltet');
    await post('acct_nsfw', { on: '1' });
    assert.ok(app.nsfw.access().unlocked && app.nsfw.access().features.includes('toys'));
    // lokal abgelaufene Freigabe sperrt ohne Server
    const o = app.account.load(); o.account.age_until = 1; app.account.store(o);
    assert.strictEqual(app.nsfw.access().unlocked, false);
    // VRChat nicht erreichbar → nichts melden, keine falsche Sperre
    vrcDown = true; const n = reported.length;
    await assert.rejects(post('acct_recheck'), /nicht erreichbar/);
    assert.strictEqual(reported.length, n); vrcDown = false;
    // Status bei VRChat weg → beim Auffrischen gesperrt + einmalige Warnung
    vrcAge = '18+'; await post('acct_recheck'); await post('acct_nsfw', { on: '1' });
    vrcAge = '';
    const ac = app.account.load(); ac.account.age_checked = 1; app.account.store(ac);   // letzte Prüfung > 6 h her
    await app.account.refresh(true);
    assert.strictEqual(app.nsfw.access().unlocked, false);
    assert.ok(app.account.lost && /abgelaufen/.test(app.account.lost.title));
    // anderes VRChat-Konto am selben PC: Konto gilt nicht
    vrcAge = '18+'; await post('acct_recheck'); await post('acct_nsfw', { on: '1' });
    app.vrc.account = () => ({ vrc_id: 'usr_00000000-0000-4000-8000-0000000000bb', me: {} });
    assert.strictEqual(app.nsfw.access().unlocked, false, 'Konto gehört zu einer anderen VRChat-ID');
    app.vrc.account = () => ({ vrc_id: ME, me: {} });
    // Token widerrufen (401) → Konto auf dem Gerät gelöscht
    tokenOk = false;
    await app.account.refresh(true);
    assert.strictEqual(app.account.current(), null);
    assert.strictEqual(app.nsfw.access().unlocked, false);
    app.tools.stop(); srv.close();
    delete process.env.NEXUS_ACCT_BASE;
});

test('3.0.0: Community – App reicht nur mit Konto-Token durch, Mod-Schlüssel nur für Moderatoren, Bilder über cimg, NSFW-Feed gesperrt ohne Freigabe', async () => {
    const http = require('http');
    const { NexusApp } = require('../backend/app');
    const ME = 'usr_00000000-0000-4000-8000-0000000000cc';
    const seen = [];
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
        const a = new URL(req.url, 'http://x').searchParams.get('a'), j = JSON.parse(b || '{}');
        seen.push([a, j]);
        if (a === 'media') { res.writeHead(j.id === 'a'.repeat(24) ? 200 : 400, { 'Content-Type': j.id === 'a'.repeat(24) ? 'image/png' : 'application/json' }); return res.end(j.id === 'a'.repeat(24) ? png : '{"error":"x"}'); }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(a === 'upload' ? { id: 'b'.repeat(24), status: j.rating === 'nsfw' ? 'pending' : 'ok' } : { items: [], ok: true }));
    }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.NEXUS_COMM_BASE = 'http://127.0.0.1:' + srv.address().port;
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    app.vrc.account = () => ({ vrc_id: ME, me: {} });
    const post = (act, d, f) => app.post(Object.assign({ act }, d || {}), f || {});
    await assert.rejects(post('comm_feed', { rating: 'sfw' }), /Nexus-Konto/);
    grant18(app, false);
    await post('comm_feed', { rating: 'sfw' });
    assert.strictEqual(seen[0][1].token, 'a'.repeat(64)); assert.strictEqual(seen[0][1].key, '', 'kein Mod-Schlüssel ohne Rolle');
    await assert.rejects(post('comm_feed', { rating: 'nsfw' }), /NSFW/);
    await post('comm_post', { text: 'hi', media: ['x', 'y'], parent: '0' });
    assert.deepStrictEqual(seen[seen.length - 1][1].media, ['x', 'y']);
    const r = await post('comm_upload', { rating: 'sfw' }, { file: { buffer: png, name: 't.png' } });
    assert.strictEqual(r.id, 'b'.repeat(24)); assert.strictEqual(seen[seen.length - 1][1].data, png.toString('base64'));
    let img = await app.handle({ method: 'GET', query: new URLSearchParams('cimg=' + 'a'.repeat(24)) });
    assert.strictEqual(img.status, 200); assert.strictEqual(img.headers['Content-Type'], 'image/png');
    img = await app.handle({ method: 'GET', query: new URLSearchParams('cimg=' + 'c'.repeat(24)) });
    assert.strictEqual(img.status, 404);
    img = await app.handle({ method: 'GET', query: new URLSearchParams('cimg=../../etc') });
    assert.strictEqual(img.status, 404);
    await assert.rejects(post('comm_hack'), /Unbekannte/);
    // 3.0.4: Profil-ID ist eine VRChat-ID (keine Zahl); leer = eigenes Profil → nicht mitschicken
    await post('comm_profile', { id: 'usr_00000000-0000-4000-8000-0000000000dd' });
    assert.strictEqual(seen[seen.length - 1][1].id, 'usr_00000000-0000-4000-8000-0000000000dd');
    await post('comm_profile', { id: '' });
    assert.ok(!('id' in seen[seen.length - 1][1]), 'eigenes Profil ohne id');
    await post('comm_thread', { id: '42' });
    assert.strictEqual(seen[seen.length - 1][1].id, 42, 'Beitrags-IDs bleiben Zahlen');
    app.tools.stop(); srv.close();
    delete process.env.NEXUS_COMM_BASE;
});

test('3.0.0: E2EE (X3DH + Double Ratchet) – Austausch, Reihenfolge, verlorene Nachrichten, Manipulation, Wiedereinspielen, falsche Signatur', () => {
    const E = require('../backend/e2ee');
    const clone = o => JSON.parse(JSON.stringify(o));
    const alice = E.newDevice(3), bob = E.newDevice(3);
    const bb = E.bundle(bob);
    assert.strictEqual(bb.opks.length, 3);
    // Server gibt ein Einmal-Pre-Key heraus
    const pkg = { ik_dh: bb.ik_dh, ik_sig: bb.ik_sig, spk: bb.spk, opk: bb.opks[0] };
    let a = E.initiate(alice, pkg);
    const m1 = E.encrypt(a, 'Hallo Bob 🦊');
    assert.ok(m1.pre && m1.pre.opk === bb.opks[0].id);
    assert.ok(!JSON.stringify(m1).includes('Hallo'), 'Klartext darf nicht im Umschlag stehen');
    const acc = E.accept(bob, m1.pre);
    delete bob.opks[acc.opk];
    let b = acc.st, r = E.decrypt(b, m1); b = r.st;
    assert.strictEqual(r.text, 'Hallo Bob 🦊');
    // Wiedereinspielen der ersten Nachricht: Einmal-Schlüssel ist verbraucht
    assert.throws(() => E.accept(bob, m1.pre), /verbraucht/);
    // Antwort → Ratchet-Schritt; Alice braucht danach keinen Pre-Key-Kopf mehr
    const r1 = E.encrypt(b, 'Hi Alice');
    r = E.decrypt(a, r1); a = r.st; assert.strictEqual(r.text, 'Hi Alice');
    assert.ok(!E.encrypt(clone(a), 'x').pre, 'Pre-Key-Kopf nach Antwort weg');
    // mehrere Nachrichten, außer der Reihe, eine geht verloren
    const s = [1, 2, 3, 4, 5].map(i => E.encrypt(a, 'm' + i));
    r = E.decrypt(b, s[2]); b = r.st; assert.strictEqual(r.text, 'm3');
    r = E.decrypt(b, s[0]); b = r.st; assert.strictEqual(r.text, 'm1');
    r = E.decrypt(b, s[4]); b = r.st; assert.strictEqual(r.text, 'm5');
    r = E.decrypt(b, s[3]); b = r.st; assert.strictEqual(r.text, 'm4');
    // m2 nie angekommen – trotzdem geht es weiter, auch nach erneutem Ratchet-Schritt
    const r2 = E.encrypt(b, 'weiter'); r = E.decrypt(a, r2); a = r.st; assert.strictEqual(r.text, 'weiter');
    r = E.decrypt(b, s[1]); b = r.st; assert.strictEqual(r.text, 'm2', 'späte Nachricht aus alter Kette');
    // Wiedereinspielen einer schon gelesenen Nachricht
    assert.throws(() => E.decrypt(b, s[1]));
    // Manipulation: Chiffretext, Kopf
    const m = E.encrypt(a, 'geheim');
    const bad = clone(m); const c = Buffer.from(bad.c, 'base64'); c[0] ^= 1; bad.c = c.toString('base64');
    const before = JSON.stringify(b);
    assert.throws(() => E.decrypt(b, bad));
    assert.strictEqual(JSON.stringify(b), before, 'fehlgeschlagene Entschlüsselung ändert die Sitzung nicht');
    const bad2 = clone(m); bad2.h.n = 7; assert.throws(() => E.decrypt(b, bad2));
    r = E.decrypt(b, m); assert.strictEqual(r.text, 'geheim');
    // gefälschter signierter Pre-Key wird erkannt
    const evil = E.newDevice(0), eb = E.bundle(evil);
    assert.throws(() => E.initiate(alice, { ik_dh: bb.ik_dh, ik_sig: bb.ik_sig, spk: eb.spk }), /Signatur/);
    // ohne Einmal-Pre-Key geht es auch (Server hat keine mehr)
    let a2 = E.initiate(alice, { ik_dh: bb.ik_dh, ik_sig: bb.ik_sig, spk: bb.spk });
    const x = E.encrypt(a2, 'ohne OPK'); const acc2 = E.accept(bob, x.pre);
    assert.strictEqual(E.decrypt(acc2.st, x).text, 'ohne OPK');
    // fremder Empfänger kann nicht entschlüsseln
    const carol = E.newDevice(1);
    assert.throws(() => E.decrypt(E.accept(carol, Object.assign({}, x.pre, { spk: carol.spk.id, opk: 0 })).st, x));
    // Sicherheitsnummer: gleich auf beiden Seiten, ändert sich bei anderem Schlüssel
    const sn1 = E.safetyNumber([alice.idSig.pub], [bob.idSig.pub]), sn2 = E.safetyNumber([bob.idSig.pub], [alice.idSig.pub]);
    assert.strictEqual(sn1, sn2); assert.ok(/^(\d{5} ){11}\d{5}$/.test(sn1), sn1);
    assert.notStrictEqual(sn1, E.safetyNumber([alice.idSig.pub], [carol.idSig.pub]));
    // zu viele übersprungene Nachrichten werden abgelehnt (Speicher-Schutz)
    const big = clone(m); big.h.n = E.MAX_SKIP + 50; assert.throws(() => E.decrypt(b, big), /übersprungene/);
    // SPK-Wechsel: alte Nachrichten mit altem SPK gehen noch
    const old = E.encrypt(E.initiate(alice, { ik_dh: bb.ik_dh, ik_sig: bb.ik_sig, spk: bb.spk }), 'alt');
    E.rotateSpk(bob);
    assert.strictEqual(E.decrypt(E.accept(bob, old.pre).st, old).text, 'alt');
});

test('3.2.4: Nexus-Knöpfe (Android) – nur Aktionen ohne PC (VRChat-API), alte PC-Knöpfe fallen weg', async () => {
    const { NexusApp } = require('../backend/app');
    const { KINDS } = require('../backend/buttons');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() }, mobile: true });
    const sent = [], posts = [], api = [];
    app.link.remoteSend = async (kind, d) => { sent.push(Object.assign({ kind }, d)); return { ok: true }; };
    const realPost = app.post.bind(app);
    app.post = async (input, files) => { if (['status', 'invite', 'instance_create'].includes(input.act)) { posts.push(input); return { ok: true, msg: 'ok' }; } return realPost(input, files); };
    app.tools.apiAction = async (a, d) => { api.push([a, d]); return { ok: true, msg: 'ok' }; };
    for (const k of ['status', 'tab', 'avatar', 'friend', 'instance_create', 'show_friends', 'show_notifs']) assert.strictEqual(KINDS[k][2] === 'VRChat' || KINDS[k][2] === 'App' || KINDS[k][2] === 'Anzeige', true, k);
    assert.ok(Object.values(KINDS).every(k => ['VRChat', 'App', 'Anzeige', 'OSC'].includes(k[2])), 'nichts mehr über den PC');
    let r = await app.post({ act: 'btn_get' }, {});
    assert.ok(r.cfg.pages[0].buttons.length >= 4 && r.cfg.pages[0].buttons.every(b => KINDS[b.kind]), 'Beispiel-Knöpfe nur ohne PC');
    const show = r.cfg.pages[0].buttons.find(b => b.kind === 'show_friends');
    assert.ok(show && (await app.post({ act: 'btn_live', page: r.cfg.pages[0].id }, {})).values[show.id] !== undefined, 'Beispiel-Knöpfe behalten ihre IDs (Live-Werte)');
    // alte PC-Knöpfe aus früheren Versionen werden beim Laden ausgeblendet
    db.setSetting('nx_buttons', JSON.stringify({ v: 1, cols: 3, pages: [{ id: 'aaaaaaaaaa', name: 'Alt', buttons: [{ id: 'bbbbbbbbbb', kind: 'chatbox', text: 'x' }, { id: 'cccccccccc', kind: 'camera' }, { id: 'dddddddddd', kind: 'status', status: 'busy' }] }] }));
    r = await app.post({ act: 'btn_get' }, {});
    assert.deepStrictEqual(r.cfg.pages[0].buttons.map(b => b.kind), ['chatbox', 'status'], 'Kamera (PC) fällt weg');
    const W = 'wrld_00000000-0000-4000-8000-000000000101', A = 'avtr_00000000-0000-4000-8000-000000000001', U = 'usr_00000000-0000-4000-8000-000000000010';
    const cfg = { cols: 9, pages: [{ name: 'Test', buttons: [
        { kind: 'status', status: 'busy', desc: 'Stream', color: 'evil', icon: '👋👋👋👋👋' },
        { kind: 'tab', tab: 'community' },
        { kind: 'avatar', avatar: A },
        { kind: 'friend', user: U, op: 'request' },
        { kind: 'friend', id: U, op: 'invite' },
        { kind: 'instance_create', world: 'https://vrchat.com/home/world/' + W, type: 'friends', region: 'jp' },
        { kind: 'chatbox', text: 'PC' },
        { kind: 'show_friends' },
        { kind: 'friend', id: U, op: 'rm -rf' },
    ] }] };
    r = await app.post({ act: 'btn_save', cfg: JSON.stringify(cfg) }, {});
    const b = r.cfg.pages[0].buttons;
    assert.strictEqual(r.cfg.cols, 6); assert.strictEqual(b[0].color, ''); assert.ok(Array.from(b[0].icon).length <= 4);
    assert.strictEqual(new Set(b.map(x => x.id)).size, b.length, 'Knopf-IDs eindeutig (alte „id“ = Freund wird übernommen)'); assert.strictEqual(b[4].user, U);
    assert.strictEqual(b[6].kind, 'chatbox', 'Chatbox geht jetzt über die eigene OSC-Verbindung'); assert.strictEqual(b[8].op, 'invite_me', 'unbekannt → Selbst-Einladung');
    for (const i of [0, 2, 3, 4, 5, 8]) await app.post({ act: 'btn_run', id: b[i].id }, {});
    assert.strictEqual(sent.length, 0, 'nichts geht an den PC');
    assert.deepStrictEqual(posts.map(x => x.act), ['status', 'invite', 'instance_create']);
    assert.strictEqual(posts[2].world, W); assert.strictEqual(posts[2].region, 'jp'); assert.strictEqual(posts[2].invite_me, '1');
    assert.deepStrictEqual(api, [['avatar', { id: A }], ['friend', { id: U, op: 'request' }], ['friend', { id: U, op: 'invite_me' }]]);
    assert.strictEqual((await app.post({ act: 'btn_run', id: b[1].id }, {})).tab, 'community');
    assert.strictEqual((await app.post({ act: 'btn_run', id: b[7].id }, {})).tab, 'friends');
    assert.ok((await app.post({ act: 'btn_live', page: r.cfg.pages[0].id }, {})).values[b[7].id] !== undefined);
    await assert.rejects(app.post({ act: 'btn_run', id: 'ffffffffff' }, {}), /nicht gefunden/);
    const app2 = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() }, mobile: true });
    assert.strictEqual((await app2.post({ act: 'btn_get' }, {})).cfg.pages[0].name, 'Test');
});

test('3.2.5: Handy-OSC – Knöpfe und Parameter-Seite über die eigene OSC-Verbindung (ohne PC-App)', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() }, mobile: true });
    const sent = [];
    app.game.osc.send = async (addr, ...args) => { sent.push([addr, ...args]); };
    app.game.osc.chain = Promise.resolve(); app.game.osc.lastChat = 0;
    app.game.osc.params = { EarsUp: true, Hue: 0.5, Outfit: 2, Voice: 0.2 };
    app.link.remoteSend = async () => { throw new Error('darf nicht an den PC gehen'); };
    assert.ok(app.osctools && app.chatmods, 'OSC-Werkzeuge und Chatbox-Module auch am Handy');
    // Seite: nur eigene Parameter (ohne VRChat-eigene wie Voice), Favoriten
    let m = await app.post({ act: 'mosc_get' }, {});
    assert.deepStrictEqual(m.params.map(p => p.name + ':' + p.type), ['EarsUp:bool', 'Hue:float', 'Outfit:int']);
    m = await app.post({ act: 'mosc_fav', name: 'Hue', type: 'float' }, {});
    assert.deepStrictEqual(m.favs, [{ name: 'Hue', type: 'float' }]);
    await assert.rejects(app.post({ act: 'mosc_fav', name: '../böse<x>', type: 'bool' }, {}), /Ungültig/);
    await app.post({ act: 'mosc_set', name: 'Outfit', type: 'int', value: '3' }, {});
    assert.deepStrictEqual(sent.pop(), ['/avatar/parameters/Outfit', 3]);
    // Chatbox-Module am Handy: nur Module ohne PC-Werte
    const cm = await app.post({ act: 'cm_get' }, {});
    assert.ok(cm.mobile && cm.modules.time && !cm.modules.system && !cm.modules.media && !cm.modules.window);
    // Knöpfe
    const cfg = { pages: [{ name: 'OSC', buttons: [
        { kind: 'param', name: 'EarsUp', mode: 'toggle' }, { kind: 'param_step', name: 'Hue', ptype: 'float', step: '0.25' }, { kind: 'input', name: 'Jump' },
        { kind: 'chatbox', text: 'Hallo' }, { kind: 'chatmods', on: '1' }, { kind: 'param', name: 'Bad<script>', mode: 'set', ptype: 'int', value: '7' },
    ] }] };
    const r = await app.post({ act: 'btn_save', cfg: JSON.stringify(cfg) }, {});
    const b = r.cfg.pages[0].buttons;
    assert.strictEqual(b[5].name, 'Badscript');
    await app.post({ act: 'btn_run', id: b[0].id }, {});
    assert.deepStrictEqual(sent.pop(), ['/avatar/parameters/EarsUp', false], 'war an → aus');
    await app.post({ act: 'btn_run', id: b[1].id }, {});
    await app.post({ act: 'btn_run', id: b[1].id }, {});
    assert.deepStrictEqual(sent.pop(), ['/avatar/parameters/Hue', { float: 1 }], '0.5 + 0.25 + 0.25, höchstens 1');
    await app.post({ act: 'btn_run', id: b[2].id }, {});
    assert.ok(sent.some(x => x[0] === '/input/Jump' && x[1] === 1) && sent[sent.length - 1][0] === '/input/Jump' && sent[sent.length - 1][1] === 0, 'Eingabe kurz drücken');
    await app.post({ act: 'btn_run', id: b[3].id }, {});
    await app.game.osc.chain;
    assert.strictEqual(sent.pop()[0], '/chatbox/input');
    await app.post({ act: 'btn_run', id: b[4].id }, {});
    assert.strictEqual(app.chatmods.cfg().on, true);
    app.chatmods.stop();
    await app.post({ act: 'btn_run', id: b[5].id }, {});
    assert.deepStrictEqual(sent.pop(), ['/avatar/parameters/Badscript', 7]);
    // Empfang aus dem WLAN, sobald das Ziel nicht der eigene Rechner ist
    const src = fs.readFileSync(require.resolve('../backend/gamelog'), 'utf8');
    assert.ok(/0\.0\.0\.0/.test(src));
    app.tools.stop && app.tools.stop();
});

test('3.3: VR-Bewegung – Einstellungen, Befehl an den SteamVR-Helfer (gemockt), Ursprung merken, Autostart mit VRChat', async () => {
    const { NexusApp } = require('../backend/app');
    const { VrSpace } = require('../backend/vrspace');
    const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    // Einstellungen: nur vr.space*/fly*/turn*/walk*, Grenzen geprüft, Ursprung nicht von außen setzbar
    let r = await app.post({ act: 'space_get' }, {});
    assert.strictEqual(r.cfg['vr.fly_on'], true); assert.strictEqual(r.windows, false); assert.ok(r.schemes.standard.knuckles.fly);
    r = await app.post({ act: 'space_save', 'vr.fly_mul': '9999', 'vr.turn_comfort': '30', 'vr.walk_lock_roll': '1', 'vr.space_orig': '1,2,3', 'ui.theme': 'x', quiet: '1' }, {});
    assert.strictEqual(r.cfg['vr.fly_mul'], 500); assert.strictEqual(r.cfg['vr.turn_comfort'], '30'); assert.strictEqual(r.cfg['vr.walk_lock_roll'], true);
    assert.strictEqual(app.settings.get('vr.space_orig'), ''); assert.ok(!('vr.space_orig' in r.cfg));
    await assert.rejects(app.post({ act: 'space_reset' }, {}), /Windows-App/);
    const c = VrSpace.command(app.settings.all());
    assert.strictEqual(c.flymul, 5); assert.strictEqual(c.tstep, 30); assert.strictEqual(c.lr, 1); assert.strictEqual(c.on, 0); assert.strictEqual(c.legacy, 0);

    // SteamVR-Helfer mocken: Electron + child_process
    const Module = require('module'), cp = require('child_process'), { EventEmitter } = require('events');
    const wins = [];
    const realLoad = Module._load;
    Module._load = function (req, ...a) { if (req === 'electron') return { BrowserWindow: function () { wins.push(1); this.webContents = { setFrameRate() {}, on() {}, invalidate() {} }; this.loadURL = () => {}; this.destroy = () => {}; } }; return realLoad.call(this, req, ...a); };
    const realSpawn = cp.spawn, procs = [];
    cp.spawn = (exe, args) => { const p = new EventEmitter(); p.args = args; p.frames = []; p.stdout = new EventEmitter(); p.stdout.setEncoding = () => {};
        p.stdin = { on() {}, end() {}, writableLength: 0, write(b) { if (b[0] === 2) p.frames.push(JSON.parse(b.slice(5).toString('utf8'))); } }; p.kill = () => {}; procs.push(p); return p; };
    delete require.cache[require.resolve('../vroverlay')];
    try {
        const { VrOverlay } = require('../vroverlay');
        const exe = path.join(os.tmpdir(), 'NexusOverlay-test.exe'); fs.writeFileSync(exe, '');
        const saved = {};
        const vo = new VrOverlay({ exe, icon: 'i.png', url: 'x', saveSetting: (k, v) => { saved[k] = v; } });
        vo.steamVrRunning = async () => true;
        let vrc = false; vo.vrchatRunning = async () => vrc;
        const flush = () => new Promise(res => setTimeout(res, 20));
        const say = (p, o) => p.stdout.emit('data', JSON.stringify(o) + '\n');
        // nur VR-Bewegung, ohne Overlay → Helfer ohne Dashboard-Reiter und ohne Fenster
        vo.apply(Object.assign({}, app.settings.all(), { 'vr.space': true, 'vr.overlay': false }));
        await flush();
        assert.strictEqual(procs.length, 1); assert.deepStrictEqual(procs[0].args, ['i.png', 'nodash']); assert.strictEqual(wins.length, 0);
        say(procs[0], { ev: 'ready' });
        const sc = procs[0].frames.find(f => f.cmd === 'space');
        assert.ok(sc && sc.on === 1 && sc.fly === 1 && sc.flymul === 5, 'Einstellungen gehen an den Helfer');
        assert.ok(!procs[0].frames.some(f => f.cmd === 'mode' || f.cmd === 'show'), 'ohne Overlay keine Fenster-Befehle');
        say(procs[0], { ev: 'space_orig', m: '1,0,0,0.5,0,1,0,0,0,0,1,-0.25' });
        assert.strictEqual(saved['vr.space_orig'], '1,0,0,0.5,0,1,0,0,0,0,1,-0.25');
        say(procs[0], { ev: 'space_orig', m: 'rm -rf /' });
        assert.strictEqual(saved['vr.space_orig'], '1,0,0,0.5,0,1,0,0,0,0,1,-0.25', 'nur Zahlen');
        say(procs[0], { ev: 'space', x: 1.5, y: 0.25, z: -2, yaw: 90, pitch: 0, roll: 0, drag: true });
        let st = vo.state().space;
        assert.strictEqual(st.on, true); assert.strictEqual(st.x, 1.5); assert.strictEqual(st.yaw, 90); assert.strictEqual(st.drag, true);
        say(procs[0], { ev: 'gravity', v: true }); assert.strictEqual(saved['vr.fly_gravity'], '1');
        vo.spaceCmd('reset'); assert.deepStrictEqual(procs[0].frames[procs[0].frames.length - 1], { cmd: 'space_reset' });
        say(procs[0], { ev: 'space_reset' }); assert.strictEqual(saved['vr.space_orig'], ''); assert.strictEqual(vo.state().space.x, 0);
        // gemerkter Ursprung (nach Absturz) geht beim nächsten Start mit
        assert.strictEqual(VrSpace.command(Object.assign({}, app.settings.all(), { 'vr.space_orig': '1,0,0,0,0,1,0,0,0,0,1,0' })).orig, '1,0,0,0,0,1,0,0,0,0,1,0');
        // Autostart: erst mit laufendem VRChat
        vo.stop();
        vo.apply(Object.assign({}, app.settings.all(), { 'vr.space': false, 'vr.space_autostart': true, 'vr.overlay': false }));
        await flush();
        assert.strictEqual(procs.length, 1, 'ohne VRChat kein Helfer'); assert.strictEqual(vo.status, 'wartet auf VRChat');
        vrc = true;
        vo.apply(Object.assign({}, app.settings.all(), { 'vr.space': false, 'vr.space_autostart': true, 'vr.overlay': false }));
        await flush();
        assert.strictEqual(procs.length, 2);
        say(procs[1], { ev: 'ready' });
        assert.strictEqual(procs[1].frames.find(f => f.cmd === 'space').on, 1);
        assert.strictEqual(vo.state().space.auto, true);
        // Overlay an → Helfer mit Dashboard neu starten
        vo.apply(Object.assign({}, app.settings.all(), { 'vr.space': true, 'vr.overlay': true }));
        await flush();
        assert.strictEqual(procs.length, 3); assert.deepStrictEqual(procs[2].args, ['i.png']); assert.strictEqual(wins.length, 1);
        vo.stop(); clearInterval(vo.watch);
    } finally { Module._load = realLoad; cp.spawn = realSpawn; delete require.cache[require.resolve('../vroverlay')]; }
});

test('3.4.2: Schlüssel nur für Supporter/Moderator und je genau ein Konto, Rechte-Protokoll, gilt in allen Profilen dieses Kontos', async () => {
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const id = c => 'usr_' + c.repeat(8) + '-1111-2222-3333-444444444444';
    const OWNER = id('a'), MAIN = id('b'), ALT = id('d');
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const mk = async (uid, dir) => {
        const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => 'E:' + s, decrypt: s => String(s).replace(/^E:/, '') }, host: { userData: dir || fs.mkdtempSync(path.join(os.tmpdir(), 'nx-342-')) } });
        app.game.osc.stopListen();
        app.vrc.account = () => ({ vrc_id: uid, me: {} });
        return app;
    };
    try {
        const own = await mk(OWNER);
        const kp = await own.post({ act: 'nsfw_admin_keypair' }, {});
        await assert.rejects(own.post({ act: 'nsfw_admin_issue', uid: MAIN, days: '30', features: 'nsfw,toys' }, {}), /Supporter oder Moderator/);
        const iss = await own.post({ act: 'nsfw_admin_issue', uid: MAIN, name: 'Main', days: '30', features: 'mod', uids: ALT }, {});
        assert.ok(!iss.items[0].uids, 'kein Multiaccount-Feld mehr');
        const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-share-'));
        const mainA = await mk(MAIN, shared), mainB = await mk(MAIN, shared), alt = await mk(ALT, shared);
        for (const a of [mainA, mainB, alt]) a.nsfw.trusted.push(kp.pub);
        await mainA.post({ act: 'nsfw_unlock', token: iss.token }, {});
        assert.ok((await mainB.post({ act: 'nsfw_state' }, {})).access.mod, 'gleiches Konto in einem anderen Profil: ohne erneute Eingabe');
        assert.ok(!(await alt.post({ act: 'nsfw_state' }, {})).access.key, 'anderes Konto bekommt nichts');
        await assert.rejects(alt.post({ act: 'nsfw_unlock', token: iss.token }, {}), /anderen VRChat-Konto/);
        await own.post({ act: 'nsfw_admin_revoke', id: iss.items[0].id }, {});
        const st = await own.post({ act: 'nsfw_state' }, {});
        assert.deepStrictEqual(st.permlog.map(x => x.what), ['Schlüssel gesperrt', 'Schlüssel erzeugt']);
    } finally { delete process.env.NEXUS_OWNER_HASH; }
});

test('3.4: Multiaccount – Konten mit eigener Datenbank, Wechsel, Einstellungen übernehmen, Entfernen', async () => {
    const { NexusApp } = require('../backend/app');
    const P = require('../backend/profiles');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-prof-'));
    let restarts = 0;
    const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: dir, restart: () => { restarts++; } } });
    app.game.osc.stopListen();
    app.vrc.account = () => ({ vrc_id: 'usr_00000000-0000-4000-8000-000000000001', display_name: 'Haupt', avatar: 'https://example.invalid/a.png' });
    // ohne profiles.json: bisherige Datei, nichts ändert sich
    assert.strictEqual(P.currentFile(dir).file, path.join(dir, 'nexus.sqlite'));
    let r = await app.post({ act: 'prof_list' }, {});
    assert.deepStrictEqual(r.items.map(x => [x.id, x.name, x.current]), [['main', 'Haupt', true]]);
    app.settings.save({ 'ui.theme': 'sakura', 'int.webhook': '' });
    r = await app.post({ act: 'prof_add' }, {});
    assert.ok(r.restart && r.items.length === 2 && r.current !== 'main');
    await new Promise(res => setTimeout(res, 400));
    assert.strictEqual(restarts, 1, 'App startet neu');
    const cur = P.currentFile(dir);
    assert.ok(/nexus-p[0-9a-f]{8}\.sqlite$/.test(cur.file), 'eigene Datenbank je Konto');
    // neuer Start: Oberflächen-Einstellungen übernommen, aber keine Konto-Daten
    const db2 = await openDatabase(cur.file);
    assert.ok(P.applySeed(dir, db2));
    const seeded = JSON.parse(db2.setting('app_settings'));
    assert.strictEqual(seeded['ui.theme'], 'sakura'); assert.ok(!('int.api_token' in seeded), 'kein API-Token übernommen');
    assert.ok(!P.applySeed(dir, db2), 'nur einmal');
    assert.ok(!fs.readFileSync(path.join(dir, 'profiles.json'), 'utf8').includes('password'));
    // zurück zum ersten Konto, dann das zweite entfernen
    const second = cur.id;
    await assert.rejects(app.post({ act: 'prof_remove', id: second }, {}), /aktive Konto/);
    r = await app.post({ act: 'prof_switch', id: 'main' }, {});
    assert.strictEqual(r.current, 'main');
    await assert.rejects(app.post({ act: 'prof_switch', id: '../../etc' }, {}), /nicht gefunden/);
    await assert.rejects(app.post({ act: 'prof_remove', id: 'main' }, {}), /aktive Konto|erste Konto/);
    db2.close();
    r = await app.post({ act: 'prof_remove', id: second }, {});
    assert.strictEqual(r.items.length, 1); assert.ok(!fs.existsSync(cur.file), 'Daten des entfernten Kontos gelöscht');
    // kaputte/fremde Einträge in profiles.json werden nicht benutzt
    fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ current: 'x', list: [{ id: 'x', file: '../../böse.sqlite' }] }));
    assert.strictEqual(P.currentFile(dir).file, path.join(dir, 'nexus.sqlite'));
    app.tools.stop();
});

test('3.4: Chat – Reaktionen, Antworten, Bearbeiten/Löschen, Gelesen, Bilder verschlüsselt, Puls, Anheften/Merken, Geräte (Briefkasten gemockt)', async () => {
    const http = require('http'), E = require('../backend/e2ee');
    const { NexusApp } = require('../backend/app');
    // ---- Schein-Briefkasten wie nexuschat.php: sieht nur Chiffretext ----
    const devs = {}, opks = {}, inbox = [], blobs = {}, seen = [];
    let nid = 1;
    const srv = http.createServer((req, res) => {
        let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
            const a = new URL(req.url, 'http://x').searchParams.get('a'), in_ = JSON.parse(body), me = in_.token.slice(4);
            seen.push(body);
            const out = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
            if (a === 'publish') { const id = E.deviceId(in_.ik_sig); devs[id] = devs[id] || { uid: me, created: 1700000000, last_seen: 1700000000 }; Object.assign(devs[id], { ik_dh: in_.ik_dh, ik_sig: in_.ik_sig, spk: in_.spk }); opks[id] = (opks[id] || []).concat(in_.opks || []); return out({ device: id, opks: opks[id].length }); }
            if (a === 'devices') return out({ devices: Object.entries(devs).filter(([, d]) => d.uid === in_.uid).map(([id, d]) => Object.assign({ device: id, ik_dh: d.ik_dh, ik_sig: d.ik_sig, created: d.created }, in_.uid === me ? { last_seen: d.last_seen } : {})) });
            if (a === 'bundles') return out({ bundles: Object.entries(devs).filter(([id, d]) => d.uid === in_.uid && !(in_.skip || []).includes(id)).map(([id, d]) => ({ device: id, ik_dh: d.ik_dh, ik_sig: d.ik_sig, spk: d.spk, opk: (opks[id] || []).shift() || null })) });
            if (a === 'send') { for (const m of in_.msgs) inbox.push({ id: nid++, to: m.dev, from: me, from_dev: in_.device, body: m.body, at: Math.floor(Date.now() / 1000) }); return out({ ok: in_.msgs.length }); }
            if (a === 'fetch') return out({ msgs: inbox.filter(m => m.to === in_.device).map(m => ({ id: m.id, from: m.from, from_dev: m.from_dev, body: m.body, at: m.at })), opks: (opks[in_.device] || []).length });
            if (a === 'ack') { for (const id of in_.ids) { const k = inbox.findIndex(m => m.id === id && m.to === in_.device); if (k >= 0) inbox.splice(k, 1); } return out({ ok: true }); }
            if (a === 'remove') { if (!devs[in_.device] || devs[in_.device].uid !== me) return out({ error: 'Gerät nicht gefunden.' }); delete devs[in_.device]; return out({ ok: true }); }
            if (a === 'blob_put') { const id = require('crypto').randomBytes(16).toString('hex'); blobs[id] = { data: Buffer.from(in_.data, 'base64'), allow: in_.allow.concat([me]) }; return out({ id }); }
            if (a === 'blob_get') { const b = blobs[in_.id]; if (!b || !b.allow.includes(me)) return out({ error: 'Bild nicht gefunden oder abgelaufen.' }); res.setHeader('Content-Type', 'application/octet-stream'); return res.end(b.data); }
            out({ error: 'unbekannt' });
        });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.NEXUS_CHAT_BASE = 'http://127.0.0.1:' + srv.address().port;
    const A = 'usr_' + 'a'.repeat(8) + '-1111-2222-3333-444444444444', B = 'usr_' + 'b'.repeat(8) + '-1111-2222-3333-444444444444';
    const mk = async uid => {
        const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-chat-')) } });
        app.game.osc.stopListen();
        app.account.current = () => ({ token: 'tok:' + uid, account: { vrc_id: uid } });
        return app;
    };
    try {
        const a = await mk(A), b = await mk(B);
        await a.post({ act: 'chat_list' }, {}); await b.post({ act: 'chat_list' }, {});
        let ra = await a.post({ act: 'chat_send', uid: B, text: 'Hallo **B**' }, {});
        let rb = await b.post({ act: 'chat_open', uid: A }, {});
        const m1 = rb.messages[0];
        assert.strictEqual(m1.text, 'Hallo **B**'); assert.ok(!m1.me);
        // Gelesen: B hat geöffnet → A sieht ✓✓
        ra = await a.post({ act: 'chat_open', uid: B }, {});
        assert.strictEqual(ra.messages[0].read, true, 'Gelesen-Häkchen');
        // Antwort + Reaktion von B
        rb = await b.post({ act: 'chat_reply', uid: A, ref: m1.id, text: 'Hi A' }, {});
        rb = await b.post({ act: 'chat_react', uid: A, ref: m1.id, emoji: '❤️' }, {});
        ra = await a.post({ act: 'chat_open', uid: B }, {});
        const reply = ra.messages.find(m => m.text === 'Hi A');
        assert.deepStrictEqual(reply.reply, { id: m1.id, text: 'Hallo **B**', me: true }, 'Zitat zeigt auf die eigene Nachricht');
        assert.deepStrictEqual(ra.messages[0].reacts, { '❤️': ['them'] });
        await assert.rejects(a.post({ act: 'chat_react', uid: B, ref: m1.id, emoji: '💩' }, {}).then(r => { if (!r.messages[0].reacts['💩']) throw new Error('verworfen'); }), /verworfen/, 'nur erlaubte Emojis');
        // Bearbeiten/Löschen nur eigene
        await assert.rejects(a.post({ act: 'chat_edit', uid: B, ref: reply.id, text: 'gefälscht' }, {}), /eigene/);
        await a.post({ act: 'chat_edit', uid: B, ref: m1.id, text: 'Hallo B (bearbeitet)' }, {});
        rb = await b.post({ act: 'chat_open', uid: A }, {});
        assert.strictEqual(rb.messages[0].text, 'Hallo B (bearbeitet)'); assert.ok(rb.messages[0].edited);
        await a.post({ act: 'chat_delete', uid: B, ref: m1.id }, {});
        rb = await b.post({ act: 'chat_open', uid: A }, {});
        assert.ok(rb.messages[0].deleted && !rb.messages[0].text && !Object.keys(rb.messages[0].reacts).length);
        // Bild: verschlüsselt hochgeladen, nur Empfänger kann es lesen
        const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), require('crypto').randomBytes(400)]);
        await assert.rejects(a.post({ act: 'chat_img', uid: B, text: '' }, { file: { buffer: Buffer.from('kein bild') } }), /Nur PNG/);
        ra = await a.post({ act: 'chat_img', uid: B, text: 'Schau!' }, { file: { buffer: png } });
        const blobId = Object.keys(blobs)[0];
        assert.ok(blobs[blobId].data.length >= png.length && !blobs[blobId].data.includes(png.slice(8, 40)), 'Server hat nur Chiffretext');
        assert.ok(!seen.some(x => x.includes('Schau!')), 'Bildunterschrift nie im Klartext beim Server');
        rb = await b.post({ act: 'chat_open', uid: A }, {});
        const im = rb.messages.find(m => m.img);
        const got = await b.chat.image(A + ':' + im.id);
        assert.strictEqual(got.status, 200); assert.ok(Buffer.from(got.body).equals(png), 'Empfänger entschlüsselt das Original');
        // Puls
        b.heart.status = () => ({ active: true, bpm: 88 });
        await b.post({ act: 'chat_hr', uid: A }, {});
        ra = await a.post({ act: 'chat_open', uid: B }, {});
        assert.strictEqual(ra.messages[ra.messages.length - 1].hr, 88);
        // Anheften / Merken (nur lokal)
        ra = await a.post({ act: 'chat_pin', uid: B, ref: reply.id }, {});
        assert.deepStrictEqual(ra.pins, [reply.id]);
        ra = await a.post({ act: 'chat_fav', uid: B, ref: reply.id }, {});
        assert.deepStrictEqual(ra.favs, [reply.id]);
        assert.strictEqual((await a.post({ act: 'chat_favs' }, {})).items[0].msg.text, 'Hi A');
        // Gelesen-Häkchen abschaltbar
        assert.strictEqual((await b.post({ act: 'chat_prefs', receipts: '0' }, {})).prefs.receipts, false);
        // Geräte
        const d = await a.post({ act: 'chat_devices' }, {});
        assert.ok(d.items.length === 1 && d.items[0].current && d.items[0].last_seen);
        await assert.rejects(a.post({ act: 'chat_device_remove', device: d.items[0].device }, {}), /selbst/);
        assert.ok(!seen.some(x => /Hallo|Hi A|bearbeitet/.test(x)), 'Briefkasten sieht nie Klartext');
        a.tools.stop(); b.tools.stop();
    } finally { delete process.env.NEXUS_CHAT_BASE; srv.close(); }
});

test('3.5: Gruppenchat (Megolm-Prinzip) – Sender-Schlüssel nur über 1:1-E2E, Signatur, Mitglieder entfernen → neue Schlüssel, Verlassen', async () => {
    const http = require('http'), E = require('../backend/e2ee');
    const { NexusApp } = require('../backend/app');
    // ---- Schein-Briefkasten wie nexuschat.php: sieht nur Chiffretext ----
    const devs = {}, opks = {}, inbox = [], blobs = {}, seen = [];
    let nid = 1;
    const srv = http.createServer((req, res) => {
        let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
            const a = new URL(req.url, 'http://x').searchParams.get('a'), in_ = JSON.parse(body), me = in_.token.slice(4);
            seen.push(body);
            const out = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
            if (a === 'publish') { const id = E.deviceId(in_.ik_sig); devs[id] = devs[id] || { uid: me, created: 1700000000, last_seen: 1700000000 }; Object.assign(devs[id], { ik_dh: in_.ik_dh, ik_sig: in_.ik_sig, spk: in_.spk }); opks[id] = (opks[id] || []).concat(in_.opks || []); return out({ device: id, opks: opks[id].length }); }
            if (a === 'devices') return out({ devices: Object.entries(devs).filter(([, d]) => d.uid === in_.uid).map(([id, d]) => Object.assign({ device: id, ik_dh: d.ik_dh, ik_sig: d.ik_sig, created: d.created }, in_.uid === me ? { last_seen: d.last_seen } : {})) });
            if (a === 'bundles') return out({ bundles: Object.entries(devs).filter(([id, d]) => d.uid === in_.uid && !(in_.skip || []).includes(id)).map(([id, d]) => ({ device: id, ik_dh: d.ik_dh, ik_sig: d.ik_sig, spk: d.spk, opk: (opks[id] || []).shift() || null })) });
            if (a === 'send') { for (const m of in_.msgs) inbox.push({ id: nid++, to: m.dev, from: me, from_dev: in_.device, body: m.body, at: Math.floor(Date.now() / 1000) }); return out({ ok: in_.msgs.length }); }
            if (a === 'fetch') return out({ msgs: inbox.filter(m => m.to === in_.device).map(m => ({ id: m.id, from: m.from, from_dev: m.from_dev, body: m.body, at: m.at })), opks: (opks[in_.device] || []).length });
            if (a === 'ack') { for (const id of in_.ids) { const k = inbox.findIndex(m => m.id === id && m.to === in_.device); if (k >= 0) inbox.splice(k, 1); } return out({ ok: true }); }
            if (a === 'remove') { if (!devs[in_.device] || devs[in_.device].uid !== me) return out({ error: 'Gerät nicht gefunden.' }); delete devs[in_.device]; return out({ ok: true }); }
            if (a === 'blob_put') { const id = require('crypto').randomBytes(16).toString('hex'); blobs[id] = { data: Buffer.from(in_.data, 'base64'), allow: in_.allow.concat([me]) }; return out({ id }); }
            if (a === 'blob_get') { const b = blobs[in_.id]; if (!b || !b.allow.includes(me)) return out({ error: 'Bild nicht gefunden oder abgelaufen.' }); res.setHeader('Content-Type', 'application/octet-stream'); return res.end(b.data); }
            out({ error: 'unbekannt' });
        });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.NEXUS_CHAT_BASE = 'http://127.0.0.1:' + srv.address().port;
    const A = 'usr_' + 'a'.repeat(8) + '-1111-2222-3333-444444444444', B = 'usr_' + 'b'.repeat(8) + '-1111-2222-3333-444444444444', C = 'usr_' + 'c'.repeat(8) + '-1111-2222-3333-444444444444';
    const mk = async uid => {
        const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-chat-')) } });
        app.game.osc.stopListen();
        app.account.current = () => ({ token: 'tok:' + uid, account: { vrc_id: uid } });
        return app;
    };
    try {
        const a = await mk(A), b = await mk(B), c = await mk(C);
        for (const x of [a, b, c]) await x.post({ act: 'chat_list' }, {});
        await assert.rejects(a.post({ act: 'chat_group_create', name: '', members: B }, {}), /Gruppennamen/);
        await assert.rejects(a.post({ act: 'chat_group_create', name: 'X', members: 'quatsch' }, {}), /keine VRChat-User-ID/);
        let ra = await a.post({ act: 'chat_group_create', name: 'Crew', members: B + ', ' + C }, {});
        const G = ra.uid;
        assert.ok(/^g:[0-9a-f]{16}$/.test(G) && ra.group.is_admin && ra.group.members.length === 3);
        await a.post({ act: 'chat_send', uid: G, text: 'Hallo Crew' }, {});
        let rb = await b.post({ act: 'chat_open', uid: G }, {}), rc = await c.post({ act: 'chat_open', uid: G }, {});
        assert.strictEqual(rb.group.name, 'Crew'); assert.ok(!rb.group.is_admin);
        assert.strictEqual(rb.messages.filter(m => !m.sys)[0].text, 'Hallo Crew');
        assert.strictEqual(rc.messages.filter(m => !m.sys)[0].from, A, 'Absender wird angezeigt');
        assert.ok((await b.post({ act: 'chat_list' }, {})).items.some(x => x.uid === G && x.group && x.members === 3));
        // Antwort + Reaktion in der Gruppe
        await b.post({ act: 'chat_send', uid: G, text: 'Hi von B' }, {});
        const m1 = rc.messages.filter(m => !m.sys)[0];
        await c.post({ act: 'chat_react', uid: G, ref: m1.id, emoji: '❤️' }, {});
        ra = await a.post({ act: 'chat_open', uid: G }, {});
        assert.ok(ra.messages.some(m => m.text === 'Hi von B' && m.from === B));
        assert.deepStrictEqual(ra.messages.find(m => m.id === m1.id).reacts, { '❤️': [C] });
        // fremde Nachricht bearbeiten geht nicht (auch nicht per gefälschter Steuerung)
        await assert.rejects(c.post({ act: 'chat_edit', uid: G, ref: m1.id, text: 'gefälscht' }, {}), /eigene/);
        // Nicht-Admin darf keine Mitglieder ändern
        await assert.rejects(b.post({ act: 'chat_group_members', uid: G, remove: C }, {}), /erstellt/);
        // C entfernen → neue Sender-Schlüssel, C liest nichts Neues
        ra = await a.post({ act: 'chat_group_members', uid: G, remove: C }, {});
        assert.strictEqual(ra.group.members.length, 2);
        rc = await c.post({ act: 'chat_open', uid: G }, {});
        assert.ok(rc.group.left, 'C ist draußen');
        await b.post({ act: 'chat_open', uid: G }, {});   // B holt die neue Mitgliederliste
        await a.post({ act: 'chat_send', uid: G, text: 'Geheim ohne C' }, {});
        await b.post({ act: 'chat_send', uid: G, text: 'B auch ohne C' }, {});
        rb = await b.post({ act: 'chat_open', uid: G }, {});
        assert.ok(rb.messages.some(m => m.text === 'Geheim ohne C'));
        rc = await c.post({ act: 'chat_open', uid: G }, {});
        assert.ok(!rc.messages.some(m => /ohne C/.test(m.text || '')), 'Entfernte lesen nichts Neues mit');
        ra = await a.post({ act: 'chat_open', uid: G }, {});
        assert.ok(ra.messages.some(m => m.text === 'B auch ohne C'), 'B hat neue Schlüssel nur an A verteilt');
        // Signatur: verfälschter Umschlag wird verworfen
        const env = JSON.parse(seen.filter(x => x.includes('"msgs"') && x.includes('\\"g\\"') && x.includes('"tok:' + A + '"')).pop()).msgs[0].body;
        const bad = JSON.parse(env); bad.c = Buffer.from(Buffer.from(bad.c, 'base64').map((x, i) => (i === 3 ? x ^ 1 : x))).toString('base64');
        const devB = Object.keys(devs).find(k => devs[k].uid === B);
        inbox.push({ id: nid++, to: devB, from: A, from_dev: Object.keys(devs).find(k => devs[k].uid === A), body: JSON.stringify(bad), at: Math.floor(Date.now() / 1000) });
        rb = await b.post({ act: 'chat_open', uid: G }, {});
        assert.ok(rb.messages.some(m => m.sys && /Signatur/.test(m.text)), 'Signatur geprüft');
        // Bild in der Gruppe: Freigabe nur für Mitglieder
        const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), require('crypto').randomBytes(200)]);
        await a.post({ act: 'chat_img', uid: G, text: '' }, { file: { buffer: png } });
        const bl = Object.values(blobs).pop();
        assert.ok(bl.allow.includes(B) && !bl.allow.includes(C));
        rb = await b.post({ act: 'chat_open', uid: G }, {});
        const im = rb.messages.find(m => m.img);
        assert.ok(Buffer.from((await b.chat.image(G + ':' + im.id)).body).equals(png));
        // Verlassen
        await b.post({ act: 'chat_group_leave', uid: G }, {});
        ra = await a.post({ act: 'chat_open', uid: G }, {});
        assert.deepStrictEqual(ra.group.members.map(m => m.uid), [A]);
        assert.ok(!seen.some(x => /Hallo Crew|Geheim|Crew/.test(x)), 'Briefkasten sieht nie Klartext, auch nicht den Gruppennamen');
        a.tools.stop(); b.tools.stop(); c.tools.stop();
    } finally { delete process.env.NEXUS_CHAT_BASE; srv.close(); }
});

test('3.5: Handy-Krypto (@noble-Ersatz) spricht mit dem PC – E2E-Chat und Sicherheitsnummer gleich', () => {
    const Module = require('module'), shimPath = path.join(__dirname, '../../vrc-nexus-android/src/shims/crypto.js');
    if (!fs.existsSync(shimPath) || !fs.existsSync(path.join(__dirname, '../../vrc-nexus-android/node_modules/@noble/curves'))) return;
    const shim = require(shimPath);
    const ep = require.resolve('../backend/e2ee');
    const load = cr => { const orig = Module._load, keep = require.cache[ep]; delete require.cache[ep]; Module._load = function (r, ...a) { return r === 'crypto' && a[0] && a[0].filename === ep ? cr : orig.call(this, r, ...a); }; try { return require(ep); } finally { Module._load = orig; if (keep) require.cache[ep] = keep; else delete require.cache[ep]; } };
    const Ph = load(shim), Pc = require('../backend/e2ee');
    const phone = Ph.newDevice(5), pc = Pc.newDevice(5);
    const bd = Pc.bundle(pc), st = Ph.initiate(phone, Object.assign({}, bd, { opk: bd.opks && bd.opks[0] }));
    const env = Ph.encrypt(st, 'Hallo vom Handy');
    const acc = Pc.accept(pc, env.pre), r = Pc.decrypt(acc.st, env);
    assert.strictEqual(r.text, 'Hallo vom Handy');
    const r2 = Ph.decrypt(st, Pc.encrypt(r.st, 'Hallo zurück'));
    assert.strictEqual(r2.text, 'Hallo zurück');
    assert.strictEqual(Ph.safetyNumber([phone.idSig.pub], [pc.idSig.pub]), Pc.safetyNumber([phone.idSig.pub], [pc.idSig.pub]));
});

test('3.5.1: AviSeek als Avatar-Datenbank – eigene JSON-API (Suche, Ersteller, Avatar-ID), Standard und einmalig ergänzt', async () => {
    const { aviSeekUrl, aviSeekList } = require('../backend/extra');
    const B = 'https://aviseek.vrchatlegends.com/api';
    assert.strictEqual(aviSeekUrl(B, 'proto gen'), B + '/avatars/search?q=proto+gen&sort=relevance&limit=60');
    assert.strictEqual(aviSeekUrl(B + '/', 'https://vrchat.com/home/user/usr_AAAAAAAA-1111-2222-3333-444444444444'), B + '/avatars/creators/usr_aaaaaaaa-1111-2222-3333-444444444444?limit=60');
    assert.strictEqual(aviSeekUrl(B, 'avtr_aaaaaaaa-1111-2222-3333-444444444444'), B + '/avatars/avtr_aaaaaaaa-1111-2222-3333-444444444444');
    const a = { id: 'avtr_aaaaaaaa-1111-2222-3333-444444444444', name: 'Proto', authorName: 'X', authorId: '', imageUrl: 'https://x.test/a.png', platforms: ['quest', 'pc'], performance: { quest: 'Poor' }, addedAt: '2026-01-01' };
    const l = aviSeekList({ total: 1, avatars: [a] });
    assert.deepStrictEqual([l[0]._platforms, l[0]._perf, l[0].created_at], [['Quest / Android', 'PC'], { Quest: 'Poor' }, '2026-01-01']);
    assert.strictEqual(aviSeekList({ avatar: a }).length, 1);
    assert.deepStrictEqual(aviSeekList({ error: 'x' }), []);
    // über die App (fetch gemockt, kein Netz)
    const { NexusApp } = require('../backend/app');
    const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const ex = app.extra || app.x;
    assert.ok(ex.avatarProviders().includes(B), 'Standard');
    const db = app.db || app.vrc.db;
    db.setSetting('vrc_avatar_providers', JSON.stringify(['https://api.avtrdb.com/v3/avatar/search/vrcx']));
    db.setSetting('vrc_avatar_providers_v322', '1');
    assert.ok(ex.avatarProviders().includes(B), 'eigene Liste einmalig ergänzt');
    const orig = global.fetch; let asked = '';
    let ua = ''; global.fetch = async (u, o) => { asked = String(u); ua = o.headers['User-Agent']; return { status: 200, json: async () => ({ total: 1, avatars: [a] }) }; };
    try {
        const r = await ex.avatarDbSearch(ex.avatarProviders().indexOf(B), 'proto');
        assert.ok(/^VRC-Nexus\/\d+\.\d+\.\d+ \(\S+@\S+\)$/.test(ua), 'Avatar-Datenbanken bekommen Name, Version und Kontakt');
        assert.ok(asked.startsWith(B + '/avatars/search?q=proto'));
        assert.deepStrictEqual([r[0].name, r[0].platforms, r[0].thumb], ['Proto', ['Quest / Android', 'PC'], 'https://x.test/a.png']);
    } finally { global.fetch = orig; app.tools.stop(); }
});

test('3.6: Plugins (.nxp) – Paket prüfen, Rechte, abgeschotteter Prozess, Chatbox nur mit Recht, keine Umwege, Entfernen', async () => {
    const { Plugins, checkManifest, cleanUi } = require('../backend/plugins');
    const { readZip, writeZip } = require('../backend/nxp');
    // Paketformat
    const z = writeZip({ 'plugin.json': '{"format":1,"id":"a-b","main":"main.js"}', 'main.js': 'x', 'lib/x.js': 'y' });
    assert.deepStrictEqual(Object.keys(readZip(z)).sort(), ['lib/x.js', 'main.js', 'plugin.json']);
    for (const bad of ['../x.js', '/etc/x', 'a\\b.js', 'a/./b.js']) assert.throws(() => readZip(writeZip({ [bad]: 'x' })), /Unerlaubter Dateipfad/, bad);
    assert.throws(() => readZip(Buffer.from('kein zip, nur text das lang genug ist')), /kein gültiges Plugin/);
    const broken = Buffer.from(z); broken[44] ^= 0xff; assert.throws(() => readZip(broken), /beschädigt|Prüfsumme/, "Inhalt geprüft");
    assert.throws(() => checkManifest({ 'plugin.json': Buffer.from('{"format":1,"id":"A!"}') }, '3.6.0'), /Plugin-ID/);
    assert.throws(() => checkManifest({ 'plugin.json': Buffer.from('{"format":1,"id":"ok","permissions":["root"]}'), 'main.js': Buffer.from('') }, '3.6.0'), /Unbekannte Rechte/);
    assert.throws(() => checkManifest({ 'plugin.json': Buffer.from('{"format":1,"id":"ok","nexus":">=9.0.0"}'), 'main.js': Buffer.from('') }, '3.6.0'), /braucht VRC Nexus 9/);
    assert.deepStrictEqual(cleanUi([{ type: 'button', id: 'a<b>', label: '<img>' }, { type: 'script', text: 'x' }]), [{ type: 'button', id: 'ab', label: '<img>' }], 'nur bekannte Bausteine, Text bleibt Text (UI escaped)');
    // Laufzeit (echter Kindprozess mit Node-Rechtemodell)
    const settings = {}, sent = [];
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-plug-'));
    const app = { db: { setting: (k, d) => (k in settings ? settings[k] : d), setSetting: (k, v) => { settings[k] = v; } }, tools: { userData: ud, host: {} },
        game: { oscSend: async (k, p) => { sent.push([k, p]); }, osc: { params: {} }, state: {}, isPrivate: () => false } };
    const P = new Plugins(app);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    try {
        assert.ok(fs.existsSync(P.example()), 'Beispiel-Plugin liegt bei (npm run: node scripts/plugin-pack.js)');
        let r = await P.action('plug_inspect', { example: '1' }, {});
        assert.deepStrictEqual(r.perms.map(x => x.id), ['chatbox']);
        await P.action('plug_install', { token: r.token }, {});
        await assert.rejects(P.action('plug_install', { token: r.token }, {}), /abgelaufen/, 'Token nur einmal');
        await wait(400);
        let it = P.list().find(x => x.id === 'text-plugin');
        assert.strictEqual(it.status, 'running', it.error);
        assert.ok(it.ui.some(w => w.id === 'send'));
        await P.action('plug_ui', { id: 'text-plugin', type: 'click', el: 'send', values: JSON.stringify({ text: 'Hallo aus dem Plugin' }) }, {});
        await wait(200);
        assert.deepStrictEqual(sent[0], ['chatbox', { text: 'Hallo aus dem Plugin', sound: '1', split: '1' }]);
        // Plugin ohne Rechte versucht Umwege
        const evil = writeZip({ 'plugin.json': JSON.stringify({ format: 1, id: 'evil', main: 'main.js' }), 'main.js': `
            nexus.on('start', async () => {
                const t = { fs: () => require('fs'), gbm: () => process.getBuiltinModule('fs'), mm: () => process.mainModule.require('fs'), fn: () => Function('return 1')(),
                    imp: () => import('node:https'), net: () => fetch('https://example.invalid'), bind: () => process.binding('fs') };
                const res = {};
                for (const [k, f] of Object.entries(t)) { try { const v = f(); if (v && v.then) await v; res[k] = 'offen'; } catch (e) { res[k] = 'zu'; } }
                try { await nexus.chatbox.send('x'); res.chat = 'offen'; } catch (e) { res.chat = 'zu'; }
                await nexus.storage.set('res', res);
                nexus.log('fertig');
            });` });
        r = await P.action('plug_inspect', {}, { file: { buffer: evil } });
        await P.action('plug_install', { token: r.token }, {});
        for (let i = 0; i < 30 && !(P.store('evil').res); i++) await wait(100);
        assert.deepStrictEqual(P.store('evil').res, { fs: 'zu', gbm: 'zu', mm: 'zu', fn: 'zu', imp: 'zu', net: 'zu', bind: 'zu', chat: 'zu' });
        assert.strictEqual(sent.length, 1, 'ohne Recht keine Chatbox');
        // Absturz wird protokolliert, aus/an, entfernen
        await P.action('plug_toggle', { id: 'evil', on: '0' }, {});
        assert.strictEqual(P.list().find(x => x.id === 'evil').status, 'stopped');
        await P.action('plug_remove', { id: 'evil' }, {});
        assert.ok(!fs.existsSync(path.join(ud, 'plugins', 'installed', 'evil')) && !P.list().some(x => x.id === 'evil'));
    } finally { P.stop(); await wait(300); }
});

test('3.6.1: abgelaufene VRChat-Sitzung meldet automatisch ab (auch bei 401 von anderen Pfaden), Hinweis auf der Anmeldeseite', async () => {
    const { NexusApp } = require('../backend/app');
    const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const v = app.vrc, db = app.db;
    const connect = () => db.prepare("INSERT OR REPLACE INTO accounts (user_id, vrc_id, display_name, cookies, me_json, connected_at) VALUES (1, 'usr_x', 'X', '{}', '{}', 1)").run();
    let authOk = true;
    v.http = async (jar, m, p) => (p === '/auth/user' ? (authOk ? [200, { id: 'usr_x' }] : [401, { error: { message: 'Missing Credentials' } }]) : p === '/worlds/x' ? [401, {}] : [200, {}]);
    connect();
    // 401 von einem anderen Pfad, Sitzung aber gültig → angemeldet bleiben
    await assert.rejects(v.call(v.account(), 'GET', '/worlds/x'), e => !(e instanceof U.VrcAuthError));
    assert.ok(v.account(), 'bleibt angemeldet');
    // Sitzung abgelaufen → abmelden
    authOk = false;
    await assert.rejects(v.call(v.account(), 'GET', '/worlds/x'), U.VrcAuthError);
    assert.strictEqual(v.account(), null, 'automatisch abgemeldet');
    assert.strictEqual(db.setting('vrc_logout_reason', ''), 'expired');
    assert.ok(/class="vx-expired" >/.test(app.page()), 'Hinweis auf der Anmeldeseite sichtbar');
    // 3.7.2: VRChat antwortet 200, aber ohne Benutzer (2FA nötig) → ebenfalls abmelden
    connect(); v.http = async () => [200, { requiresTwoFactorAuth: ['totp'] }];
    db.prepare('UPDATE accounts SET last_sync = 0 WHERE user_id = 1').run();
    await assert.rejects(v.sync(true), U.VrcAuthError);
    assert.strictEqual(v.account(), null, '2FA-Zwischenstand meldet ab');
    // 3.7.2: alter Fehler „Sitzung abgelaufen“ aus früheren Versionen → beim nächsten Laden echt prüfen
    connect(); db.prepare("UPDATE accounts SET last_error = 'Sitzung abgelaufen' WHERE user_id = 1").run();
    v.http = async (jar, m, p) => (p === '/auth/user' ? [401, {}] : [200, {}]);
    await assert.rejects(app.post({ act: 'state' }, {}), U.VrcAuthError);
    assert.strictEqual(v.account(), null, 'hängendes Konto wird abgemeldet');
    connect(); db.prepare("UPDATE accounts SET last_error = 'Sitzung abgelaufen' WHERE user_id = 1").run();
    v.http = async (jar, m, p) => (p === '/auth/user' ? [200, { id: 'usr_x' }] : [200, {}]);
    await app.post({ act: 'state' }, {}).catch(() => {});
    assert.ok(v.account() && !v.account().last_error, 'Sitzung doch gültig → Fehler weg, bleibt angemeldet');
    connect(); await v.disconnect(false);
    assert.strictEqual(db.setting('vrc_logout_reason', ''), '', 'normales Abmelden ohne Hinweis');
    assert.ok(/class="vx-expired" hidden/.test(app.page()));
    app.tools.stop();
});

test('3.7: Sprachanrufe 1:1 – Signalisierung E2E über den Briefkasten, Annehmen/Auflegen/Besetzt/Verpasst, TURN nur vom eigenen Server', async () => {
    const http = require('http'), E = require('../backend/e2ee');
    const { NexusApp } = require('../backend/app');
    // ---- Schein-Briefkasten wie nexuschat.php: sieht nur Chiffretext ----
    const devs = {}, opks = {}, inbox = [], blobs = {}, seen = [];
    let nid = 1;
    const srv = http.createServer((req, res) => {
        let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
            const a = new URL(req.url, 'http://x').searchParams.get('a'), in_ = JSON.parse(body), me = in_.token.slice(4);
            seen.push(body);
            const out = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
            if (a === 'publish') { const id = E.deviceId(in_.ik_sig); devs[id] = devs[id] || { uid: me, created: 1700000000, last_seen: 1700000000 }; Object.assign(devs[id], { ik_dh: in_.ik_dh, ik_sig: in_.ik_sig, spk: in_.spk }); opks[id] = (opks[id] || []).concat(in_.opks || []); return out({ device: id, opks: opks[id].length }); }
            if (a === 'devices') return out({ devices: Object.entries(devs).filter(([, d]) => d.uid === in_.uid).map(([id, d]) => Object.assign({ device: id, ik_dh: d.ik_dh, ik_sig: d.ik_sig, created: d.created }, in_.uid === me ? { last_seen: d.last_seen } : {})) });
            if (a === 'bundles') return out({ bundles: Object.entries(devs).filter(([id, d]) => d.uid === in_.uid && !(in_.skip || []).includes(id)).map(([id, d]) => ({ device: id, ik_dh: d.ik_dh, ik_sig: d.ik_sig, spk: d.spk, opk: (opks[id] || []).shift() || null })) });
            if (a === 'send') { for (const m of in_.msgs) inbox.push({ id: nid++, to: m.dev, from: me, from_dev: in_.device, body: m.body, at: Math.floor(Date.now() / 1000) }); return out({ ok: in_.msgs.length }); }
            if (a === 'fetch') return out({ msgs: inbox.filter(m => m.to === in_.device).map(m => ({ id: m.id, from: m.from, from_dev: m.from_dev, body: m.body, at: m.at })), opks: (opks[in_.device] || []).length });
            if (a === 'ack') { for (const id of in_.ids) { const k = inbox.findIndex(m => m.id === id && m.to === in_.device); if (k >= 0) inbox.splice(k, 1); } return out({ ok: true }); }
            if (a === 'remove') { if (!devs[in_.device] || devs[in_.device].uid !== me) return out({ error: 'Gerät nicht gefunden.' }); delete devs[in_.device]; return out({ ok: true }); }
            if (a === 'turn') return out({ ice: [{ urls: ['stun:turn.test:3478'] }, { urls: ['turn:turn.test:3478'], username: '1:' + me, credential: 'x' }] });
            if (a === 'blob_put') { const id = require('crypto').randomBytes(16).toString('hex'); blobs[id] = { data: Buffer.from(in_.data, 'base64'), allow: in_.allow.concat([me]) }; return out({ id }); }
            if (a === 'blob_get') { const b = blobs[in_.id]; if (!b || !b.allow.includes(me)) return out({ error: 'Bild nicht gefunden oder abgelaufen.' }); res.setHeader('Content-Type', 'application/octet-stream'); return res.end(b.data); }
            out({ error: 'unbekannt' });
        });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.NEXUS_CHAT_BASE = 'http://127.0.0.1:' + srv.address().port;
    const A = 'usr_' + 'a'.repeat(8) + '-1111-2222-3333-444444444444', B = 'usr_' + 'b'.repeat(8) + '-1111-2222-3333-444444444444', C = 'usr_' + 'c'.repeat(8) + '-1111-2222-3333-444444444444';
    const mk = async uid => {
        const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-chat-')) } });
        app.game.osc.stopListen();
        app.account.current = () => ({ token: 'tok:' + uid, account: { vrc_id: uid } });
        return app;
    };
    try {
        const a = await mk(A), b = await mk(B), c = await mk(C);
        for (const x of [a, b, c]) await x.post({ act: 'chat_list' }, {});
        const ice = await a.post({ act: 'voice_ice' }, {});
        assert.deepStrictEqual(ice.ice[1].urls, ['turn:turn.test:3478'], 'ICE-Server kommt von der Webseite');
        await assert.rejects(a.post({ act: 'voice_cfg', urls: 'stun:stun.l.google.com:19302 https://x' }, {}), /Ungültige Server-Adresse/);
        await a.post({ act: 'voice_cfg', urls: 'turn:mein.test:3478', user: 'u', pass: 'geheim' }, {});
        assert.deepStrictEqual((await a.post({ act: 'voice_ice' }, {})).ice, [{ urls: ['turn:mein.test:3478'], username: 'u', credential: 'geheim' }]);
        await a.post({ act: 'voice_cfg', urls: '' }, {});
        // A ruft B an
        const CALL = '0123456789abcdef', SDP_O = 'v=0 offer-sdp a=fingerprint:sha-256 AA', SDP_A = 'v=0 answer-sdp';
        await a.post({ act: 'voice_offer', uid: B, call: CALL, sdp: SDP_O }, {});
        await assert.rejects(a.post({ act: 'voice_offer', uid: B, call: 'fedcba9876543210', sdp: 'x' }, {}), /schon ein Anruf/);
        let pb = await b.post({ act: 'voice_poll', fast: '1' }, {});
        assert.strictEqual(pb.ring.from, A); assert.strictEqual(pb.events[0].op, 'ring');
        assert.strictEqual((await b.post({ act: 'voice_incoming' }, {})).ring.sdp, SDP_O, 'SDP kommt verschlüsselt an');
        // C ruft B an, während es klingelt → besetzt
        await c.post({ act: 'voice_offer', uid: B, call: '1111111111111111', sdp: 'x' }, {});
        await b.post({ act: 'voice_poll', fast: '1' }, {});
        let pc = await c.post({ act: 'voice_poll', fast: '1' }, {});
        assert.ok(pc.events.some(e => e.op === 'busy'), 'besetzt');
        // B nimmt an
        await b.post({ act: 'voice_accept', call: CALL, sdp: SDP_A }, {});
        let pa = await a.post({ act: 'voice_poll', fast: '1' }, {});
        assert.deepStrictEqual(pa.events.find(e => e.op === 'answer'), { op: 'answer', call: CALL, sdp: SDP_A });
        // A legt nach 42 s auf
        await a.post({ act: 'voice_hangup', call: CALL, secs: '42' }, {});
        pb = await b.post({ act: 'voice_poll', fast: '1' }, {});
        assert.ok(pb.events.some(e => e.op === 'hangup' && e.call === CALL) && !pb.active);
        assert.ok((await b.post({ act: 'chat_open', uid: A }, {})).messages.some(m => m.sys && m.text === '📞 Anruf · 0:42'), 'Anruf im Verlauf');
        assert.ok((await a.post({ act: 'chat_open', uid: B }, {})).messages.some(m => m.sys && m.text === '📞 Anruf · 0:42'));
        // Abgelehnt
        await a.post({ act: 'voice_offer', uid: B, call: '2222222222222222', sdp: SDP_O }, {});
        await b.post({ act: 'voice_poll', fast: '1' }, {});
        await b.post({ act: 'voice_decline', call: '2222222222222222' }, {});
        pa = await a.post({ act: 'voice_poll', fast: '1' }, {});
        assert.ok(pa.events.some(e => e.op === 'decline') && !pa.active);
        // Verpasst: Anrufer bricht ab, bevor B abnimmt
        await a.post({ act: 'voice_offer', uid: B, call: '3333333333333333', sdp: SDP_O }, {});
        await b.post({ act: 'voice_poll', fast: '1' }, {});
        await a.post({ act: 'voice_hangup', call: '3333333333333333', secs: '0' }, {});
        pb = await b.post({ act: 'voice_poll', fast: '1' }, {});
        assert.ok(!pb.ring, 'klingelt nicht mehr');
        assert.ok((await b.post({ act: 'chat_open', uid: A }, {})).messages.some(m => m.text === '📞 Verpasster Anruf'));
        assert.ok(!seen.some(x => x.includes('offer-sdp') || x.includes('answer-sdp')), 'Briefkasten sieht die SDP nie im Klartext');
        a.tools.stop(); b.tools.stop(); c.tools.stop();
    } finally { delete process.env.NEXUS_CHAT_BASE; srv.close(); }
});

test('3.7.1: Nexus-Konto – abgelaufener/entzogener Zugang (401) meldet in der App automatisch ab, mit Hinweis', async () => {
    const { NexusApp } = require('../backend/app');
    const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const acc = app.account;
    acc.myId = () => 'usr_x';
    acc.store({ token: 'a'.repeat(64), account: { vrc_id: 'usr_x' }, at: Date.now() });
    assert.ok(acc.current(), 'verbunden');
    const orig = global.fetch;
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Nicht angemeldet.' }) });
    try {
        await assert.rejects(app.chat.call('fetch', {}), /Nicht angemeldet/);
        assert.strictEqual(acc.current(), null, 'automatisch abgemeldet');
        const st = await app.post({ act: 'acct_get' }, {});
        assert.ok(!st.connected && st.expired, 'Hinweis „abgelaufen“');
    } finally { global.fetch = orig; app.tools.stop(); }
});

test('3.8: Plugin-Rechte „vrchat“ (nur eigene Gruppe, nur erlaubte Pfade) und verschlüsselter Token-Speicher', async () => {
    const { Plugins, vrcAllowed, checkManifest } = require('../backend/plugins');
    const { writeZip } = require('../backend/nxp');
    const G = 'grp_12345678-aaaa-4bbb-8ccc-1234567890ab', X = 'grp_00000000-0000-4000-8000-000000000000', U1 = 'usr_11111111-1111-4111-8111-111111111111';
    assert.ok(vrcAllowed('GET', '/groups/' + G + '/instances', [G]));
    assert.ok(vrcAllowed('PUT', '/groups/' + G + '/requests/' + U1, [G]));
    assert.ok(vrcAllowed('POST', '/groups/' + G + '/posts', [G]));
    assert.ok(!vrcAllowed('GET', '/groups/' + X + '/instances', [G]), 'fremde Gruppe');
    assert.ok(!vrcAllowed('DELETE', '/groups/' + G, [G]), 'Gruppe löschen nie');
    assert.ok(!vrcAllowed('POST', '/groups/' + G + '/transfer', [G]), 'übertragen nie');
    assert.ok(!vrcAllowed('GET', '/auth/user', [G]), 'eigenes Konto nie');
    assert.ok(!vrcAllowed('PUT', '/users/' + U1, [G]));
    assert.throws(() => checkManifest({ 'plugin.json': Buffer.from(JSON.stringify({ format: 1, id: 'gx', permissions: ['vrchat'] })), 'main.js': Buffer.from('') }, '3.8.0'), /groups/);
    const settings = {}, calls = [];
    const crypt = { encrypt: s2 => 'ENC:' + Buffer.from(s2).toString('base64'), decrypt: s2 => Buffer.from(s2.slice(4), 'base64').toString() };
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-plug8-'));
    const app = { db: { setting: (k, d) => (k in settings ? settings[k] : d), setSetting: (k, v) => { settings[k] = v; } }, tools: { userData: ud, host: {} }, game: { oscSend: async () => {}, osc: { params: {} }, state: {} },
        vrc: { crypt, account: () => ({ vrc_id: 'usr_me' }), call: async (acc, m, p, q, b) => { calls.push([m, p, b]); return { ok: true, path: p }; } } };
    const P = new Plugins(app);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pkg = writeZip({ 'plugin.json': JSON.stringify({ format: 1, id: 'club', main: 'main.js', permissions: ['vrchat'], groups: [G] }), 'main.js': `
            nexus.on('start', async () => {
                const out = {};
                out.inst = (await nexus.vrchat.get('/groups/${G}/instances')).path;
                try { await nexus.vrchat.get('/groups/${X}/instances'); out.foreign = 'offen'; } catch (e) { out.foreign = 'zu'; }
                try { await nexus.vrchat.delete('/groups/${G}'); out.del = 'offen'; } catch (e) { out.del = 'zu'; }
                await nexus.secrets.set('discord', 'Bot-Token-123');
                out.has = await nexus.secrets.has('discord');
                out.back = (await nexus.secrets.get('discord')) === 'Bot-Token-123';
                await nexus.storage.set('out', out);
            });` });
        let r = await P.action('plug_inspect', {}, { file: { buffer: pkg } });
        assert.ok(r.perms[0].label.includes(G), 'Installation zeigt die Gruppe');
        await P.action('plug_install', { token: r.token }, {});
        for (let k = 0; k < 30 && !P.store('club').out; k++) await wait(100);
        assert.deepStrictEqual(P.store('club').out, { inst: '/groups/' + G + '/instances', foreign: 'zu', del: 'zu', has: true, back: true });
        assert.deepStrictEqual(calls.map(c => c[0] + ' ' + c[1]), ['GET /groups/' + G + '/instances'], 'nur der erlaubte Aufruf ging an VRChat');
        const enc = fs.readFileSync(path.join(ud, 'plugins', 'data', 'club', 'secrets.enc'), 'utf8');
        assert.ok(enc.startsWith('ENC:') && !enc.includes('Bot-Token'), 'Token verschlüsselt gespeichert');
        assert.ok(!JSON.stringify(P.list()).includes('Bot-Token'), 'Token nie in der Oberfläche');
    } finally { P.stop(); await wait(300); }
});

test('3.9: Info-Karten für Links/IDs (Konto, Gruppe, Gruppen-Code, Welt, Instanz, Avatar, Event) – Zwischenspeicher, Fehler als Karte', async () => {
    const { NexusApp } = require('../backend/app');
    const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    app.vrc.account = () => ({ vrc_id: 'usr_me', cookie_jar: {} });
    const U1 = 'usr_11111111-1111-4111-8111-111111111111', G1 = 'grp_22222222-2222-4222-8222-222222222222', W1 = 'wrld_33333333-3333-4333-8333-333333333333', A1 = 'avtr_44444444-4444-4444-8444-444444444444', C1 = 'cal_55555555-5555-4555-8555-555555555555';
    let calls = 0;
    app.vrc.call = async (acc, m, p, q) => {
        calls++;
        if (p === '/users/' + U1) return { id: U1, displayName: 'Fuchsi', statusDescription: 'chillt', tags: ['system_trust_known'], isFriend: true };
        if (p === '/groups' && q.query === 'SYLVN.1234') return [{ id: G1, shortCode: 'SYLVN', discriminator: '1234' }];
        if (p === '/groups/' + G1) return { id: G1, name: 'Sylvan Test', memberCount: 1364, onlineMemberCount: 40, shortCode: 'SYLVN', discriminator: '1234', iconUrl: 'https://x.test/g.png' };
        if (p === '/worlds/' + W1) return { id: W1, name: 'Waldhütte', authorName: 'Loona', occupants: 12, favorites: 99, thumbnailImageUrl: 'https://x.test/w.png' };
        if (p === '/calendar/' + G1 + '/' + C1) return { title: 'Clubabend', startsAt: '2026-11-22T19:00:00Z', endsAt: '2026-11-22T22:00:00Z', interestedUserCount: 7 };
        throw new U.UserError('Nicht gefunden.');
    };
    const card = (kind, id) => app.post({ act: 'card_info', kind, id }, {});
    let c = await card('user', U1); assert.strictEqual(c.name, 'Fuchsi'); assert.ok(c.friend);
    const n = calls; await card('user', U1); assert.strictEqual(calls, n, 'zwischengespeichert');
    c = await card('gshort', 'SYLVN.1234'); assert.deepStrictEqual([c.kind, c.id, c.members, c.sub], ['group', G1, 1364, 'SYLVN.1234']);
    c = await card('instance', W1 + ':12345~group(' + G1 + ')~region(eu)'); assert.strictEqual(c.name, 'Waldhütte'); assert.strictEqual(String(c.region).toLowerCase(), 'eu');
    c = await card('event', G1 + '/' + C1); assert.deepStrictEqual([c.name, c.group, c.interested], ['Clubabend', G1, 7]);
    c = await card('avatar', A1); assert.ok(c.error, 'Fehler wird zur Karte statt zum Absturz');
    assert.match((await card('user', 'quatsch')).error, /Ungültige Kennung/, 'ungültige ID wird zur Fehler-Karte');
    app.tools.stop();
});

test('3.0.4: 18+ über /auth/user (ageVerified, „verified“), kurze IDs älterer Konten', async () => {
    const { NexusApp } = require('../backend/app');
    const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    let me = {}, statusApi = null;
    app.tools.call = async (m, p) => {
        if (p === '/auth/user') return me;
        if (p === '/ageVerification/status') { if (statusApi === null) throw new Error('404'); return statusApi; }
        return {};
    };
    me = { id: '8JoV9XEdpo', ageVerificationStatus: 'verified', ageVerified: true };
    assert.strictEqual(await app.account.vrcAgeStatus(), '18+', 'verified + ageVerified');
    me = { id: '8JoV9XEdpo', ageVerificationStatus: 'hidden', ageVerified: true };
    assert.strictEqual(await app.account.vrcAgeStatus(), '18+', 'Abzeichen ausgeblendet, aber bestätigt');
    me = { id: '8JoV9XEdpo', ageVerificationStatus: 'hidden', ageVerified: false };
    assert.strictEqual(await app.account.vrcAgeStatus(), 'hidden', 'nicht bestätigt, Status-API fehlt');
    statusApi = { status: '18+' };
    assert.strictEqual(await app.account.vrcAgeStatus(), '18+', 'zweiter Weg');
    me = null; statusApi = null;
    assert.strictEqual(await app.account.vrcAgeStatus(), null, 'nicht erreichbar → nichts melden');
    // kurze IDs: Chat & Warnliste lehnen sie nicht mehr ab
    assert.ok(/^(?:usr_[0-9a-f-]{36}|[0-9a-z]{10})$/.test('8jov9xedpo'));
});

test('3.1: Profil-Dekorationen – Felder lesen (auch presence), Katalog-ID / Name / URL auflösen, nur bei Änderung speichern', async () => {
    const { NexusApp } = require('../backend/app');
    const { extract } = require('../backend/deco');
    const app = new NexusApp({ db: await openDatabase(null), crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    let calls = 0;
    app.tools.call = async (m, p) => {
        calls++;
        if (p === '/cosmetics/index/iconFrame') return [{ id: 'invt_f1', name: 'Sonne', imageUrl: 'https://x.test/f.png', metadata: {} }, { id: 'invt_f3', name: 'Mit Asset', imageUrl: 'https://x.test/preview.png', metadata: { imageUrl: 'https://x.test/preview.png', assets: [{ url: 'https://x.test/frame-only.png', type: 'image' }] } }, { id: 'invt_f2', name: 'Neon Ring', metadata: { gradientStart: 'ff4fa3', gradientEnd: '3fe0c5' } }];
        if (p === '/cosmetics/index/nameplateEffect') return [{ id: 'invt_n1', name: 'Sunset', metadata: { gradientStart: '#FFAE5C', gradientEnd: 'ff4fa3' } }];
        return [];
    };
    assert.strictEqual(extract({ iconFrame: '', bannerColor: 'nope' }), null, 'nichts gesetzt');
    assert.strictEqual(extract({ presence: { iconFrame: 'invt_f1' } }).frame, 'invt_f1', 'auch aus presence');
    assert.strictEqual(extract({ bannerUrl: 'javascript:alert(1)', bannerColor: 'ff4fa3' }).banner_url, '', 'nur https-Bilder');
    app.deco.remember('usr_a', { iconFrame: 'invt_f1', bannerColor: '3fe0c5' });
    app.deco.remember('usr_b', { iconFrame: 'Neon Ring', nameplateEffect: 'invt_n1' });
    app.deco.remember('usr_c', { iconFrame: 'https://x.test/own.png', bannerUrl: 'https://x.test/b.png' });
    app.deco.remember('usr_d', { displayName: 'ohne' });
    app.deco.remember('usr_e', { iconFrame: 'invt_f3', bannerType: 'avatarBanner', bannerColor: '112233', currentAvatarImageUrl: 'https://x.test/avatar.png' });
    const m = (await app.post({ act: 'deco_map' }, {})).deco;
    assert.strictEqual(m.usr_a.frame, 'https://x.test/f.png'); assert.strictEqual(m.usr_a.color, '#3fe0c5');
    assert.deepStrictEqual(m.usr_b.ring, ['#ff4fa3', '#3fe0c5'], 'per Name gefunden, Verlauf als Ring');
    assert.deepStrictEqual(m.usr_b.name_grad, ['#ffae5c', '#ff4fa3']);
    assert.strictEqual(m.usr_c.frame, 'https://x.test/own.png'); assert.strictEqual(m.usr_c.banner, 'https://x.test/b.png');
    assert.ok(!m.usr_d);
    assert.strictEqual(m.usr_e.frame, 'https://x.test/frame-only.png', 'Rahmen-Asset statt Vorschau mit Platzhalter');
    assert.strictEqual(m.usr_e.banner, 'https://x.test/avatar.png', 'avatarBanner = Bild des aktuellen Avatars');
    // 3.5.2 Ersatz-Banner ohne Deko: VRC+ → eigenes Profilbild, sonst Avatar-Bild
    assert.deepStrictEqual(extract({ tags: ['system_supporter'], profilePicOverride: 'https://x.test/pp.png', currentAvatarThumbnailImageUrl: 'https://x.test/t.png' }), { banner_fb: 'https://x.test/pp.png', vrcplus: true });
    assert.deepStrictEqual(extract({ tags: [], profilePicOverride: 'https://x.test/pp.png', currentAvatarThumbnailImageUrl: 'https://x.test/t.png' }), { banner_fb: 'https://x.test/t.png' }, 'ohne VRC+ das Avatar-Bild');
    assert.strictEqual(extract({ tags: ['system_supporter'], bannerUrl: 'https://x.test/vb.png', profilePicOverride: 'https://x.test/pp.png' }).banner_url, 'https://x.test/vb.png', 'eigenes Banner geht vor');
    app.deco.remember('usr_f', { currentAvatarThumbnailImageUrl: 'https://x.test/t.png' });
    assert.strictEqual((await app.post({ act: 'deco_map' }, {})).deco.usr_f.banner, 'https://x.test/t.png');
    app.deco.remember('usr_g', { tags: ['system_supporter'] });
    const m2 = (await app.post({ act: 'deco_map' }, {})).deco;
    assert.ok(m2.usr_g.vrcplus && !m2.usr_f.vrcplus, 'VRC+-Abzeichen nur mit VRC+');
    const n = calls; await app.post({ act: 'deco_map' }, {}); assert.strictEqual(calls, n, 'Katalog zwischengespeichert');
    // entfernt → gelöscht
    app.deco.remember('usr_a', { iconFrame: '' });
    assert.ok(!(await app.post({ act: 'deco_map' }, {})).deco.usr_a);
    app.tools.stop();
});

test('3.2: Profilbild – auch aus presence, sonst leer', () => {
    const U = require('../backend/util');
    assert.strictEqual(U.userImage({ userIcon: 'https://a/x.png' }), 'https://a/x.png');
    assert.strictEqual(U.userImage({ userIcon: '', currentAvatarThumbnailImageUrl: '', presence: { avatarThumbnail: 'https://a/t.png' } }), 'https://a/t.png');
    assert.strictEqual(U.userImage({ presence: { userIcon: 'javascript:x' } }), '');
    assert.strictEqual(U.userImage(null), '');
});

test('3.2.2: Avatar-Suche – NSVR und VRCDB als Standard, bestehende Listen einmalig ergänzt', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const x = app.extra || app.x;
    assert.ok(x.avatarProviders().includes('https://vrcavatarsearch.nekosunevr.co.uk/vrcx_search'));
    db.setSetting('vrc_avatar_providers', JSON.stringify(['https://meine.example/vrcx']));
    db.setSetting('vrc_avatar_providers_v322', '');
    const l = x.avatarProviders();
    assert.deepStrictEqual(l, ['https://meine.example/vrcx', 'https://vrcavatarsearch.nekosunevr.co.uk/vrcx_search', 'https://vrcx.vrcdb.com/avatars/Avatar/VRCX', 'https://aviseek.vrchatlegends.com/api'], 'eigene Liste bleibt, neue dazu');
    x.avatarProvidersSave('https://meine.example/vrcx');
    assert.deepStrictEqual(x.avatarProviders(), ['https://meine.example/vrcx'], 'entfernte Anbieter kommen nicht wieder');
    app.tools.stop();
});

test('3.2.3: Gemeinsames Netzwerk – Kanten nur aus gemeinsamen Freunden, Communities nur gemeinsame Gruppen, Blockierte nie', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen();
    const u = n => 'usr_00000000-0000-4000-8000-0000000000' + n;
    const fr = (n, name) => ({ id: u(n), name, image: '', state: 'online', status: 'active', status_desc: '', trust: ['User', '#2bcf5c'], favorite: false });
    app.vrc.account = () => ({ vrc_id: u('01'), display_name: 'Ich', me: { status: 'active' } });
    app.vrc.friendList = () => [fr('10', 'A'), fr('11', 'B'), fr('12', 'C'), fr('13', 'Blockiert')];
    const calls = [];
    app.tools.call = async (m, p) => {
        calls.push(p);
        if (p === '/auth/user/playermoderations') return [{ type: 'block', targetUserId: u('13') }, { type: 'mute', targetUserId: u('12') }];
        if (p === '/users/' + u('01') + '/groups') return [{ groupId: 'grp_a', name: 'Furry Club', memberCount: 50 }, { groupId: 'grp_b', name: 'Allein', memberCount: 3 }];
        return [];
    };
    const put = (t, id, data) => db.prepare('INSERT OR REPLACE INTO ' + t + ' (vrc_id, data, fetched) VALUES (?, ?, ?)').run(id, JSON.stringify(data), Math.floor(Date.now() / 1000));
    put('mutual_cache', u('10'), [u('11'), u('13'), u('99')]);   // 13 blockiert, 99 kein Freund → keine Kanten dorthin
    put('mutual_cache', u('11'), [u('10')]);
    put('group_cache', u('10'), ['grp_a', 'grp_x']); put('group_cache', u('11'), ['grp_a']); put('group_cache', u('12'), ['grp_b']);
    const g = await app.post({ act: 'net_graph' }, {});
    assert.ok(!g.nodes.some(n => n.id === u('13')), 'blockiert erscheint nicht');
    assert.deepStrictEqual(g.edges, [[u('10'), u('11')]], 'nur echte gemeinsame Freundschaft');
    assert.deepStrictEqual(g.groups.map(x => [x.id, x.count]), [['grp_a', 2]], 'Community nur mit ≥2 gemeinsamen Mitgliedern und nur eigene Gruppen');
    assert.deepStrictEqual(g.nodes.find(n => n.id === u('10')).groups, ['grp_a'], 'fremde Gruppe grp_x nicht sichtbar');
    assert.strictEqual(g.stats.blocked, 1);
    app.tools.stop();
});

test('3.9: Nexus Pulse – Opt-in, Steam-News, Reddit-RSS, Kommentare, Favoriten, 18+-Sperre (nur Mocks)', async () => {
    const http = require('http');
    const steam = { appnews: { newsitems: [
        { gid: '1', title: 'VRChat 2026.4.1 Patch Notes', url: 'https://store.steampowered.com/news/1', author: 'tupper', contents: '[img]{STEAM_CLAN_IMAGE}/a.png[/img] Fixes &amp; more', date: 1763700000, feedname: 'steam_community_announcements' },
        { gid: '2', title: 'Developer Update - 20 November', url: 'https://store.steampowered.com/news/2', contents: 'Hi', date: 1763600000 },
        { gid: '3', title: 'Beware of phishing scams', url: 'https://store.steampowered.com/news/3', contents: 'x', date: 1763500000 },
        { gid: '4', title: 'Bad', url: 'javascript:alert(1)', contents: '', date: 1 }] } };
    const atom = (n, extra) => '<?xml version="1.0"?><feed>' + Array.from({ length: n }, (_, i) => '<entry><author><name>/u/user' + i + '</name></author><content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;img src=&quot;https://i.redd.it/p' + i + '.jpg&quot; /&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;&lt;p&gt;Text &amp;amp; ' + i + '&lt;/p&gt; submitted by /u/user' + i + '</content><id>t3_abc' + i + '</id><link href="https://www.reddit.com/r/VRChat/comments/abc' + i + '/title/" /><updated>2026-11-21T10:00:0' + i + '+00:00</updated><title>Post ' + i + (extra || '') + '</title></entry>').join('') + '</feed>';
    const hits = [];
    const srv = http.createServer((req, res) => {
        hits.push(req.url + ' UA=' + req.headers['user-agent']);
        if (req.url.startsWith('/ISteamNews/')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(steam)); }
        if (req.url.startsWith('/r/VRChat/comments/abc0/')) return res.end(atom(3, ' (c)'));
        if (req.url.startsWith('/r/VRChat/')) return res.end(atom(2));
        res.statusCode = 404; res.end('');
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const B = 'http://127.0.0.1:' + srv.address().port;
    process.env.NEXUS_STEAMNEWS_BASE = B; process.env.NEXUS_REDDIT_BASE = B;
    try {
        const { NexusApp } = require('../backend/app');
        const db = await openDatabase(null);
        const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: os.tmpdir() } });
        app.game.osc.stopListen();
        const P = app.pulse;
        assert.strictEqual((await P.action('pulse_state', {})).on, false);
        await assert.rejects(P.action('pulse_feed', { src: 'vrchat' }), /aus/);
        assert.strictEqual(hits.length, 0, 'ohne Opt-in kein Abruf');
        await P.action('pulse_enable', { on: '1' });
        const v = await P.action('pulse_feed', { src: 'vrchat' });
        assert.deepStrictEqual(v.items.map(x => x.kind), ['patch', 'dev', 'security']);
        assert.strictEqual(v.items[0].img, 'https://clan.akamai.steamstatic.com/images/a.png');
        assert.strictEqual(v.items[0].text, 'Fixes & more');
        assert.ok(/^VRC-Nexus\//.test(hits[0].split('UA=')[1]));
        assert.strictEqual((await P.action('pulse_feed', { src: 'vrchat', kind: 'security' })).items.length, 1);
        const r = await P.action('pulse_feed', { src: 'reddit', sort: 'top' });
        assert.strictEqual(r.items.length, 2);
        assert.strictEqual(r.items[0].author, 'user0');
        assert.strictEqual(r.items[0].img, 'https://i.redd.it/p0.jpg');
        assert.strictEqual(r.items[0].text, 'Text & 0');
        assert.ok(hits.some(h => h.startsWith('/r/VRChat/top/.rss?t=week')));
        const c = await P.action('pulse_comments', { url: r.items[0].url });
        assert.strictEqual(c.items.length, 2);
        await assert.rejects(P.action('pulse_comments', { url: 'https://evil.example/r/VRChat/comments/abc0/' }), /Kein Reddit/);
        await assert.rejects(P.action('pulse_feed', { src: 'erp' }), /18\+/);
        await assert.rejects(P.action('pulse_comments', { url: 'https://www.reddit.com/r/VRchatERP/comments/abc0/x/' }), /Nicht freigeschaltet/);
        await P.action('pulse_fav', { id: r.items[1].id, on: '1', item: JSON.stringify(r.items[1]) });
        await assert.rejects(P.action('pulse_fav', { id: 'x', on: '1', item: JSON.stringify({ title: 't', url: 'javascript:alert(1)' }) }), /Link/);
        assert.strictEqual((await P.action('pulse_favs', {})).items[0].title, 'Post 1');
        assert.strictEqual((await P.action('pulse_feed', { src: 'reddit', sort: 'top' })).items[1].fav, true);
        const n = hits.length;
        await P.action('pulse_feed', { src: 'reddit', sort: 'top' });
        assert.strictEqual(hits.length, n, 'Zwischenspeicher');
        await P.action('pulse_fav', { id: r.items[1].id, on: '' });
        assert.strictEqual((await P.action('pulse_favs', {})).items.length, 0);
    } finally { delete process.env.NEXUS_STEAMNEWS_BASE; delete process.env.NEXUS_REDDIT_BASE; srv.close(); }
});

test('4.1: Buttplug-Funktionen (Aktoren, Rotation, Stroker, Sensoren, Gerät-Einstellungen, Motoren) + PCS, Lust, Höhepunkt, Edging, Consent, Szene, HUD', async () => {
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const { ALLOWED } = require('../backend/remote');
    const OWNER = 'usr_' + 'd'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-41-')) } });
    app.game.osc.stopListen();
    app.vrc.account = () => ({ vrc_id: OWNER, me: {}, display_name: 'X' });
    grant18(app);
    const t = app.toys, sent = [], chat = [], osc = [];
    app.game.osc.chatbox = async x => { chat.push(x); };
    app.game.osc.send = async (a, v) => { osc.push([a, v]); };
    t.ws = { readyState: 1, send() {} };
    t.req = async m => { sent.push(m); if (m.SensorReadCmd) return { SensorReading: { DeviceIndex: m.SensorReadCmd.DeviceIndex, SensorIndex: 0, SensorType: m.SensorReadCmd.SensorType, Data: [m.SensorReadCmd.SensorType === 'Battery' ? 12 : -60] } }; return {}; };
    t.addDevice({ DeviceIndex: 0, DeviceName: 'Combo', DeviceMessageTimingGap: 0, DeviceMessages: {
        ScalarCmd: [{ StepCount: 20, ActuatorType: 'Vibrate', FeatureDescriptor: 'Spitze' }, { StepCount: 10, ActuatorType: 'Constrict' }],
        RotateCmd: [{ StepCount: 20 }], LinearCmd: [{ StepCount: 100 }],
        SensorReadCmd: [{ SensorType: 'Battery', SensorRange: [[0, 100]] }, { SensorType: 'RSSI', SensorRange: [[-128, 0]] }], SensorSubscribeCmd: [{ SensorType: 'Button', SensorRange: [[0, 1]] }] } });
    await U.sleep(400);
    const d = t.status().devices[0];
    assert.strictEqual(d.battery, 12, 'Akku über SensorReadCmd'); assert.strictEqual(d.rssi, -60, 'Signalstärke');
    assert.ok(sent.some(m => m.SensorSubscribeCmd && m.SensorSubscribeCmd.SensorType === 'Button'), 'Knopf abonniert');
    assert.ok(d.rotate === 1 && d.linear === 1 && d.scalars.length === 2);
    const lastOf = k => sent.filter(m => m[k]).pop()[k];
    await app.post({ act: 'toys_set', device: '0', level: '0.5' }, {});
    let sc = lastOf('ScalarCmd').Scalars;
    assert.strictEqual(sc[0].Scalar, 0.5); assert.strictEqual(sc[1].Scalar, 0.3, 'Enge mit 60 % Anteil (Standard)'); assert.strictEqual(sc[1].ActuatorType, 'Constrict');
    assert.deepStrictEqual(lastOf('RotateCmd').Rotations[0], { Index: 0, Speed: 0.5, Clockwise: true });
    const lin = lastOf('LinearCmd').Vectors[0]; assert.ok(lin.Duration > 250 && lin.Duration < 1600 && (lin.Position === 1 || lin.Position === 0));
    // Gerät: Min/Max/Kurve/Anteile/Richtung/Hub
    await app.post({ act: 'toys_dev', name: 'Combo', data: JSON.stringify({ min: 20, max: 80, curve: 2, types: { Constrict: 0 }, rot: 'ccw', lin_min: 10, lin_max: 60, alias: 'Liebling' }) }, {});
    await app.post({ act: 'toys_set', device: '0', level: '0.5' }, {});
    sc = lastOf('ScalarCmd').Scalars;
    assert.strictEqual(sc[0].Scalar, 0.35, '20 % + 60 % × 0,5² = 35 %'); assert.strictEqual(sc[1].Scalar, 0, 'Enge abgeschaltet');
    assert.strictEqual(lastOf('RotateCmd').Rotations[0].Clockwise, false);
    assert.strictEqual(t.status().devices[0].label, 'Liebling');
    t.devices.get(0).linNext = 0; await t.drive(t.devices.get(0), true);
    assert.ok([0.1, 0.6].includes(lastOf('LinearCmd').Vectors[0].Position), 'Hub im Bereich 10–60 %');
    await app.post({ act: 'toys_dev', name: 'Combo', data: JSON.stringify({ on: '0' }) }, {});
    await app.post({ act: 'toys_set', device: '0', level: '1' }, {});
    assert.strictEqual(lastOf('ScalarCmd').Scalars[0].Scalar, 0, 'Gerät aus → 0');
    await app.post({ act: 'toys_dev', name: 'Combo', data: JSON.stringify({ on: '1', min: 0, max: 100, curve: 1, types: { Constrict: 60 } }) }, {});
    // einzelner Motor, Antippen, Einzel-Stopp
    await app.post({ act: 'toys_motor', device: '0', motor: '1', level: '0.9' }, {});
    assert.strictEqual(lastOf('ScalarCmd').Scalars[1].Scalar, 0.9, 'Motor 2 eigener Wert');
    await app.post({ act: 'toys_stop_dev', device: '0' }, {});
    assert.ok(sent.some(m => m.StopDeviceCmd && m.StopDeviceCmd.DeviceIndex === 0));
    // Knopf am Gerät → Standard „stoppen“
    const nStop = sent.filter(m => m.StopAllDevices).length;
    t.onSensor({ DeviceIndex: 0, SensorType: 'Button', Data: [1] }); await U.sleep(10);
    assert.strictEqual(sent.filter(m => m.StopAllDevices).length, nStop + 1, 'Knopf stoppt');
    // eigene Muster
    await app.post({ act: 'toys_cfg', custom: JSON.stringify([{ name: 'Treppchen', steps: '0, 100', step_ms: 1000 }]) }, {});
    const cid = 'u:' + t.cfg().custom[0].id;
    assert.ok(t.status().patterns.some(p => p.id === cid));
    assert.strictEqual(t.patternFn(cid)(0.5), 0.5, 'weich übergeblendet');
    // PCS
    await app.post({ act: 'toys_cfg', pcs: JSON.stringify({ on: '1', w_depth: 60, w_speed: 80, w_lust: 20 }) }, {});
    const pcs = (n, v) => t.onOsc('/avatar/parameters/pcs/' + n, [v]);
    pcs('output/depth-value', 0.5); pcs('output/velocity', 0.5);
    assert.strictEqual(Math.round(t.pcsLevel() * 100), 70, '0,5×60 % + 0,5×80 %');
    t.linkSent.clear(); t.compute(); await U.sleep(10);
    assert.strictEqual(lastOf('ScalarCmd').Scalars[0].Scalar, 0.7);
    pcs('output/smash-intensity', 4); pcs('output/smash-hit', true);
    assert.strictEqual(Math.round(t.pcsLevel() * 100), 99, 'Stoß-Impuls stärke 4');
    pcs('select/pussy', true);
    assert.ok(t.pcsLevel(['pussy']) > 0 && t.pcsLevel(['mouth']) === 0, 'Zonen-Filter');
    assert.ok(t.status().pcs.seen.includes('pcs/output/depth-value') && t.status().pcs.zones.includes('pussy'));
    await app.post({ act: 'toys_cfg', links: JSON.stringify({ Combo: [{ type: 'pcs', include: ['pussy', 'quatsch'] }] }) }, {});
    assert.deepStrictEqual(t.cfg().links.Combo[0].include, ['pussy', 'quatsch']);
    // PCS-Ereignis 10 → Höhepunkt (Chatbox + Parameter)
    await app.post({ act: 'toys_cfg', lust: JSON.stringify({ climax: '1', climax_chat: '💥 Wow', climax_param: 'Climax' }) }, {});
    pcs('satisfaction/lust', 0.97); pcs('satisfaction/event', 9); pcs('satisfaction/event', 10);
    await U.sleep(10);
    assert.ok(chat.includes('💥 Wow') && osc.some(([a, v]) => a === '/avatar/parameters/Climax' && v === true), 'Höhepunkt-Aktionen');
    assert.strictEqual(t.pat && t.pat.id, 'hoehepunkt');
    t.tickLust(t.cfg()); assert.strictEqual(t.status().lust.v, 97, 'Lust aus PCS'); assert.ok(t.status().lust.ext);
    // Edging: Schwelle 85 % → auf 20 % gebremst
    await app.post({ act: 'toys_cfg', edge: JSON.stringify({ on: '1', at: 85, cap: 20 }) }, {});
    t.tickLust(t.cfg()); assert.ok(t.lust.edgeHold);
    t.level.set(0, 1); assert.strictEqual(Math.round(t.shaped(t.devices.get(0)) * 100), 20, 'Edging-Bremse');
    await app.post({ act: 'toys_edge_release' }, {}); t.tickLust(t.cfg());
    assert.strictEqual(Math.round(t.shaped(t.devices.get(0)) * 100), 100, 'erlöst');
    // Consent-Ampel
    let st = await app.post({ act: 'toys_consent', light: 'red' }, {});
    assert.ok(/Rot/.test(st.msg) && osc.some(([a, v]) => a === '/avatar/parameters/NX/Consent' && v === 2) && chat.some(c => /STOPP/.test(c)));
    t.level.set(0, 1); assert.strictEqual(t.shaped(t.devices.get(0)), 0, 'Rot blockiert');
    await app.post({ act: 'toys_consent', light: 'yellow' }, {}); t.level.set(0, 1);
    assert.strictEqual(Math.round(t.shaped(t.devices.get(0)) * 100), 50, 'Gelb = 50 %');
    await assert.rejects(app.post({ act: 'toys_consent', light: 'lila' }, {}), /Ampel/);
    await app.post({ act: 'toys_consent', light: 'green' }, {});
    // eigene Lust-Berechnung → Höhepunkt bei 100 %
    await app.post({ act: 'toys_cfg', lust: JSON.stringify({ source: 'own' }), edge: JSON.stringify({ on: '0' }) }, {});
    t.lust.climaxAt = 0; t.lust.v = 0.999; t.cur.set(0, 1); t.lust.at = Date.now() - 1000; t.tickLust(t.cfg());
    assert.ok(t.lust.climaxes >= 2 && t.lust.v < 0.5, 'eigener Höhepunkt, danach zurück');
    // Szene → Ende stoppt und Aftercare fällig
    st = await app.post({ act: 'toys_scene', name: 'Test', minutes: '5' }, {});
    assert.ok(st.scene && st.scene.left > 250);
    t.scene.until = Date.now() - 1; t.tickLust(t.cfg()); await U.sleep(10);
    assert.ok(!t.scene && t.status().session.aftercare_due);
    await app.post({ act: 'toys_aftercare_done' }, {}); assert.ok(!t.status().session.aftercare_due);
    // Puls & Stimme
    app.heart.push(120, 'test');
    await app.post({ act: 'toys_cfg', heart: JSON.stringify({ lo: 80, hi: 160 }) }, {});
    assert.strictEqual(t.heartLevel(), 0.5);
    await app.post({ act: 'toys_voice', lv: '0.4' }, {}); assert.strictEqual(t.voiceLevel(), 0.4);
    // HUD & Handy
    app.settings.save({ 'vr.overlay_hud_items': 'lust,toy' });
    assert.ok(app.hudState().items.some(i => i.key === 'lust'), 'Lust im HUD');
    app.nsfw.private = true; assert.ok(!app.hudState().items.some(i => i.key === 'lust'), 'nicht im Privat-Modus');
    assert.ok(ALLOWED.includes('toys_consent'));
    delete process.env.NEXUS_OWNER_HASH;
    t.stop(); app.tools.stop();
});

test('4.2: OSC – typrichtig senden & bündeln, mehr OSC-Typen, OSCQuery (mDNS simuliert), SPS/OGB/PCS-Erkennung, OGB/Enabled', async () => {
    const { Osc, oscDecode } = require('../backend/gamelog');
    const { OscQuery, encodeMsg, decodeMsg, T } = require('../backend/oscquery');
    const H = require('../backend/haptics');
    // --- Decoder: double + Typ-Tags (unsichtbar)
    const addr = Buffer.from('/avatar/parameters/X\0\0\0\0'), tags = Buffer.from(',d\0\0'), d = Buffer.alloc(8); d.writeDoubleBE(0.25);
    const dec = oscDecode(Buffer.concat([addr, tags, d]));
    assert.deepStrictEqual(dec, [['/avatar/parameters/X', [0.25]]]); assert.strictEqual(dec[0].tags, 'd');
    // --- typrichtig senden & bündeln
    const o = new Osc(); const sent = []; o.send = async (a, v) => { sent.push([a, v]); };
    o.known = { Hue: 'float', Ears: 'bool', Mode: 'int' };
    await o.sendParam('Hue', 1); assert.deepStrictEqual(sent.pop(), ['/avatar/parameters/Hue', { float: 1 }], 'Float 1.0 bleibt Float');
    await o.sendParam('Ears', 1, 'float'); assert.deepStrictEqual(sent.pop(), ['/avatar/parameters/Ears', true], 'Typ vom Avatar schlägt Vorgabe');
    await o.sendParam('Mode', 2.6); assert.deepStrictEqual(sent.pop(), ['/avatar/parameters/Mode', 3]);
    sent.length = 0;
    o.sendParam('Wag', 0.1); o.sendParam('Wag', 0.2); await o.sendParam('Wag', 0.3);
    assert.deepStrictEqual(sent.map(x => x[1].float), [0.1, 0.3], 'zwischendurch gebündelt, letzter Wert gewinnt');
    assert.ok(o.stats.merged >= 1);
    // --- mDNS kodieren/lesen
    const m = decodeMsg(encodeMsg({ response: true, answers: [{ name: '_oscjson._tcp.local', type: T.PTR, data: 'X._oscjson._tcp.local' }, { name: 'X._oscjson._tcp.local', type: T.SRV, port: 1234, target: 'x.local' }, { name: 'x.local', type: T.A, ip: '127.0.0.1' }] }));
    assert.ok(m.response && m.answers[1].port === 1234 && m.answers[2].ip === '127.0.0.1' && m.answers[0].data === 'X._oscjson._tcp.local');
    // --- OSCQuery: simuliertes mDNS-Netz zwischen „VRChat“ und Nexus
    const bus = new Set();
    const mk = () => { const t = { handlers: new Set(), error: '', start() { bus.add(t); }, stop() { bus.delete(t); }, on(h) { t.handlers.add(h); },
        send(msg) { const buf = encodeMsg(msg); setTimeout(() => { for (const x of bus) if (x !== t) for (const h of x.handlers) h(decodeMsg(buf), { address: '127.0.0.1' }); }, 1); } }; return t; };
    const vr = new OscQuery({ name: 'VRChat-Client-ABC123', transport: mk() });
    vr.treeJson = () => ({ FULL_PATH: '/', CONTENTS: { avatar: { FULL_PATH: '/avatar', CONTENTS: { parameters: { FULL_PATH: '/avatar/parameters', CONTENTS: {
        OGB: { FULL_PATH: '/avatar/parameters/OGB', CONTENTS: { Enabled: { FULL_PATH: '/avatar/parameters/OGB/Enabled', TYPE: 'T', VALUE: [false] } } },
        Ears: { FULL_PATH: '/avatar/parameters/Ears', TYPE: 'i', VALUE: [2] }, Hue: { FULL_PATH: '/avatar/parameters/Hue', TYPE: 'f', VALUE: [0.5] } } } } } } });
    vr.hostInfo = () => ({ NAME: 'VRChat-Client-ABC123', OSC_IP: '127.0.0.1', OSC_PORT: 9123, OSC_TRANSPORT: 'UDP' });
    await vr.advertise(9123);
    const nx = new OscQuery({ transport: mk() });
    const ad = await nx.advertise(45678);
    const hi = await (await fetch('http://127.0.0.1:' + ad.http + '/?HOST_INFO')).json();
    assert.ok(hi.OSC_PORT === 45678 && hi.OSC_TRANSPORT === 'UDP' && /^VRC-Nexus-/.test(hi.NAME));
    const av = await (await fetch('http://127.0.0.1:' + ad.http + '/avatar')).json();
    assert.ok(av.CONTENTS.parameters && av.FULL_PATH === '/avatar', 'Nexus möchte /avatar empfangen');
    nx.discover(); await U.sleep(200);
    assert.ok(nx.vrchat && nx.vrchat.osc_port === 9123, 'VRChat gefunden: Eingangs-Port');
    assert.deepStrictEqual(nx.params, { 'OGB/Enabled': { type: 'bool', value: false }, Ears: { type: 'int', value: 2 }, Hue: { type: 'float', value: 0.5 } });
    // Fragen anderer werden beantwortet
    let answered = null; const probe = mk(); probe.start(); probe.on(msg => { if (msg.response && msg.answers.some(a => /VRC-Nexus/.test(a.data || ''))) answered = msg; });
    probe.send({ questions: [{ name: '_oscjson._tcp.local', type: T.PTR }] }); await U.sleep(50);
    assert.ok(answered && answered.answers.some(a => a.type === T.SRV && a.port === ad.http), 'Nexus antwortet auf mDNS-Fragen');
    vr.stop(); nx.stop();
    // --- SPS / OGB / PCS erkennen
    assert.deepStrictEqual(H.parse('OGB/Socket/Vag/DepthOthers'), { sys: 'sps', kind: 'sockets', id: 'Vag', field: 'DepthOthers', key: 'penothers', meta: false });
    assert.strictEqual(H.parse('OGB/Plug/Dick/FrotOthers').key, 'frotothers');
    assert.strictEqual(H.parse('OGB/Touch/Hand/Others').key, 'touchothers');
    assert.strictEqual(H.parse('OGB/Pen/Old/PenOthersNewTip').sys, 'ogb'); assert.strictEqual(H.parse('OGB/Pen/Old/PenOthersNewTip').key, 'penothers');
    assert.ok(H.parse('OGB/Plug/Dick/LengthMult1').meta);
    assert.strictEqual(H.parse('VFH/Zone/Orf/X/PenOthers').kind, 'sockets');
    const det = H.detect(['OGB/Enabled', 'OGB/Version/11', 'OGB/Plug/Dick/TouchSelf', 'OGB/Socket/Vag/DepthOthers', 'OGB/Socket/Mouth/DepthOthers', 'pcs/output/depth-value', 'pcs/select/pussy', 'pcs/satisfaction/event', 'NX/Consent'], {});
    assert.ok(det.sps.found && det.sps.version === 11 && det.sps.enabled_param);
    assert.deepStrictEqual(det.sps.sockets, ['Vag', 'Mouth']); assert.deepStrictEqual(det.sps.plugs, ['Dick']);
    assert.ok(det.pcs.found && det.pcs.zones.includes('pussy') && det.pcs.events && det.extras.consent);
    assert.ok(H.isNsfw('pcs/output/velocity') && H.isNsfw('OGB/Enabled') && !H.isNsfw('Ears'));
    // --- Spielzeug: neue SPS-Namen + OGB/Enabled
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const OWNER = 'usr_' + 'e'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-42-')) } });
    app.game.osc.stopListen();
    app.vrc.account = () => ({ vrc_id: OWNER, me: {}, display_name: 'X' });
    grant18(app);
    const t = app.toys, cmds = [], osc = [];
    app.game.osc.send = async (a, v) => { osc.push([a, v]); };
    t.ws = { readyState: 1, send() {} }; t.req = async m => { cmds.push(m); return {}; };
    t.devices.set(0, { index: 0, name: 'Testgerät', motors: [{ index: 0, type: 'Vibrate', steps: 100 }] });
    await app.post({ act: 'toys_cfg', ogb: '1', ogb_min: '0' }, {});
    t.onOsc('/avatar/parameters/OGB/Socket/Vag/DepthOthers', [0.7]); await U.sleep(150);
    assert.strictEqual(cmds.filter(m => m.ScalarCmd).pop().ScalarCmd.Scalars[0].Scalar, 0.7, 'SPS-3-Tiefe steuert');
    t.onOsc('/avatar/parameters/OGB/Plug/Dick/LengthMult1', [0.95]); await U.sleep(150);
    assert.strictEqual(cmds.filter(m => m.ScalarCmd).pop().ScalarCmd.Scalars[0].Scalar, 0.7, 'Maße steuern nichts');
    app.game.osc.known = { 'OGB/Enabled': 'bool' };
    t.idle(); await U.sleep(10);
    assert.ok(osc.some(([a, v]) => a === '/avatar/parameters/OGB/Enabled' && v === true), 'OGB/Enabled eingeschaltet');
    await app.post({ act: 'toys_cfg', ogb: '0' }, {}); t.idle(); await U.sleep(60);
    assert.ok(osc.some(([a, v]) => a === '/avatar/parameters/OGB/Enabled' && v === false), 'und wieder aus');
    app.game.osc.known = { 'NX/Lust': 'float' }; t.lust.v = 0.5; t.pcs.lust = -1; t.cur.set(0, 0.5); t.tickLust(t.cfg()); await U.sleep(10);
    assert.ok(osc.some(([a, v]) => a === '/avatar/parameters/NX/Lust' && v && v.float > 0.4), 'Rückkanal NX/Lust');
    app.game.osc.known = { 'OGB/Enabled': 'bool' };
    const chk = await app.post({ act: 'toys_check' }, {});
    assert.ok(chk.check && chk.check.sps.enabled_param);
    const st = await app.post({ act: 'client_oscinfo' }, {});
    assert.ok(st.rate && st.setting === 'auto');
    delete process.env.NEXUS_OWNER_HASH;
    t.stop(); app.tools.stop();
});

test('4.2.1: OSC-Empfang bleibt beim erneuten Anwenden bestehen; Parameter nur vom getragenen Avatar (OSC, OSCQuery, Log, Konto)', async () => {
    const { Osc } = require('../backend/gamelog');
    // --- gleicher Port zweimal: kein Neubinden (unter Windows sonst „belegt“ → Ausweichen auf OSCQuery)
    const o = new Osc();
    const p1 = await o.listen(0, null, '127.0.0.1');
    const sock = o.listener;
    o.listenWant = p1;   // so tun, als wäre p1 der feste Port
    let failed = false;
    const p2 = await o.listen(p1, () => { failed = true; }, '127.0.0.1');
    assert.ok(p1 > 0 && p2 === p1 && o.listener === sock && !failed, 'Socket bleibt, kein Fehler');
    // --- belegter Port: erst nach mehreren Versuchen onFail
    const o2 = new Osc(); const t0 = Date.now();
    const r = await o2.listen(p1, () => { failed = true; }, '127.0.0.1');
    assert.ok(r === 0 && failed && Date.now() - t0 >= 1000 && /belegt/.test(o2.listenError), 'wiederholt, dann onFail');
    // Empfang über receive(): /avatar/change setzt Avatar + Quelle
    const enc = (a, tag, v) => { const pad = b => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]); return Buffer.concat([pad(Buffer.from(a)), pad(Buffer.from(',' + tag)), v]); };
    o.stopListen(); o2.stopListen();

    // --- getragener Avatar & Parameterliste
    const { NexusApp } = require('../backend/app');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-421-'));
    const usr = 'usr_' + '1'.repeat(8) + '-2222-3333-4444-555555555555';
    const A = 'avtr_' + 'a'.repeat(8) + '-1111-2222-3333-444444444444', B = 'avtr_' + 'b'.repeat(8) + '-1111-2222-3333-444444444444';
    fs.mkdirSync(path.join(dir, 'OSC', usr, 'Avatars'), { recursive: true });
    const wr = (id, name, ps) => fs.writeFileSync(path.join(dir, 'OSC', usr, 'Avatars', id + '.json'), '﻿' + JSON.stringify({ id, name, parameters: ps.map(([n, ty]) => ({ name: n, input: { address: '/avatar/parameters/' + n, type: ty }, output: { address: '/avatar/parameters/' + n, type: ty } })) }));
    wr(A, 'Fuchs', [['Ears', 'Bool'], ['Hue', 'Float']]);
    wr(B, 'Fiya Full', [['Tail', 'Int']]);
    const old = process.env.NEXUS_VRCHAT_DIR; process.env.NEXUS_VRCHAT_DIR = dir;
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-421u-')) } });
    app.game.osc.stopListen();
    app.vrc.account = () => null;
    let l = await app.post({ act: 'client_params' }, {});
    assert.ok(!l.avatar && l.params.length === 0, 'ohne Hinweis: kein Avatar geraten (nicht einfach die neueste Datei)');
    // Konto (VRChat-API) kennt den Avatar
    app.vrc.account = () => ({ user_id: usr, me: { currentAvatar: A } });
    l = await app.post({ act: 'client_params' }, {});
    assert.ok(l.avatar.id === A && l.avatar.name === 'Fuchs' && l.src === 'api' && l.params.map(p => p.name).join() === 'Ears,Hue' && !l.avatars, 'Konto: nur dieser Avatar');
    // Spiel-Log (Name) schlägt das Konto
    app.game.state.avatar = 'Fiya Full'; app.game.state.running = true;
    l = await app.post({ act: 'client_params' }, {});
    assert.ok(l.avatar.id === B && l.src === 'log' && l.params.map(p => p.name).join() === 'Tail');
    // OSCQuery: Avatar-ID und Werte aus VRChats Baum
    app.oq = { avatarId: A, params: { Ears: { type: 'bool', value: true }, Hue: { type: 'float', value: 0.25 }, Extra: { type: 'int', value: 3 } } };
    app.fromQuery(app.oq.params);
    l = await app.post({ act: 'client_params' }, {});
    assert.ok(l.avatar.id === A && l.src === 'oscquery', 'OSCQuery vor Log');
    assert.deepStrictEqual(l.params.map(p => [p.name, p.value]), [['Ears', true], ['Extra', 3], ['Hue', 0.25]], 'Werte aus OSCQuery, live-Parameter ergänzt');
    const dbg = await app.post({ act: 'client_debug' }, {});
    assert.ok(dbg.params.Ears === true && dbg.avatar === A && dbg.avatar_name === 'Fuchs', 'Debugger zeigt Werte schon vor dem ersten OSC-Paket');
    // OSC /avatar/change gewinnt
    app.game.osc.receive(enc('/avatar/change', 's', Buffer.from(B + '\0\0\0\0'.slice((B.length) % 4))));
    app.game.osc.receive(enc('/avatar/parameters/Tail', 'i', Buffer.from([0, 0, 0, 7])));
    l = await app.post({ act: 'client_params' }, {});
    assert.ok(l.avatar.id === B && l.src === 'osc' && l.live && l.params.find(p => p.name === 'Tail').value === 7, 'OSC: Avatarwechsel + Wert');
    app.fromQuery(app.oq.params);   // veraltete OSCQuery-Antwort überschreibt den frischen Wechsel nicht
    assert.strictEqual(app.game.osc.avatarId, B);
    if (old === undefined) delete process.env.NEXUS_VRCHAT_DIR; else process.env.NEXUS_VRCHAT_DIR = old;
    app.tools.stop(); if (app.toys) app.toys.stop();
});

test('4.2.3: HypeRate über die Weiterleitung – Schlüssel bleibt auf dem Server, ein Kanal je Device-ID, Fehler, Limits', async () => {
    const { WebSocketServer } = require('ws');
    // nachgestelltes HypeRate (Phoenix-Kanäle)
    const wss = new WebSocketServer({ port: 0 });
    const tokens = [], joins = [], leaves = [];
    wss.on('connection', (ws, req) => {
        tokens.push(new URL(req.url, 'http://x').searchParams.get('token'));
        ws.on('message', m => {
            const j = JSON.parse(String(m));
            if (j.event === 'phx_leave') leaves.push(j.topic);
            if (j.event !== 'phx_join') return;
            joins.push(j.topic);
            if (j.topic === 'hr:unknown') return ws.send(JSON.stringify({ topic: j.topic, event: 'phx_reply', payload: { status: 'error' }, ref: j.ref }));
            ws.send(JSON.stringify({ topic: j.topic, event: 'phx_reply', payload: { status: 'ok' }, ref: j.ref }));
            setTimeout(() => ws.send(JSON.stringify({ topic: j.topic, event: 'hr_update', payload: { hr: 88 } })), 30);
        });
    });
    await new Promise(res => wss.on('listening', res));
    // Die Weiterleitung liegt neben der App im Repo; der Windows-Build kopiert nur die App – dann diesen Teil überspringen
    const relayFile = [path.join(__dirname, '..', '..', 'hyperate-relay', 'app.js'), path.join(__dirname, '..', '..', 'apps', 'hyperate-relay', 'app.js')].find(f => fs.existsSync(f));
    if (!relayFile || typeof WebSocket === 'undefined') { wss.close(); console.log('   (HypeRate-Weiterleitung nicht im Build-Ordner – Test übersprungen)'); return; }
    Object.assign(process.env, { HYPERATE_WS: 'ws://127.0.0.1:' + wss.address().port, HYPERATE_API_KEY: 'project-secret-key', RELAY_PER_IP: '3', RELAY_NO_AUTOSTART: '1' });
    delete require.cache[require.resolve(relayFile)];
    const relay = require(relayFile);
    await new Promise(res => relay.server.listen(0, '127.0.0.1', res));
    const RB = 'http://127.0.0.1:' + relay.server.address().port;
    const h = await (await fetch(RB + '/health')).json();
    assert.ok(h.ok && h.service === 'vrc-nexus-hyperate-relay' && !JSON.stringify(h).includes('project-secret'), 'Health ohne Schlüssel');
    assert.strictEqual((await fetch(RB + '/hr/bad id!')).status, 400);
    // App ohne eigenen Schlüssel → Weiterleitung
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => 'enc:' + s, decrypt: s => s.replace(/^enc:/, '') }, host: { userData: os.tmpdir() } });
    app.game.osc.stopListen(); app.game.osc.send = async () => {};
    process.env.NEXUS_HYPERATE_RELAY = RB;
    const seen = [];
    const realFetch = global.fetch;
    global.fetch = (u, o) => { seen.push(String(u)); return realFetch(u, o); };
    const post = (act, d) => app.post(Object.assign({ act }, d || {}), {});
    await post('hr_save', { source: 'hyperate', hyperate_id: 'Ab12cd' });
    for (let i = 0; i < 100 && app.heart.bpm !== 88; i++) { await app.heart.refresh(); await U.sleep(20); }
    assert.strictEqual(app.heart.bpm, 88); assert.strictEqual(app.heart.from, 'hyperate');
    assert.ok(seen.some(u => u === RB + '/hr/Ab12cd') && !seen.some(u => u.includes('token')), 'App spricht nur mit der Weiterleitung, ohne Schlüssel');
    assert.deepStrictEqual([...new Set(tokens)], ['project-secret-key'], 'nur der Server nutzt den Projekt-Schlüssel');
    assert.strictEqual((await post('hr_get')).hyperate_via, 'relay');
    // 4.2.4: alter, nicht funktionierender eigener Schlüssel → automatisch zurück auf die Weiterleitung
    process.env.NEXUS_HYPERATE_WS = 'ws://127.0.0.1:1';
    await post('hr_hyperate_key', { token: 'old-broken-key-123' });
    app.heart.bpm = 0; app.heart.at = 0;
    for (let i = 0; i < 150 && app.heart.bpm !== 88; i++) { await app.heart.refresh(); await U.sleep(20); }
    assert.strictEqual(app.heart.bpm, 88, 'Rückfall auf die Weiterleitung');
    assert.strictEqual((await post('hr_get')).hyperate_via, 'relay');
    await post('hr_hyperate_key', { token: '' }); delete process.env.NEXUS_HYPERATE_WS;
    // zweiter Zuhörer für dieselbe ID → kein zweiter Beitritt; letzter Wert kommt sofort
    const ctl = new AbortController();
    const r2 = await realFetch(RB + '/hr/Ab12cd', { signal: ctl.signal });
    const rd = r2.body.getReader(); let txt = '';
    for (let i = 0; i < 5 && !txt.includes('"hr":88'); i++) txt += new TextDecoder().decode((await rd.read()).value);
    assert.ok(txt.includes('"hr":88')); assert.strictEqual(joins.filter(j => j === 'hr:Ab12cd').length, 1, 'ein Kanal je ID');
    ctl.abort();
    // unbekannte ID → verständliche Meldung
    await post('hr_save', { hyperate_id: 'unknown' });
    for (let i = 0; i < 100 && !/unbekannt/.test(app.heart.error); i++) { await app.heart.refresh(); await U.sleep(20); }
    assert.match(app.heart.error, /Device-ID unbekannt/);
    await post('hr_save', { source: 'off' }); await U.sleep(50);
    // Limit je IP
    const ctls = [1, 2, 3].map(() => new AbortController());
    const rs = await Promise.all(ctls.map(c => realFetch(RB + '/hr/limit1', { signal: c.signal })));
    const over = await realFetch(RB + '/hr/limit1');
    assert.ok(rs.every(r => r.status === 200), 'drei erlaubt');
    assert.strictEqual(over.status, 429);
    ctls.forEach(c => c.abort());
    global.fetch = realFetch;
    app.heart.stop(); app.tools.stop();
    relay.server.closeAllConnections(); relay.server.close(); wss.close();
    for (const k of ['HYPERATE_WS', 'HYPERATE_API_KEY', 'RELAY_PER_IP', 'RELAY_NO_AUTOSTART', 'NEXUS_HYPERATE_RELAY']) delete process.env[k];
});

test('4.3: Panik-Knopf steuert Wallpaper Engine (Profil/Pause/Ton), Entwarnung holt alles zurück', async () => {
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const OWNER = 'usr_' + 'f'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-43-')) } });
    app.game.osc.stopListen(); app.game.osc.send = async () => {};
    app.vrc.account = () => ({ vrc_id: OWNER, me: {}, display_name: 'X' });
    grant18(app);
    const fake = path.join(os.tmpdir(), 'nx-43-wallpaper64.exe'); fs.writeFileSync(fake, '');
    const calls = [];
    app.nsfw.we().exec = async (exe, args) => { calls.push([path.basename(exe), ...args]); };
    const post = (act, d) => app.post(Object.assign({ act }, d || {}), {});
    await assert.rejects(post('nsfw_cfg', { panic_we_path: 'C:\\evil.bat' }), /wallpaper64/);
    await post('nsfw_cfg', { panic_avatar: '0', panic_chat: '0', panic_toys: '0', panic_private: '1', panic_we: 'profile', panic_we_profile: 'Brav"; rm', panic_we_back: 'Normal', panic_we_path: fake });
    let r = await post('nsfw_panic');
    assert.deepStrictEqual(calls.pop(), ['nx-43-wallpaper64.exe', '-control', 'applyProfile', '-profile', 'Brav; rm'], 'Profil, Anführungszeichen entfernt, ein Argument');
    assert.ok(/Wallpaper-Profil/.test(r.msg) && r.private);
    r = await post('nsfw_allclear');
    assert.deepStrictEqual(calls.pop(), ['nx-43-wallpaper64.exe', '-control', 'applyProfile', '-profile', 'Normal']);
    assert.ok(!r.private && /Entwarnung/.test(r.msg));
    await post('nsfw_cfg', { panic_we: 'pause' }); await post('nsfw_panic'); assert.deepStrictEqual(calls.pop().slice(1), ['-control', 'pause']);
    await post('nsfw_allclear'); assert.deepStrictEqual(calls.pop().slice(1), ['-control', 'play']);
    await post('nsfw_cfg', { panic_we: 'mute' }); await post('nsfw_panic'); assert.deepStrictEqual(calls.pop().slice(1), ['-control', 'mute']);
    // nicht gefunden → Panik läuft trotzdem durch, mit Hinweis
    await post('nsfw_cfg', { panic_we_path: path.join(os.tmpdir(), 'gibtsnicht', 'wallpaper64.exe') });
    r = await post('nsfw_panic');
    assert.ok(r.ok && /Wallpaper Engine nicht gefunden/.test(r.msg));
    await post('nsfw_cfg', { panic_we: 'off' }); const n = calls.length; await post('nsfw_panic'); assert.strictEqual(calls.length, n, 'aus = nichts');
    delete process.env.NEXUS_OWNER_HASH; fs.unlinkSync(fake);
    app.tools.stop(); if (app.toys) app.toys.stop();
});

test('4.4: Plugin-Marktplatz – signierter Katalog, Schlüssel merken, Prüfsumme, Rechte-Dialog, Updates; Server-Adressen zentral', async () => {
    const crypto = require('crypto');
    const { writeZip } = require('../backend/nxp');
    const servers = require('../backend/servers');
    servers._active.nexus = servers.LISTS.nexus.length - 1; servers._active.hyperate = servers.LISTS.hyperate.length - 1;
    assert.strictEqual(servers.nexus(), 'https://privat.sylvanclub.eu', 'bis zur Bestätigung die bewährte Adresse');
    assert.strictEqual(servers.hyperate(), 'https://hr.sylvanclub.eu');
    // neue Domain zeigt nur die Plesk-Standardseite (nexus.php 404) → alte bleibt
    const okJ = u => ({ status: 200, json: async () => (u.includes('/health') ? { ok: true, service: 'vrc-nexus-hyperate-relay' } : { index: '{}', sig: 'x', key: 'k' }) });
    await servers.check(async u => (u.startsWith('https://ghostnode-labs.dev') ? { status: 200, redirected: true, json: async () => null } : u.includes('hr.ghostnode') ? { status: 0 } : okJ(u)));
    assert.strictEqual(servers.nexus(), 'https://privat.sylvanclub.eu', 'Rückfall auf die alte Adresse');
    assert.strictEqual(servers.hyperate(), 'https://hr.sylvanclub.eu');
    await servers.check(async u => ({ status: 200, json: async () => ({ html: true }) }));
    assert.strictEqual(servers.nexus(), 'https://privat.sylvanclub.eu', 'Antwort ohne Katalog (z. B. Standardseite) zählt nicht');
    await servers.check(async u => okJ(u));
    assert.strictEqual(servers.nexus(), 'https://ghostnode-labs.dev', 'neue Adresse hat Vorrang, sobald sie läuft');
    assert.strictEqual(servers.hyperate(), 'https://hr.ghostnode-labs.dev');
    await servers.check(async () => { throw new Error('offline'); });
    assert.strictEqual(servers.nexus(), 'https://ghostnode-labs.dev', 'offline: Wahl bleibt');
    servers._active.nexus = 1; servers._active.hyperate = 1;
    // nachgestellter Marktplatz
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const rawPub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64');
    const pkg = writeZip({ 'plugin.json': JSON.stringify({ format: 1, id: 'hello-chat', name: 'Hello Chat', version: '1.1.0', permissions: ['chatbox'] }), 'main.js': 'nexus.on("start",()=>{})' });
    const B = 'https://market.test';
    let entry = { id: 'hello-chat', name: 'Hello Chat', version: '1.1.0', author: 'T', description: 'Hallo', icon: '👋', permissions: ['chatbox'], size: pkg.length,
        sha256: crypto.createHash('sha256').update(pkg).digest('hex'), url: B + '/market.php?dl=hello-chat&v=1.1.0', nexus: '>=4.0.0', downloads: 3 };
    let keyPair = [publicKey, privateKey, rawPub], body = pkg;
    const sign = () => { const index = JSON.stringify({ format: 1, generated: 1, plugins: [entry] }); return { index, sig: crypto.sign(null, Buffer.from(index), keyPair[1]).toString('base64'), key: keyPair[2] }; };
    const fake = async u => u.endsWith('api=index') ? { ok: true, json: async () => sign() } : { ok: true, status: 200, arrayBuffer: async () => body };
    process.env.NEXUS_MARKET_BASE = B;
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-44-')) } });
    app.game.osc.stopListen();
    if (!app.plugins) { const { Plugins } = require('../backend/plugins'); app.plugins = new Plugins(app); }
    const pl = app.plugins; pl.mk().fetch = fake;
    let r = await pl.action('plug_market', {});
    assert.strictEqual(r.items[0].id, 'hello-chat'); assert.ok(r.items[0].fits && !r.items[0].installed);
    assert.strictEqual(db.setting('market_key', ''), rawPub, 'Schlüssel beim ersten Mal gemerkt');
    const chk = await pl.action('plug_market_get', { id: 'hello-chat' });
    assert.ok(chk.token && chk.market && chk.perms.some(p => p.id === 'chatbox'), 'Rechte-Dialog wie bei .nxp');
    // manipuliertes Paket
    body = Buffer.concat([pkg, Buffer.from('x')]);
    await assert.rejects(pl.action('plug_market_get', { id: 'hello-chat' }), /Größe|Prüfsumme/);
    body = Buffer.from(pkg); body[body.length - 30] ^= 1;
    await assert.rejects(pl.action('plug_market_get', { id: 'hello-chat' }), /Prüfsumme/);
    body = pkg;
    // fremde Download-Adresse
    entry.url = 'https://evil.test/x.nxp'; pl.mk().index = null;
    await assert.rejects(pl.action('plug_market_get', { id: 'hello-chat' }), /nicht erlaubt/);
    entry.url = B + '/market.php?dl=hello-chat&v=1.1.0';
    // Signatur kaputt
    const realSign = sign; let broken = true;
    pl.mk().fetch = async u => u.endsWith('api=index') ? { ok: true, json: async () => { const j = realSign(); if (broken) j.index = j.index.replace('Hallo', 'HALLO'); return j; } } : fake(u);
    await assert.rejects(pl.action('plug_market', { refresh: '1' }), /Signatur ungültig/);
    broken = false; pl.mk().fetch = fake;
    // Schlüsselwechsel → abgelehnt, bis „neu lernen“
    const kp2 = crypto.generateKeyPairSync('ed25519');
    keyPair = [kp2.publicKey, kp2.privateKey, kp2.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64')];
    await assert.rejects(pl.action('plug_market', { refresh: '1' }), /Signaturschlüssel hat sich geändert/);
    await pl.action('plug_market_relearn', {});
    r = await pl.action('plug_market', { refresh: '1' }); assert.strictEqual(r.items.length, 1);
    // zu neue Mindestversion
    entry.nexus = '>=99.0.0'; pl.mk().index = null;
    r = await pl.action('plug_market', {}); assert.ok(!r.items[0].fits);
    await assert.rejects(pl.action('plug_market_get', { id: 'hello-chat' }), /braucht VRC Nexus/);
    // Update-Erkennung
    entry.nexus = ''; pl.mk().index = null;
    pl.manifest = id => (id === 'hello-chat' ? { version: '1.0.0' } : null);
    r = await pl.action('plug_market', {}); assert.ok(r.items[0].update && r.updates === 1);
    delete process.env.NEXUS_MARKET_BASE;
    app.tools.stop();
});



test('5.0: Avatar-Presets – speichern (ohne VRChat-eigene/intime/unbekannte), laden typrichtig, Makro „preset“, Export/Import, Grenzen', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-50p-')) } });
    app.game.osc.stopListen();
    const sent = []; app.game.osc.sendParam = async (n, v, t) => { sent.push([n, v, t]); };
    const A = 'avtr_' + 'c'.repeat(8) + '-1111-2222-3333-444444444444';
    let params = [];
    app.params.list = () => ({ current: A, avatar: { id: A, name: 'Fuchs' }, live: true, params });
    params = [{ name: 'Outfit', type: 'int', input: true, value: 2 }, { name: 'Hue', type: 'float', input: true, value: 0.25 }, { name: 'Ears', type: 'bool', input: true, value: true },
        { name: 'Unbekannt', type: 'int', input: true, value: null }, { name: 'Viseme', type: 'int', input: true, value: 3, builtin: true }, { name: 'OGB/Enabled', type: 'bool', input: true, value: true },
        { name: 'NurAusgabe', type: 'float', input: false, value: 1 }];
    const post = (act, d) => app.post(Object.assign({ act }, d || {}), {});
    let r = await post('preset_list'); assert.strictEqual(r.savable, 3);
    await assert.rejects(post('preset_save', { name: ' ' }), /Namen/);
    r = await post('preset_save', { name: 'Party' });
    assert.ok(/3 Werte/.test(r.msg) && r.presets[0].name === 'Party');
    assert.deepStrictEqual(Object.keys(app.presets.all()[A][0].values).sort(), ['Ears', 'Hue', 'Outfit']);
    // Avatar ändert Werte → Preset laden sendet nur Abweichungen, mit Typ
    app.game.osc.params = { Outfit: 0, Hue: 0.25, Ears: false };
    r = await post('preset_apply', { name: 'party' });
    assert.deepStrictEqual(sent.sort(), [['Ears', true, 'bool'], ['Outfit', 2, 'int']]);
    // Makro
    sent.length = 0; app.game.osc.params = { Outfit: 1 };
    await app.macros.run('preset Party');
    for (let i = 0; i < 20 && !sent.length; i++) await U.sleep(10);
    assert.ok(sent.some(x => x[0] === 'Outfit' && x[1] === 2), 'Makro-Schritt preset');
    await assert.rejects(post('preset_apply', { name: 'Gibtsnicht' }), /gibt es für diesen Avatar nicht/);
    // gleicher Name überschreibt, Export/Import ohne intime Parameter
    r = await post('preset_save', { name: 'PARTY' }); assert.strictEqual(r.presets.length, 1);
    const ex = await post('preset_export');
    ex.presets[0].values['OGB/Socket/X/DepthOthers'] = { v: 1, t: 'float' }; ex.presets[0].values.Bad = { v: 'x', t: 'float' };
    r = await post('preset_import', { json: JSON.stringify(ex) });
    assert.ok(/1 Preset/.test(r.msg) && r.presets.length === 2);
    assert.ok(!('OGB/Socket/X/DepthOthers' in app.presets.all()[A][1].values) && !('Bad' in app.presets.all()[A][1].values));
    await assert.rejects(post('preset_import', { json: '{kaputt' }), /JSON/);
    r = await post('preset_delete', { id: r.presets[1].id }); assert.strictEqual(r.presets.length, 1);
    // ohne Avatar
    app.params.list = () => ({ current: '', avatar: null, params: [] });
    await assert.rejects(post('preset_save', { name: 'x' }), /Kein getragener Avatar/);
    app.tools.stop();
});

test('5.0: Komfort – Schlafmodus (Status, Chatbox, Spielzeug, Parameter, Wecker), Pausen-Hinweis, Puls-Warnung mit Abklingzeit', async () => {
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-50c-')) } });
    app.game.osc.stopListen(); app.comfort.stop();
    const st = [], chat = [], par = [], alerts = []; let stopped = 0;
    app.tools.setStatus = async (s, d) => { st.push([s, d]); };
    app.game.osc.chatbox = async t => { chat.push(t); }; app.game.osc.sendParam = async (n, v) => { par.push([n, v]); };
    app.tools.alert = (a, b) => alerts.push(a + ' ' + b);
    if (app.toys) app.toys.stopAll = async () => { stopped++; };
    const post = (act, d) => app.post(Object.assign({ act }, d || {}), {});
    await assert.rejects(post('comfort_cfg', { sleep_param: 'bad name!' }), /Parameter/);
    await post('comfort_cfg', { sleep_param: 'Sleep', sleep_status: 'busy', break_on: '1', break_min: '30', hr_on: '1', hr_high: '120', hr_secs: '10', hr_cooldown: '5' });
    let r = await post('comfort_sleep', { on: '1', wake: '60' });
    assert.ok(r.sleeping && /Wecker in 60 min/.test(r.msg));
    assert.deepStrictEqual(st[0], ['busy', 'Schläft 💤']); assert.ok(chat[0].includes('schläft') && app.game.suppressRotator && par[0][0] === 'Sleep' && par[0][1] === true);
    if (app.toys) assert.strictEqual(stopped, 1);
    // Wecker
    await app.comfort.tick(Date.now() + 61 * 60000);
    assert.ok(!app.comfort.sleep && alerts.some(a => /Guten Morgen/.test(a)) && st.pop()[0] === 'active' && par.pop()[1] === false && !app.game.suppressRotator);
    // Pausen-Hinweis nach 30 min Spielzeit
    app.game.state.running = true; const t0 = Date.now();
    await app.comfort.tick(t0); alerts.length = 0;
    await app.comfort.tick(t0 + 29 * 60000); assert.strictEqual(alerts.length, 0);
    await app.comfort.tick(t0 + 31 * 60000); assert.ok(/Pause/.test(alerts[0]));
    await app.comfort.tick(t0 + 32 * 60000); assert.strictEqual(alerts.length, 1, 'nicht sofort wieder');
    // Puls-Warnung erst nach 10 s, dann 5 min Ruhe
    if (app.heart) {
        alerts.length = 0; app.heart.push(130, 'osc');
        await app.comfort.tick(t0 + 40 * 60000); assert.strictEqual(alerts.length, 0);
        app.heart.push(131, 'osc'); await app.comfort.tick(t0 + 40 * 60000 + 11000); assert.ok(/Puls hoch.*131/.test(alerts[0]));
        app.heart.push(132, 'osc'); await app.comfort.tick(t0 + 40 * 60000 + 60000); assert.strictEqual(alerts.length, 1, 'Abklingzeit');
    }
    app.tools.stop();
});

test('5.0: OBS – obs-websocket 5 (Passwort-Challenge), Szenen-Liste, Szene je Welt, Panik-Szene, Textquelle, falsches Passwort', async () => {
    const { WebSocketServer } = require('ws');
    const { sha } = require('../backend/obs');
    const PW = 'geheim', salt = 'c2FsdA==', challenge = 'Y2hhbA==';
    const wss = new WebSocketServer({ port: 0 }); await new Promise(r => wss.on('listening', r));
    const reqs = [];
    wss.on('connection', ws => {
        ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1, authentication: { salt, challenge } } }));
        ws.on('message', m => { const j = JSON.parse(String(m));
            if (j.op === 1) { if (j.d.authentication !== sha(sha(PW + salt) + challenge)) return ws.close(4009); return ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })); }
            if (j.op === 6) { reqs.push([j.d.requestType, j.d.requestData]);
                const data = j.d.requestType === 'GetSceneList' ? { scenes: [{ sceneName: 'Panik' }, { sceneName: 'Club' }, { sceneName: 'Chill' }] } : {};
                ws.send(JSON.stringify({ op: 7, d: { requestType: j.d.requestType, requestId: j.d.requestId, requestStatus: { result: true, code: 100 }, responseData: data } })); } });
    });
    const { NexusApp } = require('../backend/app');
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => 'enc:' + s, decrypt: s => s.replace(/^enc:/, '') }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-50o-')) } });
    app.game.osc.stopListen();
    const post = (act, d) => app.post(Object.assign({ act }, d || {}), {});
    // falsches Passwort
    await post('obs_cfg', { port: String(wss.address().port), password: 'falsch' });
    let r = await post('obs_cfg', { on: '1' }); for (let i = 0; i < 50 && !/Passwort falsch/.test(app.obs.status().error); i++) await U.sleep(20);
    assert.match(app.obs.status().error, /Passwort falsch/);
    assert.ok(db.setting('obs_pw', '').startsWith('enc:'), 'Passwort verschlüsselt');
    await post('obs_cfg', { password: PW });
    for (let i = 0; i < 100 && !app.obs.status().connected; i++) await U.sleep(20);
    r = await post('obs_get');
    assert.ok(r.connected && r.scenes.join() === 'Chill,Club,Panik' && !r.error);
    await post('obs_cfg', { rules: JSON.stringify([{ match: 'club', scene: 'Club' }, { match: '', scene: 'x' }]), panic_scene: 'Panik', text_source: 'NexusText', text_tpl: 'Puls {puls} · {welt}' });
    assert.strictEqual(app.obs.cfg().rules.length, 1);
    reqs.length = 0;
    app.obs.onGameEvent({ kind: 'world_join', world_name: 'The Black Cat Club' }); await U.sleep(80);
    assert.deepStrictEqual(reqs.pop(), ['SetCurrentProgramScene', { sceneName: 'Club' }]);
    app.obs.onGameEvent({ kind: 'world_join', world_name: 'Home' }); await U.sleep(50); assert.strictEqual(reqs.length, 0, 'keine Regel → keine Szene');
    assert.strictEqual(await app.obs.onPanic(), 'OBS-Szene „Panik“');
    reqs.length = 0; await post('obs_text');
    assert.strictEqual(reqs[0][0], 'SetInputSettings'); assert.strictEqual(reqs[0][1].inputName, 'NexusText'); assert.match(reqs[0][1].inputSettings.text, /^Puls /);
    app.nsfw.private = true; reqs.length = 0; await app.obs.updateText(true); assert.strictEqual(reqs.length, 0, 'Privat-Modus sendet nichts'); app.nsfw.private = false;
    await post('obs_cfg', { on: '0' }); assert.ok(!app.obs.status().connected);
    app.obs.stop(); app.tools.stop(); wss.close();
});

(async () => {
    let ok = 0;
    for (const [name, fn] of tests) {
        try { await fn(); ok++; console.log('✔', name); }
        catch (e) { console.log('✖', name, '\n  ', e.message); process.exitCode = 1; }
    }
    console.log(ok + '/' + tests.length + ' Tests bestanden');
    process.exit(process.exitCode || 0);
})();

test('NSFW 3.0: Funscript (Vibration/Stroker), Spiele, Aufnahme & Wiedergabe, Profile je Avatar, Welt-Brücke, Musik, Safeword & Zeitlimit', async () => {
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const OWNER = 'usr_' + 'e'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-n3-')) } });
    app.game.osc.stopListen();
    app.vrc.account = () => ({ vrc_id: OWNER, me: {}, display_name: 'X' });
    grant18(app);
    const t = app.toys, p3 = t.play3, sent = [];
    t.ws = { readyState: 1, send() {} };
    t.req = async m => { sent.push(m); return {}; };
    t.addDevice({ DeviceIndex: 0, DeviceName: 'Vib', DeviceMessageTimingGap: 0, DeviceMessages: { ScalarCmd: [{ StepCount: 20, ActuatorType: 'Vibrate' }], LinearCmd: [{ StepCount: 100 }] } });
    await U.sleep(50);
    const d = t.devices.get(0), post = (act, x) => app.post(Object.assign({ act }, x || {}), {});
    // Funscript
    await assert.rejects(post('toys3_fun_load', { name: 'x', json: '{"actions":[{"at":0,"pos":0}]}' }), /zu wenige/);
    const fs1 = JSON.stringify({ actions: [{ at: 0, pos: 0 }, { at: 250, pos: 100 }, { at: 1250, pos: 0 }, { at: 1500, pos: 0 }] });
    let r = await post('toys3_fun_load', { name: 'Demo', json: fs1 });
    assert.ok(r.fun.loaded && r.fun.name === 'Demo');
    p3.funStart(0, false); const s0 = p3.fun.start;
    assert.strictEqual(p3.funLevel(s0 + 100), 1, 'volle Länge in 0,25 s = 100 %');
    assert.strictEqual(p3.funLevel(s0 + 600), 0.25, '100 in 1 s = 25 %');
    const lin = p3.funLinear(s0 + 100); assert.strictEqual(lin.position, 1); assert.strictEqual(lin.duration, 150);
    assert.strictEqual(p3.funLevel(s0 + 2000), 0, 'ohne Wiederholung endet das Funscript'); assert.strictEqual(p3.fun, null);
    p3.funStart(0, true); assert.strictEqual(p3.funLevel(p3.fun.start + 1600), 1, 'Wiederholung beginnt von vorn');
    p3.funStop();
    // Spiele
    let g = p3.startGame('dice', { rounds: 2 }); assert.strictEqual(g.rounds, 2);
    const lv1 = p3.gameLevel(d, Date.now()); assert.ok(lv1 >= 0.15 && lv1 <= 1 && p3.game.rolls.length === 1);
    p3.game.next = 0; p3.gameLevel(d, Date.now()); p3.game.next = 0; assert.strictEqual(p3.gameLevel(d, Date.now()), 0); assert.strictEqual(p3.game, null, 'nach allen Runden vorbei');
    assert.strictEqual(p3.lastGame.rolls.length, 2);
    p3.startGame('edge', { rounds: 2, ramp: 20 });
    p3.game.start = Date.now() - 20000;
    r = await post('toys3_hold'); assert.match(r.msg, /100 %/); assert.strictEqual(r.game.score, 100);
    await assert.rejects(post('toys3_hold'), /keine Edging-Runde/, 'Pause nach dem Halten');
    p3.game.pauseUntil = 0; t.lust.v = 0.98; assert.strictEqual(p3.gameLevel(d, Date.now()), 0); assert.ok(p3.game.log.pop().lost, 'zu weit → Runde verloren'); t.lust.v = 0;
    await post('toys3_game_stop'); assert.strictEqual(p3.game, null);
    assert.throws(() => p3.startGame('poker'), /Unbekanntes Spiel/);
    // Aufnahme & Wiedergabe
    p3.recStart(); for (let i = 0; i < 20; i++) p3.sample({ Vib: i < 10 ? 0.5 : 1 });
    r = await post('toys3_rec_stop', { name: 'Test' }); assert.strictEqual(r.rec.list.length, 1); assert.strictEqual(r.rec.list[0].secs, 2);
    p3.recStart(); assert.throws(() => p3.recStop(''), /zu kurz/);
    r = await post('toys3_play', { id: r.rec.list[0].id });
    assert.ok(Math.abs(p3.playLevel(d, p3.play.start + 50) - 0.5) < 0.01); assert.strictEqual(p3.playLevel(d, p3.play.start + 1500), 1);
    assert.strictEqual(p3.playLevel(d, p3.play.start + 5000), 0); assert.strictEqual(p3.play, null, 'Wiedergabe endet');
    await post('toys3_rec_delete', { id: p3.recordings()[0].id }); assert.strictEqual(p3.recordings().length, 0);
    // Profile je Avatar
    const AV = 'avtr_' + '1'.repeat(8) + '-2222-3333-4444-555555555555';
    await assert.rejects(post('toys3_profile_save', { avatar: 'kaputt' }), /Kein getragener Avatar/);
    t.saveCfg({ links_on: '1' }); await post('toys3_profile_save', { avatar: AV });
    t.saveCfg({ links_on: '0' }); app.tools.alert = () => {};
    assert.strictEqual(p3.onAvatar(AV), true); assert.strictEqual(t.cfg().links_on, true, 'Profil beim Avatarwechsel geladen');
    assert.strictEqual(p3.onAvatar(AV), false, 'gleicher Avatar → nichts');
    // Welt-Brücke
    assert.strictEqual(t.onWorldEvent({ ts: Date.now() / 1000, detail: 'pulse 0.9 2' }), false, 'ohne Freigabe nichts');
    await post('toys3_cfg', { world_bridge: '1', world_max: '50' });
    assert.strictEqual(t.onWorldEvent({ ts: Date.now() / 1000 - 60, detail: 'pulse 0.9 2' }), false, 'alte Log-Zeilen zählen nicht');
    assert.strictEqual(t.onWorldEvent({ ts: Date.now() / 1000, detail: 'pulse 0.9 2' }), true);
    assert.strictEqual(p3.level(d), 0.5, 'Obergrenze der Welt');
    t.onWorldEvent({ ts: Date.now() / 1000, detail: 'stop' }); assert.strictEqual(p3.level(d), null);
    const ev = new LogParser().feed('2026.11.27 13:00:00 Log        -  [NexusToy] pulse 0.6 3\r');
    assert.strictEqual(ev[0].kind, 'nexus_toy'); assert.strictEqual(ev[0].detail, 'pulse 0.6 3');
    // Musik
    await post('toys3_cfg', { music_on: '1', music_gain: '200' }); await post('toys3_music', { lv: '0.3' });
    assert.ok(Math.abs(p3.level(d) - 0.6) < 1e-9, 'Lautstärke × Verstärkung');
    // stopAll räumt alles ab
    p3.funStart(0, true); await t.stopAll();
    assert.ok(!p3.fun && !p3.game && !p3.play && !p3.world && !p3.musicActive());
    // Fernsteuerung: Safeword und Zeitlimit
    await post('tremote_cfg', { recv_on: '1', limit_min: '5' });
    assert.strictEqual(app.toyremote.cfg().limit_min, 5);
    app.toyremote.recvSince = Date.now() - 6 * 60000; app.toyremote.tick();
    assert.strictEqual(app.toyremote.cfg().recv_on, false, 'Zeitlimit schaltet Empfang aus');
    await post('tremote_cfg', { recv_on: '1' }); const nStop = sent.filter(m => m.StopAllDevices).length;
    r = await post('tremote_safeword'); assert.match(r.msg, /Safeword/);
    assert.strictEqual(app.toyremote.cfg().recv_on, false); assert.ok(sent.filter(m => m.StopAllDevices).length > nStop, 'alles gestoppt');
    app.tools.stop(); app.toyremote.stop && app.toyremote.stop();
});

test('NSFW 3.1: Sammlung – verschlüsselt, Listen/Tags/Bewertung, Vorschläge aus 18+-Tags, Besuche, Privat-Modus, Zufall, Tragen, 18+-Profil, Export/Import', async () => {
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const OWNER = 'usr_' + 'f'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => 'enc:' + Buffer.from(s).toString('base64'), decrypt: s => Buffer.from(s.slice(4), 'base64').toString() }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-n31-')) } });
    app.game.osc.stopListen();
    app.vrc.account = () => ({ vrc_id: OWNER, me: {}, display_name: 'X' });
    const W1 = 'wrld_' + '1'.repeat(8) + '-2222-3333-4444-555555555555', W2 = 'wrld_' + '2'.repeat(8) + '-2222-3333-4444-555555555555', W3 = 'wrld_' + '3'.repeat(8) + '-2222-3333-4444-555555555555';
    const A1 = 'avtr_' + 'a'.repeat(8) + '-2222-3333-4444-555555555555';
    const calls = [];
    app.tools.call = async (m, p, q, b) => {
        calls.push([m, p, b]);
        if (p.startsWith('/worlds/')) { const id = decodeURIComponent(p.slice(8)); return { id, name: id === W2 ? 'Club After Dark' : id === W3 ? 'Ruhige Wiese' : 'Lounge', authorName: 'Ersteller', thumbnailImageUrl: 'https://img.example/' + id.slice(5, 9) + '.png', tags: id === W3 ? ['system_approved'] : ['content_sex'] }; }
        if (p.startsWith('/avatars/') && m === 'GET') return { id: A1, name: 'Spicy', authorName: 'Ich', thumbnailImageUrl: 'https://img.example/a.png', tags: ['content_adult'] };
        return {};
    };
    const post = (act, x) => app.post(Object.assign({ act }, x || {}), {});
    await assert.rejects(post('nsfwc_list'), /Nicht freigeschaltet/, 'ohne 18+-Freigabe gesperrt');
    grant18(app);
    let r = await post('nsfwc_add', { kind: 'world', id: W1.toUpperCase().replace('WRLD', 'wrld') });
    assert.strictEqual(r.item.name, 'Lounge'); assert.strictEqual(r.item.image, 'https://img.example/1111.png'); assert.strictEqual(r.counts.world, 1);
    const raw = db.setting('nsfw_collection', '');
    assert.ok(raw.startsWith('enc:') && !raw.includes('Lounge'), 'verschlüsselt gespeichert');
    await assert.rejects(post('nsfwc_add', { kind: 'world', id: 'wrld_kaputt' }), /Ungültige Welt-ID/);
    r = await post('nsfwc_update', { kind: 'world', id: W1, tags: '#Club, chill , Club, ung ültig!', rating: '9', note: 'Freitags', list: 'Lieblinge' });
    assert.deepStrictEqual(r.item.tags, ['club', 'chill']); assert.strictEqual(r.item.rating, 5); assert.ok(r.lists.world.includes('Lieblinge'));
    assert.strictEqual((await post('nsfwc_list', { kind: 'world', tag: 'club' })).items.length, 1);
    assert.strictEqual((await post('nsfwc_list', { kind: 'world', q: 'freitag' })).items.length, 1, 'Suche in Notizen');
    assert.strictEqual((await post('nsfwc_list', { kind: 'world', tag: 'nix' })).items.length, 0);
    // Vorschläge: nur Welten/Avatare mit 18+-Inhalts-Tags, Besuche zählen
    await app.nsfwcol.onGameEvent({ kind: 'world_join', world_id: W2, world_name: 'Club After Dark' });
    await app.nsfwcol.onGameEvent({ kind: 'world_join', world_id: W3, world_name: 'Ruhige Wiese' });
    await app.nsfwcol.onGameEvent({ kind: 'world_join', world_id: W1, world_name: 'Lounge' });
    r = await post('nsfwc_list', {});
    assert.deepStrictEqual(r.suggest.map(s => s.id), [W2], 'nur die 18+-Welt wird vorgeschlagen');
    assert.strictEqual(r.items.find(x => x.id === W1).count, 1, 'Besuch gezählt');
    await app.nsfwcol.onAvatar(A1);
    r = await post('nsfwc_list', { kind: 'avatar' }); assert.strictEqual(r.suggest[0].id, A1);
    r = await post('nsfwc_add', { kind: 'avatar', id: A1 }); assert.strictEqual(r.suggest.length, 0, 'übernommen → kein Vorschlag mehr');
    await post('nsfwc_dismiss', { id: W2 }); app.nsfwcol.checked.clear();
    await app.nsfwcol.onGameEvent({ kind: 'world_join', world_id: W2 });
    assert.strictEqual((await post('nsfwc_list', {})).suggest.length, 0, 'abgelehnt bleibt abgelehnt');
    // Privat-Modus verbirgt, bewusst einblenden geht
    app.nsfw.private = true;
    r = await post('nsfwc_list', { kind: 'world' }); assert.ok(r.hidden && !r.items.length);
    await assert.rejects(post('nsfwc_random', { kind: 'world' }), /verborgen/);
    r = await post('nsfwc_reveal', { on: '1', kind: 'world' }); assert.ok(!r.hidden && r.items.length === 1);
    await post('nsfwc_reveal', { on: '0' }); app.nsfw.private = false;
    // Zufall, Tragen, Beitreten
    assert.strictEqual((await post('nsfwc_random', { kind: 'world' })).item.id, W1);
    await assert.rejects(post('nsfwc_random', { kind: 'world', tag: 'nix' }), /Nichts passt/);
    calls.length = 0; await post('nsfwc_wear', { id: A1 });
    assert.deepStrictEqual(calls[0].slice(0, 2), ['PUT', '/avatars/' + A1 + '/select']);
    assert.strictEqual(app.nsfwcol.find('avatar', A1).count, 1);
    // Listen: umbenennen, löschen (Einträge wandern)
    await post('nsfwc_list_op', { kind: 'world', op: 'rename', name: 'Lieblinge', to: 'Top' });
    assert.strictEqual(app.nsfwcol.find('world', W1).list, 'Top');
    await post('nsfwc_list_op', { kind: 'world', op: 'delete', name: 'Top' });
    assert.strictEqual(app.nsfwcol.find('world', W1).list, 'Sammlung');
    await assert.rejects(post('nsfwc_list_op', { kind: 'world', op: 'delete', name: 'Sammlung' }), /letzte Liste/);
    // 18+-Profil: nur markierte Einträge, nur ID/Name/Notiz
    await post('nsfwc_update', { kind: 'avatar', id: A1, profile: '1', note: 'mein Liebling' });
    let sent = null; app.comm.call = async (a, b) => { sent = [a, b]; return { avatars: b.avatars, worlds: b.worlds }; };
    r = await post('nsfwc_profile');
    assert.strictEqual(sent[0], 'profile_items'); assert.deepStrictEqual(sent[1].avatars, [{ id: A1, name: 'Spicy', note: 'mein Liebling' }]); assert.deepStrictEqual(sent[1].worlds, []);
    assert.match(r.msg, /1 Avatare, 0 Welten/);
    // Export/Import
    const ex = await post('nsfwc_export'); assert.strictEqual(ex.items.length, 2); assert.ok(!('count' in ex.items[0]), 'keine Nutzungsdaten im Export');
    await post('nsfwc_remove', { kind: 'world', id: W1 });
    r = await post('nsfwc_import', { json: JSON.stringify(ex) }); assert.match(r.msg, /^1 Einträge/);
    assert.deepStrictEqual(app.nsfwcol.find('world', W1).tags, ['club', 'chill']);
    await assert.rejects(post('nsfwc_import', { json: '{"x":1}' }), /Keine gültige/);
    // neu laden aus der Datenbank
    app.nsfwcol.cache = null; assert.strictEqual(app.nsfwcol.load().items.length, 2);
    app.tools.stop();
});

test('5.2: VRC Nexus Watch – Suche per UDP, Kopplung mit Code (Fehlversuche), Puls von der Uhr, Status, Aktionen, Entfernen', async () => {
    const { NexusApp } = require('../backend/app');
    const { hashId } = require('../backend/nsfw');
    const dgram = require('dgram');
    const OWNER = 'usr_' + '9'.repeat(8) + '-1111-2222-3333-444444444444';
    process.env.NEXUS_OWNER_HASH = hashId(OWNER);
    const db = await openDatabase(null);
    const app = new NexusApp({ db, crypt: { encrypt: s => s, decrypt: s => s }, host: { userData: fs.mkdtempSync(path.join(os.tmpdir(), 'nx-w-')) } });
    app.game.osc.stopListen();
    app.vrc.account = () => ({ vrc_id: OWNER, me: {}, display_name: 'Luna' });
    app.tools.alert = () => {};
    app.game.osc.send = async () => {};
    const PORT = 17000 + Math.floor(Math.random() * 800);
    let r = await app.post({ act: 'watch_cfg', on: '1', port: String(PORT) }, {});
    for (let i = 0; i < 50 && !app.watch.server.listening; i++) await U.sleep(10);
    assert.ok(r.cfg.on && /^\d{6}$/.test(r.pin));
    // Suche per UDP
    const found = await new Promise(ok => {
        const s = dgram.createSocket('udp4'); const to = setTimeout(() => { s.close(); ok(null); }, 1500);
        s.on('message', m => { clearTimeout(to); s.close(); ok(JSON.parse(String(m))); });
        s.send('NXW?1', 17873, '127.0.0.1');
    });
    if (found) { assert.strictEqual(found.port, PORT); assert.strictEqual(found.name, 'Luna'); }
    const B = 'http://127.0.0.1:' + PORT;
    const call = (p, body, tok) => fetch(B + p, { method: body === undefined ? 'GET' : 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { 'X-Nexus-Watch': tok } : {}), body: body === undefined ? undefined : JSON.stringify(body) }).then(async x => ({ status: x.status, j: await x.json() }));
    assert.strictEqual((await call('/watch/state')).status, 401, 'ohne Kopplung nichts');
    assert.match((await call('/watch/pair', { pin: '000000' === r.pin ? '111111' : '000000' })).j.error, /Falscher Code/);
    const pin = app.watch.pin;
    let x = await call('/watch/pair', { pin, name: 'Galaxy Watch' });
    assert.ok(x.j.ok && /^[a-f0-9]{64}$/.test(x.j.token)); const tok = x.j.token;
    assert.notStrictEqual(app.watch.pin, pin, 'Code wechselt nach der Kopplung');
    assert.ok(!JSON.stringify(db.setting('watch_cfg', '')).includes(tok), 'Schlüssel nur als Hash gespeichert');
    assert.strictEqual(app.heart.cfg().source, 'watch', 'erste Uhr wird Puls-Quelle');
    // 5.2.1: eingestellte Quelle liefert nichts (z. B. HypeRate nicht erreichbar) → Uhr übernimmt automatisch
    app.heart.save({ source: 'hyperate' }); app.heart.error = 'HypeRate nicht erreichbar';
    // Puls
    x = await call('/watch/heart', { bpm: 88 }, tok); assert.ok(x.j.ok);
    assert.strictEqual(x.j.switched, 'hyperate'); assert.strictEqual(app.heart.cfg().source, 'watch'); assert.strictEqual(app.heart.error, '', 'Fehlermeldung weg');
    assert.strictEqual(app.heart.bpm, 88); assert.strictEqual(app.heart.from, 'watch');
    assert.strictEqual((await call('/watch/heart', { bpm: 400 }, tok)).j.ok, false, 'unmögliche Werte nicht übernehmen');
    x = await call('/watch/state', undefined, tok);
    assert.strictEqual(x.j.bpm, 88); assert.strictEqual(x.j.nsfw, false); assert.strictEqual(x.j.toys, null, 'ohne 18+ keine Spielzeug-Daten');
    // Aktionen: 18+ nur mit Freigabe
    x = await call('/watch/action', { a: 'consent', light: 'red' }, tok); assert.strictEqual(x.status, 400); assert.match(x.j.error, /Nicht freigeschaltet/);
    x = await call('/watch/state', undefined, tok); assert.match(x.j.nsfw_reason, /Nexus-Konto|Verified|NSFW/, 'Uhr sagt, warum 🔞 fehlt');
    grant18(app);
    x = await call('/watch/action', { a: 'panic' }, tok); assert.ok(x.j.ok && /Panik/.test(x.j.msg)); assert.ok(app.nsfw.private, 'Panik schaltet Privat-Modus ein');
    x = await call('/watch/state', undefined, tok); assert.ok(x.j.nsfw && x.j.private, '🔞-Knöpfe bleiben im Privat-Modus (Panik immer erreichbar)');
    await call('/watch/action', { a: 'allclear' }, tok);
    x = await call('/watch/action', { a: 'private', on: true }, tok); assert.ok(x.j.ok && app.nsfw.private);
    x = await call('/watch/state', undefined, tok); assert.ok(x.j.private && x.j.world === '', 'Privat-Modus: keine Welt auf der Uhr');
    x = await call('/watch/action', { a: 'allclear' }, tok); assert.ok(x.j.ok && !app.nsfw.private);
    x = await call('/watch/action', { a: 'sleep', on: true }, tok); assert.ok(x.j.state.sleeping);
    await call('/watch/action', { a: 'sleep', on: false }, tok);
    assert.strictEqual((await call('/watch/action', { a: 'rm -rf' }, tok)).status, 400);
    // Fehlversuche begrenzt
    for (let i = 0; i < 5; i++) await call('/watch/pair', { pin: 'abcdef' });
    assert.match((await call('/watch/pair', { pin: app.watch.pin })).j.error, /Zu viele/);
    // Entfernen
    r = await app.post({ act: 'watch_remove', id: x.j.state ? app.watch.cfg().devices[0].id : '' }, {});
    assert.strictEqual(r.devices.length, 0);
    assert.strictEqual((await call('/watch/state', undefined, tok)).status, 401, 'entfernte Uhr ist ausgesperrt');
    await app.post({ act: 'watch_cfg', on: '0' }, {});
    assert.ok(!app.watch.server);
    app.tools.stop(); app.heart && app.heart.stop();
});
