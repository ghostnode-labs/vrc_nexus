/* VRC Nexus – 8.0.3 ♿ Barrierefreiheit: Tastatur-Bedienung, Fokus-Rahmen, Sprung-Link, Beschriftungen für Bildschirmleser. Gilt für PC und Handy. */
(function () {
    const T = s => (window.t ? window.t(s) : s);
    const html = document.documentElement, body = document.body;
    const live = document.createElement('div');   // Ansage für Bildschirmleser (Toasts, Seitenwechsel)
    live.id = 'a11yLive'; live.className = 'a11y-sr'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status');
    body.appendChild(live);
    const say = t => { live.textContent = ''; setTimeout(() => { live.textContent = String(t || ''); }, 30); };

    // Sprung-Link „Zum Inhalt“ (erste Tab-Taste)
    const skip = document.createElement('a');
    skip.href = '#'; skip.className = 'a11y-skip'; skip.textContent = T('Zum Inhalt springen');
    skip.addEventListener('click', e => { e.preventDefault(); const p = [...document.querySelectorAll('.vx-tab[data-pane]')].find(x => !x.hidden); const f = p && p.querySelector('h1, h2, h3, button, a, input, select, textarea, [tabindex]'); if (f) { if (!f.matches('button, a, input, select, textarea, [tabindex]')) f.tabIndex = -1; f.focus(); } });
    body.insertBefore(skip, body.firstChild);

    // Tastatur oder Maus? → Fokus-Rahmen nur bei Tastatur (oder immer, wenn eingestellt)
    addEventListener('keydown', e => { if (e.key === 'Tab') body.classList.add('kbd-nav'); }, true);
    addEventListener('mousedown', () => body.classList.remove('kbd-nav'), true);

    /** Beschriftungen nachziehen: Symbol-Knöpfe bekommen ihren Tooltip als Namen, klickbare Kacheln werden per Tastatur erreichbar */
    const CLICKABLE = '[data-user], [data-world], [data-avatar], [data-group], [data-open], .fc-card, .vx-card[data-id]';
    function label(root) {
        const r = root && root.querySelectorAll ? root : document;
        for (const b of r.querySelectorAll('button:not([aria-label]), a[href]:not([aria-label])')) {
            const txt = (b.textContent || '').replace(/[\p{Extended_Pictographic}️‍\s·•…×✕✖⚙]+/gu, '');
            if (txt.length < 2 && b.title) b.setAttribute('aria-label', b.title);
        }
        for (const el of r.querySelectorAll(CLICKABLE)) {
            if (el.matches('button, a, input, select, textarea') || el.hasAttribute('tabindex')) continue;
            el.tabIndex = 0; el.setAttribute('role', 'button');
        }
        for (const i of r.querySelectorAll('img:not([alt])')) i.alt = '';
        for (const i of r.querySelectorAll('input:not([aria-label]):not([id]), select:not([aria-label]):not([id])')) {
            const l = i.closest('label'); if (l) continue;
            const ph = i.getAttribute('placeholder') || i.getAttribute('title') || i.name; if (ph) i.setAttribute('aria-label', ph);
        }
    }
    let pend = null;
    new MutationObserver(() => { if (pend) return; pend = requestAnimationFrame(() => { pend = null; label(document); dialogs(); }); }).observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

    // Enter/Leertaste auf Kacheln mit role=button = Klick
    addEventListener('keydown', e => {
        const el = e.target;
        if ((e.key === 'Enter' || e.key === ' ') && el && el.getAttribute && el.getAttribute('role') === 'button' && !el.matches('button, a, input, select, textarea')) { e.preventDefault(); el.click(); }
    });

    // Pfeiltasten im Hauptmenü (oben/unten, Pos1/Ende) + Seitenwechsel ansagen
    addEventListener('keydown', e => {
        const menu = e.target && e.target.closest && e.target.closest('#tabs, #subNav');
        if (!menu || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const items = [...menu.querySelectorAll('button, a')].filter(x => x.offsetParent !== null && !x.disabled);
        const i = items.indexOf(e.target.closest('button, a'));
        if (i < 0) return;
        e.preventDefault();
        const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
        items[n].focus();
    });
    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('#tabs [data-tab]');
        if (b) { const em = b.querySelector('em'); say(T('Seite') + ': ' + (em ? em.textContent : b.textContent).trim()); }
    });

    // Alt+Zahl: die ersten neun Menüpunkte direkt; Alt+0: Suche/Befehlspalette fokussieren
    addEventListener('keydown', e => {
        if (!e.altKey || e.ctrlKey || e.metaKey || !/^Digit[0-9]$/.test(e.code) || !body.classList.contains('a11y-keys')) return;
        const items = [...document.querySelectorAll('#tabs [data-tab]')].filter(x => x.offsetParent !== null);
        const k = +e.code.slice(5);
        if (k === 0) { const s = document.querySelector('#globalSearch, input[type=search]'); if (s) { e.preventDefault(); s.focus(); } return; }
        if (items[k - 1]) { e.preventDefault(); items[k - 1].click(); items[k - 1].focus(); }
    });

    // Dialoge: Fokus beim Öffnen hinein, Tab bleibt drin, Esc schließt (sofern der Dialog einen Schließen-Knopf hat)
    let lastFocus = null;
    function dialogs() {
        const m = [...document.querySelectorAll('#userModal, .vx-modal, [role=dialog]')].find(x => !x.hidden && x.offsetParent !== null);
        if (m && !m.dataset.a11y) {
            m.dataset.a11y = '1'; lastFocus = document.activeElement;
            if (!m.getAttribute('role')) m.setAttribute('role', 'dialog');
            m.setAttribute('aria-modal', 'true');
            const f = m.querySelector('input, select, textarea, button, a[href]'); if (f) setTimeout(() => f.focus(), 30);
        } else if (!m && lastFocus) { try { lastFocus.focus(); } catch (e) { /* egal */ } lastFocus = null; document.querySelectorAll('[data-a11y]').forEach(x => delete x.dataset.a11y); }
    }
    label(document);
    addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const m = [...document.querySelectorAll('[aria-modal=true]')].find(x => !x.hidden && x.offsetParent !== null);
        if (!m) return;
        const f = [...m.querySelectorAll('input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });

    // Toasts für Bildschirmleser ansagen
    if (window.NexusUI && NexusUI.toast && !NexusUI.toast.__a11y) {
        const orig = NexusUI.toast;
        NexusUI.toast = Object.assign((m, bad) => { say(m); return orig(m, bad); }, { __a11y: true });
    }

    /** Einstellungen anwenden (von applyLook aufgerufen) */
    window.NexusA11y = {
        apply(s) {
            body.classList.toggle('a11y-focus', s['ui.focus_ring'] !== false);
            body.classList.toggle('a11y-links', !!s['ui.underline_links']);
            body.classList.toggle('a11y-keys', s['ui.alt_keys'] !== false);
            const reduce = s['ui.motion'] === 'reduce' || (s['ui.motion'] !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
            body.classList.toggle('reduce-motion', reduce);
            html.lang = (s['ui.lang'] && s['ui.lang'] !== 'auto' ? s['ui.lang'] : (window.nxLoc ? nxLoc() : 'de')).slice(0, 2);
        },
        say, label,
    };
})();
