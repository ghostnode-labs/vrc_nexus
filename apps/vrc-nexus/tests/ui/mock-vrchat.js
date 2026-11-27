'use strict';
/*
 * Kleiner VRChat-API-Mock für Oberflächen-Tests (nur Testdaten, kein echtes Konto).
 *   node tests/ui/mock-vrchat.js 8792      → http://127.0.0.1:8792/api/1
 * Anmeldung mit beliebigem Namen und Passwort „test“.
 */
const http = require('http');

const ME = 'usr_00000000-0000-4000-8000-000000000001';
const uid = n => 'usr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const WORLD = 'wrld_00000000-0000-4000-8000-000000000101';
const names = ['Luna Fox', 'Wolf Byte', 'Pixel Cat', 'Nova Star', 'Ember Fae', 'Kito Rune', 'Sable Moth', 'Juniper Owl'];
const friends = names.map((name, i) => ({
    id: uid(10 + i), displayName: name, status: ['join me', 'active', 'ask me', 'busy'][i % 4], statusDescription: i % 2 ? 'chillen 🎶' : '',
    location: i < 3 ? WORLD + ':1234~friends(' + ME + ')~region(eu)' : i < 6 ? 'offline' : 'private', platform: 'standalonewindows', last_platform: 'standalonewindows',
    tags: ['system_trust_basic', 'system_trust_known'], currentAvatarThumbnailImageUrl: '', userIcon: '', profilePicOverride: i % 3 === 0 ? 'https://api.vrchat.cloud/api/1/file/file_banner' + i + '/1/file' : '', bio: 'Testprofil', bioLinks: [],
    last_login: new Date().toISOString(), last_activity: new Date().toISOString(), date_joined: '2021-01-01', isFriend: true,
}));
// Profil-Dekorationen (3.1): Katalog-ID, Name oder URL – wie bei VRChat nicht dokumentiert, darum alle drei Fälle
Object.assign(friends[0], { iconFrame: 'invt_00000000-0000-4000-8000-0000000f0001', bannerColor: '3fe0c5' });
Object.assign(friends[1], { iconFrame: 'Neon Ring', nameplateEffect: 'invt_00000000-0000-4000-8000-0000000f0003' });
Object.assign(friends[2], { bannerColor: 'ff4fa3', bannerUrl: 'https://deco.test/banner.svg', nameplateEffect: 'invt_00000000-0000-4000-8000-0000000f0003', iconFrame: 'https://deco.test/frame.svg' });
const COSMETICS = {
    iconFrame: [{ id: 'invt_00000000-0000-4000-8000-0000000f0001', name: 'Sonnenrahmen', imageUrl: 'https://deco.test/frame.svg', metadata: {} },
        { id: 'invt_00000000-0000-4000-8000-0000000f0002', name: 'Neon Ring', imageUrl: '', metadata: { gradientStart: 'ff4fa3', gradientEnd: '3fe0c5' } }],
    nameplateEffect: [{ id: 'invt_00000000-0000-4000-8000-0000000f0003', name: 'Sunset', metadata: { gradientStart: 'ffae5c', gradientEnd: 'ff4fa3' } }],
    profileEffect: [], profileBackground: [],
};
const me = { id: ME, displayName: 'Test Nutzerin', username: 'test', status: 'active', statusDescription: 'Testdaten', currentAvatarThumbnailImageUrl: '', userIcon: '', tags: ['system_trust_veteran', 'system_trust_trusted'],
    friends: friends.map(f => f.id), onlineFriends: friends.slice(0, 3).map(f => f.id), activeFriends: [], offlineFriends: friends.slice(3).map(f => f.id), bio: '', bioLinks: [], location: 'offline', presence: {} };

