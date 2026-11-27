'use strict';
/*
 * Lokale Schnittstelle (nur 127.0.0.1) für das Stream-Deck-Plugin und eigene Skripte.
 *   GET  /api/state            → Status, Freunde online, Instanz, OSC, Rotator
 *   POST /api/action  {action} → status, chatbox, preset, param, toggle, input, rotator, launch, open, rejoin, typing
 *   WS   /ws                   → 5.4: Client-API über WebSocket (Befehle + Ereignisse), siehe wsapi.js
 * Jede Anfrage braucht den Zugangsschlüssel im Kopf „X-Nexus-Token“ (oder ?token=).
 */
const http = require('http');
const crypto = require('crypto');
const { str, int, UserError } = require('./util');

class LocalApi {
    constructor(tools) { this.tools = tools; this.server = null; this.port = 0; this.error = ''; this.ws = new (require('./wsapi').WsApi)(tools); }

    apply() {
        const s = this.tools.settings;
        // läuft für das Stream Deck ODER für das OBS-Overlay
        const want = s.get('int.api') || s.get('int.obs') ? s.get('int.api_port') : 0;
        if (want === this.port && (this.server || !want)) return;
        this.stop();
        if (!want) return;
        this.server = http.createServer((req, res) => this.handle(req, res).catch(e => this.send(res, e instanceof UserError ? 400 : 500, { error: e.message || 'Fehler' })));
        this.ws.attach(this.server);
        this.server.on('error', e => { this.error = e.code === 'EADDRINUSE' ? 'Port ' + want + ' ist schon belegt.' : e.message; this.server = null; this.port = 0; });
        this.server.listen(want, '127.0.0.1', () => { this.error = ''; });
        this.port = want;
    }
    stop() { this.ws.stop(); if (this.server) this.server.close(); this.server = null; this.port = 0; }
    status() { return this.server ? 'läuft auf 127.0.0.1:' + this.port : this.error || 'aus'; }

    obsState() {
        const g = this.tools.app.game, st = g.state, a = this.tools.app.auto;
        return { running: !!st.running, world: st.worldName || '', players: st.players.size, since: st.since || 0, avatar: st.avatar || '',
            chat: g.osc.lastChat && Date.now() - g.osc.lastChat < 60000 ? g.osc.lastText || '' : '', music: a ? a.music : '', afk: a ? !!a.afkSince : false };
    }
    send(res, code, data) {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(data));
    }
    async handle(req, res) {
        const url = new URL(req.url, 'http://127.0.0.1');
        const obs = req.method === 'GET' && ['/obs', '/obs.json', '/chat', '/chat.json', '/bar', '/bar.json'].includes(url.pathname);
        // Nur lokale Programme, keine fremden Webseiten (Browser schicken Origin mit). Ausnahme: die eigene OBS-Seite (OBS-Browserquelle)
        const origin = str(req.headers.origin);
        if (origin && !(obs && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))) return this.send(res, 403, { error: 'Nicht erlaubt.' });
        if (obs && !this.tools.settings.get('int.api') && !this.tools.settings.get('int.obs')) return this.send(res, 403, { error: 'Aus.' });
        const token = str(req.headers['x-nexus-token'] || url.searchParams.get('token'));
        const who = this.tools.app && this.tools.app.ctools ? this.tools.app.ctools.resolve(token) : (() => { const want = Buffer.from(str(this.tools.settings.get('int.api_token'))), got = Buffer.from(token); return want.length && got.length === want.length && crypto.timingSafeEqual(got, want) ? { scope: 'all' } : null; })();
        if (!who) return this.send(res, 401, { error: 'Falscher Zugangsschlüssel.' });   // 6.3: Hauptschlüssel oder App-Schlüssel mit Rechte-Stufe
        if (url.pathname.startsWith('/api/') && !this.tools.settings.get('int.api')) return this.send(res, 403, { error: 'Die Stream-Deck-Schnittstelle ist aus (Einstellungen → Integrationen).' });
        if (req.method === 'GET' && url.pathname === '/api/state') return this.send(res, 200, this.tools.apiState());
        if (req.method === 'GET' && url.pathname === '/api/world_image') return this.send(res, 200, await this.tools.worldImage(url.searchParams.get('id')));
        if (req.method === 'GET' && url.pathname === '/api/avatar_image') return this.send(res, 200, await this.tools.avatarImage(url.searchParams.get('id')));
        if (req.method === 'GET' && url.pathname === '/api/avatars') return this.send(res, 200, await this.tools.avatarList());
        if (req.method === 'GET' && url.pathname === '/api/friend_image') return this.send(res, 200, await this.tools.friendImage(url.searchParams.get('id')));
        // Stream-Overlay für OBS (Browser-Quelle): /obs?token=…  (Stil: &theme=light, &hide=players,chat …)
        if (req.method === 'GET' && (url.pathname === '/chat' || url.pathname === '/chat.json')) {
            if (!this.tools.settings.get('int.obs')) return this.send(res, 403, { error: 'Stream-Overlay ist aus (Einstellungen → Integrationen).' });
            if (url.pathname === '/chat.json') return this.send(res, 200, this.tools.app.stream ? this.tools.app.stream.overlay() : { items: [] });
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            return res.end(CHAT_HTML);
        }
        // 7.2: Stream-Leiste oben: /bar?token=…  (&theme=light, &pos=bottom, &hide=heart,music,goal,poll,recent,info)
        if (req.method === 'GET' && (url.pathname === '/bar' || url.pathname === '/bar.json')) {
            if (!this.tools.settings.get('int.obs')) return this.send(res, 403, { error: 'Stream-Overlay ist aus (Einstellungen → Integrationen).' });
            if (url.pathname === '/bar.json') return this.send(res, 200, this.tools.app.stream ? this.tools.app.stream.barState() : Object.assign(this.obsState(), { infos: [], recent: [] }));
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            return res.end(BAR_HTML);
        }
        if (req.method === 'GET' && (url.pathname === '/obs' || url.pathname === '/obs.json')) {
            if (!this.tools.settings.get('int.obs')) return this.send(res, 403, { error: 'Stream-Overlay ist aus (Einstellungen → Integrationen).' });
            if (url.pathname === '/obs.json') return this.send(res, 200, this.obsState());
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            return res.end(OBS_HTML);
        }
        if (req.method === 'POST' && url.pathname === '/api/action') {
            let body = '';
            for await (const c of req) { body += c; if (body.length > 20000) throw new UserError('Zu groß.'); }
            let data = {};
            try { data = JSON.parse(body || '{}'); } catch (e) { throw new UserError('Ungültiges JSON.'); }
            if (who.scope !== 'all') this.tools.app.ctools.check(who.scope, str(data.action));
            return this.send(res, 200, await this.tools.apiAction(str(data.action), data));
        }
        return this.send(res, 404, { error: 'Unbekannt.' });
    }
}

