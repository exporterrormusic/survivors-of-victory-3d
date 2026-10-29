# Character asset setup

Scope: Marian, Crown, Kilo, Cecil, Sin and Wells. No new combat effects or talents.

| Character | Model and appearances | Limitation |
| --- | --- | --- |
| Marian | Second Affection, Modernia, First Affection, Original, Queen, Last Affection | Queen and Last Affection downloaded in this pass |
| Crown | Default, Naked King, Glorious King | Native animations |
| Kilo | Default T.A.L.O.S. mech | No alternate field appearance in the source catalog |
| Cecil | Existing Liliweiss model with retargeted animations | Stand-in; no native Cecil chibi in NKAS |
| Sin | Default, Backstreet Dream, Swift Bunny | Native animations |
| Wells | Research Uniform (default), Product 08 (alternate) | Research Uniform adds a silver bob, six animated bang bones, cyan visor, chest emblem and short lab coat |

The current NKAS catalog was checked on 2026-10-29. Existing model files were reused;
Marian's two missing appearances were downloaded and converted with `tools/fetch-chibi.mjs`.

Six illustrations generated with built-in ImageGen live at
`public/ui/survivor/<character>-burst-setup-v1.png`. They are exclusively for the in-game
burst button through `characterBurstButtonArt`. Character Select's moving vertical slice
and the shop retain their existing `assets/menus/character-select/<character>/burst.webp`.
Reference portraits and exact generation prompts are recorded in
`assets/ui-source/character-setup/prompts.json`.

Burst VO reuses the existing character-module `voices` entries and files under
`public/assets/audio/voice/characters/`: Marian, Crown, Kilo and Sin use `burst.wav`;
Cecil uses `WISH.mp3`; Wells keeps `burst-1.mp3` and `burst-2.mp3` with their existing
60/40 weights. Preserve the registered per-line volume offsets. No replacement VO
was generated. The shared match audio and Character Select already consume these entries;
future survivor kits must reuse them when their burst actions are implemented.

Run the dev server and open `/tools/review/character-setup.html` to inspect all six characters,
their 16 appearances, eight animation states and burst-button crops. These characters remain
locked for survivor deployment until their gameplay kits are implemented.

Verification: `node tools/verify-character-setup.mjs` (default server port 5198;
override with `REVIEW_URL`). Checks all 15 appearances, non-static idle/walk/run/aim/fire/
reload/stun/death clips, finite layered rig transforms during forward/backward movement,
art loading, and separate menu/button asset paths. Captures and results are in
`artifacts/character-setup/`. TypeScript checking also passes.
