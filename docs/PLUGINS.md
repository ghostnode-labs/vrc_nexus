# VRC Nexus plugins (`.nxp`)

Plugins extend the **Windows/PC app** of VRC Nexus (from 3.6.0). The Android app does not load plugins.
VRC Nexus is only the loader: it installs packages, shows the requested permissions, runs every plugin
isolated in its own process and draws the plugin's panel.

## Package format

A `.nxp` file is a normal ZIP archive with `plugin.json` in its root:

```
my-plugin.nxp
├── plugin.json
├── main.js
└── lib/helper.js      (optional, more files)
```

Limits: max. 200 files, 3 MB per file, 8 MB unpacked, 6 MB packed. No absolute paths, no `..`, no links.

### `plugin.json`

```json
{
  "format": 1,
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your name",
  "description": "What it does.",
  "icon": "🧩",
  "main": "main.js",
  "nexus": ">=3.6.0",
  "permissions": ["chatbox"],
  "homepage": "https://example.com"
}
```

| Field | Required | Notes |
|---|---|---|
| `format` | yes | always `1` |
| `id` | yes | `a-z`, `0-9`, `-`, 2–40 characters; installing the same id again updates the plugin |
| `main` | no | entry file, default `main.js` |
| `nexus` | no | minimum VRC Nexus version |
| `apps` | no | apps the plugin is for: `"vrc"` (VRC Nexus), `"d2"` (D2 Nexus) or both, e.g. `["vrc", "d2"]`; default `["vrc"]` (since 8.1.0) |
| `d2nexus` | no | minimum D2 Nexus version (only read by D2 Nexus) |
| `tags` | no | up to 8 tags, shown and filterable in the marketplace |
| `permissions` | no | see below; anything not listed is refused at runtime |
| `groups` | with `vrchat` | up to 5 VRChat group IDs (`grp_…`) the plugin may manage; shown in the install dialog |

### Permissions

| Permission | Allows |
|---|---|
| `chatbox` | `nexus.chatbox.send()`, `nexus.chatbox.typing()` (max. one message per 1.5 s, blocked in private mode) |
| `osc` | `nexus.osc.set()`, `nexus.osc.params()`, `param` events (max. 30 OSC messages per second) |
| `notify` | `nexus.notify()` (max. one per 5 s) |
| `game` | `game` events and `nexus.game.state()` |
| `net` | `fetch`, `WebSocket` and the `http`/`https`/`net`/`tls`/`dns` modules |
| `vrchat` | `nexus.vrchat.get/post/put/delete` for the groups listed in `"groups"` (since 3.8.0) |
| `ghostnode` | `nexus.ghostnode.status()`, `login()`, `get(path, query)`, `post(path, body)` with the user's GhostNode website sign-in (since 8.1.0, also in D2 Nexus) |
| `destiny` | D2 Nexus only: `nexus.destiny.*`. Allowed in a package for both apps, but never granted in VRC Nexus |

Storage (`nexus.storage`), secrets (`nexus.secrets`) and the panel (`nexus.ui`) need no permission.

