# Update: 🔞 Reiter „Spielzeug“ neu (Arbeitspaket upd/toys)

Branch `upd/toys`, nur lokal committet. Version, README und Changelogs wurden **nicht** geändert.

## Funktionen (DE, kurz)

- **Klarer Kopf**: großer Verbindungsstatus (Intiface verbunden/aus, Server, Anzahl Geräte), Verbinden/Trennen, Geräte suchen, **ALLES STOPPEN** immer sichtbar (auf breiten Fenstern klebt der Kopf oben), Höchststärke + „Aus nach X s ohne Signal“ + Hauptschalter **Avatar-Steuerung** in einer Zeile. Adresse, Auto-Neuverbinden, Knopf am Gerät, Akku-Warnung eingeklappt unter „Verbindung“. Hinweis-Banner bei Ampel gelb/rot und Pause.
- **Gerätekarten** mit Live-Ausgabe als Balken (alle 0,4 s, ohne die Seite neu aufzubauen), Akku, Fähigkeiten (Vibration, Oszillation, Enge, Stroker, Rotation …), Test-Knopf (kurzer Puls), Stummschalten, Einzel-Stopp; Feineinstellungen (Name, Min/Max, Kurve, Motoren, Reaktionszeit) aufklappbar.
- **Einfach / Experte je Gerät**: „⚪ Aus · 🎭 Folgt meinem Avatar · 🛠 Experte“.
  - Einfach: ein Klick – alle Plugs, Sockets und Touch-Zonen des aktuellen Avatars, nur Berührungen von anderen, mit **Vorlagen** 💙 sanft, 💗 ausgewogen, 🔥 intensiv, 🌊 Bewegung, ✋ nur Berührung. Einschalten aktiviert die Avatar-Steuerung mit.
  - Experte: Quellen-Liste mit Live-Wert je Quelle und **★ zählt** an der gerade stärksten Quelle. Pro Quelle: Zonen (alle / nur … / ohne … aus den erkannten Zonen), „berührt von“ als Chips, „Eigene Berührungen ignorieren“, **Modus** (📏 Tiefe / 🌊 Bewegung / ✨ Beides), **Bereich** als Doppelregler (Min–Max), **Kurve**, **Glättung**, **Leerlauf**, Bewegungs-Empfindlichkeit. Experte startet mit den Quellen der gewählten Vorlage; „Vorlage anwenden“ jederzeit.
