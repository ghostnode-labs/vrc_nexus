'use strict';
/*
 * GhostNode Admin-Panel – läuft gleich in VRC Nexus und D2 Nexus (nexus.app.id = "vrc" | "d2").
 * Nutzt nur nexus.ghostnode (Recht „ghostnode“): Die Website prüft bei jeder Anfrage, ob das angemeldete Konto Admin-Rechte hat.
 */
module.exports = nexus => {
    const st = { tab: 'home', q: '', refs: {}, msg: '' };
    const when = s => { if (!s) return '–'; const d = typeof s === 'number' ? new Date(s * 1000) : new Date(String(s).replace(' ', 'T')); return isNaN(d) ? String(s) : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }); };
    const ref = (prefix, val) => { const k = prefix + '_' + Object.keys(st.refs).length; st.refs[k] = val; return k; };
    const TABS = [['home', '📊 Übersicht'], ['market', '🧩 Plugins prüfen'], ['users', '👥 Benutzer'], ['audit', '📜 Protokoll'], ['d2', '💠 D2-Chat']];

    async function render() {
        st.refs = {};
        const ui = [{ type: 'heading', text: '🛡 GhostNode Admin-Panel' }];
        let s;
        try { s = await nexus.ghostnode.status(); } catch (e) { return nexus.ui.set([...ui, { type: 'text', text: '⚠ ' + e.message }]); }
        if (!s.connected) {
            return nexus.ui.set([...ui,
                { type: 'text', text: 'Melde dich mit deinem GhostNode-Admin-Konto an – wie auf der Website (inkl. Zwei-Faktor). Danach bleibt die Anmeldung gespeichert, du musst keine ID eintragen.' },
                { type: 'button', id: 'login', label: '◈ Mit GhostNode anmelden', style: 'gold' },
                { type: 'text', text: 'Läuft in ' + nexus.app.name + '. Abmelden kannst du dich in den Einstellungen der App.' }]);
        }
        if (!s.admin) {
            return nexus.ui.set([...ui, { type: 'text', text: 'Angemeldet als ' + (s.user ? s.user.name : '?') + ' – dieses Konto hat keine Admin-Rechte auf der Website.' },
                { type: 'button', id: 'reload', label: '⟳ Rechte neu prüfen' }]);
        }
        ui.push({ type: 'text', text: 'Angemeldet als ' + s.user.name + ' · ' + nexus.app.name + (st.msg ? '\n' + st.msg : '') });
        for (const [k, n] of TABS) ui.push({ type: 'button', id: 'tab_' + k, label: n, style: st.tab === k ? 'gold' : '' });
        ui.push({ type: 'divider' });
        try { ui.push(...await PAGES[st.tab]()); }
        catch (e) { ui.push({ type: 'text', text: '⚠ ' + e.message }); }
        st.msg = '';
        nexus.ui.set(ui);
    }

    const PAGES = {
        async home() {
            const o = await nexus.ghostnode.get('admin/overview');
            const out = [
                { type: 'stat', label: 'Benutzer', value: o.users.total + ' (' + o.users.locked + ' gesperrt)' },
                { type: 'stat', label: 'Plugins', value: o.market.published + ' veröffentlicht · ' + o.market.pending + ' warten' }];
            if (o.server) {
                out.push({ type: 'stat', label: 'Server', value: o.server.down.length ? '⚠ aus: ' + o.server.down.join(', ') : '✔ alle Dienste laufen' });
                if (o.server.load) out.push({ type: 'stat', label: 'Last', value: [].concat(o.server.load).join(' · ') });
            } else out.push({ type: 'stat', label: 'Server', value: 'kein Status (kein Root-Server-Agent)' });
            if (o.d2) out.push({ type: 'stat', label: 'D2-Chat', value: o.d2.users + ' Nutzer · ' + o.d2.msgs24h + ' Nachrichten heute' });
            out.push({ type: 'heading', text: 'Letzte Ereignisse' }, { type: 'list', items: (o.audit || []).map(a => when(a.ts) + ' · ' + (a.username || 'System') + ' · ' + a.action + (a.detail ? ' – ' + a.detail : '')) });
            out.push({ type: 'button', id: 'reload', label: '⟳ Aktualisieren' });
            return out;
        },
        async market() {
            const r = await nexus.ghostnode.get('admin/market');
            if (!r.pending.length) return [{ type: 'text', text: '✔ Nichts zu prüfen.' }];
            const out = [{ type: 'text', text: 'Vor dem Freigeben: Paket auf der Website herunterladen und den Code lesen (besonders bei „Internet“ und Konto-Rechten).' }];
            for (const p of r.pending) {
                out.push({ type: 'heading', text: p.icon + ' ' + p.name + ' ' + p.version },
                    { type: 'text', text: p.description + '\nvon ' + (p.author || '?') + ' · für ' + p.apps.join(' + ') + ' · Rechte: ' + (p.permissions.join(', ') || 'keine') + (p.tags.length ? ' · #' + p.tags.join(' #') : '') + (p.changelog ? '\nNeu: ' + p.changelog : '') },
                    { type: 'button', id: ref('ok', p), label: '✅ Freigeben', style: 'gold' }, { type: 'button', id: ref('no', p), label: '⛔ Ablehnen', style: 'danger' });
            }
            out.push({ type: 'input', id: 'note', label: 'Grund bei Ablehnung (sieht der Autor)', placeholder: 'optional' });
            return out;
        },
        async users() {
            const r = await nexus.ghostnode.get('admin/users', st.q ? { q: st.q } : {});
            const out = [{ type: 'input', id: 'q', label: 'Suchen', value: st.q, placeholder: 'Name' }, { type: 'button', id: 'search', label: '🔎 Suchen' }];
            for (const u of r.users) out.push({ type: 'text', text: (u.active ? '🟢 ' : '⛔ ') + u.username + (u.name && u.name !== u.username ? ' (' + u.name + ')' : '') + ' · ' + (u.role || '') + ' · zuletzt ' + when(u.lastLogin) },
                { type: 'button', id: ref(u.active ? 'lock' : 'unlock', u), label: u.active ? 'Sperren' : 'Entsperren', style: u.active ? 'danger' : '' });
            return out;
        },
        async audit() {
            const r = await nexus.ghostnode.get('admin/audit', { limit: 80 });
            return [{ type: 'list', items: r.items.map(a => when(a.ts) + ' · ' + ({ security: '🔒', warn: '⚠', info: '·' }[a.level] || '·') + ' ' + (a.username || 'System') + ' · ' + a.action + (a.detail ? ' – ' + a.detail : '') + (a.ip ? ' (' + a.ip + ')' : '')) }];
        },
        async d2() {
            const [s, m] = await Promise.all([nexus.ghostnode.get('admin/d2', { op: 'stats' }), nexus.ghostnode.get('admin/d2', { op: 'msgs' })]);
            const out = [{ type: 'stat', label: 'Nutzer', value: s.users + ' (heute ' + s.active24h + ')' }, { type: 'stat', label: 'Nachrichten', value: s.msgs + ' (24 h: ' + s.msgs24h + ')' },
                { type: 'stat', label: 'Anmeldung', value: s.login },
                { type: 'input', id: 'news', label: '📢 Ankündigung an alle D2-Nexus-Nutzer', multiline: true, placeholder: 'z. B. Wartung heute 22 Uhr' }, { type: 'button', id: 'announce', label: '📢 Senden', style: 'gold' },
                { type: 'heading', text: 'Letzte Nachrichten' }];
            for (const x of m.msgs.slice(0, 40)) {
                out.push({ type: 'text', text: when(x.ts) + ' · ' + x.chan + ' · ' + x.name + ': ' + x.text });
                if (!x.chan.startsWith('dm:')) out.push({ type: 'button', id: ref('del', x), label: '✕ löschen', style: 'danger' });
                out.push({ type: 'button', id: ref('block', x), label: '⛔ ' + x.name + ' sperren' });
            }
            return out;
        }
    };

    nexus.on('ui', async e => {
        if (e.type !== 'click') return;
        const id = String(e.id || ''), v = e.values || {}, r = st.refs[id];
        try {
            if (id === 'login') { await nexus.ghostnode.login(); st.msg = '✔ Angemeldet.'; }
            else if (id.startsWith('tab_')) st.tab = id.slice(4);
            else if (id === 'search') st.q = String(v.q || '').trim();
            else if (id.startsWith('ok_') && r) { await nexus.ghostnode.post('admin/market/review', { id: r.id, version: r.version, decision: 'approved' }); st.msg = '✅ ' + r.name + ' freigegeben.'; }
            else if (id.startsWith('no_') && r) { await nexus.ghostnode.post('admin/market/review', { id: r.id, version: r.version, decision: 'rejected', note: String(v.note || '') }); st.msg = '⛔ ' + r.name + ' abgelehnt.'; }
            else if ((id.startsWith('lock_') || id.startsWith('unlock_')) && r) { await nexus.ghostnode.post('admin/users/active', { id: r.id, active: id.startsWith('unlock_') }); st.msg = r.username + (id.startsWith('unlock_') ? ' entsperrt.' : ' gesperrt.'); }
            else if (id === 'announce') { const t = String(v.news || '').trim(); if (t) { await nexus.ghostnode.post('admin/d2', { op: 'announce', text: t }); st.msg = '📢 Gesendet.'; } }
            else if (id.startsWith('del_') && r) { await nexus.ghostnode.post('admin/d2', { op: 'delete', id: r.id }); st.msg = 'Nachricht gelöscht.'; }
            else if (id.startsWith('block_') && r) { await nexus.ghostnode.post('admin/d2', { op: 'block', id: r.from, blocked: true }); st.msg = r.name + ' im D2-Chat gesperrt.'; }
        } catch (err) { st.msg = '⚠ ' + err.message; }
        render();
    });
    nexus.on('start', render);
};
