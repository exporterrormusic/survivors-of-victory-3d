## Alpha prep: saves, version, supply lift, squad, enemy movement (2026-10-27)

Direction: the game is **Survival Round** (WAVE + ENDLESS). Ark Siege, Relay Run and the Salvage sortie are archived (URL-only).

- **Version:** `src/version.ts` is the single source (`GAME_VERSION`, shown bottom-left of the main menu as `SOV-2026 // ARK SYS V0.1`, in Settings, and in exported saves). Bump it per build and add a matching top entry to `PATCH_RELEASES` in `MainMenuScene.ts`; the NOTICE unread dot is keyed by version. Notice text rewritten as a 0.1 Closed Alpha note.
- **Saves (itch.io web + download):** `ProfileStorage.ts` adds export/import/erase of every `nikke-moba.*` key (itch.io HTML games share one origin, so never write unprefixed keys) and asks for persistent storage at boot. Settings > DATA has Export / Import / Erase (two-press). `vite.config.ts` uses `base: './'` for itch's sub-path. A desktop wrapper must serve from a fixed origin or localStorage is lost between launches; export/import covers moving progress.
- **Stats:** `src/frontend/profile/SurvivalStats.ts` records rounds, wins, kills, bests per NIKKE (once per round id); results screen shows bests; kills/wins/boss kills now feed achievements.
- **Supply lift** (`src/survivor/mode/supply-lift.ts`): the random green medical crate is gone. Every 60 s the arrival lift cycles and brings a health crate plus 1–5 mass-produced NIKKEs (Soldier/Product/iDoll, models copied from the MOBA archive). Squad: twin-stick run-and-gun, formation ring, backs off Raptures, steps out of red tells (`TelegraphLayer.dangerAt`), one reserved route search per frame (`NavigationMap.grantSearches`).
- **Raptures move and fire:** `Target.attackHold` now means "attacking: half speed, face the player"; new `Target.rooted` is the old full stop, used only by lane/slam/dive/emplacement tells. Settled ranged Raptures circle at standoff instead of standing still; walk/idle swaps keep the clip clock; shared pacing allows 6 shooters (was 2); bolts lead the player.
- **Talent picks** no longer clear held WASD; **level-ups** get a gold screen flash, ring and LEVEL N title, and waiting choices glow.

- **Follow-ups (same day):** Raptures spawn instantly and only off screen (real camera projection, any zoom); the purple spawn circles are gone, and a spawn waits if nowhere is hidden. Big LEVEL notice only on levels that unlock a talent tier, no gold vignette; talent choices slide in one after another. Small banners slide/fade in and out (3 s, 1.8 s for plain level-ups). Max zoom-out 34 → 28. Normal Rapture bolts fly 28 m (was 14) and Raptures start shooting from 26 m (was 13). Lift collision only rebuilds when walkable space changes (12 rebuilds per cycle, was ~150, which was the frame-rate collapse). Squad models come from a pool of 5 loaded and shader-compiled during the arrival ride; the squad and crate ride up visibly on the cage.

- **Squad as targets (later same day):** Raptures pick their nearest victim every ~0.5 s (player wins near-ties) via `Target.victim`; `horde.ts` hands each behavior a per-Rapture view of the player (a Proxy redirecting position/motion/hp/takeDamage), so every role can chase and hit squad members; bodies hurt anyone they touch. Squad: 80 HP, registered in `TargetField.squad`, names and HP bars over the squad and the hero (`hud.ts`). Squad AI holds position while it has a target, pushes toward Raptures near the player, only re-paths for goal moves over 2.2 m (no more jitter), range 15 m. The health crate no longer spins.

- **Tuning + lift stutter (latest):** squad 40 HP, 2 damage, 0.75 s between shots, gun swings at 5 rad/s and fires only when on target, side-steps to a new firing spot every 1.6–3 s, leaves the deck first. Raptures weigh squad members as 35% closer (and stick with their current victim). Crate has no emissive glow. Stutter cause: each navigation rebuild costs ~60 ms per unit size. Survival Round now never rebuilds (resting lift collision all round; `SupplyLift.clearDeck` shoves bodies off the footprint while the cage moves), and the 8-model squad pool with rigs loads behind the loading screen (`SupplyLift.preload`) and is recycled when squad members fall.

- **Squad weapons, Capra, roads (latest):** `mode/squad-weapons.ts` gives each model its real weapon (EG/Sun assault rifle bursts, OW/Ocean SMG, Product 12 minigun with spin-up, Product 08 piercing sniper with laser sight, FA/23 five-pellet shotgun, Flower splash rocket), ~3 DPS each; automatic weapons hold the aim pose, single shots play the model's shot clip at natural speed; thick tracers, muzzle flashes and impacts. Squad AI keeps its weapon's preferred range, protects the player first, finishes the wounded (sniper favours heavies, rocket favours clusters), retreats behind the player under 35% HP, keeps 2 m apart. Pool is 8 different models. Rapunzel's zones and Burst heal the squad. Heavies and bosses show gold names over their bars. Capra: 75 HP, planted for a 1.6 s charge and a 2.4 s slowly tracking beam that ticks and scorches. `rangePlacements()` now drops any solid prop on the main or cross road on every theme (decorations stay; the lift is not a prop). Checks: `node tools/verify-squad-weapons.mjs`.

- **Scarlet drink + Test Range spawns:** Scarlet's drink heals 9.6% max HP per 4 s drink (was 4.8%) and starts after 2 s idle (`DRINK_DELAY`; Snow White's Focus keeps 3 s). Test Range Weather Lab has **Spawn ally** (a squad NIKKE beside the player; 3 preloaded, more load on demand) and **Drop health box** (a ground crate ahead of the player). Check: `node tools/verify-range-spawns.mjs`.

Validation: typecheck, production build, `npm run test:save` (new), progress/survival/talents/sortie/snow suites. Browser: `node tools/verify-supply-lift.mjs` and `node tools/verify-hidden-spawns.mjs` (port 5194). Captures in `artifacts/supply-lift/`. Headless runs at ~2 fps, so movement checks step game time directly. `tools/verify-survival.mjs` is outdated (drives the removed medical crate and the rank menu). Real-speed balance of squad damage/HP still needs a playtest.

## Rapunzel survivor port (2026-10-26)

Rapunzel is now selectable in the survivor lobby, Test Range, and Survival Round, following Scarlet's ordered 30-SP progression and separate capstone save. Homing rockets, healing/burning zones, following aura, stacking permanent burns, full-heal/stun Burst, ten-launcher barrage, and held cursor designation are implemented. Default and Pure Grace models use the existing skin system. Three talent illustrations were generated with built-in imagegen; prompts and sources are saved. See `docs/RAPUNZEL.md` for mechanics, tests, and presentation limits. Anime lighting unchanged.

Validation: TypeScript and production build passed (existing FluentUI directive warnings); three Rapunzel browser suites passed, including live controls and Pure Grace. Survival round and saved-progress regressions passed. Captures in `artifacts/rapunzel/`.

## Ark Siege: current graybox direction (2026-10-26)

Scale correction: user requested a large MOBA-scale battlefield. Footprint expanded to 408 × 228 m (3× width/depth, 9× area) with character size, movement and attack range unchanged. Adjacent lane rotations take 8 seconds, mid-lane end-to-end takes 40 seconds. Render bounds, navigation, minimap, camera, gate locations and rescue routes use the expanded coordinates. Snow/rain remain appearance studies. See `docs/ARK_SIEGE_GRAYBOX.md` for measurements.

User approved a three-lane PvE siege with Ark on the left, enemy territory on the right, and allied defenses occupying only half the map. No player construction. Destroyed gates retreat that lane's frontline and create rescue opportunities in lost ground. The elevator faces right into the lanes. Normal matches should end before all talents unlock; ordered trees versus HotS-style choices remains undecided.

Playable isolated basic-shape prototype: `?prototype=ark-siege`, also first mode in Stage Select. `src/siege/layout.ts` defines navigable corridors and objective sites, `simulation.ts` handles test combat/waves/breaches/escorts, and `main.ts` renders the graybox. It leaves existing character kits and persistence alone. Co-op is a layout goal, not implemented networking. No ImageGen material pass yet: playtest the full layout first. Details and controls in `docs/ARK_SIEGE_GRAYBOX.md`.

Validation: connectivity/collision, individual lane retreat, objective spawn, complete escort return, loss state, and browser movement/aiming/camera/interaction checks passed. Production build completed with existing FluentUI directive warnings. Screenshots in `artifacts/ark-siege/`. Condensed pacing is for graybox evaluation, not final balance.

## Survival Round: previous loop (2026-10-26)

The user clarified that talents were intended to reset each 20-minute round. The current default is now **Survival Round**, not Relay Run or permanent-progression sorties. Elevator arrival → twenty minutes of escalating waves → Obelisk → one Rapture Core on victory. Ordered trees and their effects/costs remain intact; run XP is tuned for up to 30 SP. Tab pauses to purchase ranks. Lobby capstone selection persists, but its activation resets with the tree. No random upgrades or extra temporary-build system.

`survival-mode.ts` integrates arrival, waves, heavy milestones, healing, final boss telegraphs and results. `survival-round.ts` is the engine-free clock/phase model. `RoundRewards.ts` saves only the core wallet and an idempotent receipt; legacy saved talent progress is untouched. Skins cost one core for this initial economy. Other NIKKEs remain Coming Soon because only Snow White has a finished survivor kit. Main menu and Stage Select reflect the new direction; older modes remain reachable by direct URLs. See `docs/SURVIVAL_ROUNDS.md` for details and validation commands.

Validation passed: survival clock/rank/reward tests, progress and sortie regressions, capstone checks, TypeScript and production build. Isolated browser integration passed arrival, XP, paused ordered purchasing, Burst, healing, heavy/final boss transitions, one-time victory reward, one-core skin purchase, retry resets, retained ownership and death without reward. No page errors. Screenshots in `artifacts/survival-round/`. Browser time transitions were accelerated; ordinary 20-minute pacing still needs a player playtest.

## Relay Run: superseded combat prototype (2026-10-26)

The user approved testing a destination-based loop. Stage Select now defaults to Relay Run, fixed to Ark Outskirts. Direct link: `?run=test-range&mission=relay_run`. Follow the cyan street route, optionally collect guarded courtyard healing, defeat Hard Hat, then retry or return. No Alert, extraction, loot systems or saved progression in this prototype. Base abilities are ready, Burst starts full, and ordinary encounters do not gate movement. Older Salvage Run and Test Range remain available.

Implementation: `src/survivor/mode/relay-mode.ts`, `relay-route.ts`, `relay-mode.css`, with narrow integration in survivor main and Stage Select. This is a compact graybox using existing combat; five-minute pacing still needs a player playtest. See `docs/RELAY_PROTOTYPE.md` for controls, limits and verification. Anime lighting remains unchanged.

## Lighting & color is always Anime (user rule, 2026-10-25)

The user's darker look turned out to be the "Painted daylight" preset (about half Anime's brightness). The user
said: "Lighting and color should ALWAYS be anime." The survivor runtime (`src/survivor/main.ts`) now always applies
`anime`, hides the Lighting & color selector and ignores saved choices. Other presets remain in `visuals.ts` for
dev A/B scripts only. Don't reintroduce a preset choice. The archived MOBA keeps its own selector.

## Brightening pass: "everything looks darker" (2026-10-25, ~18:30)

The user reported that every weather/time combination in the Test Range looked darker than before, and asked
Claude to brighten it toward the earlier anime look. Measured against the 06:18 reference
`docs/concepts/game-plan-2026-10-25/references/current-game-dusk.jpg`: lit ground was unchanged, but the whole
frame was 22–38% darker. Causes found:
- the lift and tower in the middle of the view: opted out of Anime, near-black frame, and the tall mast's shadow
- the camera starting at 18 instead of 13
- darker themed-ground multipliers
- Anime contact shadows (AO)
- night/cloud darkening (snow counts as cloud)

Changes (keep them unless the user asks otherwise):
- **Lift** (`arrival-elevator.ts`): atlas-painted structure and trim use `softEnvironment` (the Anime shader's
  soft painted-scenery path) instead of `anime:false`. Recess and rubber colors are lighter. The
  `elevator-fixed-mast` group no longer casts shadows. The shaft lining and cyan/amber lamps are unchanged.
  Edited byte-safely: the file still has three Windows-1252 bytes in an HTML label.
- **Camera** (`main.ts`): the Test Range no longer starts at `setDistance(18)`.
- **Themed ground** (`arena.ts`): soil and asphalt now use the plain range's multipliers; Storm and Hollow are
  lifted proportionally.
- **Anime look** (`visuals.ts`, `toon.ts`): **reverted at the user's request.** The pass briefly raised
  exposure, lifted the toon shade, halved AO and softened night/cloud dimming. All of those values are back
  to their originals: exposure 1.20, AO .30, shade 0.70/0.77/0.91, cloud .6/.08/.12, night .28, vignette .45.
  The real cause of "too dark" was the preset (see above). Only the Lift, Camera and Themed ground changes remain.

## Elevator collision and shaft lining (2026-10-25)

Elevator sides, rear cage, gates and mast now use shared navigation and projectile cover. Exposed shaft blocks actors. Passenger transport/control lock verified. Shaft has textured lining with depth-darkened courses and reinforcement. Elevator bloom removed to prevent glow showing over the player or through walls; lenses remain depth-tested emissive geometry. No global lighting shader changes. TypeScript, motion and browser collision/ride assertions pass.

# Status and handoff (read this first)

## Lift departure: deeper shaft, blast seal, passenger and end screen (2026-10-25)

User requested closer S06 deck texture, removal of clipping grey footings, and a deeper departure
that seals the shaft and hides the character. Deck now uses `deck-steel-v4.png` (flat warm-grey steel,
fine physical seams; prompt saved in `assets/environment-source/arrival-elevator-v2/deck-prompts.json`).
Fixed mast is offset 0.95 m behind the cage; measured closest footing z=3.53 m clears the widened
3.5 m shaft half-width. Shaft is 13.5 m deep, cage travel 12 m. Two blast shutters park below the
surrounding ground and start closing only below 3.4 m clearance; fully reopen before ascent.

`elevator-motion.ts` owns motion/interlocks. `range-lift-ride.ts` captures an aboard player, locks
movement/firing and damage during transport, moves the character with the deck, hides model and
overhead HP bar under the sealed hatch, then freezes the test range with Extraction Complete.
Weather Lab → Restored lift tower → **Extract & seal**; Replay elevator raises the passenger again.
Preview full cycle returns without ending the range. Empty-lift tests do not hide an off-platform player.
Small hooks added to Player, HUD and main; sortie rewards/extraction remain their separate existing flow.

