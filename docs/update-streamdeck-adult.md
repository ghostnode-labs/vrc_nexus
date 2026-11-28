# Update-Notiz: zweites Stream-Deck-Plugin „VRC Nexus 🔞“ + Neo-Infoleiste

Für den Koordinator. Version, README und Changelogs wurden **nicht** angefasst.

## Funktionen (DE, kurz)

**Plugin 2 „VRC Nexus 🔞“** (UUID `de.ghostnode.vrcnexus.adult`, eigene Kategorie „VRC Nexus 🔞“, eigene Symbole, gibt es nur auf der Webseite):
- 🚨 Panik (wie der Panik-Knopf: Spielzeug aus, 18+ aus) · ⏹ Spielzeug stopp · 🛑 Safeword · 🚦 Ampel (umschalten oder fest Grün/Gelb/Rot, Farbe auf der Taste) – **gehen immer**, auch gesperrt (Ampel: nur Rot).
- Stärke: Taste „setzen“ oder „+/− Schritt“; Stream Deck +: Drehregler (drehen = Stärke, drücken/antippen = Stopp).
- Muster starten (Auswahl im Property Inspector inkl. eigener und Labor-Muster aus Zeitleiste/Mixer; nochmal drücken = stoppen), Überraschung, Ausklingen.
- Privat-Modus an/aus/umschalten, Avatar-Steuerung „folgt meinem Avatar“ an/aus (alle oder ein Gerät), Szene starten/beenden (gespeicherte Szene oder einfache Szene mit Minuten).
- Live-Anzeige: Lust-Meter, aktuelle Stärke oder beides auf der Taste.
- Stream Deck Neo: Infoleiste mit Stärke-Balken, Ampel-Punkt, Lust-Meter/Szene/Privat.
- Diskret (global im Plugin): neutrale Wörter (Notaus, Stufe, Meter, Modus, Ablauf …) statt 🔞-Begriffen; Symbole sind ohnehin neutral.
- Gesperrt (18+ aus, Recht nicht erlaubt, Schlüssel ohne Stufe „Alles“): Tasten zeigen „🔒 gesperrt“, die App liefert dann keinerlei 🔞-Daten.

**App (Backend):**
- Gleicher Weg und **gleicher Schlüssel** wie Plugin 1 (lokale Schnittstelle, `X-Nexus-Token`); eigene Endpunkte `GET /api/adult/state`, `POST /api/adult` (`backend/sdadult.js`). Kein zweiter Kopplungsprozess – im Plugin denselben Port + Schlüssel eintragen (Stream-Deck-Globaleinstellungen sind pro Plugin getrennt, automatisch übernehmen geht nicht).
- Neues Recht **„🔞 Stream Deck (zweites Plugin)“** in Werkzeuge → Stream Deck: Standard aus, nur sichtbar und nur einschaltbar mit Verified 18+ + NSFW an (nicht im Privat-Modus), nicht Teil von Einstellungs-Sicherungen.
- Freigabe je Anfrage: Schlüssel mit Stufe „alles“ (Hauptschlüssel oder App-Schlüssel „🔓 Alles“) **und** Recht **und** `nsfw.access()` mit Feature `toys`. Die Aktionen rufen nur bestehende App-Aktionen auf (`toys_set`, `toys_pattern`, `toys_consent`, `nsfw_private`, `toys_follow`, `toys_scene(s)_*`, `toys_lab_fade_now`, `nsfw_panic_full`, `nsfwx_safeword`).
- 🔞-Aktionen sind weder über `/api/action`, Mehrfach-Aktionen, WebSocket-Client-API noch Tastenkürzel erreichbar.

**Plugin 1 „VRC Nexus“ (Release!):** neue Aktion **Infoleiste (Neo)**: Welt + Spieler, Puls, Freunde im Spiel/online, Benachrichtigungen, Warnliste – oder eigene Platzhalter (Zeile 1/2). Plugin-Version 1.11.0.0, `Software.MinimumVersion` jetzt **7.6** (siehe offene Punkte).

## Changelog (EN, öffentlich – README/changelog.json)
- Stream Deck plugin 1.11: new “Infobar (Neo)” action for the Stream Deck Neo – world, players, heart rate, friends online and notifications (or your own placeholders) in the Neo's info bar. Requires Stream Deck app 7.6 or newer.
- 🔞 ***

Öffentlicher Satz (README, Webseite, öffentliche Notizen): **„🔞 ***“**

