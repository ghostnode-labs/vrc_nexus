/* VRC Nexus – Spielzeug-Verknüpfungen (❤️ NSFW / ERP): je Gerät beliebig viele Quellen
 * (SPS-Plugs, SPS-Sockets, SPS-Touch-Zonen, Konstant, Avatar-Parameter) mit Ein-/Ausschließen, „berührt von“ und Mutatoren.
 * Eigene Umsetzung; das Prinzip „Gerät ↔ Quellen verknüpfen“ ist an bekannte Haptik-Tools angelehnt. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api;
    const TYPES = { plugs: '🍆 SPS-Plugs', sockets: '🍑 SPS-Sockets', touch: '✋ SPS-Touch-Zonen', constant: '♾ Konstant', param: '🎚 Avatar-Parameter', pcs: '🫦 PCS', heart: '💓 Puls', voice: '🎙 Stimme', lust: '💗 Lust-Meter' };
    const WHAT = { plugs: 'Plugs', sockets: 'Sockets', touch: 'Touch-Zonen', pcs: 'PCS-Zonen' };
    const SRC = {
        plugs: [['pen_others', 'fremde SPS-Sockets'], ['touch_others', 'fremde Hände / Füße / Kopf'], ['frot_others', 'fremde SPS-Plugs'], ['pen_self', 'meine SPS-Sockets'], ['touch_self', 'meine Hände / Füße']],
        sockets: [['pen_others', 'fremde SPS-Plugs'], ['touch_others', 'fremde Hände / Füße / Kopf'], ['frot_others', 'fremde SPS-Sockets'], ['pen_self', 'meine SPS-Plugs'], ['touch_self', 'meine Hände / Füße']],
        touch: [['touch_others', 'fremde Hände / Füße / Kopf'], ['touch_self', 'meine Hände / Füße']],
    };
    const MUT = { scale: ['Skalieren', 'Faktor', 1, 0.1, 5, 0.1], dead: ['Totzone', 'unter … ×10 % aus', 1, 0, 9, 0.5], motion: ['Bewegung', 'Empfindlichkeit', 1, 0.1, 10, 0.1] };
    const SRC_DEF = { pen_others: true, touch_others: true, frot_others: true, pen_self: false, touch_self: false, frot_self: false };
    let links = null, devNames = [], saveT = null, onSaved = null;

    function save() {
        clearTimeout(saveT);
        saveT = setTimeout(() => api('toys_cfg', { links: JSON.stringify(links) }).then(d => { if (onSaved) onSaved(d); }).catch(x => UI.toast(x.message, true)), 350);
    }
    function linkHtml(l, di, li, zones) {
        let h = '<div class="tl-link"><div class="tl-lhead"><b>' + TYPES[l.type] + '</b><button type="button" class="nc-x" data-tl="del" data-d="' + di + '" data-l="' + li + '" title="Verknüpfung entfernen">✕</button></div>';
        if (WHAT[l.type]) {
            const avail = (zones[l.type] || []).filter(n => !l.include.includes(n) && !l.exclude.includes(n));
            h += '<div class="small">Auslösen bei diesen ' + WHAT[l.type] + ':</div><div class="tl-chips">'
                + (l.include.length ? l.include.map(n => '<span class="tl-chip in">' + esc(n) + '<i data-tl="unin" data-d="' + di + '" data-l="' + li + '" data-n="' + esc(n) + '">×</i></span>').join('') : '<span class="tl-chip all">＋ alle ' + WHAT[l.type] + '</span>')
                + l.exclude.map(n => '<span class="tl-chip ex">− ' + esc(n) + '<i data-tl="unex" data-d="' + di + '" data-l="' + li + '" data-n="' + esc(n) + '">×</i></span>').join('') + '</div>'
                + '<div class="nc-row"><select data-tl="pick" data-d="' + di + '" data-l="' + li + '"><option value="">' + (avail.length ? 'Name wählen …' : '(noch keine gesehen – Avatar mit SPS tragen)') + '</option>' + avail.map(n => '<option>' + esc(n) + '</option>').join('') + '</select>'
                + '<input type="text" placeholder="oder Name eintippen" data-tl="pickname" data-d="' + di + '" data-l="' + li + '" style="width:150px"><button type="button" class="btn btn-sm" data-tl="inc" data-d="' + di + '" data-l="' + li + '">＋ Einschließen</button><button type="button" class="btn btn-sm" data-tl="exc" data-d="' + di + '" data-l="' + li + '">− Ausschließen</button></div>'
                + (SRC[l.type] ? '<div class="small">… berührt werden von:</div><div class="tl-src">' : '<div class="tl-src" hidden>') + (SRC[l.type] || []).map(([k, lab]) => '<label class="switch-row"><span class="switch"><input type="checkbox" data-tl="src" data-k="' + k + '" data-d="' + di + '" data-l="' + li + '"' + (l.src[k] ? ' checked' : '') + '><i></i></span> ' + lab + '</label>').join('') + '</div>';
        }
        if (l.type === 'constant') h += '<div class="nc-row"><input type="range" min="0" max="100" value="' + l.value + '" data-tl="value" data-d="' + di + '" data-l="' + li + '" style="flex:1"><span class="small">' + l.value + ' %</span></div>';
        if (l.type === 'param') h += '<div class="nc-row"><span class="small">Parameter</span><input type="text" value="' + esc(l.param) + '" placeholder="z. B. Tail_Wag" data-tl="param" data-d="' + di + '" data-l="' + li + '" style="flex:1"></div>';
        h += '<div class="tl-muts">' + l.mut.map((m, mi) => { const M = MUT[m.t]; return '<span class="tl-mut"><b>' + M[0] + '</b> <span class="small">' + M[1] + '</span><input type="number" min="' + M[3] + '" max="' + M[4] + '" step="' + M[5] + '" value="' + m.v + '" data-tl="mutv" data-d="' + di + '" data-l="' + li + '" data-m="' + mi + '"><i data-tl="mutdel" data-d="' + di + '" data-l="' + li + '" data-m="' + mi + '">×</i></span>'; }).join('')
            + '<select data-tl="mutadd" data-d="' + di + '" data-l="' + li + '"><option value="">＋ Mutator …</option>' + Object.entries(MUT).map(([k, M]) => '<option value="' + k + '">' + M[0] + '</option>').join('') + '</select></div>';
        return h + '</div>';
    }
    /** HTML für alle Geräte (verbundene + schon eingerichtete) */
    function html(t) {
        if (!links || !onSaved) links = JSON.parse(JSON.stringify(t.cfg.links || {}));
        const live = new Map(t.devices.map(d => [d.name, d]));
        devNames = [...new Set([...t.devices.map(d => d.name), ...Object.keys(links)])];
        if (!devNames.length) return '<p class="muted small">Noch keine Geräte – oben verbinden und „Geräte suchen“.</p>';
        const lv = t.link_levels || {}, zones = t.zones || {};
        return devNames.map((name, di) => {
            const d = live.get(name), l = links[name] || [];
            return '<div class="tl-dev' + (d ? '' : ' off') + '"><div class="tl-dhead"><i class="tl-dot' + (d ? ' on' : '') + '"></i><b>' + esc(name) + '</b>'
                + (d ? '<span class="tl-level"><span style="width:' + (lv[name] !== undefined ? lv[name] : d.level) + '%"></span></span><span class="small">' + (lv[name] !== undefined ? lv[name] : d.level) + ' %</span>' : '<span class="small bad">nicht verbunden</span>')
                + (l.length ? '' : '<span class="muted small">keine Verknüpfung</span>') + '</div>'
                + l.map((x, li) => linkHtml(x, di, li, zones)).join('')
                + '<div class="nc-row"><select data-tl="add" data-d="' + di + '"><option value="">＋ Verknüpfen mit …</option>' + Object.entries(TYPES).map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select></div></div>';
        }).join('');
    }
    const L = el => { const n = devNames[+el.dataset.d]; links[n] = links[n] || []; return { n, list: links[n], l: links[n][+el.dataset.l] }; };
    function onClick(e, rerender) {
        const el = e.target.closest('[data-tl]');
        if (!el || !links) return false;
        const k = el.dataset.tl, x = L(el);
        if (k === 'del') { x.list.splice(+el.dataset.l, 1); if (!x.list.length) delete links[x.n]; }
        else if (k === 'unin') x.l.include = x.l.include.filter(n => n !== el.dataset.n);
        else if (k === 'unex') x.l.exclude = x.l.exclude.filter(n => n !== el.dataset.n);
        else if (k === 'mutdel') x.l.mut.splice(+el.dataset.m, 1);
        else if (k === 'inc' || k === 'exc') {
            const row = el.parentNode, name = (row.querySelector('[data-tl=pickname]').value || row.querySelector('[data-tl=pick]').value).trim();
            if (!name) return true;
            const arr = k === 'inc' ? x.l.include : x.l.exclude;
            if (!arr.includes(name)) arr.push(name);
        } else return false;
        save(); rerender(); return true;
    }
    function onChange(e, rerender) {
        const el = e.target.closest('[data-tl]');
        if (!el || !links) return false;
        const k = el.dataset.tl;
        if (k === 'add') { if (!el.value) return true; const n = devNames[+el.dataset.d]; (links[n] = links[n] || []).push({ type: el.value, include: [], exclude: [], src: Object.assign({}, SRC_DEF), value: 100, param: '', mut: [] }); }
        else if (k === 'pick' || k === 'pickname') return true;
        else {
            const x = L(el);
            if (k === 'src') x.l.src[el.dataset.k] = el.checked;
            else if (k === 'value') x.l.value = +el.value;
            else if (k === 'param') x.l.param = el.value.trim();
            else if (k === 'mutadd') { if (!el.value) return true; x.l.mut.push({ t: el.value, v: MUT[el.value][2] }); }
            else if (k === 'mutv') x.l.mut[+el.dataset.m].v = Number(el.value);
            else return false;
        }
        save(); rerender(); return true;
    }
    function onInput(e) {
        const el = e.target.closest('[data-tl=value]');
        if (!el) return false;
        const s = el.parentNode.querySelector('span'); if (s) s.textContent = el.value + ' %';
        return true;
    }
    window.NexusToyLinks = { html, onClick, onChange, onInput, bind(fn) { onSaved = fn; }, reset() { links = null; } };
})();