Passed final typecheck, `tools/test-elevator-motion.mjs`, sortie logic tests, `verify-elevator.mjs`
(passenger Y, hidden model, stopped clock, replay, clearance, controls, 16:9/21:9), and full
`verify-sortie.mjs` regression. No browser errors. Review `/tools/review/elevator-review.html`; captures include
`08-blast-doors-closing.png` and `09-sealed-extraction.png` under `artifacts/ui/ART-1/`.

## Lift art preview: S06 restored tower at range center (2026-10-25)

The user clarified that the desired elevator is **S06-boarding.png**, including its extremely tall
lattice mast, not S01's low arrival platform. Rebuilt the range preview with a 6 m deck at (0,0),
20 m mast plus crown, I-section columns, diagonal bracing, hoist cables/pulleys, counterweight,
ladder, sparse ivy, broad hazard panels, amber beacons, cyan rails and segmented ground ring.
Primary reference is S06; supporting official NIKKE elevator art and exact ImageGen texture prompts
are recorded in `assets/environment-source/arrival-elevator-v2/`.

Sources: `src/survivor/arrival-elevator.ts` (materials/animations), `lift-tower-geometry.ts` (model).
The test range mounts it through narrow hooks in `main.ts`; sortie placeholders remain unchanged.
Weather Lab → Restored lift tower offers Open/Close, Lower/Raise, Full cycle. Gates fold along
the sides, close before travel, and cannot open underground. Motion and lamps pause with the game.
The rotated shaft is a real mesh opening in `arena.ts`, replacing the material-only discard after
the reported striped floor artifact. Initial range framing is 18 m; wheel zoom remains available.

Review: `/tools/review/elevator-review.html`, or `?run=test-range&environment=outskirts&time=day&weather=clear`.
`artifacts/verify-elevator.mjs` passed center, endpoints, full cycle, interlock, interrupted command,
UI controls, 16:9/21:9 and anime checks with no page errors. Captures include a full-height view in
`artifacts/ui/ART-1/`. Sortie logic and browser regressions passed. Final typecheck passed after
the concurrent results-screen wiring finished.
Visual approval remains open. Passenger transport/collision, dormant restoration states, and sortie
integration are still separate work. No audio added and no commit made.

## ART-RANGE: Test Range themes and painted material correction (2026-10-25)

Contact refinement: shared NavigationMap.slide uses obstacle surface normals and a
small outward cushion for player/dash/knockback and AI steering. Sweeps remain safe,
speed stays bounded, and idle input does not drift. Rotated-wall sliding regressions
pass at 20/60/120 FPS alongside the existing navigation and scenery checks.


Latest user-requested gameplay addition: `range-collision.ts` supplies stable scaled/rotated
solid proxies for all structural scenery and trunks; soft foliage/loose pebbles stay passable.
Player movement/dash/separation, AI paths/knockback, both sides' shots, melee and blast
visibility share cover. Hover enemies avoid solids but ignore snow slowdown. Theme switches
replace obstacles and invalidate routes. Cylinder/capsule proxies, not mesh physics or
destructible scenery. All five themes/three body sizes, dash, shot heights and cleanup pass
`artifacts/verify-range-collision.mjs`; TypeScript and navigation/snow/enemy/sortie checks pass.


Latest placement correction: Outskirts/Storm grove clusters and perimeter trees
now clear both world-space roads, including feathered edges, roots and sway margin.
`RANGE_ROADS` is shared by ground shader and placement; regression checks cover every tree.

The user asked to stage the kit assets in the **Test Range**, using the game-plan gallery
and worksheet. `?run=test-range&environment=outskirts` and **Weather Lab -> Environment**
select Ark Outskirts, Frozen North, Dead City, Stormbringer, The Hollow, or undressed range.
Solid scenery now blocks movement/shots and feeds shared AI navigation.
MAP-1/2/3/8 remain separate full-sector tasks. The sortie and archived MOBA are not automatically dressed.

**Important user correction:** the first flat low-poly kit pass was rejected as too cel shaded
and mismatched with the characters and existing ground. Do not treat those flat materials as
the approved environment look. The user also rejected the misprojected ruin texture.
- `range-materials.ts` uses painted concrete/bark/metal/foliage. Latest correction: conventional
  lighting was too dark and mismatched. `softEnvironment` now shares the AnimeToon palette
  with smooth light transitions, no posterization, and lighter tints. Character/ground
  behavior stays unchanged; no emissive fill or new AO.
- Vegetation has independent ground-pivot sway, pause and reduced-motion support.
  Per-plant batching keeps shadows aligned (112 outskirts meshes). Whole plants sway,
  not individual flexible branches. Visual approval pending; wind/browser checks pass.
- Ruin projection from unrelated geometry was removed; corrected per-face UVs tile concrete
  and keep atlas panels in bounds. The ruin is now a wall/doorway corner with exposed steel.
- Painted foliage replaces leaf diamonds and solid bushes. Rocks have softened normals.
- The detailed sakura original is used in the range; new painted snow pine boughs replace cones.
  Built-in image_gen source/prompt: `assets/environment-source/range-style-v2/`.
- Placement is deterministic and biome-specific. No puddle props/water planes or new sounds.
- Existing exported kit-v1 GLBs are unchanged; this material pass is applied in the Test Range.

**Verification:** TypeScript, sortie Node tests, theme-placement tests, browser theme switching
and full browser sortie regression passed. All 12 training targets remain. No page errors.
Material verification found zero nonfinite/out-of-panel UVs and zero collapsed nondegenerate
UV triangles; all rendered dressing materials have textures ready and zero emissive fill.
Screenshots + before/after/reference gallery: `artifacts/ui/art-range/style-comparison.html`.
See [Test Range environment notes](docs/TEST_RANGE_ENVIRONMENTS.md). ART-RANGE is **review**.
Preview server: port 5184, HMR disabled (`artifacts/serve-range-environments.mjs`).


## Build worksheet; LOOP-1–3: menus deploy into the sortie, progress is saved (2026-10-25)

Work toward the game-plan mockups is split into tasks in [docs/BUILD_WORKSHEET.md](docs/BUILD_WORKSHEET.md).
Several agents work from it at once: claim a row in its tracker before starting.

LOOP-3 is done:
- **Stage Select:** has a SALVAGE RUN mission (first, selected by default) beside TEST RANGE. It deploys
  `?run=test-range&mission=salvage_run&zone=…`. The menu no longer sends `mode=`; `?mode=sortie` still works.
- **Zones:** every zone runs on the plaza with its own weather; the arrival banner names the zone. A run with
  `zone=` now takes its time and weather from the zone, not from the saved Environment preference. Before,
  a saved Night, for example from a Test Range theme switch, overrode "Ark Outskirts · DAY". `?time=` and
  `?weather=` still win.
- **Leaving:** user decision: quitting mid-sortie counts as dying. The pause menu's button reads "Abandon
  sortie" and calls `Sortie.abandon()`, which shows a "Sortie abandoned" defeat (XP kept, carried loot lost).
  On the plain test range the button reads "Return to Ark". `app.ts` no longer wires that button for runs.
- **Returning:** Continue on the results screen and the test range's Leave go to `?preview=stage-select`.
  Stage Select then uses the last selected NIKKE from the roster save.
- **Checks:** `npm run test:sortie` covers `abandon()`. `artifacts/verify-deploy-flow.mjs` drives the real
  menus (captures in `artifacts/ui/loop-3/`); `verify-sortie.mjs` still passes. Headless Stage Select
  needs about 12 s before it accepts clicks.

LOOP-1 and LOOP-2 are done (the NIKKE's progress is saved):
- **Saved:** a new profile section `progress` (`src/frontend/profile/PlayerProgress.ts`) holds per-NIKKE level,
  XP, unspent SP and Weapon/Special/Burst ranks, plus the account bank (credits, Core Dust, unresolved modules).
  Salvage banks as Core Dust 1:1. Pristine Cores go into the roster section the Shop spends. "Reset progress"
  clears it.
- **When:** `src/survivor/mode/progress.ts` loads it when a sortie starts, replaying ranks through
  `RunTalents.purchase`. It saves when the trip ends: XP, levels and ranks always (extract, death or
  abandon); loot only on extraction. Closing the page mid-trip saves nothing from that trip.
- **Test range:** user decision: it is a sandbox that neither loads nor saves. Progress is keyed by the NIKKE
  whose kit runs (`snow-white`; every deploy uses her kit for now).
- **Banked totals:** not shown anywhere yet. That is LOOP-5 (the loadout screen).
- **Checks:** `npm run test:progress`; `artifacts/verify-progress.mjs` (extract, reload, defeat, abandon,
  sandbox; captures in `artifacts/ui/loop-2/`).

**Parked by the user:** the loadout screen (LOOP-5) and account upgrades (META-2). The user wants to revisit
the upgrade/loadout concept. Don't build them.

**No NIPMH in the first version (user, 2026-10-25).** It may come back, so nothing was deleted.
- `src/features.ts` has `FEATURES.nipmh = false`, which hides the Shop's NIPMHS tab (the Shop sells character
  unlocks only) and keeps module cases off the sortie layout.
- The `module` site kind, `Purse.modules`, the bank's `modules` and the results tile stay dormant at 0.
- GAME_PLAN.md, WORLD_OPTIONS.md and the worksheet mark every NIPMH line as not in the first version.

FIGHT-1 is done: enemy behaviors are one file per role in `src/survivor/mode/behaviors/`, registered in
`behaviors/index.ts`. Behavior is unchanged: `verify-sortie.mjs` and `verify-results.mjs` pass.

LOOP-4 is built and awaiting the user's review: the results screen follows mockup S07.
- **Files:** `src/survivor/mode/results-screen.ts` and `results.css`. The old results card was removed from
  `sortie-hud.ts`, which now exports `KIT_ICONS` and `clock` for it.
- **Sections:**
  - BANKED, or LOST on a defeat: salvage → Core Dust only when banked; credits; module and Pristine Core
    tiles only if found
  - JOB: progress, tick and reward
  - The NIKKE: Burst eye art, "LV 07 → LV 09", XP bar, +SP
  - TRIP: time, kills, peak Alert as pips
  - FIELD KITS: all six greyed with ×counts, "Last one trip"
  - a gold Continue, using the HUD's cut-corner card frame
- **Style:** menu style (cyan lines, gold progress). Large panels stay square with detached corner brackets,
  per the user's corner rule, though the mockup cut them. Sized with the HUD's `--k`.
- **While it's open:** the rest of the HUD hides (`#hud.sr-open`). The frozen 3D view stays on the left.
  `SurvivorCamera.hold()` frames the NIKKE at the middle of the space left of the panel (`ResultsScreen.standX`).
  On extraction, `Horde.clear()` removes the horde and its telegraphs from the shot; a defeat keeps them.
- **Results data:** `SortieResults` gained `jobProgress` and `jobTarget`. `SortieModeInit` gained `nikke`
  (name, art).
- **Check:** `artifacts/verify-results.mjs` covers extraction and defeat at 16:9, 21:9 and 1280×720, contents,
  the hidden HUD, the camera hold and Continue. Captures are in `artifacts/ui/loop-4/`. The deploy-flow,
  progress and sortie checks still pass.

## Game-mode foundation: `src/survivor/mode/` (2026-10-25)

The user asked for the building blocks of the real game mode, whatever the final world structure
turns out to be (design: [docs/GAME_PLAN.md](docs/GAME_PLAN.md), options:
[docs/WORLD_OPTIONS.md](docs/WORLD_OPTIONS.md)). Play it with **`?run=test-range&mode=sortie`**. Optional values:
`alert=<seconds per level>` (default 90), `grace=<arrival seconds>` (10), `seed=<n>`. Plain `?run=test-range` is unchanged.

**Engine-free systems** (tested by `npm run test:sortie`; `tools/ts-hooks.mjs` lets Node load extensionless imports):
- `roster.ts`: all 22 Raptures with tier, role, mobility, first-pass stats and measured radius/lift/height.
- `alert.ts`: Alert 1–5. It rises with time only; `lower()` keeps partial progress.
- `director.ts`: a budget per second plus 30 s pulses buy whole groups within per-type caps, the shared heavy cap
  and an alive limit. `pickSpawnPoint` stays off screen, with extra distance on the south side.
- `sites.ts`: stand in a ring to work a site. Progress pauses outside, never resets; one site at a time.
- `exits.ts`: an 8 s gate cycle that pauses when you step off. The arrival lift arms only after you've left it.
- `ledger.ts` and `field-kits.ts`: carried versus banked loot; field kits stack to 3 and end with the trip.
- `sortie.ts`: phases (arrival → search → extracted/defeated), the job (`SalvageRunJob`), Hunters every 150 s
  at Alert 5, loot events and results.

**Runtime:**
- `telegraph.ts`: procedural ground tells (a filling circle, a chevron lane) in the GAME_PLAN §6 colours.
- `behaviors/` (one file per role since FIGHT-1, registered in `behaviors/index.ts`): Lure zap, Pelican pounce,
  Capra charge (stuns on walls, tramples), Solaris fuse plus a dropped charge. Every other role uses
  `EnemyLaserAttack` (`behaviors/fallback.ts`) until it gets its own behavior.
- `horde.ts`: spawns roster types into the shared `TargetField`.
- `site-view.ts`: box placeholder props (crates, lift platform with sliding gates, tower whose lights come on).
- `sortie-hud.ts` and `sortie.css`: ALERT pips replace WAVE, carried salvage, field kits, banner, edge markers,
  results screen. It doesn't change `hud.ts`.
- `sortie-mode.ts`: wires it together on the plaza.

**Hooks outside `mode/`:**
- `targets.ts`: `Target.respawns/removed/pursues`, `TargetField.ensureTypes()`, `spawn()`, pruning, `load({ training })`.
- `run.ts`: `damageScale` (Hot Loads).
- `main.ts`: `?mode=sortie`, `visuals.refreshUnits()` after the mode loads its models (without that, an early
  `scene.isReady()` compiled them before the enemy material plugins attached), `window.game.sortie`.

**Verification:** `artifacts/verify-sortie.mjs` drives the real loop at fixed 50 ms frames. It checks arrival, spawning,
tells, sites, the job, Extended Mag (+2 rounds), restoring the tower, paused/complete boarding, banking with the job
reward, defeat losing carried loot, and the unchanged test range, with no page errors. Captures are in
`artifacts/ui/sortie/`. Point it at a Vite server with HMR off (`BASE=...`) while other sessions are editing files.

**Not done yet:**
- Bespoke behaviors for the other 18 roles. Phalanx's shield also needs a projectile-blocking hook in the kit.
- Per-type kill XP (Run awards a flat 40).
- Turret Parts (the turret's charge count isn't exposed).
- Nests, persistence of banked loot and levels, real maps and props, and prop collision.

## Cleanup and optimization pass (2026-10-25)

