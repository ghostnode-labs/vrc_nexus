# Update 8.2 – Uhr-Paket (Branch upd82/watch)

## Funktionen (DE, kurz)

**Kacheln (Wear OS Tiles) – neu**
- „Nexus – Puls & Status“: Puls mit Ring (40–200 bpm, eigener Sensor vor PC-Wert), VRChat-Welt/Spieler, Freunde online, Schlafmodus; Tippen öffnet die App.
- „Nexus – Schnellaktionen“: 💤 Schlafmodus direkt, ♥ Puls, ⚡ Makros, 💬 Chatbox (öffnen die App an der Stelle) und der erste Schnelltext direkt in die Chatbox.
- „Nexus – Fernbedienung“ (🔞, siehe NSFW-Teil). STOPP und Panik sind darauf immer da, auch ohne Freigabe.
- PC: Werkzeuge → 📡 Geräte → ADB-Liste → „🧩 Kacheln“ legt Status- und Schnellaktionen-Kachel per ADB auf die Uhr (die 🔞-Kachel nur von Hand).

**Komplikationen (für jedes Zifferblatt) – neu**
- „Puls (Nexus)“: Kurztext und Ring (Bereichswert).
- „VRChat (Nexus)“: Kurz = Freunde online, Lang = Welt · Spieler (Privat-Modus ohne Welt).
- „Fernbedienung (Nexus)“ (🔞, siehe NSFW-Teil).

**Zifferblatt „VRC Nexus“ (Watch Face Format)**
- Im Zifferblatt-Editor wählbar: Hintergrundbild (6 eigene Motive: Nexus-Waben, Cyber-Gitter, Neon, Ozean, Polarlicht, Sternennacht – oder Schwarz), Farbthema (Cyber, Neon, Ozean, Wald, Sonnenuntergang, Weiß), Sekunden an/aus.
- Hintergründe im Always-On ausgeblendet (Akku, Einbrennen). Felder zeigen jetzt auch Bereichswerte als Ring.
- Zwei Schemafehler im bisherigen XML behoben (`letterSpacing` gibt es in WFF 1 nicht; `<Template>` ohne `<Parameter>`) – CI prüft das XML jetzt gegen Googles offizielle XSD.
- Eigene Fotos im WFF-Zifferblatt: **nicht** gebaut – `PhotosConfiguration` gibt es erst ab Wear OS 6 (WFF 4), das Zifferblatt unterstützt Wear OS 4+. Eigene Bilder gehen weiter über das App-Zifferblatt (Bild-Upload am PC / Galerie der Uhr, unverändert).

**Weitere Uhr-Funktionen**
- 💬 Chatbox-Schnelltexte vom Handgelenk (bis 8, am PC unter Geräte änderbar; Standardliste eingebaut).
- ⚡ PC-Makros und Avatar-Presets von der Uhr starten.
- ⚠ Puls-Alarm: über 120/140/160/180 bpm vibrieren + Meldung (höchstens alle 2 min, mit dem Uhr-Sensor).
- Entkoppeln auf der Uhr meldet die Uhr auch am PC ab; eigene Einstellungen bleiben dabei erhalten.
- Startseite der App mit Kacheln für Chatbox und Aktionen; Kacheln/Komplikationen öffnen die App direkt auf der passenden Seite.

## Englischer Changelog-Text (ohne NSFW)

- **Nexus Watch – tiles:** “Nexus – heart rate & status” (heart-rate ring, world, friends online) and “Nexus – quick actions” (sleep mode, chatbox quick texts, macros). The PC can add them via ADB (Tools → 📡 Devices → 🧩 Tiles).
- **Nexus Watch – complications** for any watch face: heart rate (watch sensor or the source VRC Nexus uses), VRChat status (friends online / world · players).
- **VRC Nexus watch face:** choose a background (six built-in images or black), a colour theme and whether to show seconds in the watch face editor; ranged-value complications are drawn as rings. Fixed two schema errors in the face XML; CI now validates it against Google's official Watch Face Format schema.
- **Nexus Watch:** chatbox quick texts (editable on the PC), PC macros and avatar presets from the wrist, heart-rate alarm, discreet mode; unpairing on the watch also removes it on the PC.

