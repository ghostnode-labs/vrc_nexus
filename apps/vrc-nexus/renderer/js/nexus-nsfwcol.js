/* VRC Nexus – 🔞 NSFW 3.1: eigene Sammlung (Welten & Avatare) im 18+-Bereich + „🔞 Sammlung“ in Welt-/Avatar-Dialogen. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, b) => UI.toast(m, b), T = s => (window.t ? window.t(s) : s);
    const st = { kind: 'world', list: '', tag: '', q: '', sort: 'added', min: 0, edit: '' };
    let d = null, busy = false, at = 0;
    try { Object.assign(st, JSON.parse(localStorage.getItem('nx_nsfwcol') || '{}'), { edit: '' }); } catch (e) { /* ohne Speicher */ }
    const keep = () => { try { localStorage.setItem('nx_nsfwcol', JSON.stringify({ kind: st.kind, sort: st.sort })); } catch (e) { /* egal */ } };
    const stars = (n, id) => [1, 2, 3, 4, 5].map(i => '<button type="button" class="n31-star' + (i <= n ? ' on' : '') + '" data-n31="rate" data-id="' + esc(id) + '" data-v="' + (i === n ? 0 : i) + '" title="' + i + '">★</button>').join('');
    const btn = (a, label, extra, cls) => '<button type="button" class="btn btn-sm ' + (cls || '') + '" data-n31="' + a + '"' + (extra || '') + '>' + label + '</button>';
    const box = () => document.getElementById('n31Box');
    function load() {
        if (busy) return; busy = true;
        api('nsfwc_list', { kind: st.kind, list: st.list, tag: st.tag, q: st.q, sort: st.sort, min_rating: st.min })
            .then(r => { d = r; at = Date.now(); paint(); }).catch(x => { const b = box(); if (b) b.innerHTML = '<p class="vx-error">⚠ ' + esc(x.message) + '</p>'; }).finally(() => { busy = false; });
    }
    const run = (act, data, reload = true) => api(act, Object.assign({ kind: st.kind }, data || {})).then(r => { if (r.msg) toast(T(r.msg)); if (reload) load(); return r; }).catch(x => { toast('⚠ ' + x.message, true); throw x; });
    function itemHtml(x) {
        const open = x.kind === 'world' ? 'data-n31="open"' : 'data-n31="open"';
        const ed = st.edit === x.id;
        return '<div class="n31-item' + (ed ? ' edit' : '') + '">'
            + '<button type="button" class="n31-img" ' + open + ' data-id="' + esc(x.id) + '">' + (x.image ? '<img src="' + esc(x.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span>' + (x.kind === 'world' ? '🌍' : '🎭') + '</span>') + '</button>'
            + '<div class="n31-body"><b>' + esc(x.name) + '</b>' + (x.profile ? ' <span class="vx-pill" title="' + esc(T('im 18+-Profil')) + '">👤</span>' : '')
            + '<span class="small muted">' + esc(x.sub || '') + (x.count ? ' · ' + x.count + '× ' + esc(T(x.kind === 'world' ? 'besucht' : 'getragen')) : '') + ' · ' + esc(x.list) + '</span>'
            + '<span class="n31-stars">' + stars(x.rating, x.id) + '</span>'
            + (x.tags.length ? '<span class="n31-tags">' + x.tags.map(t => '<button type="button" class="chip small" data-n31="tag" data-v="' + esc(t) + '">#' + esc(t) + '</button>').join('') + '</span>' : '')
            + (x.note && !ed ? '<span class="small n31-note">' + esc(x.note) + '</span>' : '')
            + (ed ? '<div class="n31-form" data-id="' + esc(x.id) + '"><input type="text" data-f="tags" maxlength="200" value="' + esc(x.tags.join(', ')) + '" placeholder="' + esc(T('Tags, mit Komma getrennt')) + '">'
                + '<select data-f="list">' + d.lists[x.kind].map(l => '<option' + (l === x.list ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>'
                + '<textarea data-f="note" rows="2" maxlength="500" placeholder="' + esc(T('Notiz (nur für dich)')) + '">' + esc(x.note) + '</textarea>'
                + '<label class="check small"><input type="checkbox" data-f="profile"' + (x.profile ? ' checked' : '') + '> 👤 ' + esc(T('im 18+-Profil zeigen')) + '</label>'
                + '<div class="nc-row">' + btn('save', '💾 ' + esc(T('Speichern')), ' data-id="' + esc(x.id) + '"', 'btn-gold') + btn('edit', esc(T('Abbrechen')), ' data-id=""') + btn('del', '✕ ' + esc(T('Entfernen')), ' data-id="' + esc(x.id) + '"') + '</div></div>' : '')
            + '</div><div class="n31-acts">' + (x.kind === 'world' ? btn('join', '🚪 ' + esc(T('Einladung')), ' data-id="' + esc(x.id) + '" title="' + esc(T('Einladungs-Instanz erstellen')) + '"') + btn('joing', '🔞 ' + esc(T('Gruppe')), ' data-id="' + esc(x.id) + '" title="' + esc(T('18+-Gruppeninstanz erstellen')) + '"')
                : btn('wear', '🎭 ' + esc(T('Anziehen')), ' data-id="' + esc(x.id) + '"', 'btn-gold'))
            + (ed ? '' : btn('edit', '✎', ' data-id="' + esc(x.id) + '" title="' + esc(T('Bearbeiten')) + '"')) + '</div></div>';
    }
    function inner() {
        if (!d) return '<div class="vx-loading">…</div>';
        if (d.hidden) return '<div class="nc-card"><h4>🕶 ' + esc(T('Sammlung verborgen')) + '</h4><p class="small">' + esc(T('Der Privat-Modus ist an – die Sammlung bleibt verborgen, bis du sie bewusst einblendest.')) + '</p>' + btn('reveal', '👁 ' + esc(T('Trotzdem einblenden'))) + '</div>';
        const L = d.lists[st.kind] || [];
        let h = '<div class="nc-card n31-head"><div class="chips">'
            + '<button type="button" class="chip' + (st.kind === 'world' ? ' on' : '') + '" data-n31="kind" data-v="world">🌍 ' + esc(T('Welten')) + ' (' + d.counts.world + ')</button>'
            + '<button type="button" class="chip' + (st.kind === 'avatar' ? ' on' : '') + '" data-n31="kind" data-v="avatar">🎭 ' + esc(T('Avatare')) + ' (' + d.counts.avatar + ')</button>'
            + (d.revealed ? btn('hide', '🕶 ' + esc(T('wieder verbergen'))) : '') + '</div>'
            + '<div class="nc-row"><input type="text" id="n31Add" placeholder="' + esc(T(st.kind === 'world' ? 'Welt-ID oder Link (wrld_…)' : 'Avatar-ID oder Link (avtr_…)')) + '">' + btn('add', '＋ ' + esc(T('Hinzufügen')), '', 'btn-gold') + '</div>'
            + '<div class="nc-row"><input type="search" id="n31Q" value="' + esc(st.q) + '" placeholder="🔎 ' + esc(T('Suchen (Name, Ersteller, Notiz, Tags)')) + '">'
            + '<select id="n31List"><option value="">' + esc(T('alle Listen')) + '</option>' + L.map(l => '<option' + (l === st.list ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>'
            + '<select id="n31Sort">' + [['added', 'neueste'], ['name', 'Name'], ['rating', 'Bewertung'], ['used', 'am meisten genutzt'], ['last', 'zuletzt genutzt']].map(([k, n]) => '<option value="' + k + '"' + (st.sort === k ? ' selected' : '') + '>' + esc(T(n)) + '</option>').join('') + '</select>'
            + '<select id="n31Min"><option value="0">' + esc(T('jede Bewertung')) + '</option>' + [3, 4, 5].map(n => '<option value="' + n + '"' + (st.min === n ? ' selected' : '') + '>★ ' + n + '+</option>').join('') + '</select></div>'
            + (d.tags.length ? '<div class="n31-tags">' + (st.tag ? '<button type="button" class="chip on" data-n31="tag" data-v="">#' + esc(st.tag) + ' ✕</button>' : d.tags.slice(0, 24).map(t => '<button type="button" class="chip small" data-n31="tag" data-v="' + esc(t.t) + '">#' + esc(t.t) + ' <small>' + t.n + '</small></button>').join('')) + '</div>' : '')
            + '<div class="nc-row">' + btn('random', '🎲 ' + esc(T(st.kind === 'world' ? 'Zufällige Welt' : 'Zufälliger Avatar'))) + btn('newlist', '＋ ' + esc(T('Liste'))) + (st.list ? btn('renlist', '✎ ' + esc(T('Liste umbenennen'))) + btn('dellist', '✕ ' + esc(T('Liste löschen'))) : '')
            + btn('profile', '👤 ' + esc(T('18+-Profil aktualisieren')) + ' (' + d.profile + ')') + btn('export', '⇩ ' + esc(T('Export'))) + btn('import', '⇧ ' + esc(T('Import'))) + '</div></div>';
        if (d.suggest.length) h += '<div class="nc-card"><h4>💡 ' + esc(T('Vorschläge')) + ' <small class="muted">' + esc(T('mit 18+-Inhalts-Tags besucht oder getragen')) + '</small></h4>'
            + d.suggest.map(s => '<div class="n31-sug">' + (s.image ? '<img src="' + esc(s.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') + '<b>' + esc(s.name) + '</b><span class="small muted">' + esc(s.sub) + '</span>'
                + btn('sugadd', '＋', ' data-id="' + esc(s.id) + '" data-k="' + s.kind + '" title="' + esc(T('In die Sammlung')) + '"', 'btn-gold') + btn('sugno', '✕', ' data-id="' + esc(s.id) + '" title="' + esc(T('Nicht mehr vorschlagen')) + '"') + '</div>').join('') + '</div>';
        h += '<div class="nc-card n31-list">' + (d.items.length ? d.items.map(itemHtml).join('') : '<p class="vx-empty">' + esc(T(d.counts[st.kind] ? 'Nichts passt zum Filter.' : 'Noch leer – IDs oben eintragen oder in Welt-/Avatar-Fenstern auf „🔞 Sammlung“ tippen.')) + '</p>') + '</div>';
        h += '<div class="nc-card"><h4>⚙ ' + esc(T('Einstellungen')) + '</h4>'
            + [['suggest', 'Welten/Avatare mit 18+-Inhalts-Tags vorschlagen'], ['auto_count', 'Besuche und Tragen automatisch zählen'], ['hide_private', 'im Privat-Modus verbergen']].map(([k, n]) => '<label class="check small"><input type="checkbox" data-n31c="' + k + '"' + (d.cfg[k] ? ' checked' : '') + '> ' + esc(T(n)) + '</label>').join('')
            + '<p class="small muted">' + esc(T('Die Sammlung liegt verschlüsselt nur auf diesem Gerät. Im 18+-Profil erscheinen nur Einträge mit 👤 – sichtbar nur für Verified 18+ mit NSFW an.')) + '</p></div>';
        return h;
    }
    function paint() {
        const b = box(); if (!b) return;
        const f = document.activeElement, fid = f && b.contains(f) && f.id ? f.id : '';
        b.innerHTML = inner();
        const n = fid && document.getElementById(fid);
        if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) { /* kein Textfeld */ } }
    }
    const idFrom = (s, kind) => { const m = new RegExp((kind === 'world' ? 'wrld' : 'avtr') + '_[0-9a-f-]{36}', 'i').exec(String(s || '')); return m ? m[0].toLowerCase() : ''; };

    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('#n31Box [data-n31]');
        if (!b) return;
        const a = b.dataset.n31, id = b.dataset.id;
        if (a === 'kind') { st.kind = b.dataset.v; st.list = ''; st.tag = ''; st.edit = ''; keep(); return load(); }
        if (a === 'tag') { st.tag = b.dataset.v; return load(); }
        if (a === 'open') return st.kind === 'world' ? UI.openWorld(id) : UI.openAvatar(id);
        if (a === 'edit') { st.edit = id || ''; return paint(); }
        if (a === 'rate') return run('nsfwc_update', { id, rating: b.dataset.v });
        if (a === 'add') { const v = idFrom(document.getElementById('n31Add').value, st.kind); if (!v) return toast(T(st.kind === 'world' ? 'Ungültige Welt-ID (wrld_…).' : 'Ungültige Avatar-ID (avtr_…).'), true); return run('nsfwc_add', { id: v, list: st.list || undefined }); }
        if (a === 'save') {
            const f = box().querySelector('.n31-form[data-id="' + CSS.escape(id) + '"]'), g = k => f.querySelector('[data-f="' + k + '"]');
            return run('nsfwc_update', { id, tags: g('tags').value, list: g('list').value, note: g('note').value, profile: g('profile').checked ? '1' : '0' }).then(() => { st.edit = ''; });
        }
        if (a === 'del') { if (!confirm(T('Aus der Sammlung entfernen?'))) return; st.edit = ''; return run('nsfwc_remove', { id }); }
        if (a === 'join' || a === 'joing') return run('nsfwc_join', { id, type: a === 'joing' ? 'group' : 'invite' });
        if (a === 'wear') return run('nsfwc_wear', { id });
        if (a === 'random') return run('nsfwc_random', { list: st.list, tag: st.tag, min_rating: st.min }, false).then(r => { if (r.item) (st.kind === 'world' ? UI.openWorld : UI.openAvatar)(r.item.id); }).catch(() => {});
        if (a === 'newlist') { const n = prompt(T('Name der neuen Liste:')); if (n) return run('nsfwc_list_op', { op: 'create', name: n }).then(() => { st.list = n.trim(); load(); }); return; }
        if (a === 'renlist') { const n = prompt(T('Neuer Name:'), st.list); if (n && n !== st.list) return run('nsfwc_list_op', { op: 'rename', name: st.list, to: n }).then(() => { st.list = n.trim(); load(); }); return; }
        if (a === 'dellist') { if (!confirm(T('Liste löschen? Die Einträge wandern in die erste Liste.'))) return; const n = st.list; st.list = ''; return run('nsfwc_list_op', { op: 'delete', name: n }); }
        if (a === 'profile') return run('nsfwc_profile', {}, false).catch(() => {});
        if (a === 'export') return api('nsfwc_export').then(j => { const blob = new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' }), u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = 'nexus-sammlung.json'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); }).catch(x => toast(x.message, true));
        if (a === 'import') { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; inp.onchange = () => inp.files[0] && inp.files[0].text().then(txt => run('nsfwc_import', { json: txt })); inp.click(); return; }
        if (a === 'sugadd') return api('nsfwc_add', { kind: b.dataset.k, id }).then(r => { toast(T(r.msg)); load(); }).catch(x => toast(x.message, true));
        if (a === 'sugno') return run('nsfwc_dismiss', { id });
        if (a === 'reveal' || a === 'hide') return api('nsfwc_reveal', { on: a === 'reveal' ? '1' : '0', kind: st.kind }).then(r => { d = r; at = Date.now(); paint(); }).catch(x => toast(x.message, true));
    });
    let qT = null;
    document.addEventListener('input', e => { if (e.target.id === 'n31Q') { clearTimeout(qT); qT = setTimeout(() => { st.q = e.target.value; load(); }, 250); } });
    document.addEventListener('change', e => {
        const el = e.target;
        if (!el.closest || !el.closest('#n31Box')) return;
        if (el.id === 'n31List') { st.list = el.value; return load(); }
        if (el.id === 'n31Sort') { st.sort = el.value; keep(); return load(); }
        if (el.id === 'n31Min') { st.min = +el.value; return load(); }
        if (el.dataset.n31c) return run('nsfwc_cfg', { [el.dataset.n31c]: el.checked ? '1' : '0' });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'n31Add') { const b = box() && box().querySelector('[data-n31="add"]'); if (b) b.click(); } });

    /** „🔞 Sammlung“-Knopf für Welt-/Avatar-Dialoge (nur sichtbar, wenn NSFW frei ist) */
    function picker(kind, id, meta, host) {
        if (!['world', 'avatar'].includes(kind) || !host) return;
        api('nsfwc_status', { kind, id }).then(s => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'vx-fpchip n31-pick' + (s.item ? ' on' : '');
            const label = () => { b.textContent = (s.item ? '✓ ' : '＋ ') + '🔞 ' + T('Sammlung'); };
            label();
            b.addEventListener('click', ev => {
                ev.stopPropagation();
                (s.item ? api('nsfwc_remove', { kind, id }) : api('nsfwc_add', Object.assign({ kind, id }, meta || {})))
                    .then(r => { s.item = s.item ? null : (r.item || {}); b.classList.toggle('on', !!s.item); label(); toast(T(r.msg)); if (box()) load(); }).catch(x => toast(x.message, true));
            });
            host.appendChild(b);
        }).catch(() => { /* NSFW gesperrt → kein Knopf */ });
    }
    window.NexusNsfwCol = {
        html() { if (!d || Date.now() - at > 5000) load(); return '<div id="n31Box" class="n31">' + inner() + '</div>'; },
        picker,
    };
})();