The user asked for this pass. It is behavior-preserving: the same browser scenario on builds from before and after matched
(query and saved settings, HUD, menus, Tab ranks, snow unstick, petals, MOBA letterboxing), with no console errors.
- **Shared modules:** `src/settings-store.ts` (`loadSetting`/`saveSetting`), `src/frame-layout.ts` (`fitFrame`),
  `src/audio/positional.ts` (`positionalSound`), and `playPlaylist()` in `audio/music-control.ts`. The survivor
  and MOBA entries plus `match-audio.ts` use them instead of their own copies.
- **`src/survivor/math.ts`:** `clamp`, `smoothstep`, `wrapAngle`, `turnToward` (rig's `wrap` and the
  local `smooth`/`turnToward` copies are gone). The files the Node tests load as source (`snow-field`, `enemy-attack`,
  `talents`, `capstone-loadout`, `snow-navigation`) must not gain new runtime imports, so they keep their own helpers.
- **survivor `main.ts`:** `preferred()` handles ?query-or-saved settings; `pause()` is shared by Esc and Tab;
  `Player.unstick()` holds the snow-bank escape; `WeatherLab` takes a named options object; the dev
  `?shader-compare` panel is in `shader-compare.ts`; the dead `Arena.clamp` is removed.
- **Performance:** petals write state without temporary arrays (frame CPU under sakura weather 5.0–5.3 ms →
  3.2–3.4 ms, interleaved A/B). The VFX quad pool uses a free list (`vfx.quads` still lists every quad for the
  artifacts/ scripts; a double `release` is ignored). The HUD skips unchanged style and attribute writes. Atmosphere
  and target steering no longer allocate per frame.

## Continuous wet ground; puddles/lakes removed (2026-10-25)

The user rejected the puddles approach, including deep unwalkable water. `water.ts` now applies
a subtle reflection directly in the floor shader, with broad, smoothly varying intensity across
the whole environment. There are no separate pool shapes, shorelines, opaque centers, depth
texture or water collision/navigation. Walking and dashing across former lakes is unrestricted.
Do not restore the lake/puddle presets or barriers. Old saved/query modes map to Wet ground preview.
The user still wants visible reflections in selected areas: wetter patches now give mirrored
characters/enemies a stronger blend than the subtle sky coat. Keep these recognizable at maximum
zoom while preserving smooth transitions and visible floor texture.
Latest correction: reflections should be intense, especially on stone. Paving now supplies a
material mask for strong mirrored silhouettes and sky reflections; moss/soil stay less reflective.
Do not reduce this back to the barely visible sheen rejected by the user.

The floor retains normal lighting, fog and grading. The reflected sky uses the same lightning
pulse as the atmosphere, and mirrored actors refresh every frame during strikes. The baseline
`surface-wetness.ts` still slightly darkens ground/armor and adds restrained glossy highlights.
Weather-driven reflections fade in and dry slowly; their spatial pattern stays fixed.

Weather Lab prevents conflicting ground effects: rain clears/locks snow, snowfall clears/locks
water, and selecting either ground effect in clear weather disables the other. Saved/query
settings are guarded too. The user's earlier icy snow tint request was undone; do not restore it.
See [docs/LIGHTING.md](docs/LIGHTING.md), `artifacts/verify-ground-reflections.mjs` and
`artifacts/ui/ground-reflections/` for implementation and rendered verification.

## Ground snow and footprints (2026-10-25)

Grounded Survivor enemies now route around snow banks with body-sized clearance, crowd
steering, and deep-snow slowdown. **WEATHER LAB → Enemies → Pursue player** or
`&enemies=pursue` enables pursuit; the saved/default Hold positions mode also routes returns
around banks. Ranged targets seek a clear line before stopping at standoff range. Hovering
Lure ignores ground banks. Crawler and Pelican walk and stamp their claw trails. Knockback,
respawns, and snow changes preserve bank clearance. No enemy attacks are introduced.
`snow-navigation.ts` adapts the existing shared navigation system; terrain revisions reset
cached routes, while footprint changes do not. `npm run test:snow-navigation` and
`artifacts/verify-snow-navigation.mjs` cover routing, size, moving goals, controls, and pause.

Snow hills now block live Survivor attacks. `SnowField.traceSegment()` sweeps through the
world-space snow surface (including floor elevation), stopping rifle rounds and exploding
homing rockets at the first contact. Rockets resolve terrain versus target impacts in order.
Burst damage, its shader cone, lances, edge arc and residue stop at hills; afterburn and
explosion splash respect snow cover. Shots above the crest can clear it. Disabled snow does
not collide. `KitContext.snow` shares the field with weapons; new projectile types should use
the same sweep before damage. `artifacts/verify-snow-projectiles.mjs` and its
`artifacts/ui/snow-projectiles/` report cover these paths, charged Burst and cleanup.

`?run=test-range&snow=drifts&weather=snow&time=day` opens the snow prototype.
**WEATHER LAB → Ground snow** offers Off / Light powder / Deep snow / Mixed drifts + banks
and Reset footprints. A separate displaced overlay preserves the floor material and accepts
a height sampler for other static heightfield floors. See [docs/SNOW.md](docs/SNOW.md).

User corrections: footprints must be separate, not a drawn line; grounded Raptures need their
own claw silhouettes, hovering enemies leave none; falling snow refills the prints; hills and
deep snow need clear shading. Implemented alternating boot soles, Crawler pointed feet,
Pelican hooked claws, and no Lure prints. Targets stamp their stance and knockback/return
movement. Contact shapes/gaits are procedural, not extracted from live bone contacts.
Snowfall raises the depressions and fades their packed shading over approximately 47–58 s.
Clear weather preserves them, and pause freezes recovery. No continuous trench stamp remains.

Deep snow slows the player; banks at 95 cm fresh depth block walking/dashing with swept
body collision and edge sliding. Snow uses pale powder, cooler deep drifts, shaded blue bank
faces, pale caps, and wind ridges. Independent ground depth remains after precipitation changes.

Files: `src/survivor/snow-field.ts`, `snow.ts`, plus hooks in player, targets, atmosphere, main,
and Weather Lab. `npm run test:snow` passes. Browser checks in
`artifacts/verify-ground-snow.mjs` cover real movement, Rapture profiles, refill/pause, all five
art presets, floor adaptation and disposal; reports/captures are in `artifacts/ui/ground-snow/`.
Ground coverage does not increase automatically beyond refilling existing impressions.
TypeScript and production build pass; existing dependency bundling warnings remain.

**Game plan (2026-10-25, proposal for review):** [docs/GAME_PLAN.md](docs/GAME_PLAN.md) covers the
operation/sortie loop (surface search, lift extraction), zones, all 22 Raptures' roles and attacks,
boss classes (Obelisk, Cocytus, Sinister) and a build order. Not implemented; open decisions at its end.

## A02 ability roadmap implemented in test-range (2026-10-25, latest)

Tab and the HUD upgrade button open the implemented three-row Weapon / Special / Burst
roadmap. All five ranks and each free capstone are visible and inspectable, with a shared
bottom preview and purchase action. Rank 1 is free; ranks 2–5 cost 1/2/3/4 SP. Rank 5 grants
Unyielding / Detonation / A Goddess Who Cannot Yield automatically. Costs remain initial
playtest tuning. Kill XP and one SP per level are unchanged; no sortie SP bonus was added.

The user requested simpler live-HUD styling: square main panels, restrained amber, existing
equipment art, small rank controls with detached corner brackets, and the actual HUD portrait
trim with only a small top-left cut. Preserve those geometry rules below.

**Overflow correction:** the modal sizes and scales against the actual `#frame` game container
using cqw/cqh and container queries, including compact layouts. It stays inside the letterboxed
16:9 or 21:9 game frame and needs no internal scrolling. Do not return to browser-viewport sizing.

Files: `src/survivor/ability-ranks.ts` authors the bundles; `talents.ts` handles sequential
purchases and grants the existing combat flags; `talent-menu.ts`, `talent-menu.css` and
`talent-icons.ts` implement the view. The live HUD upgrade button now says Ability ranks.
Progression currently lives in the existing `Run` state. Permanent character saves, Ark respec
and the operation loop described in `docs/GAME_PLAN.md` are separate work, not implemented here.

TypeScript and production build passed after implementation. A later final typecheck found
concurrent weather API errors in `main.ts` / `weather-lab.ts` (water presets, update arguments
and `WaterLayer.field`); those unrelated edits were preserved. The menu verification passed:
`artifacts/verify-survivor-talents.mjs` verifies real Tab/HUD controls, pause/focus, keyboard
navigation, purchase guards, all rank bundles and capstones, and all 18 previews across six
frame sizes with no clipping or scrolling. Report and screenshots:
`artifacts/ui/ability-roadmap/verification.json` and adjacent JPGs.

## A02 roadmap layout approved; current-HUD visual variation (2026-10-25, design history)

**Latest user correction — corner rules:** large panels, row art, header and preview must be
square-cornered. Portraits may have only one SMALL top-left cut, with the other three corners
square, like the real HUD portrait. Paired top-left / bottom-right cuts belong only on small
controls; BOTH cut corners need detached L-brackets reconstructing the missing rectangular
corners, so their overall silhouette still reads as a complete square. Bare paired cuts and
chamfers applied to every panel are wrong. Preserve this rule in future UI work.
`A02-v4-square-frames-*.png` is the corrected mockup pair; `a02-theme.html` compares v4 with v3.
Exact prompts/provenance are saved alongside the images. This section records the mockup pass;
the implementation above supersedes its runtime and pacing status.

The user preferred A02, asked for visible capstones and pacing review against Claude's game
plan, then called the revised layout **perfect**. Preserve its three rows, five rank columns,
separate capstone endpoint, illustrated row headers and bottom preview/action strip.
The newest request is a visual variation matching the actual current HUD's shapes, details
and motifs, explicitly **not excessive yellow**.

Review `docs/concepts/ability-progression-2026-10-25/a02-theme.html`: switches between the
new HUD treatment and the previous treatment, with 21:9 and 16:9 versions of both.
`A02-v3-hud-theme-*.png` uses charcoal, fine ivory frames, small clipped corners, inset lines,
short corner marks and compact keycaps; preserves the illustrated art. References are the
approved survivor HUD and its card-detail capture, checked against survivor.css/hud-frames.ts.
The user has approved the layout, not yet this latest visual variation. Runtime is unchanged.

Current pacing PROPOSAL shown: Rank 1 free, ranks 2-5 cost 1/2/3/4 SP. Rank 5 also grants its
free capstone: Unyielding / Detonation / A Goddess Who Cannot Yield. Preview state: level 14,
Weapon 4 / Special 3 / Burst 1, 9 SP spent and 4 available. Costs are not approved balance.
At one SP/level, focused first capstone is possible at level 11, all three at 31. The user
raised sortie-awarded SP as a possibility; source of points is still open. Mockups retain XP.
Claude's plan targets levels 8/14/22 after first/second sortie/by final boss. Its "roughly two
masteries" claim at 22 does not match current live costs (all three at 19) or original A02 (13).

Generated with built-in ImageGen; exact prompts, paths, hashes and dimensions are saved in
the concept directory. `a02-revised.html` keeps the approved v2 layout; index.html links to the
latest comparison. Earlier recommendations below are historical and superseded by A02.

## Ability levels are now the main progression direction (2026-10-25, earlier)

The user rejected the plain HTML tree mockups as unattractive relative to the illustrated
reference gallery in `docs/concepts/survivors-2026-10-24/index.html`. They explicitly clarified
that the game is **landscape only, 16:9 or 21:9**; stop designing portrait phone variants.
They also explicitly support removing the tree entirely: each ability can simply gain levels
with upgrades bundled into a fixed order. Earlier requirements to preserve all talent
prerequisites are no longer constraints on design proposals.

New art-led mockups and an inspected local-file gallery are in
`docs/concepts/ability-progression-2026-10-25/index.html`:

- **A01 Ability ranks:** three illustrated Weapon / Special / Burst cards. Spend points to
  advance an ability through five authored ranks; show the next change before purchase.
- **A02 Rank roadmap:** the same system, with all three five-rank tracks visible. Suggested
  as A01's optional plan view, not a separate progression system.
- **A03 Automatic milestones:** all three abilities upgrade automatically at character
  levels 1 / 5 / 10 / 15 / 20. No points or purchasing; removes investment decisions.
- **T01 Illustrated hex tree:** a polished comparison retaining the existing prerequisite
  rules, illustrated nodes, and a large selected-ability vignette.

The recommended proposal is A01 + A02. The README and gallery contain a concrete grouping
of every existing Snow White effect into five ranks. Rank 1 is free; ranks 2-5 bundle the
six former purchases and fold mastery effects into the final rank. Costs and timing need
balancing. **No new progression model has been implemented or selected by the user yet.**
The live menu still uses its original tree implementation. These latest images supersede
the earlier HTML concepts as visual references for this task.

Built-in ImageGen generated the four images from the user's hex-tree reference and an actual
test-range capture. PNGs, prompts, original paths, hashes, dimensions and gallery checks are
saved beside the gallery. `artifacts/verify-ability-gallery.mjs` passes local-file image loads,
whole-image display, filters, lightbox sizing, arrow navigation, Escape, and no page errors.

## Test-range upgrades and redesign concepts (2026-10-25, earlier)

Latest direction: the user rejected the Bottom tray and Side panel concepts because they hide
prerequisites. The tree should occupy **most**, not all, of the screen. The revised mockup is
`artifacts/mockups/talent-tree-overlay.html` (editable fragment) and
`artifacts/mockups/talent-tree-overlay-preview.html` (standalone preview). It uses a large
inset charcoal overlay, visible battlefield/HUD margins, gold selection, seven nodes arranged
with parents above their children, arrowed prerequisite paths, and a separate automatic
mastery bar. Selecting a locked talent highlights its ancestry and offers a named prerequisite
link. The detail panel moves below the tree in portrait orientation. All 24 talent descriptions
and all three branches fit without scrolling in desktop, phone portrait, narrow phone, and
phone landscape checks. `artifacts/verify-tree-overlay.mjs` records screenshots/results under
`artifacts/ui/talent-menu/tree-redesign/`. This is a revised mockup; the live menu has not yet
been restyled to it. The older tray/list concepts below are superseded.

Tab now opens `src/survivor/talent-menu.ts`; the HUD Upgrades label is also a button.
The menu pauses simulation, clears held inputs, and resumes through Tab, Esc, or close.
`Run.skillPoints` awards one point per level; `RunTalents` enforces prerequisites, free base
abilities, purchases, and automatic branch masteries using the existing Snow White definitions.
The Snow White runtime now reads these ranks for weapon trails/marks/charge, turret upgrades,
and Burst upgrades. Progress lasts for the current run. This work is only in `?run=test-range`.

