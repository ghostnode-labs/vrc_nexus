'use strict';
/*
 * 3.6 Plugin-Paket „.nxp“ (Nexus Plugin): ein gewöhnliches ZIP-Archiv mit plugin.json im Wurzelordner.
 * Eigenes, kleines ZIP-Lesen/-Schreiben (nur „stored“ und „deflate“) – ohne zusätzliche Abhängigkeit.
 * Strenge Grenzen gegen kaputte oder bösartige Pakete: Anzahl, Größe, Pfade (kein „..“, keine absoluten Pfade, keine Links).
 */
const zlib = require('zlib');
const { UserError } = require('./util');

const LIMITS_DEF = { files: 200, total: 8 * 1024 * 1024, file: 3 * 1024 * 1024, packed: 6 * 1024 * 1024 };
const LIMITS = LIMITS_DEF;

const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }

/** sicherer, relativer Pfad im Paket (oder null) */
function cleanName(n) {
    n = String(n || '');
    if (!n || n.length > 200 || /[\\\0:*?"<>|]/.test(n) || n.startsWith('/')) return null;
    const parts = n.split('/');
    if (parts.some(p => p === '..' || p === '.')) return null;
    if (parts.some((p, i) => p === '' && i !== parts.length - 1)) return null;   // „a//b“
    return n;
}

/** ZIP-Puffer → { 'pfad': Buffer } (Ordner-Einträge entfallen)
 *  8.0.19: opts.limits (eigene Grenzen) und opts.only (Filter: nur diese Pfade entpacken, z. B. adb aus den Platform-Tools) */
function readZip(buf, opts = {}) {
    const LIMITS = Object.assign({}, LIMITS_DEF, opts.limits || {}), only = opts.only || null;
    if (!Buffer.isBuffer(buf) || buf.length < 22) throw new UserError('Das ist kein gültiges Plugin-Paket (.nxp).');
    if (buf.length > LIMITS.packed) throw new UserError('Das Paket ist zu groß (höchstens ' + Math.round(LIMITS.packed / 1048576) + ' MB).');
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new UserError('Das ist kein gültiges Plugin-Paket (.nxp).');
    const count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
    if (count > LIMITS.files) throw new UserError('Zu viele Dateien im Plugin (höchstens ' + LIMITS.files + ').');
    const out = {};
    let p = cdOff, total = 0;
    for (let i = 0; i < count; i++) {
        if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new UserError('Plugin-Paket ist beschädigt.');
        const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16);
        const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
        const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
        const attr = buf.readUInt32LE(p + 38), lho = buf.readUInt32LE(p + 42);
        const rawName = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
        p += 46 + nlen + elen + clen;
        if (rawName.endsWith('/')) continue;                                  // Ordner
        if (only && !only(rawName)) continue;
        const name = cleanName(rawName);
        if (!name) throw new UserError('Unerlaubter Dateipfad im Plugin: ' + rawName.slice(0, 80));
        if (flags & 1) throw new UserError('Verschlüsselte Plugin-Pakete werden nicht unterstützt.');
        if (((attr >>> 16) & 0o170000) === 0o120000) throw new UserError('Verknüpfungen (Links) sind im Plugin nicht erlaubt.');
        if (usize > LIMITS.file) throw new UserError('Datei zu groß im Plugin: ' + name);
        total += usize;
        if (total > LIMITS.total) throw new UserError('Das Plugin ist entpackt zu groß (höchstens 8 MB).');
        if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x04034b50) throw new UserError('Plugin-Paket ist beschädigt.');
        const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
        const data = buf.subarray(start, start + csize);
        if (data.length !== csize) throw new UserError('Plugin-Paket ist beschädigt.');
        let raw;
        if (method === 0) raw = Buffer.from(data);
        else if (method === 8) { try { raw = zlib.inflateRawSync(data, { maxOutputLength: LIMITS.file }); } catch (e) { throw new UserError('Plugin-Paket ist beschädigt (' + name + ').'); } }
        else throw new UserError('Unbekannte Kompression im Plugin (' + name + ').');
        if (raw.length !== usize || crc32(raw) !== crc) throw new UserError('Prüfsumme stimmt nicht (' + name + ').');
        if (out[name]) throw new UserError('Doppelte Datei im Plugin: ' + name);
        out[name] = raw;
    }
    return out;
}

/** { 'pfad': Buffer|string } → ZIP-Puffer (deflate) – für das Beispiel-Plugin und Entwickler */
function writeZip(files) {
    const locals = [], central = [];
    let off = 0;
    for (const [name, content] of Object.entries(files)) {
        const raw = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
        const comp = zlib.deflateRawSync(raw), nb = Buffer.from(name, 'utf8'), crc = crc32(raw);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
        lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
        ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
        locals.push(lh, nb, comp); central.push(ch, nb);
        off += 30 + nb.length + comp.length;
    }
    const cd = Buffer.concat(central), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
    return Buffer.concat([...locals, cd, end]);
}

module.exports = { readZip, writeZip, cleanName, crc32, LIMITS };
