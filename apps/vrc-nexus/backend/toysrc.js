'use strict';
/*
 * 8.3: Spielzeug-Quellen – reine Rechenlogik (ohne Netzwerk, ohne Zustand außer dem übergebenen), eigene Umsetzung:
 *  - Quelle → Stärke: Modus (Tiefe / Bewegung / beides), Bereich (Min/Max), Leerlauf, Kurve, Glättung
 *  - Bewegung: Änderung der Tiefe pro Sekunde, klingt ohne neue Werte schnell ab
 *  - Stroker (Buttplug LinearCmd): Position aus der Tiefe mit passender Dauer, Grenzen oben/unten, Ruhestellung
 *  - erkannte Avatar-Zonen (SPS / OGB / TPS / VFH) als auswählbare Liste mit Live-Wert
 *  - Vorlagen („sanft“, „intensiv“, „nur Berührung“ …) und Export/Import der Zuordnung als Text
 */
const H = require('./haptics');

const clamp = x => Math.max(0, Math.min(1, Number(x) || 0));
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const MODES = ['depth', 'motion', 'mix'];
/** neutrale Werte: alte Verknüpfungen rechnen damit genau wie vorher */
const LINK_DEF = { mode: 'depth', lo: 0, hi: 100, idle: 0, curve: 1, smooth: 0, sens: 1 };
const ZONE_TYPES = ['plugs', 'sockets', 'touch'];
/** Schlüssel „von anderen“ / „von mir“ (siehe haptics.normKey) */
const OTHERS = ['penothers', 'touchothers', 'frotothers', 'others'];
const SELF = ['penself', 'touchself', 'frotself', 'self'];
/** echte Tiefe (Eindringen) – nur diese steuern einen Stroker */
const isDepthKey = k => k === 'penothers' || k === 'penself';

/** neue Felder einer Verknüpfung prüfen (fehlende = neutral) */
function normLink(x) {
    x = x || {};
    const o = {
        mode: MODES.includes(x.mode) ? x.mode : LINK_DEF.mode,
        lo: Math.round(num(x.lo, 0, 95, LINK_DEF.lo)),
        hi: Math.round(num(x.hi, 5, 100, LINK_DEF.hi)),
        idle: Math.round(num(x.idle, 0, 50, LINK_DEF.idle)),
        curve: Math.round(num(x.curve, 0.3, 3, LINK_DEF.curve) * 10) / 10,
        smooth: Math.round(num(x.smooth, 0, 3000, LINK_DEF.smooth)),
        sens: Math.round(num(x.sens, 0.2, 5, LINK_DEF.sens) * 10) / 10,
    };
    if (o.lo >= o.hi) o.lo = Math.max(0, o.hi - 5);
    return o;
}
/** Bewegung 0…1 aus der gemessenen Geschwindigkeit (Tiefe pro Sekunde); ohne neue Werte nach ~1 s praktisch 0.
 *  Bei Empfindlichkeit 1 gilt ≈ 2 volle Tiefen pro Sekunde als 100 %. */
function motionLevel(e, now, sens = 1) {
    if (!e || !e.speed) return 0;
    const age = Math.max(0, now - e.at);
    return clamp(e.speed * Math.exp(-age / 350) * sens * 0.5);
}
function pickMode(depth, motion, mode) { return mode === 'motion' ? motion : mode === 'mix' ? Math.max(depth, motion) : depth; }
/** Rohwert 0…1 → Ausgabe 0…1: nichts los = Leerlauf (nur solange der Avatar sendet), sonst Kurve und Bereich */
function shape(x, l, live) {
    if (!(x > 0.001)) return live ? l.idle / 100 : 0;
    return clamp(l.lo / 100 + (l.hi - l.lo) / 100 * Math.pow(clamp(x), l.curve));
}
/** Glättung: weicher Übergang mit Zeitkonstante tau (ms); 0 = sofort. Ganz aus → schnell auf 0. */
function smoothStep(prev, x, dt, tau) {
    if (!tau || prev === undefined || prev === null || !(dt > 0)) return x;
    const y = prev + (x - prev) * (1 - Math.exp(-dt / tau));
    return x === 0 && y < 0.01 ? 0 : y;
}
/** stärkste Quelle gewinnt – Index (oder -1) und Wert */
function strongest(vals) {
    let win = -1, v = 0;
    vals.forEach((x, i) => { if (x > v + 1e-9) { v = x; win = i; } });
    return { win, v: clamp(v) };
}

/**
 * Stroker-Planer: Ziel-Position aus der Tiefe (tief = unten), Dauer so, dass das Gerät nie schneller als
 * „speed“ volle Hübe pro Sekunde fahren muss. st = { pos, at, activeAt } wird fortgeschrieben.
 * o = { min, max (0–100, unten/oben), speed (Hübe/s), rest (0–100), rest_after (ms), every (ms), gap (ms) }
 * Ergebnis: { position, duration } oder null (nichts senden).
 */