The user rejected the large white-sidebar/full-tree presentation as inconsistent with the
current HUD and too large/scroll-heavy for a possible phone game. **The redesign is at the
options stage; no final concept has been selected.** Three interactive concepts are in
`artifacts/mockups/upgrade-menu-options.html`: Bottom tray, Side panel, and Compact tree.
They use the test-range background, charcoal panels, thin ivory corner brackets, Rajdhani,
and gold accents. The Phone preview reflows without internal scrolling. Tray/list concepts
page through additional available upgrades; the compact tree exposes the full branch.
`upgrade-menu-preview.html` is the standalone QA wrapper, not the editable source fragment.

Verification: `artifacts/verify-survivor-talents.mjs` passes real Tab/HUD clicks, pause/resume,
point spending, prerequisites, duplicate prevention, mastery, and settings exclusion.
`artifacts/verify-upgrade-mockups.mjs` passes all three concepts at 1024, 390, and 320 widths,
plus local selection/unlock/category/close/reopen interactions. Captures and reports are under
`artifacts/ui/talent-menu/`. TypeScript and production build pass (existing upstream bundling
warnings remain). Combat upgrades still need a dedicated balance/gameplay pass.

## Survivors of Victory 3D: test range (2026-10-25, current)

The user chose the Survivors direction. A new runtime lives in `src/survivor/`; the MOBA code is
untouched and still opens with `?hero=<id>&map=…`. Play → Stage Select (now a single TEST RANGE
card) → Mission Start opens `?run=test-range` (routing in `src/app.ts`).

