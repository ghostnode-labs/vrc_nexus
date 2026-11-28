# Update: Nexus-Privat-Chat mit der offiziellen Signal-Bibliothek (libsignal) + AGPL-3.0

Arbeitsnotiz für den Koordinator. Version **nicht** angehoben, README-„New in“/Changelog **nicht** geschrieben.

## Was gebaut wurde (DE, kurz)

- **Lizenz:** VRC Nexus steht jetzt unter **AGPL-3.0-only**.
  - `LICENSE` (Repo-Wurzel): vollständiger, unveränderter AGPL-3.0-Text, übernommen aus dem npm-Paket `@signalapp/types@0.3.0`
    (gnu.org war vom Container aus nicht erreichbar). SHA-256 `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`
    (= Prüfsumme der offiziellen `agpl-3.0.txt`).
  - `"license": "AGPL-3.0-only"` in `apps/vrc-nexus/package.json` und `apps/vrc-nexus-android/package.json`, in beiden Lock-Dateien nur das Feld.
  - README (Wurzel): Abschnitte „Credits“ und „License“; `apps/vrc-nexus/README.md`: Abschnitt „License“ am Ende.
  - App → Mehr → Über: neuer Abschnitt **Credits** (xXLoonaXx – Idee, Design & Projektleitung (GhostNode Labs); Claude (Anthropic) – Entwicklung & Programmierung;
    Signal Foundation – libsignal (AGPL-3.0)), libsignal unter „Danke an“, Abschnitt **Lizenz & Quellcode** mit Link zum Repo,
    zum Quellcode genau dieser Version (Tag `vrc-nexus-v<version>`) und zum Lizenztext (AGPL § 13 – gilt auch für die Handy-App, gleiche Über-Seite).
- **libsignal (Desktop):** `@signalapp/libsignal-client` **0.108.7** (`--save-exact`, neueste stabile Version vom 24.11.2026).
  - Neues Modul `apps/vrc-nexus/backend/signal.js`: Stores für Identität, Sitzungen, Pre-Keys, signierte Pre-Keys und **Kyber-Pre-Keys (PQXDH)**
    (Einmal-Kyber + Last-Resort-Kyber mit Wiederholungsschutz über `markKyberPreKeyUsed`). Alles verschlüsselt in der App-DB über denselben
    Speicher wie `e2ee.js` (`chat.get/put` → safeStorage), Schlüssel `chat_sig:<konto>` (Schlüssel) und `chat_sigsess:<konto>` (Sitzungen, gemerkte Identitäten).
  - Paket ist ein ES-Modul → wird per `import()` geladen (läuft in CommonJS, Electron und Node gleich); schlägt das Laden fehl, bleibt der Chat bei nexus-v1.
  - Die libsignal-Identität jedes Geräts ist an die bisherige Nexus-Geräte-Identität gebunden (Ed25519-Signatur über `nexus-signal-v1`‖Identität).
    Gegenseite und Server prüfen die Bindung → die bisherige Verifizierung („Stimmt überein“, Schlüsselwechsel-Warnung) bleibt gültig.
  - electron-builder: `"asarUnpack": ["**/*.node"]` ergänzt. Prebuilds geprüft (Node-API): win32-x64/arm64, darwin-x64/arm64, linux-x64/arm64
    – je Plattform als optionales Unterpaket (`@signalapp/libsignal-client-win32|darwin|linux`), alle drei stehen in `package-lock.json`,
    `npm ci` auf dem jeweiligen CI-Runner holt das passende.
- **Protokoll-Aushandlung:** Jedes Gerät veröffentlicht `protos` (`nexus-v1`, ggf. `signal-v1`).
  - Senden je Gerät der Gegenseite: bestehende Signal-Sitzung → signal-v1; bestehende Nexus-Sitzung → nexus-v1 (bleibt!); neue Sitzung → signal-v1,
    wenn beide Geräte es können (eigenes Gerät vom Server bestätigt, Gegenseite mit gültiger Bindung), sonst nexus-v1.
  - Umschlag signal-v1: `{p:"signal-v1", t:3|2, m:<base64>}` (PreKeySignalMessage/SignalMessage); nexus-v1 unverändert `{h,c,pre?}`.
  - Gruppen (Sender-Schlüssel), Sprachanruf-Signalisierung, Abgleich mit eigenen Geräten laufen über dieselben 1:1-Sitzungen → automatisch mit.
  - Server ohne Update → Client merkt das (`sigProtos = 0`), versucht es alle 6 h erneut, bis dahin nur nexus-v1.
  - **Android:** `build.mjs` leitet `@signalapp/libsignal-client` auf `src/shims/nolibsignal.js` um (wirft beim Laden) → nur nexus-v1. `node build.mjs` läuft.
