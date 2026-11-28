'use strict';
/*
 * Handy-Fernbedienung: kleine Webseite im Heimnetz (http://<PC-IP>:<Port>/?t=<Token>).
 * Eigener Server, eigener Schlüssel – die Stream-Deck-Schnittstelle bleibt nur auf 127.0.0.1.
 * Erlaubt nur wenige Befehle: Panik, Privat-Modus, Avatar-Paare, Grenzen-Karte, Spielzeug-Stärke/Stopp.
 */
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { str, int, UserError } = require('./util');

const ALLOWED = ['nsfw_panic', 'nsfw_panic_full', 'nsfw_private', 'nsfw_avatar', 'nsfw_boundaries', 'toys_set', 'toys_stop', 'toys_status', 'toys_surprise', 'toys_pattern', 'toys_pattern_stop', 'nsfw_consent', 'toys_consent', 'toys_edge_release', 'toys_climax', 'toys_scene_stop'];
const DEF = { on: false, port: 17870, token: '' };

class Remote {
    constructor(app) { this.app = app; this.server = null; this.port = 0; this.error = ''; this.hits = 0; }
    cfg() { let c; try { c = Object.assign({}, DEF, JSON.parse(this.app.db.setting('remote_cfg', '{}'))); } catch (e) { c = Object.assign({}, DEF); } if (!c.token) { c.token = this.newToken(); this.write(c); } return c; }
    write(c) { this.app.db.setSetting('remote_cfg', JSON.stringify(c)); }
    newToken() { return crypto.randomBytes(18).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    ips() {
        const out = [];
        for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
        return out;
    }
    status() {
        const c = this.cfg();
        return { on: c.on, running: !!this.server, port: c.port, error: this.error, urls: this.ips().map(ip => 'http://' + ip + ':' + c.port + '/?t=' + c.token), token: c.token };
    }
    apply() {
        const c = this.cfg();
        const allowed = this.app.nsfw ? this.app.nsfw.access().features.includes('remote') : false;
        const want = c.on && allowed ? c.port : 0;
        if (want === this.port && (this.server || !want)) return;
        this.stopServer();
        if (!want) return;
        this.server = http.createServer((req, res) => this.handle(req, res).catch(e => this.json(res, e instanceof UserError ? 400 : 500, { error: e.message || 'Fehler' })));
        this.server.on('error', e => { this.error = e.code === 'EADDRINUSE' ? 'Port ' + want + ' ist schon belegt.' : e.message; this.server = null; this.port = 0; });
        this.server.listen(want, process.env.NEXUS_REMOTE_HOST || '0.0.0.0', () => { this.error = ''; });
        this.port = want;
    }
    stopServer() { if (this.server) this.server.close(); this.server = null; this.port = 0; }
    json(res, code, d) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(d)); }
    ok(token) {
        const want = Buffer.from(this.cfg().token), got = Buffer.from(str(token));
        return want.length > 10 && got.length === want.length && crypto.timingSafeEqual(got, want);
    }
    async handle(req, res) {
        const url = new URL(req.url, 'http://x');
        const token = str(req.headers['x-nexus-remote'] || url.searchParams.get('t'));
        if (!this.ok(token)) { await new Promise(r => setTimeout(r, 400)); return this.json(res, 401, { error: 'Falscher Schlüssel.' }); }
        this.hits++;
        if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' }); return res.end(PAGE); }
        if (req.method === 'GET' && url.pathname === '/state') {
            const n = this.app.nsfw.state();
            return this.json(res, 200, { private: n.private, pairs: (n.cfg && n.cfg.pairs || []).map(p => ({ name: p.name, nsfw: n.current_avatar === p.nsfw })), boundaries: !!(n.cfg && (n.cfg.yes || n.cfg.maybe || n.cfg.no)),
                toys: n.toys, world: this.app.game.state.worldName || '' });
        }
        if (req.method === 'POST' && url.pathname === '/act') {
            let body = ''; for await (const c of req) { body += c; if (body.length > 4000) throw new UserError('Zu groß.'); }
            let d; try { d = JSON.parse(body || '{}'); } catch (e) { throw new UserError('Ungültig.'); }
            if (!ALLOWED.includes(str(d.act))) throw new UserError('Nicht erlaubt.');
            return this.json(res, 200, await this.app.post(Object.assign({}, d, { act: str(d.act) }), {}));
        }
        return this.json(res, 404, { error: 'Nicht gefunden.' });
    }
    action(act, input) {
        this.app.nsfw.need('remote');
        const c = this.cfg();
        if (act === 'remote_cfg') {
            if (input.on !== undefined) c.on = input.on === '1' || input.on === true;
            if (input.port !== undefined) c.port = Math.max(1024, Math.min(65535, int(input.port) || 17870));
            if (input.new_token) c.token = this.newToken();
            this.write(c); this.apply();
            return Object.assign(this.status(), { msg: c.on ? 'Handy-Fernbedienung an.' : 'Handy-Fernbedienung aus.' });
        }
        if (act === 'remote_status') return this.status();
        throw new UserError('Unbekannte Aktion.');
    }
}

