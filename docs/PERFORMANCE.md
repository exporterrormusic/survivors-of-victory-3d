# Rendering performance pass 1 (2026-10-24)

Scope: find and remove unnecessary rendering cost introduced by the painted environment and
lighting pass 1 while preserving art direction, gameplay and UI. Every change below was measured
before and after under the same conditions, and image equivalence was checked pixel by pixel.

## Test conditions and limitations

- **Renderer:** Chrome 155 (installed, headless), ANGLE Direct3D 11 on an **NVIDIA RTX 4090**
  (driver 616.56), WebGL 2, half-float render targets, 16× anisotropy. Hardware rendering, not
  SwiftShader. Flags: `--use-angle=d3d11 --ignore-gpu-blocklist --disable-gpu-vsync --disable-frame-rate-limit`.
- **Builds:** production `vite build` bundles served by `vite preview`; the baseline was built from
  a snapshot of the source taken immediately before this pass (both bundles contain the same HUD
  revision unless noted).
- **Viewport:** 1920×1080 at device pixel ratio 1.
- **Deterministic state:** `Math.random` is seeded and simulation time is frozen when the game
  publishes `window.game`. "Opening" = first wave after loading. "Battle" = 95 simulated seconds
  at a fixed 1/30 s step (four waves; 71 units on Outpost Hollow, 17 on Lost Outpost in both
  builds). Views: **base** (blue Core, classic camera distance 32), **lane** (map center, 32),
  **overview** (map center, 52, maximum zoom-out), plus a 14-unit close-up for image checks.
- **Configurations:** Previous lighting; Painted daylight with Ambient shadows Off; Painted daylight
  with Ambient shadows On (default); the default with PCF reduced to Medium.
- **Measurements:** frames are driven one per `requestAnimationFrame` (`engine.beginFrame`,
  `scene.render`, `engine.endFrame`). CPU = JavaScript time for the frame; GPU = sum of
  `EXT_disjoint_timer_query_webgl2` queries split at the shadow map, geometry buffer, glow, main
  draw phase and post-processing; draws from Babylon's draw-call counter. 60 warm-up frames, then
  180–240 measured frames; medians unless noted.
- **Limitations:** this is one high-end desktop GPU in a headless browser on a shared machine.
  Absolute CPU times varied up to about 2× between sessions (Codex and other processes were
  active), so the primary CPU comparison is an interleaved A/B run (before, after, before, after in
  one session). Draw calls, mesh counts and per-pass structure are deterministic. GPU timer
  segments can include work queued by an earlier segment; frame totals are reliable, individual
  segments are approximate. Weaker GPUs will be more fill-rate bound than shown here; no frame-rate
  guarantee for other hardware is implied.

Harness: [`artifacts/perf/`](../artifacts/perf/README.md). Evidence: `artifacts/ui/perf-pass-1/`.

## Baseline: measured bottlenecks

Outpost Hollow, battle state, default Painted daylight + AO, baseline build (first session):

| View | CPU ms | GPU ms | Draws | Shadow pass (GPU / CPU / draws) |
|---|---|---|---|---|
| base | 14.6 | 10.6 | 1,194 | 4.8 / 7.3 / 1,047 |
| lane | 15.6 | 11.6 | 1,296 | 4.7 / 7.3 / 1,041 |
| overview | 19.1 | 13.3 | 1,656 | 5.3 / 7.1 / 1,041 |

The game was **CPU-bound** (frame interval ≈ CPU time). Findings, in order of measured cost:

1. **The shadow map drew every caster on the map, every frame.** Babylon does not frustum-cull a
   shadow generator's render list (`objectRenderer._prepareRenderingManager` with an explicit
   `renderList`). 2,478 casters (1,526 of them leaf/fern instances) were dispatched although the
   camera-following sun box (52×52 units) contained 925. The pass cost ~1,040 draws in *every* view,
   including the base view where the camera saw 70 meshes. Ablation: not refreshing the shadow map
   cut the lane view from 15.2 to 7.5 ms CPU and 11.3 to 3.9 ms GPU.
