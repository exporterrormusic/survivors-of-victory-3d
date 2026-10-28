# NIKKE MOBA (test bed)

**Current layout prototype:** **Ark Siege**. Open `?prototype=ark-siege` or select **ARK SIEGE · GRAYBOX**.
Three lanes, fixed destructible defenses in the allied half, and rescue excursions into enemy territory.
Basic shapes and test combat only; see [controls and scope](docs/ARK_SIEGE_GRAYBOX.md).

**Previous combat mode:** 20-minute **Survival Round**, followed by a final boss. Start with basic abilities,
earn XP and spend SP through the ordered talent trees, then earn one Rapture Core on victory.
Talents reset each round; skins and cores persist. Select Survival Round in Stage Select or open
`?run=test-range&mission=survival_round&zone=outskirts_day`. See [current round rules](docs/SURVIVAL_ROUNDS.md).
Snow White, Scarlet, and Rapunzel are playable; Scarlet and Rapunzel are in their first combat/visual playtest passes; the MOBA systems documented below are retained experiments.

On Windows, double-click **start.bat** to start the game and open `http://localhost:5173/`.
It installs dependencies if needed and reuses an existing game server. Keep the server
window open while playing; press Ctrl+C to stop it. Node.js and npm must be installed.

Development review pages live in `tools/review/` (open them through the dev server).
Design briefs live in `docs/concepts/`; generated captures and logs belong in `artifacts/`.

Babylon.js MOBA prototype using NIKKE's 3D chibi models. Current scope: Snow White (with three
of her other variants), Red Hood, Rapunzel, and Scarlet, HotS-style movement and combat, a shared placeholder ability kit,
opposing Nikke/Rapture minion waves, overgrown industrial ruins, and a HotS-style HUD with restrained NIKKE colors. Multiplayer is not implemented.

The current **Survivor test range** has ground snow: open
`?run=test-range&snow=drifts&weather=snow&time=day`, then **WEATHER LAB → Ground snow**.
Separate player boot prints and grounded Rapture claw prints refill during snowfall.
Blue-shaded deep drifts slow movement; tall banks block walking and dashes.
Grounded enemies route around banks. Use **WEATHER LAB → Enemies → Pursue player**
or add `&enemies=pursue` to try it; Hold positions remains available for training.
See [ground snow setup and floor integration](docs/SNOW.md).

```
npm install
npm run chibi      # download + convert the models (already done once; re-run to add more)
npm run dev        # http://localhost:5173  (?v=c471_00 picks a variant)
```

Choose a character in **F10 → Character / outfit**, or open a direct link:

| Character | Link |
| --- | --- |
| Red Hood | `http://localhost:5173/?v=c470_00` |
| Rapunzel | `http://localhost:5173/?v=c221_00` |
| Scarlet | `http://localhost:5173/?v=c222_00` |

These links open the archived MOBA. For Scarlet in the current survivor runtime, use
`?run=test-range&character=scarlet`, or Weather Lab > Character. Tab opens her ordered talent tree.
Switching characters restarts the run. See [Scarlet port notes](docs/SCARLET.md).
Rapunzel uses `?run=test-range&character=rapunzel`; see [Rapunzel port notes](docs/RAPUNZEL.md).

## Battlegrounds

Choose **THREE LANES** (Outpost Hollow, Cursed Hollow layout) or **ONE LANE** (Lost Outpost,
Lost Cavern layout) in Stage Select, or use **F10 → Battleground**. Direct matches accept
`?hero=snow-white&map=three-lane` or `?hero=snow-white&map=single-lane`.

Both maps have paired gate towers, Forts, Keeps and destructible Cores. Destroy a Fort and Keep
in the same lane to expose the enemy Core, then destroy it to win. Core health appears below
the top-center scoreboard. Map distances are 1.8× the initial compact blockout. Structures
now use generated paint-overs of their actual geometry. [Layout sources](docs/BATTLEGROUNDS.md)
and [paint-over pipeline](docs/PAINTOVER_ART.md).

## Lane minions and waves

