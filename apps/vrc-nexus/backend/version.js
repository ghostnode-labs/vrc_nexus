'use strict';
/*
 * Versionsnummern – zwei Schemata:
 *   • bis 9.x: Major.Minor.Patch (je Stelle 0–99), z. B. 8.0.1
 *   • ab „10“ (Entscheidung 27.11.2026): Datum + Nummer des Tages, angezeigt als v2026.11.27.1 (Jahr.Monat.Tag.Nummer)
 *     Intern (package.json, Tags, Dateinamen): 2026.1127.1 = Jahr.MonatTag.Nummer
 *     – Windows erlaubt je Teil der Datei-Version höchstens 65535, deshalb nicht 20261127 am Stück;
 *     – MonatTag ohne führende Null (5. Januar = 105), damit es gültiges SemVer bleibt und richtig sortiert.
 *   Android-versionCode: alt a*10000+b*100+c (≤ 999999), neu (Jahr-2000)*1000000 + MonatTag*100 + Nummer – immer größer als alt.
 */
const OLD = /^(0|[1-9]\d?)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/;
const NEW = /^(20\d\d)\.([1-9]\d{2,3})\.([1-9]\d?)$/;

function parts(v) { return String(v || '').replace(/^vrc-nexus-/, '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0); }
/** Datums-Version? (prüft auch, ob das Datum existiert) */
function isDate(v) {
    const m = NEW.exec(String(v || '')); if (!m) return false;
    const y = +m[1], md = +m[2], mo = Math.floor(md / 100), d = md % 100;
    if (mo < 1 || mo > 12 || d < 1) return false;
    return d <= new Date(y, mo, 0).getDate();
}
function valid(v) { return OLD.test(String(v || '')) && parts(v)[0] <= 9 || isDate(v); }
/** Anzeige: alt unverändert, neu als v2026.11.27.1 */
function display(v) {
    const s = String(v || '').replace(/^vrc-nexus-/, '').replace(/^v/, '');
    if (!isDate(s)) return s;
    const [y, md, n] = parts(s);
    return 'v' + y + '.' + String(Math.floor(md / 100)).padStart(2, '0') + '.' + String(md % 100).padStart(2, '0') + '.' + n;
}
/** Eingabe in jeder Schreibweise → intern („v2026.11.27.1“ oder „v20261127.1“ → „2026.1127.1“) */
function norm(v) {
    const s = String(v || '').trim().replace(/^vrc-nexus-/, '').replace(/^v/, '');
    const m = /^(20\d\d)\.?(\d\d)\.?(\d\d)\.([1-9]\d?)$/.exec(s);
    return m ? m[1] + '.' + (+m[2] * 100 + +m[3]) + '.' + +m[4] : s;
}
/** a neuer als b? (beide Schemata gemischt; neu ist immer neuer als alt) */
function newer(a, b) {
    const pa = parts(norm(a)), pb = parts(norm(b));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
}
function cmp(a, b) { return newer(a, b) ? 1 : newer(b, a) ? -1 : 0; }
/** Android-versionCode */
function code(v) {
    const [a, b, c] = parts(norm(v));
    return a >= 2000 ? (a - 2000) * 1000000 + b * 100 + c : a * 10000 + b * 100 + c;
}
/** nächste Datums-Version für einen Tag (Nummer zählt hoch, wenn heute schon veröffentlicht wurde) */
function nextDate(current, date = new Date()) {
    const y = date.getFullYear(), md = (date.getMonth() + 1) * 100 + date.getDate();
    const [a, b, c] = parts(norm(current));
    const n = a === y && b === md ? c + 1 : 1;
    if (n > 99) throw new Error('Höchstens 99 Veröffentlichungen pro Tag.');
    return y + '.' + md + '.' + n;
}
module.exports = { valid, isDate, display, norm, newer, cmp, code, nextDate };
