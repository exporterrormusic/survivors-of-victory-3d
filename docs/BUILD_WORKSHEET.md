# Build worksheet: from the test range to the mockups

2026-10-25 · Target: the game shown in
[docs/concepts/game-plan-2026-10-25/index.html](concepts/game-plan-2026-10-25/index.html)
(41 images). Spec: [GAME_PLAN.md](GAME_PLAN.md). This file splits the work into tasks that
several AI agents can take at the same time.

**How to use it.** The user assigns task IDs. Each agent reads §1–§3, then its own task card
in §6, claims the task in the tracker (§5), does it, verifies it, and marks it done.

---

## 1. Read before you start

- **The spec is [GAME_PLAN.md](GAME_PLAN.md).** The mockups show the look. Where they
  disagree, the plan wins (see §1.2).
- **Mockups:** open the PNGs your card lists, in `docs/concepts/game-plan-2026-10-25/`.
  [BRIEF.md](concepts/game-plan-2026-10-25/BRIEF.md) has the exact HUD strings, the colour
  language and descriptions of the recurring objects (lift, tower, crates, nest).
- **Current state:** the top section of [STATUS_AND_HANDOFF.md](../STATUS_AND_HANDOFF.md)
  ("Game-mode foundation") describes `src/survivor/mode/`, which most tasks build on.
- **Play the current sortie:** `?run=test-range&mode=sortie` (options `alert=`, `grace=`, `seed=`).

### 1.1 The user's standing rules

These come from earlier feedback. Breaking them gets work rejected.

- **HUD:** keep the approved flat HUD (`src/survivor/hud.ts`, `survivor.css`, `hud-frames.ts`).
  Large panels have square corners. Small controls have paired corner cuts with detached
  L-brackets. In the HUD, gold is only for Burst and progress. Icons are simple white SVG
  silhouettes; the user rejected generated illustrations for HUD icons.
