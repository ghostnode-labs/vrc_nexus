# VRC Nexus – HypeRate relay

HypeRate requires the API key to stay with the project, so VRC Nexus never talks to HypeRate directly:

```
App ──GET /hr/<device-id> (Server-Sent Events)──▶ relay ──WebSocket + API key──▶ HypeRate
```

The key lives only in the server's environment variable `HYPERATE_API_KEY` – never in the repository and never in the app.

- No dependencies, Node.js ≥ 22 (built-in WebSocket client), single file `app.js`
- One upstream WebSocket, one Phoenix channel per device ID shared by all listeners; channels are left 30 s after the last listener
- Limits: `RELAY_PER_IP` (default 4) concurrent streams per IP, `RELAY_MAX_CHANNELS` (default 300) device IDs
- `GET /health` → `{ ok, upstream, channels, clients }` (never shows the key)

## Deploy on Plesk

1. Create a **separate subdomain** (e.g. `hr.example.org`) – do not enable Node.js on a domain that serves PHP, Node.js takes over the whole domain.
2. Upload `app.js` and `package.json` into the subdomain's folder.
3. *Node.js* → application root and document root = that folder, startup file `app.js`, Node 22 or newer.
4. *Node.js → Environment* (custom environment variables): `HYPERATE_API_KEY` = your key.
5. Enable Node.js, then open `https://hr.example.org/health` – it should show `"ok":true`.
6. SSL certificate for the subdomain (Let's Encrypt).

The app uses `https://hr.sylvanclub.eu` by default (`RELAY` in `apps/vrc-nexus/backend/heart.js`).
