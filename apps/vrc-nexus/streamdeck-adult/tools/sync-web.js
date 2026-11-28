'use strict';
/*
 * „VRC Nexus 🔞“ (zweites Stream-Deck-Plugin) – NUR für die Webseite, nie im App-Release.
 * Die Quelle liegt hier (apps/vrc-nexus/streamdeck-adult, getestet mit npm test gegen die echte lokale Schnittstelle);
 * weder electron-builder (build.files / extraResources) noch der Workflow (nur streamdeck/tools/pack.js) nehmen diesen Ordner mit.
 *
 *   node streamdeck-adult/tools/sync-web.js [<Pfad zur Webseiten-Arbeitskopie ghostenode>]
 *     → kopiert den .sdPlugin-Ordner nach <web>/clients/streamdeck-adult/ (Quelle für den Download, per .htaccess gesperrt)
 *       und legt das fertige Paket VRC-Nexus-18.streamDeckPlugin daneben (Rückfall, falls der Server kein ZIP bauen kann).
 *   Ohne Pfad: Umgebungsvariable GHOSTENODE_DIR, sonst ../ghostenode neben dem App-Repo.
 */
const fs = require('fs');
const path = require('path');
const { zipDir } = require('../../streamdeck/tools/pack.js');

const ROOT = path.join(__dirname, '..');
const DIR = 'de.ghostnode.vrcnexus.adult.sdPlugin';
const FILE = 'VRC-Nexus-18.streamDeckPlugin';

/** Paket bauen → { buf, count, version } */
function pack() {
    const { buf, count } = zipDir(ROOT, DIR);
    const version = JSON.parse(fs.readFileSync(path.join(ROOT, DIR, 'manifest.json'), 'utf8')).Version;
    return { buf, count, version };
}

function sync(web) {
    if (!fs.existsSync(path.join(web, 'nexus.php'))) throw new Error('Keine Webseiten-Arbeitskopie: ' + web);
    const dest = path.join(web, 'clients', 'streamdeck-adult');
    fs.mkdirSync(dest, { recursive: true });
    fs.rmSync(path.join(dest, DIR), { recursive: true, force: true });
    fs.cpSync(path.join(ROOT, DIR), path.join(dest, DIR), { recursive: true });
    fs.writeFileSync(path.join(dest, '.htaccess'), '# Quelle des 🔞-Plugins: nie direkt abrufbar – Download nur über nexusdeck.php (angemeldet, Verified 18+, NSFW an)\nRequire all denied\nDeny from all\n');
    const { buf, count, version } = pack();
    fs.writeFileSync(path.join(dest, FILE), buf);
    fs.writeFileSync(path.join(dest, 'version.json'), JSON.stringify({ version, files: count }) + '\n');
    return { dest, count, version, size: buf.length };
}

if (require.main === module) {
    const web = path.resolve(process.argv[2] || process.env.GHOSTENODE_DIR || path.join(ROOT, '..', '..', '..', '..', 'ghostenode'));
    const r = sync(web);
    console.log('✔ ' + FILE + ' ' + r.version + ' (' + r.count + ' Dateien, ' + Math.round(r.size / 1024) + ' KB) → ' + r.dest);
}
module.exports = { pack, sync, DIR, FILE };
