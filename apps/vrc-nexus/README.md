# VRC Nexus – Windows app

The complete **VRC Nexus** as a standalone program for Windows – **no server, no web space**.
All data stays on your PC. Screenshots and downloads: see the [main README](../../README.md).

## What’s inside

- 👥 **Friends** with status, location, notes, lists, watching (Windows notification when someone comes online)
- ⭐ **Favourites** (VRChat groups + your own local lists + history)
- 📜 **History** (online/offline, location changes, status, avatar, name, bio, trust) and 📈 **statistics** (playtime, timeline, encounters, heatmaps)
- 🌐 **Worlds & instances** (create, invite, join), 🎭 **avatars** incl. 🔎 **avatar search**
- 🛡️ **Groups** with moderation, posts, roles, 📅 **group calendar** (export as .ics)
- 🖼️ **Gallery** (photos, icons, emojis, stickers, prints, inventory – incl. upload)
- 🔔 **Notifications**, 🛒 **shop**, 🌍 **VRChat worldwide** (player count chart)
- 🚫 Moderation, 📰 info push, 🔍 search, edit profile & status
- 🎮 **Game & OSC** built in:
  - reads the VRChat logs (worlds, who joined/left, avatars, videos, screenshots, invites) → game log, “met”, visits
  - OSC remote: chatbox, typing indicator, avatar parameters, inputs, quick buttons, **chatbox modules & rotator**
  - 🗣 **Voice:** speech input (whisper.cpp), text-to-speech, voice commands, live subtitles & translator
- 🥽 SteamVR overlay, 🎛 Stream Deck plugin, 📺 stream bot
- Keeps running in the **tray** (closing the window minimises), optional **start with Windows**

## Changelog

### New in 5.0.0 – Presets, comfort, OBS & creator tools
- 🎭 **Avatar presets** under OSC: save the current state of the worn avatar (outfit, hair, colours …) and load it with one click – per avatar, up to 30 presets, export/import as JSON, also as a macro step (`preset Name`). VRChat's own and intimate parameters are never stored
- 🌙 **Comfort**: sleep mode with one click (status, chatbox text with rotation paused, toys stopped, optional avatar parameter, alarm), friendly break reminders after long sessions and heart-rate warnings (too high / too low for a while, with cooldown)
- 🎥 **OBS** (Windows): built-in obs-websocket 5 client without extra packages – scene per world, panic scene, live text source with chatbox placeholders; the password is stored encrypted and nothing is sent in private mode
- 🧰 **Unity tools for creators** (`apps/unity-tools`): an editor window that checks the parameter budget and adds the VRC Nexus parameters to an avatar, plus an UdonSharp building block for worlds
- 🔞 ***

### New in 4.4.2 – Safer server switch
- The app only switches to the new domain when the GhostNode services really answer there (signed marketplace catalog, relay health) – a default page or a website still in setup no longer counts

### New in 4.4.1 – New home: ghostnode-labs.dev
- VRC Nexus now uses ghostnode-labs.dev (website, account, chat, community, marketplace) and hr.ghostnode-labs.dev (HypeRate) as soon as they answer – until then, and as a fallback, the previous addresses keep working
- The app checks the right service (not just the domain) at start and every 15 minutes, on Windows and Android

### New in 4.4.0 – Plugin marketplace
- 🛒 **Plugin marketplace** under Plugins: browse reviewed plugins from the GhostNode website, install or update with one click (update badge)
- Every plugin is reviewed before it is published; the catalog is signed (Ed25519) and each package is checked (size, SHA-256) before the usual permission dialog
- Server addresses in one place with automatic fallback – preparation for the move to ghostnode-labs.dev

### New in 4.3.0 – 🔞 Panic button update
- 🔞 *** (only visible in the app when NSFW is unlocked)

### New in 4.2.4 – HypeRate fallback
- If an own (e.g. old) HypeRate key doesn't work, the app automatically uses the VRC Nexus relay instead of showing “HypeRate unreachable”

### New in 4.2.3 – HypeRate without your own API key
- HypeRate now only needs the device ID from the HypeRate app on your watch or phone (e.g. Samsung Galaxy Watch) – the connection runs through the VRC Nexus relay, which holds the project's API key (the key is never inside the app)
- Clear messages for an unknown device ID or an unreachable relay, automatic reconnect
- Developers can still enter their own key

### New in 4.2.2 – “Live only” button
- Parameters page: new “📡 live only” button shows only the parameters whose value VRChat is currently reporting (remembered)

### New in 4.2.1 – OSC receiving fix
- Fix: on Windows, the app re-bound port 9001 right after start, the second bind could fail as "in use", and the app then waited for VRChat via OSCQuery – so no parameters arrived. The receiver now stays open, and a busy port is retried before falling back
- OSCQuery announcement is more robust (all network adapters, repeated announcements, unicast answers)
- Parameters page shows only the avatar you are wearing – detected via OSC, VRChat's OSCQuery tree, the game log or your VRChat account – with its current values right away
- Avatar debugger and OSC status explain what is missing when nothing arrives from VRChat

### New in 4.2.0 – OSC overhaul

