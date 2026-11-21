'use strict';
/*
 * App-Einstellungen: ein Schema (Reiter → Abschnitte → Felder) mit Standardwerten.
 * Gespeichert als JSON in der Tabelle settings (Schlüssel „app_settings“); die Oberfläche baut das Formular aus dem Schema.
 */
const crypto = require('crypto');
const { str, int, cut, UserError } = require('./util');

const STATUS = [['', '– nichts ändern –'], ['join me', '🔵 Join Me'], ['active', '🟢 Online'], ['ask me', '🟠 Ask Me'], ['busy', '🔴 Beschäftigt']];
const TABS = { system: '🖥 System', ui: '🎨 Oberfläche', social: '👥 Sozial', notify: '🔔 Benachrichtigungen', vr: '🥽 VR', media: '📷 Medien', tr: '🌐 Übersetzen', link: '🔗 Dashboard', int: '🔌 Integrationen', adv: '🧪 Erweitert', about: 'ℹ️ Über' };
const TR_LANGS = require('./translate').LANGS.map(l => [l[0], l[2]]);
const START_TABS = [['home', 'Startseite (Widgets)'], ['friends', 'Freundesliste'], ['feed', 'Verlauf'], ['locations', 'Freunde-Orte'], ['players', 'Spielerliste'], ['favs', 'Favoriten'], ['worlds', 'Welten'],
    ['avatars', 'Meine Avatare'], ['notifs', 'Benachrichtigungen'], ['tools', 'Werkzeuge'], ['client', 'Spiel & OSC']];