- **Sicherheitsnummer:** Chat → 🔐 zeigt jetzt die **Signal-Sicherheitsnummer** (libsignal `Fingerprint`, Version 2, 5200 Iterationen, 60 Ziffern)
  je Gerätepaar „dieses Gerät ↔ Gerät xyz“, darunter wie bisher die Nexus-Nummer über alle Geräte und je Gerät das verwendete Protokoll.
  „Stimmt überein“ markiert wie bisher den ganzen Schlüsselsatz der Person (libsignal-Identitäten sind daran gebunden).
- **Server (Webseite, Repo ghostenode):** `nexuschat.php` + Migration 21 (`inc/modules/vrchat.php`), Admin-Entfernen (`inc/admin/nexus_tabs.php`), Test.

## English changelog text (for README „### New in …“)

- **Private chat now uses the official Signal library (libsignal)** on desktop: new conversations between two desktop devices are set up with
  PQXDH (post-quantum, Kyber) and the Signal Double Ratchet from `@signalapp/libsignal-client`. Devices announce which protocols they support;
  phones and older versions keep using the existing Nexus protocol, existing conversations and history stay readable and keep working.
- **Signal safety number** in the chat (🔐): compare the libsignal fingerprint for each device pair; the all-devices number stays.
- **VRC Nexus is now free software under the GNU AGPL v3.0** (`AGPL-3.0-only`). *More → About* links to the source code of the installed version
  and shows the new **Credits** section.

NSFW-Text: keiner (nichts 🔞-Bezogenes geändert).

## Pakete (neu, Desktop-Laufzeit)

| Paket | Version | Herausgeber | Lizenz |
|---|---|---|---|
| `@signalapp/libsignal-client` (+ `-win32`/`-darwin`/`-linux`, optional) | 0.108.7 (exakt) | Signal Messenger / Signal Foundation | AGPL-3.0-only |
| transitive: `@signalapp/types` 0.3.0 | | Signal | AGPL-3.0-only |
| transitive: `zod`, `type-fest`, `tagged-tag`, `node-gyp-build`, `buffer`, `base64-js`, `ieee754`, `semver`, `uuid` | laut Lock | bekannte Herausgeber (colinhacks, sindresorhus, prebuild, feross, npm, uuidjs) | MIT / ISC / BSD |

Größe: Linux-Prebuilds ≈ 43 MB entpackt (beide Architekturen), win32-Paket ≈ 21 MB gepackt → Windows-Installer wird spürbar größer
(es landen x64 **und** arm64 im Paket; optional später per electron-builder-`files`-Filter die fremde Architektur ausschließen).

Android: keine Bibliothek gefunden, die mit libsignal 0.108 kompatibel wäre – Signal veröffentlicht keine WebAssembly/JS-Fassung,
und inoffizielle JS-Portierungen (z. B. `@privacyresearch/libsignal-protocol-typescript`) können weder PQXDH/Kyber noch SPQR und sind nicht von Signal.
Darum bewusst nexus-v1 auf dem Handy (Aushandlung), statt etwas Unpassendes einzubauen.

## Lizenz-Prüfung im Repo (nur gemeldet, nichts gelöscht)

- `apps/woltlab-plugin/…/VrcNexusBBCode.class.php` (und `VrcNexusInfo.class.php`): eigener Code, aber im Kopf `@license GNU Lesser General Public License`
  (WoltLab-Konvention). LGPL ist mit AGPL verträglich; Besitzerin sollte entscheiden, ob das Plugin LGPL bleibt oder auf AGPL umgestellt wird.
- `apps/hyperate-relay/package.json` und `apps/nexus-live/package.json`: weiterhin `"license": "UNLICENSED"` (eigene Server-Dienste, nicht Teil von VRC Nexus –
  bewusst nicht angefasst; widerspricht aber einer AGPL-`LICENSE` in der Repo-Wurzel → am besten eigene Lizenzangabe/Ordner-LICENSE festlegen).
- `apps/vrc-nexus/renderer/img/patreon-banner.jpg`: enthält vermutlich Patreon-Markenzeichen → Markenrecht (nicht Urheberlizenz), bitte prüfen.
- `openvr_api.dll`/`openvr_api.cs` (Valve, BSD-3-Clause) kommen erst beim Bauen aus dem OpenVR-Repo – verträglich, nicht im Repo.
- Stream-Deck-Icons, Hintergrund-SVGs, Uhr-Ressourcen, Android-Icons: keine fremden Lizenzhinweise gefunden (scheinen selbst erstellt).
- Keine kopierten Fremd-Quelltexte mit unverträglicher Lizenz gefunden (Suche nach Copyright/SPDX/@license außerhalb von `node_modules`).

## Server-Migration (ghostenode)

- `vrc_migrate` Version **21**: `chat_devices` + Spalten `protos`, `reg_id`, `sig_ik`, `sig_bind`, `sig_spk` (JSON), `sig_kyber` (JSON, Last-Resort);
  neue Tabellen `chat_sig_opks` und `chat_kyber_keys`. Läuft automatisch beim ersten Zugriff (SQLite und MySQL, über das bestehende Migrationssystem).