- 🔎 **OSCQuery:** VRC Nexus can now announce itself to VRChat via OSCQuery (mDNS) and receive on a free port – so it runs **side by side with other OSC apps** instead of failing with "port 9001 in use". New receive mode under Game & OSC: **Automatic** (9001, falls back to OSCQuery when the port is taken), **OSCQuery only** (leaves 9001 free for other apps) or **Classic**. Nexus also finds VRChat itself and reads its real input port and the worn avatar's parameter list with types.
- 🎯 **Type-correct sending:** avatar parameters are sent with the type the avatar expects (from OSCQuery or VRChat's OSC file). Fixes float parameters with whole values (0/1) being sent as int and ignored by VRChat – e.g. in parameter scenes, recordings and buttons.
- 🚦 **No more flooding:** rapid changes to the same parameter are merged (max. every 50 ms, newest value wins, nothing gets lost).
- 📦 **More OSC types** understood when receiving (double, int64, time tag, char, blob, colour/MIDI, nil/impulse).
- 📊 **OSC status** in the settings: mode, ports, OSCQuery registration, whether VRChat was found, packets per second in/out and merged messages.
- 🔞 *** (only visible in the app when NSFW is unlocked)

### New in 4.1.0 – 🔞 Big NSFW update

- 🔞 *** (only visible in the app when NSFW is unlocked)

### New in 4.0.0 – Home tabs, Pride themes, speaker indicator

- 🏠 **New home page with tabs:** widgets are grouped by topic into **Overview, Media, Shortcuts, Group, System tools, Marketplace and Other**. Each tab keeps its own layout, the active tab is highlighted with a widget counter, and the last opened tab is remembered (can be switched off while customising). Arrow keys switch tabs. Existing layouts are moved to the matching tabs automatically.
- 🧱 **Modernised tiles:** rounded cards with consistent header height, spacing and icons; the grid adapts from four columns down to one on narrow windows and Android, where the tab bar shows icons only.
- 🔗 New widgets: **Shortcuts** (pick any app section plus your own https links), **My groups** (represented group first, owner/moderator marks, quick link to the mod centre), **Marketplace** (credits, saved items and shops) and **Pulse news** (latest VRChat announcements and patch notes).
- 🌈 **Pride profile themes:** pick a flag (Rainbow, Progress, Trans, Bi, Pan, Lesbian, Gay/MLM, Non-binary, Genderfluid, Asexual, Aromantic, Intersex, Agender) in your Nexus community profile – it shows as a colour stripe on your profile, in the "Nexus profile" tab and at the top of the profile window.
- 🗣 **Voice calls show who is speaking:** a live level indicator for you and the other person lights up while someone talks (muted or push-to-talk released counts as silent).
- 📱 **Nexus Pulse on Android** as well.

### New in 3.9.0 – Info cards, Nexus Pulse and instance history

- 🪪 **Info cards for links and IDs:** accounts (`usr_…`), groups (`grp_…`, `vrc.group/…`), worlds, instances, avatars and group events posted in the community feed or chat turn into cards with picture, name and details (max. 3 per post, cached for an hour; invalid IDs show a small error card).
- 📡 **Nexus Pulse – News & Discovery** (new menu item, Windows app): official VRChat announcements from Steam sorted into news, patch notes, developer updates, security notices and creator economy, plus new, popular and top-of-the-week posts from r/VRChat with media previews and comments. ☆ Save posts as favourites (stored locally) and open the original with one click.
  - **Opt-in:** Pulse is off until you turn it on (page button or Settings → Social → Nexus Pulse). It only reads public feeds, without any login, and sends none of your data.
- 👥 **"Who was here"** in the instance window: everyone who was in an instance with you – even after it closed – taken from your own game log, friends first (⭐), with time spent, number of visits and a link to the profile.

### New in 3.8.4 – Modern VR overlay and free HUD placement

- 🥽 **SteamVR overlay redesigned:** glass panels, rounded corners, bigger buttons – and it now follows the app's **theme and accent colour** (Neon, Midnight, Snow, Sakura, Beach). The HUD uses the theme colours too.
- 📐 New overlay tab **"Position":** move, tilt and resize the wrist window, the free window and the HUD right inside VR with +/− buttons; ↺ resets a value.
- 🎯 **HUD in the headset:** when placed "in view" it can be positioned freely – distance, left/right (X), height (Y) and tilt.
- ⌚ Wrist window: adjustable tilt and X/Y/Z offset; the free window gets an adjustable height; the HUD next to the arm gets an adjustable gap.
- 🐞 Fixes: gaze mode no longer flickers when switched off; the overlay no longer breaks when friend or instance data is missing.
- 🪟 Detail windows (profiles, groups, worlds …) use the full width between the menu and the friends bar.
- 🖼 "Open profile picture large" now opens an in-app viewer with save and browser buttons (it did nothing before).

### New in 3.8.3 – New profile layout

- 👤 **Profiles redesigned:** a profile card on the left (banner, round picture, name, pronouns, status, trust/18+/platform, languages with flags, badges, avatar cloning, current avatar, represented group) and the tabs on the right.
- 🫂 New **"Nexus profile"** tab with the person's community profile (bio, languages, interests, links, member since) plus message/call buttons; the 🔞 18+ profile tab stays for unlocked viewers.
- 🛡 **Groups tab** as a grid with pictures, search and sorting – represented and shared groups first.
- 🔞 SFW ↔ NSFW avatar pairs: the editor is open by default.

### New in 3.8.2 – Calmer shared network

- 🕸 **Shared network** settles down instead of wobbling: stronger damping, it cools off and stops, and reloading data no longer stirs the whole picture.
- 🫂 Communities get their own place at the **corners/edges** of the graph; new people appear right at their community.
- ⭕ Profile pictures **no longer overlap** (hard collision).
- 📌 **Drag an account to pin it** – it stays where you put it (pin icon). Right-click → "Unpin" or "Unpin all". Community circles ignore pinned outliers.

### New in 3.8.1 – Profile: community and more actions

- 🫂 **Nexus Community in every profile:** shows whether the person is in the Nexus Community, with buttons for 💬 message, 📞 call and 👤 community profile.
- ⋯ **More actions in the profile menu:** copy user ID, open on vrchat.com, open profile picture, message/call/community profile, invite to me, request invite, edit note, notify when online, activity, mute, hide avatar.
- 🛡 **Groups:** the profile now shows only the represented group plus "＋ More groups (n)" – the popup lists **shared groups first**, then all others, with search.

### New in 3.8.0 – Plugin API for group management

- 🧩 New plugin permission **`vrchat`**: a plugin can manage the VRChat group(s) it names in `plugin.json` (`"groups": ["grp_…"]`) with your account – group info, instances, join requests (accept/decline), posts, members, bans, audit log. Only those groups and only those endpoints; deleting or transferring a group and your own account data are never reachable. The install dialog shows the group IDs.
- 🔒 **Encrypted secret storage** for plugins (`nexus.secrets`) – e.g. Discord/Telegram bot tokens are stored encrypted and never shown in the UI again.
- 🧱 Plugin panels can now use **password fields** and **select lists**; 📂 button to open the plugin folder.

### New in 3.7.3 – Pick friends in the chat

- 💬 Starting a chat: instead of the long list of user IDs, the chat now shows your **online friends** (in game first, then web/app) with picture and status – one click opens the conversation. **Offline friends** appear with a button. Typing filters by name; a direct user ID or profile link still works.

### New in 3.7.2 – Fix: stuck "session expired"

- 🐞 Fixed: after an expired VRChat session the app could stay half signed in ("⚠ Session expired", empty profile box, no logout button). Old leftover errors are now re-checked on start, a VRChat answer without user (2FA required again) also counts as expired, and the error bar always offers "⏻ Sign out & sign in again".

### New in 3.7.1 – Automatic logout for every session

- ⏱ **Nexus account:** if the website no longer accepts your Nexus sign-in (signed out elsewhere, device removed, account blocked), the app now signs you out automatically and shows why – Community, chat and NSFW fall back cleanly instead of failing with errors.
- ⏱ **GhostNode website:** open pages now notice when your login expires (12 h without activity, or 30 days with "stay signed in", or signed out on another device) and send you to the login automatically – with a warning 2 minutes before and a "Stay signed in" button. After signing in again you return to the same page.
- The VRChat session already logs out automatically since 3.6.1.

### New in 3.7.0 – Voice calls 1:1 (PC)

- 📞 **Voice calls** between two VRC Nexus users (Windows app): the 📞 button in a chat conversation. Ringing with accept/decline, call timer, mute, **push-to-talk** (hold button or key, default V), volume, microphone/speaker choice, noise suppression, echo cancellation and automatic gain.
- 🔒 End-to-end encrypted: audio via WebRTC (Opus, DTLS-SRTP); call setup goes through the existing end-to-end encrypted chat, so the server cannot tamper with it. Calls, missed and declined calls appear in the chat history; a second caller gets "busy".
- 🛰 Connections use **only your own STUN/TURN server** (no public servers). The website hands out short-lived TURN credentials; alternatively enter a server under Chat → 📞 Calls. Setup guide: `docs/VOICE-SERVER.md`. Without a server, calls only work within the same network.
- 📱 Calls on Android come later.

### New in 3.6.1 – Automatic logout when the session expires

- ⏱ When the VRChat session expires, VRC Nexus now logs you out automatically instead of staying in a half-connected state. The login page tells you why. A single 401 from another endpoint is double-checked first, so you are not logged out by mistake. (Same on the GhostNode website.)

### New in 3.6.0 – Plugin system (PC)

- 🧩 **Plugins** (Windows app only): VRC Nexus can now load extensions in its own package format **`.nxp`** (a ZIP with `plugin.json`). The app is only the loader – 🧩 Plugins → 📦 Install plugin.
- 🔒 Before installing, the app shows name, author and the requested permissions (chatbox, OSC, notifications, game events, internet). Every plugin runs isolated in its own process: only its own folder, no programs, no `eval`, internet only with the `net` permission. Chatbox/OSC/notifications are rate-limited, private mode blocks the chatbox.
- 🧱 Plugins don't bring their own HTML – they describe their panel (text, buttons, inputs, toggles, stats) and VRC Nexus draws it. Plugin log, on/off, restart and remove per plugin.
- 📝 Bundled example: **Text-Plugin** (send texts to the chatbox, save texts, rotate them). Developer guide: `docs/PLUGINS.md`, packer: `scripts/plugin-pack.js`.

### New in 3.5.2 – Banner fallback, VRC+ badge, avtrDB fixed

- 🎀 People without a profile decoration still get a card banner: VRC+ users their own profile picture, everyone else their current avatar image (a real banner always wins; decorations can still be turned off in Appearance).
- ✨ VRC+ users get a small **VRC+** badge next to their name.
- 🔎 avtrDB works again: avatar databases now receive the app name, version and a contact in the user agent, as avtrDB requires (also on the website's server search).

### New in 3.5.1 – AviSeek avatar search

- 🔎 **AviSeek** is now one of the avatar databases in the avatar search (free, no key): search by name/tag, by creator (user ID or profile link) or by avatar ID, with platform (PC / Quest / iOS) and performance info. Existing provider lists get it added once. Results credit “Data from AviSeek”.

### New in 3.5.0 – Chat on Android and private group chats

- 📱 **Chat on the phone:** the end-to-end encrypted chat now runs in the Android app too, with a phone layout (conversation list or conversation, ← back). Phone and PC talk to each other with the same encryption and the same safety number.
- 🔔 New chat messages show an Android notification while VRC Nexus is open or running in the background (no push when the app is closed yet).
- 👥 **Private group chats** (up to 50 members): every member has its own sender key that is shared only through the encrypted 1:1 connections; every group message is encrypted and signed. When someone is removed or leaves, new keys are created – from then on that person can no longer read along. Keys are also renewed after 100 messages or 7 days.
- 👥 Group admin (the creator) adds/removes members and renames the group; anyone can leave. Reactions, replies, images (only members can download them), heart rate, pins and saved messages work in groups too.

### New in 3.4.2 – Keys only for supporter and moderator

- 🔑 Unlock keys are back to one VRChat account each and only for the supporter and moderator roles – the multiaccount field when creating a key is gone. Switching between several VRChat accounts (⇄) works without any key, as before.

### New in 3.4.1 – Multiaccount without re-entering keys

- 👥 Switching accounts never needed a key. An unlock key entered once also works when the same VRChat account is used in another profile; removing it removes it everywhere.

### New in 3.4.0 – Multiaccount, more chat, cleaner menu

- 👥 **Multiaccount – several VRChat accounts in VRC Nexus:** click ⇄ in your profile box (top right) to switch accounts or sign in another one. Every account has its **own database** (session, friends, history, favourites, notes, chat keys, Nexus account) – nothing mixes. Switching restarts the app with the other account; the first account keeps all your existing data. New accounts take over your look (theme, language, layout). Passwords are never stored.
- 🔑 Key changes are written to a permission log in Admin.
- 💬 **Much more chat** (still end-to-end encrypted – the website only ever sees ciphertext):
  - reactions (❤️ 😂 👍 😮 😢 🔥 🦊 🐾), reply with quote, edit and delete your own messages for both sides
  - **read receipts** ✓ / ✓✓ (can be switched off)
  - **images and GIFs**: encrypted on your device with a fresh key, uploaded only as ciphertext and deleted after 30 days; only you and the recipient can load them
  - 💓 share your current heart rate
  - 📌 pin messages per conversation and ★ save messages (local only)
  - 📱 device overview: see your chat devices and remove old ones
- 🔞 *** (only visible in the app when NSFW is unlocked)
- 🧭 **Menu:** the profile box at the top right opens *My profile* (the "Me" entry in the right sidebar is gone); the game section is now called **"Game & more"**; the *More* group is gone – group calendar, gallery & inventory and shop are now under **Tools**; **avatar search** now lives under **Search** (🎭 Avatars); with the custom title bar the sidebar starts right at the top again.

### New in 3.3.3 – Admin icons between theme and language

- 👑 🛡 The small Admin (owner) and Moderation (owner and moderators) icons now sit between 🎨 theme and the language button; theme and language keep their size and place.

### New in 3.3.2 – Admin as an icon

- 👑 **Admin moved next to theme and language:** the owner gets a 👑 icon there (opens Admin), moderators a 🛡 icon (opens Community moderation). Everyone else sees nothing; the Admin entry is gone from the menu list.

### New in 3.3.1 – HypeRate in the chatbox, cleaner sidebar

- 🔞 *** (only visible in the app when NSFW is unlocked)
- 💓 **Heart rate source right in the chatbox module:** choose Pulsoid, HypeRate (ID + API key) or OSC/smartwatch directly in Chatbox modules → Heart rate; an invalid Pulsoid token now suggests switching to HypeRate.
- 🪟 With the custom title bar, the sidebar no longer shows a second "VRC Nexus" logo.

### New in 3.3.0 – VR movement (Space Flight · Space Turn · Space Walk)

In-game movement for VR, under **Game & OSC → 🚀 VR movement** and in the **SteamVR overlay** (new "🚀 Movement" tab). Own implementation in the existing SteamVR helper: it moves and rotates the playspace (SteamVR standing zero pose) – no extra driver needed.

- 🚀 **Space Flight:** hold the button and grab the world to move yourself; drag multiplier, grab with left/right/both hands, gravity (fall back to the floor, with strength), X/Y/Z axis lock, live X/Y/Z offset.
- 🔄 **Space Turn:** rotate the playspace around you by moving your hand around your head; turn multiplier, smoothing, comfort mode (smooth or 15°/30°/45° steps), invert direction.
- 🧭 **Space Walk:** change pitch/roll/yaw by rotating your hand; rotation multiplier, smoothing, momentum, invert direction, pitch/roll/yaw lock.
- 🎮 **Controls:** status with Connect/Disconnect, "start when VRChat starts in VR", button mapping **Standard** (SteamVR input, rebindable in SteamVR → Controller bindings → VRC Nexus) or **Legacy** (fixed buttons), with a controller graphic of the assigned button for Index, Quest/Rift, Vive and WMR. Reset returns to the original playspace; the original is remembered and restored when the helper quits.
- Works without the SteamVR overlay being enabled (the helper then runs without a dashboard tab).

### New in 3.2.5 – OSC on the phone

- 📡 **Own OSC connection from the phone straight to VRChat** (no PC app needed): enter the PC's IP under Menu → **OSC & parameters**, test the connection, and start VRChat with the launch option shown there (`--osc=9000:<phone IP>:9001`) so it accepts OSC from the network and reports parameter values to the phone. Uses a small built-in Android UDP module (local network addresses only).
- 🎚 **Avatar parameters made for the phone:** every parameter of the current avatar as a big switch, slider or −/+ stepper, with search; ⭐ favourites stay on top and turn into a Nexus button with one tap. Parameters can also be added by name.
- 🎛 **OSC buttons in the Stream Deck:** avatar parameter (toggle/set), parameter step (+/−), OSC input, chatbox text, clear chatbox, "typing…", parameter scene, recording (record/play) and chatbox modules on/off.
- 🎭 **Scenes, recording and chatbox modules on the phone:** save and restore parameter scenes, record and replay parameter movements; chatbox modules without PC data (status, time, weather, Twitch, countdown, friends, marquee, animation).

### New in 3.2.4 – Simpler phone app

- 📱 **Cleaner Android layout:** a fixed bottom bar (Home · Friends · Community · Buttons · Menu), a compact one-line header and sync line, and a slide-in menu with names and the same groups as the PC sidebar instead of the icon grid. Theme and language moved into the menu; the friend list shows just the search plus a "Filter" button.
- 🎛 **Nexus buttons work without a PC:** only actions that run directly over the VRChat API remain – status, switch avatar, friend (self-invite / request invite / invite to my instance), create instance, open an app area, and live counters (friends online, notifications). Old PC buttons are removed automatically.
- 🐛 **Fixes:** avatar and friend buttons no longer overwrite their own button ID; the example buttons keep stable IDs so live counters show up; messages appear above the bottom bar.

### New in 3.2.3 – Shared network, better feed and profile

- 🕸 **Shared network (Community):** an interactive map of your social circle. Friends appear as profile pictures; lines show real mutual friendships (from VRChat's mutual-friends data), coloured rings and clouds show shared communities (VRChat groups you are in yourself). Search, zoom, drag, filters (minimum connections, direct friends only, only connected people, communities, hide people), optional non-friends you met in game several times, and a side panel with your friend list and communities. Blocked users never appear; data is fetched slowly in the background and cached.
- 💬 **Feed as a real chat window:** messages fill the whole area, the input box always stays visible at the bottom.
- 👤 **My profile shows your VRChat profile too:** status, trust rank, pronouns, platform, member since, location, bio, links and groups right next to your Community profile.
- 🧭 **Community menu order:** My profile · Friend list · Groups · Feed · Chat · Shared network · Friend log · Blocked & muted.

### New in 3.2.2 – More avatar search providers

- 🔍 **Avatar search:** NSVR (NekoSune Community) and VRCDB are now built in, with readable provider names. Existing custom provider lists get them added once; providers you remove afterwards stay removed.

### New in 3.2.1 – Formatting toolbar

- ✍ **Formatting toolbar in the feed, replies and private chat:** bold, italic, strikethrough, code, link, list, quote, spoiler and code block with one click (or Ctrl+B / Ctrl+I), plus a 👁 live preview – no need to know Markdown.
- 🌐 **Your texts stay yours:** posts, chat messages, profiles and descriptions are no longer run through the app's automatic interface translation.

### New in 3.2.0 – One Community area, chat-style feed, Markdown

- 🫂 **Community and Social merged:** one menu area with Feed, Chat, My profile, Friend list, Friend log, Groups and Blocked & muted; the NSFW switch sits in the same bar. Warn list and the group mod centre moved to **Tools**.
- 👤 **My profile shows everything:** tabs for your Community profile, **Status & VRChat** (status, VRChat bio/pronouns/links, notifications – formerly "Account & status") and your 18+ profile. "Me" in the friends bar opens it.
- ⚙ **Connection & data** (connected as, sync info, CSV exports, shortcuts) moved to Settings → System; the extra log-out button there is gone (log out via the power button at the top).
- 💬 **Feed as a chat:** oldest at the top, newest at the bottom, input at the bottom, your own posts on the right, refreshes every 10 seconds.
- ✍ **Markdown in feed and chat:** **bold**, *italic*, ~~strike~~, `code`, code blocks, quotes, lists, headings, links and ||spoilers|| – safe, no HTML.
- 🌍 **World window – Community:** share a world in the feed (with a comment), send it to a chat partner or copy the link; shared world links open the world right in the app.
- 🔞 *** (only visible in the app when NSFW is unlocked)
- 🖼 **Profile pictures:** missing pictures are now taken from VRChat's presence data or the last known picture instead of showing the placeholder.
- 🎚 **Slim scrollbars:** thin and subtle everywhere, only a fine line in the side bars; the coloured bar is gone.

### New in 3.1.3 – Title bar in the app design

- 🪟 **Windows title bar in the app design:** the grey Windows title bar is gone – VRC Nexus draws its own (logo, name, current page) in the colours of your theme, and the minimise / maximise / close buttons take on the theme colours too (snap layouts keep working).

### New in 3.1.2 – Community & NSFW overhaul completed

- 🔞 *** (only visible in the app when NSFW is unlocked)

### New in 3.1.1 – Profile facts, tidier menus

- 🪪 **Community profile facts:** gender (several possible plus your own), sexual orientation, relationship status and whether you are looking for a partner – shown on your Community profile.
- 🔞 *** (only visible in the app when NSFW is unlocked)
- 🧭 **Left menu:** groups like Social or Favourites no longer expand in the sidebar – their sub-pages are already shown as tabs at the top; clicking the group opens the page you used last.
- ⚙ **Settings:** the settings tabs (System, Interface, Social …) now sit in the top bar instead of the "More" group.
- 🎀 **Profile decorations fixed:** frames no longer cover the profile picture, "avatar banners" now show the current avatar picture, and name effects stay readable.

### New in 3.1.0 – Profile decorations

- 🎀 **Profile decorations everywhere:** the frame around the profile picture, the banner colour/image and the name effect that people set in VRChat now appear wherever profiles are shown – friend cards, the friends bar, profile window, player list, home, locations and more. Can be switched off under Settings → Appearance.

### New in 3.0.6 – Neon Beach theme

- 🌴 **New theme "Neon Beach":** a retro sunset look – pink, orange and turquoise neon, gradient headings, a hand-drawn sunset with palms, skyline and sea as background (also selectable on its own under Background). Choose it via 🎨 or Settings → Appearance.

### New in 3.0.5 – Community profile fix

- 🫂 **Community:** "My profile" and other people's profiles open again (no more "invalid VRChat user ID").

### New in 3.0.4 – Account fixes and a smarter friends bar

- 🪪 **Nexus account:** older VRChat accounts with a short user ID can now connect (no more "invalid VRChat user ID").
- ✔ **Age check:** the app now reads your own VRChat profile first and also recognises accounts that are verified with the 18+ badge hidden; the status endpoint is only used as a second source.
- ⌨ **Shortcuts:** Ctrl+1…9 jump to the entries of the left menu (groups open the sub-page you used last); Community and Notifications remember their last view.
- 🌐 "Worlds" is now "My worlds": it opens your own uploaded worlds (favourite worlds stay under ⭐ Favourites).
- 👥 **Friends bar:** right-click menu (open profile, join, view instance, request invite, invite to my instance, copy ID), a "Just online" section for friends who came online in the last 10 minutes, sorting (A–Z, recently active, by world), long lists load in steps and stay smooth, and group instances can be joined straight from the list.

### New in 3.0.3 – Every Stream Deck action on your phone

- 🎛 **Nexus buttons (Android):** all Stream Deck plugin actions are now available as buttons – avatar parameter steps, chatbox rotator, launch VRChat, rejoin, open VRC Nexus, camera, macros, switch avatar, friends (join/invite/request), SteamVR overlay, voice input, media, quick texts, parameter scenes, recording, chatbox modules, read aloud and create instance + invite. They run on your PC through the dashboard connection, just like a Stream Deck key.
- 📊 **Display buttons:** friends online, players in the instance, notifications and a free info display (`{world}`, `{players}`, `{friends}`, `{notifs}`, `{avatar}`, `{time}`) show live values; tapping opens the matching section.
- 🔒 Only actions on an allowlist are accepted, and macros must already exist on the PC.
- 🧭 **Tidier sidebar (Windows):** the left menu is now grouped into sections – overview, people, game and content – with matching sizes for all entries.

### New in 3.0.2 – Connect in one click

- 🪪 **Nexus account:** connecting now works directly with your VRChat login – one click, no code and no changes to your VRChat bio.

### New in 3.0.1 – Easier account setup

- 🪪 **Nexus account:** connecting works without extra setup on the website, and your status is now checked directly with VRChat for your own account – no profile settings needed.
- 🔞 *** (only visible in the app when NSFW is unlocked)

### New in 3.0.0 – Community, encrypted chat, heart rate & warning list

- 🪪 **Nexus account:** one account for all online features, tied to your VRChat ID – no extra password. To verify, Nexus briefly writes a code into your VRChat bio and restores it afterwards. Online services are **opt-in**; without an account the app works as before. (Settings → Advanced)
- 🫂 **Community** (new menu item): feed with replies, reactions and images, your own profile (bio, pronouns, languages, interests, links, picture, banner), reporting. Everything is checked on the server.
- 💬 **End-to-end encrypted private chat** (Community → Chat): own implementation of the published Signal protocols (X3DH + Double Ratchet). Only you and the other person can read messages – not even the GhostNode website. Multiple devices, safety numbers and a clear warning when someone’s keys change. Windows app first; Android follows.
- 🛡 **Moderator role:** the owner appoints moderators (unlock key with “🛡 Moderator”). Moderators get a queue for reports and pending posts, can hide, delete, reclassify, mute or ban – everything is logged.
- ⚠ **Shared warning list** for crashers, rippers and trolls (Social → Warning list), stored on the GhostNode website: evidence required, visible only after several independent reports, entries expire, appeals possible. Red badge in profiles, the player list and the friends bar, plus a notice when someone on the list joins your instance – never in the chatbox.
- 💓 **Heart rate:** one source for the whole app – Pulsoid, HypeRate or OSC/smartwatch. Sent as avatar parameters (HR, HRPercent, isHRActive …), placeholders `{puls}` for chatbox, rotator, macros and Stream Deck, SteamVR HUD and a home widget with a live graph. (Game & OSC → Heart rate)
- 🎛 **Nexus buttons (Android):** a local Stream Deck alternative as its own tab – freely arranged buttons on pages with icon, label and colour; chatbox, inputs, avatar parameters on the PC, VRChat status or open an app area. No Stream Deck needed. Idea by Natsu 💡
- 🔑 **Unlock keys** are now only for roles (💖 supporter, 🛡 moderator).
- 🔞 *** (only visible in the app when NSFW is unlocked)
- 🧰 Fixes: the Patreon supporter update works again.

### New in 2.15.3 – New repository location

- 🏠 **New home:** the repository moved to **ghostnode-labs/vrc_nexus**. Updater, links in “About”, the supporters list and Discord images now point there directly (older versions still work via GitHub’s redirect).

### New in 2.15.2 – Log out button

- 🚪 **Log out:** new ⏻ button right on your profile card (next to your name) and a clear “🚪 Log out” button under More → Account. Friends, history and notes stay saved on the device.

### New in 2.15.1 – Voice sub-menu

- 🗣 **Voice menu:** in “Game & OSC” the three voice tabs (speech input, text-to-speech, translator) are now grouped under one “🗣 Voice ▾” entry with a sub-menu; the entry shows which one is open.

### New in 2.15.0 – Audio source for live subtitles

- 🔊 **Audio source for live subtitles:** choose between “System sound” (everything you hear) and any recording device – e.g. a virtual cable (VB-Cable, VoiceMeeter) carrying only VRChat, or a microphone. 🔄 reloads the device list; switching the source while listening restarts automatically.
- 🎨 **Translator settings redesigned:** two clear cards – “🔊 Audio & recognition” and “🌍 Translation & display” – with labels above the fields.

### New in 2.14.3 – Speech history moved up

- 🎙 **Speech page:** the “📜 History” card now fills the free space at the top instead of sitting alone below the voice commands.

### New in 2.14.2 – Live supporters list

- 💖 **Live supporters list:** a GitHub job fetches the active Patreon supporters every 12 hours; the app loads the current list when you open “About” – no app update needed. Offline it falls back to the list shipped with the app.

### New in 2.14.1 – Patreon link updated

- ❤ Patreon link updated to patreon.com/cw/VRCNexusTools.

### New in 2.14.0 – Patreon & supporters

- ❤ **Patreon in “About”:** banner, short note and a “Support on Patreon” button (patreon.com/cw/VRCNexusTools). The link can be changed before each build via the GitHub secret or variable `PATREON_URL`.
- 💖 **Supporters list:** active patrons are shown grouped by tier. The list is fetched from Patreon at build time (GitHub secret `PATREON_TOKEN`, never shipped in the app) – only display name and tier.

### New in 2.13.4 – Translations completed

- 🌍 **Translations:** NSFW section (overview, toys & links, fun stuff, remote control, phone), Admin and “About” are now fully translated into English, French and Japanese (148 new texts).

### New in 2.13.3 – English changelogs

- 🌍 **Changelogs in English:** from now on the changelog (app “About” page, GitHub releases, Discord news) is written in English, including the download table and Discord fields.
- 🧹 Release notes no longer include the commit message.

### New in 2.13.2 – Discord button in “About the app”

- 💬 The Discord button now sits in the “ℹ️ About the app” card instead of next to the version at the top.

### New in 2.13.1 – Discord in About

- 💬 **Discord in “About”:** “Join Discord” button (discord.gg/YaktdxVr2C). The link can be changed before each build via the GitHub secret or variable `DISCORD_INVITE` – no code change needed.
- 📣 Discord news posts now include the invite link.

### New in 2.13.0 – Discord news & separate changelog

- 📣 **News in Discord:** every update automatically posts a message with changelog and download links to the Discord channel (webhook as GitHub secret `DISCORD_WEBHOOK`). An **extra webhook** (`DISCORD_WEBHOOK_NSFW`) receives the 🔞 part in its own channel – only for versions that have one.
- 📝 **Changelog in the GitHub releases** (and therefore in the app’s update notice).
- 🔞 **Separate NSFW changelog:** public places (README, GitHub, Discord news) only show “🔞 ***”; in the app under “About” the NSFW part appears only when NSFW is unlocked.

### Neu in 2.12.1 – 🔞 ***

- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)

### Neu in 2.12.0 – 🔞 ***

- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)

### Neu in 2.11.0 – 🔞 ***

- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)

