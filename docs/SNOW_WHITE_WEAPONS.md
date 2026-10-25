# Snow White launcher and missiles

First geometry-and-texture pass, 2026-10-25. Active in the survivor test range
(`/?run=test-range`), through Snow White's Auto-Turret special.

## Reference and interpretation

The visual reference is Snow White's original character artwork, shown on
[Prydwen's character page](https://www.prydwen.gg/nikke/characters/snow-white) and available as
[the full character image](https://cdn.prydwen.gg/images/nikke/characters/snow-white_full.webp).
A local research copy is `assets/weapons-source/snow-white/reference-character.webp`.

The missile launcher on the left of the image supplies the silhouette: paired angled pods,
three circular launch cells per pod, white shoulder armor, split hanging shields, a dark central
spine with a yellow slit, and exposed support hardware. The twin-barrel gun on the other side
is a different weapon. This model adapts the launcher to a compact, ground-deployed game turret.
Hidden/rear surfaces and its ground stand are interpretations. Flying missile shapes are also
interpretations: white casing, dark pointed nose, yellow band, four fins and a short warm exhaust.
The reference shows loaded tube caps, not a detailed flying missile turnaround.

## Geometry and materials

`src/survivor/snow-white/weapon-models.ts` builds both assets from boxes, cylinders and
eight-sided beveled plates. These are editable procedural meshes, not imported GLB models.
The launcher has 3,156 triangles; the rocket has approximately 600. Painted pieces are merged by material
under their moving parents. Runtime models use one shared 1254 × 1254 generated atlas,
plus solid metal, recess, cap and small emissive materials. Only lamps and rocket exhaust glow.

The yaw pivot, recoil head and six launch sockets stay separate from the rendered geometry.
Four live rounds are shown by default. The existing capacity talent supplies eight rounds,
feeding reserves through the six chambers. Eight rear indicators support the upgrade, and
chamber caps return on automatic reload. Ability damage, recharge, speed, homing
and talent behavior are preserved.

The old cyan trail mesh and repeated large blue exhaust sprites are removed. Missiles now
have a textured body and a visible rear flame: a white-hot tapered core inside an orange
exhaust cone, with short camera-facing fire layers that flicker and stay attached to the nozzle.
The fire layers return to the effect pool when the rocket impacts. Following the initial gameplay review,
rocket dimensions are 1.6 times the first pass for camera readability. Dense gray-white smoke
starts at the nozzle, fills the distance traveled between frames, and expands/fades over
0.85–1.15 seconds. Smoke remains in world space as the rocket turns, and lingers after impact.
Plumes dispose after fading without disposing their shared texture.

Rocket impacts use `src/survivor/snow-white/rocket-impact.ts`: an expanding orange fireball,
brief hot flash, sparks and a warm shockwave, followed by rising gray soot and a fading ground
scorch. Fire fades within 0.6 seconds; smoke clears within 1.65 seconds. The effect scales with
the existing blast-radius talent and uses pooled quads, which are released after the fade.

## Generated art

Built-in **image_gen** generated the surface atlas. No image-generation CLI or external model
service was used. The square sheet has four surface patches: ivory armor, charcoal mechanism,
marked white armor, and a white/yellow missile wrap. Each primitive face has padded atlas UVs;
this is a reusable surface atlas, not a perspective image projected onto the model.

- Original: `assets/weapons-source/snow-white/surface-atlas-v1.png`
- Game texture: `public/weapons/snow-white/surface-atlas-v1.webp` (271,762 bytes)
- Exact generation prompt and mode: `assets/weapons-source/snow-white/atlas-prompt.json`
- Conversion record: `assets/weapons-source/snow-white/assets.json`

The prompt requested 2048 square; the built-in tool returned 1254 square, which is used at its
native size. Pillow encoded the PNG as WebP quality 94 without resizing or creative edits.
Surface detail is diffuse paint; there are no generated normal or roughness maps.

## Review and validation

With the Vite development server running, open `/weapon-review.html`. Drag to orbit, scroll
to zoom, select front/back/top views, or toggle the neutral blockout. The rocket is displayed at
2× scale in that viewer; gameplay uses its normal size. This is a development review entry,
like the existing Rapture review page; the normal production entry remains the game.

`artifacts/capture-snow-white-weapons.mjs` captures the actual shared models, checks texture
readiness and finite, bounded UVs, and records mesh/triangle counts. `--blockout` captures the
untextured geometry. `artifacts/verify-snow-white-weapons.mjs` checks the live kit and controlled
firing/reload/cleanup cases. Both scripts use port 5192 and the sibling project's installed
Playwright, following the existing project's verification scripts.

Evidence is in `artifacts/ui/snow-white-weapons/`:

- `textured-hero.png`, `textured-front.png`, `textured-back.png`, `textured-top.png`
- `blockout-*.png`
- `game-deployed.png`, `game-firing.png`, `game-smoke-trails.png`
- `game-rocket-impact.png`, `game-impact-smoke.png`
- `textured-report.json`, `blockout-report.json`, `game-verification.json`

Verification passed: two active turrets and four physical rockets in the live kit; no old
trail meshes; exact launch positions under yaw/recoil; damage; single-target volleys;
eight-round capacity; automatic reload with restored lamps/caps; shared smoke texture survival;
no leftover weapon meshes, transforms or smoke systems after retirement. No page exceptions.
`npm.cmd run build` passed; output is `artifacts/snow-white-weapons-build.log`.
