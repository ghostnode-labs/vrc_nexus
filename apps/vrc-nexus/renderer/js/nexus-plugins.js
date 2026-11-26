/* VRC Nexus – 🧩 Plugins (3.6, nur PC): Lader für .nxp-Pakete. Prüfen → Rechte bestätigen → installieren, an/aus, neu starten,
 * Protokoll, entfernen. Die Oberfläche eines Plugins besteht nur aus Bausteinen, die hier gezeichnet werden (alles escaped). */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = (a, d) => UI.api(a, d), toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    let box = null, d = null, check = null, logs = {}, timer = null, busy = false, mk = null, mkOpen = false, mkQ = '';
    const ST = { running: ['🟢', 'läuft'], starting: ['🟡', 'startet …'], error: ['🔴', 'Fehler'], stopped: ['⚪', 'aus'] };

    function widget(p, w) {
        const id = esc(w.id || ''), v = w.value === undefined ? '' : w.value;
        switch (w.type) {
            case 'heading': return '<h4 class="pl-h">' + esc(w.text || '') + '</h4>';
            case 'text': return '<p class="pl-t">' + esc(w.text || '').replace(/\n/g, '<br>') + '</p>';
            case 'divider': return '<hr class="pl-hr">';
            case 'stat': return '<div class="pl-stat"><span>' + esc(w.label || '') + '</span><b>' + esc(String(v)) + '</b></div>';
            case 'list': return '<ul class="pl-list">' + (w.items || []).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
            case 'button': return '<button type="button" class="btn btn-sm' + (w.style === 'gold' ? ' btn-gold' : w.style === 'danger' ? ' btn-danger' : '') + '" data-plbtn="' + id + '">' + esc(w.label || w.id || '') + '</button>';
            case 'toggle': return '<label class="check pl-tg"><input type="checkbox" data-plval="' + id + '" data-pltg="' + id + '"' + (v === true ? ' checked' : '') + '> ' + esc(w.label || '') + '</label>';
            case 'input': return '<label class="pl-in"><span>' + esc(w.label || '') + '</span>' + (w.multiline
                ? '<textarea rows="3" data-plval="' + id + '" placeholder="' + esc(w.placeholder || '') + '">' + esc(String(v)) + '</textarea>'
                : w.secret ? '<input type="password" autocomplete="new-password" data-plval="' + id + '" value="" placeholder="' + esc(w.placeholder || '') + '">'
                : '<input type="text" data-plval="' + id + '" value="' + esc(String(v)) + '" placeholder="' + esc(w.placeholder || '') + '">') + '</label>';
            case 'select': return '<label class="pl-in"><span>' + esc(w.label || '') + '</span><select data-plval="' + id + '" data-plsel="' + id + '">' + (w.options || []).map(o => '<option value="' + esc(o[0]) + '"' + (String(v) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
            default: return '';
        }
    }
    function card(p) {
        const st = ST[p.status] || ST.stopped;
        return '<section class="panel pl-card' + (p.enabled ? '' : ' off') + '" data-plid="' + esc(p.id) + '">'
            + '<div class="pl-top"><span class="pl-ic">' + esc(p.icon || '🧩') + '</span><div class="pl-meta"><b>' + esc(p.name) + '</b> <small class="muted">' + esc(p.version) + (p.author ? ' · ' + esc(p.author) : '') + '</small>'
            + '<div class="small">' + st[0] + ' ' + esc(T(st[1])) + (p.error ? ' – <span class="bad">' + esc(p.error) + '</span>' : '') + '</div>'
            + (p.description ? '<div class="small muted">' + esc(p.description) + '</div>' : '')
            + '<div class="pl-perms">' + (p.perms.length ? p.perms.map(x => '<span class="vx-pill" title="' + esc(T(x.label)) + '">' + x.icon + ' ' + esc(T(x.label)) + '</span>').join('') : '<span class="small muted">' + esc(T('keine besonderen Rechte')) + '</span>') + '</div></div>'
            + '<div class="pl-ctl"><label class="switch" title="' + esc(T('an/aus')) + '"><input type="checkbox" data-pltoggle="1"' + (p.enabled ? ' checked' : '') + '><i></i></label>'
            + '<button type="button" class="btn btn-sm" data-plact="restart" title="' + esc(T('Neu starten')) + '">⟳</button>'
            + '<button type="button" class="btn btn-sm" data-plact="log">📜 ' + esc(T('Protokoll')) + '</button>'
            + '<button type="button" class="btn btn-sm btn-danger" data-plact="remove">🗑</button></div></div>'
            + (p.enabled && p.ui && p.ui.length ? '<div class="pl-ui">' + p.ui.map(w => widget(p, w)).join('') + '</div>' : '')
            + (logs[p.id] ? '<pre class="pl-log">' + (logs[p.id].length ? logs[p.id].map(l => '<span class="' + (l.level === 'error' ? 'bad' : l.level === 'warn' ? 'warn' : '') + '">' + esc(new Date(l.at).toLocaleTimeString(window.nxLoc ? nxLoc() : 'de-DE') + '  ' + l.text) + '</span>').join('\n') : esc(T('Noch keine Einträge.'))) + '</pre>' : '')
            + '</section>';
    }
    function render() {
        if (!box || !d) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input[type=text], input[type=password], textarea, select')) return;   // nicht beim Tippen neu zeichnen
        box.innerHTML = '<div class="panel pl-head"><h2>🧩 ' + esc(T('Plugins')) + '</h2>'
            + '<p class="small muted">' + esc(T('Erweiterungen für VRC Nexus im Format .nxp. Jedes Plugin läuft abgeschottet in einem eigenen Prozess und darf nur das, was du bei der Installation erlaubst. Installiere trotzdem nur Plugins aus Quellen, denen du vertraust.')) + '</p>'
            + '<div class="nc-row"><label class="btn btn-gold">📦 ' + esc(T('Plugin installieren (.nxp)')) + '<input type="file" accept=".nxp" data-plfile="1" hidden></label>'
            + (d.example ? '<button type="button" class="btn" data-plexample="1">📝 ' + esc(T('Beispiel: Text-Plugin')) + '</button>' : '')
            + '<button type="button" class="btn" data-plopen="1" title="' + esc(d.dir || '') + '">📂 ' + esc(T('Plugin-Ordner öffnen')) + '</button>'
            + '<button type="button" class="btn' + (mkOpen ? ' btn-gold' : '') + '" data-plmk="1">🛒 ' + esc(T('Marktplatz')) + (mk && mk.updates ? ' <span class="vx-pill">' + mk.updates + ' ' + esc(T('Updates')) + '</span>' : '') + '</button></div>'
            + (d.dir ? '<p class="small muted">📁 <code>' + esc(d.dir) + '</code></p>' : '') + '</div>'
            + (check ? '<div class="panel pl-check"><h3>' + esc(check.manifest.icon) + ' ' + esc(check.manifest.name) + ' <small class="muted">' + esc(check.manifest.version) + '</small></h3>'
                + '<p class="small">' + (check.manifest.author ? esc(T('von')) + ' <b>' + esc(check.manifest.author) + '</b> · ' : '') + check.files + ' ' + esc(T('Dateien')) + ' · ' + Math.ceil(check.size / 1024) + ' KB'
                + (check.update ? ' · ' + esc(T('ersetzt Version')) + ' ' + esc(check.update) : '') + '</p>'
                + (check.manifest.description ? '<p>' + esc(check.manifest.description) + '</p>' : '')
                + '<p><b>' + esc(T('Das Plugin möchte:')) + '</b></p><ul class="pl-plist">' + (check.perms.length ? check.perms.map(x => '<li>' + x.icon + ' ' + esc(T(x.label)) + '</li>').join('') : '<li class="muted">' + esc(T('keine besonderen Rechte (nur eigene Oberfläche und eigener Speicher)')) + '</li>') + '</ul>'
                + '<div class="nc-row"><button type="button" class="btn btn-gold" data-plinstall="1">✔ ' + esc(T('Erlauben & installieren')) + '</button><button type="button" class="btn" data-plcancel="1">' + esc(T('Abbrechen')) + '</button></div></div>' : '')
            + (mkOpen ? market() : '')
            + (d.items.length ? d.items.map(card).join('') : '<div class="vx-empty">' + esc(T('Noch keine Plugins installiert.')) + '</div>')
            + '<p class="small muted">📘 ' + esc(T('Eigene Plugins schreiben: siehe docs/PLUGINS.md im Repository.')) + '</p>';
    }
    /** 4.4: Marktplatz – geprüfte Plugins von der GhostNode-Website */
    const PL = { chatbox: '💬', osc: '🎛', notify: '🔔', game: '🎮', net: '🌐', vrchat: '🟦' };
    function market() {
        if (!mk) return '<div class="panel"><div class="vx-loading">…</div></div>';
        if (mk.error) return '<div class="panel vx-error">⚠ ' + esc(mk.error) + ' <button type="button" class="btn btn-sm" data-plmkre="1">↻</button></div>';
        const q = mkQ.trim().toLowerCase(), list = mk.items.filter(i => !q || (i.name + ' ' + i.description + ' ' + i.author).toLowerCase().includes(q));
        return '<div class="panel pl-mk"><div class="nc-row"><h3 style="margin:0;flex:1">🛒 ' + esc(T('Marktplatz')) + '</h3><input type="search" data-plmkq="1" value="' + esc(mkQ) + '" placeholder="' + esc(T('Plugins suchen …')) + '">'
            + '<button type="button" class="btn btn-sm" data-plmkre="1" title="' + esc(T('Neu laden')) + '">↻</button></div>'
            + '<p class="small muted">' + esc(T('Alle Plugins hier wurden vor der Veröffentlichung geprüft. Der Katalog ist signiert, jedes Paket wird vor der Installation auf Echtheit geprüft – die Rechte bestätigst du trotzdem selbst.')) + '</p>'
            + (list.length ? '<div class="pl-mkgrid">' + list.map(i => '<div class="pl-mkcard"><div class="pl-top"><span class="pl-ic">' + esc(i.icon) + '</span><div class="pl-meta"><b>' + esc(i.name) + '</b> <small class="muted">' + esc(i.version) + (i.author ? ' · ' + esc(i.author) : '') + '</small>'
                + '<div class="small muted">' + esc(i.description) + '</div><div class="pl-perms">' + (i.permissions.length ? i.permissions.map(p => '<span class="vx-pill">' + (PL[p] || '?') + ' ' + esc(p) + '</span>').join('') : '<span class="small muted">' + esc(T('keine besonderen Rechte')) + '</span>') + '</div>'
                + '<div class="small muted">⬇ ' + i.downloads + ' · ' + Math.max(1, Math.round(i.size / 1024)) + ' KB' + (i.fits ? '' : ' · ⚠ ' + esc(T('braucht')) + ' Nexus ' + esc(i.nexus)) + '</div></div></div>'
                + '<div class="nc-row">' + (i.installed && !i.update ? '<span class="small">✔ ' + esc(T('installiert')) + '</span>'
                    : '<button type="button" class="btn btn-sm' + (i.update ? ' btn-gold' : '') + '" data-plmkget="' + esc(i.id) + '"' + (i.fits ? '' : ' disabled') + '>' + (i.update ? '⬆ ' + esc(T('Update auf')) + ' ' + esc(i.version) : '⬇ ' + esc(T('Installieren'))) + '</button>')
                + (i.homepage ? ' <a class="small" href="' + esc(i.homepage) + '" target="_blank" rel="noopener">' + esc(T('Website')) + ' ↗</a>' : '') + '</div></div>').join('') + '</div>'
                : '<div class="vx-empty">' + esc(T(mk.items.length ? 'Kein Treffer.' : 'Im Marktplatz sind noch keine Plugins.')) + '</div>')
            + '<p class="small muted">🔑 ' + esc(T('Katalog-Schlüssel')) + ' ' + esc(mk.key || '–') + '… · <a href="#" data-plmkkey="1">' + esc(T('Schlüssel neu lernen')) + '</a></p></div>';
    }
    function loadMarket(force) { return api('plug_market', { refresh: force ? '1' : '' }).then(r => { mk = r; render(); }).catch(e => { mk = { error: e.message, items: [] }; render(); }); }
    function load() { return api('plug_list').then(r => { d = r; render(); }).catch(e => { box.innerHTML = '<div class="vx-error">⚠ ' + esc(e.message) + '</div>'; }); }
    const upd = r => { if (r.items) d.items = r.items; if (r.msg) toast(T(r.msg)); render(); };
    function values(card) { const v = {}; card.querySelectorAll('[data-plval]').forEach(el => { v[el.dataset.plval] = el.type === 'checkbox' ? el.checked : el.value; }); return v; }
    function inspect(fd) {
        return fetch('nexus.php', { method: 'POST', credentials: 'same-origin', body: fd }).then(r => r.json()).then(r => { if (r.error) throw new Error(r.error); check = r; render(); }).catch(e => toast('⚠ ' + e.message, true));
    }
    function bind() {
        box.addEventListener('change', e => {
            const t = e.target, c = t.closest('[data-plid]');
            if (t.matches('[data-plfile]') && t.files && t.files[0]) { const fd = new FormData(); fd.append('act', 'plug_inspect'); fd.append('file', t.files[0]); t.value = ''; return inspect(fd); }
            if (t.matches('[data-plmkq]')) { mkQ = t.value; return render(); }
            if (t.matches('[data-pltoggle]') && c) return api('plug_toggle', { id: c.dataset.plid, on: t.checked ? '1' : '0' }).then(upd).catch(x => toast(x.message, true));
            if (t.matches('[data-plsel]') && c) return api('plug_ui', { id: c.dataset.plid, type: 'change', el: t.dataset.plsel, values: JSON.stringify(values(c)) }).then(upd).catch(x => toast(x.message, true));
            if (t.matches('[data-pltg]') && c) return api('plug_ui', { id: c.dataset.plid, type: 'change', el: t.dataset.pltg, values: JSON.stringify(values(c)) }).then(upd).catch(x => toast(x.message, true));
        });
        box.addEventListener('click', e => {
            const t = e.target, c = t.closest('[data-plid]');
            if (t.closest('[data-plexample]')) { const fd = new FormData(); fd.append('act', 'plug_inspect'); fd.append('example', '1'); return inspect(fd); }
            if (t.closest('[data-plcancel]')) { check = null; return render(); }
            if (t.closest('[data-plopen]')) return api('plug_open').catch(x => toast(x.message, true));
            if (t.closest('[data-plmk]')) { mkOpen = !mkOpen; render(); if (mkOpen) loadMarket(false); return; }
            if (t.closest('[data-plmkre]')) { mk = null; render(); return loadMarket(true); }
            if (t.closest('[data-plmkkey]')) { e.preventDefault(); if (!confirm(T('Nur tun, wenn der Schlüsselwechsel angekündigt war. Neu lernen?'))) return; return api('plug_market_relearn').then(r => { toast(T(r.msg)); mk = null; loadMarket(true); }).catch(x => toast(x.message, true)); }
            const g = t.closest('[data-plmkget]');
            if (g && !busy) { busy = true; g.disabled = true; return api('plug_market_get', { id: g.dataset.plmkget }).then(r => { check = r; render(); box.scrollIntoView({ behavior: 'smooth' }); }).catch(x => toast(x.message, true)).finally(() => { busy = false; }); }
            if (t.closest('[data-plinstall]') && check && !busy) { busy = true; const fromMk = check.market; return api('plug_install', { token: check.token }).then(r => { check = null; upd(r); if (fromMk) loadMarket(true); }).catch(x => toast(x.message, true)).finally(() => { busy = false; }); }
            const b = t.closest('[data-plbtn]');
            if (b && c) return api('plug_ui', { id: c.dataset.plid, type: 'click', el: b.dataset.plbtn, values: JSON.stringify(values(c)) }).then(r => { if (document.activeElement && c.contains(document.activeElement)) document.activeElement.blur(); upd(r); }).catch(x => toast(x.message, true));
            const a = t.closest('[data-plact]');
            if (!a || !c) return;
            const id = c.dataset.plid;
            if (a.dataset.plact === 'restart') return api('plug_restart', { id }).then(upd).catch(x => toast(x.message, true));
            if (a.dataset.plact === 'log') { if (logs[id]) { delete logs[id]; return render(); } return api('plug_log', { id }).then(r => { logs[id] = r.logs; render(); }).catch(x => toast(x.message, true)); }
            if (a.dataset.plact === 'remove') { if (!confirm(T('Plugin entfernen? Seine gespeicherten Daten werden mit gelöscht.'))) return; delete logs[id]; return api('plug_remove', { id }).then(upd).catch(x => toast(x.message, true)); }
        });
    }
    window.NexusPlugins = {
        open() {
            const el = document.getElementById('plugBox');
            if (!el) return;
            if (box !== el) { box = el; bind(); }
            if (!d) box.innerHTML = '<div class="vx-loading">…</div>';
            load();
            clearInterval(timer);
            timer = setInterval(() => {
                if (!box.offsetParent) return clearInterval(timer);
                if (document.hidden) return;
                api('plug_list').then(r => { const old = JSON.stringify(d && d.items); d = r; if (JSON.stringify(r.items) !== old) render(); }).catch(() => {});
                for (const id of Object.keys(logs)) api('plug_log', { id }).then(r => { if (JSON.stringify(r.logs) !== JSON.stringify(logs[id])) { logs[id] = r.logs; render(); } }).catch(() => {});
            }, 3000);
        },
    };
})();
