# Test Range environment staging

2026-10-25. User-requested visual staging on the Test Range, based on GAME_PLAN
§5, S02 and Z02–Z05. This is ART-RANGE, not MAP-8 or a finished gameplay sector.

Use `?run=test-range&environment=outskirts` and **Weather Lab → Environment**.
The map selector supplies matching weather and ground effects. Time overrides work
on entry; weather and snow overrides cannot change a map?s biome. Clear maps also
accept `water=wet`. `environment=plain` removes the scenery. The sortie
and archived MOBA do not automatically get these layouts.

| Preset | Art direction |
| --- | --- |
| `outskirts` | Sakura, overgrowth, broken concrete, supply crates, road through woodland |
| `frozen` | Snow-coated rocks, painted snowy pines, scattered supplies and logs |
| `city` | Concrete building corners, broken walls, industrial barriers, barrels and scrap |
| `storm` | Painted forest canopies, ferns and bushes, overgrown industrial debris, wet-floor shader |
| `hollow` | Dark rock, rubble, scrap and a collapsed industrial column silhouette |

## Style correction after user review

The user rejected the initial flat kit materials: they looked more cel shaded than
the characters and ground. A four-view ruin image had also been projected onto a
different mesh, causing badly stretched artwork and blank-looking seams.

- `range-materials.ts` marks scenery `softEnvironment`: it shares the existing
  anime lighting palette and atmosphere, with broad smooth light/shadow transitions,
  a restrained painted-value lift and no color posterization. Dark material tints
  were lifted after the user reported that conventional lighting mismatched the ground.
  Wetness still works, and materials receive normal lights and cast shadows.
- The character and ground retain their existing shading.
- Existing painted concrete, bark/metal and foliage assets supply surface detail.
- Dominant-face UVs use consistent scale for tiling materials. Atlas UVs stay within
  their assigned panel. The incompatible whole-ruin projection was removed.
- Painted foliage cards replace solid polygon bushes and diamond-shaped fern leaves.
- The detailed sakura source replaces the flat blossom atlas in this Test Range pass.
- A new painted evergreen/snow bough atlas replaces cone pines. Source and exact built-in
  image_gen prompt: `assets/environment-source/range-style-v2/`.
- Rocks retain simple silhouettes but use softened normals and painted concrete detail.

The original kit-v1 exported GLBs and sakura review remain source assets; this updated
material treatment is applied by the Test Range renderer, not silently baked into the
old downloadable archive.

## Code and verification

- `range-environments.ts`: engine-free biome selection and deterministic placements.
- `range-dressing.ts`: template reuse, 12 m static material merges, per-plant material merges, live selector and wind.
- `range-materials.ts`: painted materials, UVs, foliage and pine construction.
- `arena.ts`: themed ground blend and restrained road markings.
- `main.ts`: small integration hook and `window.game.dressing / setRangeEnvironment`.
- `tools/test-range-environments.mjs`: correct biome assets, deterministic placement,
  clear central lane, and no puddle props.
- `artifacts/verify-range-environments.mjs`: switches every preset through the real
  selector, checks all 12 training targets remain, verifies effects and captures views.
- Screenshots and comparison page: `artifacts/ui/art-range/style-comparison.html`.

Solid props now block movement and shots in the Test Range. MAP-1/2/3 still own
the full sector layouts and their navigation/cover authoring.
The large ruined buildings, vehicles, meaningful interiors, exits and skyline from the
references remain separate worksheet tasks. No water planes or new audio were added.

## Lighting and wind follow-up (2026-10-25)

Ambient occlusion would deepen contact shadows, not fix the overall dark props.
Scenery now shares the established character/ground lighting palette, with smooth
transitions instead of the hard character cel band. Existing character and ground
shader behavior is unchanged. No emissive brightness or new AO pass was added.

Trees, bushes, ferns and grass sway subtly about individual ground pivots, using
position-based phases independent of camera motion. Storm staging increases sway.
Animation uses gameplay delta time, pauses with gameplay and honors reduced motion.
This is whole-plant sway, not simulated individual leaves or flexible branches.
Per-plant material batching preserves shadow alignment; outskirts meshes increased
from 86 to 112 and storm from 73 to 124. Visual approval remains pending.

Validation: TypeScript, biome placement checks, all six theme browser captures
(no browser errors), and `artifacts/verify-range-wind.mjs` for motion, fixed roots,
independent phase, zero-delta pause and reduced motion.


## Simplified Weather Lab

Choose a map, then Day, Dusk, or Night. Stormbringer is locked to Night with rain
and wet ground. The Frozen North always uses snowfall and snow-covered ground;
other maps cannot acquire snow. Ark Outskirts uses Sakura petals and pink lighting
at all three times. Clear maps offer one optional Wet ground checkbox. Dusk covers
golden hour; it is not a separate environment. Weather intensity, independent snow
presets, manual lightning, and reflection presets are no longer Lab options.
Enemy movement is under collapsed Training controls.

Road placement follow-up: Ark Outskirts and Stormbringer grove clusters are moved
onto the verges of both roads. All trees, including perimeter trees, reserve root
spread and sway clearance beyond the noisy feathered road edge. Ground painting
and placement share `RANGE_ROADS`; the placement test checks every tree footprint.

## Solid scenery and AI (2026-10-25)

`range-collision.ts` supplies scaled, rotated solid footprints for tree trunks,
rocks, walls, crates, barrels, barriers, scrap, logs and ruined structures. Low
pebbles, soil patches, bushes, ferns, grass and canopy cards remain passable.
These are stable cylinder/capsule proxies, not exact triangle-mesh physics; ruin
openings stay open and canopy sway does not move the trunk collider.

Player walking, dashes and crowd separation sweep against the same footprints
used by AI A* routing, crowd steering and knockback. Hovering enemies also avoid
solid scenery while retaining immunity to snow slowdown. Ranged enemies keep
moving when cover obscures the player. Shots, rockets, beams, melee and blast
visibility use finite-height cover traces together with snow traces.

Changing themes replaces all footprints and invalidates saved routes. Units
inside newly selected scenery are projected to a free position on their update.
No destructible scenery or rigid-body simulation was added.

`artifacts/verify-range-collision.mjs` checks routes in all five themes for three
body radii, swept movement, actual player dash collision, height-aware shots and
theme cleanup. Navigation (31 scenarios), snow navigation, enemy attack and sortie
regressions also pass. Preview remains in visual review.

Contact follow-up: player/dash/knockback and AI steering now use surface-normal
sliding with a small outward contact cushion, instead of stopping or only sliding
on world X/Z axes. Every accepted segment remains swept-clear; correction is
bounded by requested travel and causes no idle drift. Rotated-wall regressions
pass at 20/60/120 FPS; all five environment route/collision checks still pass.
