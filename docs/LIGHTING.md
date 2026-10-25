# Lighting and Anime preset

## Red enemy glow

Raptures automatically emit light from the red parts of their painted textures.
`src/enemy-glow.ts` selects red by hue, saturation and brightness before lighting
or hit flashes, keeping grey armor and other colors out of the mask. The surface
emission remains visible in shadow; its strength blends from 0.75 in daylight to
1.35 at dusk and 2.8 at night, using the existing atmosphere transition.

The same shader mask feeds a dedicated `enemy-red-glow` layer through one shared
glow material per enemy material. Its 8-pixel blur kernel and .32 intensity keep the
halo close to the bright painted details; the earlier shared 48-pixel blur spread too far.
Weapon/ability glow retains its own existing layer and settings. Baked animation and thin
instances stay aligned in both passes. This uses an additional half-resolution glow target,
without texture copies or per-enemy lights. Source assets under `raptures/` are tagged during
loading, so heroes and scenery keep their own materials. All art presets and late loads work.

`src/enemy-metal.ts` adds a restrained armor sheen after Anime lighting and before fog/grading.
It combines a directional specular highlight, sky reflection and faint edge reflection, with
painted red details and very dark markings mostly excluded. Reflections respond to normals,
view direction and atmosphere (including lightning), while preserving the painted palette.
The same material plugin works in all five presets and shares uniforms across each crowd.

