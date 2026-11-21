/* VRC Nexus – 📡 Nexus Pulse (3.9): VRChat-News, Patchnotes, Developer-Updates, Sicherheit, Creator-Economy, r/VRChat (neu/beliebt, Kommentare),
 * optional 18+-Subreddit, ★ Favoriten. Online-Abruf erst nach Einschalten (Opt-in). */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    let box = null, st = null, view = { src: 'vrchat', kind: 'all', sort: 'hot' }, items = [], favs = null, loading = false, err = '';
    const SRC = [['vrchat', '🟦 VRChat'], ['reddit', '👽 r/VRChat'], ['erp', '🔞 r/VRchatERP'], ['fav', '★ Favoriten']];
    const KIND = [['all', 'Alle'], ['news', 'Offizielle News'], ['patch', 'Patchnotes'], ['dev', 'Developer-Updates'], ['security', 'Sicherheit'], ['creator', 'Creator-Economy']];
    const SORT = [['hot', 'Beliebt'], ['new', 'Neueste'], ['top', 'Top der Woche']];
    const KLABEL = { news: '📢 News', patch: '🛠 Patchnotes', dev: '🧪 Dev-Update', security: '🔐 Sicherheit', creator: '💰 Creator', reddit: '👽 Reddit', erp: '🔞 18+' };
    const when = ts => ts ? new Date(ts * 1000).toLocaleString(window.nxLoc ? nxLoc() : 'de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    const chips = (list, cur, key) => list.map(([k, l]) => '<button type="button" class="chip' + (cur === k ? ' on' : '') + '" data-pv="' + key + '" data-v="' + k + '">' + esc(T(l)) + '</button>').join('');

    function card(x) {
        const blur = x.src === 'erp' ? ' pl-blur' : '';
        return '<article class="pl-item" data-id="' + esc(x.id) + '">'
            + (x.img ? '<a class="pl-img' + blur + '" href="#" data-pz="' + esc(x.id) + '"><img src="' + esc(x.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></a>' : '')
            + '<div class="pl-body"><div class="pl-meta"><span class="vx-pill">' + esc(T(KLABEL[x.kind] || KLABEL[x.src] || x.src)) + '</span> ' + esc(x.author) + ' · ' + esc(when(x.ts)) + '</div>'
            + '<h4><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a></h4>'
            + (x.text ? '<p class="pl-text">' + esc(x.text) + '</p>' : '')
            + '<div class="pl-act"><button type="button" class="btn btn-sm' + (x.fav ? ' btn-gold' : '') + '" data-pf="' + esc(x.id) + '">' + (x.fav ? '★ ' + esc(T('Gemerkt')) : '☆ ' + esc(T('Merken'))) + '</button>'
            + (x.comments ? '<button type="button" class="btn btn-sm" data-pc="' + esc(x.id) + '">💬 ' + esc(T('Kommentare')) + '</button>' : '')
            + '<a class="btn btn-sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">↗ ' + esc(T(x.src === 'vrchat' ? 'Original öffnen' : 'Auf Reddit öffnen')) + '</a></div>'
            + '<div class="pl-comments" hidden></div></div></article>';
    }
    function render() {
        if (!box) return;
        if (!st) { box.innerHTML = '<div class="vx-loading">' + esc(T('Lade …')) + '</div>'; return; }
        if (!st.on) {
            box.innerHTML = '<div class="nc-card pl-optin"><h4>📡 Nexus Pulse</h4><p>' + esc(T('News & Discovery: offizielle VRChat-News, Patchnotes, Developer-Updates, Sicherheitsmeldungen und Creator-Economy sowie neue und beliebte Beiträge aus r/VRChat – mit Kommentaren, Vorschaubildern und Favoriten.')) + '</p>'
                + '<p class="vx-small">' + esc(T('Online-Dienst: VRC Nexus ruft dafür öffentliche Feeds von Steam (VRChat-Ankündigungen) und Reddit ab. Ohne Anmeldung, es werden keine Daten von dir gesendet. Standardmäßig aus.')) + '</p>'
                + '<button type="button" class="btn btn-gold" data-pon="1">' + esc(T('Einschalten')) + '</button></div>';
            return;
        }
        const srcs = SRC.filter(([k]) => k !== 'erp' || st.erp);
        let list = view.src === 'fav' ? (favs || []) : items;
        let h = '<div class="pl-bar">' + chips(srcs, view.src, 'src') + '<span class="pl-sp"></span><button type="button" class="btn btn-sm" data-pr="1" title="' + esc(T('Neu laden')) + '">↻</button><button type="button" class="btn btn-sm" data-pon="0">' + esc(T('Ausschalten')) + '</button></div>';
        if (view.src === 'vrchat') h += '<div class="pl-bar sub">' + chips(KIND, view.kind, 'kind') + '</div>';
        if (view.src === 'reddit' || view.src === 'erp') h += '<div class="pl-bar sub">' + chips(SORT, view.sort, 'sort') + '</div>';
        if (loading) h += '<div class="vx-loading">' + esc(T('Lade …')) + '</div>';
        else if (err) h += '<p class="vx-error">' + esc(err) + '</p>';
        else if (!list.length) h += '<div class="vx-empty">' + esc(T(view.src === 'fav' ? 'Noch nichts gemerkt.' : 'Keine Beiträge.')) + '</div>';
        else h += '<div class="pl-list">' + list.map(card).join('') + '</div>';
        box.innerHTML = h;
    }
    function load(force) {
        if (!st || !st.on) return render();
        err = '';
        if (view.src === 'fav') { loading = true; render(); return api('pulse_favs').then(r => { favs = r.items; }).catch(x => { err = x.message; }).finally(() => { loading = false; render(); }); }
        loading = true; render();
        return api('pulse_feed', { src: view.src, kind: view.kind, sort: view.sort, force: force ? '1' : '' }).then(r => { items = r.items || []; }).catch(x => { err = x.message; items = []; }).finally(() => { loading = false; render(); });
    }
    function find(id) { return items.find(x => x.id === id) || (favs || []).find(x => x.id === id); }
    function bind() {
        box.addEventListener('click', e => {
            const on = e.target.closest('[data-pon]');
            if (on) return api('pulse_enable', { on: on.dataset.pon }).then(r => { st.on = r.on; load(); }).catch(x => toast(x.message, true));
            const pv = e.target.closest('[data-pv]');
            if (pv) { view[pv.dataset.pv] = pv.dataset.v; return load(); }
            if (e.target.closest('[data-pr]')) return load(true);
            const pz = e.target.closest('[data-pz]');
            if (pz) { e.preventDefault(); if (pz.classList.contains('pl-blur')) { pz.classList.remove('pl-blur'); return; } const x = find(pz.dataset.pz); if (x && window.NexusBigImage) window.NexusBigImage(x.img, x.title); else if (x) window.open(x.img, '_blank'); return; }
            const pf = e.target.closest('[data-pf]');
            if (pf) {
                const x = find(pf.dataset.pf); if (!x) return;
                return api('pulse_fav', { id: x.id, on: x.fav ? '' : '1', item: JSON.stringify(x) }).then(r => { x.fav = r.fav; items.forEach(i => { if (i.id === x.id) i.fav = r.fav; }); if (favs && !r.fav) favs = favs.filter(i => i.id !== x.id); toast(r.fav ? '★ ' + T('Gemerkt') : T('Entfernt')); render(); }).catch(y => toast(y.message, true));
            }
            const pc = e.target.closest('[data-pc]');
            if (pc) {
                const x = find(pc.dataset.pc), el = pc.closest('.pl-item').querySelector('.pl-comments');
                if (!x) return;
                if (!el.hidden) { el.hidden = true; return; }
                el.hidden = false; el.innerHTML = '<div class="vx-loading">' + esc(T('Lade …')) + '</div>';
                api('pulse_comments', { url: x.url }).then(r => {
                    el.innerHTML = r.items.length ? r.items.map(c => '<div class="pl-c"><b>' + esc(c.author) + '</b> <small>' + esc(when(c.ts)) + '</small><p>' + esc(c.text) + '</p></div>').join('') : '<p class="vx-small">' + esc(T('Noch keine Kommentare.')) + '</p>';
                }).catch(y => { el.innerHTML = '<p class="vx-error">' + esc(y.message) + '</p>'; });
            }
        });
    }
    window.NexusPulse = {
        open() {
            const el = document.getElementById('pulseBox');
            if (!el) return;
            if (box !== el) { box = el; bind(); }
            api('pulse_state').then(r => { st = r; if (view.src === 'erp' && !st.erp) view.src = 'vrchat'; load(); }).catch(x => { box.innerHTML = '<p class="vx-error">' + esc(x.message) + '</p>'; });
        },
    };
})();
