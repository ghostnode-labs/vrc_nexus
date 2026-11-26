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
                // gezielt den Dienst prüfen (eine Domain-Standardseite reicht nicht): nexus.php darf nicht 404 sein, die Weiterleitung muss /health beantworten
                const r = await fetchFn(trim(l[i]) + (kind === 'hyperate' ? '/health' : '/nexus.php'), { method: 'GET', signal: AbortSignal.timeout(5000) });
                if (kind === 'hyperate' ? r.status === 200 : r.status !== 404 && r.status < 500 && r.status !== 0) { active[kind] = i; break; }
            } catch (e) { /* nächste probieren */ }
        }   // keine erreichbar: bisherige Wahl bleiben lassen
    }
    return { nexus: nexus(), hyperate: hyperate() };
}

module.exports = { LISTS, url, nexus, hyperate, check, _active: active };