## NSFW-Changelog (EN, nur `backend/CHANGELOG-NSFW.md`)
- **Stream Deck 🔞 plugin (website only):** a second Stream Deck plugin “VRC Nexus 🔞” is available in Nexus Web → 18+ / ERP → 🎛 Stream Deck (logged in, Verified 18+ and NSFW on only – never part of the app release). Keys: panic, toy stop, safeword, consent light (cycle or fixed, colour shown on the key), intensity set/±step, Stream Deck + dial for intensity (press = stop), start/stop patterns (incl. custom and Toy Lab patterns), surprise, private mode, “follows my avatar”, start/stop scenes, fade out, live lust meter / current intensity, and a Neo infobar with intensity bar and consent dot. Optional discreet mode with neutral words.
- Uses the same local API and the same access key as the main plugin. It only works after you consciously allow “🔞 Stream Deck (second plugin)” in Tools → Stream Deck (off by default, only shown with Verified 18+ and NSFW on). The app checks key level, this right and the 18+ unlock on every request; without them the keys show “locked” and no 18+ data leaves the app. Panic, stop, safeword and red light always work.

## Geänderte Dateien

**vrc_nexus** (Commit siehe Bericht):
- neu: `apps/vrc-nexus/backend/sdadult.js`, `apps/vrc-nexus/renderer/i18n/16.tsv`
- neu: `apps/vrc-nexus/streamdeck-adult/de.ghostnode.vrcnexus.adult.sdPlugin/` (manifest.json, bin/plugin.js, ui/pi.html, layouts/infobar.json, imgs/*), `streamdeck-adult/tools/make-icons.py`, `streamdeck-adult/tools/sync-web.js`
- neu: `apps/vrc-nexus/streamdeck/de.ghostnode.vrcnexus.sdPlugin/layouts/infobar.json`, `imgs/infobar_*.png`
- geändert: `backend/app.js` (Modul + `sdadult_*` + Status in `tools_settings`), `backend/localapi.js` (Endpunkte), `backend/streamdeck-version.json` (1.11.0.0), `renderer/js/nexus-app.js` (Schalter + Aktionsliste), `renderer/js/i18n-dict.js` (gebaut), `streamdeck/de.ghostnode.vrcnexus.sdPlugin/{manifest.json,bin/plugin.js,ui/pi.html}`, `streamdeck/tools/make-icons.py`, `streamdeck/tools/pack.js` (ZIP-Funktion exportiert, Ausgabe unverändert/bytegleich), `tests/backend.test.js` (neuer Test)
- neu: diese Notiz

**ghostenode** (Commit siehe Bericht):
- neu: `nexusdeck.php` (Download-Endpunkt), `inc/modules/sdadult.php`, `clients/streamdeck-adult/` (Quelle + `.htaccess` + vorgebautes Paket + version.json), `tools/tests/sdadult_test.php`
- geändert: `assets/js/nexus-web.js` (18+-Bereich: Reiter „🎛 Stream Deck“ mit Download + Anleitung), `inc/core/pages.php` (`nexusdeck.php` in `PAGE_IGNORE`), `tools/tests/README.md`

## Ablage & Auslieferung
- **Quelle** im App-Repo `apps/vrc-nexus/streamdeck-adult/` (dort mit `npm test` gegen die echte lokale Schnittstelle + nachgebaute Stream-Deck-App getestet). Nicht im Release: `package.json` → `build.files`/`extraResources` nennen nur Plugin 1, der Workflow ruft nur `streamdeck/tools/pack.js`, Android kopiert nur `renderer/{css,js,img}` (alles per Test geprüft). Hinweis: GitHubs automatisches „Source code“-Archiv enthält den Quellordner (wie jede Repo-Datei); ein fertiges Paket wird nirgends angehängt.
- **Übertragen auf die Webseite:** `node apps/vrc-nexus/streamdeck-adult/tools/sync-web.js <ghostenode>` → `clients/streamdeck-adult/` (Ordner + `.htaccess` „Require all denied“ + vorgebautes `VRC-Nexus-18.streamDeckPlugin` + version.json). `clients/` ist zusätzlich in der Haupt-.htaccess gesperrt (RedirectMatch 404); nginx reicht alles an Apache durch.
- **Download** `nexusdeck.php`: kein Login → 403 (keine Weiterleitung), dann Recht `vrcx.access`, verbundenes VRChat-Konto, `nx_nsfw_allowed` (Verified 18+ + NSFW-Schalter, wie der 18+-Bereich) – bei jeder Anfrage. Paket wird live gebaut: ZipArchive → eigener ZIP-Schreiber (zlib) → vorgebautes Paket. Protokoll: nur Zähler je Tag + Plugin-Version (`settings.sdadult_downloads`, 120 Tage, ohne Benutzer/IP). Bremse 10/min je IP (`nw_rate_over`). Nicht im Seiten-Register/Menü, öffentliche Seiten verlinken nichts.
- Bei einer neuen Plugin-Version: `Version` im Manifest anheben, `sync-web.js` laufen lassen, beide Repos committen.

## Neo-Infoleiste – was offiziell geht (Elgato-Doku)
- Geht: Aktionen mit `"Controllers": ["Neo"]` sind reine **Anzeige-Aktionen** für die Infoleiste (232 × 50 px), Layout per `setFeedbackLayout` (eigene JSON-Datei mit `pixmap`/`text`/`bar`), Werte per `setFeedback`; braucht `Software.MinimumVersion` **7.6** (Schema erzwingt das). Quellen: https://docs.elgato.com/streamdeck/sdk/guides/neo-infobar · https://docs.elgato.com/streamdeck/sdk/references/layouts · https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin (`willAppear.controller = "Neo"`, `setFeedbackLayout`) · Schema https://schemas.elgato.com/streamdeck/plugins/manifest.json (Controller „Neo … available from Stream Deck 7.6“).
- Geht **nicht**: die beiden **Touch-Punkte** des Neo lassen sich von Plugins (noch) nicht belegen – sie blättern nur Seiten um; die Infoleiste bekommt keine Eingabe-Ereignisse. Quelle: https://www.elgato.com/us/en/explorer/products/stream-deck/stream-deck-76-infobar-actions-for-stream-deck-neo/ – daher nichts selbst gebastelt.
- Beide Manifeste und beide Layouts gegen die offiziellen JSON-Schemas geprüft (Python `jsonschema`, Draft 7): gültig.

## Tests
- `cd apps/vrc-nexus && npm test`: 124/125 – neuer Test grün; rot ist nur „8.2: Alltag …“, schlägt auf dem unveränderten Stand (HEAD ohne meine Änderungen, separater Worktree) genauso fehl (vorhandener, uhrzeitabhängiger Fehler).
- Neuer Test prüft u. a.: falscher Schlüssel 401 (auch Panik), gesperrt ohne Recht/ohne 18+ (ohne Daten), alle 🔞-Aktionen 403, Panik/Stopp/Safeword/Rot gehen immer, App-Schlüssel ohne „Alles“ gesperrt, Recht nur mit 18+ einschaltbar, alle Aktionen mit Freigabe (Mock-Gerät), Plugin-Prozess gegen nachgebaute Stream-Deck-App (Taste, Regler, Live-Anzeige, Ampel-Bild, Neo-Layout + Feedback, diskret, gesperrt, Panik-Taste), Paket = gültiges .streamDeckPlugin mit allen Bildgrößen, Layouts passen in 232 × 50, nicht in electron-builder/Workflows.
- Webseite: `php tools/tests/sdadult_test.php` und `php my.php tools/tests/sdadult_test.php` – je 19/19 (SQLite und MariaDB); `site9_test.php` 55/55.
- Android: `node build.mjs` baut.

## Offene Punkte
- **Plugin 1 braucht jetzt Stream Deck 7.6** (wegen der Neo-Aktion; Schema lässt „Neo“ nur mit 7.6 zu). Wer eine ältere Stream-Deck-App hat, kann das Plugin-Update erst nach einem Update der Stream-Deck-App installieren – im Changelog erwähnen (oben drin).
- Nur mit echter Hardware prüfbar: Darstellung der Infoleiste auf dem Neo (Schriftgrößen, Balken, Ampel-Punkt als SVG), Drehregler/Touch auf dem Stream Deck +, Installation per Doppelklick, Aussehen der Tasten-SVG (Ampel), Mac-Betrieb.
- Webseite: nach dem Deploy einmal als Testkonto mit 18+ den Download prüfen (ZipArchive auf dem Server vorhanden? sonst greift der eigene ZIP-Schreiber bzw. das vorgebaute Paket).
- Recht „🔞 Stream Deck“ bleibt nach einer Panik gesetzt, wirkt aber erst wieder, wenn 18+ neu eingeschaltet wird (bewusst so; ggf. Wunsch der Besitzerin: nach Panik automatisch zurücksetzen).