/** Testzustand: POST /__mock/set {"id","bio","age"} setzt Bio und ageVerificationStatus eines Profils */
const extra = {};
function route(req, url, body) {
    let m0;
    const p = url.pathname.replace(/^\/api\/1/, '');
    if (p === '/__mock/set') { const j = JSON.parse(body || '{}'); extra[j.id] = Object.assign(extra[j.id] || {}, j); return [200, { ok: true }]; }
    if (p === '/auth/user') {
        const auth = req.headers.authorization || '';
        if (auth.startsWith('Basic ')) { const [, pw] = Buffer.from(auth.slice(6), 'base64').toString().split(':'); return pw === 'test' ? [200, me, true] : [401, { error: { message: 'Invalid Username/Email or Password' } }]; }
        return /auth=mock/.test(req.headers.cookie || '') ? [200, me] : [401, { error: { message: 'Missing Credentials' } }];
    }
    // Altersstatus des angemeldeten Kontos (wie VRChat: nur das eigene)
    if (p === '/ageVerification/status') return /auth=mock/.test(req.headers.cookie || '') ? [200, { status: (extra[ME] || {}).age || '' }] : [401, { error: { message: 'Missing Credentials' } }];
    if ((m0 = /^\/cosmetics\/index\/(\w+)$/.exec(p))) return [200, COSMETICS[m0[1]] || []];
    if (p === '/auth/user/friends') return [200, url.searchParams.get('offline') === 'true' ? friends.filter(f => f.location === 'offline') : friends.filter(f => f.location !== 'offline')];
    let m;
    if ((m = /^\/users\/(usr_[\w-]+)$/.exec(p))) {
        const u = friends.find(f => f.id === m[1]) || (m[1] === ME ? me : null);
        if (!u) return [404, { error: { message: 'Not found' } }];
        if (req.method === 'PUT') { const j = JSON.parse(body || '{}'); if (j.bio !== undefined) { u.bio = j.bio; (extra[u.id] = extra[u.id] || {}).bio = j.bio; } return [200, u]; }
        const x = extra[u.id] || {};
        return [200, Object.assign({}, u, x.bio !== undefined ? { bio: x.bio } : {}, x.age !== undefined ? { ageVerificationStatus: x.age, ageVerified: x.age === '18+' } : {})];
    }
    // Netzwerk-Testdaten (3.2.3): feste gemeinsame Freunde und Gruppen
    if ((m0 = /^\/users\/(usr_[\w-]+)\/mutuals\/friends$/.exec(p))) { const i = friends.findIndex(f => f.id === m0[1]); return [200, i < 0 ? [] : friends.filter((f, j) => j !== i && (Math.abs(i - j) <= 2 || (i + j) % 3 === 0)).map(f => ({ id: f.id, displayName: f.displayName }))]; }
    if ((m0 = /^\/users\/(usr_[\w-]+)\/groups$/.exec(p))) {
        const G = [{ groupId: 'grp_00000000-0000-4000-8000-0000000000a1', name: 'Furry Lounge', memberCount: 120 }, { groupId: 'grp_00000000-0000-4000-8000-0000000000a2', name: 'Night Club', memberCount: 80 }, { groupId: 'grp_00000000-0000-4000-8000-0000000000a3', name: 'Chill Zone', memberCount: 40 }];
        if (m0[1] === ME) return [200, G];
        const i = friends.findIndex(f => f.id === m0[1]); return [200, i < 0 ? [] : G.filter((g, j) => (i + j) % 3 !== 1)];
    }
    if (/^\/users\/[\w-]+\/groups/.test(p)) return [200, []];
    if (/^\/worlds\/wrld_/.test(p)) return [200, { id: WORLD, name: 'Testwelt', authorName: 'Mock', capacity: 32, imageUrl: '', thumbnailImageUrl: '' }];
    if (p === '/visits') return [200, 1234];
    return [200, []];
}

function start(port) {
    const srv = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            const [code, json, login] = route(req, url, body);
            const h = { 'Content-Type': 'application/json' };
            if (login) h['Set-Cookie'] = 'auth=mock; Path=/; HttpOnly';
            res.writeHead(code, h);
            res.end(JSON.stringify(json));
        });
    });
    return new Promise(r => srv.listen(port || 0, '127.0.0.1', () => r(srv)));
}

if (require.main === module) start(+(process.argv[2] || 8792)).then(s => console.log('VRChat-Mock auf http://127.0.0.1:' + s.address().port + '/api/1'));
module.exports = { start, ME, friends, WORLD };
