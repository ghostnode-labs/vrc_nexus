/* VRC Nexus 8.2 – 🔞 Sicherheits-Center (nur sichtbar mit NSFW-Freigabe).
 * Sicherheits-Check auf einen Blick, eigene Sperrliste (lokal, verschlüsselt) und gemeinsame Sperrliste mit Vertrauenspersonen
 * (Ende-zu-Ende-verschlüsselt über den Nexus-Chat). Gesperrte Personen können dich nie fernsteuern; du bekommst einen stillen Hinweis, wenn sie deine Instanz betreten. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    // 8.1.1: Laden mit Zeitlimit – lieber eine Meldung mit „Erneut versuchen“ als endlos „Lade …“
    const apiT = (a, d, ms = 15000) => Promise.race([UI.api(a, d), new Promise((_, rej) => setTimeout(() => rej(new Error('Keine Antwort (Zeitüberschreitung) – bitte erneut versuchen.')), ms))]);
    const T = s => (window.t ? window.t(s) : s);
    const sec = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '"><h4>' + t + '</h4>' + html + '</div>';
    const GO = { care: 'care', safe: 'safe2', nsfw: 'main', toys: 'lust', devices: '', safety: '' };
    let x = null, loading = false, reRender = null, code = '';
    const load = () => { if (loading) return; loading = true; apiT('safety_state').then(d => { x = d; }).catch(e => { x = { error: e.message }; }).finally(() => { loading = false; if (reRender) reRender(); }); };
    const fail = e => toast(e.message, true);
    const st = d => { x = d; if (d.msg) toast(d.msg); if (d.code) code = d.code; if (reRender) reRender(); };
    const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };

    function html(sub, render) {
        reRender = render;
        if (!x) { load(); return '<p class="muted">' + esc(T('Lädt …')) + '</p>'; }
        if (x.error) return '<p class="muted">' + esc(x.error) + '</p>';
        const c = x.check;
        let h = sec('🛡 ' + esc(T('Sicherheits-Check')) + ' <span class="small muted">' + c.score + ' / ' + c.total + '</span>',
            '<ul class="nw-devs">' + c.items.map(i => '<li><span>' + (i.ok ? '✅' : '⚪') + '</span><div><b>' + esc(T(i.title)) + '</b>' + (i.ok ? '' : '<small>' + esc(T(i.hint)) + '</small>') + '</div>'
                + (i.ok ? '' : i.tab === 'devices' ? '<button type="button" class="btn btn-sm" data-x6="go">' + esc(T('Einrichten')) + '</button>' : GO[i.tab] ? '<button type="button" class="btn btn-sm" data-nsub="' + GO[i.tab] + '">' + esc(T('Einrichten')) + '</button>' : '') + '</li>').join('') + '</ul>', 'ns-wide');
        const rows = x.blocks.length ? x.blocks.map(b => '<div class="nc-mrow"><b>' + esc(b.name || b.id.slice(0, 16) + '…') + '</b><span class="muted small">' + esc(b.note || '') + (b.from ? ' · 📥 ' + esc(T('von')) + ' ' + esc(b.from) : '') + '</span>'
            + '<button type="button" class="nc-x" data-x6="del" data-id="' + esc(b.id) + '" title="' + esc(T('Entfernen')) + '">✕</button></div>').join('') : '<p class="muted small">' + esc(T('Noch niemand gesperrt.')) + '</p>';
        h += sec('⛔ ' + esc(T('Sperrliste')) + ' <span class="small muted">' + x.blocks.length + '</span>', '<p class="muted small">' + esc(T('Gesperrte Personen können dich nie fernsteuern. Betreten sie deine Instanz, bekommst du einen stillen Hinweis – nie in der Chatbox. Nur auf diesem Gerät, verschlüsselt.')) + '</p>'
            + rows + '<div class="nc-row"><input type="text" id="x6Name" maxlength="60" placeholder="' + esc(T('Name')) + '" aria-label="' + esc(T('Name')) + '"><input type="text" id="x6Id" placeholder="usr_…" aria-label="VRChat-ID"></div>'
            + '<div class="nc-row"><input type="text" id="x6Note" maxlength="200" placeholder="' + esc(T('Notiz (optional)')) + '" aria-label="' + esc(T('Notiz')) + '" style="flex:1"><button type="button" class="btn btn-sm btn-gold" data-x6="add">⛔ ' + esc(T('Sperren')) + '</button></div>'
            + (x.recent.length ? '<p class="small">🕒 ' + esc(T('Zuletzt gesehen')) + ': ' + x.recent.map(r => esc(r.name)).join(', ') + '</p>' : ''));
        h += sec('🤝 ' + esc(T('Gemeinsame Sperrliste')), '<p class="muted small">' + esc(T('Teile deine eigenen Einträge mit Personen auf deiner Vertrauensliste – Ende-zu-Ende verschlüsselt über den Nexus-Chat. Übernommene Einträge werden nicht weitergeteilt.')) + '</p>'
            + (x.trust.length ? '<div class="nc-row"><select id="x6To" aria-label="' + esc(T('Empfänger')) + '">' + x.trust.map(t => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') + '</select>'
                + '<label class="check small"><input type="checkbox" id="x6Notes"> ' + esc(T('mit Notizen')) + '</label><button type="button" class="btn btn-sm" data-x6="share">📤 ' + esc(T('Teilen')) + '</button></div>'
                : '<p class="small">' + esc(T('Erst jemanden auf die Vertrauensliste setzen (💗 Vertrauen & Fürsorge).')) + '</p>')
            + '<div class="nc-row"><input type="text" id="x6Code" placeholder="NXB1.…" aria-label="' + esc(T('Sperrlisten-Code')) + '" style="flex:1"><input type="text" id="x6From" maxlength="40" placeholder="' + esc(T('von wem?')) + '" aria-label="' + esc(T('von wem?')) + '" style="width:110px"><button type="button" class="btn btn-sm" data-x6="import">📥 ' + esc(T('Übernehmen')) + '</button></div>'
            + '<button type="button" class="nc-link" data-x6="export">' + esc(T('Code ohne Chat erstellen')) + '</button>' + (code ? '<textarea readonly rows="2" style="width:100%" aria-label="Code">' + esc(code) + '</textarea>' : ''));
        return h;
    }
    function onClick(e, render) {
        const b = e.target.closest('[data-x6]'); if (!b) return false;
        reRender = render;
        const a = b.dataset.x6;
        if (a === 'go') { if (window.NexusOpenTool) window.NexusOpenTool('watch'); return true; }
        if (a === 'add') { api('safety_block', { id: val('x6Id'), name: val('x6Name'), note: val('x6Note') }).then(st).catch(fail); return true; }
        if (a === 'del') { if (confirm(T('Von der Sperrliste nehmen?'))) api('safety_unblock', { id: b.dataset.id }).then(st).catch(fail); return true; }
        if (a === 'share') { api('safety_share', { to: val('x6To'), notes: document.getElementById('x6Notes').checked ? '1' : '' }).then(st).catch(fail); return true; }
        if (a === 'import') { api('safety_import', { code: val('x6Code'), from: val('x6From') }).then(st).catch(fail); return true; }
        if (a === 'export') { api('safety_export', {}).then(st).catch(fail); return true; }
        return false;
    }
    window.NexusNsfw6 = { html, onClick, reload: () => { x = null; } };
})();
