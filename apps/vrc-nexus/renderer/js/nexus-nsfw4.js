/* VRC Nexus 6.7 – 🔞 Grenzen & Sicherheit, Fantasien und Hilfe (nur sichtbar mit NSFW-Freigabe).
 * Grenzen-Profil mit Kategorien (Ja / Vielleicht / Nein + Notiz), Safeword überall gleich, Privat-Modus 2.0,
 * lokales verschlüsseltes Protokoll, Geräte-Profile, Fantasie-Baukasten mit Rollen, Hilfe. Daten bleiben auf diesem Gerät. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    const sec = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '"><h4>' + t + '</h4>' + html + '</div>';
    const LV = { yes: ['🟢', 'Ja'], maybe: ['🟡', 'Vielleicht'], no: ['🔴', 'Nein'] };
    let x = null, loading = false, edit = null, fEd = null, logItems = null, reRender = null;
    let loadErr = '';
    // 8.0.21: Fehler anzeigen (mit „Erneut versuchen“) statt endlos neu zu laden
    const load = () => { if (loading || loadErr) return; loading = true; api('nsfwx_state').then(d => { x = d; edit = null; loadErr = ''; }).catch(e => { loadErr = e.message || 'Fehler'; }).finally(() => { loading = false; if (reRender) reRender(); }); };
    const fail = e => toast(e.message, true);

    function limitsHtml() {
        const l = edit || x.limits;
        return '<p class="muted small">' + esc(T('Trag ein, was du magst, was vielleicht geht und was nie. Die Grenzen-Karte für die Chatbox wird daraus automatisch gefüllt. Nur auf diesem Gerät, verschlüsselt.')) + '</p>'
            + x.cats.map(c => {
                const it = l.map((v, i) => [v, i]).filter(([v]) => v.cat === c);
                return '<details class="nx4-cat"' + (it.length ? ' open' : '') + '><summary><b>' + esc(T(c)) + '</b> <small class="muted">' + it.length + '</small></summary>'
                    + it.map(([v, i]) => '<div class="nx4-lim"><input type="text" data-l="label" data-i="' + i + '" value="' + esc(v.label) + '" maxlength="60" placeholder="' + esc(T('z. B. Kuscheln')) + '">'
                        + '<span class="nx4-lv">' + Object.entries(LV).map(([k, [ic, n]]) => '<button type="button" class="chip' + (v.level === k ? ' on' : '') + '" data-x4="lv" data-i="' + i + '" data-v="' + k + '" title="' + esc(T(n)) + '">' + ic + '</button>').join('') + '</span>'
                        + '<input type="text" data-l="note" data-i="' + i + '" value="' + esc(v.note) + '" maxlength="200" placeholder="' + esc(T('Notiz (optional)')) + '"><button type="button" class="nc-x" data-x4="ldel" data-i="' + i + '">✕</button></div>').join('')
                    + '<button type="button" class="nc-link" data-x4="ladd" data-c="' + esc(c) + '">＋ ' + esc(T('Eintrag')) + '</button></details>';
            }).join('')
            + '<div class="nc-row"><button type="button" class="btn btn-sm btn-gold" data-x4="lsave">💾 ' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm" data-x4="lcopy">📋 ' + esc(T('Als Text kopieren')) + '</button></div>';
    }
    function safetyHtml() {
        const s = x.cfg.safeword, p = x.cfg.private2, lg = x.cfg.log;
        const cb = (part, k, on, label) => '<label class="check small"><input type="checkbox" data-x4c="' + part + '" data-k="' + k + '"' + (on ? ' checked' : '') + '> ' + esc(T(label)) + '</label>';
        return sec('🛑 ' + esc(T('Safeword – überall gleich')),
            '<p class="muted small">' + esc(T('Ein Ablauf für alle Wege: gesprochen (Spracheingabe), als Geste (Avatar-Parameter), mit dem Knopf hier, einem Tastenkürzel, dem Stream Deck oder der Nexus Watch.')) + '</p>'
            + '<div class="nc-row"><span class="small">' + esc(T('Wort')) + '</span><input type="text" data-x4c="safeword" data-k="word" value="' + esc(s.word) + '" maxlength="40" placeholder="' + esc(T('z. B. Mango')) + '"></div>'
            + '<div class="nc-row"><span class="small">' + esc(T('Geste: Parameter')) + '</span><input type="text" data-x4c="safeword" data-k="param" value="' + esc(s.param) + '" placeholder="NX/Safeword"><span class="small">=</span><input type="text" data-x4c="safeword" data-k="param_value" value="' + esc(s.param_value) + '" style="width:60px"></div>'
            + '<div class="nc-row">' + cb('safeword', 'toys', s.toys, 'Spielzeug stoppen') + cb('safeword', 'scenes', s.scenes, 'Szene beenden') + cb('safeword', 'consent_red', s.consent_red, 'Ampel auf Rot') + cb('safeword', 'chat', s.chat, 'Hinweis in die Chatbox') + cb('safeword', 'private', s.private, 'Privat-Modus an') + '</div>'
            + '<div class="nc-row"><button type="button" class="btn btn-sm" data-x4="save" data-part="safeword">💾 ' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm btn-danger" data-x4="sw">🛑 ' + esc(T('Safeword jetzt')) + '</button></div>'
            + '<p class="muted small">' + esc(T('Tastenkürzel: Einstellungen → System → Tastenkürzel. Stream Deck: Aktion „safeword“.')) + '</p>')
            + sec('🕶 ' + esc(T('Privat-Modus 2.0')), '<p class="muted small">' + esc(T('Ein Schalter für alles 18+: keine Chatbox, kein Discord-Status, keine Welt auf der Uhr – und auf Wunsch auch keine 18+-Menüs und Meldungen.')) + '</p>'
            + '<div class="nc-row"><button type="button" class="btn ' + (x.private ? 'btn-gold' : '') + '" data-x4="priv">🕶 ' + (x.private ? T('AN') : T('aus')) + '</button></div>'
            + cb('private2', 'hide_ui', p.hide_ui, '18+-Menüs und -Bereiche ausblenden') + cb('private2', 'mute_notes', p.mute_notes, '18+-Meldungen stumm') + cb('private2', 'persist', p.persist, 'nach Neustart weiter an')
            + '<div class="nc-row"><span class="small">' + esc(T('Automatisch aus nach')) + '</span><input type="number" data-x4c="private2" data-k="auto_off_min" value="' + p.auto_off_min + '" min="0" max="480" style="width:70px"><span class="small">min (0 = nie)</span>'
            + '<button type="button" class="btn btn-sm" data-x4="save" data-part="private2">💾</button></div>')
            + sec('📓 ' + esc(T('Protokoll (nur hier, verschlüsselt)')), cb('log', 'on', lg.on, 'Panik, Safeword, Ampel, Privat-Modus und Szenen mitschreiben')
            + '<div class="nc-row"><span class="small">' + esc(T('Automatisch löschen nach')) + '</span><input type="number" data-x4c="log" data-k="days" value="' + lg.days + '" min="1" max="365" style="width:70px"><span class="small">' + esc(T('Tagen')) + '</span><button type="button" class="btn btn-sm" data-x4="save" data-part="log">💾</button></div>'
            + '<div class="nc-row"><button type="button" class="btn btn-sm" data-x4="log">📓 ' + esc(T('Anzeigen')) + ' (' + x.log_count + ')</button><button type="button" class="btn btn-sm btn-danger" data-x4="logclr">🗑 ' + esc(T('Alles löschen')) + '</button></div>'
            + (logItems ? '<div class="nx4-log">' + (logItems.length ? logItems.map(i => '<div><span class="muted small">' + esc(new Date(i.t).toLocaleString(window.nxLoc ? nxLoc() : 'de-DE')) + '</span> <b>' + esc(i.kind) + '</b> ' + esc(i.text) + '</div>').join('') : '<p class="muted small">–</p>') + '</div>' : ''))
            + sec('🎮 ' + esc(T('Geräte-Profile')), '<p class="muted small">' + esc(T('Aktuelle Spielzeug-Einstellungen (Geräte, Verknüpfungen, Puls, Stimme, Ampel, Edging) unter einem Namen sichern – z. B. „Solo“ und „Zu zweit“.')) + '</p>'
            + x.devprofiles.map(p2 => '<div class="nc-mrow"><b>' + esc(p2.name) + '</b><span class="muted small">' + esc(new Date(p2.at).toLocaleDateString(window.nxLoc ? nxLoc() : 'de-DE')) + '</span><button type="button" class="btn btn-sm btn-gold" data-x4="dload" data-n="' + esc(p2.name) + '">▶ ' + esc(T('Laden')) + '</button><button type="button" class="nc-x" data-x4="ddel" data-n="' + esc(p2.name) + '">✕</button></div>').join('')
            + '<div class="nc-row"><input type="text" id="nx4Dev" maxlength="40" placeholder="' + esc(T('Name des Profils')) + '"><button type="button" class="btn btn-sm" data-x4="dsave">💾 ' + esc(T('Aktuelles sichern')) + '</button></div>');
    }
    function fantasyHtml() {
        const f = fEd;
        const list = x.fantasies.length ? x.fantasies.map(z => '<div class="nc-mrow"><b>' + esc(z.title) + '</b><span class="muted small">' + z.roles.length + ' ' + esc(T('Rollen')) + '</span>'
            + '<button type="button" class="nc-link" data-x4="fshare" data-id="' + esc(z.id) + '">📤 ' + esc(T('Teilen')) + '</button>' + '<button type="button" class="nc-link" data-x4="fedit" data-id="' + esc(z.id) + '">' + esc(T('bearbeiten')) + '</button><button type="button" class="nc-link" data-x4="fcopy" data-id="' + esc(z.id) + '">📋</button><button type="button" class="nc-link" data-x4="fchat" data-id="' + esc(z.id) + '">💬</button>'
            + '<button type="button" class="nc-x" data-x4="fdel" data-id="' + esc(z.id) + '">✕</button></div>').join('') : '<p class="muted small">' + esc(T('Noch keine Fantasien.')) + '</p>';
        if (!f) return sec('🎭 ' + esc(T('Fantasie-Baukasten')), '<p class="muted small">' + esc(T('Plant gemeinsam: Ort, Stimmung, Rollen, Grenzen und Safeword – als Karte zum Teilen (Text oder Chatbox). Vor dem Start immer den Consent-Check machen.')) + '</p>'
            + list + '<button type="button" class="btn btn-sm btn-gold" data-x4="fnew">＋ ' + esc(T('Neue Fantasie')) + '</button>', 'ns-wide');
        const inp = (k, ph, max) => '<input type="text" data-f="' + k + '" value="' + esc(f[k] || '') + '" maxlength="' + max + '" placeholder="' + esc(T(ph)) + '">';
        return sec('🎭 ' + esc(T('Fantasie bearbeiten')), '<div class="nx4-f">' + inp('title', 'Titel', 60) + inp('place', 'Ort, z. B. Onsen-Welt', 80) + inp('mood', 'Stimmung, z. B. verspielt', 80)
            + f.roles.map((r, i) => '<div class="nc-row"><span>👤</span><input type="text" data-fr="name" data-i="' + i + '" value="' + esc(r.name) + '" maxlength="40" placeholder="' + esc(T('Rolle')) + '" style="max-width:160px"><input type="text" data-fr="desc" data-i="' + i + '" value="' + esc(r.desc) + '" maxlength="200" placeholder="' + esc(T('Was macht diese Rolle?')) + '">' + (f.roles.length > 2 ? '<button type="button" class="nc-x" data-x4="frdel" data-i="' + i + '">✕</button>' : '') + '</div>').join('')
            + (f.roles.length < 4 ? '<button type="button" class="nc-link" data-x4="fradd">＋ ' + esc(T('Rolle')) + '</button>' : '')
            + inp('limits', 'Grenzen für diese Szene', 300) + inp('safeword', 'Safeword', 40)
            + '<div class="nc-row"><button type="button" class="btn btn-sm btn-gold" data-x4="fsave">💾 ' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm" data-x4="fcancel">' + esc(T('Abbrechen')) + '</button></div></div>', 'ns-wide');
    }
    function helpHtml() {
        const Q = [['🔞', 'Warum sehe ich das hier?', 'Weil dein Konto „Verified 18+“ hat und NSFW eingeschaltet ist. Beides prüft der Server bei jeder Anfrage. Ausschalten jederzeit in den Einstellungen – oder mit Panik.'],
            ['🚨', 'Panik oder Safeword?', 'Panik versteckt alles sofort (sicherer Avatar, Privat-Modus, NSFW aus). Safeword ist für die Szene: Spielzeug stoppen, Ampel rot, Pause – du bleibst aber im 18+-Bereich.'],
            ['🤝', 'Wie funktioniert der Consent-Check?', 'Im 💌 18+-Anfragen-Bereich: eine Seite schlägt Ampel, Grenzen, Safeword und Dauer vor, die andere stimmt mit eigenen Bedingungen zu. Rot startet nichts, die kürzere Dauer gilt.'],
            ['🔒', 'Wer sieht meine Grenzen und Fantasien?', 'Niemand – sie liegen verschlüsselt nur auf diesem Gerät. Teilen geht nur, wenn du sie selbst kopierst oder in die Chatbox schickst.'],
            ['🕶', 'Was macht der Privat-Modus?', 'Keine Chatbox, kein Discord-Status, keine Welt auf der Uhr, auf Wunsch keine 18+-Menüs und Meldungen. Mit „automatisch aus“ vergisst du ihn nicht.'],
            ['🎮', 'Spielzeug reagiert nicht', 'Intiface Central starten, Gerät dort verbinden, dann in VRC Nexus unter 🎮 Spielzeug „Verbinden“. Bei Problemen: Ampel nicht auf Rot? Privat-Modus? Szene beendet?'],
            ['🆘', 'Mir geht es nicht gut', 'Brich ab, wann immer du willst – das ist immer okay. Melde Belästigung mit ⚠ an der Nachricht oder im Profil; die Moderation sieht es sofort.']];
        return sec('❓ ' + esc(T('Hilfe & Erklärungen')), Q.map(([i, q, a]) => '<details class="nx4-help"><summary>' + i + ' <b>' + esc(T(q)) + '</b></summary><p class="small">' + esc(T(a)) + '</p></details>').join(''), 'ns-wide');
    }
    function html(sub, render) {
        reRender = render;
        if (!x && loadErr) return '<div class="nc-card"><p class="bad">⚠ ' + esc(T(loadErr)) + '</p><button type="button" class="btn btn-sm" data-x4="retry">' + esc(T('Erneut versuchen')) + '</button></div>';
        if (!x) { load(); return '<div class="nc-card"><p class="muted">' + esc(T('Lade …')) + '</p></div>'; }
        if (sub === 'safe2') return sec('📋 ' + esc(T('Grenzen-Profil')), limitsHtml(), 'ns-wide') + safetyHtml();
        if (sub === 'fantasy') return fantasyHtml();
        if (sub === 'help') return helpHtml();
        return '';
    }
    function onClick(e, render) {
        const b = e.target.closest('[data-x4]'); if (!b) return false;
        reRender = render;
        if (b.dataset.x4 === 'retry') { loadErr = ''; x = null; render(); return true; }
        if (!x) return false;
        const a = b.dataset.x4, i = +b.dataset.i;
        const st = d => { x = Object.assign(x, d); if (d.msg) toast(d.msg); render(); };
        if (a === 'ladd') { edit = (edit || x.limits.slice()).concat([{ cat: b.dataset.c, label: '', level: 'maybe', note: '' }]); render(); return true; }
        if (a === 'ldel') { edit = (edit || x.limits.slice()); edit.splice(i, 1); render(); return true; }
        if (a === 'lv') { edit = (edit || x.limits.map(v => Object.assign({}, v))); edit[i].level = b.dataset.v; render(); return true; }
        if (a === 'lsave') { api('nsfwx_limits_save', { list: JSON.stringify(edit || x.limits) }).then(d => { edit = null; st(d); }).catch(fail); return true; }
        if (a === 'lcopy') { api('nsfwx_limits_text').then(d => navigator.clipboard.writeText(d.text)).then(() => toast(T('Kopiert.'))).catch(fail); return true; }
        if (a === 'save') {
            const part = b.dataset.part, data = { part };
            document.querySelectorAll('[data-x4c="' + part + '"]').forEach(el => { data[el.dataset.k] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value; });
            api('nsfwx_cfg', data).then(st).catch(fail); return true;
        }
        if (a === 'sw') { api('nsfwx_safeword', { source: 'Knopf' }).then(d => toast(d.msg)).catch(fail); return true; }
        if (a === 'priv') { api('nsfwx_private', {}).then(d => { st(d); if (window.NexusNsfw && window.NexusNsfw.refresh) window.NexusNsfw.refresh(); }).catch(fail); return true; }
        if (a === 'log') { api('nsfwx_log').then(d => { logItems = d.items; render(); }).catch(fail); return true; }
        if (a === 'logclr') { if (!confirm(T('Protokoll komplett löschen?'))) return true; api('nsfwx_log_clear').then(d => { logItems = []; x.log_count = 0; toast(d.msg); render(); }).catch(fail); return true; }
        if (a === 'dsave') { const n = (document.getElementById('nx4Dev') || {}).value || ''; api('nsfwx_dev_save', { name: n }).then(st).catch(fail); return true; }
        if (a === 'dload') { api('nsfwx_dev_load', { name: b.dataset.n }).then(d => toast(d.msg)).catch(fail); return true; }
        if (a === 'ddel') { api('nsfwx_dev_del', { name: b.dataset.n }).then(st).catch(fail); return true; }
        if (a === 'fnew') { fEd = { id: '', title: '', place: '', mood: '', roles: [{ name: '', desc: '' }, { name: '', desc: '' }], limits: '', safeword: x.cfg.safeword.word || '' }; render(); return true; }
        if (a === 'fedit') { fEd = JSON.parse(JSON.stringify(x.fantasies.find(z => z.id === b.dataset.id))); render(); return true; }
        if (a === 'fcancel') { fEd = null; render(); return true; }
        if (a === 'fradd') { fEd.roles.push({ name: '', desc: '' }); render(); return true; }
        if (a === 'frdel') { fEd.roles.splice(i, 1); render(); return true; }
        if (a === 'fsave') { api('nsfwx_fantasy_save', Object.assign({}, fEd, { roles: JSON.stringify(fEd.roles) })).then(d => { fEd = null; st(d); }).catch(fail); return true; }
        if (a === 'fdel') { if (!confirm(T('Fantasie löschen?'))) return true; api('nsfwx_fantasy_del', { id: b.dataset.id }).then(st).catch(fail); return true; }
        if (a === 'fshare') { const z = x.fantasies.find(f => f.id === b.dataset.id); if (!z || !window.NexusAdult) return true; const d0 = prompt(T('Kurze Beschreibung für die Vorlagen-Bibliothek (optional):'), ''); if (d0 === null) return true;
            window.NexusAdult.share('fantasy', z.title, { place: z.place, mood: z.mood, roles: z.roles, limits: z.limits, safeword: z.safeword }, d0).then(d => toast(d.msg)).catch(fail); return true; }   // 7.3.2
        if (a === 'fcopy') { api('nsfwx_fantasy_text', { id: b.dataset.id }).then(d => navigator.clipboard.writeText(d.text)).then(() => toast(T('Kopiert.'))).catch(fail); return true; }
        if (a === 'fchat') { api('nsfwx_fantasy_text', { id: b.dataset.id }).then(d => api('nsfw_chat', { text: d.text.split('\n').slice(0, 3).join(' · ') })).then(d => toast(d.msg)).catch(fail); return true; }
        return false;
    }
    function onInput(e) {
        const l = e.target.closest('[data-l]'), f = e.target.closest('[data-f]'), fr = e.target.closest('[data-fr]');
        if (l) { edit = edit || x.limits.map(v => Object.assign({}, v)); edit[+l.dataset.i][l.dataset.l] = l.value; return true; }
        if (f && fEd) { fEd[f.dataset.f] = f.value; return true; }
        if (fr && fEd) { fEd.roles[+fr.dataset.i][fr.dataset.fr] = fr.value; return true; }
        return false;
    }
    window.NexusNsfw4 = { html, onClick, onInput, reload: () => { x = null; } };
})();
