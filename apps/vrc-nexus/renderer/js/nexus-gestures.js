/* VRC Nexus – 8.0.7 👆 Wischgesten (Handy-App, Touch):
 *   ⬇ oben nach unten ziehen      = aktualisieren (ersetzt den „⟳ Aktualisieren“-Knopf)
 *   ⬅ ➡ waagerecht wischen        = zur Nachbar-Seite der unteren Leiste (Start · Freunde · Community · Knöpfe)
 *   ➡ vom linken Rand wischen     = Menü öffnen,  ⬅ im Menü wischen = Menü schließen
 *   ⬇ im offenen Profil-Fenster nach unten wischen (oben angefasst) = schließen
 * Abschaltbar: Einstellungen → Oberfläche → Barrierefreiheit → „Wischgesten“. Nie auf Eingabefeldern, Schiebereglern oder waagerecht scrollbaren Leisten. */
(function () {
    const body = document.body;
    if (!body.classList.contains('mobile') && !(window.matchMedia && matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window)) return;
    const UI = window.NexusUI;
    const T = s => (window.t ? window.t(s) : s);
    body.classList.add('has-gestures');
    let on = true;
    const PAGES = ['home', 'friends', 'community', 'buttons'];
    const PULL = 70, MAXPULL = 120;

    // Anzeige für „Ziehen zum Aktualisieren“
    const ind = document.createElement('div');
    ind.className = 'g-pull'; ind.innerHTML = '<i>⟳</i>'; ind.setAttribute('aria-hidden', 'true');
    body.appendChild(ind);

    const blocked = el => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable], .m-sheet .m-sq, [data-nogesture], canvas, .leaflet-container, input[type=range]'));
    /** liegt unter dem Finger etwas, das selbst nach oben scrollen kann? */
    function scrolledUp(el) {
        for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2 && e.scrollTop > 0) return true;
        }
        return (window.scrollY || document.documentElement.scrollTop || 0) > 0;
    }
    function hScrollable(el) {
        for (let e = el; e && e !== document.body; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 4) return true;
        }
        return false;
    }
    const menuOpen = () => body.classList.contains('m-menu');
    const modal = () => { const m = document.getElementById('userModal'); return m && !m.hidden ? m : null; };
    const current = () => { const a = document.querySelector('#tabs .vx-tabbtn.active'); return a ? a.dataset.tab : 'home'; };

    function refresh() {
        ind.classList.add('spin');
        const pane = [...document.querySelectorAll('.vx-tab[data-pane]')].find(p => !p.hidden);
        const own = pane && pane.querySelector('[data-refresh], #galRefresh');   // Seiten mit eigenem Neu-Laden
        let p;
        if (own) { own.click(); p = new Promise(r => setTimeout(r, 900)); }
        else if (UI && UI.load) p = Promise.resolve(UI.load(true, true));
        else p = Promise.resolve();
        if (UI && UI.tab) { const t = current(); try { UI.tab(t); } catch (e) { /* egal */ } }   // Seite selbst neu laden
        Promise.race([p, new Promise(r => setTimeout(r, 8000))]).catch(() => {}).finally(() => { ind.classList.remove('spin', 'ready'); ind.style.transform = ''; ind.style.opacity = ''; if (navigator.vibrate) try { navigator.vibrate(10); } catch (e) { /* egal */ } });
    }

    let s = null;   // aktueller Wisch: { x, y, t, mode, el }
    addEventListener('touchstart', e => {
        if (!on || e.touches.length !== 1) { s = null; return; }
        const t = e.touches[0], el = e.target;
        if (blocked(el)) { s = null; return; }
        s = { x: t.clientX, y: t.clientY, t: Date.now(), el, mode: '', dx: 0, dy: 0,
            edge: t.clientX < 24, top: !scrolledUp(el), modalTop: !!(modal() && el.closest && el.closest('#userModal') && !scrolledUp(el)) };
    }, { passive: true });
    addEventListener('touchmove', e => {
        if (!s) return;
        const t = e.touches[0];
        s.dx = t.clientX - s.x; s.dy = t.clientY - s.y;
        if (!s.mode) {
            if (Math.abs(s.dx) < 12 && Math.abs(s.dy) < 12) return;
            if (Math.abs(s.dy) > Math.abs(s.dx) * 1.3 && s.dy > 0 && s.modalTop) s.mode = 'modal';
            else if (Math.abs(s.dy) > Math.abs(s.dx) * 1.3 && s.dy > 0 && s.top && !menuOpen() && !modal()) s.mode = 'pull';
            else if (Math.abs(s.dx) > Math.abs(s.dy) * 1.5 && !hScrollable(s.el)) s.mode = s.edge && s.dx > 0 ? 'menu' : menuOpen() && s.dx < 0 ? 'close' : !modal() && !menuOpen() ? 'page' : 'none';
            else s.mode = 'none';
        }
        if (s.mode === 'pull') {
            const d = Math.min(MAXPULL, s.dy * 0.55);
            ind.style.transform = 'translate(-50%, ' + d + 'px) rotate(' + d * 3 + 'deg)';
            ind.style.opacity = Math.min(1, d / PULL);
            ind.classList.toggle('ready', s.dy >= PULL * 1.6);
            if (e.cancelable) e.preventDefault();
        } else if (s.mode === 'modal') {
            const m = modal(); if (m && m.firstElementChild) m.firstElementChild.style.transform = 'translateY(' + Math.max(0, s.dy * 0.6) + 'px)';
        }
    }, { passive: false });
    addEventListener('touchend', () => {
        if (!s) return;
        const g = s; s = null;
        const fast = Date.now() - g.t < 700;
        if (g.mode === 'pull') {
            if (g.dy >= PULL * 1.6) refresh();
            else { ind.style.transform = ''; ind.style.opacity = ''; ind.classList.remove('ready'); }
            return;
        }
        if (g.mode === 'modal') {
            const m = modal(); if (m && m.firstElementChild) m.firstElementChild.style.transform = '';
            if (g.dy > 110 && m && UI && UI.closeModal) UI.closeModal();
            return;
        }
        if (!fast || Math.abs(g.dx) < 70) return;
        if (g.mode === 'menu') { const b = document.querySelector('.m-bottom [data-mb="_menu"]'); if (b && !menuOpen()) b.click(); return; }
        if (g.mode === 'close') { const c = document.querySelector('.m-sheet .m-close'); if (c) c.click(); return; }
        if (g.mode === 'page') {
            const cur = current(), i = PAGES.indexOf(cur);
            if (i < 0) return;   // nur zwischen den Seiten der unteren Leiste
            const n = PAGES[i + (g.dx < 0 ? 1 : -1)];
            if (!n || !UI || !UI.tab) return;
            body.classList.remove('g-left', 'g-right'); void body.offsetWidth;
            body.classList.add(g.dx < 0 ? 'g-left' : 'g-right');
            UI.tab(n);
            setTimeout(() => body.classList.remove('g-left', 'g-right'), 300);
        }
    });
    addEventListener('touchcancel', () => { s = null; ind.style.transform = ''; ind.style.opacity = ''; ind.classList.remove('ready'); });

    window.NexusGestures = {
        apply(st) { on = st['ui.gestures'] !== false; body.classList.toggle('has-gestures', on); },
        refresh,
    };
    // einmaliger Hinweis
    try {
        if (!localStorage.getItem('nx_gest_hint')) { localStorage.setItem('nx_gest_hint', '1'); setTimeout(() => UI && UI.toast('👆 ' + T('Neu: nach unten ziehen = aktualisieren, seitlich wischen = nächste Seite, vom linken Rand = Menü.')), 2500); }
    } catch (e) { /* egal */ }
})();
