# 🔞 NSFW changelog

Shown in the app under “About” only when NSFW is unlocked. README, GitHub release and Discord show “🔞 ***” instead.

### New in 6.2.0 – Scene builder

- 🧱 **Scene builder** (🔥 Lust & PCS → *Scene builder*): build your own scenes from steps – a pattern (also your own patterns) with strength, speed and duration, or a ⏸ pause. Up to 30 steps, reorder them, save up to 50 scenes on this device only.
- 🔁 **Rounds & build-up:** a scene can run up to 10 rounds and get stronger each round (0–30 % per round, never above 100 %).
- 🎬 While it runs the scene timer shows step, round, strength and time left; ⏭ skips to the next step. At the end the toys power down and the aftercare reminder comes.
- 🛑 **Safe by design:** red on the consent light, ⏹ stop, panic, the safeword of a consent check or private mode end the scene immediately – no further step starts. A scene can't be started on red or in private mode.

### New in 6.0.0 – NSFW major: 18+ requests, connections & consent check

- 💌 **18+ requests** (Community → *💌 18+ requests*, in the profile and on Nexus Web): send someone with Verified 18+ and NSFW on a request with a short message. They accept or decline – a decline is shown to you only as “not accepted”. Limits: 20 requests a day, no duplicates, 30 days pause after a decline, open requests expire after 14 days.
- 💞 **Connections:** after both agree you are connected. Your 18+ profile can now be shown **only to your connections** (new visibility option). Either side can unlink at any time – that also ends running consent checks.
- 🧩 **Compatibility** (only between connections): your preferences (receive / give) are compared – 💚 match, 💛 maybe, 🚫 conflict, with a score. Just a conversation starter.
- 🤝 **Consent check:** one side proposes – traffic light 🟢🟡🔴 (🔴 starts nothing), limits for today, safeword, duration (5–240 min) and whether toys are allowed. The other side agrees with their own terms; the **shorter duration wins** and both see each other's safeword and limits.
- 🛑 **Safeword button** ends the session for both sides immediately and **stops all toys** in the app; “done” and “withdraw” as well.
- Works the same in the app and on Nexus Web (same Nexus account); everything is checked on the server (Verified 18+, NSFW switch).

### New in 5.3.0 – Panic from watch and phone switches NSFW off

- 🚨 Panic on the **Nexus Watch** and in the **paired phone app** now works exactly like the panic button at the top of the PC app: all panic actions run and **NSFW is switched off on your Nexus account** – the app leaves the NSFW page right away. If the GhostNode server can't be reached, NSFW is switched off locally anyway.
- 🌐 Nexus Web: a separate 18+ / ERP area in the browser (NSFW feed, r/VRchatERP via the website, your 18+ profile text, safety rules) – only with Verified 18+ and NSFW switched on.

### New in 5.2.3 – Emergency from the phone

- 📱 The paired Android app gets an emergency card: 🚨 panic (with confirmation), ✅ all-clear / 🕶 private mode, consent light 🟢🟡🔴 and ⏹ stop toys – same unlock rules as on the PC; when locked the app shows why.

### New in 5.2.2 – Nexus Watch: emergency page

- 🔞 **Emergency tile** in the watch menu: 🚨 panic (tap twice – can be switched off in the settings), ✅ all-clear / 🕶 private mode, consent light with the current colour, ⏹ stop toys.
- **Panic stays reachable in private mode** (before, the 🔞 buttons disappeared after the first panic); the watch gets an answer after 2.5 s while slow parts (avatar switch, Wallpaper Engine, OBS) finish in the background.

### New in 5.2.0 – Nexus Watch

- ⌚ On the watch (only while NSFW is unlocked and private mode is off): 🚨 **panic button** (with vibration), ✅ all-clear, 🕶 private mode, **consent light** 🟢🟡🔴 and ⏹ **stop toys** – the same rules as in the app apply (Verified 18+, NSFW switch).
- In private mode the watch shows no world name.

### New in 5.1.0 – NSFW 3.1: your own collection & 18+ profile

