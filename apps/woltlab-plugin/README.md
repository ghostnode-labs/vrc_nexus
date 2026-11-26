# VRC Nexus – VRChat BBCodes for WoltLab Suite

Package `com.ghostnode.vrcnexus` for **WoltLab Suite Core 6.x** (free, no paid apps needed).

| BBCode | Example |
|---|---|
| `[vrcworld]` | `[vrcworld]wrld_…[/vrcworld]` or `[vrcworld]https://vrchat.com/home/world/wrld_…[/vrcworld]` |
| `[vrcavatar]` | `[vrcavatar]avtr_…[/vrcavatar]` |
| `[vrcgroup]` | `[vrcgroup]grp_…[/vrcgroup]` |

Renders an info card with link to vrchat.com. Works in every editor of the Core (articles, comments, profiles) and in apps such as the forum.

**Optional details** (name, author, image, capacity, visits …): ACP → Configuration → Options → Messages → *VRC Nexus* → *Info source*. Enter an HTTPS address that returns JSON for `?kind=world|avatar|group&id=…`:

```json
{ "name": "…", "author": "…", "image": "https://…", "description": "…", "capacity": 32, "visits": 1234, "favorites": 56, "members": 0 }
```

Answers are cached (default 60 minutes) in `cache/vrcnexus_*.json`. Without an info source the cards show ID and link only – no requests to VRChat are made by the forum.

## Build & install

```bash
./build.sh          # creates com.ghostnode.vrcnexus.tar
```

ACP → Packages → *Upload package* → `com.ghostnode.vrcnexus.tar`. Test on a separate test installation first.
