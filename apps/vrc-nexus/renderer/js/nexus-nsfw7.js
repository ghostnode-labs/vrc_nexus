/* VRC Nexus 8.2 – 🔞 🧪 Spielzeug-Labor (nur mit Spielzeug-Freigabe): Zeitleisten-Muster mit Editor, Muster-Mixer, Puls-Deckel,
 * Sanft an & aus (Sanftanlauf + Ausklingen-Timer), Spielzeug-Gruppen und private, verschlüsselte Statistik.
 * Alles hier kann die Stärke nur senken – Not-Aus, Panik, Safeword und Ampel Rot haben immer Vorrang. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    const sec = (t, html, cls) => '<div class="nc-card ' + (cls || '') + '"><h4>' + t + '</h4>' + html + '</div>';
    const btn = (a, label, cls, extra) => '<button type="button" class="btn btn-sm' + (cls ? ' ' + cls : '') + '" data-x7="' + a + '"' + (extra || '') + '>' + label + '</button>';
    const MODES = { mul: 'malnehmen', max: 'Maximum', avg: 'Mittelwert', alt: 'abwechseln' };
    const SHAPE = { lin: 'linear', step: 'Stufe', ease: 'weich' };
    let x = null, at = 0, loading = false, reRender = null, tlSel = '', tlText = '', tlName = '', tlLoop = true, preview = null;
    const fail = e => toast(e.message, true);
    const load = () => { if (loading) return; loading = true; api('toys_lab_state').then(d => { x = d; at = Date.now(); }).catch(e => { x = x || { error: e.message }; }).finally(() => { loading = false; if (reRender) reRender(); }); };
    const st = d => { if (d && d.cfg) { x = d; at = Date.now(); } if (d && d.msg) toast(d.msg); if (reRender) reRender(); };
    const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const chk = id => { const el = document.getElementById(id); return !!(el && el.checked); };
    const save = data => api('toys_lab_cfg', data).then(st).catch(fail);
    /** Zeitleiste als Text: „Zeit:Stärke[:Übergang]“, z. B. „0:0 5:80:weich 10:20“ */
    const tlToText = tl => tl.points.map(p => p.t + ':' + p.v + (p.s !== 'lin' ? ':' + (SHAPE[p.s] || p.s) : '')).join(' ');
    const tlParse = s => String(s || '').split(/[\s,;]+/).filter(Boolean).map(w => { const [t, v, k] = w.split(':'); const sh = Object.keys(SHAPE).find(z => z === k || SHAPE[z] === k) || 'lin'; return { t: Number(String(t).replace(',', '.')), v: Number(v), s: sh }; }).filter(p => isFinite(p.t) && isFinite(p.v));
    function svg(points, w, h) {
        const pts = points.length ? points : [{ t: 0, v: 0 }], dur = Math.max(1, pts[pts.length - 1].t);
        const X = t => Math.round(t / dur * (w - 10)) + 5, Y = v => Math.round(h - 5 - v / 100 * (h - 10));
        return '<svg class="x7-tl" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" data-x7="tl_click" data-dur="' + dur + '" role="img" aria-label="' + esc(T('Zeitleiste')) + '">'
            + '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.15)"/>'
            + (preview ? '<polyline fill="none" stroke="var(--accent-pink, #ff7ab8)" stroke-width="2" points="' + preview.map((v, i) => Math.round(i / (preview.length - 1) * (w - 10) + 5) + ',' + Y(v)).join(' ') + '"/>' : '')
            + pts.map(p => '<circle cx="' + X(p.t) + '" cy="' + Y(p.v) + '" r="4" fill="var(--accent-cyan, #38d5e6)"/>').join('') + '</svg>';
    }

    function html(t, render) {
        reRender = render;
        if (!x || Date.now() - at > 5000) load();
        if (!x) return '<p class="muted">' + esc(T('Lädt …')) + '</p>';
        if (x.error) return '<p class="muted">' + esc(x.error) + '</p>';
        const c = x.cfg, dev = x.devices, pats = x.patterns;
        let h = '<p class="small muted ns-wide">🛡 ' + esc(T('Alles im Labor kann die Stärke nur senken – Not-Aus, Panik, Safeword und Ampel Rot haben immer Vorrang.')) + '</p>';
        // ❤ Puls-Deckel
        const hc = c.hrcap;
        h += sec('❤ ' + esc(T('Puls-Deckel')), '<label class="check small"><input type="checkbox" data-x7c="hrcap.on"' + (hc.on ? ' checked' : '') + '> ' + esc(T('Ab einem Puls die Höchststärke sanft senken')) + '</label>'
            + '<div class="nc-row"><span class="small">' + esc(T('ab')) + '</span><input type="number" min="70" max="200" value="' + hc.soft + '" data-x7c="hrcap.soft" style="width:70px"><span class="small">bpm · ' + esc(T('bis')) + '</span>'
            + '<input type="number" min="80" max="220" value="' + hc.hard + '" data-x7c="hrcap.hard" style="width:70px"><span class="small">bpm ' + esc(T('auf')) + '</span><input type="number" min="0" max="90" value="' + hc.floor + '" data-x7c="hrcap.floor" style="width:60px"><span class="small">%</span></div>'
            + '<p class="small">' + (x.hr.bpm ? '💓 ' + x.hr.bpm + ' bpm → ' + Math.round(x.hr.factor * 100) + ' %' : esc(T('Kein Puls verbunden.'))) + '</p>');
        // 🌅 Sanft an & aus
        const f = x.fade;
        h += sec('🌅 ' + esc(T('Sanft an & aus')), '<label class="check small"><input type="checkbox" data-x7c="soft.on"' + (c.soft.on ? ' checked' : '') + '> ' + esc(T('Sanftanlauf nach einer Ruhepause')) + '</label>'
            + '<div class="nc-row"><span class="small">' + esc(T('Anlauf')) + '</span><input type="number" min="3" max="120" value="' + c.soft.secs + '" data-x7c="soft.secs" style="width:64px"><span class="small">s · ' + esc(T('Ruhepause ab')) + '</span>'
            + '<input type="number" min="5" max="600" value="' + c.soft.idle_s + '" data-x7c="soft.idle_s" style="width:64px"><span class="small">s</span></div>'
            + '<hr style="opacity:.15;width:100%"><b class="small">⏲ ' + esc(T('Ausklingen-Timer')) + '</b>'
            + (f ? '<p class="small">' + (f.fading ? '🌅 ' + esc(T('klingt aus')) + ' · ' + f.factor + ' %' : '⏳ ' + esc(T('noch')) + ' ' + Math.floor(f.left / 60) + ':' + String(f.left % 60).padStart(2, '0')) + '</p>' + btn('fade_stop', '✕ ' + esc(T('Timer aus')))
                : '<div class="nc-row"><select id="x7Min">' + [5, 10, 15, 20, 30, 45, 60, 90].map(m => '<option value="' + m + '"' + (m === 20 ? ' selected' : '') + '>' + m + ' min</option>').join('') + '</select>'
                + '<span class="small">' + esc(T('Ausklingen')) + '</span><select id="x7Fade">' + [15, 30, 60, 120].map(s => '<option value="' + s + '"' + (s === 30 ? ' selected' : '') + '>' + s + ' s</option>').join('') + '</select>'
                + btn('fade', '▶ ' + esc(T('Starten')), 'btn-gold') + btn('fade_now', '🌅 ' + esc(T('Jetzt ausklingen'))) + '</div>'));
        // 👥 Gruppen
        const gl = x.groups.length ? x.groups.map(g => '<div class="nc-mrow' + (g.on ? '' : ' off') + '"><b>' + esc(g.name) + ' <span class="small muted">' + g.present + '/' + g.devices.length + '</span></b>'
            + '<span class="small">' + esc(T('Anteil')) + '</span><input type="range" min="0" max="100" step="5" value="' + g.level + '" data-x7g="level" data-id="' + esc(g.id) + '" style="width:90px" title="' + g.level + ' %">'
            + '<input type="range" min="0" max="100" step="5" value="0" data-x7g="set" data-id="' + esc(g.id) + '" style="width:90px" title="' + esc(T('Stärke setzen')) + '"' + (g.present ? '' : ' disabled') + '>'
            + btn('g_mute', g.on ? '🔇' : '🔊', '', ' data-id="' + esc(g.id) + '" data-mute="' + (g.on ? '1' : '0') + '" title="' + esc(g.on ? T('stumm') : T('wieder an')) + '"')
            + btn('g_stop', '⏹', '', ' data-id="' + esc(g.id) + '" title="' + esc(T('Gruppe stoppen')) + '"') + '<button type="button" class="nc-x" data-x7="g_del" data-id="' + esc(g.id) + '" title="' + esc(T('Entfernen')) + '">✕</button></div>').join('')
            : '<p class="small muted">' + esc(T('Noch keine Gruppen.')) + '</p>';
        h += sec('👥 ' + esc(T('Spielzeug-Gruppen')), gl + (dev.length ? '<div class="nc-row"><input type="text" id="x7GName" maxlength="30" placeholder="' + esc(T('Name der Gruppe')) + '" style="width:150px">'
            + dev.map(d => '<label class="check small"><input type="checkbox" data-x7dev="' + esc(d.name) + '"> ' + esc(d.name) + '</label>').join('') + btn('g_add', '＋ ' + esc(T('Gruppe')), 'btn-gold') + '</div>'
            : '<p class="small muted">' + esc(T('Geräte verbinden, um Gruppen anzulegen.')) + '</p>'));
        // 📈 Zeitleiste
        const tls = c.timelines, cur = tls.find(z => z.id === tlSel);
        if (cur && !tlText) { tlText = tlToText(cur); tlName = cur.name; tlLoop = cur.loop; }
        const pts = tlParse(tlText).sort((a, b) => a.t - b.t);
        h += sec('📈 ' + esc(T('Zeitleisten-Muster')), '<div class="nc-row"><select id="x7Tl" data-x7s="tl">' + '<option value="">＋ ' + esc(T('Neue Zeitleiste')) + '</option>' + tls.map(z => '<option value="' + esc(z.id) + '"' + (z.id === tlSel ? ' selected' : '') + '>' + esc(z.name) + '</option>').join('') + '</select>'
            + '<input type="text" id="x7TlName" maxlength="30" value="' + esc(tlName) + '" placeholder="' + esc(T('Name')) + '" style="flex:1"></div>'
            + svg(pts, 480, 110) + '<p class="small muted">' + esc(T('In die Fläche tippen fügt einen Punkt hinzu. Format: Zeit:Stärke[:Übergang] – Übergang linear, Stufe oder weich.')) + '</p>'
            + '<textarea id="x7TlText" rows="2" data-x7s="tltext" placeholder="0:0 5:80:weich 10:20 15:0">' + esc(tlText) + '</textarea>'
            + '<div class="nc-row"><label class="check small"><input type="checkbox" id="x7TlLoop"' + (tlLoop ? ' checked' : '') + '> 🔁 ' + esc(T('wiederholen')) + '</label><span style="flex:1"></span>'
            + (cur ? btn('tl_play', '▶ ' + esc(T('Abspielen'))) + btn('tl_del', '🗑', '', ' title="' + esc(T('Löschen')) + '"') : '') + btn('tl_clear', esc(T('Leeren'))) + btn('tl_save', '💾 ' + esc(T('Speichern')), 'btn-gold') + '</div>', 'ns-wide');
        // 🧬 Mixer
        const opt = sel => pats.map(p => '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
        h += sec('🧬 ' + esc(T('Muster-Mixer')), (c.mixes.length ? c.mixes.map(m => '<div class="nc-mrow"><b>' + esc(m.name) + '</b><span class="small muted">' + esc((pats.find(p => p.id === m.a) || { name: m.a }).name) + ' ' + esc(T(MODES[m.mode])) + ' ' + esc((pats.find(p => p.id === m.b) || { name: m.b }).name) + '</span>'
                + btn('mx_play', '▶', '', ' data-id="' + esc(m.id) + '" title="' + esc(T('Abspielen')) + '"') + '<button type="button" class="nc-x" data-x7="mx_del" data-id="' + esc(m.id) + '" title="' + esc(T('Entfernen')) + '">✕</button></div>').join('') : '<p class="small muted">' + esc(T('Zwei Muster zu einem neuen verbinden.')) + '</p>')
            + '<div class="nc-row"><input type="text" id="x7MName" maxlength="30" placeholder="' + esc(T('Name')) + '" style="width:130px"><select id="x7MA">' + opt('welle') + '</select><select id="x7MMode">' + Object.entries(MODES).map(([k, l]) => '<option value="' + k + '">' + esc(T(l)) + '</option>').join('') + '</select>'
            + '<select id="x7MB">' + opt('puls') + '</select>' + btn('mx_add', '＋ ' + esc(T('Mix')), 'btn-gold') + '</div>');
        // 📊 Statistik
        const s = x.stats;
        h += sec('📊 ' + esc(T('Private Statistik')), '<label class="check small"><input type="checkbox" data-x7c="stats.on"' + (c.stats.on ? ' checked' : '') + '> ' + esc(T('Sitzungen aufzeichnen (nur auf diesem Gerät, verschlüsselt)')) + '</label>'
            + '<div class="nc-row"><span class="small">' + esc(T('Löschen nach')) + '</span><input type="number" min="1" max="365" value="' + c.stats.keep_days + '" data-x7c="stats.keep_days" style="width:64px"><span class="small">' + esc(T('Tagen')) + '</span>' + (x.recording ? '<span class="small ok">● ' + esc(T('zeichnet auf')) + '</span>' : '') + '</div>'
            + (s ? '<div class="perf-grid"><div class="perf-tile"><span>🗓</span><b>' + s.sessions + '</b><small>' + esc(T('Sitzungen (30 Tage)')) + '</small></div><div class="perf-tile"><span>⏱</span><b>' + s.minutes + ' min</b><small>Ø ' + s.avg_min + ' · max ' + s.longest + '</small></div>'
                + '<div class="perf-tile"><span>📈</span><b>' + s.avg_peak + ' %</b><small>' + esc(T('Ø Spitze')) + '</small></div><div class="perf-tile"><span>💥</span><b>' + s.climaxes + '</b><small>' + esc(T('Höhepunkte')) + '</small></div></div>'
                + (s.stored ? btn('st_clear', '🗑 ' + esc(T('Statistik löschen'))) : '') : ''));
        return h;
    }
    function onClick(e, render) {
        const b = e.target.closest('[data-x7]'); if (!b) return false;
        reRender = render;
        const a = b.dataset.x7, id = b.dataset.id;
        if (a === 'tl_click') {
            const r = b.getBoundingClientRect(), dur = Number(b.dataset.dur) || 10;
            const fx = (e.clientX - r.left) / r.width, fy = 1 - (e.clientY - r.top) / r.height;
            const pts = tlParse(val('x7TlText') || tlText), last = pts.length ? Math.max(...pts.map(p => p.t)) : 0;
            let t = Math.round(fx * Math.max(dur, 10) * 2) / 2; if (fx > 0.97 || !pts.length) t = pts.length ? Math.round((last + 2) * 2) / 2 : 0;
            pts.push({ t, v: Math.round(Math.max(0, Math.min(1, fy)) * 20) * 5, s: 'lin' });
            tlText = pts.sort((p, q) => p.t - q.t).filter((p, i, all) => !i || p.t > all[i - 1].t).map(p => p.t + ':' + p.v + (p.s !== 'lin' ? ':' + SHAPE[p.s] : '')).join(' ');
            tlName = val('x7TlName'); preview = null; render(); return true;
        }
        if (a === 'fade') { api('toys_lab_fade', { minutes: val('x7Min'), fade_s: val('x7Fade') }).then(st).catch(fail); return true; }
        if (a === 'fade_now') { api('toys_lab_fade_now', { fade_s: 15 }).then(st).catch(fail); return true; }
        if (a === 'fade_stop') { api('toys_lab_fade_stop', {}).then(st).catch(fail); return true; }
        if (a === 'g_add') {
            const devs = [...document.querySelectorAll('[data-x7dev]')].filter(i => i.checked).map(i => i.dataset.x7dev);
            if (!devs.length) { toast(T('Mindestens ein Gerät auswählen.'), true); return true; }
            save({ groups: JSON.stringify(x.cfg.groups.concat([{ id: 'g' + Date.now().toString(36).slice(-6), name: val('x7GName'), devices: devs, level: 100, on: true }])) }); return true;
        }
        if (a === 'g_del') { save({ groups: JSON.stringify(x.cfg.groups.filter(g => g.id !== id)) }); return true; }
        if (a === 'g_mute') { api('toys_lab_group_mute', { group: id, mute: b.dataset.mute }).then(st).catch(fail); return true; }
        if (a === 'g_stop') { api('toys_lab_group_stop', { group: id }).then(st).catch(fail); return true; }
        if (a === 'tl_clear') { tlText = ''; tlName = ''; tlSel = ''; preview = null; render(); return true; }
        if (a === 'tl_save') {
            const tlId = tlSel || 'z' + Date.now().toString(36).slice(-6), item = { id: tlId, name: val('x7TlName'), points: tlParse(val('x7TlText')), loop: chk('x7TlLoop') };
            const list = x.cfg.timelines.filter(z => z.id !== tlId).concat([item]);
            api('toys_lab_cfg', { timelines: JSON.stringify(list) }).then(d => { tlSel = tlId; tlText = ''; st(d); return api('toys_lab_preview', { id: 't:' + tlId }); }).then(p => { preview = p.preview; if (reRender) reRender(); }).catch(fail);
            return true;
        }
        if (a === 'tl_del') { if (confirm(T('Zeitleiste löschen?'))) { const list = x.cfg.timelines.filter(z => z.id !== tlSel); tlSel = ''; tlText = ''; tlName = ''; preview = null; save({ timelines: JSON.stringify(list) }); } return true; }
        if (a === 'tl_play') { api('toys_pattern', { id: 't:' + tlSel, strength: 70, speed: 1, seconds: 300 }).then(d => toast(d.msg)).catch(fail); return true; }
        if (a === 'mx_add') { save({ mixes: JSON.stringify(x.cfg.mixes.concat([{ id: 'x' + Date.now().toString(36).slice(-6), name: val('x7MName'), a: val('x7MA'), b: val('x7MB'), mode: val('x7MMode'), alt_s: 5 }])) }); return true; }
        if (a === 'mx_del') { save({ mixes: JSON.stringify(x.cfg.mixes.filter(m => m.id !== id)) }); return true; }
        if (a === 'mx_play') { api('toys_pattern', { id: 'm:' + id, strength: 70, speed: 1, seconds: 300 }).then(d => toast(d.msg)).catch(fail); return true; }
        if (a === 'st_clear') { if (confirm(T('Ganze Statistik löschen?'))) api('toys_lab_stats_clear', {}).then(st).catch(fail); return true; }
        return false;
    }
    function onChange(e, render) {
        const el = e.target; reRender = render;
        if (el.dataset.x7c) {
            const [grp, key] = el.dataset.x7c.split('.');
            save({ [grp]: JSON.stringify({ [key]: el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value }) }); return true;
        }
        if (el.dataset.x7g === 'level') { save({ groups: JSON.stringify(x.cfg.groups.map(g => (g.id === el.dataset.id ? Object.assign({}, g, { level: Number(el.value) }) : g))) }); return true; }
        if (el.dataset.x7g === 'set') { api('toys_lab_group_set', { group: el.dataset.id, level: Number(el.value) / 100 }).then(st).catch(fail); return true; }
        if (el.dataset.x7s === 'tl') { tlSel = el.value; tlText = ''; tlName = ''; tlLoop = true; preview = null; if (tlSel) api('toys_lab_preview', { id: 't:' + tlSel }).then(p => { preview = p.preview; render(); }).catch(() => {}); render(); return true; }
        if (el.dataset.x7s === 'tltext') { tlText = el.value; tlName = val('x7TlName'); tlLoop = chk('x7TlLoop'); preview = null; render(); return true; }
        return false;
    }
    window.NexusNsfw7 = { html, onClick, onChange, reload: () => { x = null; } };
})();
