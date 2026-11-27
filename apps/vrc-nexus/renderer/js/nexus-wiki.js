/* VRC Nexus 7.2 – 📚 Steckbriefe (Welten & Avatare mit Bewertungen und Tags) und 🎨 Creator-Profile.
 * Gleiche Datei auf der Webseite (NexusWebKit, nw_sb_*) und in der App (NexusUI, sb_* → nexuswiki.php). Alle Texte nur maskiert. */
(function () {
    const APP = !window.NexusWebKit;
    const K = window.NexusWebKit || (window.NexusUI && { api: window.NexusUI.api, toast: (m, k) => window.NexusUI.toast(m, k === 'error'), esc: window.NexusUI.esc });
    const box = document.getElementById('nwWiki');
    if (!K || !box) return;
    const { api, toast, esc } = K;
    const $ = (s, r) => (r || box).querySelector(s);
    const $$ = (s, r) => [...(r || box).querySelectorAll(s)];
    let site = '';
    const call = (a, data) => api((APP ? 'sb_' : 'nw_sb_') + a, { data: JSON.stringify(data || {}) }).then(d => { if (d && d._site) site = d._site.replace(/\/+$/, '') + '/'; return d; });
    const fail = e => toast(e.message || String(e), 'error');
    const stars = (n, big) => '<span class="sb-stars' + (big ? ' big' : '') + '">' + [1, 2, 3, 4, 5].map(i => i <= Math.round(n) ? '★' : '☆').join('') + '</span>';
    const KIND = { world: '🌐 Welt', avatar: '🎭 Avatar' };
    let view = 'list', filt = { kind: '', q: '', tag: '', sort: 'top' };

    function shell(inner) {
        box.innerHTML = '<div class="nw-row" style="margin-bottom:12px">'
            + [['list', '📚 Entdecken'], ['new', '➕ Neuer Steckbrief'], ['me', '🎨 Mein Creator-Profil']].map(([k, t]) => '<button type="button" class="btn btn-sm' + (view === k ? ' btn-gold' : '') + '" data-v="' + k + '">' + t + '</button>').join('')
            + '</div><div data-body>' + inner + '</div>';
        $$('[data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
        return $('[data-body]');
    }
    const card = x => '<div class="nw-card sb-card" data-k="' + esc(x.kind) + '" data-i="' + esc(x.id) + '">' + (x.image ? '<div class="sb-img" style="background-image:url(\'' + encodeURI(x.image) + '\')"></div>' : '<div class="sb-img sb-noimg">' + (x.kind === 'world' ? '🌐' : '🎭') + '</div>')
        + '<b>' + esc(x.name) + '</b><div class="nw-muted">' + KIND[x.kind] + (x.creator_name ? ' · ' + esc(x.creator_name) : '') + '</div>'
        + '<div>' + stars(x.avg) + ' <span class="nw-muted">' + (x.count ? x.avg + ' (' + x.count + ')' : 'noch keine Bewertung') + '</span></div>'
        + (x.tags.length ? '<div class="sb-tags">' + x.tags.map(t => '<span>#' + esc(t.tag) + '</span>').join('') + '</div>' : '') + '</div>';

    function list() {
        const body = shell('<div class="nw-row" style="margin-bottom:8px"><input type="search" data-q placeholder="Name, Creator oder wrld_/avtr_-ID" value="' + esc(filt.q) + '" style="flex:2;min-width:180px">'
            + '<select data-kind><option value="">Welten & Avatare</option><option value="world">🌐 Welten</option><option value="avatar">🎭 Avatare</option></select>'
            + '<select data-sort><option value="top">⭐ Beste</option><option value="rated">💬 Meiste Bewertungen</option><option value="new">🆕 Neueste</option></select></div>'
            + '<div class="sb-tags sb-pop" data-pop></div><div class="nw-grid" data-list><span class="nw-muted">Lädt …</span></div>');
        $('[data-kind]', body).value = filt.kind; $('[data-sort]', body).value = filt.sort;
        const load = () => call('list', filt).then(d => {
            $('[data-pop]', body).innerHTML = (filt.tag ? '<span class="on" data-tg="">✕ #' + esc(filt.tag) + '</span>' : '') + d.popular_tags.filter(t => t !== filt.tag).map(t => '<span data-tg="' + esc(t) + '">#' + esc(t) + '</span>').join('');
            $$('[data-tg]', body).forEach(s => s.onclick = () => { filt.tag = s.dataset.tg; load(); });
            const l = $('[data-list]', body);
            l.innerHTML = d.items.length ? d.items.map(card).join('') : '<span class="nw-muted">Nichts gefunden – leg den ersten Steckbrief an!</span>';
            $$('[data-i]', l).forEach(c => c.onclick = () => item(c.dataset.k, c.dataset.i));
        }).catch(e => { $('[data-list]', body).innerHTML = '<div class="vx-error">' + esc(e.message) + '</div>'; });
        let tm; $('[data-q]', body).oninput = e => { filt.q = e.target.value; clearTimeout(tm); tm = setTimeout(load, 300); };
        $('[data-kind]', body).onchange = e => { filt.kind = e.target.value; load(); };
        $('[data-sort]', body).onchange = e => { filt.sort = e.target.value; load(); };
        load();
    }

    function item(kind, id) {
        view = 'item';
        const body = shell('<span class="nw-muted">Lädt …</span>');
        call('get', { kind, id }).then(d => {
            if (!d.exists) return form({ kind, id }, true);
            const x = d.item, mine = d.reviews.find(r => r.own);
            body.innerHTML = '<div class="nw-card sb-head">' + (x.image ? '<div class="sb-img big" style="background-image:url(\'' + encodeURI(x.image) + '\')"></div>' : '')
                + '<div class="nw-row"><h3 style="margin:0">' + esc(x.name) + '</h3><span class="nw-muted">' + KIND[x.kind] + '</span><span class="sp"></span>' + (x.can_edit ? '<button type="button" class="btn btn-sm" data-edit>✏ Bearbeiten</button>' : '') + '</div>'
                + '<div class="nw-muted sb-mono">' + esc(x.id) + '</div>'
                + (x.creator_name || x.creator_id ? '<div>🎨 ' + (x.creator_id ? '<a href="#" data-cr="' + esc(x.creator_id) + '">' + esc(x.creator_name || 'Creator') + '</a>' : esc(x.creator_name)) + '</div>' : '')
                + '<div style="margin:6px 0">' + stars(x.avg, true) + ' <b>' + (x.count ? x.avg : '–') + '</b> <span class="nw-muted">(' + x.count + ' Bewertungen)</span></div>'
                + (x.descr ? '<div class="nw-text">' + esc(x.descr) + '</div>' : '') + '</div>'
                + '<div class="nw-card"><h3>🏷 Tags der Community</h3><div class="sb-tags">' + x.tags.map(t => '<span class="vote' + (t.mine ? ' on' : '') + '" data-tag="' + esc(t.tag) + '">#' + esc(t.tag) + ' <small>' + t.n + '</small></span>').join('') + '</div>'
                + '<div class="nw-row" style="margin-top:8px"><input data-newtag maxlength="24" placeholder="z. B. chill, spiegel, quest" style="flex:1"><button type="button" class="btn btn-sm" data-addtag>＋ Tag</button></div><p class="nw-muted">Tippe einen Tag an, um zuzustimmen (oder es zurückzunehmen).</p></div>'
                + '<div class="nw-card"><h3>' + (mine ? '✏ Deine Bewertung' : '⭐ Bewerten') + '</h3><div class="sb-pick" data-pick>' + [1, 2, 3, 4, 5].map(i => '<button type="button" data-s="' + i + '">☆</button>').join('') + '</div>'
                + '<textarea data-rt rows="3" maxlength="1000" placeholder="Was gefällt dir? (optional)" style="width:100%">' + esc(mine ? mine.text : '') + '</textarea>'
                + '<div class="nw-row"><span class="sp"></span>' + (mine ? '<button type="button" class="btn btn-sm" data-rdel>🗑</button>' : '') + '<button type="button" class="btn btn-sm btn-gold" data-rsend>Speichern</button></div></div>'
                + '<div class="nw-card"><h3>💬 Bewertungen</h3>' + (d.reviews.length ? d.reviews.map(r => '<div class="cl-msg">' + stars(r.stars) + ' <b>' + esc(r.name) + '</b> <span class="nw-muted">' + new Date(r.created * 1000).toLocaleDateString() + (r.held ? ' · ⏳ wird geprüft' : '') + '</span>' + (r.text ? '<div class="nw-text">' + esc(r.text) + '</div>' : '') + '</div>').join('') : '<span class="nw-muted">Noch keine Bewertungen.</span>') + '</div>';
            let pick = mine ? mine.stars : 0;
            const paint = () => $$('[data-s]', body).forEach(b => { b.textContent = +b.dataset.s <= pick ? '★' : '☆'; });
            paint();
            $$('[data-s]', body).forEach(b => b.onclick = () => { pick = +b.dataset.s; paint(); });
            $('[data-rsend]', body).onclick = () => call('review', { kind, id, stars: pick, text: $('[data-rt]', body).value }).then(r => { toast(r.msg); item(kind, id); }).catch(fail);
            const rd = $('[data-rdel]', body); if (rd) rd.onclick = () => call('review', { kind, id, delete: 1 }).then(r => { toast(r.msg); item(kind, id); }).catch(fail);
            $$('[data-tag]', body).forEach(s => s.onclick = () => call('tag', { kind, id, tag: s.dataset.tag, on: s.classList.contains('on') ? 0 : 1 }).then(() => item(kind, id)).catch(fail));
            $('[data-addtag]', body).onclick = () => call('tag', { kind, id, tag: $('[data-newtag]', body).value, on: 1 }).then(() => item(kind, id)).catch(fail);
            const ed = $('[data-edit]', body); if (ed) ed.onclick = () => form(x, false);
            const cr = $('[data-cr]', body); if (cr) cr.onclick = ev => { ev.preventDefault(); creator(cr.dataset.cr); };
        }).catch(e => { body.innerHTML = '<div class="vx-error">' + esc(e.message) + '</div>'; });
    }

    function form(x, isNew) {
        view = isNew ? 'new' : 'item';
        x = x || { kind: 'world', id: '' };
        const body = shell('<div class="nw-card"><h3>' + (isNew ? '➕ Neuer Steckbrief' : '✏ Steckbrief bearbeiten') + '</h3><div class="cl-form">'
            + '<label>Art<select data-f="kind"' + (isNew ? '' : ' disabled') + '><option value="world">🌐 Welt</option><option value="avatar">🎭 Avatar</option></select></label>'
            + '<label class="cl-wide">ID (wrld_… oder avtr_…)<input data-f="id" value="' + esc(x.id || '') + '"' + (isNew ? '' : ' readonly') + '></label>'
            + '<label class="cl-wide">Name<input data-f="name" maxlength="80" value="' + esc(x.name || '') + '"></label>'
            + '<label>Creator (Name)<input data-f="creator_name" maxlength="60" value="' + esc(x.creator_name || '') + '"></label>'
            + '<label>Creator-ID (usr_…, optional)<input data-f="creator_id" value="' + esc(x.creator_id || '') + '"></label>'
            + '<label class="cl-wide">Bild (https, png/jpg/webp)<input data-f="image" value="' + esc(x.image || '') + '"></label>'
            + '<label class="cl-wide">Beschreibung<textarea data-f="descr" rows="4" maxlength="2000">' + esc(x.descr || '') + '</textarea></label></div>'
            + '<p class="nw-muted">Nur jugendfreie Steckbriefe. Avatare: nur öffentliche oder eigene, keine Inhalte aus fremden Avatar-Datenbanken.</p>'
            + '<div class="nw-row"><span class="sp"></span><button type="button" class="btn btn-sm btn-gold" data-save>Speichern</button></div></div>');
        $('[data-f=kind]', body).value = x.kind || 'world';
        $('[data-save]', body).onclick = () => {
            const v = k => $('[data-f="' + k + '"]', body).value.trim();
            call('save', { kind: v('kind'), id: v('id'), name: v('name'), creator_name: v('creator_name'), creator_id: v('creator_id'), image: v('image'), descr: v('descr') })
                .then(r => { toast(r.msg); item(r.item.kind, r.item.id); }).catch(fail);
        };
    }

    function creator(id, edit) {
        view = id ? 'creator' : 'me';
        const body = shell('<span class="nw-muted">Lädt …</span>');
        call('creator', id ? { id } : {}).then(c => {
            if (edit || (!id && c.own && !c.bio && !c.links.length)) {
                body.innerHTML = '<div class="nw-card"><h3>🎨 Dein Creator-Profil</h3><div class="cl-form"><label class="cl-wide">Über dich<textarea data-cb rows="4" maxlength="1000">' + esc(c.bio) + '</textarea></label>'
                    + '<label class="cl-wide">Was du machst (Komma-getrennt, z. B. Welten, Shader, 3D-Modelle)<input data-cs value="' + esc(c.skills.join(', ')) + '"></label>'
                    + '<label class="cl-wide">Shop- und Profil-Links (eine pro Zeile, https – Booth, Gumroad, Jinxxy, Ko-fi, Patreon …)<textarea data-cl rows="4">' + esc(c.links.map(l => l.url).join('\n')) + '</textarea></label></div>'
                    + '<p class="nw-muted">Deine Steckbriefe (mit dir als Creator-ID) erscheinen automatisch auf deinem Profil.</p><div class="nw-row"><span class="sp"></span><button type="button" class="btn btn-sm btn-gold" data-csave>Speichern</button></div></div>';
                $('[data-csave]', body).onclick = () => call('creator_save', { bio: $('[data-cb]', body).value, skills: $('[data-cs]', body).value, links: $('[data-cl]', body).value.split('\n').map(s => s.trim()).filter(Boolean) })
                    .then(r => { toast(r.msg); creator('', false); }).catch(fail);
                return;
            }
            const pub = (site || (APP ? 'https://ghostnode-labs.dev/' : location.origin + '/')) + 'wiki.php?c=' + encodeURIComponent(c.id);
            body.innerHTML = '<div class="nw-card"><div class="nw-row"><h3 style="margin:0">🎨 ' + esc(c.name || c.id) + '</h3><span class="sp"></span>' + (c.own ? '<button type="button" class="btn btn-sm" data-cedit>✏ Bearbeiten</button>' : '')
                + '<a class="btn btn-sm" href="' + esc(pub) + '" target="_blank" rel="noopener">🔗 Öffentliche Seite</a></div>'
                + (c.reviews ? '<div>' + stars(c.avg) + ' <span class="nw-muted">' + c.avg + ' aus ' + c.reviews + ' Bewertungen</span></div>' : '')
                + (c.skills.length ? '<div class="sb-tags">' + c.skills.map(s => '<span>' + esc(s) + '</span>').join('') + '</div>' : '')
                + (c.bio ? '<div class="nw-text" style="margin-top:6px">' + esc(c.bio) + '</div>' : '')
                + (c.links.length ? '<div class="nw-row" style="margin-top:8px">' + c.links.map(l => '<a class="btn btn-sm" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">🛍 ' + esc(l.label) + '</a>').join('') + '</div>' : '') + '</div>'
                + '<div class="nw-grid">' + (c.items.length ? c.items.map(card).join('') : '<span class="nw-muted">Noch keine Steckbriefe mit diesem Creator.</span>') + '</div>';
            const e = $('[data-cedit]', body); if (e) e.onclick = () => creator('', true);
            $$('[data-i]', body).forEach(x => x.onclick = () => item(x.dataset.k, x.dataset.i));
        }).catch(e => { body.innerHTML = '<div class="vx-error">' + esc(e.message) + '</div>'; });
    }

    function go(v) { view = v; if (v === 'list') list(); if (v === 'new') form(null, true); if (v === 'me') creator('', false); }
    window.NexusWiki = { open(name) { if (name === 'wiki') { if (view === 'item' || view === 'creator') return; go('list'); } }, item, creator };
    const q = new URLSearchParams(location.search);
    if (q.get('sb')) { const m = /^(wrld|avtr)_/.exec(q.get('sb')); if (m) { const b = document.querySelector('#tabs [data-tab="wiki"]'); if (b) b.click(); item(m[1] === 'wrld' ? 'world' : 'avatar', q.get('sb')); } }
    else { const cp = document.querySelector('.vx-tab:not([hidden])'); if (cp && cp.dataset.pane === 'wiki') go('list'); }
})();