## NSFW-Text (nur CHANGELOG-NSFW)

- **18+ clearance bound to pairing:** a watch takes over the PC's 18+ clearance when it is paired – only if the PC itself is unlocked. Any panic (PC button, watch, phone, other PC), switching NSFW off / expired age check on the PC, or unpairing removes it. It can be transferred again (or revoked) per watch under Tools → 📡 Devices (🔐/🔓); the per-device “hide 🔞 on this device” switch stays. Watches paired before 8.2 take it over once while the PC is unlocked.
- **Toy remote on the watch:** strength via rotating crown or swiping on the dial, −10/+10, big STOP, fade out (toy lab, 15 s), pattern list, surprise, consent light 🟢🟡🔴, panic on the same page.
- **🔞 tile “Nexus – remote”:** strength ring, − / STOP / +, consent light and panic (double tap). Without clearance it only shows STOP and panic.
- **🔞 complication “remote (Nexus)”:** strength and consent light on any watch face (empty without clearance).
- **Discreet mode (default on):** tiles, complications and the always-on screen show no 18+ words or symbols (◈ instead of 🔞, no pattern names); 🔞 pages are left when the app goes to the background, no recents screenshot (Wear OS 4+).
- Stop, consent red, panic and safeword are always allowed from the watch, with or without clearance.

## Geänderte Dateien

- `apps/vrc-nexus/backend/watch.js` – Kopplungs-Freigabe (`adult`, `adult_off`), `adultAccess()`, `revokeAdult()`, `hookPanic()` (hängt sich einmal in `nsfw.panic` ein, nsfw.js unverändert), `toyInfo()`, neue Uhr-Aktionen `toy_level`, `toy_pattern`, `toy_pattern_stop`, `toy_surprise`, `toy_fade`, `chat`, `shortcuts`, `macro`, `preset`, `unpair`; UI-Aktion `watch_dev_adult`; Einstellung `quick`; PHONE_ACTS + `toys_lab_fade_now`, `toys_lab_group_stop` (letzteres als Sicherheitsaktion).
- `apps/vrc-nexus/backend/watchinstall.js` – `watch_adb_tiles` (add-tile per DEBUG_SURFACE, nur eigene Kacheln, nur Uhren).
- `apps/vrc-nexus/renderer/js/nexus-watch.js` – 🔐/🔓 Freigabe je Uhr, Schnelltexte-Editor, 🧩 Kacheln-Knopf (ago() und die T('zuletzt')-Zeile unverändert).
- `apps/vrc-nexus/renderer/i18n/12.tsv` (neu, 11 Einträge), `renderer/js/i18n-dict.js` (neu gebaut – beim Zusammenführen einfach neu erzeugen).
- `apps/vrc-nexus/tests/backend.test.js` – Test 5.2 angepasst (Panik entzieht Freigabe), neuer Test „8.2: Uhr – 18+-Freigabe …“, ADB-Kacheln im 8.0.19-Test.
- `apps/vrc-nexus-watch/app/**` – neue Klassen `Live`, `TileBase`, `StatusTile`, `QuickTile`, `ToyTile`, `Comp`, `HeartComplication`, `StatusComplication`, `ToyComplication`, `LevelDial`; `MainActivity`, `HeartService`, `Nexus` erweitert; Manifest (3 Kacheln, 3 Komplikationen), Icons, Kachel-Vorschaubilder, Strings; `build.gradle` (Abhängigkeiten), `gradle.properties` (`android.useAndroidX=true`).
- `apps/vrc-nexus-watch/watchface/**` – `watchface.xml`, Strings, 6 Hintergründe + 7 Editor-Symbole, neue Vorschau, `tools/make_backgrounds.py`, `tools/validate_wff.py`.
- `.github/workflows/vrc-nexus-android.yml` – Job `watchface`: XSD-Prüfung vor dem Bauen (google/watchface fest auf Commit 18d3844, xmlschema 4.3.2).
- `apps/vrc-nexus-watch/README.md` – Tiles, Complications, Freigabe, Build-Abhängigkeiten, Zifferblatt-Optionen.