/* [schlüssel, reiter, abschnitt, typ, standard, beschriftung, hinweis, optionen] */
const FIELDS = [
    // ---------- System ----------
    ['sys.autostart', 'system', 'Start', 'bool', false, 'Mit Windows starten', 'Startet VRC Nexus beim Anmelden an Windows.'],
    ['sys.start_minimized', 'system', 'Start', 'bool', true, 'Beim Autostart nur im Infobereich starten', ''],
    ['sys.close_to_tray', 'system', 'Start', 'bool', true, 'Fenster schließen = im Infobereich weiterlaufen', 'Aus: Schließen beendet die App.'],
    ['sys.tray_count', 'system', 'Start', 'bool', true, 'Freunde online im Infobereich-Tooltip zeigen', ''],
    ['sys.hw_accel', 'system', 'Leistung', 'bool', true, 'Hardwarebeschleunigung', 'Wirkt nach einem Neustart der App.'],
    ['sys.log_poll_ms', 'system', 'Leistung', 'select', '1000', 'VRChat-Log prüfen alle', '', [['500', '0,5 s'], ['1000', '1 s'], ['2000', '2 s'], ['5000', '5 s']]],
    ['sys.global_sample', 'system', 'Leistung', 'bool', true, 'Weltweite Spielerzahl alle 15 min messen', 'Für das Diagramm „VRChat weltweit“.'],
    ['upd.check', 'system', 'Updates', 'bool', true, 'Automatisch nach Updates suchen', 'Beim Start und alle 6 Stunden (GitHub-Releases).'],
    ['upd.mode', 'system', 'Updates', 'select', 'notify', 'Wenn ein Update da ist', 'Automatisch installieren nur, wenn VRChat gerade nicht läuft.', [['notify', 'nur Bescheid geben'], ['auto', 'automatisch herunterladen & installieren']]],
    ['sys.backup', 'system', 'Sicherung', 'select', 'weekly', 'Datenbank automatisch sichern', '', [['off', 'nie'], ['daily', 'täglich'], ['weekly', 'wöchentlich']]],
    ['sys.backup_keep', 'system', 'Sicherung', 'number', 5, 'Anzahl Sicherungen behalten', '', [1, 60]],
    ['sys.keep_feed', 'system', 'Aufräumen', 'select', '180', 'Freunde-Verlauf behalten', 'Ältere Einträge (online/offline, Ortswechsel …) werden täglich gelöscht.', [['0', 'für immer'], ['30', '30 Tage'], ['90', '90 Tage'], ['180', '180 Tage'], ['365', '1 Jahr'], ['730', '2 Jahre']]],
    ['sys.keep_gamelog', 'system', 'Aufräumen', 'select', '0', 'Spiel-Log behalten', 'Welten, Begegnungen, Avatare, Videos aus dem VRChat-Log.', [['0', 'für immer'], ['30', '30 Tage'], ['90', '90 Tage'], ['180', '180 Tage'], ['365', '1 Jahr'], ['730', '2 Jahre']]],
    ['sys.keep_stats', 'system', 'Aufräumen', 'select', '365', 'Diagramm-Messwerte behalten', 'Freunde online & VRChat weltweit.', [['0', 'für immer'], ['30', '30 Tage'], ['90', '90 Tage'], ['180', '180 Tage'], ['365', '1 Jahr'], ['730', '2 Jahre']]],
    ['sys.keep_notifs', 'system', 'Aufräumen', 'select', '0', 'Benachrichtigungs-Verlauf behalten', 'Nur erledigte – offene bei VRChat bleiben immer.', [['0', 'für immer'], ['30', '30 Tage'], ['90', '90 Tage'], ['180', '180 Tage'], ['365', '1 Jahr'], ['730', '2 Jahre']]],
    ['sys.keep_cache', 'system', 'Aufräumen', 'select', '30', 'Profil-Zwischenspeicher behalten', 'Wird bei Bedarf neu von VRChat geladen.', [['0', 'für immer'], ['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage']]],
    // ---------- Oberfläche ----------
    ['ui.lang', 'ui', 'Aussehen', 'select', 'auto', 'Sprache / Language', 'Auch über die Flagge umschaltbar. „Automatisch“ nimmt die Sprache von Windows/Android (sonst Englisch).', [['auto', '🌐 Automatisch (Systemsprache)'], ['de', 'Deutsch'], ['en', 'English'], ['fr', 'Français'], ['ja', '日本語']]],
    ['ui.theme', 'ui', 'Aussehen', 'select', 'neon', 'Theme', 'Auch über 🎨 unten rechts umschaltbar.', [['neon', '🌃 Neon (dunkel, Standard)'], ['midnight', '🌌 Mitternacht (dunkel)'], ['snow', '❄️ Schnee (hell)'], ['sakura', '🌸 Sakura (hell)'], ['beach', '🌴 Neon Beach (dunkel, Sonnenuntergang)'], ['auto', '🌗 Automatisch (wie Windows/Android)']]],
    ['ui.accent', 'ui', 'Aussehen', 'color', '#38d5e6', 'Akzentfarbe', 'Bei #38d5e6 nimmt jedes Theme seine eigene Farbe.'],
    ['ui.zoom', 'ui', 'Aussehen', 'number', 100, 'Zoom (%)', '70–150 %', [70, 150]],
    ['ui.font', 'ui', 'Aussehen', 'select', 'default', 'Schrift', '', [['default', 'Standard'], ['system', 'Windows-Systemschrift'], ['mono', 'Monospace']]],
    ['ui.animations', 'ui', 'Aussehen', 'bool', true, 'Animationen', ''],
    ['ui.decorations', 'ui', 'Aussehen', 'bool', true, 'Profil-Dekorationen', 'Rahmen ums Profilbild, Banner-Farbe und Namens-Effekt aus VRChat – überall, wo Profile angezeigt werden.'],
    ['ui.background', 'ui', 'Aussehen', 'bool', true, 'Hintergrund-Raster & Leuchten', ''],
    ['ui.bg_image', 'ui', 'Hintergrundbild', 'bgimg', '', 'Bild', 'Aus deiner VRChat-Galerie, als Datei vom PC oder als https-Adresse.'],
    ['ui.bg_opacity', 'ui', 'Hintergrundbild', 'range', 35, 'Deckkraft (%)', '0 = unsichtbar, 100 = voll sichtbar', [0, 100]],
    ['ui.bg_blur', 'ui', 'Hintergrundbild', 'range', 0, 'Weichzeichnen (px)', '', [0, 30]],
    ['ui.bg_fit', 'ui', 'Hintergrundbild', 'select', 'cover', 'Anpassen', '', [['cover', 'Ausfüllen'], ['contain', 'Ganz zeigen'], ['tile', 'Kacheln'], ['center', 'Mittig (Originalgröße)']]],
    ['ui.ucol_id', 'ui', 'Benutzerfarben', 'bool', false, 'Feste Farbe pro Benutzer', 'Jeder bekommt eine eigene, gleichbleibende Farbe aus seiner ID – statt der Farbe seiner Vertrauensstufe.'],
    ['ui.ucol_visitor', 'ui', 'Benutzerfarben', 'color', '#cccccc', 'Besucher', ''],
    ['ui.ucol_new', 'ui', 'Benutzerfarben', 'color', '#1778ff', 'Neuer Benutzer', ''],
    ['ui.ucol_user', 'ui', 'Benutzerfarben', 'color', '#2bcf5c', 'Benutzer', ''],
    ['ui.ucol_known', 'ui', 'Benutzerfarben', 'color', '#ff7b42', 'Bekannter Benutzer', ''],
    ['ui.ucol_trusted', 'ui', 'Benutzerfarben', 'color', '#b18fff', 'Vertrauter Benutzer', ''],
    ['ui.ucol_team', 'ui', 'Benutzerfarben', 'color', '#ff2626', 'VRChat-Team', ''],
    ['ui.ucol_nuisance', 'ui', 'Benutzerfarben', 'color', '#782f2f', 'Störenfried (Nuisance)', ''],
    ['media.save_prints', 'media', 'Aus der Instanz speichern', 'bool', false, 'Prints speichern', 'Gespawnte Prints in deinen VRChat-Bilder-Ordner (Unterordner „Prints“). Braucht die VRChat-Startoption --enable-sdk-log-levels.'],
    ['media.print_trim', 'media', 'Aus der Instanz speichern', 'bool', true, 'Weißen Rand bei Prints entfernen', ''],
    ['media.save_stickers', 'media', 'Aus der Instanz speichern', 'bool', false, 'Sticker speichern', 'Platzierte Sticker in den Unterordner „Stickers“.'],
    ['media.save_emoji', 'media', 'Aus der Instanz speichern', 'bool', false, 'Emoji speichern', 'Gespawnte Emoji in den Unterordner „Emoji“. Braucht die VRChat-Startoption --enable-sdk-log-levels.'],
    ['vrc.relaunch', 'system', 'VRChat', 'bool', false, 'Nach Absturz automatisch neu starten', 'Startet VRChat neu und betritt wieder die letzte Instanz (höchstens 3× in 30 Minuten).'],
    ['vrc.kill_on_exit', 'system', 'VRChat', 'bool', false, 'VRChat beim Beenden hart schließen', 'Hängt VRChat nach dem Verlassen noch im Hintergrund, wird es beendet.'],
    ['vrc.cache_on_exit', 'system', 'VRChat', 'bool', false, 'Cache beim Beenden aufräumen', 'Löscht die ältesten Einträge im VRChat-Cache, bis er unter die Grenze passt.'],
    ['vrc.cache_gb', 'system', 'VRChat', 'number', 20, 'Cache-Grenze (GB)', '', [1, 500]],
    ['vrc.self_invite', 'system', 'VRChat', 'bool', false, 'Selbst-Einladung statt Instanz öffnen', 'Beim Beitreten schickt die App dir eine Einladung ins Spiel, statt VRChat über den Link zu öffnen.'],
    ['ui.show_images', 'ui', 'Aussehen', 'bool', true, 'Bilder (Avatare, Welten) anzeigen', 'Aus spart Datenvolumen.'],
    ['ui.compact', 'ui', 'Aussehen', 'bool', false, 'Kompakte Freundesliste', ''],
    ['ui.nav', 'ui', 'Menü', 'select', 'side', 'Hauptmenü', 'Links: Menü als Seitenleiste, oben stehen die Unterpunkte der aktuellen Seite.', [['side', 'links (Seitenleiste)'], ['top', 'oben']]],
    ['ui.menu_style', 'ui', 'Menü', 'select', 'both', 'Menü-Darstellung', '', [['both', 'Symbol + Text'], ['icons', 'nur Symbole'], ['text', 'nur Text']]],
    ['ui.sticky_menu', 'ui', 'Menü', 'bool', true, 'Menü beim Scrollen oben festhalten', ''],
    ['ui.start_tab', 'ui', 'Menü', 'select', 'last', 'Beim Start öffnen', '', [['last', 'zuletzt geöffnete Seite']].concat(START_TABS)],
    ['ui.wide', 'ui', 'Menü', 'bool', true, 'Volle Fensterbreite nutzen', ''],
    ['ui.friend_side', 'ui', 'Menü', 'bool', true, 'Freunde-Leiste rechts', 'Bei Menü links und breitem Fenster: Freunde nach Status und Gruppen mit offenen Instanzen.'],
    // ---------- Sozial ----------
    ['social.show_offline', 'social', 'Freundesliste', 'bool', false, 'Offline-Freunde standardmäßig zeigen', ''],
    ['social.sort', 'social', 'Freundesliste', 'select', 'state', 'Standard-Sortierung', '', [['state', 'Nach Status'], ['name', 'Name A–Z'], ['since', 'Zuletzt geändert'], ['trust', 'Vertrauensstufe'], ['world', 'Nach Welt']]],
    ['social.loc_private', 'social', 'Freunde-Orte', 'bool', true, 'Private Instanzen zusammenfassen', 'Freunde in privaten Welten erscheinen unter „Privat“.'],
    ['social.store_id', 'social', 'Shop', 'text', '', 'Store-ID des VRChat-Stores (esto_…)', 'leer = automatisch aus der VRChat-Konfiguration ermitteln'],
    ['social.loc_active', 'social', 'Freunde-Orte', 'bool', true, '„Online auf der Website/App“ mit anzeigen', ''],
    ['social.players_fetch', 'social', 'Spielerliste', 'bool', true, 'Profile der Mitspieler laden (VRC+, 18+, Rang, Sprache …)', 'Höchstens eine Abfrage pro Sekunde.'],
    ['social.players_cache', 'social', 'Spielerliste', 'number', 60, 'Profile zwischenspeichern (Minuten)', '', [5, 1440]],
    ['social.players_left', 'social', 'Spielerliste', 'bool', true, 'Wer die Instanz verlassen hat, unten anzeigen', ''],
    ['social.memo_remote', 'social', 'Spielerliste', 'bool', false, 'Memos zusätzlich als VRChat-Notiz speichern', ''],
    ['social.mutual_limit', 'social', 'Freundesnetz', 'number', 150, 'Höchstens so viele Freunde abfragen', '', [10, 2000]],
    ['social.mutual_cache', 'social', 'Freundesnetz', 'number', 7, 'Gemeinsame Freunde merken (Tage)', '', [1, 90]],
    // ---------- Benachrichtigungen ----------
    ['notify.desktop', 'notify', 'Allgemein', 'bool', true, 'Windows-Benachrichtigungen', ''],
    ['notify.silent', 'notify', 'Allgemein', 'bool', false, 'Ohne Ton', ''],
    ['notify.quiet_from', 'notify', 'Allgemein', 'time', '', 'Nicht stören von', 'leer = aus'],
    ['notify.quiet_to', 'notify', 'Allgemein', 'time', '', 'Nicht stören bis', ''],
    ['notify.tts', 'notify', 'Allgemein', 'bool', false, 'Benachrichtigungen vorlesen', 'Sprachausgabe von Windows.'],
    ['notify.watch', 'notify', 'Freunde', 'bool', true, 'Beobachtete Freunde kommen online', ''],
    ['notify.player_join', 'notify', 'Instanz', 'select', 'friends', 'Jemand betritt deine Instanz', '', [['off', 'aus'], ['favorites', 'nur ⭐ Favoriten'], ['friends', 'Freunde'], ['all', 'alle']]],
    ['notify.player_leave', 'notify', 'Instanz', 'select', 'off', 'Jemand verlässt deine Instanz', '', [['off', 'aus'], ['favorites', 'nur ⭐ Favoriten'], ['friends', 'Freunde'], ['all', 'alle']]],
    ['notify.vrc', 'notify', 'VRChat', 'bool', true, 'Neue VRChat-Benachrichtigungen (Einladungen, Anfragen, Freundschaften)', 'Wird alle 2 Minuten geprüft.'],
    ['notify.vrc_invite', 'notify', 'VRChat', 'bool', true, '… Einladungen', ''],
    ['notify.vrc_request', 'notify', 'VRChat', 'bool', true, '… Einladungs-Anfragen', ''],
    ['notify.vrc_friend', 'notify', 'VRChat', 'bool', true, '… Freundschaftsanfragen', ''],
    ['notify.vrc_group', 'notify', 'VRChat', 'bool', false, '… Gruppen (Ankündigungen, Einladungen)', ''],
    ['notify.screenshot', 'notify', 'Spiel', 'bool', false, 'Screenshot aufgenommen', ''],
    ['notify.vrc_start', 'notify', 'Spiel', 'bool', false, 'VRChat gestartet / beendet', ''],
    // ---------- VR ----------
    ['vr.xsoverlay', 'vr', 'XSOverlay', 'bool', false, 'Benachrichtigungen in XSOverlay anzeigen', 'XSOverlay muss laufen (Port 42069).'],
    ['vr.xs_port', 'vr', 'XSOverlay', 'number', 42069, 'XSOverlay-Port', '', [1, 65535]],
    ['vr.xs_timeout', 'vr', 'XSOverlay', 'number', 4, 'Anzeigedauer (Sekunden)', '', [1, 30]],
    ['vr.xs_opacity', 'vr', 'XSOverlay', 'number', 90, 'Deckkraft (%)', '', [10, 100]],
    ['vr.xs_volume', 'vr', 'XSOverlay', 'number', 50, 'Lautstärke (%)', '', [0, 100]],
    ['vr.chatbox', 'vr', 'Chatbox', 'bool', false, 'Benachrichtigungen auch in die VRChat-Chatbox schreiben', 'Andere Spieler sehen das!'],
    ['vr.chatbox_prefix', 'vr', 'Chatbox', 'text', '🔔', 'Vorangestelltes Zeichen', ''],
    ['vr.only_in_game', 'vr', 'Allgemein', 'bool', true, 'VR-Hinweise nur, wenn VRChat läuft', ''],
    ['notify.watch_joinme', 'notify', 'Beobachtete Freunde', 'bool', true, 'Melden, wenn ein beobachteter Freund „Join Me“ setzt', 'Beobachten: im Profil das 👁-Symbol.'],
    ['notify.watch_public', 'notify', 'Beobachtete Freunde', 'bool', false, 'Melden, wenn ein beobachteter Freund in eine öffentliche Instanz geht', ''],
    ['notify.events', 'notify', 'Erinnerungen', 'bool', true, 'An Gruppen-Events erinnern', 'Aus dem Gruppen-Kalender (Mehr → Gruppen-Kalender).'],
    ['notify.event_minutes', 'notify', 'Erinnerungen', 'number', 15, 'Minuten vorher', '', [1, 240]],
    ['notify.anniversary', 'notify', 'Erinnerungen', 'bool', true, 'Freundschafts-Jahrestage & Geburtstage melden', 'Geburtstage aus der Notiz, z. B. „Geburtstag 24.12.“ oder „🎂 24.12.“.'],
    ['int.obs', 'int', 'Stream-Overlay (OBS)', 'bool', false, 'Browser-Quelle für OBS/Streamlabs', 'Fertige Adressen stehen unten auf dieser Seite. Läuft auch ohne die Stream-Deck-Schnittstelle.'],
    ['osc.log', 'vr', 'OSC-Log', 'bool', true, 'Alles mitschreiben, was über OSC kommt und geht', 'Spiel & OSC → 📜 OSC-Log. Gespeichert im Datenordner unter „osc-log“.'],
    ['osc.log_out', 'vr', 'OSC-Log', 'bool', true, 'Auch Gesendetes loggen (Chatbox, Parameter, Kamera …)', ''],
    ['osc.log_days', 'vr', 'OSC-Log', 'number', 14, 'Aufbewahren (Tage)', 'Ältere Tagesdateien werden automatisch gelöscht.', [1, 365]],
    ['osc.log_throttle', 'vr', 'OSC-Log', 'number', 100, 'Dauer-Werte höchstens alle … ms speichern', 'Gilt nur für Bewegung, Kommazahlen und Tracking. 0 = wirklich jede Änderung.', [0, 10000]],
    ['vr.overlay', 'vr', 'SteamVR-Overlay', 'bool', false, 'SteamVR-Overlay einschalten', 'Startet automatisch, sobald SteamVR läuft: eigener Reiter im SteamVR-Dashboard + optional am Handgelenk.'],
    ['vr.overlay_mode', 'vr', 'SteamVR-Overlay', 'select', 'wrist', 'Zusätzliches Fenster', '', [['wrist', 'am Handgelenk'], ['front', 'frei vor mir (beim Einblenden)'], ['off', 'nur im SteamVR-Dashboard']]],
    ['vr.overlay_hand', 'vr', 'SteamVR-Overlay', 'select', 'left', 'Handgelenk', '', [['left', 'links'], ['right', 'rechts']]],
    ['vr.overlay_width', 'vr', 'SteamVR-Overlay', 'number', 30, 'Breite (cm)', '', [10, 300]],
    ['vr.overlay_distance', 'vr', 'SteamVR-Overlay', 'number', 120, 'Abstand „frei vor mir“ (cm)', '', [40, 400]],
    ['vr.overlay_alpha', 'vr', 'SteamVR-Overlay', 'number', 95, 'Deckkraft (%)', '', [10, 100]],
    ['vr.overlay_fps', 'vr', 'SteamVR-Overlay', 'number', 10, 'Bilder pro Sekunde', 'Mehr = flüssiger, aber mehr CPU.', [1, 30]],
    ['vr.overlay_show', 'vr', 'SteamVR-Overlay', 'bool', false, 'Handgelenk-/Freies Fenster beim Start zeigen', 'Ein-/Ausblenden jederzeit mit dem Controller: linke obere Taste (B / Y / Menü) doppelt drücken – änderbar in SteamVR → Einstellungen → Controller → Belegung → VRC Nexus.'],
    // 3.8.4: Lage des Arm-/Frei-Fensters genau einstellbar (auch live im Overlay unter „📐 Lage“)
    ['vr.overlay_tilt', 'vr', 'SteamVR-Overlay', 'number', 60, 'Neigung am Handgelenk (°)', '0 = flach auf dem Arm, 90 = senkrecht.', [0, 90]],
    ['vr.overlay_off_x', 'vr', 'SteamVR-Overlay', 'number', 2, 'Handgelenk: seitlich (cm)', '', [-30, 30]],
    ['vr.overlay_off_y', 'vr', 'SteamVR-Overlay', 'number', 3, 'Handgelenk: Höhe (cm)', '', [-30, 30]],
    ['vr.overlay_off_z', 'vr', 'SteamVR-Overlay', 'number', 12, 'Handgelenk: Richtung Ellbogen (cm)', '', [-30, 50]],
    ['vr.overlay_front_y', 'vr', 'SteamVR-Overlay', 'number', -10, '„Frei vor mir“: Höhe zur Blickmitte (cm)', 'Negativ = unterhalb der Augen.', [-100, 100]],
    ['vr.overlay_gaze', 'vr', 'SteamVR-Overlay', 'bool', true, 'Nur bedienbar, wenn ich draufschaue', 'Sonst ist das Fenster halb durchsichtig und der Laser geht an VRChat – so bleibt VRChat bedienbar, während das Overlay offen ist.'],
    ['vr.overlay_hud', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'bool', false, 'Zweites Fenster mit Infos & Untertiteln', 'Nur zum Ablesen (nicht bedienbar). Läuft mit dem SteamVR-Overlay oben.'],
    ['vr.overlay_hud_place', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'select', 'wrist', 'Platz', '', [['wrist', 'neben dem Arm-Fenster'], ['head', 'im Blickfeld (fest am Headset, Position frei einstellbar)']]],
    // 3.8.4: HUD im Headset frei positionieren (Abstand + X/Y + Neigung) und am Arm verschiebbar
    ['vr.overlay_hud_dist', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'number', 110, 'Im Blickfeld: Abstand vor den Augen (cm)', '', [20, 400]],
    ['vr.overlay_hud_x', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'number', 0, 'Im Blickfeld: links/rechts (cm)', 'Negativ = links.', [-150, 150]],
    ['vr.overlay_hud_y', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'number', -32, 'Im Blickfeld: Höhe (cm)', 'Negativ = unterhalb der Blickmitte.', [-150, 150]],
    ['vr.overlay_hud_tilt', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'number', 0, 'Im Blickfeld: Neigung (°)', 'Positiv = oben nach hinten gekippt.', [-60, 60]],
    ['vr.overlay_hud_arm', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'number', 27, 'Am Arm: Abstand zum Handgelenk (cm)', '', [0, 60]],
    ['vr.overlay_hud_items', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'text', 'zeit,welt,spieler,dauer,musik,freunde', 'Infos', 'Kommagetrennt: zeit, welt, spieler, dauer, musik, freunde, avatar, region, puls – leer = nur Untertitel'],
    ['vr.overlay_hud_subs', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'bool', true, 'Untertitel zeigen', 'Eigene Sprache und der Übersetzer „VRChat → Text“ (Spiel & OSC → Übersetzer).'],
    ['vr.overlay_hud_width', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'number', 28, 'Breite (cm)', '', [10, 150]],
    ['vr.overlay_hud_alpha', 'vr', 'SteamVR-HUD (Infos & Untertitel)', 'number', 90, 'Deckkraft (%)', '', [10, 100]],
    ['vr.overlay_phrases', 'vr', 'SteamVR-Overlay', 'textarea', 'Hallo!\nWie geht\'s?\nBin gleich zurück\nDanke!\nGute Nacht 🌙\nKomme rüber!\nLol 😂\nAFK, kurz Trinken', 'Schnell-Sätze im Overlay (eine Zeile = ein Knopf)', ''],
    ['vr.overlay_translate', 'vr', 'SteamVR-Overlay', 'bool', false, 'Overlay-Chat übersetzen', 'Ziel wie bei der Übersetzung eingestellt.'],
    // ---------- 3.3 VR-Bewegung (eigene Seite: Spiel & OSC → 🚀 VR-Bewegung, Reiter „space“ erscheint nicht in den Einstellungen) ----------
    ['vr.space', 'space', 'VR-Bewegung', 'bool', false, 'VR-Bewegung verbinden', ''],
    ['vr.space_autostart', 'space', 'VR-Bewegung', 'bool', false, 'Beim Start von VRChat in VR starten', ''],
    ['vr.space_input', 'space', 'VR-Bewegung', 'select', 'standard', 'Tastenbelegung', '', [['standard', 'Standard (SteamVR-Eingabe, änderbar)'], ['legacy', 'Legacy (feste Tasten)']]],
    ['vr.space_orig', 'space', 'VR-Bewegung', 'text', '', 'Ursprung', ''],
    ['vr.fly_on', 'space', 'Space Flight', 'bool', true, 'Space Flight', ''],
    ['vr.fly_hand', 'space', 'Space Flight', 'select', 'both', 'Greifen mit', '', [['both', 'beiden Händen'], ['left', 'linker Hand'], ['right', 'rechter Hand']]],
    ['vr.fly_mul', 'space', 'Space Flight', 'range', 100, 'Drag-Multiplikator (%)', '', [10, 500]],
    ['vr.fly_gravity', 'space', 'Space Flight', 'bool', false, 'Gravitation', ''],
    ['vr.fly_g', 'space', 'Space Flight', 'range', 98, 'Gravitation (×0,1 m/s²)', '', [10, 300]],
    ['vr.fly_lock_x', 'space', 'Space Flight', 'bool', false, 'X sperren', ''],
    ['vr.fly_lock_y', 'space', 'Space Flight', 'bool', false, 'Y sperren', ''],
    ['vr.fly_lock_z', 'space', 'Space Flight', 'bool', false, 'Z sperren', ''],
    ['vr.turn_on', 'space', 'Space Turn', 'bool', false, 'Space Turn', ''],
    ['vr.turn_mul', 'space', 'Space Turn', 'range', 100, 'Turn-Multiplikator (%)', '', [10, 400]],
    ['vr.turn_smooth', 'space', 'Space Turn', 'range', 50, 'Glättung (%)', '', [0, 95]],
    ['vr.turn_comfort', 'space', 'Space Turn', 'select', '0', 'Komfortmodus', '', [['0', 'fließend'], ['15', 'Stufen 15°'], ['30', 'Stufen 30°'], ['45', 'Stufen 45°']]],
    ['vr.turn_invert', 'space', 'Space Turn', 'bool', false, 'Richtung umkehren', ''],
    ['vr.walk_on', 'space', 'Space Walk', 'bool', false, 'Space Walk', ''],
    ['vr.walk_mul', 'space', 'Space Walk', 'range', 100, 'Rotations-Multiplikator (%)', '', [10, 400]],
    ['vr.walk_smooth', 'space', 'Space Walk', 'range', 50, 'Glättung (%)', '', [0, 95]],
    ['vr.walk_momentum', 'space', 'Space Walk', 'bool', false, 'Nachrollen', ''],
    ['vr.walk_invert', 'space', 'Space Walk', 'bool', false, 'Richtung umkehren', ''],
    ['vr.walk_lock_pitch', 'space', 'Space Walk', 'bool', false, 'Pitch sperren', ''],
    ['vr.walk_lock_roll', 'space', 'Space Walk', 'bool', false, 'Roll sperren', ''],
    ['vr.walk_lock_yaw', 'space', 'Space Walk', 'bool', false, 'Yaw sperren', ''],
    // ---------- Medien ----------
    ['media.photo_dir', 'media', 'Ordner', 'text', '', 'VRChat-Fotoordner', 'leer = Bilder\\VRChat'],
    ['media.steam_dir', 'media', 'Ordner', 'text', '', 'Steam-Screenshot-Ordner', 'leer = automatisch suchen'],
    ['media.meta', 'media', 'Screenshots', 'bool', false, 'Welt & Mitspieler in neue Screenshots schreiben', 'Als PNG-Text „Description“ (lesbar im Screenshot-Manager, kompatibel mit anderen Tools).'],
    ['media.smtc', 'media', 'Spielt gerade', 'bool', true, 'Windows-Mediensteuerung nutzen', 'Erkennt alles, was Windows im Medien-Popup zeigt (Spotify, Browser/YouTube, Apple Music, TIDAL …) und erlaubt ⏮ ⏯ ⏭. Aus = nur Fenstertitel bekannter Player.'],
    ['media.copy', 'media', 'Screenshots', 'bool', false, 'Neue Screenshots zusätzlich kopieren', ''],
    ['media.copy_dir', 'media', 'Screenshots', 'text', '', 'Zielordner', 'Unterordner pro Monat werden angelegt.'],
    ['media.copy_by_world', 'media', 'Screenshots', 'bool', false, 'Unterordner nach Welt statt nach Monat', ''],
    ['media.manager_limit', 'media', 'Screenshot-Manager', 'number', 300, 'Höchstens so viele Bilder anzeigen', '', [20, 5000]],
    // ---------- Übersetzen ----------
    ['tr.key_deepl', 'tr', 'Anbieter', 'apikey', '', 'DeepL-API-Schlüssel', 'deepl.com → API → „DeepL API Free“ (500.000 Zeichen/Monat kostenlos). Wird verschlüsselt gespeichert.'],
    ['tr.key_google', 'tr', 'Anbieter', 'apikey', '', 'Google-Cloud-Translation-Schlüssel', 'console.cloud.google.com → „Cloud Translation API“ aktivieren → API-Schlüssel. Wird verschlüsselt gespeichert.'],
    ['tr.provider', 'tr', 'Anbieter', 'select', 'auto', 'Bevorzugter Anbieter', 'Automatisch: DeepL, falls eingetragen, sonst Google.', [['auto', 'automatisch'], ['deepl', 'DeepL'], ['google', 'Google']]],
    ['tr.chat_default', 'tr', 'Chatbox', 'bool', false, 'Chatbox-Nachrichten standardmäßig übersetzen', 'Im Reiter „Spiel & OSC“ lässt es sich pro Nachricht umschalten.'],
    ['tr.chat_target', 'tr', 'Chatbox', 'select', 'EN-US', 'Chatbox übersetzen nach', '', TR_LANGS],
    ['tr.chat_mode', 'tr', 'Chatbox', 'select', 'both', 'Was in die Chatbox kommt', 'Passt beides nicht in 144 Zeichen, wird nur die Übersetzung gesendet.', [['only', 'nur die Übersetzung'], ['both', 'Original / Übersetzung'], ['both_nl', 'Original und Übersetzung in zwei Zeilen']]],
    ['tr.ui_target', 'tr', 'In der App', 'select', 'DE', 'Texte in VRC Nexus übersetzen nach', 'Bio, Status, Gruppen, Beiträge, Benachrichtigungen …', TR_LANGS],
    ['tr.select_button', 'tr', 'In der App', 'bool', true, '„🌐“-Knopf beim Markieren von Text', 'Text markieren → 🌐 klicken (oder Alt+T).'],
    // ---------- Dashboard-Verbindung ----------
    ['link.enabled', 'link', 'Verbindung', 'bool', false, 'Mit dem GHOST-NODE-Dashboard verbinden', 'Geräte-Token im Dashboard unter Nexus → 🖥️ Client → Geräte erstellen.'],
    ['link.url', 'link', 'Verbindung', 'text', '', 'Adresse des Dashboards', 'z. B. https://meine-seite.de'],
    ['link.upload', 'link', 'Was geteilt wird', 'bool', true, 'Spiel-Log & Live-Status hochladen', 'Im Dashboard unter Nexus → Client sichtbar (Welt, Mitspieler, Begegnungen).'],
    ['link.remote', 'link', 'Was geteilt wird', 'bool', true, 'Befehle vom Dashboard ausführen', 'Chatbox, Tipp-Anzeige, Avatar-Parameter, Eingaben – auch vom Handy über das Dashboard.'],
    ['link.notes', 'link', 'Was geteilt wird', 'bool', true, 'Memos/Notizen abgleichen', 'Alle 5 Minuten, die neuere Version gewinnt.'],
    // ---------- Integrationen ----------
    ['int.api', 'int', 'Stream Deck & lokale Schnittstelle', 'bool', false, 'Lokale Schnittstelle für das Stream-Deck-Plugin', 'Nur auf diesem PC erreichbar (127.0.0.1).'],
    ['int.api_port', 'int', 'Stream Deck & lokale Schnittstelle', 'number', 17865, 'Port', '', [1024, 65535]],
    ['int.api_token', 'int', 'Stream Deck & lokale Schnittstelle', 'secret', '', 'Zugangsschlüssel', 'Im Stream-Deck-Plugin eintragen.'],
    ['int.rpc', 'int', 'Discord Rich Presence', 'bool', false, 'Discord-Status „Spielt VRChat in …“', 'Nur aktiv, solange du in einer Instanz bist. VRChats eigene Rich Presence ausschalten, sonst streiten sich beide. Funktioniert ohne Einrichtung – einfach einschalten.'],
    ['int.rpc_client', 'int', 'Discord Rich Presence', 'text', '', 'Eigene Discord Client-ID (optional)', 'Leer lassen = die Discord-Anwendung von VRC Nexus. Nur für eine eigene Anwendung: discord.com/developers → Application ID.'],
    ['int.rpc_world', 'int', 'Discord Rich Presence', 'bool', true, 'Weltnamen zeigen', ''],
    ['int.rpc_private', 'int', 'Discord Rich Presence', 'bool', true, 'Details in privaten Instanzen verbergen', 'Invite, Invite+, Gruppen-Mitglieder und solange dein Status „Ask Me“ ist.'],
    ['int.rpc_players', 'int', 'Discord Rich Presence', 'bool', true, 'Spielerzahl zeigen', ''],
    ['int.rpc_join', 'int', 'Discord Rich Presence', 'bool', false, 'Knopf „Beitreten“ bei öffentlichen Instanzen', ''],
    ['int.rpc_media', 'int', 'Discord Rich Presence', 'bool', true, 'Welt-Integration (Video & Musik)', 'In Video-/Musik-Welten „Schaut …“ / „Hört …“ mit dem Titel aus dem VRChat-Log.'],
    ['int.rpc_platform', 'int', 'Discord Rich Presence', 'bool', true, 'Plattform zeigen', 'PC, VR oder Quest/Android'],
    ['int.rpc_world_img', 'int', 'Discord Rich Presence', 'bool', true, 'Weltbilder zeigen', ''],
    ['int.rpc_media_img', 'int', 'Discord Rich Presence', 'bool', true, 'Medienbilder zeigen', 'Vorschaubild des laufenden Videos (z. B. YouTube), wenn die Welt eins abspielt.'],
    ['int.rpc_world_activity', 'int', 'Discord Rich Presence', 'bool', false, 'Weltname als Aktivität', 'Discord zeigt „Spielt <Welt>“ statt „Spielt VRChat“ (soweit Discord das unterstützt).'],
    ['int.webhook', 'int', 'Discord-Webhook', 'text', '', 'Webhook-URL', 'https://discord.com/api/webhooks/…'],
    ['int.webhook_join', 'int', 'Discord-Webhook', 'bool', false, 'Melden, wenn Freunde deine Instanz betreten', ''],
    ['int.webhook_vrc', 'int', 'Discord-Webhook', 'bool', false, 'VRChat-Benachrichtigungen weiterleiten', ''],
    ['int.webhook_world', 'int', 'Discord-Webhook', 'bool', false, 'Weltwechsel melden', ''],
    // ---------- Erweitert ----------
    ['adv.api_base', 'adv', 'Verbindung', 'text', '', 'VRChat-API-Adresse', 'leer = https://api.vrchat.cloud/api/1'],
    ['adv.user_agent', 'adv', 'Verbindung', 'text', '', 'User-Agent', 'Name/Version und Kontakt, z. B. MeinNexus/1.0 kontakt@example.org'],
    ['adv.debug', 'adv', 'Fehlersuche', 'bool', false, 'Fehlerprotokoll schreiben (nexus.log)', ''],
    ['adv.devtools', 'adv', 'Fehlersuche', 'bool', false, 'Entwicklerwerkzeuge mit F12', ''],
];

