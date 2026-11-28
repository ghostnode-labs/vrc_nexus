#!/usr/bin/env node
// Baut GhostNode-VIP-Board.unitypackage ohne Unity und ohne Abhängigkeiten (nur Node-Bordmittel).
// Format: gzip-komprimiertes tar; je Asset ein Ordner <guid>/ mit „asset“ (Inhalt), „asset.meta“ (Unity-Meta mit derselben GUID)
// und „pathname“ (Zielpfad im Projekt). Die GUIDs sind fest (einmal zufällig erzeugt), damit ein erneuter Import die Dateien
// ersetzt statt sie zu verdoppeln. Feste Zeitstempel → gleiche Eingabe = byte-gleiches Paket.
//   node apps/unity-tools/tools/pack-unitypackage.js [ausgabe.unitypackage]
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const TARGET = 'Assets/GhostNode/VipBoard';
const NAME = 'GhostNode-VIP-Board.unitypackage';
// Quelle (relativ zu apps/unity-tools) → Ziel im Unity-Projekt, feste GUID, Importer
const FILES = [
  { src: 'World/NexusVipBoard.cs', dst: TARGET + '/NexusVipBoard.cs', guid: '8653369f52614cd5a1d1a4a4e2b6d3f0', importer: 'mono' },
  { src: 'World/Editor/NexusVipBoardBuilder.cs', dst: TARGET + '/Editor/NexusVipBoardBuilder.cs', guid: '84db6b65af4048b08b31a43e77f150b6', importer: 'mono' },
  { src: 'World/VipBoard-README.md', dst: TARGET + '/README.md', guid: '4dbeba300c69474e880ac0f22bd54ac1', importer: 'text' },
  { src: 'World/vip-example.txt', dst: TARGET + '/vip-example.txt', guid: 'f6d9b194c9604f3f8678ee5a4731a4aa', importer: 'text' },
];
const MTIME = Date.UTC(2026, 10, 28) / 1000;

function meta(guid, importer) {
  const head = 'fileFormatVersion: 2\nguid: ' + guid + '\n';
  if (importer === 'mono') {
    return head + 'MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n'
      + '  icon: {instanceID: 0}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n';
  }
  return head + 'TextScriptImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n';
}

/** ustar-Kopf (512 Byte) */
function header(name, size, type) {
  const h = Buffer.alloc(512, 0);
  if (Buffer.byteLength(name) > 100) throw new Error('Pfad zu lang für tar: ' + name);
  h.write(name, 0, 100, 'utf8');
  h.write(type === '5' ? '0000755\0' : '0000644\0', 100, 8, 'ascii');
  h.write('0000000\0', 108, 8, 'ascii');
  h.write('0000000\0', 116, 8, 'ascii');
  h.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
  h.write(Math.floor(MTIME).toString(8).padStart(11, '0') + '\0', 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii');
  h.write(type, 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

function tar(entries) {
  const parts = [];
  for (const e of entries) {
    if (e.dir) { parts.push(header(e.name, 0, '5')); continue; }
    parts.push(header(e.name, e.data.length, '0'), e.data);
    const pad = (512 - (e.data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

function build() {
  const entries = [];
  for (const f of FILES) {
    const data = fs.readFileSync(path.join(ROOT, f.src));
    entries.push({ name: f.guid + '/', dir: true });
    entries.push({ name: f.guid + '/asset', data });
    entries.push({ name: f.guid + '/asset.meta', data: Buffer.from(meta(f.guid, f.importer), 'utf8') });
    entries.push({ name: f.guid + '/pathname', data: Buffer.from(f.dst, 'utf8') });
  }
  return zlib.gzipSync(tar(entries), { level: 9 });
}

module.exports = { build, FILES, TARGET, NAME };

if (require.main === module) {
  const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist', NAME));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const buf = build();
  fs.writeFileSync(out, buf);
  console.log('geschrieben: ' + out + ' (' + buf.length + ' Byte, ' + FILES.length + ' Dateien)');
}