## Neue Abhängigkeiten (Uhr-App, alle Google/AndroidX, fest)

| Paket | Version | Zweck |
|---|---|---|
| androidx.wear.tiles:tiles | 1.4.1 | Kacheln |
| androidx.wear.protolayout:protolayout | 1.2.1 | Kachel-Layout |
| androidx.wear.protolayout:protolayout-expression | 1.2.1 | (von tiles/protolayout benötigt) |
| androidx.concurrent:concurrent-futures | 1.1.0 | CallbackToFutureAdapter |
| com.google.guava:listenablefuture | 1.0 | nur die Schnittstelle ListenableFuture |
| androidx.wear.watchface:watchface-complications-data-source | 1.2.1 | Komplikations-Datenquellen (bringt kotlin-stdlib 1.8.22, kotlinx-coroutines 1.7.1, androidx.core/preference mit) |

Alle haben `minCompileSdk=34` → compileSdk bleibt 34, AGP bleibt 8.5.2, minSdk der Uhr-App bleibt 30. Nur Dev/CI: Python `xmlschema` 4.3.2 (XSD-Prüfung), Pillow/NumPy nur lokal für `make_backgrounds.py` (Bilder sind eingecheckt).

## Was nur in CI / auf echter Uhr geprüft werden kann

- **Gradle-Build der Uhr-App** (hier kein Android-SDK; das automatische Akzeptieren der SDK-Lizenzen wurde in dieser Umgebung nicht erlaubt). Geprüft wurde stattdessen: alle Java-Dateien kompilieren fehlerfrei mit `javac --release 17` gegen das Android-14-Framework (Robolectric android-all 14) und die echten AAR-Klassen der genannten Versionen. Nicht geprüft: Ressourcen-Verknüpfung (aapt2), Manifest-Merge, Dex, Doppelklassen-Prüfung.
- API-Level: neue Aufrufe über API 30 sind abgesichert (`setRecentsScreenshotEnabled` nur ab 33); eine Prüfung gegen API 30 war wegen Maven-Central-Ratenlimit nicht möglich – Lint für Release ist bewusst aus (`checkReleaseBuilds false`, wie zuvor praktisch ohne Lint).
- Zifferblatt: XSD-Prüfung (WFF 1) grün (lokal und neu in CI). Ob `tintColor="[CONFIGURATION.theme.N]"` auf allen Uhren gleich aussieht und die Hintergründe im Editor erscheinen, nur auf echter Uhr.
- Kacheln: Klick-Ablauf (LoadAction → Kennung im nächsten Request), WLAN-Aufbau aus der Kachel heraus, Aktualisierung per `getUpdater().requestUpdate` – nur auf echter Uhr. Bei langsamer Verbindung zeigt die Kachel „⏳ gesendet …“ und zeichnet nach.
- Drehkrone (Rotary über `dispatchGenericMotionEvent`), Wischen am Stärke-Rad.
- `watch_adb_tiles`: Befehl `am broadcast -a com.google.android.wearable.app.DEBUG_SURFACE --es operation add-tile --ecn component …` (Google-Doku zu Tiles); Ergebnis je Uhr-Hersteller unterschiedlich – sonst Hinweis „lange drücken, +“.

## Offene Punkte

- Desktop-Paket (toylab.js) liegt auf upd82/core: `toy_fade` ruft `toys_lab_fade_now` – funktioniert erst nach dem Zusammenführen (vorher „Unbekannte Aktion“). Gruppen-Stopp ist nur in PHONE_ACTS (Uhr hat keine Gruppenwahl).
- `renderer/js/i18n-dict.js` nach dem Zusammenführen neu bauen (`node scripts/i18n-build.js`).
- Test „2.10.2 Handy-crypto …“ schlägt in diesem Worktree fehl, weil `apps/vrc-nexus-android/node_modules` fehlt (nicht durch dieses Paket; in CI vorhanden).
