/* VRC Nexus 6.4 – 🪟 Mini-Modus: kleines, immer sichtbares Fenster mit Welt, Spielern, Puls, Musik und Schnellaktionen.
 * Holt alle 2 s den Zustand über die gleiche Schnittstelle wie die App (nexus.php). */
(function () {
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const T = s => (window.t ? window.t(s) : s);
    const post = (act, data) => fetch('nexus.php', { method: 'POST', body: new URLSearchParams(Object.assign({ act }, data || {})) }).then(r => r.json()).then(d => { if (d && d.error) throw new Error(d.error); return d; });
    const $ = s => document.querySelector(s);
    const dur = s => { if (!s) return '–'; const m = Math.max(0, Math.floor(Date.now() / 1000 - s) / 60 | 0); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min'; };
    let msgT = null;
    const msg = t => { const m = $('#mMsg'); m.textContent = t; m.hidden = false; clearTimeout(msgT); msgT = setTimeout(() => { m.hidden = true; }, 2200); };
    function theme(d) {
        const h = document.documentElement; h.dataset.theme = ['neon', 'midnight', 'snow', 'sakura', 'beach'].includes(d.theme) ? d.theme : 'neon';
        const a = /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent : '';
        if (a && a !== '#38d5e6') { h.style.setProperty('--accent-cyan', a); h.style.setProperty('--accent-rgb', [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)).join(', ')); }
    }
    function render(d) {
        theme(d);
        const tile = (l, v, cls) => '<div class="tile ' + (cls || '') + '"><small>' + esc(T(l)) + '</small><span title="' + esc(v) + '">' + esc(v) + '</span></div>';
        $('#mInfo').innerHTML = tile('Welt', d.running ? (d.world || '…') : T('VRChat aus'), 'wide')
            + tile('Spieler', d.running ? String(d.players) : '–') + tile('Dort seit', d.running ? dur(d.since) : '–')
            + tile('Puls', d.bpm ? '♥ ' + d.bpm : '–', 'hr') + tile('Freunde im Spiel', String(d.friends))
            + (d.music ? tile('Musik', '🎵 ' + d.music, 'wide') : '');
        $('#mActs').innerHTML = '<button type="button" data-a="rotator" class="' + (d.rotator ? 'on' : '') + '" title="' + esc(T('Chatbox-Rotator an/aus')) + '">🔄</button>'
            + '<button type="button" data-a="sleep" class="' + (d.sleep ? 'on' : '') + '" title="' + esc(T('Schlafmodus an/aus')) + '">💤</button>'
            + '<button type="button" data-a="mute" title="' + esc(T('Stummschalten (VRChat)')) + '">🔇</button>'
            + '<button type="button" data-a="chatbox_clear" title="' + esc(T('Chatbox leeren')) + '">🧹</button>'
            + (d.nsfw ? '<button type="button" data-a="panic" class="panic" title="' + esc(T('Panik (NSFW ganz aus)')) + '">🚨</button>' : '');
    }
    function tick() { post('ctools_mini_state').then(render).catch(() => {}).finally(() => setTimeout(tick, 2000)); }
    $('#mActs').addEventListener('click', e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'panic' && !confirm(T('Panik auslösen? NSFW wird komplett ausgeschaltet.'))) return;
        post('ctools_hotkey', { key: 'keys.' + b.dataset.a }).then(r => msg((r && r.msg) || '✓')).catch(x => msg('⚠ ' + x.message));
    });
    $('#mClose').addEventListener('click', () => post('ctools_mini').catch(() => window.close()));
    $('#mOpen').addEventListener('click', () => post('ctools_hotkey', { key: 'keys.show' }).catch(() => {}));
    tick();
})();
