'use strict';
/*
 * 4.4: alle Server-Adressen an einer Stelle – Vorbereitung für den Umzug auf ghostnode-labs.dev.
 * Je Dienst eine Liste in Vorrang-Reihenfolge. check() prüft im Hintergrund, welche Adresse antwortet, und alle Module
 * nehmen dann diese. Umgebungsvariablen (NEXUS_RELAY_BASE …) haben weiter Vorrang (Tests, eigene Server).
 * Umzug: neue Adresse vorn eintragen, alte als Rückfall hinten lassen – erst nach dem Update aller Nutzer abschalten.
 */
const LISTS = {
    nexus: ['https://ghostnode-labs.dev', 'https://privat.sylvanclub.eu'],      // nexus.php, Konto, Chat, Community, Warnliste, Fernsteuerung, Marktplatz
    hyperate: ['https://hr.ghostnode-labs.dev', 'https://hr.sylvanclub.eu'],    // HypeRate-Weiterleitung (apps/hyperate-relay)
};
// bis check() eine neue Adresse bestätigt hat, gilt die bewährte (letzte) – so bricht nichts, solange der Umzug läuft
const active = { nexus: LISTS.nexus.length - 1, hyperate: LISTS.hyperate.length - 1 };
const trim = u => String(u).replace(/\/+$/, '');

/** aktuelle Adresse eines Dienstes */
function url(kind) { const l = LISTS[kind] || []; return trim(l[active[kind]] || l[0] || ''); }
const nexus = () => url('nexus');
const hyperate = () => url('hyperate');

/** im Hintergrund die erste erreichbare Adresse wählen (z. B. beim Start und alle 30 min) */
async function check(fetchFn = globalThis.fetch) {
    for (const kind of Object.keys(LISTS)) {
        const l = LISTS[kind];
        if (l.length < 2) continue;
        for (let i = 0; i < l.length; i++) {
            try {
                // gezielt den Dienst prüfen – eine Domain-Standardseite oder eine Website im Einrichtungsmodus (Umleitung auf admin.php) reicht nicht:
                // Website: signierter Marktplatz-Katalog als JSON; Weiterleitung: /health mit eigener Dienst-Kennung
                const r = await fetchFn(trim(l[i]) + (kind === 'hyperate' ? '/health' : '/market.php?api=index'), { method: 'GET', signal: AbortSignal.timeout(5000) });
                if (!r || r.status !== 200 || r.redirected) continue;
                const j = await r.json().catch(() => null);
                if (kind === 'hyperate' ? j && j.service === 'vrc-nexus-hyperate-relay' : j && typeof j.index === 'string' && typeof j.sig === 'string') { active[kind] = i; break; }
            } catch (e) { /* nächste probieren */ }
        }   // keine erreichbar: bisherige Wahl bleiben lassen
    }
    return { nexus: nexus(), hyperate: hyperate() };
}

/**
 * 8.0.18: Antwort einer GhostNode-Schnittstelle als JSON lesen. Ist sie keins (Plesk-Fehlerseite, leere 500er, Firewall,
 * Standardseite), gibt es eine verständliche Meldung mit Server und HTTP-Status statt nur „kein JSON“ – und die
 * Server-Wahl wird neu geprüft (vielleicht antwortet eine andere Adresse richtig).
 */
let recheckAt = 0;
async function readJson(r, file, fetchFn) {
    let text = '';
    if (typeof r.text === 'function') text = await r.text().catch(() => '');
    else if (typeof r.json === 'function') { try { const d = await r.json(); if (d && typeof d === 'object') return d; } catch (e) { /* unten */ } }
    try { const d = JSON.parse(text); if (d && typeof d === 'object') return d; } catch (e) { /* unten */ }
    // PHP-Hinweis (display_errors) vor dem JSON: das JSON dahinter nehmen
    const i = text.search(/\{"[a-z_]+":/);
    if (i > 0) { try { const d = JSON.parse(text.slice(i)); if (d && typeof d === 'object') return d; } catch (e) { /* unten */ } }
    let host = ''; try { host = new URL(r.url).host; } catch (e) { /* egal */ }
    const st = r.status, at = host ? ' (' + host + ', HTTP ' + st + ')' : ' (HTTP ' + st + ')';
    if ((fetchFn || !process.env.NEXUS_NO_SERVER_CHECK) && Date.now() - recheckAt > 60000) { recheckAt = Date.now(); check(fetchFn).catch(() => {}); }
    let error;
    if (st >= 500 || (!text.trim() && st >= 400)) error = 'Serverfehler auf der Webseite' + at + ' – bitte gleich noch einmal versuchen.';
    else if (st === 404) error = file + ' fehlt auf der Webseite' + at + '.';
    else if (st === 403 || st === 429 || st === 406) error = 'Die Webseite hat die Anfrage blockiert' + at + ' – Schutz/Firewall des Hosters? Bitte kurz warten.';
    else error = 'Antwort kein JSON' + at + ' – liegt ' + file + ' auf der Webseite?';
    return { error, _nonjson: true, _status: st };
}

module.exports = { LISTS, url, nexus, hyperate, check, readJson, _active: active };