2. **Settings changes froze the page for 440–800 ms.** Every image-processing, light or material
   property set marks materials dirty, and each material scans all meshes
   (`Material._markAllSubMeshesAsDirty`). With 324 materials × 2,775 meshes, one preset change ran
   dozens of such scans. Lost Outpost (156 × 773) took 65–114 ms. No resources leaked: counts were
   identical after five AO/preset toggle cycles.
3. **Too many small static meshes.** 2,775 scene meshes: 1,526 `InstancedMesh` leaf/fern/ivy
   cards, 272 separate tree-branch tubes, 128 separate lane-paint quads, ~360 individually drawn
   ruin parts, and structure MultiMaterials whose submeshes all resolved to the same painted
   material after the paint-over (164 redundant submeshes). Each costs per-frame culling and one
   draw per pass (main, shadow, geometry buffer).
4. **SSAO:** +3.3–4 ms GPU and +0.5–2 ms CPU (the geometry buffer redraws all visible meshes).
5. Not bottlenecks on this GPU: **PCF High vs Medium** (no measurable difference in any view),
   **glow** (≤0.4 ms GPU), **simulation** at the natural 35–71 units (0.8–1.7 ms per update), and
   paint-over flat-shading memory (98,424 painted vertices vs 18,972 unique positions: ~3 MB).

### SSAO render targets (verified in the installed Babylon 9.32 source and at runtime)

The earlier note that "AO is evaluated at full resolution" was incorrect. A Babylon post-process
ratio sizes its **input** texture and each pass draws into the next pass's input
(`postProcessManager._finalizeFrame`). At 1920×1080:

| Pass | Input texture (written by previous pass) | Format |
|---|---|---|
| SSAOOriginalSceneColor | 1920×1080 (scene) | RGBA16F |
| ssao | 1920×1080 (copy of scene color, read by the composite) | RGBA16F |
| BlurH | **960×540 — the AO shader writes here** (`ssaoRatio` 0.5) | RGBA16F |
| BlurV | 1920×1080 | RGBA16F |
| ssaoCombine | 1920×1080 | RGBA16F |
| imageProcessing, fxaa | 1920×1080 | RGBA16F |
| Geometry buffer (depth, normal) | 2 × 1920×1080 **RGBA32F** + 24/8 depth | 63 MB |
| Shadow map | 2048² RGBA16F + depth | 48 MB |
| Glow | 960×540 + blur chain | ~12 MB |

Render targets total ~237 MB at 1080p (unchanged by this pass); image textures ~90 MB.

## Changes

| File | Change | Visual effect |
|---|---|---|
| `src/world.ts` | Shadow map `getCustomRenderList` keeps only casters intersecting the sun's frustum (from `shadows.getTransformMatrix()`); baked crowds, thin-instanced and skinned meshes are always kept. | None: the 2048² shadow map was **bit-identical** (0 differing texels) with 376 instead of 1,033 draws in the culling-only test. |
| `src/visuals.ts` | Preset and AO changes run inside `scene.blockMaterialDirtyMechanism`, so materials are invalidated once at the end. | None. |
| `src/foliage.ts` | Leaf, fern and ivy cards are static thin instances of the four card templates (same transforms, same alpha-tested material); each tree's eight branch tubes are merged into one trunk mesh. `commit()` uploads the cards. | None measurable. Per-card frustum culling is lost; the few thousand extra card triangles are drawn instead. |
| `src/environment.ts` | Each ruin's painted parts, each compound's wall pair and each hangar shell are merged after projection; lane-paint fragments are merged into one mesh. Merged painted meshes recompute flat normals. | None (see image comparison). |
| `src/paintover.ts` | Merged meshes whose submeshes all map to one painted atlas collapse to one submesh and drop their MultiMaterial; the replaced pre-paint MultiMaterial is disposed. | None. |
| `src/structures.ts` | Painted non-gate structures dispose their three unused blockout materials (and their texture wrappers). | None. |