function linPlan(st, depth, now, o) {
    const lo = clamp(o.min / 100), hi = Math.max(lo + 0.05, clamp(o.max / 100));
    let target;
    if (depth > 0.01) { st.activeAt = now; target = hi - clamp(depth) * (hi - lo); }
    else if (st.activeAt && now - st.activeAt > (o.rest_after || 3000)) { target = lo + clamp(o.rest / 100) * (hi - lo); st.activeAt = 0; st.resting = true; }
    else if (st.resting) { target = lo + clamp(o.rest / 100) * (hi - lo); }
    else return null;
    if (depth > 0.01) st.resting = false;
    if (now - (st.at || 0) < Math.max(o.gap || 0, o.every || 90)) return null;
    const dist = Math.abs(target - (st.pos === undefined ? hi : st.pos));
    if (dist < 0.015) { if (st.resting) st.resting = false; return null; }
    const speed = Math.max(0.2, o.speed || 2);
    const duration = Math.round(Math.max(o.every || 90, Math.min(2500, dist / speed * 1000)));
    st.pos = target; st.at = now;
    return { position: Math.round(target * 1000) / 1000, duration };
}

/** Vorlagen für „folgt meinem Avatar“ – je Vorlage Quellen + Einstellungen */
const SRC_OTHERS = { pen_others: true, touch_others: true, frot_others: true, pen_self: false, touch_self: false, frot_self: false };
const SRC_HANDS = { pen_others: false, touch_others: true, frot_others: false, pen_self: false, touch_self: false, frot_self: false };
const PRESETS = {
    sanft: { name: '💙 sanft', desc: 'leise und weich, steigt langsam an', types: ZONE_TYPES, src: SRC_OTHERS, o: { mode: 'depth', lo: 0, hi: 60, curve: 1.6, smooth: 600 } },
    normal: { name: '💗 ausgewogen', desc: 'Tiefe und Bewegung, gut für den Anfang', types: ZONE_TYPES, src: SRC_OTHERS, o: { mode: 'mix', lo: 5, hi: 100, curve: 1, smooth: 250 } },
    intensiv: { name: '🔥 intensiv', desc: 'reagiert früh und kräftig', types: ZONE_TYPES, src: SRC_OTHERS, o: { mode: 'mix', lo: 20, hi: 100, curve: 0.7, smooth: 100, sens: 1.6 } },
    bewegung: { name: '🌊 Bewegung', desc: 'nur Bewegung zählt – stillhalten = ruhig', types: ['plugs', 'sockets'], src: SRC_OTHERS, o: { mode: 'motion', lo: 10, hi: 100, curve: 1, smooth: 300, sens: 1.2 } },
    beruehrung: { name: '✋ nur Berührung', desc: 'Hände und Touch-Zonen, kein Eindringen', types: ZONE_TYPES, src: SRC_HANDS, o: { mode: 'depth', lo: 5, hi: 80, curve: 1.2, smooth: 300 } },
};
/** Verknüpfungen aus einer Vorlage bauen (gleiches Format wie gespeicherte Verknüpfungen) */
function autoLinks(preset) {
    const p = PRESETS[preset] || PRESETS.normal;
    return p.types.map(type => Object.assign({ type, include: [], exclude: [], src: Object.assign({}, p.src), value: 100, param: '', mut: [] }, normLink(p.o)));
}

/**
 * Erkannte Zonen des aktuellen Avatars: aus den Live-Werten (zones) und der Parameter-Liste des Avatars (names).
 * → [{ id, type, name, sys, others, self, live }] – others/self = aktueller Wert 0…100
 */
function sourceList(zones, names, now, fresh) {
    const map = new Map();
    const get = (type, name, sys) => { const id = type + ':' + name; if (!map.has(id)) map.set(id, { id, type, name, sys: sys || '', others: 0, self: 0, live: false }); const e = map.get(id); if (sys && !e.sys) e.sys = sys; return e; };
    for (const n of names || []) { const p = H.parse(n); if (p && p.kind && !p.meta) get(p.kind, p.id, p.sys); }
    for (const type of ZONE_TYPES) {
        for (const [name, z] of Object.entries((zones || {})[type] || {})) {
            const e = get(type, name, z.sys);
            for (const [k, x] of Object.entries(z)) {
                if (!x || typeof x !== 'object' || x.at < fresh) continue;
                const v = Math.round(clamp(x.v) * 100);
                if (OTHERS.includes(k)) e.others = Math.max(e.others, v);
                else if (SELF.includes(k)) e.self = Math.max(e.self, v);
                e.live = true;
            }
        }
    }
    const order = { plugs: 0, sockets: 1, touch: 2 };
    return [...map.values()].sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name)).slice(0, 60);
}

/** Zuordnung als Text teilen: „NXTL1.“ + base64url(JSON) – enthält nur Einstellungen, keine Werte */
const CODE = 'NXTL1.';
function exportCode(links, dev) { return CODE + Buffer.from(JSON.stringify({ v: 1, links: links || {}, dev: dev || {} }), 'utf8').toString('base64url'); }
function importCode(code) {
    code = String(code || '').trim();
    if (!code.startsWith(CODE) || code.length > 20000) return null;
    try { const o = JSON.parse(Buffer.from(code.slice(CODE.length), 'base64url').toString('utf8')); return o && typeof o === 'object' && o.v === 1 ? o : null; } catch (e) { return null; }
}

module.exports = { LINK_DEF, MODES, PRESETS, ZONE_TYPES, OTHERS, SELF, normLink, motionLevel, pickMode, shape, smoothStep, strongest, linPlan, autoLinks, sourceList, exportCode, importCode, isDepthKey, clamp };