### Neu in 2.10.3 – Neues Repository

- 📦 **Neues Zuhause:** Das Repository heißt jetzt **xxloonaxx/vrc_nexus** und enthält nur noch die Apps (Windows, Android, Stream Deck). Die Webseite ist in ein eigenes Repository umgezogen.
- 🔄 Der Updater sucht Updates jetzt direkt unter dem neuen Namen (ältere Versionen finden sie über die GitHub-Weiterleitung weiterhin).

### Neu in 2.10.2 – Android-Fix

- 🩹 **Android-Fix:** Die Handy-App blieb seit 2.9.x schwarz mit `{"error":"Nur sha1 verfügbar."}`. Die Handy-App kann jetzt auch SHA-256 (für den Admin-/Owner-Check), sie startet wieder normal.
- Neuer Test prüft, dass die Handy-App jeden Hash kann, den das Backend benutzt.

### Neu in 2.10.1 – Eigene Hintergründe

- ✨ **Eigene Hintergründe:** 5 mitgelieferte Hintergründe (Synthwave, Polarlicht, Sakura-Nacht, Nexus-Raster, Galaxie) im Hintergrund-Auswahlfenster – oben unter „✨ Eigene“, darunter wie gehabt die VRChat-Galerie.
- Funktionieren auch ohne VRChat-Login (Galerie nicht nötig) und in der Android-App.

### Neu in 2.10.0 – 🐞 Avatar-Debugger

- **🐞 Avatar-Debugger** (Spiel & OSC): alle Avatar-Parameter live in zwei Spalten – `true` grün, `false` rot, Zahlen mit Wert; gerade geänderte Werte leuchten kurz auf, SPS-/OGB-Parameter sind rosa markiert.
  - Suche, Filter „nur SPS / OGB“ und „zuletzt geändert“, Anhalten, alles als JSON kopieren.
  - Oben steht, ob OSC von VRChat ankommt und ob der OSC-Port belegt ist (z. B. durch ein anderes OSC-Programm).
  - 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)

### Neu in 2.9.9 – 🔞 ***

- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)

### Neu in 2.9.8 – 🔞 ***

- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)

### Neu in 2.9.7 – 🔞 ***

- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)

### Neu in 2.9.6 – Abzeichen „Nexus Admin“

- **Abzeichen „👑 Nexus Admin“** in Pink im Profil-Fenster der Besitzerin – sichtbar für alle, die ihr Profil in VRC Nexus öffnen (erkannt am Hash der VRChat-ID).

### Neu in 2.9.5 – 🔞 ***

- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)

### Neu in 2.9.4 – 🔞 ***

- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)

### Neu in 2.9.3 – Freischalt-Schlüssel gelten jetzt überall

- **Öffentlicher Schlüssel des Besitzers eingebaut**: Freischalt-Schlüssel aus dem Admin-Bereich funktionieren jetzt in jeder VRC-Nexus-App (ab dieser Version) – weiterhin nur für das VRChat-Konto, für das sie ausgestellt wurden.

