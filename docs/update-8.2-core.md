# Update 8.2.0 – Arbeitspaket „core“ (Notizen für den Koordinator)

Branch `upd82/core`. Version, README, CHANGELOG und changelog.json wurden **nicht** angefasst.
Keine neuen Pakete (nur Bordmittel: `Intl`, `fetch`, vorhandene Krypto über `app.vrc.crypt`).

## Funktionsliste (DE, kurz)

### Allgemein (PC + Handy) – Werkzeuge → neuer Bereich „🧰 Alltag“
1. **⏰ Status-Timer** – Status + Text für N Minuten oder bis HH:MM (`{zeit}` = Endzeit im Text, Vorlagen), danach automatisch zurück zum vorherigen Status – außer man hat ihn inzwischen selbst geändert.
2. **🔔 Online-Erinnerung** – „Wenn X online kommt, erinnere mich an …“; einmalig, danach unter „Erledigt“. Ist X beim Anlegen schon online, gilt sie ab dem nächsten Online-Gehen (oder „auch wenn schon online“).
3. **🕐 Ortszeit von Freunden** – Zeitzone je Freund (Auswahlliste + freie IANA-Eingabe), aktuelle Uhrzeit dort, Abstand zu hier, 🌙 bei Nacht; aktualisiert sich alle 30 s.
4. **📝 Notizblock** – Notizen mit Titel, Farbe, anheften, Suche; Zeilen „- [ ] …“ werden zu anklickbaren Kästchen (Zähler erledigt/gesamt). Nur auf diesem Gerät.
5. **📆 Geburtstags-Kalender** – Geburtstage (aus Freundes-Notizen „Geburtstag 24.12.“/„🎂 24.12.“) und Freundschaftstage als Liste und als ICS-Datei (jährlich wiederkehrend, RFC-5545-Zeilenfaltung).
6. **⏳ Spielzeit-Budget** – Tages- und Wochenbudget, Vorwarnung (70/80/90 %) und Hinweis bei 100 % (je Stufe einmal am Tag). Quelle: Spiel-Log (PC) oder eigener Online-Verlauf (Handy). Kein Sperren.
7. **🚦 VRChat-Serverstatus** – Gesamtzustand, Dienste und aktuelle Meldungen von status.vrchat.com (2 min zwischengespeichert, Links nur zu status.vrchat.com/stspg.io); optional Hinweis bei neuer Störung und bei „läuft wieder“ (Prüfung alle 10 min).
8. **💬 Kontakt-Pflege** – „Bei X alle N Tage melden“: zuletzt gesehen aus dem Spiel-Log (gemeinsame Instanz) oder „✔ Kontakt gehabt“; einmal am Tag (ab 10 Uhr) ein Sammel-Hinweis für fällige Kontakte.

Behobene Fehler aus `docs/BACKLOG.md` (abgehakt unter „Erledigt (8.2.0)“):
- **Geräte-Seite**: Karten nutzen die ganze Breite (2 Spalten, schmal 1) – nur CSS in `renderer/css/app.css`.
- **„zuletzt noch nie“** → „noch nie verbunden“ (`ago()` in `nexus-watch.js`). Dafür musste zusätzlich die eine Aufrufstelle in der Geräteliste (gleiche Datei, Zeile mit `T('zuletzt')`) angepasst werden, sonst stünde „zuletzt noch nie verbunden“ da. Nur diese zwei Zeilen in `nexus-watch.js` geändert – bitte beim Zusammenführen mit dem Uhr-Paket beachten.

