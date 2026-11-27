# GhostNode Live

Real-time service for VRC Nexus. It runs on the GhostNode root server behind nginx at `https://<domain>/live/` (WebSocket `/live/ws`). Node.js ≥ 22, no dependencies.

- **Remote control in real time:** commands between two Nexus apps are delivered immediately instead of being polled from the mailbox (`toyrelay.php`) every second. If nobody is connected, a message waits up to 90 s, the same as the mailbox.
- **Same rules as the website:** on connect, the app sends its Nexus account token. The service asks the website (`toyrelay.php?a=who`, only with the shared `LIVE_SECRET`) whether the account is Verified 18+ with NSFW on, and receives the account's mailbox (a hash of the VRChat ID). This is re-checked every 10 minutes.
- **Push:** `POST /notify` (only from 127.0.0.1 with `X-GhostNode-Live: <LIVE_SECRET>`) sends `{"t":"notify","kind":…}` to a mailbox, so the app can fetch new data at once.
- **Fallback:** without the service (for example on Plesk), the app keeps using the mailbox.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `18093` | listen port |
| `HOST` | `127.0.0.1` | listen address (nginx in front) |
| `LIVE_SECRET` | – | shared with the website (`GN_LIVE_SECRET`), at least 32 characters |
| `SITE_BACKEND` | `http://127.0.0.1:18080` | internal address of the website (Apache) |
| `SITE_HOST` | – | domain of the website (Host header) |

`server/ghostnode-root.sh` of the website repo installs it as the `ghostnode-live` service and sets everything up.
