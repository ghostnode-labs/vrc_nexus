# 🔞 NSFW changelog

Shown in the app under “About” only when NSFW is unlocked. README, GitHub release and Discord show “🔞 ***” instead.

### New in 3.9.0 – Nexus Pulse

- 📡 **r/VRchatERP in Nexus Pulse:** with the 18+ unlock and the switch "Show 18+ subreddit" (Settings → Social → Nexus Pulse) a third source appears with new, popular and top posts plus comments. Previews stay blurred until you tap them; favourites from it are refused without the unlock.

### New in 3.4.0 – Menu

- 🧭 **NSFW / ERP** now sits in the sidebar section "Game & more" (below Stream bot) – still only visible while NSFW is unlocked.

### New in 3.3.1 – Panic button in the header

- 🚨 **Panic button moved to the top:** while NSFW is switched on, a **Panic** button sits in the header next to Quick access and Settings. It runs the panic actions (safe avatar, clear chatbox, stop toys, private mode – as configured under NSFW / ERP) and switches NSFW off again.

### New in 3.2.0 – NSFW world descriptions

- 🔞 **NSFW world descriptions:** in the world window there is a new “🔞 NSFW description” tab next to “Info”. Verified 18+ people with NSFW on can write their own description of a world (Markdown allowed) and read the others'; everyone else only sees that descriptions exist – the website enforces this. Moderators can remove descriptions.
- 🔞 **Share in the NSFW feed** directly from the world window.

### New in 3.1.2 – NSFW overhaul completed

- 🔒 **Toy remote via the GhostNode website now checked on the server:** sending and receiving through the website relay needs your Nexus account with Verified 18+ and NSFW switched on, and you can only read your own mailbox. Your own relay address keeps working as before (your account token is never sent there).
- 👁 **Who can see your 18+ profile:** everyone with Verified 18+ and NSFW on (default) or only you.

### New in 3.1.1 – 18+ profile

- 🔞 **18+ profile in the Community:** next to your profile there is now an 18+ section – role, behaviour, open to contact, safer-sex policy, “can host” and a kink list with separate ratings for *receive* and *give* (♥ love it · 👍 like it · 〜 maybe · 👎 no). Only Verified 18+ people with NSFW switched on can see it; the website enforces this.
- 🎚 **NSFW switch right in the Community bar** (top right) – no detour via the settings.
- 👤 **18+ tab in VRChat profiles:** if someone has an 18+ profile and you are allowed to see it, their profile window gets a “🔞 18+ profile” tab right after “Info”.

### New in 3.0.1 – Age check directly with VRChat

- 🔞 **Verified 18+ is now checked directly with VRChat:** the app asks VRChat for your own account’s age verification (`/ageVerification/status`) with your own login – it no longer has to be visible on your profile, and the website no longer needs a separate checking account. Re-checked at start, every 6 hours and one day before it expires; if VRChat is unreachable, nothing changes. If VRChat stops reporting 18+, NSFW is locked and you get one notice.

### New in 3.0.0 – NSFW overhaul: Verified 18+

- 🔞 **NSFW now only with “Verified 18+”:** your VRChat age verification (`18+`) must be completed and **visible** on your profile. The GhostNode website checks it itself (never the app), re-checks it every 7 days and one day before it expires; if the status disappears, NSFW is locked immediately and you get a single notice.
- 🎚 **NSFW is off by default** and must be switched on deliberately (Settings → Advanced → Nexus account) – it can be switched off any time. Unlock keys (NXK1) no longer unlock NSFW – for everyone, including the owner.
- 🫂 **Separate NSFW feed** in the Community: NSFW posts, replies, images and the 18+ profile section only for Verified 18+ with NSFW on – never in the normal timeline. NSFW images appear only after a moderator approves them; moderators can move posts that were wrongly marked SFW into the NSFW feed.
- 🌐 **Toy remote control:** the receiver now asks GhostNode whether the sender is Verified 18+ with NSFW on (only possible if you are cleared yourself) – no unlock key needed anymore.

### Neu in 2.12.1 – Selbsttest der Fernsteuerung

