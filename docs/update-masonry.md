# Update: Mauerwerk-Raster (Masonry) + volle Breite – Notizen für den Koordinator

## Was (DE, kurz)
- **Mauerwerk-Raster für alle Karten-Raster** (`renderer/js/nexus-masonry.js`, eigene Umsetzung ohne Abhängigkeit, Desktop + Web-Nexus-Modus + Android bündeln dieselbe Datei):
  CSS-Grid bekommt feine 4-px-Zeilen (Klasse `nxm-on`), jede Karte belegt per `grid-row-end: span N` genau ihre Höhe → Karten rutschen in jeder Spalte nach oben, keine Lücken mehr (z. B. 🔞 → Spielereien, Lust & PCS, Spiel & OSC → Live/Kamera/Puls, Statistik, Rückblick, Admin).
  ResizeObserver (Karten + Raster), MutationObserver (neu gerenderte Inhalte), Bündelung per requestAnimationFrame, ausgeblendete Elemente werden übersprungen, einspaltig (Handy) bleibt alles unverändert.
  Reihenfolge bleibt; nur wenn eine Karte über mehrere Spalten geht (`grid-column: 1 / -1`), dürfen spätere Karten die Lücke darüber füllen (`dense`).
  Gilt für: `.nc-grid, .rc-grid, .vx-cols, .sh-grid, .sb-evgrid, .sb-cfg, .sp, .pl-list, .pl-mkgrid, .vx-inst, .nw-grid, .cl-grid` sowie automatisch jedes mehrspaltige Grid, dessen Kinder `.nc-card/.nw-card/.nx-panel/.panel` sind.
  Bewusst nicht: Start-Seite (`.hm-grid` hat schon eigenes Mauerwerk), Kalender (`.dy-grid`), Kennzahlen-/Kachel-Raster (`*-kpis`, `.perf-grid`, `.tg-games`, `.tg-badges`, `.vx-grid` Freundeskarten), Formulare (`.nx-form`, `.cl-form`).
- **Volle Breite**: Community-Feed, Community-Profil, Profil-Formular und Puls-Opt-in-Karte hatten `max-width` (680–900 px) → entfernt. Nutzer-/Freundes-Profil-Popup war schon volle Breite. Fensterbreite „ui.wide“ ist Vorgabe (an).

## English changelog text
- **Masonry layout everywhere:** card grids no longer leave large empty gaps under shorter cards – cards now stack up in every column (e.g. 🔞 → Fun stuff, Game & OSC, Charts, Recap, Admin). Content and the community feed/profile now use the full width.

## Geänderte Dateien
- `apps/vrc-nexus/renderer/js/nexus-masonry.js` (neu), `renderer/page.html` (Skript eingebunden), `renderer/css/nexus.css` (`.nxm-on`-Regeln), `renderer/css/app.css` (max-width entfernt).
- Keine neuen UI-Texte, keine Backend-Änderung. Android: `node build.mjs` ok (Datei landet in www/).

## Geprüfte Seiten (Playwright, Attrappen-Backend, freigeschaltetes 🔞, Besitzer-Konto)
321 Ansichten × Breiten 1366 / 1920 / 420 px: alle Hauptreiter (home, feed, notifs, search, locations, players, community:*, friends, groups, clubs:*, together/*, wiki, netgraph, moderation, pulse, favs:*, coll, client + alle Unterreiter (live, params, debug, osclog, osctools, mods, heart, comfort, obs, space, cam, macros, auto, log, people, visits), tools, diary/*, perf, smarthome, warn, mod, calendar, gallery, shop, settings, stream, plugins, avatars, worlds, activity, network, global, stats, recap, admin, nsfw + alle 🔞-Reiter (main, toys, lust, col, fun, x3, lab, net, safe2, fantasy, care, safety, couple, lib, help, phone)).
Messung: Abstand Unterkante Karte → Oberkante nächste Karte derselben Spalte (abzgl. Kartenränder) > 24 px = Lücke.

| Ansicht | Raster | vorher (px je Breite) | nachher |
|---|---|---|---|
| admin | div.nc-grid | 1366:258 1920:93 | ok (nur über Mehrspalten-Karte 203) |
| client | div.nc-grid | 1366:353 | ok |
| client/=cam | div.nc-grid | 1366:293 | ok |
| client/=heart | div.nc-grid | 1366:48 | ok |
| client/=live | div.nc-grid | 1366:353 | ok |
| client:log/=cam | div.nc-grid | 1366:293 | ok |
| client:log/=heart | div.nc-grid | 1366:48 | ok |
| client:log/=live | div.nc-grid | 1366:353 | ok |
| diary | div.dy-grid | 1366:54 1920:54 420:54 | 1366:54 1920:54 420:54 |
| diary/d=day | div.dy-grid | 1366:54 1920:54 420:54 | 1366:54 1920:54 420:54 |
| nsfw | div.nc-grid | 1366:183 1920:183 | ok |
| nsfw/n=care | div.nc-grid | 1366:40 | ok |
| nsfw/n=fun | div.nc-grid | 1366:452 1920:771 | ok |
| nsfw/n=lab | div.nc-grid | 1366:189 1920:196 | ok (nur über Mehrspalten-Karte 131) |
| nsfw/n=lust | div.nc-grid | 1366:189 1920:345 | ok (nur über Mehrspalten-Karte 171) |
| nsfw/n=main | div.nc-grid | 1366:183 1920:183 | ok |
| nsfw/n=safe2 | div.nc-grid | 1366:147 | ok |
| perf | div.perf-grid | 420:39 | 420:39 |
| recap | div.rc-grid | 1366:213 1920:213 | ok |
| stats | div.vx-cols | 1366:168 1920:163 | ok |
| together/=badges | div.tg-badges | 1920:35 | 1920:25 |
| together/=games | div.tg-games | 1366:30 420:30 | ok |

Ergebnis: Karten-Lücken vorher 35 (Ansicht × Breite), nachher 0 in Karten-Rastern. Verbleibend nur bewusst nicht angefasste Raster: Tagebuch-Kalender (`.dy-grid`, Zeilen müssen fluchten), Kennzahl-Kacheln (`.perf-grid` am Handy, `.tg-badges`). Über Karten, die über die ganze Breite gehen (z. B. PCS in „Lust & PCS“, Admin), bleibt ein Rest (≤ 200 px), wenn keine spätere Karte in die Lücke passt.
Breite: keine Inhalts-Container unter 95 % mehr (vorher `.pl-optin` 50–84 %, `.cm-feed/.cm-prof/.cm-pform` 760 px).
Screenshots: /tmp/claude-0/-home-user/31e02857-c6ba-52f5-92db-f58542b7414f/scratchpad/masonry/shots/ (before-* / after-*).

## Offene Punkte
- Test „8.2: Alltag …“ schlägt im aktuellen Arbeitsstand fehl (123/124) – auch ohne diese Änderung (andere, nicht von mir stammende Änderungen im Arbeitsverzeichnis, u. a. tests/backend.test.js, backend/app.js, streamdeck).
- Login-Seite (`.vx-login`, 460 px) bleibt schmal (keine Seitenleisten, Anmelde-Dialog).