### Neu in 2.9.2 – Admin nur für den Besitzer

- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)
- **👑 Admin nur für den Besitzer ausgeliefert**: Meldet sich ein anderes Konto an, sind Admin-Menüpunkt, Admin-Seite und Admin-Skript gar nicht in der App-Seite enthalten (nicht nur versteckt); alle Admin-Befehle verweigert die App sowieso.

### Neu in 2.9.1 – 👑 Admin als eigener Menüpunkt mit Spielereien

- **👑 Admin als eigener Menüpunkt** in der Seitenleiste (nur für den Besitzer sichtbar und nutzbar):
  - **🔑 Freischalt-Schlüssel**: Schlüsselpaar, Schlüssel erzeugen (wird gleich kopiert), Liste mit Sperren/Entsperren.
  - **🧪 Ereignis simulieren**: „Spieler kommt/geht“ und „Video startet“ – testet Benachrichtigungen, Automatik und Discord-Status, ohne dass jemand wirklich kommt.
  - **🖥 System**: Version, Laufzeit, Speicher, Datenbank, Spielstatus, Fehler-Log ein/aus, Log ansehen und leeren.
  - **🔍 API-Konsole**: beliebige VRChat-API-Abfragen (nur lesen, GET) mit Antwort als JSON zum Kopieren.
  - **✨ Spielereien**: in die Chatbox (👑 Admin da, 💖 Herz-Animation, Countdown, Welle, 🎲 Würfeln, 🪙 Münze) und in der App (🎉 Konfetti, 🪩 Theme-Disco, 🟩 Matrix).

### Neu in 2.9.0 – Besitzer & Admin, Freischalt-Schlüssel

- 🔞 *** (nur in der App sichtbar, wenn NSFW freigeschaltet ist)
- **👑 Besitzer & Admin**: Admin- und Dashboard-Funktionen (Dashboard-Verbindung, Cloud-Sicherung) gibt es nur für das Besitzer-Konto (im Code steht nur ein Hash der VRChat-ID). Der Besitzer erzeugt **Freischalt-Schlüssel** – Ed25519-unterschrieben, **fest an eine VRChat-User-ID gebunden** (weitergeben oder umschreiben geht nicht), mit Ablauf, Rechten (NSFW, Spielzeug, Handy) und Sperren-Knopf.

### Neu in 2.8.8 – Discord-Status ohne Einrichtung

- **Discord-Status ohne Einrichtung**: VRC Nexus hat jetzt eine eigene Discord-Anwendung fest eingebaut – unter Einstellungen → Integrationen → Discord Rich Presence einfach einschalten, keine Client-ID mehr nötig.
- Wer eine eigene Discord-Anwendung nutzen will, kann ihre Client-ID weiterhin eintragen (Feld „Eigene Discord Client-ID (optional)“).

### Neu in 2.8.7 – Update-Knopf im Stream-Deck-Plugin

- **Stream-Deck-Plugin aktualisieren per Knopf** (Plugin 1.7): In jeder Taste unter „🔌 Verbindung zu VRC Nexus“ zeigt „Verbindung testen“ jetzt die installierte Plugin-Version und die, die mit VRC Nexus kommt – ist eine neuere da, steht „Update verfügbar!“ dabei.
- **„⬆ Plugin aktualisieren“** installiert die neue Version direkt: VRC Nexus öffnet die mitgelieferte Plugin-Datei, die Stream-Deck-App fragt einmal nach – bestätigen, fertig. Deine Tasten und Einstellungen bleiben erhalten.

### Neu in 2.8.6 – Welt-Infos mit IDs, Reiter Info & JSON

- **Welt-Fenster: neuer Bereich „Infos“** mit Welt-ID und Autor-ID (je mit ⧉ zum Kopieren), Status (öffentlich/privat/Community Labs), Erstellt, Labs seit, Veröffentlicht, Aktualisiert mit Versionsnummer, Beliebtheit/Hitze, Unity-Version, Inhaltshinweise, Vorschau-Video und Bild-Datei-ID.
- **Reiter „Info“ und „JSON“** im Welt- und im Avatar-Fenster: JSON zeigt die kompletten Rohdaten von VRChat als aufklappbaren Baum – mit Neu laden, Herunterladen, Kopieren und „alles aufklappen“.

### Neu in 2.8.5 – Weltbild auf der Instanz-Taste

- **Stream Deck – „Instanz erstellen + einladen“**: Sobald eine **Welt-ID** (oder der vrchat.com-Link der Welt) eingetragen ist, zeigt die Taste das **Bild der Welt** mit der Instanz-Art (z. B. „Invite+“) unten drauf und einem ＋-Abzeichen. Bei „current“ bleibt das normale Symbol.

### Neu in 2.8.4 – Kopieren, Avatarbild & Instanz-Taste fürs Stream Deck, FPS-Modul

- **Kopieren repariert**: Die ⧉-Knöpfe (z. B. Avatar-ID im Avatar-Fenster, Benutzer-ID, Instanz-ID) kopieren jetzt zuverlässig – über die Zwischenablage der App statt der des Browsers, mit Bestätigung „📋 Kopiert: …“.
- **Stream Deck – Avatar wechseln** zeigt das **Vorschaubild des Avatars** auf der Taste statt des Platzhalters. Im Plugin gibt es eine **Auswahlliste** deiner Avatare und Favoriten (nach „Verbindung testen“); Bild abschaltbar.
- **Stream Deck – neue Taste „Instanz erstellen + einladen“**: erstellt per Tastendruck eine neue Instanz (aktuelle Welt oder feste Welt-ID; Friends+, Friends, Invite+, Invite, Öffentlich oder Gruppe; Region) und schickt dir die Einladung ins Spiel.
- **Chatbox-Modul „FPS“**: zeigt die Bildrate von VRChat in VR ({fps}, {fps_min}) – gemessen über SteamVR, braucht das eingeschaltete SteamVR-Overlay. Am Desktop ohne SteamVR gibt es keine Quelle, dann fällt das Modul weg.

### Neu in 2.8.3 – Prints hochladen

- **Prints hochladen**: In Galerie & Inventar → Prints gibt es jetzt den Hochladen-Knopf mit optionaler **Notiz** (max. 32 Zeichen). Bist du gerade in einer Welt, wird sie mitgeschickt. Wie in VRChat selbst braucht das **VRC+**.

### Neu in 2.8.2 – Über-Reiter aufgeräumt

- Einstellungen → ℹ️ Über aufgeräumt: der doppelte Block „Version & Updates“ ist weg. Version, Plattform, „zuletzt geprüft“ und der Status stehen jetzt im Kopf neben dem Logo, **„Nach Updates suchen“** (bzw. „Jetzt aktualisieren“, wenn eins da ist) sitzt rechts daneben.

### Neu in 2.8.1 – SteamVR-HUD mit Infos & Untertiteln

- **SteamVR-HUD (Infos & Untertitel)**: zweites, nicht bedienbares Fenster in SteamVR – wahlweise **neben dem Arm-Fenster** oder **unten im Blickfeld** wie Untertitel (Einstellungen → VR → „SteamVR-HUD“).
  - Zeigt die letzten Untertitel: deine eigene Sprache (Mikro) und den Übersetzer „VRChat → Text“ mit Flagge und „EN → DE“, Original optional klein darunter.
  - Dazu wählbare Infos: Uhrzeit, Welt, Spielerzahl, Spielzeit, Musik, Freunde online, Avatar, Region.
  - Breite und Deckkraft einstellbar; läuft zusammen mit dem SteamVR-Overlay.

### Neu in 2.8.0 – Übersetzer „VRChat → Text“, Sprachbefehle, Sprache automatisch

- **🈯 Übersetzer „VRChat → Text“** (Spiel & OSC → Übersetzer): hört den Spielton mit (Windows-Systemton), erkennt lokal mit whisper.cpp, was andere sagen, und zeigt es **übersetzt als Live-Untertitel** – z. B. Englisch → Deutsch.
  - **Sprache automatisch erkennen** ist Standard: pro Satz neu, auch wenn mehrere Leute verschiedene Sprachen sprechen. Am Untertitel steht Flagge + Kürzel, z. B. „🇬🇧 EN → DE“.
  - Gesprochene Sprache auch fest wählbar (36 Sprachen), Zielsprache frei (alle DeepL/Google-Sprachen, Standard = App-Sprache).
  - Sätze in der Zielsprache werden nicht übersetzt, unsichere Erkennung wird mit „?“ markiert (Mindest-Sicherheit einstellbar), Sprachen lassen sich ignorieren, Original optional klein darunter.
  - Whisper-Modell getrennt wählbar (kleines Modell empfohlen – läuft dauerhaft). Der Ton bleibt auf dem PC, nur der erkannte Text geht zum Übersetzen an DeepL/Google.
- **Spracheingabe → Chatbox**: Sprache jetzt standardmäßig **automatisch erkannt**; schon in der Zielsprache gesprochen → keine Übersetzung. Im Verlauf steht die erkannte Sprache als Flagge.
- **⚡ Sprachbefehle** (Spiel & OSC → Sprache): Satz sagen → Avatar-Parameter (Bool an/aus/umschalten, Int, Float) per OSC. Liste mit Testknopf, Import/Export (JSON), optional Löschen per Doppelklick + „Alle löschen“, einstellbar ob dann nichts in die Chatbox geht.

### Neu in 2.7.2 – Prints, Sticker & Emoji speichern

- **Prints, Sticker und Emoji aus der Instanz als Datei speichern** (Einstellungen → Medien → „Aus der Instanz speichern“), je eigener Schalter. Landen im VRChat-Bilder-Ordner in „Prints“, „Stickers“ bzw. „Emoji“ (nach Monat sortiert, mit Datum, Name und ID im Dateinamen).
- Prints optional **ohne weißen Rand** (gleichmäßig weißer Rand rundherum wird abgeschnitten).
- Erkennung über das VRChat-Log, Download über deine angemeldete Sitzung. Für Prints und Emoji braucht VRChat die Startoption `--enable-sdk-log-levels` (unter Werkzeuge → VRChat starten einstellbar).
- Neue Einträge im Spiel-Log: 🖨️ Print, 🏷️ Sticker, 😀 Emoji.

### Neu in 2.7.1 – Benutzerfarben, Discord-Status, VRChat-Wächter

- **Benutzerfarben** (Einstellungen → Oberfläche → Benutzerfarben): Farbe je Vertrauensstufe selbst wählen (Besucher, Neuer Benutzer, Benutzer, Bekannter, Vertrauter, VRChat-Team, Störenfried) – oder per Schalter **feste Farbe pro Benutzer** aus seiner ID. Gilt in Freundesliste, rechter Leiste, Spielerliste, Profil und Freunde-Orten, sofort ohne Neuladen.
- **Discord-Status** ausgebaut: Welt-Integration („Schaut …“/„Hört …“ mit Titel bei YouTube/SoundCloud/Vimeo aus dem VRChat-Log), Plattform (PC/VR/Quest), Weltbild, Medienbild (Video-Vorschau), Weltname als Aktivität; Details in privaten Instanzen (Invite/Invite+/Gruppe, „Ask Me“) verbergen; Beitreten-Knopf nur öffentlich. Hinweis: nur in einer Instanz aktiv, VRChats eigene Rich Presence ausschalten.
- **VRChat** (Einstellungen → System → VRChat): nach Absturz automatisch neu starten und letzte Instanz wieder betreten (max. 3× in 30 min), VRChat beim Beenden hart schließen, Cache beim Beenden aufräumen (älteste Einträge bis zur Grenze), **Selbst-Einladung statt Instanz öffnen** (alle ▶-Beitreten-Knöpfe und Stream Deck).

### Neu in 2.7.0 – Über in den Einstellungen, App-Sprache automatisch

- **„Über VRC Nexus“ ist jetzt ein Reiter der Einstellungen** (⚙ Einstellungen → ℹ️ Über) statt eines Menüpunkts unter „Mehr“. Alte Wege (Befehlspalette, Links) landen automatisch dort.
- **Version & Updates** (installierte Version, zuletzt geprüft, „Nach Updates suchen“, Aktualisieren) steht jetzt oben im Über-Reiter statt unter System.
- **App-Sprache automatisch**: neue Wahl „🌐 Automatisch (Systemsprache)“ – nimmt die Sprache von Windows/Android (Deutsch, Englisch, Französisch, Japanisch; andere → Englisch). Auch im Flaggen-Menü. Standard für neue Installationen; wer schon eine Sprache gewählt hat, behält sie.

### Neu in 2.6.3 – Logs & OSC wie die anderen Einstellungen

- Einstellungen → VR → „VRChat-Logs & OSC-Verbindung“ ist jetzt in normalen Einstellungszeilen (Name links, Schalter/Feld rechts) statt in Kästen.
- Wie überall in den Einstellungen wird **sofort gespeichert** – kein eigener Speichern-Knopf mehr.