**`vrchat` endpoints** (only for the listed groups, with the user's VRChat account, max. 20 requests per 10 s):
`GET /groups/{id}`, `GET …/instances|requests|posts|members|members/{usr}|bans|auditLogs|roles|invites|announcement`,
`POST …/posts|bans|invites`, `PUT …/requests/{usr}` (`{ "action": "accept" | "reject" }`), `PUT …/members/{usr}`,
`DELETE …/posts/{gpst}|members/{usr}|bans/{usr}|invites/{usr}`, plus `GET /users/{usr}` and `GET /worlds/{wrld}`.
Deleting/transferring a group and account endpoints are never allowed.

## Sandbox

Every plugin runs in its own Node process started with Node's permission model:

- read access only to the plugin's own folder, write access only to its own data folder
- no child processes, no worker threads, no native addons, no `eval`/`new Function`, no dynamic `import()`
- `require()` only for its own files and the built-in modules `path`, `util`, `events`, `url`, `buffer`,
  `string_decoder`, `querystring`, `assert`, `crypto`, `timers`, `zlib` (plus network modules with `net`)
- memory limit 128 MB; a crashing plugin is restarted at most 3 times within 5 minutes

Everything that touches the app goes through the `nexus` object and is checked against the permissions
the user confirmed. Still: only install plugins from sources you trust.

## API

The entry file gets a global-like `nexus` object (like `require`/`module` in Node):

```js
nexus.on('start', async () => {
  const count = await nexus.storage.get('count', 0);
  await nexus.ui.set([
    { type: 'heading', text: 'Hello' },
    { type: 'stat', label: 'Clicks', value: String(count) },
    { type: 'button', id: 'click', label: 'Click me', style: 'gold' },
  ]);
});

nexus.on('ui', async ev => {
  if (ev.id === 'click') {
    const count = (await nexus.storage.get('count', 0)) + 1;
    await nexus.storage.set('count', count);
    await nexus.chatbox.send('Clicked ' + count + ' times');   // needs "chatbox"
  }
});
```

Alternatively `module.exports = { start(nexus) {}, stop(nexus) {} }` or `module.exports = nexus => {}`.

| Call | Returns |
|---|---|
| `nexus.plugin` | `{ id, name, version, permissions }` |
| `nexus.log(...)`, `console.log/warn/error` | written to the plugin log (📜 in the app) |
| `nexus.on(event, fn)` / `nexus.off(event, fn)` | events: `start`, `stop`, `ui`, `param`, `game` |
| `nexus.chatbox.send(text, { sound })` | Promise |
| `nexus.chatbox.typing(on)` | Promise |
| `nexus.osc.set(name, value, type)` | `type`: `bool`, `int` (0–255), `float` |
| `nexus.osc.params()` | known avatar parameters `{ name: value }` |
| `nexus.notify(title, body)` | Windows notification |
| `nexus.storage.get(key, default)` / `set(key, value)` / `all()` | JSON storage, max. 512 KB per plugin; `set(key, null)` deletes |
| `nexus.secrets.get(key)` / `set(key, value)` / `has(key)` | encrypted storage for tokens/passwords (max. 30); never shown in the UI |
| `nexus.vrchat.get(path, query)` / `post(path, body)` / `put(path, body)` / `delete(path)` | VRChat API, permission `vrchat` |
| `nexus.ui.set(items)` | replaces the plugin panel |
| `nexus.game.state()` | `{ running, world, players }` |
| `nexus.app.version()` | app version |
| `nexus.app.id` / `nexus.app.name` | `"vrc"` / `"VRC Nexus"` or `"d2"` / `"D2 Nexus"` – check it before using app-specific calls (since 8.1.0) |
| `nexus.ghostnode.status()` / `login()` | GhostNode account status `{ connected, user, admin }`; `login()` opens the browser sign-in |
| `nexus.ghostnode.get(path, query)` / `post(path, body)` | website web API (`api.php`) with the user's sign-in; only `me`, `market`, `versions`, `versions/latest` and `admin/*` (`overview`, `market`, `market/review`, `users`, `users/active`, `audit`, `d2`). Admin paths only work for admin accounts – the website checks every request. Max. 30 requests per 10 s |
| `nexus.destiny.characters()` / `inventory()` / `milestones()` / `vendors(cid)` / `clan()` / `activity(type, id)` | D2 Nexus only, permission `destiny` |

### Events

- `ui`: `{ type: 'click' | 'change', id, value, values }` – `values` holds all inputs/toggles of the panel by id
- `param`: `{ name, value }` – avatar parameter received via OSC
- `game`: `{ kind, ts, world, player }` – from the VRChat log (e.g. `world_join`, `player_join`, `player_left`)

### Panel items (`nexus.ui.set`)

The app draws these itself (no HTML from plugins, all text is escaped); max. 100 items.

| `type` | Fields |
|---|---|
| `heading` | `text` |
| `text` | `text` (line breaks allowed) |
| `divider` | – |
| `stat` | `label`, `value` |
| `list` | `items` (array of strings) |
| `button` | `id`, `label`, `style` (`gold`, `danger`) |
| `input` | `id`, `label`, `value`, `placeholder`, `multiline`, `secret` (password field, value never prefilled) |
| `select` | `id`, `label`, `value`, `options` (`[[value, label], …]`) – sends a `change` event |
| `toggle` | `id`, `label`, `value` (boolean) |

## Packing

```
node apps/vrc-nexus/scripts/plugin-pack.js path/to/my-plugin [out.nxp]
```

Without arguments the script builds the bundled example `apps/vrc-nexus/plugins/src/text-plugin` →
`apps/vrc-nexus/plugins/text-plugin.nxp`. In the app: 🧩 Plugins → 📦 Install plugin (.nxp).

## Marketplace (from 4.4.0)

Plugins can be published on the GhostNode website (`market.php`) and installed from the app under **Plugins → 🛒 Marketplace**.

- **Submit:** users with the permission *market.submit* upload a `.nxp`; it is checked with the same rules as the app (paths, sizes, `plugin.json`, permissions). Same `id` + higher `version` = update.
- **Review:** users with *market.manage* download the package, read the code and approve or reject it (with a reason). Only approved versions are public.
- **Catalog:** `market.php?api=index` returns the catalog signed with Ed25519. The key is created once on the server (`data/market/sign.key`, never in Git). The app remembers the public key on first use and rejects the catalog if it changes (users can re-learn it after an announced change).
- **Install:** the app only downloads from the marketplace address, checks size and SHA-256 against the signed catalog and then shows the normal permission dialog. Updates are shown with a badge.

## Shared with D2 Nexus (from 8.1.0)

VRC Nexus and D2 Nexus (Destiny 2) use the same package format, the same plugin process (`backend/plugin-host.js` is identical in both apps) and the same marketplace. A plugin with `"apps": ["vrc", "d2"]` runs in both apps. The marketplace on the website shows the game(s) and tags of every plugin, and each app only lists plugins for itself.

The bundled **GhostNode admin panel** (`plugins/src/ghostnode-admin`) is an example of a plugin for both apps: it only uses the `ghostnode` permission.
