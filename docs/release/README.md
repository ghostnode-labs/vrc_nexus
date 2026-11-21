# Release 3.0.0 – veröffentlicht am 20.11.2026 (Patch bleibt zur Nachvollziehbarkeit)

`3.0.0.patch` enthält Versionssprung (2.15.3 → 3.0.0), README-/NSFW-Changelog und gebaute changelog*.json.
Ein Push davon startet sofort Build + Release + Auto-Update. Erst anwenden, wenn
1. die GhostNode-Webseite (ghostenode `main`) auf privat.sylvanclub.eu hochgeladen ist und
2. unter Admin → 🪪 Nexus-Konten das Dienst-Konto gewählt ist.

Anwenden: `git apply docs/release/3.0.0.patch && (cd apps/vrc-nexus && node scripts/changelog-build.js && npm test)` → committen → pushen.

## Versionsschema (Vorgabe der Besitzerin, 21.11.2026)

Versionen haben immer die Form **x.0–9.0–9** – es gibt **keine** `x.10.x` und keine `x.y.10`.
Nach `x.y.9` folgt `x.(y+1).0`, nach `x.9.9` folgt `(x+1).0.0` (z. B. 3.8.9 → 3.9.0, 3.9.9 → 4.0.0).
Der Test „Versionsschema“ in `apps/vrc-nexus/tests/backend.test.js` prüft das und dass App, package.json, Lockfile und Android-App dieselbe Version haben.