### Neu in 2.6.2 – Chatbox-Rotator als Modul

- Der **Chatbox-Rotator** sieht jetzt aus wie die anderen Chatbox-Module: eigene Zeile unter der Modulliste mit Symbol, Kurzinfo (z. B. „3 Texte · alle 30 s“), **Schalter** (speichert sofort) und **„Anpassen ›“** zum Aufklappen von Texten, Takt, Reihenfolge und Vorschau.

### Neu in 2.6.1 – Aufgeräumt: Abgleich oben, Einstellungen am richtigen Ort

- Die Abgleich-Leiste („… im Spiel · … online · … Freunde“, automatisch, Strg+K, Aktualisieren) sitzt bei Menü links **ohne Rahmen oben im Kopf** neben dem Profil.
- Spiel & OSC: der Unterpunkt **„Einstellungen“ ist weg** – VRChat-Logs und OSC-Verbindung stehen jetzt unter **Einstellungen → VR → „VRChat-Logs & OSC-Verbindung“**.
- Der **Chatbox-Rotator** steht jetzt oben im Reiter **Chatbox-Module**.

### Neu in 2.6.0 – Hintergrundbild

- **Einstellungen → Oberfläche → Hintergrundbild**: eigenes Bild hinter der ganzen App.
- Bild wählen **aus der VRChat-Galerie** (Fotos & Prints), **als Datei vom PC** (PNG/JPG/GIF/WebP, max. 8 MB – bleibt nur lokal in der App-Datenbank) oder per **https-Adresse**.
- Regler für **Deckkraft** (0–100 %) und **Weichzeichnen**, dazu „Anpassen“: Ausfüllen, ganz zeigen, kacheln oder mittig.
- In der Galerie hat jedes Foto/Print einen 🖼-Knopf „Als App-Hintergrund“.
- Funktioniert in der Windows- und der Android-App.

### Neu in 2.5.2 – Info-Push: echte Tag-Abfrage

- VRChat verlangt `require` und `include` als JSON-Liste – die kommagetrennte Variante (Fehler 400) ist raus.
- Abgefragt werden jetzt vier Tag-Gruppen (u. a. `user-all`, `high-priority`, Plattform-Tags, Quick-Menü/Launchpad/Hilfe); Ergebnisse werden zusammengeführt.
- Einträge ohne erkennbaren Tag landen nach Inhalt in der richtigen Kategorie (Artikel → Hilfe, Bild → Banner).
- Bleibt die Liste leer, zeigt die Diagnosezeile pro Gruppe, was VRChat geantwortet hat.

### Neu in 2.5.1 – Leisten einklappen & Breite ziehen
- **Linke Leiste**: « klappt sie zur schmalen Symbolleiste ein, » wieder auf.
- **Rechte Freunde-Leiste**: » klappt sie zu einem schmalen Griff am Rand ein, « Freunde holt sie zurück.
- **Breite ziehen**: am Rand jeder Leiste ziehen (links 170–380 px, rechts 220–520 px), Doppelklick auf den Rand = Standardbreite. Alles wird gemerkt.
- Direkt-Zugriff und Einstellungen sitzen jetzt ganz unten, bündig über 🎨 Theme und Sprache – die beiden sind eckig und stehen direkt nebeneinander.

### Neu in 2.5.0 – Freunde-Leiste rechts, Knöpfe in der Seitenleiste
- **Rechte Leiste** (bei Menü links und breitem Fenster): Reiter **Freunde** (im Spiel / gesamt) mit aufklappbaren Bereichen *Ich*, *Favoriten*, *Im Spiel*, *Online*, *Offline* – je Freund Profilbild, Status und Welt; Klick öffnet das Profil. Reiter **Gruppen**: alle Gruppen, die gerade **offene Instanzen** haben, mit Welt, Spielerzahl und Region – Klick öffnet die Instanz. Suchfeld für beides; wird alle 2 Minuten aufgefrischt.
- **Linke Leiste unten**: 🧭 Direkt-Zugriff und ⚙ Einstellungen (statt oben rechts), darunter 🎨 Theme und die Sprach-Flagge.
- **Volle Fensterbreite** ist jetzt Standard.
- Abschaltbar: *Einstellungen → Oberfläche → Menü → Freunde-Leiste rechts*. Unter 1350 px Fensterbreite wird die rechte Leiste ausgeblendet.

### Neu in 2.4.0 – Menü links, Unterpunkte oben
- **Hauptmenü als Seitenleiste links** (Windows-App): alle Seiten untereinander, Gruppen wie *Favoriten*, *Sozial*, *Diagramme* und *Mehr* klappen als Unterpunkte auf – die aktuelle Gruppe ist automatisch offen.
- **Oben stehen die Unterpunkte der aktuellen Seite**: bei Gruppen deren Einträge (z. B. Sozial → Freundes-Log, Freundesliste, Gruppen, Moderation, Mod-Zentrale), bei *Spiel & OSC* dessen Reiter (Live & OSC, Parameter, OSC-Log, OSC-Werkzeuge, Chatbox-Module …), bei *Benachrichtigungen* die vier Ansichten.
- Umschaltbar unter *Einstellungen → Oberfläche → Menü → Hauptmenü* („links“ oder wie bisher „oben“). Bei schmalem Fenster wird die Seitenleiste zur Symbolleiste; die Android-App bleibt wie sie ist.

### Neu in 2.3.1 – Fix: falsche Grafikkarte im Rechner-Modul
- `{gpu_name}` zeigte „Virtual Desktop Monitor“ (der virtuelle Bildschirm-Treiber der VR-App *Virtual Desktop*). Jetzt zählen nur echte Grafikkarten am PCI-Bus – virtuelle Adapter (Virtual Desktop, Parsec, Remote-Desktop, Spacedesk, Hyper-V …) werden übersprungen, bei mehreren gewinnt die mit dem meisten Grafikspeicher.
- Der Windows-Build prüft die GPU-Abfrage jetzt auf einem echten Windows.

### Neu in 2.3.0 – Sieben neue Stream-Deck-Tasten
- **🎵 Medien**: ⏯ / ⏭ / ⏮ für das, was Windows gerade abspielt (Spotify, Browser/YouTube …) – die Taste zeigt den Titel (oder Künstler) und leuchtet, solange etwas läuft.
- **⚡ Schnelltext**: sendet einen gespeicherten Chatbox-Schnelltext – oder die letzte Nachricht erneut.
- **🎬 Parameter-Szene**: setzt eine gespeicherte Avatar-Parameter-Szene mit einem Druck.
- **⏺ Aufnahme**: Parameter-Aufnahme starten/stoppen (zeigt die Sekunden) oder eine Aufnahme abspielen (½× / 1× / 2×).
- **🧩 Chatbox-Module**: alle Module oder ein einzelnes Modul an/aus – mit Zustandsanzeige.
- **🔊 Vorlesen**: spricht einen Text über die Sprachausgabe, optional zusätzlich in die Chatbox.
- **ℹ️ Info-Anzeige**: zeigt beliebige Platzhalter auf der Taste, z. B. `🕒 {zeit}/n📡 {ping} ms`, `{akku}%`, `{countdown_rest}`, `{musik_titel}` – die Einstellungsseite listet alle verfügbaren.
- Lange Texte (Liedtitel, Namen) werden für die Taste sauber umgebrochen und gekürzt.
- *Werkzeuge → Stream Deck* listet jetzt alle 25 Aktionen.

### Neu in 2.2.0 – Sechs neue Chatbox-Module, GPU für AMD/Intel
- **Neue Chatbox-Module** (Spiel & OSC → Chatbox-Module), jeweils mit eigener Vorlage, Desktop/VR und Reihenfolge:
  - **⏳ Countdown** bis zu einem Termin (Name + Datum/Uhrzeit) – `{countdown_name}` `{countdown_rest}` `{countdown_tage}`.
  - **👥 Freunde**: wie viele gerade im Spiel und online sind – `{freunde_im_spiel}` `{freunde_online_web}` `{freunde_gesamt}`.
  - **📜 Laufschrift**: ein langer Text läuft Stück für Stück durch (Breite einstellbar).
  - **✨ Animation**: jede Nachricht zeigt das nächste „Bild“ (eine Zeile = ein Bild, z. B. Mondphasen 🌑🌒🌓…).
  - **🔋 Akku** des Laptops mit Ladeanzeige (🔌 / 🪫) – fällt am Desktop-PC ohne Akku einfach weg.
  - **📡 Ping** zu den VRChat-Servern alle 30 s.
- **Rechner-Modul**: GPU-Auslastung, Name und VRAM jetzt auch für **AMD- und Intel-Grafikkarten** (Windows-Leistungsdaten) – vorher nur NVIDIA.
- Countdown und Freunde stehen auch als Platzhalter im Rotator, in Makros und in der Automatik bereit.
- Übersetzung: Modulbeschreibungen, die auf „…“.“ enden, wurden nicht übersetzt – behoben; „Wetter“ und die neuen Texte in EN/FR/JA.

### Neu in 2.1.0 – Chatbox-Extras, OSC-Werkzeuge, Profil vorbefüllt
- **💬 Chatbox** (Spiel & OSC → Live & OSC):
  - **⚡ Schnelltexte** mit Platzhaltern – Klick sendet, Umschalt+Klick holt den Text ins Feld.
  - **Live-Vorschau** mit ausgefüllten Platzhaltern und Zähler (über 144 Zeichen wird aufgeteilt; das Feld nimmt jetzt bis zu 400 Zeichen).
  - **🕘 Verlauf** der gesendeten Nachrichten: ✎ ins Feld oder ↻ erneut senden.
  - **⏰ Geplante Nachrichten** zu einer Uhrzeit oder in N Minuten.
  - Neuer Platzhalter `{musik_balken}` (▰▰▰▱▱▱) für Rotator, Module und Automatik.
- **🧰 OSC-Werkzeuge** (neuer Reiter):
  - **Port-Test**: Empfang (Selbsttest), kommt etwas von VRChat, klappt Senden.
  - **Parameter-Szenen**: aktuelle Avatar-Werte (ohne VRChat-eigene) speichern und mit einem Klick wieder setzen.
  - **Aufnahme & Wiedergabe** von Parameter-Änderungen mit Zeitablauf (½×, 1×, 2×).
  - **Weiterleitung** von allem, was VRChat schickt, an weitere OSC-Programme (nur eigenes Netz, Schleifenschutz).
- **Mein Profil**: Bio und Links werden automatisch mit dem vorbefüllt, was bei VRChat steht (VRChat liefert sie nur noch im öffentlichen Profil).
- **Aufräumen** ist jetzt ehrlich: früher löschte der Abgleich fest Verlauf > 180 und Messwerte > 90 Tage – jetzt steuern das nur noch die Einstellungen (Vorgaben: Verlauf 180 Tage, Messwerte 1 Jahr, Spiel-Log & Benachrichtigungen für immer).

### Neu in 2.0.0 – Fix: Updater fand keine 1.10-Versionen
- **Fix Auto-Update:** GitHub liefert die Release-Liste nach Text sortiert (1.9.2 vor 1.10.0) – der Updater las nur die ersten 20 Einträge und sah 1.10.x deshalb nie. Jetzt werden alle Seiten geladen und die höchste Versionsnummer gesucht.
- Deshalb der Sprung auf **2.0.0**: „2.0.0“ steht auch in GitHubs Textsortierung ganz oben – so finden auch ältere Versionen mit dem alten Updater dieses Update von selbst.
- Enthält alles aus 1.10.x (Datenbank aufräumen, Merken im Shop, Spielt gerade über die Windows-Mediensteuerung, Info-Push & Meldungen in den Benachrichtigungen, Shop im Store-Stil …).

### Neu in 1.10.7 – Datenbank aufräumen
- *Einstellungen → System → Aufräumen*: wie lange Freunde-Verlauf, Spiel-Log, Diagramm-Messwerte, Benachrichtigungs-Verlauf und Profil-Zwischenspeicher behalten werden (30 Tage … 2 Jahre oder **für immer**).
- Vorgabe ist **für immer** – es wird nichts gelöscht, solange du keinen Zeitraum wählst. Nur der Profil-Zwischenspeicher (lädt sich bei Bedarf neu) wird nach 30 Tagen geleert. Offene Benachrichtigungen bei VRChat bleiben immer.
- Neuer Bereich **🗄 Datenbank**: Dateigröße, Einträge und ältester Eintrag je Bereich, **🧹 Jetzt aufräumen** (danach wird die Datei verkleinert). Sonst läuft das Aufräumen automatisch einmal am Tag.

### Neu in 1.10.6 – Merken im Shop
- **☆ Merken** an jeder Artikelkarte (VRChat-Store und Creator-Shops) – ★ zeigt, was gemerkt ist; nochmal klicken = nicht mehr merken.
- **☆ Shop merken** im Shop-Popup.
- Neuer Bereich **★ Gemerkt** oben im Shop: gemerkte Shops als Schnellzugriff (Klick öffnet das Popup, ✕ entfernt), gemerkte Artikel als Karten mit Preis, Restzeit und Kaufen-Link.
- Gespeichert wird nur lokal in der App (bis zu 200 Artikel und 50 Shops) – nichts geht an VRChat.

