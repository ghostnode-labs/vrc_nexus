#!/usr/bin/env node
// Prüft GhostNode-VIP-Board.unitypackage: gültiges gzip-tar, jede GUID hat asset/asset.meta/pathname, Meta-GUID passt,
// Pfade unter Assets/GhostNode/, Inhalt = Quelldateien, Paket reproduzierbar – plus einfache UdonSharp-Regeln für das Laufzeit-Skript.
//   node apps/unity-tools/tools/test-unitypackage.js [paket.unitypackage]
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');
const { build, FILES } = require('./pack-unitypackage.js');

let n = 0, fails = 0;
function t(name, fn) { n++; try { fn(); console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ' – ' + e.message); } }

function untar(buf) {
  const out = [];
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = h.toString('utf8', 0, 100).replace(/\0.*$/s, '');
    const size = parseInt(h.toString('ascii', 124, 136).replace(/\0.*$/s, '').trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    const stored = parseInt(h.toString('ascii', 148, 156).replace(/[\0 ].*$/s, ''), 8);
    if (sum !== stored) throw new Error('Prüfsumme falsch bei ' + name);
    if (h.toString('ascii', 257, 262) !== 'ustar') throw new Error('kein ustar-Kopf bei ' + name);
    out.push({ name, type, data: buf.subarray(off + 512, off + 512 + size) });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

const file = process.argv[2];
const pkg = file ? fs.readFileSync(file) : build();
let entries = [];
t('gzip + tar lesbar', () => { entries = untar(zlib.gunzipSync(pkg)); assert.ok(entries.length > 0); });
const byGuid = {};
for (const e of entries) {
  const [guid, part] = e.name.split('/');
  byGuid[guid] = byGuid[guid] || {};
  if (part) byGuid[guid][part] = e.data;
}
t('jede GUID ist 32-stellig hex und hat asset, asset.meta, pathname', () => {
  assert.strictEqual(Object.keys(byGuid).length, FILES.length);
  for (const [g, p] of Object.entries(byGuid)) {
    assert.match(g, /^[0-9a-f]{32}$/);
    for (const k of ['asset', 'asset.meta', 'pathname']) assert.ok(p[k], g + ' ohne ' + k);
    assert.deepStrictEqual(Object.keys(p).sort(), ['asset', 'asset.meta', 'pathname']);
  }
});
t('Meta-Dateien tragen dieselbe GUID und einen passenden Importer', () => {
  for (const [g, p] of Object.entries(byGuid)) {
    const m = p['asset.meta'].toString('utf8');
    assert.match(m, /^fileFormatVersion: 2\n/);
    assert.ok(m.includes('\nguid: ' + g + '\n'), 'GUID in ' + g);
    const pn = p.pathname.toString('utf8');
    assert.ok(pn.endsWith('.cs') ? m.includes('MonoImporter:') : m.includes('TextScriptImporter:'), 'Importer für ' + pn);
  }
});
t('alle Pfade unter Assets/GhostNode/VipBoard/, keine doppelten, Editor-Skript in einem Editor-Ordner', () => {
  const paths = Object.values(byGuid).map((p) => p.pathname.toString('utf8'));
  assert.strictEqual(new Set(paths).size, paths.length);
  for (const p of paths) { assert.match(p, /^Assets\/GhostNode\/VipBoard\/[A-Za-z0-9_./-]+$/); assert.ok(!p.includes('..') && !p.includes('\n')); }
  assert.ok(paths.includes('Assets/GhostNode/VipBoard/Editor/NexusVipBoardBuilder.cs'));
  assert.ok(paths.includes('Assets/GhostNode/VipBoard/NexusVipBoard.cs'));
});
t('Inhalt entspricht den Quelldateien', () => {
  for (const f of FILES) {
    const p = byGuid[f.guid];
    assert.ok(p, f.src);
    assert.ok(p.asset.equals(fs.readFileSync(path.join(__dirname, '..', f.src))), f.src);
    assert.strictEqual(p.pathname.toString('utf8'), f.dst);
  }
});
t('kein Prefab/Asset mit fremden GUIDs im Paket (Prefab baut das Editor-Skript)', () => {
  for (const p of Object.values(byGuid)) assert.ok(!/\.(prefab|asset|unity|mat)$/.test(p.pathname.toString('utf8')));
});
if (!file) t('reproduzierbar: zweimal gebaut = gleiche Bytes', () => assert.ok(build().equals(pkg)));

// ---- UdonSharp-Regeln (das Laufzeit-Skript läuft in Udon: keine Generics, LINQ, Lambdas, Ausnahmen, List<T>) ----
const src = fs.readFileSync(path.join(__dirname, '..', 'World', 'NexusVipBoard.cs'), 'utf8');
const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/.*$/, '').replace(/"(?:[^"\\]|\\.)*"/g, '""')).join('\n');
t('Laufzeit-Skript: nur Udon-taugliche Sprachmittel', () => {
  assert.ok(src.includes('#if UDONSHARP') && src.trim().endsWith('#endif'));
  for (const [re, what] of [[/\bList\s*</, 'List<T>'], [/System\.Linq|\.Select\(|\.Where\(/, 'LINQ'], [/=>/, 'Lambda/=>'], [/\btry\b|\bcatch\b|\bthrow\b/, 'Ausnahmen'],
    [/\byield\b|\basync\b|\bawait\b/, 'yield/async'], [/\w<\w+>\s*\(/, 'generische Aufrufe'], [/\bDictionary\b|\bHashSet\b/, 'Collections'], [/\$"/, 'interpolierte Strings'],
    [/\bstatic\s+\w+\s+\w+\s*;/, 'statische Felder'], [/\bnew\s+VRCUrl\s*\(/, 'VRCUrl zur Laufzeit']]) {
    assert.ok(!re.test(code), what + ' gefunden');
  }
  assert.ok(/VRCStringDownloader\.LoadUrl\(urls\[_urlIndex\], \(IUdonEventReceiver\)this\)/.test(src), 'LoadUrl mit Inspector-URL');
  assert.ok(/public override void OnStringLoadSuccess\(IVRCStringDownload result\)/.test(src) && /public override void OnStringLoadError\(IVRCStringDownload result\)/.test(src));
  assert.ok(/Mathf\.Max\(60f, reloadMinutes \* 60f\)/.test(src), 'Neuladen frühestens nach 60 s');
});
t('Editor-Skript: nur im Editor, offizielle UdonSharp-API, Prefab-Pfad', () => {
  const ed = fs.readFileSync(path.join(__dirname, '..', 'World', 'Editor', 'NexusVipBoardBuilder.cs'), 'utf8');
  assert.ok(ed.includes('#if UNITY_EDITOR && UDONSHARP'));
  assert.ok(ed.includes('UdonSharpUndo.AddComponent<NexusVipBoard>') && ed.includes('PrefabUtility.SaveAsPrefabAsset') && ed.includes('Assets/GhostNode/VipBoard/VipBoard.prefab'));
  assert.ok(ed.includes('[MenuItem("Tools/GhostNode/VIP-Tafel erstellen"') && ed.includes('[MenuItem("Tools/GhostNode/VIP-Tafel in Szene einfügen"'));
});

console.log(fails ? '\n✖ ' + fails + ' von ' + n + ' fehlgeschlagen' : '\n✔ ' + n + ' Tests bestanden');
process.exit(fails ? 1 : 0);
