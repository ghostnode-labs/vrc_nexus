'use strict';
// Mauerwerk-Raster für alle Karten-Raster der Oberfläche (Desktop, Web-Nexus und Android bündeln dieselbe Datei).
(function () {
    if (!('ResizeObserver' in window) || !('MutationObserver' in window)) return;
    /** Raster, die immer als Mauerwerk laufen (Karten unterschiedlicher Höhe) */
    var CONTAINERS = '.nc-grid, .rc-grid, .vx-cols, .sh-grid, .sb-evgrid, .sb-cfg, .sp, .pl-list, .pl-mkgrid, .vx-inst, .nw-grid, .cl-grid';
    /** Karten: ist ihr Elternelement ein mehrspaltiges Grid, wird es automatisch zum Mauerwerk */
    var CARDS = '.nc-card, .nw-card, .nx-panel, .panel';
    /** nie anfassen: Start-Seite (eigenes Mauerwerk), Kalender/Tabellen-artige Raster, gleich hohe Kacheln, Formulare */
    var SKIP = '.hm-grid, .dy-grid, .vx-kpis, .nc-kpis, .sh-kpis, .cl-kpis, .rc-kpis, .perf-grid, .nx-form, .cl-form, .tg-games, .tg-badges, .vx-grid, .nx-tiles, .vx-menu';
    /*
     * Mauerwerk-Raster (Masonry) – eigene kleine Umsetzung ohne Abhängigkeit.
     * Karten-Raster mit mehreren Spalten strecken bei CSS-Grid jede Zeile auf die höchste Karte → große Lücken
     * unter kürzeren Karten. Hier bekommt das Raster feine Zeilen (4 px, Klasse „nxm-on“), und jede Karte
     * belegt per grid-row-end: span N genau so viele Zeilen, wie sie hoch ist. Karten rutschen dadurch in jeder
     * Spalte nach oben; die Reihenfolge bleibt – nur wenn eine Karte über mehrere Spalten geht, dürfen
     * spätere Karten die Lücke darüber füllen („dense“), sonst bliebe dort Leerraum.
     * Einspaltig (Handy) wird nichts verändert. Elemente mit grid-column: 1 / -1 bleiben volle Breite.
     */
    var ROW = 4, ON = 'nxm-on';
    var BOXES = [CONTAINERS, '.nx-masonry'].filter(Boolean).join(',');
    var known = new Set(), gaps = new WeakMap(), touched = new WeakSet(), seen = new WeakSet();
    var dirty = new Set(), full = false, raf = 0;
    var tracks = function (cs) { return cs.gridTemplateColumns.replace(/\[[^\]]*\]/g, ' ').trim().split(/\s+/).filter(function (t) { return parseFloat(t) > 0; }).length; };
    var skip = function (el) { return SKIP && el.matches(SKIP); };
    function off(c) {
        if (!c.classList.contains(ON)) return;
        c.classList.remove(ON, 'nxm-dense');
        for (var i = 0; i < c.children.length; i++) { var k = c.children[i]; if (touched.has(k)) { k.style.gridRowEnd = ''; touched.delete(k); } }
    }
    function layout(c) {
        if (!c.isConnected) { known.delete(c); return; }
        if (!c.getClientRects().length) return;                       // versteckt – später, wenn sichtbar (ResizeObserver)
        var cs = getComputedStyle(c);
        if (!/grid/.test(cs.display) || /column/.test(cs.gridAutoFlow)) { off(c); return; }
        if (tracks(cs) < 2 || c.children.length < 2) { off(c); return; }
        if (!c.classList.contains(ON)) { gaps.set(c, parseFloat(cs.rowGap) || 0); c.classList.add(ON); }
        var gap = gaps.get(c) || 0, list = [], wide = false, i, k, kc, tw = parseFloat(cs.gridTemplateColumns.replace(/\[[^\]]*\]/g, ' ').trim()) || 1e9;
        for (i = 0; i < c.children.length; i++) {
            k = c.children[i];
            if (!seen.has(k)) { seen.add(k); ro.observe(k); }
            if (!k.getClientRects().length) continue;                 // ausgeblendet
            kc = getComputedStyle(k);
            if (kc.position === 'absolute' || kc.position === 'fixed') continue;
            if (!touched.has(k) && (k.style.gridRow || kc.gridRowStart !== 'auto' || kc.gridRowEnd !== 'auto')) continue;   // feste Zeile vom Layout – nicht anfassen
            var kr = k.getBoundingClientRect();
            if (kr.width > tw * 1.5) wide = true;                       // Karte über mehrere Spalten
            list.push([k, kr.height + (parseFloat(kc.marginTop) || 0) + (parseFloat(kc.marginBottom) || 0)]);
        }
        // Karten über mehrere Spalten (z. B. grid-column: 1 / -1) würden über sich Lücken lassen → spätere Karten dürfen sie füllen
        if (c.classList.contains('nxm-dense') !== wide) c.classList.toggle('nxm-dense', wide);
        for (i = 0; i < list.length; i++) {                           // erst alles messen, dann schreiben (kein Layout-Flattern)
            var cur = parseInt(String(list[i][0].style.gridRowEnd).replace('span ', ''), 10) || 0;
            if (cur && Math.abs(list[i][1] - cur * ROW) < 0.5) continue;  // füllt genau ihre Fläche (height: 100 %) → nicht hochschaukeln
            var v = 'span ' + Math.max(1, Math.ceil((list[i][1] + gap) / ROW));
            if (list[i][0].style.gridRowEnd !== v) list[i][0].style.gridRowEnd = v;
            touched.add(list[i][0]);
        }
    }
    function scan() {
        var found = new Set(), i, l;
        if (BOXES) { l = document.querySelectorAll(BOXES); for (i = 0; i < l.length; i++) found.add(l[i]); }
        if (CARDS) { l = document.querySelectorAll(CARDS); for (i = 0; i < l.length; i++) if (l[i].parentElement) found.add(l[i].parentElement); }
        found.forEach(function (c) {
            if (known.has(c) || skip(c)) return;
            if (CARDS && !(BOXES && c.matches(BOXES)) && !/grid/.test(getComputedStyle(c).display)) return;
            known.add(c); ro.observe(c);
        });
        known.forEach(function (c) { dirty.add(c); });
    }
    function run() {
        raf = 0;
        if (full) { full = false; scan(); }
        var l = Array.from(dirty); dirty.clear();
        for (var i = 0; i < l.length; i++) layout(l[i]);
    }
    function queue(c) { if (c) dirty.add(c); else full = true; if (!raf) raf = requestAnimationFrame(run); }
    var ro = new ResizeObserver(function (es) {
        for (var i = 0; i < es.length; i++) { var t = es[i].target; queue(known.has(t) ? t : (t.parentElement && known.has(t.parentElement) ? t.parentElement : null)); }
    });
    new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) { var m = ms[i]; if (m.type === 'childList' || !(m.target.classList && m.target.classList.contains(ON) && m.attributeName === 'class')) { queue(); return; } }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
    window.addEventListener('load', function () { queue(); });
    /** von außen: Raster sofort neu berechnen (z. B. nach eigenem Umsortieren) */
    window.nxMasonry = { refresh: function () { queue(); }, ROW: ROW };
    queue();
})();
