# GhostNode Discord bot

Dependency-free Discord bot for VRC Nexus (Node.js ≥ 22). Talks to the Discord gateway and REST API itself.

**Slash commands:** `/status` (VRC Nexus version, website, HypeRate relay), `/release` (latest version + notes), `/poster <name>` (current image of a public VRChat poster), `/marktplatz [suche]` (plugins from the marketplace), `/puls <id>` (live heart rate via the HypeRate relay), `/hilfe`.
**Automatic:** posts new VRC Nexus releases to a channel (checks GitHub every 10 minutes).

Only the non-privileged `GUILDS` intent is used – no message content, no member lists.

## Setup

1. Discord Developer Portal → *New Application* → **Bot** → reset/copy the token. Note the *Application ID*.
2. Invite: *OAuth2 → URL Generator* → scopes `bot` + `applications.commands`, permissions *Send Messages*, *Embed Links*.
3. Environment (never commit these):

| Variable | Required | Meaning |
|---|---|---|
| `DISCORD_TOKEN` | yes | bot token |
| `DISCORD_APP_ID` | yes | application ID |
| `DISCORD_GUILD_ID` | no | your server ID – commands appear instantly (otherwise global, up to an hour) |
| `RELEASE_CHANNEL_ID` | no | channel for release announcements |
| `NEXUS_BASE` | no | website with `market.php` / `p.php` (default `https://ghostnode-labs.dev`) |
| `HYPERATE_RELAY` | no | HypeRate relay (default `https://hr.ghostnode-labs.dev`) |
| `PORT` | no | small health endpoint (`/`), e.g. for Plesk/Passenger |

## Run on a Linux server (recommended)

```bash
sudo mkdir -p /opt/ghostnode/discord-bot && sudo chown nexus: /opt/ghostnode/discord-bot
cp bot.js package.json /opt/ghostnode/discord-bot/
sudo install -m 600 /dev/null /etc/ghostnode-bot.env   # then add DISCORD_TOKEN=… etc. with an editor
sudo cp ghostnode-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ghostnode-bot
journalctl -u ghostnode-bot -f
```

## Run on Plesk (e.g. `discord.ghostnode-labs.dev`)

1. Create the subdomain, SSL (Let's Encrypt), upload `bot.js` and `package.json` into its folder.
2. *Node.js*: application root and document root = that folder, startup file `bot.js`, Node 22 or newer. No `npm install` needed.
3. *Node.js → Environment → Secrets*: `DISCORD_TOKEN`; as variables `DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `RELEASE_CHANNEL_ID`.
4. **Keep it running:** Passenger stops idle apps after a few minutes. In *Apache & nginx settings → Additional nginx directives* add:
   ```
   passenger_min_instances 1;
   passenger_pool_idle_time 0;
   ```
   Then open `https://discord.ghostnode-labs.dev/` once – it shows `{"ok":true,…}` when the bot is connected.

A root server with systemd (above) is still the most reliable place.