### 🔞 NSFW (nur Desktop, hinter der bestehenden Altersfreigabe `nsfw.need('toys')`) – neuer Reiter „🧪 Labor“ im 18+-Bereich
1. **📈 Zeitleisten-Muster** – eigener Editor: Stützpunkte Zeit/Stärke/Übergang (linear, Stufe, weich), per Tippen in die Fläche oder als Text, Wiederholen an/aus, Vorschau. Läuft als normales Muster `t:<id>` überall mit (Muster-Knöpfe, Szenen, Fernsteuerung, Uhr/Handy).
2. **🧬 Muster-Mixer** – zwei Muster (auch eigene/Zeitleisten) verbinden: malnehmen, Maximum, Mittelwert, abwechseln → Muster `m:<id>` (kein Mixer im Mixer).
3. **❤ Puls-Deckel** – ab Puls X wird die Höchststärke linear bis zur Untergrenze beim Höchstpuls gesenkt (Bremse statt Stopp; ergänzt die vorhandene Auto-Pause).
4. **🌅 Sanft an & aus** – Sanftanlauf nach einer Ruhepause (je Gerät) und Ausklingen-Timer (läuft N min, die letzten Sekunden werden leiser, dann alles aus) + „Jetzt ausklingen“.
5. **👥 Spielzeug-Gruppen** – Geräte bündeln: Gruppen-Anteil (Regler), stumm, gemeinsam Stärke setzen, gemeinsam stoppen.
6. **📊 Private Statistik** – Sitzungen (Dauer, Spitze, Ø, Höhepunkte, Muster) nur lokal und verschlüsselt (`app.vrc.crypt`), aus ab Werk, löscht sich nach N Tagen selbst, „Statistik löschen“.

Sicherheit: Alles im Labor ist ein Faktor 0…1 in `toys.shaped()` (kann nur senken). `toys.stopAll()` (Not-Aus, Panik, Safeword, Ampel Rot, Szene beenden) ruft `lab.halt()` → Ausklingen-Timer und Sanftanlauf enden sofort. Alle Aktionen laufen über `toys.action` → `nsfw.need('toys')`.

## Changelog (EN, normale Funktionen)

**🧰 Everyday (Tools, desktop and Android)**
- **Status timer**: set a status and text for a while (or until a time, `{zeit}` inserts the end time) – it switches back automatically afterwards, unless you changed it yourself in the meantime.
- **Online reminder**: "when X comes online, remind me to …" – one-time, then moved to "done".
- **Friends' local time**: assign a time zone to friends and see their current local time, the difference to yours and a 🌙 when it is night there.
- **Notepad**: notes with colours, pinning and search; lines starting with `- [ ]` become clickable checkboxes.
- **Birthday calendar**: birthdays (from friend notes) and friendship anniversaries as a list and as a yearly recurring ICS calendar file.
- **Playtime budget**: daily and weekly budget with a friendly early warning and a notice when reached (game log on PC, own online history on Android). No blocking.
- **VRChat server status**: overall state, services and current incidents from status.vrchat.com, optional notification on new outages.
- **Keep in touch**: get a daily nudge for people you want to stay in contact with, based on when you last met in-game or a manual "had contact".
- Fixed: the Devices page now uses the full width; devices that never connected show "never connected" instead of "last never".

## NSFW-Text (nur für CHANGELOG-NSFW, EN)

**🧪 Toy lab (18+ area, age verification required)**
- **Timeline patterns** with an editor (points with time, intensity and transition: linear/step/smooth, tap to add, preview) – usable everywhere patterns are (buttons, scenes, remote, watch/phone).
- **Pattern mixer**: combine two patterns (multiply, maximum, average, alternate) into a new one.
- **Heart-rate cap**: above a chosen heart rate the maximum intensity is lowered smoothly down to a floor – a brake, not a stop.
- **Gentle on & off**: soft start after a rest and a fade-out timer (runs N minutes, fades the last seconds, then stops everything), plus "fade out now".
- **Toy groups**: bundle devices, set a group share, mute, set or stop a whole group at once.
- **Private statistics**: sessions (duration, peak, average, climaxes, patterns) stored only on this device, encrypted, off by default, auto-deleted after N days.
- Everything in the lab can only lower the intensity; emergency stop, panic, safeword and red light always end fade timers and soft starts immediately.

## Neue Aktionen für Uhr/Handy (zum Verbinden durch den Koordinator)

Alle laufen über `toys.action` (also nur mit 18+-Freigabe, Präfix `toys_` → passt zum vorhandenen Weg in `watch.js`/PHONE_ACTS). Rückgabe jeweils der Labor-Zustand (`toys_lab_state`-Form) mit `msg`.

