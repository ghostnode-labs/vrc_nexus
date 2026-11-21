/* VRC Nexus – zweites SteamVR-Fenster (HUD): ein paar Infos + Untertitel (eigene Sprache und Übersetzer „VRChat → Text“).
 * Wird unsichtbar gezeichnet (Offscreen) und als Bild an NexusOverlay.exe geschickt – nicht bedienbar, nur zum Ablesen. */
(function () {
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const t = s => (window.t ? window.t(s) : s);
    const post = (act, data) => fetch('nexus.php', { method: 'POST', body: new URLSearchParams(Object.assign({ act }, data || {})) }).then(r => r.json());
    // 3.8.4: Theme + Akzentfarbe wie in der App (themes.css)
    function applyTheme(theme, accent) {
        const h = document.documentElement, ok = ['neon', 'midnight', 'snow', 'sakura', 'beach'];
        h.dataset.theme = ok.includes(theme) ? theme : 'neon';
        const a = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent.toLowerCase() : '';
        if (a && a !== '#38d5e6') { h.style.setProperty('--accent-cyan', a); h.style.setProperty('--accent-rgb', [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)).join(', ')); }
        else { h.style.removeProperty('--accent-cyan'); h.style.removeProperty('--accent-rgb'); }
    }
    function render(d) {
        if (d.theme) applyTheme(d.theme, d.accent);
        d.items = d.items || []; d.lines = d.lines || [];
        const info = document.getElementById('info'), subs = document.getElementById('subs');
        info.hidden = !d.items.length;
        info.innerHTML = d.items.map(i => '<span>' + esc(i.icon) + ' <b>' + esc(i.value) + '</b>' + (i.label ? ' ' + esc(t(i.label)) : '') + '</span>').join('');
        const now = Date.now();
        subs.innerHTML = d.lines.map(l => '<div class="sub' + (l.who === 'me' ? ' me' : '') + (l.unsure ? ' unsure' : '') + (now - l.t > 12000 ? ' old' : '') + '">'
            + '<small>' + esc(l.flag || '') + ' ' + esc((l.lang || '?').toUpperCase()) + (l.tr ? ' → ' + esc(d.target.slice(0, 2)) : '') + (l.unsure ? ' ?' : '') + (l.who === 'me' ? ' · ' + esc(t('ich')) : '') + '</small> '
            + esc(l.tr || l.text) + (l.tr && d.show_orig ? '<span class="orig">' + esc(l.text) + '</span>' : '') + '</div>').join('');
    }
    function tick() { post('hud_state').then(render).catch(() => {}).finally(() => setTimeout(tick, 1000)); }
    tick();
})();