- `publish` nimmt optional `protos` + `sig` an (Bindung per sodium geprüft, Größen geprüft; fehlerhafter signal-v1-Teil → `sig_error`, Gerät bleibt mit nexus-v1 angemeldet).
  `devices` liefert `protos` (+ `sig_ik`, `sig_bind`, `reg`), `bundles` mit `sig=1` liefert `sig`-Paket und verbraucht dann nur libsignal-Einmal-Schlüssel,
  `fetch` liefert `sig_opks`/`sig_kybers` zum Nachlegen. Alte Clients: Verhalten unverändert.
- Tests: `php tools/tests/nexuschat_test.php` (SQLite) und `php my.php tools/tests/nexuschat_test.php` (MariaDB) – je 21/21 grün; `site9_test.php` weiterhin 55/55 (beide DBs).
- Deploy-Reihenfolge egal (Client fällt ohne Server-Update auf nexus-v1 zurück), sinnvoll: erst Webseite pullen, dann App-Release.

## Tests (App)

- `cd apps/vrc-nexus && timeout 600 npm test` → **122/122** (neu: „8.3: Privat-Chat mit libsignal …“):
  zwei Desktop-Geräte über Mock-Briefkasten (Pre-Key-Nachricht mit Kyber, Antwort, Neustart mit gespeicherten Stores, außer der Reihe, Wiederholung verworfen,
  gleiche Signal-Sicherheitsnummer, Server sieht keinen Klartext), Android-artiges Gerät ohne libsignal → nexus-v1 in beide Richtungen,
  alte nexus-v1-Sitzung + Nachricht „unterwegs“ bleiben nach dem Update lesbar, bestehende Sitzungen bleiben nexus-v1, neues Gerät → signal-v1, falsche Bindung abgelehnt.
  Die bisherigen Chat-/Gruppen-Tests laufen gegen einen Briefkasten ohne Protokoll-Liste (= alter Server) und sind weiter grün.
- `cd apps/vrc-nexus-android && node build.mjs` läuft; libsignal-Umleitung geprüft (Laden liefert `null`).
- UI-Texte: `renderer/i18n/13.tsv` (16 neue Einträge, de/en/fr/ja, gegen alle `*.tsv` auf Duplikate geprüft), `node scripts/i18n-build.js` ausgeführt.

## Nur in CI / auf echten Geräten prüfbar

- Laden des nativen Moduls im **gepackten Electron** (asar + `app.asar.unpacked`, ESM-`import()` aus dem asar) auf Windows, macOS (x64/arm64) und Linux-AppImage.
  Signal Desktop nutzt dasselbe Paket mit Electron, Node-API ist ABI-stabil – trotzdem einmal im Release testen: Chat öffnen → 🔐 muss „Signal-Sicherheitsnummer“ zeigen.
- macOS: unsigniertes Build lädt die `.node`-Datei (Gatekeeper/Quarantäne) – prüfen.
- Echter Austausch Desktop ↔ Desktop ↔ Handy über die echte Webseite nach dem Server-Update.

## Offene Punkte

- Sitzungen, die schon mit nexus-v1 bestehen, bleiben dabei (so gewünscht). Wer sofort umsteigen will, bräuchte später eine Aktion „Sitzung erneuern“.
- Signal-Sicherheitsnummer gilt je Gerätepaar (jedes Nexus-Gerät hat eine eigene Identität, Signal selbst teilt eine Identität über verknüpfte Geräte).
- Windows-Paket enthält beide Architekturen der Prebuilds (Größe), siehe oben.
- Android/Web-Nexus bleiben bei nexus-v1, bis Signal eine Fassung für WebView/WASM anbietet.

## Geänderte Dateien

App (`vrc_nexus`): `LICENSE` (neu), `README.md`, `apps/vrc-nexus/README.md`, `apps/vrc-nexus/package.json`, `apps/vrc-nexus/package-lock.json`,
`apps/vrc-nexus/backend/signal.js` (neu), `apps/vrc-nexus/backend/chat.js`, `apps/vrc-nexus/backend/app.js` (about: Lizenz/Quellcode-Links),
`apps/vrc-nexus/renderer/js/nexus-about.js`, `apps/vrc-nexus/renderer/js/nexus-community.js`, `apps/vrc-nexus/renderer/i18n/13.tsv` (neu),
`apps/vrc-nexus/renderer/js/i18n-dict.js`, `apps/vrc-nexus/tests/backend.test.js`, `apps/vrc-nexus-android/build.mjs`,
`apps/vrc-nexus-android/src/shims/nolibsignal.js` (neu), `apps/vrc-nexus-android/package.json`, `apps/vrc-nexus-android/package-lock.json`, `docs/update-signal.md` (neu).

Webseite (`ghostenode`): `nexuschat.php`, `inc/modules/vrchat.php`, `inc/admin/nexus_tabs.php`, `tools/tests/nexuschat_test.php` (neu), `tools/tests/README.md`.
