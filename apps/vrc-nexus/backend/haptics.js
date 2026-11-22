'use strict';
/*
 * 4.2: Erkennung von Haptik-/NSFW-Systemen an Avatar-Parametern (eigene Umsetzung nach den öffentlichen Parameter-Namen):
 *  - SPS / VRCFury (aktuell, „OGB-Version“ 11):  OGB/Plug/<id>/{TouchSelf,TouchOthers,FrotOthers,DepthSelf,DepthOthers,LengthMult1,LengthMult2}
 *                                               OGB/Socket/<id>/{TouchSelf,TouchOthers,DepthSelf,DepthOthers,DepthRadius}
 *                                               OGB/Touch/<id>/{Self,Others}   ·   OGB/Enabled · OGB/Version/<n> · OGB/HapticsDisabled
 *    Wichtig: VRCFury schaltet die Haptik-Kontakte nur ein, solange OGB/Enabled = true ist (sonst kommen keine Werte).
 *  - OGB alt (OscGoesBrrr ≤ 1.x, ältere SPS):   OGB/Pen/<id>/…, OGB/Orf/<id>/… mit PenSelf/PenOthers/…(NewRoot|NewTip|Close)
 *  - VRCFury Haptics alt:                         VFH/(Zone/)?<Pen|Orf|Touch|Plug|Socket>/<id>/…
 *  - PCS (Dismay Custom):                         pcs/output/*, pcs/satisfaction/*, pcs/select/*, pcs/menu/*
 * Werte 0…1 = Nähe bzw. Tiefe.
 */
const KIND = { pen: 'plugs', plug: 'plugs', orf: 'sockets', socket: 'sockets', touch: 'touch' };
/** Felder, die nur Maße/Einstellungen sind – keine Berührung */
const META = new Set(['lengthmult1', 'lengthmult2', 'depthradius', 'info', 'version', 'radius', 'length']);
/** Feld-Namen → einheitlicher Schlüssel (für die „berührt von“-Schalter) */
function normKey(field, kind) {
    let k = String(field).toLowerCase().replace(/(newroot|newtip|close)$/, '');
    if (k === 'depthothers') k = 'penothers';
    if (k === 'depthself') k = 'penself';
    if (kind === 'touch' && (k === 'self' || k === 'others')) k = 'touch' + k;
    return k;
}
const SPS_RE = /^(OGB|VFH)\/(?:Zone\/)?(Pen|Orf|Touch|Plug|Socket)\/([^/]+)\/([A-Za-z0-9_]+)$/;
/** Einen Parameter-Namen deuten → { sys, kind, id, field, key, meta } oder null */
function parse(name) {
    const n = String(name || '');
    const m = SPS_RE.exec(n);
    if (m) {
        const k = m[2].toLowerCase(), kind = KIND[k];
        const sys = m[1] === 'VFH' ? 'vfh' : (k === 'pen' || k === 'orf') ? 'ogb' : 'sps';
        const field = m[4], lf = field.toLowerCase();
        return { sys, kind, id: m[3], field, key: normKey(field, kind), meta: META.has(lf) || /^lengthmult/.test(lf) };
    }
    if (/^OGB\/(Enabled|HapticsDisabled|Version\/\d+)$/.test(n)) return { sys: 'sps', marker: n.slice(4) };
    if (/^pcs\//i.test(n)) { const p = n.toLowerCase().split('/'); return { sys: 'pcs', group: p[1] || '', field: p.slice(2).join('/') }; }
    return null;
}
/** Ist das ein intimer Parameter (für Datenschutz im Log/Debugger)? */
const NSFW_RE = /^(OGB|VFH|pcs|SPS|TPS|DPS|Nsfw)\//i;
const isNsfw = name => NSFW_RE.test(String(name || '')) || /^NX\/(Lust|Toy|Consent)$/.test(String(name || ''));

/** Avatar-Check: welche Systeme hat dieser Avatar? names = Liste aller bekannten Parameter-Namen */
function detect(names, live) {
    const out = { sps: { found: false, version: 0, enabled_param: false, disabled_marker: false, plugs: [], sockets: [], touch: [] },
        ogb_legacy: { found: false, plugs: [], sockets: [] }, vfh: { found: false, zones: [] },
        pcs: { found: false, outputs: [], zones: [], lust: false, events: false }, extras: { consent: false, toy: false, lust: false } };
    const add = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
    for (const name of names) {
        const p = parse(name);
        if (name === 'NX/Consent') out.extras.consent = true;
        if (name === 'NX/Toy') out.extras.toy = true;
        if (name === 'NX/Lust') out.extras.lust = true;
        if (!p) continue;
        if (p.sys === 'sps' && p.marker) {
            out.sps.found = true;
            if (p.marker === 'Enabled') out.sps.enabled_param = true;
            if (p.marker === 'HapticsDisabled') out.sps.disabled_marker = true;
            const v = /^Version\/(\d+)$/.exec(p.marker); if (v) out.sps.version = Math.max(out.sps.version, +v[1]);
            continue;
        }
        if (p.sys === 'sps') { out.sps.found = true; add(out.sps[p.kind], p.id); }
        if (p.sys === 'ogb') { out.ogb_legacy.found = true; if (p.kind !== 'touch') add(out.ogb_legacy[p.kind], p.id); }
        if (p.sys === 'vfh') { out.vfh.found = true; add(out.vfh.zones, p.kind + ':' + p.id); }
        if (p.sys === 'pcs') {
            out.pcs.found = true;
            if (p.group === 'output') add(out.pcs.outputs, p.field);
            if (p.group === 'select' || p.group === 'menu') add(out.pcs.zones, p.field);
            if (p.group === 'satisfaction') { out.pcs.lust = true; if (p.field === 'event') out.pcs.events = true; }
        }
    }
    // Hinweise
    const hints = [];
    if (out.sps.found && out.sps.enabled_param) hints.push(live && live['OGB/Enabled'] === true ? '✔ OGB/Enabled ist an – die SPS-Kontakte liefern Werte.' : 'ℹ OGB/Enabled ist aus – VRC Nexus schaltet es ein, sobald OGB/SPS oder Verknüpfungen aktiv sind.');
    if (out.sps.disabled_marker) hints.push('⚠ In VRCFury ist „Haptics“ beim Hochladen ausgeschaltet gewesen (OGB/HapticsDisabled) – dann gibt es keine Kontakte für Spielzeug.');
    if (out.ogb_legacy.found) hints.push('ℹ Alte OGB-Namen (Pen/Orf) gefunden – werden weiter unterstützt; ein Update auf aktuelles SPS (VRCFury) wird empfohlen.');
    if (out.pcs.found && !out.pcs.outputs.length) hints.push('⚠ PCS-Menü gefunden, aber keine pcs/output/…-Parameter – die Ausgabe-Parameter müssen in den Expression Parameters stehen.');
    if (!out.sps.found && !out.ogb_legacy.found && !out.vfh.found && !out.pcs.found) hints.push('Kein SPS/OGB/PCS an diesem Avatar gefunden (oder OSC-Konfiguration noch nicht gelesen).');
    out.hints = hints;
    return out;
}

module.exports = { parse, detect, isNsfw, normKey, NSFW_RE };
