# GhostNode VIP board (VRChat world, UdonSharp)

A neon board for your VRChat world that shows the names of your VIPs and Ko-fi supporters, loads the list from the
internet (GitHub Gist or the GhostNode website) and can hand the names to other systems in your world – for example the
"VIP" role of a keypad/access system. Own implementation by GhostNode; no third-party code.

## Requirements

- **Unity 2022.3.22f1** (the VRChat standard version)
- **VRChat Worlds SDK** from the VRChat Creator Companion (VCC) – UdonSharp is included there
  (namespaces `UdonSharp` / `UdonSharpEditor`)
- **TextMeshPro** (`com.unity.textmeshpro` 3.x, already part of VRChat world projects). If Unity asks, run
  *Window ▸ TextMeshPro ▸ Import TMP Essential Resources* once.

## Install

1. Download `GhostNode-VIP-Board.unitypackage` (attached to every VRC Nexus release on GitHub) and open it in Unity
   (*Assets ▸ Import Package ▸ Custom Package…*). Everything goes to `Assets/GhostNode/VipBoard/`.
2. *Tools ▸ GhostNode ▸ VIP-Tafel erstellen* – choose the title, the number of name fields, columns, an optional Ko-fi
   section, colours and the two URLs, then **Prefab erstellen** (or **… + in Szene einfügen**).
   The prefab is saved as `Assets/GhostNode/VipBoard/VipBoard.prefab`.
3. *Tools ▸ GhostNode ▸ VIP-Tafel in Szene einfügen* puts the prefab into the open scene (builds it first if needed).

The first time, the tool creates the UdonSharp program file `NexusVipBoard.asset` next to the script and compiles it.
If Unity is still compiling, it asks you to run the menu item once more.

The package contains no hand-written prefab: the board is generated inside your project with your own UdonSharp,
TextMeshPro and VRChat SDK components, so nothing depends on GUIDs from other packages.

## List format

UTF-8 text, one entry per line:

```
# comment (also lines starting with //)
VIP|Display Name
KOFI|Another Name
Plain Name          ← group "defaultGroup" (VIP)
```

Empty lines are ignored. Upper/lower case and spaces at the start/end do not matter when names are compared.
Duplicates are dropped. See `vip-example.txt`.

Players are recognised by `VRCPlayerApi.displayName` – Udon has no access to user IDs. **Display names can change**
(VRChat allows a name change every few months), so keep the list up to date.

## URLs and VRChat's rules

From the official VRChat documentation (creators.vrchat.com → Worlds → Udon → *String Loading* and *External URLs*):

- A `VRCUrl` cannot be built at runtime – the addresses must be entered in the inspector (`urls`).
- One string can be downloaded every **5 seconds** per world; further requests are queued (in random order,
  at most 1000 in the queue), each string may be up to 100 MB.
- Only these domains are trusted for string loading: `*.disbridge.com`, `*.github.io`,
  **`gist.githubusercontent.com`**, `pastebin.com`, `*.vrcdn.cloud`. Any other address (including the GhostNode
  website) only loads for players who enabled **Allow Untrusted URLs** in their settings.

Therefore:

| Field | What to enter |
| --- | --- |
| `urls[0]` | the **Gist raw address**, e.g. `https://gist.githubusercontent.com/<user>/<gist id>/raw/<list>.txt` (without a commit hash, so it always shows the latest version) |
| `urls[1]` | optional fallback: `https://<website>/vip.php?l=<list>` (works only with "Allow Untrusted URLs") |

Both addresses are shown with a copy button in the GhostNode admin area (*Admin ▸ VIP-Listen*). The website can mirror
the lists into a Gist automatically. The board tries the URLs in order and reloads every `reloadMinutes` (at least
one minute). If a reload fails, the last good list stays on the board. GitHub caches Gist raw files for a few minutes,
so changes may take a little while to appear.

## Inspector