- **Eigenes Auswahl-Menü** statt nativem `<select>` für „＋ Quelle hinzufügen“, Zonen und Vorlagen: gruppiert (Avatar / Körper & Puls / Sonstiges), Icon + Name + Kurzbeschreibung, Live-Wert bei Avatar-Zonen, Tastatur (↑/↓, Enter, Esc, Tab), Suche ab 9 Einträgen. Alle bisherigen Quellenarten bleiben (SPS-Plugs, SPS-Sockets, SPS-Touch, Eigener Parameter, PCS, Puls, Stimme, Lust-Meter, Konstant).
- **Zonen deines Avatars (live)**: erkannte SPS/OGB/**TPS**/VFH-Zonen des getragenen Avatars mit System-Kennung und zwei Live-Balken (von anderen / von mir); nach Avatar-Wechsel werden alte Zonen verworfen. Avatar-Debugger-Link bleibt.
- **Stroker (Linear)**: neu „📏 folgt der Tiefe“ – Positionsbefehle (Buttplug `LinearCmd`) aus der Tiefe, Dauer passend zum eingestellten **Höchsttempo** (Hübe/s), **Grenzen unten/oben** als Doppelregler, **Ruhestellung** nach Leerlauf, Live-Position. „⏩ Stärke = Tempo“ (bisheriges Verhalten) bleibt für Muster. Höchststärke, Ampel und Labor-Faktoren bremsen das Tempo, Ampel rot/Pause/Stumm/Stopp halten den Stroker an.
- **Rotation**: Drehrichtung als Umschalter, neu „⇅ folgt Bewegung“ (rein = rechts, raus = links).
- **Teilen**: Zuordnung als Text-Code `NXTL1.…` exportieren und importieren (auf ein anderes Gerät übertragbar, bestehende Zuordnungen bleiben).
- **Hilfe kurz**: „?“-Tooltips statt Textwänden; „Ältere Wege“ (Einfacher OGB-Modus, eigene Regeln) eingeklappt weiter da.
- **Dunkle Auswahllisten**: global `color-scheme` am `html` und dunkle `option`/`optgroup` für verbleibende native Selects.
- **TPS** (Thry's Penetration System) wird als Quelle erkannt (`TPS_Internal/Pen|Orf/<id>/RootRoot|Depth_In`), im Avatar-Check angezeigt und im OSC-Log als intim behandelt.
- Sicherheit unverändert: Altersfreigabe für alle neuen Aktionen, ALLES STOPPEN/Panik/Ampel rot schalten die Avatar-Steuerung aus und stoppen auch Stroker, Höchststärke deckelt, Labor-Faktoren und Pausen wirken weiter.
- Alte Einstellungen werden weiter gelesen: bestehende Verknüpfungen rechnen mit neutralen Werten exakt wie vorher (Geräte mit Verknüpfungen gelten automatisch als „Experte“), alte Mutatoren bleiben wirksam und werden als „Alte Mutatoren“ angezeigt.

## Changelog (EN, nur für CHANGELOG-NSFW)

```
### 🔞 Toys tab redesign
- New header: big connection status, Connect / Search devices, STOP EVERYTHING always visible, max intensity, "off after X s without signal" and the avatar-control main switch in one row; connection details collapsible.
- Device cards with live output bar, battery, capabilities (vibration, stroker, rotation …), test pulse, mute and per-device stop.
- Per device: Off / Follows my avatar (simple, with templates: gentle, balanced, intense, motion, touch only) / Expert.
- Expert sources: zones picked from the avatar you are wearing (SPS, OGB, TPS, VFH) with live values, mode depth / motion / both, range (dual slider), curve, smoothing, idle level, motion sensitivity, "ignore own touches"; the strongest source is marked live (★).
- Custom source picker in Nexus style (grouped, descriptions, live values, keyboard, search) instead of the native drop-down; dark colour scheme for remaining native selects.
- Strokers can follow penetration depth with position commands (LinearCmd), top speed, bottom/top limits and rest position; rotation can follow in/out motion.
- Export / import a device mapping as a text code.
- TPS (Thry's Penetration System) detected as a source.
- Safety unchanged: age clearance, STOP / panic / red light take priority and also halt strokers, max intensity caps everything.
```

## Geänderte / neue Dateien

- `apps/vrc-nexus/backend/toysrc.js` (neu) – reine Logik: Modus/Bereich/Kurve/Glättung/Leerlauf, Bewegung, Stroker-Planer, Vorlagen, Zonen-Liste, Export/Import.
- `apps/vrc-nexus/backend/toys.js` – Quellen-Modus je Gerät (`src_mode`, `preset`, `lin_mode`, `lin_speed`, `lin_rest`, Rotation `move`), Auswertung je Quelle mit Gewinner (`link_info`), Stroker folgt der Tiefe, Zonen-Reset bei Avatar-Wechsel, neue Aktionen `toys_live`, `toys_follow`, `toys_links_export`, `toys_links_import`; Auswerte-Takt 250 → 100 ms.
- `apps/vrc-nexus/backend/haptics.js` – TPS-Erkennung.
- `apps/vrc-nexus/renderer/js/nexus-toys2.js` (neu) – neuer Reiter inkl. eigenem Auswahl-Menü und Live-Anzeige.
- `apps/vrc-nexus/renderer/js/nexus-nsfw.js` – bindet den neuen Reiter ein (alte Ansicht bleibt als Rückfall).
- `apps/vrc-nexus/renderer/js/nexus-nsfw2.js` – Geräte-Feineinstellungen und Verbindungs-Optionen als wiederverwendbare Bausteine (`devBody`, `connHtml`).
- `apps/vrc-nexus/renderer/page.html`, `renderer/css/app.css` (Abschnitt `t2-*`, `color-scheme`).
- `apps/vrc-nexus/renderer/i18n/14.tsv` (neu, 134 Einträge DE/EN/FR/JA), `renderer/js/i18n-dict.js` (neu gebaut).
- `apps/vrc-nexus/tests/backend.test.js` – neuer Test „8.3: 🔞 Spielzeug-Quellen 2.0 …“ (nur Mocks).

Screenshots (nur lokal, nicht im Repo): `/tmp/claude-0/-home-user/31e02857-c6ba-52f5-92db-f58542b7414f/scratchpad/shots/` (01-overview, 02-expert, 03-menu, 04-menu-search, 05-mobile). Erzeugt mit Playwright/Chromium aus echten Backend-Daten (nachgebaute Geräte und OSC-Werte).

## Übernommene Konzepte (in eigenen Worten, Quelle nur gelesen: OscGoesBrrr, GPL-3.0 – kein Code, Text oder Layout übernommen)

- Je Zone wird zwischen „von mir“ und „von anderen“ unterschieden und pro Quelle gewählt, ob Nähe/Tiefe oder Bewegung zählt – bei uns als Modus Tiefe / Bewegung / Beides plus „Eigene Berührungen ignorieren“.
- Bewegung = Änderung der Tiefe über die Zeit (Ableitung); ohne neue Werte muss sie schnell abklingen.
- Linear-Geräte folgen der **Tiefe**, nie der Geschwindigkeit; tiefer = weiter unten; nach einer Ruhezeit fährt das Gerät in eine Ruhestellung; Geschwindigkeit ist begrenzt. Unsere Umsetzung: einfacher Planer mit Höchsttempo → Dauer des `LinearCmd`, Mindestabstand, Ruhestellung (ohne Beschleunigungsmodell).
- Mehrere Quellen je Gerät, die stärkste gewinnt; Totzone/Skalierung als Formung (bei uns: Bereich, Kurve, Glättung, Leerlauf; alte Mutatoren bleiben).
- TPS-Parameter: `TPS_Internal/Pen/<id>/RootRoot` (Plug) und `TPS_Internal/Orf/<id>/Depth_In` (Socket) als Tiefe von anderen (Schnittstelle, Namen gleich).
- Rotationsrichtung kann aus der Bewegungsrichtung (rein/raus) kommen.
- Zonen werden pro Avatar gesammelt und beim Avatar-Wechsel verworfen.
- Nicht übernommen (offen): Längen-Schätzung aus Root/Tip-Nähe, `_SenderVelocityMagnitude`, Höchststärke über Avatar-Parameter.

## Buttplug-Bibliothek – Entscheidung

Geprüft: npm `buttplug` 5.0.2 (BSD-3-Clause, buttplugio/Nonpolynomial, Abhängigkeiten `ws`, `eventemitter3`). **Nicht eingebunden.** Begründung: Die eigene Umsetzung spricht Buttplug-Spec v3 bereits vollständig für unseren Bedarf (ScalarCmd mit allen Aktor-Arten, RotateCmd, LinearCmd, StopDeviceCmd/StopAllDevices, SensorRead/Subscribe inkl. Akku/RSSI/Druck/Knopf, ältere BatteryLevelCmd, DeviceMessageTimingGap, Ping, Fehlercodes, Auto-Reconnect, Erkennung „anderes Programm verbunden“) und ist durch Tests mit Mocks abgedeckt. Die Bibliothek in Version 5 zielt auf eine neuere Spec-Version, bringt zwei zusätzliche Laufzeit-Pakete ins Android-Bündel und hätte einen Umbau von Verbindung, Fehlermeldungen und Tests bedeutet – ohne neue Fähigkeit für diesen Reiter. Sinnvoll wäre sie, sobald Intiface die v3-Nachrichten nicht mehr anbietet (siehe offene Punkte).

## Tests

- `npm test`: alle grün (siehe Bericht), neuer Test für Quellen-Logik, Stroker-Positionen, TPS, Einfach/Experte, Teilen, Ampel/Stopp/Höchststärke/Freigabe.
- `apps/vrc-nexus-android`: `node build.mjs` baut.

## Offene Punkte

- Buttplug-Spec v4 (neue Nachrichtenformen) noch nicht unterstützt – bei Bedarf mit der offiziellen Bibliothek nachrüsten.
- Längen-Schätzung für genauere Tiefe (Root/Tip) und native Geschwindigkeit (`…_SenderVelocityMagnitude`) aus SPS sind noch nicht genutzt.
- „Knopf am Gerät“ ist weiterhin eine Geräte-Aktion (Verbindung → Knopf am Gerät), keine eigene Quelle.
- Das alte Modul `nexus-toylinks.js` wird noch geladen (Rückfall), aber im neuen Reiter nicht mehr angezeigt – kann in einem späteren Release entfernt werden.
- Handy-Fernbedienung und Web Nexus zeigen den neuen Reiter nicht (unverändert).
