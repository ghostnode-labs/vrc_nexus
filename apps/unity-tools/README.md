# VRC Nexus – Unity tools

Small, dependency-free helpers for creators who want their avatars or worlds to work with VRC Nexus.
Own implementation; only Unity and the official VRChat SDK are required.

| Folder | Project type | What it does |
| --- | --- | --- |
| `Editor/` | Avatar project (VRChat SDK 3 – Avatars) | **Tools ▸ VRC Nexus ▸ Avatar-Setup** window |
| `World/` | World project (VRChat SDK 3 – Worlds + UdonSharp) | `NexusToyBridge` behaviour for world triggers |
| `World/` + `World/Editor/` | World project (Unity 2022.3.22f1, VRChat Worlds SDK via VCC, TextMeshPro) | **GhostNode VIP board** (`NexusVipBoard` + **Tools ▸ GhostNode ▸ VIP-Tafel erstellen**), shipped as `GhostNode-VIP-Board.unitypackage` |

## Installation

Copy the folder you need into your Unity project's `Assets/` (for example `Assets/VRC Nexus/Editor`).
Each script is wrapped in compile guards, so copying the wrong folder into a project does not break compilation –
it simply does nothing there.

## Avatar-Setup window (`Editor/NexusAvatarTool.cs`)

Select an avatar with a *VRC Avatar Descriptor* in the scene, then open **Tools ▸ VRC Nexus ▸ Avatar-Setup**.

- **Check** – synced parameter budget (bits used of 256), detected VRCFury plug/socket components, OGB/OscGB
  components and PCS parameters (detected by name only, no dependency on those packages), existing `NX/*`
  parameters, FX layers, and warnings (missing FX controller, mixed Write Defaults, `NX/*` only in the FX controller).
- **Create parameters** – adds the parameters VRC Nexus reads and writes, with Undo:

  | Parameter | Type | Meaning |
  | --- | --- | --- |
  | `NX/Toy` | Float | current device intensity 0–1, sent by VRC Nexus |
  | `NX/Lust` | Float | a 0–1 value for your own effects (see the in-app help) |
  | `NX/Consent` | Int | traffic light: 0 green, 1 yellow, 2 red |

  Each parameter can be local (costs no budget – VRC Nexus sets it via OSC) or synced (others see the effect,
  recommended for `NX/Consent`). Optionally the parameters are also added to the FX controller.
- **Consent layer** (optional) – creates an FX layer `NX Consent` with three states that switch your own
  green/yellow/red indicator objects (Write Defaults off, clips saved next to the controller).

Nothing is uploaded or sent anywhere; the window only edits your local assets.

## World bridge (`World/NexusToyBridge.cs`)

An UdonSharp behaviour that writes one line into the VRChat log for the **local** player only:

```
[NexusToy] pulse <intensity 0–1> <seconds>
[NexusToy] set <intensity 0–1> [seconds]
[NexusToy] stop
```

Put it on an object with a trigger collider (enter → pulse, exit → stop) or call `Pulse()`, `Hold()`, `Stop()` or
`PulseWith(level, seconds)` from your own Udon scripts.

VRC Nexus only reacts when the player has enabled the world bridge themselves, caps the intensity with their own
maximum, ignores old log lines, and always honours the consent light and the panic button. Players without VRC Nexus
are not affected at all.

## VIP board (`World/NexusVipBoard.cs`, `World/Editor/NexusVipBoardBuilder.cs`)

A neon name board for VRChat worlds: loads a list of VIPs / Ko-fi supporters with VRChat String Loading
(primary URL: GitHub Gist raw – a trusted domain; fallback: the GhostNode website `vip.php?l=<list>`), shows the names
on any number of TextMeshPro/UI Text fields with automatic paging, separate area for Ko-fi, loading/error state,
sends `OnLocalPlayerIsVip` to your own scripts and can pass the names to another UdonBehaviour – for example the
"VIP" role of ValenVRC's Security Keypad. Full guide (requirements, URLs, VRChat limits, keypad setup, security notes):
[`World/VipBoard-README.md`](World/VipBoard-README.md) – the same file is included in the package as `README.md`.

**Requirements:** Unity 2022.3.22f1, VRChat Worlds SDK from the Creator Companion (UdonSharp included), TextMeshPro.

**Package:** `GhostNode-VIP-Board.unitypackage` is attached to every VRC Nexus release (CI job `unity-package` in
`.github/workflows/vrc-nexus-app.yml`). Build it locally without Unity:

```bash
node apps/unity-tools/tools/pack-unitypackage.js          # → apps/unity-tools/dist/GhostNode-VIP-Board.unitypackage
node apps/unity-tools/tools/test-unitypackage.js apps/unity-tools/dist/GhostNode-VIP-Board.unitypackage
```

It imports into `Assets/GhostNode/VipBoard/` (fixed GUIDs, so re-importing updates the files). The prefab is not
shipped as YAML; **Tools ▸ GhostNode ▸ VIP-Tafel erstellen** generates it in your project
(`Assets/GhostNode/VipBoard/VipBoard.prefab`) and **Tools ▸ GhostNode ▸ VIP-Tafel in Szene einfügen** places it.

**List format:** `GROUP|Display name` per line, `#` comments, empty lines ignored, case and surrounding spaces do not
matter. Players are matched by display name (Udon has no user IDs; display names can change). Everything runs locally
on each client – access control is only as strong as the system it feeds.

