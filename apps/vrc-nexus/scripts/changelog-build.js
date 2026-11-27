#!/usr/bin/env node
/* Baut backend/changelog.json aus den „### New in X.Y.Z …“-Abschnitten (ältere: „Neu in“) der README (für die Seite „Über VRC Nexus“)
 * und backend/changelog-nsfw.json aus backend/CHANGELOG-NSFW.md (🔞 nur in der App sichtbar, wenn freigeschaltet –
 * öffentlich steht dafür „🔞 ***“).
 * Aufruf: node scripts/changelog-build.js  (läuft auch im Test – meldet, wenn die Datei veraltet ist) */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const V = require('../backend/version');
function parse(file) {
    let md = [];
    try { md = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch (e) { return []; }
    const out = [];
    let cur = null;
    for (const line of md) {
        const m = /^### (?:Neu|New) in (v?20\d\d\.?\d\d\.?\d\d\.\d{1,2}|\d+\.\d+\.\d+)\s*(?:[–-]\s*(.*))?$/.exec(line);   // ab „10“: v2026.11.27.1
        if (m) { cur = { version: V.norm(m[1]), title: (m[2] || '').trim(), body: [] }; out.push(cur); continue; }
        if (cur && /^#{1,3} /.test(line)) cur = null;          // nächster Abschnitt, der kein Changelog ist
        if (cur) cur.body.push(line);
    }
    return out.map(e => Object.assign({ version: e.version, title: e.title, body: e.body.join('\n').trim() }, V.isDate(e.version) ? { label: V.display(e.version) } : {}));
}
const build = () => parse(path.join(root, 'README.md'));
const buildNsfw = () => parse(path.join(root, 'backend', 'CHANGELOG-NSFW.md'));
if (require.main === module) {
    const list = build(), ns = buildNsfw();
    fs.writeFileSync(path.join(root, 'backend', 'changelog.json'), JSON.stringify(list, null, 1) + '\n');
    fs.writeFileSync(path.join(root, 'backend', 'changelog-nsfw.json'), JSON.stringify(ns, null, 1) + '\n');
    console.log('✔ ' + list.length + ' Versionen → backend/changelog.json, ' + ns.length + ' → changelog-nsfw.json');
}
module.exports = { build, buildNsfw, parse };