const PAGE = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta name="robots" content="noindex">
<title>VRC Nexus – Fernbedienung</title><style>
:root{color-scheme:dark}body{margin:0;background:#0b0f15;color:#e2e8f0;font:16px/1.4 system-ui,sans-serif;padding:14px 14px 40px}
h1{font-size:1.1rem;margin:0 0 4px;color:#f5c242;letter-spacing:2px}small{color:#94a3b8}
.card{background:#121a24;border:1px solid #233142;border-radius:14px;padding:12px;margin:12px 0}
button{font:inherit;border:0;border-radius:12px;padding:14px;width:100%;background:#1e2b3a;color:#e2e8f0;margin:4px 0}
button.on{background:#38d5e6;color:#04121a;font-weight:700}
#panic{background:#dc2626;color:#fff;font-size:1.3rem;font-weight:800;padding:22px;letter-spacing:2px}
#stop{background:#7f1d1d;color:#fff;font-weight:700}
.dev{margin:10px 0}.dev b{display:flex;justify-content:space-between}
input[type=range]{width:100%;height:40px;accent-color:#f5c242}.pat{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.pat button{flex:1 1 30%;margin:0;padding:10px 4px;font-size:.95rem}.err{color:#f87171}
</style></head><body>
<h1>VRC NEXUS</h1><small id="st">verbinde …</small>
<button id="panic">🚨 PANIK</button>
<div class="card"><button id="priv">🕶 Privat-Modus</button><div id="pairs"></div><button id="bnd" hidden>🟢🟡🔴 Grenzen-Karte in die Chatbox</button><button id="cons">🤝 „Alles okay?“ fragen</button></div>
<div class="card"><b>🎮 Spielzeug</b><div id="toys"><small>–</small></div><div id="pat" class="pat"></div><button id="surp">🎁 Überraschung</button><button id="stop">⏹ Alles stoppen</button></div>
<p class="err" id="err"></p>
<script>
const T=new URLSearchParams(location.search).get('t')||'';
const $=s=>document.querySelector(s),E=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function act(a,d){try{const r=await fetch('act?t='+encodeURIComponent(T),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({act:a},d||{}))});const j=await r.json();if(j.error)throw new Error(j.error);$('#err').textContent='';if(j.msg)$('#st').textContent=j.msg;load();return j}catch(e){$('#err').textContent='⚠ '+e.message}}
let drag=false,timer=null;
async function load(){try{const r=await fetch('state?t='+encodeURIComponent(T));const d=await r.json();if(d.error)throw new Error(d.error);
$('#priv').classList.toggle('on',d.private);$('#priv').textContent=d.private?'🕶 Privat-Modus AN':'🕶 Privat-Modus aus';
$('#pairs').innerHTML=d.pairs.map((p,i)=>'<button data-i="'+i+'" class="'+(p.nsfw?'on':'')+'">'+(p.nsfw?'🔞 ':'🙂 ')+E(p.name||'Avatar '+(i+1))+'</button>').join('');
$('#bnd').hidden=!d.boundaries;
const t=d.toys;if(!drag)$('#toys').innerHTML=!t||!t.connected?'<small>Intiface nicht verbunden – in VRC Nexus verbinden.</small>':!t.devices.length?'<small>Keine Geräte gefunden.</small>':
'<div class="dev"><b>Alle <span id="lv-all"></span></b><input type="range" min="0" max="100" value="0" data-dev="all"></div>'+t.devices.map(x=>'<div class="dev"><b>'+E(x.name)+' <span>'+x.level+' %</span></b><input type="range" min="0" max="100" value="'+x.level+'" data-dev="'+x.index+'"></div>').join('');
$('#pat').innerHTML=t&&t.connected&&t.devices.length?(t.patterns||[]).map(p=>'<button data-p="'+p.id+'" class="'+(t.pattern&&t.pattern.id===p.id&&!t.pattern.name.includes('🎁')?'on':'')+'">'+E(p.name)+'</button>').join('')+(t.pattern?'<button data-p="">⏸ Muster aus</button>':''):'';
$('#st').textContent=d.world?'🌐 '+d.world:'verbunden';$('#err').textContent=''}catch(e){$('#err').textContent='⚠ '+e.message}}
$('#panic').onclick=()=>act('nsfw_panic_full');$('#priv').onclick=()=>act('nsfw_private');$('#bnd').onclick=()=>act('nsfw_boundaries');$('#stop').onclick=()=>act('toys_stop');$('#surp').onclick=()=>act('toys_surprise');$('#cons').onclick=()=>act('nsfw_consent');
$('#pat').onclick=e=>{const b=e.target.closest('[data-p]');if(b)act(b.dataset.p?'toys_pattern':'toys_pattern_stop',{id:b.dataset.p,speed:1,strength:60})};
$('#pairs').onclick=e=>{const b=e.target.closest('[data-i]');if(b)act('nsfw_avatar',{i:b.dataset.i})};
$('#toys').addEventListener('input',e=>{const r=e.target.closest('[data-dev]');if(!r)return;drag=true;const s=r.previousElementSibling.querySelector('span');if(s)s.textContent=r.value+' %';clearTimeout(timer);timer=setTimeout(()=>fetch('act?t='+encodeURIComponent(T),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({act:'toys_set',device:r.dataset.dev,level:r.value/100})}),60)});
$('#toys').addEventListener('change',()=>{drag=false});
load();setInterval(()=>{if(!drag)load()},2500);
</script></body></html>`;

module.exports = { Remote, ALLOWED };