### Neu in 1.10.5 – Shop ansehen als Popup
- **🔎 Shop ansehen** steht jetzt ganz oben im Shop; das Ergebnis (Creator- oder Store-Shop) öffnet sich als **Popup** im Store-Stil.
- Klick auf einen Artikel zeigt die Details – mit **← Zurück zum Shop** geht es zurück ins Popup.

### Neu in 1.10.4 – Fix: Info-Push und Meine Meldungen leer
- **Meine Meldungen:** VRChat liefert die Liste seitenweise (`results`, `hasNext`) statt als einfache Liste – deshalb war sie leer. Jetzt werden bis zu 500 Meldungen geladen.
- **Info-Push:** VRChat gibt nur Einträge zurück, deren Tags in `include` stehen; leer = nichts. Jetzt wird eine breite Tag-Liste in beiden Formaten abgefragt und zusammengeführt; die Ansicht springt zur ersten Kategorie mit Einträgen. Bleibt es leer, steht klein darunter, was VRChat auf jede Abfrage geantwortet hat.
- Chips (z. B. *Ganzer Verlauf*): Überfahren mit der Maus sieht nicht mehr aus wie „ausgewählt“.

### Neu in 1.10.3 – Fix: „Spielt gerade“ erkennt jetzt wirklich, was läuft
- Fix: Die Windows-Mediensteuerung meldete nie, was gerade spielt (nur ⏮ ⏯ ⏭ gingen). Ursache: Windows PowerShell wartete beim Lesen der Befehle blockierend – jetzt kommen Befehle über eine kleine Datei im Temp-Ordner, die Erkennung läuft durchgehend (z. B. YouTube Music in Brave/Chrome/Edge/Firefox, Spotify …).
- Startet die Mediensteuerung noch oder meldet einen Fehler, zeigt die Kachel das jetzt an.
- Der PowerShell-Helfer beendet sich selbst, wenn die App geschlossen wird.
- Der Windows-Build testet das echte Skript jetzt mit.

### Neu in 1.10.2 – „Spielt gerade“ über die Windows-Mediensteuerung
- **🎵 Spielt gerade** nutzt jetzt die **Windows-Mediensteuerung** – erkannt wird alles, was Windows im Medien-Popup zeigt: Spotify, **Browser (YouTube, SoundCloud …)**, Apple Music, TIDAL, Deezer, VLC, Medienwiedergabe … Ältere Player ohne Mediensteuerung werden weiter über den Fenstertitel erkannt.
- Startseiten-Kachel neu: Titel, Künstler, App, Status, **Fortschrittsbalken** mit Zeit und Knöpfe **⏮ ⏯ ⏭**.
- Neue Platzhalter für Rotator, Chatbox-Modul und Automatik: `{musik_titel}` `{musik_kuenstler}` `{musik_app}` `{musik_zeit}` (z. B. 1:18/3:44). Pausiert = „spielt“ nichts.
- Abschaltbar unter *Einstellungen → Medien → Spielt gerade*.
- **🧭 Direkt-Zugriff** sitzt jetzt oben neben ⚙ Einstellungen statt in der Menüleiste.
- Fix: In den Einstellungen leuchtete „Mehr“ fälschlich mit.

### Neu in 1.10.1 – Store durchsuchen, NEU bei Info-Push
- **🛒 Shop:** Suchfeld und Sortierung im VRChat-Store (*Empfohlen, Endet bald, Preis auf-/absteigend, Name A–Z*) – Regale ohne Treffer werden ausgeblendet.
- **📰 Info-Push:** Einträge, die seit deinem letzten Besuch neu sind, tragen ein **NEU**-Kennzeichen; die Reiter zeigen, wie viele neu sind, und springen automatisch zur Kategorie mit Neuem.

### Neu in 1.10.0 – Info-Push & Meldungen in den Benachrichtigungen, Shop im Store-Stil
- **🔔 Benachrichtigungen** haben jetzt vier Ansichten: *Offen bei VRChat*, *Ganzer Verlauf*, **📰 Info-Push** und **🚩 Meine Meldungen** (Info-Push ist aus „Mehr“ hierher umgezogen; alte Links/Kacheln führen automatisch hin).
- **Info-Push** neu: Reiter *Hilfe-Artikel / Quick-Menü-Banner / Ladebildschirme* mit Anzahl, Zeilen mit 16:9-Vorschaubild, Titel, Untertitel und Datum – mit **›** direkt in der Liste aufklappen (Artikel mit Formatierung: Überschriften, **fett**, Links, Listen).
- **Meine Meldungen** neu: Filter nach Art (Nutzer, Avatar, Welt, Gruppe, Sticker …) mit Anzahl, Vorschaubild, Name + Art-Kennzeichen, *Kategorie · Grund*, deine Beschreibung, Datum, Status und 🗑 Zurückziehen.
- **🛒 Shop** im Stil des VRChat-Stores: große **Banner-Regale** und Artikelkarten mit **Restzeit** („Noch 35 Tage“), Art (Portal, Prop, Bundle, Accessoire, Ladebildschirm …), Preis **mit und ohne VRC+** und **Kaufen ↗** – öffnet die VRChat-Website, gekauft wird bewusst nicht in der App. Klick aufs Bild zeigt Details.
- Der offizielle Store wird automatisch über die VRChat-Konfiguration gefunden; sonst Store-ID unter *Einstellungen → Soziales → Shop* eintragen. Auch „Shop ansehen“ (Creator/Store-ID) nutzt die neue Darstellung.
- Übersetzung: „Nutzer (3)“-artige Texte mit Zahl in Klammern werden jetzt übersetzt; neue Texte in EN/FR/JA.

### Neu in 1.9.2
- Spracheingabe: der **📜 Verlauf** steht jetzt rechts oben neben den anderen Karten (statt unten über die ganze Breite) und nutzt die volle Höhe.

### Neu in 1.9.1 – ℹ️ Über-Seite mit Changelog
- Neu unter **Mehr → ℹ️ Über VRC Nexus**: installierte Version, System, Update-Status (mit „Nach Updates suchen“), **Changelog der letzten 2 Versionen** (ältere auf Knopfdruck, alle Releases auf GitHub), Datenordner und Danksagungen.
- Der Changelog kommt aus dieser README (`node scripts/changelog-build.js` → `backend/changelog.json`); ein Test prüft, dass er zur Version passt.

### Neu in 1.9.0 – 🔊 Sprachausgabe (TTS) – in VRChat sprechen
Unter **Spiel & OSC → 🔊 Sprachausgabe**. Die Stimme wird auf einem wählbaren **Ausgabegerät** abgespielt – mit einem virtuellen Audiokabel (z. B. VB-Audio Virtual Cable: hier „CABLE Input“, in VRChat „CABLE Output“ als Mikrofon) hört VRChat sie wie dein Mikrofon. Optional **mithören**.
- **Anbieter:** 🪟 Windows-Stimmen (offline), 🐦 **Piper** (offline, neuronal, Programm + Stimmen per Knopf: Thorsten, Kerstin, Eva, Amy, Alba, Siwis …, eigene .onnx möglich), 🔵 Google Cloud TTS, 🟦 Microsoft Azure, 🎙 ElevenLabs, ⚪ OpenAI – Schlüssel verschlüsselt; Google/OpenAI nutzen auf Wunsch die schon hinterlegten Schlüssel von Übersetzer bzw. Spracheingabe.
- **Wann:** nach der Spracheingabe (Übersetzung, nur Original oder beides – z. B. Deutsch sprechen → Englisch in VRChat hören lassen), bei getippten Chatbox-Nachrichten, per Makro-Schritt `speak Text`, oder direkt über das Textfeld (optional auch in die Chatbox).
- Stimme, Tempo und Lautstärke einstellbar; Stimmenliste kommt live vom Anbieter.

### Neu in 1.8.1 – Spracheingabe: Sprachaktivierung & Verlauf
- **👂 Sprachaktivierung:** Mikro bleibt offen, sobald du sprichst wird aufgenommen (inkl. 0,4 s davor), nach der Pause erkannt und gesendet. Kurze Geräusche (unter „mind. … s Sprache“) werden ignoriert. Optional **nur wenn du in VRChat stumm bist** (ideal als Mute-Spieler) und nur wenn VRChat läuft; jederzeit pausierbar. Umschalten oben in der Karte: „🎙 Taste / Knopf“ ↔ „👂 Sprachaktivierung“.
- **📜 Verlauf:** jede Erkennung mit Uhrzeit, Original und Übersetzung (+ Zielsprache), Modell und Dauer; durchsuchen, Original oder Übersetzung erneut senden, kopieren, löschen (bis 500 Einträge, abschaltbar).
- Fix (Tests unter Windows): GPU-/Netzwerk-Nachbildung für die Chatbox-Module läuft jetzt auch im Windows-Build.

### Neu in 1.8.0 – 🧩 Chatbox-Module
Unter **Spiel & OSC → 🧩 Chatbox-Module** setzt VRC Nexus die Chatbox aus Bausteinen zusammen (eigene Umsetzung, inspiriert von MagicChatbox):
- **💬 Persönlicher Status** (Rotator-Texte, bei AFK „💤 AFK seit …“), **🪟 Fenster-Aktivität** (Vordergrund-Programm, Programme als privat markierbar, in VR „🥽 In VR“), **🎵 Musik**, **🌐 VRChat-Radar**, **🕒 Uhrzeit + Zone**,
  **⛅ Wetter** (Open-Meteo, Ort suchen, ohne Konto), **🖥 Rechner** (CPU, RAM, GPU/VRAM/Temperatur über nvidia-smi), **📶 Netzwerk** (↓/↑, Spitze, Summe), **🟣 Twitch** (Live, Zuschauer, Spiel), **💓 Puls** (Pulsoid-Token verschlüsselt, Puls auch als Avatar-Parameter).
- Jedes Modul: an/aus, eigene Vorlage mit Platzhalter-Knöpfen (zeigen den aktuellen Wert), **Desktop + VR / nur Desktop / nur VR** (SteamVR wird erkannt), Reihenfolge ▲▼.
- **Live-Vorschau** im Chatbox-Stil mit Zeichenzähler; wird es länger als 144 Zeichen, fallen ganze Module am Ende weg (statt mitten im Text abzuschneiden). Module ohne Wert (keine Musik, Twitch offline, keine NVIDIA-Karte) verschwinden automatisch.
- Senden alle N Sekunden (Trennung: neue Zeile, ·, |), optional nur wenn VRChat läuft; der Rotator pausiert solange. Alle Werte gibt es auch als Platzhalter in Rotator, Makros und Automatik (`{temp}`, `{cpu}`, `{puls}`, `{netz_down}`, `{fenster}` …).
- Fix: Beim Öffnen einer Unterseite ohne eigenen Menüeintrag wird im Menü der richtige Bereich markiert.

### Neu in 1.7.9 – Stream Deck: Freund-Taste
- **Kurz drücken:** beitreten – oder, wenn die Instanz privat ist, automatisch eine Einladung anfragen (einstellbar: beitreten, anfragen, zu mir einladen, Selbst-Einladung, Profil öffnen).
- **Gedrückt halten (½ s):** zu mir einladen (ebenfalls einstellbar).
- **Symbol = Profilbild** des Freundes mit Statusring (grün = im Spiel, blau = Website/App, grau = offline, dann auch Bild in Grau) und Status-Punkt (Join Me / Online / Ask Me / Beschäftigt); Titel wählbar (Name + Welt, nur Name, kein Text).

### Neu in 1.7.8
- **Übersetzung vervollständigt:** Welt-, Avatar-, Instanz- und Gruppen-Fenster, Verlauf, Spielerliste, Hinweise und Leer-Meldungen sind jetzt übersetzt (Wörterbuch fast 2.000 Einträge, alle Texte aus dem Quellcode abgeglichen).
- **Fix Update:** „Im Release fehlt die passende Datei (Setup)“ – die App bietet ein Update erst an, wenn die Datei für dein Gerät wirklich hochgeladen ist (Android und Windows werden nacheinander gebaut).

### Neu in 1.7.7
- ⚙ **Einstellungen** sind jetzt ein eigener Knopf oben rechts neben der Profilkarte (statt im Mehr-Menü); leuchtet, solange die Einstellungen offen sind.

### Neu in 1.7.6
- Spracheingabe robuster: Lehnt das Audiosystem 16 kHz ab, wird mit der Standardrate aufgenommen und für whisper.cpp auf 16 kHz umgerechnet (vorher: Aufnahme startete nicht bzw. verzerrte Audio).

