# VRC Nexus – working rules

- Answer the owner in **German**; decide sensibly yourself instead of asking ("wähle immer die logische Anforderung").
- Repo layout: desktop app `apps/vrc-nexus` (Electron; `backend/`, `renderer/`, tests `npm test`), Android `apps/vrc-nexus-android` (`node build.mjs`), watch `apps/vrc-nexus-watch` (Wear OS app + watch face), live service `apps/nexus-live`. Every push builds a release (tag `vrc-nexus-v<version>`); bump `version` in both `package.json` files and `VERSION` in `backend/vrchat.js`.
- No secrets in code, Git or chat (only GitHub secrets / env vars). Never ask for passwords; never store the VRChat password.
- Tests with mocks only, never against real accounts.
- Do not copy code from other tools (VRCX, MagicChatbox, OscGoesBrrr, HRtoVRChat …) – reading for ideas is fine; own implementation and design. Buttplug spec: own implementation.
- Open libraries, public APIs and similar are generally allowed (owner's OK, 2026-11-28) – pin versions, check the license (the app is AGPL-3.0-only), API keys only as secrets/env.
- **Layout: always use a masonry grid** for cards of different heights (owner, 2026-11-28) – no empty gaps under shorter cards; check all pages before pushing.
- **Layout: always use the full width between the sidebars** (no max-width containers leaving empty space); exception: popups/dialogs – but profile popups also use the full width (owner, 2026-11-28).
- Never weaken the owner lock, age verification (Verified 18+) or panic/safeword/stop. Panic = NSFW content and tools off; Stop = toys stop.
- UI texts German; new strings in `apps/vrc-nexus/renderer/i18n/*.tsv` (de, en, fr, ja; no duplicates), then `node scripts/i18n-build.js`.
- README/changelog in English with "### New in X". **NSFW details only in `backend/CHANGELOG-NSFW.md`**; README and public notes write "🔞 ***".
- Commit messages neutral. No PRs unless asked. Never publish the owner's e-mail address.