const KEYS = Object.fromEntries(FIELDS.map(f => [f[0], f]));

class Settings {
    constructor(db) { this.db = db; this.cache = null; this.listeners = []; }
    defaults() { return Object.fromEntries(FIELDS.map(f => [f[0], f[4]])); }
    all() {
        if (this.cache) return this.cache;
        let saved = {};
        try { saved = JSON.parse(this.db.setting('app_settings', '{}')) || {}; } catch (e) { saved = {}; }
        const s = Object.assign(this.defaults(), saved);
        // vorhandene Einzel-Einstellungen spiegeln
        s['adv.api_base'] = this.db.setting('vrc_api_base', '');
        s['adv.user_agent'] = this.db.setting('vrc_user_agent', '');
        if (!s['int.api_token']) { s['int.api_token'] = crypto.randomBytes(18).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); this.db.setSetting('app_settings', JSON.stringify(s)); }
        this.cache = s;
        return s;
    }
    get(k) { return this.all()[k]; }
    /** Felder prüfen und speichern; unbekannte Schlüssel werden ignoriert */
    save(input) {
        const cur = Object.assign({}, this.all());
        const changed = [];
        for (const [k, raw] of Object.entries(input || {})) {
            const f = KEYS[k];
            if (!f || f[3] === 'secret' || f[3] === 'apikey') continue;
            let v;
            switch (f[3]) {
                case 'bool': v = raw === true || raw === 1 || ['1', 'true', 'on', 'yes'].includes(str(raw)); break;
                case 'range':
                case 'number': { v = int(raw); const [lo, hi] = f[7] || [-1e9, 1e9]; if (str(raw).trim() === '' || isNaN(Number(raw))) v = f[4]; v = Math.max(lo, Math.min(hi, v)); break; }
                case 'select': v = (f[7] || []).some(o => o[0] === str(raw)) ? str(raw) : f[4]; break;
                case 'color': v = /^#[0-9a-f]{6}$/i.test(str(raw)) ? str(raw).toLowerCase() : f[4]; break;
                case 'time': v = /^([01]\d|2[0-3]):[0-5]\d$/.test(str(raw)) ? str(raw) : ''; break;
                case 'textarea': v = cut(str(raw).replace(/\r/g, '').trim(), 4000); break;
                default: v = cut(str(raw).trim(), 400);
            }
            if (k === 'ui.bg_image' && v && !/^(https:\/\/\S+|nexus\.php\?img=file_[0-9a-f-]{36}&v=\d+|local:\d+|builtin:[a-z-]{2,30})$/i.test(v)) throw new UserError('Bildadresse ungültig (nur https, Galerie oder eigene Datei).');
            if (k === 'adv.api_base' && v && !/^https?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(v)) throw new UserError('API-Adresse ungültig.');
            if (k === 'int.webhook' && v && !/^https:\/\/(discord(app)?\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(v)) throw new UserError('Das ist keine Discord-Webhook-URL.');
            if (k === 'int.rpc_client' && v && !/^\d{15,22}$/.test(v)) throw new UserError('Die Discord Client-ID besteht nur aus Ziffern.');
            if (cur[k] !== v) { cur[k] = v; changed.push(k); }
        }
        this.write(cur);
        if (changed.includes('adv.api_base')) this.db.setSetting('vrc_api_base', cur['adv.api_base']);
        if (changed.includes('adv.user_agent')) this.db.setSetting('vrc_user_agent', cur['adv.user_agent']);
        this.listeners.forEach(fn => { try { fn(changed, cur); } catch (e) { /* egal */ } });
        return { settings: cur, changed };
    }
    write(s) { this.cache = s; this.db.setSetting('app_settings', JSON.stringify(s)); }
    newToken() { const s = Object.assign({}, this.all(), { 'int.api_token': crypto.randomBytes(18).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }); this.write(s); this.listeners.forEach(fn => fn(['int.api_token'], s)); return s['int.api_token']; }
    reset() { this.db.setSetting('app_settings', '{}'); this.cache = null; const s = this.all(); this.listeners.forEach(fn => fn(Object.keys(s), s)); return s; }
    onChange(fn) { this.listeners.push(fn); }
    /** Für die Oberfläche: Schema ohne Funktionen */
    schema() { return { tabs: TABS, fields: FIELDS.map(([key, tab, section, type, def, label, hint, opts]) => ({ key, tab, section, type, def, label, hint, opts: opts || null })) }; }
    /** Teil für das Rendern der Seite (Aussehen sofort anwenden) */
    ui() { const s = this.all(); return Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('ui.') || k === 'vrc.self_invite' || k.startsWith('social.show') || k === 'social.sort')); }
}

module.exports = { Settings, FIELDS, STATUS, TABS };