| Area | Fields |
| --- | --- |
| Source | `urls`, `reloadMinutes` (0 = only on join), `startDelay`, `defaultGroup`, `maxEntries` |
| Area 1 | `mainFields` (TextMeshPro UI) and/or `mainFieldsLegacy` (UI Text), `mainGroups` (empty = everything not in area 2), `mainHeader`/`mainTitle`, `mainPageText` |
| Area 2 | `secondFields`, `secondFieldsLegacy`, `secondGroups` (default `KOFI`), `secondHeader`/`secondTitle`, `secondPageText` |
| Display | `pageSeconds` (pages flip when there are more names than fields), `emptyFieldText`, `statusText` with `loadingText` / `errorText` / `emptyListText`, `markPresent` + `presentPrefix` (marks players who are in the instance) |
| Local player | `localVipGroups`, `eventReceivers`, `showForVip`, `hideForVip` |
| Bridge | `bridgeTargets`, `bridgeTargetGroups`, `bridgeGroups`, `bridgeVariable`, `bridgeKeepInspectorNames`, `bridgeAfterSetEvent`, `bridgeLocalEvent` |

Public methods: `Reload()` (for a button, at most every 10 s), `IsLocalPlayerVip()`, `IsPlayerOnList(player)`.

## Local player on the list

When the local player is on the list (groups from `localVipGroups`, empty = any group), every behaviour in
`eventReceivers` gets the custom event **`OnLocalPlayerIsVip`** (and `OnLocalPlayerIsNotVip` if they drop off the list
after a reload). Objects in `showForVip` are switched on, objects in `hideForVip` are switched off – e.g. a blocking
collider in front of the VIP area, or extra lights.

## Giving the "VIP" role in the Security Keypad

"ValenSecurityPad" is ValenVRC's **Security Keypad** (sold on Gumroad/Jinxxy, public docs at
<https://docs.valenvrc.com/category/security-keypad>). It is a paid third-party asset – nothing of it is included or
copied here. According to its documentation (pages *Roles*, *Keypad* and *API*, read on 2026-11-28):

- every role (`KeyPadRol`) has a `UserList` (string[]) for automatic login on join and a **`Url`** (VRCUrl) to get the
  username list from a link;
- the keypad has `EncryptRemoteStrings` (all remote lists are treated as encrypted) and `AntiSpoofer`;
- public API: `HasRole(...)`, `GetRoles(...)`, events `OnUserLogin` / `OnUserLogout` for registered listeners. A public
  method to *give* a role from another script is **not documented**.

Recommended ways, best first:

1. **Let the keypad load the list itself.** Select your "VIP" role and put the **names-only** address into its `Url`:
   the Gist file `<list>.names.txt` (trusted) or `https://<website>/vip.php?l=<list>&fmt=names`. These contain one
   display name per line and nothing else. The docs do not state the exact list format the keypad expects – if names
   do not log in, check the keypad's Discord/docs for the separator. `EncryptRemoteStrings` must be **off** for a
   plain list. Like the keypad docs say: do not use remote lists for admin/staff roles.
2. **Bridge from the board.** Set `bridgeTargets` to the UdonBehaviour of the VIP role, `bridgeVariable = UserList`,
   `bridgeGroups = VIP`. The board then writes the loaded names into that array (keeping the names already entered in
   the inspector when `bridgeKeepInspectorNames` is on) after every download. Whether the keypad re-checks its
   `UserList` after it has started is not documented – test it in Play mode / ClientSim. If the keypad offers an event
   that re-evaluates the whitelist, enter it in `bridgeAfterSetEvent`; `bridgeLocalEvent` is sent to the target when the
   local player is on the list.
3. **Without the keypad:** use `OnLocalPlayerIsVip`, `showForVip` / `hideForVip` for your own doors and effects.

### Finding field and event names of any other system

- Select the object, open the inspector's **⋮ ▸ Debug** mode: it shows the real serialized field names
  (e.g. `UserList`).
- For UdonSharp scripts, the names are the C# field names of the public fields; for Udon Graph programs, the variable
  names in the graph. Events are public methods (UdonSharp) or custom events (graph).
- `SetProgramVariable` needs the exact name and the same type (`string[]` here).

## Security notes

- Everything here runs **locally on each client**: every player downloads the list and decides for themselves. A
  modified client can skip it. The protection is only as strong as the system that grants access (e.g. the keypad
  with its anti-spoof check).
- The list only contains display names and groups – no other personal data.

## What can only be checked in Unity/VRChat

Compiling the scripts in your project, the look of the generated board, string loading from the Gist in a test
build, page flipping, ClientSim tests of `OnLocalPlayerIsVip`, and whether the keypad accepts the list via `Url` or
the bridge.
