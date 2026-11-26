# GhostNode Discord bot

Community bot for the GhostNode Discord (Node.js ≥ 22, **no npm packages**). Talks to the Discord gateway and REST API itself; data is stored per server in `data/<server-id>.json`.

| Area | Commands / behaviour |
|---|---|
| 📈 Levels | XP per message (cooldown 60 s), level-up message, role rewards per level · `/rang`, `/rangliste` |
| 👋 Welcome | welcome/goodbye message with `{user} {name} {server} {count}`, auto-roles for new members |
| 🛡 Moderation | `/warn`, `/verwarnungen`, `/timeout`, `/kick`, `/ban`, `/unban`, `/loeschen` – everything logged to a mod-log channel, DM to the member |
| 🤖 AutoMod | banned words (whole words), Discord invites, links, spam, caps · delete + optional timeout + mod log · exempt roles |
| 🎭 Self roles | `/rollenmenue` – buttons to add/remove up to 5 roles |
| 📊 Polls | `/umfrage` – buttons with live bars, votes can be changed |
| 🎁 Giveaways | `/giveaway` – join button, winners drawn automatically |
| 💬 Custom commands | `/befehl hinzufuegen/entfernen/liste` → `!name` in chat |
| 🎂 Birthdays | `/geburtstag 24.12` – greeting once a day from 9:00 |
| 🎫 Tickets | `/ticket-panel` – button opens a private thread for member + team; close button |
| 📜 Logs | joins/leaves, deleted and edited messages |
| 🥽 VRC Nexus | `/status`, `/release`, `/poster`, `/marktplatz`, `/puls`, automatic release posts |
| 🎲 Fun | `/wuerfel`, `/muenze`, `/hilfe` |

Everything is configured in Discord with `/einstellungen …` (needs *Manage Server*); moderation commands are only shown to members with the matching Discord permission and are checked again by the bot.

**Developer Portal → Bot:** switch on **Server Members Intent** and **Message Content Intent** (needed for welcome, auto-roles, AutoMod, `!commands`, logs). Without them the bot still runs with the other features (or set `BOT_PRIVILEGED_INTENTS=0`).

**Invite link permissions:** `1460557409286` (view channels, send messages, embeds, history, manage messages, kick, ban, manage roles, moderate members, private threads). The bot's role must be **above** the roles it hands out.

## Setup

1. Discord Developer Portal → *New Application* → **Bot** → reset/copy the token. Note the *Application ID*.
2. Invite: `https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot+applications.commands&permissions=1460557409286`
3. Environment (never commit these):

| Variable | Required | Meaning |
|---|---|---|
| `DISCORD_TOKEN` | yes | bot token |
| `DISCORD_APP_ID` | yes | application ID |
| `DISCORD_GUILD_ID` | no | your server ID – commands appear instantly (otherwise global, up to an hour) |
| `RELEASE_CHANNEL_ID` | no | channel for release announcements |
| `NEXUS_BASE` | no | website with `market.php` / `p.php` (default `https://ghostnode-labs.dev`) |
| `HYPERATE_RELAY` | no | HypeRate relay (default `https://hr.ghostnode-labs.dev`) |
| `BOT_DATA` | no | folder for server data (default `./data`) |
| `PORT` | no | small health endpoint (`/`), e.g. for Plesk/Passenger |

## Run on a Linux server (recommended)

```bash
sudo mkdir -p /opt/ghostnode/discord-bot && sudo chown nexus: /opt/ghostnode/discord-bot
cp bot.js features.js store.js package.json /opt/ghostnode/discord-bot/
sudo install -m 600 /dev/null /etc/ghostnode-bot.env   # then add DISCORD_TOKEN=… etc. with an editor
sudo cp ghostnode-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ghostnode-bot
journalctl -u ghostnode-bot -f
```

## Run on Plesk (e.g. `discord.ghostnode-labs.dev`)

1. Create the subdomain, SSL (Let's Encrypt), upload `bot.js`, `features.js`, `store.js` and `package.json` into its folder.
2. *Node.js*: application root and document root = that folder, startup file `bot.js`, Node 22 or newer. No `npm install` needed.
3. *Node.js → Environment → Secrets*: `DISCORD_TOKEN`; as variables `DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `RELEASE_CHANNEL_ID`.
4. **Keep it running:** Passenger stops idle apps after a few minutes. In *Apache & nginx settings → Additional nginx directives* add:
   ```
   passenger_min_instances 1;
   passenger_pool_idle_time 0;
   ```
   Then open `https://discord.ghostnode-labs.dev/` once – it shows `{"ok":true,…}` when the bot is connected.

A root server with systemd (above) is still the most reliable place.