- `main.ts` entry; `arena.ts` painted plaza; `targets.ts` training Raptures (baked crowds).
- `rig.ts` twin-stick animation: masked lower (legs) / upper (spine subtree) clip layers; the spine
  is twisted after animation until the gun (Prop1 → muzzle) points at the cursor. Aiming, leg clips
  use hip facing (NIKKE's run turns the hips ~55° from the head). Backpedal plays run reversed.
- `player.ts` WASD, cursor aim (always), dash, magazine/reload, Special, Burst; shots and Burst are
  released after the rig aims, from the real gun tip. `camera.ts` follow camera + angle presets.
- `kit.ts` character contract; `snow-white/` her Survivors kit rebuilt in 3D (sniper lance, Auto-
  Turret with homing missiles, Seven Dwarves cold-fire cone, palette from SnowWhiteVisualTheme).
- `vfx.ts` effect toolkit (additive shader quads, streaks, decals, particles, one flash light).
- `hud.ts` / `survivor.css`: the user's own HUD mockup (flat panels, gold Burst card).

### 3D atmosphere and weather (2026-10-25)

The test range has a live **WEATHER LAB** panel with Night storm / Golden hour / Snowfall /
Clear day presets and **Strike lightning + thunder**. **Esc → Environment** has the same
time/weather/intensity selectors plus **Preview in test range**. Controls synchronize and persist.
Weather is Clear, Thunderstorm, Snow or Drifting petals; all rain is a thunderstorm and forces
Night. Old `rain` links/preferences migrate to `storm`. Clear nights add fireflies.
**Light +** is the default, just above **Light**; Heavy/Extreme were rejected and removed.
Direct preview: `?run=test-range&weather=storm&intensity=moderate`.

These are new Babylon shaders, using the original Phaser `WorldEnvironment.ts` only as a mood
and behavior reference. `src/survivor/atmosphere.ts` draws a fixed batch of world-space ribbons,
billboard flakes/motes/petals and horizontal ground ripples. Normal depth testing lets enemies
occlude weather; the volume wraps around the camera focus without dragging particles along.
Snow now uses smaller tumbling flakes, varied downward speeds and gentle independent flutter;
the earlier slow lateral drift looked stationary while running. Its time uniform stops with
gameplay, including when the talent menu is open. No weather is drawn over the HUD.

`visuals.ts` composes atmosphere with every existing art preset. `toon.ts` accepts an atmosphere
lit/shadow color uniforms after computing its cel bands/rim, retaining ink, palette treatment, skinning
and emissive accents. Returning to Day/Clear restores the preset; changing presets preserves
the atmosphere. Night has darker ambient fill, cool directional moonlight, deeper cel shadows,
and a subtle vignette through the existing grading pass. Dusk retains soft golden light and long
shadows; avoid the rejected harsh orange/violet saturation, especially with Anime enabled.
The player now has a soft character-only night fill, applied inside Anime's lighting shader
(ordinary point lights alone do not affect that shader's custom cel lighting). Other presets
use a scoped hemispheric fill. The fill is now 30% stronger. `night-aura.ts` adds a soft local
glow with slow expanding/fading pulses, rendered on actual surfaces (including displaced snow)
within 3.5 metres. It follows the player, switches off in daylight, pauses with gameplay, and
becomes steady under reduced motion. It adds no mesh or rendering pass.

Enemy readability: `src/enemy-metal.ts` adds restrained directional/sky reflections to armor
after Anime lighting, compatible with all art presets and atmosphere changes. Painted red
details and dark markings are mostly excluded from the sheen. `enemy-glow.ts` now uses a
dedicated narrow `enemy-red-glow` layer (blur 8, intensity .32), keeping bright red surface
emission while reducing halo spread. The combat glow layer keeps its existing blur/settings.
This adds one half-resolution enemy glow target; crowd materials and animation remain shared.
`artifacts/verify-readability.mjs` and `artifacts/ui/readability/` cover rendered sheen, aura
falloff/pulsing on plaza and snow, player following, pause, daylight, reduced motion and glow scope.
`lightning.ts` adds visible branched 3D bolts, brief world-light pulses and delayed thunder every
4–7 seconds. Reduced motion suppresses bolts/pulses. Original rain and thunder SFX run through
the shared SFX bus, with fading rain ambience, pause/resume and scene-disposal cleanup.
Lightning now lights surfaces much more clearly: stronger white directional/ambient light,
matching Anime lit/shadow contributions, a small exposure lift and a smooth 0.85-second fade.
Rain remains Light +. `artifacts/verify-night-lighting.mjs` checks actual pixel illumination,
character-only fill, unchanged daylight, restoration after a strike and reduced-motion behavior;
evidence is in `artifacts/ui/night-lighting/`.

Evidence: `artifacts/verify-atmosphere.mjs`, `verify-weather-lab.mjs`, `verify-snow-motion.mjs`
and matching folders under `artifacts/ui/`. Checks pass for live controls, lightning/audio,
pause/disposal, all art presets, reduced motion, WASD movement, daylight restoration and GPU
flake positions independent of camera translation. TypeScript and production build pass.
Snowfall refills the ground overlay's footprints (see Ground snow above); rain does not create reflective puddles. The archived MOBA keeps
its existing environment controls and neutral atmosphere.

### Enemy death burst (2026-10-25)

The test-range Raptures now use a compact mechanical explosion from the shared `Run.onKill`
hook. `src/survivor/enemy-death.ts` places a textured orange/white fireburst immediately on the
kill frame, with eight outward sparks and a brief dark puff underneath. The user rejected the
first large, bland smoke cloud; keep this effect tight and fast, without an expanding ground ring.

Targets hold their last pose for 40 ms, collapse over 80 ms under opaque cover, and stop drawing
at zero scale. The fire cools to orange and eases out over 540 ms; sparks slow, thin and fade on
staggered lifetimes, with all leases released by 680 ms. This longer, faint ending addresses the
user's report that the 420 ms version switched off abruptly. Its compact size is unchanged and
smoke clears earlier than the ember tail. Knockback is cleared on death; training
targets still return to their marks after 2.5 seconds. Death rewards remain; the Rapture death
sound is removed at the user's request to avoid repetitive audio during mass kills.
`vfx.ts` supports alpha-blended smoke/fire textures as well as additive weapon effects, resetting
the blend mode on each pooled lease. All pieces use game time, including sparks.

`artifacts/verify-enemy-death.mjs` checks all three enemy types, immediate cover, one kill award,
frozen poses, cleanup, pooled blend-mode reset, pause, and repeated 12-target kills/respawns at
20/60/120 simulated FPS. Captures include multiple camera angles and clustered kills; evidence
lives in `artifacts/ui/enemy-death/`.

Turret audio preference: deployment and landing are silent. Removed the UI select/confirm beep
from `deploy()` and the rocket explosion cue from `land()` in `snow-white/turret.ts`. Rocket launch
audio remains on actual volleys, and missile impacts retain their explosion sound. A runtime check
confirmed silent normal/perimeter deployment without targets and launch cues only with missiles.

Snow White's Burst now plays her existing `voice/characters/snow-white/burst.wav` voice line,
replacing both the generic beam and layered explosion sounds. `SFX.snowWhiteBurst` uses the
existing voice mix (+1.1 dB at 0.5 base volume), one voice, and the normal SFX preload path.
Normal and fully charged Bursts were checked to emit only this cue; the audio asset decodes.

Burst movement/alignment correction: all active flame layers, lances, opening flash/light and
front arc share the current muzzle origin and height. The previous ground cone started at the
feet (about 1.4 m behind and 1 m below the muzzle), and the arc used another height; following
movement alone did not fix their doubled silhouettes. Removed the active ground cone and the
small vertical offsets between flame layers. The ground afterglow and ambient embers now begin
only after the active cone ends, at its final muzzle-projected footprint. Enemy impact effects
stay on their actual targets. VFX update after animation/aiming so attached layers use this
frame's gun position; damage retains a snapshot of the cast origin.
`artifacts/verify-survivor-burst-motion.mjs` checks real strafing, common origins/heights, front
arc radius, normal/charged casts in four directions, residue and cleanup. Reports are under
`artifacts/ui/survivor-burst-motion/`. Matched before/after front, side, diagonal and charged
captures are under `artifacts/ui/survivor-burst-alignment/`.

### Survivor posture correction (2026-10-25)

The upper clips now evaluate their own root/pelvis transforms on a hidden transform-only chain.
`rig.ts` converts the upper spine rotation into the visible legs' coordinate frame before aiming,
keeping the waist attached to locomotion. The upper
layer also normalizes its own facing, including the differently oriented reload clip. The previous
14-degree camera-facing model lean is now zero; use the camera presets for character visibility.

The user explicitly wants **no forward torso lean**. `uprightTorso()` now aligns the waist-to-neck
axis with world up before yaw steering. It rotates the whole upper subtree, preserving hand/gun
attachment and the feet/pelvis. This applies to aiming, movement, shots and reloads, fading with
the aim blend; relaxed/full-body clips retain their animation. Do not restore a partial lean.

The head's separate animated downward tilt is also removed. `levelHead()` levels the head after
torso steering, retaining its horizontal look direction. This applies to normal idle, relaxed,
movement, aim, shot and reload poses; full-body reactions retain their animation. The head resets
before animation evaluation so this correction cannot accumulate or move the weapon/feet.

`artifacts/verify-survivor-posture.mjs` checks 58 idle/run/strafe/backpedal/dash/shot/reload and
relaxed poses, compares against independently sampled source clips, and checks cursor aim,
stationary feet/pelvis/hands/gun and hand-to-weapon distances. Current reports and matching
before/after captures are in `artifacts/ui/survivor-head-level/`; `survivor-upright/` retains the
torso correction evidence and `survivor-posture/` holds the earlier join fix.

Reload facing follow-up: reload now steers from the animated chest each frame, retaining its
aim-relative heading through both crossfades while allowing the hands and rifle to reload.
Returning to barrel aiming eases over 0.1 seconds; firing immediately restores barrel alignment.
The last round renders its shot pose before entering the automatic reload pose on the next frame.
`artifacts/verify-survivor-reload.mjs` covers six complete reload/transition cycles (stationary,
moving, backpedaling and changing cursor direction), plus manual/automatic reloads and immediate
follow-up shots through the player loop. It also checks head leveling on every reload/crossfade
frame. Captures/reports are in `artifacts/ui/survivor-reload/`.

### Survivors HUD completion (2026-10-25)

The approved flat NIKKE combat mockup is implemented in the survivors runtime. This direction
applies to `?run=test-range`; the archived MOBA keeps its separate HotS presentation.

- The music player is in the **top right, immediately left of Pause**, with matching charcoal
  fill, ivory corner brackets, white controls, and a neutral playback progress line.
  Its desktop width is now 18vw (230-340px), about a quarter shorter for typical desktop sizes;
  long titles ellipsize while all controls retain their size. Compact layouts use 220-230px.
- The operator panel groups the existing Snow White artwork, health, magazine, and reload.
  Dash, Weapon, Special, and Burst cards now activate the existing queued input actions when
  clicked; their keyboard/mouse bindings still work. Special/Burst disable when unavailable.
- The layout scales with both frame dimensions. Compact screens put the dock on a separate row;
  portrait screens stack Burst below the three action cards. The radar has no music strip.
- Pause updates its actual button's accessibility state; Escape also works from a focused
  music control. Health, XP and Burst expose live progress values. Reduced motion skips meter
  transitions. Upgrades is still the existing indicator, not an implemented talent screen.

#### Mockup detail correction (2026-10-25)

Burst artwork follow-up: the user explicitly preferred the mockup's extreme golden-eye close-up.
`public/ui/survivor/snow-white-burst-eye.png` is now used only for Snow White's Survivors Burst card,
with a centered crop and natural gold saturation. It was generated with the built-in image tool
from the user's character sheet after online artwork research. The master image, exact prompt
and reference sources are in `assets/ui-source/survivor-hud/snow-white-burst-eye.*`.
The profile portrait and simple equipment icons remain unchanged. Charging/ready screenshots at
reference, laptop and portrait sizes are in `artifacts/ui/survivor-burst-eye/`; typecheck passes.

The user clarified that fidelity means the subtle panel geometry and finish, especially corner
cuts; new weapon illustrations were not the priority. The 1771 × 888 approved reference is saved
at `assets/ui-source/survivor-hud/approved-mockup.png`. Keep the current profile portrait and the
later-requested top-right music player.

- `hud-frames.ts` draws asymmetric 45-degree card cuts (15px above, 20px below at reference size),
  fine inset strokes and detached L marks outside the cuts. Burst has its own upper pennant and
  slash, nested upper-right brackets, lower-left index tab, and broad lower-right slash/heel.
  Its E key has four cut corners and white lettering; other keycaps have rounded nested edges.
- Burst's gauge has a dark recessed casing and black diagonal end stripes. The XP rail has an
  outlined 8px track; ammo uses pale rectangular cartridges with separated triangular tips.
- Desktop layout scales the complete 1771 x 888 reference composition uniformly. The earlier
  height-based scale squeezed health and Burst at 16:9; both columns now retain their measured
  widths and gaps. Ultrawide screens center the composition; compact screens retain the reflow.
  Card labels are explicitly positioned, so native button centering cannot shift the layout.
- Matched all four registration marks around the card cuts, the portrait frame's small corner cut,
  taller reload key, label/icon baselines, and health/ammo typography. The radar's larger rings
  and dotted full-width crosshair follow the reference; dots scale with the canvas.
- A separate detail pass follows the user's emphasis on flourishes: the objective now has a
  stepped lower rule, return bracket and faint endpoint etching. Radar has three inset brackets
  and a double outline. Card surfaces have a muted charcoal wash, reducing terrain distraction.
  Burst's recessed gauge joins the divider and ends in three slashes. No artwork was generated.
- Portrait clarification: the reference's hatching belongs to its source artwork, not a HUD
  overlay. Removed the procedural hatch and oversized image mask. Keep only the 20px top-left
  cut shared by the frame and image, scaled with the portrait; do not add hatch treatments.
- Bottom separation now combines a HUD-sized dark fade, a feathered shadow behind the operator
  stats, and soft contact shadows under the portrait, action dock and radar. Compact layouts
  adjust the fade's height with their reflow. Before/after captures use `backdrop-*.png`.
- Top-left objective shading has a continuous dark core behind both the yellow marker and text,
  with blurred outer edges and a fade on the right. Do not use a centered ellipse here: it leaves
  the marker over unshaded terrain. The panel itself has no hard rectangular fill. Timer/wave
  retains its own centered soft shadow around both text lines and the flanking rules.
- Removed the continuous Burst pulse. White/amber detail and readiness state provide emphasis.
  Existing HP, ammo, charge and XP values remain live; the mockup's six pips at 7/7 are not copied.
- The user rejected the generated weapon/turret illustrations and explicitly prefers the
  previous simple white SVG silhouettes. Those original icons are restored in `hud.ts`; do not
  reintroduce the unused PNGs in `public/ui/survivor/`. The corner/frame refinements remain.

Fidelity captures, geometry measurements, build log, and 13-size browser/interaction checks are
under `artifacts/ui/survivor-hud-fidelity/`. Desktop panel widths, positions, heights and baselines
are checked against measurements from the approved image at every aspect ratio. Frame closure,
inset geometry and vector icons are checked alongside control, accessibility and overlap checks.
`detail-review.mjs` renders enlarged reference/implementation comparisons for the cards, Burst,
objective, radar, portrait frame and keycap (`detail-after-*.png`) to inspect the small details.

Validation: `artifacts/ui/survivor-hud/verify.mjs` and `verification.json` cover 13 viewport sizes,
panel bounds/overlap, loaded art, music alignment/colors and all four music controls, pause,
reload/health/ammo, Special, Burst, Dash and reduced motion. PNGs include the ready and reload
states. TypeScript and the production build pass; existing third-party directive warnings remain.

Not built yet: the talent tree (Tab / "Upgrades"), enemies that fight back, other characters'
survivor kits (every deploy uses Snow White).

## Latest direction discussion: top-down action (2026-10-25)

The user feels direct top-down action best suits the models and wants to use the
existing WASD-style movement. They are concerned the authored talent trees are too
complex for a basic Survivors clone and are considering action formats that give
those builds more room. No final genre or progression model has been selected.
The autobattler exploration stopped after its formation mockup; see
`docs/concepts/autobattler-2026-10-25/README.md`. Do not automatically finish that
shot list. Continue design discussion before implementing a transition.

## Current visual exploration: grid tactics + focused turns (2026-10-24)

The user returned from the incremental / micro-RTS exploration to a grid-tactics
and JRPG hybrid. Move and choose a target on the grid, then move the camera behind
the acting character to choose **Attack, Skill, Burst or Item**. No Defend command.
For attacks, a line oscillates across a bar; click inside a skill-specific highlighted
window to gain bonus damage. No defensive reactive dodge/parry or spatial weakpoint aim.

Latest UI preference: the user prefers the earlier JRPG command layout (compact
vertical menu on the left, from the previous JRPG concept) over the large bottom
hex command buttons in this hybrid study. Keep Attack, Skill, Burst and Item and
the timing-window mechanic when revisiting it. Existing mockup images are unchanged.
The user is also exploring additional genres; this remains a candidate direction.

Read [the hybrid concept notes](docs/concepts/hybrid-tactics-2026-10-24/README.md)
and open `docs/concepts/hybrid-tactics-2026-10-24/index.html` for seven screenshot-based
imagegen mockups: six moments in a turn plus one alternative Burst timing window.
The prompts, reference screenshots and verification record are saved alongside them.
Base damage on an outside-window click, +25% bonus, charge costs and the pictured skills
are proposals for review. No gameplay conversion has been implemented or approved.
Other genre options remain available. The unfinished incremental / micro-RTS drafts
remain separate; do not treat them as the current direction. Preserve the MOBA archive.

## Survivors visual planning (2026-10-24)

The next direction is being reviewed visually before gameplay implementation.
Read [the Survivors visual plan](docs/SURVIVORS_VISUAL_PLAN.md) and open
`docs/concepts/survivors-2026-10-24/index.html` for 15 imagegen mockups, comparisons,
source screenshots, prompts and a shortlist. The 2D Survivors of Victory is the
gameplay reference; the current 3D bottom HUD is the presentation reference.
Keep cooldowns/charges in the bottom HUD rather than beside the overhead health bar.
H02 centered HUD + T01 hex talent tree + M01 Reclamation is a recommendation for
review, not a user-approved implementation choice. The other mode and UI options
remain available. This pass changed design documentation only. Continue by refining
the user's visual choices before writing the genre transition. Preserve the MOBA
checkpoint described below.

## MOBA preservation before genre transition (2026-10-24)

The user requires the MOBA to remain recoverable while exploring a Survivors direction.
The baseline is preserved in the supplied `exporterrormusic/survivors-of-victory-3d`
repository under branch `archive/moba-2026-10-24` and tag `moba-baseline-2026-10-24`,
with complete source/assets and a fresh compiled build attached to that release.
See [MOBA archive and restoration instructions](docs/MOBA_ARCHIVE.md).
Keep that branch, tag and release unchanged; future development belongs on `main`.
No genre conversion has been made by the archival task. The existing near-finished
Survivors of Victory reference project remains separate and untouched.

Last updated: 2026-10-24. Written for the next AI or developer picking this up.

## Rendering performance pass 1 (2026-10-24)

Measured with hardware Chrome (ANGLE D3D11, RTX 4090) at 1920×1080 against deterministic
battle states; details, limitations and evidence are in `docs/PERFORMANCE.md`. The game was CPU-bound
by draw calls. Babylon does not frustum-cull a shadow map's render list, so all ~2,500 casters were
drawn each frame. `src/world.ts` now culls casters to the sun's camera-following frustum: the shadow
map stayed bit-identical, with ~1,040 → 85–133 shadow draws. Leaf/fern/ivy cards are static thin
instances (`foliage.commit()`); tree branches, ruin parts, wall pairs, hangars and lane paint are merged
statics. Single-material structure meshes have one submesh. Preset and AO changes batch material
invalidation, which took the hitch from 440–800 ms to ~25 ms on Hollow. Interleaved A/B on Hollow:
CPU ~30 → 6–10 ms, GPU 12–25 → 2.5–4.4 ms, and draws 1,173–1,656 → 176–342. Canvas-only image diffs are
≤0.05% of pixels >32 levels. Art, lighting (including PCF High and SSAO) and gameplay are unchanged.
Gotchas:
- `Mesh.MergeMeshes` bakes normals without the inverse-transpose; recompute flat normals after merging scaled parts.
- Regrouping MultiMaterial submeshes rendered turret heads in the visor color, so only single-material meshes are collapsed.
- `docs/LIGHTING.md` previously misstated the AO resolution: AO already renders at 960×540.

Next costs: simulation above ~150 units (11 ms at 252), per-frame HUD/active-mesh CPU, and startup
shader compilation. Harness: `artifacts/perf/`.

## Lighting pass 1 (2026-10-24)

The user wants lighting/environment improvements one pass at a time. The current pass corrects
painted materials' accidental self-illumination, rebalances sun/sky fill, adds SSAO contact
shading, and provides Painted daylight (default), Warm daylight and Cool woodland grades.
F10 → Lighting & color also has Previous lighting for comparison; Ambient shadows can be
disabled separately. Settings persist. Grades use color curves and Neutral tone mapping,
not LUT files. Shadow maps follow camera focus, fixing missing shadows when panning away from
the hero. See `docs/LIGHTING.md` and `artifacts/ui/lighting-pass-1/`. Clouds, mist, wind, new
normal maps and local-light effects are deferred to later user-directed passes.

## Battlegrounds and latest user corrections (2026-10-24)

Two maps now replace the original diagonal lane: Outpost Hollow (three lanes, Cursed Hollow
reference explicitly selected by the user) and Lost Outpost (one lane, Lost Cavern reference).
Both have destructible paired gate towers, gates, Forts, Keeps and Cores; same-lane Fort + Keep
destruction unlocks the Core. Core destruction ends the match. Core health sits immediately
below the top-center scoreboard, matching the researched HotS HUD. Select the map through
Stage Select's THREE LANES / ONE LANE or F10 → Battleground.

The user rejected the first compact scale. Map travel coordinates are now 1.8× larger while
models retain their dimensions. Classic camera distance is 32. Twin-gun structures now emit
two half-damage rounds from their actual transformed barrel tips. Both teams' gate collision,
unit navigation, player/minion siege damage, victory/defeat, pointer targeting and responsive
core HUD were checked in the browser. See `docs/BATTLEGROUNDS.md` for implementation,
sources, measurements, tests and limitations. This section supersedes older “no bases/victory”
and “single diagonal lane” descriptions below.

**The first actual structure paint-over pass is now applied.** The user rejected the flat
blockout materials. Built-in ImageGen painted orthographic captures of the actual geometry;
four views are baked into mesh UVs in `src/paintover.ts`. Painted towers, Forts, Keeps, Core
frames, rotating guns, hangars, walls, ruins, cliffs and rubble are visible on both maps.
New painted paving and woodland tiles replace the previous ground tiles. Existing foliage
is retained. Six new runtime WebPs total 2.45 MB. Source captures, exact prompts and output
PNGs are saved under `assets/environment-source/paintover-v1/`; see `docs/PAINTOVER_ART.md`.
Lighting/glow were reduced to preserve detail; the Core shield now has a transparent center.
Multi-angle screenshots and texture/UV/destruction checks are in `artifacts/ui/paintover-v1/`.
Simple silhouettes and some projection seams still leave room for refinement. This supersedes
older descriptions of generic concrete on all new structures. Tribute/curse objectives,
camps, fountains and full ARAM rules remain unbuilt.

## Goal
A fan MOBA using NIKKE 3D chibi models, built in **Babylon.js 9** + Vite + TypeScript. It should
control and read like **Heroes of the Storm** (HotS), with a restrained **NIKKE color palette**. HotS's
large, clear UI and established layout take priority over decorative styling. The test hero is Snow White (c220_00; the variants
c220_01, c224_00 and c471_00 are also converted). Red Hood (c470_00) is also selectable through
F10 → Character / outfit or `?v=c470_00`, with her own model and portrait. Rapunzel (`c221_00`) and
Scarlet (`c222_00`) are also included in the default download and selector. All characters currently
share Snow White's placeholder kit, without separate healing or melee mechanics. Rapunzel and Scarlet
use head-based attack facing (`HEAD_AIM_VARIANTS` in `src/main.ts` and `AimFacing` in `src/chibi.ts`)
because staff/sword orientation cannot serve as rifle barrel direction. README.md documents the model pipeline in depth.
Multiplayer is an eventual interest, not implemented in the current prototype.

> **Superseded by the section below:** heroes, labels and aim facing now come from
> `src/characters/` (not `LABELS` / `HEAD_AIM_VARIANTS` in `main.ts`), and Red Hood is hidden.

## Character weapons (2026-10-24)

Playable heroes now use their Godot/Phaser primary weapon patterns: piercing snipers,
Scarlet's sword sweep, Rapunzel's explosive rockets, paired SMGs, Crown's rapid minigun,
Kilo's five-pellet shotgun and Marian's continuous beam after a 0.4-second wind-up.
Weapon cadence is independent of animation length. Reference magazines/reloads are in
each kit; WASD can move while firing. Projectiles have swept collision and stop at cover.
Pooled 3D effects and beam audio distinguish the weapons. See `docs/WEAPONS.md` for
source references, behavior and the browser verification artifacts.

Verified all nine playable kits in targeted and cursor modes, then checked each actual
animated model in the browser with screenshots. Crown fired 33 volleys over two seconds
at each of 20/30/60/120 FPS; a further 15 seconds of fire added no meshes after pooling
had warmed up. TypeScript and the production build pass.

## Heroic picker framing (2026-10-24)

The heroic choices in `src/hud.ts` and `src/style.css` now share a dark, metal-framed tray.
The heading sits inside the tray; cards have beveled borders, painted hexagonal icon sockets,
number-key badges, a Heroic (R) label, and cyan hover/focus states. Existing `panel.webp` and
`skill-socket.webp` supply the framing. Short screens scroll the choices beneath the fixed heading.
Selection still uses mouse, keyboard activation, or 1 / 2. Full talent tiers remain unimplemented.

Verified the production build at six viewport sizes (320x568 through 1920x1080), including
scrolling the second option into view and mouse/Enter/number-key selection, with no page errors.
Screenshots, the check script, and reference images are in `artifacts/ui/heroic-picker/`.

## Facing and movement fixes (2026-10-24, latest)

- **Facing:** several heroes (Crown, Kilo, Nayuta, Modernia) shot with their backs to the target.
  The converter (`tools/sdp.mjs`) took the weapon vertex farthest from the head as the gun tip,
  but a minigun's or mech cannon's back end is often farther than its barrel. It now:
  - measures the head direction from the eyes, or from the head bone's +Y on rigs without eye bones
    (calibrated: within ~10° of the eyes on every rig that has both);
  - takes the muzzle as the weapon vertex furthest forward along that direction.
  All models were re-converted (`node tools/fetch-chibi.mjs`, from the cached raw packs). Checked
  in-engine for all nine heroes mid-shot (scratchpad `face-measure.mjs`): every face is within 0–45° of
  the target (weapon heroes keep their cheek-on-stock offset). FieldModel `muzzle: 'body'` covers
  weapons that never point at the target.
- **Right-drag movement:** holding the right button re-aims the move at the cursor every frame,
  HotS / Diablo style; a drag that began on an enemy keeps attacking it. On open ground the hero steers
  straight at the point, and around cover her path re-plans within 0.1 s. Crowds keep the slower
  re-plan, which spreads their searches. Before, the drag re-sent orders every 0.12 s and the path
  could lag up to 0.75 s.

## Kits and ability systems (2026-10-24)

Every playable hero now has a kit of their own: `src/characters/<id>/kit.ts`. A kit is data only:
- stats with a resource (mana, fuel or health);
- a basic attack, optionally with a magazine;
- a trait with hooks;
- Q/W/E;
- `heroics: [R1, R2]`.

Each ability names its cast style (`shot`, `dash` or `channel`) and lists effects. The systems that run them live in `src/abilities/`:
- `types.ts`: kit, ability, effect, status, zone and summon types (start here).
- `effects.ts`: the one runner turning effects into `Combat` calls. Effect kinds: bolt (optionally a fan),
  lob (optionally leaving a zone), zone, nova, cone, beam (channels), self, summon, convert. Bolts, lobs,
  novas and cones can knock back.
- `status.ts`: `StatusSet` on every unit (hero, minion, summon). Debuffs: slow, stun, root, burn, vulnerable.
  Buffs: invulnerable, shield, haste, frenzy, empower, fortify.
- `common.ts`: shared Z/B/T slots, `slotInfo()` (what the HUD, tooltips, targeting and cast checks read for any slot),
  and glyph fallbacks for abilities without painted icons.
- `prototype-kit.ts`: the old shared kit. It is the fallback (`kitOf`) for a character without a kit.ts.

`hero.ts` keeps orders, movement and animation. It takes timings from the kit and calls the runner. It also handles:
- resources: mana regenerates; fuel refills after a pause; health costs may not be fatal;
- magazines and reloads (`reload` event, per-weapon reload sound, ammo pips in the HUD);
- the trait hooks rage, guard (refilling shield) and redirect (damage taken feeds the next attack);
- heroic choice. R is locked until the player picks one, using the cards above the portrait or keys 1 / 2.
  F10 → Heroics sets the rule: from the start (practice, the default) or at team level 10 (HotS).
`combat.ts` gained the matching primitives:
- zones (ticking every 0.25 s), novas, heals;
- summons (lane-minion AI with an owner, lifetime and follow/guard behaviour);
- convert (charmed minions change team, follow the caster and revert);
- splash and on-hit statuses, and parameterised beams.

`Combat.dummies` is rebuilt from `units` every frame, because units can change sides.
Summons reuse the baked crowds. A clone bakes its caster's model, and `{ variant }` bakes any chibi
(Wells calls in Marian). The turret is a procedural `PropModel` (`src/props.ts`). Per-unit tints mark
clones and charmed units, and stunned Nikkes play their `stun` clip.

Verified in Chrome with a GPU (scratchpad harness `kit-check.mjs`):
- All nine heroes cast Q/W/E/R against a clustered wave with no errors.
- Each mechanic was observed: damage, splash, all statuses, shields absorbing, invulnerable dashes, zones, heals, the turret, the clone, the Marian echo, and charms (4 and 3 units).
- Hero switching through F10 prepares summon models.
- 216 units: 115 fps on an RTX 4090.
- Production build passes.

Also verified in Chrome:
- resources: health costs and the fatal-cost refusal, fuel's delay, magazine and reload;
- traits: the guard shield refills after 4 s, redirect stores and releases damage;
- hits: knockback (Kilo's Slug, Crown's Hold the Line), and a cone that hits the front but not behind (Sin's Pressure);
- heroics: the picker, keys and rule, and every R2. Brood Call summons allied Rapture Lures through the lane crowds.

Character Select still shows the Survivors ability text on purpose (user decision). The kit
descriptions show in the in-match HUD tooltips. Numbers are first-pass and unbalanced.

## Front end, character registry and audio (2026-10-24)

**Front end.** The user's other fan game, Survivors of Victory (`_REF/SURVIVORS OF VICTORY - 2026/_PHASER`,
Phaser 4), supplies the menus: disclaimer, lobby, Character Select, Stage Select, Shop, Records,
Achievements and Settings. They live in `src/frontend/`, copied with the same folder layout so their
imports are unchanged. `src/app.ts` is the entry point (`index.html` loads it). It boots Phaser into
`#front-end`. Stage Select's Mission Start calls `deployMatch` (`src/frontend/handoff.ts`). The app
destroys Phaser, sets `?hero=<id>&zone=…&mode=…` and imports `src/main.ts`, which starts the Babylon
match as before. F10 → *Return to lobby* reloads with `?preview=main-menu`.
`?hero=<id>` / `?v=<model>` still open a match directly; `?preview=<scene>` opens a menu screen.
Maintenance/NIPMH and the Survivors gameplay are not ported. Shop, Records and Achievements are ported
as-is (Survivors currencies and records, no MOBA hooks yet). Stage Select's zones and modes are
passed in the URL but do not change the match yet. Menu art/audio/fonts are in `public/assets/`.
Saves use `nikke-moba.*` localStorage keys.

**Characters.** One folder per character in `src/characters/<id>/`:
- `profile.ts`: Survivors card data shown in Character Select (kept on purpose; kits will be based on it).
- `talents.ts`: Survivors talent tree.
- `index.ts`: the MOBA side: NKAS field model and aim mode, outfit skins, weapon sound family, voice lines.

`src/characters/index.ts` is the registry (`CHARACTER_MODULES`, `HERO_VARIANTS`, `heroFromQuery`). The front-end
roster, talent screen, menu voice lines, the match loader (`main.ts`) and match audio all read it.
A character with `model: null` is locked ("NO FIELD MODEL" / "FIELD MODEL PENDING").

| Character | Model | Aim | Notes |
|---|---|---|---|
| Snow White | c220_00 (+ c220_01, c224_00, c471_00 skins) | weapon | |
| Scarlet | c222_00 | head | sword |
| Rapunzel | c221_00 | head | launcher carried sideways, so `muzzle: 'body'` |
| Nayuta | c223_00 | head | ring weapon floats behind her, so `muzzle: 'body'` (shots leave in front of the chest); idle is `idle_eff` (`CLIP_FALLBACKS`) |
| Marian | c260_02 Modernia: Second Affection (+ c260_00, c260_01, c013_00 Marian skins) | weapon | user's choice: Modernia is her default look; `idle_01` is aliased to idle |
| Crown | c330_00 | weapon | |
| Kilo | c361_00 | weapon | mech; both aim modes look the same |
| Sin | c401_00 | weapon | |
| Wells | c302_00 | weapon | borrows the Product 08 minion model (user's choice) |
| Commander | none | – | locked: no chibi exists |
| Cecil | none | – | locked at the user's request (NKAS lists c929_00; not imported or checked) |

Red Hood (c470_00) is hidden: she is not in the registry. Her GLB stays in `public/chibi/`.
Aim modes were checked in-match by measuring gun-tip direction against the target during `shot`
and by screenshots. Kits: see the section above and `docs/KIT_PLAN.md`.

**Audio.** `src/audio/`:
- `sound-bank.ts`: every match cue. Files are recycled Survivors audio.
- `audio-engine.ts`: Web Audio with music and SFX buses, decode cache, per-cue voice limits and minimum gaps, so hundreds of minions stay listenable.
- `match-audio.ts`: maps `Combat.events` to cues. Volume falls off with distance from the camera focus and pans left/right. Cues:
  - hero weapon fire by weapon family;
  - each ability's declared `sound` (weapon, special, dash, beam, heal, summon), plus a voice line on R;
  - minion and Rapture fire, mortars, explosions and Rapture deaths;
  - the team level-up chime (Survivors' `level.wav`);
  - the F10 panel.

  Music is a shuffled playlist of the ten Survivors battle tracks with its loudness offsets. A character's `theme`
  (Snow White, Rapunzel, Nayuta, Sin) opens the match 75% of the time, as in Survivors. Tracks advance when they end, and decoded music is not cached.
- `music-control.ts`: the in-match music player is a single 32px strip attached to the minimap's top rim: track name, previous / play-pause / next, mute, and a thin progress line along the bottom. It follows the map on resize; on narrow screens it extends left to keep all controls and the track name usable. The full title remains available on hover. The compact heroic tray leaves room above it. Matches only; the front end uses its Settings screen. It also builds the F10 menu's Music / SFX volume rows (like the Phaser pause menu). Everything writes the shared audio settings and fires `AUDIO_SETTINGS_EVENT`, so menus, match and Settings stay in sync. `audio-engine.ts` can pause, resume and report progress for the current track.

Gameplay code never plays sounds: it emits `CombatEvent`s (`src/combat-events.ts`) from `combat.ts` and `hero.ts`.
Verified in Chrome with a GPU:
- Full flow: lobby → Character Select (Commander and Cecil locked) → Stage Select → Nayuta match.
- Every playable hero loads with portrait and attacks a Rapture.
- Weapon, minion, explosion, death, dash and burst/voice cues play, and the music control shows the track.
- Return to lobby works.
- No console or page errors. TypeScript and the production build pass.

## Lane minions and recurring waves (latest)

The user's latest direction: all mass-produced Nikkes and the existing Raptures are the
infinitely recurring MOBA wave units, usually called minions or lane creeps. The previous
four fixed Rapture camps and individual five-second respawns have been replaced.

`src/minion-roster.json` contains all nine verified NKAS models: Soldier EG c300_00, Soldier FA
c301_00, Soldier OW c306_00, Product 08 c302_00, Product 12 c303_00, Product 23 c307_00,
iDoll Flower c304_00, iDoll Ocean c305_00, and iDoll Sun c308_00. They are imported into
`public/chibi/`, with raw SDP packs in `raw/`. `npm run minions` rebuilds only this roster;
`npm run chibi` includes these plus the seven hero variants. Mass-produced units are excluded
from F10's hero selector and cannot be selected through a hero variant URL.

`Combat.ready` preloads twelve source models through `src/model-library.ts`, then spawns
nine blue Nikkes (one of each) and nine red Raptures (three of each species). New waves spawn
at both bases every 30 simulation seconds. Assets/textures/materials are shared, while each
unit has its own skeleton, animation groups and state. `Chibi.instantiate` uses that library;
the existing hero `Chibi.load` path remains available. Mesh overlays provide per-unit damage
flashes without mutating shared materials.

`src/enemy.ts` now implements march/chase/windup/recover/dead for both factions. All minions
advance toward the opposite base, acquire visible nearby opponents, use telegraphed ranged
attacks and plan routes around cover. Pelican now borrows Crawler's compatible lower-body walk
at load time because its own SD source has no walk (see the locomotion investigation below).
Nikkes use native run/aim/shot/death clips with the existing facing/muzzle corrections; their
combat stats are shared placeholders, not character-specific weapon kits. The prior measured
Rapture visual lifts (.04/.07/.05) and corrected animation bindings remain intact.

`combat.units` includes both factions; `combat.dummies` remains a red-only targeting API for
hero orders and skills. Friendly Nikkes have no enemy picking metadata. Team-filtered minion
bolts/mortars can hit enemies or the blue hero, with target-life checks preventing old shots
from damaging a respawned hero. Minion defeats award 35 opposing-team XP and increment
`combat.minionKills`; minion defeats do not increment hero takedown counts. Hover the clock
for wave number/countdown. Small blue/coral bars and dots identify minions on the HUD/minimap.

Retired units return their animated meshes/skeletons/groups to a bounded per-model pool, remove
shadow entries, and dispose their local wrappers, ring materials and HUD frames. Gameplay objects
are never reused, so projectiles and targets cannot accidentally refer to a new spawn.
Base structures/victory are not built: minions retire within five units of the enemy base;
a 180-second lifetime also bounds unattended population. They never resurrect in place.

### Navigation and targeting

Both factions and the player now share `NavigationAgent` and the world's `NavigationMap` in `src/navigation.ts`.
The planner caches a one-unit A* grid per body radius, checks full movement segments against
expanded cover circles, and smooths safe routes into waypoints. It preserves routes between
frames rather than alternating obstacle-avoidance directions. Local steering yields around
nearby bodies at 10 Hz; low progress over 0.8 seconds triggers replanning with a two-second
lateral bypass around a stationary crowd. No per-unit crowd navigation maps are built. Grids
are prepared during loading, and expensive A* searches are capped at two per combat frame with
one separate player search reserved before the hero update. Impossible destinations
remain safe and retry at a bounded rate. Collision correction handles coincident centers and
arena boundaries, and separation is rejected if it would push a unit through cover.

Minions evaluate targets every 0.25 seconds, prefer keeping the current opponent, and change
to an alternative only when substantially closer. They retain an occluded target for up to
two seconds and navigate to regain a firing line. Dead/distant targets are released. This is
lane-minion behavior, not strategic hero AI or a reproduction of HotS internals.

Run `node --experimental-strip-types tools/test-navigation.mjs` for rendering-independent
navigation checks. `artifacts/verify-navigation.mjs` exercises real Nikke/Rapture models against
all eleven cover objects, targeting, and recurring waves on the local server at port 5176.
The navigation pass passed 29 isolated scenarios (four unit radii, 60/20 Hz updates,
overlapping/concave cover, moving/blocked goals, stationary crowds, and unreachable paths),
44 routes using live Nikke/Rapture models, target retention/reacquisition, and 180 simulation
seconds across seven waves with no cover overlaps or browser errors. Both teams dealt damage;
27 units remained at the final sample. TypeScript and production bundling passed with the
existing Fluent UI dependency warnings. Evidence: `artifacts/ui/navigation-verification.json`
and `artifacts/navigation-build.log`.

### Baked-animation crowds (2026-10-24, supersedes the per-unit model pool below)

Lane minions no longer own meshes, skeletons or animation groups. `src/crowd.ts` bakes each
minion model once at load (idle/walk/run/aim_idle/shot/death sampled at 30 Hz) into
bone-matrix textures (Babylon `BakedVertexAnimationManager`), folding each part's animated
model-space transform into the bones. Every unit of a model is then one thin instance per mesh
part: one draw per part for all units, in the main, shadow and glow passes. `Dummy` in
`src/enemy.ts` is plain data (position, yaw, scale, clip, clip time) and `Combat.updatePresentation`
culls and queues visible units each frame. Clip facing yaw and gun-tip tracks are baked from
the same rules the hero uses (`aimOffset`, `staticClipYaw`, `clipMuzzle` in `src/chibi.ts`).
Clips switch without crossfades (the hero keeps full skeletal blending). Hit flash is an
instance colour. Selection uses two shared rings, windup telegraphs are thin-instanced
per team, and enemy picking is a ray-vs-cylinder test (`Combat.enemyOnRay`) with
`scene.skipPointerMovePicking`. Minion names/bars are drawn on one HUD canvas
(`Hud.drawMinionBars`); only the hero keeps a DOM unit frame.

Gotchas: a `ThinBatch` never drops to zero thin instances (empty batches are disabled
instead), or Babylon caches the material without instance colour. Baked skeletons are unlinked
from their transform nodes so Babylon skips per-frame skeleton updates.

Measured with the live render loop on an RTX 4090 (headless Chrome, D3D11, vsync off,
1600×900, all units on screen): 108 minions 34 → 87 FPS, 216 minions 16 → 86 FPS; active
animatables 19,215 → 97 (hero only); about 420 draw calls regardless of unit count. Results
vary between runs on a shared machine. A/B screenshots against skeletal copies matched
pose, facing, lift and scale for Nikke and Rapture models.

### Movement stability, pooling and performance (2026-10-24)

The user's report affected all moving units. The previous crowd recovery rebuilt a full
14,641-cell navigation grid per stalled unit. At 216 units the old stress test averaged
305.7 ms per combat update with multi-second stalls; shared prepared grids and budgeted
searches reduce that to 8.3 ms (p95 14.7 ms, worst sampled update 84.2 ms), with zero runtime
grid rebuilds. `src/spatial-grid.ts` reuses buckets for nearby units, targeting and hostile
projectile checks. `src/world.ts` freezes static environment transforms.

`src/main.ts` updates gameplay before Babylon evaluates animations (`onBeforeAnimationsObservable`),
so new clips and blend weights apply to the current skeleton pose. Hero/minion locomotion
uses short idle/run hold times, and minion animation speed follows smoothed movement speed.
The hero's click movement and attack pursuit also route around cover. Offscreen unit roots
are disabled and their animation groups paused; simulation continues. Camera visibility uses
a conservative bounding sphere. `optimizeStaticTracks` removes only channels identical and
constant across every clip (5,079 tracks across the loaded roster), preserving animated channels.

(Superseded by baked crowds above: the model pool was removed.) `src/model-library.ts` pooled up to 32 idle animated instances per model per scene. Release
stops clips, clears completion observers/target metadata, detaches from gameplay wrappers and
restores local transforms. Source geometry, textures and materials remain shared. `src/mesh-pool.ts`
pools bolts (256), grenades (64) and rings (96). These are idle capacities, not active unit limits.
Six wave replacements reused 108 models without increasing mesh/skeleton/group counts; 25
sequential projectile shots created one mesh and reused it 24 times. HUD bars skip redundant writes.

Verification: 29 isolated navigation scenarios, 44 live cover routes, seven waves over 180
simulation seconds, full run-cycle grounding of the hero and all nine Nikke minions, continuous
locomotion without idle/run thrashing, hero cover traversal, stale-target safety, and offscreen
pause/resume passed. Production build passed. The manual browser harnesses must clear both
`onBeforeAnimationsObservable` and `onBeforeRenderObservable` when driving simulation themselves.
Evidence: `artifacts/ui/unit-performance-verification.json`, `artifacts/ui/unit-profile-before.json`,
`artifacts/ui/unit-profile-after.json`, and `artifacts/unit-performance-build.log`. Run the browser
checks with `node artifacts/verify-unit-performance.mjs` while port 5176 is serving the game.
`node artifacts/verify-player-loop.mjs` also passed: the actual application callback carries
the hero around cover with no overlaps or height changes even when the preceding navigation
budget is exhausted. Evidence: `artifacts/ui/player-loop-verification.json`.

The profiler (`artifacts/profile-units.mjs`) measures simulation and animation separately using
headless Chromium/SwiftShader; it does not establish playable FPS. At 216 visible animated units,
skeletal animation remains a substantial CPU cost (about 36 ms in the latest all-visible sample).
That skeletal cost is what the baked crowds above removed.

### Rapture source provenance

These are genuine SD/Outpost Lure bma002, Pelican bmg001, and Crawler mmg005 models from the
installed NIKKE client. Complete UnityFS bundles remain in `raw/outpost-research/`, with
catalog/chunk-store provenance in `inspection.json`. Older `raw/raptures/` battle preview
exports are unused. `npm run raptures` uses UnityPy 1.25.4 under `artifacts/tooling/unitypy`
and writes `public/raptures/*.glb` plus index.json. It preserves textures, skinning, bind poses,
and native dense/streamed/constant animation curves. The toon material is approximated with
matte textured PBR. The installed game is never modified.

Pelican's obsolete bmg001 child tracks must remain unbound, rather than being mapped to its
prefab root; otherwise the entire model tips into the ground. The existing corrected exports
and grounding measurements are preserved in `artifacts/ui/rapture-ground-*`.

## Current UI pass

### Visual and Rapture locomotion investigation (2026-10-24)

The spread-shot enemy is Pelican (`bmg001`). Its source bundle and exported GLB only contain
idle/shot. `addPelicanWalk` in `src/model-library.ts` reuses only Crawler's pelvis/leg walk
channels after checking matching joint names, parents and rest transforms (including equivalent
quaternion signs). Pelican's upper body holds its own pose and its native shot/idle clips remain
intact. Static channels removed before adding the walk are restored where needed so poses cannot
leak between clips. The walk is added before GPU crowd baking, with no runtime skeleton work.
Rapture locomotion speed now follows actual smoothed movement, like the Nikke minions.

The follow-up report also questioned the other enemies. Full baked-skin cycle checks show Crawler
stepping (about 1.11 world units of horizontal foot travel), while Lure's native cycle is much
subtler (about .23). Pelican's borrowed walk produces about 1.24 versus .15 in idle. These are
maximum vertex displacements, not root movement or authored stride lengths. All three select
walk throughout a three-second moving-unit test, with advancing frame indices. Five poses in
every native clip also match a freshly imported untouched GLB to within .001 world units.
Evidence: `artifacts/ui/rapture-walk-audit.json` and the four `rapture-walk-*.png` samples.
Names are visible above minion bars; the concurrent canvas HUD pass caches names as sprites.

The user rejected the initial lighting trial as dark and flat. `src/visuals.ts` now offers
Original, Bright daylight (initial default), and Bright daylight + soft shadows. ACES and the
contrast grade are removed. Sun intensity is 1.65, sky fill .95 with brighter ground bounce,
exposure 1.03 and contrast 1. One shared unshadowed directional light (.55) illuminates only
skinned character meshes; it refreshes when changing heroes. Uniformly matte character materials
are capped at roughness .72 for broad highlights, without changing metallic values. FXAA is a
single direct postprocess; no DefaultRenderingPipeline or extra gamma/image-processing passes.
Soft shadows switch PCF to PCSS at the existing 2048 map resolution. Original restores the
captured light/image settings and original material roughness, with no antialiasing postprocess.
Six switches passed with stable mesh/material counts, no console errors and exact restoration.
Production build passed. Evidence: `artifacts/ui/lighting-verification.json`, `lighting-*.png`,
and `artifacts/visual-quality-build.log`. `lighting-bright-close.png` checks the closer camera.
Browsers used SwiftShader for correctness, not FPS claims.

`docs/visual-quality.html` contains same-camera comparisons, Babylon primary-source links and
prioritized next work: stylized unit materials/rim light, authored terrain normals/roughness,
contact shading and bounded GPU particle effects. Heavy screen-space effects need a separate
performance and baked-animation compatibility check. This is a research/trial pass, not a full
replacement of the original NIKKE toon shaders.

- The user corrected the first styling pass: preserve HotS's large controls, clarity, and layout.
  Remove small decorative text, keep essential information readable, and plan for smaller screens.
- The latest user correction explicitly supersedes the earlier 22%-width main-skill-row target:
  retain HotS silhouettes but make the controls larger. Main buttons are about 108 pixels wide
  at 1920 pixels (previously 84); mount/recall are about 71×65 rather than 54×44. Hotkeys are larger.
  Do not shrink these back to the reference measurement. The thin stepped rail and lateral wings
  remain; mobile controls are enlarged within fit limits. Names/details stay in tooltips.
- ImageGen-created NIKKE-inspired ability illustrations, skill socket, and metal panel texture are
  exported to `public/ui/textures/` as nine WebP files (195,866 bytes total). Originals, complete prompts,
  and export metadata are in `assets/ui-source/`. These replace the earlier SVG skill glyphs and
  plain material fills; graphite, blue, and amber retain the established visual hierarchy.
- The bottom-left portrait uses the actual selected variant's `*_icon.png`, matching the
  top team portrait. It is an image, not the 3D chibi model. `src/portrait.ts` and the second render
  camera were removed; the scene renders through the main camera. Its wide, flat-top hexagonal
  bevel reuses the generated skill socket rotated in CSS. Low, sloped health/mana bars extend
  from its right side and carry their values directly. The resource frame, tracks and fills now
  share one -22° skew and a uniform 3px inset; only their text is counter-skewed. This replaces
  differently sized polygon masks that left the bar fills misaligned with the outer frame.
  Long names ellipsize, with a full-name title.
- The latest top-bar correction removes skew from individual portrait frames to eliminate empty
  side wedges. Portraits now use rectangular cover windows with 1.07× overscan; angles are confined
  to outer rail caps. The custom `public/ui/match-crest.svg` frames large team levels and a timer.
  The user found the oversized black XP sockets and central takedown numbers/crossed swords
  confusing. Those sockets and counters are removed; XP is now shown by thin tinted rails below
  the levels. The gameplay counters remain in Combat, but have no duplicate-looking center UI.
  The next correction moves level numerals up to the optical center of the colored panels and
  increases them by about one third (32–62px, weight 700). Portrait phones use a wider crest so
  two-digit levels fit beside the clock. Evidence: `artifacts/ui/level-centered-{desktop,phone}.png`.
  Narrow portrait phones collapse unused slots after the second slot, preserving useful width.
- The bottom-right minimap has a wide, lower footprint, sharp square corners, and a complete light
  silver/blue-gray bevel matching the HUD. The user rejected curved corners and the dark thin edge.
  The rim remains outside playable ground; cyan/coral markers and map coordinates are unchanged.
- Portrait, map, and score rims now continue around every diagonal corner. Their outer silhouettes
  surround inset content; do not reintroduce rectangular borders clipped off by polygon corners.
- F10 opens Settings, including controls, camera, variant, clips and Inspector. F10/Esc or the
  close button dismisses it. Opening Settings clears held movement/attack input and targeting.
  Settings are scrollable at smaller sizes, with debugging controls collapsed by default.
- Frame-width container queries maintain skill/menu targets of at least 44 CSS pixels. All seven
  skills stay in one row, including low lateral mount/recall wings. At landscape widths up to 760
  pixels and on portrait screens, portrait/map sit above the skills. Narrow portrait phones fill
  the viewport; desktop and landscape retain 16:9–21:9 limits.
  Feedback respects `prefers-reduced-motion`. Tooltips clamp to the frame and dismiss on resize.
- This is responsive UI work, not a complete touch gameplay scheme. Keyboard/right-click controls
  remain; do not describe touch movement as implemented.
- References supplied by the user: [NIKKE UI portfolio](https://www.behance.net/gallery/214653473/GODDESS-OF-VICTORY-NIKKE-UI-2024)
  and [animated portfolio](https://www.artstation.com/artwork/Ovw9vv).

## Environment art pass

The user selected **overgrown NIKKE ruins with a readable MOBA lane**. `src/environment.ts`
replaces test pillars with broken concrete walls, metal supports/service panels, rubble, moss,
saplings and low foliage. Obstacles share the existing movement and sight-blocking circles,
with three added cover positions near the starting area. Perimeter structures stay outside
the playable bounds. Painted terrain and worn amber road fragments define the open diagonal lane;
the minimap now uses the terrain art. Fog and lighting use restrained cool-green ruin colors.

The user then rejected the unpainted trees/props and blurry ground. Four additional assets were
generated with built-in ImageGen: `paving-tile`, `forest-floor-tile`, `foliage-atlas` (RGBA) and
`prop-material-atlas` (bark / weathered metal). WebP exports in `public/environment/` total
2.21 MB at their original 1254×1254 resolution. Originals, exact prompts and export/path metadata
are in `assets/environment-source/painted-props-{prompts,assets}.json` and sibling PNGs.
Re-export with `python tools/export-environment-art.py` (Pillow); it preserves dimensions/alpha.

`src/foliage.ts` replaces solid icosphere canopies and triangle grass with 3D branching trunks,
painted bark, curved instanced leaf cards, ferns and ivy. Alpha testing preserves leaf silhouettes
and shadows without transparent-quad sorting; receiveShadows belongs on source meshes, not
instances. UV bounds match the delivered atlas, including its slightly wider fern quadrant.
Service cabinets use the metal half of the material atlas. Ruin caps now have their own planar
UVs to avoid radial texture stretching. Collision positions remain unchanged.

`src/terrain.ts` uses a StandardMaterial plugin to blend paving/moss in world space with an
uneven verge. Each texture repeats over 6 meters (~209 pixels/meter), replacing the 140-meter
stretched map (~9 pixels/meter). Broad tone variation, rotated moss samples, mipmaps and 16×
anisotropy support camera motion/close zoom. The old ground-detail packing code was removed;
`outpost-ground.webp` is now only the minimap overview. `ruin-concrete.webp` remains on props.

The Reddit workflow (linked in README) is blockout → screenshot paint-over → camera projection.
Its author demonstrates disocclusion artifacts with camera motion. This pass instead uses stable
surface UVs and real geometry because the game pans, zooms and changes camera pitch. It is a first
environment art pass, not a finished map or a fixed-camera projector implementation.

## Run
```
npm install
npm run chibi   # downloads NKAS packs -> public/chibi/*.glb + index.json + *_icon.png (git-ignored)
npm run dev     # http://localhost:5173  (?v=c471_00 picks a variant)
npx tsc         # type-check (TypeScript 7); npm run build also works
```

## How the models work (short version; details in README.md)
- Source: NKAS (nkas-chibis.pages.dev/packs/<id>.sdp, manifest.json). Boom Arena uses the same files.
- `tools/sdp.mjs` converts the SDP1 format into a standard GLB with glTF animations
  (Unity LH -> glTF: pos (-x,y,z), quat (x,-y,-z,w)) and fills unanimated bones with rest pose.
- It also measures per-clip **head yaw**, **gun yaw**, and the **gun tip** (joint + local offset,
  usually `Bip001 Prop1`). `src/chibi.ts` uses these to turn each clip so it faces forward
  (NIKKE clips face the camera or face away) and to spawn projectiles from the barrel tip.
  Verified numerically: forward within 2°, muzzle 0.000 from the rendered gun tip.

## Files
| File | Role |
|---|---|
| src/app.ts | entry: Phaser front end, or a match when the URL has ?hero= / ?v= |
| src/frontend/ | Survivors of Victory menus (Phaser 4); handoff.ts is the deploy boundary |
| src/characters/ | registry + one folder per character (profile, talents, model/audio) |
| src/audio/ | sound bank, Web Audio engine, match audio (combat events → cues), minimap music strip |
| src/crowd.ts | baked-animation thin-instance crowds for lane minions |
| src/combat-events.ts | gameplay → presentation event types (Combat.events) |
| docs/KIT_PLAN.md | kit systems, current kits per hero, what is still missing |
| src/abilities/ | ability types, effect runner, statuses, shared slots, prototype fallback kit |
| src/characters/<id>/kit.ts | that hero's kit (data only) |
| src/props.ts | procedural PropModels (the deployable turret) |
| src/sector.ts | flat pie-slice mesh shared by cone indicators and cone hits |
| src/main.ts | wiring: frame layout (desktop/landscape aspect limits, narrow portrait viewport), input (HotS / WASD schemes, cast modes, A-move), picking, menu, loop |
| src/hero.ts | orders (move/attack/attack-move) vs states (attack/cast/channel/dash/mounting/hearth/emote/dead); reads its kit, runs casts through src/abilities |
| src/combat.ts | ability primitives (bolts, lobs, beams, zones, novas, heals, summons, convert), hostile attacks, hit resolution, team progression |
| src/enemy.ts | team-aware lane minions, native animations, windups, movement and disposal |
| src/model-library.ts + src/minion-roster.json | shared model sources, independent instances, nine-model Nikke roster |
| src/environment.ts | ruin geometry, painted service cabinets, lane details and plant placement |
| src/foliage.ts | branching trunks, instanced painted leaf/fern/ivy cards, atlas UVs |
| src/terrain.ts | world-space paving/moss blend with 6-meter texture repeats |
| public/environment/ + assets/environment-source/ | generated environment textures; original PNGs, prompts and asset metadata |
| src/hud.ts + index.html + src/style.css | responsive HotS-style HUD, NIKKE palette, illustrated variant portrait, large hex skills; frame-width container queries |
| public/ui/textures/ + assets/ui-source/ | runtime WebP UI art/materials; full-resolution originals, prompts, export metadata |
| src/minimap.ts | bottom-right tactical canvas minimap: left-click/drag to look, right-click to move |
| src/camera.ts | MOBA camera; pitch follows zoom; presets |
| src/targeting.ts | ability indicators (line / circle / dash / attack range) |
| src/world.ts | arena, lights, shadows, glow (main camera only), BLUE_BASE/RED_BASE |

## Validation

HUD detail correction: production build (including TypeScript) passes. Headless Chromium visual
checks covered full, 57% HP / 42% mana, and empty resources, two-digit team levels, XP progress,
and desktop / landscape / portrait layouts down to 320px. No page or console errors occurred.
Evidence: `artifacts/ui/hud-detail-before-*`, `hud-detail-after-*`; build log
`artifacts/hud-detail-build.log`. Earlier counter/socket and resource-shape screenshots are superseded.

Latest minion-wave pass: TypeScript and the Vite production build pass (existing upstream
Fluent UI directive warnings remain). `artifacts/verify-minions.mjs` passes against the
production preview at port 5177. All nine Nikke GLBs validate with zero errors/warnings;
idle/run/aim/shot/death clips show finite animated skinning, with sampled living poses above
ground. The browser verifies all nine models, the seven-option hero selector, friendly-fire
and picking exclusion, seven scheduled waves over 180 simulation seconds, kills and team XP,
and unchanged hero takedowns from minion combat. Five complete destroy/recreate cycles retain
constant scene mesh/skeleton/animation/material/texture counts after settling. Real mouse and
keyboard input verifies hero basic attacks plus Q/E/R against a Rapture; dead-unit HUD frames
are removed. No page errors, console errors, or HTTP failures were recorded.
Evidence: `artifacts/ui/minions-verification.json`, `minions-first-look.png`, and
`minion-waves-battle.png`. The test script uses Playwright from the sibling NIKKE POKEMON
project; start `vite preview --port 5177`, or set TEST_URL to another production preview.
A final compatibility build after concurrent terrain/navigation/HUD edits also passes
TypeScript and production bundling. `artifacts/check-minion-integration.mjs` verifies the
latest build through three waves, both teams dealing damage, finite positions, and HUD frame
counts matching current units, with no runtime/resource errors. Evidence is
`artifacts/ui/minion-integration.json` and `minion-waves-latest.png`.
The battle screenshot is from manual simulation (its HUD clock is not advanced); the first-look
screenshot is from the live rendered game. Earlier camp-behavior tests below are historical
and do not describe the new wave rules.

Painted foliage / ground-resolution correction: `npm run build` passes, including TypeScript,
with the existing upstream dependency bundling warnings. `artifacts/verify-painted-environment.mjs`
passes against the current game: both terrain textures are 1254×1254, repeat every 6 meters and
use 16× anisotropy; the old solid canopies are absent; 9 branching trees use 135 leaf cards, with
428 fern cards plus ivy. The atlas has real alpha and the material uses alpha testing. Classic,
low-angle, closest-zoom and phone screenshots were inspected. Rendered-pixel checks pass with
no page/console errors or missing assets. Only the test's readPixels calls produce GPU stall
diagnostics in SwiftShader. Report: `artifacts/ui/painted-environment-verification.json`;
screenshots: `painted-environment-{classic,tree,low,ground-close,phone}.png` in that directory.
Build log: `artifacts/painted-environment-build.log`. Older environment screenshots below show
the superseded stretched ground and unpainted foliage.

Combat / top HUD / ruins pass: `npm run build` (including TypeScript) passes. Existing upstream
Fluent UI bundling warnings remain. `artifacts/verify-combat-pass.mjs` passed in Chromium with
no page/console errors or missing resources. It checks all three attack types and their native
animations, pursuit vs stationary behavior, camp return/healing, dodging, recall interruption,
hero death/respawn and stale-projectile cleanup, cover, real right-click attacks against a moving
enemy, kill XP, enemy death/respawn, team level/XP display, and top-bar layouts at 1920×1080,
1280×720, 844×390, 390×844 and 320×568. It also reads rendered terrain pixels and verifies outward
ruin normals to catch material/geometry failures that don't raise JavaScript errors.
Evidence: `artifacts/ui/combat-art-verification.json`, `enemy-*-windup.png`, and `combat-art-*.png`.
Final texture tiling and visual checks are in `artifacts/preview-environment.mjs`,
`artifacts/ui/outpost-final.png`, `outpost-phone-final.png`, and `environment-low.png`.
Build log: `artifacts/combat-art-build.log`. Both browser scripts use the sibling NIKKE POKEMON
project's Playwright install and this session's dev server port 5175; adjust for a new session.

Earlier Outpost Rapture replacement (before AI): all three GLBs pass Khronos validation with zero errors and zero
warnings. Headless Chromium checked every exported animation at five poses for finite, bounded
skin deformation and visible motion. Real mouse/keyboard checks passed for each species:
body selection, basic attacks, Q (40 damage), E (35 damage), R kills, score increments,
dead-target exclusion and three-second respawns restoring 300 HP, full scale and idle animation.
Repeated basic attacks also passed. TypeScript and the production build pass; existing upstream
Fluent UI bundling warnings remain. No page errors or missing asset responses occurred.
Evidence: `artifacts/ui/raptures-verification.json`, `artifacts/ui/raptures-arena.png`,
`artifacts/*-validation.json`, and `artifacts/raptures-build.log`. The browser harness is
`artifacts/verify-raptures.mjs` (uses the sibling NIKKE POKEMON project's Playwright install).

Rapunzel/Scarlet addition: `c221_00` and `c222_00` each have 15 animation clips and no missing
bones; both pass glTF validation with 0 errors and 0 warnings. TypeScript and production build pass.
Headless Chromium verified both portraits, right-click movement, basic attack damage, Q/R animation
flow, mount/recall completion in equipped idle poses, and switching through Snow White. Measured
head direction during the burst was within 2° (Rapunzel) and 8° (Scarlet) of the target; rifle
correction would have turned them about 81° and 178° away. No runtime errors or missing-clip warnings.
The loader now honors source `extras.disabled` for mesh visibility: Scarlet's two helper blocks
(`Bone068`, `Bip001 L Hand001`) stay hidden while the skin, sword and animation hierarchy remain intact.
Evidence: `artifacts/ui/rapunzel-scarlet-verification.json` and the `rapunzel-*` / `scarlet-*` screenshots.

Red Hood addition: `c470_00` has 15 animation clips, no missing bones, and passes the Khronos
glTF validator with 0 errors and 0 warnings. TypeScript and the production build pass (existing
Fluent UI dependency warnings remain). Headless Chromium verified the model and portraits,
right-click movement, Q and R animations, mount/recall completion, and switching Snow White → Red Hood,
with no runtime errors or missing-clip warnings. Screenshots are in `artifacts/ui/red-hood-*.png`.
Mount and recall now use `idle`: Red Hood's dialogue pose (`talk_idle`) parks her rifle on the ground.
Both characters still share the existing test kit; Red Hood has no separate ability balance yet.

The latest larger-HUD correction passes TypeScript, the production build, and fresh headless
browser layout and interaction checks. Existing dependency bundling warnings remain. Screenshots
cover the then-full top-portrait image, larger ability controls, and the minimap's sharp light bevel.
Tested frames: 1920×1080, 1280×720, 1024×576, 844×390,
812×375, 740×360, 667×375, 640×360, 568×320, 390×844, 320×568, 768×1024 and 2560×1080.
All panels and skills remain inside the game frame without overlap, with portrait left and minimap
right. Skill/menu targets are at least 44 CSS pixels; resource text is at least 14 pixels and hotkeys
at least 16 pixels. Checks also passed for small-screen tooltip bounds, settings focus wrapping
(including the closed debug summary), Red Hood switching, Q cooldowns, touch W selection plus
ground-tap casting, menu taps and absence of sticky touch tooltips. There were no page errors.
Touch casting checks do not imply that touch movement is implemented. Current interaction/layout
evidence is in `artifacts/ui/large-hud-verification.json` and `large-hud-*.png`. The earlier `shape-*`,
`textured-*`, `hots-*`, and `hud-*` artifacts record superseded styling passes. The preceding textured pass
passed TypeScript and the production build, with existing upstream Fluent UI bundling warnings.

The earlier NIKKE pass passed TypeScript, the production build, and headless Chromium checks for
portrait switching, ability targeting/cooldowns, settings input, minimap clicks and reduced motion.
The build retained third-party Babylon Inspector / Fluent UI directive and bundle-size warnings.
Those earlier HUD checks did not resolve the older auto-attack issue recorded below.

Earlier, before the NIKKE UI pass, headless Chromium + Playwright with real mouse/keys verified
aspect lock at 16:10 (letterboxed), 21:9 and 3:1 (pillarboxed), plus the then-current HUD and F10 menu.
Right-click on a dummy's body targets it (mesh picking). Tested: Q hits, E hits, W dash moves 6,
Z mounts after 1 s, B hearth teleports to (-50,0,-50) after 6 s, menu open/close.

## Known issues / next steps
1. **Historical auto-attack issue:** an older test fired only once in 5 s. This did not reproduce
   in the fresh Outpost Rapture checks: repeated attacks connected. No hero logic changed in this pass.
2. In the same test, "mounted move" moved 0. The right-click probably landed on a HUD panel (test artifact).
   Re-test with a click point in open ground.
3. Team levels/XP now work; stat scaling and the talent tray (HotS tiers 1/4/7/10/13/16/20) remain unimplemented.
4. The user offered a HotS install at `H:\Games\Heroes of the Storm` for reference. The suggested tool
   (github.com/morluto/rea) is a binary reverse-engineering MCP server, NOT a CASC extractor, and it
   was not installed. The current HUD uses original geometry and generated art/materials following
   HotS layout/readability with NIKKE-inspired styling.
5. Ideas: run-and-gun (Babylon AnimationGroupMask, upper body), towers/cores and lane balance, networking.
6. Kits: still missing are talents mapped to HotS tiers, unit targeting (ally heals, true executes),
   basic-attack shapes (beam, pellet cone, spin-up), and painted icons (glyph tiles stand in). See docs/KIT_PLAN.md.

## Testing tips (learned the hard way)
- `window.game` is the canvas element (id="game") until the game finishes loading. Wait for `window.game.hero`.
- Use `window.game.toScreen(x,y,z)` for screen positions from the main camera. The old portrait
  camera no longer exists.
- HUD panels intercept clicks. Pick points in open ground, or hide #menu first.
- Headless SwiftShader renders ~10-12 fps, and dt is capped at 0.05 s, so game time runs at ~0.5x real time.
- A Playwright harness exists in the session scratchpad only (not in the repo). Recreate it if needed.
- In shell tools, always use absolute paths. `cd` into node_modules once caused a write to the wrong package.json.

## Legal
NIKKE assets © SHIFT UP / Proxima Beta, via NKAS (archival use; no redistribution licence). Private fan
prototype only. `raw/` and `public/chibi/` are git-ignored.


## In-game UI art direction: HotS restoration (2026-10-24, latest)

The user explicitly preferred the earlier Heroes of the Storm HUD and requested a full return
to that direction. Their attached battle reference shows substantial silver bevels, illustrated
hex skill buttons, dark blue inset panels, glossy resource bars, and enclosed UI groups. This
supersedes the flat NIKKE / Survivors experiments. Do not simplify these buttons or frames again
without a new request.

- Restored `src/hud.ts` and `src/minimap.ts` from the snapshots taken before the redesign.
  Painted skill sockets, illustrated kit/utility icons, portrait bevels, heroic tray and the
  full minimap bevel are active. Abilities without illustrations keep their original glyphs.
- Removed the flat theme import and the two experimental source files under `src/ui/`.
  Archived copies are in `artifacts/ui/hots-restored/`.
- `src/style.css` retains the original framing, gradients, layout and size. The top squads now
  use metal rails and a beveled crest to match the restored style. Core health retains its
  aligned grid placement and a painted frame; narrow phones abbreviate protected core labels.
- Gameplay, character kits, portraits, menus and controls are unchanged.

Build and visual/interaction verification: `artifacts/ui/hots-restored/verify.mjs`,
`verification.json`, and screenshots. This covers six viewport sizes, heroic choice, tooltip,
cooldown/low resource states, F10, loaded art, and Rapunzel's heroic portrait.


## HUD highlights and closed top frames (2026-10-24)

The user asked for more of the brightness in `artifacts/genre-switch-mockups/2026-10-24/index.html`
and identified clipped sides in the angled top panels. Preserve the restored HotS artwork and shapes.

- Brighter cyan/green resource fills, silver socket highlights, blue glyph lighting and a modest
  brightness/saturation lift on existing art. Heroic panels and the music strip have richer blue fills.
- `src/ui/top-frames.ts` replaces the top rails/crest CSS clipping with complete SVG polygons.
  Parallel edge offsets create uniform rims; angle width derives from actual panel height, and
  the content has a matching safe inset. ResizeObserver updates decoration without changing layout.
- Squad slot responsive selectors use `nth-of-type` so decorative SVG nodes do not affect collapse.
- `artifacts/ui/hud-polish/verify.mjs` checks six viewport sizes, all three top panels' closed paths,
  actual content containment, no parent clipping, HUD overlap/alignment, controls and art loads.
  `verification.json` and full-screen/cropped screenshots record the passing result.

## Filled top-frame wedges (2026-10-24)

The user identified empty wedges beside the level cells and outer squad portraits.
`top-frames.ts` now wraps each panel's contents in a layer clipped to the same inset
polygon as its metal frame. CSS extends the outer portraits and level backgrounds into
those wedges; counter-padding preserves the level text and XP positions. The last
visible enemy slot is selected again on resize so collapsed phone rows also fill the end.

Build passed. `artifacts/ui/hud-angle-fill/` contains desktop and five smaller top-row
captures plus checks for readable label bounds, valid frame geometry and the correct
visible end slot. All six layouts passed with no browser errors.
