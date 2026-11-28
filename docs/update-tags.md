# Update: 🏷 Tags vergeben (Admin) – Notizen für den Koordinator

## Funktionen (DE, kurz)
- **Admin → „🏷 Tags vergeben“** (nur Besitzerin): Person wählen (Suche in der Freundesliste mit Bild/Name oder VRChat-ID/Profil-Link), Tags per Chips an/aus, Laufzeit (unbegrenzt/30/90/365 Tage), Notiz → „Vergeben“.
  - Rollen: 💖 Supporter, 🛡 Moderator, 🎨 Creator, 🧪 Beta-Tester.
  - Neue rein optische Tags (ohne Rechte): ⭐ VIP, 🤝 Partner, 🎉 Event-Team, 🖌 Künstler:in – je mit Farbe/Icon.
  - Liste aller vergebenen Tags: Person, Tags als farbige Chips, läuft ab, Status (📨 automatisch / ✋ von Hand / ⛔ entzogen / ⌛ abgelaufen), ✎ Bearbeiten (neu ausstellen ersetzt den alten Schlüssel, der alte wird gesperrt), ⏩ Verlängern (+30/+90/+365), Entziehen.
  - Wählt man eine Person, die schon aktive Tags hat, öffnet sich automatisch „Bearbeiten“ (je Person gilt in der App genau ein Schlüssel).
  - Intern weiterhin signierte NXK1-Schlüssel (`issue`/`revoke`/`extend`), keine Abkürzung an der Signatur vorbei.
- **Automatische Zustellung**: Beim Abgleich schickt die Besitzer-App die signierten Schlüssel mit (`sync`, Feld `token`), die Webseite speichert sie (nur echt unterschrieben, passende ID/VRChat-ID, nie `mod`). Die Empfänger-App holt sie über `nexuslic.php?a=mine` mit ihrem Nexus-Konto-Token – beim Start, alle 6 h (zusammen mit der Sperrliste) und per Knopf „🏷 Tags abrufen“ – und übernimmt den neuesten gültigen Schlüssel (Signaturprüfung wie beim Eintippen). Hinweis „🏷 Neue Tags erhalten: …“. Manuelles Eintragen bleibt möglich.
- **Anzeige**: „Deine Lizenz“ (Einstellungen) zeigt alle Tags als farbige Chips (+ Hinweis „Optische Tags geben keine Rechte“), eigenes/fremdes Community-Profil in der App zeigt Tag-Abzeichen, Web-Nexus-Profil (Abzeichen aus 8.2) zeigt Tags vorne als farbige Abzeichen, Admin-Bereich der Webseite zeigt „📨 automatisch zugestellt“.
- **Sicherheit**:
  - „Besitzer/Besitzerin“ ist kein vergebbares Tag (`owner`, `besitzer`, `besitzerin`, `admin`, `root` werden abgelehnt), auch keine Tags für das Besitzer-Konto selbst. Owner-Lock (OWNER_HASH/TRUSTED) unverändert; 👑 kommt im Profil nur aus dem Owner-Hash.
  - Rechte nur über `ROLES` – `access().roles`/`mod` zählen optische Tags nie mit; Tags ersetzen keine 18+-Freigabe.
  - **Moderator-Schlüssel werden bewusst nicht automatisch zugestellt** (weder von der App gesendet noch vom Server gespeichert/ausgeliefert): Nexus-Konten entstehen seit 3.0.2 ohne VRChat-Nachweis (`register`), eine veränderte App könnte sich also als fremde VRChat-ID anmelden und bekäme sonst den Moderator-Schlüssel (der u. a. bei der Warnliste als Admin-Nachweis gilt). Für Moderator gibt die Besitzerin den Schlüssel weiterhin von Hand weiter (wird beim Vergeben kopiert). Ein gültiger, eingetippter Moderator-Schlüssel wird nie durch einen zugestellten ohne `mod` ersetzt.
  - `mine` gibt nur Schlüssel der VRChat-ID des Kontos heraus (prüft zusätzlich Signatur, ID, VRChat-ID im Schlüssel, Sperre, Ablauf, kein `mod`); 401 bei ungültigem/unbekanntem/gesperrtem Token; Rate-Limit wie die übrigen nexuslic-Aufrufe (120/min) plus 30/min für `mine`.
  - Die Oberfläche bekommt die ausgestellten Schlüssel nicht mehr in der Liste (`issuedPublic()`), lokal bei der Besitzerin verschlüsselt gespeichert (`tok`); Admin-Liste der Webseite gibt `token` nie aus.