- 🗂 **Own NSFW collection** (new tab *🗂 Collection*): worlds and avatars in your own lists – separate from the normal favourites and stored **encrypted on this device only**. Tags, private notes, 1–5 star rating, search, filter by list/tag/rating, sort by newest, name, rating, most or recently used.
- ➕ **Add from anywhere:** world and avatar windows get a **🔞 Collection** chip next to the local favourites; or paste an ID/link. Name, picture and author are fetched automatically.
- 💡 **Suggestions:** worlds you visit and avatars you wear with VRChat 18+ content tags (`content_sex`, `content_adult` …) are suggested – never added automatically; "don't suggest again" is remembered.
- 📈 **Usage:** visits and wearing are counted automatically (can be switched off).
- 🎲 **Random pick** (weighted towards good ratings and places you haven't been for a while), **🚪 invite instance / 🔞 18+ group instance** in one click, **🎭 wear** avatars directly.
- 👤 **NSFW avatars & worlds in your 18+ profile:** mark up to 12 avatars and 12 worlds with 👤 and publish them to your GhostNode community 18+ profile (only ID, name and note – visible only to Verified 18+ with NSFW on). Saving the 18+ profile editor keeps them.
- 🕶 **Private mode / panic:** the collection is hidden until you show it on purpose; nothing goes to chatbox, Discord or OBS.
- ⇩⇧ **Export / import** as JSON (without usage data).

### New in 5.0.0 – NSFW 3.0

NSFW 2.0 was skipped – everything planned for it is in 3.0. New tab **✨ Extras** (toys unlocked, Intiface connected). The consent light, panic button, private mode and per-device limits apply to every new source.

- 📜 **Funscript player:** load a `.funscript` – vibration follows the movement speed (full stroke in 0.25 s = 100 %), strokers (LinearCmd) follow the positions directly; start, stop, loop. Inverted scripts are supported.
- 🎲 **Game modes:** *Dice* (random intensity and duration per round), *Roulette* (one random device per round), *Edging game* (intensity rises – press **✋ Hold!** in time for points; reaching the edge (lust ≥ 97 %) loses the round). Last result is shown.
- ⏺ **Record & playback:** records what your devices actually do (10 values per second and device, up to 10 minutes, 10 recordings) and plays it back later – another device plays the first track.
- 🧸 **Profiles per avatar:** save links, PCS, heart, voice, OGB and device settings for the worn avatar – loaded automatically when you switch to that avatar.
- 🌍 **World bridge:** worlds with the VRC Nexus UdonSharp block (`apps/unity-tools/World`) write `[NexusToy] pulse 0.6 2` / `set` / `stop` into the VRChat log; Nexus reacts only if you switched the bridge on, caps it with your own maximum (default 60 %) and ignores old log lines.
- 🎵 **Music:** system audio (loopback, nothing recorded or sent – only the volume is measured) drives toys, with gain and device choice.
- 🛑 **Remote 2.0:** **Safeword** button (everything off at once, receiving off, partner is rejected) and a **time limit** for receiving (minutes, 0 = none).
- 🧰 **Unity editor tool** (`apps/unity-tools/Editor`): adds `NX/Toy`, `NX/Lust`, `NX/Consent` (local or synced, budget check), detects SPS plugs/sockets, OGB and PCS, lists FX layers, warns about mixed Write Defaults and can create an `NX Consent` FX layer for your own traffic-light indicator.

### New in 4.3.0 – Panic button: Wallpaper Engine & all-clear

- 🖼 **Wallpaper Engine in the panic button:** switch to a harmless profile (e.g. "Brav"), pause the wallpaper or just mute it – Wallpaper Engine is found automatically via Steam (all libraries), or enter the path to `wallpaper64.exe`.
- ✅ **All-clear button:** turns private mode off, frees the chatbox rotation again and restores the wallpaper (play / unmute / your normal profile).
- If Wallpaper Engine isn't found, the panic still runs completely and only shows a hint.

### New in 4.2.0 – OSC overhaul (NSFW part)

- 🧲 **Much better SPS / OGB / PCS detection:** current VRCFury SPS names (`OGB/Plug/…`, `OGB/Socket/…`, `OGB/Touch/…` incl. `DepthSelf/DepthOthers`), old OGB names (`Pen/Orf` incl. `NewRoot/NewTip/Close`), old VRCFury Haptics (`VFH/…`) and PCS – measurement-only values (`LengthMult`, `DepthRadius`) no longer trigger toys.
- ⚡ **OGB/Enabled is switched on automatically:** VRCFury only activates its haptic contacts while `OGB/Enabled` is true (normally OscGoesBrrr does this). Nexus now sets it whenever OGB/SPS mode or device links are on – without it no SPS values arrive at all. Can be switched off.
- 🔍 **Avatar check** (🔥 Lust & PCS): shows which systems the worn avatar has – SPS version, plugs, sockets and touch zones, old OGB/VFH, PCS outputs and zones, `NX/Consent`, `NX/Toy`/`NX/Lust` – with hints (e.g. "Haptics was off in VRCFury when uploading").
- 🔁 **Feedback to the avatar:** if the avatar has the float parameters `NX/Toy` and/or `NX/Lust`, Nexus sends the current toy strength and lust (0–1) – for blushing, trembling, steam … Never in private mode.
- 🔒 **Privacy:** intimate parameters (OGB/VFH/PCS/SPS/TPS/DPS, NX/Lust …) are no longer written to the OSC log and are hidden in the avatar debugger while NSFW is locked or private mode is on.

### New in 4.1.0 – Edge of Glory 💦

The big NSFW overhaul: new tab **🔥 Lust & PCS**, a **🧩 device details** panel under 🎮 Toys and lots of new toy features straight from the Buttplug protocol (written by us from the open spec, no foreign code).

**🫦 PCS & lust (NSFW features)**
- **PCS – Penetration Contact System** (Dismay Custom) as a toy source: depth, velocity, sliding in/out, smash hits (strength 1–4), move-in and deep-throat pulses, quickening boost and lust as a base level – each with its own weight. "Seen" parameters are listed so you know they arrive (they have to be in the avatar's Expression Parameters).
- **PCS zones → own device**: new link type "🫦 PCS" with zones (mouth, boobs, pussy, ass, custom1–8) – e.g. one toy only reacts to the pussy socket.
- **💗 Lust meter** with 10-minute curve: taken from PCS (`pcs/satisfaction/lust`) or calculated by Nexus from how hard and how long your toys run.
- **💥 Climax actions** at 100 % lust or PCS event 10: climax pattern on the toys, optional chatbox line and an avatar bool parameter for 3 s (for squirt/blush toggles); also by hand.
- **🎯 Edging mode**: from a threshold the toys are braked to a low level until lust drops again; "release" lifts the brake for 2 minutes.
- **💓 Heart-rate coupling**: your pulse (Pulsoid/HypeRate/OSC) drives a toy, with your own bpm range.
- **🎙 Voice coupling**: moaning louder = stronger. Only the microphone level is measured, nothing is recorded or sent.
- **🚦 Consent traffic light**: 🟢 go on / 🟡 slower (dampened to your share) / 🔴 stop (everything off and blocked until green). Sets the avatar parameter `NX/Consent` (0/1/2) for a light on your avatar and optionally tells the chatbox; also on the phone remote.
- **🎬 Scene timer**: name + duration; at the end the toys wind down.
- **💞 Aftercare**: reminder after every session (desktop notification + optional chatbox line) and a checklist (water, cuddles, check-in …).
- **🎭 Scene ideas**: random place, roles, mood and a twist – inspiration only, always with consent.
- **SteamVR HUD**: new HUD items `lust` and `toy` (never in private mode), optional lust display in the chatbox.

**🎮 Toys – new Buttplug features**
- All actuator types: vibrate, oscillate, constrict, inflate (constrict/inflate default to 60 % for safety) with a share per type.
- **Rotation** devices (RotateCmd) with direction right/left/alternating every x seconds.
- **Strokers** (LinearCmd): strength becomes stroke speed, with an adjustable stroke range.
- **Battery** (SensorReadCmd/BatteryLevelCmd) shown per device, warning notification when low.
- **Signal strength** (RSSI) per device.
- **Sensors**: pressure live, device **button** → stop everything / surprise / next pattern.
- **Motors individually** (e.g. inner/outer motor of a rabbit) with "auto" to follow again.
- **DeviceMessageTimingGap** respected – no flooding of slow toys.
- **Stop a single device** (StopDeviceCmd).
- **Auto reconnect** to Intiface (2 s … 60 s back-off) and auto scan after connecting.
- **Own device names** and switching single devices off.
- **Minimum and maximum** strength per device.
- **Curve** per device (strong early ↔ gentle start).
- **Soft start / smoothing** per device (ramp in ms).
- **👆 Tap** a device to find out which one it is.
- **✏️ Custom patterns**: your own value list with step time, smoothly blended; usable everywhere patterns are.
- **6 new patterns**: 🫁 breath, 🪚 sawtooth, 🚪 knock, 📈 crescendo, 🆘 morse, 🎯 edge ride (+ 💥 climax).
- **Server info and clear error messages** (Intiface error codes in plain words, scan status).
- **Stop on disconnect**: Nexus sends "stop all" before closing the connection.
- **Runtime per device** and the step count of each motor.

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
