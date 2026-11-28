/* 8.5.1: Aufklappbares bleibt offen/zu – auch wenn eine Seite neu gezeichnet wird (innerHTML).
 * Merkt sich den Zustand jedes <details> über einen stabilen Schlüssel (Bereich + Überschrift ohne Zahlen)
 * und stellt ihn beim Neuaufbau wieder her. Gilt automatisch für alle Seiten, auch in der Handy-App. */
(function () {
    'use strict';
    const KEY = 'nx-details-v1', MAX = 400;
    let state = new Map();
    try { const o = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(o)) state = new Map(o.slice(-MAX)); } catch (e) { /* ohne Speicher */ }
    let saveT = 0;
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify([...state].slice(-MAX))); } catch (e) { /* voll/gesperrt */ } }, 300); };
    const norm = s => String(s || '').replace(/[\d.,:%]+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 80);
    /** Bereich: nächstes Element mit id oder data-pane/data-panel/data-tab/data-sub, bis zu 3 Ebenen zusammengesetzt */
    function scope(el) {
        const parts = [];
        for (let p = el.parentElement; p && p !== document.body && parts.length < 3; p = p.parentElement) {
            const k = p.id || p.dataset.pane || p.dataset.panel || p.dataset.tab || p.dataset.sub || p.dataset.key;
            if (k) parts.unshift(k);
        }
        return parts.join('/');
    }
    function keyOf(d) {
        if (d.dataset.keep) return 'k:' + d.dataset.keep;
        const s = d.querySelector(':scope > summary');
        const base = scope(d) + '|' + norm(s ? s.textContent : '');
        // gleiche Überschrift mehrfach im selben Bereich → Position dazu
        const same = d.parentElement ? [...d.parentElement.children].filter(x => x.tagName === 'DETAILS' && x !== d && keyBase(x) === base) : [];
        if (!same.length) return base;
        const all = [...d.parentElement.children].filter(x => x.tagName === 'DETAILS' && keyBase(x) === base);
        return base + '#' + all.indexOf(d);
    }
    function keyBase(d) { const s = d.querySelector(':scope > summary'); return scope(d) + '|' + norm(s ? s.textContent : ''); }
    let restoring = false;
    function restore(root) {
        const list = root.tagName === 'DETAILS' ? [root] : root.querySelectorAll ? root.querySelectorAll('details') : [];
        restoring = true;
        for (const d of list) {
            if (d.dataset.nxNoKeep !== undefined) continue;
            const k = keyOf(d);
            if (state.has(k)) { const want = state.get(k); if (d.open !== want) d.open = want; }
        }
        restoring = false;
    }
    document.addEventListener('toggle', e => {
        const d = e.target;
        if (!d || d.tagName !== 'DETAILS' || d.dataset.nxNoKeep !== undefined || restoring) return;
        if (!d.isConnected) return;
        const k = keyOf(d); state.delete(k); state.set(k, d.open); save();
    }, true);
    const mo = new MutationObserver(recs => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1) restore(n); });
    const start = () => { restore(document.body); mo.observe(document.body, { childList: true, subtree: true }); };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    window.NexusDetails = { restore, keyOf, forget: () => { state.clear(); save(); } };
})();