## English changelog text (public)
### New in x.y.z – Tags
- **🏷 Assign tags (Admin, owner only):** pick a person from your friends list (picture + name) or by VRChat ID / profile link, toggle tags as chips, choose a duration (unlimited / 30 / 90 / 365 days) and a note. New cosmetic tags **VIP, Partner, Event team, Artist** join Supporter, Moderator, Creator and Beta tester. The list shows every assigned tag with colour chips, expiry and status, with edit (re-issues and replaces the old key), extend and revoke.
- **Automatic delivery:** recipients no longer need to paste a key. The owner's app uploads the signed keys on sync, and the recipient's app fetches its own keys via its Nexus account at start, every 6 hours or with “Fetch tags” – signatures are verified exactly as before. Manual entry still works. Moderator keys are still handed over personally.
- **Tag badges** in “Your licence”, in the community profile and on the web profile. Cosmetic tags are badges only and grant no permissions; “Owner” is not an assignable tag.

## Migration
- Webseite (`ghostenode`): `lic_keys` bekommt die Spalte `token TEXT NOT NULL DEFAULT ''` (Migration 2 in `nl_schema()`, idempotent über `db_columns`, Einstellung `nexuslic_schema` = `2`; getestet auf SQLite und MariaDB). Läuft automatisch beim ersten Aufruf von `nexuslic.php`/Profil.
- App: keine DB-Migration; vorhandene Einträge in `nsfw_issued` haben noch keinen gespeicherten Schlüssel → werden erst nach „Bearbeiten“ oder „Verlängern“ automatisch zugestellt (Status „✋ von Hand“).

## Geänderte Dateien
App (`/home/user/vrc_nexus`, `apps/vrc-nexus`):
- `backend/nsfw.js` – `TAGS`, `ALL_TAGS`, `tagsOf`, Owner nicht vergebbar, `issue()` mit `replace`, Schlüssel verschlüsselt im Eintrag (`tok`), `issuedPublic()`, `deliverable()`, `roles()/access()` mit `tags` (Rechte weiterhin nur aus `ROLES`).
- `backend/license.js` – `fetchMine()` (`a=mine`), Aufruf in `refresh()` (Start/6 h), Aktion `lic_fetch`, `sync()` schickt `token` (ohne `mod`), `mine()` mit `tags`/`tag_names`/`auto`.
- `renderer/js/nexus-tags.js` (neu, in `renderer/page.html` eingebunden), `renderer/js/nexus-admin.js` (Karte „🏷 Tags vergeben“), `renderer/js/nexus-app.js` („Deine Lizenz“ + Knopf „Tags abrufen“), `renderer/js/nexus-community.js` (Profil-Abzeichen), `renderer/css/app.css`.
- `renderer/i18n/15.tsv` (neu, 43 Einträge de/en/fr/ja, ohne Duplikate), `renderer/js/i18n-dict.js` (gebaut).
- `tests/backend.test.js` – Test „8.4: Tags vergeben …“.

Webseite (`/home/user/ghostenode`):
- `nexuslic.php` – `a=mine`, NxError → 401, zusätzliches Rate-Limit.
- `inc/modules/nexuslic.php` – Migration 2, `nl_payload`, `nl_token_ok`, `nl_store_token`, `nl_mine`, `nl_tags_for`, `nl_tag_badges`, `NL_TAGS`; `nl_sync` speichert `token`; `nl_list` ohne `token`.
- `inc/modules/nexuscomm.php` (`tags` im Profil), `inc/modules/nexusplus.php` (Tag-Abzeichen vorne), `assets/js/nexus-plus.js`, `assets/css/nexus-web.css`, `inc/admin/nexus_tabs.php` („📨 automatisch zugestellt“).
- `tools/tests/nexuslic_test.php` (neu), `tools/tests/README.md`.

## Tests
- App: `npm test` → 124/124 (vorher 123, neu: 8.4-Tags-Test). Android `node build.mjs` ok.
- Webseite: `nexuslic_test.php` 29/29 auf SQLite und MySQL; `nexuschat_test.php` 21/21 und `site9_test.php` 55/55 weiterhin grün (beide Engines).

## Offene Punkte
- Moderator-Schlüssel automatisch zustellen erst, wenn Nexus-Konten einen VRChat-Nachweis haben (z. B. Bio-Code `nx_verify` oder serverseitige Prüfung) – dann `deliverable()` in `nsfw.js` und `nl_token_ok()` lockern.
- Bereits ausgestellte (alte) Schlüssel haben keinen gespeicherten Schlüssel – einmal „Bearbeiten“/„Verlängern“ nötig, damit sie zugestellt werden.
- Ältere App-Versionen zeigen optische Tags nicht an (sie filtern auf die alten Rollen) – unkritisch, nur Anzeige.
- Tag-Abzeichen erscheinen in Profilen; in Feed-Beiträgen (Autorzeile) noch nicht.
- Die Webseite zeigt das 👑-Abzeichen der Besitzerin jetzt auch im Web-Profil (nur über den Owner-Hash).