### Neu in 1.7.5
- **Fix Spracheingabe (whisper.cpp):** Neuere whisper.cpp-Pakete enthalten ein veraltetes `main.exe`, das nur eine Warnung ausgibt und mit Fehler endet – VRC Nexus nahm es statt `whisper-cli.exe` („Command failed …“). Jetzt wird immer `whisper-cli.exe` genommen (auch wenn in den Einstellungen noch `main.exe` steht), und Fehlermeldungen nennen die eigentliche Ursache (veraltet, fehlende DLL, zu langsam, …).

### Neu in 1.7.4
- Android-Homescreen-Widget zeigt „im Spiel / online / Stand“ in der gewählten App-Sprache.

### Neu in 1.7.3
- Rückmeldungen und Fehlermeldungen (Toasts wie „Gespeichert.“, „Regel gespeichert.“) sind jetzt ebenfalls übersetzt – Wörterbuch über 1.500 Einträge.

### Neu in 1.7.2
- Startseite: Widget „Freunde im Spiel“ zeigt in Größe L/XL Profilbilder.
- Übersetzer ruht bei Deutsch (weniger Arbeit bei jedem Neuzeichnen).

### Neu in 1.7.1
- 🌗 Theme **Automatisch**: hell/dunkel wie Windows bzw. Android, wechselt live mit.
- Daten und Zahlen im Format der gewählten Sprache; SteamVR-Overlay ist mit übersetzt und folgt dem Hauptfenster.
- Wörterbuch erweitert (über 1.400 Einträge), mehrzeilige und mehrsätzige Texte werden erkannt; Test prüft das Wörterbuch.
- Barrierefreiheit: deutlich sichtbarer Tastatur-Fokus, ARIA-Angaben am Sprach-/Theme-Menü, weniger Bewegung bei „Bewegung reduzieren“.

### Neu in 1.7.0 – Sprachen, Themes, Bilder
- **🌐 Sprachen:** Deutsch, English, Français, 日本語 – umschalten über die **Flagge unten rechts** (oder Einstellungen → Oberfläche). Übersetzt die ganze Oberfläche, auch alles, was später nachgeladen wird; Namen, Chats und Bios bleiben unverändert. Wörterbuch: `renderer/i18n/*.tsv` (eine Zeile pro Text, `#` = Zahl), daraus baut `node scripts/i18n-build.js` die Datei `renderer/js/i18n-dict.js`.
- **🎨 Themes:** 🌃 Neon (Standard), 🌌 Mitternacht (dunkel, violett), ❄️ Schnee (hell), 🌸 Sakura (hell) – über 🎨 unten rechts oder in den Einstellungen. Eigene Akzentfarbe geht weiterhin.
- **🖼 Bilder repariert:** Profil-, Avatar- und Weltbilder von VRChat werden jetzt mit deiner Anmeldung über die App geladen (mit Zwischenspeicher) – vorher erschien oft nur der 🦊-Platzhalter. Gleicher Fix im Dashboard.
- Fehler behoben: Die Seite konnte bei ungewöhnlichen Bildadressen einfrieren (z. B. in der Sammlung).

### Neu in 1.6.0 – Startseite: Widget-Raster wie im Dashboard
- **Raster mit 4 Spalten** (passt sich an: 3 / 2 / 1 Spalte je nach Breite, auch auf Android) im Mauerwerk-Stil: Widgets rutschen lückenlos nach oben, gleichmäßige Abstände.
- **✏️ Anpassen:** sichtbares Raster mit Spalten-Hilfslinien, Widgets **per Ziehen** sortieren (oder ◀ ▶), **Größe S / M / L** und bei passenden Widgets **XL (ganze Breite)**; Widgets einklappen (▾); Hinzufügen als Kacheln mit Beschreibung und möglichen Größen.
- Größere Widgets zeigen mehr (z. B. mehr Freunde, Stunden-Diagramm bei „Letzte 7 Tage“ ab L).
- **8 neue Widgets:** 🚀 Schnellstart (VRChat starten, neu beitreten, Selbst-Einladung), 📈 Letzte 7 Tage (Spielzeit je Tag/Uhrzeit), 📅 Gruppen-Events, 🎂 Jahrestage, 🗂 Sammlung, 📺 Stream-Bot (Status, Chat, Punkte-Bestenliste, Umfrage), 📜 OSC-Live, 🤖 Automatik-Regeln an/aus.
- Alte Anordnungen werden übernommen (breit → M).

### Neu in 1.5.0 – Stream-Bot: Befehls-Baukasten & viele neue Funktionen
- **🧱 Befehls-Baukasten:** jeder Befehl kann eine **VRChat-Aktion** ausführen (Avatar-Parameter an/aus oder auf einen Wert, Chatbox, Kamera, Eingaben, Vorlesen, Webhook) – mit Werten aus dem Chat (`!farbe 3` → `param Color = {1}`), Rechten (alle / Abonnenten & Mitglieder / VIPs / Mods / nur ich), Kosten in Punkten, Pause gesamt und pro Person, Aliasen, Hilfetext, an/aus, Nutzungszähler, Vorlagen und „Ausprobieren“.
- **⭐ Ereignisse:** Abo, Abo-Verlängerung, Geschenk-Abos, Raid, Bits (Twitch), Super Chat & neue Mitglieder (YouTube), „Erster im Chat“ – jeweils mit Chat-Antwort und VRChat-Aktion, Mindestmenge, Test-Knopf.
- **⏰ Timer-Nachrichten** (nur wenn der Chat aktiv ist).
- **🎲 Spiele:** `!gamble`, `!münze`, `!slots`, `!duell`/`!annehmen` – Einsätze und Pausen einstellbar.
- **📊 Umfragen** (`!umfrage`, `!stimme`, auch im OBS-Chat-Overlay), **🎁 Verlosungen** (Stichwort, Kosten, Gewinner ziehen), **📝 Zitate**, **🔢 Zähler** (z. B. `!tode`, Mods zählen hoch).
- `!zuschauzeit`, `!uptime`, `!so` (Shoutout), `!addpunkte alle`, `!tts` (Vorlesen am PC gegen Punkte).

### Neu in 1.4.2
- Fehler behoben: Das OBS-Chat-Overlay (`/chat`) konnte leer bleiben, wenn OBS einen Origin-Kopf mitschickt.
- Neue automatische Tests für Stream-Bot (Twitch-Zeilen, Punkte, Mod-Rechte, Belohnungen), Cloud-Sicherung (Verschlüsselung, falsches Passwort, Manipulation) und OBS-Zugriff.

### Neu in 1.4.1
- **☁ Cloud-Sicherung ins eigene Dashboard** (Einstellungen → Dashboard): App-Daten werden gepackt und mit **AES-256 verschlüsselt** (Schlüssel aus deinem Sicherungs-Passwort) und in Stücken hochgeladen – der Server sieht nur unlesbare Daten. Automatisch täglich möglich, die letzten N Sicherungen bleiben. „Wiederherstellen“ prüft die Sicherung und spielt sie beim nächsten Start ein (die alte Datei bleibt als Reserve).

### Neu in 1.4.0 – Stream-Bot für Twitch & YouTube
- **📺 Stream-Bot** (Menü → Stream-Bot): verbindet Twitch-Chat (lesen + schreiben, OAuth-Token) und YouTube-Livechat (lesen, API-Schlüssel) – Schlüssel verschlüsselt gespeichert.
- **🏆 Punkte** pro Nachricht (mit Abklingzeit) und fürs Zuschauen; `!punkte`, `!top`, `!geben`, Mods: `!addpunkte`, `!setpunkte`; Rangliste mit +/−/setzen.
- **⌨️ Befehle:** `!welt`, `!spieler`, `!avatar`, `!song`, `!befehle`, `!belohnungen` + eigene Befehle mit Platzhaltern, Abklingzeit, „nur Mods“.
- **🎁 Belohnungen:** Zuschauer lösen mit Punkten **VRChat-Aktionen** aus – Avatar-Parameter, Chatbox, Kamera, Eingaben, Webhooks (Makro-Schritte), mit Vorlagen.
- Begrüßung neuer Zuschauer, Stream-Chat optional in die VRChat-Chatbox, **OBS-Chat-Overlay** (`/chat`).
- **OBS-Overlay repariert:** läuft jetzt auch ohne Stream-Deck-Schnittstelle und mit dem OBS-Browser; fertige Adressen mit Kopier-Knopf unter Einstellungen → Integrationen.

### Neu in 1.3.9
- **🎤 Mikrofon-Auswahl für die Spracheingabe** (Spiel & OSC → Sprache): alle Mikrofone zur Auswahl (z. B. das vom VR-Headset), Verstärkung, Empfindlichkeit und „🔊 Mikro testen“ mit Pegelbalken. Ist das gewählte Mikro gerade nicht da, wird es am Namen wiedergefunden – sonst das Windows-Standardmikrofon.

### Neu in 1.3.8
- **SteamVR-Overlay blockiert VRChat nicht mehr:** Das Fenster am Handgelenk/im Raum ist nur noch bedienbar, wenn du es **direkt anschaust** – sonst wird es halb durchsichtig und der Laser geht an VRChat (abschaltbar: Einstellungen → VR).
- **Controller-Toggle:** linke obere Taste (Index: B, Quest/Rift: Y, Vive/WMR: Menü) **doppelt drücken** blendet das Overlay ein/aus. Umbelegen in SteamVR → Einstellungen → Controller → Controller-Belegung verwalten → „VRC Nexus“.
- Das Fenster startet jetzt standardmäßig ausgeblendet.

### Neu in 1.3.7
- **Fehler behoben: SteamVR-Overlay ließ sich nicht mit dem Controller bedienen.** Die Laser-Position kam als 0…1 statt in Pixeln an – jeder Klick landete in der Ecke. Zusätzlich zeigt der Overlay-Status jetzt die letzte Laser-Eingabe (Startseite → Widget „SteamVR-Overlay“), damit man sieht, ob Klicks ankommen.

### Neu in 1.3.6
- **📈 Instanz-Verlauf** (Diagramme → Rückblick): Spielerzahl einer Instanz über die Zeit als Diagramm, Höchststand, Schnitt, verschiedene Leute, wer wann kam und ging – für jeden Weltbesuch der letzten 30 Tage.
- **🌍 Meine Welten:** Besuche, Favoriten, Spieler gerade, Heat/Beliebtheit deiner hochgeladenen Welten – mit „seit gestern“, „7 Tage“ und Verlaufslinie (täglich mitgeschrieben, sobald du die Seite öffnest).

### Neu in 1.3.5
- **Update mit Fortschrittsbalken:** Prozent, MB, Geschwindigkeit und Restzeit im Banner oben und unter Einstellungen → System; danach „wird installiert“. Unter Windows zusätzlich am Taskleisten-Symbol.
- **Android lädt Updates selbst** (mit Balken) und öffnet danach direkt die Installation. Beim ersten Mal fragt Android, ob VRC Nexus „unbekannte Apps installieren“ darf. Klappt das nicht, öffnet sich wie bisher der Browser-Download.

### Neu in 1.3.4
- **📜 OSC-Log** (Spiel & OSC → OSC-Log): schreibt **alles** mit, was über OSC von VRChat kommt und an VRChat geht – jede Änderung mit Zeit, Avatar, altem → neuem Wert.
  Kategorien zum An-/Abwählen: Avatarwechsel, Schalter, Zahlen, Regler, Gesten & Stimme, Bewegung & Haltung, Status (AFK, Stumm …), Kamera, Chatbox, Eingaben, Tracking, Sonstiges.
  Live-Ansicht, Zeitraum (Heute / 7 / 30 Tage / alles), Richtung, Avatar, Suche, „Am häufigsten“, CSV-Export. Gespeichert als Tagesdateien im Datenordner (`osc-log`), Aufbewahrung und Drosselung für Dauer-Werte unter Einstellungen → VR → OSC-Log.
- Android-APK mit festem Signierschlüssel: Updates lassen sich über die installierte App installieren (einmalig alte Version deinstallieren).

### Neu in 1.3.2
- **📸 Foto-Verlauf** (Diagramme → Rückblick → Foto-Verlauf): deine Screenshots nach Weltbesuch sortiert, mit wem du dort warst, Vorschaubilder, Klick öffnet das Foto.
- **Beobachtete Freunde:** zusätzlich Meldung, wenn sie „Join Me“ setzen oder in eine öffentliche Instanz gehen (Einstellungen → Benachrichtigungen).

### Neu in 1.3.1
- **🛡 Mod-Zentrale** (Sozial → Mod-Zentrale, für Gruppen mit Kick-Rechten): Beitrittsanfragen-Assistent mit Vertrauensstufe, Kontoalter, 18+, Freund?, schon getroffen?, Warnliste und Vorschlag (annehmen/ablehnen/ansehen); Warnliste mit Notizen; geplante Gruppen-Beiträge; Export von Gruppen-Protokoll + Warnliste als CSV.
- **📚 Sammlungen** (Favoriten → Sammlungen): Welten und Avatare ohne VRChat-Begrenzung, mit Tags, Notiz, Suche und 🎲 Zufall aus einem Tag; Knopf „📚 Sammlung“ in jedem Welt-/Avatar-Fenster; Warnung bei „Very Poor“ auf Quest/Android.
- Datumsanzeige im Rückblick korrigiert.

