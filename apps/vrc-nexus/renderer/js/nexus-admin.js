/* VRC Nexus – 👑 Admin (nur Besitzer, eigener Menüpunkt): Freischalt-Schlüssel, API-Konsole, Ereignisse simulieren, System & Log, Spielereien. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    let box = null, st = null, sys = null, lastToken = '', apiOut = '';
    const loc = () => (window.nxLoc ? nxLoc() : 'de-DE');
    const card = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '"><h4>' + t + '</h4>' + html + '</div>';

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
        box.innerHTML = '<div class="nc-grid">' + keysCard()
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
    function onChange(e) { if (e.target.id === 'adDebug') api('admin_debug', { on: e.target.checked ? '1' : '0' }).then(d => { sys = d; toast(d.debug ? 'Fehler-Log an' : 'Fehler-Log aus'); }); }
    function open() {
        box = document.getElementById('adminBox');
        if (!box) return;
        if (!box.dataset.bound) { box.dataset.bound = '1'; box.addEventListener('click', onClick); box.addEventListener('submit', onSubmit); box.addEventListener('change', onChange); }
        load();
    }
    window.NexusAdmin = { open };
})();
