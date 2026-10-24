# Lighting pass 1

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
