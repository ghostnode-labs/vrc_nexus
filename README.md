# VRC Nexus

**Your all-in-one companion app for VRChat** – Windows, Android and Stream Deck.
No server, no account with us: everything stays on your own device.

[![Latest release](https://img.shields.io/github/v/release/ghostnode-labs/vrc_nexus?label=download&color=f5c242)](https://github.com/ghostnode-labs/vrc_nexus/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-join-5865f2)](https://discord.gg/YaktdxVr2C)
[![Patreon](https://img.shields.io/badge/Patreon-support-ff424d)](https://www.patreon.com/cw/VRCNexusTools)

![Home](docs/screenshots/01-home.jpg)

## ✨ Features

- 👥 **Friends & locations** – status, world, notes, favourites, “online since”, join / invite in one click, friends sidebar
- 📜 **History & statistics** – online/offline, world changes, playtime, timeline, heatmaps, recap
- 🎮 **Game log & OSC** – reads the VRChat logs (worlds, who joined/left, avatars, videos, screenshots) and talks to VRChat via OSC
- 💬 **Chatbox modules** – status, music, time, heart rate, rotator … with desktop/VR modes
- 🎙 **Voice** – speech-to-text into the chatbox (whisper.cpp, offline), text-to-speech, voice commands, **live subtitles & translator** with selectable audio source
- 🥽 **SteamVR overlay / HUD** – info and subtitles inside VR
- 🐞 **Avatar debugger** – all avatar parameters live
- 🌐 **Worlds, avatars & groups** – instances, avatar search, group moderation, calendar, gallery & inventory
- 🎛 **Stream Deck plugin** – avatar, instance and friend keys, chatbox, macros and more
- 📺 **Stream bot** for Twitch / YouTube chat
- 🌍 **4 languages** – English, German, French, Japanese · several themes and custom backgrounds
- 🔒 **Privacy first** – your VRChat password is never stored (only the encrypted session cookie); all data stays local

## 📸 Screenshots

| | |
|---|---|
| ![Friend locations](docs/screenshots/02-friend-locations.jpg) <br> **Friend locations** | ![Game & OSC](docs/screenshots/03-game-osc.jpg) <br> **Game & OSC** |
| ![Chatbox modules](docs/screenshots/04-chatbox-modules.jpg) <br> **Chatbox modules** | ![Game log](docs/screenshots/05-game-log.jpg) <br> **Game log** |
| ![Tools](docs/screenshots/06-tools.jpg) <br> **Tools** | ![Statistics](docs/screenshots/07-stats.jpg) <br> **Statistics & playtime** |

<sub>Screenshots use test data – no real accounts.</sub>

## ⬇️ Download

Get the latest version from **[Releases](https://github.com/ghostnode-labs/vrc_nexus/releases/latest)**:

| File | What for |
|---|---|
| `VRC-Nexus-x.y.z-Setup.exe` | Windows installer |
| `VRC-Nexus-x.y.z-portable.exe` | Windows without installation |
| `VRC-Nexus-x.y.z-android.apk` | Android (without PC features) |
| `VRC-Nexus.streamDeckPlugin` | Stream Deck plugin (double-click to install) |

Updates: in the app go to **Settings → About → Check for updates**.
If Windows SmartScreen shows a warning: “More info” → “Run anyway”.

## 📂 Repository

| App | Folder | Build |
|---|---|---|
| 🖥️ Windows (Electron) | [`apps/vrc-nexus`](apps/vrc-nexus) | GitHub Actions “VRC Nexus App (Windows)” |
| 📱 Android (Capacitor) | [`apps/vrc-nexus-android`](apps/vrc-nexus-android) | GitHub Actions “VRC Nexus App (Android)” |
| 🎛️ Stream Deck plugin | [`apps/vrc-nexus/streamdeck`](apps/vrc-nexus/streamdeck) | included in the Windows build |

The full changelog is in [`apps/vrc-nexus/README.md`](apps/vrc-nexus/README.md) and in the app under **About**.

## 💬 Community & support

- **Discord:** news for every update, help and ideas – [discord.gg/YaktdxVr2C](https://discord.gg/YaktdxVr2C)
- **Patreon:** VRC Nexus is free – if you like it, support development on [Patreon](https://www.patreon.com/cw/VRCNexusTools) ❤ Supporters are listed in the app.

## ⚖️ Note

VRC Nexus is not affiliated with VRChat Inc. It uses the unofficial VRChat API sparingly.
Ideas from the community (VRCX, MagicChatbox, TTS Voice Wizard) – each implemented independently.

## 👥 Credits

- **xXLoonaXx** – idea, design & project lead (GhostNode Labs)
- **Claude (Anthropic)** – development & programming
- **Signal Foundation** – [libsignal](https://github.com/signalapp/libsignal) (AGPL-3.0), used for the end-to-end encryption of the private chat on desktop

## 📜 License

VRC Nexus is free software, licensed under the **GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`) – see [LICENSE](LICENSE).
You may use, share and modify it; modified versions you distribute or offer over a network must be released under the same license, with their source code.
There is no warranty. The app links to this repository (and to the exact release tag) under *More → About*.
Third-party components keep their own licenses (listed in the app under *About → Thanks* and in each package's `node_modules/*/LICENSE`).