- 🧪 **Selbsttest der Fernsteuerung:** Unter „🎮 Partner steuern“ die eigene ID eintragen (oder auf „🧪 Ich“ klicken) – dann steuert die App dein eigenes Spielzeug direkt auf diesem PC, ohne Freigabeliste. „Fernsteuerung empfangen“ muss dafür an sein; die Höchststärke von außen gilt auch hier.

### Neu in 2.12.0 – Spielzeug-Fernsteuerung über User-ID

- 🌐 **Spielzeug-Fernsteuerung über die User-ID** (NSFW → 🌐 Fernsteuerung): Nexus steuert Nexus – nur die User-ID des Partners eintragen, sonst nichts.
  - Im selben WLAN **direkt** (findet den PC des Partners automatisch), sonst **automatisch über die GhostNode-Seite** (privat.sylvanclub.eu, `toyrelay.php`).
  - **📥 Mich steuern lassen:** Freigabeliste (`usr_… | Name`), Höchststärke von außen, wer gerade steuert, Verlauf, 🚫 Beenden.
  - **🎮 Partner steuern:** 📡 Verbinden (mit Rückmeldung), Stärke-Regler, alle Muster, 🎁 Überraschung, ⏹ Stopp.
  - **Sicherheit:** nur IDs auf deiner Liste **und** mit gültigem Freischalt-Schlüssel (Spielzeug) für genau diese ID; Befehle 60 s gültig und nur einmal; ohne Signal nach 15 s aus; Muster max. 5 min; 🚨 Panik schaltet den Empfang aus.

### Neu in 2.11.0 – NSFW: Untertabs, Muster & Spielereien

- ❤️ **NSFW mit Untertabs:** 🏠 Übersicht · 🎮 Spielzeug (Intiface / Buttplug.io, eigener Untertab) · 🎲 Spielereien · 📱 Handy.
- 🌊 **Muster** für das Spielzeug: Welle, Puls, Herzschlag, Treppe, Zufall, Gewitter, Necken, Achterbahn – mit Tempo, Stärke, Dauer (endlos bis 20 min) und Gerätewahl. Läuft im Hintergrund weiter, Panik und ⏹ stoppen sofort; Verknüpfungen laufen parallel (die stärkere Quelle zählt).
- 🎁 **Überraschung:** zufälliges Muster, Tempo und Stärke für 20–60 s – auch über die Handy-Fernbedienung.
- 📊 **Sitzung:** aktive Zeit, Spitze, Anzahl Muster (nur im Speicher, wird nicht gespeichert).
- 💬 **Stimmung** (ein Klick → Chatbox), 🤝 **Consent-Check** („Alles okay? 🟢🟡🔴“, auch am Handy), 🎯 **Wahrheit oder Pflicht**, 🎲 **Flirt-Würfel**, ⏳ **Countdown** in der Chatbox. Im Privat-Modus ist die Chatbox gesperrt.
- 📱 Handy-Fernbedienung: Muster-Knöpfe, „Muster aus“, 🎁 Überraschung und 🤝 Nachfragen.

### Neu in 2.10.0 – 🐞 Avatar-Debugger

- In ❤️ NSFW / ERP → Spielzeug gibt es einen Knopf direkt dorthin – so siehst du, wie deine SPS-Zonen heißen.

### Neu in 2.9.9 – Fehler bei 0.0.0.0 behoben

- Fehler aus 2.9.8 behoben: die Adresse `ws://0.0.0.0:12345` aus Intiface wird jetzt wirklich zu `127.0.0.1` umgestellt (2.9.8 brach beim Speichern ab).

### Neu in 2.9.8 – Intiface-Adresse aus Intiface übernehmen

- **Intiface-Adresse `0.0.0.0`** (so zeigt Intiface sie an) wird jetzt automatisch zu `127.0.0.1` – einfach die Adresse aus Intiface übernehmen und verbinden.

### Neu in 2.9.7 – Intiface-Adresse 0.0.0.0 erklärt

- **Intiface-Adresse**: `0.0.0.0` wird mit einer Erklärung abgelehnt (das ist nur die „hört im ganzen Netz“-Anzeige von Intiface – verbunden wird mit der echten Handy-IP). Eine alte Fehlermeldung verschwindet, sobald man die Adresse ändert.

### Neu in 2.9.5 – Intiface auf dem Handy: klare Hinweise

