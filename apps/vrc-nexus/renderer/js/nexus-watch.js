/* VRC Nexus – Werkzeuge → ⌚ Nexus Watch: Verbindung & Kopplung, gekoppelte Uhren, Puls, Uhr finden, Design (Thema & Hintergrund). */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, b) => UI.toast(m, b), T = s => (window.t ? window.t(s) : s);
    let box = null, d = null, timer = null, prevImg = { rev: '', url: '' };
    const ago = ms => { if (!ms) return T('noch nie'); const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? T('vor') + ' ' + s + ' s' : s < 3600 ? T('vor') + ' ' + Math.round(s / 60) + ' min' : new Date(ms).toLocaleString(window.nxLoc ? nxLoc() : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

    /** kleine runde Vorschau der Uhr mit Thema & Hintergrund */
    function preview(look, hasBg) {
        if (look.bg === 'image' && hasBg && prevImg.rev !== look.bg_rev) { prevImg.rev = look.bg_rev; api('watch_bg_get').then(r => { prevImg.url = r.data; render(); }).catch(() => {}); }
        const c = look.colors, bg = look.bg === 'image' && hasBg && prevImg.url ? 'url(' + prevImg.url + ')' : look.bg === 'gradient' ? 'radial-gradient(circle at 50% 20%, ' + c.grad[1] + ', ' + c.grad[0] + ')' : c.bg;
        return '<div class="nw-prev" style="--bg:' + c.bg + ';--ac:' + c.accent + ';--hi:' + c.hi + ';--dg:' + c.danger + ';--mu:' + c.muted + '">'
            + '<div class="nw-face" style="background:' + bg + ' center/cover"><i style="opacity:' + (look.bg === 'none' ? 0 : look.bg_dim / 100) + '"></i>'
            + '<b class="nw-brand">◈ NEXUS</b><b class="nw-bpm">♥ 72</b><small>Club · 8 👥</small>'
            + '<div class="nw-tiles"><span>♥</span><span class="dg">🔞</span><span>💤</span><span class="mu">⚙</span></div></div></div>';
    }
    function render() {
        if (!box || !d) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input[type=number], input[type=text]')) return;
        const c = d.cfg, L = d.look, on = c.on;
        let h = '<div class="nc-grid">';
        // Verbindung
        h += '<div class="nc-card"><h4>📡 ' + esc(T('Verbindung')) + '</h4>'
            + '<label class="check"><input type="checkbox" data-nw="on"' + (on ? ' checked' : '') + '> ' + esc(T('Uhr-Verbindung im Heimnetz erlauben')) + '</label>'
            + (on ? '<div class="hr-pin"><span class="small">' + esc(T('Kopplungscode')) + '</span><b>' + esc(d.pin.slice(0, 3) + ' ' + d.pin.slice(3)) + '</b><button type="button" class="btn btn-sm" data-nwa="newpin" title="' + esc(T('Neuer Code')) + '">↻</button></div>'
                + '<p class="small muted">' + esc(T('In der Uhr-App „Koppeln“ tippen und den Code eingeben – die Uhr findet den PC von selbst. Sonst Adresse eintragen:')) + ' <code>' + esc((d.addresses[0] || '?') + ':' + c.port) + '</code></p>'
                + '<div class="nc-row"><span class="small">' + esc(T('Port')) + '</span><input type="number" min="1024" max="65535" value="' + c.port + '" data-nwport style="width:100px"></div>'
                + (d.error ? '<p class="small bad">⚠ ' + esc(T(d.error)) + '</p>' : d.running ? '<p class="small ok">✔ ' + esc(T('bereit')) + '</p>' : '')
                : '<p class="small muted">' + esc(T('Puls vom Uhr-Sensor, Panik-Knopf, Consent-Ampel, Spielzeug-Stopp und Schlafmodus direkt am Handgelenk. Die App gibt es bei den Downloads (VRC-Nexus-Watch-…apk).')) + '</p>')
            + '</div>';
        // Uhren
        h += '<div class="nc-card"><h4>⌚ ' + esc(T('Gekoppelte Geräte')) + '</h4>'
            + (d.devices.length ? '<ul class="nw-devs">' + d.devices.map(x => '<li><span class="nw-dot' + (x.online ? ' on' : '') + '"></span><div><b>' + (x.kind === 'phone' ? '📱 ' : '⌚ ') + esc(x.name) + '</b><small>' + (x.online ? esc(T('verbunden')) : esc(T('zuletzt')) + ' ' + esc(ago(x.last))) + (x.ver ? ' · v' + esc(x.ver) : '') + '</small></div>'
                + (x.kind === 'phone' ? '' : '<button type="button" class="btn btn-sm" data-nwa="find" data-id="' + esc(x.id) + '" title="' + esc(T('Uhr finden')) + '">🔔</button>') + '<button type="button" class="btn btn-sm" data-nwa="remove" data-id="' + esc(x.id) + '">✕</button></li>').join('') + '</ul>'
                : '<p class="small muted">' + esc(T('Noch keine Uhr gekoppelt.')) + '</p>') + '<p class="small muted">📱 ' + esc(T('Handy: in der VRC-Nexus-App unter Werkzeuge → „Mit PC verbinden“ Adresse und Code eingeben.')) + '</p>'
            + (d.heart ? '<div class="nw-hr"><span>💓</span><b>' + (d.heart.bpm || '–') + '</b><small>bpm' + (d.heart.from === 'watch' ? ' · ⌚' : d.heart.bpm ? ' · ' + esc(d.heart.from) : '') + '</small>'
                + (d.heart.source !== 'watch' ? '<button type="button" class="btn btn-sm" data-nwa="usewatch">' + esc(T('Uhr als Puls-Quelle')) + '</button>' : '<span class="small ok">✔ ' + esc(T('Puls-Quelle')) + '</span>') + '</div>' : '')
            + '</div>';
        // Design
        h += '<div class="nc-card nw-design"><h4>🎨 ' + esc(T('Design der Uhr')) + '</h4><div class="nw-design-row">' + preview(L, d.has_bg) + '<div class="nw-opts">'
            + (d.faces ? '<span class="small">⌚ ' + esc(T('Zifferblatt')) + '</span><div class="nw-themes">' + Object.entries(d.faces).map(([k, v]) => '<button type="button" class="nw-theme' + ((L.face || 'classic') === k ? ' on' : '') + '" data-nwf="' + k + '">' + esc(T(v)) + '</button>').join('') + '</div>' : '')   // 8.0.5
            + '<span class="small">' + esc(T('Thema')) + '</span><div class="nw-themes">' + Object.entries(d.themes).map(([k, v]) => '<button type="button" class="nw-theme' + (L.theme === k ? ' on' : '') + '" data-nwt="' + k + '" title="' + esc(T(v.name)) + '" style="--a:' + v.accent + ';--b:' + v.bg + ';--h:' + v.hi + '"><i></i>' + esc(T(v.name)) + '</button>').join('') + '</div>'
            + '<span class="small">' + esc(T('Hintergrund')) + '</span><div class="chips">' + [['none', 'keiner'], ['gradient', 'Verlauf'], ['image', 'Bild']].map(([k, n]) => '<button type="button" class="chip' + (L.bg === k ? ' on' : '') + '" data-nwbg="' + k + '"' + (k === 'image' && !d.has_bg ? ' disabled' : '') + '>' + esc(T(n)) + '</button>').join('') + '</div>'
            + '<div class="nc-row"><label class="btn btn-sm">🖼 ' + esc(T('Bild hochladen')) + '<input type="file" accept="image/jpeg,image/png,image/webp" data-nwfile hidden></label>' + (d.has_bg ? '<button type="button" class="btn btn-sm" data-nwa="bgclear">✕ ' + esc(T('Bild entfernen')) + '</button>' : '') + '</div>'
            + (L.bg !== 'none' ? '<div class="nc-row"><span class="small">' + esc(T('Abdunkeln')) + '</span><input type="range" min="0" max="85" step="5" value="' + L.bg_dim + '" data-nwdim><span class="small">' + L.bg_dim + ' %</span></div>' : '')
            + '<p class="small muted">' + esc(T('Wird automatisch auf alle gekoppelten Uhren übertragen. Am besten ein quadratisches Bild (z. B. 450 × 450).')) + '</p>'
            + '</div></div></div>';
        h += '</div>';
        box.innerHTML = h;
    }
    function load() { return api('watch_get').then(r => { d = r; render(); }).catch(e => { if (box) box.innerHTML = '<div class="vx-error">⚠ ' + esc(e.message) + '</div>'; }); }
    const run = (act, data) => api(act, data || {}).then(r => { d = r; render(); if (r.msg) toast(T(r.msg)); }).catch(e => toast('⚠ ' + e.message, true));

    /** Bild verkleinern (max. 600 px, JPEG) – spart Übertragung zur Uhr */
    function shrink(file) {
        return new Promise((ok, bad) => {
            const img = new Image(), url = URL.createObjectURL(file);
            img.onload = () => {
                const s = Math.min(1, 600 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
                cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
                cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => { URL.revokeObjectURL(url); bad(new Error(T('Bild nicht lesbar.'))); };
            img.src = url;
        });
    }
    function bind() {
        box.addEventListener('click', e => {
            const t = e.target.closest('[data-nwt]'); if (t) return run('watch_cfg', { theme: t.dataset.nwt });
            const fc = e.target.closest('[data-nwf]'); if (fc) return run('watch_cfg', { face: fc.dataset.nwf });   // 8.0.5
            const g = e.target.closest('[data-nwbg]'); if (g && !g.disabled) return run('watch_cfg', { bg: g.dataset.nwbg });
            const a = e.target.closest('[data-nwa]'); if (!a) return;
            const k = a.dataset.nwa;
            if (k === 'newpin') return run('watch_newpin');
            if (k === 'find') return run('watch_find', { id: a.dataset.id });
            if (k === 'remove') { if (confirm(T('Diese Uhr entfernen? Sie muss danach neu gekoppelt werden.'))) run('watch_remove', { id: a.dataset.id }); return; }
            if (k === 'bgclear') return run('watch_bg_clear');
            if (k === 'usewatch') return api('hr_save', { source: 'watch' }).then(() => load()).catch(er => toast('⚠ ' + er.message, true));
        });
        box.addEventListener('change', e => {
            const el = e.target;
            if (el.matches('[data-nw=on]')) return run('watch_cfg', { on: el.checked ? '1' : '0' });
            if (el.matches('[data-nwport]')) return run('watch_cfg', { port: el.value });
            if (el.matches('[data-nwdim]')) return run('watch_cfg', { bg_dim: el.value });
            if (el.matches('[data-nwfile]') && el.files && el.files[0]) {
                const f = el.files[0]; el.value = '';
                if (f.size > 20 * 1024 * 1024) return toast(T('Datei zu groß.'), true);
                shrink(f).then(data => run('watch_bg', { data })).catch(er => toast('⚠ ' + er.message, true));
            }
        });
    }
    window.NexusWatchUI = {
        render(el) {
            box = el; bind(); load();
            clearInterval(timer);
            timer = setInterval(() => { if (!document.body.contains(box)) { clearInterval(timer); return; } load(); }, 5000);
        },
    };
})();
