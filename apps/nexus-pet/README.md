# Nexus Pet

A modern virtual-pet app for Android in plain Java – no libraries beyond the Android framework.
You raise a **Geistling**, a small original ghost creature in the GhostNode style, in real time.

## Features
- **Real-time life cycle:** egg → baby → child → teen → adult → senior; time keeps running while the app is closed (catch-up of up to 14 days)
- **Care:** 🍙 meal / 🍰 snack, 🎮 two mini-games (*Left or Right?*, *Higher or Lower?*), 🧽 cleaning, 💊 medicine (sometimes two doses), 💡 lights off at bedtime, 📣 discipline, 🤗 cuddling (tap the pet)
- **Calls:** hunger, mood, lights and “fake” attention calls; an unanswered call counts as a care mistake after 30 min (gentle) / 15 min (classic)
- **Evolution:** 13 forms – care mistakes, neglect, discipline and weight decide the path; one secret form
- **Gentle mode (default):** the pet never leaves because of neglect; **classic mode** is stricter (neglect or long illness ends the life, mistakes shorten it)
- **Modern extras:** vacation mode (pauses time), shift bedtime ±3 h, collection of discovered forms, memories of past pets, statistics, notifications for calls and evolutions, home-screen widget
- **Widget settings (1.1):** tap ⚙ on the widget (or “Customize widget” on Android 12+): dark / light / transparent theme, text size, show name, show status line, values as numbers instead of hearts – separately for every widget
- Save state stays on the device (SharedPreferences); no network, no tracking

## Build
- Tests (logic only, no Android needed): `sh tests/run.sh`
- APK: `gradle -p apps/nexus-pet assembleRelease` (Android SDK, compileSdk 34, minSdk 26)
- CI: job `pet` in `.github/workflows/vrc-nexus-android.yml` tests, builds and attaches `Nexus-Pet-<version>.apk` to the current VRC Nexus release (so it shows up on the GhostNode website: dashboard widget, downloads, changelog); version in `version.txt`

All characters and artwork are original and drawn in code (`Sprites.java`).
