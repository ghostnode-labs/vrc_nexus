/* VRC Nexus – 👑 Admin (nur Besitzer, eigener Menüpunkt): 🏷 Tags vergeben (8.4), Freischalt-Schlüssel, API-Konsole, Ereignisse simulieren, System & Log, Spielereien. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    let box = null, st = null, sys = null, lastToken = '', apiOut = '';
    const loc = () => (window.nxLoc ? nxLoc() : 'de-DE');
    const card = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '"><h4>' + t + '</h4>' + html + '</div>';
    const T = s => (window.t ? window.t(s) : s);
    const TG = window.NexusTags;

    // ---------- 🏷 Tags vergeben (8.4) – intern weiter signierte NXK1-Schlüssel (issue/revoke/extend) ----------
    const tg = { sel: null, chips: new Set(['supporter']), days: '0', note: '', q: '', edit: '' };
    const UID_RX = /(usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
    function tagHits(q) {
        q = String(q || '').trim();
        if (!q) return '<p class="muted small">' + esc(T('Tippe einen Namen aus deiner Freundesliste oder füge eine VRChat-ID bzw. einen Profil-Link ein.')) + '</p>';
        const m = UID_RX.exec(q) || (/^[0-9a-z]{10}$/i.test(q) ? [q, q] : null);
        const s = UI.state && UI.state(), fr = s && s.friends ? s.friends : [];
        const ql = q.toLowerCase();
        const hits = fr.filter(f => String(f.name || '').toLowerCase().includes(ql) || String(f.id || '').toLowerCase() === ql).slice(0, 8);
        return (m ? '<button type="button" class="btn btn-sm" data-ad="tagpick" data-uid="' + esc(m[1]) + '" data-name="">🆔 ' + esc(m[1]) + '</button>' : '')
            + hits.map(f => '<button type="button" class="ad-taghit" data-ad="tagpick" data-uid="' + esc(f.id) + '" data-name="' + esc(f.name) + '" data-img="' + esc(f.image || '') + '">' + UI.img(f.image, 'vx-av', f.name) + '<span>' + esc(f.name) + '</span></button>').join('')
            + (!m && !hits.length ? '<p class="muted small">' + esc(T('Kein Freund gefunden – VRChat-ID (usr_…) oder Profil-Link einfügen.')) + '</p>' : '');
    }
    function expTxt(k) {
        if (!k.exp) return '∞ ' + esc(T('unbegrenzt'));
        const left = Math.ceil((k.exp - Date.now() / 1000) / 86400);
        return esc(new Date(k.exp * 1000).toLocaleDateString(loc())) + (left <= 0 ? ' ⌛' : left <= 14 ? ' ⏳ ' + left + ' T' : '');
    }
    function tagsCard() {
        if (!st) return card('🏷 ' + esc(T('Tags vergeben')), '<div class="vx-loading">…</div>', 'ad-wide');
        if (!TG) return '';
        if (!st.owner_key) return card('🏷 ' + esc(T('Tags vergeben')), '<p class="muted small">' + esc(T('Erst unten bei „Freischalt-Schlüssel“ ein Schlüsselpaar erzeugen.')) + '</p>', 'ad-wide');
        const sel = tg.sel;
        const person = sel ? '<div class="nc-row ad-tagsel">' + (sel.img ? UI.img(sel.img, 'vx-av', sel.name) : '<span class="vx-av">👤</span>') + '<div><b>' + esc(sel.name || '–') + '</b><br><code class="small">' + esc(sel.uid) + '</code></div>'
                + (tg.edit ? '' : '<button type="button" class="btn btn-sm" data-ad="tagunpick">✕ ' + esc(T('andere Person')) + '</button>') + '</div>'
            : '<input type="text" id="adTagQ" placeholder="' + esc(T('Freund suchen oder VRChat-ID / Profil-Link')) + '" value="' + esc(tg.q) + '" autocomplete="off"><div class="ad-taghits" id="adTagHits">' + tagHits(tg.q) + '</div>';
        const chipBtn = k => { const m = TG.META[k], on = tg.chips.has(k); return '<button type="button" class="vx-pill nx-tag ad-tagchip' + (on ? ' on' : '') + '" style="--pc:' + m[2] + '" data-ad="tagchip" data-k="' + k + '" aria-pressed="' + on + '">' + (on ? '✔ ' : '') + m[0] + ' ' + esc(T(m[1])) + '</button>'; };
        const roles = TG.ISSUABLE.filter(k => TG.META[k][3] === 'role'), looks = TG.ISSUABLE.filter(k => TG.META[k][3] === 'look');
        const ed = tg.edit ? (st.issued || []).find(x => x.id === tg.edit) : null;
        const left = ed && ed.exp ? Math.max(1, Math.ceil((ed.exp - Date.now() / 1000) / 86400)) : 0;
        const dayOpts = [['0', T('unbegrenzt')], ['30', '30 ' + T('Tage')], ['90', '90 ' + T('Tage')], ['365', '365 ' + T('Tage')]].concat(left && ![30, 90, 365].includes(left) ? [[String(left), T('wie bisher') + ' (' + left + ' ' + T('Tage') + ')']] : []);
        const items = (st.issued || []).filter(k => !k.replaced_by);
        const status = k => k.revoked ? '<span class="vx-pill" style="--pc:#ff5c5c">⛔ ' + esc(T('entzogen')) + '</span>' : k.exp && k.exp < Date.now() / 1000 ? '<span class="vx-pill" style="--pc:#9aa0a6">⌛ ' + esc(T('abgelaufen')) + '</span>'
            : k.deliver && k.has_tok ? '<span class="vx-pill" style="--pc:#51e57e" title="' + esc(T('Wird beim Abgleich automatisch zugestellt – die Person muss nichts eintippen.')) + '">📨 ' + esc(T('automatisch')) + '</span>'
            : '<span class="vx-pill" style="--pc:#f3c262" title="' + esc(T('Moderator-Schlüssel und ältere Schlüssel bitte selbst weitergeben.')) + '">✋ ' + esc(T('von Hand')) + '</span>';
        return card('🏷 ' + esc(T('Tags vergeben')), '<form class="ad-tagform" id="adTags">'
            + '<div class="ad-tagstep"><b>1 · ' + esc(T('Person')) + '</b>' + person + '</div>'
            + '<div class="ad-tagstep"><b>2 · ' + esc(T('Rollen')) + '</b><div class="ad-tagchips">' + roles.map(chipBtn).join('') + '</div>'
            + '<b>' + esc(T('Optische Tags (ohne Rechte)')) + '</b><div class="ad-tagchips">' + looks.map(chipBtn).join('') + '</div>'
            + (tg.chips.has('mod') ? '<p class="nx-hint small">🛡 ' + esc(T('Moderator gibt Moderations-Rechte. Dieser Schlüssel wird aus Sicherheitsgründen nicht automatisch zugestellt – bitte selbst weitergeben (wird kopiert).')) + '</p>' : '')
            + '<p class="muted small">' + esc(T('„Besitzerin“ ist kein Tag und nicht vergebbar. Tags ersetzen keine 18+-Freigabe.')) + '</p></div>'
            + '<div class="ad-tagstep"><b>3 · ' + esc(T('Laufzeit & Notiz')) + '</b><div class="nc-row"><select name="days">' + dayOpts.map(o => '<option value="' + o[0] + '"' + (o[0] === tg.days ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>'
            + '<input name="note" placeholder="' + esc(T('Notiz (z. B. Discord-Name)')) + '" value="' + esc(tg.note) + '" maxlength="80" style="flex:1"></div></div>'
            + '<div class="nc-row"><button class="btn btn-gold"' + (sel && tg.chips.size ? '' : ' disabled') + '>' + (tg.edit ? '💾 ' + esc(T('Änderung speichern')) : '🏷 ' + esc(T('Vergeben'))) + '</button>'
            + (tg.edit ? '<button type="button" class="btn btn-sm" data-ad="tagcancel">' + esc(T('Abbrechen')) + '</button><span class="muted small">' + esc(T('Neu ausstellen ersetzt den alten Schlüssel (der alte wird gesperrt).')) + '</span>' : '') + '</div></form>'
            + '<table class="nx-list ad-tagtab"><thead><tr><th>' + esc(T('Person')) + '</th><th>' + esc(T('Tags')) + '</th><th>' + esc(T('läuft ab')) + '</th><th>' + esc(T('Status')) + '</th><th></th></tr></thead><tbody>'
            + (items.length ? items.map(k => '<tr class="' + (k.revoked ? 'ns-rev' : '') + '"><td><b>' + esc(k.name || '–') + '</b><br><code class="small">' + esc(k.uid) + '</code>' + (k.note ? '<br><small class="muted">' + esc(k.note) + '</small>' : '') + '</td>'
                + '<td>' + TG.chips(k.f) + '</td><td class="small">' + expTxt(k) + '</td><td>' + status(k) + '</td><td class="nc-row" style="margin:0;flex-wrap:nowrap">'
                + (k.revoked ? '' : '<button type="button" class="btn btn-sm" data-ad="tagedit" data-id="' + esc(k.id) + '" title="' + esc(T('Bearbeiten')) + '">✎</button>'
                    + '<select class="ad-tagext" data-adext="' + esc(k.id) + '" aria-label="' + esc(T('Verlängern')) + '"><option value="">⏩ ' + esc(T('Verlängern')) + '</option><option value="30">+30 ' + esc(T('Tage')) + '</option><option value="90">+90 ' + esc(T('Tage')) + '</option><option value="365">+365 ' + esc(T('Tage')) + '</option></select>'
                    + '<button type="button" class="btn btn-sm btn-danger" data-ad="tagrevoke" data-id="' + esc(k.id) + '">' + esc(T('Entziehen')) + '</button>') + '</td></tr>').join('')
                : '<tr><td colspan="5" class="muted small">' + esc(T('Noch keine Tags vergeben.')) + '</td></tr>') + '</tbody></table>'
            + '<p class="muted small">' + esc(T('Die Person bekommt ihre Tags automatisch über ihr Nexus-Konto (beim Start, alle 6 Stunden oder per Knopf) – nach dem Vergeben gleicht die App mit der Webseite ab.')) + '</p>', 'ad-wide');
    }

    function keysCard() {
        if (!st) return card('🔑 Freischalt-Schlüssel', '<div class="vx-loading">…</div>', 'ad-wide');
        const items = st.issued || [];
        return card('🔑 Freischalt-Schlüssel', (st.owner_key ? '<p class="small">Öffentlicher Schlüssel ' + (st.key_known ? '✔ in der App hinterlegt' : '⚠ noch <b>nicht</b> in der App hinterlegt – an Claude schicken, damit andere Apps deine Schlüssel prüfen können.') + '</p><div class="nc-row"><code class="ns-url">' + esc(st.owner_key) + '</code><button type="button" class="vx-copy" data-copy="' + esc(st.owner_key) + '">⧉</button></div>'
            : '<p class="small">Noch kein Schlüsselpaar.</p><button type="button" class="btn btn-sm btn-gold" data-ad="keypair">🔑 Schlüsselpaar erzeugen</button>')
            + (st.owner_key ? '<form class="ns-issue" id="adIssue"><input name="uid" placeholder="VRChat-User-ID (usr_…) oder Profil-Link" required><input name="name" placeholder="Name (optional)"><select name="days"><option value="30">30 Tage</option><option value="90">90 Tage</option><option value="365" selected>1 Jahr</option><option value="0">unbegrenzt</option></select>'
                + '<label class="check small"><input type="checkbox" name="f_supporter" checked> 💖 Supporter</label><label class="check small" title="Moderator: verwaltet die Warnliste (später auch Community &amp; Chat) – kein NSFW, keine Besitzer-Rechte"><input type="checkbox" name="f_mod"> 🛡 Moderator</label><label class="check small"><input type="checkbox" name="f_creator"> 🎨 Creator</label><label class="check small"><input type="checkbox" name="f_beta"> 🧪 Beta-Tester</label><span class="muted small">NSFW gibt es nur über Verified 18+ (Nexus-Konto), nicht per Schlüssel.</span><input name="note" placeholder="Notiz (z. B. Discord-Name)"><button class="btn btn-sm btn-gold">＋ Schlüssel erzeugen</button></form>'
                + (lastToken ? '<div class="ns-newtok"><b>Neuer Schlüssel</b> – nur für diese Person, an ihre User-ID gebunden (schon kopiert):<div class="nc-row"><code class="ns-url">' + esc(lastToken) + '</code><button type="button" class="vx-copy" data-copy="' + esc(lastToken) + '">⧉</button></div></div>' : '')
                + '<table class="nx-list ns-keys"><thead><tr><th>Name</th><th>User-ID</th><th>Rechte</th><th>Bis</th><th></th></tr></thead><tbody>' + (items.length ? items.map(k => '<tr class="' + (k.revoked ? 'ns-rev' : '') + '"><td>' + esc(k.name || '–') + (k.note ? '<br><small class="muted">' + esc(k.note) + '</small>' : '') + '</td><td><code class="small">' + esc(k.uid) + '</code></td><td class="small">' + esc(k.f.join(', ')) + '</td>'
                    + '<td class="small">' + (k.exp ? esc(new Date(k.exp * 1000).toLocaleDateString(loc())) + (k.exp < Date.now() / 1000 ? ' ⌛' : k.exp - Date.now() / 1000 < 14 * 86400 ? ' ⏳' : '') : '∞') + '</td><td class="nc-row" style="margin:0;flex-wrap:nowrap">' + (k.revoked ? '' : '<button type="button" class="btn btn-sm" data-ad="extend" data-id="' + esc(k.id) + '" title="Um 90 Tage verlängern (neuer Schlüssel zum Weitergeben)">⏩ +90 T</button>') + '<button type="button" class="btn btn-sm ' + (k.revoked ? '' : 'btn-danger') + '" data-ad="revoke" data-id="' + esc(k.id) + '" data-on="' + (k.revoked ? '0' : '1') + '">' + (k.revoked ? 'entsperren' : 'sperren') + '</button></td></tr>').join('') : '<tr><td colspan="5" class="muted small">Noch keine Schlüssel.</td></tr>') + '</tbody></table>'
                + '<div class="nc-row"><button type="button" class="btn btn-sm" data-ad="licsync">☁ Mit der Webseite abgleichen</button><span class="muted small">' + (st.lic_synced ? 'zuletzt ' + esc(new Date(st.lic_synced).toLocaleString(loc())) : 'noch nie abgeglichen') + '</span></div>'
                + '<p class="muted small">5.6: Neue und gesperrte Schlüssel gehen automatisch an die GhostNode-Webseite – Sperren gelten dann in <b>jeder</b> App (Abgleich alle 6 h) und lassen sich auch im Admin-Bereich der Webseite setzen.</p>'
                + ((st.permlog || []).length ? '<details class="ad-permlog"><summary class="small">📜 Rechte-Protokoll (' + st.permlog.length + ')</summary>' + st.permlog.map(x => '<div class="small"><span class="muted">' + esc(new Date(x.at * 1000).toLocaleString(loc())) + '</span> · <b>' + esc(x.what) + '</b> · ' + esc(x.detail) + '</div>').join('') + '</details>' : '') : ''), 'ad-wide');
    }
    function render() {
        if (!box) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
        const s = sys;
        box.innerHTML = '<div class="nc-grid">' + tagsCard() + keysCard()
            + (window.NexusWarn ? card('⚠ Warnliste (GhostNode)', '<div id="adWarn"></div>', 'ad-wide') : '')
            + card('🧪 Ereignis simulieren', '<p class="muted small">Testet Benachrichtigungen, Automatik und Warnungen, ohne dass jemand wirklich kommt.</p><div class="nc-row"><input type="text" id="adSimName" placeholder="Name" value="Testspieler" style="flex:1"></div>'
                + '<div class="nc-row"><button type="button" class="btn btn-sm" data-ad="sim" data-k="player_join">👋 Spieler kommt</button><button type="button" class="btn btn-sm" data-ad="sim" data-k="player_leave">🚪 Spieler geht</button><button type="button" class="btn btn-sm" data-ad="sim" data-k="video">📺 Video startet</button></div>')
            + card('✨ Spielereien', '<p class="muted small">In die Chatbox:</p><div class="nc-row ad-fun"><button type="button" class="btn btn-sm" data-ad="fun" data-k="crown">👑 Admin da</button><button type="button" class="btn btn-sm" data-ad="fun" data-k="hearts">💖 Herz-Animation</button><button type="button" class="btn btn-sm" data-ad="fun" data-k="countdown">3️⃣2️⃣1️⃣ Countdown</button>'
                + '<button type="button" class="btn btn-sm" data-ad="fun" data-k="wave">🌊 Welle</button><button type="button" class="btn btn-sm" data-ad="fun" data-k="dice">🎲 Würfeln</button><button type="button" class="btn btn-sm" data-ad="fun" data-k="coin">🪙 Münze</button></div>'
                + '<p class="muted small">In der App:</p><div class="nc-row"><button type="button" class="btn btn-sm" data-ad="confetti">🎉 Konfetti</button><button type="button" class="btn btn-sm" data-ad="disco">🪩 Theme-Disco</button><button type="button" class="btn btn-sm" data-ad="matrix">🟩 Matrix</button></div>')
            + card('🖥 System', s ? '<dl class="vx-u-facts"><dt>Version</dt><dd>' + esc(s.version) + ' · ' + esc(s.platform) + (s.electron ? ' · Electron ' + esc(s.electron) : '') + ' · Node ' + esc(s.node) + '</dd><dt>Läuft seit</dt><dd>' + Math.floor(s.uptime / 3600) + ' h ' + Math.floor(s.uptime / 60) % 60 + ' min</dd>'
                + '<dt>Speicher</dt><dd>' + s.mem + ' MB (Heap ' + s.heap + ' MB)</dd>' + (s.db ? '<dt>Datenbank</dt><dd>' + (s.db.size / 1048576).toFixed(1) + ' MB · ' + s.db.rows.toLocaleString(loc()) + ' Einträge</dd>' : '') + '<dt>Spiel</dt><dd>' + (s.game.running ? '🟢 ' + esc(s.game.world || 'läuft') + ' · ' + s.game.players + ' Spieler' : '⚪ aus') + '</dd></dl>'
                + '<div class="nc-row"><label class="check small"><input type="checkbox" id="adDebug"' + (s.debug ? ' checked' : '') + '> Fehler-Log schreiben</label><button type="button" class="btn btn-sm" data-ad="sys">⟳</button><button type="button" class="btn btn-sm" data-ad="logclr">Log leeren</button></div>'
                + '<pre class="ad-log">' + esc(s.log || '– leer –') + '</pre>' : '<div class="vx-loading">…</div>')
            + card('🔍 API-Konsole (nur lesen)', '<form class="nc-row" id="adApi"><input type="text" name="path" placeholder="/auth/user  ·  /worlds/wrld_…  ·  /users/usr_…" style="flex:1" value="/auth/user"><button class="btn btn-sm btn-gold">GET</button></form>'
                + '<div class="nc-row"><button type="button" class="btn btn-sm" data-ad="apicopy"' + (apiOut ? '' : ' disabled') + '>⧉ Antwort kopieren</button></div><pre class="ad-log" id="adApiOut">' + esc(apiOut || 'Antwort erscheint hier.') + '</pre>', 'ad-wide')
            + '</div>';
        if (window.NexusWarn) window.NexusWarn.admin(box.querySelector('#adWarn'));
    }
    function load() {
        return Promise.all([api('nsfw_state').then(d => { st = d; }), api('admin_sys').then(d => { sys = d; })]).then(render).catch(x => { box.innerHTML = '<div class="vx-error">⚠ ' + esc(x.message) + '</div>'; });
    }
    // ---------- Spielereien in der App ----------
    function confetti() {
        const c = document.createElement('canvas'); c.className = 'ad-fx'; document.body.appendChild(c);
        const ctx = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
        const cols = ['#f5c242', '#38d5e6', '#ff6b9d', '#4ade80', '#a78bfa'];
        const ps = Array.from({ length: 180 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * 6, s: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
        let t = 0;
        (function frame() { ctx.clearRect(0, 0, c.width, c.height); for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.r += 0.1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
            if (++t < 260) requestAnimationFrame(frame); else c.remove(); })();
    }
    function disco() {
        const app = window.NexusApp, keys = app ? Object.keys(app.THEMES).filter(k => k !== 'auto') : [];
        if (!keys.length) return;
        const orig = Object.assign({}, window.VRCX.ui);
        let i = 0;
        const t = setInterval(() => { app.applyUi(Object.assign({}, orig, { 'ui.theme': keys[i++ % keys.length], 'ui.accent': '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') })); }, 700);
        setTimeout(() => { clearInterval(t); app.applyUi(orig); }, 8000);
    }
    function matrix() {
        const c = document.createElement('canvas'); c.className = 'ad-fx'; document.body.appendChild(c);
        const ctx = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
        const cols = Math.floor(c.width / 16), y = Array(cols).fill(0), chars = 'ネクサスVRCNEXUS01ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘ';
        let t = 0;
        (function frame() { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#4ade80'; ctx.font = '15px monospace';
            y.forEach((v, i) => { ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 16, v); y[i] = v > c.height && Math.random() > 0.97 ? 0 : v + 16; });
            if (++t < 360) requestAnimationFrame(frame); else c.remove(); })();
    }
    function onClick(e) {
        const b = e.target.closest('[data-ad]');
        if (!b) return;
        const a = b.dataset.ad;
        if (a === 'tagchip') { const k = b.dataset.k; if (tg.chips.has(k)) tg.chips.delete(k); else tg.chips.add(k); return render(); }
        if (a === 'tagpick') {
            tg.sel = { uid: b.dataset.uid, name: b.dataset.name || '', img: b.dataset.img || '' }; tg.q = '';
            // hat die Person schon aktive Tags? → bearbeiten statt einen zweiten Schlüssel auszustellen (je Person gilt in der App genau einer)
            const cur = (st.issued || []).find(k => !k.revoked && !k.replaced_by && (!k.exp || k.exp > Date.now() / 1000) && String(k.uid).toLowerCase() === tg.sel.uid.toLowerCase());
            if (cur) {
                const left = cur.exp ? Math.max(1, Math.ceil((cur.exp - Date.now() / 1000) / 86400)) : 0;
                Object.assign(tg, { chips: new Set((cur.f || []).filter(x => TG && TG.ISSUABLE.includes(x))), note: cur.note || '', days: String(left), edit: cur.id });
                tg.sel.name = tg.sel.name || cur.name || '';
                toast(T('Diese Person hat schon Tags – du bearbeitest den bestehenden Eintrag.'));
            }
            return render();
        }
        if (a === 'tagunpick') { tg.sel = null; return render(); }
        if (a === 'tagcancel') { Object.assign(tg, { sel: null, edit: '', note: '', days: '0', chips: new Set(['supporter']) }); return render(); }
        if (a === 'tagedit') {
            const k = (st.issued || []).find(x => x.id === b.dataset.id);
            if (!k) return;
            const left = k.exp ? Math.max(1, Math.ceil((k.exp - Date.now() / 1000) / 86400)) : 0;
            Object.assign(tg, { sel: { uid: k.uid, name: k.name || '', img: '' }, chips: new Set((k.f || []).filter(x => TG && TG.ISSUABLE.includes(x))), note: k.note || '', days: String(left), edit: k.id });
            render(); const f = box.querySelector('#adTags'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' }); return;
        }
        if (a === 'tagrevoke') { if (!confirm(T('Tags entziehen? Der Schlüssel wird gesperrt – das gilt nach dem Abgleich in jeder App.'))) return; return api('nsfw_admin_revoke', { id: b.dataset.id, on: '1' }).then(d => { st.issued = d.items; toast(T('Tags entzogen.')); render(); }).catch(x => toast(x.message, true)); }
        if (a === 'keypair') { if (!confirm('Schlüsselpaar erzeugen? Den öffentlichen Schlüssel danach an Claude geben.')) return; return api('nsfw_admin_keypair').then(d => { st = d; toast(d.msg); render(); }).catch(x => toast(x.message, true)); }
        if (a === 'extend') return api('nsfw_admin_extend', { id: b.dataset.id, days: 90 }).then(d => { lastToken = d.token; st.issued = d.items; toast(d.msg); render(); UI.copy(d.token); }).catch(x => toast(x.message, true));
        if (a === 'licsync') return api('lic_sync').then(d => { toast(d.msg); st.lic_synced = d.at; render(); }).catch(x => toast(x.message, true));
        if (a === 'revoke') return api('nsfw_admin_revoke', { id: b.dataset.id, on: b.dataset.on }).then(d => { st.issued = d.items; render(); }).catch(x => toast(x.message, true));
        if (a === 'sim') { const n = box.querySelector('#adSimName'); return api('admin_sim', { kind: b.dataset.k, name: n ? n.value : '' }).then(d => toast(d.msg)).catch(x => toast(x.message, true)); }
        if (a === 'fun') return api('admin_fun', { kind: b.dataset.k }).then(d => toast(d.msg)).catch(x => toast(x.message, true));
        if (a === 'confetti') return confetti();
        if (a === 'disco') return disco();
        if (a === 'matrix') return matrix();
        if (a === 'sys') return api('admin_sys').then(d => { sys = d; render(); });
        if (a === 'logclr') return api('admin_log_clear').then(d => { sys = d; render(); });
        if (a === 'apicopy') return UI.copy(apiOut);
    }
    function onSubmit(e) {
        if (e.target.id === 'adTags') {
            e.preventDefault();
            const f = e.target;
            if (!tg.sel) return toast(T('Erst eine Person wählen.'), true);
            if (!tg.chips.size) return toast(T('Mindestens ein Tag wählen.'), true);
            tg.days = f.days.value; tg.note = f.note.value;
            const edit = tg.edit;
            api('nsfw_admin_issue', { uid: tg.sel.uid, name: tg.sel.name, days: tg.days, note: tg.note, features: [...tg.chips].join(','), replace: edit })
                .then(d => {
                    st.issued = d.items; toast(d.msg);
                    if (!d.deliver) { lastToken = d.token; UI.copy(d.token); }
                    Object.assign(tg, { sel: null, edit: '', note: '', days: '0', chips: new Set(['supporter']) });
                    if (document.activeElement) document.activeElement.blur(); render();
                }).catch(x => toast(x.message, true));
            return;
        }
        if (e.target.id === 'adIssue') {
            e.preventDefault();
            const f = e.target, feats = ['supporter', 'mod', 'creator', 'beta'].filter(k => f['f_' + k] && f['f_' + k].checked);
            if (!feats.length) return toast('Mindestens ein Recht wählen.', true);
            api('nsfw_admin_issue', { uid: f.uid.value, name: f.name.value, days: f.days.value, note: f.note.value, features: feats.join(',') })
                .then(d => { lastToken = d.token; st.issued = d.items; toast(d.msg); document.activeElement.blur(); render(); UI.copy(d.token); }).catch(x => toast(x.message, true));
        }
        if (e.target.id === 'adApi') {
            e.preventDefault();
            const out = box.querySelector('#adApiOut'); out.textContent = '…';
            api('admin_api', { path: e.target.path.value }).then(d => { apiOut = JSON.stringify(d.data, null, 2); out.textContent = '// ' + d.ms + ' ms\n' + apiOut; box.querySelector('[data-ad=apicopy]').disabled = false; })
                .catch(x => { out.textContent = '⚠ ' + x.message; });
        }
    }
    function onInput(e) {
        if (e.target.id === 'adTagQ') { tg.q = e.target.value; const h = box.querySelector('#adTagHits'); if (h) h.innerHTML = tagHits(tg.q); }
        if (e.target.form && e.target.form.id === 'adTags' && e.target.name === 'note') tg.note = e.target.value;
    }
    function onChange(e) {
        if (e.target.form && e.target.form.id === 'adTags' && e.target.name === 'days') tg.days = e.target.value;
        if (e.target.dataset && e.target.dataset.adext && e.target.value) { const id = e.target.dataset.adext, days = e.target.value; return api('nsfw_admin_extend', { id, days }).then(d => { st.issued = d.items; toast(d.msg); if (d.entry && !d.entry.deliver) { lastToken = d.token; UI.copy(d.token); } render(); }).catch(x => toast(x.message, true)); }
        if (e.target.id === 'adDebug') api('admin_debug', { on: e.target.checked ? '1' : '0' }).then(d => { sys = d; toast(d.debug ? 'Fehler-Log an' : 'Fehler-Log aus'); }); }
    function open() {
        box = document.getElementById('adminBox');
        if (!box) return;
        if (!box.dataset.bound) { box.dataset.bound = '1'; box.addEventListener('click', onClick); box.addEventListener('submit', onSubmit); box.addEventListener('change', onChange); box.addEventListener('input', onInput); }
        load();
    }
    window.NexusAdmin = { open };
})();
