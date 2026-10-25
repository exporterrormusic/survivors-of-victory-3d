# Ground snow

The Survivor test range has a reusable ground overlay with separate boot/claw impressions,
depth-based player resistance, and impassable banks. Open:

`http://localhost:5194/?run=test-range&snow=drifts&weather=snow&time=day`

Use your dev server's port. **WEATHER LAB → Snow → Ground snow** selects Off, Light powder,
Deep snow, or Mixed drifts + banks. **Reset footprints** restores fresh snow. The choice
persists locally; a `snow=` URL parameter overrides it. Ground coverage is independent of
precipitation. Selecting the Snowfall quick preset enables mixed drifts if ground snow is off.

## Appearance and interaction

- Powder is pale and granular. Deeper snow has a cooler blue tint. Banks have blue faces,
  directional relief, wind ridges, and pale caps so their height is readable in bright and toon lighting.
- Powder below 14 cm has no movement penalty. Resistance ramps toward 38% normal speed
  at 80 cm. Fresh depth of 95 cm blocks the player's body, including during dashes.
- Movement samples ahead of the body and sweeps in steps of at most 10 cm. Bank edges permit
  sliding, and enemy separation cannot push the player into a bank. The rig uses actual travel speed.
- Snow also stops attacks at its actual surface height: rifle rounds impact and stop,
  homing rockets explode on contact, and the Burst cone clips both damage and visuals.
  Explosive splash and afterburn cannot damage targets through a hill. Projectile sweeps
  check the full frame's travel, and rockets resolve whichever contact occurs first.
  Shots genuinely above the crest can pass overhead. This includes a supplied floor-height
  sampler; disabling the snow layer disables its projectile collision.
- Player boots alternate every 62 cm of travel, with separate heel/toe silhouettes. There is
  no continuous centre-line stamp. Impressions compress up to 88% of shallow snow, capped
  at 24 cm in deep snow. Banks cannot be excavated by walking against them.
- Crawler (`mmg005`) stamps four pointed mechanical feet. Pelican (`bmg001`) stamps hooked
  claws. Their gait alternates diagonal pairs. Lure (`bma002`) hovers and stamps nothing.
  Unknown Raptures also default to no prints until given an explicit contact profile.
- **WEATHER LAB → Enemies → Pursue player** enables moving targets; **Hold positions** is
  the default training mode. Add `&enemies=pursue` to the URL to override the saved choice.
  Grounded enemies route around banks with clearance for their body size, steer around
  nearby units, and slow in deep snow. Ranged enemies keep moving around cover until they
  regain a clear line to the player, then stop at their preferred distance. This adds
  pursuit movement, not enemy attacks.
- Routes update when the player moves or the snow layout changes. Knockback cannot sweep
  through banks; respawns and newly covered enemies move to a nearby open position.
  Hold mode also uses routes when returning to the original marks. Hovering Lure ignores
  ground banks and leaves no prints. Crawler and Pelican animate walking and stamp their
  respective claws along accepted travel.
- These are procedural, species-specific contact silhouettes and distance-based gaits,
  not exact per-frame bone-contact extraction. No stationary re-stamping occurs every frame.
- Actual, eased snowfall refills both depression height and packed-snow shading. A full
  impression clears in about 47 seconds at Light + and 58 seconds at Light. Clear weather
  preserves prints. Pause freezes recovery. Footprints last only for the current scene.

## Apply to another floor

`src/survivor/snow-field.ts` owns renderer-independent depth, footprints, collision, and recovery.
`src/survivor/snow.ts` wraps that field in a displaced mesh and a Babylon StandardMaterial
plugin. The original environment material is never replaced. Existing lighting, received
shadows, fog, and the Anime material plugin continue to apply.

```ts
const snow = new SnowLayer(scene, {
  bounds: { minX: -38, minZ: -38, width: 76, depth: 76 },
  heightAt: (x, z) => terrainHeight(x, z),
  depthAt: (x, z) => isWalkableFloor(x, z) ? authoredSnowDepth(x, z) : 0,
});

// In each unpaused simulation frame:
const previous = { x: actor.position.x, z: actor.position.z };
snow.field.move(actor.position, velocity.x * dt, velocity.z * dt, actor.radius);
// Resolve the map's other collisions before stamping accepted travel.
snow.field.trail(previous, actor.position, actorSnowTrack);
snow.field.refill(dt, atmosphere.snowfall);
snow.update(dt);
```

Each actor needs its own `createSnowTrack('boot' | 'spike' | 'hook', scale)`; the field has a
default player track for the single-player call. `plant()` stamps a resting stance once.
`depthAt` returns metres, clamped to 0–2 m; zero excludes holes and non-floor areas.
`heightAt` supplies the world-space supporting surface and is sampled at construction.
Use cached height/coverage data rather than a scene raycast for every sample.

This version supports static floors representable as one height per world X/Z coordinate,
including gently uneven terrain. Stacked floors, overhangs, sharp walls, and moving platforms
need separately bounded layers and suitable movement routing. It is not automatic mesh projection.
Player grounding on a different terrain still belongs to that terrain's movement system.
The supplied range depth layout is a separate function, `rangeSnowDepth`, and is replaceable.

## Cost and validation

The default 76 m tile uses one 1024² RGBA8 field (4 MiB), one 256-subdivision mesh
(66,049 vertices / 131,072 triangles), and one material. Snow displacement is on the GPU;
fragment normals resolve the smaller print shapes. There are no individual footprint meshes.
Only touched texels participate in refill, and texture uploads happen only when dirty, at
most 30 times per second. The finite tile is not a streaming terrain system; `resolution`
and `subdivisions` are configurable. No mobile frame-rate guarantee has been established.
`snow-navigation.ts` reuses the game's A*, radius-specific cached grids, route smoothing,
and crowd steering. The field budgets two route searches per frame. Snow preset changes
invalidate the grids; footprint stamping, refill, and resetting prints do not.

- `npm run test:snow`: swept collisions, slowing, separate impressions, independent actor
  gaits, shape differences, refill, pause/clear preservation, reset, and 20/60/120 Hz consistency.
- `npm run test:snow-navigation`: routes at three body sizes and frame rates, concave banks,
  narrow gaps, unreachable goals, snow changes, knockback, and bounded route searches.
- `artifacts/verify-snow-navigation.mjs`: live Crawler/Pelican pursuit and claw trails,
  moving goals, hovering, stun, deep-snow slowdown, respawns, snow edits, pause, and the
  persisted Enemies control. Evidence lives in `artifacts/ui/snow-navigation/`.
- `artifacts/verify-ground-snow.mjs`: actual WASD and dash integration, grounded versus
  hovering Raptures, all art presets, pause/refill integration, floor-height adaptation,
  untouched original materials, and resource disposal.
- `artifacts/verify-snow-projectiles.mjs`: rifle/afterburn obstruction at 120/60/20 Hz and
  300 ms steps, rocket impacts and splash cover, targets in front of cover, overhead clearance,
  snow disabled, charged/normal Burst clipping, compiled shaders, and effect cleanup.
  Evidence lives in `artifacts/ui/snow-projectiles/`. The existing Burst movement regression
  also passes, retaining the muzzle attachment when snow is off.
- Captures and the browser report are in `artifacts/ui/ground-snow/`. Browser verification
  reported no runtime/shader errors. The test machine measured 6.00 m in one second of
  powder movement versus 3.14 m in the deep preset, and stopped a dash 0.50 m before a bank.

The material implementation uses Babylon's installed GLSL plugin hooks; see the
[upstream default vertex shader](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Shaders/default.vertex.fx).