const OBS_HTML = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>VRC Nexus · OBS</title><style>
html,body{margin:0;background:transparent;font:600 26px/1.3 "Segoe UI",system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px #000,0 0 2px #000}
.box{display:inline-flex;flex-direction:column;gap:6px;padding:14px 20px;background:rgba(6,10,16,.55);border-left:5px solid #38d5e6;border-radius:6px;margin:10px}
.w{color:#f3c262}.s{font-size:20px;opacity:.9}.c{font-size:22px;white-space:pre-wrap;max-width:900px;border-top:1px solid rgba(255,255,255,.2);padding-top:6px}
body.light{color:#111;text-shadow:none}body.light .box{background:rgba(255,255,255,.8)}[hidden]{display:none!important}</style></head>
<body><div class="box" id="b" hidden><div class="w" id="w"></div><div class="s" id="s"></div><div class="c" id="c" hidden></div></div><script>
const q=new URLSearchParams(location.search),hide=(q.get('hide')||'').split(',');if(q.get('theme')==='light')document.body.classList.add('light');
const $=i=>document.getElementById(i),fmt=s=>{s=Math.max(0,Math.floor(Date.now()/1000-s));return Math.floor(s/3600)+':'+String(Math.floor(s/60)%60).padStart(2,'0')};
async function tick(){try{const d=await (await fetch('/obs.json?token='+encodeURIComponent(q.get('token')||''))).json();
$('b').hidden=!d.running&&!d.chat;$('w').textContent=d.world?'🌐 '+d.world:'VRChat';
$('s').textContent=[!hide.includes('players')&&d.world?'👥 '+d.players:'',!hide.includes('time')&&d.since?'⏱ '+fmt(d.since):'',!hide.includes('music')&&d.music?'🎵 '+d.music:'',d.afk?'💤 AFK':''].filter(Boolean).join('   ');
$('c').hidden=hide.includes('chat')||!d.chat;$('c').textContent='💬 '+d.chat;}catch(e){}}tick();setInterval(tick,2000);
</script></body></html>`;

/* 7.2: Stream-Leiste oben (1920 px breit, 56 px hoch) – Welt, Laufband (Infos + Unterstützer), Puls, Song, Ziel; darunter laufende Umfrage */
const BAR_HTML = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>VRC Nexus · Leiste</title><style>
html,body{margin:0;background:transparent;font:600 22px/1 "Segoe UI",system-ui,sans-serif;color:#fff;overflow:hidden}
#bar{position:fixed;left:0;right:0;top:0;height:56px;display:flex;align-items:center;gap:18px;padding:0 18px;background:linear-gradient(90deg,rgba(6,10,16,.88),rgba(10,20,32,.82));border-bottom:2px solid #38d5e6;box-shadow:0 2px 12px rgba(0,0,0,.4);text-shadow:0 1px 3px #000}
body.bottom #bar{top:auto;bottom:0;border-bottom:0;border-top:2px solid #38d5e6}
.seg{display:flex;align-items:center;gap:8px;white-space:nowrap}.w{color:#f3c262;max-width:520px;overflow:hidden;text-overflow:ellipsis}.m{opacity:.85;font-size:19px}
#tick{flex:1;overflow:hidden;position:relative;height:56px;mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
#tick span{position:absolute;top:0;line-height:56px;white-space:nowrap;animation:in .5s ease-out}
.h{color:#ff5c7a}.h i{display:inline-block;animation:beat 1s infinite}.mu{max-width:380px;overflow:hidden;text-overflow:ellipsis;font-size:19px}
.g{min-width:220px}.g b{font-size:16px;color:#f3c262}.gb{height:8px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden;margin-top:4px;width:200px}.gb i{display:block;height:100%;background:linear-gradient(90deg,#38d5e6,#f3c262);transition:width 1s}
.g .col{display:flex;flex-direction:column}
#poll{position:fixed;left:18px;top:64px;background:rgba(6,10,16,.85);border-left:4px solid #f3c262;border-radius:6px;padding:8px 12px;font-size:18px;text-shadow:0 1px 3px #000}
body.bottom #poll{top:auto;bottom:64px}#poll b{color:#f3c262}.po{display:flex;gap:8px;align-items:center;margin-top:4px;font-size:16px}.po i{display:inline-block;height:8px;background:#38d5e6;border-radius:4px}
body.light #bar{background:rgba(255,255,255,.9);color:#111;text-shadow:none}body.light .w{color:#a0700a}[hidden]{display:none!important}
@keyframes in{from{transform:translateY(20px);opacity:0}}@keyframes beat{0%,100%{transform:scale(1)}15%{transform:scale(1.25)}}
</style></head><body><div id="bar"><div class="seg"><span>🥽</span><span class="w" id="w">VRC Nexus</span><span class="m" id="pl"></span></div>
<div id="tick"><span id="tx"></span></div><div class="seg h" id="hr" hidden><i>❤</i><span id="bpm"></span></div><div class="seg mu" id="mu" hidden></div>
<div class="seg g" id="g" hidden><div class="col"><b id="gt"></b><div class="gb"><i id="gi"></i></div></div></div></div><div id="poll" hidden></div><script>
const q=new URLSearchParams(location.search),hide=(q.get('hide')||'').split(','),$=i=>document.getElementById(i);
if(q.get('theme')==='light')document.body.classList.add('light');if(q.get('pos')==='bottom')document.body.classList.add('bottom');
const LB={sub:'⭐ Abo',resub:'⭐ Abo',subgift:'🎁 Geschenk-Abo',raid:'🚀 Raid',bits:'💎 Bits',superchat:'💰 Super Chat',member:'⭐ Mitglied'};
let items=[],k=0,last='';
const fmt=s=>{s=Math.max(0,Math.floor(Date.now()/1000-s));return Math.floor(s/3600)+':'+String(Math.floor(s/60)%60).padStart(2,'0')};
function rot(){if(!items.length){$('tx').textContent='';return}const t=items[k++%items.length];if(t===last&&items.length>1)return rot();last=t;const s=document.createElement('span');s.textContent=t;$('tick').replaceChildren(s)}
async function tick(){try{const d=await(await fetch('/bar.json?token='+encodeURIComponent(q.get('token')||''))).json();
$('w').textContent=d.private?'🔒 Privat':(d.world||'VRChat');$('pl').textContent=d.world&&!d.private?'👥 '+d.players+(d.since?' · ⏱ '+fmt(d.since):''):'';
$('hr').hidden=hide.includes('heart')||!d.heart;$('bpm').textContent=d.heart||'';
$('mu').hidden=hide.includes('music')||!d.music;$('mu').textContent='🎵 '+(d.music||'');
$('g').hidden=hide.includes('goal')||!d.goal;if(d.goal){$('gt').textContent='🎯 '+d.goal.text+' '+d.goal.cur+'/'+d.goal.max;$('gi').style.width=Math.min(100,d.goal.cur/d.goal.max*100)+'%'}
const it=[];if(!hide.includes('recent'))for(const r of d.recent||[])it.push((LB[r.kind]||'⭐')+': '+r.user+(r.menge&&r.kind!=='sub'&&r.kind!=='resub'?' ('+r.menge+')':''));
if(!hide.includes('info'))it.push(...(d.infos||[]));if(d.giveaway)it.push('🎉 Verlosung: schreib '+d.giveaway.keyword+' ('+d.giveaway.entries+' dabei)');items=it;if(!$('tick').textContent.trim())rot();
const P=$('poll');if(d.poll&&!hide.includes('poll')){P.hidden=false;P.replaceChildren();const h=document.createElement('b');h.textContent='📊 '+d.poll.q;P.append(h);
for(const [i,o] of d.poll.options.entries()){const r=document.createElement('div');r.className='po';const t=document.createElement('span');t.textContent=(i+1)+') '+o.text;const bar=document.createElement('i');bar.style.width=(d.poll.total?Math.round(o.votes/d.poll.total*160):0)+'px';const n=document.createElement('span');n.textContent=o.votes;r.append(t,bar,n);P.append(r)}}else P.hidden=true;
}catch(e){}}tick();setInterval(tick,3000);rot();setInterval(rot,6000);
</script></body></html>`;

const CHAT_HTML = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>VRC Nexus · Chat</title><style>
html,body{margin:0;background:transparent;font:600 20px/1.35 "Segoe UI",system-ui,sans-serif;color:#fff;overflow:hidden}
#l{position:fixed;left:0;right:0;bottom:0;padding:8px;display:flex;flex-direction:column;gap:6px}
.m{background:rgba(6,10,16,.6);border-left:4px solid #38d5e6;border-radius:6px;padding:6px 10px;text-shadow:0 1px 3px #000;animation:in .3s ease-out;word-wrap:break-word}
.m.youtube{border-color:#ff4e45}.m.bot{border-color:#f3c262;opacity:.9}.m.reward,.m.alert{border-color:#50fa7b;background:rgba(20,60,30,.75)}
.u{color:#38d5e6;margin-right:6px}.youtube .u{color:#ff8a84}.bot .u{color:#f3c262}.reward .u,.alert .u{color:#50fa7b}.out{opacity:0;transition:opacity 1s}
#p{position:fixed;left:8px;right:8px;top:8px;background:rgba(6,10,16,.75);border-left:4px solid #f3c262;border-radius:6px;padding:8px 12px;text-shadow:0 1px 3px #000}#p b{color:#f3c262}.po{display:flex;gap:8px;align-items:center;font-size:17px;margin-top:4px}.po i{display:block;height:10px;background:#f3c262;border-radius:3px}.po span{flex:1}
body.light .m{background:rgba(255,255,255,.85);color:#111;text-shadow:none}@keyframes in{from{transform:translateX(-20px);opacity:0}}
</style></head><body><div id="p" hidden></div><div id="l"></div><script>
const q=new URLSearchParams(location.search),l=document.getElementById('l'),keep=+(q.get('sekunden')||60)*1000,max=+(q.get('max')||12),hide=(q.get('hide')||'').split(',');
if(q.get('theme')==='light')document.body.classList.add('light');let seen=0;
const ic={twitch:'🟣',youtube:'🔴'};
async function tick(){try{const d=await(await fetch('/chat.json?token='+encodeURIComponent(q.get('token')||''))).json();
for(const e of d.items){if(e.i<=seen)continue;seen=e.i;if(hide.includes(e.kind))continue;const m=document.createElement('div');m.className='m '+e.platform+' '+e.kind;
const u=document.createElement('span');u.className='u';u.textContent=(e.kind==='reward'?'🎁 ':e.kind==='alert'?'⭐ ':(ic[e.platform]||'')+' ')+(e.user||'')+(e.kind==='chat'?':':'');
m.append(u,document.createTextNode(e.text));l.append(m);setTimeout(()=>{m.classList.add('out');setTimeout(()=>m.remove(),1100)},keep);}
while(l.children.length>max)l.firstChild.remove();
const P=document.getElementById('p');if(d.poll&&!hide.includes('poll')){P.hidden=false;P.replaceChildren();const h=document.createElement('b');h.textContent='📊 '+d.poll.q;P.append(h);for(const [k,o] of d.poll.options.entries()){const r=document.createElement('div');r.className='po';const t=document.createElement('span');t.textContent=(k+1)+') '+o.text;const bar=document.createElement('i');bar.style.width=(d.poll.total?Math.round(o.votes/d.poll.total*120):0)+'px';const n=document.createElement('b');n.textContent=o.votes;r.append(t,bar,n);P.append(r);}}else P.hidden=true;}catch(e){}}tick();setInterval(tick,1000);
</script></body></html>`;

module.exports = { LocalApi, int };
