# VRC Nexus – Twitch panel extension

A Twitch **panel extension** (below the stream) that shows viewers live what the streamer is doing in VRChat, fed by the VRC Nexus desktop app through the GhostNode website (EBS).

**Viewers see** (each part can be switched off in VRC Nexus → Stream-Bot → 📺 Bar & Twitch panel):
- 🌐 current world, players in the instance, session time (never while private mode is on)
- ❤ heart rate, 🎵 current song
- 🎯 goal (e.g. subscriber goal) with progress bar
- 📊 the running stream-bot poll – **viewers vote directly in the panel** (logged-in viewers, one vote per poll, counted together with `!stimme` in chat)
- ⭐ latest supporters (subs, gift subs, bits, raids)
- ⌨️ chat commands (only those for everyone), 🎁 rewards with costs, 🏆 points leaderboard, Discord button

No 18+ content, no chat messages and no mod/sub-only commands are ever sent to the panel.

## Data flow
```
VRC Nexus (PC) ──every 15 s, connection code──► ghostnode-labs.dev/twitchext.php ◄──Twitch JWT── panel (viewers)
                ◄── panel votes for the running poll ──┘                         ◄──Twitch JWT── config page (streamer: create code)
```
The EBS verifies every panel request with the extension's JWT secret (HS256). The connection code (`gnx_…`) is stored only as a SHA-256 hash.

## Setup (one time)
1. **Twitch developer console** → Extensions → *Create extension*: type **Panel**, name e.g. “VRC Nexus”.
2. Asset hosting: panel viewer path `panel.html`, config path `config.html`, panel height `500`.
3. **Capabilities → Allowlist for URL fetching domains:** `https://ghostnode-labs.dev`.
4. Copy the **Client ID** and the **Extension secret** (Settings → Extension secrets) into the website's environment variables (Plesk): `TWITCH_EXT_CLIENT_ID`, `TWITCH_EXT_SECRET`. Never put them in the repository.
5. Upload the files (`VRC-Nexus-Twitch-Extension.zip` from the release – it contains `panel.html`, `config.html`, `common.js`, `panel.js`, `config.js`, `style.css`) as the asset zip, move the version to *Hosted Test*, install it on your channel and activate it as a panel.
6. Extension → *Configure* → **Create connection code** → paste it in VRC Nexus (Stream-Bot → 📺 Bar & Twitch panel), tick “supply the panel with data”, save.

For public use the extension needs Twitch's review; until then it works in *Hosted Test* for your own channel.
