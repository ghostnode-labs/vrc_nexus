/* VRC Nexus – 🫂 Community (GhostNode): Feed (SFW), 🔞 NSFW-Feed (nur Verified 18+ mit NSFW an), Profil, Moderation.
 * Alle Rechte prüft der Server; die Oberfläche blendet nur aus, was ohnehin abgelehnt würde. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    const when = ts => UI.ago ? UI.ago(ts) : new Date(ts * 1000).toLocaleString();
    let filt = { q: '', tag: '' }, disc = null, links18 = null, consentFor = '', compatOf = null;   // 6.0: 18+-Anfragen, Consent-Check   // 5.3: Suche/Hashtag im Feed, Entdecken (Trends + Antworten an mich)
    let box = null, sub = (window.NexusUI.store && window.NexusUI.store.get('cmtSub', 'feed')) || 'feed', me = null, items = [], openThread = {}, attach = [], modData = null, prof = null, profEdit = false, busy = false, acct = null, p18Edit = false, profTab = 'main';
    const md = t => (window.NexusMD ? window.NexusMD.render(t) : esc(t).replace(/\n/g, '<br>'));   // 3.2: Markdown (sicher, ohne HTML)
    const card = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '">' + (t ? '<h4>' + t + '</h4>' : '') + html + '</div>';
    const MOBILE = document.body.classList.contains('mobile');
    let chat = { list: null, uid: '', open: null, timer: null };
    const FEEDS = ['feed', 'nsfw', 'following', 'saved'];
    const subs = () => [['feed', '🫂 ' + T('Feed')], ['following', '⭐ ' + T('Folge ich')], ['saved', '🔖 ' + T('Gemerkt')], ['discover', '🔥 ' + T('Entdecken') + (disc && disc.unread ? ' •' : '')], ...(me && me.nsfw ? [['nsfw', '🔞 ' + T('NSFW-Feed')], ['links18', '💌 ' + T('18+-Anfragen') + (links18 && links18.incoming.length ? ' •' : '')]] : []), ['chat', '💬 ' + T('Chat') + (chat.list && chat.list.some(c => c.unread) ? ' •' : '')], ['profile', '👤 ' + T('Mein Profil')], ...(me && me.mod ? [['mod', '🛡 ' + T('Moderation')]] : [])];

    function nav() {
        const n = document.getElementById('cmtSub');
        document.querySelectorAll('#tabs .cm-nsfw-only').forEach(b => { b.hidden = !(me && me.nsfw); });
        document.querySelectorAll('#tabs .cm-mod-only').forEach(b => { b.hidden = !(me && me.mod); });
        const vis = (me && me.nsfw ? 'n' : '') + (me && me.mod ? 'm' : '');
        if (vis !== nav.vis) { nav.vis = vis; if (UI.subnav) setTimeout(() => UI.subnav(), 0); }   // Leiste oben neu, wenn Einträge dazukommen/wegfallen
        const side = document.body.classList.contains('nav-side');   // Menü links: Unterpunkte stehen oben in der Leiste (Menü-Gruppe „Community“)
        if (n) n.innerHTML = (side ? '' : subs().map(([k, l]) => '<button type="button" class="chip' + (sub === k ? ' on' : '') + '" data-csub="' + k + '">' + esc(l) + '</button>').join(''))
            // 3.1.1: NSFW direkt hier ein-/ausschalten (nur mit Verified 18+)
            + (acct && acct.age && acct.age.verified ? '<label class="cm-nsfwsw" title="' + esc(T('NSFW-Inhalte und -Werkzeuge anzeigen (freiwillig, jederzeit abschaltbar)')) + '"><input type="checkbox" data-cnsfw="1"' + (acct.age.nsfw_on ? ' checked' : '') + '><span></span>🔞 NSFW</label>' : '');
    }
    const imgs = media => (media || []).length ? '<div class="cm-imgs">' + media.map(id => '<img loading="lazy" src="nexus.php?cimg=' + esc(id) + '" alt="" data-cimg="' + esc(id) + '">').join('') + '</div>' : '';
    /** 5.3: #Hashtags im fertigen HTML klickbar (nur nach Leerzeichen/Tag-Ende – nicht in Links oder &#…;) */
    const tags = h => h.replace(/(^|[\s>(])#([\p{L}\p{N}_]{2,32})/gu, (m, a, g) => a + '<a href="#" class="cm-tag" data-ctag="' + g.toLowerCase() + '">#' + g + '</a>');
    function post(p, reply) {
        const reacts = (me ? me.reactions : []).map(e => { const n = (p.reactions || {})[e] || 0, on = (p.mine || []).includes(e); return n || !reply ? '<button type="button" class="cm-re' + (on ? ' on' : '') + '" data-cre="' + esc(e) + '" data-id="' + p.id + '">' + e + (n ? ' <b>' + n + '</b>' : '') + '</button>' : ''; }).join('');
        return '<article class="cm-post' + (reply ? ' reply' : '') + (p.own ? ' mine' : '') + (p.status !== 'visible' ? ' st-' + esc(p.status) : '') + '" data-pid="' + p.id + '">'
            + '<header><a href="#" data-cprof="' + esc(p.author) + '"><b>' + esc(p.name || p.author) + '</b></a> <span class="muted small">' + esc(when(p.created)) + (p.edited ? ' · ' + esc(T('bearbeitet')) : '') + '</span>'
            + (p.rating === 'nsfw' ? ' <span class="vx-pill" style="--pc:#ff5c8a">🔞</span>' : '') + (p.status === 'pending' ? ' <span class="vx-pill rep">⏳ ' + esc(T('wartet auf Freigabe')) + '</span>' : p.status === 'hidden' ? ' <span class="vx-pill">' + esc(T('ausgeblendet')) + '</span>' : '') + '</header>'
            + (p.text ? '<div class="cm-text md">' + tags(md(p.text)) + '</div>' + (window.NexusCards ? window.NexusCards.html(p.text) : '') : '') + imgs(p.media)
            + '<footer><span class="cm-reacts">' + reacts + '</span>'
            + (!reply ? '<button type="button" class="nc-link" data-cthread="' + p.id + '">💬 ' + (p.replies || 0) + '</button><button type="button" class="nc-link' + (p.saved ? ' on' : '') + '" data-csave="' + p.id + '" title="' + esc(T('Merken')) + '">🔖' + (p.saved ? ' ' + esc(T('gemerkt')) : '') + '</button>' : '')
            + (p.own ? '<button type="button" class="nc-link" data-cedit="' + p.id + '">✎</button><button type="button" class="nc-link" data-cdel="' + p.id + '">🗑</button>' : '<button type="button" class="nc-link" data-crep="' + p.id + '" title="' + esc(T('Melden')) + '">⚑</button>')
            + (me && me.mod && !p.own ? '<button type="button" class="nc-link" data-cmod="hide" data-id="' + p.id + '" title="' + esc(T('Ausblenden')) + '">🛡</button>' : '') + '</footer>'
            + (!reply && openThread[p.id] ? '<div class="cm-thread">' + (openThread[p.id].replies || []).map(r => post(r, true)).join('') + composer(p.id) + '</div>' : '')
            + '</article>';
    }
    function composer(parent) {
        const nsfw = sub === 'nsfw';
        return '<form class="cm-comp' + (parent ? ' small' : '') + '" data-parent="' + (parent || 0) + '">' + (window.NexusMD ? window.NexusMD.toolbar() : '') + '<textarea name="text" rows="' + (parent ? 2 : 3) + '" maxlength="2000" placeholder="' + esc(T(parent ? 'Antworten …' : nsfw ? 'Etwas für den NSFW-Feed …' : 'Was gibt’s Neues?')) + '"></textarea>'
            + (!parent ? '<div class="cm-att">' + attach.map(a => '<span class="vx-pill">🖼 ' + esc(a.name) + (a.status === 'pending' ? ' ⏳' : '') + '</span>').join('') + '</div>' : '')
            + '<div class="nc-row">' + (!parent ? '<label class="btn btn-sm">🖼 ' + esc(T('Bild')) + '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-cup="1" hidden></label>' : '')
            + (nsfw && !parent ? '<span class="small muted">' + esc(T('NSFW-Bilder erscheinen nach Prüfung durch einen Moderator.')) + '</span>' : '')
            + '<button class="btn btn-sm btn-gold" style="margin-left:auto">' + esc(T(parent ? 'Antworten' : 'Posten')) + '</button></div></form>';
    }
    /** Karten aus „Konto & Status“ (Status, VRChat-Profil, Benachrichtigungen) – vor jedem Neuzeichnen zurück in ihren Bereich */
    function acctPark() { const c = document.getElementById('acctCards'), pane = document.querySelector('[data-pane="account"]'); if (c && pane && c.parentNode !== pane) pane.prepend(c); }
    function render() {
        if (!box) return;
        if (!(box.contains(document.activeElement) && document.activeElement.matches('textarea, input[type=text]'))) acctPark();
        if (busy || (box.contains(document.activeElement) && document.activeElement.matches('textarea, input[type=text]'))) return;
        nav();
        if (!me) { box.innerHTML = '<div class="vx-loading">' + esc(T('Lade …')) + '</div>'; return; }
        if (me.error) { box.innerHTML = card('🫂 Community', '<p class="small">' + esc(T(me.error)) + '</p><div id="cmtAcct"></div>'); if (window.NexusAccount) window.NexusAccount.render(box.querySelector('#cmtAcct')); return; }
        if (sub === 'discover') { box.innerHTML = discoverHtml(); return; }
        if (sub === 'links18') { box.innerHTML = links18Html(); return; }
        if (FEEDS.includes(sub)) {
            // 3.2: Feed wie ein Chat – älteste oben, neueste unten, Eingabe unten, eigener Bereich mit Scrollen
            const old = box.querySelector('.cm-flow'), atEnd = !old || old.scrollHeight - old.scrollTop - old.clientHeight < 80, keep = old ? old.scrollHeight - old.scrollTop : 0;
            box.innerHTML = '<div class="cm-feed chatlike">' + (sub === 'nsfw' ? '<div class="tts-help">🔞 ' + esc(T('Getrennter NSFW-Feed – nur für Verified 18+ mit eingeschaltetem NSFW. Nichts davon erscheint in der normalen Timeline.')) + '</div>' : '')
                + '<div class="nc-row cm-filter"><input type="search" data-cq="1" placeholder="🔍 ' + esc(T('Beiträge durchsuchen …')) + '" value="' + esc(filt.q) + '" style="flex:1">' + (filt.tag ? '<button type="button" class="chip on" data-ctagx="1">#' + esc(filt.tag) + ' ✕</button>' : '') + '</div>'
                + '<div class="cm-flow">' + (items.length >= 30 ? '<button type="button" class="btn btn-sm cm-older" data-cmore="1">↑ ' + esc(T('Ältere laden')) + '</button>' : '')
                + (items.length ? items.slice().reverse().map(p => post(p)).join('') : '<p class="vx-empty">' + esc(T(sub === 'following' ? 'Du folgst noch niemandem – im Profil einer Person auf ⭐ Folgen tippen.' : sub === 'saved' ? 'Noch nichts gemerkt – bei einem Beitrag auf 🔖 tippen.' : 'Noch keine Beiträge.')) + '</p>') + '</div>'
                + (sub === 'following' || sub === 'saved' ? '' : me.sanction && (me.sanction.banned || me.sanction.mute_until > Date.now() / 1000) ? '<p class="small bad">⚠ ' + esc(T(me.sanction.banned ? 'Du bist in der Community gesperrt.' : 'Du bist gerade stummgeschaltet.')) + '</p>' : card('', composer(0), 'cm-dock'))
                + '</div>';
            const fq = box.querySelector('[data-cq]'); if (fq && filt.focus) { fq.focus(); fq.setSelectionRange(fq.value.length, fq.value.length); filt.focus = false; }
            const flow = box.querySelector('.cm-flow');
            fitFeed();
            if (flow) flow.scrollTop = atEnd ? flow.scrollHeight : flow.scrollHeight - keep;
            feedTimer();
            return;
        }
        if (sub === 'profile') { box.innerHTML = profileHtml(); const slot = box.querySelector('#cmAcctSlot'), c = document.getElementById('acctCards'); if (slot && c) slot.appendChild(c); return; }
        if (sub === 'mod') { box.innerHTML = modHtml(); return; }
        if (sub === 'chat') { box.innerHTML = chatHtml(); const l = box.querySelector('.ch-msgs'); if (l) l.scrollTop = l.scrollHeight; return; }
    }
    // ---------- 💬 Privat-Chat (Ende-zu-Ende-verschlüsselt) ----------
    const chSnip = m => m.deleted ? T('gelöscht') : m.img ? '🖼 ' + (m.text || T('Bild')) : m.hr ? '💓 ' + m.hr + ' bpm' : String(m.text || '').replace(/\s+/g, ' ').slice(0, 80);
    /** eine Nachricht (3.4: Antwort, Bild, Puls, Reaktionen, bearbeitet/gelöscht, Häkchen, Aktionen) */
    function chMsg(m, o, plain) {
        const when = new Date(m.at).toLocaleString(window.nxLoc ? nxLoc() : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const conv = o ? o.uid : '';
        let body = m.deleted ? '<i class="muted">🗑 ' + esc(T('Nachricht gelöscht')) + '</i>' : '';
        if (!m.deleted) {
            if (o && o.group && !m.me && !m.sys && m.from) body += '<b class="ch-from">' + esc((o.names || {})[m.from] || m.from.slice(0, 13) + '…') + '</b>';
            if (m.reply) body += '<div class="ch-quote">↩ ' + esc(m.reply.text || T('gelöscht')) + '</div>';
            if (m.img) body += '<a class="ch-img" href="nexus.php?chimg=' + esc(conv + ':' + m.id) + '" target="_blank" rel="noopener"><img src="nexus.php?chimg=' + esc(conv + ':' + m.id) + '" alt="" loading="lazy"></a>';
            if (m.hr) body += '<div class="ch-hr">💓 <b>' + m.hr + '</b> bpm</div>';
            if (m.text) body += '<div class="md">' + md(m.text) + '</div>' + (window.NexusCards && !plain ? window.NexusCards.html(m.text) : '');   // 3.9 Info-Karten
        }
        const reacts = Object.entries(m.reacts || {}).map(([e, who]) => '<button type="button" class="ch-react' + (who.includes('me') ? ' on' : '') + '"' + (o ? ' data-chreact="' + esc(e) + '" data-ref="' + esc(m.id) + '"' : '') + '>' + e + (who.length > 1 ? ' ' + who.length : '') + '</button>').join('');
        const fav = o && (o.favs || []).includes(m.id), pin = o && (o.pins || []).includes(m.id);
        const acts = !o || m.sys || m.deleted ? '' : '<span class="ch-acts"><button type="button" data-chact="react" data-ref="' + esc(m.id) + '" title="' + esc(T('Reagieren')) + '">😀</button><button type="button" data-chact="reply" data-ref="' + esc(m.id) + '" title="' + esc(T('Antworten')) + '">↩</button>'
            + (m.me && !m.img && !m.hr ? '<button type="button" data-chact="edit" data-ref="' + esc(m.id) + '" title="' + esc(T('Bearbeiten')) + '">✎</button>' : '')
            + '<button type="button" data-chact="pin" data-ref="' + esc(m.id) + '" title="' + esc(T('Anheften')) + '"' + (pin ? ' class="on"' : '') + '>📌</button><button type="button" data-chact="fav" data-ref="' + esc(m.id) + '" title="' + esc(T('Merken')) + '"' + (fav ? ' class="on"' : '') + '>★</button>'
            + (m.me ? '<button type="button" data-chact="del" data-ref="' + esc(m.id) + '" title="' + esc(T('Löschen')) + '">🗑</button>' : '') + '</span>';
        return '<div class="ch-msg' + (m.me ? ' me' : '') + (m.sys ? ' sys' : '') + (plain ? ' plain' : '') + '" data-mid="' + esc(m.id || '') + '">' + acts + body + (reacts ? '<div class="ch-reacts">' + reacts + '</div>' : '')
            + '<small>' + esc(when) + (m.edited && !m.deleted ? ' · ' + esc(T('bearbeitet')) : '') + (m.me && !m.sys ? ' <span class="ch-tick' + (m.read ? ' read' : '') + '" title="' + esc(T(m.read ? 'gelesen' : 'gesendet')) + '">' + (m.read ? '✓✓' : '✓') + '</span>' : '') + '</small></div>';
    }
    /** 3.7.3: Freunde zum Anschreiben – online zuerst (im Spiel, dann Web), Offline-Freunde per Knopf; Tippen filtert nach Namen */
    function chFriendPick(friends) {
        const rank = { online: 0, active: 1 }, st = (window.VRCX && window.VRCX.status) || {};
        const on = friends.filter(f => f.state === 'online' || f.state === 'active').sort((a, b) => (rank[a.state] - rank[b.state]) || String(a.name).localeCompare(String(b.name)));
        const off = friends.filter(f => f.state !== 'online' && f.state !== 'active');
        const row = f => '<button type="button" class="ch-fr" data-chopen="' + esc(f.id) + '" data-fname="' + esc(String(f.name || '').toLowerCase()) + '">' + UI.img(f.image, 'ch-fr-img', f.name)
            + '<span class="ch-fr-n">' + esc(f.name) + '</span><i class="ch-fr-dot" style="background:' + esc(f.state === 'offline' || !f.state ? '#6b7280' : ((st[f.status] || {}).color || '#51e57e')) + '" title="' + esc(f.state === 'online' ? T('im Spiel') : f.state === 'active' ? T('online (Web/App)') : T('offline')) + '"></i></button>';
        if (!friends.length) return '';
        return '<div class="ch-pick"><div class="ch-pick-h small muted">👥 ' + esc(T('Freunde online')) + ' (' + on.length + ')</div>'
            + '<div class="ch-pick-l">' + (on.length ? on.map(row).join('') : '<p class="small muted ch-pick-none">' + esc(T('Gerade niemand online.')) + '</p>')
            + (chat.showOff ? '<div class="ch-pick-h small muted">⚪ ' + esc(T('Offline')) + ' (' + off.length + ')</div>' + off.map(row).join('') : '') + '</div>'
            + (off.length ? '<button type="button" class="btn btn-sm ch-pick-off" data-choff="1">' + (chat.showOff ? '▴ ' + esc(T('Offline-Freunde ausblenden')) : '⚪ ' + esc(T('Offline-Freunde zeigen')) + ' (' + off.length + ')') + '</button>' : '') + '</div>';
    }
    function chatHtml() {
        const names = {}, friends = (UI.state && UI.state() && UI.state().friends) || [];
        friends.forEach(f => { names[f.id] = f.name; });
        const list = chat.list || [];
        const o = chat.open;
        const left = '<div class="nc-card ch-list"><h4>💬 ' + esc(T('Unterhaltungen')) + '</h4>'
            + '<form class="nc-row ch-new"><input type="text" name="uid" placeholder="' + esc(T('VRChat-User-ID, Profil-Link oder Name suchen')) + '" autocomplete="off" style="flex:1"><button class="btn btn-sm btn-gold" title="' + esc(T('Unterhaltung mit dieser ID starten')) + '">＋</button></form>'
            + chFriendPick(friends)
            + (list.length ? list.map(c => '<button type="button" class="ch-item' + (c.uid === chat.uid ? ' on' : '') + '" data-chopen="' + esc(c.uid) + '"><b>' + (c.group ? '👥 ' : '') + esc(c.name || names[c.uid] || c.uid.slice(0, 13) + '…') + '</b>' + (c.group ? ' <small class="muted" style="display:inline">· ' + c.members + '</small>' : '')
                + (c.changed ? ' <span title="' + esc(T('Schlüssel geändert')) + '">⚠</span>' : c.verified ? ' <span title="' + esc(T('verifiziert')) + '">✔</span>' : '') + (c.unread ? ' <span class="vx-badge sm">' + c.unread + '</span>' : '')
                + '<small>' + esc(c.last ? (c.last.me ? T('Du') + ': ' : '') + String(c.last.text).slice(0, 60) : '') + '</small></button>').join('') : '<p class="small muted">' + esc(T('Noch keine Unterhaltungen.')) + '</p>')
            + '<div class="nc-row ch-tools"><button type="button" class="btn btn-sm' + (chat.view === 'favs' ? ' btn-gold' : '') + '" data-chview="favs">★ ' + esc(T('Gemerkt')) + '</button><button type="button" class="btn btn-sm' + (chat.view === 'newgroup' ? ' btn-gold' : '') + '" data-chview="newgroup">👥 ' + esc(T('Neue Gruppe')) + '</button><button type="button" class="btn btn-sm' + (chat.view === 'devices' ? ' btn-gold' : '') + '" data-chview="devices">📱 ' + esc(T('Geräte')) + '</button>' + (window.NexusVoice ? '<button type="button" class="btn btn-sm' + (chat.view === 'voice' ? ' btn-gold' : '') + '" data-chview="voice">📞 ' + esc(T('Anrufe')) + '</button>' : '') + '</div>'
            + '<p class="small muted">🔒 ' + esc(T('Ende-zu-Ende-verschlüsselt: Nur du und dein Gegenüber können die Nachrichten lesen – auch die GhostNode-Webseite nicht.')) + '</p></div>';
        if (chat.view === 'favs') return '<div class="ch-wrap' + (chat.uid || chat.view ? ' has-open' : '') + '">' + left + '<div class="nc-card ch-conv"><h4><button type="button" class="btn btn-sm ch-back" data-chback="1">←</button> ★ ' + esc(T('Gemerkte Nachrichten')) + '</h4>'
            + (chat.favs ? (chat.favs.length ? chat.favs.map(f => '<div class="ch-fav"><button type="button" class="nc-link" data-chopen="' + esc(f.conv) + '">' + esc(f.name || f.conv.slice(0, 13) + '…') + '</button>' + chMsg(f.msg, null, true) + '</div>').join('') : '<p class="vx-empty">' + esc(T('Noch nichts gemerkt – bei einer Nachricht auf ★ tippen.')) + '</p>') : '<div class="vx-loading">…</div>') + '</div></div>';
        if (chat.view === 'newgroup') return '<div class="ch-wrap has-open">' + left + '<div class="nc-card ch-conv"><h4><button type="button" class="btn btn-sm ch-back" data-chback="1">←</button> 👥 ' + esc(T('Neue Gruppe')) + '</h4>'
            + '<form class="ch-gnew"><label>' + esc(T('Gruppenname')) + '<input type="text" name="name" maxlength="40" required></label>'
            + '<label>' + esc(T('Mitglieder (VRChat-User-IDs oder Profil-Links, mit Komma getrennt)')) + '<textarea name="members" rows="2"></textarea></label>'
            + (Object.keys(names).length ? '<div class="ch-gpick">' + Object.entries(names).sort((x, y) => String(x[1]).localeCompare(String(y[1]))).map(([id, n]) => '<label class="check small"><input type="checkbox" name="pick" value="' + esc(id) + '"> ' + esc(n) + '</label>').join('') + '</div>' : '')
            + '<p class="small muted">🔒 ' + esc(T('Gruppen sind Ende-zu-Ende-verschlüsselt: Jedes Mitglied bekommt die Schlüssel nur über die verschlüsselten 1:1-Verbindungen. Wird jemand entfernt, entstehen neue Schlüssel – ab dann liest die Person nichts mehr mit. Höchstens 50 Mitglieder.')) + '</p>'
            + '<button class="btn btn-gold">' + esc(T('Gruppe erstellen')) + '</button></form></div></div>';
        if (chat.view === 'voice') return '<div class="ch-wrap has-open">' + left + '<div class="nc-card ch-conv"><h4><button type="button" class="btn btn-sm ch-back" data-chback="1">←</button> 📞 ' + esc(T('Sprachanrufe')) + '</h4><div id="chVoiceSet"><div class="vx-loading">…</div></div></div></div>';
        if (chat.view === 'devices') return '<div class="ch-wrap' + (chat.uid || chat.view ? ' has-open' : '') + '">' + left + '<div class="nc-card ch-conv"><h4><button type="button" class="btn btn-sm ch-back" data-chback="1">←</button> 📱 ' + esc(T('Meine Chat-Geräte')) + '</h4>'
            + '<p class="small muted">' + esc(T('Jedes Gerät hat eigene Schlüssel. Nachrichten gehen an alle aktiven Geräte. Entferne Geräte, die du nicht mehr nutzt.')) + '</p>'
            + (chat.devs ? chat.devs.items.map(d => '<div class="nc-row ch-dev"><span>' + (d.current ? '💻 <b>' + esc(T('Dieses Gerät')) + '</b>' : '📱 ' + esc(T('Gerät')) + ' <code>' + esc(d.device.slice(0, 10)) + '</code>') + '<small> · ' + esc(T('eingerichtet')) + ' ' + esc(new Date(d.created * 1000).toLocaleDateString(window.nxLoc ? nxLoc() : 'de-DE'))
                + (d.last_seen ? ' · ' + esc(T('zuletzt aktiv')) + ' ' + esc(new Date(d.last_seen * 1000).toLocaleDateString(window.nxLoc ? nxLoc() : 'de-DE')) : '') + '</small></span>' + (d.current ? '' : '<button type="button" class="btn btn-sm btn-danger" data-chdevrm="' + esc(d.device) + '" style="margin-left:auto">🗑 ' + esc(T('Entfernen')) + '</button>') + '</div>').join('') : '<div class="vx-loading">…</div>')
            + '<label class="check small" style="margin-top:12px"><input type="checkbox" data-chreceipts="1"' + (!chat.prefs || chat.prefs.receipts ? ' checked' : '') + '> ' + esc(T('Gelesen-Häkchen senden (die andere Seite sieht ✓✓, wenn du gelesen hast)')) + '</label></div></div>';
        if (!o) return '<div class="ch-wrap' + (chat.uid || chat.view ? ' has-open' : '') + '">' + left + '<div class="nc-card ch-conv"><p class="vx-empty">' + esc(T('Unterhaltung wählen oder neu starten.')) + '</p></div></div>';
        const g = o.group;
        const nm = g ? '👥 ' + g.name : names[o.uid] || (list.find(c => c.uid === o.uid) || {}).name || o.uid;
        const gname = x => x.me ? T('Du') : (o.names || {})[x.uid] || names[x.uid] || x.uid.slice(0, 13) + '…';
        const ghead = !g ? '' : '<button type="button" class="nc-link" data-chgmem="1" style="margin-left:auto">👥 ' + g.members.length + ' ' + esc(T('Mitglieder')) + '</button></div>'
            + (g.left ? '<p class="small bad">' + esc(T('Du bist nicht mehr in dieser Gruppe.')) + ' <button type="button" class="nc-link" data-chgleave="1">' + esc(T('Aus der Liste entfernen')) + '</button></p>' : '')
            + (chat.showMembers && !g.left ? '<div class="tts-help ch-gmem">' + g.members.map(x => '<div class="nc-row"><span>' + esc(gname(x)) + (x.admin ? ' <small class="muted">(' + esc(T('Admin')) + ')</small>' : '') + '</span>'
                + (g.is_admin && !x.me ? '<button type="button" class="nc-x" data-chgrm="' + esc(x.uid) + '" title="' + esc(T('Entfernen')) + '" style="margin-left:auto">✕</button>' : '') + '</div>').join('')
                + (g.is_admin ? '<form class="nc-row ch-gadd"><input type="text" name="add" placeholder="' + esc(T('VRChat-User-ID oder Profil-Link')) + '" style="flex:1"><button class="btn btn-sm">＋</button></form>'
                    + '<form class="nc-row ch-gren"><input type="text" name="name" maxlength="40" value="' + esc(g.name) + '" style="flex:1"><button class="btn btn-sm">' + esc(T('Umbenennen')) + '</button></form>' : '')
                + '<div class="nc-row"><button type="button" class="btn btn-sm btn-danger" data-chgleave="1">🚪 ' + esc(T('Gruppe verlassen')) + '</button></div></div>' : '');
        return '<div class="ch-wrap' + (chat.uid || chat.view ? ' has-open' : '') + '">' + left + '<div class="nc-card ch-conv"><div class="nc-row"><button type="button" class="btn btn-sm ch-back" data-chback="1">←</button><h4 style="margin:0">' + esc(nm) + '</h4>'
            + (g ? ghead : (o.verified ? '<span class="vx-pill" style="--pc:#51e57e">✔ ' + esc(T('verifiziert')) + '</span>' : '') + (window.NexusVoice && o.ready ? '<button type="button" class="btn btn-sm" data-chcall="1" title="' + esc(T('Sprachanruf (Ende-zu-Ende-verschlüsselt)')) + '" style="margin-left:auto">📞</button>' : '') + '<button type="button" class="nc-link" data-chsafety="1"' + (window.NexusVoice && o.ready ? '' : ' style="margin-left:auto"') + '>🔐 ' + esc(T('Sicherheitsnummer')) + '</button></div>')
            + (o.changed ? '<div class="tts-help">⚠ ' + esc(T('Die Schlüssel dieser Person haben sich geändert (neues Gerät oder neu eingerichtet). Vergleiche die Sicherheitsnummer, bevor du Vertrauliches schreibst.')) + '</div>' : '')
            + (chat.showSafety ? '<div class="tts-help"><b>' + esc(T('Sicherheitsnummer')) + '</b><br><code class="ch-sn">' + esc(o.safety || '–') + '</code><br><span class="small">' + esc(T('Vergleicht die Nummer persönlich (z. B. in VRChat). Stimmt sie überein, liest niemand mit.')) + '</span><div class="nc-row"><button type="button" class="btn btn-sm btn-gold" data-chverify="1">✔ ' + esc(T('Stimmt überein')) + '</button></div></div>' : '')
            + (!o.ready && !g ? '<p class="small bad">' + esc(T('Diese Person hat den Chat noch nicht eingerichtet (muss Community → Chat einmal öffnen).')) + '</p>' : '')
            + ((o.pins || []).length ? '<div class="ch-pins">' + o.pins.map(id => (o.messages || []).find(m => m.id === id)).filter(Boolean).map(m => '<button type="button" class="ch-pin" data-chjump="' + esc(m.id) + '">📌 ' + esc(chSnip(m)) + '</button>').join('') + '</div>' : '')
            + '<div class="ch-msgs">' + (o.messages || []).map(m => chMsg(m, o)).join('') + '</div>'
            + (chat.reply ? '<div class="ch-replying">↩ ' + esc(T('Antwort auf')) + ': <i>' + esc(chSnip(chat.reply)) + '</i><button type="button" class="nc-x" data-chreplyx="1">✕</button></div>' : '')
            + (chat.editing ? '<div class="ch-replying">✎ ' + esc(T('Nachricht bearbeiten')) + '<button type="button" class="nc-x" data-cheditx="1">✕</button></div>' : '')
            + '<form class="ch-comp nc-row">' + (window.NexusMD ? window.NexusMD.toolbar() : '') + '<textarea name="text" rows="2" maxlength="4000" placeholder="' + esc(T('Verschlüsselte Nachricht …')) + '" style="flex:1"' + (o.ready ? '' : ' disabled') + '>' + esc(chat.editing ? chat.editing.text : '') + '</textarea>'
            + '<label class="btn btn-sm" title="' + esc(T('Bild oder GIF senden (verschlüsselt)')) + '">🖼<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-chimg="1" hidden' + (o.ready ? '' : ' disabled') + '></label>'
            + '<button type="button" class="btn btn-sm" data-chhr="1" title="' + esc(T('Aktuellen Puls teilen')) + '"' + (o.ready ? '' : ' disabled') + '>💓</button>'
            + '<button class="btn btn-sm btn-gold"' + (o.ready ? '' : ' disabled') + '>' + esc(T(chat.editing ? 'Speichern' : 'Senden')) + '</button></form></div></div>';
    }
    function chatLoad(poll) { return api('chat_list', poll ? { poll: '1' } : {}).then(d => { chat.list = d.items; nav(); if (sub === 'chat') render(); }).catch(e => { toast('⚠ ' + e.message, true); }); }
    function chatOpen(uid) { chat.uid = uid; chat.showSafety = false; chat.showMembers = false; chat.view = ''; chat.reply = null; chat.editing = null; return api('chat_open', { uid }).then(d => { chat.open = d; render(); chatLoad(); }).catch(e => toast('⚠ ' + e.message, true)); }
    /** Feed alle 10 s auffrischen (neue Beiträge, Reaktionen) – nicht beim Tippen */
    /** Chat-Feed füllt genau den sichtbaren Bereich (Eingabe immer unten sichtbar) */
    function fitFeed() {
        const f = box && box.querySelector('.cm-feed.chatlike');
        if (!f || !f.offsetParent) return;
        f.style.height = Math.max(360, window.innerHeight - f.getBoundingClientRect().top - 18) + 'px';
    }
    window.addEventListener('resize', () => fitFeed());
    function feedTimer() {
        clearInterval(feedTimer.t);
        feedTimer.t = setInterval(() => {
            if (!box || !box.offsetParent || (sub !== 'feed' && sub !== 'nsfw')) { clearInterval(feedTimer.t); return; }
            if (document.hidden || busy || (box.contains(document.activeElement) && document.activeElement.matches('textarea, input'))) return;
            api('comm_feed', { rating: sub === 'nsfw' ? 'nsfw' : 'sfw' }).then(d => {
                const before = JSON.stringify(items.slice(0, d.items.length));
                const ids = new Set(d.items.map(x => x.id));
                items = d.items.concat(items.filter(x => !ids.has(x.id) && x.id < (d.items.length ? d.items[d.items.length - 1].id : 0)));
                if (JSON.stringify(items.slice(0, d.items.length)) !== before) render();
            }).catch(() => {});
        }, 10000);
    }
    function chatTimer() {
        clearInterval(chat.timer);
        chat.timer = setInterval(() => {
            if (!box || !box.offsetParent || sub !== 'chat') { clearInterval(chat.timer); api('chat_blur').catch(() => {}); return; }
            if (document.hidden) return;
            if (chat.uid && !chat.view) api('chat_open', { uid: chat.uid }).then(d => { const old = JSON.stringify(chat.open && chat.open.messages); chat.open = d; if (JSON.stringify(d.messages) !== old) render(); }).catch(() => {});
            else chatLoad(true);
        }, 4000);
    }
    // 4.0: Pride-Profilthemen (Farbstreifen im Profil; gespeichert als „theme“ im Community-Profil)
    const PRIDE = {
        rainbow: ['🏳️‍🌈 Regenbogen', ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787']],
        progress: ['🏳️‍🌈 Progress', ['#000000', '#784f17', '#5bcefa', '#f5a9b8', '#ffffff', '#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787']],
        trans: ['🏳️‍⚧️ Trans', ['#5bcefa', '#f5a9b8', '#ffffff', '#f5a9b8', '#5bcefa']],
        bi: ['💗💜💙 Bi', ['#d60270', '#d60270', '#9b4f96', '#0038a8', '#0038a8']],
        pan: ['💖💛💙 Pan', ['#ff218c', '#ffd800', '#21b1ff']],
        lesbian: ['🧡🤍💗 Lesbisch', ['#d52d00', '#ff9a56', '#ffffff', '#d362a4', '#a30262']],
        gay: ['💚🤍💙 Schwul (MLM)', ['#078d70', '#26ceaa', '#98e8c1', '#ffffff', '#7bade2', '#5049cc', '#3d1a78']],
        nonbinary: ['💛🤍💜🖤 Nichtbinär', ['#fcf434', '#ffffff', '#9c59d1', '#2c2c2c']],
        genderfluid: ['🌊 Genderfluid', ['#ff76a4', '#ffffff', '#c011d7', '#000000', '#2f3cbe']],
        ace: ['🖤🩶🤍💜 Asexuell', ['#000000', '#a3a3a3', '#ffffff', '#800080']],
        aro: ['💚🤍🩶🖤 Aromantisch', ['#3da542', '#a7d379', '#ffffff', '#a9a9a9', '#000000']],
        intersex: ['💛💜 Intersex', ['#ffd800', '#7902aa', '#ffd800']],
        agender: ['🖤🩶🤍💚 Agender', ['#000000', '#bcc4c7', '#ffffff', '#b7f684', '#ffffff', '#bcc4c7', '#000000']],
    };
    const prideBg = k => { const f = PRIDE[k]; if (!f) return ''; const n = f[1].length; return 'linear-gradient(90deg,' + f[1].map((c, i) => c + ' ' + (i / n * 100).toFixed(2) + '% ' + ((i + 1) / n * 100).toFixed(2) + '%').join(',') + ')'; };
    window.NexusPride = {
        list: PRIDE, bg: prideBg,
        stripe: k => (PRIDE[k] ? '<div class="nx-pride" title="' + esc(T(PRIDE[k][0])) + '" style="background:' + prideBg(k) + '"></div>' : ''),
        select: cur => '<label class="small">🌈 ' + esc(T('Profil-Thema')) + ' <select name="theme"><option value="">' + esc(T('Keins')) + '</option>' + Object.entries(PRIDE).map(([k, v]) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(T(v[0])) + '</option>').join('') + '</select></label>',
    };
    function profileHtml() {
        if (!prof) return '<div class="vx-loading">…</div>';
        const p = prof;
        if (profEdit && p.own) return '<form class="nc-card cm-pform"><h4>✎ ' + esc(T('Profil bearbeiten')) + '</h4>'
            + '<textarea name="bio" rows="4" maxlength="1000" placeholder="' + esc(T('Über mich')) + '">' + esc(p.bio) + '</textarea>'
            + '<div class="nc-row"><input type="text" name="pronouns" maxlength="40" placeholder="' + esc(T('Pronomen')) + '" value="' + esc(p.pronouns) + '"><input type="text" name="languages" maxlength="100" placeholder="' + esc(T('Sprachen')) + '" value="' + esc(p.languages) + '"></div>'
            + '<input type="text" name="interests" maxlength="300" placeholder="' + esc(T('Interessen (mit Komma)')) + '" value="' + esc(p.interests) + '">'
            + '<input type="text" name="links" maxlength="800" placeholder="' + esc(T('Links (https://…, mit Komma)')) + '" value="' + esc((p.links || []).join(', ')) + '">'
            + '<div class="nc-row">' + window.NexusPride.select(p.theme || '') + '</div>'
            + (window.NexusProfile18 ? window.NexusProfile18.factsForm(p.facts) : '')
            + '<div class="nc-row"><label class="btn btn-sm">🖼 ' + esc(T('Profilbild')) + '<input type="file" accept="image/*" data-cav="avatar" hidden></label><label class="btn btn-sm">🖼 ' + esc(T('Banner')) + '<input type="file" accept="image/*" data-cav="banner" hidden></label>'
            + '<button class="btn btn-sm btn-gold" style="margin-left:auto">' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm" data-cpedit="0">' + esc(T('Abbrechen')) + '</button></div></form>';
        // 3.2: Reiter – Profil · Status & VRChat (nur eigenes) · 🔞 18+-Profil (wie im Profil-Fenster)
        const has18 = p.nsfw_facts !== undefined || (p.own && acct && acct.age && acct.age.verified);
        const tabs = [['main', '👤 ' + T('Profil')]].concat(p.own ? [['acct', '⚙ ' + T('Status & VRChat')]] : []).concat(has18 ? [['p18', '🔞 ' + T('18+-Profil')]] : []);
        if (!tabs.some(t => t[0] === profTab)) profTab = 'main';
        const bar = '<div class="u-tabs cm-ptabs">' + tabs.map(([k, l]) => '<button type="button" data-cptab="' + k + '" class="' + (k === profTab ? 'on' : '') + '">' + esc(l) + '</button>').join('') + '</div>';
        if (profTab === 'acct') return bar + '<div id="cmAcctSlot"></div>';
        if (profTab === 'p18') return bar + p18Html(p);
        return bar + '<div class="cm-pgrid' + (p.own ? ' two' : '') + '"><div class="cm-prof">' + (p.banner ? '<div class="cm-banner" style="background-image:url(nexus.php?cimg=' + esc(p.banner) + ')"></div>' : '')
            + window.NexusPride.stripe(p.theme) + card('', '<div class="cm-phead">' + (p.avatar ? '<img class="cm-pav" src="nexus.php?cimg=' + esc(p.avatar) + '" alt="">' : '<span class="cm-pav">👤</span>') + '<div><h3>' + esc(p.name) + '</h3>'
                + '<div class="small muted">' + [p.pronouns, p.languages].filter(Boolean).map(esc).join(' · ') + '</div>'
                + (window.NexusProfile18 ? window.NexusProfile18.factsView(p.facts) : '')
                + '<div>' + (p.verified18 ? '<span class="vx-pill" style="--pc:#51e57e">✔ Verified 18+</span>' : '') + '<span class="vx-pill">' + p.posts + ' ' + esc(T('Beiträge')) + '</span>' + (p.followers !== undefined ? '<span class="vx-pill">' + p.followers + ' ' + esc(T('Folgende')) + '</span><span class="vx-pill">' + esc(T('folgt')) + ' ' + p.following + '</span>' : '') + '</div></div>'
                + (p.own ? '<button type="button" class="btn btn-sm" data-cpedit="1" style="margin-left:auto">✎ ' + esc(T('Bearbeiten')) + '</button>' : '<button type="button" class="btn btn-sm' + (p.i_follow ? '' : ' btn-gold') + '" data-cfollow="' + esc(p.vrc_id) + '" data-on="' + (p.i_follow ? '' : '1') + '" style="margin-left:auto">' + esc(p.i_follow ? '✓ ' + T('Folge ich') : '⭐ ' + T('Folgen')) + '</button><button type="button" class="btn btn-sm" data-user="' + esc(p.vrc_id) + '">VRChat-' + esc(T('Profil')) + '</button>') + '</div>'
                + (p.bio ? '<p>' + esc(p.bio).replace(/\n/g, '<br>') + '</p>' : '') + (p.interests ? '<p class="small">✨ ' + esc(p.interests) + '</p>' : '')
                + ((p.links || []).length ? '<p class="small">' + p.links.map(l => '<a href="' + esc(l) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(l.replace(/^https:\/\//, '')) + '</a>').join(' · ') + '</p>' : '')
)
            + (p.feed && p.feed.length ? p.feed.map(x => post(x)).join('') : '') + '</div>' + (p.own ? vrcCard() : '') + '</div>';
    }
    /** 5.3: Entdecken – Antworten an mich, Trends der Woche (Hashtags, meistbeachtet, aktiv) */
    function discoverHtml() {
        if (!disc) return '<div class="vx-loading">' + esc(T('Lade …')) + '</div>';
        const t = disc.trends || { tags: [], top: [], people: [] }, ib = disc.inbox || { items: [], seen: 0 };
        return '<div class="cm-pgrid two"><div>' + card('💬 ' + esc(T('Antworten an mich')), ib.items.length ? ib.items.slice(0, 20).map(r => '<div class="cm-inbox' + (r.id > ib.seen ? ' new' : '') + '">' + post(r, true) + '<button type="button" class="nc-link" data-copen="' + r.parent + '">→ ' + esc(T('zum Beitrag')) + '</button></div>').join('') : '<p class="small muted">' + esc(T('Noch keine Antworten.')) + '</p>')
            + '</div><div>' + card('🔥 ' + esc(T('Trends (7 Tage)')), (t.tags.length ? '<div class="nc-row" style="flex-wrap:wrap">' + t.tags.map(x => '<button type="button" class="chip" data-ctag="' + esc(x.tag) + '">#' + esc(x.tag) + ' <small>' + x.n + '</small></button>').join('') + '</div>' : '<p class="small muted">' + esc(T('Noch keine Hashtags diese Woche.')) + '</p>')
                + (t.people.length ? '<h4>' + esc(T('Aktiv')) + '</h4>' + t.people.map(x => '<a href="#" class="chip" data-cprof="' + esc(x.vrc_id) + '">👤 ' + esc(x.name || x.vrc_id.slice(0, 12)) + ' · ' + x.n + '</a>').join(' ') : ''))
            + (t.top.length ? card('⭐ ' + esc(T('Meistbeachtet')), t.top.map(p => post(p)).join('')) : '') + '</div></div>';
    }
    function loadDiscover() {
        return Promise.all([api('comm_trends', { rating: 'sfw' }), api('comm_inbox', { seen: '1' })]).then(([trends, inbox]) => { disc = { trends, inbox, unread: 0 }; render(); }).catch(e => toast('⚠ ' + e.message, true));
    }
    /** 3.2.3: eigenes VRChat-Profil (alles aus dem Profil) neben dem Community-Profil */
    let vrcMe = null, vrcBusy = false;
    function vrcCard() {
        if (!vrcMe) {
            if (!vrcBusy && me && me.vrc_id) { vrcBusy = true; api('user', { id: me.vrc_id }).then(d => { vrcMe = d.user; }).catch(() => { vrcMe = { error: true }; }).finally(() => { vrcBusy = false; if (sub === 'profile' && profTab === 'main') render(); }); }
            return card('🎮 ' + esc(T('VRChat-Profil')), '<div class="vx-loading">…</div>', 'cm-vrc');
        }
        if (vrcMe.error) return card('🎮 ' + esc(T('VRChat-Profil')), '<p class="small muted">' + esc(T('VRChat-Profil gerade nicht abrufbar.')) + '</p>', 'cm-vrc');
        const u = vrcMe, l = u.loc || {};
        const facts = [[T('Status'), UI.statusDot(u.status) + ' ' + esc(u.status_desc || u.status || '')], [T('Pronomen'), esc(u.pronouns || '–')], [T('Plattform'), esc(u.platform || '–')],
            [T('Dabei seit'), esc(u.joined || '–')], [T('Ort'), esc(l.world_info ? l.world_info.name : (l.label || l.kind || '–'))]];
        return card('🎮 ' + esc(T('VRChat-Profil')) + '<button type="button" class="btn btn-sm" data-cptab="acct" style="margin-left:auto">✎ ' + esc(T('Bearbeiten')) + '</button>',
            '<div class="cm-phead">' + UI.img(u.image, 'cm-pav', u.name) + '<div><h3 data-no-i18n>' + esc(u.name) + '</h3><div><span class="vx-pill" style="--pc:' + esc(u.trust[1]) + '">' + esc(u.trust[0]) + '</span>'
                + (u.nexus_admin ? '<span class="vx-pill nx-admin-pill">👑 Nexus Admin</span>' : '') + '</div></div></div>'
            + '<dl class="vx-u-facts">' + facts.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>').join('') + '</dl>'
            + (u.bio_html ? '<div class="fmt cm-vbio">' + u.bio_html + '</div>' : '')
            + ((u.links || []).length ? '<p class="small">' + u.links.map(x => '<a href="' + esc(x) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(x.replace(/^https?:\/\//, '')) + '</a>').join(' · ') + '</p>' : '')
            + ((u.groups || []).length ? '<h4 class="ng-h">🛡 ' + esc(T('Gruppen')) + ' (' + u.groups.length + ')</h4><div class="vx-u-tags">' + u.groups.slice(0, 40).map(g => '<span class="vx-pill' + (g.rep ? ' rep' : '') + '" data-opengroup="' + esc(g.id) + '">' + (g.rep ? '★ ' : '') + esc(g.name) + '</span>').join('') + '</div>' : ''),
            'cm-vrc');
    }
    /** 3.1.1: 🔞 18+-Profil rechts neben dem Profil */
    function p18Html(p) {
        const P = window.NexusProfile18;
        if (!P) return '';
        const nsfwOn = !!((me && me.nsfw) || (acct && acct.age && acct.age.nsfw_on));
        // eigenes Profil ohne 18+-Teil vom Server: NSFW aus – oder die Webseite ist noch nicht auf dem Stand von 3.1.1
        if (p.nsfw_facts === undefined) return p.own && acct && acct.age && acct.age.verified ? card('🔞 ' + esc(T('18+-Profil')), '<p class="small">' + esc(T(nsfwOn ? 'Die GhostNode-Webseite kennt das 18+-Profil noch nicht – sie muss erst aktualisiert werden.' : 'Schalte oben rechts NSFW ein, um dein 18+-Profil zu bearbeiten.')) + '</p>', 'cm-p18') : '';
        const canEdit = p.own && nsfwOn;   // ohne eingeschaltetes NSFW speichert der Server den 18+-Teil nicht
        if (canEdit && p18Edit) return card('🔞 ' + esc(T('18+-Profil bearbeiten')), P.nsfwEditor(p.nsfw_facts, p.nsfw_bio), 'cm-p18');
        if (p.own && !canEdit) return card('🔞 ' + esc(T('18+-Profil')), '<p class="small">' + esc(T('Schalte oben rechts NSFW ein, um dein 18+-Profil zu bearbeiten.')) + '</p>' + P.nsfwView(p.nsfw_facts, p.nsfw_bio), 'cm-p18');
        return card('🔞 ' + esc(T('18+-Profil')) + (canEdit ? '<button type="button" class="btn btn-sm" data-p18e="1" style="margin-left:auto">✎ ' + esc(T('Bearbeiten')) + '</button>' : ''), linkBar(p) + P.nsfwView(p.nsfw_facts, p.nsfw_bio), 'cm-p18');
    }
    /** 6.0: Anfrage / Verbindung zu dieser Person */
    function linkBar(p) {
        if (p.own || !p.link18 || !(me && me.nsfw)) return '';
        const l = p.link18;
        const b = (a, label, gold) => '<button type="button" class="btn btn-sm' + (gold ? ' btn-gold' : '') + '" data-l18="' + a + '" data-vrc="' + esc(p.vrc_id) + '"' + (l.id ? ' data-rid="' + l.id + '"' : '') + '>' + label + '</button>';
        return '<div class="nc-row l18-bar">' + (l.state === 'none' ? b('send', '💌 ' + esc(T('18+-Anfrage senden')), true)
            : l.state === 'sent' ? '<span class="vx-pill">⏳ ' + esc(T('Anfrage gesendet')) + '</span>' + b('withdraw', esc(T('Zurückziehen')))
            : l.state === 'received' ? b('open', '💌 ' + esc(T('Anfrage beantworten')), true)
            : '<span class="vx-pill" style="--pc:#ff6fae">💞 ' + esc(T('Verbunden')) + '</span>' + b('compat', '💞 ' + esc(T('Kompatibilität'))) + b('consent', '🤝 ' + esc(T('Consent-Check')), true)) + '</div>';
    }
    /** 6.0: Seite „18+-Anfragen“ – Eingang, Gesendet, Verbindungen, Consent-Checks */
    function links18Html() {
        if (!links18) return '<div class="vx-loading">' + esc(T('Lade …')) + '</div>';
        const d = links18, nm = x => esc(x.name || x.vrc_id.slice(0, 12)), dt = ts => new Date(ts * 1000).toLocaleDateString(window.nxLoc ? nxLoc() : 'de-DE');
        const prof = x => '<a href="#" data-cprof="' + esc(x.vrc_id) + '"><b>' + nm(x) + '</b></a>';
        const sessFor = id => d.sessions.filter(s => s.with === id && ['proposed', 'ready'].includes(s.status));
        const LIGHT = { green: '🟢', yellow: '🟡', red: '🔴' };
        const terms = t => t ? LIGHT[t.light] + ' · ⏱ ' + t.minutes + ' min · 🛑 „' + esc(t.safeword) + '“' + (t.toys ? ' · 🎮 ' + esc(T('Spielzeug')) : '') + (t.limits ? '<div class="small">🚫 ' + esc(t.limits) + '</div>' : '') : '–';
        const consentForm = (id, rid, answer) => '<form class="l18-consent" data-cf="' + esc(id) + '"' + (rid ? ' data-sid="' + rid + '"' : '') + '><div class="nc-row">'
            + ['green', 'yellow', 'red'].map(l => '<label class="check"><input type="radio" name="light" value="' + l + '"' + (l === 'green' ? ' checked' : '') + '> ' + LIGHT[l] + ' ' + esc(T({ green: 'Bereit', yellow: 'Vorsichtig', red: 'Heute nicht' }[l])) + '</label>').join('') + '</div>'
            + '<input type="text" name="limits" maxlength="500" placeholder="' + esc(T('Grenzen für heute (optional), z. B. kein …')) + '"><div class="nc-row"><input type="text" name="safeword" maxlength="40" placeholder="' + esc(T('Safeword')) + '" value="Rot" style="width:140px">'
            + '<select name="minutes">' + [15, 30, 45, 60, 90, 120].map(m => '<option value="' + m + '"' + (m === 30 ? ' selected' : '') + '>' + m + ' min</option>').join('') + '</select><label class="check small"><input type="checkbox" name="toys"> 🎮 ' + esc(T('Spielzeug erlaubt')) + '</label></div>'
            + '<div class="nc-row"><button class="btn btn-sm btn-gold">' + esc(T(answer ? 'Zustimmen' : 'Consent-Check schicken')) + '</button>' + (answer ? '<button type="button" class="btn btn-sm" data-l18="sdecline" data-sid="' + rid + '">' + esc(T('Nein danke')) + '</button>' : '') + '</div></form>';
        return (d.remind ? '<div class="nc-card" style="border-color:var(--accent-gold)">⏳ ' + esc(T('Erinnerung')) + ': ' + d.remind + ' ' + esc(T('Anfrage(n) warten schon über 3 Tage auf deine Antwort – nach 14 Tagen laufen sie ab.')) + '</div>' : '')
            + '<div class="tts-help">💌 ' + esc(T('Anfragen gibt es nur zwischen Konten mit Verified 18+ und NSFW an. Erst wenn beide zustimmen, seid ihr verbunden – dann seht ihr Kompatibilität und könnt einen Consent-Check starten. Ablehnen bleibt anonym („nicht angenommen“).')) + '</div>'
            + '<div class="nc-grid">'
            + card('📥 ' + esc(T('Eingang')) + ' (' + d.incoming.length + ')', d.incoming.length ? d.incoming.map(r => '<div class="l18-item">' + prof(r) + ' <span class="small muted">' + esc(dt(r.created)) + '</span>' + (r.message ? '<div class="cm-text">' + esc(r.message) + '</div>' : '')
                + '<div class="nc-row"><button type="button" class="btn btn-sm btn-gold" data-l18="accept" data-rid="' + r.id + '">💞 ' + esc(T('Annehmen')) + '</button><button type="button" class="btn btn-sm" data-l18="decline" data-rid="' + r.id + '">' + esc(T('Ablehnen')) + '</button></div></div>').join('') : '<p class="small muted">' + esc(T('Keine offenen Anfragen.')) + '</p>')
            + card('💞 ' + esc(T('Verbindungen')) + ' (' + d.connections.length + ')', d.connections.length ? d.connections.map(c => {
                const ss = sessFor(c.vrc_id), open = ss.find(s => s.status === 'proposed' && !s.proposed_by_me), mine = ss.find(s => s.status === 'proposed' && s.proposed_by_me), ready = ss.find(s => s.status === 'ready');
                return '<div class="l18-item">' + prof(c) + ' <span class="small muted">' + esc(T('seit')) + ' ' + esc(dt(c.since)) + '</span>'
                    + '<div class="nc-row"><button type="button" class="btn btn-sm" data-l18="compat" data-vrc="' + esc(c.vrc_id) + '">💞 ' + esc(T('Kompatibilität')) + '</button>' + (!ss.length ? '<button type="button" class="btn btn-sm btn-gold" data-l18="consent" data-vrc="' + esc(c.vrc_id) + '">🤝 ' + esc(T('Consent-Check')) + '</button>' : '')
                    + '<button type="button" class="btn btn-sm btn-danger" data-l18="unlink" data-rid="' + c.id + '">' + esc(T('Lösen')) + '</button></div>'
                    + (compatOf && compatOf.id === c.vrc_id ? compatHtml(compatOf.d) : '')
                    + (consentFor === c.vrc_id && !ss.length ? consentForm(c.vrc_id, 0, false) : '')
                    + (open ? '<div class="l18-sess"><b>🤝 ' + nm(c) + ' ' + esc(T('fragt einen Consent-Check an')) + '</b><div class="small">' + terms(open.theirs) + '</div>' + consentForm(c.vrc_id, open.id, true) + '</div>' : '')
                    + (mine ? '<div class="l18-sess">⏳ ' + esc(T('Wartet auf Zustimmung')) + ' – ' + terms(mine.mine) + ' <button type="button" class="btn btn-sm" data-l18="send_end" data-sid="' + mine.id + '" data-r="cancel">' + esc(T('Zurückziehen')) + '</button></div>' : '')
                    + (ready ? '<div class="l18-sess ready"><b>✅ ' + esc(T('Session läuft')) + '</b> · ' + esc(T('bis')) + ' ' + esc(new Date(ready.ends * 1000).toLocaleTimeString(window.nxLoc ? nxLoc() : 'de-DE', { hour: '2-digit', minute: '2-digit' })) + '<div class="small">' + esc(T('Du')) + ': ' + terms(ready.mine) + '</div><div class="small">' + nm(c) + ': ' + terms(ready.theirs) + '</div>'
                        + '<div class="nc-row"><button type="button" class="btn btn-sm btn-danger" data-l18="send_end" data-sid="' + ready.id + '" data-r="safeword">🛑 ' + esc(T('Safeword – sofort beenden')) + '</button><button type="button" class="btn btn-sm" data-l18="send_end" data-sid="' + ready.id + '" data-r="done">' + esc(T('Fertig')) + '</button></div></div>' : '')
                    + '</div>';
            }).join('') : '<p class="small muted">' + esc(T('Noch keine Verbindungen – schick jemandem im 18+-Profil eine Anfrage.')) + '</p>')
            + card('📤 ' + esc(T('Gesendet')), d.outgoing.length ? d.outgoing.map(r => '<div class="l18-item">' + prof(r) + ' <span class="small muted">' + esc(dt(r.created)) + ' · ' + esc(T({ pending: 'wartet', not_accepted: 'nicht angenommen', withdrawn: 'zurückgezogen', expired: 'abgelaufen', ended: 'gelöst' }[r.status] || r.status)) + '</span>'
                + (r.status === 'pending' ? ' <button type="button" class="btn btn-sm" data-l18="withdraw" data-rid="' + r.id + '">' + esc(T('Zurückziehen')) + '</button>' : '') + '</div>').join('') : '<p class="small muted">–</p>')
            + '</div>';
    }
    function compatHtml(c) {
        const K = {}; ((window.NexusProfile18 && window.NexusProfile18.KINKS) || []).forEach(([, l]) => l.forEach(([k, n]) => { K[k] = n; }));
        const lst = (a, ico) => a.map(x => '<span class="vx-pill">' + ico + ' ' + esc(K[x.k] || x.k) + ' <small>' + (x.dir === 'me' ? '↙' : '↗') + '</small></span>').join('');
        return '<div class="l18-compat"><b>💞 ' + (c.score === null ? esc(T('Noch zu wenig ausgefüllt')) : c.score + ' %') + '</b>' + (c.match.length ? '<div>' + lst(c.match, '💚') + '</div>' : '') + (c.maybe.length ? '<div>' + lst(c.maybe, '💛') + '</div>' : '')
            + (c.conflict.length ? '<div>' + lst(c.conflict, '🚫') + '</div>' : '') + '<p class="small muted">' + esc(T(c.note || '')) + ' ↙ ' + esc(T('du empfängst')) + ' · ↗ ' + esc(T('du gibst')) + '</p></div>';
    }
    function loadLinks18() { return api('comm_req_list').then(d => { links18 = d; render(); }).catch(e => toast('⚠ ' + e.message, true)); }
    function l18Click(t) {
        const a = t.dataset.l18, rid = t.dataset.rid, vrc = t.dataset.vrc, sid = t.dataset.sid;
        const done = d => { if (d && d.msg) toast(d.msg); if (sub === 'profile' && prof) loadProfile(prof.vrc_id); else loadLinks18(); };
        const err = x => toast(x.message, true);
        if (a === 'send') { const m = prompt(T('Kurze Nachricht zur Anfrage (optional):'), ''); if (m === null) return; return api('comm_req_send', { id: vrc, message: m }).then(done).catch(err); }
        if (a === 'open') return go('links18');
        if (a === 'accept' || a === 'decline') return api('comm_req_answer', { id: rid, accept: a === 'accept' ? '1' : '' }).then(done).catch(err);
        if (a === 'withdraw') return api('comm_req_withdraw', { id: rid }).then(done).catch(err);
        if (a === 'unlink') { if (!confirm(T('Verbindung lösen? Laufende Consent-Checks enden dann.'))) return; return api('comm_req_withdraw', { id: rid }).then(done).catch(err); }
        if (a === 'compat') { if (sub !== 'links18') { go('links18'); } return api('comm_compat', { id: vrc }).then(d => { compatOf = { id: vrc, d }; render(); }).catch(err); }
        if (a === 'consent') { consentFor = vrc; if (sub !== 'links18') go('links18'); else render(); return; }
        if (a === 'sdecline') return api('comm_sess_answer', { id: sid, agree: '' }).then(done).catch(err);
        if (a === 'send_end') {
            if (t.dataset.r === 'safeword') api('toys_stop', { device: 'all' }).catch(() => {});   // Spielzeug sofort aus
            return api('comm_sess_end', { id: sid, reason: t.dataset.r }).then(done).catch(err);
        }
    }
    function l18Submit(f) {
        const terms = { light: (f.querySelector('[name=light]:checked') || {}).value || 'yellow', limits: f.limits.value, safeword: f.safeword.value, minutes: +f.minutes.value, toys: f.toys.checked };
        const p = f.dataset.sid ? api('comm_sess_answer', { id: f.dataset.sid, agree: '1', terms: JSON.stringify(terms) }) : api('comm_sess_start', { id: f.dataset.cf, terms: JSON.stringify(terms) });
        p.then(d => { consentFor = ''; toast(d.msg); loadLinks18(); }).catch(x => toast(x.message, true));
    }
    function _p18end() { /* Ende der 6.0-Bausteine */ }
    const profBody = p => ({ bio: p.bio, pronouns: p.pronouns, languages: p.languages, interests: p.interests, links: p.links || [], nsfw_bio: p.nsfw_bio || '', avatar: p.avatar || '', banner: p.banner || '', theme: p.theme || '' });
    function modHtml() {
        if (!modData) return '<div class="vx-loading">…</div>';
        const d = modData;
        const btn = (k, l, extra, cls) => '<button type="button" class="btn btn-sm ' + (cls || '') + '" data-cmod="' + k + '"' + extra + '>' + l + '</button>';
        return '<div class="nc-grid">'
            + card('⚑ ' + esc(T('Meldungen')) + ' (' + d.reports.length + ')', d.reports.length ? d.reports.map(r => '<div class="cm-q"><div class="small muted">#' + r.post_id + ' · ' + esc(when(r.created)) + ' · ' + esc(T('Grund')) + ': ' + esc(r.reason) + (r.rating === 'nsfw' ? ' · 🔞' : '') + '</div>'
                + '<div class="cm-text">' + esc(String(r.text || '').slice(0, 300)) + '</div><div class="nc-row">'
                + btn('hide', '🙈 ' + esc(T('Ausblenden')), ' data-id="' + r.post_id + '"') + (r.rating !== 'nsfw' ? btn('nsfw', '🔞 ' + esc(T('Als NSFW umstufen')), ' data-id="' + r.post_id + '"') : '')
                + btn('delete', '🗑 ' + esc(T('Löschen')), ' data-id="' + r.post_id + '"', 'btn-danger') + btn('mute', '🔇 24 h', ' data-vrc="' + esc(r.author) + '"') + btn('ban', '⛔ ' + esc(T('Sperren')), ' data-vrc="' + esc(r.author) + '"', 'btn-danger')
                + btn('resolve', '✔ ' + esc(T('Erledigt')), ' data-report="' + r.id + '"') + '</div></div>').join('') : '<p class="small muted">' + esc(T('Keine offenen Meldungen.')) + '</p>', 'ad-wide')
            + card('🖼 ' + esc(T('NSFW-Bilder zur Freigabe')) + ' (' + d.media.length + ')', d.media.length ? '<div class="cm-mq">' + d.media.map(m => '<figure><img loading="lazy" src="nexus.php?cimg=' + esc(m.id) + '" alt=""><figcaption class="nc-row">'
                + btn('media_ok', '✔', ' data-media="' + esc(m.id) + '"', 'btn-gold') + btn('media_reject', '✖', ' data-media="' + esc(m.id) + '"', 'btn-danger') + '</figcaption></figure>').join('') + '</div>' : '<p class="small muted">' + esc(T('Nichts zu prüfen.')) + '</p>', 'ad-wide')
            + card('⏳ ' + esc(T('Wartende Beiträge')) + ' (' + d.pending.length + ')', d.pending.length ? d.pending.map(p => post(p) + '<div class="nc-row">' + btn('approve', '✔ ' + esc(T('Freigeben')), ' data-id="' + p.id + '"', 'btn-gold') + btn('delete', '🗑', ' data-id="' + p.id + '"', 'btn-danger') + '</div>').join('') : '<p class="small muted">–</p>')
            + card('🔇 ' + esc(T('Sanktionen')), (d.sanctions.length ? d.sanctions.map(s => '<div class="nc-row"><code class="small">' + esc(s.vrc_id) + '</code><span class="small">' + (s.banned ? '⛔ ' + esc(T('gesperrt')) : '🔇 ' + esc(T('bis')) + ' ' + esc(new Date(s.mute_until * 1000).toLocaleString())) + (s.note ? ' · ' + esc(s.note) : '') + '</span>' + btn('unban', esc(T('Aufheben')), ' data-vrc="' + esc(s.vrc_id) + '"') + '</div>').join('') : '<p class="small muted">–</p>')
                + '<form class="nc-row cm-sform"><input type="text" name="vrc" placeholder="usr_…" style="flex:1"><input type="number" name="hours" min="1" max="2160" value="24" style="width:80px"><button class="btn btn-sm">🔇</button></form>')
            + card('📜 ' + esc(T('Protokoll')), '<pre class="ad-log">' + esc(d.log.map(l => new Date(l.ts * 1000).toLocaleString() + ' · ' + l.action + (l.target ? ' · ' + l.target : '') + (l.detail ? ' · ' + l.detail : '')).join('\n') || '–') + '</pre>', 'ad-wide')
            + '</div>';
    }

    // ---------- Daten ----------
    function loadMe() { return Promise.all([api('comm_me').then(d => { me = d; }).catch(e => { me = { error: e.message }; }), api('acct_get').then(d => { acct = d; }).catch(() => {})]); }
    function loadFeed(more) {
        const before = more && items.length ? items[items.length - 1].id : 0;
        return api('comm_feed', { rating: sub === 'nsfw' ? 'nsfw' : 'sfw', before, q: filt.q, tag: filt.tag, mode: sub === 'following' || sub === 'saved' ? sub : '' }).then(d => { items = more ? items.concat(d.items) : d.items; render(); }).catch(e => toast('⚠ ' + e.message, true));
    }
    function loadProfile(id) { prof = null; render(); return api('comm_profile', id ? { id } : {}).then(d => { prof = d.profile; return api('comm_feed', { rating: 'sfw', author: prof.vrc_id }); }).then(d => { prof.feed = d.items; render(); }).catch(e => toast('⚠ ' + e.message, true)); }
    function loadMod() { return api('comm_mod_queue').then(d => { modData = d; render(); }).catch(e => toast('⚠ ' + e.message, true)); }
    function go(s, arg) {
        sub = s; openThread = {};
        if (s === 'nsfw' && !(me && me.nsfw)) sub = 'feed';
        if (window.NexusUI.store) window.NexusUI.store.set('cmtSub', sub);   // 3.1: letzte Unterseite merken
        if (FEEDS.includes(sub)) { items = []; render(); loadFeed(); }
        else if (sub === 'discover') { disc = null; render(); loadDiscover(); }
        else if (sub === 'links18') { if (!(me && me.nsfw)) { sub = 'feed'; return go('feed'); } compatOf = null; render(); loadLinks18(); }
        else if (sub === 'profile') { profEdit = false; p18Edit = false; loadProfile(arg); }
        else if (sub === 'mod') { modData = null; render(); loadMod(); }
        else if (sub === 'chat') { render(); chatLoad(true).then(() => { if (arg) chatOpen(arg); }); chatTimer(); }
        else render();
    }
    const replace = p => { items = items.map(x => x.id === p.id ? Object.assign(x, p) : x); Object.values(openThread).forEach(t => { t.replies = (t.replies || []).map(x => x.id === p.id ? p : x); }); };
    function upload(file, rating) {
        const body = new FormData(); body.append('act', 'comm_upload'); body.append('rating', rating); body.append('file', file);
        return fetch('nexus.php', { method: 'POST', credentials: 'same-origin', body }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d; });
    }

    function bind() {
        // 3.7.3: Freundesliste im Chat beim Tippen filtern (ohne neu zu zeichnen)
        let qTimer;
        box.addEventListener('input', e => {
            if (e.target.matches('[data-cq]')) { clearTimeout(qTimer); qTimer = setTimeout(() => { filt.q = e.target.value.trim(); filt.focus = true; loadFeed(); }, 400); return; }   // 5.3: Suche im Feed
            if (!e.target.matches('.ch-new [name=uid]')) return;
            const q = e.target.value.trim().toLowerCase(), isId = /^usr_|vrchat\.com/.test(q);
            if (q && !isId && !chat.showOff && box.querySelectorAll('.ch-pick .ch-fr').length && ![...box.querySelectorAll('.ch-pick .ch-fr')].some(b => b.dataset.fname.includes(q))) { chat.showOff = true; render(); const inp = box.querySelector('.ch-new [name=uid]'); if (inp) { inp.value = e.target.value; inp.focus(); } }
            box.querySelectorAll('.ch-pick .ch-fr').forEach(b => { b.hidden = !!q && !isId && !b.dataset.fname.includes(q); });
        });
        const top = document.getElementById('cmtSub');
        if (top) top.addEventListener('click', e => { const b = e.target.closest('[data-csub]'); if (b) go(b.dataset.csub); });
        if (top) top.addEventListener('change', e => {
            const c = e.target.closest('[data-cnsfw]');
            if (!c) return;
            if (c.checked && !confirm(T('NSFW einschalten? Damit bestätigst du, volljährig zu sein. Inhalte bleiben getrennt und lassen sich jederzeit wieder ausschalten.'))) { c.checked = false; return; }
            c.disabled = true;
            api('acct_nsfw', { on: c.checked ? '1' : '0' }).then(d => { acct = d; if (d.msg) toast(d.msg); if (window.NexusNsfw) window.NexusNsfw.refresh(); return loadMe(); })
                .then(() => { if (sub === 'nsfw' && !(me && me.nsfw)) sub = 'feed'; go(sub); }).catch(x => { toast('⚠ ' + x.message, true); c.checked = !c.checked; c.disabled = false; });
        });
        box.addEventListener('click', e => {
            const t = e.target;
            const pf = t.closest('[data-cprof]'); if (pf) { e.preventDefault(); return go('profile', pf.dataset.cprof); }
            const l18 = t.closest('[data-l18]'); if (l18) { e.preventDefault(); return l18Click(l18); }   // 6.0
            const tg = t.closest('[data-ctag]'); if (tg) { e.preventDefault(); filt.tag = tg.dataset.ctag; filt.q = ''; return go(sub === 'nsfw' ? 'nsfw' : 'feed'); }
            if (t.closest('[data-ctagx]')) { filt.tag = ''; return go(sub); }
            const sv = t.closest('[data-csave]'); if (sv) { const on = !sv.classList.contains('on'); return api('comm_save', { id: sv.dataset.csave, on: on ? '1' : '' }).then(d => { toast(d.msg); items.forEach(x => { if (x.id === +sv.dataset.csave) x.saved = on; }); if (prof && prof.feed) prof.feed.forEach(x => { if (x.id === +sv.dataset.csave) x.saved = on; }); if (sub === 'saved' && !on) items = items.filter(x => x.id !== +sv.dataset.csave); render(); }).catch(x => toast(x.message, true)); }
            const fo = t.closest('[data-cfollow]'); if (fo) return api('comm_follow', { id: fo.dataset.cfollow, on: fo.dataset.on }).then(d => { toast(d.msg); loadProfile(fo.dataset.cfollow); }).catch(x => toast(x.message, true));
            const op = t.closest('[data-copen]'); if (op) return api('comm_thread', { id: +op.dataset.copen }).then(d => { sub = 'feed'; items = [d.post]; openThread = { [d.post.id]: d }; render(); }).catch(x => toast(x.message, true));
            const u = t.closest('[data-user]'); if (u) { e.preventDefault(); return UI.openUser(u.dataset.user); }
            const re = t.closest('[data-cre]'); if (re) return api('comm_react', { id: re.dataset.id, emoji: re.dataset.cre }).then(d => { replace(d.post); if (prof && prof.feed) prof.feed = prof.feed.map(x => x.id === d.post.id ? d.post : x); render(); }).catch(x => toast(x.message, true));
            const th = t.closest('[data-cthread]'); if (th) { const id = +th.dataset.cthread; if (openThread[id]) { delete openThread[id]; return render(); } return api('comm_thread', { id }).then(d => { openThread[id] = d; replace(d.post); render(); }).catch(x => toast(x.message, true)); }
            const ed = t.closest('[data-cedit]'); if (ed) { const p = items.find(x => x.id === +ed.dataset.cedit) || Object.values(openThread).flatMap(x => x.replies).find(x => x.id === +ed.dataset.cedit); const v = prompt(T('Beitrag bearbeiten'), p ? p.text : ''); if (v === null) return; return api('comm_edit', { id: ed.dataset.cedit, text: v }).then(d => { replace(d.post); render(); }).catch(x => toast(x.message, true)); }
            const del = t.closest('[data-cdel]'); if (del) { if (!confirm(T('Beitrag löschen?'))) return; return api('comm_delete', { id: del.dataset.cdel }).then(() => { items = items.filter(x => x.id !== +del.dataset.cdel); Object.values(openThread).forEach(x => { x.replies = x.replies.filter(r => r.id !== +del.dataset.cdel); }); render(); }).catch(x => toast(x.message, true)); }
            const rp = t.closest('[data-crep]'); if (rp) { const r = prompt(T('Warum meldest du diesen Beitrag?')); if (!r) return; return api('comm_report', { id: rp.dataset.crep, reason: r }).then(d => toast(d.msg)).catch(x => toast(x.message, true)); }
            const more = t.closest('[data-cmore]'); if (more) return loadFeed(true);
            const co = t.closest('[data-chopen]'); if (co) return chatOpen(co.dataset.chopen);
            if (t.closest('[data-choff]')) { chat.showOff = !chat.showOff; return render(); }
            if (t.closest('[data-chback]')) { chat.uid = ''; chat.open = null; chat.view = ''; chat.reply = null; chat.editing = null; api('chat_blur').catch(() => {}); return render(); }   // 3.5 Handy: zurück zur Liste
            // ---- 3.4 Chat ----
            const cv = t.closest('[data-chview]');
            if (cv) {
                chat.view = chat.view === cv.dataset.chview ? '' : cv.dataset.chview; render();
                if (chat.view === 'voice' && window.NexusVoice) setTimeout(() => { const el = box.querySelector('#chVoiceSet'); if (el) window.NexusVoice.settings(el); }, 0);
                if (chat.view === 'favs') api('chat_favs').then(d => { chat.favs = d.items; render(); }).catch(x => toast(x.message, true));
                if (chat.view === 'devices') api('chat_devices').then(d => { chat.devs = d; return api('chat_prefs'); }).then(d => { chat.prefs = d.prefs; render(); }).catch(x => toast(x.message, true));
                return;
            }
            const rm = t.closest('[data-chdevrm]');
            if (rm) { if (!confirm(T('Dieses Gerät aus dem Chat entfernen? Es bekommt dann keine Nachrichten mehr.'))) return; return api('chat_device_remove', { device: rm.dataset.chdevrm }).then(d => { chat.devs = d; toast(d.msg); render(); }).catch(x => toast(x.message, true)); }
            const chOk = d => { chat.open = d; render(); chatLoad(); };
            const cr = t.closest('[data-chreact]'); if (cr) return api('chat_react', { uid: chat.uid, ref: cr.dataset.ref, emoji: cr.dataset.chreact }).then(chOk).catch(x => toast(x.message, true));
            const ca = t.closest('[data-chact]');
            if (ca && chat.open) {
                const ref = ca.dataset.ref, a = ca.dataset.chact, m = (chat.open.messages || []).find(x => x.id === ref);
                if (a === 'react') return UI.popMenu(ca, (chat.open.emoji || ['❤️', '👍']).map(e => ({ label: e, fn: () => api('chat_react', { uid: chat.uid, ref, emoji: e }).then(chOk).catch(x => toast(x.message, true)) })));
                if (a === 'reply') { chat.reply = m; chat.editing = null; render(); const ta = box.querySelector('.ch-comp textarea'); if (ta) ta.focus(); return; }
                if (a === 'edit') { chat.editing = m; chat.reply = null; render(); const ta = box.querySelector('.ch-comp textarea'); if (ta) ta.focus(); return; }
                if (a === 'del') { if (!confirm(T('Nachricht für beide löschen?'))) return; return api('chat_delete', { uid: chat.uid, ref }).then(chOk).catch(x => toast(x.message, true)); }
                if (a === 'pin') return api('chat_pin', { uid: chat.uid, ref }).then(chOk).catch(x => toast(x.message, true));
                if (a === 'fav') return api('chat_fav', { uid: chat.uid, ref }).then(chOk).catch(x => toast(x.message, true));
            }
            if (t.closest('[data-chreplyx]')) { chat.reply = null; return render(); }
            if (t.closest('[data-cheditx]')) { chat.editing = null; return render(); }
            const cj = t.closest('[data-chjump]'); if (cj) { const el = box.querySelector('.ch-msg[data-mid="' + CSS.escape(cj.dataset.chjump) + '"]'); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); } return; }
            if (t.closest('[data-chhr]')) return api('chat_hr', { uid: chat.uid }).then(chOk).catch(x => toast(x.message, true));
            if (t.closest('[data-chgmem]')) { chat.showMembers = !chat.showMembers; return render(); }
            const grm = t.closest('[data-chgrm]');
            if (grm) { if (!confirm(T('Diese Person aus der Gruppe entfernen? Danach gibt es neue Schlüssel.'))) return; return api('chat_group_members', { uid: chat.uid, remove: grm.dataset.chgrm }).then(chOk).catch(x => toast(x.message, true)); }
            if (t.closest('[data-chgleave]')) {
                if (!confirm(T('Gruppe verlassen? Der Verlauf wird auf diesem Gerät gelöscht.'))) return;
                return api('chat_group_leave', { uid: chat.uid }).then(d => { chat.uid = ''; chat.open = null; chat.list = d.items; toast(T(d.msg)); render(); }).catch(x => toast(x.message, true));
            }
            if (t.closest('[data-chcall]') && window.NexusVoice && chat.open) { const o2 = chat.open; return window.NexusVoice.call(o2.uid, (o2.names || {})[o2.uid] || ((chat.list || []).find(c => c.uid === o2.uid) || {}).name || ''); }
            if (t.closest('[data-chsafety]')) { chat.showSafety = !chat.showSafety; return render(); }
            if (t.closest('[data-chverify]')) return api('chat_verify', { uid: chat.uid }).then(d => { chat.open = d; chat.showSafety = false; render(); chatLoad(); toast(T('Als verifiziert markiert.')); }).catch(x => toast(x.message, true));
            const pe = t.closest('[data-cpedit]'); if (pe) { profEdit = pe.dataset.cpedit === '1'; return render(); }
            if (t.closest('[data-p18e]')) { p18Edit = true; return render(); }
            const pt = t.closest('[data-cptab]'); if (pt) { profTab = pt.dataset.cptab; if (profTab === 'main') vrcMe = null; return render(); }
            if (t.closest('[data-p18cancel]')) { p18Edit = false; return render(); }
            const md = t.closest('[data-cmod]');
            if (md) {
                const k = md.dataset.cmod;
                if ((k === 'ban' || k === 'delete') && !confirm(T(k === 'ban' ? 'Konto in der Community sperren?' : 'Beitrag löschen?'))) return;
                const note = k === 'hide' || k === 'ban' || k === 'mute' ? (prompt(T('Notiz für das Protokoll (optional)')) || '') : '';
                return api('comm_mod', { do: k, id: md.dataset.id || 0, vrc_id: md.dataset.vrc || '', media: md.dataset.media || '', report: md.dataset.report || 0, hours: 24, note })
                    .then(d => { toast(d.msg); if (sub === 'mod') loadMod(); else loadFeed(); }).catch(x => toast(x.message, true));
            }
        });
        box.addEventListener('change', e => {
            // 3.4 Chat: Gelesen-Häkchen an/aus, Bild/GIF senden (wird in der App verschlüsselt)
            if (e.target.closest('[data-chreceipts]')) return api('chat_prefs', { receipts: e.target.checked ? '1' : '0' }).then(d => { chat.prefs = d.prefs; toast(d.msg); }).catch(x => toast(x.message, true));
            if (e.target.closest('[data-chimg]') && e.target.files && e.target.files[0]) {
                const file = e.target.files[0], ta = box.querySelector('.ch-comp textarea'), body = new FormData();
                body.append('act', 'chat_img'); body.append('uid', chat.uid); body.append('text', ta ? ta.value : ''); body.append('file', file);
                busy = true; toast('🖼 ' + T('Bild wird verschlüsselt und gesendet …'));
                return fetch('nexus.php', { method: 'POST', credentials: 'same-origin', body }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); chat.open = d; if (ta) ta.value = ''; })
                    .catch(x => toast(x.message, true)).finally(() => { busy = false; render(); chatLoad(); });
            }
            const up = e.target.closest('[data-cup]'), av = e.target.closest('[data-cav]');
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            if (up) { busy = true; upload(f, sub === 'nsfw' ? 'nsfw' : 'sfw').then(d => { attach.push({ id: d.id, name: f.name, status: d.status }); }).catch(x => toast(x.message, true)).finally(() => { busy = false; render(); }); }
            if (av) upload(f, 'sfw').then(d => { prof[av.dataset.cav] = d.id; toast(T('Bild hochgeladen – „Speichern“ nicht vergessen.')); }).catch(x => toast(x.message, true));
        });
        box.addEventListener('submit', e => {
            e.preventDefault();
            const f = e.target;
            if (f.matches('.l18-consent')) return l18Submit(f);   // 6.0
            if (f.matches('.cm-comp')) {
                const parent = +f.dataset.parent;
                busy = true;
                return api('comm_post', { text: f.text.value, rating: sub === 'nsfw' ? 'nsfw' : 'sfw', parent, media: parent ? [] : attach.map(a => a.id) })
                    .then(d => { toast(T(d.msg)); f.reset(); if (!parent) { attach = []; items.unshift(d.post); } else if (openThread[parent]) { openThread[parent].replies.push(d.post); const p = items.find(x => x.id === parent); if (p) p.replies++; } })
                    .catch(x => toast(x.message, true)).finally(() => { busy = false; render(); });
            }
            if (f.matches('.p18-edit')) return api('comm_profile_save', Object.assign(profBody(prof), { nsfw_bio: f.nsfw_bio.value, nsfw_facts: JSON.stringify(Object.assign({ avatars: (prof.nsfw_facts || {}).avatars || [], worlds: (prof.nsfw_facts || {}).worlds || [] }, window.NexusProfile18.readNsfw(f))) }))
                .then(d => { toast(d.msg); const feed = prof.feed; prof = d.profile; prof.feed = feed; p18Edit = false; render(); }).catch(x => toast(x.message, true));
            if (f.matches('.cm-pform')) return api('comm_profile_save', Object.assign(profBody(prof), { theme: f.theme ? f.theme.value : (prof.theme || ''), bio: f.bio.value, pronouns: f.pronouns.value, languages: f.languages.value, interests: f.interests.value, links: f.links.value.split(',').map(x => x.trim()).filter(Boolean) },
                window.NexusProfile18 ? { facts: JSON.stringify(window.NexusProfile18.readFacts(f)) } : {}))
                .then(d => { toast(d.msg); const feed = prof.feed; prof = d.profile; prof.feed = feed; profEdit = false; render(); }).catch(x => toast(x.message, true));
            if (f.matches('.ch-new')) {
                const v = f.uid.value.trim().replace(/^.*\/(usr_[0-9a-f-]{36}).*$/i, '$1');
                if (!/^(?:usr_[0-9a-f-]{36}|[0-9a-z]{10})$/i.test(v)) {   // 3.7.3: kein ID → genau ein passender Freund? dann den nehmen
                    const hits = [...box.querySelectorAll('.ch-pick .ch-fr')].filter(b => !b.hidden);
                    if (v && hits.length === 1) { f.reset(); return chatOpen(hits[0].dataset.chopen); }
                    return toast(T('Bitte eine VRChat-User-ID (usr_…), einen Profil-Link oder einen Freund aus der Liste wählen.'), true);
                }
                f.reset(); return chatOpen(v.toLowerCase());
            }
            if (f.matches('.ch-gnew')) {
                const picks = [...f.querySelectorAll('input[name="pick"]:checked')].map(x => x.value);
                const members = [f.members.value].concat(picks).filter(Boolean).join(',');
                busy = true;
                return api('chat_group_create', { name: f.name.value, members }).then(d => { chat.view = ''; chat.uid = d.uid; chat.open = d; toast(T(d.msg)); chatLoad(); }).catch(x => toast(x.message, true)).finally(() => { busy = false; render(); });
            }
            if (f.matches('.ch-gadd')) return api('chat_group_members', { uid: chat.uid, add: f.add.value }).then(d => { chat.open = d; render(); chatLoad(); }).catch(x => toast(x.message, true));
            if (f.matches('.ch-gren')) return api('chat_group_members', { uid: chat.uid, name: f.name.value }).then(d => { chat.open = d; render(); chatLoad(); toast(T('Gespeichert.')); }).catch(x => toast(x.message, true));
            if (f.matches('.ch-comp')) {
                const text = f.text.value; if (!text.trim()) return; busy = true;
                const req = chat.editing ? api('chat_edit', { uid: chat.uid, ref: chat.editing.id, text }) : chat.reply ? api('chat_reply', { uid: chat.uid, ref: chat.reply.id, text }) : api('chat_send', { uid: chat.uid, text });
                return req.then(d => { chat.open = d; chat.reply = null; chat.editing = null; f.reset(); }).catch(x => toast(x.message, true)).finally(() => { busy = false; render(); chatLoad(); });
            }
            if (f.matches('.cm-sform')) return api('comm_mod', { do: 'mute', vrc_id: f.vrc.value.trim(), hours: f.hours.value }).then(d => { toast(d.msg); loadMod(); }).catch(x => toast(x.message, true));
        });
    }

    let pendingArg = null;
    window.NexusCommunity = {
        open(s) {
            const el = document.getElementById('cmtBox');
            if (!el) return;
            if (box !== el) { box = el; bind(); }
            const arg = pendingArg; pendingArg = null;
            loadMe().then(() => go(s && subs().some(x => x[0] === s) ? s : sub, arg));
        },
        /** 3.8.1: aus einem VRChat-Profil direkt in den Chat / ins Community-Profil dieser Person springen */
        openTo(s, arg) { pendingArg = arg; window.NexusUI.tab('community', s); },
        /** 3.7: nach einem Anruf den Verlauf neu laden (Anruf-Eintrag) */
        refreshChat() { if (box && sub === 'chat' && chat.uid) api('chat_open', { uid: chat.uid }).then(d => { chat.open = d; render(); }).catch(() => {}); },
    };
})();