- **Intiface auf dem Handy**: Die Fehlermeldung nennt jetzt genau, was am Handy eingestellt sein muss („Listen on all network interfaces“, Server neu starten, gleiches WLAN, Akku-Optimierung für Intiface aus). In der Spielzeug-Karte steht ein Hinweis dazu.

### Neu in 2.9.4 – Intiface-Verbindung: automatische Adresse & klare Fehler

- **Intiface verbinden – bessere Erkennung**: Antwortet die eingetragene Netzwerk-IP nicht, Intiface aber unter `127.0.0.1`, stellt VRC Nexus die Adresse **automatisch** um (Intiface hört von Haus aus nur auf dem eigenen PC).
- **Klare Fehlermeldungen** statt „nicht erreichbar“: „auf dem Port läuft nichts → Start Server drücken“, „andere IP → Listen on all network interfaces / Firewall“ oder „Intiface lehnt ab → **schon ein anderes Programm verbunden** (z. B. VRCFury Haptics, OscGoesBrrr) – Intiface erlaubt nur eine Verbindung“.

### Neu in 2.9.2 – Spielzeug-Verknüpfungen (SPS) & Admin nur für den Besitzer

- **🔗 Spielzeug-Verknüpfungen** (❤️ NSFW / ERP → Spielzeug): pro Gerät beliebig viele Quellen, die stärkste zählt:
  - **SPS-Plugs, SPS-Sockets, SPS-Touch-Zonen** (Avatar-Parameter im OGB-/VRCFury-Format) – mit **Einschließen/Ausschließen** einzelner Zonen nach Namen (gesehene Zonen stehen zur Auswahl) und **„berührt von“**: fremde Sockets/Plugs, fremde Hände/Füße/Kopf, eigene Sockets/Plugs, eigene Hände.
  - **Konstant** (fester Wert) und **Avatar-Parameter** (beliebiger Parameter).
  - **Mutatoren** je Verknüpfung: **Skalieren**, **Totzone**, **Bewegung** (Stärke nach Bewegung statt Tiefe).
  - Geräte bleiben mit ihren Verknüpfungen gespeichert, auch wenn sie gerade nicht verbunden sind; Live-Pegel je Gerät. Hauptschalter „Verknüpfungen aktiv“ – Not-Aus und Panik schalten ihn aus.

### Neu in 2.9.0 – ❤️ NSFW / ERP mit Freischalt-Schlüsseln, Intiface + OGB, Handy-Fernbedienung

- **❤️ NSFW / ERP**: neuer Menüpunkt, der **nur mit gültigem Freischalt-Schlüssel** (bzw. für den Besitzer) erscheint. Schlüssel eintragen unter Einstellungen → Erweitert → 🔑 Freischalt-Schlüssel.
  - **🚨 Panik-Knopf**: sicherer Avatar, Chatbox leeren & Module aus, Privat-Modus, Spielzeug stopp – einzeln wählbar.
  - **🕶 Privat-Modus**: kein Discord-Status, keine Chatbox-Module, kein Rotator.
  - **SFW ↔ NSFW-Avatarpaare** per Knopf umschalten, **Grenzen-Karte** (🟢 Ja / 🟡 Vielleicht / 🔴 Nein) in die Chatbox, **18+-Instanz** (Invite oder 18+-Gruppe mit Altersschranke) mit Einladung an dich.
  - **🎮 Spielzeug über Intiface Central (Buttplug.io)**: verbinden, Geräte suchen, Stärke-Regler je Gerät, Not-Aus, Höchststärke, automatisch aus ohne Signal.
  - **💞 OGB / SPS**: Avatar-Parameter im OscGoesBrrr-/VRCFury-Format (`…/PenOthers`, `…/TouchOthers`, `…/FrotOthers`) steuern das Spielzeug automatisch – eigene Berührungen optional; dazu eigene Regeln „Parameter → Stärke“.
  - **📱 Handy-Fernbedienung**: kleine Seite im Heimnetz über die IP des PCs + eigenen Schlüssel (Panik, Privat-Modus, Avatar-Paare, Grenzen-Karte, Spielzeug-Regler). Eigener Port, eigener Schlüssel – die Stream-Deck-Schnittstelle bleibt nur auf diesem PC.
