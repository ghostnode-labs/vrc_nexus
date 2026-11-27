/* VRC Nexus Twitch-Panel: zeigt, was die Streamerin gerade in VRChat macht – Welt, Puls, Song, Ziel, Umfrage (abstimmen), Befehle, Belohnungen, Bestenliste. */
'use strict';
(function () {
    var el = NX.el, main = document.getElementById('main'), live = document.getElementById('live'), foot = document.getElementById('foot');
    var tab = 'now', s = null, timer = null, busy = false;
    var LB = { sub: '⭐', resub: '⭐', subgift: '🎁', raid: '🚀', bits: '💎', superchat: '💰', member: '⭐' };

    document.getElementById('tabs').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-tab]');
        if (!b) return;
        tab = b.getAttribute('data-tab');
        Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (x) { x.classList.toggle('on', x === b); });
        render();
    });

    function card(title) { var c = el('section', 'card'); if (title) c.appendChild(el('h3', '', title)); main.appendChild(c); return c; }
    function row(parent, a, b) { var r = el('div', 'row'); r.appendChild(el('span', '', a)); if (b !== undefined) r.appendChild(el('b', '', b)); parent.appendChild(r); return r; }

    function render() {
        main.textContent = '';
        if (!s) { main.appendChild(el('p', 'muted', 'Lädt …')); return; }
        live.textContent = s.offline ? 'offline' : (s.running ? '● in VRChat' : '● online');
        live.className = 'pill' + (s.offline ? '' : ' on');
        if (s.offline) {
            var c0 = card();
            c0.appendChild(el('p', 'muted', s.linked === false ? 'Dieses Panel ist noch nicht mit VRC Nexus verbunden.' : 'Gerade keine Live-Daten – schau beim nächsten Stream wieder vorbei! 💜'));
        }
        if (tab === 'now' && !s.offline) {
            var c = card();
            if (s.world) { c.appendChild(el('div', 'world', '🌐 ' + s.world)); row(c, '👥 ' + s.players + ' in der Instanz', s.since ? '⏱ ' + NX.fmtTime(s.since) : ''); }
            else if (s.running) c.appendChild(el('div', 'world', '🔒 Gerade in einer privaten Welt'));
            else c.appendChild(el('div', 'muted', 'Gerade nicht in VRChat'));
            if (s.heart) { var h = el('div', 'heart'); h.appendChild(el('i', '', '❤')); h.appendChild(el('span', '', ' ' + s.heart + ' bpm')); c.appendChild(h); }
            if (s.music) c.appendChild(el('div', 'music', '🎵 ' + s.music));
            if (s.goal) {
                var g = card('🎯 ' + s.goal.text);
                var bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.min(100, Math.round(s.goal.cur / s.goal.max * 100)) + '%'; bar.appendChild(fill); g.appendChild(bar);
                g.appendChild(el('div', 'small', s.goal.cur + ' / ' + s.goal.max));
            }
            if (s.poll) poll();
            if (s.recent && s.recent.length) { var r = card('⭐ Danke an'); s.recent.slice(0, 5).forEach(function (x) { row(r, (LB[x.kind] || '⭐') + ' ' + x.user, x.label + (x.menge && x.kind !== 'sub' && x.kind !== 'resub' ? ' ' + x.menge : '')); }); }
        }
        if (tab === 'cmds') {
            var cc = card('⌨️ Befehle im Chat');
            if (!s.commands || !s.commands.length) cc.appendChild(el('p', 'muted', 'Keine Befehle freigegeben.'));
            else s.commands.forEach(function (x) {
                var d = el('div', 'cmd'); d.appendChild(el('code', '', (s.prefix || '!') + x.name + (x.usage ? ' ' + x.usage : '')));
                if (x.cost) d.appendChild(el('span', 'cost', x.cost + ' ' + s.name));
                if (x.text) d.appendChild(el('div', 'small muted', x.text));
                cc.appendChild(d);
            });
            cc.appendChild(el('p', 'small muted', 'Immer da: ' + ['punkte', 'top', 'welt', 'song', 'befehle'].map(function (n) { return (s.prefix || '!') + n; }).join(' ')));
        }
        if (tab === 'rewards') {
            var rc = card('🎁 Belohnungen – mit ' + s.name + ' einlösen');
            if (!s.rewards || !s.rewards.length) rc.appendChild(el('p', 'muted', 'Keine Belohnungen freigegeben.'));
            else s.rewards.forEach(function (x) { row(rc, (s.prefix || '!') + x.name, x.cost + ' ' + s.name); });
            rc.appendChild(el('p', 'small muted', s.name + ' bekommst du fürs Chatten und Zuschauen.'));
        }
        if (tab === 'top') {
            var tc = card('🏆 Top ' + s.name);
            if (!s.top || !s.top.length) tc.appendChild(el('p', 'muted', 'Noch keine Bestenliste.'));
            else s.top.forEach(function (x, i) { row(tc, (i + 1) + '. ' + x.name, x.p.toLocaleString('de-DE')); });
        }
        foot.textContent = '';
        if (s.discord) { var a = el('a', 'btn', '💬 Discord'); a.href = s.discord; a.target = '_blank'; a.rel = 'noopener noreferrer'; foot.appendChild(a); }
        foot.appendChild(el('span', 'small muted', 'VRC Nexus · ghostnode-labs.dev'));
    }

    function poll() {
        var p = s.poll, c = card('📊 ' + p.q), total = p.total || 0;
        p.options.forEach(function (o, i) {
            var b = el('button', 'opt' + (p.mine === i ? ' mine' : ''));
            b.type = 'button';
            b.appendChild(el('span', '', (i + 1) + ') ' + o.text));
            var fill = el('i'); fill.style.width = (total ? Math.round(o.votes / total * 100) : 0) + '%'; b.appendChild(fill);
            b.appendChild(el('b', '', String(o.votes)));
            b.addEventListener('click', function () {
                if (busy) return;
                busy = true;
                NX.call('vote', { poll: p.id, option: i }).then(function (d) { p.mine = d.mine; render(); toast(d.msg); }).catch(function (e) { toast(e.message); }).then(function () { busy = false; });
            });
            c.appendChild(b);
        });
        c.appendChild(el('p', 'small muted', 'Abstimmen hier oder im Chat mit ' + (s.prefix || '!') + 'stimme <Nummer>'));
    }
    function toast(m) { var t = el('div', 'toast', m); document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3000); }

    function load() { NX.call('state').then(function (d) { s = d; render(); }).catch(function (e) { main.textContent = ''; main.appendChild(el('p', 'muted', e.message)); }); }
    NX.onAuth(function () {
        load();
        clearInterval(timer);
        timer = setInterval(load, 20000 + Math.floor(Math.random() * 5000));   // gestreut, damit nicht alle Zuschauer gleichzeitig fragen
    });
})();