Mass-produced Nikkes are blue-team **lane minions** (also called creeps); the Outpost Raptures
are red-team lane minions. Six units per side per lane spawn immediately and every 30 seconds
(18 per side on the three-lane map). They follow their lane, acquire opponents, and attack enemy
defenses. Blue waves draw from the nine models below; red waves use Lures, Pelicans and Crawlers.
Minions are separate from the playable hero selector.

| Model | ID |
| --- | --- |
| Soldier EG | `c300_00` |
| Soldier FA | `c301_00` |
| Soldier OW | `c306_00` |
| Product 08 | `c302_00` |
| Product 12 | `c303_00` |
| Product 23 | `c307_00` |
| iDoll Flower | `c304_00` |
| iDoll Ocean | `c305_00` |
| iDoll Sun | `c308_00` |

Names/IDs are verified against the [NKAS catalog](https://nkas-l2d.pages.dev/characters.json).
`npm run minions` downloads/converts just these nine; `npm run chibi` now includes them in the
default roster. Their native run, idle, aim, shot and death animations use the existing facing
and muzzle corrections. Each currently shares prototype rifle damage/stats; weapon-specific
kits are not implemented. Raptures retain bolts, spread shots and telegraphed mortars.
Pelican has no native walk clip in its SD bundle. During loading it now borrows Crawler's
compatible lower-body walk, with rig checks and Pelican's own upper body/firing poses retained.
Lure uses its subtle native walk; Crawler uses its native stepping cycle. Visible minions have
name labels above their health bars, drawn from cached sprites on the HUD canvas.

Blue/coral health bars and minimap dots distinguish teams. Hero attacks and abilities only
hit enemy units and buildings; minion attacks only hit the opposing team, including the blue hero. Ruins block
minion sight and projectiles. Defeated minions are removed; replacements arrive with subsequent
waves instead of respawning at the death location. Each defeat grants 35 opposing-team XP,
without increasing hero takedowns. Hero deaths still grant 200 red XP. Hover the match clock
for the wave number/countdown. Team levels currently do not scale stats or unlock talents.

Both teams plan ground routes around cover with clearance for their body size. The shared
`src/navigation.ts` planner uses A* with swept collision checks and smooths routes into
visible waypoints. Units steer around nearby bodies, replan when progress stalls, and commit
to short lateral bypasses around stationary crowds. Separation cannot push them into cover. Target selection
keeps a valid opponent unless another is substantially closer; briefly losing sight prompts
pursuit around cover, and attacks require a clear firing line. The player also uses these routes
for click movement and attack pursuit. This is lane-unit navigation
and combat behavior, not a full strategic hero-bot system.

Surviving minions attack enemy buildings instead of retiring at the opposing base. A four-minute
unit lifetime bounds unattended population. Source
assets/materials/textures are shared, but every active minion has an independent skeleton and
animation state. Retired animated models return to bounded pools; new waves get fresh gameplay
objects so old target references remain invalid. HUD frames and local overlays are disposed.

Navigation grids are prepared once per body size, with at most two minion A* searches per frame
and one reserved player search. Local steering runs at 10 Hz; movement and collision remain per
frame. Spatial buckets limit neighbor/target/projectile searches. Projectile and effect meshes
are pooled, static environment transforms are frozen, and offscreen unit animations pause.
Movement/clips/blend weights update before skeleton evaluation, with a short idle/run hold to
prevent rapid switching at obstacles. Constant animation tracks shared by every clip are removed.

The 216-unit stress test reduced mean AI/combat update time from 305.7 ms to 8.3 ms on the test
machine. This is simulation CPU time, not frame rate: hundreds of simultaneously visible animated
models still need further animation LOD or baked animation work. See `artifacts/ui/unit-profile-after.json`
and `artifacts/ui/unit-performance-verification.json` for measurements and lifecycle checks.

Damage interrupts mounting/recall and dismounts the hero; death respawns her after three seconds
with brief protection. The blue base restores HP.

## Controls

**F10 → Lighting** compares Original, Bright daylight, and Bright daylight + soft shadows.
Bright daylight is the initial default. It uses brighter sun/sky fill, a shared character edge
light, broad material highlights and FXAA. The rejected dark ACES grade has been removed.
The soft-shadow option uses PCSS and costs more GPU time. The choice is remembered.
See [visual investigation and comparisons](docs/visual-quality.html) for the tested looks and
recommended shader/material work. These trials do not establish a hardware FPS guarantee.

Two schemes; open **Settings** with **F10** and use the **Controls** dropdown. The choice is
remembered per browser. Close Settings with **F10**, **Esc**, or its close button.

| | Heroes of the Storm | WASD + mouse aim (twin-stick) |
| --- | --- | --- |
| Move | Right-click, hold to steer | WASD (right-click still works) |
| Basic attack | Right-click an enemy | Hold left-click at cursor, or right-click an enemy |
| Attack-move | A, then left-click | Not bound |
| Stop / hold | S / H | Release movement keys; H stops the current order |
| Piercing Shot | Q | Q |
| Snow Drift (dash) | W | Space |
| Frag Grenade | E | E |

Shared: **R** Seven Dwarves (channelled beam), **D** passive trait (no cast), **Z** hoverboard,
**B** hearthstone, **T** emote, **K** die/respawn,
**Wheel** zoom, **Y** lock/free camera, **Space** center, **arrows/screen edge** pan when free,
and **F10** Settings (controls, camera, variant, facing mode, animation clips, Babylon Inspector).
In the WASD scheme, Space also casts the dash. Left-click/drag the minimap to look; right-click it to move.

The **Cast mode** setting offers quick cast (key press), quick cast on release (hold to aim),
and normal cast (key, then left-click to fire). Right-click or Esc cancels targeting.
Clicking an ability tile starts targeting for aimed abilities, regardless of the cast-mode setting.

**Camera** dropdown: *Dynamic* tilts with zoom (24° zoomed in, so you see faces, up to 58° zoomed
out), *Classic MOBA* is a fixed 56° like LoL, and *Low* is a 22–34° showcase angle.

## HUD

The in-game HUD uses the earlier **Heroes of the Storm** art direction: substantial silver
bevels, dark blue inset panels, illustrated hexagonal skill sockets, a connected bottom cradle,
and glossy HP/resource bars. The portrait remains at **bottom left**, abilities at **bottom
center**, minimap/music at **bottom right**, and squads, levels and time at the top.

The original painted `skill-socket.webp` and `panel.webp` textures are active again, alongside
the illustrated ability and utility images in `public/ui/textures/`. The selected hero's burst
art appears on heroic buttons where supplied by its kit. Abilities without an assigned illustration
retain their earlier shaded glyph fallback. Full-resolution source images and prompts remain
in `assets/ui-source/`.

`src/style.css` owns the presentation and responsive layout. Squads sit in continuous metal rails
around a beveled match crest; core health shares its center column.
`src/ui/top-frames.ts` draws closed SVG rims with parallel inset edges, sized by a ResizeObserver.
Frame angles use panel height. Outer portraits and level backgrounds extend into the sloped
recess and share its clipping outline, filling the wedges while score text and XP retain safe padding.
The portrait has its original
painted flat-top hexagon, resource bars retain their parallel 22-degree slope, and heroic choices
sit in one enclosed, painted tray. The minimap's complete four-sided silver bevel is restored.

The experimental flat theme and inline vector button graphics have been removed from the runtime.
Their snapshots are archived in `artifacts/ui/hots-restored/`. That directory also holds screenshots
and the browser verification script for the restored HUD.

The subsequent brightness pass follows the local genre-switch mockups: stronger cyan/green
resource fills, brighter silver highlights, richer blue skill lighting and a modest lift in
portrait/ability art. Before/after captures, close-up top frames, and six-size layout/interaction
checks are in `artifacts/ui/hud-polish/`. Checks include complete closed rims and content
containment inside the angled frames. The follow-up wedge-fill captures and six-size checks are
in `artifacts/ui/hud-angle-fill/`.

The character card and top team slot use the same selected variant's `*_icon.png` art. Changing the
variant updates both portraits and the minimap icon; no separate portrait camera is rendered.
Top portraits use `object-fit: cover` with a small 1.07× overscan above the health strip.
On narrow portrait phones, unused team slots collapse to preserve readable portraits and the timer.
Long character names truncate visually, with the full name available on hover.

HUD layout responds to the game frame's width, with skill and menu targets at least 44 CSS pixels.
Mount and recall stay at the sides of a single ability row at every size. At landscape widths up to
760 pixels and on portrait screens, portrait and minimap move above that row. Mobile controls are
also enlarged within the available width. Narrow portrait phones
use the full viewport; landscape and desktop retain the 16:9–21:9 frame limits. Settings remain
readable and scrollable, with debugging controls collapsed.
Button feedback respects `prefers-reduced-motion`.

These changes prepare the UI for smaller screens; touch movement and a complete mobile gameplay
scheme are not implemented. Gameplay still uses the keyboard/mouse controls above.

Heroes of the Storm is the primary in-game UI reference. The user-provided battle image confirms
the preferred substantial, illustrated treatment. The Survivors-derived front-end menus remain
a separate presentation.

## Environment art

F10 → **Lighting & color** selects Anime, Painted daylight (default), Warm daylight, Cool woodland,
or Previous lighting for comparison. Anime uses a bright simplified palette, flat cel shadows,
strong ink outlines on characters and solid scenery, and smoother background textures. Painted
Nikke facial details receive gentler shading. It works in
the survivor test range and MOBA maps. Ambient occlusion is off in Anime; switching back restores
the saved preference. Original materials and textures remain intact. **Ambient shadows** adds contact shading and can be
disabled for performance. Painted surfaces now respond to the sun without self-illumination;
the shadow map follows the camera while panning. [Lighting pass details](docs/LIGHTING.md).

Both battlegrounds use overgrown NIKKE-inspired industrial ruins. Trees have branching 3D
trunks with painted bark and curved leaf cards using an RGBA
foliage atlas; painted ferns and hanging ivy replace the old triangle tufts and solid canopy
balls. Weathered metal panel art wraps service cabinets, alongside textured concrete and rubble.
Leaf cards are instanced and alpha-tested, including their shadows. They retain their world
orientation while the camera moves. Cover shares the movement/line-of-sight collision circles;
small plants and surface details are passable, and the firing lane stays open.

`src/terrain.ts` blends new 1254-pixel painted paving and woodland textures repeating every
5 world units. World-space lane masks, uneven verge blending and broad color variation are
independent of texture resolution. Mipmaps and up to 16× anisotropic filtering keep oblique
views clear. The minimap uses the woodland texture beneath the active layout.

The [referenced paint-over workflow](https://www.reddit.com/r/aigamedev/comments/1x6xh4v/finally_found_a_way_to_get_my_dream_art_style/)
uses a blockout screenshot, an AI paint-over and camera projection onto the geometry. We now
capture the actual buildings from four orthographic views, paint those sheets, and bake each
surface's best view into mesh UVs. Painted armor, vents, bevels, masonry and wear remain attached
through camera movement and turret rotation. Gun heads, team lights and rubble remain separate.

Six new assets (`defenses`, `mechanisms`, `environment`, `barriers`, `paving`, `woodland`) were
created with built-in ImageGen and total 2.45 MB as WebP in `public/environment/paintover-v1/`.
Original PNGs, captures, prompts and the asset manifest are in
`assets/environment-source/paintover-v1/`. `python tools/export-paintover.py` encodes them and
exports the capture coordinates. [Workflow and verification](docs/PAINTOVER_ART.md).
The earlier foliage and prop atlases remain under `public/environment/`, with their source
files preserved in `assets/environment-source/`. The match crest is `public/ui/match-crest.svg`.

## Where the models come from

Boom Arena (the FPS at npc-jail.pages.dev/game/boom-arena) is a three.js game hosted at
`elegg-boom-arena.pages.dev` and shown in an iframe. Its credits say: *"NIKKE chibi models © SHIFT UP,
files via NKAS by skuqre"*. NKAS (nkas.pages.dev/chibi) hosts about 400 chibi variants, already
extracted from the game, as **SDP1 packs** at `https://nkas-chibis.pages.dev/packs/<id>.sdp`, listed in
`https://nkas-chibis.pages.dev/manifest.json`. Boom Arena serves byte-identical copies of those packs
and decodes them at runtime.

SDP1 layout (see [tools/sdp.mjs](tools/sdp.mjs)):

```
"SDP1" | u32 LE header length | JSON header | payload
payload = GLB (mesh, Biped skeleton, unlit PNG textures; already glTF right-handed)
        + one Float32 blob per animation clip
clip channel = [boneIndex, kind (0 pos, 1 rot, 2 scale), isConstant, floatOffset]
```

The clip data is still in Unity's left-handed space: position `(x,y,z) -> (-x,y,z)` and rotation
`(x,y,z,w) -> (x,-y,-z,w)`.

## Our pipeline

`tools/fetch-chibi.mjs` downloads packs into `raw/` and converts each one into a **standard GLB with
real glTF animations** (`public/chibi/<id>.glb`). Babylon loads these with no custom code, and they
also open in Blender or sandbox.babylonjs.com. Every clip is padded with rest-pose channels so clips
never leak bones into each other. The output passes the Khronos validator (0 errors, 0 warnings).

```
npm run chibi                    # heroes plus all nine mass-produced minions
npm run minions                  # mass-produced minions only
npm run chibi -- c470_00          # download/convert Red Hood only; preserves existing models
npm run chibi -- c221_00 c222_00  # download/convert Rapunzel and Scarlet only
npm run chibi -- c010_00 c011_00 # any ids from the NKAS manifest
npm run chibi -- --list c01      # search the manifest
```

Base models: Red Hood `c470_00`, Rapunzel `c221_00`, Scarlet `c222_00`, verified against NKAS's
[character catalog](https://nkas-l2d.pages.dev/characters.json) and
[chibi manifest](https://nkas-chibis.pages.dev/manifest.json).

### Facing (the non-obvious part)

The clips were made for NIKKE's camera, not for a forward axis. Lobby clips (idle, run, talk) face
the camera. Cover-shooter clips (`aim_*`, `cover_shot`) aim *away* from it, and `aim_start`/`aim_end`
turn about 100° between the two. NKAS's `frontYaw` follows the body, which stands side-on with a rifle,
so it is not "forward" either.

To fix this, the converter poses every clip at 9 frames (forward kinematics plus weapon skinning) and
records the **head yaw** (eye bones) and the **gun yaw** (skinned weapon mesh) in `index.json`.
`src/chibi.ts` uses those numbers to turn each clip so the head points forward, or the gun for aimed
clips. It tracks the curve through `aim_start`/`aim_end` and syncs the turn with the crossfade.
Use the debug panel's "raw" facing mode to see the clips as authored.

Rapunzel and Scarlet use head-based attack facing (`HEAD_AIM_VARIANTS` in `src/main.ts`), since
their staff and sword do not point along their attack direction. This keeps them looking toward
the target instead of applying the rifle barrel correction. Mount and recall use the equipped
`idle` pose for every character.

The loader also respects NKAS's `extras.disabled` flags, keeping source-disabled helper meshes
(including Scarlet's weapon blocks) hidden without disrupting the skeleton.

The same pass records each clip's **gun tip**: the weapon vertex farthest from the head, stored as an
offset in its joint's local space (usually `Bip001 Prop1`, the Biped weapon bone). Projectiles and
beams spawn from that point in the pose being rendered that frame. Only aimed clips are used,
because in lobby poses the "far end" is sometimes the stock.

## Outpost Rapture assets

These come from the installed game's `sdmonster_assets_*` Unity bundles: all 22 in the
catalog are converted. Lure, Pelican and Crawler are in matches; the rest await review.
The complete copies are preserved in `raw/outpost-research/`; `inspection.json` records the
local catalog/chunk-store provenance. The older files under `raw/raptures/` are battle preview
exports and are not used. Names follow the NKAS bestiary; heights are measured over every clip.

| Rapture | ID | Height | Clips | Muzzles |
| --- | --- | --- | --- | --- |
| Lure | `bma002` | 2.3 m | idle, walk, shot | 2 |
| Pelican | `bmg001` | 2.4 m | idle, shot (walk borrowed from Crawler) | 1 |
| Crawler | `mmg005` | 2.3 m | idle, walk, shot | 2 |
| Capra | `beg003` | 2.0 m | idle, shot, walk (Crawler, leg IK) | 2 |
| Hanged Man | `xea003` | 2.3 m | idle, shot | 1 |
| Seahorse | `xma003` | 2.4 m | idle, shot | 1 |
| Cube | `emg003` | 2.4 m | idle, shot, walk (Crawler, leg IK) | 1 |
| Solaris | `xeg006` | 2.4 m | idle, walk (Soldier EG's legs); no shot | 2 |
| Tail Bone | `bea001` | 2.4 m | idle, shot | 1 |
| Twin Tail | `meg006` | 2.4 m | idle, walk, shot, shot2 | 4 |
| Penetrator | `mea001` | 2.8 m | idle, shot | 4 |
| Phalanx | `xmg001` | 3.0 m | idle, shot, walk (glides on idle) | 1 |
| Sentry | `eeg003` | 3.0 m | idle, shot, walk (Crawler, leg IK) | 1 |
| Squid | `ema002` | 3.1 m | idle, shot | 1 |
| Tripod | `eea002` | 3.9 m | idle, shot | 1 |
| Hard Hat | `mma001` | 4.2 m | idle, shot (hovers 1 m up) | 2 |
| Thermite | `mcg002` | 4.4 m | idle, shot, walk (Crawler, leg IK) | 4 |
| Cucumber | `bcg001` | 4.7 m | idle, shot, walk (Crawler, leg IK) | 6 |
| Loud Mouth | `ecg001` | 5.1 m | idle, shot, walk (Crawler, leg IK) | none |
| Obelisk | `eca001` | 6.1 m | idle, shot | 2 |
| Cocytus | `bca001` | 8.1 m | idle, shot | none |
| Sinister | `mca001` | 17.3 m | idle, shot | none |

Only Lure, Crawler and Twin Tail have a native walk. `tools/rapture_walks.py` gives the walkers
above theirs during conversion. The four-legged ones follow Crawler's foot paths, scaled to their
footprint, with two-bone leg IK, so feet plant at each model's own stance height (Capra, Sentry
and Cube share Crawler's leg rig; Cucumber, Loud Mouth and Thermite share a larger one). Solaris
replays a mass-produced Nikke's Biped leg rotations around its own pose. Phalanx glides on its
idle. Bigger legs step slower (square root of the size ratio). Claw tips can still dip ~0.15 m
into the floor at the end of a step. The rest float or hover and have no walk; moving units
without one play idle. The crowd does not bake `shot2` yet.
Models without muzzle sockets fire from the crowd's fallback point until given one.

To copy the bundles out of the install (read-only, needs `pip install zstandard`) and rebuild
the GLBs (Python 3.11 was used):

```powershell
python -m pip install --target artifacts/tooling/unitypy UnityPy==1.25.4
npm run raptures:extract
npm run raptures
```

`npm run dev`, then open `/tools/review/rapture-review.html` to review them: each model is drawn through
the lane-minion crowd path beside a mass-produced Nikke, with clip buttons, muzzle markers,
measured height/reach/lowest point (and the `modelLift` that clears the floor), a lineup by
size, and a per-model verdict and notes kept in the browser ("Copy review notes" exports them).

`tools/convert-raptures.py` writes self-contained GLBs and an asset manifest to `public/raptures/`.
It decodes dense, streamed cubic, and constant transform curves at the source sample rate,
resolves bone paths, preserves skin weights and bind poses, and converts Unity coordinates to
glTF. Paths are relative to the Animator: tracks for nonexistent children stay unbound, as
recorded in `index.json`. In particular, Pelican's obsolete `bmg001` child tracks must not bind
to the prefab root (doing so tilts the whole model 90 degrees into the floor). Tracks on the
skinned mesh's own node (Squid, Hard Hat, Hanged Man) also stay unbound: Unity and glTF ignore
that transform, but Babylon would apply it and tip the model over. Numbered clips are unified
(`idle_01` → `idle`, `shot_02` → `shot2`), and the texture comes from the material's `_MainTex`.
Missing clip channels restore the original transform pose. A small per-species `modelLift`
in `src/enemy.ts` keeps animated geometry above the arena while the gameplay position and
target ring stay at ground level. The native toon material is
approximated with the original color texture on a matte material under the arena lighting.
The game installation is not needed at runtime and is never modified by the converter.

## Layout

| Path | What |
| --- | --- |
| `tools/sdp.mjs` | SDP1 → animated GLB plus facing analysis |
| `tools/fetch-chibi.mjs` | download/convert CLI, writes `public/chibi/index.json` |
| `tools/extract-raptures.py` | copy the SDMonster bundles out of the local install (read-only) |
| `tools/convert-raptures.py` | local Outpost bundles to animated `public/raptures/*.glb` |
| `tools/rapture_walks.py` | borrowed/generated walk clips for walk-less Raptures (used by the converter) |
| `tools/review/rapture-review.html`, `src/review/` | dev-only Rapture review page (not in the game build) |
| `src/chibi.ts` | load a chibi, crossfade clips, per-clip facing |
| `src/main.ts` | input, settings, variant switching, frame layout, game loop |
| `src/hero.ts` | hero state machine, movement, attacks and abilities |
| `src/kit.ts` | placeholder skill definitions, cooldowns, mana costs and stats |
| `src/hud.ts`, `src/style.css`, `index.html` | responsive HotS-style DOM HUD, NIKKE palette, illustrated portrait |
| `public/ui/textures/`, `assets/ui-source/` | generated runtime UI textures; originals, prompts, and export metadata |
| `src/minimap.ts` | tactical canvas minimap and world coordinate mapping |
| `src/combat.ts` | friendly/hostile projectiles, damage, team XP, beam and markers |
| `src/enemy.ts` | Nikke/Rapture lane-minion behavior, native animations, windups and disposal |
| `src/navigation.ts` | body-size-aware A* routes, waypoint smoothing, crowd avoidance and recovery |
| `src/minion-roster.json` | shared nine-model roster for the downloader and runtime |
| `src/model-library.ts` | cached GLB source assets and independent skeleton/animation instances |
| `src/environment.ts` | painted ruin meshes, service cabinets, road details and plant placement |
| `src/foliage.ts` | branching trunks, painted instanced leaf/fern/ivy cards and atlas UVs |
| `src/terrain.ts` | repeating paving/moss materials with a world-space lane blend |
| `public/environment/`, `assets/environment-source/` | generated environment textures; original PNGs, prompts and asset metadata |
| `src/camera.ts` | MOBA camera |
| `src/world.ts` | arena, lights, shadows |

## Tuning knobs

- `MOVE_SPEED` / `RUN_ANIM_SPEED` in `src/hero.ts`: adjust together to remove foot sliding.
- `CAMERA_PRESETS` (pitch when zoomed in/out, default distance) in `src/camera.ts`.
- Ability timings and damage in `src/hero.ts` / `src/combat.ts`.

## Legal

The models are © SHIFT UP / Proxima Beta. NKAS provides them for archival use and does not license
redistribution. This is fine for a private fan prototype. Don't ship it commercially, and think before
publishing the converted files. `raw/` is git-ignored; `public/chibi/` and `public/raptures/` are
versioned so a clone runs.
`npm run chibi` rebuilds heroes and Nikke minions; `npm run raptures` rebuilds enemies from the local bundle copies.
