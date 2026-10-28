# Ashen Caldera art pass

The existing circular basin, obstacle placements, east-side volcano, eruption schedule, impact damage and crater cooling remain the gameplay foundation. The art now uses a ridged mountain with an open bowl, nine main channels and five braided branches following its surface, feeding nine irregular lava pools, a basalt escarpment beyond the arena, jointed basalt obstacles and charred snags. The traversable floor blends fractured basalt with ash along the existing lanes right up to the elevator.

The palette uses charcoal and cool basalt shadows, muted ash, restrained molten orange and warm atmospheric haze. Basalt is projected in world space so it keeps a consistent scale across cliffs and small rocks. Caldera ground uses the existing soft environment lighting option to retain painted texture detail.

## Assets

- Runtime surfaces: `public/environment/caldera-v1/{basalt,ash,lava}.webp` (about 1.5 MB total).
- Particle opacity: `public/environment/caldera-v1/smoke.png`.
- Original generated PNGs and complete prompts: `assets/environment-source/caldera-v1/` and `generation.json`. Generated with the built-in image generation tool; no third-party game textures were copied.
- `tools/build-caldera-textures.py` repackages the original PNGs. `tools/build-caldera-particle.py` authors the deterministic smoke mask.

## Materials and geometry

- `src/survivor/caldera-art.ts`: mountain, bowl, lava channels, peripheral basalt cliffs, obstacle variants and impact rims.
- `src/survivor/caldera-materials.ts`: triplanar basalt and ash coating; continuously advected lava with procedural crust seams, downhill surface ripples and fog integration.
- `src/survivor/caldera-effects.ts`: restrained surface fractures and lava-to-scorch impact shading.
- `src/survivor/volcano.ts`: retains the eruption simulation, drives the art clock and cleans up temporary crater geometry. Reduced-motion mode freezes texture flow while gameplay timing continues.
- The mountain footprint is shared by rendering and gameplay collision through `caldera-layout.ts`; a broad graded apron uses the basin material, and matching world-space ground shading rises over the mountain toe. Existing scenery instances receive volcanic variants through `RangeDressing`; other environments retain their materials and templates.

## Research

- [Nintendo's Eldin environment reference](https://www.nintendo.com/ph/zelda/botw/discovery/eldin.html): dark readable rock masses and bright lava as selective contrast.
- [HoYoverse's Great Volcano of Tollan announcement](https://www.hoyoverse.com/en-us/news/155170): volcanic terrain and eruption reference for a stylized RPG.
- [Catlike Coding: Texture Distortion](https://catlikecoding.com/unity/tutorials/flow/texture-distortion/): flow distortion reference. The final shader uses continuous advection rather than phase resets so downhill travel remains unambiguous.
- [Babylon.js: Fog with ShaderMaterial](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/Fog%2BShaderMat/): custom surfaces must explicitly participate in fog. These lava shaders reproduce the game's EXP2 distance attenuation.

## Verification

`node tools/verify-caldera.mjs` checks shader/resource errors, mountain normals, generated texture readiness, crater cooling to basalt, duplicate rejection, 30-rock volley spacing, mountain navigation collision, solid wedge crumble animation, impact-rim disposal, shared fire-texture lifetime, and map switching. It also checks pool/branch counts, apron material continuity and physical floor-fragment motion. It saves gameplay, summit, base, bowl and impact screenshots plus `artifacts/caldera/verification.json`.

`node tools/capture-caldera.mjs <tag>` captures field/summit/overview comparisons. Both browser scripts follow the repository's existing local Playwright setup and use the development server on port 5199.

Typecheck: `node node_modules/typescript/bin/tsc --noEmit`. Production build: `node node_modules/vite/bin/vite.js build`.

Cold craters retain opaque basalt until the last three seconds, when independent rim wedges and 392 irregular triangular floor chips tumble, shrink and sink. There is no square shader-discard dissolve. Pending rocks reserve a 5.7-unit separation, and crater creation rejects overlapping impacts defensively.

## Perimeter and lava hazards

The perimeter is a continuous 256-segment rock wall with a thick, elevated backdrop; its ends overlap the volcano. An irregular lava moat starts around radius 45.5 and reaches the cliff foot. Rock collision follows the wall, but the moat, base pools and ground-level lava channels are traversable. Rendered shore and pool boundaries share their layout functions with damage checks. Permanent lava drains 80% maximum HP per second from players and enemies; hot impact craters use the same heavy damage scale while cooling.

Meteor targeting, direct launches, impact resolution and crater creation reject the elevator footprint expanded by 3.8 metres. This includes the foundation, complete crater rim and crumble displacement, with additional clearance. Browser checks cover elevator rejection, volley clearance, player/enemy lava damage, safe ground and removal of pool collision.
