/* VRC Nexus (Handy) – Werkzeuge → 🖥 Mit PC verbinden: Kopplung mit der Windows-App (wie Nexus Watch) und Fernbedienung im Heimnetz. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, b) => UI.toast(m, b), T = s => (window.t ? window.t(s) : s);
    let box = null, d = null, extra = { presets: null, macros: null }, timer = null;

    function pairHtml() {
        return '<div class="nc-card"><h4>🖥 ' + esc(T('Mit PC verbinden')) + '</h4>'
            + '<p class="small muted">' + esc(T('Am PC in VRC Nexus: Werkzeuge → Nexus Watch → „Uhr-Verbindung im Heimnetz erlauben“. Dort stehen Adresse und Code.')) + '</p>'
            + '<form id="pcPair" class="pc-pair"><input type="text" name="addr" placeholder="' + esc(T('PC-Adresse, z. B. 192.168.2.10')) + '" value="' + esc(d.host || '') + '" inputmode="url" autocomplete="off">'
            + '<input type="text" name="pin" placeholder="' + esc(T('Code (6 Ziffern)')) + '" inputmode="numeric" maxlength="7" autocomplete="one-time-code">'
            + '<button class="btn btn-gold">🔗 ' + esc(T('Koppeln')) + '</button></form>'
            + (d.error ? '<p class="small bad">⚠ ' + esc(T(d.error)) + '</p>' : '') + '</div>';
    }
    function mainHtml() {
        const s = d.state || {}, nsfw = !!s.nsfw, toys = s.toys;
        const world = s.private ? '🕶 ' + T('Privat-Modus') : s.running ? (s.world || T('VRChat läuft')) + ' · ' + (s.players || 0) + ' 👥' : T('VRChat läuft nicht');
        let h = '<div class="nc-card pc-head"><div><b>🖥 ' + esc(d.pc || 'PC') + '</b><small>' + esc(d.host + ':' + d.port) + '</small></div>'
            + '<div class="pc-bpm' + (s.bpm ? ' on' : '') + '">♥ ' + (s.bpm || '–') + '</div><p class="small">' + esc(world) + '</p>'
            + (d.error ? '<p class="small bad">⚠ ' + esc(T(d.error)) + '</p>' : '') + '</div>';
        h += '<div class="nc-card"><h4>💬 ' + esc(T('Chatbox')) + '</h4><form id="pcChat" class="pc-chat"><input type="text" name="text" maxlength="144" placeholder="' + esc(T('Text an die VRChat-Chatbox')) + '"><button class="btn btn-sm btn-gold">' + esc(T('Senden')) + '</button></form></div>';
        h += '<div class="nc-card"><h4>💤 ' + esc(T('Komfort')) + '</h4><div class="nc-row">'
            + (s.sleeping ? '<button type="button" class="btn btn-sm" data-pc="sleep_off">☀️ ' + esc(T('Aufwachen')) + '</button>' : '<button type="button" class="btn btn-sm" data-pc="sleep_on">💤 ' + esc(T('Schlafmodus')) + '</button>')
            + '</div></div>';
        h += '<div class="nc-card"><h4>🎭 ' + esc(T('Presets & Makros')) + '</h4>'
            + (extra.presets ? (extra.presets.presets && extra.presets.presets.length ? '<div class="chips">' + extra.presets.presets.map(p => '<button type="button" class="chip" data-pcpre="' + esc(p.id) + '">' + esc(p.name) + '</button>').join('') + '</div>' : '<p class="small muted">' + esc(T('Noch keine Presets.')) + '</p>') : '')
            + (extra.macros && extra.macros.length ? '<div class="chips" style="margin-top:6px">' + extra.macros.map(m => '<button type="button" class="chip" data-pcmac="' + esc(m.id) + '">▶ ' + esc(m.name) + '</button>').join('') + '</div>' : '')
            + '<button type="button" class="btn btn-sm" data-pc="load_extra" style="margin-top:6px">⟳ ' + esc(T('Laden')) + '</button></div>';
        if (nsfw) {
            h += '<div class="nc-card pc-safe"><h4>🔞 ' + esc(T('Notfall')) + '</h4>'
                + '<button type="button" class="btn ns-stop pc-panic" data-pc="panic">🚨 ' + esc(T('PANIK')) + '</button>'
                + '<div class="nc-row">' + (s.private ? '<button type="button" class="btn btn-sm" data-pc="allclear">✅ ' + esc(T('Entwarnung')) + '</button>' : '<button type="button" class="btn btn-sm" data-pc="private">🕶 ' + esc(T('Privat-Modus')) + '</button>') + '</div>'
                + (toys ? '<div class="nc-row pc-light"><button type="button" class="btn btn-sm" data-pcl="green">🟢</button><button type="button" class="btn btn-sm" data-pcl="yellow">🟡</button><button type="button" class="btn btn-sm" data-pcl="red">🔴</button>'
                    + '<button type="button" class="btn btn-sm" data-pc="toys_stop">⏹ ' + esc(T('Spielzeug stoppen')) + '</button></div>' : '')
                + '</div>';
        } else if (s.nsfw_reason) h += '<p class="small muted">🔞 ' + esc(T('gesperrt')) + ': ' + esc(T(s.nsfw_reason)) + '</p>';
        h += '<div class="nc-row"><button type="button" class="btn btn-sm" data-pc="unpair">' + esc(T('Verbindung lösen')) + '</button></div>';
        return h;
    }
    function render() {
        if (!box || !d) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input')) return;
        box.innerHTML = '<div class="nc-grid">' + (d.paired ? mainHtml() : pairHtml()) + '</div>';
    }
    const load = refresh => api('pclink_get', refresh ? { refresh: '1' } : {}).then(r => { d = r; render(); }).catch(e => { if (box) box.innerHTML = '<div class="vx-error">⚠ ' + esc(e.message) + '</div>'; });
    const act = (a, data) => api('pclink_act', { pc_act: a, data: JSON.stringify(data || {}) }).then(r => { d = r; render(); const m = r.msg || (r.result && r.result.msg); if (m) toast(T(m)); return r; }).catch(e => { toast('⚠ ' + e.message, true); throw e; });

    function bind() {
        box.addEventListener('submit', e => {
            e.preventDefault();
            const f = e.target;
            if (f.id === 'pcPair') return api('pclink_pair', { addr: f.addr.value, pin: f.pin.value }).then(r => { d = r; render(); toast(r.msg); }).catch(er => toast('⚠ ' + er.message, true));
            if (f.id === 'pcChat') { const tx = f.text.value.trim(); if (!tx) return; act('client_osc', { kind: 'chatbox', text: tx, sound: '1' }).then(() => { f.text.value = ''; toast('💬 ' + T('gesendet')); }).catch(() => {}); }
        });
        box.addEventListener('click', e => {
            const l = e.target.closest('[data-pcl]'); if (l) return act('toys_consent', { light: l.dataset.pcl }).catch(() => {});
            const pr = e.target.closest('[data-pcpre]'); if (pr) return act('preset_apply', { id: pr.dataset.pcpre }).catch(() => {});
            const mc = e.target.closest('[data-pcmac]'); if (mc) return act('client_macro_run', { id: mc.dataset.pcmac }).catch(() => {});
            const b = e.target.closest('[data-pc]'); if (!b) return;
            const k = b.dataset.pc;
            if (k === 'panic') { if (!confirm(T('Panik auslösen?'))) return; return act('nsfw_panic').catch(() => {}); }
            if (k === 'allclear') return act('nsfw_allclear').catch(() => {});
            if (k === 'private') return act('nsfw_private', { on: '1' }).catch(() => {});
            if (k === 'toys_stop') return act('toys_stop', { device: 'all' }).catch(() => {});
            if (k === 'sleep_on' || k === 'sleep_off') return act('comfort_sleep', { on: k === 'sleep_on' ? '1' : '0' }).catch(() => {});
            if (k === 'load_extra') return Promise.all([act('preset_list').then(r => { extra.presets = r.result; }), act('client_macros').then(r => { extra.macros = (r.result && r.result.macros) || []; })]).then(render).catch(() => {});
            if (k === 'unpair') { if (!confirm(T('Verbindung zum PC lösen?'))) return; return api('pclink_unpair').then(r => { d = r; render(); toast(r.msg); }); }
        });
    }
    window.NexusPcLink = {
        render(el) {
            box = el; bind(); load(true);
            clearInterval(timer);
            timer = setInterval(() => { if (!document.body.contains(box)) { clearInterval(timer); return; } if (d && d.paired) load(true); }, 5000);
        },
    };
})();
