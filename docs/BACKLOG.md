# Backlog – Fehler & Ideen

Sammelliste, bis genug für ein Update zusammen ist. Neue Einträge oben in der passenden Liste. Erledigte Punkte werden mit Version abgehakt.

Format: `- [ ] **Bereich** – Beschreibung` (Quelle/Datei, falls bekannt)

## 🐞 Fehler

- [ ] **Gruppen-Moderation** (Profil/Moderation → „Gruppen-Moderation“) – Jede Gruppe ist eine große Karte mit allen Knöpfen, die Liste wird sehr lang. Ziel: **aufklappbar (Dropdown/Akkordeon)** – zugeklappt nur Bild, Name, Mitglied seit/Rollen-Kurzinfo; Rollen, + Rolle, Entfernen, Bannen, Bann aufheben, Gruppe öffnen erst nach dem Aufklappen.
- [ ] **Profil-Fenster eines Nutzers** (z. B. Freund öffnen) – Aufbau neu ordnen:
  - **Linke Spalte fixiert**, nur der rechte Bereich (Reiter Info, Gemeinsame Freunde, Gruppen …) **scrollt**.
  - Knöpfe **Nachricht / Anrufen / Community-Profil** aus der Nexus-Community-Zeile **in die linke Spalte** unter die Profilkarte (drei Knöpfe nebeneinander).
  - Die fünf Werte-Kacheln (Im Spiel 7 Tage, Im Spiel 30 Tage, Sitzungen, Zuletzt gesehen, Freund seit) **untereinander in die linke Spalte** darunter.
  - „Wann ist X online?“ (Heatmap) bekommt die **linke Hälfte** des Info-Reiters, **„Meine Notiz“** (mit Favorit, Benachrichtigen, Eigene Listen) rückt **rechts daneben nach oben**.
  - Abschnitt **„Gemeinsam“ (gemeinsame Freunde)** aus dem Info-Reiter **entfernen** – gibt es schon im Reiter „Gemeinsame Freunde“.

## 💡 Ideen

- [ ] **Chatbox + Chatbox-Studio zusammenführen** (Werkzeuge → Chatbox) – heute zwei getrennte Karten (links „Chatbox“ mit Textfeld, Emojis, Übersetzen, Senden, Zuletzt; rechts „Chatbox-Studio“ mit Vorschau, Platzhaltern, Vorlagen, Schnelltexten, Geplant, Verlauf). Ziel: **ein gemeinsamer, schönerer Editor** – oben Textfeld mit Live-Vorschau „wie in VRChat“ direkt darunter, Platzhalter/Emojis/Kaomoji als einklappbare Leisten oder Einfüge-Menü am Textfeld, Optionen (Übersetzen, lange Nachrichten aufteilen, Tipp-Anzeige, Ton, Verzögerung) als kompakte Schalterzeile, Senden/Leeren/Als Schnelltext speichern/Planen als eine Aktionsleiste; Schnelltexte, Vorlagen, Geplant und Verlauf als Masonry-Karten darunter. „Zuletzt“ und „Verlauf“ zusammenlegen (doppelt). Volle Breite, Masonry, keine Lücken.

## ✅ Erledigt

### Erledigt (8.2.0)

- [x] **Geräte (Tools → 📡 Geräte)** – Karten „Verbindung“ und „Gekoppelte Geräte“ nutzen jetzt die ganze Breite (zwei gleich breite Spalten, auf schmalen Fenstern eine). Nur CSS (`renderer/css/app.css`, `#toolBody > .nc-grid:has(.nw-design)`).
- [x] **Geräte** – Nie verbundene Geräte zeigen „noch nie verbunden“ statt „zuletzt noch nie“ (`ago()` in `nexus-watch.js`).