### Neu in 1.3
- **🏠 Startseite mit Widgets** (Windows + Android): Status, Freunde im Spiel, Instanz, Chatbox, Makros, Benachrichtigungen, Heute, Spielt gerade, Kamera, Lieblings-Parameter, Uhr & Countdown, Notizzettel, Sprache, Overlay, Version – mit „✏️ Anpassen“ ein-/ausblenden, verschieben, breit/schmal.
- **📱 Android-Homescreen-Widget:** Freunde im Spiel/online, ungelesene Benachrichtigungen, die ersten Freunde mit Welt; Tippen öffnet die App. (Aktualisiert sich, solange die App läuft bzw. beim Verlassen der App.)
- **🎚 Parameter-Erkennung:** liest die OSC-Konfiguration jedes Avatars (`LocalLow\VRChat\VRChat\OSC\usr_…\Avatars\avtr_….json`) – Schalter, Regler, Zahlen, Suche, ★ Favoriten, VRChat-eigene ausblendbar.
- **📷 Kamera-Werkzeuge** (VRChat-Kamera per OSC): Modi, Foto, Selbstauslöser, Serienbild, Zoom/Belichtung/Fokus/Blende/Farben, alle Schalter, Pose, Vorlagen.
- **⚡ Makros:** Abläufe aus `chatbox`, `param`, `toggle`, `wait`, `input`, `cam`, `status`, `avatar`, `rotator`, `typing`, `speak`, `notify`, `webhook`.
- **🤖 Automatik / Chat-Widgets:** „Wenn … dann Makro“ – Spieler kommt/geht, Welt, Avatar, AFK an/aus, Parameter = Wert, Uhrzeit, alle N Minuten, VRChat Start/Ende, Screenshot. Vorlagen: Begrüßung, AFK, Spielt gerade, Trinkpause, Gute-Nacht … Neue Platzhalter `{musik}` `{afk}` `{afk_zeit}` `{spieler_neu}`.
- **🎙 Sprache → Chatbox mit Whisper:** lokal mit whisper.cpp (Programm + Modell Tiny/Base/Small/Medium/Large-v3-Turbo werden auf Knopfdruck geladen, läuft offline) oder OpenAI-Whisper mit eigenem Schlüssel (verschlüsselt). Tastenkürzel (Standard Alt+V), Sprechpausen-Erkennung, „tippt …“, Übersetzung.
- **🥽 SteamVR-Overlay:** eigener Reiter im SteamVR-Dashboard und Fenster am Handgelenk oder frei im Raum, Bedienung mit dem Laser: Freunde (beitreten/einladen), Instanz, Hinweise, Chat (Sätze, Emojis, Sprache), Status, Makros, Parameter, Kamera. Einstellungen → VR.
- **🎛 Stream Deck 1.3:** neue Tasten Kamera, Makro, Avatar wechseln, Freund (beitreten/einladen, leuchtet wenn im Spiel), Benachrichtigungs-Zähler, Overlay, Spracheingabe, Drehregler fürs Stream Deck + (Parameter, Zoom, Belichtung).
- **🎁 Rückblick & Freunde-Pflege:** Woche/Monat/Jahr („VRChat Wrapped“), Top-Welten, mit wem am meisten Zeit, Avatare, wann du spielst, AFK-Verdacht; Freundschafts-Jahrestage, Geburtstage (aus der Notiz), lange nicht online, Namensverlauf.
- **📅 Event-Erinnerungen** vor Gruppen-Events, **💛 Jahrestags-Meldungen**, **📺 OBS-Stream-Overlay** (`http://127.0.0.1:17865/obs?token=…`), **🏠 Webhooks** für Home Assistant & Co.

### Neu in 1.2.2 – Auto-Update

- Sucht beim Start und alle 6 Stunden auf GitHub-Releases nach einer neuen Version (Einstellungen → System → Updates; Tray: „Nach Updates suchen“)
- Windows-Installer-Version: lädt das Update, installiert still und startet neu · portable EXE: ersetzt sich selbst und startet neu
- Wahlweise nur Bescheid geben (Banner oben) oder automatisch installieren (nur wenn VRChat gerade nicht läuft)
- Android: Banner „Update verfügbar“ öffnet den Download der neuen APK (installieren muss man selbst bestätigen)

### Neu in 1.2

- 🌐 **Übersetzen mit DeepL oder Google** (eigener API-Schlüssel, verschlüsselt gespeichert): Chatbox-Nachrichten übersetzt senden
  (nur Übersetzung, „Original / Übersetzung“ oder zweizeilig), Text irgendwo markieren → 🌐 bzw. <kbd>Alt</kbd>+<kbd>T</kbd>, auch per Stream-Deck-Taste
- 💬 **Chatbox**: `/n` = neue Zeile, Platzhalter auch in normalen Nachrichten, lange Nachrichten automatisch aufteilen (1/3 …),
  Tipp-Anzeige beim Schreiben, Emoji-/Kaomoji-Leiste, zeitversetzt senden, Chatbox leeren, Verlauf der letzten Nachrichten
- 🔄 **Chatbox-Rotator**: mehrere Texte im Wechsel (der Reihe nach oder zufällig), nur wenn VRChat läuft, Vorschau, neue Platzhalter
  `{freunde}` `{freunde_online}` `{status}` `{statustext}` `{zugang}` `{region}` `{uhr}` `{wochentag}` `{countdown:2026-12-24 18:00}` `{zufall:a|b|c}`
- 🔗 **Verbindung zum Dashboard** (Einstellungen → Dashboard, Geräte-Token aus Nexus → Client): Spiel-Log und Live-Status hochladen,
  Chatbox-/OSC-Befehle aus dem Dashboard ausführen, Memos in beide Richtungen abgleichen
- 📱 **Android → PC**: Die Android-App kann über das Dashboard die Chatbox, Eingaben und Avatar-Parameter am PC steuern („PC-Fernbedienung“)

### Neu in 1.1

- **Menü oben** im Aufbau wie VRCX: Verlauf · Freunde-Orte · Spiel-Log · Spielerliste · Suche · Favoriten ▾ · Sozial ▾ · Benachrichtigungen · Meine Avatare · Welten · Diagramme ▾ · Werkzeuge · Spiel & OSC · Mehr ▾ · Direkt-Zugriff (<kbd>Strg</kbd>+<kbd>D</kbd>)
- 👥 **Spielerliste**: wer gerade in deiner Instanz ist – Zeit, Name, Rang, Status, Symbole (VRChat+, altersverifiziert 18+, Freund, Favorit, Instanz-Besitzer, Early Adopter, VRChat-Team …), Plattform, Sprachen, Bio-Links, VRChat-Notiz und eigenes Memo; dazu, wer gegangen ist
- 📍 **Freunde-Orte**: Freunde nach Instanz gruppiert
- 📊 **Diagramme**: Instanz-Aktivität (Zeitleiste pro Tag), Gemeinsame Freunde (Netz-Grafik), Beliebte Welten, Statistik
- 🧰 **Werkzeuge**: Screenshot-Manager (Welt & Mitspieler im Bild), Ordner-Verknüpfungen (VRChat-Fotos, Steam-Screenshots, Daten, Logs, Absturzberichte),
  Gruppen-Einladungen, blockierte Gruppen, VRChat-`config.json`, Startoptionen (Desktop-Modus, Profil, FPS …), VRChat-Registry-Sicherung, Auto-Status & Einladungen,
  Store & Kaufverlauf, Einladungsnachrichten, eigene Meldungen, Info-Push, Exporte (Discord-Namen, Memos → VRChat-Notizen, Freunde, eigene Avatare)
- ⚙ **Einstellungen** (über 70): System, Oberfläche (Akzentfarbe, Zoom, Schrift, Menü …), Sozial, Benachrichtigungen (Windows, Vorlesen, Nicht-stören),
  VR (XSOverlay, Chatbox), Medien (Screenshot-Infos, Kopien), Integrationen (Stream Deck, Discord-Status, Discord-Webhook), Erweitert
- 🎛 **Stream-Deck-Plugin** (`streamdeck/`): Status setzen, Chatbox-Nachricht/Vorlage, Avatar-Parameter (umschalten/halten/setzen), OSC-Eingaben,
  Chatbox-Rotator, Freunde online & Spieler in der Instanz als Live-Anzeige, VRChat starten, Instanz neu betreten, VRC Nexus öffnen.
  Installation: Werkzeuge → Stream Deck → „Plugin installieren“ (oder `VRC-Nexus.streamDeckPlugin` doppelklicken); dort auch Port und Zugangsschlüssel.

Nicht dabei (braucht das Dashboard): Discord-Teilen und die Kalender-Verbindung zum Dashboard-Kalender.

## Installation

- **VRC-Nexus-…-Setup.exe** – normaler Installer (Startmenü, Deinstallieren), oder
- **VRC-Nexus-…-portable.exe** – ohne Installation, einfach starten.

Beide gibt es unter GitHub → **Releases → „VRC Nexus …“** (neueste Version), zusammen mit der Android-APK und `VRC-Nexus.streamDeckPlugin`.
Jeder Build aktualisiert das Release seiner Version automatisch (zusätzlich liegen die Dateien als Artifacts beim jeweiligen Actions-Lauf).
Windows SmartScreen fragt beim ersten Start nach (die EXE ist nicht signiert): „Weitere Informationen“ → „Trotzdem ausführen“.

## Sicherheit & Daten

- Dein **VRChat-Passwort wird nicht gespeichert** – es geht nur einmal direkt an VRChat (2FA wird unterstützt).
  Gespeichert wird nur das Sitzungs-Cookie, verschlüsselt mit dem Windows-Schlüsselspeicher (DPAPI).
- Datenbank: `%APPDATA%\VRC Nexus\nexus.sqlite` (Tray-Menü → „Datenordner öffnen“). Zum Sichern einfach diese Datei kopieren.
- VRChat wird sparsam abgefragt (Freunde höchstens alle 45 s), die VRChat-API ist inoffiziell.

## Windows-Dateien signieren (gegen die SmartScreen-Warnung)
Ohne Signatur zeigt Windows „Der Computer wurde durch Windows geschützt – Unbekannter Herausgeber“. Der Build signiert automatisch, sobald im Repository unter *Settings → Secrets and variables → Actions* eines davon angelegt ist (Werte nie in den Code schreiben):

**A) Azure Trusted Signing** (ca. 10 $/Monat, Identitätsprüfung bei Microsoft)
1. Im Azure-Portal ein *Trusted Signing Account* anlegen, Identität prüfen lassen, ein *Certificate Profile* („Public Trust“) erstellen.
2. Eine App-Registrierung (Entra ID) mit Client-Secret anlegen und ihr auf dem Account die Rolle *Trusted Signing Certificate Profile Signer* geben.
3. Secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SIGN_ENDPOINT` (z. B. `https://weu.codesigning.azure.net/`), `AZURE_SIGN_ACCOUNT` (Account-Name), `AZURE_SIGN_PROFILE` (Profil-Name), `AZURE_SIGN_PUBLISHER` (Name genau wie im Zertifikat).

**B) Code-Signing-Zertifikat** (PFX von einer Zertifizierungsstelle)
- Secrets: `WIN_CSC_LINK` = die PFX-Datei als Base64 (`[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))`), `WIN_CSC_KEY_PASSWORD` = Passwort.

Der Build prüft danach jede EXE mit `Get-AuthenticodeSignature` und bricht bei ungültiger Signatur ab; die Release-Notizen sagen dann „digital signiert“. Hinweis: Auch signiert verschwindet die SmartScreen-Warnung erst, wenn genug Installationen zusammengekommen sind („Reputation“) – der Herausgeber steht aber sofort mit Namen da.

## Entwickeln

```
npm install          # Abhängigkeiten (Electron, sql.js)
npm start            # App starten
npm test             # Tests (ohne Netzwerk)
npm run dist         # Windows-EXE bauen (portable + Installer) – auf Windows
```

Aufbau: `main.js` (Electron: Fenster, Infobereich, Protokoll `app://`), `backend/` (VRChat-API, Datenbank, Spiel-Log & OSC –
Portierung der PHP-Module des Dashboards nach JavaScript), `renderer/` (Oberfläche, identisch zur Dashboard-Version).
Die Oberfläche spricht weiter „nexus.php“ an – in der App beantwortet das das eingebaute Backend.
`tests/server.js` stellt dieselbe App zum Testen im Browser bereit.
`backend/tools.js` enthält Spielerliste, Werkzeuge, Benachrichtigungen und die lokale Schnittstelle (`backend/localapi.js`, nur 127.0.0.1, mit Zugangsschlüssel),
`backend/settings.js` das Einstellungs-Schema. Das Stream-Deck-Plugin liegt in `streamdeck/` (`npm run streamdeck` packt es, `node tests/streamdeck.test.js <port> <schlüssel>` testet es
gegen eine nachgebaute Stream-Deck-App).
