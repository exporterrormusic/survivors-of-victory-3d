# Status and handoff (read this first)

## Current visual exploration: grid tactics + focused turns (2026-10-24)

The user returned from the incremental / micro-RTS exploration to a grid-tactics
and JRPG hybrid. Move and choose a target on the grid, then move the camera behind
the acting character to choose **Attack, Skill, Burst or Item**. No Defend command.
For attacks, a line oscillates across a bar; click inside a skill-specific highlighted
window to gain bonus damage. No defensive reactive dodge/parry or spatial weakpoint aim.

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