| Aktion | Parameter | Rückgabe / Wirkung |
|---|---|---|
| `toys_lab_state` | – | `{ cfg, hr:{bpm,factor}, fade:{left,fade_s,fading,factor}\|null, groups:[{id,name,devices,level,on,present}], devices, patterns, stats, recording }` |
| `toys_lab_fade` | `minutes` (1–240), `fade_s` (5–300, Std. 30) | startet Ausklingen-Timer; Fehler ohne verbundenes Gerät |
| `toys_lab_fade_now` | `fade_s` (5–120, Std. 15) | sofort sanft ausklingen, danach alles aus |
| `toys_lab_fade_stop` | – | Timer aus (Stärke bleibt) |
| `toys_lab_group_set` | `group` (id), `level` (0…1) | Stärke für alle verbundenen Geräte der Gruppe |
| `toys_lab_group_stop` | `group` | stoppt nur die Geräte der Gruppe |
| `toys_lab_group_mute` | `group`, `mute` ('1'/'0') | Gruppe stumm / wieder an |
| `toys_lab_stats` | `days` (Std. 30) | `{ stats:{sessions,minutes,avg_min,longest,avg_peak,climaxes,patterns,weekdays,recent,stored}, on }` |

Zeitleisten (`t:<id>`) und Mixer (`m:<id>`) erscheinen automatisch in `toys_status().patterns` und lassen sich mit dem vorhandenen `toys_pattern { id }` starten – für die Uhr ist dafür nichts Neues nötig.
Empfehlung: `toys_lab_fade_now` (sanftes Ende) und `toys_lab_group_stop` passen gut auf Uhr/Handy; Stopp/Panik bleiben wie bisher `toys_stop`/`nsfw_panic`.

Allgemeine Aktionen (Präfix `kit_`, ohne 18+), falls Handy/Uhr sie zeigen sollen: `kit_overview`, `kit_status_start {status, desc, minutes|until}`, `kit_status_cancel {restore}`, `kit_remind_add {uid, text}`, `kit_vrcstatus`, `kit_budget`.

## Geänderte / neue Dateien

Neu:
- `apps/vrc-nexus/backend/kit.js` – 🧰 Alltag (8 Funktionen)
- `apps/vrc-nexus/backend/toylab.js` – 🧪 Spielzeug-Labor (6 NSFW-Funktionen)
- `apps/vrc-nexus/renderer/js/nexus-kit.js` – Oberfläche Alltag
- `apps/vrc-nexus/renderer/js/nexus-nsfw7.js` – Oberfläche Labor
- `apps/vrc-nexus/renderer/i18n/11.tsv` – 124 neue Texte (DE/EN/FR/JA, gegen alle *.tsv geprüft)
- `docs/update-8.2-core.md` (diese Datei)

Geändert:
- `backend/app.js` – `this.kit` + Timer, Weiterleitung `kit_`, GET `?kit_ics=1` (ICS-Download)
- `backend/toys.js` – Labor eingebunden (Muster `t:`/`m:`, Faktor in `shaped()`, `lab.halt()` in `stopAll()`, `toys_lab_*`, `lab.stop()`)
- `backend/insights.js` – exportiert `BDAY` (Geburtstags-Muster)
- `renderer/js/nexus-app.js` – Werkzeuge: Bereich „Alltag“ mit 8 Kacheln
- `renderer/js/nexus-nsfw.js` – Reiter „🧪 Labor“ (3 Einhänge-Zeilen)
- `renderer/js/nexus-watch.js` – nur `ago()` + die eine Aufrufstelle (siehe oben)
- `renderer/css/app.css` – Geräte-Raster, Alltag-Stile
- `renderer/page.html` – zwei Skripte
- `renderer/js/i18n-dict.js` – neu gebaut
- `tests/backend.test.js` – 2 neue Tests
- `docs/BACKLOG.md` – zwei Fehler abgehakt

## Tests

- `npm test`: 120/120 (vorher 118/118).
- `node build.mjs` (Android) läuft durch.

## Offene Punkte

- Uhr/Handy: Labor-Aktionen (Tabelle oben) noch nicht in `PHONE_ACTS` – macht der Koordinator / das Uhr-Paket.
- Android: ICS-Download nutzt denselben Weg wie die vorhandenen CSV-Exporte (`nexus.php?kit_ics=1`); auf dem Handy nicht auf einem echten Gerät geprüft.
- Einstellungs-Abgleich (`settingsync.js`, Liste `EXTRA`): die neuen Einstellungen (`kit_*`, `toylab_cfg`) werden bewusst **nicht** zwischen Geräten abgeglichen (Notizen/Erinnerungen bleiben je Gerät). Falls gewünscht, `kit_notes`/`kit_tz` in `EXTRA` aufnehmen; `toylab_stats` sollte lokal bleiben. Cloud-Sicherung der ganzen Datenbank enthält alles.