Two problems found during verification and fixed before the final measurements:
- `Mesh.MergeMeshes` bakes normals with the plain world matrix. On the non-uniformly scaled
  rubble (×1.6/0.65/1) and slabs (z × 0.48) that changed shading. Babylon renders unmerged
  meshes with the inverse-transpose; recomputing flat normals after the merge matches it.
- Regrouping submeshes under a MultiMaterial (paint + visor) rendered whole turret heads in the
  visor's energy color. That variant was removed; turret heads keep their original submeshes
  (36 remaining redundant submeshes, one extra draw per turret).

## Results

### Interleaved A/B (same session, battle state, CPU/GPU medians of two rounds)

| Map / view / config | CPU ms before → after | GPU ms before → after | Frame interval ms | Draws |
|---|---|---|---|---|
| Hollow lane, Previous lighting | 30.6–30.9 → 6.2–8.2 | 13.4–13.8 → 2.5–2.7 | 31–32 → 8–10 | 1,173 → 176 |
| Hollow lane, Painted, AO off | 28.7 → 7.8–7.9 | 11.9–13.0 → 2.7–3.0 | 30–31 → 9.5–9.7 | 1,174 → 206 |
| Hollow lane, Painted, AO on | 30.0–30.1 → 9.0–9.5 | 17.7–18.1 → 3.5–4.3 | 31 → 11 | 1,296 → 268 |
| Hollow overview, Painted, AO on | 32.8–36.6 → 9.6–10.4 | 20.5–24.8 → 4.3–4.4 | 31–39 → 11–12 | 1,656 → 342 |
| Lost Outpost lane, Painted, AO on | 11.6–13.1 → 6.2–7.9 | 7.8–8.9 → 3.6–4.8 | 12–15 → 8–10 | 544 → 238 |
| Lost Outpost overview, Painted, AO on | 11.0–14.1 → 6.7–6.8 | 7.5–9.9 → 3.5–4.3 | 12–15 → 9–10 | 626 → 260 |

In the first (quieter) session the baseline measured 13–19 ms CPU and 7–13 ms GPU on Hollow; the
full after-run (a busier session) measured 6–16 ms CPU (mostly 6–10) and 2.4–7.4 ms GPU (mostly
2.5–5.5) across all views and configurations
(`report-before-*.json`, `report-after.json`). The ratio is consistent across sessions; the
absolute values are not.

### Structure (deterministic)

| Outpost Hollow | Before | After |
|---|---|---|
| Scene meshes | 2,775 (1,526 instances) | 518 (28 thin-instanced meshes, 1,555 instances) |
| Shadow casters / in sun frustum (lane view) | 2,478 / 925 | 352 / 145 |
| Shadow-pass draws | ~1,040 in every view | 85–133 |
| Materials / MultiMaterials / Texture objects | 324 / 326 / 192 | 210 / 110 / 116 |
| Painted meshes / painted vertices | 542 / 98,424 | 176 / 98,424 |
| Geometry memory, render targets, image textures | 20.2 MB, 237 MB, 90 MB | unchanged |

Lost Outpost: 773 → 218 meshes, 648 → 126 casters, 156 → 114 materials.

### Settings-change hitch (median of five cycles, synchronous time in the change handler)

| Change | Hollow before → after | Lost Outpost before → after |
|---|---|---|
| Ambient shadows Off / On | 445 / 448 → 24 / 21 ms | 67 / 68 → 6 / 8 ms |
| Previous lighting / Painted daylight | 577 / 782 → 22 / 25 ms | 82 / 114 → 4 / 7 ms |

The first frame after a change still compiles or re-validates shaders (8–41 ms CPU, plus a
one-frame draw-count dip while AO shaders compile). Resource counts (textures, internal textures,
post-processes, pipelines, materials, meshes, effects) were identical before and after five
toggle cycles in both builds.

### Startup

Load-to-ready on Hollow was unchanged within noise (interleaved: 8.3–9.0 s before, 8.7–9.5 s
after, in a loaded session). Both builds still show 240–900 ms frames during the first ~1.5 s
after the loading screen is removed, while 30–40 shaders compile; this pass does not address it.

