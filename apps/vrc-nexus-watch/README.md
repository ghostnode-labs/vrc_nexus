# Nexus Watch (Wear OS)

Companion app for **Wear OS 3+** watches (e.g. Samsung Galaxy Watch 4 and newer, Pixel Watch). It talks directly to the
VRC Nexus Windows app on your home network – no phone app and no cloud service needed.

## Features

- ♥ **Heart rate from the watch sensor** → VRC Nexus heart-rate source “VRC Nexus Watch” (avatar parameters, chatbox `{puls}`, HUD …)
- 💤 Sleep mode on/off
- 🔞 Only when NSFW is unlocked in VRC Nexus: panic button, all-clear, private mode, consent light 🟢🟡🔴, stop toys
- Shows the current world, player count and heart rate

## Pairing

1. In VRC Nexus open **💓 Puls**, enable **VRC Nexus Watch** and note the 6-digit code.
2. On the watch tap **Koppeln** and enter the code. The watch finds the PC automatically (UDP broadcast, port 17873);
   if not, enter the address shown in VRC Nexus (`IP:17874`).
3. Each watch gets its own key (stored on the PC only as a SHA-256 hash) and can be removed in VRC Nexus at any time.

The watch and the PC must be on the same network. The app asks for Wi-Fi because the Bluetooth link through the phone
often cannot reach devices on the home network.

## Build

Plain Java, no libraries. `gradle -p apps/vrc-nexus-watch assembleRelease` (Android SDK 34, JDK 17+).
CI builds it together with the Android app and attaches `VRC-Nexus-Watch-<version>-wearos.apk` to the release.
Install with `adb install` (watch in developer mode with Wi-Fi debugging) or a sideload tool.


## Watch face (`watchface/`)

Since 8.1.2 there is a second, code-free module: the **VRC Nexus watch face** in Watch Face Format 1 (`res/raw/watchface.xml`, Wear OS 4+, minSdk 33). It shows time, seconds (hidden in ambient), date, heart rate, a battery arc and two customizable complication slots (defaults: steps, battery). It is built by its own CI job (`gradle -p apps/vrc-nexus-watch :watchface:assembleRelease`) and attached to the release as `VRC-Nexus-WatchFace-<version>-wearos.apk`. The PC app's watch installer installs it together with the watch app and tries to make it the active watch face (`am broadcast -a com.google.android.wearable.app.DEBUG_SURFACE --es operation set-watchface`).