Preview with `?run=test-range&time=night&weather=clear`. Mask thresholds, emission
color and day/night strength are in `src/enemy-glow.ts`. Browser captures and checks
are in `artifacts/ui/enemy-glow/` and `artifacts/check-enemy-glow.mjs`.
The implementation uses Babylon's
[per-mesh glow rendering material](https://doc.babylonjs.com/typedoc/classes/BABYLON.GlowLayer#SetMaterialForRendering),
checked against the installed shader sources.

## Survivor atmosphere

In the test range, **WEATHER LAB** opens live controls without pausing gameplay. Presets preview
Night storm, Golden hour, Snowfall and Clear day; **Strike lightning + thunder** tests the same
bolt/light/audio path as automatic storms. **Esc → Environment → Preview in test range** also
opens the panel. Time, weather and intensity controls stay synchronized and persist.

Weather is **Clear / Thunderstorm / Snow / Drifting petals**. All rain is a thunderstorm and
always forces Night; the time selector is locked during storms. Old `rain` links/preferences
map to `storm`. Intensity offers **Light / Light +**, defaulting to Light +, just above Light.
The rejected Heavy/Extreme levels are removed, including from presets and saved defaults.
`?run=test-range&weather=storm&intensity=moderate` opens the default storm preview.

Weather Lab also enforces compatible ground effects. Thunderstorms clear and disable ground
snow; snowfall clears and disables standing water. In clear weather, selecting either ground
effect turns the other off. The pause menu, saved settings and URL overrides use the same rules.
Storm cloud dimming and fog are reduced at night so characters stay close to normal-night visibility.

`src/survivor/atmosphere.ts` implements a new world-space Babylon shader, independent of Phaser's
screen graphics. One fixed mesh batches rain ribbons, snowflakes, ambient motes and ground
ripples. Particle positions advance in the shader using game time, with a wrapping volume around
the camera focus. Camera movement only selects the repeated world cell, never the particle's
velocity. Snow has independent fall speeds (1.5–2.9 m/s), small lateral flutter and tumbling
flakes; the previous slow, shared sideways drift looked suspended while running. Depth testing
provides occlusion; near-camera and volume-edge fades avoid large foreground streaks and visible
wrapping. HUD elements remain outside the scene effects.

Night, dusk and cloud cover compose with the selected visual preset. The Anime material plugin
has separate lit/shadow atmosphere colors applied to its cel lighting, preserving its contours,
painted palette and emissive accents. Night reduces ambient fill, uses cool directional moonlight
and deeper cel shadows, and adds a subtle vignette through the existing image-processing pass.
The controlled player gets a broad, soft night fill so their painted clothing and face remain
readable. `setPlayerMeshes` scopes it to the player's materials: Anime applies the fill in its
lighting shader, while other presets use a character-only hemispheric light. It follows the
model automatically, fades with night, and is inactive during daylight. The fill is now 30%
stronger. `src/survivor/night-aura.ts` adds a soft local glow that expands and fades in overlapping
3.6-second pulses, feathering to zero within 3.5 metres. It lights actual surfaces, including
displaced snow, directly in their material shaders with no extra mesh or rendering pass.
Movement follows the player exactly; pause freezes the pulse, and reduced motion holds it steady.
Dusk keeps low-angle golden light and long shadows with restrained warmth; the earlier saturated
orange/violet treatment was rejected because it became too harsh with Anime.
Preset changes retain the atmosphere, and Day/Clear restores the original preset light values.

`src/survivor/lightning.ts` draws a reusable branched world-space bolt with a white core and blue
corona. Storms strike every 4–7 seconds with a brief world-light pulse and delayed thunder.
The pulse brightens directional/ambient lights and both Anime cel bands toward white, with a
small exposure lift and an 0.85-second fade to zero. Its brightness is independent of rain density,
so Light + precipitation still has a clearly visible flash across the ground and enemies.
Reduced-motion preferences suppress the bolt and pulse. Rain ambience and thunder use the
original Phaser audio assets through the shared SFX bus. Both pause menus freeze weather time
and stop rain audio; closing them resumes it. Disposal releases weather/lightning resources
and stops the ambience loop.

Ground snow/footprints were added separately; see [SNOW.md](SNOW.md). Standing water is below.
The original Phaser `WorldEnvironment.ts` is the reference for atmosphere types, not the renderer.
Evidence is in `artifacts/ui/atmosphere/`, `artifacts/ui/weather-lab/` and
`artifacts/ui/snow-motion/`, from the corresponding `artifacts/verify-*.mjs` scripts.
Checks cover live controls, actual audio playback, pause/disposal, presets, reduced motion,
restored daylight, WASD movement, and GPU transform feedback proving flakes do not follow the
camera. Chromium/SwiftShader checks rendering behavior, not production GPU performance.
`artifacts/verify-night-lighting.mjs` additionally compares rendered pixels: night fill changes
only the character, daylight stays identical, flashes brighten all tested lighting families and
return to the original night image, and reduced motion suppresses the flash. Its captures and
report are in `artifacts/ui/night-lighting/`.
`artifacts/verify-readability.mjs` checks aura falloff and pulse changes on plaza/snow, movement,
pause/daylight/reduced motion, rendered metallic highlights and separate red/combat blur settings.
Captures and results are in `artifacts/ui/readability/`.

## Wet ground and reflections

`src/survivor/surface-wetness.ts` supplies the storm's baseline wetness across ground and armor.
It slightly darkens the existing painted surface and adds restrained view/light-dependent gloss
after Anime lighting, preserving emissive details. It wets over 1.5 seconds and fades over about
90 seconds after rain stops. No separate mesh or fullscreen filter is used for this coat.

The user rejected separate puddles and blocking lakes. `src/survivor/water.ts` now adds a
subtle reflective coat directly to the existing floor material, after Anime lighting and before
fog/grading. Broad, fixed world-space noise varies its strength smoothly over roughly 6–18 metres.
The entire floor participates; there are no shorelines, opaque centers, water depth texture,
water overlay mesh, collision barriers or water navigation rules. Ordinary rain ripples remain.

The reflection combines a procedural cloudy-blue sky with clearly readable mirrored characters/enemies
and uses the ground material's paving coverage to make stone strongly reflective while moss/soil
stay restrained. Stone carries a higher reflection baseline as well as stronger wet-patch peaks.
Density has a wider contrast range: lightly wet areas stay restrained,
while dense interiors have stronger, smoother sky and actor reflections. A broad continuous ramp
blends between them without shorelines. Actor reflections have a stronger blend than the sky coat, so preserving
the paving texture does not also erase reflected silhouettes. Patch intensity fades continuously.
A single 512-square planar target renders every other frame while wet, and every frame during
lightning. The sky reflection receives the same lightning pulse as the world lighting; the floor
also retains its normal lighting, fog and post-processing response. The scene has no skybox.

Weather Lab's **Wet ground** section offers Weather driven, Wet ground preview, and Off.
Weather driven fades in over 1.5 seconds and dries over about 90 seconds after rain stops;
preview holds the sheen for comparison. Old `water=puddles` / `water=lakes` links/preferences
map to this harmless preview. Snow disables wet ground, storms clear snow, and pause freezes
the effect. Disposal releases the plugin and reflection target.

`artifacts/verify-ground-reflections.mjs` checks legacy preference migration, unrestricted
movement/dashes across former lakes, enemy route clearance, weather compatibility, all five
art presets, pause/drying and disposal. Pixel comparisons verify both the reflected sky's own
lightning response and full ground illumination, including its return to the pre-strike image.
Default/max-zoom and lightning captures are in `artifacts/ui/ground-reflections/` with the report.
`tools/test-snow-navigation.mjs` still verifies snow-bank navigation. Browser checks use
Chromium/SwiftShader, not production GPU performance measurements.

## Anime

Select **F10 → Lighting & color → Anime** in either the survivor test range or a MOBA match.
The existing Painted daylight default remains available for comparison. Anime is remembered
like the other presets. The ambient-shadow control displays Off and is disabled while Anime
is selected; the previous AO preference is restored when leaving Anime.

`src/toon.ts` adds a scene-scoped Babylon material plugin to StandardMaterial and PBRMaterial,
including materials loaded after the preset is selected. It replaces lighting before fog and
grading, preserving painted markings, UVs, transparency, vertex/instance colors, skinning and
the terrain/range-ground plugins. The material palette lifts dark baked-in shading and groups
gradients into six broad values, with antialiased transitions and stronger simplification on
Raptures than on scenery. Nikkes retain their painted facial detail without palette banding.
The sun's normal-facing band and cast shadows produce a light cool shadow shape with a narrow
antialiased edge. The lit area is broader, and a restrained rim replaces the old unit rim light.
Exposure is 1.20 with neutral contrast and a modest saturation lift. Emissive effects with
`disableLighting` retain their existing presentation;
individual materials can also opt out with `metadata.anime = false`.

There is no PBR-to-Standard material conversion. Anime temporarily overrides the shader's
UNLIT define, preserving the source material property. It captures albedo before PBR's
metallic energy-conservation step: some unlit Nikkes retain a metallic value of 1, which would
otherwise remove their diffuse color when lighting is enabled. Both custom diffuse and
specular hooks are provided, and no division by N.L is used.

Heroes, baked thin-instanced crowds, solid painted architecture and tree trunks use Babylon's
outline renderer with dark violet ink. Character outlines are roughly twice the original
Anime preset's thickness, supplemented by narrow interior contours at grazing view angles.
Widths have bounded zoom compensation; they are still model-space outlines, not constant-pixel
screen-space lines. Ground and alpha-cut leaf cards are excluded from geometry outlines.
The terrain and range-ground shaders use a 1.7 mip bias only in Anime to soften fine grain
while retaining paving boundaries and lane/range markings; other presets use their original
texture sampling. Outlines
add geometry passes (Babylon 9.32 uses color and depth passes for opaque outlines, with another
stencil pass for alpha-blended materials). AO is removed in Anime, but no performance improvement
or mobile FPS target is assumed. FXAA, neutral tone mapping and existing selective glow remain.
No new dependency or fullscreen filter is added.

This is a shader treatment of the existing painted assets: source files remain unchanged,
while their displayed palette and baked shading are simplified. Screen-space outlines,
animation on twos and authored face-shadow
maps are not implemented. The plugin targets the current WebGL/GLSL renderer.

Browser evidence for the brighter revision is in `artifacts/anime-v2/` (the first pass is
preserved in `artifacts/anime/`): matching daylight/Anime captures for the survivor
range and one-lane battleground, a Scarlet character-switch capture, `check.mjs`, `verify.mjs`
and `verification.json`. Checks cover all lighting presets, the original unlit material flags,
animated crowds, terrain plugin composition, AO preference restoration, stable resource counts
after a preset round trip, character loading while Anime is active and saved-preset reloads.
The revision also checks that scenery outlines switch off with the preset and that ground
and alpha-cut foliage never receive geometry outlines.
The checks run using Chromium/SwiftShader; they verify rendering behavior rather than GPU speed.

Reference: [Babylon material plugins](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins/),
checked against the installed 9.32 shader and outline-renderer sources.

## Lighting pass 1

The user requested lighting/environment effects and chose to proceed one pass at a time.
This pass adds directional depth, ambient occlusion and three restrained color grades.
Cloud shadows, wind, mist, particles, material normal maps and additional local lights are
future passes; they are not part of this implementation.

## Controls

F10 → **Lighting & color** offers **Painted daylight** (default), **Warm daylight**,
**Cool woodland**, and **Previous lighting (compare)**. The three new looks use identical
lighting with different color curves, so their palette can be compared without changing the
shadow setup. **Ambient shadows** independently toggles SSAO. Both settings persist in local
storage. Unsupported renderers disable the ambient-shadow selector and retain graded lighting.
The old saved `soft` preset falls back to Painted daylight; saved `daylight` selects the new
default. Previous lighting bypasses AO and grading, restoring the former daylight material fill.

## Changes

- `src/paintover.ts`: painted armor/stone is diffuse-lit with no emissive texture or constant
  emission. The former `emissiveTexture = diffuseTexture` added the painting at full texture
  strength in Babylon's StandardMaterial shader, independently of the `.12` emissive color.
  Live reactor energy, lamps and team strips keep their separate emissive materials.
- `src/visuals.ts`: a warmer directional sun at a shallower angle, cooler hemispheric fill,
  higher-quality PCF shadows, and a restrained character rim. Fill retains readable detail
  in shaded armor. Existing selective glow remains; there is no additional bloom layer.
- SSAO2 adds contact shading around geometry. The geometry-buffer path preserves the custom
  terrain material. Sixteen samples, radius 0.8, strength 0.65, eight bilateral blur samples;
  configured SSAO/blur ratios are 0.5/1.0. *Corrected in performance pass 1:* a Babylon post
  process's ratio sizes its **input** texture and each pass draws into the next pass's input,
  so the AO shader already runs at half resolution (960×540 at 1080p, it writes BlurH's input).
  The full-resolution `ssao` texture holds the scene-color copy that the composite reads;
  BlurH, BlurV and the composite write full-resolution targets. Measured render-target sizes
  and AO costs are in [PERFORMANCE.md](PERFORMANCE.md). HDR scene color is preserved
  through the AO composite when half-float render targets are supported.
- DefaultRenderingPipeline applies Khronos Neutral tone mapping, exposure 1.12, contrast 1.04,
  color curves and FXAA after AO. These are editable parametric grades, not imported LUT files.
  DOM portraits, health bars and the rest of the HUD are outside the color pass.
- `src/main.ts` / `src/world.ts`: the sun's shadow-map position follows camera focus and the
  active sun direction. Panning far from the hero retains shadows in the viewed area. This
  camera fix also applies to the Previous lighting comparison.

Pipeline rebuilding disposes the preceding AO, geometry buffer and post-process resources.
Changing only a grade keeps the AO pipeline. Turning ambient shadows off removes its geometry
buffer and all five AO post-process stages. Scene disposal releases the owned effects.

## Verification

`artifacts/check-lighting-pass.mjs` captures the three grades and previous lighting from
matching base/defense views. It checks painted materials have no emission, AO pass ordering,
repeated AO toggle cleanup, distant camera panning, real F10 controls, preference persistence
across a map change, the one-lane map, viewport resizing, low-angle rendering and scene disposal.
Screenshots and its JSON report are in `artifacts/ui/lighting-pass-1/`. The untouched before
captures were saved with `--before`. Production build: `artifacts/lighting-pass-1-build.log`.

AO increases GPU work; the on/off control is available for comparing appearance and performance.
Headless browser timings are not representative of the user's GPU. No frame-rate guarantee
is inferred from those checks.

References: [Babylon image processing](https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/usePostProcesses/),
[SSAO2 API](https://doc.babylonjs.com/typedoc/classes/BABYLON.SSAO2RenderingPipeline/), and the
installed Babylon shader/pipeline sources were checked for emission, tone mapping and lifecycle.