### Rendering vs simulation as units accumulate (after build, Hollow, camera on the blue wave)

| Units (visible) | `combat.update` ms (worst) | Render CPU ms | GPU ms | Draws |
|---|---|---|---|---|
| 36 (14) | 1.65 (6.8) | 7.5 | 3.6 | 269 |
| 144 (56) | 6.4 (17.2) | 8.9 | 3.9 | 271 |
| 180 (53) | 8.5 (13.2) | 8.7 | 3.7 | 280 |
| 252 (61) | 11.0 (15.8) | 9.3 | 3.4 | 282 |

Rendering is flat because crowds are thin-instanced; simulation/navigation grows roughly
linearly and becomes the larger cost above ~150 units. Natural waves on Hollow plateau at 35–71
units while towers stand (95-second run), Lost Outpost at 12–21.

## Image equivalence

Canvas-only captures (no DOM HUD) of both maps, opening and battle states, base/lane/overview/
close-up views, Previous and Painted+AO (32 pairs, `canvas-diff.txt`): mean absolute difference
≤ 0.29 of 255; pixels differing by more than 8 levels ≤ 0.53%; by more than 32 levels ≤ 0.05%.
Matching before/after images are in `artifacts/ui/perf-pass-1/screens/`. Full-page screenshots
also differ in the HUD because the HUD was being redesigned concurrently (not part of this pass).

## Validation

- `npm run build` (TypeScript + production build) passes: `artifacts/perf-pass-1-build.log`.
- `check-battlegrounds.mjs` (dev server): both maps, routes, gates, paired volleys, protection,
  percentages, victory and clock stop — passed.
- `check-lighting-pass.mjs`: no paint emission, AO ordering, repeated AO toggle cleanup, distant
  panning shadows, F10 controls, persistence across a map change, single lane, resize, low angle,
  scene disposal — passed.
- `check-painted-art.mjs`: assertion updated from ">400 painted meshes" to ">150 meshes and
  98,424 painted vertices"; UVs, assets, textures, destruction — passed.
- `check-battleground-interaction.mjs`: minion siege, rotating muzzles, real mouse targeting,
  defeat and map switching pass; its final Core-strip layout assertion fails identically on the
  **baseline** build, from the concurrent top-bar HUD redesign.
- `verify-painted-environment.mjs` now counts thin-instanced cards; it targets an older dev-server
  port and was not re-run.

## Remaining issues and prioritized further work

1. **Simulation at high unit counts** (11 ms per update at 252 units, worst 15–17 ms): profile
   `combat.update` (targeting scans, navigation budget, spatial queries) before rendering again.
2. **Per-frame CPU outside render passes** (~2.5–5 ms "other": active-mesh evaluation, animation,
   HUD/minimap DOM and canvas work at 1.4–3.5 ms): measure the HUD/minimap update separately and
   consider freezing active meshes for static environment (`freezeActiveMeshes` is unsuitable
   while units move; a static/dynamic split would be needed).
3. **Startup shader-compilation hitch** (240–900 ms frames for ~1.5 s): keep the loading screen
   until `scene.whenReadyAsync()` plus a few warm-up frames, or pre-compile AO/shadow effects.
4. **AO cost on weaker GPUs** (~1.4–1.8 ms GPU and one extra geometry pass here): a geometry buffer
   with R32F depth and RGBA16F normals would cut 63 MB of RGBA32F targets to ~24 MB; Babylon's
   prepass renderer would avoid the second geometry pass but must be checked against the terrain
   material plugin and baked crowds.
5. **Turret heads** keep one redundant painted submesh each (36 on Hollow).
6. **Terrain shader / anisotropy** were not isolated: the whole main pass is 0.8–1.8 ms GPU here.
   Measure on integrated or mobile GPUs before changing the procedural noise or 16× anisotropy.
7. PCF High has no measurable cost on this GPU; keep it unless a weaker GPU shows otherwise.