- **Full-screen menus** (sector map, results, loadout, bestiary): use the `menu-style.jpg` look
  (in the mockups' `references/` folder): dark navy panels, thin cyan lines, gold highlights.
- **No NIPMH in the first version.** The code stays, switched off in `src/features.ts`, because it
  may come back. Don't build NIPMH features. The Shop sells character unlocks only.
- **Landscape only** (16:9 and 21:9). Size UI against the `#frame` game container (cqw/cqh), not
  the browser viewport. No portrait layouts.
- **Nothing written over enemies or characters.** Health bars only. Heavies get a thicker
  armoured bar. Only bosses are named, in the top boss bar. Show statuses as VFX on the model.
- **No XP gems and no "choose 1 of 3" level-up cards.**
- **Snow White** always faces the cursor. Shots and Burst come from the real gun tip. No dash
  sound, no torso lean.
- **Never punish playing.** Threat rises with time only. Searching and fighting give power or
  lower the pressure. Exits are places you reach, never a lift you call and wait for.
- **Maps err bigger.** Measure in seconds of travel at the real camera. Graybox before art.
- **Audio:** enemy attack sounds, the turret deploy sound and the Rapture death sound were
  removed on purpose. Ask before adding any sound.
- **Enemies:** use only the 22 Raptures, in their GAME_PLAN roles. Don't invent enemy types.
- **Water:** puddles, lakes and deep unwalkable water were rejected. The wet look is a floor shader.

### 1.2 Mockup mistakes: don't copy these

The image generator got these wrong. Each image's review notes in `index.html` list the rest.

- Alert has **5** pips. Several images show six or seven.
- Chevrons appear **only** in charge lanes. Sinister's cannon lane and Cucumber's carpet strip
  have none.
- Heavy bars are armoured red. Gold trim is only for a Hunter.
- In Z03 the Sentry is drawn as a friendly cyan turret. It is an enemy firing red bolts.
- Hard Hat's hatch is on its front, not its top.
- Objective text like "TEST RANGE", "ELIMINATE RAPTURES" or "REACH THE LIFT" in E01, H01–H04 is
  filler. Use the job strings from the brief ("SALVAGE RUN · CRATES 1/4").
- Pelicans and Hard Hat are drawn oversized. Use GAME_PLAN §6 sizes.

## 2. Working alongside other agents

Other agents and Codex edit this repo at the same time.

1. **Claim first.** Put your name and `in progress` in the tracker row before you start.
   One agent per task.
2. **Re-read a file right before editing it.** Keep edits small and don't reformat code you
   aren't changing.
3. **Hotspot files** are shared by many tasks. Add a narrow hook there (a registry entry, a
   callback, one call) and put your logic in new files:
   - `src/survivor/main.ts`
   - `src/survivor/mode/sortie-mode.ts`
   - `src/survivor/mode/sortie-hud.ts`
   - `src/survivor/mode/behaviors/index.ts` (the role registry: add one line per role)
   - `src/survivor/hud.ts`
   - `src/survivor/player.ts`
   - `src/survivor/mode/roster.ts`
   - `src/frontend/profile/ProfileStorage.ts`
4. **Don't break:**
   - `?run=test-range` (the sandbox)
   - `?run=test-range&mode=sortie`, which `artifacts/verify-sortie.mjs` drives
   - the archived MOBA (`?hero=<id>`)
5. **Before renaming or removing anything, grep `tools/` and `artifacts/` as well as `src/`.**
   - Node tests load `enemy-attack.ts`, `talents.ts`, `capstone-loadout.ts`, `snow-field.ts`
     and `snow-navigation.ts` as text. Don't add runtime imports to those files.
   - About 50 `artifacts/*.mjs` scripts read `window.game` internals.
6. **Verify:**
   - `npm run typecheck`
   - `npm run test:sortie`
   - a Node test for any engine-free logic (pattern: `tools/test-sortie.mjs`)
   - a browser script in `artifacts/` that drives `window.game` with fixed frames (pattern:
     `artifacts/verify-sortie.mjs`). Save screenshots to `artifacts/ui/<task-id>/` and compare
     them with the mockup.
   Browser checks use playwright-core from `../NIKKE POKEMON/node_modules` with system Chrome.
   Run your own Vite server with HMR off, because other agents are editing files.
7. **Finish:**
   - Set the row to `review` if the user needs to approve visuals, otherwise `done`.
   - Add a short dated section to the top of STATUS_AND_HANDOFF.md.
   - Commit only when the user asks.

## 3. Where things stand

| Area | Today |
| --- | --- |
| Menus → game | Stage Select deploys to the test-range sandbox (`mode=stage_1`). The sortie is reachable only by URL. "Return to Ark" restarts at the disclaimer |
| Saving | Nothing from a run is saved: level, SP, ranks and loot all reset |
| Sortie loop | Built in `src/survivor/mode/`: Alert 1–5, spawn director with pulses, sites, exits and the 8 s gate cycle, carried/banked ledger, field kits, the Salvage Run job, Hunters, basic results. It runs on the 68 m round plaza with box placeholders |
| Enemies | All 22 models converted with roster stats. Own behaviors for Lure, Pelican, Capra and Solaris; the other 18 use a generic charge-and-bolt attack. Flat 40 XP per kill |
| Tells | Filling circle and chevron lane (`telegraph.ts`) |
| Sortie HUD | ALERT pips, objective with carried salvage, field-kit row, banner, edge markers for exit, tower and Hunter (`sortie-hud.ts`) |
| Player | 50 HP, takes damage, dies. Dash is invulnerable for its whole 0.3 s with no cooldown |
| Maps | One round plaza. 26 kit-v1 props (×3 finishes) and a sakura tree exist, with no collision |
| Weather | Snow (banks, footprints, slowdown), storm with lightning, petals, wet ground. Ready for the zones |
| Progression | The A02 ability-rank roadmap works in Tab but isn't saved. Account upgrades, Pristine Cores, NIPMH and records exist in the Phaser front end (`src/frontend/`); the survivor runtime ignores them |
| Not built | Real maps, collision, line of sight, bosses, zones, followers, nests, sector map, loadout screen, bestiary, region/war map, lift ride, operation chain |

## 4. Decisions for the user

Tasks that depend on one of these say so. **Wave 1 doesn't need any of them.**

| # | Decision | Blocks | Default if not decided |
| --- | --- | --- | --- |
| Q1 | **World structure** (W01–W09; GAME_PLAN and WORLD_OPTIONS recommend persistent regions) | WORLD-*, TRIP-2, LOOP-5's lift picker | Build everything else first |
| Q2 | **Dash:** keep it chainable with no cooldown, or add a cooldown or two charges | FIGHT-4 tuning | Leave it as it is |
| Q3 | **HP between trips:** 30% heal plus paid repairs, or a full heal | TRIP-1 | 30% plus repairs |
| Q4 | **Account upgrades** (ATK/HP/SPD/CRT/XP) bought with Core Dust, as U01 shows | META-2 | **Parked 2026-10-25:** the user wants to revisit the upgrade/loadout concept |
| Q5 | **NIPMH modules as owned gear,** equipped before going up, as U01 shows | META-3, the LOOP-5 gear panel | **Decided 2026-10-25:** no NIPMH in the first version (it may come back; switched off in `src/features.ts`) |
| Q6 | **Rapture review:** any model rejected on `/tools/review/rapture-review.html` passes its role to another | FIGHT-5…19 | Use the plan's assignments |
| Q7 | **Approve the 160 m graybox** after playing it | MAP-7, MAP-8 | — |
| Q8 | **Leaving from the pause menu mid-sortie:** count it as a defeat (carried loot lost)? | LOOP-3 | **Decided 2026-10-25:** counts as dying (XP kept, carried loot lost) |
| Q9 | **The [M] sector map screen** (S03) is in the mockups but not in GAME_PLAN. Build it? | SORTIE-4 | Build it |
| Q10 | **Cocytus's ice holes** are unwalkable water, which was rejected elsewhere. Allow it for this boss? | BOSS-4 | Ask before building |
| Q11 | **Should the test range save XP?** | LOOP-2 | **Decided 2026-10-25:** no, it stays a sandbox |

## 5. Tracker

Status: `todo` · `in progress` · `review` · `done` · `blocked` · `parked` (don't start: the user is rethinking the concept) · `cut (v1)` (not in the first version). Sizes: **S** (one short
session), **M** (one full session), **L** (several sessions; split it if you can).

| ID | Task | Needs | Size | Wave | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| LOOP-1 | Save the NIKKE's progress and the bank | — | S | 1 | Claude | done |
| LOOP-2 | Survivor runtime loads and saves progress | LOOP-1 | M | 2 | Claude | done |
| LOOP-3 | Stage Select deploys into a sortie | — | S | 1 | Claude | done |
| LOOP-4 | Results screen to match S07 | LOOP-2 | M | 2 | Claude | review |
| LOOP-5 | Loadout screen (U01) | LOOP-1, Q4, Q5 | M | 2 | | parked |
| FIGHT-1 | Split behaviors into one file per role | — | S | 1 | Claude | done |
| FIGHT-2 | Enemy projectiles and ground hazards | — | M | 1 | | todo |
| FIGHT-3 | Complete the tell language (§6, E05) | — | S | 1 | | todo |
| FIGHT-4 | Player hits, statuses and death | FIGHT-2 | M | 2 | | todo |
| FIGHT-5 | Finish the horde (Crawler, polish the other four) | FIGHT-1, 2, 3 | S | 2 | | todo |
| FIGHT-6 | Phalanx and the shield-wall hook | FIGHT-1 | M | 2 | | todo |
| FIGHT-7 | Cube (spotter) | FIGHT-1, 3 | S | 2 | | todo |
| FIGHT-8 | Seahorse (sniper) | FIGHT-1, 2, 3 | S | 2 | | todo |
| FIGHT-9 | Tripod (mortar) | FIGHT-1, 2, 3 | S | 2 | | todo |
| FIGHT-10 | Hanged Man (diver) and flyer rules | FIGHT-1, 3 | M | 3 | | todo |
| FIGHT-11 | Penetrator (gunship) | FIGHT-10 | M | 3 | | todo |
| FIGHT-12 | Twin Tail (skirmisher), bake `shot2` | FIGHT-1, 2, 3 | M | 3 | | todo |
| FIGHT-13 | Sentry (emplacement) | FIGHT-2, 16 | M | 3 | | todo |
| FIGHT-14 | Tail Bone (spinner) | FIGHT-1, 2 | S | 2 | | todo |
| FIGHT-15 | Squid (jammer) | FIGHT-2, 4 | M | 3 | | todo |
| FIGHT-16 | Heavy chassis and Hard Hat (H01) | FIGHT-1, 2, 3 | M | 2 | | todo |
| FIGHT-17 | Thermite (H02) | FIGHT-16 | M | 3 | | todo |
| FIGHT-18 | Cucumber (H03) | FIGHT-16 | M | 3 | | todo |
| FIGHT-19 | Loud Mouth (H04) | FIGHT-16, 4 | M | 3 | | todo |
| FIGHT-20 | Hunter look (S08) | FIGHT-16 | S | 3 | | todo |
| FIGHT-21 | Spawn director to §9 | FIGHT-1, MAP-1 | M | 3 | | todo |
| FIGHT-22 | Kill XP per type, zone scaling | — | S | 2 | | todo |
| FIGHT-23 | Performance at 200–300 alive | FIGHT-21 | L | 3 | | todo |
| MAP-1 | Map framework (replaces the plaza constants) | — | M | 1 | | todo |
| MAP-2 | Collision and navigation around props | MAP-1 | L | 2 | | todo |
| MAP-3 | Cover and line of sight | MAP-1 | M | 2 | | todo |
| MAP-4 | Camera occlusion fade and interiors (Z03) | MAP-1 | M | 3 | | todo |
| MAP-5 | Graybox Ark Outskirts, 160 m | MAP-1, 2, MAP-6 | M | 2 | | todo |
| MAP-6 | Site-slot shuffle (engine-free) | — | S | 1 | | todo |
| MAP-7 | Map edges and skyline | MAP-5, Q7 | M | 3 | | todo |
| MAP-8 | Ark Outskirts art pass | MAP-5, Q7, ART-1…4 | L | 3 | | todo |
| ART-RANGE | Themed Test Range dressing: lighting, wind, solid collision and AI routing (visual review) | kit-v1, sakura-v1 | M | 1 | Codex | review |
| ART-1 | Arrival lift | — | M | 1 | Codex | review |
| ART-2 | Lift tower, dormant and restored | — | M | 1 | | todo |
| ART-3 | Search props (crates, canister, terminal…) | — | M | 1 | | todo |
| ART-4 | Site set-pieces (nest, wrecks, ruins, vehicles) | — | L | 2 | | todo |
| ART-5 | Field-kit, radar and map icons | — | S | 1 | | todo |
| ART-6 | Mass-produced Nikke follower model | — | S | 2 | | todo |
| ART-7 | Bestiary renders of the 22 Raptures | — | S | 1 | | todo |
| SORTIE-1 | Sortie HUD to match the mockups | — | M | 1 | | todo |
| SORTIE-2 | Radar contents | SORTIE-3 | M | 2 | | todo |
| SORTIE-3 | Charting / fog of war (engine-free) | — | S | 1 | | todo |
| SORTIE-4 | Sector map overlay on [M] (S03) | MAP-5, SORTIE-3, ART-5, Q9 | L | 3 | | todo |
| SORTIE-5 | Arrival sequence (S01) | ART-1, MAP-1 | S | 2 | | todo |
| SORTIE-6 | Boarding and departure (S06) | ART-1, ART-2 | S | 2 | | todo |
| SORTIE-7 | Rapture nests | FIGHT-1 | M | 2 | | todo |
| SORTIE-8 | Stranded Nikkes and followers | ART-6, MAP-2 | L | 3 | | todo |
| SORTIE-9 | Wreck ambush, supply drop, explosive barrels, landmarks | FIGHT-2, ART-3, ART-4 | M | 3 | | todo |
| SORTIE-10 | The other five jobs | SORTIE-7, 8, FIGHT-16 | M | 3 | | todo |
| SORTIE-11 | Turret Parts field kit | — | S | 2 | | todo |
| TRIP-1 | Lift ride: maintenance and repairs | LOOP-4, Q3 | M | 3 | | todo |
| TRIP-2 | Chain of trips (Patrol / operation) | TRIP-1, BOSS-2, Q1 | M | 4 | | todo |
| BOSS-1 | Boss framework and boss bar | FIGHT-16 | M | 3 | | todo |
| BOSS-2 | Boss sortie flow and arenas | BOSS-1, MAP-1 | M | 3 | | todo |
| BOSS-3 | Obelisk (B01, B02) | BOSS-2, FIGHT-6 | L | 4 | | todo |
| BOSS-4 | Cocytus (B03, B04) | BOSS-2, FIGHT-4, ZONE-1, Q10 | L | 4 | | todo |
| BOSS-5 | Sinister: standoff (B05) | BOSS-2, ZONE-4 | L | 4 | | todo |
| BOSS-6 | Sinister: crash and escape (B06) | BOSS-5 | M | 4 | | todo |
| ZONE-1 | The Frozen North sector (Z02, S08) | MAP-5 | L | 4 | | todo |
| ZONE-2 | Dead City sector (Z03) | MAP-4, MAP-5 | L | 4 | | todo |
| ZONE-3 | Stormbringer sector (Z04) | MAP-5 | L | 4 | | todo |
| ZONE-4 | The Hollow arena (Z05) | BOSS-2 | M | 4 | | todo |
| ZONE-5 | Zone data tables | FIGHT-21 | S | 3 | | todo |
| META-1 | Banking and currency rules (engine-free) | LOOP-1 | S | 2 | | todo |
| META-2 | Account upgrades apply in the run (U01) | META-1, Q4 | M | 3 | | parked |
| META-3 | NIPMH modules as owned gear (U01) | META-1, Q5 | L | 3 | | cut (v1) |
| META-4 | Bestiary (E06) | ART-7 | M | 3 | | todo |
| META-5 | Sortie records and achievements | LOOP-2 | S | 3 | | todo |
| WORLD-1…3 | World structure (only after Q1) | Q1, MAP-5 | L | 4 | | blocked |

## 6. Task cards

### LOOP: close the loop (menus → sortie → results → back, saved)

#### LOOP-1 · Save the NIKKE's progress and the bank · S
Mockups S07, U01 · Plan §10
- Add a `progress` section to the profile store, beside `roster`. Per character: level, XP,
  unspent SP, rank per ability. Account-wide: credits, Core Dust, owned modules.
- Pristine Cores already live in the `roster` section (`awardPristineCores`). Reuse them.
- Validate stored data the way the other profile modules do, version it, and clear it in
  `resetProfileProgress`.
- **Files:** new `src/frontend/profile/PlayerProgress.ts`, `ProfileStorage.ts` (section key only).
- **Done when:** a Node test covers defaults, a save/load round trip, corrupt data and reset.

#### LOOP-2 · Survivor runtime loads and saves progress · M
Needs LOOP-1 · Plan §2 (Dying), §10
- **On deploy:** restore the deployed character's level, XP, SP and ranks into `Run` and
  `RunTalents`.
- **On extraction:** write XP, level and ranks, and bank the ledger's banked totals.
- **On defeat:** write XP, level and ranks only. Carried loot is lost.
- SP spent mid-trip (Tab) is saved with the rest when the trip ends. Closing the page mid-trip
  saves nothing from that trip.
- The plain test range neither loads nor saves (Q11).
- `talents.ts` is loaded as text by `tools/test-capstones.mjs`. Do the wiring in `main.ts` or
  `sortie-mode.ts`, not there.
- **Done when:** a browser check gains a level, spends SP, extracts, reloads and deploys again
  with the same level and ranks. Banked credits are added exactly once.
- **Done 2026-10-25 (LOOP-1 and LOOP-2):**
  - **Save module:** `src/frontend/profile/PlayerProgress.ts` (profile section `progress`).
    Salvage banks as Core Dust 1:1. Pristine Cores go into the roster section the Shop uses.
  - **Wiring:** `src/survivor/mode/progress.ts` (`applyProgress` / `recordTrip`), called from
    `sortie-mode.ts`. Saved ranks are replayed through `RunTalents.purchase`.
  - **Checks:** `npm run test:progress`, plus `artifacts/verify-progress.mjs` (captures in
    `artifacts/ui/loop-2/`).

#### LOOP-3 · Stage Select deploys into a sortie · S
Plan §1
- **Mission card:** add a SALVAGE RUN card beside TEST RANGE in `MISSION_MODES`.
- **Zones:** all zones stay selectable. Until a zone has its sector map, it runs on the test
  plaza with that zone's weather, and the arrival banner names the zone.
- **URL parameter:** the menu sends `mode=stage_1`, which collides with `mode=sortie`. Rename
  the menu's parameter (e.g. `mission=`) and keep `?mode=sortie` working for
  `artifacts/verify-sortie.mjs`.
- **Returning:** "Return to Ark" on the results screen, and Leave in the pause menu, go back to
  Stage Select with the same character (`?preview=` already opens front-end scenes directly).
  Leaving mid-sortie counts as a defeat (Q8).
- **Files:** `src/app.ts`, `src/frontend/profile/StageData.ts`, `StageSelectScene.ts`,
  `DisclaimerScene.ts` (preview routing), the parameter parsing in `src/survivor/main.ts`.
- **Done when:** a fresh load can go Play → character → Salvage Run → sortie → extract →
  Stage Select without editing the URL.
- **Done 2026-10-25:** `?mission=salvage_run`; `Sortie.abandon()` (tested in `test:sortie`);
  `returnToArk()` in `sortie-mode.ts`; the survivor run wires `#leave-match` itself.
  Check: `artifacts/verify-deploy-flow.mjs`, captures in `artifacts/ui/loop-3/`.

#### LOOP-4 · Results screen to match S07 · M
Needs LOOP-2 · Mockup S07
- **Backdrop:** lift interior (shaft walls streaking past, hazard stripes, cyan lights,
  Snow White idle on the platform). It can be the real lift descending in 3D, or a painted
  image.
- **Sections:**
  - BANKED: salvage → Core Dust, credits, Pristine Cores
  - JOB: name, progress, a tick and the reward
  - The NIKKE: LV before → after, a filling XP bar, +SP
  - TRIP: time, kills, peak Alert as pips, Nikkes rescued
  - FIELD KITS: greyed out, labelled "LAST ONE TRIP"
  - a CONTINUE button
- **Defeat version:** shows what was lost and that XP was kept.
- Move the results UI out of `sortie-hud.ts` into its own file, so it doesn't collide with
  SORTIE-1.
- **Done when:** screenshots of extraction and defeat at 16:9 and 21:9 match S07's structure.
- **Done 2026-10-25:**
  - **Screen:** `src/survivor/mode/results-screen.ts` + `results.css`, kept separate from
    `sortie-hud.ts`.
  - **Backdrop:** the frozen 3D view, with the camera holding Snow White on the lift left of the
    panel (`SurvivorCamera.hold`). Extraction clears the horde from the shot (`Horde.clear`).
    Once ART-1's lift can descend, play the results over that instead.
  - **Simplifications:** Continue returns to Stage Select (the lift ride comes with TRIP-1).
    The module tile stays dormant (no NIPMH in v1). "Nikkes rescued" waits for SORTIE-8.
  - **Check:** `artifacts/verify-results.mjs` (captures in `artifacts/ui/loop-4/`).

#### LOOP-5 · Loadout screen (U01) · M
**Parked 2026-10-25:** the user is unsure about the upgrade/loadout concept and will revisit it. Don't start this.
Needs LOOP-1 · Mockup U01
- A screen between Stage Select and deploy:
  - illustrated portrait, name and LV
  - ability ranks summary (three rows of five pips), with a way to spend SP and respec. The
    A02 roadmap (`talent-menu.ts`) is DOM and can be mounted outside a run.
  - NIPMH gear panel (META-3) and account upgrades panel (META-2): placeholders until those
    tasks land
  - footer with zone and lift, and the GO UP button
- Decide whether it's a Phaser scene or a DOM screen. The ability menu is DOM.
- The lift picker depends on Q1. Until then, show the zone's arrival lift.

### FIGHT: enemies and combat (GAME_PLAN §6–§7, mockups E01–E05, H01–H04, S05, S08)

#### FIGHT-1 · Split behaviors into one file per role · S
- Do this first. Without it, every enemy task edits `behaviors.ts`.
- Move each role to `src/survivor/mode/behaviors/<role>.ts`, with a registry that
  `createBehavior` reads. Shared helpers (`detonate`, approach, tell → attack → recover timing)
  go in one helpers file.
- No change in behavior.
- **Done when:** `npm run test:sortie` and `artifacts/verify-sortie.mjs` pass unchanged.
- **Done 2026-10-25:** `src/survivor/mode/behaviors/`:
  - `types.ts`: `BehaviorContext`, `Behavior`, `BehaviorFactory`
  - `common.ts`: `PLAYER_RADIUS`, `FLARE`, `flatDistance`, `clearShot`, `detonate`
  - one file per role: `swarmer.ts`, `dash.ts` (pouncer and charger), `exploder.ts`, `fallback.ts`
  - `index.ts`: the `ROLE_BEHAVIORS` registry
  - **To add a role:** create `behaviors/<role>.ts` exporting a `BehaviorFactory`, then add one line to
    `ROLE_BEHAVIORS`. `horde.ts` still imports `./behaviors`.

#### FIGHT-2 · Enemy projectiles and ground hazards · M
Plan §6
- Pooled, shared types:
  - slow orb (5–9 m/s, hot colour, bright core)
  - bolt pair
  - **shootable homing missile** (1 HP, limited turning; the lance pierces several)
  - lobbed shell with a visible arc and a landing circle
  - fast sniper round that also hits Raptures in its path
  - expanding ring 0.6 m tall, which a dash passes through
  - cone sweep
  - ground hazard zones: burning ground that hurts both sides, a purple pool
- Every type stops at cover through the same sweep as `SnowField.traceSegment` (MAP-3 adds props).
- Off-screen fairness: off-screen enemies don't fire, except sniper lines and heavies.
- **Files:** new `src/survivor/mode/attacks/`. `enemy-attack.ts` may import only
  `@babylonjs/core` (`tools/test-enemy-attack.mjs`).

#### FIGHT-3 · Complete the tell language (§6, E05) · S
- Add to `telegraph.ts`:
  - a thin red laser line that tracks, then freezes and turns **white** 0.35 s before firing
  - a filling strip with no chevrons
  - a yellow flare at muzzle and eye sockets
  - a purple status ring
  - a flyer shadow ring
  - off-screen edge arrows for heavies
- Enforce the minimum tell times per tier.
- **Done when:** a test page or script shows all six E05 signals side by side.

#### FIGHT-4 · Player hits, statuses and death · M
Needs FIGHT-2
- Hit flash and a screen-edge damage vignette. Knockback and knock-up on the player.
- **Statuses, as VFX only:**
  - slow
  - Jam: no Burst gain while it lasts
  - Chill: frost on the model; freezes at 3 stacks
- Contact damage with a 0.6 s cooldown per enemy.
- A death animation, then the defeat results.
- Dash tuning waits for Q2.
- **Files:** `player.ts` (narrow hooks), new `src/survivor/status-fx.ts`.

#### FIGHT-5 · Finish the horde · S
Needs FIGHT-1, 2, 3
- **Crawler:** holds 8–12 m away, sidesteps after each volley, its cannons flare yellow, then
  it fires a bolt pair.
- **Lure, Pelican, Solaris, Capra:** check them against §7. The Solaris ring hurts Raptures.
  Capra's wall stun needs MAP-2.

#### FIGHT-6 · Phalanx and the shield-wall hook · M
Needs FIGHT-1 · Mockup E01
- A 120° frontal wall that **blocks every player projectile, the piercing lance included**,
  and covers Raptures behind it.
- It turns at 50°/s. The 80 HP shield comes back 5 s after it last took damage. Claw snap:
  a 3 m cone.
- Build the blocker as a reusable hook in the kit (lance, turret rockets, Burst cone).
  Obelisk's shells (BOSS-3) reuse it.

#### FIGHT-7 to FIGHT-15 · Specialists · S–M each
Each follows its GAME_PLAN §7 entry exactly (attack, tell, numbers, answer). Mockups: E02 (Cube, Seahorse, Tripod), E03 (Hanged Man, Penetrator, Twin Tail), E04 (Sentry, Tail Bone, Squid).

| ID | Rapture | Notes |
| --- | --- | --- |
| FIGHT-7 | Cube | Laser paint 2 s, then a strike of three circles. Breaking line of sight cancels it (MAP-3; stub on the plaza) |
| FIGHT-8 | Seahorse | Tracking line, freeze, white, fast round. Hits its own side |
| FIGHT-9 | Tripod | Three predicted circles with visible shells in the air |
| FIGHT-10 | Hanged Man | Adds the `flying` mobility: flies 4 m up, over cover. You hit flyers by aiming at their shadow ring |
| FIGHT-11 | Penetrator | 2.5 m strafing lane. Banking tilt in code. Hurts Raptures in the lane |
| FIGHT-12 | Twin Tail | Circles you, fires a 3-bolt fan, then twin beams. Bake `shot2` in `src/crowd.ts` |
| FIGHT-13 | Sentry | Deploys, sweeps a stream, vents to cool, back panel takes +50% (uses FIGHT-16's weak points), packs up without line of sight |
| FIGHT-14 | Tail Bone | Spin-up, then a three-arm spiral, then dizzy |
| FIGHT-15 | Squid | Glob into a pool: −35% speed and no Burst gain. Its aura halves Special recharge (hooks in player, run and kit) |

#### FIGHT-16 · Heavy chassis and Hard Hat · M
Needs FIGHT-1, 2, 3 · Mockups H01, S05
- **Shared heavy chassis:**
  - a thick armoured overhead bar
  - **weak points**: damage multipliers by hit location (hatch, back panel, eye pods)
  - punish windows (×2)
  - weak-point hits use the gold damage-number style (`hud.ts` already draws crits in gold)
- **Hard Hat:** hatch drop every 10 s (6 Lures and 2 Pelicans; 2 Solaris below 50%), a ram
  lane, and a dome that cuts damage by 60% except while the hatch is open.

#### FIGHT-17 to FIGHT-19 · Thermite, Cucumber, Loud Mouth · M each
Follow GAME_PLAN §7.
- **Thermite (H02):** flame sweep, burning ground that hurts Raptures, overheat.
- **Cucumber (H03):** shootable homing missiles, carpet strip (no chevrons), barrage below 50%.
- **Loud Mouth (H04):**
  - shockwave you dash through
  - sonic cone knockback
  - rally howl: +30% speed and attack rate, red eyes
  - It has no muzzle socket. Add one on the speaker grid.

#### FIGHT-20 · Hunter look (S08) · S
- **Size and colour:** 1.4× scale, gold rim light, gold-tinted eyes, gold-trimmed thick bar.
- **HUD:** the banner "A HUNTER IS TRACKING YOU" and HUNTED under the pips.
- **Speed:** 85% of the player's speed, faster when far away.
- Alpha affixes are out of scope.

#### FIGHT-21 · Spawn director to §9 · M
Needs FIGHT-1, MAP-1
- **Groups:** Swarm, Gun line, Pounce, Demolition, Fire base, Artillery, Air raid, Rally.
- **Where they spawn:**
  - emergence holes in the map, with a ground-burst effect
  - flyers enter from the map edge
- **Pressure:**
  - a minimum horde within 25 m of the player (lower where nests are destroyed)
  - a final convergence pulse when the player nears an exit
- **Tables:** zone-weighted spawn tables, per-type caps.
- **Scale:** display scale per tier ("size reads as threat").

#### FIGHT-22 · Kill XP per type, zone scaling · S
- Award each Rapture's XP from `roster.ts`; `Run` currently gives a flat 40.
- Add the zone HP and damage tiers from §9, stacked with the difficulty formula.

#### FIGHT-23 · Performance at 200–300 alive · L
Needs FIGHT-21
- Run far-away AI at a lower rate. Add a spatial grid (port the Phaser version's).
- Measure with the `docs/PERFORMANCE.md` method: interleaved A/B on `vite preview` builds,
  never on someone else's dev server.

### MAP: maps, collision, the first sector (S01–S06, S03)

#### MAP-1 · Map framework · M
- A `SurvivorMap` definition holds:
  - square bounds and the ground
  - props and collision shapes
  - site slots, exit positions and emergence holes
  - a spawn-validity test
- The test range becomes one map. `sortie-mode.ts` reads its layout from the map instead of
  the `TEST_RANGE_*` constants.
- `ARENA_RADIUS` and circular bounds are used in several places. Grep for them.
- **Files:** new `src/survivor/maps/`, plus hooks in `main.ts`, `arena.ts` and `sortie-mode.ts`.
  This is the main hotspot task: land it early and keep it small.

#### MAP-2 · Collision and navigation around props · L
Needs MAP-1
- **Player:** swept collision against props, like the snow banks.
- **Enemies:** path around props with the shared navigation in `src/navigation.ts`, the way
  `snow-navigation.ts` adapts it.
- **Knockback and charges** stop at walls (Capra's wall stun). Flyers ignore props.

#### MAP-3 · Cover and line of sight · M
Needs MAP-1
- **Tall props** block player shots (lance, rockets, Burst) and enemy shots.
- **Low cover** blocks movement only.
- Add a `lineOfSight(a, b)` query for the AI (Cube, Sentry, Seahorse).

#### MAP-4 · Camera occlusion fade and interiors · M
Needs MAP-1 · Mockup Z03
- Tall pieces between the camera and the hero fade out.
- Roofs and upper walls cut away when she steps inside a building.

#### MAP-5 · Graybox Ark Outskirts, 160 m · M
Needs MAP-1, MAP-2, MAP-6 · Plan §5
- **Blocks:** coloured blocks and site markers.
- **Sites:**
  - 20–25 site slots; each sortie fills 12–16
  - sites 30–50 m apart, joined by loops, not dead ends
- **Exits:**
  - 2–3 arrival-lift positions on the edges
  - 3–5 shaft positions, so no point is more than about 60 m from one
- **Ground:** 55–65% walkable, with emergence holes.
- **Tuning:** play it at the real camera with the horde, then tune one travel-scale factor.
- **Done when:** the user has played it and approved the size (Q7). Status `review` until then.

#### MAP-6 · Site-slot shuffle · S
- Engine-free and seeded:
  - fill slots with site types and loot by weight, keeping the GAME_PLAN §3 counts
  - pick the arrival lift
- **Done when:** a Node test checks the counts and that the same seed gives the same layout.

#### MAP-7 · Map edges and skyline · M
Needs MAP-5, Q7
- Borders are cliffs, a collapsed highway, water you can't reach, or rubble fields. Never a
  visible wall.
- A ruined skyline and distant Ark lift towers beyond the edge (S01's cinematic view).

#### MAP-8 · Ark Outskirts art pass · L
Needs MAP-5, Q7, ART-1 to ART-4
- Dress the approved graybox to the density of S01, S02 and S05:
  - roads with faded markings
  - ruined buildings and vehicles
  - sakura groves (`public/environment/sakura-v1/`) and overgrowth
  - kit-v1 props
- Keep draw calls in budget: merge statics and use thin instances (`docs/PERFORMANCE.md`).

### ART: assets
Each art task delivers a review page like `tools/review/environment-kit-review.html` for the user's
approval. Build procedurally in the style of `src/environment-kit.ts`, or another method the
user approves. **Check for reusable ruins in `src/environment.ts` (the MOBA kit) and
`assets/environment-source/paintover-v1/` first.**

#### ART-1 · Arrival lift · M
2026-10-25 preview: the user selected **S06's tall restored tower**, replacing the initial S01-only
interpretation. See `/tools/review/elevator-review.html` and the Test Range center. Model and motion are in visual
review; ART-2's dormant/restoring states and sortie integration are still pending.

Mockups S01, S06 · BRIEF "Recurring objects"
- A 6 × 6 m platform with hazard stripes, a waist-high steel frame, two sliding chevron gates,
  amber lamps and cyan edge lights, over a shaft it rises out of.
- Animation hooks: rise, open, close, descend. These replace the boxes in `site-view.ts`.

#### ART-2 · Lift tower, dormant and restored · M
Mockups S04, S05
- A steel-lattice and concrete tower, 4–6 m wide at the base and tall enough to leave the
  frame, with a cage at its foot.
- **Restoring:** cyan light bars switch on from the bottom up, driven by restore progress.
- **Restored:** a far-visible beacon and a lit platform.

#### ART-3 · Search props · M
Mockups S02, Z03
- Supply cache (Ark-marked crate) and priority crate (larger, gold markings).
- **Field-kit canister:** hexagonal, gold glow, shows its kit icon.
- Data terminal, signal scrambler, med station. (No module case: NIPMH isn't in the first version.)
- Fuel barrel, plus a fuel tank or truck that explodes.

#### ART-4 · Site set-pieces · L
Mockups S02, S05, S03
- Rapture nest: spiky mound, red vents, red haze.
- Wrecks: an overturned Ark supply truck and an APC, each with a smoke column.
- Ruined building blocks, cars, lamp posts, barriers.

#### ART-5 · Field-kit, radar and map icons · S
Mockups S02, S03
- Six field-kit icons: magazine with a plus, bullet with a flame, crosshair chip, hand with a
  circular arrow, turret with a plus, battery cell.
- Map legend and radar glyphs: cache, wreck, tower, nest, stranded Nikke, terminal, priority
  crate, lift.
- White SVG silhouettes in the HUD's existing style.

#### ART-6 · Mass-produced Nikke follower model · S
- Product 08 (`c302_00`, used for Wells) is already converted.
- The mockups show a pink-haired, helmeted soldier. Check NKAS for a closer model before
  choosing.

#### ART-7 · Bestiary renders of the 22 Raptures · S
- Consistent portrait renders from the GLBs in `public/raptures/`, for META-4.

### SORTIE: in-sortie systems and HUD

#### SORTIE-1 · Sortie HUD to match the mockups · M
Mockups S02, S04, S05, S06, S08 · BRIEF "HUD"
Much of this exists in basic form in `sortie-hud.ts`. Bring it to the mockups:
- **Objective panel:** three lines (zone or job title, progress, "◆ 23 CARRIED" with a warning
  triangle when Alert ≥ 4). Use the job strings from the brief.
- **ALERT:** five pips, amber, turning red at 4–5, with HUNTED under them at 5.
- **Field kits:** a six-slot row above the portrait, with ×counts.
- **Edge markers:**
  - cyan diamond "LIFT 58 m"
  - gold chevron "HUNTER 40 m"
  - red chevron for a sniper or a heavy
- **Boarding:** "GATES CLOSING" with a large "03" replaces the clock, and the objective says
  "EXTRACTING / HOLD THE LIFT UNTIL DEPARTURE".
- **Restoring:** "RESTORING LIFT TOWER" with seconds left and a thin bar.

#### SORTIE-2 · Radar contents · M
Needs SORTIE-3 · Mockups S02, S05
- Red enemy dots (these exist).
- Cyan lifts, grey unrestored towers, yellow diamonds for sites, the Hunter once revealed.
- "EXIT 24 m" when heading home.
- POIs appear once seen within 40 m, or revealed by a terminal.
- `hud.ts`'s radar is shared with the test range. Add a layer API rather than sortie-specific
  code.

#### SORTIE-3 · Charting / fog of war · S
- Engine-free:
  - a seen-cells grid that reveals 40 m around the player
  - a terminal reveals everything
  - record the player's path for the map's dotted trail
- Node test.

#### SORTIE-4 · Sector map overlay on [M] · L
Needs MAP-5, SORTIE-3, ART-5, Q9 · Mockup S03
- [M] pauses and opens a full-screen map in the menu style:
  - a top-down picture of the sector (an orthographic render at load works)
  - dark fog over uncharted ground, with faint outlines
  - POI icons, including towers seen through the fog
  - site labels, the dotted trail from the arrival lift, a 20 m grid and a 50 m scale bar
  - the legend panel, a header (zone · job progress, Alert, clock) and "[M] CLOSE"
- The music player and Pause stay visible.

#### SORTIE-5 · Arrival sequence · S
Needs ART-1, MAP-1 · Mockup S01
- The platform rises out of the shaft, the gates slide open and the amber lamps blink.
- The HUD fades in. No spawns for 10 s.
- Optional: start pulled back and lower, then ease into the gameplay camera.

#### SORTIE-6 · Boarding and departure · S
Needs ART-1, ART-2 · Mockup S06
- A countdown ring around the platform. The gates close with the 8 s cycle.
- Followers board. The platform descends into the results backdrop (LOOP-4).

#### SORTIE-7 · Rapture nests · M
Needs FIGHT-1 · Plan §3
- 400 HP. Within 30 m it spawns 3 Lures every 4 s, and shows a red-haze landmark.
- Destroying it removes that spawn point for the sortie and pays an XP burst and 3 salvage.

#### SORTIE-8 · Stranded Nikkes and followers · L
Needs ART-6, MAP-2 · Mockup S06
- Followers follow and fight. They can be downed; stand near one for 3 s to revive her.
- Maximum three followers.
- Each one who rides out pays +3 salvage and XP, and is counted on the results screen.

#### SORTIE-9 · Wreck ambush, supply drop, barrels, landmarks · M
Needs FIGHT-2, ART-3, ART-4
- **Wreck ambush:** starting the work spawns a local guard group.
- **Supply drop (Alert 3+):** a flare marks the landing 20 s ahead, and the horde converges on it.
- **Fuel barrels and trucks:** 5 m explosions that hurt everyone (Z03).
- **Landmarks:** tower beacons, smoke columns, red haze, flares.

#### SORTIE-10 · The other five jobs · M
Needs SORTIE-7, SORTIE-8, FIGHT-16 · Plan §4
- Search & Rescue (needs SORTIE-8).
- Purge (needs SORTIE-7).
- Hunt: a marked roaming heavy, shown on radar within 50 m.
- Restore Power: relays that become cyan Ark turrets.
- Hold: an engineer whose work ticks while you're within 18 m.
- Jobs live in engine-free `sortie.ts`. Add tests for each.

#### SORTIE-11 · Turret Parts field kit · S
- Expose Snow White's turret charge count, then let the kit drop. `sortie-mode.ts` excludes it
  today.

### TRIP: between trips

#### TRIP-1 · Lift ride: maintenance and repairs · M
Needs LOOP-4, Q3
- Between trips: a repair button and HP display. Apply the HP rule from Q3.
- No NIPMH maintenance: NIPMH isn't in the first version.

#### TRIP-2 · Chain of trips · M
Needs TRIP-1, BOSS-2, Q1
- Patrol: three sorties. The full operation: five.
- HP and credits carry over between trips. Time of day moves Day → Dusk → Night.
- Its shape depends on the world structure (Q1).

### BOSS: bosses (mockups B01–B06, plan §8)

#### BOSS-1 · Boss framework and boss bar · M
Needs FIGHT-16
- **Boss bar:** replaces the Alert area at the top, with the boss's name and phase ticks. For
  Sinister, a parts list under it.
- **Fight structure:**
  - phases and breakable parts with their own HP
  - immunity states
  - adds at a reduced rate
  - enrage at 5:00: faster, denser attacks, never a fatal countdown
- **Afterwards:**
  - a boss chest: Pristine Core and salvage (no NIPMH module choice in the first version)
  - the arena's lift rises after the kill

#### BOSS-2 · Boss sortie flow and arenas · M
Needs BOSS-1, MAP-1
- A 60–90 m arena map.
- A 60 s approach with a light horde, then the boss, then the lift.

#### BOSS-3 · Obelisk · L
Needs BOSS-2, FIGHT-6 · Mockups B01, B02
- Three phases (§8). The shells orbit as moving shields using FIGHT-6's blocker. Breakable
  shells. Rotating beams, boomerang, pylons.
- The arena is the plaza at Old Lift No. 4, with four pillars.

#### BOSS-4 · Cocytus · L
Needs BOSS-2, FIGHT-4 (Chill), ZONE-1, Q10 · Mockups B03, B04
- **Phase 1:** overflight with a shadow and a lane, frost bombs, icicle rain.
- **Phase 2:** breach from under the ice; the holes become dynamic navigation blockers.
  Breakable fins.
- **Phase 3:** whiteout with braziers.
- Confirm the water holes with the user (Q10) before building.

#### BOSS-5 · Sinister: standoff · L
Needs BOSS-2, ZONE-4 · Mockup B05
- A 17 m airship hovering along the north edge.
- **Parts:** two wing batteries, the hangar, the spire cannon, each with a bar in the parts list.
- The main cannon's lane crosses the whole arena. Three destructible cover blocks.
- Phase 2: the descent.

#### BOSS-6 · Sinister: crash and escape · M
Needs BOSS-5 · Mockup B06
- Phase 3: the crash, with the reactor exposed in windows.
- **Escape:** the objective reads "CRATER COLLAPSING / GET TO THE LIFT". Debris circles fall
  behind the player as she runs to the lift at the fallen Ark column.

### ZONE: zones (mockups Z02–Z05, S08, E02–E04; plan §5)

| ID | Zone | What's new | Size |
| --- | --- | --- | --- |
| ZONE-1 | The Frozen North | Snowfield (snow systems exist), pines, a frozen lake. **Whiteout** pulses cut visibility to 25 m while red eyes and tells still show. Thermite is the heavy and Hunter | L |
| ZONE-2 | Dead City | Tight streets, buildings with interiors (MAP-4), overpasses, fuel trucks. Plan: reuse the MOBA's overgrown industrial kit | L |
| ZONE-3 | Stormbringer | Night rainforest ruins in the storm (weather exists). **Lightning** strikes telegraphed by a yellow circle for 1.2 s, hitting anything | L |
| ZONE-4 | The Hollow | Crater arena, falling ash, fallen Ark lift column, red-glowing clouds. Built for BOSS-5 and BOSS-6 | M |
| ZONE-5 | Zone data | Per-zone spawn weights, heavy and Hunter, boss, weather and time defaults, recommended level, HP/damage tier | S |

### META: progression and menus

#### META-1 · Banking and currency rules · S
Needs LOOP-1
- Engine-free:
  - salvage → Core Dust
  - credit sources
  - Pristine Core drops: heavies 15%, Hunters and bosses always
  - the job reward
- Node test.

#### META-2 · Account upgrades apply in the run · M
**Parked 2026-10-25** with LOOP-5. Don't start this.
Needs META-1, Q4 · Mockup U01
- ATK, HP, SPD, CRT and XP upgrades exist in the Shop (`src/frontend/profile/PermanentUpgrades.ts`),
  but the survivor runtime ignores them. Apply them.
- Switch their cost to Core Dust if Q4 confirms it.

#### META-3 · NIPMH modules as owned gear · L
**Cut from the first version (2026-10-25):** no NIPMH. It may come back; the code stays,
switched off in `src/features.ts`. Don't start this.
Needs META-1, Q5 · Mockup U01
- You own modules and equip them within the weighted capacity before going up.
- You find and bank modules on the surface: module cases, supply drops, boss chests.
- Apply their effects in the survivor runtime. The runtime logic is in
  `src/frontend/features/nipmh/`.

#### META-4 · Bestiary · M
Needs ART-7 · Mockup E06
- Records → Bestiary, with four tier rows (HORDE, SPECIALIST, HEAVY, BOSS).
- Each card shows the render, name, role and a tell icon; a detail panel describes the selected one.
- An entry unlocks the first time you meet that Rapture.

#### META-5 · Sortie records and achievements · S
Needs LOOP-2
- Save a record per sortie (`RunRecords.ts`).
- New achievements, e.g. extract with three Nikkes, kill a Hunter, finish a sector at Alert 1.

### WORLD: world structure (only after Q1)

The W mockups are alternatives, not one combined mode. Only the chosen one gets built.

- **Persistent regions (W01, W02), the recommendation:**
  - WORLD-1: the region map screen. Territory state (reclaimed, held, fogged), restored lifts
    as start points, strongholds, the boss-lair lock ("RECLAIM 3 STRONGHOLDS 1/3"),
    counterattack alerts, CHOOSE A LIFT and GO UP.
  - WORLD-2: region state and saving, with counterattacks.
  - WORLD-3: the frontier in gameplay. Reclaimed ground is tinted cyan, with relay turrets and
    guards; Rapture ground has red haze and a denser horde.
- **War map (W03):** a war-table screen, a sector graph, the front line and counteroffensives.
- **The Descent (W04), Long Road (W05), Moving anchor (W06), Contracts (W07), Outpost (W08),
  Day and night (W09):** not scheduled unless chosen.

## 7. Waves and playable milestones

Within a wave, tasks can run in parallel; check each task's Needs.

| Wave | Start | Tasks |
| --- | --- | --- |
| 1 | Now | LOOP-1, LOOP-3, FIGHT-1, FIGHT-2, FIGHT-3, MAP-1, MAP-6, ART-1, ART-2, ART-3, ART-5, ART-7, SORTIE-1, SORTIE-3 |
| 2 | As their Needs land | LOOP-2, LOOP-4, LOOP-5, FIGHT-4, 5, 6, 7, 8, 9, 14, 16, 22, MAP-2, MAP-3, MAP-5, ART-4, ART-6, SORTIE-2, 5, 6, 7, 11, META-1 |
| 3 | After the graybox | FIGHT-10–13, 15, 17–21, 23, MAP-4, 7, 8, SORTIE-4, 8, 9, 10, TRIP-1, BOSS-1, 2, ZONE-5, META-2–5 |
| 4 | After Q1 and the first sector | BOSS-3–6, ZONE-1–4, TRIP-2, WORLD-* |

**Milestones:** play each one before moving on.

1. **The loop** (LOOP-1–4, SORTIE-1): menu → sortie → extract → back, with progress saved. Still on the plaza.
2. **A real fight** (FIGHT-1–9, 14, 16): E01 and E02 read clearly on the plaza. GAME_PLAN's
   check: three minutes on the test range is fun.
3. **First sector, graybox** (MAP-1–3, 5, 6; SORTIE-2, 5, 6; ART-1, 2): S01–S06 play out on
   160 m. The user approves the size.
4. **Ark Outskirts looks like the mockups** (MAP-7, 8; ART-3, 4; SORTIE-4, 7–10; LOOP-5;
   FIGHT-20, 21): S01–S08 and U01.
5. **Patrol** (TRIP-1, 2; BOSS-1–3): three trips ending at Obelisk.
6. **More zones** (ZONE-1–3, remaining enemies, BOSS-4).
7. **The finale and the world** (ZONE-4, BOSS-5, 6, WORLD-*).

**Out of scope for these mockups:** survivor kits for characters other than Snow White
(anyone else currently deploys with her kit), Alpha affixes, route choice, sector modifiers.

