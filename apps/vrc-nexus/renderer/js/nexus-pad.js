/* VRC Nexus – 8.0.4 🎮 Steam Deck / Controller: Bedienung mit dem Gamepad (Steam Deck, Xbox, PlayStation …).
 *   Steuerkreuz / linker Stick = Fokus wandern (räumlich), A = auswählen, B = zurück/schließen, LB/RB = Menüpunkt davor/danach,
 *   Start = Suche, Y = Panik halten (1 s). Auf dem Steam Deck schaltet sich zusätzlich der Deck-Modus ein (größere Ziele, 1280×800).
 */
(function () {
    const body = document.body;
    let on = false, raf = 0, prev = {}, rep = {}, panicT = 0, deckInfo = null;
    const FOCUS = 'button:not([disabled]), a[href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role=button]';
    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden'; };
    function scope() { const m = [...document.querySelectorAll('[aria-modal=true], #userModal')].find(x => !x.hidden && x.offsetParent !== null); return m || document; }
    /** räumliche Navigation: nächstes Element in Richtung (dx, dy) */
    function move(dx, dy) {
        const all = [...scope().querySelectorAll(FOCUS)].filter(visible);
        if (!all.length) return;
        const cur = document.activeElement && all.includes(document.activeElement) ? document.activeElement : null;
        if (!cur) { all[0].focus(); return; }
        const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        let best = null, bestD = Infinity;
        for (const el of all) {
            if (el === cur) continue;
            const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, vx = bx - ax, vy = by - ay;
            const along = vx * dx + vy * dy; if (along <= 4) continue;
            const across = Math.abs(vx * dy - vy * dx);
            const d = along + across * 2.5;
            if (d < bestD) { bestD = d; best = el; }
        }
        if (!best) { window.scrollBy({ top: dy * innerHeight * 0.4, left: 0 }); return; }
        best.focus({ preventScroll: false });
        best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        body.classList.add('kbd-nav');
    }
    function key(k) { (document.activeElement || body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }
    function tabStep(d) {
        const items = [...document.querySelectorAll('#tabs [data-tab]')].filter(x => x.offsetParent !== null);
        if (!items.length) return;
        const cur = items.findIndex(x => x.classList.contains('active') || x.getAttribute('aria-current') === 'page');
        const n = items[(Math.max(0, cur) + d + items.length) % items.length];
        n.click(); n.focus();
    }
    function press(i) {
        switch (i) {
            case 0: { const el = document.activeElement; if (el && el !== body) { if (el.matches('input[type=checkbox], input[type=radio]')) el.click(); else if (el.matches('input, textarea, select')) el.focus(); else el.click(); } break; }
            case 1: { const m = document.querySelector('#userModal:not([hidden])'); if (m) key('Escape'); else if (document.activeElement && document.activeElement.matches('input, textarea, select')) document.activeElement.blur(); else history.length > 1 && key('Escape'); break; }
            case 4: tabStep(-1); break;
            case 5: tabStep(1); break;
            case 9: { const s = document.querySelector('#globalSearch, input[type=search]'); if (s) s.focus(); break; }
            case 12: move(0, -1); break; case 13: move(0, 1); break; case 14: move(-1, 0); break; case 15: move(1, 0); break;
        }
    }
    function loop() {
        raf = 0;
        const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
        if (!pads.length || !on) return;
        const p = pads[0], now = performance.now();
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        const dir = Math.abs(ax) > 0.6 || Math.abs(ay) > 0.6 ? (Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 15 : 14) : (ay > 0 ? 13 : 12)) : 0;
        p.buttons.forEach((b, i) => {
            const down = b.pressed || (dir === i);
            if (down && !prev[i]) { press(i); rep[i] = now + 380; }
            else if (down && [12, 13, 14, 15].includes(i) && now > (rep[i] || 0)) { press(i); rep[i] = now + 110; }   // halten = wiederholen
            prev[i] = down;
        });
        if (dir && !p.buttons[dir]) { if (!prev['s' + dir]) { press(dir); rep['s' + dir] = now + 380; } else if (now > rep['s' + dir]) { press(dir); rep['s' + dir] = now + 110; } prev['s' + dir] = true; }
        for (const k of [12, 13, 14, 15]) if (k !== dir) prev['s' + k] = false;
        // Y (3) 1 s halten = Panik (Sicherheit: auch ohne Maus/Tastatur erreichbar)
        if (p.buttons[3] && p.buttons[3].pressed) { if (!panicT) panicT = now; else if (now - panicT > 1000 && panicT > 0) { panicT = -1; if (window.NexusUI) NexusUI.api('nsfw_panic_full').then(r => NexusUI.toast((r && r.msg) || '🚨 Panik')).catch(() => {}); } }
        else panicT = 0;
        raf = requestAnimationFrame(loop);
    }
    addEventListener('gamepadconnected', () => { if (on && !raf) raf = requestAnimationFrame(loop); if (on && window.NexusUI) NexusUI.toast('🎮 Controller verbunden – Steuerkreuz, A/B, LB/RB'); });
    window.NexusPad = {
        apply(s, info) {
            if (info) deckInfo = info;
            const deck = !!(deckInfo && deckInfo.deck);
            const mode = s['ui.deck'] || 'auto';
            body.classList.toggle('deck', mode === 'on' || (mode === 'auto' && deck));
            on = s['ui.gamepad'] !== false;
            if (on && !raf && navigator.getGamepads && [...navigator.getGamepads()].some(Boolean)) raf = requestAnimationFrame(loop);
        },
        move,
    };
})();
