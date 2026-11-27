'use strict';
/**
 * 8.2 Geräte-Hub: alle verbundenen Geräte an einem Ort – Uhr, Handy, gekoppelte PCs, Puls-Quelle und (nur mit 18+-Freischaltung,
 * nicht im Privat-Modus) Spielzeug – mit Akkustand, Verbindung und Warnung bei niedrigem Akku.
 * Liest nur, was die Module ohnehin wissen; nichts geht nach außen.
 */
const { UserError } = require('./util');

const LOW = 20;

class DevHub {
    constructor(app) { this.app = app; }
    list() {
        const a = this.app, out = [];
        const add = (o) => out.push(Object.assign({ battery: null, online: false, detail: '' }, o, { low: o.battery !== null && o.battery !== undefined && o.battery <= LOW }));
        out.push({ id: 'pc', kind: 'pc', icon: '🖥', name: 'Dieser PC', online: true, battery: null, detail: a.lansync ? ({ hub: 'Zentrale', peer: 'gekoppelt mit ' + (a.lansync.cfg().pc || a.lansync.cfg().host || '?'), off: '' }[a.lansync.role()] || '') : '', low: false });
        if (a.watch) {
            const st = a.watch.status ? a.watch.status() : { devices: [] };
            for (const d of st.devices || []) add({ id: 'w:' + d.id, kind: d.kind, icon: d.kind === 'phone' ? '📱' : d.kind === 'pc' ? '💻' : '⌚', name: d.name, online: !!d.online, battery: d.battery === undefined ? null : d.battery, last: d.last || 0, detail: d.ver ? 'v' + d.ver : '' });
        }
        if (a.heart) {
            const h = a.heart, src = h.cfg ? h.cfg().source : '';
            if (src && src !== 'off') add({ id: 'heart', kind: 'heart', icon: '💓', name: 'Puls (' + src + ')', online: !!h.active, detail: h.active ? h.bpm + ' bpm' : '' });
        }
        if (a.toys && a.nsfwVisible && a.nsfwVisible()) {
            let ts = null; try { ts = a.toys.status(); } catch (e) { ts = null; }
            for (const d of (ts && ts.devices) || []) add({ id: 't:' + d.index, kind: 'toy', icon: '🔞', name: d.label || d.name, online: true, battery: typeof d.battery === 'number' ? d.battery : null, detail: d.out ? d.out + ' %' : '' });
        }
        return { devices: out, low: out.filter(d => d.low).length };
    }
    async action(act) {
        if (act === 'devhub_list') return this.list();
        throw new UserError('Unbekannte Aktion.');
    }
}
module.exports = { DevHub, LOW };
